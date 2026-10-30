// VoxBrowser performans ölçümleri: açılış süresi, bellek, çok sekme, sekme geçişi, boştayken işlemci,
// 5000 kayıtlı geçmişte adres çubuğu önerileri ve geçmiş sayfası. Ekran dışında, temiz profille çalışır.
// Kullanım: node tests/e2e/perf.mjs   (eşikler gevşektir; amaç gerilemeyi yakalamak ve sayıları görmek)
import { launch, sleep, waitFor } from './harness.mjs';

const W = '[...__vox.windows.values()][0]';
const results = [];
const check = (name, value, unit, limit) => {
  const ok = value <= limit;
  results.push({ name, ok });
  console.log(`${ok ? 'GEÇTİ' : 'KALDI'}  ${name}: ${Math.round(value * 10) / 10} ${unit} (sınır ${limit} ${unit})`);
};
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
// Özel bellek (paylaşılan sayfalar her süreçte yeniden sayılmaz; Chrome'un görev yöneticisi de bunu gösterir)
const memMB = (app) => app.main.eval(`__vox.electron.app.getAppMetrics().reduce((s, m) => s + (m.memory.privateBytes || m.memory.workingSetSize), 0) / 1024`);
const procs = (app) => app.main.eval(`__vox.electron.app.getAppMetrics().length`);
const page = (i) => `data:text/html;charset=utf-8,<title>Sekme ${i}</title><h1>Sekme ${i}</h1>${'<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. </p>'.repeat(40)}`;

/* 1. Açılış süresi (3 kez, temiz profil) */
const starts = [];
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  const a = await launch({ offscreen: true });
  await waitFor(() => a.main.eval(`${W}.tabs.list.length > 0 && !${W}.tabs.active().state.loading`), 15000);
  starts.push(Date.now() - t0);
  await a.close();
}
check('açılış (işlem başlangıcı → yeni sekme hazır, medyan)', median(starts), 'ms', 4000);

