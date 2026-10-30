'use strict';
/* VoxBrowser — sekmeler: her sekme kendi WebContentsView'unda, sandbox'lı ve bağlam yalıtımlı çalışır.
   Ana süreç sekme durumunun tek kaynağıdır; arayüz 'tabs:state' ile güncel listeyi alır. */
const path = require('path');
const { WebContentsView } = require('electron');
const urls = require('./urls');
const store = require('./store');
const history = require('./history');
const prompts = require('./prompts');
const tools = require('./page-tools');
const popups = require('./popups');

const PRELOAD_PAGE = path.join(__dirname, '..', 'preload', 'page.js');
const ZOOM_STEPS = [30, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
let nextId = 1;
/** webContents of tabs being closed (their last IPC calls may still arrive). */
const closing = new WeakSet();

const clampInt = (v, lo, hi, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);

function webPrefs(win) {
  return {
    partition: win.partition,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
    preload: PRELOAD_PAGE,
    spellcheck: !!store.get('settings.languages.spellcheck'),
    safeDialogs: true,
    navigateOnDragDrop: false,
    plugins: store.get('settings.downloads.openPdfInBrowser') !== false, // Chromium PDF görüntüleyicisi
    // Yazı boyutu ayarları yeni açılan sekmelerde geçerli olur (Chromium bunları sayfa oluşturulurken alır).
    defaultFontSize: clampInt(store.get('settings.appearance.fontSize'), 9, 72, 16),
    minimumFontSize: clampInt(store.get('settings.a11y.minFontSize'), 0, 72, 0),
    backgroundThrottling: true,
  };
}

function originOf(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : u.protocol; } catch (e) { return ''; }
}

function securityOf(url, certError) {
  if (certError) return 'error';
  url = String(url || '').replace(/^view-source:/i, '');
  if (/^vox:/i.test(url)) return 'internal';
  if (/^https:/i.test(url)) {
    // Kullanıcı sertifika hatasını yok sayarak açtıysa site güvenli sayılmaz.
    try { if (require('./sessions').isCertAllowed(new URL(url).host)) return 'error'; } catch (e) { /* yok say */ }
    return 'secure';
  }
  if (/^file:/i.test(url)) return 'file';
  if (/^http:/i.test(url)) return 'insecure';
  return 'neutral';
}

class Tab {
  constructor(win, opts = {}) {
    this.win = win;
    this.id = `t${nextId++}`;
    this.view = opts.view || new WebContentsView({ webPreferences: webPrefs(win) });
    this.view.setBackgroundColor('#FFFFFF');
    this.wc = this.view.webContents;
    this.devtools = null; // WebContentsView hosting DevTools
    this.findText = '';
    this.state = {
      id: this.id,
      url: opts.url || '',
      displayUrl: opts.url || '',
      title: opts.title || '',
      favicon: null,
      loading: false,
      progress: 0,
      canGoBack: false,
      canGoForward: false,
      audible: false,
      muted: false,
      pinned: !!opts.pinned,
      groupId: opts.groupId || null,
      zoom: store.get('settings.appearance.pageZoom') || 100,
      crashed: false,
      internal: urls.isInternal(opts.url),
      security: securityOf(opts.url || ''),
      errorUrl: null,
      openerId: opts.openerId || null,
      private: win.private,
      devtools: false,
      lastActive: Date.now(),
      createdAt: Date.now(),
    };
    this.bind();
  }

  get url() { return this.state.url; }
  set(patch) { Object.assign(this.state, patch); this.win.tabs.changed(); }
  nav() {
    const h = this.wc.navigationHistory;
    return { canGoBack: h.canGoBack(), canGoForward: h.canGoForward() };
  }

  load(url) {
    if (!url || !urls.allowedInTab(url)) return;
    this.set({ errorUrl: null, crashed: false });
    this.wc.loadURL(url).catch(() => { /* hatalar did-fail-load ile gelir */ });
  }

