'use strict';
/* VoxBrowser — pencere: çerçevesiz BaseWindow + tam pencere arayüz görünümü (uiView) + sekme görünümleri.
   Katman sırası (alttan üste): uiView, sekmeler, DevTools, HUD (bildirim/durum balonu).
   Menü ya da açılır panel açıkken arayüz en üste alınır (setRaised), böylece katmanlar sayfanın üstünde görünür. */
const fs = require('fs');
const path = require('path');
const { app, BaseWindow, WebContentsView, nativeTheme, nativeImage, screen } = require('electron');
const { TabManager } = require('./tabs');
const { Hud } = require('./hud');
const { comboOf, isReserved } = require('./keys');
const store = require('./store');
const urls = require('./urls');
const sessionStore = require('./session-store');

/** Arayüz vox://ui/ protokolünden sunulur (src/ui); paketli sürümde file:// ayrıcalıkları kapalıdır. */
const UI_URL = 'vox://ui/index.html';
const PRELOAD_UI = path.join(__dirname, '..', 'preload', 'ui.js');
const PRELOAD_DEVTOOLS = path.join(__dirname, '..', 'preload', 'devtools.js');
const ICON = path.join(__dirname, '..', '..', 'build', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const windows = new Map();
let nextId = 1;

class VoxWindow {
  constructor(opts = {}) {
    this.id = nextId++;
    this.private = !!opts.private;
    this.partition = this.private ? `vox-private-${this.id}` : 'persist:vox';
    this.viewport = { x: 0, y: 0, width: 0, height: 0 };
    this.devtoolsRect = null;
    this.raised = false;
    this.hideContent = false;
    this.htmlFullscreen = null;
    this.closing = false;
    this.keys = new Set();
    require('./sessions').forPartition(this.partition);
    const dark = nativeTheme.shouldUseDarkColors || store.get('settings.appearance.theme') === 'dark' || this.private;
    const b = { ...(sessionStore.visibleBounds(opts.bounds) || {}) };
    if (process.env.VOX_TEST_OFFSCREEN) Object.assign(b, { x: -3600, y: 80, width: b.width || 1360, height: b.height || 860, maximized: false });
    const winOpts = {
      width: b.width || 1360, height: b.height || 860, x: b.x, y: b.y,
      minWidth: 420, minHeight: 360, frame: false, show: false, title: this.private ? 'VoxBrowser — Gizli' : 'VoxBrowser',
      backgroundColor: dark ? '#0D1611' : '#E5EFE3',
    };
    if (fs.existsSync(ICON)) winOpts.icon = nativeImage.createFromPath(ICON);
    this.win = new BaseWindow(winOpts);
    if (b.maximized) this.win.maximize();
    this.ui = new WebContentsView({ webPreferences: { preload: PRELOAD_UI, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true, backgroundThrottling: false } });
    this.ui.setBackgroundColor('#00000000');
    this.win.contentView.addChildView(this.ui);
    this.hud = new Hud(this);
    this.tabs = new TabManager(this);
    if (Array.isArray(opts.groups)) this.tabs.groups = opts.groups;
    this.shortcuts ={ handle: (e, input, tab) => this.handleKey(e, input, tab) };
    this.bindWindow();
    this.bindUi();
    windows.set(this.id, this);
    this.initialTabs = opts.tabs || [{ url: urls.NEW_TAB }];
    this.ui.webContents.loadURL(`${UI_URL}?win=${this.id}&private=${this.private ? 1 : 0}`);
  }

  send(channel, payload) {
    const wc = this.ui && this.ui.webContents;
    if (wc && !wc.isDestroyed()) wc.send(channel, payload);
  }
  /** Taskbar / Alt+Tab title follows the active tab. */
  updateTitle() {
    if (this.win.isDestroyed()) return;
    const t = this.tabs.active();
    const name = this.private ? 'VoxBrowser — Gizli' : 'VoxBrowser';
    const title = t && t.state.title ? `${t.state.title} — ${name}` : name;
    if (this.win.getTitle() !== title) this.win.setTitle(title);
  }
  focusUi() { if (!this.ui.webContents.isDestroyed()) this.ui.webContents.focus(); }
  layoutUi() {
    const b = this.win.getContentBounds();
    this.ui.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
    this.hud.layout();
  }
  restack() {
    const cv = this.win.contentView;
    if (this.raised) cv.addChildView(this.ui); else cv.addChildView(this.ui, 0);
    for (const t of this.tabs.list) if (t.devtools) cv.addChildView(t.devtools);
    if (this.htmlFullscreen) cv.addChildView(this.htmlFullscreen.view);
    this.hud.restack();
  }
  setRaised(on) {
    if (this.raised === !!on) return;
    this.raised = !!on;
    if (on) this.hud.status(''); // sayfadaki bağlantı balonu menü/diyalog açıkken kalmasın
    this.restack();
  }
  setViewport(r) {
    this.viewport = { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(0, Math.round(r.width)), height: Math.max(0, Math.round(r.height)) };
    this.tabs.layout();
    this.hud.layout();
  }
  setDevtoolsRect(r) {
    this.devtoolsRect = r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(0, Math.round(r.width)), height: Math.max(0, Math.round(r.height)) } : null;
    this.tabs.layout();
  }
  setContentHidden(on) {
    this.hideContent = !!on;
    const t = this.tabs.active();
    if (t) t.view.setVisible(!on);
  }

  bindWindow() {
    const w = this.win;
    const state = () => this.send('window:state', { maximized: w.isMaximized(), fullscreen: w.isFullScreen(), focused: w.isFocused(), private: this.private, id: this.id });
    w.on('resize', () => { this.layoutUi(); if (!this.private) sessionStore.saveSoon(1200); });
    w.on('move', () => { if (!this.private) sessionStore.saveSoon(1200); });
    w.on('focus', () => { this.focusedAt = Date.now(); });
    ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur'].forEach((ev) => w.on(ev, state));
    w.on('close', () => {
      this.closing = true;
      sessionStore.windowClosing(this);
    });
    w.on('closed', () => {
      for (const t of this.tabs.list) t.destroy();
      this.hud.destroy();
      try { this.ui.webContents.close(); } catch (e) { /* yok say */ }
      windows.delete(this.id);
    });
    this.layoutUi();
  }

  bindUi() {
    const wc = this.ui.webContents;
    wc.on('will-navigate', (e) => e.preventDefault());
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) this.tabs.create({ url });
      return { action: 'deny' };
    });
    wc.on('before-input-event', (e, input) => {
      // Arayüzdeyken de geliştirici araçları gibi kısayollar çalışsın (Electron menüsü yok).
      if (input.type === 'keyDown' && input.key === 'F5' && !app.isPackaged && input.control && input.shift) wc.reload();
    });
    wc.once('did-finish-load', () => {
      for (const t of this.initialTabs) this.tabs.create(t);
      const act = this.initialTabs.findIndex((t) => t.active);
      if (act >= 0 && this.tabs.list[act]) this.tabs.activate(this.tabs.list[act].id);
      this.win.show();
      const first = this.tabs.active();
      if (first && /^vox:\/\/yeni-sekme/.test(first.state.url)) this.focusUi(); // açılışta yazmaya hazır adres çubuğu
      this.send('window:state', { maximized: this.win.isMaximized(), fullscreen: this.win.isFullScreen(), focused: true, private: this.private, id: this.id });
    });
    wc.on('render-process-gone', () => { if (!this.closing) wc.reload(); });
    // Arayüzün kendi metin alanları (adres çubuğu, bul, Voxi) için düzenleme menüsü; çizimi arayüz yapar.
    wc.on('context-menu', (e, p) => {
      if (!p.isEditable && !p.selectionText) return;
      this.send('ui:context-menu', {
        x: p.x, y: p.y, isEditable: p.isEditable, selectionText: p.selectionText, editFlags: p.editFlags,
        misspelledWord: p.misspelledWord, dictionarySuggestions: p.dictionarySuggestions,
      });
    });
  }
  /** Edit commands for the UI's own text fields (from the UI's edit menu). */
  uiEdit(action, word) {
    const wc = this.ui.webContents;
    const acts = { cut: () => wc.cut(), copy: () => wc.copy(), paste: () => wc.paste(), pasteAsPlain: () => wc.pasteAndMatchStyle(), undo: () => wc.undo(), redo: () => wc.redo(), selectAll: () => wc.selectAll(), delete: () => wc.delete(), replaceMisspelling: () => wc.replaceMisspelling(String(word || '')), addToDictionary: () => wc.session.addWordToSpellCheckerDictionary(String(word || '')) };
    if (acts[action]) acts[action]();
  }

  handleKey(e, input, tab) {
    if (input.type !== 'keyDown') return;
    const combo = comboOf(input);
    if (combo === 'Escape' && this.htmlFullscreen === tab) return;
    if (!this.keys.has(combo)) return;
    // Chrome gibi: sekme/pencere kısayolları hemen tarayıcıya gider; diğerlerini (Ctrl+F, Ctrl+K, Ctrl+S…) önce web sayfası
    // kullanabilir. Sayfa olayı kullanmazsa sekmenin önyükleme betiği 'page:key' ile bildirir (runShortcut).
    if (tab && this.pageFirst(tab) && !isReserved(combo)) return;
    e.preventDefault();
    this.runShortcut(combo, tab);
  }
  /** Web pages (and our vox:// pages) get the first chance at non-reserved shortcuts; crashed tabs can't answer. */
  pageFirst(tab) {
    return !tab.state.crashed && /^(https?|vox|file|data):/i.test(tab.wc.getURL());
  }
  /** Keys typed inside DevTools: browser-reserved shortcuts still work; DevTools keeps its own (Ctrl+F, Ctrl+Shift+C/J…). */
  handleDevtoolsKey(e, input, tab) {
    if (input.type !== 'keyDown') return;
    const combo = comboOf(input);
    if (!this.keys.has(combo) || !isReserved(combo) || combo === 'Ctrl+Shift+C' || combo === 'Ctrl+Shift+J') return;
    e.preventDefault();
    this.runShortcut(combo, tab);
  }
  runShortcut(combo, tab) {
    this.focusUi();
    this.send('shortcut', { combo, tabId: tab && tab.id });
  }

  /* ── DevTools: her sekmenin kendi DevTools görünümü, arayüzün ayırdığı alana yerleşir ── */
  devtoolsOpen(tab, opts = {}) {
    if (!tab.devtools) {
      // DevTools ön yüzü (Chromium'un kendi kodu) Türkçe dil dosyasını önyükleme betiğinden alır; bkz. preload/devtools.js
      tab.devtools = new WebContentsView({ webPreferences: { preload: PRELOAD_DEVTOOLS, contextIsolation: false, sandbox: true, nodeIntegration: false } });
      tab.devtools.setVisible(false);
      // Odak geliştirici araçlarındayken de F12 / Ctrl+Shift+I (kapat) ve sekme/pencere kısayolları çalışsın.
      tab.devtools.webContents.on('before-input-event', (e, input) => this.handleDevtoolsKey(e, input, tab));
      this.win.contentView.addChildView(tab.devtools);
      tab.wc.setDevToolsWebContents(tab.devtools.webContents);
      tab.wc.openDevTools({ mode: 'detach', activate: true });
      this.restack();
    } else if (!tab.wc.isDevToolsOpened()) {
      tab.wc.openDevTools({ mode: 'detach', activate: true });
    }
    if (opts.inspect) tab.wc.inspectElement(opts.inspect.x, opts.inspect.y);
    tab.set({ devtools: true });
    this.tabs.layout();
  }
  devtoolsClose(tab) {
    if (tab.wc.isDevToolsOpened()) tab.wc.closeDevTools();
    this.devtoolsClosed(tab);
  }
  devtoolsClosed(tab) {
    if (!tab.devtools) return;
    const v = tab.devtools;
    tab.devtools = null;
    try { this.win.contentView.removeChildView(v); } catch (e) { /* yok say */ }
    try { v.webContents.close(); } catch (e) { /* yok say */ }
    tab.set({ devtools: false });
  }

  setHtmlFullscreen(tab, on) {
    this.htmlFullscreen = on ? tab : null;
    this.win.setFullScreen(!!on);
    this.restack();
    this.tabs.layout();
    this.send('window:state', { maximized: this.win.isMaximized(), fullscreen: !!on, focused: true, private: this.private, id: this.id });
  }

  action(a) {
    const w = this.win;
    if (a === 'minimize') w.minimize();
    else if (a === 'maximize') { if (w.isMaximized()) w.unmaximize(); else w.maximize(); }
    else if (a === 'close') w.close();
    else if (a === 'fullscreen') w.setFullScreen(!w.isFullScreen());
  }
  focus() { if (this.win.isMinimized()) this.win.restore(); this.win.focus(); }
  close() { if (!this.win.isDestroyed()) this.win.close(); }

  /** Writes the session file now (all regular windows). */
  saveSession(sync) { sessionStore.save({ sync: !!sync }); }
}

module.exports = {
  VoxWindow,
  windows,
  readSession: sessionStore.read,
  fromWebContents(wc) {
    for (const w of windows.values()) {
      if (w.ui.webContents === wc) return { win: w, tab: null };
      const t = w.tabs.byWebContents(wc);
      if (t) return { win: w, tab: t };
    }
    return { win: null, tab: null };
  },
  focused() {
    for (const w of windows.values()) if (w.win.isFocused()) return w;
    return windows.values().next().value || null;
  },
  screen,
};
