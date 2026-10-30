'use strict';
/* VoxBrowser — klavye: Electron giriş olayını arayüzün kısayol adına çevirir ("Ctrl+Shift+T", "F12", "Alt+ArrowLeft").
   Türkçe klavyede İ/ı ve AltGr ile yazılan karakterlerde de fiziksel tuşa göre doğru kısayolu verir. */

/** @param input Electron 'before-input-event' input ({ key, code, control, meta, alt, shift }) */
function comboOf(input) {
  let k = input.key || '';
  if (k === ' ') k = 'Space';
  else if (k.length === 1) {
    k = k.toUpperCase();
    if (k === 'İ' || k === 'I') k = 'I';
    if (k === '+') k = '=';
    if (!/^[A-Z0-9=\-]$/.test(k) && input.code && /^Key[A-Z]$/.test(input.code) && (input.control || input.meta || input.alt)) k = input.code.slice(3);
  }
  const parts = [];
  if (input.control || input.meta) parts.push('Ctrl');
  if (input.alt) parts.push('Alt');
  if (input.shift) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

/** Shortcuts the browser always takes, even while a page has focus (like Chrome: tabs, windows, DevTools, quitting).
    Every other registered shortcut goes to the page first; if the page doesn't use it, the tab reports it back. */
const RESERVED = new Set([
  'Ctrl+T', 'Alt+T', 'Ctrl+W', 'Ctrl+F4', 'Ctrl+N', 'Ctrl+Shift+N', 'Ctrl+Shift+T', 'Ctrl+Shift+W', 'Ctrl+Shift+Q', 'Alt+F4',
  'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+PageUp', 'Ctrl+PageDown', 'Ctrl+Shift+PageUp', 'Ctrl+Shift+PageDown',
  'F11', 'F12', 'Ctrl+Shift+I', 'Ctrl+Shift+J', 'Ctrl+Shift+C', 'Shift+Escape', 'Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+Home',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `Ctrl+${i}`),
]);
const isReserved = (combo) => RESERVED.has(combo);

module.exports = { comboOf, isReserved };