  bind() {
    const wc = this.wc;
    wc.setZoomFactor(this.state.zoom / 100);
    wc.on('did-start-loading', () => this.set({ loading: true, progress: 0.1 }));
    wc.on('did-stop-loading', () => this.set({ loading: false, progress: 1, ...this.nav() }));
    wc.on('did-start-navigation', (e) => {
      if (e.isMainFrame && !e.isSameDocument) {
        if (!/^vox:\/\/yeni-sekme/i.test(e.url)) this.uiFocusOnLoad = false;
        this.navUrl = e.url; // açılmakta olan adres: kimlik doğrulama sorusu yalnızca bu sitenin olabilir (prompts.login)
        this.set({ progress: 0.15 });
      }
    });
    wc.on('did-redirect-navigation', (e) => { if (e.isMainFrame) this.navUrl = e.url; });
    wc.on('will-redirect', (e) => this.guardRedirect(e));
    // Chromium sayfa yüklenince odağı sayfaya verir; yeni sekmede klavye adres çubuğunda kalsın (bir kez).
    wc.on('did-finish-load', () => {
      if (!this.uiFocusOnLoad) return;
      this.uiFocusOnLoad = false;
      if (this.win.tabs.activeId === this.id) this.win.focusUi();
    });
    wc.on('dom-ready', () => this.set({ progress: Math.max(this.state.progress, 0.8) }));
    wc.on('did-navigate', (e, url) => { this.navUrl = ''; this.onNavigate(url, false); });
    wc.on('did-navigate-in-page', (e, url, isMainFrame) => { if (isMainFrame) this.onNavigate(url, true); });
    wc.on('page-title-updated', (e, title) => {
      this.set({ title });
      if (!this.win.private && /^https?:/i.test(this.state.url)) history.title(this.state.url, title);
    });
    wc.on('page-favicon-updated', (e, favicons) => {
      const icon = (favicons && favicons[0]) || null;
      this.set({ favicon: icon });
      if (icon && !this.win.private && /^https?:/i.test(this.state.url)) history.favicon(this.state.url, icon);
    });
    wc.on('did-fail-load', (e, code, desc, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (validatedURL === this.navUrl) this.navUrl = '';
      if (code === -3) return; // -3: iptal (kullanıcı durdurdu ya da yönlendirme)
      this.showError(code, desc, validatedURL);
    });
    wc.on('render-process-gone', (e, details) => {
      this.set({ crashed: details.reason !== 'clean-exit', crashReason: details.reason, loading: false, audible: false });
    });
    wc.on('audio-state-changed', (e) => this.set({ audible: !!e.audible }));
    wc.on('update-target-url', (e, url) => { if (this.win.tabs.activeId === this.id) this.win.hud.status(url); });
    wc.on('found-in-page', (e, r) => this.win.send('find:result', { tabId: this.id, ...r }));
    wc.on('context-menu', (e, p) => {
      const vp = this.win.viewport;
      this.win.focusUi(); // menü arayüzde çizilir: ↑↓, Enter, Esc çalışsın (kapanınca odak sayfaya döner)
      this.win.send('context-menu', {
        tabId: this.id, x: p.x + vp.x, y: p.y + vp.y, pageX: p.x, pageY: p.y,
        linkURL: p.linkURL, linkText: p.linkText, srcURL: p.srcURL, mediaType: p.mediaType, hasImageContents: p.hasImageContents,
        selectionText: p.selectionText, isEditable: p.isEditable, editFlags: p.editFlags, titleText: p.titleText,
        pageURL: p.pageURL, frameURL: p.frameURL, misspelledWord: p.misspelledWord, dictionarySuggestions: p.dictionarySuggestions,
      });
    });
    wc.on('before-input-event', (e, input) => { popups.key(this, input); this.win.shortcuts.handle(e, input, this); });
    popups.track(this);
    wc.on('zoom-changed', (e, dir) => this.zoomBy(dir === 'in' ? 1 : -1));
    wc.on('enter-html-full-screen', () => this.win.setHtmlFullscreen(this, true));
    wc.on('leave-html-full-screen', () => this.win.setHtmlFullscreen(this, false));
    wc.on('devtools-opened', () => this.set({ devtools: true }));
    wc.on('devtools-closed', () => { this.set({ devtools: false }); this.win.devtoolsClosed(this); });
    wc.on('will-navigate', (e) => this.guard(e));
    wc.on('will-frame-navigate', (e) => { if (!e.isMainFrame && urls.isInternal(e.url)) e.preventDefault(); });
    wc.on('will-attach-webview', (e) => e.preventDefault());
    wc.setWindowOpenHandler((d) => this.onWindowOpen(d));
  }

