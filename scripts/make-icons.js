'use strict';
/* VoxBrowser — uygulama simgesini seçili logodan (Voxi Pencere) üretir: build/icons/icon.png (512) ve icon.ico.
   Electron ile çalışır (SVG'yi Chromium çizer): npx electron scripts/make-icons.js
   Küçük boyutlarda logonun sadeleştirilmiş "small" çizimi kullanılır. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'icons');
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

function logo() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'shared', 'core', 'logos.js'), 'utf8'), sandbox);
  const l = sandbox.window.VOX_LOGOS.find((x) => x.chosen) || sandbox.window.VOX_LOGOS[0];
  const fix = (s) => s.replace(/\{\{uid\}\}/g, 'vx');
  return { name: l.name, full: fix(l.svg), small: fix(l.small || l.svg) };
}

/** Renders an SVG at size×size with a transparent background and returns PNG bytes. */
async function render(win, svg, size) {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
    <img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`;
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await win.webContents.executeJavaScript('document.images[0].decode().then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))');
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  const s = img.getSize();
  return (s.width === size ? img : img.resize({ width: size, height: size, quality: 'best' })).toPNG();
}

/** ICO container with PNG-compressed entries (Windows Vista and later). */
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, png }, i) => {
    const o = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, o);
    head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt8(0, o + 2);
    head.writeUInt8(0, o + 3);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(png.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...entries.map((e) => e.png)]);
}

app.whenReady().then(async () => {
  const { name, full, small } = logo();
  const win = new BrowserWindow({ show: false, width: 520, height: 520, frame: false, transparent: true, backgroundColor: '#00000000', webPreferences: { offscreen: true, sandbox: true } });
  fs.mkdirSync(OUT, { recursive: true });
  const png512 = await render(win, full, 512);
  fs.writeFileSync(path.join(OUT, 'icon.png'), png512);
  const entries = [];
  for (const size of ICO_SIZES) entries.push({ size, png: await render(win, size <= 32 ? small : full, size) });
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(entries));
  console.log(`${name}: icon.png (512) + icon.ico (${ICO_SIZES.join(', ')}) → ${path.relative(ROOT, OUT)}`);
  win.destroy();
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
