'use strict';
/* VoxBrowser — pencere açma ve açılış davranışı (yeni sekme / kaldığım yerden / belirli sayfalar). */
const { session } = require('electron');
const { VoxWindow, focused } = require('./window');
const sessionStore = require('./session-store');
const store = require('./store');
const urls = require('./urls');

function open({ private: isPrivate = false, tabs, bounds, groups } = {}) {
  const w = new VoxWindow({ private: isPrivate, tabs, bounds, groups });
  if (isPrivate) {
    w.win.on('closed', () => {
      const ses = session.fromPartition(w.partition);
      ses.clearStorageData().catch(() => {});
      ses.clearCache().catch(() => {});
      // Son gizli pencere kapanınca gizli indirmelerin kayıtları da listeden kalkar (dosyalar diskte kalır).
      const { windows } = require('./window');
      if (![...windows.values()].some((x) => x.private && x !== w)) store.update('downloads', (l = []) => l.filter((d) => !d.private), 'main');
    });
  }
  return w;
}

/** URLs passed on the command line (e.g. when VoxBrowser is the default browser). */
function urlsFromArgv(argv) {
  return argv.slice(1).filter((a) => /^(https?:|vox:|file:)/i.test(a) || /\.(html?|pdf|svg)$/i.test(a))
    .map((a) => (/^[a-z]:[\\/]/i.test(a) ? `file:///${a.replace(/\\/g, '/')}` : a));
}

function startup(argv) {
  const extra = urlsFromArgv(argv).map((url) => ({ url, active: true }));
  const mode = store.get('settings.startup.mode');
  const saved = ((sessionStore.read() || {}).windows || []).filter((w) => w && Array.isArray(w.tabs));
  // En son kullanılan pencere en son açılır (öne gelir); komut satırından gelen adresler ona eklenir.
  const order = saved.slice().sort((a, b) => (a.focusedAt || 0) - (b.focusedAt || 0));
  if (mode === 'continue' && order.some((w) => w.tabs.length)) {
    let last = null;
    const withTabs = order.filter((w) => w.tabs.length);
    withTabs.forEach((w, i) => { last = open({ tabs: i === withTabs.length - 1 ? [...w.tabs, ...extra] : w.tabs, bounds: w.bounds, groups: w.groups }); });
    return last;
  }
  let tabs = [];
  if (mode === 'pages') tabs = (store.get('settings.startup.pages') || []).filter(Boolean).map((url) => ({ url }));
  if (!tabs.length && !extra.length) tabs = [{ url: urls.NEW_TAB }];
  const recent = order[order.length - 1];
  return open({ tabs: [...tabs, ...extra], bounds: recent && recent.bounds });
}

/** Another launch (e.g. a link clicked in another app) opens in the existing window. */
function openExternal(argv) {
  const list = urlsFromArgv(argv);
  const w = focused() || open({ tabs: [] });
  for (const url of list) w.tabs.create({ url });
  if (!list.length) w.tabs.create({ url: urls.NEW_TAB });
  w.focus();
}

module.exports = { open, startup, openExternal, urlsFromArgv };