  /** Web pages may not navigate into privileged vox:// pages (only the user can, via the address bar). */
  guard(e) {
    const to = e.url;
    if (urls.isInternal(to) && !urls.isInternal(this.wc.getURL())) e.preventDefault();
    if (!urls.allowedInTab(to)) {
      e.preventDefault();
      // mailto:, tel:, zoommtg: … → kullanıcı onaylarsa ilgili uygulamada açılır.
      prompts.external(this.win, this, to, originOf(this.wc.getURL()));
    }
  }
  /** A server redirect never leads into a vox:// page, whichever page started the navigation (even the new tab page). */
  guardRedirect(e) {
    if (!urls.isInternal(e.url) && urls.allowedInTab(e.url)) return;
    e.preventDefault();
    if (e.isMainFrame) prompts.external(this.win, this, e.url, originOf(this.wc.getURL()));
  }

  onNavigate(url, inPage) {
    // Kaynak görüntüleme sekmesinde Chromium iç adresi bildirir; adres çubuğunda "view-source:" görünsün.
    const virt = this.wc.getURL();
    if (/^view-source:/i.test(virt)) url = virt;
    const isError = /^vox:\/\/hata\//i.test(url);
    const patch = { url, internal: urls.isInternal(url), ...this.nav(), crashed: false, crashReason: null };
    if (!isError) {
      patch.errorUrl = null;
      patch.displayUrl = url;
      patch.security = securityOf(url, false);
      if (!inPage) patch.favicon = null;
      if (patch.internal) {
        const info = urls.internalInfo(url);
        if (info) patch.title = info.title;
      }
      if (/^view-source:/i.test(url)) patch.title = url;
      this.dropErrorEntryBefore(url);
    } else {
      patch.security = 'error';
      this.dropFailedEntry();
    }
    this.set(patch);
    if (!this.win.private && /^https?:/i.test(url) && !inPage) history.add(url, this.wc.getTitle());
    if (!inPage) this.win.tabs.saveSession();
  }

  /** Error pages replace Chromium's empty failed entry so Back skips it. */
  dropFailedEntry() {
    const h = this.wc.navigationHistory;
    const i = h.getActiveIndex();
    if (i > 0 && this.state.errorUrl && h.getEntryAtIndex(i - 1).url === this.state.errorUrl) {
      try { h.removeEntryAtIndex(i - 1); } catch (e) { /* yok say */ }
    }
  }
  dropErrorEntryBefore(url) {
    const h = this.wc.navigationHistory;
    const i = h.getActiveIndex();
    if (i > 0) {
      const prev = h.getEntryAtIndex(i - 1);
      if (prev && /^vox:\/\/hata\//i.test(prev.url) && prev.url.includes(encodeURIComponent(url))) {
        try { h.removeEntryAtIndex(i - 1); } catch (e) { /* yok say */ }
      }
    }
  }

  showError(code, desc, url) {
    this.set({ errorUrl: url, displayUrl: url, loading: false, security: 'error', title: urls.INTERNAL.hata.title });
    const q = new URLSearchParams({ code: String(code), desc: desc || '', url: url || '' });
    this.wc.loadURL(`vox://hata/?${q}`).catch(() => {});
  }

  onWindowOpen(d) {
    const web = urls.allowedInTab(d.url) && !urls.isInternal(d.url);
    // Kullanıcı tıklamadan açılmak istenen pencere engellenir (Chrome gibi); web adresiyse "Aç" seçeneğiyle bildirilir.
    if (!popups.allow(this)) {
      if (web) popups.blocked(this, d.url);
      return { action: 'deny' };
    }
    if (!web) {
      prompts.external(this.win, this, d.url, originOf(this.wc.getURL()));
      return { action: 'deny' };
    }
    const active = d.disposition !== 'background-tab';
    return {
      action: 'allow',
      outlivesOpener: true,
      createWindow: (options) => {
        const view = new WebContentsView({ webPreferences: { ...options.webPreferences, ...webPrefs(this.win) }, webContents: options.webContents });
        const tab = this.win.tabs.create({ view, url: d.url, active, openerId: this.id, adopt: true });
        return tab.wc;
      },
    };
  }

