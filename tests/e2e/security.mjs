// VoxBrowser güvenlik testleri: kötü niyetli bir web sayfasının yapabileceklerini gerçek uygulamada dener.
// Kullanım: node tests/e2e/security.mjs   (ekran dışında, temiz profille çalışır; ağ gerektirir: example.com)
import http from 'node:http';
import { launch, sleep, waitFor } from './harness.mjs';

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'GEÇTİ' : 'KALDI'}  ${name}${info ? `  — ${info}` : ''}`); };
const W = '[...__vox.windows.values()][0]';
/** Ana süreçteki bir modül (uygulamanın kullandığı örneğin aynısı). */
const MOD = (n) => `process.mainModule.require(process.mainModule.require('path').join(process.cwd(), 'src', 'main', '${n}.js'))`;

/* Yerel "saldırgan" sunucu: 127.0.0.1 ve localhost iki ayrı site sayılır (siteler arası denemeler için). */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://yerel');
  if (u.pathname === '/yonlendir') { res.writeHead(302, { location: u.searchParams.get('to') }); res.end(); return; }
  if (u.pathname === '/giris') {
    if (req.headers.authorization) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<title>giriş tamam</title>'); return; }
    res.writeHead(401, { 'www-authenticate': 'Basic realm="vox-test"', 'content-type': 'text/html' }); res.end('<title>401</title>'); return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><title>${u.pathname}</title><body style="margin:0"><button id="b" style="position:absolute;left:0;top:0;width:300px;height:100px">aç</button></body>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const A = `http://127.0.0.1:${server.address().port}`, B = `http://localhost:${server.address().port}`;

const app = await launch({ offscreen: true });
const activeUrl = () => app.main.eval(`${W}.tabs.active().wc.getURL()`);
const go = async (input) => {
  await app.ui.eval(`Vox.nav.go(${JSON.stringify(input)})`);
  await sleep(300);
  await waitFor(() => app.main.eval(`!${W}.tabs.active().state.loading`), 15000).catch(() => {});
};

