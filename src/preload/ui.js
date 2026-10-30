'use strict';
/* VoxBrowser — arayüz görünümü köprüsü. Yalnızca listelenen kanallar açık; Node.js arayüze sızmaz. */
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'data:subscribe', 'data:set', 'data:defaults', 'data:cacheSize', 'tabs:create', 'tabs:navigate', 'downloads:action', 'app:info', 'clipboard:write', 'data:clearBrowsing',
  'dialog:folder', 'system:metrics', 'tabs:crash', 'permissions:reset', 'security:allowHttp', 'security:allowCert', 'security:certInfo',
  'defaultBrowser:get', 'defaultBrowser:set', 'app:relaunch',
  'ui:ready', 'keys:register', 'layout:viewport', 'layout:devtools', 'ui:raise', 'ui:contentHidden',
  'tabs:close', 'tabs:activate', 'tabs:move', 'tabs:update', 'tabs:groups', 'tabs:duplicate', 'tabs:reload', 'tabs:stop',
  'tabs:back', 'tabs:forward', 'tabs:goto', 'tabs:entries', 'tabs:zoom', 'tabs:reopen', 'tabs:focusPage',
  'find:start', 'find:stop', 'devtools:toggle', 'devtools:open', 'devtools:close', 'context:action',
  'permission:respond', 'search:suggest', 'search:url', 'window:action', 'window:new', 'page:text', 'hud:toast',
  'tabs:capture', 'site:info', 'site:clear', 'ui:edit', 'prompt:respond', 'app:quit',
]);
const EVENTS = new Set([
  'tabs:state', 'data:changed', 'window:state', 'shortcut', 'find:result', 'context-menu', 'permission:request',
  'download:started', 'download:done', 'zoom:changed', 'hud:action', 'ui:context-menu', 'prompt:request',
]);

contextBridge.exposeInMainWorld('voxNative', {
  kind: 'ui',
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
