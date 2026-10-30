'use strict';
/* VoxBrowser — gerçek indirmeler: Chromium DownloadItem → 'downloads' veri dilimi.
   Çalıştırılabilir dosyalar kullanıcı onaylayana kadar duraklatılır ("Bu dosya tehlikeli olabilir"). */
const fs = require('fs');
const path = require('path');
const { shell, session } = require('electron');
const store = require('./store');

const items = new Map();
/** Onaylanmamış tehlikeli dosyanın uzantısı (Windows bu adla çalıştırmaz). */
const UNCONFIRMED = '.onaylanmadi';
/** Çalıştırılabilir ya da sistemi değiştirebilen dosya türleri (Chromium'un tehlikeli tür listesinin özü). */
const DANGEROUS = /\.(exe|msi|msp|msix|msixbundle|appx|appxbundle|appinstaller|application|appref-ms|bat|cmd|com|cpl|dll|gadget|hta|inf|ins|iso|img|jar|jnlp|js|jse|lnk|mht|mhtml|msc|pif|ps1|psm1|reg|scf|scr|settingcontent-ms|url|vb|vbe|vbs|vhd|vhdx|wsf|wsh|xll)$/i;
let n = 0;
/** Testlerde dosya açma / klasör gösterme kullanıcının masaüstüne dokunmaz. */
const TEST = !!process.env.VOX_TEST;
const uid = () => `dl${Date.now().toString(36)}${(n++).toString(36)}`;

