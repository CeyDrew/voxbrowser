'use strict';
/* VoxBrowser — site izinleri: kayıtlı karar → varsayılan politika → kullanıcıya sor (arayüzdeki izin balonu).
   Ana süreç sekme içeriğine güvenmez; köken (origin) her zaman istek yapan çerçevenin adresinden hesaplanır. */
const store = require('./store');

const pending = new Map();
let n = 0;
/** Electron izin adı → VoxBrowser izin anahtarı */
function keyOf(permission, details = {}) {
  if (permission === 'media') {
    const t = details.mediaTypes || [];
    if (t.includes('video') && t.includes('audio')) return 'camera+microphone';
    if (t.includes('video')) return 'camera';
    return 'microphone';
  }
  return ({
    geolocation: 'location', notifications: 'notifications', 'clipboard-read': 'clipboard', midi: 'midi', midiSysex: 'midi',
    'display-capture': 'screen', 'window-management': 'windows', 'idle-detection': 'idle', 'storage-access': 'storage',
    'top-level-storage-access': 'storage', fileSystem: 'files', mediaKeySystem: 'drm', keyboardLock: 'keyboard', 'speaker-selection': 'speakers',
  })[permission] || permission;
}
const ALWAYS = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'mediaKeySystem']);
const NEVER = new Set(['openExternal', 'unknown']);

function originOf(url) {
  try { return new URL(url).origin; } catch (e) { return ''; }
}
function decision(origin, key) {
  const site = (store.get('permissions') || {})[origin] || {};
  const parts = key.split('+');
  const vals = parts.map((k) => site[k]);
  if (vals.every((v) => v === 'allow')) return 'allow';
  if (vals.some((v) => v === 'block')) return 'block';
  const defs = store.get('settings.sitePermissions') || {};
  const d = parts.map((k) => defs[k] || 'ask');
  if (d.every((v) => v === 'allow')) return 'allow';
  if (d.some((v) => v === 'block')) return 'block';
  return 'ask';
}
function remember(origin, key, value) {
  store.update('permissions', (p = {}) => {
    const cur = { ...(p[origin] || {}) };
    for (const k of key.split('+')) cur[k] = value;
    return { ...p, [origin]: cur };
  }, 'main');
}

/** @param ask (req) => void — shows the prompt for a tab; resolve via respond(). */
function setup(ses, ask) {
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = originOf(details.requestingUrl || (wc && wc.getURL()));
    if (/^vox:/.test(origin) || origin === 'null' || !origin) { callback(/^vox:/.test(origin) && permission !== 'openExternal'); return; }
    if (ALWAYS.has(permission)) { callback(true); return; }
    if (NEVER.has(permission)) { callback(false); return; }
    const key = keyOf(permission, details);
    const d = decision(origin, key);
    if (d !== 'ask') { callback(d === 'allow'); return; }
    const id = `p${(n++).toString(36)}`;
    const timer = setTimeout(() => respond(id, 'block', false), 90000);
    pending.set(id, { callback, origin, key, timer });
    ask({ id, wc, origin, perm: key });
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    const origin = originOf(requestingOrigin || (details && details.requestingUrl) || '');
    if (/^vox:/.test(origin)) return true;
    if (ALWAYS.has(permission)) return true;
    if (NEVER.has(permission)) return false;
    return decision(origin, keyOf(permission, details)) === 'allow';
  });
  ses.setDevicePermissionHandler(() => false); // WebUSB / WebHID / Serial: şimdilik kapalı
}

function respond(id, value, rememberIt = true) {
  const p = pending.get(id);
  if (!p) return false;
  pending.delete(id);
  clearTimeout(p.timer);
  if (rememberIt) remember(p.origin, p.key, value === 'allow' ? 'allow' : 'block');
  p.callback(value === 'allow');
  return true;
}

module.exports = { setup, respond, originOf, keyOf, decision };
