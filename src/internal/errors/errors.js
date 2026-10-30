/* VoxBrowser — vox://hata/?code=&desc=&url= : bir sayfa açılamadığında ana sürecin gösterdiği hata sayfası.
   Hata türüne göre Voxi çizimi, açıklama ve öneriler; "Yeniden dene", sertifika sorunlarında "Gelişmiş › Riskleri anlıyorum",
   Yalnızca HTTPS modunda "HTTP ile devam et", internet yokken mini oyun. Sınıflandırma: codes.js. */
Vox.define('errors.page', (Vox) => {
  const { html, useState, useEffect, useRef } = Vox.p;
  const { Button, Icon } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const E = Vox.err;
  const N = Vox.native;
  const stamp = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const day = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  const engine = () => {
    const id = store.get('settings.search.engine');
    const list = store.get('searchEngines') || [];
    return list.find((x) => x.id === id) || list[0] || null;
  };
  const searchUrl = (q) => { const e = engine(); return e && e.url ? e.url.replace('%s', encodeURIComponent(q)) : null; };

  /* "Bunu mu demek istediniz?": geçmişte, yer imlerinde ya da kısayollarda çok benzer bir alan adı varsa. */
  function distance(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 9;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function guessHost(hostname) {
    const want = String(hostname || '').replace(/^www\./, '').toLowerCase();
    if (!want) return null;
    const hosts = new Set();
    const add = (url) => { try { const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); if (h) hosts.add(h); } catch (e) { /* yok say */ } };
    (store.get('history') || []).slice(0, 2000).forEach((h) => add(h.url));
    (store.get('shortcuts') || []).forEach((s) => add(s.url));
    if (Vox.bookmarks) Vox.bookmarks.walk((n) => { if (n.url) add(n.url); return true; });
    let best = null, bd = 3;
    for (const h of hosts) {
      if (h === want) continue;
      const d = distance(want, h);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /* ── Düğmeler ─────────────────────────────────────────── */
  function Retry({ url, label = 'Yeniden dene', variant = 'primary' }) {
    const [busy, setBusy] = useState(false);
    const t = useRef(0);
    useEffect(() => () => clearTimeout(t.current), []);
    const go = () => {
      setBusy(true);
      Vox.nav.go(url);
      t.current = setTimeout(() => setBusy(false), 8000); // sayfa değişmezse düğme yeniden kullanılabilsin
    };
    return html`<${Button} variant=${variant} icon="rotate-cw" loading=${busy} onClick=${go}>${busy ? 'Deneniyor…' : label}<//>`;
  }
  function Back({ variant = 'secondary', label = 'Geri dön' }) {
    const go = () => (history.length > 1 ? history.back() : Vox.nav.go('vox://yeni-sekme/'));
    return html`<${Button} variant=${variant} icon="arrow-left" onClick=${go}>${label}<//>`;
  }

  function Details({ e }) {
    const rows = [['Adres', e.url], ['Hata', e.desc ? `${e.kind === 'cert' ? 'NET::' : ''}${e.desc}` : '—'], ['Kod', String(e.code)], ['Zaman', stamp.format(Date.now())]];
    return html`<details class="err-details">
      <summary><${Icon} name="chevron-right" size=${16} class="err-details-chev"/>Teknik ayrıntılar</summary>
      <dl>${rows.map(([k, v]) => html`<div key=${k}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
    </details>`;
  }

  /** HTTPS-only mode is on and the secure address failed: offer the plain HTTP address for this site. */
  function HttpFallback({ e }) {
    const on = Vox.useStore('settings.privacy.httpsOnly');
    const [busy, setBusy] = useState(false);
    if (!on || !e.http || e.scheme !== 'https') return null;
    const httpUrl = e.url.replace(/^https:/i, 'http:');
    const go = async () => {
      setBusy(true);
      let host = '';
      try { host = new URL(httpUrl).host; } catch (err) { /* yok say */ }
      await N.invoke('security:allowHttp', { host }).catch(() => {});
      Vox.nav.go(httpUrl);
    };
    return html`<div class="err-note">
      <${Icon} name="shield-alert" size=${20}/>
      <div class="err-note-body">
        <p><b>Yalnızca HTTPS modu açık.</b> Bu site güvenli bağlantıyı (HTTPS) desteklemiyor olabilir. Şifresiz bağlantıyla devam ederseniz girdiğiniz bilgiler aynı ağdaki başkaları tarafından görülebilir.</p>
        <${Button} variant="soft" size="sm" icon="triangle-alert" loading=${busy} onClick=${go}>HTTP ile devam et<//>
      </div>
    </div>`;
  }

  /** Certificate problem + "Gelişmiş" with the (deliberately quiet) way through. */
  /** Chromium's last certificate for this host (main: security:certInfo), or null when none was seen. */
  function useCertInfo(hostname) {
    const [info, setInfo] = useState(null);
    useEffect(() => {
      let alive = true;
      if (hostname) N.invoke('security:certInfo', { host: hostname }).then((x) => { if (alive) setInfo(x || null); }, () => {});
      return () => { alive = false; };
    }, [hostname]);
    return info;
  }
  /** One concrete sentence about this certificate (expired on…, issued for…, issued by…). */
  function certFact(code, info) {
    if (!info) return '';
    const now = Date.now();
    if (code === -201 && info.validExpiry && info.validExpiry * 1000 < now) return `Sertifikanın süresi ${day.format(info.validExpiry * 1000)} tarihinde dolmuş.`;
    if (code === -201 && info.validStart && info.validStart * 1000 > now) return `Sertifika ${day.format(info.validStart * 1000)} tarihinden itibaren geçerli olacak.`;
    if (code === -200 && info.subject) return `Sertifika “${info.subject}” adı için verilmiş.`;
    if (code === -202 && info.issuerName && info.issuerName === info.subject) return 'Sertifika kendinden imzalı: kimliği bağımsız bir kuruluş doğrulamamış.';
    if (code === -202 && info.issuerName) return `Sertifikayı veren: ${info.issuerName}.`;
    return '';
  }
  function CertInfo({ info }) {
    const expired = info.validExpiry && info.validExpiry * 1000 < Date.now();
    const early = info.validStart && info.validStart * 1000 > Date.now();
    const rows = [
      ['Verildiği ad', info.subject],
      ['Veren', info.issuerName || info.issuer],
      ['Geçerlilik', info.validStart && info.validExpiry ? `${day.format(info.validStart * 1000)} – ${day.format(info.validExpiry * 1000)}` : '', expired || early],
      ['Parmak izi', info.fingerprint, false, true],
      ['Doğrulama', info.result, false, true],
    ].filter((r) => r[1]);
    return html`<dl class="err-certinfo" aria-label="Sertifika bilgileri">
      ${rows.map(([k, v, bad, mono]) => html`<div key=${k}><dt>${k}</dt><dd class=${cx(bad && 'is-bad', mono && 'is-mono')}>${v}</dd></div>`)}
    </dl>`;
  }

  function CertBlock({ e }) {
    const [adv, setAdv] = useState(false);
    const [busy, setBusy] = useState(false);
    const info = useCertInfo(e.hostname);
    const fact = certFact(e.code, info);
    const proceed = async () => {
      setBusy(true);
      await N.invoke('security:allowCert', { host: e.host }).catch(() => {});
      Vox.nav.go(e.url);
    };
    return html`
      <div class="err-problem" role="note"><${Icon} name="shield-x" size=${20}/>
        <div><b>Sertifika sorunu</b><p>${e.cert.problem}${e.cert.clock ? ` Bilgisayarınızın tarihi ve saati doğru mu? Şu an: ${stamp.format(Date.now())}.` : ''}</p>
          ${fact ? html`<p class="err-problem-fact">${fact}</p>` : null}</div>
      </div>
      <div class="err-actions">
        <${Back} variant="primary" label="Güvenli sayfaya dön"/>
        <${Button} variant="ghost" iconRight=${adv ? 'chevron-up' : 'chevron-down'} aria-expanded=${String(adv)} onClick=${() => setAdv(!adv)}>Gelişmiş<//>
      </div>
      ${adv ? html`<div class="err-adv">
        <p>${e.hostname} sunucusu kimliğini kanıtlayamadı. Bu bir yapılandırma hatasından ya da bağlantınızı dinleyen birinden kaynaklanabilir.</p>
        ${info ? html`<${CertInfo} info=${info}/>` : null}
        ${e.cert.bypass
          ? html`<${Button} variant="danger" size="sm" icon="triangle-alert" loading=${busy} onClick=${proceed}>Riskleri anlıyorum, ${e.hostname} adresine devam et<//>`
          : html`<p><b>Bu sorun için devam etme seçeneği yok.</b> Site sahibinin sertifikayı düzeltmesi gerekiyor.</p>`}
      </div>` : null}`;
  }

  /** Offline: real online/offline events + the mini game while waiting. */
  function OfflineExtras({ e }) {
    const [back, setBack] = useState(false);
    useEffect(() => {
      const on = () => setBack(true);
      const off = () => setBack(false);
      window.addEventListener('online', on);
      window.addEventListener('offline', off);
      return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);
    return html`${back ? html`<div class="err-note err-note--ok" role="status"><${Icon} name="wifi" size=${20}/>
        <div class="err-note-body"><p>Bağlantı geri geldi. Sayfayı şimdi yükleyebilirsiniz.</p><${Retry} url=${e.url} label="Sayfayı yükle" variant="primary"/></div></div>` : null}`;
  }

  function ErrorPage({ query }) {
    const e = E.classify(query.code, query.desc, query.url || '');
    const guess = e.guess ? guessHost(e.hostname) : null;
    const search = e.kind === 'dns' && e.hostname ? searchUrl(e.hostname) : null;
    const eng = engine();
    const Hopper = E.Hopper;
    return html`<div class="err-wrap" data-error=${e.kind}>
      <div class=${cx('err-page', e.tone && `err-page--${e.tone}`)}>
        <div class="err-main">
          <div class="err-art"><${E.Voxi} mood=${e.art.mood} prop=${e.art.prop}/></div>
          <div class="err-body">
            <h1 class="err-title">${e.title}</h1>
            ${e.lead ? html`<p class="err-lead">${e.lead}</p>` : null}
            ${e.kind === 'offline' ? html`<${OfflineExtras} e=${e}/>` : null}
            ${guess ? html`<a class="err-guess" href=${`https://${guess}/`}><${Icon} name="sparkles" size=${20}/>
              <span><small>Bunu mu demek istediniz?</small><b>${guess}</b></span><${Icon} name="arrow-right" size=${18}/></a>` : null}
            ${e.cert ? html`<${CertBlock} e=${e}/>` : null}
            <${HttpFallback} e=${e}/>
            ${e.tips.length ? html`<p class="err-tips-h">Şunları deneyebilirsiniz:</p>
              <ul class="err-tips">
                ${e.tips.map((t) => html`<li key=${t}>${t}</li>`)}
                ${search ? html`<li><a class="err-link" href=${search}>“${e.hostname}” için ${eng ? `${eng.name} ile` : 'web’de'} arayın</a></li>` : null}
              </ul>` : null}
            ${!e.cert && (e.retry || e.back) ? html`<div class="err-actions">
              ${e.retry ? html`<${Retry} url=${e.url}/>` : null}
              ${e.back ? html`<${Back} variant=${e.retry ? 'secondary' : 'primary'}/>` : null}
            </div>` : null}
            <${Details} e=${e}/>
          </div>
        </div>
        ${e.kind === 'offline' && Hopper ? html`<section class="err-card" aria-labelledby="err-game-h">
          <h2 class="err-card-title" id="err-game-h"><${Icon} name="gamepad-2" size=${18}/>Beklerken bir tur?</h2>
          <p class="err-card-desc">Voxi’yi engellerin üzerinden zıplatın. Uçan bulutların altından geçebilirsiniz.</p>
          <${Hopper}/>
        </section>` : null}
      </div>
    </div>`;
  }

  Vox.pages.register({ url: 'vox://hata', title: (sub, query) => E.tabTitle(query || {}), icon: 'triangle-alert', component: ErrorPage });
});
