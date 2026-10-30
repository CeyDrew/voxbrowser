/* VoxBrowser Demo — veri API'leri: ayarlar, tema, yer imleri, geçmiş, indirilenler, uzantılar, izinler, bildirimler, okuma listesi. */
(function () {
  'use strict';
  const Vox = window.Vox;
  if (!Vox || !Vox.p) return;
  const store = Vox.store;
  const { uid } = Vox.util;
  const write = (path, value) => (Vox.data && Vox.data.write ? Vox.data.write(path, value) : store.set(path, value));

  /* ── Ayarlar ──────────────────────────────────────────── */
  Vox.settings = {
    get: (path) => store.get(`settings.${path}`),
    // Yol düzeyinde yazılır: aynı anda iki görünümde değişen farklı ayarlar birbirini ezmez.
    set(path, value) { write(`settings.${path}`, value); Vox.bus.emit('settings:change', { path, value }); },
  };
  /** const [theme, setTheme] = Vox.useSetting('appearance.theme') */
  Vox.useSetting = (path) => [Vox.useStore(`settings.${path}`), (v) => Vox.settings.set(path, v)];

  /* ── Tema ─────────────────────────────────────────────── */
  const root = document.documentElement;
  let localThemeSet = false;
  /** Animasyonlar oynar: "Her zaman açık" seçiliyse ya da Windows onları yalnızca Uzak Masaüstü yüzünden kapattıysa. */
  const applyMotion = () => {
    const a = store.get('settings.a11y') || {};
    if (!a.reduceMotion && (a.forceMotion || a.remoteSession)) root.setAttribute('data-motion', 'full'); else root.removeAttribute('data-motion');
  }; // Vox.theme.set kendi geçiş animasyonuyla uygular; abonelik o an uygulamasın
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };
  Vox.theme = {
    mode: () => store.get('settings.appearance.theme') || 'system',
    effective() {
      const m = Vox.theme.mode();
      if (m === 'light' || m === 'dark') return m;
      const host = root.getAttribute('data-theme');
      if (host === 'light' || host === 'dark') return host;
      return mq.matches ? 'dark' : 'light';
    },
    apply() {
      const m = Vox.theme.mode();
      if (m === 'light' || m === 'dark') root.setAttribute('data-vox-theme', m);
      else root.removeAttribute('data-vox-theme');
      root.setAttribute('data-density', store.get('settings.appearance.density') || 'compact');
      root.toggleAttribute('data-reduce-motion', !!store.get('settings.a11y.reduceMotion'));
      applyMotion();
      Vox.bus.emit('theme:change', { mode: m, effective: Vox.theme.effective() });
    },
    /** Change theme; with a point {x,y} the new theme grows out of it as a circle. */
    set(mode, point) {
      const before = Vox.theme.effective();
      localThemeSet = true;
      try { write('settings.appearance.theme', mode); } finally { localThemeSet = false; }
      const after = Vox.theme.effective();
      if (!document.startViewTransition || Vox.motion.reduced() || !point || before === after) { Vox.theme.apply(); return; }
      const vt = document.startViewTransition(() => { Vox.theme.apply(); return new Promise((r) => setTimeout(r, 20)); });
      vt.ready.then(() => {
        const r = Math.hypot(Math.max(point.x, innerWidth - point.x), Math.max(point.y, innerHeight - point.y));
        root.animate({ clipPath: [`circle(0px at ${point.x}px ${point.y}px)`, `circle(${r}px at ${point.x}px ${point.y}px)`] },
          { duration: 640, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(() => {});
    },
  };
  mq.addEventListener && mq.addEventListener('change', () => Vox.theme.apply());
  store.subscribe((s, p) => {
    const a = s.settings && s.settings.appearance, b = p.settings && p.settings.appearance;
    // Tema başka bir görünümde (ör. vox://ayarlar) değiştiyse burada da uygula.
    if (!localThemeSet && a && b && a.theme !== b.theme) Vox.theme.apply();
    if (a && (!b || a.density !== b.density)) root.setAttribute('data-density', a.density || 'compact');
    const y = (s.settings && s.settings.a11y) || {}, py = (p.settings && p.settings.a11y) || {};
    if (y.reduceMotion !== py.reduceMotion) root.toggleAttribute('data-reduce-motion', !!y.reduceMotion);
    if (y.forceMotion !== py.forceMotion || y.remoteSession !== py.remoteSession || y.reduceMotion !== py.reduceMotion) applyMotion();
  });

  /* ── Yer imleri ───────────────────────────────────────── */
  const walk = (node, fn, parent = null, depth = 0) => {
    if (fn(node, parent, depth) === false) return false;
    for (const c of node.children || []) if (walk(c, fn, node, depth + 1) === false) return false;
    return true;
  };
  const mapTree = (node, fn) => {
    const n = fn(node);
    if (!n || !n.children) return n;
    const kids = n.children.map((c) => mapTree(c, fn)).filter(Boolean);
    return kids.some((k, i) => k !== n.children[i]) || kids.length !== n.children.length ? { ...n, children: kids } : n;
  };
  const setTree = (fn) => store.set('bookmarks', (t) => fn(t));
  Vox.bookmarks = {
    tree: () => store.get('bookmarks'),
    walk: (fn) => walk(store.get('bookmarks'), fn),
    get(id) { let f = null; walk(store.get('bookmarks'), (n) => { if (n.id === id) { f = n; return false; } return true; }); return f; },
    parentOf(id) { let f = null; walk(store.get('bookmarks'), (n, p) => { if (n.id === id) { f = p; return false; } return true; }); return f; },
    findByUrl(url) { let f = null; walk(store.get('bookmarks'), (n) => { if (n.url === url) { f = n; return false; } return true; }); return f; },
    isBookmarked: (url) => !!Vox.bookmarks.findByUrl(url),
    folders() { const out = []; walk(store.get('bookmarks'), (n, p, d) => { if (n.type === 'folder' && n.id !== 'root') out.push({ id: n.id, title: n.title, depth: d - 1 }); return true; }); return out; },
    add({ title, url, parentId = 'bar', index, type = 'url', favicon }) {
      const node = { id: uid('bm'), type, title: title || url, ...(type === 'url' ? { url } : { children: [] }), ...(favicon && type === 'url' ? { favicon } : {}), added: Date.now() };
      setTree((t) => mapTree(t, (n) => {
        if (n.id !== parentId) return n;
        const kids = (n.children || []).slice();
        kids.splice(index == null ? kids.length : index, 0, node);
        return { ...n, children: kids };
      }));
      Vox.bus.emit('bookmarks:add', { node, parentId });
      return node.id;
    },
    addFolder: ({ title = 'Yeni klasör', parentId = 'bar', index }) => Vox.bookmarks.add({ title, parentId, index, type: 'folder' }),
    /** Re-inserts an existing node (with its id and children), e.g. to undo a delete. */
    insert(node, parentId = 'bar', index) {
      if (!node || Vox.bookmarks.get(node.id)) return;
      setTree((t) => mapTree(t, (n) => {
        if (n.id !== parentId) return n;
        const kids = (n.children || []).slice();
        kids.splice(index == null ? kids.length : Math.min(index, kids.length), 0, node);
        return { ...n, children: kids };
      }));
      Vox.bus.emit('bookmarks:add', { node, parentId });
    },
    indexOf(id) { const p = Vox.bookmarks.parentOf(id); return p ? (p.children || []).findIndex((c) => c.id === id) : -1; },
    update(id, patch) { setTree((t) => mapTree(t, (n) => (n.id === id ? { ...n, ...patch } : n))); },
    remove(id) { const node = Vox.bookmarks.get(id); setTree((t) => mapTree(t, (n) => (n.id === id ? null : n))); Vox.bus.emit('bookmarks:remove', { node }); return node; },
    move(id, parentId, index) {
      const node = Vox.bookmarks.get(id);
      if (!node || id === parentId) return;
      let inside = false;
      walk(node, (n) => { if (n.id === parentId) inside = true; return !inside; });
      if (inside) return;
      setTree((t) => {
        const without = mapTree(t, (n) => (n.id === id ? null : n));
        return mapTree(without, (n) => {
          if (n.id !== parentId) return n;
          const kids = (n.children || []).slice();
          kids.splice(index == null ? kids.length : Math.min(index, kids.length), 0, node);
          return { ...n, children: kids };
        });
      });
    },
    /** Adds or removes the URL; returns true when it was added. */
    toggle(url, title) {
      const f = Vox.bookmarks.findByUrl(url);
      if (f) { Vox.bookmarks.remove(f.id); return false; }
      Vox.bookmarks.add({ url, title, parentId: 'bar' });
      return true;
    },
  };

  /* ── Geçmiş ───────────────────────────────────────────── */
  Vox.history = {
    list: () => store.get('history') || [],
    add({ url, title }) {
      store.set('history', (h = []) => {
        if (h[0] && h[0].url === url && Date.now() - h[0].ts < 30000) return [{ ...h[0], ts: Date.now(), title }, ...h.slice(1)];
        return [{ id: uid('hi'), url, title, ts: Date.now() }, ...h].slice(0, 5000);
      });
    },
    remove(ids) { const set = new Set([].concat(ids)); store.set('history', (h = []) => h.filter((e) => !set.has(e.id))); },
    clear(sinceTs = 0) { store.set('history', (h = []) => (sinceTs ? h.filter((e) => e.ts < sinceTs) : [])); },
    search(q) {
      const s = String(q || '').toLocaleLowerCase('tr-TR');
      return Vox.history.list().filter((e) => !s || `${e.title} ${e.url}`.toLocaleLowerCase('tr-TR').includes(s));
    },
  };

  /* ── İndirilenler (gerçek: ana süreçteki Chromium indirmeleri) ── */
  const dlAct = (id, action) => Vox.native.invoke('downloads:action', { id, action }).catch((e) => Vox.reportError(`download:${action}`, e));
  Vox.downloads = {
    list: () => store.get('downloads') || [],
    /** Starts a real download of a URL in the active tab's profile. */
    start({ url }) { if (url && Vox.tabs && Vox.tabs.download) Vox.tabs.download(url); },
    pause: (id) => dlAct(id, 'pause'),
    resume: (id) => dlAct(id, 'resume'),
    cancel: (id) => dlAct(id, 'cancel'),
    retry: (id) => dlAct(id, 'retry'),
    keep: (id) => dlAct(id, 'keep'),
    discard: (id) => dlAct(id, 'discard'),
    remove: (id) => dlAct(id, 'remove'),
    clear: () => dlAct('', 'clear'),
    open: (id) => dlAct(id, 'open'),
    showInFolder: (id) => dlAct(id, 'show'),
    active: () => Vox.downloads.list().filter((d) => d.state === 'in_progress'),
  };

  /* ── Uzantılar ────────────────────────────────────────── */
  const setExt = (id, patch) => store.set('extensions', (l = []) => l.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  Vox.extensions = {
    list: () => store.get('extensions') || [],
    get: (id) => Vox.extensions.list().find((e) => e.id === id),
    toggle(id, on) { const e = Vox.extensions.get(id); if (e) { setExt(id, { enabled: on === undefined ? !e.enabled : on }); Vox.bus.emit('extensions:change', { id }); } },
    pin(id, on) { const e = Vox.extensions.get(id); if (e) setExt(id, { pinned: on === undefined ? !e.pinned : on }); },
    setSiteAccess(id, mode) { setExt(id, { siteAccess: mode }); },
    update: setExt,
    remove(id) { store.set('extensions', (l = []) => l.filter((e) => e.id !== id)); Vox.bus.emit('extensions:change', { id }); },
    install(def) {
      if (Vox.extensions.get(def.id)) return;
      store.set('extensions', (l = []) => [...l, { enabled: true, pinned: false, siteAccess: 'click', errors: [], installedAt: Date.now(), ...def }]);
      Vox.bus.emit('extensions:install', { id: def.id });
    },
  };

  /* ── İzinler, bildirimler ─────────────────────────────── */
  Vox.permissions = {
    all: () => store.get('permissions') || {},
    get: (origin, perm) => ((store.get('permissions') || {})[origin] || {})[perm] || store.get(`settings.sitePermissions.${perm}`) || 'ask',
    set(origin, perm, value) { store.set('permissions', (p = {}) => ({ ...p, [origin]: { ...(p[origin] || {}), [perm]: value } })); },
    reset(origin) { store.set('permissions', (p = {}) => { const n = { ...p }; delete n[origin]; return n; }); },
    /** A site asks for a permission. Resolves 'allow' | 'block'. The chrome shows the prompt. */
    request(origin, perm) {
      const cur = Vox.permissions.get(origin, perm);
      if (cur === 'allow' || cur === 'block') return Promise.resolve(cur);
      return new Promise((resolve) => {
        const req = { id: uid('pr'), origin, perm, resolve: (v, remember = true) => { if (remember) Vox.permissions.set(origin, perm, v); resolve(v); } };
        if (!Vox.commands.has('permission.prompt')) { resolve('block'); return; }
        Vox.commands.run('permission.prompt', req);
      });
    },
  };
  /** OS-style notification from a site or the browser: { title, body, icon, origin, actions } */
  Vox.notify = (n) => {
    const item = { id: uid('nt'), ts: Date.now(), ...n };
    store.set('notifications', (l = []) => [item, ...l].slice(0, 30));
    Vox.bus.emit('notify', item);
    if (!Vox.notifyUI && Vox.ui) Vox.ui.toast({ icon: n.icon || 'bell', title: n.title, text: n.body ? ` ${n.body}` : '' });
    return item.id;
  };

  /* ── Okuma listesi, parolalar, profil ─────────────────── */
  Vox.readingList = {
    list: () => store.get('readingList') || [],
    add({ url, title, favicon }) { if (!Vox.readingList.list().some((r) => r.url === url)) store.set('readingList', (l = []) => [{ id: uid('rl'), url, title, ...(favicon ? { favicon } : {}), added: Date.now(), read: false }, ...l]); },
    remove(id) { store.set('readingList', (l = []) => l.filter((r) => r.id !== id)); },
    markRead(id, read = true) { store.set('readingList', (l = []) => l.map((r) => (r.id === id ? { ...r, read } : r))); },
  };
  Vox.passwords = {
    list: () => store.get('passwords') || [],
    update(id, patch) { store.set('passwords', (l = []) => l.map((p) => (p.id === id ? { ...p, ...patch } : p))); },
    remove(id) { store.set('passwords', (l = []) => l.filter((p) => p.id !== id)); },
    add(p) { store.set('passwords', (l = []) => [{ id: uid('pw'), added: Date.now(), ...p }, ...l]); },
  };
})();
