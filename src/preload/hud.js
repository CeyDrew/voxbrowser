'use strict';
/* VoxBrowser — HUD köprüsü (durum balonu ve bildirimler). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voxHud', {
  on(channel, fn) {
    if (!['hud:status', 'hud:toast'].includes(channel)) return () => {};
    const h = (_e, d) => fn(d);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
  size(height) { return ipcRenderer.invoke('hud:size', { height }); },
  action(id) { return ipcRenderer.invoke('hud:action', { id }); },
});
