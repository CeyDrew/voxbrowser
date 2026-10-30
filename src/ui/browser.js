/* VoxBrowser — arayüz tarafı tarayıcı katmanı: sekmeler/gezinme ana süreçte, burada yalnızca yansıması ve komutları var.
   Vox.tabs, Vox.nav, Vox.url, Vox.pageFind, Vox.layout; ana süreç olaylarını (kısayol, sağ tık, izin, indirme) bağlar. */
(function () {
  'use strict';
  const Vox = window.Vox;
  if (!Vox || !Vox.p) return;
  const store = Vox.store;
  const N = Vox.native;
  const call = (ch, p) => N.invoke(ch, p).catch((e) => { Vox.reportError(ch, e); return null; });

  /* ── URL yardımcıları ─────────────────────────────────── */
  Vox.url = {
    parse(raw) {
      const s = String(raw || '').trim();
      const m = s.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i);
      if (!m) return { href: s, scheme: (s.match(/^([a-z][a-z0-9+.-]*):/i) || [])[1] || '', host: '', path: '/', query: {}, search: '', hash: '', origin: '' };
      const scheme = m[1].toLowerCase(), host = m[2].toLowerCase(), path = m[3] || '/', search = m[4] || '', hash = m[5] || '';
      const query = {};
      new URLSearchParams(search.slice(1)).forEach((v, k) => { query[k] = v; });
      return { href: s, scheme, host, path, query, search, hash, origin: `${scheme}://${host}` };
    },
    /** Short form for the address bar when it isn't focused. */
    display(raw) {
      const u = Vox.url.parse(raw);
      if (!u.scheme || !u.host || u.scheme === 'vox' || u.scheme === 'about' || u.scheme === 'data' || u.scheme === 'file') return raw; // view-source: vb. olduğu gibi
      const host = u.host.replace(/^www\./, '');
      return `${host}${u.path === '/' ? '' : u.path}${u.search}`;
    },
    abs(href, base) {
      try { return new URL(href, base).toString(); } catch (e) { return href; }
    },
    /** Resolution (URL, host or web search) happens in the main process: Vox.nav.go(text). */
    fromInput: (t) => t,
  };

  /* ── Sekme yansıması ──────────────────────────────────── */
  const INTERNAL = {
    'yeni-sekme': { logo: true }, ayarlar: { icon: 'settings' }, hakkinda: { logo: true }, gecmis: { icon: 'history' },
    indirilenler: { icon: 'download' }, 'yer-imleri': { icon: 'book-marked' }, uzantilar: { icon: 'puzzle' }, surecler: { icon: 'activity' },
    hata: { icon: 'triangle-alert' },
  };
  function faviconOf(t) {
    if (t.crashed) return { icon: 'frown' };
    if (t.internal) return INTERNAL[Vox.url.parse(t.url).host] || { logo: true };
    if (t.favicon && /^(https?:|data:image\/)/i.test(t.favicon)) return { url: t.favicon };
    return t.security === 'error' ? { icon: 'triangle-alert' } : { icon: 'globe' };
  }
  function mapTab(t) {
    const shown = t.displayUrl || t.url;
    return {
      ...t,
      faviconUrl: t.favicon,
      favicon: faviconOf(t),
      url: shown,
      realUrl: t.url,
      title: t.title || (t.internal ? 'Yeni sekme' : Vox.url.display(shown)) || 'Yeni sekme',
      sleeping: false,
    };
  }
  N.on('tabs:state', (st) => {
    store.update((s) => ({ ...s, tabs: st.tabs.map(mapTab), activeTabId: st.activeTabId, groups: st.groups || s.groups || [], closedTabs: st.closed || [] }));
  });

  const activeId = () => store.get('activeTabId');
  Vox.tabs = {
    all: () => store.get('tabs') || [],
    get: (id) => (store.get('tabs') || []).find((t) => t.id === id),
    active: () => Vox.tabs.get(activeId()),
    /** open(url, { active, index, pinned, groupId, opener }) → Promise<tabId> */
    open: (url = 'vox://yeni-sekme', opts = {}) => call('tabs:create', { url, active: opts.active !== false, index: opts.index, pinned: opts.pinned, groupId: opts.groupId, openerId: opts.opener, focus: opts.focus }),
    close: (id = activeId()) => call('tabs:close', { tabId: id }),
    activate: (id) => { store.set('activeTabId', id); return call('tabs:activate', { tabId: id }); },
    move: (id, index) => call('tabs:move', { tabId: id, index }),
    next(dir = 1) {
      const tabs = Vox.tabs.all();
      const i = tabs.findIndex((t) => t.id === activeId());
      if (tabs.length) Vox.tabs.activate(tabs[(i + dir + tabs.length) % tabs.length].id);
    },
    duplicate: (id = activeId()) => call('tabs:duplicate', { tabId: id }),
    pin(id = activeId(), on) { const t = Vox.tabs.get(id); return call('tabs:update', { tabId: id, pinned: on === undefined ? !(t && t.pinned) : !!on }); },
    mute(id = activeId(), on) { const t = Vox.tabs.get(id); return call('tabs:update', { tabId: id, muted: on === undefined ? !(t && t.muted) : !!on }); },
    update(id, patch = {}) {
      const p = { tabId: id };
      for (const k of ['pinned', 'muted', 'groupId']) if (k in patch) p[k] = patch[k];
      return call('tabs:update', p);
    },
    closeOthers(id = activeId()) { Vox.tabs.all().filter((t) => t.id !== id && !t.pinned).forEach((t) => Vox.tabs.close(t.id)); },
    closeRight(id = activeId()) { const tabs = Vox.tabs.all(); const i = tabs.findIndex((t) => t.id === id); tabs.slice(i + 1).forEach((t) => Vox.tabs.close(t.id)); },
    /** Reopens the most recently closed tab, or the one with this closedAt (from store.closedTabs). */
    reopenClosed: (closedAt) => call('tabs:reopen', closedAt ? { closedAt } : {}),
    crash: (id) => call('tabs:crash', { tabId: id }),
    setZoom: (id, zoom) => call('tabs:zoom', { tabId: id, zoom }),
    zoomBy: (id, dir) => call('tabs:zoom', { tabId: id, dir }),
    /** Downloads a URL with the tab's profile (cookies), like "Bağlantıyı farklı kaydet". */
    download: (url, id = activeId()) => call('context:action', { tabId: id, action: 'saveURL', params: { url } }),
    setGroups(groups) { store.set('groups', groups); return call('tabs:groups', { groups }); },
  };

  Vox.nav = {
    /** Address-bar text → URL / host / web search (resolved by the main process). */
    go: (input, opts = {}) => call('tabs:navigate', { tabId: opts.tabId || activeId(), input, focus: opts.focus }),
    back: (tabId = activeId()) => call('tabs:back', { tabId }),
    forward: (tabId = activeId()) => call('tabs:forward', { tabId }),
    reload: (tabId = activeId(), hard = false) => call('tabs:reload', { tabId, ignoreCache: hard }),
    stop: (tabId = activeId()) => call('tabs:stop', { tabId }),
    home: () => Vox.nav.go(store.get('settings.startup.homeUrl') || 'vox://yeni-sekme'),
    goto: (tabId, index) => call('tabs:goto', { tabId, index }),
    /** { index, entries:[{url,title}] } of a tab's back/forward history */
    entries: (tabId = activeId()) => call('tabs:entries', { tabId }),
    canBack: (t) => !!(t && t.canGoBack),
    canForward: (t) => !!(t && t.canGoForward),
    focusPage: (tabId = activeId()) => call('tabs:focusPage', { tabId }),
  };

  /* ── Sayfada bul (Chromium findInPage) ────────────────── */
  Vox.pageFind = {
    start: (text, opts = {}) => call('find:start', { tabId: opts.tabId || activeId(), text, forward: opts.forward !== false, matchCase: !!opts.matchCase, findNext: !!opts.findNext }),
    stop: (tabId = activeId(), action = 'clearSelection') => call('find:stop', { tabId, action }),
  };
  N.on('find:result', (r) => Vox.bus.emit('find:result', r));

  /* ── Yerleşim: sayfa alanının ve DevTools alanının ekran konumu ana sürece bildirilir ── */
  function reporter(channel) {
    let el = null, raf = 0, last = '';
    const send = () => {
      raf = 0;
      if (!el || !el.isConnected) { if (last !== 'none') { last = 'none'; if (channel === 'layout:devtools') call(channel, {}); } return; }
      const r = el.getBoundingClientRect();
      const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (key === last) return;
      last = key;
      call(channel, { x: r.left, y: r.top, width: r.width, height: r.height });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(send); };
    const ro = window.ResizeObserver ? new ResizeObserver(schedule) : null;
    window.addEventListener('resize', schedule);
    return {
      attach(node) {
        if (node === el) return;
        if (el && ro) ro.unobserve(el);
        el = node;
        if (el && ro) ro.observe(el);
        schedule();
      },
      detach(node) { if (node && node !== el) return; if (el && ro) ro.unobserve(el); el = null; schedule(); },
      refresh: schedule,
    };
  }
  Vox.layout = { viewport: reporter('layout:viewport'), devtools: reporter('layout:devtools') };
  /* Kenar çubuğu gibi şeyler açılıp kapanınca konum değişir ama boyut değişmeyebilir: her kare kontrol etmek yerine store değişiminde tazele. */
  store.subscribe(() => { Vox.layout.viewport.refresh(); Vox.layout.devtools.refresh(); });

  /* ── Ana süreç olayları ───────────────────────────────── */
  /* Sayfadan gelen kısayol ya da sayfanın sağ tık menüsü bitince, arayüzde odaklanan bir şey kalmadıysa klavye sayfaya
     döner (ör. F5 ya da menüden Kopyala sonrası yazmaya devam). Odak başka yere gittiyse (DevTools, yeni sekme) dokunulmaz. */
  let returnToPage = false;
  const settleFocus = () => {
    if (!returnToPage || Vox.overlay.list().some((l) => l.kind !== 'toast')) return;
    returnToPage = false;
    const ae = document.activeElement;
    if (document.hasFocus() && (!ae || ae === document.body || ae === document.documentElement)) Vox.nav.focusPage();
  };
  Vox.overlay.subscribe((list) => { if (returnToPage && !list.some((l) => l.kind !== 'toast')) requestAnimationFrame(() => setTimeout(settleFocus, 0)); });
  N.on('shortcut', ({ combo }) => { returnToPage = true; Vox.keys.run(combo); setTimeout(settleFocus, 80); });
  N.on('window:state', (st) => store.patch('window', st));
  N.on('zoom:changed', (d) => Vox.bus.emit('tab:zoom', d));
  N.on('download:started', (d) => Vox.bus.emit('download:start', d));
  N.on('download:done', (d) => Vox.bus.emit('download:done', d));
  N.on('context-menu', (ctx) => {
    returnToPage = true;
    if (Vox.commands.has('menu.pageContext')) Vox.commands.run('menu.pageContext', { ...ctx, native: true, link: ctx.linkURL || null, selection: ctx.selectionText || '', editable: !!ctx.isEditable, image: ctx.mediaType === 'image' ? ctx.srcURL : null });
  });
  /* Arayüzün kendi metin alanları (adres çubuğu, bul, Voxi…) için düzenleme menüsü. Bir modül 'menu.uiContext'
     kaydederse onun yerine o çalışır. İşlem, odak alana geri verildikten sonra ana süreçte yapılır (yapıştır dahil). */
  N.on('ui:context-menu', (p) => {
    if (Vox.commands.has('menu.uiContext')) { Vox.commands.run('menu.uiContext', p); return; }
    const target = document.activeElement;
    const f = p.editFlags || {};
    const edit = (action, word) => () => {
      if (target && target.isConnected && target.focus) target.focus({ preventScroll: true });
      setTimeout(() => call('ui:edit', { action, word }), 0);
    };
    const items = [];
    if (p.isEditable && p.misspelledWord) {
      const sug = (p.dictionarySuggestions || []).slice(0, 5);
      sug.forEach((w) => items.push({ label: w, onSelect: edit('replaceMisspelling', w) }));
      if (!sug.length) items.push({ label: 'Öneri yok', disabled: true });
      items.push({ label: 'Sözlüğe ekle', icon: 'book-plus', onSelect: edit('addToDictionary', p.misspelledWord) }, '-');
    }
    if (p.isEditable) {
      items.push(
        { label: 'Geri al', icon: 'undo-2', kbd: 'Ctrl+Z', disabled: !f.canUndo, onSelect: edit('undo') },
        { label: 'Yinele', icon: 'redo-2', kbd: 'Ctrl+Y', disabled: !f.canRedo, onSelect: edit('redo') }, '-',
        { label: 'Kes', icon: 'scissors', kbd: 'Ctrl+X', disabled: !f.canCut, onSelect: edit('cut') },
        { label: 'Kopyala', icon: 'copy', kbd: 'Ctrl+C', disabled: !f.canCopy, onSelect: edit('copy') },
        { label: 'Yapıştır', icon: 'clipboard-paste', kbd: 'Ctrl+V', disabled: !f.canPaste, onSelect: edit('paste') },
        { label: 'Düz metin olarak yapıştır', icon: 'clipboard', kbd: 'Ctrl+Shift+V', disabled: !f.canPaste, onSelect: edit('pasteAsPlain') },
        { label: 'Sil', icon: 'trash-2', disabled: !f.canDelete, onSelect: edit('delete') }, '-',
        { label: 'Tümünü seç', icon: 'text-select', kbd: 'Ctrl+A', disabled: !f.canSelectAll, onSelect: edit('selectAll') },
      );
    } else {
      items.push({ label: 'Kopyala', icon: 'copy', kbd: 'Ctrl+C', onSelect: edit('copy') });
    }
    const sel = String(p.selectionText || '').trim();
    if (sel) {
      const short = sel.length > 28 ? `${sel.slice(0, 28)}…` : sel;
      items.push('-', { label: `“${short}” için web'de ara`, icon: 'search', onSelect: () => Vox.tabs.open(sel) });
    }
    // Modüller öğe ekleyebilir (ör. adres çubuğunda "Yapıştır ve git"): bus 'ui:edit-menu' { p, target, items, edit }
    Vox.bus.emit('ui:edit-menu', { p, target, items, edit });
    Vox.ui.menu({ anchor: { x: p.x, y: p.y }, items, placement: 'bottom-start', offset: 2 });
  });
  /* ── Ana süreçten sorular: site parolası (HTTP kimlik doğrulama) ve dış uygulama bağlantıları (mailto:, tel:, …).
     Soru, ilgili sekme etkinken gösterilir; arka plandaki sekmenin sorusu o sekmeye geçilince açılır. ── */
  const { html } = Vox.p;
  const APPS = { mailto: 'E-posta uygulaması', tel: 'Arama uygulaması', sms: 'Mesaj uygulaması', callto: 'Arama uygulaması', zoommtg: 'Zoom', zoomus: 'Zoom', msteams: 'Microsoft Teams', skype: 'Skype', spotify: 'Spotify', steam: 'Steam', magnet: 'Torrent uygulaması', 'ms-word': 'Word', 'ms-excel': 'Excel', 'ms-powerpoint': 'PowerPoint', tg: 'Telegram', whatsapp: 'WhatsApp', discord: 'Discord' };
  const waiting = [];
  const answer = (id, value) => call('prompt:respond', { id, value });
  const short = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
  function showPrompt(q) {
    if (q.kind === 'auth') {
      let where = q.host;
      try { where = q.isProxy ? `Vekil sunucu ${q.host}:${q.port}` : new URL(q.url).origin; } catch (e) { /* yok say */ }
      const insecure = !q.isProxy && /^http:/i.test(q.url || '');
      Vox.ui.dialog({
        title: 'Oturum açın', icon: 'key-round', width: 440, actions: [],
        render: ({ close }) => html`<form class="dialog-body vox-prompt" onSubmit=${(e) => { e.preventDefault(); const f = e.currentTarget.elements; close({ username: f.username.value, password: f.password.value }); }}>
          <p><b>${where}</b> bu sayfayı göstermek için kullanıcı adı ve parola istiyor.${q.realm ? ` (${short(q.realm, 80)})` : ''}</p>
          ${insecure ? html`<p class="vox-prompt-warn">Bu siteyle bağlantınız güvenli değil: bilgileriniz şifrelenmeden gönderilir.</p>` : null}
          <${Vox.c.TextField} label="Kullanıcı adı" name="username" autocomplete="username" spellcheck="false" data-autofocus=""/>
          <${Vox.c.TextField} label="Parola" name="password" type="password" autocomplete="current-password"/>
          <div class="dialog-actions">
            <${Vox.c.Button} variant="secondary" onClick=${() => close(null)}>Vazgeç<//>
            <${Vox.c.Button} variant="primary" type="submit">Oturum aç<//>
          </div>
        </form>`,
      }).then((v) => answer(q.id, v && typeof v.username === 'string' ? v : null));
    } else if (q.kind === 'external') {
      const app = APPS[q.scheme] || `“${q.scheme}:” bağlantılarını açan uygulama`;
      const from = q.origin && /^https?:/.test(q.origin) ? q.origin : '';
      Vox.ui.dialog({
        title: `${app} açılsın mı?`, icon: 'external-link', width: 460,
        body: html`<div class="vox-prompt"><p>${from ? html`<b>${from}</b> bu bağlantıyı bilgisayarınızdaki bir uygulamayla açmak istiyor.` : 'Bu bağlantı bilgisayarınızdaki bir uygulamayla açılacak.'}</p>
          <p class="vox-prompt-url"><code>${short(q.url, 160)}</code></p></div>`,
        actions: [{ label: 'Vazgeç', variant: 'secondary', value: false }, { label: 'Uygulamayı aç', variant: 'primary', value: true }],
      }).then((ok) => answer(q.id, { allow: ok === true }));
    } else answer(q.id, null);
  }
  N.on('prompt:request', (q) => {
    if (!q.tabId || q.tabId === store.get('activeTabId')) showPrompt(q); else waiting.push(q);
  });
  store.subscribe((s) => {
    for (const q of waiting.slice()) {
      const alive = (s.tabs || []).some((t) => t.id === q.tabId);
      if (alive && q.tabId !== s.activeTabId) continue;
      waiting.splice(waiting.indexOf(q), 1);
      if (alive) showPrompt(q); else answer(q.id, null);
    }
  });

  N.on('permission:request', (req) => {
    const resolve = (decision, remember = true) => call('permission:respond', { id: req.id, decision: decision === 'allow' ? 'allow' : 'block', remember });
    if (Vox.commands.has('permission.prompt')) Vox.commands.run('permission.prompt', { ...req, resolve });
    else resolve('block', false);
  });
})();