try {
  /* 1. Web sayfasının ortamı: köprü, Node, Electron izi yok */
  await go('https://example.com/');
  let page = await app.page();
  const env = await page.eval(`({ bridge: typeof window.voxNative, require: typeof require, process: typeof process, module: typeof module,
    buffer: typeof Buffer, devtoolsHost: typeof InspectorFrontendHost, ua: navigator.userAgent })`);
  check('web sayfasında köprü/Node/Electron API yok', ['bridge', 'require', 'process', 'module', 'buffer', 'devtoolsHost'].every((k) => env[k] === 'undefined'), JSON.stringify(env).slice(0, 160));
  check('kullanıcı aracısında Electron izi yok', !/Electron|voxbrowser/i.test(env.ua));

  /* 2. Yasak adreslere gezinme (ana çerçeve) */
  for (const target of ['vox://ayarlar/', 'vox://ui/index.html', 'file:///C:/Windows/win.ini', 'chrome://gpu/', 'devtools://devtools/bundled/devtools_app.html']) {
    await page.eval(`location.href = ${JSON.stringify(target)}; 1`).catch(() => {});
    await sleep(700);
    const u = await activeUrl();
    check(`web sayfası ${target.split('/')[0]}// adresine gidemez`, /^https:\/\/example\.com/.test(u), u);
    page = await app.page();
  }

  /* 3. Yeni pencere/çerçeve ile kaçış denemeleri (açılır pencere engeli kapalıyken bile adres denetimi çalışır) */
  const tabsBefore = await app.main.eval(`${W}.tabs.list.length`);
  await app.main.eval(`__vox.store.set('settings.sitePermissions.popups', 'allow', 'main'), 1`);
  await page.eval(`window.open('vox://ayarlar/'); window.open('file:///C:/Windows/'); window.open('chrome://settings'); 1`);
  await sleep(1200);
  await app.main.eval(`__vox.store.set('settings.sitePermissions.popups', 'block', 'main'), 1`);
  const opened = await app.main.eval(`${W}.tabs.list.slice(${tabsBefore}).map((t) => t.wc.getURL())`);
  check('window.open ile iç sayfa / dosya / chrome:// açılamaz', opened.every((u) => !/^(vox|file|chrome):/i.test(u)), JSON.stringify(opened));
  for (const t of opened) await app.main.eval(`${W}.tabs.close(${W}.tabs.list.find((x) => x.wc.getURL() === ${JSON.stringify(t)}).id)`).catch(() => {});
  page = await app.page();
  const frame = await page.eval(`new Promise((res) => { const f = document.createElement('iframe'); f.src = 'vox://ayarlar/'; document.body.append(f);
    setTimeout(() => { let v = 'erişilemez'; try { v = f.contentDocument ? (f.contentDocument.body ? f.contentDocument.body.innerText.slice(0, 40) : 'boş') : 'erişilemez'; } catch (e) { v = 'erişilemez'; } res(v); }, 1500); })`);
  const frameUrls = await app.main.eval(`${W}.tabs.active().wc.mainFrame.frames.map((f) => f.url)`);
  check('iç sayfa (vox://) web sayfasına çerçeve olarak gömülemez', !frameUrls.some((u) => /^vox:/i.test(u)) && !/Ayarlar/.test(frame), JSON.stringify({ frame, frameUrls }));
  const fetched = await page.eval(`fetch('vox://ayarlar/').then((r) => 'okundu ' + r.status).catch(() => 'engellendi')`);
  check('web sayfası vox:// içeriğini fetch ile okuyamaz', fetched === 'engellendi', fetched);

  /* 4. Sahte klavye olayıyla tarayıcı komutu tetiklenemez (yalnızca gerçek kullanıcı girdisi iletilir) */
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true })); 1`);
  await sleep(500);
  check('sahte Ctrl+K komut paletini açamaz', (await app.ui.eval(`Vox.overlay.list().length`)) === 0);

  /* 5. İzinler: veri adresinden konum isteği hemen reddedilir; https sitesi sormadan alamaz */
  const perm = await page.eval(`navigator.permissions.query({ name: 'geolocation' }).then((p) => p.state)`);
  check('site konum iznine sahip değil (sorulmadan verilmez)', perm !== 'granted', perm);
  await page.eval(`navigator.geolocation.getCurrentPosition(() => {}, () => {}); 1`);
  const prompted = await waitFor(() => app.ui.eval(`Vox.overlay.list().some((l) => l.kind === 'popover')`), 4000).catch(() => false);
  check('konum isteği kullanıcıya soruluyor', prompted);
  await app.ui.eval(`Vox.ui.closeAll(); 1`);

  /* 6. Tehlikeli dosya: sayfanın blob ile ürettiği .exe indirmesi onaya kadar duraklatılır */
  await page.eval(`(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['MZ'], { type: 'application/octet-stream' })); a.download = 'kurulum.exe'; document.body.append(a); a.click(); return 1; })()`);
  const dl = await waitFor(() => app.main.eval(`(__vox.store.get('downloads') || []).find((d) => /kurulum/.test(d.filename) && d.ready)`), 8000).catch(() => null);
  const dir = await app.main.eval(`__vox.store.get('settings.downloads.location')`);
  const files = () => app.main.eval(`process.mainModule.require('fs').readdirSync(${JSON.stringify(dir)})`);
  const before = dl ? await files() : [];
  check('sayfanın ürettiği .exe onay beklerken çalıştırılabilir adla diske yazılmaz', dl && dl.state === 'dangerous' && !before.includes('kurulum.exe') && before.includes('kurulum.exe.onaylanmadi'), dl ? `${dl.state}; klasör: ${before.join(', ')}` : 'kayıt yok');
  if (dl) {
    await app.ui.eval(`Vox.downloads.keep(${JSON.stringify(dl.id)})`);
    const kept = await waitFor(() => app.main.eval(`(__vox.store.get('downloads') || []).find((d) => d.id === ${JSON.stringify(dl.id)} && d.state === 'complete')`), 4000).catch(() => null);
    const after = await files();
    check('"Koru" deyince dosya gerçek adına taşınır', kept && after.includes('kurulum.exe') && !after.includes('kurulum.exe.onaylanmadi'), after.join(', '));
    await page.eval(`(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['MZ'])); a.download = 'ikinci.scr'; document.body.append(a); a.click(); return 1; })()`);
    const d2 = await waitFor(() => app.main.eval(`(__vox.store.get('downloads') || []).find((d) => /ikinci/.test(d.filename) && d.ready)`), 8000).catch(() => null);
    if (d2) await app.ui.eval(`Vox.downloads.discard(${JSON.stringify(d2.id)})`);
    await sleep(500);
    const after2 = await files();
    check('"Sil" deyince onaylanmamış dosya diskten silinir', d2 && !after2.some((f) => /^ikinci/.test(f)), after2.join(', '));
  }

  /* 7. XSS: sayfa başlığındaki HTML arayüzde ve iç sayfalarda çalışmaz */
  await go(`data:text/html;charset=utf-8,<title>&lt;img src=x onerror="window.__xss=1"&gt;</title><p>xss</p>`);
  await go('https://example.com/?<img src=x onerror=window.__xss=1>');
  await sleep(400);
  const uiXss = await app.ui.eval(`({ flag: typeof window.__xss, imgs: document.querySelectorAll('img[src="x"]').length })`);
  check('başlık/adres içindeki HTML tarayıcı arayüzünde çalışmaz', uiXss.flag === 'undefined' && uiXss.imgs === 0, JSON.stringify(uiXss));
  await go('vox://gecmis/');
  const internal = await app.page();
  await waitFor(() => internal.eval('!!(window.Vox && Vox.ready)'), 8000).catch(() => {});
  await sleep(500);
  const pageXss = await internal.eval(`({ flag: typeof window.__xss, imgs: document.querySelectorAll('img[src="x"]').length })`);
  check('geçmiş sayfasında saldırgan başlık çalışmaz', pageXss.flag === 'undefined' && pageXss.imgs === 0, JSON.stringify(pageXss));

  /* 8. İç sayfanın köprüsü sınırlı: arayüz kanalları ve ana sürece ait veriler yazılamaz */
  const denied = await internal.eval(`Promise.all([
    voxNative.invoke('window:action', { action: 'close' }).then(() => 'açık').catch(() => 'reddedildi'),
    voxNative.invoke('data:set', { path: 'downloads', value: [] }).then(() => 'açık').catch(() => 'reddedildi'),
    voxNative.invoke('devtools:locale', 'tr').then((v) => (v ? 'açık' : 'reddedildi')).catch(() => 'reddedildi'),
  ])`);
  check('iç sayfa arayüz kanallarını ve korumalı verileri kullanamaz', denied.every((x) => x === 'reddedildi'), JSON.stringify(denied));

  /* 9. vox:// yanıt başlıkları: CSP, çerçeve yasağı */
  const headers = await app.main.eval(`__vox.electron.session.fromPartition('persist:vox').fetch('vox://gecmis/').then((r) => ({ csp: r.headers.get('content-security-policy'), xfo: r.headers.get('x-frame-options'), nosniff: r.headers.get('x-content-type-options') }))`);
  check('vox:// sayfalarında sıkı CSP ve çerçeve yasağı var', headers && /default-src 'none'/.test(headers.csp || '') && /frame-ancestors 'none'/.test(headers.csp || '') && headers.xfo === 'DENY' && headers.nosniff === 'nosniff', JSON.stringify(headers).slice(0, 160));
  const traversals = [];
  for (const t of ['../../main/ipc.js', '%2e%2e/%2e%2e/main/ipc.js', '..%2f..%2fmain%2fipc.js', '..%5c..%5cmain%5cipc.js', '%E0%A4%A']) {
    traversals.push(await app.main.eval(`__vox.electron.session.fromPartition('persist:vox').fetch('vox://gecmis/_/shared/${t}').then((r) => r.status + ':' + (r.headers.get('content-type') || '')).catch((e) => 'hata')`));
  }
  check('vox:// üzerinden kaynak dışı dosya okunamaz (kodlanmış dizin aşımı dahil)', traversals.every((r) => !/^200:.*javascript/.test(r)), traversals.join(' | '));

  const uiFromTabs = await app.main.eval(`__vox.electron.session.fromPartition('persist:vox').fetch('vox://ui/index.html').then((r) => r.status)`);
  const uiTyped = await app.ui.eval(`Vox.nav.go('vox://ui/index.html').then(() => new Promise((r) => setTimeout(r, 600)))`).then(() => activeUrl());
  check('tarayıcı arayüzü (vox://ui) sekmelerden açılamaz ve sunulmaz', uiFromTabs === 404 && !/^vox:\/\/ui/.test(uiTyped), `sekme oturumu: ${uiFromTabs}; adres çubuğu: ${uiTyped}`);

  /* 10. Süreç yalıtımı: tüm görünümler sandbox'lı, Node kapalı, web güvenliği açık */
  const prefs = await app.main.eval(`__vox.electron.webContents.getAllWebContents().map((wc) => { const p = wc.getLastWebPreferences() || {}; return { url: wc.getURL().slice(0, 40), node: !!p.nodeIntegration, iso: p.contextIsolation !== false, sandbox: p.sandbox !== false, web: p.webSecurity !== false }; })`);
  const bad = prefs.filter((p) => p.node || !p.sandbox || !p.web || (!p.iso && !/^devtools:/.test(p.url)));
  check('tüm görünümlerde sandbox açık, Node kapalı, web güvenliği açık', bad.length === 0, bad.length ? JSON.stringify(bad) : `${prefs.length} görünüm`);
  const metrics = await app.main.eval(`__vox.electron.app.getAppMetrics().filter((m) => m.type === 'Tab').map((m) => m.sandboxed)`);
  check('tüm işleyici süreçleri işletim sistemi sandbox\'ında', metrics.length > 0 && metrics.every(Boolean), `${metrics.length} süreç`);

  /* 11. Sunucu yönlendirmesi (302) iç sayfaya götüremez — iç sayfadan (adres çubuğu) ya da web sayfasından başlasın */
  const toAyarlar = encodeURIComponent('vox://ayarlar/');
  await go(`${A}/yonlendir?to=${toAyarlar}`);
  const r1 = await activeUrl();
  await go(`${A}/sayfa`);
  page = await app.page();
  await page.eval(`location.href = '/yonlendir?to=${toAyarlar}'; 1`);
  await sleep(1200);
  const r2 = await activeUrl();
  check('302 yönlendirmesi iç sayfaya (vox://ayarlar) götüremez', !/^vox:\/\/ayarlar/i.test(r1) && !/^vox:\/\/ayarlar/i.test(r2), `${r1} | ${r2}`);

  /* 12. Açılır pencere engelleyici: tıklamasız pencere açılmaz, kullanıcıya "Aç" ile bildirilir; bir tıklama = bir pencere */
  await go(`${A}/sayfa`);
  page = await app.page();
  const opener = await app.main.eval(`${W}.tabs.active().id`);
  await app.main.eval(`(() => { const w = ${W}; global.__asked = []; global.__toasts = [];
    const send = w.send.bind(w); w.send = (ch, p) => { if (ch === 'prompt:request') global.__asked.push(p); return send(ch, p); };
    const toast = w.hud.toast.bind(w.hud); w.hud.toast = (t) => { global.__toasts.push(t); return toast(t); }; return 1; })()`);
  const urlsNow = () => app.main.eval(`${W}.tabs.list.map((t) => t.wc.getURL())`);
  await page.eval(`window.open('${A}/acilir-1'); 1`);
  await sleep(900);
  const popToast = await app.main.eval(`global.__toasts.find((t) => /^popup:/.test(t.id)) || null`);
  check('tıklamasız açılır pencere engellenir ve kullanıcıya bildirilir', !(await urlsNow()).includes(`${A}/acilir-1`) && popToast && popToast.action, JSON.stringify(popToast).slice(0, 140));
  const hud = await app.attach((t) => /hud\.html\?kind=toast/.test(t.url), 'hud');
  await hud.eval(`(document.querySelector('.toast[data-id^="popup:"] .act') || { click() {} }).click(); 1`);
  const openedLater = await waitFor(async () => (await urlsNow()).includes(`${A}/acilir-1`), 4000).catch(() => false);
  check('bildirimdeki "Aç" engellenen pencereyi açar', openedLater);
  await app.main.eval(`${W}.tabs.activate(${JSON.stringify(opener)}), 1`);
  await page.eval(`document.getElementById('b').onclick = () => { window.open('${A}/acilir-2'); window.open('${A}/acilir-3'); }; 1`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x: 150, y: 50, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  }
  await sleep(1200);
  const afterClick = await urlsNow();
  check('tıklamayla açılan pencereye izin verilir; bir tıklama yalnızca bir pencere açar', afterClick.includes(`${A}/acilir-2`) && !afterClick.includes(`${A}/acilir-3`), JSON.stringify(afterClick.filter((u) => /acilir/.test(u))));

  /* 13. Parola sorma: başka sitenin çerçevesi ya da isteği soramaz (oltalama); sitenin kendisi sorabilir.
     (Başka site resimlerini Chromium zaten susturuyor; çerçeve ve fetch ise Electron'da 'login' olayına ulaşıyor.) */
  await app.main.eval(`${W}.tabs.activate(${JSON.stringify(opener)}), 1`);
  await page.eval(`(() => { const f = document.createElement('iframe'); f.src = '${B}/giris?cerceve'; document.body.append(f);
    fetch('${B}/giris?fetch', { credentials: 'include', mode: 'no-cors' }).catch(() => {}); return 1; })()`);
  await sleep(1500);
  const crossAsked = await app.main.eval(`global.__asked.filter((p) => p.kind === 'auth').map((p) => p.url)`);
  await app.ui.eval(`Vox.nav.go('${A}/giris')`);
  const ownAsk = await waitFor(() => app.main.eval(`global.__asked.find((p) => p.kind === 'auth' && p.url === '${A}/giris') || null`), 8000).catch(() => null);
  if (ownAsk) await app.main.eval(`${MOD('prompts')}.answer(${JSON.stringify(ownAsk.id)}, { username: 'vox', password: 'test' })`);
  const signedIn = await waitFor(() => app.main.eval(`${W}.tabs.active().wc.getTitle() === 'giriş tamam'`), 8000).catch(() => false);
  await app.ui.eval('Vox.ui.closeAll(); 1').catch(() => {});
  check('başka sitenin çerçevesi ya da isteği kullanıcı adı/parola soramaz', crossAsked.length === 0, JSON.stringify(crossAsked));
  check('açılan sitenin kendisi sorabilir ve giriş çalışır', ownAsk && signedIn, ownAsk ? `soruldu; giriş: ${signedIn}` : 'sorulmadı');

  /* 14. İç sayfa yetkileri: geçmiş sayfası yalnızca kendi işini yapabilir */
  await go('vox://gecmis/');
  const hist = await app.page();
  await waitFor(() => hist.eval('!!(window.Vox && Vox.ready)'), 8000).catch(() => {});
  const priv = await hist.eval(`Promise.all([
    voxNative.invoke('security:allowCert', { host: 'example.com' }),
    voxNative.invoke('data:set', { path: 'settings.downloads.location', value: 'C:\\\\' }),
    voxNative.invoke('data:set', { path: 'permissions', value: {} }),
    voxNative.invoke('data:set', { path: 'searchEngines', value: [] }),
    voxNative.invoke('data:set', { path: 'passwords', value: [] }),
    voxNative.invoke('tabs:crash', { tabId: 'yok' }),
    voxNative.invoke('system:metrics', {}),
    voxNative.invoke('data:clearBrowsing', { types: [] }),
  ].map((p) => p.then(() => 'açık', () => 'reddedildi')))`);
  const pw = await hist.eval(`voxNative.invoke('data:subscribe', { slices: ['passwords'] }).then((s) => ('passwords' in (s || {}) ? 'verildi' : 'verilmedi'), () => 'verilmedi')`);
  check('geçmiş sayfası parola, izin, arama motoru, indirme klasörü, sertifika ve süreç yetkilerini kullanamaz', priv.every((x) => x === 'reddedildi') && pw === 'verilmedi', JSON.stringify([...priv, pw]));
  const own = await hist.eval(`voxNative.invoke('data:set', { path: 'history', value: Vox.store.get('history') }).then(() => 'yazıldı', (e) => e.message)`);
  check('geçmiş sayfası kendi verisini değiştirebilir', own === 'yazıldı', own);

  /* 15. Sertifika istisnası yalnızca gerçekten görülen ve atlanabilir bir hata için */
  await go('vox://hata/?code=-202&url=https%3A%2F%2Fbilinmeyen.test%2F');
  const errPage = await app.page();
  await waitFor(() => errPage.eval('!!(window.Vox && Vox.ready)'), 8000).catch(() => {});
  await app.main.eval(`(() => { const ev = { preventDefault() {} };
    __vox.electron.app.emit('certificate-error', ev, null, 'https://iptal.test/', 'net::ERR_CERT_REVOKED', {}, () => {}, true);
    __vox.electron.app.emit('certificate-error', ev, null, 'https://kendinden.test/', 'net::ERR_CERT_AUTHORITY_INVALID', {}, () => {}, true);
    return 1; })()`);
  const certs = await errPage.eval(`Promise.all(['bilinmeyen.test', 'iptal.test', 'kendinden.test'].map((host) => voxNative.invoke('security:allowCert', { host })))`);
  check('hata görülmemiş ya da iptal edilmiş sertifika için "yine de devam et" verilmez', certs[0] === false && certs[1] === false && certs[2] === true, JSON.stringify(certs));

  /* 16. Görev yöneticisi başka bir gizli pencerenin adreslerini göstermez */
  await app.main.eval(`${MOD('launcher')}.open({ private: true, tabs: [{ url: '${A}/gizli-sayfa' }] }), 1`);
  await sleep(1500);
  await go('vox://surecler/');
  const tm = await app.page();
  await waitFor(() => tm.eval('!!(window.Vox && Vox.ready)'), 8000).catch(() => {});
  const hiddenTabs = await tm.eval(`voxNative.invoke('system:metrics', {}).then((x) => x.tabs.filter((t) => t.private).map((t) => t.title + '|' + t.url))`);
  check('görev yöneticisinde gizli sekmelerin adresi ve başlığı görünmez', hiddenTabs.length > 0 && hiddenTabs.every((s) => s === 'Gizli sekme|'), JSON.stringify(hiddenTabs));
  await app.main.eval(`[...__vox.windows.values()].filter((w) => w.private).forEach((w) => w.close()), 1`);
} catch (e) {
  check('beklenmeyen hata', false, e.message);
} finally {
  server.close();
  await app.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} geçti`);
  process.exit(failed ? 1 : 0);
}
