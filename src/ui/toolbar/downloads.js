/* VoxBrowser — indirilenler (gerçek Chromium indirmeleri).
   Düğme (data-anchor="downloads"): son 24 saatte indirme varken görünür; sürenlerde ilerleme halkası, bitince zıplar.
   İndirme başlayınca dosya simgesi sayfadan düğmeye uçar ve (ayara göre) panel açılır. Panel (downloads.panel): ilerleme,
   hız / kalan süre, duraklat / sürdür / iptal, aç, klasörde göster, tehlikeli dosyada Koru / Sil, başarısızda yeniden dene. */
Vox.define('toolbar.downloads', (Vox) => {
  const { html, useRef, useState, useEffect } = Vox.p;
  const { Icon, IconButton, Button, ProgressRing, ProgressBar, EmptyState, MenuButton } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const tb = Vox.tb;
  const F = Vox.fmt;
  const DAY = 86400e3;

  const isActive = (d) => d.state === 'in_progress' || d.state === 'paused';
  /** Downloads of this kind of window (private windows see only their own). */
  const mine = (list, priv) => (list || []).filter((d) => !!d.private === !!priv);
  const recent = (d) => isActive(d) || d.state === 'dangerous' || Date.now() - (d.endedAt || d.startedAt || 0) < DAY;
  const BOUNCE = [{ transform: 'none' }, { transform: 'translateY(-6px) scale(1.14)', offset: 0.3 }, { transform: 'translateY(1px) scale(.95)', offset: 0.62 }, { transform: 'none' }];
  const CATCH = [{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: 0.4 }, { transform: 'scale(1)' }];

  function DownloadsButton() {
    const all = Vox.useStore('downloads');
    const priv = Vox.useStore('window.private');
    const ref = useRef();
    const [done, setDone] = useState(false);
    Vox.useBus('download:done', ({ state }) => {
      if (state !== 'complete') return;
      setDone(true);
      setTimeout(() => setDone(false), 1800);
      if (ref.current) Vox.motion.animate(ref.current, BOUNCE, { duration: 680, easing: 'ease-out', fill: 'none' });
    });
    const list = mine(all, priv).filter(recent);
    if (!list.length) return null;
    const active = list.filter(isActive);
    const running = active.some((d) => d.state === 'in_progress');
    const danger = list.some((d) => d.state === 'dangerous');
    const known = active.filter((d) => d.size > 0);
    const size = known.reduce((a, d) => a + d.size, 0);
    const got = known.reduce((a, d) => a + (d.received || 0), 0);
    const pct = size ? got / size : 0;
    const label = active.length ? `İndirilenler: ${active.length} dosya iniyor${size ? `, %${Math.round(pct * 100)}` : ''}` : danger ? 'İndirilenler: onay bekleyen dosya var' : 'İndirilenler';
    return html`<button ref=${ref} type="button" class=${cx('ibtn tb-dl', active.length && 'is-active', done && 'is-done', danger && 'is-danger')}
      data-anchor="downloads" aria-label=${label} aria-haspopup="dialog" data-tip="İndirilenler" data-cmd="downloads.panel"
      onClick=${(e) => Vox.commands.run('downloads.panel', { anchor: e.currentTarget })}>
      ${active.length
        ? html`<span class=${cx('tb-dl-ring', !size && 'is-indet')}><${ProgressRing} value=${size ? pct : 0.28} size=${32} stroke=${3} label="İndirme ilerlemesi">
            <${Icon} name=${running ? 'arrow-down' : 'pause'} size=${15} class=${running ? 'tb-dl-arrow' : ''}/><//></span>`
        : html`<span class="tb-swap" key=${done ? 'd' : 'n'}><${Icon} name=${done ? 'circle-check' : 'download'} size=${20}/></span>`}
      ${danger ? html`<span class="tb-dl-dot" aria-hidden="true"></span>` : null}
    </button>`;
  }

  /** "17,2 / 45,8 MB" when both sizes share a unit. */
  const pair = (a, b) => { const x = F.bytes(a).split(' '), y = F.bytes(b); return x[1] && y.endsWith(` ${x[1]}`) ? `${x[0]} / ${y}` : `${x.join(' ')} / ${y}`; };
  function statusOf(d) {
    const of = d.size ? pair(d.received, d.size) : F.bytes(d.received);
    switch (d.state) {
      case 'in_progress':
        if (!d.speed) return [`${of} · başlıyor…`];
        return [`${of} · ${d.size ? F.eta((d.size - d.received) / d.speed) : F.speed(d.speed)}`];
      case 'paused': return [`Duraklatıldı · ${of}`, 'warn'];
      case 'complete': return [`${F.bytes(d.size || d.received)} · ${F.rel(d.endedAt || d.startedAt)}`];
      case 'failed': return [`Başarısız: ${d.error || 'ağ ya da disk hatası'}`, 'danger'];
      case 'cancelled': return ['İptal edildi', 'muted'];
      case 'dangerous': return ['Onayınızı bekliyor', 'danger'];
      default: return [''];
    }
  }

  const keep = async (d) => {
    const ok = await Vox.ui.confirm({ title: 'Dosya korunsun mu?', text: `“${d.filename}” bilgisayarınıza zarar verebilir. Yalnızca kaynağına güveniyorsanız koruyun.`, confirmLabel: 'Koru', cancelLabel: 'Vazgeç', danger: true });
    if (ok) Vox.downloads.keep(d.id);
  };

  function DlRow({ d }) {
    const [status, tone] = statusOf(d);
    const pct = d.size ? Math.min(1, d.received / d.size) : 0;
    const host = tb.host(d.url) || 'bilinmeyen kaynak';
    const done = d.state === 'complete';
    const Main = done ? 'button' : 'div';
    const ctx = (e) => Vox.ui.contextMenu(e, [
      done ? { label: 'Aç', icon: 'file', onSelect: () => Vox.downloads.open(d.id) } : null,
      done ? { label: 'Klasörde göster', icon: 'folder-open', onSelect: () => Vox.downloads.showInFolder(d.id) } : null,
      { label: 'İndirme bağlantısını kopyala', icon: 'link', disabled: !d.url, onSelect: () => tb.copy(d.url, 'İndirme bağlantısı') },
      '-',
      { label: 'Listeden kaldır', icon: 'trash-2', disabled: isActive(d) || d.state === 'dangerous', onSelect: () => Vox.downloads.remove(d.id) },
    ].filter(Boolean));
    return html`<li class=${cx('tb-dl-row', `is-${d.state}`)} onContextMenu=${ctx}>
      <${Main} type=${done ? 'button' : undefined} class="tb-dl-main" aria-label=${done ? `${d.filename} dosyasını aç` : undefined} onClick=${done ? () => Vox.downloads.open(d.id) : undefined}>
        <span class="tb-dl-ic"><${Icon} name=${tb.fileIcon(d)} size=${20}/></span>
        <span class="tb-dl-text">
          <span class="tb-dl-name" title=${d.savePath || d.filename}>${d.filename}</span>
          <span class=${cx('tb-dl-status', tone && `is-${tone}`)}>${status}</span>
          ${isActive(d) ? html`<${ProgressBar} value=${pct} indeterminate=${!d.size && d.state === 'in_progress'} tone=${d.state === 'paused' ? 'honey' : undefined} label=${`${d.filename} ilerlemesi`}/>` : null}
        </span>
      <//>
      <span class="tb-dl-acts">
        ${d.state === 'in_progress' ? html`<${IconButton} icon="pause" size="sm" label="Duraklat" onClick=${() => Vox.downloads.pause(d.id)}/>` : null}
        ${d.state === 'paused' ? html`<${IconButton} icon="play" size="sm" label="Sürdür" onClick=${() => Vox.downloads.resume(d.id)}/>` : null}
        ${isActive(d) ? html`<${IconButton} icon="x" size="sm" label="İptal et" onClick=${() => Vox.downloads.cancel(d.id)}/>` : null}
        ${done ? html`<${IconButton} icon="folder-open" size="sm" label="Klasörde göster" onClick=${() => Vox.downloads.showInFolder(d.id)}/>` : null}
        ${(d.state === 'failed' || d.state === 'cancelled') && d.url ? html`<${IconButton} icon="rotate-ccw" size="sm" label="Yeniden dene" onClick=${() => Vox.downloads.retry(d.id)}/>` : null}
      </span>
      ${d.state === 'dangerous' ? html`<div class="tb-dl-warn" role="alert">
        <span class="tb-dl-warn-ic"><${Icon} name="triangle-alert" size=${18}/></span>
        <p><b>Bu dosya tehlikeli olabilir</b><small>${d.danger || `${host} kaynağından gelen bu tür dosyalar bilgisayarınıza zarar verebilir.`}</small></p>
        <div class="tb-dl-warn-acts">
          <${Button} size="sm" variant="ghost" onClick=${() => keep(d)}>Koru<//>
          <${Button} size="sm" variant="danger" icon="trash-2" onClick=${() => Vox.downloads.discard(d.id)}>Sil<//>
        </div>
      </div>` : null}
    </li>`;
  }

  function DownloadsPanel({ close, auto, anchor }) {
    tb.useOutsideClose(close, anchor);
    const all = Vox.useStore('downloads');
    const priv = Vox.useStore('window.private');
    const list = mine(all, priv);
    const [hold, setHold] = useState(!auto);
    useEffect(() => {
      if (hold) return undefined;
      const t = setTimeout(() => close(), 5000);
      return () => clearTimeout(t);
    }, [hold]);
    const rank = (d) => (d.state === 'dangerous' ? 0 : isActive(d) ? 1 : 2);
    const items = list.slice().sort((a, b) => rank(a) - rank(b) || (b.startedAt || 0) - (a.startedAt || 0)).slice(0, 6);
    const running = list.filter((d) => d.state === 'in_progress');
    const speed = running.reduce((a, d) => a + (d.speed || 0), 0);
    const meta = running.length ? `${running.length} dosya iniyor${speed ? ` · ${F.speed(speed)}` : ''}` : list.length > items.length ? `${list.length} dosyadan ${items.length} tanesi` : '';
    return html`<div class="tb-dlp" onPointerEnter=${() => setHold(true)} onFocusIn=${() => setHold(true)}>
      <header class="tb-pop-head">
        <span class="tb-pop-ic is-brand"><${Icon} name="download" size=${18}/></span>
        <h2 class="tb-pop-title">Son indirilenler</h2>
        <${MenuButton} icon="ellipsis-vertical" size="sm" label="İndirme seçenekleri" items=${() => [
          { label: 'Bitenleri listeden temizle', icon: 'list-x', disabled: !list.some((d) => !isActive(d) && d.state !== 'dangerous'), onSelect: () => Vox.downloads.clear() },
          { label: 'İndirme ayarları', icon: 'settings', onSelect: () => { close(); tb.openSettings('indirilenler'); } },
        ]}/>
        <${IconButton} icon="x" label="Kapat" size="sm" onClick=${() => close()}/>
      </header>
      ${items.length
        ? html`<ul class="tb-dl-list" aria-label="Son indirilenler">${items.map((d) => html`<${DlRow} key=${d.id} d=${d}/>`)}</ul>`
        : html`<${EmptyState} icon="download" title="Henüz indirme yok" text="İndirdiğiniz dosyalar burada görünür."/>`}
      <footer class="tb-pop-foot is-split">
        <span class="tb-pop-meta">${meta}</span>
        <${Button} size="sm" variant="secondary" icon="folder-down" onClick=${() => { close(); Vox.commands.run('open.downloads'); }}>Tümünü göster<//>
      </footer>
    </div>`;
  }

  /** auto: opened by a new download (closes itself, never interrupts); reveal: open without toggling. */
  tb.openDownloads = ({ anchor, auto, reveal } = {}) => {
    const a = anchor instanceof Element && anchor.isConnected ? anchor : tb.anchor('downloads');
    if (!a) return;
    if ((auto || reveal) && tb.popoverOn(a)) return;
    if (!auto && !reveal && tb.closeOn(a)) return;
    if (auto && (tb.overlayOpen() || /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || ''))) return;
    Vox.ui.popover({
      anchor: a, placement: 'bottom-end', width: 384, className: 'tb-pop tb-dlpop', label: 'Son indirilenler', persistent: true, autoFocus: !auto,
      render: ({ close }) => html`<${DownloadsPanel} close=${close} auto=${!!auto} anchor=${a}/>`,
    });
  };

  /* İndirme başlayınca dosya simgesi sayfanın ortasından düğmeye uçar (sayfanın üstünden geçtiği için arayüz kısa süre yukarı alınır). */
  Vox.bus.on('download:start', ({ id }) => {
    let tries = 0;
    const go = () => {
      const d = Vox.downloads.list().find((x) => x.id === id);
      const btn = document.querySelector('[data-anchor="downloads"]');
      if ((!d || !btn) && ++tries < 20) { requestAnimationFrame(go); return; }
      if (!d || !!d.private !== !!store.get('window.private')) return;
      const to = btn || tb.anchor('downloads');
      const vp = document.getElementById('vox-viewport');
      const r = vp ? vp.getBoundingClientRect() : null;
      const from = r && r.width ? { left: r.left + r.width / 2 - 20, top: r.top + r.height / 2 - 20, width: 40, height: 40 } : null;
      const after = () => {
        Vox.ui.raise('tb-fly', false);
        const b = tb.anchor('downloads');
        if (b) Vox.motion.animate(b, CATCH, { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'none' });
        if (d.state === 'dangerous') tb.openDownloads({ anchor: b, reveal: true });
        else if (Vox.settings.get('downloads.showBubble') !== false) tb.openDownloads({ anchor: b, auto: true });
      };
      if (!from || !to || Vox.motion.reduced()) { after(); return; }
      Vox.ui.raise('tb-fly', true);
      Vox.motion.fly({ from, to, html: Vox.iconSvg(tb.fileIcon(d), 18), size: 34 }).then(after, after);
    };
    requestAnimationFrame(go);
  });

  tb.DownloadsButton = DownloadsButton;
  Vox.commands.register('downloads.panel', { title: 'Son indirilenler', icon: 'download', run: (a = {}) => tb.openDownloads({ anchor: a.anchor }) });
});