const app = await launch({ offscreen: true });
try {
  await waitFor(() => app.main.eval(`!${W}.tabs.active().state.loading`), 15000);
  await sleep(2000);

  /* 2. Bellek: tek yeni sekme */
  const base = await memMB(app);
  const baseProcs = await procs(app);
  check('özel bellek, yalnızca yeni sekme açıkken (tüm süreçler)', base, 'MB', 500);
  check('açılışta çalışan işleyici süreci (arayüz + yeni sekme)', await app.main.eval(`__vox.electron.app.getAppMetrics().filter((m) => m.type === 'Tab').length`), 'süreç', 2);

  /* 3. Boştayken arayüzün işlemci kullanımı (animasyon/döngü sızıntısı yok mu?) */
  const uiPid = await app.main.eval(`${W}.ui.webContents.getOSProcessId()`);
  await app.main.eval(`__vox.electron.app.getAppMetrics(); 1`);
  await sleep(4000);
  const uiCpu = await app.main.eval(`(__vox.electron.app.getAppMetrics().find((m) => m.pid === ${uiPid}) || { cpu: { percentCPUUsage: 0 } }).cpu.percentCPUUsage`);
  check('boştayken arayüz işlemcisi', uiCpu, '%', 2);

  /* 4. Çok sekme: 20 sekme aç, sekme başına bellek; geçiş süresi; kapatınca bellek geri dönüyor mu */
  for (let i = 1; i <= 20; i++) await app.ui.eval(`Vox.tabs.open(${JSON.stringify(page(i))})`);
  await waitFor(() => app.main.eval(`${W}.tabs.list.length === 21 && ${W}.tabs.list.every((t) => !t.state.loading)`), 30000);
  await sleep(2500);
  const many = await memMB(app);
  check('sekme başına ek bellek (20 sekme)', (many - base) / 20, 'MB', 120);
  const switches = [];
  for (let i = 0; i < 20; i++) {
    const ms = await app.ui.eval(`(async () => { const tabs = Vox.tabs.all(); const id = tabs[${i} % tabs.length].id; const t = performance.now();
      await Vox.tabs.activate(id); while (Vox.store.get('activeTabId') !== id) await new Promise((r) => setTimeout(r, 2)); return performance.now() - t; })()`);
    switches.push(ms);
  }
  check('sekme geçişi (medyan)', median(switches), 'ms', 60);
  const strip = await app.ui.eval(`(async () => { const t = performance.now(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t; })()`);
  check('21 sekmeyle iki kare çizimi', strip, 'ms', 120);
  await app.main.eval(`(() => { const w = ${W}; for (const t of w.tabs.list.slice(1)) w.tabs.close(t.id); return 1; })()`);
  // Sızıntı = geri gelmeyen bellek. GPU süreci kapanan sekmelerin belleğini ~5-10 sn sonra bırakır ve V8 çöp toplamayı
  // erteler; ikisi de sızıntı değildir. Bu yüzden işleyicilerde çöp toplama zorlanır, bellek oturana kadar beklenir.
  await app.ui.send('HeapProfiler.collectGarbage').catch(() => {});
  await (await app.page()).send('HeapProfiler.collectGarbage').catch(() => {});
  await sleep(8000);
  let after = await memMB(app);
  for (let i = 0; i < 6; i++) {
    await sleep(2000);
    const m = await memMB(app);
    const settled = after - m < 5;
    after = Math.min(after, m);
    if (settled) break;
  }
  const afterProcs = await procs(app);
  check('sekmeler kapanınca kalan süreç fazlası (sızıntı)', Math.max(0, afterProcs - baseProcs), 'süreç', 1);
  check('sekmeler kapanınca bellek artışı (sızıntı)', Math.max(0, after - base), 'MB', 120);

  /* 5. tabs:state mesaj sıklığı ağır bir sayfa yüklenirken */
  await app.ui.eval(`window.__states = 0; Vox.native.on('tabs:state', () => { window.__states++; }); 1`);
  const t0 = Date.now();
  await app.ui.eval(`Vox.nav.go('https://tr.wikipedia.org/wiki/T%C3%BCrkiye')`);
  await sleep(300);
  await waitFor(() => app.main.eval(`!${W}.tabs.active().state.loading`), 30000).catch(() => {});
  const rate = (await app.ui.eval('window.__states')) / ((Date.now() - t0) / 1000);
  check('yükleme sırasında arayüze giden durum mesajı', rate, 'mesaj/sn', 40);

  /* 6. 5000 kayıtlı geçmiş: adres çubuğu önerisi ve geçmiş sayfası */
  await app.main.eval(`(() => { const h = []; const now = Date.now(); for (let i = 0; i < 5000; i++) h.push({ id: 'h' + i, url: 'https://ornek' + (i % 700) + '.example/sayfa/' + i, title: 'Örnek sayfa ' + i + (i % 9 === 0 ? ' vikipedi' : ''), ts: now - i * 60000 }); __vox.store.set('history', h, 'main'); return 1; })()`);
  await sleep(800);
  const sugg = await app.ui.eval(`(async () => { const input = document.querySelector('.chrome-top input'); input.focus(); input.select();
    const t = performance.now(); input.value = 'vikip'; input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'vikip', inputType: 'insertText' }));
    while (!document.querySelector('[role="listbox"] [role="option"]') && performance.now() - t < 3000) await new Promise((r) => setTimeout(r, 4));
    const ms = performance.now() - t; input.value = ''; input.dispatchEvent(new InputEvent('input', { bubbles: true })); input.blur(); return ms; })()`);
  check('5000 kayıtlı geçmişte öneri listesi', sugg, 'ms', 60);
  // Ziyaretten hemen sonra (geçmiş yeni değişmişken) ilk harf: tablo yeniden kuruluyor
  await app.main.eval(`__vox.store.update('history', (h) => [{ id: 'yeni', url: 'https://yeni.example/', title: 'Yeni ziyaret', ts: Date.now() }, ...h], 'main'); 1`);
  await sleep(150);
  const cold = await app.ui.eval(`(async () => { const input = document.querySelector('.chrome-top input'); input.focus(); input.select();
    const t = performance.now(); input.value = 'yeni'; input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'yeni', inputType: 'insertText' }));
    while (!document.querySelector('[role="listbox"] [role="option"]') && performance.now() - t < 3000) await new Promise((r) => setTimeout(r, 4));
    const ms = performance.now() - t; input.value = ''; input.dispatchEvent(new InputEvent('input', { bubbles: true })); input.blur(); return ms; })()`);
  check('geçmiş az önce değişmişken ilk öneri', cold, 'ms', 150);
  // Sayfanın içinden ölçülür (CDP ile bağlanma beklemesi ölçüme karışmasın)
  const h0 = Date.now();
  await app.ui.eval(`Vox.nav.go('vox://gecmis/')`);
  await waitFor(() => app.main.eval(`${W}.tabs.active().wc.getURL().startsWith('vox://gecmis') && ${W}.tabs.active().wc.executeJavaScript("!!document.querySelector('.pg-hi-row')")`), 10000);
  check('5000 kayıtlı geçmiş sayfasının açılması', Date.now() - h0, 'ms', 1000);
} catch (e) {
  results.push({ name: 'beklenmeyen hata', ok: false });
  console.log('KALDI  beklenmeyen hata:', e.message);
} finally {
  await app.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} geçti`);
  process.exit(failed ? 1 : 0);
}
