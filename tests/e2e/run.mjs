// VoxBrowser duman testi: açılış, gerçek bir sayfaya gezinme, sekmeler, iç sayfalar, DevTools, kısayollar,
// katmanlar, arayüz düzenleme menüsü ve oturumun geri yüklenmesi.
// Kullanım: node tests/e2e/run.mjs [--shots <klasör>] [--visible]
import path from 'node:path';
import { rmSync } from 'node:fs';
import { launch, sleep, waitFor } from './harness.mjs';

const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? path.resolve(argv[argv.indexOf('--shots') + 1]) : null;
const visible = argv.includes('--visible');
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'GEÇTİ' : 'KALDI'}  ${name}${info ? `  — ${info}` : ''}`); };
const W = '[...__vox.windows.values()][0]';
const page = (title, body) => `data:text/html;charset=utf-8,<title>${title}</title>${body}`;

function report(app) {
  const errs = app.sink.errors;
  const cons = app.sink.console.filter((l) => !/Electron Security Warning|Autofill\.|Insecure Content-Security-Policy/.test(l));
  check('sayfa hatası yok', errs.length === 0, errs.slice(0, 5).join(' | '));
  if (cons.length) console.log('konsol:\n  ' + cons.slice(0, 15).join('\n  '));
}

/* ── 1. Temel akış ──────────────────────────────────────── */
const app = await launch({ offscreen: !visible });
try {
  check('arayüz açıldı', await app.ui.eval('Vox.ready === true'));
  const first = await waitFor(() => app.main.eval(`${W}.tabs.list.length > 0 && ${W}.tabs.active().wc.getURL()`));
  check('ilk sekme yeni sekme sayfası', /^vox:\/\/yeni-sekme/.test(first), first);
  const uiFocus = await waitFor(() => app.main.eval(`${W}.ui.webContents.isFocused() && !${W}.tabs.active().wc.isFocused()`), 4000).catch(() => false);
  check('açılışta klavye arayüzde (adres çubuğu)', uiFocus);
  const vp = await waitFor(() => app.main.eval(`${W}.viewport.width > 0 && ${W}.viewport`), 8000);
  check('sayfa alanı bildirildi', vp.width > 300 && vp.height > 200, JSON.stringify(vp));
  if (shots) console.log('görüntü:', await app.snap(path.join(shots, '01-newtab.png')));

  // Gerçek web: data: URL ile ağsız, deterministik bir sayfa
  await app.ui.eval(`Vox.nav.go(${JSON.stringify(page('Merhaba VoxBrowser', '<h1 id=x>Gerçek sayfa</h1>'))})`);
  await waitFor(() => app.ui.eval(`(Vox.tabs.active()||{}).title === 'Merhaba VoxBrowser'`), 10000);
  check('gezinme + başlık arayüze yansıdı', true);
  check('pencere başlığı etkin sekmeyi izliyor', (await app.main.eval(`${W}.win.getTitle()`)) === 'Merhaba VoxBrowser — VoxBrowser');
  const pg = await app.page();
  check('sayfa içeriği yüklendi', (await pg.eval(`document.getElementById('x').textContent`)) === 'Gerçek sayfa');
  check('web sayfasına köprü açılmadı (güvenlik)', (await pg.eval(`typeof window.voxNative`)) === 'undefined');
  check('web sayfası vox:// adresine gidemez', await (async () => {
    await pg.eval(`location.href = 'vox://ayarlar/'`).catch(() => {});
    await sleep(600);
    return !/^vox:/.test(await app.main.eval(`${W}.tabs.active().wc.getURL()`));
  })());
  // Sayfada bul: ilk arama sonuç sayısını, "sonraki" bir sonraki eşleşmeyi verir.
  await app.ui.eval(`Vox.nav.go(${JSON.stringify(page('Bul', '<p>kedi köpek kedi kuş kedi</p>'))})`);
  await waitFor(() => app.ui.eval(`(Vox.tabs.active()||{}).title === 'Bul'`), 10000);
  await app.ui.eval(`window.__find = null; Vox.bus.on('find:result', (r) => { if (r.finalUpdate) window.__find = r; }); Vox.pageFind.start('kedi'); 1`);
  const f1 = await waitFor(() => app.ui.eval(`window.__find`), 5000).catch(() => null);
  await app.ui.eval(`window.__find = null; Vox.pageFind.start('kedi', { findNext: true }); 1`);
  const f2 = await waitFor(() => app.ui.eval(`window.__find`), 5000).catch(() => null);
  check('sayfada bul: eşleşme sayısı ve sonraki', f1 && f1.matches === 3 && f2 && f2.activeMatchOrdinal === 2, JSON.stringify({ f1: f1 && [f1.activeMatchOrdinal, f1.matches], f2: f2 && [f2.activeMatchOrdinal, f2.matches] }));
  await app.ui.eval(`Vox.pageFind.stop(); 1`);
  const cap = await app.ui.eval(`Vox.native.invoke('tabs:capture', { width: 200 })`);
  check('sekme önizleme görüntüsü alındı', cap && /^data:image\/jpeg;base64,/.test(cap.image || ''), cap ? `${(cap.image || '').length} bayt, bellek ${cap.memory} KB` : 'yok');

  // Sekmeler
  await app.ui.eval(`Vox.commands.run('tab.new')`);
  await waitFor(() => app.main.eval(`${W}.tabs.list.length === 2`));
  check('Ctrl+T komutu yeni sekme açtı', true);
  await app.ui.eval(`Vox.tabs.close()`);
  await waitFor(() => app.main.eval(`${W}.tabs.list.length === 1`));
  check('sekme kapatıldı', true);
  // Kapatılan sekme geri/ileri geçmişiyle geri gelir
  await app.ui.eval(`Vox.tabs.open(${JSON.stringify(page('Önce', '<p>a</p>'))})`);
  await waitFor(() => app.ui.eval(`(Vox.tabs.active()||{}).title === 'Önce'`), 10000);
  await app.ui.eval(`Vox.nav.go(${JSON.stringify(page('Sonra', '<p>b</p>'))})`);
  await waitFor(() => app.ui.eval(`(Vox.tabs.active()||{}).title === 'Sonra' && Vox.tabs.active().canGoBack`), 10000);
  await app.ui.eval(`Vox.tabs.close()`);
  await waitFor(() => app.main.eval(`${W}.tabs.list.length === 1`));
  const closedAt = await app.ui.eval(`(Vox.store.get('closedTabs')[0] || {}).closedAt`);
  await app.ui.eval(`Vox.tabs.reopenClosed(${Number(closedAt) || 0})`);
  const back = await waitFor(() => app.ui.eval(`Vox.tabs.all().length === 2 && (Vox.tabs.active()||{}).title === 'Sonra' && !Vox.tabs.active().loading && Vox.tabs.active().canGoBack`), 10000).catch(() => false);
  check('kapatılan sekme geçmişiyle geri açıldı', back);
  await app.ui.eval(`Vox.tabs.close()`);
  await waitFor(() => app.main.eval(`${W}.tabs.list.length === 1`));

  // İç sayfa + veri köprüsü
  await app.ui.eval(`Vox.nav.go('vox://ayarlar/')`);
  await waitFor(() => app.main.eval(`${W}.tabs.active().wc.getURL().startsWith('vox://ayarlar')`), 10000);
  const internal = await app.page();
  await waitFor(() => internal.eval('!!(window.Vox && Vox.ready)'), 10000);
  check('iç sayfaya köprü verildi', (await internal.eval(`window.voxNative && window.voxNative.kind`)) === 'internal');
  check('iç sayfa ayarları okudu', (await internal.eval(`Vox.store.get('settings.search.engine')`)) === 'google');
  await internal.eval(`Vox.settings.set('appearance.density', 'compact')`);
  await waitFor(() => app.main.eval(`__vox.store.get('settings.appearance.density') === 'compact'`), 5000);
  await waitFor(() => app.ui.eval(`Vox.store.get('settings.appearance.density') === 'compact'`), 5000);
  check('ayar ana sürece yazıldı ve arayüze yayıldı', true);
  // İki görünüm aynı anda farklı ayarları değiştirir: yol düzeyinde yazıldığı için biri diğerini ezmemeli.
  await Promise.all([app.ui.eval(`Vox.settings.set('appearance.density', 'comfortable'); 1`), internal.eval(`Vox.settings.set('search.suggestions', false); 1`)]);
  const both = `__vox.store.get('settings.appearance.density') === 'comfortable' && __vox.store.get('settings.search.suggestions') === false`;
  const okBoth = await waitFor(() => app.main.eval(both), 5000).catch(() => false);
  await sleep(700);
  check('aynı anda yazılan iki ayar da korundu', okBoth && await app.main.eval(both));
  await app.ui.eval(`Vox.settings.set('appearance.theme', 'light')`);
  const themed = await waitFor(() => app.main.eval(`__vox.electron.nativeTheme.themeSource === 'light'`), 5000).catch(() => false)
    && await waitFor(() => internal.eval(`document.documentElement.getAttribute('data-vox-theme') === 'light'`), 5000).catch(() => false);
  check('tema değişikliği ana sürece ve iç sayfaya ulaştı', themed);

  // DevTools
  await app.ui.eval(`Vox.commands.run('devtools.toggle')`);
  await waitFor(() => app.main.eval(`!!${W}.tabs.active().devtools && ${W}.tabs.active().state.devtools`), 10000);
  const dtr = await waitFor(() => app.main.eval(`${W}.devtoolsRect`), 5000);
  check('DevTools yuvaya yerleşti', dtr && dtr.height > 100, JSON.stringify(dtr));
  const findText = `(() => { const walk = (r) => { for (const el of r.querySelectorAll('*')) { if (el.shadowRoot && walk(el.shadowRoot)) return true; if (el.childElementCount === 0 && el.textContent.trim() === 'Konsol') return true; } return false; }; return walk(document); })()`;
  const trDt = await waitFor(() => app.main.eval(`${W}.tabs.active().devtools.webContents.executeJavaScript(${JSON.stringify(findText)})`), 8000).catch(() => false);
  check('geliştirici araçları Türkçe', trDt);
  if (shots) console.log('görüntü:', await app.snap(path.join(shots, '02-devtools.png')));
  await app.ui.eval(`Vox.commands.run('devtools.toggle')`);
  await waitFor(() => app.main.eval(`!${W}.tabs.active().devtools`), 5000);
  check('DevTools kapandı', true);

  // Sayfa odaktayken kısayol (F12 → arayüze yönlendirilir)
  const keys = await app.main.eval(`[...${W}.keys].length`);
  check('kısayollar ana sürece kaydedildi', keys > 20, `${keys} kısayol`);

  // Bildirim (HUD): ilk kullanımda oluşturulur ve gerçekten görünür olur
  await app.ui.eval(`Vox.ui.toast({ icon: 'check', text: 'Deneme bildirimi' }); 1`);
  const toastShown = await waitFor(() => app.main.eval(`(() => { const h = ${W}.hud; return !!h.toastView && h.toastHeight > 20 && h.toastView.getVisible(); })()`), 5000).catch(() => false);
  check('bildirim görünür oluyor', toastShown);

  // Katman: menü açılınca arayüz sayfanın üstüne çıkar
  await app.ui.eval(`Vox.ui.menu({ anchor: { x: 200, y: 120 }, items: [{ label: 'Deneme' }] }); 1`);
  await waitFor(() => app.main.eval(`${W}.raised === true`), 3000);
  check('menü açıkken arayüz üstte', true);
  await app.ui.eval(`Vox.ui.closeAll(); 1`);
  await waitFor(() => app.main.eval(`${W}.raised === false`), 3000);
  check('menü kapanınca arayüz alta indi', true);

  // Arayüzdeki metin alanında sağ tık → düzenleme menüsü (kopyala/yapıştır çalıştırılmaz: sistem panosu)
  const field = await app.ui.eval(`(() => { const el = document.querySelector('.chrome-top input'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
  if (field) {
    for (const type of ['mousePressed', 'mouseReleased']) await app.ui.send('Input.dispatchMouseEvent', { type, x: field.x, y: field.y, button: 'right', clickCount: 1, buttons: 2 });
    const items = await waitFor(() => app.ui.eval(`document.querySelectorAll('[role^=menuitem]').length`), 4000).catch(() => 0);
    check('arayüz metin alanında düzenleme menüsü', items >= 3, `${items} öğe`);
    await app.ui.eval(`Vox.ui.closeAll(); 1`);
  } else check('arayüz metin alanında düzenleme menüsü', false, 'üst bölümde metin alanı yok');
} catch (e) {
  check('beklenmeyen hata', false, e.message);
} finally {
  report(app);
  await app.close();
}

/* ── 2. Oturum: "kaldığım yerden devam et" sekmeleri, sabitlemeyi ve geri geçmişini geri getirir ── */
let profile = null;
try {
  const a = await launch({ offscreen: !visible, keepProfile: true });
  profile = a.userData;
  try {
    await a.ui.eval(`Vox.settings.set('startup.mode', 'continue')`);
    await waitFor(() => a.main.eval(`__vox.store.get('settings.startup.mode') === 'continue'`), 5000);
    await a.ui.eval(`Vox.nav.go(${JSON.stringify(page('Bir', '<p>1</p>'))})`);
    await waitFor(() => a.ui.eval(`(Vox.tabs.active()||{}).title === 'Bir'`), 10000);
    await a.ui.eval(`Vox.nav.go(${JSON.stringify(page('İki', '<p>2</p>'))})`);
    await waitFor(() => a.ui.eval(`(Vox.tabs.active()||{}).title === 'İki'`), 10000);
    await a.ui.eval(`Vox.tabs.open(${JSON.stringify(page('Üç', '<p>3</p>'))})`);
    await waitFor(() => a.ui.eval(`Vox.tabs.all().length === 2 && Vox.tabs.active().title === 'Üç'`), 10000);
    await a.ui.eval(`Vox.tabs.pin(Vox.tabs.active().id, true)`);
    await waitFor(() => a.ui.eval(`Vox.tabs.all().some((t) => t.pinned)`), 5000);
    await a.ui.eval(`Vox.native.invoke('window:new', { url: ${JSON.stringify(page('Dört', '<p>4</p>'))} })`);
    await waitFor(() => a.main.eval(`__vox.windows.size === 2 && [...__vox.windows.values()][1].tabs.list.length === 1 && [...__vox.windows.values()][1].tabs.list[0].state.title === 'Dört'`), 15000);
    await a.main.eval(`__vox.store.flush(); ${W}.saveSession(true); true`);
    await sleep(300);
  } finally {
    await a.close();
  }
  const b = await launch({ offscreen: !visible, userData: profile, keepProfile: true });
  try {
    const wins = await waitFor(() => b.main.eval(`__vox.windows.size === 2 && [...__vox.windows.values()].map((w) => w.tabs.list.map((t) => t.state.title).join(','))`), 15000).catch(() => null);
    check('iki pencere de geri yüklendi', wins && wins.slice().sort().join(' | ') === 'Dört | Üç,İki', JSON.stringify(wins));
    // Hangi pencerenin arayüzüne bağlanıldığı belirsiz olduğundan kontrol ana süreçte yapılır.
    const tabs = await waitFor(() => b.main.eval(`(() => { const w = [...__vox.windows.values()].find((x) => x.tabs.list.length === 2);
      return !!w && w.tabs.list.every((t) => !t.state.loading) && w.tabs.list.map((t) => ({ title: t.state.title, pinned: t.state.pinned, back: t.state.canGoBack })); })()`), 15000);
    check('oturum geri yüklendi (2 sekme)', tabs.length === 2, JSON.stringify(tabs));
    check('sabitlenmiş sekme başta ve sabit', tabs[0].title === 'Üç' && tabs[0].pinned === true);
    check('sekmenin geri geçmişi korundu', tabs[1].title === 'İki' && tabs[1].back === true);
    report(b);
  } finally {
    await b.close();
  }
} catch (e) {
  check('oturum testi', false, e.message);
} finally {
  if (profile) { try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* yok say */ } }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} geçti`);
process.exit(failed ? 1 : 0);
