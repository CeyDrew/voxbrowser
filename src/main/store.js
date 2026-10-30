'use strict';
/* VoxBrowser — kalıcı veri deposu (ana süreç tek doğruluk kaynağıdır).
   Dilimler (settings, bookmarks, history, …) userData/data/<dilim>.json dosyalarında tutulur;
   yazmalar 400 ms gecikmeyle, önce geçici dosyaya yazılıp yeniden adlandırılarak (atomik) yapılır.
   Değişiklikler abone olan tüm görünümlere 'data:changed' ile yayınlanır. */
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const defaults = require('./defaults');

const SLICES = ['settings', 'bookmarks', 'history', 'downloads', 'permissions', 'profile', 'readingList', 'shortcuts', 'searchEngines', 'passwords', 'notifications', 'extensions'];
/** Slices renderers may write directly (others change only through main-process actions). */
const WRITABLE = new Set(['settings', 'bookmarks', 'history', 'permissions', 'profile', 'readingList', 'shortcuts', 'searchEngines', 'passwords']);
const ENCRYPTED = new Set(['passwords']);
const LIMITS = { history: 5000, downloads: 300, notifications: 50 };

let dir = '';
const data = {};
const timers = new Map();
const listeners = new Set();

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
  return out;
}
function getIn(obj, p) { return p ? String(p).split('.').reduce((o, k) => (o == null ? o : o[k]), obj) : obj; }
function setIn(obj, p, value) {
  const keys = String(p).split('.');
  const rec = (o, i) => {
    const cur = o == null ? {} : o;
    const k = keys[i];
    const next = i === keys.length - 1 ? value : rec(cur[k], i + 1);
    if (Array.isArray(cur)) { const c = cur.slice(); c[k] = next; return c; }
    return { ...cur, [k]: next };
  };
  return rec(obj, 0);
}

function file(slice) { return path.join(dir, `${slice}.json`); }
function read(slice) {
  try {
    const raw = fs.readFileSync(file(slice));
    if (ENCRYPTED.has(slice)) {
      if (!safeStorage.isEncryptionAvailable()) return undefined;
      return JSON.parse(safeStorage.decryptString(raw));
    }
    return JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return undefined;
  }
}
function write(slice) {
  // Gizli pencere indirmeleri yalnızca bellekte durur, diske hiç yazılmaz.
  const value = slice === 'downloads' && Array.isArray(data[slice]) ? data[slice].filter((d) => !d.private) : data[slice];
  let buf;
  if (ENCRYPTED.has(slice)) {
    if (!safeStorage.isEncryptionAvailable()) return; // şifreleme yoksa parolalar diske yazılmaz
    buf = safeStorage.encryptString(JSON.stringify(value));
  } else {
    buf = Buffer.from(JSON.stringify(value), 'utf8');
  }
  const tmp = `${file(slice)}.tmp`;
  try {
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file(slice));
  } catch (e) {
    console.error('[store] yazılamadı', slice, e.message);
  }
}
function schedule(slice) {
  clearTimeout(timers.get(slice));
  timers.set(slice, setTimeout(() => { timers.delete(slice); write(slice); }, 400));
}

const store = {
  SLICES,
  WRITABLE,
  init() {
    dir = path.join(app.getPath('userData'), 'data');
    fs.mkdirSync(dir, { recursive: true });
    const base = defaults();
    for (const s of SLICES) {
      const saved = read(s);
      data[s] = saved === undefined ? base[s] : (isObj(base[s]) ? merge(base[s], saved) : saved);
    }
  },
  /** get('settings.appearance.theme') */
  get: (p) => getIn(data, p),
  snapshot(slices = SLICES) {
    const out = {};
    for (const s of slices) out[s] = data[s];
    return out;
  },
  /** set('settings.appearance.theme', 'dark') — any depth; persists the slice and broadcasts it. */
  set(p, value, origin) {
    const slice = String(p).split('.')[0];
    if (!SLICES.includes(slice)) throw new Error(`bilinmeyen veri dilimi: ${slice}`);
    let next = setIn(data, p, value)[slice];
    if (LIMITS[slice] && Array.isArray(next) && next.length > LIMITS[slice]) next = next.slice(0, LIMITS[slice]);
    data[slice] = next;
    schedule(slice);
    for (const fn of listeners) {
      try { fn(slice, next, origin); } catch (e) { console.error('[store] dinleyici hatası', e); }
    }
  },
  update(slice, fn, origin) { store.set(slice, fn(data[slice]), origin); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  flush() {
    for (const [slice, t] of timers) { clearTimeout(t); write(slice); }
    timers.clear();
  },
  dir: () => dir,
};

module.exports = store;
