/* VoxBrowser — iç sayfalar: ortak parçalar (sayfa başlığı, gerçek site simgeleri, dosya türü kutucuğu, seçim çubuğu,
   liste animasyonları, adres yardımcıları). Diğer sayfa dosyaları bunları Vox.pg üzerinden kullanır. */
Vox.define('pages.common', (Vox) => {
  const { html, useState, useEffect, useRef, useLayoutEffect } = Vox.p;
  const { Icon, IconButton, Favicon } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const pg = (Vox.pg = Vox.pg || {});

  /* ── Adres yardımcıları ───────────────────────────────── */
  pg.hostOf = (url) => Vox.url.parse(url).host || '';
  pg.siteName = (url) => pg.hostOf(url).replace(/^www\./, '') || String(url || '');
  /** Short form of a URL for lists ("tr.wikipedia.org/wiki/Ankara"). */
  pg.shortUrl = (url) => {
    const u = Vox.url.parse(url);
    if (!u.scheme || u.scheme === 'vox' || u.scheme === 'file' || u.scheme === 'data') return String(url || '');
    return `${u.host.replace(/^www\./, '')}${u.path === '/' ? '' : u.path}${u.search}`;
  };

  /** Turns typed text into a web address, or null when it doesn't look like one (no search here). */
  pg.normalizeUrl = (raw) => {
    const t = String(raw || '').trim();
    if (!t || /\s/.test(t)) return null;
    let s = t;
    if (/^vox:/i.test(s)) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i.test(s)) s = `http://${s}`;
      else if (/^[^\s/:?#]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(s)) s = `https://${s}`;
      else return null;
    }
    try {
      const u = new URL(s);
      return /^https?:$/.test(u.protocol) && u.hostname ? u.toString() : null;
    } catch (e) {
      return null;
    }
  };

  /** The user's search engine (Ayarlar › Arama) and a search URL built from its template. */
  pg.engine = () => {
    const id = store.get('settings.search.engine');
    const list = store.get('searchEngines') || [];
    return list.find((e) => e.id === id) || list[0] || null;
  };
  pg.searchUrl = (q) => {
    const e = pg.engine();
    return e && e.url ? e.url.replace('%s', encodeURIComponent(q)) : q;
  };

  /* ── Site simgeleri: geçmişte kaydedilmiş gerçek favicon, yoksa harfli kutucuk ── */
  const favCache = new WeakMap();
  function hostFavicons() {
    const hist = store.get('history') || [];
    let m = favCache.get(hist);
    if (!m) {
      m = new Map();
      for (const e of hist) {
        if (!e.favicon) continue;
        const h = pg.hostOf(e.url);
        if (h && !m.has(h)) m.set(h, e.favicon);
      }
      favCache.set(hist, m);
    }
    return m;
  }
  /** Favicon URL recorded for this page or host (history first, then bookmarks), or null. */
  pg.faviconUrlFor = (url) => {
    if (!url) return null;
    const host = pg.hostOf(url);
    const m = hostFavicons();
    if (host && m.has(host)) return m.get(host);
    const bm = Vox.bookmarks && Vox.bookmarks.findByUrl ? Vox.bookmarks.findByUrl(url) : null;
    return bm && bm.favicon && /^(https?:|data:image\/)/i.test(bm.favicon) ? bm.favicon : null;
  };
  const DARK_TEXT_ON = new Set(['#F5B83D', '#D4A017']);
  pg.letterSpec = (url, label) => {
    const host = pg.hostOf(url);
    const name = String(label || host.replace(/^www\./, '') || url || '?');
    const bg = Vox.util.hashColor(host || String(url));
    return { letter: name.charAt(0).toLocaleUpperCase('tr-TR'), bg, fg: DARK_TEXT_ON.has(bg) ? '#3D2A00' : '#FFFFFF' };
  };
  /** Site icon for any URL: the real favicon when known (falls back to the letter tile if it fails to load). */
  pg.SiteIcon = ({ url, src, label, size = 18, class: cls }) => {
    const fav = src && /^(https?:|data:image\/)/i.test(src) ? src : pg.faviconUrlFor(url);
    const [broken, setBroken] = useState(null);
    if (fav && broken !== fav) {
      return html`<span class=${cx('favicon favicon--img', cls)} style=${`width:${size}px;height:${size}px`} aria-hidden="true">
        <img src=${fav} width=${size} height=${size} alt="" referrerpolicy="no-referrer" decoding="async" onError=${() => setBroken(fav)}/></span>`;
    }
    if (/^vox:/i.test(String(url || ''))) return html`<${Favicon} spec=${{ logo: true }} size=${size} class=${cls}/>`;
    if (/^file:/i.test(String(url || ''))) return html`<${Favicon} spec=${{ icon: 'file' }} size=${size} class=${cls}/>`;
    return html`<${Favicon} spec=${pg.letterSpec(url, label)} size=${size} class=${cls}/>`;
  };

  /* ── Dosya türleri ────────────────────────────────────── */
  const KINDS = {
    pdf: { icon: 'file-text', label: 'PDF belgesi', tone: 'red' },
    archive: { icon: 'file-archive', label: 'Arşiv', tone: 'honey' },
    image: { icon: 'file-image', label: 'Görsel', tone: 'blue' },
    app: { icon: 'app-window', label: 'Uygulama', tone: 'gray' },
    code: { icon: 'file-code', label: 'Web dosyası', tone: 'green' },
    video: { icon: 'file-video', label: 'Video', tone: 'purple' },
    audio: { icon: 'file-music', label: 'Ses', tone: 'purple' },
    doc: { icon: 'file-text', label: 'Belge', tone: 'blue' },
    sheet: { icon: 'file-spreadsheet', label: 'Tablo', tone: 'green' },
    file: { icon: 'file', label: 'Dosya', tone: 'gray' },
  };
  pg.fileKind = (filename = '', mime = '') => {
    const ext = ((String(filename).match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
    const m = String(mime || '');
    let k = 'file';
    if (ext === 'pdf' || m === 'application/pdf') k = 'pdf';
    else if (/^(zip|rar|7z|tar|gz|tgz|xz|bz2)$/.test(ext) || /zip|compressed|x-tar/.test(m)) k = 'archive';
    else if (/^(png|jpe?g|gif|webp|svg|avif|bmp|ico|heic)$/.test(ext) || m.startsWith('image/')) k = 'image';
    else if (/^(exe|msi|msix|appx|dmg|apk|bat|cmd|scr|ps1)$/.test(ext) || /msdownload|x-msi/.test(m)) k = 'app';
    else if (/^(html?|css|js|mjs|json|xml)$/.test(ext) || m === 'text/html') k = 'code';
    else if (/^(mp4|webm|mov|mkv|avi)$/.test(ext) || m.startsWith('video/')) k = 'video';
    else if (/^(mp3|wav|ogg|flac|m4a|opus)$/.test(ext) || m.startsWith('audio/')) k = 'audio';
    else if (/^(docx?|odt|txt|rtf|md|pptx?|odp)$/.test(ext) || m.startsWith('text/')) k = 'doc';
    else if (/^(xlsx?|ods|csv)$/.test(ext)) k = 'sheet';
    return { kind: k, ext: ext.toUpperCase(), ...KINDS[k] };
  };
  pg.FileTile = ({ filename, mime, size = 44 }) => {
    const f = pg.fileKind(filename, mime);
    return html`<span class=${cx('pg-ft', `pg-ft--${f.tone}`)} style=${`width:${size}px;height:${size}px`} aria-hidden="true">
      <${Icon} name=${f.icon} size=${Math.round(size * 0.46)}/>${f.ext ? html`<b>${f.ext.slice(0, 4)}</b>` : null}
    </span>`;
  };

  /* ── Sayfa iskeleti ───────────────────────────────────── */
  /** Page header: icon tile + title (+ subtitle), optional search slot, actions (children). */
  pg.PageHeader = ({ icon, title, sub, search, children, class: cls }) => html`<header class=${cx('pg-head', cls)}>
    <div class="pg-head-title">
      <span class="pg-head-ic" aria-hidden="true"><${Icon} name=${icon} size=${22}/></span>
      <div class="pg-head-text"><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : null}</div>
    </div>
    ${search ? html`<div class="pg-head-search">${search}</div>` : null}
    ${children ? html`<div class="pg-head-actions">${children}</div>` : null}
  </header>`;

  /** Bottom selection bar that slides up while count > 0. */
  pg.BulkBar = ({ count, onClear, children, label = 'öğe' }) => html`<div class=${cx('pg-bulk', count > 0 && 'is-on')}>
    <div class="pg-bulk-in" role="region" aria-label="Seçim işlemleri" aria-hidden=${count > 0 ? undefined : 'true'} inert=${count > 0 ? undefined : true}>
      <${IconButton} icon="x" label="Seçimi temizle" size="sm" onClick=${onClear}/>
      <span class="pg-bulk-count" aria-live="polite">${count} ${label} seçildi</span>
      <span class="pg-bulk-sp"></span>
      ${children}
    </div>
  </div>`;

  /* ── Küçük yardımcılar ────────────────────────────────── */
  /** Re-renders every `ms` (relative times such as "3 dk önce"). */
  pg.useNow = (ms = 30000) => {
    const [, set] = useState(0);
    useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
  };
  pg.useId = (p = 'pg') => useRef(Vox.util.uid(p)).current;

  pg.highlight = (text, q) => {
    const s = String(text == null ? '' : text);
    const n = String(q || '').trim();
    if (!n) return s;
    const lo = s.toLocaleLowerCase('tr-TR'), qn = n.toLocaleLowerCase('tr-TR');
    if (lo.length !== s.length) return s;
    const out = [];
    let i = 0, j;
    while ((j = lo.indexOf(qn, i)) >= 0 && out.length < 24) {
      if (j > i) out.push(s.slice(i, j));
      out.push(html`<mark class="pg-mark">${s.slice(j, j + qn.length)}</mark>`);
      i = j + qn.length;
    }
    out.push(s.slice(i));
    return out;
  };
  pg.match = (q, ...fields) => {
    const s = String(q || '').trim().toLocaleLowerCase('tr-TR');
    return !s || fields.join(' ').toLocaleLowerCase('tr-TR').includes(s);
  };

  /** Copies through the main process (works without page focus); falls back to the web clipboard. */
  pg.copy = (text) => Vox.native.invoke('clipboard:write', { text: String(text) }).then(() => true, () => Vox.util.copy(String(text)));
  pg.copyLink = (url) => pg.copy(url).then((ok) => Vox.ui.toast({ icon: ok ? 'link' : 'info', text: ok ? 'Bağlantı panoya kopyalandı.' : 'Bağlantı kopyalanamadı.' }));
  pg.undoToast = (text, undo, icon = 'trash-2') => Vox.ui.toast({ icon, text, duration: 6500, action: { label: 'Geri al', onClick: undo } });

  /** Collapses elements (height + fade) before they are removed from state. */
  pg.collapseOut = (els) => {
    const list = [].concat(els).filter((el) => el && el.isConnected);
    if (!list.length || Vox.motion.reduced()) return Promise.resolve();
    return Promise.all(list.map((el) => {
      const h = el.offsetHeight;
      el.style.overflow = 'hidden';
      el.style.pointerEvents = 'none';
      return el.animate([
        { height: `${h}px`, opacity: 1, transform: 'none' },
        { height: '0px', opacity: 0, transform: 'translateX(-12px)', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' },
      ], { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.catch(() => {});
    }));
  };
  /** Pops elements out (scale + fade) — for cards and tiles. */
  pg.popOut = (els) => {
    const list = [].concat(els).filter((el) => el && el.isConnected);
    if (!list.length || Vox.motion.reduced()) return Promise.resolve();
    return Promise.all(list.map((el) => el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.88)' }],
      { duration: 200, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' }).finished.catch(() => {})));
  };

  /** FLIP every [data-flip-key] child of ref when `sig` changes (reorders, removals). */
  pg.useAutoFlip = (ref, sig, sel = '[data-flip-key]') => {
    const prev = useRef(null);
    useLayoutEffect(() => {
      const root = ref.current;
      if (!root) return;
      const base = root.getBoundingClientRect();
      const els = root.querySelectorAll(sel);
      const next = new Map();
      els.forEach((el) => { const r = el.getBoundingClientRect(); next.set(el.dataset.flipKey, { x: r.left - base.left, y: r.top - base.top }); });
      if (prev.current && !Vox.motion.reduced()) {
        els.forEach((el) => {
          const a = prev.current.get(el.dataset.flipKey), b = next.get(el.dataset.flipKey);
          if (!a || !b) return;
          const dx = a.x - b.x, dy = a.y - b.y;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
        });
      }
      prev.current = next;
    }, [sig]);
  };

  /** Moves focus to the next/previous element matching `selector` inside container. */
  pg.moveFocus = (container, dir, selector) => {
    if (!container) return null;
    const items = Array.from(container.querySelectorAll(selector));
    if (!items.length) return null;
    const i = items.indexOf(document.activeElement.closest ? document.activeElement.closest(selector) : null);
    const n = dir === 'first' ? items[0] : dir === 'last' ? items[items.length - 1] : items[Math.max(0, Math.min(items.length - 1, i < 0 ? 0 : i + dir))];
    if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); }
    return n;
  };
  const editable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  /** "/" focuses the page's search box (like many web apps). */
  pg.slashToSearch = (e) => {
    if (e.key !== '/' || e.ctrlKey || e.altKey || e.metaKey || editable(e.target)) return;
    const input = e.currentTarget.querySelector('.pg-head-search input');
    if (input) { e.preventDefault(); input.focus(); }
  };

  /** Renders `step` more rows each time the sentinel scrolls into view (long history / download lists). */
  pg.useIncremental = (total, step = 120, resetKey) => {
    const [limit, setLimit] = useState(step);
    const ref = useRef(null);
    useEffect(() => { setLimit(step); }, [resetKey]);
    useEffect(() => {
      const el = ref.current;
      if (!el || limit >= total || !window.IntersectionObserver) return undefined;
      const io = new IntersectionObserver((ents) => { if (ents.some((x) => x.isIntersecting)) setLimit((l) => l + step); }, { rootMargin: '600px 0px' });
      io.observe(el);
      return () => io.disconnect();
    }, [limit, total]);
    return { limit, sentinel: limit < total ? html`<div ref=${ref} class="pg-more" aria-hidden="true"></div>` : null, more: () => setLimit((l) => l + step) };
  };
});
