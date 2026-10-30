'use strict';
/* VoxBrowser — sekme köprüsü. Web sitelerine hiçbir şey açmaz; yalnızca vox:// iç sayfalarına sınırlı bir API verir.
   Ana süreç ayrıca her çağrıda gönderenin vox:// ana çerçeve olduğunu doğrular. */
const { contextBridge, ipcRenderer } = require('electron');

/* Klavye (tüm sayfalar): tarayıcı kısayollarını (Ctrl+F, Ctrl+K, Ctrl+S…) önce sayfa kullanabilir, Chrome'daki gibi.
   Sayfa olayı kullanmazsa (preventDefault yoksa) kısayol tarayıcıya bildirilir. Yalnızca gerçek kullanıcı girdisi
   (isTrusted) bildirilir ve sayfaya hiçbir API açılmaz; dinleyici yalıtılmış dünyada çalışır. */
window.addEventListener('keydown', (e) => {
  if (!e.isTrusted || !(e.ctrlKey || e.altKey || e.metaKey || /^F\d{1,2}$/.test(e.key) || (e.shiftKey && e.key === 'Escape'))) return;
  const ev = { key: e.key, code: e.code, control: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey };
  setTimeout(() => { if (!e.defaultPrevented) ipcRenderer.send('page:key', ev); }, 0);
}, false);

if (location.protocol === 'vox:') {
  const INVOKE = new Set([
    'data:subscribe', 'data:set', 'data:defaults', 'data:cacheSize', 'tabs:create', 'tabs:navigate', 'tabs:activate', 'downloads:action', 'app:info', 'clipboard:write', 'data:clearBrowsing',
    'dialog:folder', 'system:metrics', 'tabs:crash', 'permissions:reset', 'security:allowHttp', 'security:allowCert', 'security:certInfo',
    'defaultBrowser:get', 'defaultBrowser:set', 'app:relaunch',
  ]);
  const EVENTS = new Set(['data:changed']);
  contextBridge.exposeInMainWorld('voxNative', {
    kind: 'internal',
    platform: process.platform,
    invoke(channel, payload) {
      if (!INVOKE.has(channel)) return Promise.reject(new Error(`Kanal yok: ${channel}`));
      return ipcRenderer.invoke(channel, payload);
    },
    on(channel, fn) {
      if (!EVENTS.has(channel) || typeof fn !== 'function') return () => {};
      const h = (_e, data) => fn(data);
      ipcRenderer.on(channel, h);
      return () => ipcRenderer.removeListener(channel, h);
    },
  });
}
