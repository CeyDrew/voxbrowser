'use strict';
/* VoxBrowser — tema: tarayıcı teması web sitelerinin prefers-color-scheme değerini de belirler. */
const { nativeTheme } = require('electron');
const store = require('./store');

module.exports = {
  apply() {
    const m = store.get('settings.appearance.theme');
    nativeTheme.themeSource = m === 'light' || m === 'dark' ? m : 'system';
  },
};
