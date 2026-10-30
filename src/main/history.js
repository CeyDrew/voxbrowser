'use strict';
/* VoxBrowser — tarama geçmişi kaydı (ana süreç). Gizli pencereler buraya hiç yazmaz. */
const store = require('./store');

let n = 0;
const id = () => `h${Date.now().toString(36)}${(n++).toString(36)}`;

module.exports = {
  /** Records a top-level visit; repeated visits to the same URL within 30 s update the newest entry. */
  add(url, title) {
    store.update('history', (h = []) => {
      if (h[0] && h[0].url === url && Date.now() - h[0].ts < 30000) return [{ ...h[0], ts: Date.now(), title: title || h[0].title }, ...h.slice(1)];
      return [{ id: id(), url, title: title || '', ts: Date.now() }, ...h];
    }, 'main');
  },
  /** Fills in the title once the page reports it. */
  title(url, title) {
    const h = store.get('history') || [];
    const i = h.findIndex((e) => e.url === url);
    if (i < 0 || i > 3 || h[i].title === title) return;
    const next = h.slice();
    next[i] = { ...h[i], title };
    store.set('history', next, 'main');
  },
  /** Remembers the site icon (URL) on the newest entry for that page, so lists can show it. */
  favicon(url, icon) {
    if (!/^https?:|^data:image\//i.test(String(icon || ''))) return;
    const h = store.get('history') || [];
    const i = h.findIndex((e) => e.url === url);
    if (i < 0 || i > 3 || h[i].favicon === icon) return;
    const next = h.slice();
    next[i] = { ...h[i], favicon: icon };
    store.set('history', next, 'main');
  },
  clear(since = 0) { store.update('history', (h = []) => (since ? h.filter((e) => e.ts < since) : []), 'main'); },
};
