/* VoxBrowser — yer imi yıldızı ve yakınlaştırma çipi.
   Yıldız: sayfa yer imindeyse dolu; tıklayınca (ya da Ctrl+D) ekler — sitenin simgesiyle birlikte — ve ad/klasör düzenleme
   balonunu açar. Ctrl+Shift+D tüm sekmeleri tarihli bir klasöre ekler. Yakınlaştırma çipi: sekme varsayılan yakınlaştırmada
   değilken görünür; balonda − % + ve Sıfırla. Kısayolla ya da Ctrl+tekerlekle değişince balon kendiliğinden açılır. */
Vox.define('toolbar.bookmark', (Vox) => {
  const { html, useState, useRef, useEffect } = Vox.p;
  const { Icon, IconButton, Button, Select, TextField } = Vox.c;
  const { cx, uid } = Vox.util;
  const tb = Vox.tb;

  const findIn = (node, url) => {
    if (!node || !url) return null;
    if (node.url === url) return node;
    for (const c of node.children || []) { const f = findIn(c, url); if (f) return f; }
    return null;
  };

  function StarButton({ tab }) {
    const url = tab ? tab.url : '';
    const on = Vox.useStore((s) => !!findIn(s.bookmarks, url));
    const ref = useRef();
    const was = useRef(on);
    useEffect(() => {
      if (on && !was.current && ref.current) Vox.motion.animate(ref.current.querySelector('svg'),
        [{ transform: 'scale(.4) rotate(-40deg)' }, { transform: 'scale(1.32) rotate(10deg)', offset: 0.6 }, { transform: 'none' }],
        { duration: 560, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'none' });
      was.current = on;
    }, [on]);
    // Yer imine eklenmiş ama simgesi olmayan sayfa ziyaret edilince simgesi tamamlanır.
    const fav = tb.favUrl(tab);
    useEffect(() => {
      if (!on || !fav) return;
      const n = Vox.bookmarks.findByUrl(url);
      if (n && !n.favicon) Vox.bookmarks.update(n.id, { favicon: fav });
    }, [on, fav, url]);
    const label = on ? 'Yer imini düzenle' : 'Bu sekmeyi yer imlerine ekle';
    return html`<button ref=${ref} type="button" class=${cx('tb-chipbtn tb-star', on && 'is-on')} data-anchor="bookmark" aria-pressed=${String(on)}
      aria-label=${label} data-tip=${label} data-cmd="bookmark.toggleCurrent" onClick=${(e) => tb.bookmarkCurrent({ anchor: e.currentTarget })}>
      <${Icon} name="star" size=${19}/></button>`;
  }

  let lastFolder = 'bar';
  const apply = (id, d) => {
    const n = Vox.bookmarks.get(id);
    if (d.removed || !n) return;
    const t = d.title.trim();
    if (t && t !== n.title) Vox.bookmarks.update(id, { title: t });
    const p = Vox.bookmarks.parentOf(id);
    if (d.folder && Vox.bookmarks.get(d.folder) && (!p || p.id !== d.folder)) Vox.bookmarks.move(id, d.folder);
    if (d.folder) lastFolder = d.folder;
  };

  async function askFolderName() {
    const model = { name: 'Yeni klasör' };
    const v = await Vox.ui.dialog({
      title: 'Yeni klasör', icon: 'folder-plus', width: 400,
      render: () => html`<${TextField} label="Klasör adı" value=${model.name} data-autofocus=${true} onInput=${(e) => { model.name = e.currentTarget.value; }}/>`,
      actions: [{ label: 'Vazgeç', variant: 'secondary', value: '' }, { label: 'Oluştur', variant: 'primary', onClick: () => model.name.trim() }],
    });
    return v || '';
  }

  function BookmarkPanel({ id, added, draft, close, anchor }) {
    tb.useOutsideClose(close, anchor);
    const wrap = useRef();
    const [title, setTitle] = useState(draft.title);
    const [folder, setFolder] = useState(draft.folder);
    Vox.useStore('bookmarks');
    useEffect(() => { tb.focusSoon(() => wrap.current && wrap.current.querySelector('input'), true); }, []);
    const options = [
      ...Vox.bookmarks.folders().map((f) => ({ value: f.id, label: `${'   '.repeat(Math.max(0, f.depth))}${f.title}`, icon: 'folder' })),
      { value: '__new', label: 'Yeni klasör…', icon: 'folder-plus' },
    ];
    const pick = async (v) => {
      if (v !== '__new') { setFolder(v); draft.folder = v; return; }
      const name = await askFolderName();
      if (!name) return;
      const fid = Vox.bookmarks.addFolder({ title: name, parentId: 'bar' });
      setFolder(fid); draft.folder = fid;
    };
    const remove = () => {
      const n = Vox.bookmarks.get(id);
      const p = Vox.bookmarks.parentOf(id);
      const index = p ? p.children.findIndex((c) => c.id === id) : undefined;
      draft.removed = true;
      Vox.bookmarks.remove(id);
      close();
      if (n) tb.toast('Yer imi kaldırıldı.', 'star-off', { action: { label: 'Geri al', onClick: () => Vox.bookmarks.insert(n, p ? p.id : 'bar', index) } });
    };
    return html`<div class="tb-bm" ref=${wrap}>
      <header class="tb-pop-head">
        <span class=${cx('tb-bm-badge', added && 'is-new')}><${Icon} name="star" size=${18}/></span>
        <h2 class="tb-pop-title">${added ? 'Yer imi eklendi' : 'Yer imini düzenle'}</h2>
        <${IconButton} icon="x" label="Kapat" size="sm" onClick=${() => close()}/>
      </header>
      <div class="tb-pop-body">
        <${TextField} label="Ad" value=${title} onInput=${(e) => { setTitle(e.currentTarget.value); draft.title = e.currentTarget.value; }}
          onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); close(); } }}/>
        <div class="tb-field"><span class="tf-label">Klasör</span><${Select} value=${folder} options=${options} label="Klasör" onChange=${pick}/></div>
      </div>
      <footer class="tb-pop-foot is-split">
        <${Button} variant="ghost" size="sm" onClick=${() => { close(); Vox.commands.run('open.bookmarks'); }}>Yer imi yöneticisi<//>
        <span class="tb-pop-actions">
          <${Button} variant="soft" size="sm" onClick=${remove}>Kaldır<//>
          <${Button} variant="primary" size="sm" onClick=${() => close()}>Bitti<//>
        </span>
      </footer>
    </div>`;
  }

  /** Bookmarks the active tab when needed (with its icon), then opens the edit bubble on the star (or a fallback anchor). */
  tb.bookmarkCurrent = ({ anchor } = {}) => {
    const tab = Vox.tabs.active();
    const a = anchor instanceof Element ? anchor : tb.anchor('bookmark');
    if (a && tb.closeOn(a)) return;
    if (!tab || tb.isNtp(tab.url)) { tb.toast('Yeni sekme sayfası yer imlerine eklenmez.', 'star'); return; }
    let node = Vox.bookmarks.findByUrl(tab.url);
    const added = !node;
    if (added) {
      const id = uid('bm');
      const now = Date.now();
      Vox.bookmarks.insert({ id, type: 'url', title: tab.title || tb.bare(tab.url), url: tab.url, ...(tb.favUrl(tab) ? { favicon: tb.favUrl(tab) } : {}), added: now, addedAt: now },
        Vox.bookmarks.get(lastFolder) ? lastFolder : 'bar');
      node = Vox.bookmarks.get(id);
      if (a) { const r = a.getBoundingClientRect(); Vox.motion.burst(r.left + r.width / 2, r.top + r.height / 2, { colors: ['#F5B83D', '#04A761', '#FFD77A', '#34C584'] }); }
    }
    if (!node) return;
    const draft = { title: node.title, folder: (Vox.bookmarks.parentOf(node.id) || {}).id || 'bar', removed: false };
    Vox.ui.popover({
      anchor: a, placement: 'bottom-end', width: 344, className: 'tb-pop', label: added ? 'Yer imi eklendi' : 'Yer imini düzenle',
      persistent: true, autoFocus: false,
      render: ({ close }) => html`<${BookmarkPanel} id=${node.id} added=${added} draft=${draft} close=${close} anchor=${a}/>`,
      onClose: () => apply(node.id, draft),
    });
  };

  /** Ctrl+Shift+D: every open page into a new dated folder under "Diğer yer imleri". */
  tb.bookmarkAllTabs = () => {
    const tabs = Vox.tabs.all().filter((t) => !tb.isNtp(t.url) && t.url);
    if (!tabs.length) { tb.toast('Yer imine eklenecek sekme yok.', 'bookmark'); return; }
    const now = Date.now();
    const title = `Sekmeler — ${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(now)}`;
    const children = tabs.map((t) => ({ id: uid('bm'), type: 'url', title: t.title || tb.bare(t.url), url: t.url, ...(tb.favUrl(t) ? { favicon: tb.favUrl(t) } : {}), added: now, addedAt: now }));
    Vox.bookmarks.insert({ id: uid('bm'), type: 'folder', title, children, added: now, addedAt: now }, 'other');
    tb.toast(`${tabs.length} sekme “${title}” klasörüne eklendi.`, 'bookmark-plus', { tone: 'success', action: { label: 'Göster', onClick: () => Vox.commands.run('open.bookmarks') } });
  };

  /* ── Yakınlaştırma ────────────────────────────────────── */
  const defZoom = () => Number(Vox.settings.get('appearance.pageZoom')) || 100;
  function ZoomChip({ tab }) {
    const def = Number(Vox.useStore('settings.appearance.pageZoom')) || 100;
    const z = tab ? tab.zoom || 100 : 100;
    if (!tab || z === def) return null;
    const label = `Yakınlaştırma: %${z}`;
    return html`<button type="button" class="tb-chipbtn tb-zoomchip" data-anchor="zoom" aria-label=${label} data-tip=${label}
      onClick=${(e) => tb.openZoom(e.currentTarget)}><${Icon} name=${z > def ? 'zoom-in' : 'zoom-out'} size=${18}/></button>`;
  }

  function ZoomPanel({ close, auto }) {
    const tab = tb.useActiveTab();
    const def = Number(Vox.useStore('settings.appearance.pageZoom')) || 100;
    const z = tab ? tab.zoom || 100 : 100;
    const [hold, setHold] = useState(false);
    useEffect(() => {
      if (!auto || hold) return undefined;
      const t = setTimeout(() => close(), 2400);
      return () => clearTimeout(t);
    }, [auto, hold, z]);
    useEffect(() => { if (!tab || (auto && z === def)) close(); }, [z, !tab]);
    const run = (id) => () => Vox.commands.run(id);
    return html`<div class="tb-zoom" onPointerEnter=${() => setHold(true)} onPointerLeave=${() => setHold(false)} onFocusIn=${() => setHold(true)}>
      <output class="tb-zoom-val" aria-live="polite">%${z}</output>
      <${IconButton} icon="minus" label="Uzaklaştır" cmd="page.zoomOut" size="sm" variant="soft" disabled=${z <= 25} onClick=${run('page.zoomOut')}/>
      <${IconButton} icon="plus" label="Yakınlaştır" cmd="page.zoomIn" size="sm" variant="soft" disabled=${z >= 500} onClick=${run('page.zoomIn')}/>
      <${Button} size="sm" variant="secondary" disabled=${z === def} onClick=${() => { if (tab) Vox.tabs.setZoom(tab.id, def); close(); }}>Sıfırla<//>
    </div>`;
  }

  const zoomOpen = () => Vox.overlay.list().some((l) => l.kind === 'popover' && !l.closing && String(l.className).includes('tb-zoompop'));
  tb.openZoom = (anchor, auto) => {
    const a = anchor instanceof Element ? anchor : tb.anchor('zoom');
    if (!a || (!auto && tb.closeOn(a))) return;
    if (auto && (zoomOpen() || tb.overlayOpen())) return;
    Vox.ui.popover({
      anchor: a, placement: 'bottom-end', className: 'tb-pop tb-zoompop', label: 'Yakınlaştırma', autoFocus: !auto,
      render: ({ close }) => html`<${ZoomPanel} close=${close} auto=${!!auto}/>`,
    });
  };
  /* Kısayolla ya da Ctrl+tekerlekle değişince balon çipten açılır. */
  Vox.bus.on('tab:zoom', ({ tabId, zoom }) => {
    if (tabId !== Vox.store.get('activeTabId') || zoom === defZoom()) return;
    let tries = 0;
    const wait = () => {
      const chip = document.querySelector('[data-anchor="zoom"]');
      if (chip && chip.getClientRects().length) tb.openZoom(chip, true);
      else if (++tries < 12) requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
  });
  /* Balon açıkken arayüz sayfanın üstündedir: Ctrl+tekerlek yakınlaştırmayı sürdürsün. */
  let lastWheel = 0;
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !zoomOpen()) return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastWheel < 80) return;
    lastWheel = now;
    const t = Vox.tabs.active();
    if (t && e.deltaY) Vox.tabs.zoomBy(t.id, e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  tb.StarButton = StarButton;
  tb.ZoomChip = ZoomChip;
  Vox.commands.register('bookmark.toggleCurrent', { title: 'Bu sekmeyi yer imlerine ekle', icon: 'star', run: () => tb.bookmarkCurrent() });
  Vox.commands.register('bookmark.allTabs', { title: 'Tüm sekmeleri yer imlerine ekle', icon: 'bookmark-plus', run: (a = {}) => { tb.bookmarkAllTabs(); if (a.fromPage) Vox.nav.focusPage(); } });
  Vox.keys.bind('Ctrl+Shift+D', 'bookmark.allTabs');
});
