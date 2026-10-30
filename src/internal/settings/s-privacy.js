/* VoxBrowser — Ayarlar › Gizlilik ve güvenlik: yalnızca HTTPS, GPC ve "Takip Etme" sinyalleri, tarama verilerini temizle,
   çıkışta site verilerini temizle, varsayılan site izinleri ve siteye özel izinler (ana süreç bunları gerçekten uygular).
   İzleyici engelleme, güvenli DNS, güvenli tarama ve üçüncü taraf çerez kuralları bir sonraki sürümde: görünür ama
   "Yakında" ile işaretli ve kapalı. */
Vox.define('settings.privacy', (Vox) => {
  const { html, useState, useRef } = Vox.p;
  const { cx, uid } = Vox.util;
  const { Icon, Button, Kbd, Select, Favicon } = Vox.c;
  const st = Vox.st;
  const { Card, Row, ToggleRow, SelectRow, Hi, Note } = st;
  const store = Vox.store;

  /* ── İzleme koruması (yakında) ─────────────────────────── */
  const LEVELS = [
    { id: 'standart', label: 'Standart', desc: 'Bilinen izleyicileri engeller; siteler sorunsuz çalışır.', fill: 0.55 },
    { id: 'siki', label: 'Sıkı', desc: 'Daha çok izleyiciyi engeller; bazı siteler eksik görünebilir.', fill: 1 },
    { id: 'ozel', label: 'Özel', desc: 'Neyin engelleneceğini kendiniz seçin.', fill: 0.78 },
  ];
  const SHIELD = 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';
  function Shield({ fill }) {
    const id = useRef(uid('st-sh')).current;
    return html`<svg class="st-shield" viewBox="0 0 24 24" width="46" height="46" aria-hidden="true">
      <defs><clipPath id=${id}><path d=${SHIELD}/></clipPath></defs>
      <g clip-path=${`url(#${id})`}>
        <rect class="st-shield-bg" x="0" y="0" width="24" height="24"/>
        <rect class="st-shield-fill" x="0" y="0" width="24" height="24" style=${`transform:scaleY(${fill})`}/>
      </g>
      <path class="st-shield-line" d=${SHIELD}/>
    </svg>`;
  }
  /** The three protection levels, shown as a preview of what is coming (not selectable yet). */
  const Levels = () => html`<div class="st-levels is-soon" role="group" aria-label="İzleme koruması düzeyleri (yakında)">
    ${LEVELS.map((l) => html`<div class="st-level" key=${l.id} aria-disabled="true">
      <span class="st-level-shield"><${Shield} fill=${l.fill}/></span>
      <span class="st-level-text"><span class="st-level-name"><b>${l.label}</b></span><small>${l.desc}</small></span>
    </div>`)}
  </div>`;

  /* ── Site izinleri ────────────────────────────────────── */
  /* Ana sürecin izin anahtarları (permissions.js keyOf) → Türkçe ad ve simge. */
  const PERMS = {
    location: { label: 'Konum', icon: 'map-pin' },
    camera: { label: 'Kamera', icon: 'camera' },
    microphone: { label: 'Mikrofon', icon: 'mic' },
    notifications: { label: 'Bildirimler', icon: 'bell' },
    clipboard: { label: 'Panoyu okuma', icon: 'clipboard' },
    screen: { label: 'Ekran paylaşımı', icon: 'screen-share' },
    midi: { label: 'MIDI cihazları', icon: 'piano' },
    windows: { label: 'Pencere yönetimi', icon: 'app-window' },
    idle: { label: 'Kullanım algılama', icon: 'coffee' },
    storage: { label: 'Depolama erişimi', icon: 'database' },
    files: { label: 'Dosya düzenleme', icon: 'file-pen' },
    drm: { label: 'Korumalı içerik', icon: 'shield' },
    keyboard: { label: 'Klavye kilidi', icon: 'keyboard' },
    speakers: { label: 'Hoparlör seçimi', icon: 'speaker' },
  };
  const DEFAULT_PERMS = ['location', 'camera', 'microphone', 'notifications', 'clipboard'];
  const permOf = (k) => PERMS[k] || { label: k, icon: 'circle-help' };
  const VAL = { ask: 'Sor', allow: 'İzin ver', block: 'Engelle' };
  const STATE = { ask: 'sorulur', allow: 'izinli', block: 'engelli' };
  const defOpts = [{ value: 'ask', label: 'Sor (önerilen)' }, { value: 'block', label: 'Engelle' }];

  function SiteList() {
    const perms = Vox.useStore('permissions') || {};
    const defs = Vox.useStore('settings.sitePermissions') || {};
    Vox.useStore('history');
    const [open, setOpen] = useState(null);
    const origins = Object.keys(perms).filter((o) => perms[o] && Object.keys(perms[o]).length);
    if (!origins.length) return html`<p class="st-empty-line"><${Icon} name="globe" size=${18}/>Henüz siteye özel bir izin yok. Bir site izin istediğinde verdiğiniz yanıt burada görünür.</p>`;
    const setPerm = (o, k, v) => store.set('permissions', (p = {}) => {
      const cur = { ...(p[o] || {}) };
      if (v === 'default') delete cur[k]; else cur[k] = v;
      const n = { ...p, [o]: cur };
      if (!Object.keys(cur).length) delete n[o];
      return n;
    });
    const reset = async (o) => {
      const prev = perms[o];
      setOpen(null);
      await Vox.native.invoke('permissions:reset', { origin: o }).catch((e) => Vox.reportError('permissions:reset', e));
      st.undo(`${st.host(o)} için izinler sıfırlandı.`, () => store.set('permissions', (p = {}) => ({ ...p, [o]: prev })), 'rotate-ccw');
    };
    return html`<ul class="st-sites" aria-label="Siteye özel izinler">${origins.map((o) => {
      const p = perms[o], isOpen = open === o;
      const keys = [...new Set([...DEFAULT_PERMS, ...Object.keys(p)])];
      return html`<li class=${cx('st-site', isOpen && 'is-open')} key=${o}>
        <button type="button" class="st-site-head" aria-expanded=${String(isOpen)} onClick=${() => setOpen(isOpen ? null : o)}>
          <span class="st-li-fav"><${Favicon} spec=${st.fav(o)} size=${18}/></span>
          <span class="st-li-text"><b><${Hi} text=${st.host(o)}/></b>
            <small>${Object.entries(p).map(([k, v]) => `${permOf(k).label} ${STATE[v] || v}`).join(' · ')}</small></span>
          <${Icon} name="chevron-down" size=${18} class="st-site-chev"/>
        </button>
        ${isOpen ? html`<div class="st-site-body st-reveal">
          ${keys.map((k) => html`<div class="st-site-perm" key=${k}>
            <${Icon} name=${permOf(k).icon} size=${16}/><span>${permOf(k).label}</span>
            <${Select} value=${p[k] || 'default'} label=${`${st.host(o)} için ${permOf(k).label}`} width=${190} onChange=${(v) => setPerm(o, k, v)}
              options=${[{ value: 'default', label: `Varsayılan (${VAL[defs[k] || 'ask']})` }, ...['allow', 'block'].map((v) => ({ value: v, label: VAL[v] }))]}/>
          </div>`)}
          <div class="st-btns">
            <${Button} size="sm" variant="soft" icon="rotate-ccw" onClick=${() => reset(o)}>İzinleri sıfırla<//>
            <${Button} size="sm" variant="ghost" icon="square-arrow-out-up-right" onClick=${() => Vox.tabs.open(`${o}/`)}>Siteye git<//>
          </div>
        </div>` : null}
      </li>`;
    })}</ul>`;
  }

  function PrivacySection() {
    const perms = Vox.useStore('permissions') || {};
    const n = Object.keys(perms).filter((o) => perms[o] && Object.keys(perms[o]).length).length;
    return html`
      <${Card} title="Güvenlik" desc="Bağlantılarınızı koruyan ve sitelere gizlilik tercihinizi bildiren ayarlar." kw="güvenli https gpc">
        <${ToggleRow} path="privacy.httpsOnly" label="Her zaman güvenli bağlantı kullan" desc="Adresler HTTPS ile açılır; güvenli sürümü olmayan bir siteye girmeden önce sorulur." icon="lock" kw="https yalnızca şifreli ssl"/>
        <${ToggleRow} path="privacy.gpc" label="Sitelere verilerimi satmamalarını söyle" desc="Küresel Gizlilik Denetimi (GPC) sinyalini her istekle gönderir." icon="hand" kw="gpc global privacy control"/>
        <${ToggleRow} path="privacy.dnt" label="“Takip Etme” isteği gönder" desc="Her istekle DNT sinyali gönderilir. Pek çok site bu isteği dikkate almaz." icon="eye-off" kw="do not track dnt takip"/>
        <${SelectRow} label="Güvenli DNS" desc="Ziyaret ettiğiniz sitelerin adlarını şifreli olarak çözer." icon="server" kw="dns doh şifreli ad çözümleme" soon width=${200}
          value="otomatik" options=${[{ value: 'otomatik', label: 'Otomatik' }]}/>
        <${Row} stack label="Güvenli tarama" desc="Tehlikeli sitelere ve zararlı indirmelere karşı uyarılar." icon="shield-check" kw="kimlik avı zararlı virüs phishing" soon>
          <${Note} icon="info">Şimdilik: çalıştırılabilir dosyaların indirilmesi siz onaylayana kadar bekletilir; sertifika hatası olan sitelere siz izin vermeden girilmez.<//>
        <//>
      <//>
      <${Card} title="İzleme koruması" desc="Sitelerin ve reklam ağlarının sizi internette takip etmesini engelleyin." kw="izleyici tracker reklam engelle" soon>
        <${Row} bare label="İzleme koruması düzeyi" kw="standart sıkı özel izleyici engelleme reklam"><${Levels}/><//>
      <//>
      <${Card} title="Çerezler ve site verileri" kw="cookie çerez">
        <${Row} label="Tarama verilerini temizle" desc="Geçmişi, çerezleri, önbelleği ve daha fazlasını silin." icon="trash-2" tone="danger" kw="sil geçmiş önbellek cache çerez temizle"
          onClick=${() => st.clearData && st.clearData.open()}><${Kbd} keys="Ctrl+Shift+Delete"/><//>
        <${ToggleRow} label="Üçüncü taraf çerezlerini engelle" desc="Başka sitelerin, ziyaret ettiğiniz sayfaya yerleştirdiği çerezler." icon="cookie" kw="cookie çerez reklam üçüncü taraf" soon/>
        <${ToggleRow} path="privacy.clearOnExit" label="Çıkışta çerezleri ve site verilerini temizle" desc="VoxBrowser'ı kapattığınızda tüm sitelerin çerezleri ve verileri silinir; sitelerden çıkış yaparsınız." icon="log-out" kw="kapanış sil çıkış"/>
      <//>
      <${Card} title="Site izinleri" desc="Bir site bunları kullanmak istediğinde ne olacağını seçin." kw="izin konum kamera mikrofon bildirim">
        ${DEFAULT_PERMS.map((k) => html`<${SelectRow} key=${k} path=${`sitePermissions.${k}`} label=${permOf(k).label} icon=${permOf(k).icon} options=${defOpts} width=${170} inline kw="izin site varsayılan"/>`)}
        <${SelectRow} path="sitePermissions.popups" label="Açılır pencereler" icon="square-arrow-out-up-right" kw="izin popup açılır pencere reklam" width=${170} inline
          options=${[{ value: 'block', label: 'Engelle (önerilen)' }, { value: 'allow', label: 'İzin ver' }]}/>
        <${SelectRow} label="Ses" icon="volume-2" kw="izin ses otomatik oynatma" soon width=${180}
          value="allow" options=${[{ value: 'allow', label: 'İzin ver' }]}/>
      <//>
      <${Card} title="Siteye özel izinler" desc=${n ? `${n} site için ayrı kural var.` : 'Sitelere tek tek verdiğiniz izinler.'} kw="istisna izin site sıfırla">
        <${Row} bare label="Siteye özel izinler" kw=${`istisna ${Object.keys(perms).map(st.host).join(' ')}`}><${SiteList}/><//>
      <//>`;
  }

  st.register({ id: 'gizlilik', order: 60, title: 'Gizlilik ve güvenlik', icon: 'shield-check', kw: 'gizlilik güvenlik izleme çerez izin',
    desc: 'Güvenli bağlantı, gizlilik sinyalleri, tarama verileri ve site izinleri.', component: PrivacySection });
});
