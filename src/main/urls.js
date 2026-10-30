'use strict';
/* VoxBrowser — adres çubuğu girdisini URL'ye çevirme ve iç sayfa (vox://) listesi. */
const store = require('./store');

/** Internal pages served by the vox: protocol (host → title, icon for the tab). */
const INTERNAL = {
  'yeni-sekme': { title: 'Yeni sekme', icon: 'logo' },
  ayarlar: { title: 'Ayarlar', icon: 'settings' },
  hakkinda: { title: 'VoxBrowser hakkında', icon: 'info' },
  gecmis: { title: 'Geçmiş', icon: 'history' },
  indirilenler: { title: 'İndirilenler', icon: 'download' },
  'yer-imleri': { title: 'Yer imleri', icon: 'book-marked' },
  uzantilar: { title: 'Uzantılar', icon: 'puzzle' },
  surecler: { title: 'Görev yöneticisi', icon: 'activity' },
  hata: { title: 'Bu sayfa açılamadı', icon: 'triangle-alert' },
};
const NEW_TAB = 'vox://yeni-sekme/';

function engine() {
  const id = store.get('settings.search.engine');
  const list = store.get('searchEngines') || [];
  return list.find((e) => e.id === id) || list[0];
}
function searchUrl(q, eng = engine()) {
  return eng.url.replace('%s', encodeURIComponent(q));
}

/** Turns address-bar text into a URL: full URL, host, local path or a web search. */
function fromInput(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (/^vox:/i.test(t)) {
    const rest = t.replace(/^vox:\/*/i, '');
    return `vox://${rest.includes('/') ? rest : `${rest}/`}`;
  }
  if (/^(about:blank)$/i.test(t)) return 'about:blank';
  if (/^view-source:/i.test(t)) {
    const inner = fromInput(t.slice(12));
    return inner && /^https?:/i.test(inner) ? `view-source:${inner}` : null;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  if (/^(mailto|tel|data):/i.test(t)) return t;
  if (/^[a-z]:[\\/]/i.test(t)) return `file:///${t.replace(/\\/g, '/')}`;
  const kw = t.match(/^(@\S+)\s+(.+)$/);
  if (kw) {
    const eng = (store.get('searchEngines') || []).find((e) => e.keyword === kw[1].toLowerCase());
    if (eng) return searchUrl(kw[2], eng);
  }
  if (!/\s/.test(t)) {
    if (/^localhost(:\d+)?(\/.*)?$/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(t)) return `http://${t}`;
    if (/^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return `https://${t}`;
  }
  return searchUrl(t);
}

function isInternal(url) { return /^vox:\/\//i.test(String(url || '')); }
function internalInfo(url) {
  try {
    const host = new URL(url).host;
    return INTERNAL[host] || null;
  } catch (e) {
    return null;
  }
}
/** Schemes a tab may load. Everything else (javascript:, chrome:, devtools:, file: by default…) is refused. */
function allowedInTab(url) {
  const u = String(url || '');
  if (/^vox:\/\/ui([/?#]|$)/i.test(u)) return false; // tarayıcı arayüzünün kendisi sekmede açılmaz
  return /^(https?:|vox:|about:blank|data:|blob:|file:|view-source:https?:)/i.test(u);
}

module.exports = { INTERNAL, NEW_TAB, fromInput, searchUrl, engine, isInternal, internalInfo, allowedInTab };
