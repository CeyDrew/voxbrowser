'use strict';
/* VoxBrowser — ana süreç giriş noktası.
   Güvenlik varsayılanları: tüm görünümler sandbox'lı ve bağlam yalıtımlı, Node.js yalnızca ana süreçte,
   webview etiketi kapalı, vox:// ayrıcalıklı ve web sayfalarından erişilemez. */
const { app, protocol, Menu, crashReporter } = require('electron');

if (process.env.VOX_USER_DATA) app.setPath('userData', process.env.VOX_USER_DATA);
if (process.env.VOX_TEST_OFFSCREEN) {
  // Ekran dışındaki test penceresinde de sayfalar çizilsin (pencere örtülme takibi kapalı).
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
}
if (process.env.VOX_TEST) process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

protocol.registerSchemesAsPrivileged([
  { scheme: 'vox', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true, codeCache: true } },
]);
app.enableSandbox();
// Çökme dökümleri yalnızca yerelde tutulur (userData/Crashpad); hiçbir yere gönderilmez.
crashReporter.start({ productName: 'VoxBrowser', uploadToServer: false, compress: true });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  boot();
}

function boot() {
  const store = require('./store');
  store.init();
  // Uzak Masaüstü'nde "Sisteme göre" animasyon ayarı Windows'un kapattığı animasyonları yine gösterir (her açılışta güncel).
  store.set('settings.a11y.remoteSession', require('./defaults').isRemoteSession(), 'main');
  if (store.get('settings.system.hardwareAccel') === false) app.disableHardwareAcceleration();

  // Windows'taki diğer tarayıcılar gibi orta tıkla otomatik kaydırma; "yumuşak kaydırma" ayarı kapalıysa Chromium'a bildir.
  app.commandLine.appendSwitch('enable-blink-features', 'MiddleClickAutoscroll');
  if (store.get('settings.appearance.smoothScroll') === false) app.commandLine.appendSwitch('disable-smooth-scrolling');
  app.setAppUserModelId('com.voxbrowser.app');
  // Sitelerin "desteklenmeyen tarayıcı" uyarısı vermemesi için Electron/uygulama işaretlerini kullanıcı aracısından çıkar.
  app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|voxbrowser|VoxBrowser)\/\S+/g, '');
  Menu.setApplicationMenu(null);

  app.on('second-instance', (e, argv) => require('./launcher').openExternal(argv));
  app.on('web-contents-created', (e, wc) => {
    wc.on('will-attach-webview', (ev) => ev.preventDefault());
  });
  app.on('window-all-closed', () => { store.flush(); app.quit(); });
  // "Çıkışta çerezleri ve site verilerini temizle" açıksa kapanmadan önce kalıcı profilin site verileri silinir.
  let exitCleared = false;
  app.on('before-quit', (e) => {
    require('./session-store').setQuitting();
    store.flush();
    if (exitCleared || !store.get('settings.privacy.clearOnExit') || !app.isReady()) return;
    e.preventDefault();
    exitCleared = true;
    const ses = require('electron').session.fromPartition('persist:vox');
    Promise.race([ses.clearStorageData(), new Promise((r) => setTimeout(r, 4000))]).catch(() => {}).finally(() => app.quit());
  });
  // Site ya da vekil sunucu kullanıcı adı/parola isterse arayüz sorar (yanıt gelmezse istek iptal edilir).
  app.on('login', (event, wc, details, authInfo, callback) => {
    event.preventDefault();
    const W = require('./window');
    const { win, tab } = wc ? W.fromWebContents(wc) : { win: null, tab: null };
    const target = win || W.focused();
    if (!target) { callback(); return; }
    require('./prompts').login(target, tab, details, authInfo, callback);
  });

  app.whenReady().then(() => {
    const W = require('./window');
    const sessions = require('./sessions');
    require('./theme').apply();
    // Ayar değişikliklerinin ana süreçteki etkileri: tema (sitelerin prefers-color-scheme değeri) ve yazım denetimi dilleri.
    // Görünümler 'settings' dilimini bütün olarak yazdığı için yol yerine değerin kendisi karşılaştırılır.
    const effects = { 'settings.appearance.theme': () => require('./theme').apply(), 'settings.languages': () => sessions.applySpellcheckAll() };
    const last = Object.fromEntries(Object.keys(effects).map((k) => [k, JSON.stringify(store.get(k))]));
    store.subscribe((slice) => {
      if (slice !== 'settings') return;
      for (const [k, fn] of Object.entries(effects)) {
        const now = JSON.stringify(store.get(k));
        if (now !== last[k]) { last[k] = now; fn(); }
      }
    });
    sessions.setHooks({
      notify(channel, d) {
        const { win } = d.wc ? W.fromWebContents(d.wc) : { win: null };
        const target = win || W.focused();
        if (target) target.send(channel, { id: d.id, state: d.state });
      },
      ask(req) {
        const { win, tab } = W.fromWebContents(req.wc);
        if (!win || !tab) { require('./permissions').respond(req.id, 'block', false); return; }
        win.send('permission:request', { id: req.id, tabId: tab.id, origin: req.origin, perm: req.perm });
      },
    });
    sessions.installCertificateHandler();
    // Tarayıcı arayüzü ve HUD varsayılan oturumdan vox://ui/ adresiyle yüklenir (file:// yerine; bkz. protocol.js).
    require('./protocol').setup(require('electron').session.defaultSession, { ui: true });
    sessions.forPartition('persist:vox');
    require('./ipc').register();
    require('./launcher').startup(process.argv);
    // Testler için ana süreç durumuna erişim (yalnızca VOX_TEST ortamında).
    if (process.env.VOX_TEST) global.__vox = { windows: W.windows, store: require('./store'), electron: require('electron') };
  });
}
