'use strict';
/* VoxBrowser — kullanıcıya sorulması gereken ana süreç istekleri:
   - HTTP kimlik doğrulama (site ya da vekil sunucu kullanıcı adı/parola istiyor),
   - dış uygulama bağlantıları (mailto:, tel:, zoommtg: …) — yalnızca kullanıcı onaylarsa işletim sistemine verilir.
   Arayüz 'prompt:request' ile sorar, yanıt 'prompt:respond' ile döner; yanıtsız istekler süre dolunca iptal edilir. */
const { shell } = require('electron');

const TEST = !!process.env.VOX_TEST;
const pending = new Map();
let n = 0;

/** Never handed to the OS: browser-internal schemes and Windows handlers known to be abused for code execution. */
const BLOCKED = new Set(['javascript', 'vbscript', 'data', 'blob', 'file', 'about', 'chrome', 'chrome-extension', 'devtools', 'view-source', 'vox',
  'ms-msdt', 'search-ms', 'search', 'ms-officecmd', 'ms-cxh', 'ms-cxh-full', 'ms-appinstaller', 'shell', 'res', 'its', 'mk', 'mhtml', 'ms-its',
  'hcp', 'help', 'jar', 'wsl', 'ms-settings']);

/** The scheme of a URL that should open in another app, or null (web, internal or blocked). */
function externalScheme(url) {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(String(url || ''));
  if (!m) return null;
  const s = m[1].toLowerCase();
  if (/^(https?|ftp|wss?)$/.test(s) || BLOCKED.has(s)) return null;
  return s;
}

function ask(win, payload, onAnswer, timeoutMs) {
  const id = `q${Date.now().toString(36)}${(n++).toString(36)}`;
  const timer = setTimeout(() => answer(id, null), timeoutMs);
  pending.set(id, { onAnswer, timer, winId: win.id, kind: payload.kind, tabId: payload.tabId });
  win.send('prompt:request', { id, ...payload });
  return id;
}

/** Delivers the user's answer (null = cancelled). Only the window that was asked may answer. */
function answer(id, value, winId) {
  const p = pending.get(id);
  if (!p || (winId !== undefined && winId !== p.winId)) return false;
  pending.delete(id);
  clearTimeout(p.timer);
  try { p.onAnswer(value); } catch (e) { /* yok say */ }
  return true;
}

function originOf(url) {
  try { const u = new URL(String(url || '').replace(/^view-source:/i, '')); return /^https?:$/.test(u.protocol) ? u.origin : ''; } catch (e) { return ''; }
}

/** Like Chrome, only the site being opened in the tab (or already open there) may ask for a password: a cross-site image,
    script or frame can't pop up a login dialog that looks like the page's own (phishing). Proxies always may. */
function authAllowed(tab, url, authInfo) {
  if (authInfo.isProxy) return true;
  if (!tab) return false;
  const o = originOf(url);
  let page = '';
  try { page = tab.wc.getURL(); } catch (e) { /* sekme kapandı */ }
  return !!o && (o === originOf(tab.navUrl) || o === originOf(page));
}

/** app 'login': HTTP Basic/Digest or proxy authentication. Returns false (and cancels) when the request may not ask. */
function login(win, tab, details, authInfo, callback) {
  if (!authAllowed(tab, details.url, authInfo)) { callback(); return false; }
  ask(win, {
    kind: 'auth', tabId: tab ? tab.id : null, url: String(details.url || '').slice(0, 2000), host: authInfo.host, port: authInfo.port,
    realm: String(authInfo.realm || '').slice(0, 200), scheme: authInfo.scheme, isProxy: !!authInfo.isProxy,
  }, (v) => {
    if (v && typeof v.username === 'string') callback(v.username.slice(0, 500), String(v.password || '').slice(0, 500));
    else callback();
  }, 5 * 60 * 1000);
  return true;
}

/** A page wants to open an app link. One pending question per tab (pages can't spam prompts). */
function external(win, tab, url, origin) {
  const scheme = externalScheme(url);
  if (!scheme) return false;
  const tabId = tab ? tab.id : null;
  for (const p of pending.values()) if (p.kind === 'external' && p.tabId === tabId && tabId) return true;
  ask(win, { kind: 'external', tabId, url: String(url).slice(0, 2000), scheme, origin: String(origin || '').slice(0, 300) }, (v) => {
    if (v && v.allow && !TEST) shell.openExternal(url).catch(() => {});
  }, 2 * 60 * 1000);
  return true;
}

/** Typed into the address bar by the user: open directly (no question needed). */
function openTyped(url) {
  if (!externalScheme(url) || TEST) return false;
  shell.openExternal(url).catch(() => {});
  return true;
}

module.exports = { login, external, openTyped, answer, externalScheme };
