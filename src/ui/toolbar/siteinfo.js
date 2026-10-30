/* VoxBrowser — site kimliği.
   Adres çubuğunun solundaki düğme (kilit / "Güvenli değil" / VoxBrowser / yerel dosya) ve site bilgisi paneli:
   bağlantı durumu, gerçek sertifika (Chromium'un doğruladığı), çerez sayısı + site verilerini silme, siteye özel izinler. */
Vox.define('toolbar.siteinfo', (Vox) => {
  const { html, useState, useEffect } = Vox.p;
  const { Icon, IconButton, Button, Select, Logo, Favicon, Skeleton } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const tb = Vox.tb;

  /* ── Adres çubuğundaki düğme ──────────────────────────── */
  const CHIP = {
    secure: { icon: 'lock', aria: 'Bağlantı güvenli — site bilgisi', tip: 'Site bilgisi' },
    error: { icon: 'info', aria: 'Site bilgisi', tip: 'Site bilgisi', soft: true },
    file: { icon: 'file', aria: 'Yerel dosya — site bilgisi', tip: 'Yerel dosya', soft: true },
    neutral: { icon: 'info', aria: 'Site bilgisi', tip: 'Site bilgisi', soft: true },
  };
  function SiteButton({ tab, editIcon }) {
    const open = (e) => Vox.commands.run('siteinfo.open', { anchor: e.currentTarget });
    if (editIcon || !tab || tb.isNtp(tab.url)) {
      const icon = editIcon || 'search';
      return html`<button type="button" class="tb-site tb-site--plain" data-anchor="siteinfo" aria-hidden="true" tabindex="-1"
        onMouseDown=${(e) => { e.preventDefault(); tb.focusOmnibox && tb.focusOmnibox(); }}>
        <span class="tb-swap" key=${icon}><${Icon} name=${icon} size=${18}/></span></button>`;
    }
    if (tab.security === 'insecure') {
      return html`<button type="button" class="tb-site is-chip tb-site--insecure" data-anchor="siteinfo" aria-label="Güvenli değil — site bilgisi" data-tip="Bağlantı güvenli değil" onClick=${open}>
        <span class="tb-swap" key="i"><${Icon} name="triangle-alert" size=${17}/></span><span class="tb-site-label">Güvenli değil</span></button>`;
    }
    if (tab.security === 'internal') {
      return html`<button type="button" class="tb-site is-chip tb-site--vox" data-anchor="siteinfo" aria-label="VoxBrowser sayfası — site bilgisi" data-tip="Güvenli VoxBrowser sayfası" onClick=${open}>
        <span class="tb-swap" key="v"><${Logo} size=${18} decorative=${true}/></span><span class="tb-site-label">VoxBrowser</span></button>`;
    }
    const m = CHIP[tab.security] || CHIP.neutral;
    return html`<button type="button" class=${cx('tb-site', m.soft && 'tb-site--soft')} data-anchor="siteinfo" aria-label=${m.aria} data-tip=${m.tip} onClick=${open}>
      <span class="tb-swap" key=${m.icon}><${Icon} name=${m.icon} size=${18}/></span></button>`;
  }

  /* ── Panel parçaları ──────────────────────────────────── */
  function Head({ title, onBack, close, children }) {
    return html`<header class="tb-pop-head">
      ${onBack ? html`<${IconButton} icon="arrow-left" label="Geri" size="sm" onClick=${onBack}/>` : children}
      <h2 class="tb-pop-title">${title}</h2>
      <${IconButton} icon="x" label="Kapat" size="sm" onClick=${() => close()}/>
    </header>`;
  }

  const date = (s) => (s ? Vox.fmt.date(s * 1000) : '—');
  function CertView({ info, close, back }) {
    const c = info.cert;
    const expired = c.validExpiry && c.validExpiry * 1000 < Date.now();
    const rows = [
      ['Verildiği alan adı', c.subject || info.host],
      ['Veren kuruluş', c.issuer || c.issuerName || '—'],
      ['Geçerlilik başlangıcı', date(c.validStart)],
      ['Geçerlilik sonu', `${date(c.validExpiry)}${expired ? ' (süresi dolmuş)' : ''}`],
      c.fingerprint ? ['Parmak izi', html`<code class="tb-code">${c.fingerprint}</code>`] : null,
      !c.ok && c.result ? ['Doğrulama sonucu', html`<code class="tb-code">${c.result}</code>`] : null,
    ].filter(Boolean);
    return html`<div class="tb-si">
      <${Head} title="Sertifika" onBack=${back} close=${close}/>
      <div class=${cx('tb-si-cert', !c.ok && 'is-bad')}>
        <span class="tb-si-badge"><${Icon} name=${c.ok ? 'badge-check' : 'badge-alert'} size=${22}/></span>
        <p><b>${c.ok ? 'Sertifika geçerli' : 'Sertifika doğrulanamadı'}</b>
          <small>${c.ok ? 'Chromium bu sitenin kimliğini güvenilir bir kuruluşla doğruladı.' : 'Bu sitenin kimliği doğrulanamadı; bağlantınız güvende olmayabilir.'}</small></p>
      </div>
      <dl class="tb-kv">${rows.map(([k, v]) => html`<div key=${k}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
    </div>`;
  }

  function connOf(sec, info) {
    const cert = info && info.cert;
    if (cert && cert.ok === false) return ['triangle-alert', 'bad', 'Sertifika doğrulanamadı', 'Bu sitenin kimliği doğrulanamadı; parola ya da kart bilgisi girmeyin.'];
    return ({
      secure: ['lock', 'ok', 'Bağlantı güvenli', 'Bu siteye gönderdiğiniz bilgiler (parolalar, kart numaraları) şifrelenir.'],
      insecure: ['triangle-alert', 'bad', 'Bağlantı güvenli değil', 'Bu sitede parola ya da kart bilgisi girmeyin; bilgileriniz başkalarınca görülebilir.'],
      internal: ['shield-check', 'ok', 'Güvenli VoxBrowser sayfası', 'Bu sayfa tarayıcının içinden gelir; internete gönderilmez.'],
      file: ['file', 'info', 'Yerel dosya', 'Bu sayfa bilgisayarınızdaki bir dosyadan açıldı.'],
      error: ['circle-alert', 'info', 'Bu sayfa açılamadı', 'Siteye bağlanılamadığı için bilgiler sınırlı.'],
    })[sec] || ['info', 'info', 'Site bilgisi', 'Bu sayfa (ör. data: ya da about:blank) bir siteye ait değil.'];
  }

  const DEF_LABEL = { ask: 'Sor', allow: 'İzin ver', block: 'Engelle' };
  function PermRow({ origin, id, value, onSet }) {
    const m = tb.perm(id);
    const def = store.get(`settings.sitePermissions.${id}`) || 'ask';
    const options = [
      { value: 'allow', label: 'İzin ver' },
      { value: 'block', label: 'Engelle' },
      { value: 'default', label: `${DEF_LABEL[def] || 'Sor'} (varsayılan)` },
    ];
    const v = value === 'allow' || value === 'block' ? value : 'default';
    return html`<div class="tb-si-perm">
      <span class=${cx('tb-pop-ic is-sm', v === 'block' && 'is-off')}><${Icon} name=${v === 'block' ? m.off : m.icon} size=${16}/></span>
      <span class="tb-si-perm-label">${m.label}</span>
      <${Select} value=${v} options=${options} label=${`${m.label} izni: ${origin}`} onChange=${(nv) => onSet(id, nv)}/>
    </div>`;
  }

  /* ── Site bilgisi paneli ──────────────────────────────── */
  function SiteInfo({ close, tabId, anchor }) {
    tb.useOutsideClose(close, anchor);
    const tab = Vox.useStore((s) => (s.tabs || []).find((t) => t.id === tabId) || null);
    const url = tab ? tab.url : '';
    const [info, setInfo] = useState(null);
    const [view, setView] = useState('main');
    const [changed, setChanged] = useState(false);
    const [wipe, setWipe] = useState('idle');
    const load = () => Vox.native.invoke('site:info', { tabId }).then((r) => setInfo(r || false), () => setInfo(false));
    useEffect(() => { load(); }, [url]);
    useEffect(() => { if (!tab) close(); }, [!tab]);
    const origin = info ? info.origin : '';
    const site = Vox.useStore((s) => (origin && s.permissions && s.permissions[origin]) || null);
    if (!tab) return null;
    if (view === 'cert' && info && info.cert) return html`<${CertView} info=${info} close=${close} back=${() => setView('main')}/>`;

    const sec = tab.security;
    const conn = connOf(sec, info);
    const web = !!origin && sec !== 'error';
    const host = (info && info.host) || tb.host(url);
    const title = sec === 'internal' ? 'VoxBrowser' : origin ? host.replace(/^www\./, '') : sec === 'file' ? 'Yerel dosya' : 'Bu sayfa';
    const certable = !!(info && info.cert);
    const ConnTag = certable ? 'button' : 'div';
    const ids = [...tb.SITE_PERMS, ...Object.keys(site || {}).filter((k) => !tb.SITE_PERMS.includes(k) && k !== 'camera+microphone')];
    const setPerm = (perm, v) => {
      if (v === 'default') {
        store.set('permissions', (p = {}) => {
          const cur = { ...(p[origin] || {}) };
          delete cur[perm];
          const next = { ...p };
          if (Object.keys(cur).length) next[origin] = cur; else delete next[origin];
          return next;
        });
      } else Vox.permissions.set(origin, perm, v);
      setChanged(true);
    };
    const reset = () => { Vox.native.invoke('permissions:reset', { origin }).catch(() => {}); setChanged(true); };
    const clearData = () => {
      setWipe('busy');
      Vox.native.invoke('site:clear', { tabId }).then((ok) => { setWipe(ok ? 'done' : 'idle'); if (!ok) tb.toast('Site verileri silinemedi.', 'circle-alert'); load(); }, () => setWipe('idle'));
    };
    const reload = () => { close(); Vox.nav.reload(tabId); };
    const httpsOnly = web && info && info.httpAllowed && Vox.settings.get('privacy.httpsOnly');

    return html`<div class="tb-si">
      <${Head} title=${title} close=${close}>
        <span class="tb-si-fav">${sec === 'internal' ? html`<${Logo} size=${22} decorative=${true}/>` : html`<${Favicon} spec=${tab.favicon} size=${20}/>`}</span>
      <//>
      <div class="tb-pop-list">
        <${ConnTag} type=${certable ? 'button' : undefined} class=${cx('tb-pop-row tb-si-conn', `is-${conn[1]}`, !certable && 'is-static')}
          aria-label=${certable ? `${conn[2]} — sertifikayı göster` : undefined} onClick=${certable ? () => setView('cert') : undefined}>
          <span class="tb-pop-ic"><${Icon} name=${conn[0]} size=${18}/></span>
          <span class="tb-pop-text"><b>${conn[2]}</b><small>${conn[3]}</small></span>
          ${certable ? html`<${Icon} name="chevron-right" size=${18} class="tb-pop-chev"/>` : null}
        <//>
        ${info === null && tb.isWeb(url) ? html`<div class="tb-pop-row is-static"><${Skeleton} w=${36} h=${36} r=${12}/><span class="tb-pop-text"><${Skeleton} w="60%"/><${Skeleton} w="40%" h=${12}/></span></div>` : null}
        ${info && tb.isWeb(url) && sec === 'secure' && !info.cert ? html`<p class="tb-pop-note is-row"><${Icon} name="info" size=${15}/>Sertifika ayrıntıları bu oturumda alınamadı; sayfayı yeniden yükleyince görünür.</p>` : null}
        ${httpsOnly ? html`<p class="tb-pop-note is-row"><${Icon} name="lock-open" size=${15}/>Bu site için “Yalnızca HTTPS” bu oturumda kapatıldı.</p>` : null}
        ${web ? html`<div class="tb-pop-row tb-si-data">
          <span class="tb-pop-ic is-honey"><${Icon} name="cookie" size=${18}/></span>
          <span class="tb-pop-text"><b>Çerezler ve site verileri</b><small>${info.cookies ? `${Vox.fmt.num(info.cookies)} çerez kayıtlı` : 'Kayıtlı çerez yok'}</small></span>
          ${wipe === 'idle' || wipe === 'done' ? html`<${Button} size="sm" variant="soft" icon="trash-2" onClick=${() => setWipe('confirm')}>Sil<//>` : null}
        </div>` : null}
        ${wipe === 'confirm' || wipe === 'busy' ? html`<div class="tb-si-confirm" role="alert">
          <p><b>${host} için site verileri silinsin mi?</b><small>Çerezler ve sitenin bu cihazda sakladığı veriler silinir; bu sitedeki oturumunuz kapanabilir.</small></p>
          <div class="tb-pop-actions"><${Button} size="sm" variant="ghost" onClick=${() => setWipe('idle')}>Vazgeç<//>
            <${Button} size="sm" variant="danger" loading=${wipe === 'busy'} onClick=${clearData}>Verileri sil<//></div>
        </div>` : null}
      </div>
      ${web ? html`<section class="tb-si-perms" aria-label="İzinler">
        <h3 class="tb-pop-h">İzinler</h3>
        ${ids.map((id) => html`<${PermRow} key=${id} origin=${origin} id=${id} value=${site ? site[id] : undefined} onSet=${setPerm}/>`)}
      </section>` : null}
      ${changed || wipe === 'done' ? html`<div class="tb-si-reload"><${Icon} name="rotate-cw" size=${16}/>
        <span>${wipe === 'done' ? 'Site verileri silindi. Sayfayı yeniden yükleyin.' : 'Yeni ayarlar için sayfayı yeniden yükleyin.'}</span>
        <${Button} size="sm" variant="secondary" onClick=${reload}>Yeniden yükle<//></div>` : null}
      ${web ? html`<footer class="tb-pop-foot is-split">
        ${site && Object.keys(site).length ? html`<${Button} variant="ghost" size="sm" icon="rotate-ccw" onClick=${reset}>İzinleri sıfırla<//>` : html`<span></span>`}
        <${Button} variant="ghost" size="sm" icon="settings" onClick=${() => { close(); tb.openSettings('gizlilik'); }}>Site ayarları<//>
      </footer>` : null}
    </div>`;
  }

  tb.openSiteInfo = (anchor) => {
    const a = anchor instanceof Element && anchor.isConnected ? anchor : tb.anchor('siteinfo');
    const tab = Vox.tabs.active();
    if (!tab || !a) return;
    if (tb.collapsePrompt && tb.collapsePrompt()) return; // açık izin isteği önce küçülür
    if (tb.closeOn(a)) return;
    if (tb.isNtp(tab.url)) { if (tb.focusOmnibox) tb.focusOmnibox(); return; }
    Vox.ui.popover({
      anchor: a, placement: 'bottom-start', width: 380, className: 'tb-pop tb-sipop', label: 'Site bilgisi', persistent: true,
      render: ({ close }) => html`<${SiteInfo} close=${close} tabId=${tab.id} anchor=${a}/>`,
    });
  };

  tb.SiteButton = SiteButton;
  Vox.commands.register('siteinfo.open', { title: 'Site bilgisi', icon: 'shield-check', run: (a = {}) => tb.openSiteInfo(a.anchor) });
});
