'use strict';
/* VoxBrowser — arama önerileri (seçili motorun OpenSearch öneri uç noktası, 1,5 sn zaman aşımı). */
const { net } = require('electron');
const store = require('./store');
const urls = require('./urls');

async function suggest(q) {
  const text = String(q || '').trim();
  if (!text || text.length > 200 || !store.get('settings.search.suggestions')) return [];
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return [];
  const eng = urls.engine();
  if (!eng || !eng.suggest) return [];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  try {
    const url = eng.suggest.replace('%s', encodeURIComponent(text)) + (eng.id === 'google' ? '&ie=utf-8&oe=utf-8' : '');
    const res = await net.fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' }, credentials: 'omit' });
    if (!res.ok) return [];
    const j = await res.json();
    const list = Array.isArray(j) && Array.isArray(j[1]) ? j[1] : [];
    return list.filter((s) => typeof s === 'string').slice(0, 8);
  } catch (e) {
    return [];
  } finally {
    clearTimeout(t);
  }
}

module.exports = { suggest };
