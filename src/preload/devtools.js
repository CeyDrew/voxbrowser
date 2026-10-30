'use strict';
/* VoxBrowser — geliştirici araçları (Chromium DevTools) ön yüzünün önyüklemesi: Türkçe arayüz.
   Electron yalnızca İngilizce DevTools dil dosyasını içerir. Türkçe dosya uygulamayla gelir (src/devtools/locales);
   DevTools dil dosyasını istediğinde ana süreçten verilir. DevTools'ta dil hiç seçilmemişse tarayıcının dili kullanılır,
   kullanıcı DevTools ayarlarından başka bir dil seçerse o korunur. Bu betik yalnızca DevTools ön yüzünde çalışır;
   sayfaya hiçbir API açmaz (ipcRenderer yalnızca bu kapsamda kalır). */
const { ipcRenderer } = require('electron');

const LOCALE_FILE = /\/core\/i18n\/locales\/([A-Za-z-]{2,10})\.json(?:[?#].*)?$/;
const nativeFetch = window.fetch.bind(window);

window.fetch = function voxDevtoolsFetch(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input && input.url) || '';
  const m = LOCALE_FILE.exec(url);
  if (m && m[1] !== 'en-US') {
    return ipcRenderer.invoke('devtools:locale', m[1]).then((json) => (json
      ? new Response(json, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
      : nativeFetch(input, init)));
  }
  return nativeFetch(input, init);
};

/** DevTools reads its settings from the host once at startup: default the language to the browser's (Turkish). */
function wrapHost(host) {
  if (!host || host.voxLanguageDefault || typeof host.getPreferences !== 'function') return host;
  const getPreferences = host.getPreferences.bind(host);
  host.getPreferences = (callback) => getPreferences((prefs) => {
    const p = prefs && typeof prefs === 'object' ? prefs : {};
    callback('language' in p ? p : { ...p, language: JSON.stringify('browserLanguage') });
  });
  host.voxLanguageDefault = true;
  return host;
}

if (window.InspectorFrontendHost) {
  wrapHost(window.InspectorFrontendHost);
} else {
  let host;
  Object.defineProperty(window, 'InspectorFrontendHost', {
    configurable: true,
    enumerable: true,
    get() { return host; },
    set(value) { host = wrapHost(value); },
  });
}
