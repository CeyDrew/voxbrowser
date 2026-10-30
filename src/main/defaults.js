'use strict';
/* VoxBrowser — ilk açılış varsayılanları (gerçek kullanıcı verisi yok; boş geçmiş, boş yer imleri). */
const os = require('os');
const { app } = require('electron');

function displayName() {
  try {
    const n = os.userInfo().username || '';
    return n ? n.charAt(0).toLocaleUpperCase('tr-TR') + n.slice(1) : '';
  } catch (e) {
    return '';
  }
}

/** Uzak Masaüstü oturumu mu? (Windows orada animasyonları bant genişliği için kapatır, erişilebilirlik için değil.) */
function isRemoteSession() {
  return process.platform === 'win32' && /^RDP-/i.test(process.env.SESSIONNAME || '');
}

/** Search engines: %s is replaced with the encoded query. suggest returns OpenSearch JSON ([q, [..]]). */
const SEARCH_ENGINES = [
  { id: 'google', name: 'Google', keyword: '@google', url: 'https://www.google.com/search?q=%s', suggest: 'https://suggestqueries.google.com/complete/search?client=firefox&hl=tr&q=%s', home: 'https://www.google.com' },
  { id: 'duckduckgo', name: 'DuckDuckGo', keyword: '@ddg', url: 'https://duckduckgo.com/?q=%s', suggest: 'https://duckduckgo.com/ac/?type=list&q=%s', home: 'https://duckduckgo.com' },
  { id: 'bing', name: 'Bing', keyword: '@bing', url: 'https://www.bing.com/search?q=%s', suggest: 'https://api.bing.com/osjson.aspx?query=%s', home: 'https://www.bing.com' },
  { id: 'yandex', name: 'Yandex', keyword: '@yandex', url: 'https://yandex.com.tr/search/?text=%s', suggest: 'https://suggest.yandex.com.tr/suggest-ff.cgi?part=%s', home: 'https://yandex.com.tr' },
  { id: 'brave', name: 'Brave Search', keyword: '@brave', url: 'https://search.brave.com/search?q=%s', suggest: 'https://search.brave.com/api/suggest?q=%s', home: 'https://search.brave.com' },
];

module.exports = function defaults() {
  return {
    settings: {
      startup: { mode: 'newtab', pages: [], homeUrl: 'vox://yeni-sekme' },
      appearance: { theme: 'system', density: 'compact', fontSize: 16, pageZoom: 100, showBookmarksBar: true, showHomeButton: true, tabPreviews: true, smoothScroll: true, newTabBackground: 'yaprak' },
      search: { engine: 'google', suggestions: true },
      voxi: { enabled: true, wakeWord: false, voice: 'Deniz', speed: 1, language: 'tr-TR', onDevice: true, saveHistory: false, showInToolbar: true },
      privacy: { tracking: 'standart', httpsOnly: false, gpc: true, dnt: false, safeBrowsing: 'standart', thirdPartyCookies: 'engelle-gizli', clearOnExit: false, secureDns: 'otomatik' },
      sitePermissions: { location: 'ask', camera: 'ask', microphone: 'ask', notifications: 'ask', popups: 'block', sound: 'allow', clipboard: 'ask' },
      downloads: { location: process.env.VOX_TEST_DOWNLOADS || app.getPath('downloads'), askWhere: false, openPdfInBrowser: true, showBubble: true },
      languages: { list: ['tr-TR', 'en-US'], translate: true, spellcheck: true },
      a11y: { reduceMotion: false, forceMotion: false, remoteSession: isRemoteSession(), focusHighlight: false, captions: false, caretBrowsing: false, minFontSize: 0 },
      system: { hardwareAccel: true, memorySaver: true, memorySaverMode: 'dengeli', energySaver: false, preload: 'standart', backgroundApps: false },
      autofill: { passwords: true, addresses: true, payments: false },
      defaultBrowser: false,
      ui: {},
      demo: { coachSeen: true, motionAsked: false },
    },
    bookmarks: {
      id: 'root', type: 'folder', title: 'Yer imleri',
      children: [
        { id: 'bar', type: 'folder', title: 'Yer imleri çubuğu', children: [] },
        { id: 'other', type: 'folder', title: 'Diğer yer imleri', children: [] },
      ],
    },
    history: [],
    downloads: [],
    permissions: {},
    profile: { name: displayName(), fullName: displayName(), email: '', color: '#F5B83D', sync: { on: false, lastSync: 0 } },
    readingList: [],
    shortcuts: [
      { id: 'sc-1', title: 'Google', url: 'https://www.google.com/' },
      { id: 'sc-2', title: 'YouTube', url: 'https://www.youtube.com/' },
      { id: 'sc-3', title: 'Vikipedi', url: 'https://tr.wikipedia.org/' },
      { id: 'sc-4', title: 'GitHub', url: 'https://github.com/' },
    ],
    searchEngines: SEARCH_ENGINES,
    passwords: [],
    notifications: [],
    extensions: [],
  };
};
module.exports.SEARCH_ENGINES = SEARCH_ENGINES;
module.exports.isRemoteSession = isRemoteSession;
