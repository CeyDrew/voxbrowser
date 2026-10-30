// VoxBrowser adım çalıştırıcı: uygulamayı temiz profille (ekran dışında) açar, verilen adımları uygular,
// ekran görüntüsü alır ve tüm görünümlerdeki hataları raporlar. Geliştirme sırasında elle doğrulama içindir.
// Kullanım: node tests/e2e/check.mjs --out <klasör> --steps '<json dizi>'  |  --steps-file adimlar.json
// Adımlar: {"ui"|"page"|"main": "js"}  {"waitFor": "js", "in": "ui|page|main", "timeout": ms}  {"wait": ms}
//   {"go": "adres ya da arama"}  {"open": "url"}  {"cmd": "komut.id", "args": {}}  {"theme": "dark|light"}
//   {"click"|"dblclick"|"rclick"|"hover": "css", "in": "ui|page"}  {"key": "F12", "mods": ["ctrl","shift","alt"], "in": "ui|page"}
//   {"type": "metin", "in": "ui|page"}  {"size": [genişlik, yükseklik]}  {"shot": "ad.png"}  {"log": "not"}
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { launch, sleep, waitFor } from './harness.mjs';

const argv = process.argv.slice(2);
const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const out = path.resolve(opt('--out') || '.vox-test/check');
const raw = opt('--steps') || (opt('--steps-file') ? readFileSync(opt('--steps-file'), 'utf8') : '[]');
const steps = JSON.parse(raw);
const W = '[...__vox.windows.values()][0]';
const short = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 600 ? `${s.slice(0, 600)}…` : s; };

const app = await launch({ offscreen: !argv.includes('--visible'), keepProfile: argv.includes('--keep') });
let failed = false;

async function session(where) {
  if (where === 'main') return app.main;
  if (where === 'page') return app.page();
  return app.ui;
}
async function center(s, sel) {
  const p = await s.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!p) throw new Error(`öğe yok: ${sel}`);
  return p;
}
async function mouse(s, type, p, extra = {}) {
  await s.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'none', ...extra });
}
async function settle(timeout = 15000) {
  await sleep(250);
  await waitFor(() => app.main.eval(`(() => { const t = ${W}.tabs.active(); return t && !t.state.loading; })()`), timeout).catch(() => {});
  await sleep(250);
}

try {
  for (const [i, st] of steps.entries()) {
    const label = `#${i + 1}`;
    try {
      if ('wait' in st) await sleep(st.wait);
      else if ('log' in st) console.log(`${label} — ${st.log}`);
      else if ('ui' in st || 'page' in st || 'main' in st) {
        const where = 'ui' in st ? 'ui' : 'page' in st ? 'page' : 'main';
        const v = await (await session(where)).eval(st[where]);
        console.log(`${label} ${where}: ${short(v)}`);
      } else if ('waitFor' in st) {
        const s = await session(st.in || 'ui');
        await waitFor(() => s.eval(st.waitFor), st.timeout || 10000);
        console.log(`${label} hazır: ${st.waitFor.slice(0, 80)}`);
      } else if ('go' in st) {
        await app.ui.eval(`Vox.nav.go(${JSON.stringify(st.go)})`);
        await settle(st.timeout);
        console.log(`${label} adres: ${await app.main.eval(`${W}.tabs.active().wc.getURL()`)}`);
      } else if ('open' in st) {
        await app.ui.eval(`Vox.tabs.open(${JSON.stringify(st.open)})`);
        await settle(st.timeout);
        console.log(`${label} yeni sekme: ${await app.main.eval(`${W}.tabs.active().wc.getURL()`)}`);
      } else if ('cmd' in st) {
        await app.ui.eval(`Vox.commands.run(${JSON.stringify(st.cmd)}, ${JSON.stringify(st.args || {})})`);
        console.log(`${label} komut: ${st.cmd}`);
      } else if ('theme' in st) {
        await app.ui.eval(`Vox.settings.set('appearance.theme', ${JSON.stringify(st.theme)})`);
        await sleep(500);
        console.log(`${label} tema: ${st.theme}`);
      } else if ('click' in st || 'dblclick' in st || 'rclick' in st || 'hover' in st) {
        const kind = ['click', 'dblclick', 'rclick', 'hover'].find((k) => k in st);
        const s = await session(st.in || 'ui');
        const p = await center(s, st[kind]);
        await mouse(s, 'mouseMoved', p);
        if (kind !== 'hover') {
          const button = kind === 'rclick' ? 'right' : 'left';
          const n = kind === 'dblclick' ? 2 : 1;
          for (let c = 1; c <= n; c++) {
            await mouse(s, 'mousePressed', p, { button, clickCount: c, buttons: button === 'left' ? 1 : 2 });
            await mouse(s, 'mouseReleased', p, { button, clickCount: c });
          }
        }
        console.log(`${label} ${kind}: ${st[kind]} @ ${Math.round(p.x)},${Math.round(p.y)}`);
      } else if ('key' in st) {
        await app.key(await session(st.in || 'ui'), st.key, st.mods || []);
        console.log(`${label} tuş: ${(st.mods || []).join('+')}${st.mods && st.mods.length ? '+' : ''}${st.key}`);
      } else if ('type' in st) {
        await app.type(await session(st.in || 'ui'), st.type);
        console.log(`${label} yazıldı: ${st.type}`);
      } else if ('size' in st) {
        const [w, h] = st.size;
        await app.main.eval(`(() => { const b = ${W}.win.getBounds(); ${W}.win.setBounds({ x: b.x, y: b.y, width: ${Number(w)}, height: ${Number(h)} }); return true; })()`);
        await sleep(500);
        console.log(`${label} boyut: ${w}x${h}`);
      } else if ('shot' in st) {
        await sleep(st.delay || 350);
        console.log(`${label} görüntü: ${path.join(out, st.shot)} (${await app.snap(path.join(out, st.shot))})`);
      } else {
        console.log(`${label} bilinmeyen adım: ${JSON.stringify(st)}`);
      }
    } catch (e) {
      failed = true;
      console.log(`${label} HATA: ${e.message}`);
      if (st.stopOnError !== false && !argv.includes('--continue')) break;
    }
  }
} finally {
  const errs = app.sink.errors;
  const cons = app.sink.console.filter((l) => !/Electron Security Warning|Autofill\.|Insecure Content-Security-Policy/.test(l));
  if (errs.length) { failed = true; console.log(`\nSAYFA HATALARI (${errs.length}):\n  ${errs.slice(0, 20).join('\n  ')}`); }
  if (cons.length) console.log(`\nKONSOL (${cons.length}):\n  ${cons.slice(0, 30).join('\n  ')}`);
  await app.close();
  console.log(failed ? '\nSONUÇ: hata var' : '\nSONUÇ: temiz');
  process.exit(failed ? 1 : 0);
}
