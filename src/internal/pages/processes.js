/* VoxBrowser — vox://surecler: görev yöneticisi. Değerler ana süreçten (system:metrics → Chromium app.getAppMetrics)
   iki saniyede bir gelir: her sekmenin süreci, tarayıcı, GPU ve yardımcı hizmetler. Sütunlar sıralanır;
   "İşlemi sonlandır" sekmenin sürecini gerçekten durdurur (sekme çökme ekranını gösterir). */
Vox.define('pages.processes', (Vox) => {
  const { html, useState, useEffect, useRef, useMemo } = Vox.p;
  const { Icon, Button, SearchField, Segmented, Badge, Favicon, EmptyState } = Vox.c;
  const { cx } = Vox.util;
  const pg = Vox.pg;
  const N = 30; // örnek sayısı (2 sn × 30 = son 1 dakika)
  const INTERVAL = 2000;
  const pct = new Intl.NumberFormat('tr-TR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtCpu = (v) => pct.format((v || 0) / 100);
  const fmtMem = (kb) => Vox.fmt.bytes((kb || 0) * 1024);

  const SERVICES = {
    'network.mojom.NetworkService': ['Ağ hizmeti', 'network'],
    'storage.mojom.StorageService': ['Depolama hizmeti', 'hard-drive'],
    'audio.mojom.AudioService': ['Ses hizmeti', 'volume-2'],
    'data_decoder.mojom.DataDecoderService': ['Veri çözücü', 'file-code'],
    'video_capture.mojom.VideoCaptureService': ['Kamera hizmeti', 'video'],
    'proxy_resolver.mojom.ProxyResolverFactory': ['Proxy çözümleyici', 'waypoints'],
    'printing.mojom.PrintBackendService': ['Yazdırma hizmeti', 'printer'],
    'tracing.mojom.TracingService': ['İzleme hizmeti', 'activity'],
    'on_device_model.mojom.OnDeviceModelService': ['Cihaz içi model hizmeti', 'cpu'],
  };
  /** The browser's own views (main reports which process draws them). */
  const VIEW = {
    ui: { label: 'Tarayıcı arayüzü', icon: 'app-window', hint: 'Sekme şeridi, araç çubuğu ve menüler' },
    hud: { label: 'Bildirim katmanı', icon: 'bell', hint: 'Bildirimler ve bağlantı adresi balonu' },
    devtools: { label: 'Geliştirici araçları', icon: 'code-xml', hint: 'Bir sekmenin geliştirici araçları' },
  };
  function viewInfo(list, ctx) {
    const kinds = [...new Set(list.map((v) => v.kind))].filter((k) => VIEW[k]);
    if (!kinds.length) return null;
    const many = ctx.windows > 1;
    const names = kinds.map((k) => {
      const v = list.find((x) => x.kind === k);
      if (k === 'devtools') { const t = ctx.tabById.get(v.tabId); return `${VIEW.devtools.label}${t ? `: ${t.title || pg.shortUrl(t.url)}` : ''}`; }
      return `${VIEW[k].label}${many ? ` (pencere ${v.windowId})` : ''}`;
    });
    return { kind: 'sys', name: names.join(' ve '), fav: { icon: VIEW[kinds[0]].icon }, hint: kinds.map((k) => VIEW[k].hint).join(' · '), why: 'Tarayıcının kendi görünümleri buradan sonlandırılamaz.' };
  }

  /** Turkish name + icon for a Chromium process. */
  function describe(p, tabsByPid, ctx) {
    const tabs = tabsByPid.get(p.pid) || [];
    if (p.type === 'Browser') return { kind: 'sys', name: 'Tarayıcı', fav: { logo: true }, why: 'Ana tarayıcı süreci sonlandırılamaz.' };
    if (p.type === 'GPU') return { kind: 'sys', name: 'GPU süreci', fav: { icon: 'monitor' }, why: 'Sistem süreçleri buradan sonlandırılamaz.' };
    if (p.type === 'Tab' && tabs.length) {
      const first = tabs[0];
      return { kind: 'tab', name: `Sekme: ${first.title || pg.shortUrl(first.url)}`, tabs, url: first.url, why: '' };
    }
    const view = ctx.viewsByPid.has(p.pid) ? viewInfo(ctx.viewsByPid.get(p.pid), ctx) : null;
    if (view) return view;
    if (p.type === 'Tab') return { kind: 'sys', name: 'Diğer işleyici', fav: { icon: 'layers' }, hint: 'Bir sekmeye bağlı olmayan sayfa süreci (ör. Chromium’un hazırda beklettiği ya da arka planda çalışan süreç)', why: 'Bu süreç buradan sonlandırılamaz.' };
    if (p.type === 'Utility') {
      const s = SERVICES[p.serviceName];
      return { kind: 'sys', name: s ? s[0] : `Yardımcı: ${p.name || p.serviceName || 'hizmet'}`, fav: { icon: s ? s[1] : 'cog' }, why: 'Sistem süreçleri buradan sonlandırılamaz.' };
    }
    if (p.type === 'Sandbox helper') return { kind: 'sys', name: 'Korumalı alan yardımcısı', fav: { icon: 'shield' }, why: 'Sistem süreçleri buradan sonlandırılamaz.' };
    return { kind: 'sys', name: p.name || p.type || 'Bilinmeyen süreç', fav: { icon: 'cpu' }, why: 'Bu süreç buradan sonlandırılamaz.' };
  }

  /** Polls system:metrics every 2 s while the page is visible; keeps a short history for the sparklines. */
  function useMetrics() {
    const [snap, setSnap] = useState(null);
    const [err, setErr] = useState(false);
    const hist = useRef({ cpu: [], mem: [], byPid: new Map() });
    useEffect(() => {
      let timer = 0, alive = true;
      const tick = async () => {
        clearTimeout(timer);
        if (document.hidden) return;
        try {
          const m = await Vox.native.invoke('system:metrics');
          if (!alive || !m) return;
          const H = hist.current;
          const push = (a, v) => [...a.slice(-(N - 1)), v];
          H.cpu = push(H.cpu, m.processes.reduce((s, p) => s + (p.cpu || 0), 0));
          H.mem = push(H.mem, m.processes.reduce((s, p) => s + (p.memory || 0), 0));
          const live = new Set();
          for (const p of m.processes) { live.add(p.pid); H.byPid.set(p.pid, push(H.byPid.get(p.pid) || [], p.cpu || 0)); }
          for (const k of [...H.byPid.keys()]) if (!live.has(k)) H.byPid.delete(k);
          setSnap(m);
          setErr(false);
        } catch (e) {
          if (alive) setErr(true);
        }
        if (alive) timer = setTimeout(tick, INTERVAL);
      };
      const onVis = () => { if (!document.hidden) tick(); };
      document.addEventListener('visibilitychange', onVis);
      tick();
      return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
    }, []);
    return { snap, err, hist: hist.current };
  }

  function Spark({ data, w = 76, h = 24, max, label }) {
    const n = data.length;
    if (n < 2) return html`<span class="pg-spark-wait" style=${`width:${w}px;height:${h}px`} aria-hidden="true"></span>`;
    const m = Math.max(max || 0, ...data, 1e-6);
    const off = N - n; // en yeni örnek hep sağ kenarda; geçmiş doldukça çizgi sola uzar
    const pts = data.map((v, i) => [2 + ((off + i) / (N - 1)) * (w - 6), h - 3 - (Math.max(0, v) / m) * (h - 6)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    const last = pts[n - 1];
    return html`<svg class="pg-spark" width=${w} height=${h} viewBox=${`0 0 ${w} ${h}`} role="img" aria-label=${label}>
      <path class="pg-spark-area" d=${`${line}L${last[0].toFixed(1)} ${h - 2}L${pts[0][0].toFixed(1)} ${h - 2}Z`}/>
      <path class="pg-spark-line" d=${line}/><circle class="pg-spark-dot" cx=${last[0].toFixed(1)} cy=${last[1].toFixed(1)} r="3"/>
    </svg>`;
  }
  function Stat({ label, value, sub, data, fmt }) {
    const peak = data && data.length ? Math.max(...data) : 0;
    return html`<div class="pg-card pg-pr-stat">
      <span class="pg-pr-stat-label">${label}</span>
      <b class="pg-pr-stat-value">${value}</b>
      ${sub ? html`<span class="pg-pr-stat-sub">${sub}</span>` : null}
      ${data ? html`<span class="pg-pr-stat-spark" data-tip=${`Son ${Math.round((data.length * INTERVAL) / 1000)} sn · en yüksek ${fmt(peak)}`}><${Spark} data=${data} w=${132} h=${34} label=${`${label}, son bir dakika`}/></span>` : null}
    </div>`;
  }

  const COLS = [
    { id: 'name', label: 'Görev', num: false },
    { id: 'mem', label: 'Bellek', num: true },
    { id: 'cpu', label: 'İşlemci', num: true },
    { id: 'pid', label: 'Süreç kimliği', num: true },
  ];
  const ORDER = { sys: 0, tab: 1, crashed: 2 };
  const TYPE_ORDER = { Browser: 0, GPU: 1, Utility: 2, Tab: 3 };

  function ProcessesPage() {
    const { snap, err, hist } = useMetrics();
    const [sort, setSort] = useState({ col: null, dir: 'desc' });
    const [filter, setFilter] = useState('all');
    const [q, setQ] = useState('');
    const [selKey, setSelKey] = useState(null);
    const bodyRef = useRef();
    const self = location.href.split(/[?#]/)[0];

    const rows = useMemo(() => {
      if (!snap) return [];
      const tabsByPid = new Map();
      for (const t of snap.tabs) if (t.pid && !t.crashed) { if (!tabsByPid.has(t.pid)) tabsByPid.set(t.pid, []); tabsByPid.get(t.pid).push(t); }
      const viewsByPid = new Map();
      for (const v of snap.views || []) if (v.pid) { if (!viewsByPid.has(v.pid)) viewsByPid.set(v.pid, []); viewsByPid.get(v.pid).push(v); }
      const ctx = { viewsByPid, tabById: new Map(snap.tabs.map((t) => [t.tabId, t])), windows: new Set((snap.views || []).filter((v) => v.kind === 'ui').map((v) => v.windowId)).size };
      const out = snap.processes.map((p) => ({ key: `p${p.pid}`, pid: p.pid, cpu: p.cpu || 0, mem: p.memory || 0, type: p.type, ...describe(p, tabsByPid, ctx) }));
      for (const t of snap.tabs) if (t.crashed) out.push({ key: `c${t.tabId}`, kind: 'crashed', name: `Sekme: ${t.title || pg.shortUrl(t.url)}`, url: t.url, pid: 0, cpu: -1, mem: -1, tabs: [t], why: 'Bu sekmenin süreci zaten durmuş.' });
      return out;
    }, [snap]);
    const shown = rows.filter((p) => (filter === 'all' || (filter === 'tab' ? p.kind !== 'sys' : p.kind === 'sys')) && pg.match(q, p.name, ...(p.tabs || []).map((t) => t.url)));
    const val = (p, col) => (col === 'name' ? p.name : p[col]);
    if (sort.col) {
      shown.sort((a, b) => {
        const x = val(a, sort.col), y = val(b, sort.col);
        const c = typeof x === 'string' ? x.localeCompare(y, 'tr') : x - y;
        return sort.dir === 'asc' ? c : -c;
      });
    } else shown.sort((a, b) => (ORDER[a.kind] - ORDER[b.kind]) || ((TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)) || b.mem - a.mem);
    pg.useAutoFlip(bodyRef, shown.map((r) => r.key).join('|'));

    const cur = (a) => (a.length ? a[a.length - 1] : 0);
    const sel = rows.find((r) => r.key === selKey) || null;
    const counts = { tab: rows.filter((p) => p.kind === 'tab').reduce((s, p) => s + p.tabs.length, 0), sys: rows.filter((p) => p.kind === 'sys').length };
    const scaleMax = Math.max(10, ...shown.map((r) => Math.max(0, ...(hist.byPid.get(r.pid) || [0]))));

    const onSort = (col) => setSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'name' ? 'asc' : 'desc' }));
    const end = async (p) => {
      if (!p || p.kind !== 'tab') return;
      const row = bodyRef.current && bodyRef.current.querySelector(`[data-flip-key="${p.key}"]`);
      if (row) Vox.motion.animate(row, [{ opacity: 1 }, { opacity: 0.35 }], { duration: 260, fill: 'none' });
      const ok = await Vox.native.invoke('tabs:crash', { tabId: p.tabs[0].tabId }).catch(() => false);
      setSelKey(null);
      const names = p.tabs.map((t) => `"${t.title || pg.shortUrl(t.url)}"`).join(', ');
      Vox.ui.toast(ok ? { icon: 'octagon-x', title: 'İşlem sonlandırıldı.', text: ` ${names} ${p.tabs.length > 1 ? 'sekmeleri' : 'sekmesi'} çöktü; yeniden yükleyerek geri getirebilirsiniz.` }
        : { icon: 'info', text: 'Bu işlem sonlandırılamadı.' });
    };
    /* "Sekmeye geç": main yalnızca bu pencerenin sekmelerini öne getirebilir. */
    const mine = snap ? snap.tabs.find((t) => String(t.url).split(/[?#]/)[0] === self) : null;
    const target = (p) => (p && p.tabs && p.tabs.length ? p.tabs[0] : null);
    const canGo = (p) => { const t = target(p); return !!t && (!mine || t.windowId === mine.windowId) && String(t.url).split(/[?#]/)[0] !== self; };
    const goTo = (p) => { if (canGo(p)) Vox.native.invoke('tabs:activate', { tabId: target(p).tabId }).catch(() => {}); };
    const onRowKey = (e, p) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = pg.moveFocus(bodyRef.current, e.key === 'ArrowDown' ? 1 : -1, '.pg-pr-row');
        if (n) setSelKey(n.dataset.flipKey);
      } else if (e.key === 'Delete') { e.preventDefault(); end(p); }
      else if (e.key === 'Enter') { e.preventDefault(); goTo(p); }
    };
    const otherWin = sel && target(sel) && mine && target(sel).windowId !== mine.windowId;
    const hint = !sel ? 'Bir satır seçin.' : otherWin ? 'Bu sekme başka bir pencerede.' : sel.kind === 'tab' ? 'Sekme çöker; kaydedilmemiş bilgiler kaybolabilir.' : sel.why;

    return html`<div class="pg-page pg-pr" onKeyDown=${pg.slashToSearch}>
      <div class="pg-wrap">
        <${pg.PageHeader} icon="activity" title="Görev yöneticisi" sub="Her sekme ayrı bir süreçte çalışır; biri çökerse diğerleri etkilenmez."
          search=${html`<${SearchField} value=${q} onInput=${setQ} placeholder="Süreçlerde arayın"/>`}/>
        <div class="pg-pr-stats">
          <${Stat} label="İşlemci" value=${snap ? fmtCpu(cur(hist.cpu)) : '…'} sub="Tüm VoxBrowser süreçleri" data=${hist.cpu} fmt=${fmtCpu}/>
          <${Stat} label="Bellek" value=${snap ? fmtMem(cur(hist.mem)) : '…'} sub="Fiziksel bellekte kullanılan" data=${hist.mem} fmt=${fmtMem}/>
          <${Stat} label="Süreçler" value=${snap ? String(rows.filter((r) => r.kind !== 'crashed').length) : '…'} sub=${snap ? `${counts.tab} sekme · ${counts.sys} sistem` : 'Ölçülüyor'}/>
        </div>
        <div class="pg-pr-tools">
          <${Segmented} value=${filter} label="Süreç türü" size="sm" onChange=${setFilter} options=${[
            { value: 'all', label: 'Tümü' }, { value: 'tab', label: 'Sekmeler' }, { value: 'sys', label: 'Sistem' }]}/>
          <span class="pg-sp"></span>
          <span class="pg-pr-hint">${hint}</span>
          <span class="pg-pr-acts">
            <${Button} variant="secondary" size="sm" icon="arrow-up-right" aria-label="Sekmeye geç" disabled=${!canGo(sel)} onClick=${() => goTo(sel)}>Sekmeye geç<//>
            <${Button} variant="danger" size="sm" icon="octagon-x" aria-label="İşlemi sonlandır" disabled=${!sel || sel.kind !== 'tab'} onClick=${() => end(sel)}>İşlemi sonlandır<//>
          </span>
        </div>
        <div class="pg-card pg-pr-tablewrap">
          <table class="pg-pr-table">
            <caption class="sr-only">Çalışan süreçler. Değerler iki saniyede bir güncellenir.</caption>
            <thead><tr>${COLS.map((c) => html`<th key=${c.id} scope="col" class=${cx(`pg-pr-c-${c.id}`, c.num && 'is-num')}
                aria-sort=${sort.col === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" class=${cx('pg-pr-sort', sort.col === c.id && 'is-on')} onClick=${() => onSort(c.id)}>
                ${c.label}<${Icon} name=${sort.col === c.id ? (sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'} size=${14}/></button>
            </th>`)}</tr></thead>
            <tbody ref=${bodyRef}>
              ${shown.map((p) => {
                const isSelf = p.tabs && p.tabs.some((t) => String(t.url).split(/[?#]/)[0] === self);
                const h = hist.byPid.get(p.pid) || [];
                return html`<tr key=${p.key} data-flip-key=${p.key} tabindex=${selKey === p.key || (!selKey && p === shown[0]) ? 0 : -1}
                  class=${cx('pg-pr-row', selKey === p.key && 'is-sel', p.kind === 'crashed' && 'is-crashed')}
                  onClick=${() => setSelKey(p.key)} onDblClick=${() => goTo(p)} onFocus=${() => setSelKey(p.key)} onKeyDown=${(e) => onRowKey(e, p)}>
                  <td class="pg-pr-c-name"><span class="pg-pr-name" title=${p.hint || (p.tabs || []).map((t) => t.url).join('\n') || undefined}>
                    <span class="pg-pr-fav">${p.fav ? html`<${Favicon} spec=${p.fav} size=${18}/>` : html`<${pg.SiteIcon} url=${p.url} size=${18}/>`}</span>
                    <span class="pg-pr-title">${pg.highlight(p.name, q)}${selKey === p.key ? html`<span class="sr-only"> (seçili)</span>` : null}</span>
                    ${p.tabs && p.tabs.length > 1 ? html`<${Badge}>+${p.tabs.length - 1} sekme<//>` : null}
                    ${isSelf ? html`<${Badge} tone="brand">Bu sayfa<//>` : null}
                    ${p.kind === 'crashed' ? html`<${Badge} tone="danger" icon="frown">Çöktü<//>` : null}
                  </span></td>
                  <td class="pg-pr-c-mem is-num">${p.mem >= 0 ? fmtMem(p.mem) : html`<span class="pg-muted">—</span>`}</td>
                  <td class="pg-pr-c-cpu is-num">${p.cpu >= 0 ? html`<span class="pg-pr-cpu">
                    <span class="pg-pr-cpu-spark"><${Spark} data=${h} max=${scaleMax} label=${`${p.name} işlemci geçmişi`}/></span>
                    <span>${fmtCpu(p.cpu)}</span></span>` : html`<span class="pg-muted">—</span>`}</td>
                  <td class="pg-pr-c-pid is-num">${p.pid || html`<span class="pg-muted">—</span>`}</td>
                </tr>`;
              })}
            </tbody>
          </table>
          ${!snap && !err ? html`<p class="pg-pr-loading"><${Vox.c.Spinner} size=${18}/>Süreçler ölçülüyor…</p>` : null}
          ${err && !snap ? html`<${EmptyState} icon="circle-alert" title="Süreç bilgisi alınamadı" text="Biraz sonra yeniden denenecek."/>` : null}
          ${snap && !shown.length ? html`<${EmptyState} icon="search-x" title="Eşleşen süreç yok" text="Filtreyi ya da arama kelimesini değiştirin."/>` : null}
        </div>
        <p class="pg-pr-note"><${Icon} name="info" size=${15}/>Değerler Chromium’dan iki saniyede bir okunur. Bellek, sürecin fiziksel bellekte kullandığı alandır. Çift tıklama ya da Enter sekmeye geçer; Delete seçili sekmenin işlemini sonlandırır.</p>
      </div>
    </div>`;
  }

  Vox.pages.register({ url: 'vox://surecler', title: 'Görev yöneticisi', icon: 'activity', component: ProcessesPage });
});
