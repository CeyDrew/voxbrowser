'use strict';
/* VoxBrowser — oturum dosyası (userData/session.json): açık pencereler, sekmeler (geri/ileri geçmişiyle), gruplar,
   pencere konumları. Gizli pencereler yazılmaz. Kullanıcı birden çok pencereden birini kapatırsa o pencere oturumdan
   çıkar; uygulamadan çıkarken ya da son pencere kapanırken oturum olduğu gibi kalır ("kaldığım yerden devam et"). */
const fs = require('fs');
const path = require('path');
const { app, screen } = require('electron');

const KEEP_INTERNAL = /^vox:\/\/(yeni-sekme|ayarlar|gecmis|indirilenler|yer-imleri)/;
const ERROR_PAGE = /^vox:\/\/hata\//;
let timer = null;
let quitting = false;
let savedOnQuit = false;

const file = () => path.join(app.getPath('userData'), 'session.json');

/** { savedAt, windows: [{ bounds, focusedAt, groups, tabs }] } or null. Falls back to the previous copy (Firefox'taki
    dönüşümlü yedek gibi) when the file is missing or damaged; reads the old single-window format too. */
function read() {
  for (const f of [file(), `${file()}.bak`]) {
    try {
      const s = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (s && Array.isArray(s.windows)) return s;
      if (s && Array.isArray(s.tabs)) return { savedAt: s.savedAt, windows: [s] };
    } catch (e) { /* yok ya da bozuk: yedeğe bak */ }
  }
  return null;
}

/** Back/forward list without error pages, at most 30 entries around the current one. */
function entriesOf(t) {
  try {
    const e = t.entries();
    const list = e.entries.map((x, i) => ({ url: x.url, title: x.title, i }));
    if (list[e.index] && ERROR_PAGE.test(list[e.index].url) && t.state.errorUrl) list[e.index] = { url: t.state.errorUrl, title: '', i: e.index };
    const kept = list.filter((x) => !ERROR_PAGE.test(x.url));
    let idx = kept.findIndex((x) => x.i >= e.index);
    if (idx < 0) idx = kept.length - 1;
    const start = Math.max(0, Math.min(idx - 20, kept.length - 30));
    return { entries: kept.slice(start, start + 30).map(({ url, title }) => ({ url, title })), navIndex: Math.max(0, idx - start) };
  } catch (err) {
    return { entries: [], navIndex: 0 };
  }
}

function snapshot(w) {
  return {
    bounds: { ...w.win.getNormalBounds(), maximized: w.win.isMaximized() },
    focusedAt: w.focusedAt || 0,
    groups: w.tabs.groups,
    tabs: w.tabs.list.filter((t) => !t.state.internal || KEEP_INTERNAL.test(t.state.url)).map((t) => ({
      url: t.state.displayUrl || t.state.url, title: t.state.title, pinned: t.state.pinned, groupId: t.state.groupId,
      active: t.id === w.tabs.activeId, ...entriesOf(t),
    })),
  };
}

/** Writes every open regular window. `except`: a window the user is closing while others stay open. */
function save({ sync = false, except = null } = {}) {
  clearTimeout(timer);
  const W = require('./window');
  const list = [...W.windows.values()].filter((w) => !w.private && w !== except && !w.win.isDestroyed());
  if (!list.length) return;
  const data = JSON.stringify({ savedAt: Date.now(), windows: list.map(snapshot) });
  const write = () => {
    try {
      const tmp = `${file()}.tmp`;
      fs.writeFileSync(tmp, data);
      if (fs.existsSync(file())) fs.copyFileSync(file(), `${file()}.bak`);
      fs.renameSync(tmp, file());
    } catch (e) { /* yok say */ }
  };
  if (sync) write(); else setImmediate(write);
}

function saveSoon(delay = 800) {
  clearTimeout(timer);
  timer = setTimeout(() => save(), delay);
}

/** Called from a window's 'close' event. */
function windowClosing(win) {
  if (win.private) return;
  // Çıkarken pencereler sırayla kapanır: oturum, ilk kapanan pencerede hepsiyle birlikte bir kez yazılır.
  if (quitting) { if (!savedOnQuit) { savedOnQuit = true; save({ sync: true }); } return; }
  const others = [...require('./window').windows.values()].some((w) => w !== win && !w.private && !w.closing);
  save({ sync: true, except: quitting || !others ? null : win });
}

/** Saved bounds are used only if they are still on a connected display (a monitor may have been unplugged). */
function visibleBounds(b) {
  if (!b || b.x == null || b.y == null) return b;
  const on = screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width - 40 && b.x + (b.width || 0) > a.x + 40 && b.y >= a.y - 8 && b.y < a.y + a.height - 40);
  return on ? b : { width: b.width, height: b.height, maximized: b.maximized };
}

module.exports = { read, save, saveSoon, windowClosing, visibleBounds, entriesOf, setQuitting() { quitting = true; } };
