/* VoxBrowser — iç sayfa (vox://) çalışma zamanı: sayfa kaydı, yönlendirme ve sekme/gezinme köprüsü.
   Her iç sayfa kendi sekmesinde ayrı bir belge olarak çalışır; ayrıcalıklı işlemler ana sürece IPC ile gider. */
(function () {
  'use strict';
  const Vox = window.Vox;
  if (!Vox || !Vox.p) return;
  const N = Vox.native;
  const call = (ch, p) => N.invoke(ch, p).catch((e) => { Vox.reportError(ch, e); return null; });

  const pages = [];
  Vox.pages = {
    /** register({ url:'vox://ayarlar', title: string | (subpath, query) => string, icon, component }) */
    register(def) { pages.push(def); pages.sort((a, b) => b.url.length - a.url.length); },
    list: () => pages.slice(),
    find(url) {
      const u = String(url).split(/[?#]/)[0].replace(/\/$/, '');
      return pages.find((p) => u === p.url.replace(/\/$/, '') || u.startsWith(p.url.replace(/\/$/, '') + '/'));
    },
  };

  Vox.url = {
    parse(raw) {
      const s = String(raw || '').trim();
      const m = s.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i);
      if (!m) return { href: s, scheme: '', host: '', path: '/', query: {}, search: '', hash: '', origin: '' };
      const scheme = m[1].toLowerCase(), host = m[2].toLowerCase(), path = m[3] || '/', search = m[4] || '', hash = m[5] || '';
      const query = {};
      new URLSearchParams(search.slice(1)).forEach((v, k) => { query[k] = v; });
      return { href: s, scheme, host, path, query, search, hash, origin: `${scheme}://${host}` };
    },
    display(raw) {
      const u = Vox.url.parse(raw);
      if (!u.scheme || u.scheme === 'vox' || u.scheme === 'file') return raw;
      return `${u.host.replace(/^www\./, '')}${u.path === '/' ? '' : u.path}${u.search}`;
    },
    abs(href, base) { try { return new URL(href, base).toString(); } catch (e) { return href; } },
    fromInput: (t) => t,
  };

  const self = () => ({ id: 'self', url: location.href, title: document.title, internal: true });
  Vox.tabs = {
    all: () => [self()],
    active: self,
    get: () => self(),
    /** Opens a URL (or search text) in a new tab next to this one. */
    open: (url, opts = {}) => call('tabs:create', { url, active: opts.active !== false, pinned: opts.pinned }),
    /** Changes this page's address/title without reloading (e.g. switching settings sections). */
    update(id, patch = {}) {
      if (patch.url && patch.url !== location.href) history.pushState(null, '', patch.url);
      if (patch.title) document.title = patch.title;
      Vox.bus.emit('route', { url: location.href });
    },
    download: (url) => { const a = document.createElement('a'); a.href = url; a.download = ''; a.click(); },
  };
  Vox.nav = {
    go: (input) => call('tabs:navigate', { input }),
    back: () => history.back(),
    forward: () => history.forward(),
    reload: () => location.reload(),
    canBack: () => history.length > 1,
    canForward: () => false,
  };
  window.addEventListener('popstate', () => Vox.bus.emit('route', { url: location.href }));

  /** Hook: current location, re-rendering on in-page route changes. */
  Vox.useRoute = () => {
    const [, force] = Vox.p.useReducer((x) => x + 1, 0);
    Vox.useBus('route', () => force());
    const q = {};
    new URLSearchParams(location.search).forEach((v, k) => { q[k] = v; });
    return { url: location.href, host: location.host, path: location.pathname, query: q, hash: location.hash };
  };
})();