  reload(ignoreCache) {
    if (this.state.errorUrl) { this.load(this.state.errorUrl); return; }
    if (this.state.crashed) { this.load(this.state.url || urls.NEW_TAB); return; }
    if (ignoreCache) this.wc.reloadIgnoringCache(); else this.wc.reload();
  }
  stop() { this.wc.stop(); }
  back() { if (this.wc.navigationHistory.canGoBack()) this.wc.navigationHistory.goBack(); }
  forward() { if (this.wc.navigationHistory.canGoForward()) this.wc.navigationHistory.goForward(); }
  goToIndex(i) { this.wc.navigationHistory.goToIndex(i); }
  entries() {
    const h = this.wc.navigationHistory;
    return { index: h.getActiveIndex(), entries: h.getAllEntries().map((e) => ({ url: e.url, title: e.title })) };
  }
  setZoom(percent) {
    const z = Math.max(25, Math.min(500, Math.round(percent)));
    this.wc.setZoomFactor(z / 100);
    this.set({ zoom: z });
    this.win.send('zoom:changed', { tabId: this.id, zoom: z });
  }
  zoomBy(dir) {
    const z = this.state.zoom;
    if (dir === 0) return this.setZoom(100);
    const next = dir > 0 ? ZOOM_STEPS.find((x) => x > z) || 500 : [...ZOOM_STEPS].reverse().find((x) => x < z) || 25;
    return this.setZoom(next);
  }
  setMuted(on) { this.wc.setAudioMuted(!!on); this.set({ muted: !!on }); }
  find(text, opts = {}) {
    if (!text) { this.stopFind('clearSelection'); return; }
    const matchCase = !!opts.matchCase;
    // Dikkat: Electron'da findNext:true YENİ bir arama oturumu başlatır. Arayüzün "sonrakine git" isteği (opts.findNext)
    // aynı metin ve aynı büyük/küçük harf ayarıyla mevcut oturumda ilerler.
    const newSession = text !== this.findText || matchCase !== this.findCase || !opts.findNext;
    this.findText = text;
    this.findCase = matchCase;
    this.wc.findInPage(text, { forward: opts.forward !== false, matchCase, findNext: newSession });
  }
  stopFind(action = 'clearSelection') { this.findText = ''; this.wc.stopFindInPage(action); }
  savePage() { return tools.savePage(this); }
  thumbnail(width) { return tools.thumbnail(this, width); }
  pageText() { return tools.pageText(this); }
  contextAction(action, p) { return tools.contextAction(this, action, p); }
  destroy() {
    try { if (this.devtools) this.devtools.webContents.close(); } catch (e) { /* yok say */ }
    try { this.wc.close(); } catch (e) { /* yok say */ }
  }
}

class TabManager {
  constructor(win) {
    this.win = win;
    this.list = [];
    this.activeId = null;
    this.closed = [];
    this.groups = [];
    this.pending = false;
  }
  get(id) { return this.list.find((t) => t.id === id); }
  active() { return this.get(this.activeId); }
  byWebContents(wc) { return this.list.find((t) => t.wc === wc); }

  create(opts = {}) {
    const tab = new Tab(this.win, opts);
    let index = opts.index != null ? opts.index : this.list.length;
    if (opts.openerId && opts.index == null) {
      const oi = this.list.findIndex((t) => t.id === opts.openerId);
      if (oi >= 0) { index = oi + 1; while (index < this.list.length && this.list[index].state.openerId === opts.openerId) index++; }
    }
    const pinnedCount = this.list.filter((t) => t.state.pinned).length;
    if (!tab.state.pinned) index = Math.max(index, pinnedCount);
    else index = Math.min(index, pinnedCount);
    this.list.splice(Math.min(index, this.list.length), 0, tab);
    tab.view.setVisible(false);
    this.win.win.contentView.addChildView(tab.view);
    this.win.restack();
    if (!opts.adopt && Array.isArray(opts.entries) && opts.entries.length) {
      // Oturumu geri yükle: geri/ileri geçmişiyle birlikte
      const entries = opts.entries.filter((e) => e && urls.allowedInTab(e.url)).map((e) => ({ url: e.url, title: e.title || '' }));
      const index = Math.max(0, Math.min(entries.length - 1, Number(opts.navIndex) || entries.length - 1));
      tab.wc.navigationHistory.restore({ entries, index }).catch(() => tab.load(opts.url || urls.NEW_TAB));
    } else if (!opts.adopt && opts.url) tab.load(opts.url);
    if (opts.active !== false || !this.activeId) this.activate(tab.id, { focus: opts.focus });
    this.changed();
    return tab;
  }