function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let p = path.join(dir, name);
  let i = 1;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`);
  return p;
}
function patch(id, fields) {
  store.update('downloads', (l = []) => l.map((d) => (d.id === id ? { ...d, ...fields } : d)), 'main');
}

function setup(ses, notify) {
  ses.on('will-download', (event, item, wc) => {
    const id = uid();
    const dir = store.get('settings.downloads.location') || require('electron').app.getPath('downloads');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* yok say */ }
    const filename = item.getFilename();
    // Kaynağa bakılmaz: sayfalar blob:/data: adresleriyle de dosya üretebilir; tür tehlikeliyse onay gerekir.
    const dangerous = DANGEROUS.test(filename);
    let finalPath = null;
    if (dangerous) {
      // Chrome gibi: onaylanana dek çalıştırılamaz bir adla iner; "Koru" gerçek adına taşır, "Sil" dosyayı siler.
      finalPath = uniquePath(dir, filename);
      item.setSavePath(uniquePath(dir, `${path.basename(finalPath)}${UNCONFIRMED}`));
    } else if (store.get('settings.downloads.askWhere')) item.setSaveDialogOptions({ defaultPath: path.join(dir, filename) });
    else item.setSavePath(uniquePath(dir, filename));
    const rec = {
      id, filename: finalPath ? path.basename(finalPath) : filename, url: item.getURL(), size: item.getTotalBytes(), received: 0, mime: item.getMimeType(),
      state: dangerous ? 'dangerous' : 'in_progress', startedAt: Date.now(), endedAt: null, speed: 0,
      savePath: item.getSavePath() || '', finalPath, danger: dangerous ? 'Bu dosya türü bilgisayarınıza zarar verebilir.' : null,
      private: !ses.isPersistent(),
    };
    items.set(id, item);
    store.update('downloads', (l = []) => [rec, ...l], 'main');
    notify('download:started', { id, wc });
    let lastT = Date.now();
    let lastB = 0;
    let pushedAt = 0;
    item.on('updated', (e, state) => {
      const now = Date.now();
      if (now - pushedAt < 300 && state === 'progressing') return;
      pushedAt = now;
      const received = item.getReceivedBytes();
      const dt = (now - lastT) / 1000;
      const speed = dt > 0 ? Math.max(0, (received - lastB) / dt) : 0;
      lastT = now;
      lastB = received;
      const savePath = item.getSavePath();
      const cur = (store.get('downloads') || []).find((d) => d.id === id);
      let st = state === 'interrupted' ? 'paused' : item.isPaused() ? 'paused' : 'in_progress';
      if (cur && cur.state === 'dangerous') st = 'dangerous';
      const shown = cur && cur.finalPath ? path.basename(cur.finalPath) : savePath ? path.basename(savePath) : filename;
      patch(id, { received, size: item.getTotalBytes(), speed, state: st, savePath, filename: shown });
    });
    item.once('done', (e, state) => {
      const savePath = item.getSavePath();
      const cur = find(id) || {};
      const fields = { received: item.getReceivedBytes(), speed: 0, endedAt: Date.now(), savePath, filename: cur.finalPath ? path.basename(cur.finalPath) : savePath ? path.basename(savePath) : filename };
      items.delete(id);
      if (state === 'completed' && cur.state === 'dangerous') {
        patch(id, { ...fields, ready: true }); // indi ama onay bekliyor: dosya çalıştırılamaz adıyla duruyor
        notify('download:done', { id, state: 'dangerous' });
        return;
      }
      if (state === 'completed') {
        fields.state = 'complete';
        if (cur.finalPath) Object.assign(fields, confirm(savePath, cur.finalPath));
      } else {
        fields.state = state === 'cancelled' ? 'cancelled' : 'failed';
        if (state !== 'cancelled') fields.error = 'İndirme yarıda kesildi (ağ ya da disk hatası).';
        if (cur.finalPath) removeUnconfirmed(savePath);
      }
      patch(id, fields);
      notify('download:done', { id, state: fields.state });
    });
  });
}

function find(id) { return (store.get('downloads') || []).find((d) => d.id === id); }

/** Moves a confirmed dangerous file from its unconfirmed name to the real one. */
function confirm(tempPath, finalPath) {
  const target = fs.existsSync(finalPath) ? uniquePath(path.dirname(finalPath), path.basename(finalPath)) : finalPath;
  try {
    fs.renameSync(tempPath, target);
    return { savePath: target, filename: path.basename(target), finalPath: null, ready: false, danger: null };
  } catch (e) {
    return { state: 'failed', error: 'Dosya kaydedilemedi.', finalPath: null, ready: false };
  }
}
function removeUnconfirmed(tempPath) {
  if (tempPath && tempPath.endsWith(UNCONFIRMED)) { try { fs.rmSync(tempPath, { force: true }); } catch (e) { /* yok say */ } }
}

/** Actions from the UI / vox://indirilenler. */
function action(id, act) {
  const item = items.get(id);
  const rec = find(id);
  switch (act) {
    case 'pause': if (item && !item.isPaused()) item.pause(); if (rec) patch(id, { state: 'paused', speed: 0 }); break;
    case 'resume': if (item && item.canResume()) item.resume(); if (rec) patch(id, { state: 'in_progress' }); break;
    case 'keep':
      if (!rec || rec.state !== 'dangerous') break;
      if (item) patch(id, { state: 'in_progress', danger: null }); // inmeye devam; bitince gerçek adına taşınır
      else if (rec.ready && rec.finalPath) patch(id, { state: 'complete', ...confirm(rec.savePath, rec.finalPath) });
      break;
    case 'cancel': if (item) item.cancel(); else if (rec) patch(id, { state: 'cancelled' }); break;
    case 'discard':
      if (item) item.cancel();
      if (rec) { if (rec.finalPath) removeUnconfirmed(rec.savePath); store.update('downloads', (l = []) => l.filter((d) => d.id !== id), 'main'); }
      break;
    case 'open':
      if (!rec || !rec.savePath || rec.state === 'dangerous') break; // onaylanmamış dosya açılmaz
      if (TEST) return 'test';
      return shell.openPath(rec.savePath);
    case 'show': if (TEST) return 'test'; if (rec && rec.savePath) shell.showItemInFolder(rec.savePath); break;
    case 'remove':
      if (item) item.cancel();
      if (rec && rec.state === 'dangerous' && rec.finalPath) removeUnconfirmed(rec.savePath); // onaylanmamış dosya kalmasın
      store.update('downloads', (l = []) => l.filter((d) => d.id !== id), 'main');
      break;
    case 'retry': if (rec) { store.update('downloads', (l = []) => l.filter((d) => d.id !== id), 'main'); session.fromPartition('persist:vox').downloadURL(rec.url); } break;
    case 'openFolder': if (TEST) return 'test'; return shell.openPath(store.get('settings.downloads.location') || require('electron').app.getPath('downloads'));
    case 'clear': store.update('downloads', (l = []) => l.filter((d) => d.state === 'in_progress' || d.state === 'paused' || d.state === 'dangerous'), 'main'); break;
    default: break;
  }
  return true;
}

module.exports = { setup, action };
