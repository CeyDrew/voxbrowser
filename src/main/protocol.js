'use strict';
/* VoxBrowser — vox:// protokolü.
   - İç sayfalar: vox://<sayfa>/… → src/internal/index.html (tek sayfa uygulaması), /_/shared/… ve /_/internal/… → statik dosyalar.
   - Tarayıcı arayüzü ve HUD: vox://ui/… → src/ui (ayrıca /shared/, /internal/, /hud/). Yalnızca arayüzün kendi oturumunda
     sunulur; sekmeler bu adresi açamaz. Arayüz file:// yerine buradan yüklenir, böylece paketli sürümde file:// sayfalarının
     ek ayrıcalıkları (yerel dosya okuma gibi) tamamen kapatılabilir.
   Sıkı CSP; başka sitelerin çerçevesine giremez. */
const fs = require('fs');
const path = require('path');
const urls = require('./urls');

const SRC = path.join(__dirname, '..');
const ROOTS = { shared: path.join(SRC, 'shared'), internal: path.join(SRC, 'internal') };
const INDEX = path.join(SRC, 'internal', 'index.html');
/** vox://ui yol önekleri → klasörler (sıra önemli: en özel önce). */
const UI_ROOTS = [['/shared/', ROOTS.shared], ['/internal/', ROOTS.internal], ['/hud/', path.join(SRC, 'hud')], ['/', path.join(SRC, 'ui')]];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const COMMON = { 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-cache' };
const HEADERS = {
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  ...COMMON,
};
/** Arayüz ağa hiç bağlanmaz (connect-src 'none'); site simgeleri ve önizlemeler için img-src açık. */
const UI_HEADERS = {
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data: blob:; font-src 'self'; connect-src 'none'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",
  ...COMMON,
};

async function respond(file, status = 200, headers = HEADERS) {
  const body = await fs.promises.readFile(file);
  return new Response(body, { status, headers: { ...headers, 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' } });
}
const notFound = () => new Response('Bulunamadı', { status: 404 });
/** Resolves rel under root; null if it escapes the root or isn't a file. */
function within(root, rel) {
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return null;
  return file;
}

function makeHandler({ ui }) {
  return async function handler(req) {
    let u;
    try { u = new URL(req.url); } catch (e) { return new Response('Geçersiz adres', { status: 400 }); }
    let p;
    try { p = decodeURIComponent(u.pathname); } catch (e) { return new Response('Geçersiz adres', { status: 400 }); }
    if (u.host === 'ui') {
      if (!ui) return notFound(); // sekmelerin oturumunda arayüz dosyaları yok
      const [prefix, root] = UI_ROOTS.find(([pre]) => p.startsWith(pre));
      const file = within(root, p.slice(prefix.length) || 'index.html');
      return file ? respond(file, 200, UI_HEADERS) : notFound();
    }
    const m = p.match(/^\/_\/(shared|internal)\/(.+)$/);
    if (m) {
      const file = within(ROOTS[m[1]], m[2]);
      return file ? respond(file) : notFound();
    }
    return respond(INDEX, urls.INTERNAL[u.host] ? 200 : 404);
  };
}

/** opts.ui: also serve the browser UI (only for the UI's own session). */
function setup(ses, opts = {}) {
  if (!ses.protocol.isProtocolHandled('vox')) ses.protocol.handle('vox', makeHandler({ ui: !!opts.ui }));
}

module.exports = { setup };
