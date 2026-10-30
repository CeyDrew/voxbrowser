/* VoxBrowser — vox://yeni-sekme: selamlama + yüzen logo, arama kutusu, kısayollar, gerçek verili kartlar
   (son gezilen sayfalar, yer imleri, son indirilenler, okuma listesi), "Özelleştir" paneli ve gizli pencere sürümü. */
Vox.define('pages.newtab', (Vox) => {
  const { html, useMemo } = Vox.p;
  const { Icon, IconButton, Button, Badge, Toggle, Segmented, Logo, ProgressBar } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const pg = Vox.pg;

  const greeting = (h) => (h >= 5 && h < 12 ? 'Günaydın' : h >= 12 && h < 17 ? 'İyi günler' : h >= 17 && h < 22 ? 'İyi akşamlar' : 'İyi geceler');
  const dayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const BACKGROUNDS = [
    { value: 'yaprak', label: 'Yaprak' },
    { value: 'gece', label: 'Gece' },
    { value: 'duz', label: 'Düz' },
  ];
  /** Per-area preferences live under settings.ui.pages (contract §7). */
  const PREF = 'ui.pages.newTab';
  const usePrefs = () => Vox.useStore(`settings.${PREF}`) || {};
  const setPref = (k, v) => Vox.settings.set(PREF, { ...(Vox.settings.get(PREF) || {}), [k]: v });

  /* ── Kartlar ──────────────────────────────────────────── */
  function Card({ icon, title, badge, foot, children }) {
    const id = pg.useId('pgntc');
    return html`<section class="pg-nt-card" aria-labelledby=${id}>
      <header class="pg-nt-card-head"><h2 id=${id}><${Icon} name=${icon} size=${18}/>${title}</h2>${badge || null}</header>
      ${children}
      ${foot ? html`<a class="pg-nt-foot" href=${foot.href}>${foot.label}<${Icon} name="arrow-right" size=${15}/></a>` : null}
    </section>`;
  }
  const Empty = ({ children }) => html`<p class="pg-nt-card-empty">${children}</p>`;
  const MiniRow = ({ url, title, sub }) => html`<a class="pg-nt-mini-row" href=${url} title=${url}>
    <${pg.SiteIcon} url=${url} label=${title} size=${20}/>
    <span class="pg-nt-mini-text"><b>${title || pg.shortUrl(url)}</b><small>${sub}</small></span></a>`;

  function ContinueCard() {
    const hist = Vox.useStore('history') || [];
    pg.useNow(60000);
    const items = useMemo(() => {
      const seen = new Set(), out = [];
      for (const h of hist) { if (seen.has(h.url)) continue; seen.add(h.url); out.push(h); if (out.length >= 4) break; }
      return out;
    }, [hist]);
    return html`<${Card} icon="history" title="Kaldığınız yerden devam edin" foot=${{ href: 'vox://gecmis/', label: 'Tüm geçmiş' }}>
      ${items.length ? html`<ul class="pg-nt-mini">${items.map((h) => html`<li key=${h.id}>
          <${MiniRow} url=${h.url} title=${h.title} sub=${`${pg.siteName(h.url)} · ${Vox.fmt.rel(h.ts)}`}/></li>`)}</ul>`
        : html`<${Empty}>Gezindikçe son baktığınız sayfalar burada görünür.<//>`}
    <//>`;
  }

  function BookmarksCard() {
    const tree = Vox.useStore('bookmarks');
    const items = useMemo(() => {
      const out = [];
      Vox.bookmarks.walk((n) => { if (n.type === 'url') out.push(n); return true; });
      return out.sort((a, b) => (b.added || 0) - (a.added || 0)).slice(0, 4);
    }, [tree]);
    return html`<${Card} icon="star" title="Yer imleri" foot=${{ href: 'vox://yer-imleri/', label: 'Yer imi yöneticisi' }}>
      ${items.length ? html`<ul class="pg-nt-mini">${items.map((b) => html`<li key=${b.id}>
          <${MiniRow} url=${b.url} title=${b.title} sub=${pg.siteName(b.url)}/></li>`)}</ul>`
        : html`<${Empty}>Sık açtığınız sayfaları adres çubuğundaki yıldızla ya da <kbd class="pg-kbd">Ctrl</kbd>+<kbd class="pg-kbd">D</kbd> ile kaydedin.<//>`}
    <//>`;
  }

  function DownloadsCard() {
    const list = Vox.useStore('downloads') || [];
    pg.useNow(60000);
    const items = list.slice(0, 3);
    const running = list.filter((d) => d.state === 'in_progress').length;
    const sub = (d) => {
      if (d.state === 'in_progress') return d.size ? `%${Math.round((d.received / d.size) * 100)} · ${Vox.fmt.speed(d.speed || 0)}` : `${Vox.fmt.bytes(d.received)} indirildi`;
      if (d.state === 'paused') return 'Duraklatıldı';
      if (d.state === 'dangerous') return 'Onayınızı bekliyor';
      if (d.state === 'failed') return 'Başarısız';
      if (d.state === 'cancelled') return 'İptal edildi';
      return `${Vox.fmt.bytes(d.size || d.received)} · ${Vox.fmt.rel(d.endedAt || d.startedAt)}`;
    };
    return html`<${Card} icon="download" title="Son indirilenler" badge=${running ? html`<${Badge} tone="brand">${running} sürüyor<//>` : null}
      foot=${{ href: 'vox://indirilenler/', label: 'Tüm indirilenler' }}>
      ${items.length ? html`<ul class="pg-nt-mini">${items.map((d) => html`<li key=${d.id} class=${cx(d.state !== 'complete' && 'is-muted')}>
          <button type="button" class="pg-nt-mini-row" disabled=${d.state !== 'complete'} onClick=${() => Vox.downloads.open(d.id)}
            title=${d.state === 'complete' ? `Aç: ${d.filename}` : d.filename}>
            <${pg.FileTile} filename=${d.filename} mime=${d.mime} size=${30}/>
            <span class="pg-nt-mini-text"><b>${d.filename}</b><small>${sub(d)}</small>
              ${d.state === 'in_progress' && d.size ? html`<${ProgressBar} value=${d.received / d.size} label=${`${d.filename} indiriliyor`}/>` : null}</span>
          </button></li>`)}</ul>`
        : html`<${Empty}>İndirdiğiniz dosyalar burada görünür.<//>`}
    <//>`;
  }

  function ReadingCard() {
    const list = Vox.useStore('readingList') || [];
    pg.useNow(60000);
    if (!list.length) return null;
    const items = [...list].sort((a, b) => (a.read - b.read) || (b.added - a.added)).slice(0, 3);
    const unread = list.filter((r) => !r.read).length;
    return html`<${Card} icon="book-open" title="Okuma listesi" badge=${unread ? html`<${Badge} tone="brand">${unread} okunmadı<//>` : null}>
      <ul class="pg-nt-mini">${items.map((r) => html`<li key=${r.id} class=${cx(r.read && 'is-read')}>
        <a class="pg-nt-mini-row" href=${r.url} onClick=${() => Vox.readingList.markRead(r.id, true)}><${pg.SiteIcon} url=${r.url} label=${r.title} size=${20}/>
          <span class="pg-nt-mini-text"><b>${r.title}</b><small>${r.read ? 'Okundu' : `${Vox.fmt.rel(r.added)} eklendi`}</small></span></a>
        <${IconButton} icon=${r.read ? 'rotate-ccw' : 'check'} size="sm" label=${r.read ? 'Okunmadı olarak işaretle' : 'Okundu olarak işaretle'}
          class="pg-nt-mini-act" onClick=${() => Vox.readingList.markRead(r.id, !r.read)}/>
      </li>`)}</ul>
    <//>`;
  }

  /* ── Özelleştir paneli ────────────────────────────────── */
  function Customize() {
    const [bg, setBg] = Vox.useSetting('appearance.newTabBackground');
    const prefs = usePrefs();
    const mode = Vox.useStore('settings.appearance.theme') || 'system';
    const cur = BACKGROUNDS.some((b) => b.value === bg) ? bg : 'duz';
    return html`<div class="pg-nt-cust">
      <h2 class="pg-nt-cust-title">Yeni sekmeyi özelleştirin</h2>
      <p class="pg-nt-cust-label">Arka plan</p>
      <div class="pg-nt-bgopts" role="radiogroup" aria-label="Arka plan">
        ${BACKGROUNDS.map((b) => html`<button type="button" key=${b.value} role="radio" aria-checked=${String(cur === b.value)}
            class=${cx('pg-nt-bgopt', cur === b.value && 'is-on')} onClick=${() => setBg(b.value)}>
          <span class=${`pg-nt-bgprev pg-nt-bgprev--${b.value}`} aria-hidden="true">${cur === b.value ? html`<span class="pg-nt-bgcheck"><${Icon} name="check" size=${14} stroke=${3}/></span>` : null}</span>
          <span>${b.label}</span>
        </button>`)}
      </div>
      <p class="pg-nt-cust-label">Tema</p>
      <${Segmented} value=${mode} label="Tema" options=${[{ value: 'light', label: 'Açık', icon: 'sun' }, { value: 'dark', label: 'Koyu', icon: 'moon' }, { value: 'system', label: 'Sistem', icon: 'monitor' }]}
        onChange=${(v, e) => { const r = e && e.currentTarget.getBoundingClientRect(); Vox.theme.set(v, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null); }}/>
      <div class="pg-nt-cust-toggles">
        <${Toggle} label="Kısayolları göster" checked=${prefs.showShortcuts !== false} onChange=${(v) => setPref('showShortcuts', v)}/>
        <${Toggle} label="Kartları göster" desc="Son sayfalar, yer imleri ve indirilenler" checked=${prefs.showCards !== false} onChange=${(v) => setPref('showCards', v)}/>
      </div>
      <a class="pg-link" href="vox://ayarlar/gorunum">Tüm görünüm ayarları<${Icon} name="arrow-right" size=${15}/></a>
    </div>`;
  }
  const openCustomize = (e) => Vox.ui.popover({ anchor: e.currentTarget, placement: 'top-end', width: 340, label: 'Yeni sekmeyi özelleştirin', render: () => html`<${Customize}/>` });

  /* ── Sayfa ────────────────────────────────────────────── */
  function NewTab() {
    const priv = Vox.useStore('window.private');
    const name = Vox.useStore('profile.name') || '';
    const bg = Vox.useStore('settings.appearance.newTabBackground') || 'yaprak';
    const prefs = usePrefs();
    pg.useNow(5 * 60000);
    if (priv) return html`<${PrivateNewTab}/>`;
    const kind = BACKGROUNDS.some((b) => b.value === bg) ? bg : 'duz';
    const now = new Date();
    return html`<div class=${cx('pg-page pg-nt', `pg-nt--${kind}`)}>
      <${pg.NewTabBackdrop} kind=${kind}/>
      <main class="pg-nt-main">
        <div class="pg-nt-hero">
          <span class="pg-nt-logo"><${Logo} size=${76} decorative=${true}/></span>
          <h1 class="pg-nt-greet">${greeting(now.getHours())}${name ? `, ${name}` : ''}</h1>
          <p class="pg-nt-date">${dayFmt.format(now)}</p>
        </div>
        <${pg.SearchBox}/>
        ${prefs.showShortcuts !== false ? html`<${pg.Shortcuts}/>` : null}
        ${prefs.showCards !== false ? html`<div class="pg-nt-cards"><${ContinueCard}/><${BookmarksCard}/><${DownloadsCard}/><${ReadingCard}/></div>` : null}
      </main>
      <${Button} variant="soft" size="sm" icon="paintbrush" class="pg-nt-custbtn" onClick=${openCustomize} aria-haspopup="dialog">Özelleştir<//>
    </div>`;
  }

  /* ── Gizli pencere ────────────────────────────────────── */
  const NOT_SAVED = ['Tarama geçmişiniz', 'Çerezler ve site verileri (pencere kapanınca silinir)', 'Formlara girdiğiniz bilgiler'];
  const VISIBLE = [
    ['download', 'İndirdiğiniz dosyalar ve eklediğiniz yer imleri kaydedilir.'],
    ['globe', 'Ziyaret ettiğiniz siteler etkinliğinizi görebilir.'],
    ['building-2', 'İşvereniniz, okulunuz ya da internet servis sağlayıcınız trafiği görebilir.'],
  ];
  function PrivateNewTab() {
    return html`<div class="pg-page pg-nt pg-nt--private">
      <main class="pg-nt-main pg-pv">
        <div class="pg-pv-art"><${pg.PrivateArt}/></div>
        <h1 class="pg-pv-title">Gizli penceredesiniz</h1>
        <p class="pg-pv-lead">Bu pencereyi kapattığınızda gezinmenizin izleri bu cihazdan silinir. Aynı cihazı kullanan diğer kişiler etkinliğinizi görmez.</p>
        <${pg.SearchBox} placeholder="Gizlice arayın ya da adres yazın" noHistory=${true}/>
        <div class="pg-pv-cols">
          <section class="pg-pv-card">
            <h2><${Icon} name="eye-off" size=${18}/>VoxBrowser şunları kaydetmez</h2>
            <ul class="pg-pv-list is-good">${NOT_SAVED.map((t) => html`<li key=${t}><${Icon} name="check" size=${16} stroke=${3}/>${t}</li>`)}</ul>
          </section>
          <section class="pg-pv-card">
            <h2><${Icon} name="info" size=${18}/>Şunlar yine de görülebilir</h2>
            <ul class="pg-pv-list">${VISIBLE.map(([ic, t]) => html`<li key=${t}><${Icon} name=${ic} size=${16}/>${t}</li>`)}</ul>
          </section>
        </div>
        <a class="pg-link" href="vox://ayarlar/gizlilik">Gizlilik ayarları<${Icon} name="arrow-right" size=${15}/></a>
      </main>
    </div>`;
  }

  Vox.pages.register({ url: 'vox://yeni-sekme', title: 'Yeni sekme', icon: 'logo', component: NewTab });
});
