/* VoxBrowser — vox://indirilenler: gerçek indirmeler (ana süreçteki Chromium indirmeleri), arama, güne göre gruplar,
   her durum: sürüyor (çubuk + hız + kalan süre), duraklatıldı, tamamlandı, başarısız, iptal, tehlikeli (onay kartı). */
Vox.define('pages.downloads', (Vox) => {
  const { html, useState, useMemo, useRef } = Vox.p;
  const { Icon, IconButton, Button, SearchField, EmptyState, MenuButton, ProgressBar } = Vox.c;
  const { cx } = Vox.util;
  const pg = Vox.pg;
  const D = Vox.downloads;

  const pctOf = (d) => (d.size > 0 ? Math.min(1, d.received / d.size) : 0);
  function status(d) {
    const part = d.size > 0 ? `${Vox.fmt.bytes(d.received)} / ${Vox.fmt.bytes(d.size)}` : `${Vox.fmt.bytes(d.received)} indirildi`;
    switch (d.state) {
      case 'in_progress': {
        const eta = d.size > 0 && d.speed > 0 ? Vox.fmt.eta((d.size - d.received) / d.speed) : null;
        return [d.speed > 0 ? Vox.fmt.speed(d.speed) : 'Başlıyor…', part, eta].filter(Boolean).join(' · ');
      }
      case 'paused': return `Duraklatıldı · ${part}`;
      case 'failed': return `Başarısız · ${d.error || 'İndirme yarıda kesildi.'}`;
      case 'cancelled': return 'İptal edildi';
      case 'dangerous': return `${d.size > 0 ? Vox.fmt.bytes(d.size) : 'Boyut bilinmiyor'} · onayınızı bekliyor`;
      default: return `${Vox.fmt.bytes(d.size || d.received)} · ${Vox.fmt.time(d.endedAt || d.startedAt)}`;
    }
  }

  function Item({ d, i, q, onRemove, onKeep, onDiscard }) {
    const kind = pg.fileKind(d.filename, d.mime);
    const active = d.state === 'in_progress' || d.state === 'paused';
    const menu = () => [
      d.state === 'complete' && { label: 'Aç', icon: 'file', onSelect: () => D.open(d.id) },
      d.state === 'complete' && { label: 'Klasörde göster', icon: 'folder-open', onSelect: () => D.showInFolder(d.id) },
      d.state === 'complete' && '-',
      { label: 'Bağlantıyı kopyala', icon: 'link', disabled: !/^https?:/i.test(d.url), onSelect: () => pg.copyLink(d.url) },
      { label: 'Listeden kaldır', icon: 'x', onSelect: () => onRemove(d) },
    ];
    let actions = null;
    if (d.state === 'in_progress') {
      actions = html`<${IconButton} icon="pause" label="Duraklat" onClick=${() => D.pause(d.id)}/>
        <${IconButton} icon="x" label="İptal et" onClick=${() => D.cancel(d.id)}/>`;
    } else if (d.state === 'paused') {
      actions = html`<${IconButton} icon="play" label="Sürdür" variant="soft" onClick=${() => D.resume(d.id)}/>
        <${IconButton} icon="x" label="İptal et" onClick=${() => D.cancel(d.id)}/>`;
    } else if (d.state === 'complete') {
      actions = html`<${Button} variant="soft" size="sm" class="pg-dl-open" onClick=${() => D.open(d.id)}>Aç<//>
        <${IconButton} icon="folder-open" label="Klasörde göster" onClick=${() => D.showInFolder(d.id)}/>
        <${MenuButton} icon="ellipsis-vertical" label=${`Diğer işlemler: ${d.filename}`} items=${menu}/>`;
    } else if (d.state === 'failed' || d.state === 'cancelled') {
      actions = html`${/^https?:/i.test(d.url) ? html`<${Button} variant="secondary" size="sm" icon="rotate-cw" onClick=${() => D.retry(d.id)}>Yeniden dene<//>` : null}
        <${IconButton} icon="x" label="Listeden kaldır" onClick=${() => onRemove(d)}/>`;
    }
    return html`<li class=${cx('pg-dl-item pg-enter', `is-${d.state}`)} data-flip-key=${d.id} style=${`--i:${i}`}
      onContextMenu=${(e) => Vox.ui.contextMenu(e, menu())}>
      <div class="pg-dl-tile">
        <${pg.FileTile} filename=${d.filename} mime=${d.mime} size=${46}/>
        ${d.state === 'complete' ? html`<span class="pg-dl-badge is-ok" key="ok"><${Icon} name="check" size=${11} stroke=${3.5}/></span>` : null}
        ${d.state === 'failed' || d.state === 'dangerous' ? html`<span class="pg-dl-badge is-bad" key="bad" aria-hidden="true">!</span>` : null}
      </div>
      <div class="pg-dl-main">
        <div class="pg-dl-name">
          ${d.state === 'complete'
            ? html`<button type="button" class="pg-dl-file" onClick=${() => D.open(d.id)} title=${`Aç: ${d.savePath || d.filename}`}>${pg.highlight(d.filename, q)}</button>`
            : html`<span class="pg-dl-file" title=${d.filename}>${pg.highlight(d.filename, q)}</span>`}
          ${d.private ? html`<span class="pg-dl-priv" data-tip="Gizli pencereden indirildi"><${Icon} name="venetian-mask" size=${14}/></span>` : null}
        </div>
        <div class="pg-dl-src" title=${d.url}>${pg.highlight(/^https?:/i.test(d.url) ? pg.siteName(d.url) : kind.label, q)}${/^https?:/i.test(d.url) ? ` · ${kind.label}` : ''}</div>
        ${active ? html`<${ProgressBar} value=${pctOf(d)} indeterminate=${!(d.size > 0) && d.state === 'in_progress'} tone=${d.state === 'paused' ? 'honey' : undefined}
          label=${d.size > 0 ? `${d.filename}: yüzde ${Math.round(pctOf(d) * 100)}` : `${d.filename} indiriliyor`}/>` : null}
        <div class="pg-dl-meta">${status(d)}</div>
        ${d.state === 'dangerous' ? html`<div class="pg-dl-warn" role="alert">
          <span class="pg-dl-warn-ic"><${Icon} name="shield-alert" size=${22}/></span>
          <div class="pg-dl-warn-text"><b>Bu dosya tehlikeli olabilir</b><p>${d.danger || 'Bu dosya türü bilgisayarınıza zarar verebilir.'} VoxBrowser indirmeyi sizin onayınıza kadar durdurdu.</p></div>
          <div class="pg-dl-warn-actions">
            <${Button} variant="danger" size="sm" icon="trash-2" onClick=${() => onDiscard(d)}>Kaldır<//>
            <${Button} variant="ghost" size="sm" onClick=${() => onKeep(d)}>Yine de indir<//>
          </div>
        </div>` : null}
      </div>
      ${actions ? html`<div class="pg-dl-actions">${actions}</div>` : null}
    </li>`;
  }

  function DownloadsPage() {
    const list = Vox.useStore('downloads') || [];
    const location = Vox.useStore('settings.downloads.location') || '';
    const askWhere = Vox.useStore('settings.downloads.askWhere');
    const [q, setQ] = useState('');
    const listRef = useRef();
    pg.useNow(60000);
    const items = useMemo(() => (q.trim() ? list.filter((d) => pg.match(q, d.filename, d.url)) : list), [list, q]);
    const inc = pg.useIncremental(items.length, 60, q);
    const groups = useMemo(() => {
      const m = new Map();
      for (const d of items.slice(0, inc.limit)) { const k = Vox.fmt.day(d.startedAt); if (!m.has(k)) m.set(k, []); m.get(k).push(d); }
      return Array.from(m, ([day, l]) => ({ day, list: l }));
    }, [items, inc.limit]);
    const running = list.filter((d) => d.state === 'in_progress');
    const totalSpeed = running.reduce((s, d) => s + (d.speed || 0), 0);
    const clearable = list.filter((d) => d.state !== 'in_progress' && d.state !== 'paused' && d.state !== 'dangerous');

    const rowEl = (id) => listRef.current && listRef.current.querySelector(`[data-flip-key="${id}"]`);
    const remove = async (d) => {
      await pg.collapseOut(rowEl(d.id));
      D.remove(d.id);
      Vox.ui.toast({ icon: 'x', text: d.state === 'complete' ? `${d.filename} listeden kaldırıldı. Dosya diskte duruyor.` : `${d.filename} listeden kaldırıldı.` });
    };
    const discard = async (d) => {
      await pg.collapseOut(rowEl(d.id));
      D.discard(d.id);
      Vox.ui.toast({ icon: 'shield-check', tone: 'success', text: `${d.filename} kaldırıldı ve bilgisayarınıza kaydedilmedi.` });
    };
    const keep = async (d) => {
      const ok = await Vox.ui.confirm({
        title: 'Tehlikeli dosya indirilsin mi?', danger: true, icon: 'shield-alert', confirmLabel: 'Yine de indir', cancelLabel: 'Vazgeç',
        text: `${d.filename} bilgisayarınıza zarar verebilir. Yalnızca kaynağına (${pg.siteName(d.url) || 'bu site'}) güveniyorsanız devam edin.`,
      });
      if (ok) D.keep(d.id);
    };
    const clearAll = async () => {
      if (!clearable.length) return;
      await pg.collapseOut(clearable.map((d) => rowEl(d.id)));
      D.clear();
      Vox.ui.toast({ icon: 'list-x', text: `Liste temizlendi (${clearable.length} öğe). İndirilen dosyalar diskte kalır.` });
    };
    const openFolder = () => Vox.native.invoke('downloads:action', { id: '', action: 'openFolder' }).catch((e) => Vox.reportError('download:openFolder', e));

    return html`<div class="pg-page pg-dl" onKeyDown=${pg.slashToSearch}>
      <div class="pg-wrap pg-wrap--narrow">
        <${pg.PageHeader} icon="download" title="İndirilenler"
          sub=${running.length ? `${running.length} indirme sürüyor${totalSpeed > 0 ? ` · ${Vox.fmt.speed(totalSpeed)}` : ''}` : list.length ? `${list.length} dosya` : null}
          search=${html`<${SearchField} value=${q} onInput=${setQ} placeholder="İndirilenlerde arayın"/>`}>
          <${Button} variant="ghost" size="sm" icon="list-x" aria-label="Listeyi temizle" disabled=${!clearable.length} onClick=${clearAll}>Listeyi temizle<//>
        <//>
        <p class="pg-note pg-dl-loc"><${Icon} name="folder" size=${18}/>
          <span>${askWhere ? 'Her indirmede nereye kaydedileceği sorulur.' : html`Dosyalar şuraya kaydediliyor: <b>${location || 'İndirilenler klasörü'}</b>`}</span>
          <button type="button" class="pg-link" onClick=${openFolder}>Klasörü aç</button>
          <a class="pg-link" href="vox://ayarlar/indirilenler">Değiştir</a></p>
        ${items.length ? html`<div class="pg-dl-groups" ref=${listRef}>
            ${groups.map((g) => html`<section class="pg-dl-group" key=${g.day} aria-label=${g.day}>
              <h2 class="pg-dl-day">${g.day}</h2>
              <ul class="pg-dl-list">${g.list.map((d, i) => html`<${Item} key=${d.id} d=${d} i=${i} q=${q} onRemove=${remove} onKeep=${keep} onDiscard=${discard}/>`)}</ul>
            </section>`)}
            ${inc.sentinel}
          </div>`
          : q.trim() ? html`<div class="pg-card"><${EmptyState} icon="search-x" title=${`"${q.trim()}" için sonuç yok`} text="Dosya adını ya da indirdiğiniz sitenin adresini deneyin."
              action=${html`<${Button} variant="secondary" onClick=${() => setQ('')}>Aramayı temizle<//>`}/></div>`
          : html`<div class="pg-card"><${EmptyState} icon="download" title="Henüz indirme yok" text="İndirdiğiniz dosyalar burada görünür; ilerlemelerini izleyebilir, açabilir ya da klasörlerinde gösterebilirsiniz."/></div>`}
      </div>
    </div>`;
  }

  Vox.pages.register({ url: 'vox://indirilenler', title: 'İndirilenler', icon: 'download', component: DownloadsPage });
});
