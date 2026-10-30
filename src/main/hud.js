'use strict';
/* VoxBrowser — HUD: sayfanın üstünde duran ama tıklamayı yalnızca kendi alanında tutan iki küçük görünüm:
   durum balonu (bağlantı adresi, sol alt) ve bildirimler (toast, alt orta).
   Her biri ayrı bir işleyici süreci demek (~30 MB); bu yüzden ilk gerektiğinde oluşturulur, açılışta değil. */
const path = require('path');
const { WebContentsView } = require('electron');

const HUD_URL = 'vox://ui/hud/hud.html'; // src/hud, arayüzle aynı protokolden
const PRELOAD_HUD = path.join(__dirname, '..', 'preload', 'hud.js');

function makeView(kind) {
  const v = new WebContentsView({ webPreferences: { preload: PRELOAD_HUD, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  v.setBackgroundColor('#00000000');
  v.setVisible(false);
  // Animasyon kararı arayüzle aynı: Uzak Masaüstü ya da "Her zaman açık" → bildirimler kayarak gelir.
  const a = require('./store').get('settings.a11y') || {};
  const motion = !a.reduceMotion && (a.forceMotion || a.remoteSession) ? 'full' : '';
  v.webContents.loadURL(`${HUD_URL}?kind=${kind}&motion=${motion}`);
  v.webContents.on('will-navigate', (e) => e.preventDefault());
  v.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return v;
}

class Hud {
  constructor(win) {
    this.win = win;
    this.statusView = null;
    this.toastView = null;
    this.ready = { status: false, toast: false };
    this.queue = [];
    this.toastHeight = 0;
    this.statusText = '';
  }
  /** Creates a HUD view on first use; messages sent before its page loads are delivered once it is ready. */
  view(kind) {
    const key = kind === 'status' ? 'statusView' : 'toastView';
    if (!this[key]) {
      const v = makeView(kind);
      this[key] = v;
      this.win.win.contentView.addChildView(v);
      v.webContents.once('did-finish-load', () => {
        this.ready[kind] = true;
        if (kind === 'status' && this.statusText) this.status(this.statusText);
        if (kind === 'toast') { for (const t of this.queue.splice(0)) v.webContents.send('hud:toast', t); }
      });
      this.win.restack();
    }
    return this[key];
  }
  restack() {
    const cv = this.win.win.contentView;
    for (const v of [this.statusView, this.toastView]) if (v) cv.addChildView(v);
  }
  layout() {
    const vp = this.win.viewport;
    if (this.statusText && this.statusView) {
      const w = Math.min(560, Math.max(160, Math.round(vp.width * 0.6)));
      this.statusView.setBounds({ x: vp.x, y: vp.y + vp.height - 32, width: w, height: 32 });
    }
    if (this.toastHeight > 0 && this.toastView) {
      const w = Math.min(560, Math.max(280, vp.width - 32));
      this.toastView.setBounds({ x: Math.round(vp.x + (vp.width - w) / 2), y: vp.y + vp.height - this.toastHeight - 12, width: w, height: this.toastHeight });
    }
  }
  status(text) {
    this.statusText = text || '';
    if (!this.statusText) { if (this.statusView) this.statusView.setVisible(false); return; }
    const v = this.view('status');
    if (!this.ready.status) return; // sayfa yüklenince gösterilir
    this.layout();
    v.webContents.send('hud:status', this.statusText);
    v.setVisible(true);
  }
  toast(t) {
    const v = this.view('toast');
    // Gizli görünüm kare çizmez (sayfanın ölçümü hiç gelmez): önce varsayılan boyutta gösterilir, sayfa gerçek yüksekliği bildirir.
    if (this.toastHeight === 0) this.setToastHeight(72);
    if (this.ready.toast) v.webContents.send('hud:toast', t); else this.queue.push(t);
  }
  /** The toast page reports how tall its stack is; 0 hides the view. */
  setToastHeight(h) {
    this.toastHeight = Math.max(0, Math.min(400, Math.round(h || 0)));
    if (!this.toastView) return;
    if (this.toastHeight > 0) { this.layout(); this.toastView.setVisible(true); } else this.toastView.setVisible(false);
  }
  owns(wc) { return !!wc && ((this.statusView && wc === this.statusView.webContents) || (this.toastView && wc === this.toastView.webContents)); }
  destroy() {
    for (const v of [this.statusView, this.toastView]) { if (v) { try { v.webContents.close(); } catch (e) { /* yok say */ } } }
  }
}

module.exports = { Hud };