  close(id) {
    const i = this.list.findIndex((t) => t.id === id);
    if (i < 0) return;
    const tab = this.list[i];
    // Geri açınca sabitleme, grup ve geri/ileri geçmişi de gelsin (geçmiş arayüze gönderilmez, yalnızca burada tutulur).
    this.closed.unshift({ url: tab.state.displayUrl || tab.state.url, title: tab.state.title, index: i, closedAt: Date.now(), favicon: tab.state.favicon,
      pinned: tab.state.pinned, groupId: tab.state.groupId, ...require('./session-store').entriesOf(tab) });
    this.closed = this.closed.slice(0, 25);
    this.list.splice(i, 1);
    closing.add(tab.wc);
    if (this.activeId === id) {
      const opener = tab.state.openerId && this.get(tab.state.openerId);
      const next = opener || this.list[i] || this.list[i - 1];
      this.activeId = null;
      if (next) this.activate(next.id);
    }
    try { this.win.win.contentView.removeChildView(tab.view); } catch (e) { /* yok say */ }
    if (tab.devtools) { try { this.win.win.contentView.removeChildView(tab.devtools); } catch (e) { /* yok say */ } }
    tab.destroy();
    this.changed();
    this.saveSession();
    if (!this.list.length) this.win.close();
  }

  /** opts.focus === false keeps keyboard focus in the browser UI. */
  activate(id, opts = {}) {
    const tab = this.get(id);
    if (!tab) return;
    const prev = this.active();
    if (prev && prev !== tab) {
      prev.view.setVisible(false);
      if (prev.devtools) prev.devtools.setVisible(false);
    }
    this.activeId = id;
    tab.state.lastActive = Date.now();
    tab.view.setVisible(!this.win.hideContent);
    this.layout();
    this.win.hud.status('');
    // Yeni sekmede klavye adres çubuğuna (arayüze) gider, diğer sekmelerde sayfaya.
    if (opts.focus !== false) {
      if (tab.state.internal && /yeni-sekme/.test(tab.state.url)) { this.win.focusUi(); tab.uiFocusOnLoad = true; } else tab.wc.focus();
    }
    this.changed();
  }

  /** Pinning moves the tab to the end of the pinned zone; unpinning to the start of the normal tabs (like Chrome). */
  pin(id, on) {
    const tab = this.get(id);
    if (!tab || tab.state.pinned === !!on) return;
    const others = this.list.filter((t) => t !== tab && t.state.pinned).length;
    tab.state.pinned = !!on;
    this.move(id, others);
  }

  move(id, toIndex) {
    const from = this.list.findIndex((t) => t.id === id);
    if (from < 0) return;
    const [t] = this.list.splice(from, 1);
    // Sabit sekmeler hep başta kalır: sabit sekme sabit bölgede, normal sekme normal bölgede taşınır.
    const pinned = this.list.filter((x) => x.state.pinned).length;
    const lo = t.state.pinned ? 0 : pinned;
    const hi = t.state.pinned ? pinned : this.list.length;
    this.list.splice(Math.max(lo, Math.min(Number(toIndex) || 0, hi)), 0, t);
    this.changed();
    this.saveSession();
  }

  layout() {
    const tab = this.active();
    if (!tab) return;
    const vp = this.win.viewport;
    if (this.win.htmlFullscreen === tab) {
      const b = this.win.win.getContentBounds();
      tab.view.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
    } else {
      tab.view.setBounds({ x: vp.x, y: vp.y, width: Math.max(0, vp.width), height: Math.max(0, vp.height) });
    }
    if (tab.devtools) {
      const r = this.win.devtoolsRect;
      if (r && tab.state.devtools) {
        tab.devtools.setVisible(true);
        tab.devtools.setBounds(r);
      } else tab.devtools.setVisible(false);
    }
  }

  /** Coalesces state updates into one 'tabs:state' message per tick. */
  changed() {
    if (this.pending) return;
    this.pending = true;
    setImmediate(() => {
      this.pending = false;
      this.win.send('tabs:state', this.snapshot());
      this.win.updateTitle();
    });
  }
  snapshot() {
    const closed = this.closed.slice(0, 10).map(({ entries, navIndex, ...c }) => c);
    return { tabs: this.list.map((t) => ({ ...t.state })), activeTabId: this.activeId, groups: this.groups, closed };
  }

  saveSession() {
    if (!this.win.private) require('./session-store').saveSoon(800);
  }
}

module.exports = { TabManager, Tab, webPrefs, isClosing: (wc) => closing.has(wc) };
