/* chrome · sekme önizleme kartı: ~600 ms beklemeden sonra başlık, alan adı + güvenlik durumu, arka plandaki
   sekmeler için sayfanın gerçek küçük görüntüsü (ana süreç yakalar) ve sekme sürecinin gerçek bellek kullanımı.
   Kart açıkken başka sekmeye geçince beklemeden kayar. Kart sayfanın üstüne taştığı için görünürken arayüz öne alınır. */
Vox.define('chrome.preview', (Vox) => {
  const { html, render, useState, useEffect } = Vox.p;
  const { Icon, Favicon } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const ch = Vox.ch;

  let st = { id: null, x: 0, y: 0, on: false, slide: false };
  const subs = new Set();
  const set = (p) => { st = { ...st, ...p }; subs.forEach((f) => f(st)); };
  let showT = 0, hideT = 0, lastOff = 0, host = null, over = null;
  const W = 288;

  /* ── Gerçek küçük görüntü + bellek (sekme başına kısa süre önbellekte) ── */
  const shots = new Map(); // tabId → { image, memory, at, pending }
  const shotSubs = new Set();
  function capture(id) {
    const c = shots.get(id);
    if (c && (c.pending || Date.now() - c.at < 3000)) return;
    shots.set(id, { ...(c || {}), pending: true });
    const width = Math.round(W * Math.min(2, window.devicePixelRatio || 1));
    Vox.native.invoke('tabs:capture', { tabId: id, width })
      .then((r) => ({ image: (r && r.image) || null, memory: r && r.memory != null ? r.memory : null }), () => ({ image: null, memory: null }))
      .then((r) => { shots.set(id, { ...r, at: Date.now(), pending: false }); shotSubs.forEach((f) => f()); });
  }
  store.subscribe((s, p) => {
    if (s.tabs === p.tabs || !shots.size) return;
    const ids = new Set((s.tabs || []).map((t) => t.id));
    for (const id of Array.from(shots.keys())) if (!ids.has(id)) shots.delete(id);
  });

  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.className = 'ch-hc-root';
    document.body.appendChild(host);
    render(html`<${HoverCard}/>`, host);
  }
  const place = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(Math.max(8, Math.min(r.left, innerWidth - W - 8))), y: Math.round(r.bottom + 8) };
  };

  ch.preview = {
    hover(id, el) {
      if (store.get('settings.appearance.tabPreviews') === false) return;
      if (window.matchMedia && matchMedia('(hover: none)').matches) return;
      clearTimeout(showT);
      clearTimeout(hideT);
      over = el;
      const warm = st.on || Date.now() - lastOff < 450;
      const show = () => {
        if (over !== el || !el.isConnected || ch.dragging) return;
        mount();
        if (id !== store.get('activeTabId')) capture(id);
        set({ id, ...place(el), on: true, slide: st.on && st.id !== id });
      };
      if (warm) show(); else showT = setTimeout(show, 600);
    },
    leave() { over = null; clearTimeout(showT); clearTimeout(hideT); hideT = setTimeout(ch.preview.hide, 90); },
    hide() {
      over = null;
      clearTimeout(showT);
      clearTimeout(hideT);
      if (st.on) { lastOff = Date.now(); set({ on: false, slide: false }); }
    },
  };
  // Menü, diyalog ya da açılır panel açılınca kart çekilir; pencere odağını kaybedince de.
  Vox.overlay.subscribe((layers) => { if (st.on && layers.some((l) => l.kind !== 'tooltip' && l.kind !== 'toast' && !l.closing)) ch.preview.hide(); });
  window.addEventListener('blur', () => ch.preview.hide());

  /* ── Kart parçaları ───────────────────────────────────── */
  function Host({ tab }) {
    const u = Vox.url.parse(tab.url);
    const hostName = (u.host || '').replace(/^www\./, '');
    if (tab.internal && tab.security !== 'error') return html`<div class="ch-hc-host"><${Favicon} spec=${{ logo: true }} size=${14}/><span>VoxBrowser</span></div>`;
    if (tab.security === 'secure') return html`<div class="ch-hc-host"><${Icon} name="lock" size=${13}/><span>${hostName}</span></div>`;
    if (tab.security === 'insecure') return html`<div class="ch-hc-host is-warn"><${Icon} name="triangle-alert" size=${13}/><span>Güvenli değil · ${hostName}</span></div>`;
    if (tab.security === 'error') return html`<div class="ch-hc-host is-warn"><${Icon} name="triangle-alert" size=${13}/><span>${hostName ? `Açılamadı · ${hostName}` : 'Sayfa açılamadı'}</span></div>`;
    if (tab.security === 'file') return html`<div class="ch-hc-host"><${Icon} name="file" size=${13}/><span>Bu bilgisayardaki dosya</span></div>`;
    return html`<div class="ch-hc-host"><${Icon} name="info" size=${13}/><span>${hostName || (u.scheme === 'about' ? 'about:blank' : `${u.scheme || 'yerel'}: adresi`)}</span></div>`;
  }

  const CRASH = { oom: 'Bellek yetmedi', killed: 'Sekmenin süreci sonlandırıldı' };
  function Thumb({ tab, shot }) {
    if (tab.crashed) return html`<div class="ch-hc-thumb is-crashed"><${Icon} name="frown" size=${30}/><span>${CRASH[tab.crashReason] || 'Sekme çöktü'}</span></div>`;
    if (shot && shot.image) return html`<div class="ch-hc-thumb"><img class="ch-hc-img" src=${shot.image} alt="" draggable="false"/></div>`;
    if (!shot || shot.pending) return html`<div class="ch-hc-thumb is-loading" aria-hidden="true"><span class="skel"></span></div>`;
    // Görüntü alınamadı (sekme hiç çizilmedi ya da iç sayfa): sitenin rengiyle sade bir kapak.
    return html`<div class="ch-hc-thumb is-art" style=${`--tc:${ch.tint(tab.url)}`} aria-hidden="true">
      <span class="ch-hc-art"><${Favicon} spec=${tab.favicon} size=${28}/></span>
    </div>`;
  }

  function Foot({ tab, shot }) {
    const parts = [];
    if (tab.crashed) parts.push(['frown', 'Yeniden yüklemek için sekmeye geçin']);
    else if (tab.loading) parts.push(['loader', 'Yükleniyor…']);
    else if (shot && shot.memory != null) parts.push(['memory-stick', `Bellek: ${Vox.fmt.bytes(shot.memory * 1024)}`]);
    if (tab.muted) parts.push(['volume-x', 'Sesi kapalı']);
    else if (tab.audible) parts.push(['volume-2', 'Ses çalıyor']);
    if (!parts.length) return null;
    return html`<div class="ch-hc-foot">${parts.map(([ic, text]) => html`<span key=${ic}><${Icon} name=${ic} size=${14}/>${text}</span>`)}</div>`;
  }

  function HoverCard() {
    const [s, setS] = useState(st);
    const [vis, setVis] = useState('off');
    const [, redraw] = useState(0);
    useEffect(() => { subs.add(setS); setS(st); return () => subs.delete(setS); }, []);
    useEffect(() => { const f = () => redraw((x) => x + 1); shotSubs.add(f); return () => shotSubs.delete(f); }, []);
    const tab = Vox.useStore((x) => x.tabs.find((t) => t.id === s.id) || null);
    const activeId = Vox.useStore('activeTabId');
    useEffect(() => {
      if (s.on) { setVis('in'); return undefined; }
      setVis((v) => (v === 'off' ? v : 'out'));
      const t = setTimeout(() => setVis('off'), Vox.motion.reduced() ? 0 : 150);
      return () => clearTimeout(t);
    }, [s.on]);
    useEffect(() => { if (s.on && !tab) ch.preview.hide(); }, [tab, s.on]);
    // Kart sayfa alanına taşar: görünür olduğu sürece arayüz sayfanın üstünde tutulur.
    const shown = vis !== 'off' && !!tab;
    useEffect(() => { Vox.ui.raise('ch-hovercard', shown); }, [shown]);
    useEffect(() => () => Vox.ui.raise('ch-hovercard', false), []);
    // Bellek satırı için etkin sekmenin de ölçümü alınır (görüntüsü gösterilmez).
    useEffect(() => { if (s.on && tab && tab.id === activeId) capture(tab.id); }, [s.on, s.id, activeId]);
    if (!shown) return null;
    const active = tab.id === activeId;
    const shot = shots.get(tab.id);
    return html`<div class=${cx('ch-hc', vis === 'in' && !s.slide && 'is-in', vis === 'out' && 'is-out', s.slide && 'is-slide', active && 'is-current')}
      style=${`translate:${s.x}px ${s.y}px`} aria-hidden="true">
      <div class="ch-hc-title">${tab.title || Vox.url.display(tab.url)}</div>
      <${Host} tab=${tab}/>
      ${active ? null : html`<${Thumb} tab=${tab} shot=${shot}/>`}
      <${Foot} tab=${tab} shot=${shot}/>
    </div>`;
  }
});
