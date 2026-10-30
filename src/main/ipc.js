'use strict';
/* VoxBrowser — süreçler arası iletişim. Her kanalın bir kapsamı var:
   'ui'       → yalnızca bir pencerenin arayüz görünümü (uiView)
   'internal' → arayüz + vox:// iç sayfaların ana çerçevesi
   'hud'      → HUD görünümleri
   Gönderen her çağrıda doğrulanır; bilinmeyen kanal ya da yetkisiz gönderen reddedilir (Firefox: ebeveyn içeriğe güvenmez). */
const { ipcMain, app, clipboard, dialog, session, shell } = require('electron');
const store = require('./store');
const urls = require('./urls');
const search = require('./search');
const downloads = require('./downloads');
const permissions = require('./permissions');
const history = require('./history');
const sessions = require('./sessions');
const prompts = require('./prompts');
const W = require('./window');
const { comboOf, isReserved } = require('./keys');

/** webContents.id → abone olunan veri dilimleri */
const subs = new Map();
/** Testlerde (VOX_TEST) kullanıcının masaüstüne dokunan işlemler (diyalog, varsayılan tarayıcı, yeniden başlatma) yapılmaz. */
const TEST = !!process.env.VOX_TEST;

/* Ayrıcalıklı kanalları kullanabilen iç sayfalar (tarayıcı arayüzü hepsini kullanabilir). Bir iç sayfada bir açık bulunsa bile
   ör. geçmiş sayfası parolaları okuyamaz, indirme klasörünü değiştiremez, sertifika hatasını geçemez. */
const SETTINGS = ['ayarlar', 'hakkinda']; // vox://hakkinda, ayarlar sayfasının "hakkında" bölümü
const ERROR_PAGE = ['hata'];
const TASKS = ['surecler'];
/** What other internal pages may change (the settings page and the browser UI may change all writable data). */
const PAGE_WRITES = {
  'yeni-sekme': ['settings.ui.pages.newTab', 'settings.appearance.newTabBackground', 'settings.appearance.theme', 'shortcuts', 'readingList'],
  gecmis: ['history'],
  'yer-imleri': ['bookmarks'],
};
const fullAccess = (ctx) => ctx.kind === 'ui' || SETTINGS.includes(ctx.host);
const mayWrite = (ctx, path) => fullAccess(ctx) || (PAGE_WRITES[ctx.host] || []).some((p) => path === p || path.startsWith(`${p}.`));

function context(event) {
  const { win, tab } = W.fromWebContents(event.sender);
  if (win && !tab) return { kind: 'ui', win };
  if (win && tab) {
    const frame = event.senderFrame;
    const top = frame && frame === event.sender.mainFrame;
    const internal = top && /^vox:\/\//i.test(frame.url);
    let host = '';
    if (internal) { try { host = new URL(frame.url).host.toLowerCase(); } catch (e) { /* yok say */ } }
    return { kind: internal ? 'internal' : 'page', win, tab, host };
  }
  for (const w of W.windows.values()) if (w.hud.owns(event.sender)) return { kind: 'hud', win: w };
  return { kind: 'none' };
}

/** hosts: for 'internal' channels, the vox:// pages that may call it besides the browser UI (default: all of them). */
function handle(channel, scope, fn, hosts) {
  ipcMain.handle(channel, async (event, payload) => {
    const ctx = context(event);
    const ok = scope === 'ui' ? ctx.kind === 'ui'
      : scope === 'internal' ? ctx.kind === 'ui' || (ctx.kind === 'internal' && (!hosts || hosts.includes(ctx.host)))
        : ctx.kind === scope;
    if (!ok) {
      if (ctx.kind === 'none' && (event.sender.isDestroyed() || require('./tabs').isClosing(event.sender))) return null; // sekme kapanırken gelen geç istek
      throw new Error(`Yetkisiz IPC çağrısı: ${channel}`);
    }
    return fn(payload && typeof payload === 'object' ? payload : {}, ctx, event);
  });
}

const str = (v, max = 4096) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const rect = (r) => (r && typeof r === 'object' ? { x: num(r.x), y: num(r.y), width: num(r.width), height: num(r.height) } : null);

