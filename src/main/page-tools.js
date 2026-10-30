'use strict';
/* VoxBrowser — sekme sayfası üzerinde yapılan işlemler: sağ tık eylemleri, sayfayı kaydetme,
   önizleme görüntüsü ve Voxi'nin okuduğu sayfa metni. Hepsi ana süreçte, sayfaya güvenmeden yapılır. */
const path = require('path');
const { app, clipboard, dialog } = require('electron');
const store = require('./store');

const TEST = !!process.env.VOX_TEST;

/** "Sayfayı farklı kaydet": full page (HTML + files folder) or a single MHTML file, chosen by extension. */
async function savePage(tab) {
  if (tab.state.internal || tab.state.crashed) return;
  const base = String(tab.state.title || 'sayfa').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120) || 'sayfa';
  let file = path.join(store.get('settings.downloads.location') || app.getPath('downloads'), `${base}.html`);
  if (!TEST) {
    const r = await dialog.showSaveDialog(tab.win.win, {
      title: 'Sayfayı farklı kaydet', defaultPath: file,
      filters: [{ name: 'Web sayfası, tamamı', extensions: ['html', 'htm'] }, { name: 'Web sayfası, tek dosya (MHTML)', extensions: ['mhtml'] }],
    });
    if (r.canceled || !r.filePath) return;
    file = r.filePath;
  }
  const toast = (t) => tab.win.hud.toast({ id: `save-${Date.now()}`, duration: 4000, ...t });
  try {
    await tab.wc.savePage(file, /\.mhtml$/i.test(file) ? 'MHTML' : 'HTMLComplete');
    toast({ icon: 'check', text: `Sayfa kaydedildi: ${path.basename(file)}` });
  } catch (e) {
    toast({ icon: 'triangle-alert', tone: 'danger', text: 'Sayfa kaydedilemedi.' });
  }
}

/** Small JPEG of the page for the tab hover card (cached a few seconds; works for background tabs too). */
async function thumbnail(tab, width = 320) {
  if (tab.state.crashed) return null;
  if (tab.thumb && Date.now() - tab.thumb.at < 4000) return tab.thumb.image;
  try {
    const img = await tab.wc.capturePage(undefined, { stayHidden: true });
    if (img.isEmpty()) return null;
    const small = img.getSize().width > width ? img.resize({ width, quality: 'good' }) : img;
    const image = `data:image/jpeg;base64,${small.toJPEG(74).toString('base64')}`;
    tab.thumb = { image, at: Date.now() };
    return image;
  } catch (e) {
    return null;
  }
}

/** Readable text of the page (title, headings, paragraphs) for Voxi's on-device summary. */
async function pageText(tab) {
  try {
    return await tab.wc.executeJavaScript(`(() => {
      const pick = (s) => Array.from(document.querySelectorAll(s)).map((e) => e.innerText.trim()).filter(Boolean);
      return { title: document.title, url: location.href, lang: document.documentElement.lang,
        headings: pick('h1, h2, h3').slice(0, 24), paragraphs: pick('article p, main p, p').slice(0, 60),
        text: (document.body ? document.body.innerText : '').slice(0, 20000) };
    })()`, true);
  } catch (e) {
    return { title: tab.state.title, url: tab.state.url, headings: [], paragraphs: [], text: '' };
  }
}

/** Actions chosen in the page context menu (drawn by the browser UI). */
function contextAction(tab, action, p = {}) {
  const wc = tab.wc;
  const at = () => ({ x: Math.round(Number(p.x) || 0), y: Math.round(Number(p.y) || 0) });
  switch (action) {
    case 'copy': wc.copy(); break;
    case 'cut': wc.cut(); break;
    case 'paste': wc.paste(); break;
    case 'pasteAsPlain': wc.pasteAndMatchStyle(); break;
    case 'undo': wc.undo(); break;
    case 'redo': wc.redo(); break;
    case 'selectAll': wc.selectAll(); break;
    case 'delete': wc.delete(); break;
    case 'replaceMisspelling': wc.replaceMisspelling(String(p.word || '').slice(0, 100)); break;
    case 'addToDictionary': wc.session.addWordToSpellCheckerDictionary(String(p.word || '').slice(0, 100)); break;
    case 'copyText': if (TEST) global.__voxClipboard = String(p.text || ''); else clipboard.writeText(String(p.text || '').slice(0, 100000)); break;
    case 'copyImageAt': { const a = at(); wc.copyImageAt(a.x, a.y); break; }
    case 'saveURL': {
      const url = String(p.url || '');
      if (!/^(https?|data|blob|file):/i.test(url)) break;
      // vox:// sayfası başlatıcı olunca indirme kesilebiliyor: iç sekmelerde indirmeyi doğrudan oturum başlatır.
      if (tab.state.internal && /^https?:/i.test(url)) wc.session.downloadURL(url); else wc.downloadURL(url);
      break;
    }
    case 'inspect': tab.win.devtoolsOpen(tab, { inspect: at() }); break;
    case 'savePage': savePage(tab); break;
    case 'print': if (!TEST) wc.print({}, () => {}); break;
    default: break;
  }
}

module.exports = { savePage, thumbnail, pageText, contextAction };
