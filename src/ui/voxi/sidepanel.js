/* voxi — yan panel kabuğu (SidePanel yuvası): çalışma alanının solunda, sayfa sütununun yanında durur; kapalıyken
   hiçbir şey çizmez. Açılınca sayfa alanı hemen daralır (çekirdek yeni konumu bildirir), panel içeriği soldan kayar.
   Sürükleyerek ya da klavyeyle (oklar, Home/End) boyutlanır; genişlik settings.ui.voxi.sidePanelWidth'te saklanır.
   Sürüklerken arayüz sayfanın üstüne alınır (Vox.ui.raise), yoksa imleç sayfaya geçince olaylar sayfaya giderdi. */
Vox.define('voxi.sidepanel', (Vox) => {
  const { html, useRef, useState, useLayoutEffect, useEffect } = Vox.p;
  const { Icon, IconButton, MenuButton } = Vox.c;
  const { cx, clamp } = Vox.util;
  const store = Vox.store;
  const vx = Vox.vx;
  const MIN = 300, MAX = 640, DEFAULT = 380, PAGE_MIN = 240;
  const TABS = [
    { id: 'voxi', label: 'Voxi', icon: 'audio-lines' },
    { id: 'bookmarks', label: 'Yer imleri', icon: 'bookmark' },
    { id: 'history', label: 'Geçmiş', icon: 'history' },
    { id: 'reading', label: 'Okuma listesi', icon: 'book-open' },
  ];
  const PAGE = { bookmarks: ['open.bookmarks', 'Yer imi yöneticisini aç'], history: ['open.history', 'Geçmiş sayfasını aç'] };

  /** Pill tab switcher: the active tab shows its label, the others only an icon (with tooltip + aria-label). */
  function Switcher({ value, tabs }) {
    const ref = useRef();
    const [thumb, setThumb] = useState(null);
    useLayoutEffect(() => {
      const measure = () => {
        const el = ref.current && ref.current.querySelector('[aria-selected="true"]');
        if (el) setThumb((p) => (p && p.left === el.offsetLeft && p.width === el.offsetWidth ? p : { left: el.offsetLeft, width: el.offsetWidth }));
      };
      measure();
      if (!window.ResizeObserver || !ref.current) return undefined;
      const ro = new ResizeObserver(measure);
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, [value, tabs.length]);
    const onKeyDown = (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const i = tabs.findIndex((t) => t.id === value);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      Vox.voxi.openPanel(tabs[n].id);
      setTimeout(() => { const el = ref.current && ref.current.querySelector('[aria-selected="true"]'); if (el) el.focus(); }, 0);
    };
    return html`<div class="vx-seg" role="tablist" aria-label="Yan panel" ref=${ref} onKeyDown=${onKeyDown}>
      ${thumb ? html`<span class="vx-seg-thumb" style=${`transform:translateX(${thumb.left}px);width:${thumb.width}px`}></span>` : null}
      ${tabs.map((t) => {
        const on = t.id === value;
        return html`<button type="button" role="tab" key=${t.id} id=${`vx-tab-${t.id}`} aria-controls="vx-sp-body" aria-selected=${String(on)}
          tabindex=${on ? 0 : -1} class=${cx('vx-seg-opt', on && 'is-on')} aria-label=${t.label} data-tip=${on ? undefined : t.label}
          onClick=${() => Vox.voxi.openPanel(t.id)}><${Icon} name=${t.icon} size=${18}/>${on ? html`<span class="vx-seg-label">${t.label}</span>` : null}</button>`;
      })}
    </div>`;
  }

  const VoxiMenu = () => html`<${MenuButton} icon="ellipsis-vertical" label="Voxi seçenekleri" size="sm" items=${() => [
    { label: 'Konuşmayı temizle', icon: 'eraser', disabled: !(store.get('voxi.messages') || []).length, onSelect: () => Vox.voxi.clear() },
    { label: 'Voxi ayarları', icon: 'settings', onSelect: () => Vox.commands.run('open.settings', { section: 'voxi' }) },
    '-',
    { label: "Voxi'yi kapat", icon: 'power', hint: 'Ayarlar › Voxi bölümünden yeniden açabilirsiniz', onSelect: () => Vox.settings.set('voxi.enabled', false) },
  ]}/>`;

  const maxW = () => {
    const ws = document.querySelector('.workspace');
    return Math.max(MIN, Math.min(MAX, ws ? ws.clientWidth - PAGE_MIN : MAX));
  };

  function Resizer({ width, setLive }) {
    const save = (v) => { setLive(null); Vox.settings.set('ui.voxi.sidePanelWidth', Math.round(clamp(v, MIN, MAX))); };
    const onDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = e.currentTarget;
      el.focus({ preventScroll: true }); // sonra ok tuşlarıyla da ayarlanabilsin
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* sentetik olay: yakalama yok */ }
      const left = el.closest('.vx-sp').getBoundingClientRect().left;
      const root = document.documentElement;
      root.classList.add('is-resizing', 'resize-x');
      Vox.ui.raise('vx-resize', true);
      let w = width;
      const move = (ev) => { w = Math.round(clamp(ev.clientX - left, MIN, maxW())); setLive(w); };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        root.classList.remove('is-resizing', 'resize-x');
        Vox.ui.raise('vx-resize', false);
        save(w);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    const onKey = (e) => {
      const step = e.shiftKey ? 64 : 16;
      const map = { ArrowRight: width + step, ArrowLeft: width - step, Home: MIN, End: maxW() };
      if (map[e.key] === undefined) return;
      e.preventDefault();
      save(Math.min(map[e.key], maxW()));
    };
    return html`<div class="vx-sp-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Yan panelin genişliği"
      aria-valuenow=${width} aria-valuemin=${MIN} aria-valuemax=${MAX} onPointerDown=${onDown} onKeyDown=${onKey} onDblClick=${() => save(DEFAULT)}></div>`;
  }

  /** Mounted while open (and during the slide-out); renders nothing once closed. */
  function SidePanel() {
    const open = Vox.useStore('ui.sidePanel');
    const enabled = Vox.useStore('settings.voxi.enabled') !== false;
    const saved = Number(Vox.useStore('settings.ui.voxi.sidePanelWidth')) || DEFAULT;
    const [live, setLive] = useState(null);
    const [shown, setShown] = useState(open);
    const [slid, setSlid] = useState(false);
    useEffect(() => {
      if (open) {
        setShown(open);
        let r2 = 0;
        const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setSlid(true)); });
        return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
      }
      setSlid(false);
      const t = setTimeout(() => setShown(null), Vox.motion.reduced() ? 0 : 230);
      return () => clearTimeout(t);
    }, [open]);
    const width = Math.round(clamp(live != null ? live : saved, MIN, MAX));
    useEffect(() => { if (store.get('ui.sidePanelWidth') !== width) store.set('ui.sidePanelWidth', width); }, [width]);
    const id = open || shown;
    if (!id) return null;
    const tabs = TABS.filter((t) => t.id !== 'voxi' || enabled);
    const Body = { voxi: vx.VoxiPanel, bookmarks: vx.BookmarksPanel, history: vx.HistoryPanel, reading: vx.ReadingPanel }[id];
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target.matches && e.target.matches('input') && e.target.value) return; // önce arama kutusu temizlensin
      e.preventDefault();
      Vox.voxi.closePanel();
    };
    return html`<aside class=${cx('vx-sp', slid && open && 'is-open', live != null && 'is-sizing')} style=${`--vx-sp-w:${width}px`} aria-label="Yan panel" onKeyDown=${onKeyDown}>
      <div class="vx-sp-in">
        <div class="vx-sp-head">
          <${Switcher} value=${id} tabs=${tabs}/>
          <span class="vx-sp-gap"></span>
          ${id === 'voxi' ? html`<${VoxiMenu}/>` : PAGE[id] ? html`<${IconButton} icon="external-link" size="sm" label=${PAGE[id][1]} onClick=${() => Vox.commands.run(PAGE[id][0])}/>` : null}
          <${IconButton} icon="x" size="sm" label="Yan paneli kapat" onClick=${() => Vox.voxi.closePanel()}/>
        </div>
        <div class="vx-sp-body" id="vx-sp-body" role="tabpanel" aria-labelledby=${`vx-tab-${id}`} key=${id}>
          ${Body ? html`<${Body}/>` : null}
        </div>
        ${open ? html`<${Resizer} width=${width} setLive=${setLive}/>` : null}
      </div>
    </aside>`;
  }

  Vox.c.SidePanel = SidePanel;
});