function tabOf(ctx, p) { return (p.tabId && ctx.win.tabs.get(str(p.tabId, 40))) || ctx.tab || ctx.win.tabs.active(); }

function broadcast(slice, value) {
  for (const w of W.windows.values()) {
    const targets = [w.ui.webContents, ...w.tabs.list.map((t) => t.wc)];
    for (const wc of targets) {
      if (wc.isDestroyed() || wc.isCrashed()) continue;
      const s = subs.get(wc.id);
      if (s && s.has(slice)) wc.send('data:changed', { slice, value });
    }
  }
}

async function clearBrowsing({ since = 0, types = [] }, partition = 'persist:vox') {
  const ses = session.fromPartition(partition);
  const t = new Set(types);
  if (t.has('history')) history.clear(since);
  if (t.has('downloads')) store.update('downloads', (l = []) => l.filter((d) => d.state === 'in_progress' || (since && d.startedAt < since)), 'main');
  if (t.has('cache')) await ses.clearCache();
  if (t.has('cookies')) await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql', 'filesystem', 'shadercache'] });
  if (t.has('passwords')) store.set('passwords', [], 'main');
  if (t.has('permissions')) store.set('permissions', {}, 'main');
  if (t.has('autofill')) store.set('settings.autofillData', {}, 'main');
  return true;
}

