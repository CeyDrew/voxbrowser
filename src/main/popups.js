'use strict';
/* VoxBrowser — açılır pencere engelleyici (Chrome gibi): sayfa yeni pencere/sekmeyi ancak kullanıcının bir tıklaması ya da
   tuş basışı üzerine açabilir ve her etkileşim yalnızca bir pencere açtırır. Kendiliğinden açılmak istenenler engellenir;
   kullanıcıya "Aç" seçeneğiyle bildirilir. Ayarlar › Gizlilik › Açılır pencereler "İzin ver" ise engel yoktur. */
const store = require('./store');

/** Chrome'un geçici kullanıcı etkinliği süresi: tıklamadan sonra bu kadar süre içinde bir pencere açılabilir. */
const GESTURE_MS = 5000;
/** Sekme başına hatırlanan engellenmiş adres sayısı ("Aç" en sonuncusunu açar). */
const KEEP = 5;
const TOUCH = new Set(['touchEnd', 'gestureTap']);

function hostOf(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.host : ''; } catch (e) { return ''; }
}

/** Records real user input on a tab. Mouse comes through 'before-mouse-event', which (unlike 'input-event') also sees
    clicks inside cross-site frames; touch only through 'input-event' (main frame); keys via key() below. */
function track(tab) {
  tab.gestureAt = 0;
  tab.blockedPopups = [];
  tab.wc.on('before-mouse-event', (e, m) => { if (m.type === 'mouseDown') tab.gestureAt = Date.now(); });
  tab.wc.on('input-event', (e, i) => { if (TOUCH.has(i.type)) tab.gestureAt = Date.now(); });
}

/** From the tab's 'before-input-event': any key press except Escape counts as user activation. */
function key(tab, input) {
  if (input.type === 'keyDown' && input.key !== 'Escape') tab.gestureAt = Date.now();
}

/** May this window.open / target=_blank go ahead? Uses up the gesture, so one click opens one window. */
function allow(tab) {
  if (store.get('settings.sitePermissions.popups') === 'allow') return true;
  if (Date.now() - tab.gestureAt > GESTURE_MS) return false;
  tab.gestureAt = 0;
  return true;
}

/** Remembers a blocked popup and tells the user (only for the visible tab, at most once a second). */
function blocked(tab, url) {
  tab.blockedPopups.unshift(String(url).slice(0, 8192));
  tab.blockedPopups.length = Math.min(tab.blockedPopups.length, KEEP);
  const now = Date.now();
  if (tab.win.tabs.activeId !== tab.id || now - (tab.popupToastAt || 0) < 1000) return;
  tab.popupToastAt = now;
  const host = hostOf(url);
  tab.win.hud.toast({
    id: `popup:${tab.id}`, icon: 'app-window', title: 'Açılır pencere engellendi.', duration: 8000, action: { label: 'Aç' },
    text: host ? ` Bu sayfa ${host} adresini yeni pencerede açmak istedi.` : ' Bu sayfa yeni bir pencere açmak istedi.',
  });
}

/** The toast's "Aç": opens that tab's most recently blocked popup in a new tab next to it. */
function open(win, toastId) {
  const tab = win.tabs.get(String(toastId).replace(/^popup:/, ''));
  const url = tab && tab.blockedPopups.shift();
  if (!url) return false;
  win.tabs.create({ url, openerId: tab.id });
  return true;
}

module.exports = { track, key, allow, blocked, open, GESTURE_MS };