function register() {
  store.subscribe((slice, value) => broadcast(slice, value));

  // Geliştirici araçlarının Türkçe (ve diğer) dil dosyaları: yalnızca bizim DevTools görünümlerimiz isteyebilir.
  ipcMain.handle('devtools:locale', (event, locale) => {
    const ours = [...W.windows.values()].some((w) => w.tabs.list.some((t) => t.devtools && t.devtools.webContents === event.sender));
    if (!ours || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(String(locale))) return null;
    try { return require('fs').readFileSync(require('path').join(__dirname, '..', 'devtools', 'locales', `${locale}.json`), 'utf8'); } catch (e) { return null; }
  });

  // Sayfanın kullanmadığı kısayol (önce sayfa, sonra tarayıcı). Yalnızca etkin sekmeden, kayıtlı ve ayrılmamış kısayollar.
  ipcMain.on('page:key', (event, ev) => {
    const { win, tab } = W.fromWebContents(event.sender);
    if (!win || !tab || win.tabs.activeId !== tab.id || !ev || typeof ev !== 'object') return;
    const combo = comboOf({ key: str(ev.key, 30), code: str(ev.code, 30), control: !!ev.control, meta: !!ev.meta, alt: !!ev.alt, shift: !!ev.shift });
    if (win.keys.has(combo) && !isReserved(combo)) win.runShortcut(combo, tab);
  });

  /* ── Ortak (arayüz + iç sayfalar) ─────────────────────── */
  handle('data:subscribe', 'internal', (p, ctx, event) => {
    // Kayıtlı parolalar yalnızca arayüze ve ayarlar sayfasına gider.
    const slices = (Array.isArray(p.slices) ? p.slices : []).filter((s) => store.SLICES.includes(s) && (s !== 'passwords' || fullAccess(ctx)));
    const id = event.sender.id;
    if (!subs.has(id)) { subs.set(id, new Set()); event.sender.once('destroyed', () => subs.delete(id)); }
    slices.forEach((s) => subs.get(id).add(s));
    const snap = store.snapshot(slices);
    if (ctx.kind === 'internal') snap.window = { private: !!ctx.win.private }; // ör. gizli pencerenin yeni sekmesi
    return snap;
  });
  handle('data:set', 'internal', (p, ctx) => {
    const path = str(p.path, 200);
    const slice = path.split('.')[0];
    if (!store.WRITABLE.has(slice)) throw new Error(`Bu veri doğrudan yazılamaz: ${slice}`);
    if (!mayWrite(ctx, path)) throw new Error(`Bu sayfa bu veriyi değiştiremez: ${path}`);
    store.set(path, p.value, 'renderer');
    return true; // ayarların ana süreçteki etkileri main.js'teki izleyicide uygulanır (görünümler dilimi bütün olarak yazar)
  });
  handle('tabs:create', 'internal', (p, ctx) => {
    const url = urls.fromInput(str(p.url || p.input)) || urls.NEW_TAB;
    if (!urls.allowedInTab(url)) return null;
    const t = ctx.win.tabs.create({ url, active: p.active !== false, index: p.index, pinned: !!p.pinned, groupId: p.groupId || null, openerId: p.openerId || (ctx.tab && ctx.tab.id) || null, focus: p.focus !== false });
    return t.id;
  });
  handle('tabs:navigate', 'internal', (p, ctx) => {
    const tab = tabOf(ctx, p);
    const url = urls.fromInput(str(p.input || p.url));
    if (!tab || !url) return false;
    if (ctx.kind === 'internal' && tab !== ctx.tab) return false;
    // mailto:/tel: gibi adresler: kullanıcı adres çubuğuna yazdıysa doğrudan, iç sayfadan geldiyse sorarak uygulamada açılır.
    if (prompts.externalScheme(url)) return ctx.kind === 'ui' ? prompts.openTyped(url) : prompts.external(ctx.win, tab, url, 'VoxBrowser');
    tab.load(url);
    // focus:false → odak arayüzde kalır (ör. Voxi'de art arda komut yazarken).
    if (ctx.kind === 'ui' && !urls.isInternal(url) && p.focus !== false) tab.wc.focus();
    return true;
  });
  // Varsayılan değerler (ayarları sıfırlamak için) ve tarayıcı önbelleğinin gerçek boyutu.
  handle('data:defaults', 'internal', (p) => { const slice = str(p.slice, 40); return store.WRITABLE.has(slice) ? require('./defaults')()[slice] : null; }, SETTINGS);
  handle('data:cacheSize', 'internal', (p, ctx) => session.fromPartition(ctx.win.partition).getCacheSize(), SETTINGS);
  handle('downloads:action', 'internal', (p) => downloads.action(str(p.id, 60), str(p.action, 20)), ['indirilenler']);
  handle('app:info', 'internal', () => ({
    name: app.getName(), version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
    node: process.versions.node, v8: process.versions.v8, platform: process.platform, arch: process.arch,
    locale: app.getLocale(), userData: app.getPath('userData'), packaged: app.isPackaged,
    // Varsayılan tarayıcı olabilmek için kurulumun Windows'a tarayıcı kaydı yapması gerekir (sonraki sürüm).
    defaultBrowserReady: false,
  }), SETTINGS);
  handle('clipboard:write', 'internal', (p) => {
    // Testlerde sistem panosu (RDP ile kullanıcının bilgisayarına da yansır) değiştirilmez.
    if (TEST) { global.__voxClipboard = str(p.text, 100000); return true; }
    clipboard.writeText(str(p.text, 100000));
    return true;
  });
  handle('data:clearBrowsing', 'internal', (p, ctx) => clearBrowsing({ since: num(p.since), types: Array.isArray(p.types) ? p.types.map((x) => str(x, 20)) : [] }, ctx.win.partition), SETTINGS);
  handle('dialog:folder', 'internal', async (p, ctx) => {
    if (TEST) return require('path').join(app.getPath('userData'), 'secilen-klasor');
    const r = await dialog.showOpenDialog(ctx.win.win, { title: 'Klasör seçin', defaultPath: str(p.defaultPath) || app.getPath('downloads'), properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  }, SETTINGS);
  handle('system:metrics', 'internal', (p, ctx) => {
    const metrics = app.getAppMetrics();
    const byPid = new Map(metrics.map((m) => [m.pid, m]));
    const tabs = [];
    for (const w of W.windows.values()) {
      // Başka bir gizli pencerenin sekmeleri görev yöneticisinde adres ve başlık olmadan görünür.
      const hidden = w.private && w !== ctx.win;
      for (const t of w.tabs.list) {
        let pid = 0;
        try { pid = t.wc.getOSProcessId(); } catch (e) { /* çökmüş sekme */ }
        tabs.push({ tabId: t.id, windowId: w.id, title: hidden ? 'Gizli sekme' : t.state.title, url: hidden ? '' : t.state.url, pid, crashed: t.state.crashed, private: !!w.private });
      }
    }
    const views = [];
    const pidOf = (wc) => { try { return wc && !wc.isDestroyed() ? wc.getOSProcessId() : 0; } catch (e) { return 0; } };
    for (const w of W.windows.values()) {
      views.push({ pid: pidOf(w.ui.webContents), kind: 'ui', windowId: w.id });
      for (const h of [w.hud.statusView, w.hud.toastView]) if (h) views.push({ pid: pidOf(h.webContents), kind: 'hud', windowId: w.id });
      for (const t of w.tabs.list) if (t.devtools) views.push({ pid: pidOf(t.devtools.webContents), kind: 'devtools', windowId: w.id, tabId: t.id });
    }
    return { at: Date.now(), views, processes: metrics.map((m) => ({ pid: m.pid, type: m.type, serviceName: m.serviceName, name: m.name, cpu: m.cpu.percentCPUUsage, memory: m.memory.workingSetSize, privateMemory: m.memory.privateBytes, sandboxed: m.sandboxed, integrity: m.integrityLevel })), tabs, pids: [...byPid.keys()] };
  }, [...TASKS, ...SETTINGS]);
  handle('tabs:crash', 'internal', (p, ctx) => {
    for (const w of W.windows.values()) {
      const t = w.tabs.get(str(p.tabId, 40));
      if (t) { t.wc.forcefullyCrashRenderer(); return true; }
    }
    return false;
  }, TASKS);
  handle('permissions:reset', 'internal', (p) => {
    store.update('permissions', (all = {}) => { const n = { ...all }; delete n[str(p.origin, 300)]; return n; }, 'main');
    return true;
  }, SETTINGS);
  handle('security:allowHttp', 'internal', (p) => { sessions.allowHttp(str(p.host, 300)); return true; }, ERROR_PAGE);
  // Hata sayfası için: Chromium'un o sunucu için gördüğü son sertifika (kim vermiş, geçerlilik tarihleri, sonuç).
  handle('security:certInfo', 'internal', (p) => sessions.certFor(str(p.host, 300).replace(/:\d+$/, '')), ERROR_PAGE);
  handle('security:allowCert', 'internal', (p) => sessions.allowCert(str(p.host, 300)), ERROR_PAGE);
  handle('defaultBrowser:get', 'internal', () => ({ http: app.isDefaultProtocolClient('http'), https: app.isDefaultProtocolClient('https') }), SETTINGS);
  handle('defaultBrowser:set', 'internal', async () => {
    if (TEST) return false;
    app.setAsDefaultProtocolClient('http');
    app.setAsDefaultProtocolClient('https');
    if (process.platform === 'win32') await shell.openExternal('ms-settings:defaultapps');
    return true;
  }, SETTINGS);
  handle('app:quit', 'ui', () => { app.quit(); return true; });
  handle('app:relaunch', 'internal', () => { if (TEST) return false; app.relaunch(); app.quit(); return true; }, SETTINGS);

  /* ── Yalnızca arayüz ──────────────────────────────────── */
  handle('ui:ready', 'ui', (p, ctx) => {
    ctx.win.keys = new Set((Array.isArray(p.keys) ? p.keys : []).map((k) => str(k, 40)));
    ctx.win.tabs.changed(); // arayüz yeniden yüklendiyse (çökme sonrası) sekme listesini tazele
    return { windowId: ctx.win.id, private: ctx.win.private, platform: process.platform, ...ctx.win.tabs.snapshot() };
  });
  handle('keys:register', 'ui', (p, ctx) => { ctx.win.keys = new Set((Array.isArray(p.keys) ? p.keys : []).map((k) => str(k, 40))); return true; });
  handle('layout:viewport', 'ui', (p, ctx) => { const r = rect(p); if (r) ctx.win.setViewport(r); return true; });
  handle('layout:devtools', 'ui', (p, ctx) => { ctx.win.setDevtoolsRect(p && p.width ? rect(p) : null); return true; });
  handle('ui:raise', 'ui', (p, ctx) => { ctx.win.setRaised(!!p.on); return true; });
  handle('ui:contentHidden', 'ui', (p, ctx) => { ctx.win.setContentHidden(!!p.on); return true; });
  handle('tabs:close', 'ui', (p, ctx) => { ctx.win.tabs.close(str(p.tabId, 40)); return true; });
  handle('tabs:activate', 'internal', (p, ctx) => { ctx.win.tabs.activate(str(p.tabId, 40)); return true; }, TASKS);
  handle('tabs:move', 'ui', (p, ctx) => { ctx.win.tabs.move(str(p.tabId, 40), num(p.index)); return true; });
  handle('tabs:update', 'ui', (p, ctx) => {
    const t = tabOf(ctx, p);
    if (!t) return false;
    if ('muted' in p) t.setMuted(!!p.muted);
    if ('pinned' in p) ctx.win.tabs.pin(t.id, !!p.pinned);
    const patch = {};
    if ('groupId' in p) patch.groupId = p.groupId ? str(p.groupId, 40) : null;
    if (Object.keys(patch).length) t.set(patch);
    return true;
  });
  handle('tabs:groups', 'ui', (p, ctx) => { ctx.win.tabs.groups = Array.isArray(p.groups) ? p.groups.slice(0, 100) : []; ctx.win.tabs.changed(); return true; });
  handle('tabs:duplicate', 'ui', (p, ctx) => { const t = tabOf(ctx, p); return t ? ctx.win.tabs.create({ url: t.state.displayUrl || t.state.url, openerId: t.id }).id : null; });
  handle('tabs:reload', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) t.reload(!!p.ignoreCache); return true; });
  handle('tabs:stop', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) t.stop(); return true; });
  handle('tabs:back', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) t.back(); return true; });
  handle('tabs:forward', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) t.forward(); return true; });
  handle('tabs:goto', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) t.goToIndex(num(p.index)); return true; });
  handle('tabs:entries', 'ui', (p, ctx) => { const t = tabOf(ctx, p); return t ? t.entries() : { index: 0, entries: [] }; });
  handle('tabs:zoom', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (!t) return 100; if ('zoom' in p) t.setZoom(num(p.zoom, 100)); else t.zoomBy(num(p.dir)); return t.state.zoom; });
  handle('tabs:reopen', 'ui', (p, ctx) => {
    // closedAt verilirse o kayıt (sekme aramasındaki "son kapatılanlar"), yoksa en son kapatılan.
    const list = ctx.win.tabs.closed;
    const i = p.closedAt ? list.findIndex((c) => c.closedAt === num(p.closedAt)) : 0;
    const c = i >= 0 ? list.splice(i, 1)[0] : null;
    if (!c) return null;
    return ctx.win.tabs.create({ url: c.url, title: c.title, index: c.index, pinned: !!c.pinned, groupId: c.groupId || null, entries: c.entries, navIndex: c.navIndex }).id;
  });
  handle('tabs:focusPage', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) t.wc.focus(); return true; });
  handle('find:start', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) t.find(str(p.text, 500), { forward: p.forward !== false, matchCase: !!p.matchCase, findNext: !!p.findNext }); return true; });
  handle('find:stop', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) t.stopFind(str(p.action, 30) || 'clearSelection'); return true; });
  handle('devtools:toggle', 'ui', (p, ctx) => {
    const t = tabOf(ctx, p);
    if (!t) return false;
    if (t.state.devtools) ctx.win.devtoolsClose(t); else ctx.win.devtoolsOpen(t);
    return t.state.devtools;
  });
  handle('devtools:open', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) ctx.win.devtoolsOpen(t, p.inspect ? { inspect: { x: num(p.inspect.x), y: num(p.inspect.y) } } : {}); return true; });
  handle('devtools:close', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) ctx.win.devtoolsClose(t); return true; });
  handle('context:action', 'ui', (p, ctx) => { const t = tabOf(ctx, p); if (t) t.contextAction(str(p.action, 40), p.params || {}); return true; });
  handle('permission:respond', 'ui', (p) => permissions.respond(str(p.id, 40), p.decision === 'allow' ? 'allow' : 'block', p.remember !== false));
  handle('search:suggest', 'ui', (p) => search.suggest(str(p.q, 300)));
  handle('search:url', 'ui', (p) => urls.fromInput(str(p.input, 2000)));
  handle('window:action', 'ui', (p, ctx) => { ctx.win.action(str(p.action, 20)); return true; });
  handle('window:new', 'ui', (p) => {
    // İsteğe bağlı adres: "Bağlantıyı yeni (gizli) pencerede aç". İç sayfalar yalnızca boş yeni pencere olarak açılır.
    const url = p.url ? urls.fromInput(str(p.url)) : null;
    const tabs = url && urls.allowedInTab(url) && !urls.isInternal(url) ? [{ url }] : undefined;
    require('./launcher').open({ private: !!p.private, tabs });
    return true;
  });
  handle('ui:edit', 'ui', (p, ctx) => { ctx.win.uiEdit(str(p.action, 30), str(p.word, 100)); return true; });
  handle('prompt:respond', 'ui', (p, ctx) => {
    const v = p.value && typeof p.value === 'object' ? { username: p.value.username == null ? undefined : str(p.value.username, 500), password: str(p.value.password, 500), allow: !!p.value.allow } : null;
    return prompts.answer(str(p.id, 60), v, ctx.win.id);
  });
  handle('page:text', 'ui', async (p, ctx) => { const t = tabOf(ctx, p); return t ? t.pageText() : null; });
  handle('tabs:capture', 'ui', async (p, ctx) => {
    const t = tabOf(ctx, p);
    if (!t) return null;
    let memory = null;
    try {
      const pid = t.wc.getOSProcessId();
      const m = app.getAppMetrics().find((x) => x.pid === pid);
      if (m) memory = m.memory.workingSetSize;
    } catch (e) { /* çökmüş sekme */ }
    return { image: await t.thumbnail(Math.max(120, Math.min(640, num(p.width, 320)))), memory };
  });
  handle('site:info', 'ui', async (p, ctx) => {
    const t = tabOf(ctx, p);
    if (!t) return null;
    let u;
    try { u = new URL(t.state.displayUrl || t.state.url); } catch (e) { return null; }
    const web = /^https?:$/.test(u.protocol);
    let cookies = 0;
    if (web) { try { cookies = (await t.wc.session.cookies.get({ url: u.origin })).length; } catch (e) { /* yok say */ } }
    return {
      origin: web ? u.origin : '', host: u.host, scheme: u.protocol.replace(':', ''), security: t.state.security,
      cert: u.protocol === 'https:' ? sessions.certFor(u.hostname) : null, cookies,
      permissions: web ? (store.get('permissions') || {})[u.origin] || {} : {}, httpAllowed: sessions.isHttpAllowed(u.host),
    };
  });
  handle('site:clear', 'ui', async (p, ctx) => {
    const t = tabOf(ctx, p);
    if (!t) return false;
    let origin = '';
    try { origin = new URL(t.state.displayUrl || t.state.url).origin; } catch (e) { return false; }
    if (!/^https?:/.test(origin)) return false;
    await t.wc.session.clearStorageData({ origin });
    return true;
  });
  handle('hud:toast', 'ui', (p, ctx) => { ctx.win.hud.toast({ id: str(p.id, 60), text: str(p.text, 400), title: str(p.title, 120), icon: str(p.icon, 40), tone: str(p.tone, 20), action: p.action ? { label: str(p.action.label, 60) } : null, duration: num(p.duration, 3800) }); return true; });

  /* ── HUD ──────────────────────────────────────────────── */
  handle('hud:size', 'hud', (p, ctx) => { ctx.win.hud.setToastHeight(num(p.height)); return true; });
  handle('hud:action', 'hud', (p, ctx) => {
    const id = str(p.id, 60);
    if (id.startsWith('popup:')) return require('./popups').open(ctx.win, id); // "Açılır pencere engellendi" → Aç
    ctx.win.send('hud:action', { id });
    return true;
  });
}

module.exports = { register, clearBrowsing };
