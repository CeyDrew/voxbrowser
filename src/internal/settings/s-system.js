/* VoxBrowser — Ayarlar › Erişilebilirlik (VoxBrowser animasyonları: sisteme göre / her zaman / azaltılmış; en küçük yazı
   tipi boyutu), Sistem ve performans (donanım hızlandırma + yeniden başlatma, görev yöneticisi; tasarruf modları yakında),
   Varsayılan tarayıcı (Windows'a kayıt + Varsayılan uygulamalar ayarı), Ayarları sıfırla (varsayılanlar ana süreçten). */
Vox.define('settings.system', (Vox) => {
  const { html, useState, useEffect, useRef } = Vox.p;
  const { cx } = Vox.util;
  const { Icon, Button, Kbd, Logo, Slider } = Vox.c;
  const st = Vox.st;
  const { Card, Row, ToggleRow, RestartRow, Note } = st;
  const store = Vox.store;
  const pointOf = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  /* ── Animasyonlar: tek denetim, çekirdeğin iki anahtarına eşlenir (reduceMotion / forceMotion) ── */
  const MOTION = [
    { value: 'system', label: 'Sisteme göre', icon: 'monitor' },
    { value: 'on', label: 'Her zaman açık', icon: 'sparkles' },
    { value: 'reduced', label: 'Azaltılmış', icon: 'waves' },
  ];
  const motionOf = (a) => (a.reduceMotion ? 'reduced' : a.forceMotion ? 'on' : 'system');
  const setMotion = (m) => {
    const a = Vox.settings.get('a11y') || {};
    Vox.settings.set('a11y', { ...a, reduceMotion: m === 'reduced', forceMotion: m === 'on' });
  };
  const MOTION_DESC = {
    system: (os, remote) => (remote ? 'Uzak Masaüstü bağlantısında Windows animasyonları kapatır; VoxBrowser animasyonları yine de oynatır.' : os ? 'Cihazınızın ayarı izleniyor; animasyonlar şu an sade gösteriliyor.' : 'Cihazınızın ayarı izleniyor; animasyonlar açık.'),
    on: () => 'Cihazınızın ayarı ne olursa olsun VoxBrowser’ın geçişleri ve animasyonları oynatılır.',
    reduced: () => 'VoxBrowser’ın animasyonları ve geçişleri en aza indirilir.',
  };
  /** Three-way segmented whose thumb is pure CSS (stays aligned when the card resizes). */
  function MotionPicker({ value }) {
    const ref = useRef();
    const i = Math.max(0, MOTION.findIndex((m) => m.value === value));
    const onKey = (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = MOTION[(i + d + MOTION.length) % MOTION.length];
      setMotion(n.value);
      setTimeout(() => { const b = ref.current && ref.current.querySelector(`[data-m="${n.value}"]`); if (b) b.focus(); }, 0);
    };
    return html`<div class="st-seg3" role="radiogroup" aria-label="Animasyonlar" style=${`--i:${i}`} ref=${ref} onKeyDown=${onKey}>
      <span class="st-seg3-thumb" aria-hidden="true"></span>
      ${MOTION.map((m) => html`<button type="button" role="radio" key=${m.value} data-m=${m.value} aria-checked=${String(value === m.value)}
        tabindex=${value === m.value ? 0 : -1} onClick=${() => setMotion(m.value)}><${Icon} name=${m.icon} size=${16}/><span>${m.label}</span></button>`)}
    </div>`;
  }

  /* En küçük yazı tipi boyutu (ana süreç yeni sekmelerde Chromium'a verir). */
  function MinFont() {
    const x = Vox.useStore('settings.a11y.minFontSize') || 0;
    return html`<div class="st-font">
      <${Slider} value=${x} min=${0} max=${24} step=${1} label="Sınır" format=${(n) => (n ? `${n} px` : 'Kapalı')} onChange=${(n) => Vox.settings.set('a11y.minFontSize', n)}/>
      <div class="st-font-pv st-minfont" aria-hidden="true">
        <small style=${`font-size:${Math.max(x, 9)}px`}>İçindekiler · Gizlilik · Yardım · © 2026</small>
        <p>${x ? `Sitelerdeki dipnotlar ve küçük yazılar en az ${x} piksel olur.` : 'Siteler istedikleri kadar küçük yazı kullanabilir.'}</p>
      </div>
    </div>`;
  }

  function A11ySection() {
    const a = Vox.useStore('settings.a11y') || {};
    const osReduced = Vox.motion.systemPrefersReduced ? Vox.motion.systemPrefersReduced() : false;
    const mode = motionOf(a);
    return html`
      <${Card} title="Hareket" desc="Değişiklik VoxBrowser'ın tüm pencerelerine hemen uygulanır." kw="animasyon">
        <${Row} stack label="Animasyonlar" desc=${MOTION_DESC[mode](osReduced, !!a.remoteSession)} icon="sparkles" kw="hareket hareketi azalt animasyon geçiş her zaman sistem">
          <${MotionPicker} value=${mode}/>
          ${osReduced && !(a.remoteSession && mode !== 'reduced') ? html`<div class="st-motion-note"><${Note} icon="info" tone="honey">Cihazınız hareketin azaltılmasını istiyor${mode === 'on'
            ? '; VoxBrowser yine de animasyonları gösteriyor.' : mode === 'system' ? '. Animasyonları görmek için “Her zaman açık”ı seçin.' : '.'}<//></div>` : null}
        <//>
      <//>
      <${Card} title="Okunabilirlik" kw="yazı tipi font">
        <${Row} stack label="En küçük yazı tipi boyutu" desc="Sitelerin bu boyuttan küçük yazı kullanmasını engeller. Yeni açılan sekmelerde geçerli olur." icon="a-large-small"
          kw="font minimum küçük yazı okunabilirlik"><${MinFont}/><//>
        <${Row} label="Yazı tipi boyutu ve sayfa yakınlaştırma" desc="Görünüm bölümünde ayarlayın." icon="zoom-in" kw="zoom büyüt yazı boyutu" onClick=${() => st.go('gorunum')}/>
      <//>
      <${Card} title="Klavye ve altyazı" kw="odak klavye altyazı" soon>
        <${ToggleRow} label="Odak vurgusu" desc="Klavyeyle gezinirken odaktaki öğenin çevresinde belirgin bir halka gösterir." icon="focus" kw="odak klavye halka tab" soon/>
        <${ToggleRow} label="İmleçle gezinme" desc="Sayfalarda metin imleciyle gezinip ok tuşlarıyla seçim yapın (F7)." icon="text-cursor" kw="f7 imleç klavye seçim" soon/>
        <${ToggleRow} label="Canlı altyazı" desc="Videolar ve sesli içerikler için otomatik altyazı oluşturur." icon="captions" kw="altyazı işitme ses video" soon/>
      <//>`;
  }

  /* ── Sistem ve performans ─────────────────────────────── */
  function SystemSection() {
    return html`
      <${Card} title="Sistem" kw="donanım grafik">
        <${ToggleRow} path="system.hardwareAccel" label="Donanım hızlandırmayı kullan" desc="Sayfalar mümkün olduğunda ekran kartıyla daha akıcı çizilir. VoxBrowser yeniden açıldığında geçerli olur." icon="cpu" kw="gpu grafik ekran kartı"/>
        <${RestartRow}/>
        <${Row} label="Görev yöneticisi" desc="Hangi sekmenin ne kadar bellek ve işlemci kullandığını görün." icon="activity" kw="süreç işlem bellek cpu" onClick=${() => Vox.tabs.open('vox://surecler')}>
          <${Kbd} keys="Shift+Esc"/>
        <//>
        <${ToggleRow} label="Kapattıktan sonra arka planda çalış" desc="Bildirimler VoxBrowser kapalıyken de gelir." icon="layers" kw="arka plan" soon/>
      <//>
      <${Card} title="Performans" desc="VoxBrowser'ın bellek ve pil kullanımını dengeleyin." kw="hız bellek pil" soon>
        <${ToggleRow} label="Bellek tasarrufu" desc="Bir süredir kullanmadığınız sekmeleri uyutur; döndüğünüzde kaldığı yerden yüklenir." icon="memory-stick" kw="ram bellek uyku sekme" soon/>
        <${ToggleRow} label="Enerji tasarrufu" desc="Pil azaldığında arka plan etkinliğini ve görsel efektleri kısar." icon="battery-low" kw="pil batarya şarj" soon/>
        <${ToggleRow} label="Sayfaları önceden yükle" desc="Gitmeniz muhtemel sayfaları önceden hazırlar." icon="rocket" kw="hız önceden yükleme" soon/>
      <//>`;
  }

  /* ── Varsayılan tarayıcı ──────────────────────────────── */
  function DefaultSection() {
    const [state, setState] = useState(null); // { isDef, packaged }
    const [asked, setAsked] = useState(false);
    const [busy, setBusy] = useState(false);
    const check = async () => {
      const [d, info] = await Promise.all([
        Vox.native.invoke('defaultBrowser:get').catch(() => null),
        Vox.native.invoke('app:info').catch(() => null),
      ]);
      // ready: kurulum VoxBrowser'ı Windows'a tarayıcı olarak kaydettiyse (sonraki sürüm); o zamana dek düğme kapalı
      setState({ isDef: !!(d && d.http && d.https), packaged: !!(info && info.packaged), ready: !!(info && info.packaged && info.defaultBrowserReady) });
    };
    useEffect(() => {
      check();
      /* Windows ayarlarından dönünce durumu yeniden sor */
      const onFocus = () => check();
      window.addEventListener('focus', onFocus);
      return () => window.removeEventListener('focus', onFocus);
    }, []);
    /* Windows ayarları açıkken seçim yapılınca sayfa kendiliğinden güncellensin */
    useEffect(() => {
      if (!asked || (state && state.isDef)) return undefined;
      const t = setInterval(check, 2500);
      return () => clearInterval(t);
    }, [asked, state && state.isDef]);
    const make = async () => {
      setBusy(true);
      const r = await Vox.native.invoke('defaultBrowser:set').catch(() => false);
      setBusy(false);
      if (r) setAsked(true);
      else Vox.ui.toast({ icon: 'info', text: 'Windows ayarları açılamadı. Ayarlar › Uygulamalar › Varsayılan uygulamalar bölümünden seçebilirsiniz.' });
      check();
    };
    const isDef = state && state.isDef;
    return html`<${Card} kw="varsayılan tarayıcı bağlantı">
      <${Row} bare label="Varsayılan tarayıcı" kw="varsayılan yap bağlantılar windows">
        <div class=${cx('st-default', isDef && 'is-def')}>
          <div class="st-default-art"><${Logo} size=${76} decorative=${true}/><span class="st-default-badge">${isDef ? html`<${st.CheckDraw} size=${36}/>` : html`<${Icon} name="star" size=${16}/>`}</span></div>
          <div class="st-default-text">
            <h3>${!state ? 'Denetleniyor…' : isDef ? 'VoxBrowser varsayılan tarayıcınız' : 'VoxBrowser varsayılan tarayıcınız değil'}</h3>
            <p>${isDef ? 'E-postalardaki ve uygulamalardaki bağlantılar VoxBrowser’da açılıyor.' : 'E-postalardaki ve uygulamalardaki bağlantılar şu an başka bir tarayıcıda açılıyor.'}</p>
            ${state && !isDef ? html`<div class="st-btns">
              <${Button} variant="primary" icon="badge-check" loading=${busy} disabled=${!state.ready} onClick=${make}>Varsayılan yap<//>
            </div>` : null}
            ${state && !isDef && !state.packaged ? html`<${Note} icon="info">Bu ayar VoxBrowser kurulduktan sonra çalışır. Şu an geliştirme sürümünü kullanıyorsunuz.<//>` : null}
            ${state && !isDef && state.packaged && !state.ready ? html`<${Note} icon="hourglass">VoxBrowser’ı varsayılan tarayıcı yapabilmek için Windows’a kaydı bir sonraki sürümde geliyor.<//>` : null}
            ${asked && !isDef ? html`<${Note} icon="settings-2">Windows ayarları açıldı: “Web tarayıcısı” altında VoxBrowser’ı seçin. Seçtiğinizde bu sayfa kendiliğinden güncellenir.<//>` : null}
          </div>
        </div>
      <//>
    <//>`;
  }

  /* ── Sıfırla ──────────────────────────────────────────── */
  /* Varsayılanlar ana süreçten gelir (data:defaults). İndirme klasörü, kayıtlı adresler ve arayüz tercihleri korunur;
     yer imleri, geçmiş, parolalar, arama motoru listesi ve siteye özel izinler ayrı dilimlerde olduğu için etkilenmez. */
  async function resetSettings(e) {
    const pt = pointOf(e);
    const ok = await Vox.ui.confirm({
      title: 'Ayarlar sıfırlansın mı?', icon: 'rotate-ccw', danger: true, confirmLabel: 'Sıfırla',
      text: 'Tema, açılış, arama motoru, gizlilik ve varsayılan site izinleri ilk hâline döner. Yer imleriniz, geçmişiniz, parolalarınız, adresleriniz ve indirme klasörünüz olduğu gibi kalır.',
    });
    if (!ok) return;
    const defs = await Vox.native.invoke('data:defaults', { slice: 'settings' }).catch((err) => { Vox.reportError('data:defaults', err); return null; });
    if (!defs || typeof defs !== 'object') {
      Vox.ui.toast({ icon: 'triangle-alert', tone: 'danger', text: 'Varsayılan ayarlar alınamadı. Lütfen yeniden deneyin.' });
      return;
    }
    const cur = store.get('settings') || {};
    const theme = (defs.appearance || {}).theme || 'system';
    store.set('settings', {
      ...cur,
      ...defs,
      ui: cur.ui || defs.ui || {},
      downloads: { ...(defs.downloads || {}), location: (cur.downloads || {}).location || (defs.downloads || {}).location },
      appearance: { ...(defs.appearance || {}), theme: (cur.appearance || {}).theme || theme }, // tema aşağıda, dairesel geçişle
    });
    Vox.theme.set(theme, pt);
    st.toast('Ayarlar varsayılan değerlerine döndü.', { icon: 'rotate-ccw' });
  }
  function ResetSection() {
    return html`<${Card} kw="sıfırla varsayılan geri yükle">
      <${Row} label="Ayarları varsayılan değerlerine döndür" desc="Yer imleri, geçmiş, parolalar ve adresler silinmez." icon="rotate-ccw" tone="danger" kw="sıfırla fabrika" wide>
        <${Button} size="sm" variant="danger" onClick=${resetSettings}>Ayarları sıfırla<//>
      <//>
      <${RestartRow}/>
    <//>`;
  }

  st.register({ id: 'erisilebilirlik', order: 100, title: 'Erişilebilirlik', icon: 'accessibility', kw: 'erişilebilirlik hareket altyazı',
    desc: 'Animasyonlar, klavyeyle gezinme ve okunabilirlik.', component: A11ySection });
  st.register({ id: 'sistem', order: 110, title: 'Sistem ve performans', icon: 'gauge', kw: 'sistem performans bellek',
    desc: 'Donanım hızlandırma ve görev yöneticisi; tasarruf modları yakında.', component: SystemSection });
  st.register({ id: 'varsayilan', order: 120, title: 'Varsayılan tarayıcı', icon: 'monitor-check', kw: 'varsayılan',
    desc: 'Bağlantıların hangi tarayıcıda açılacağı.', component: DefaultSection });
  st.register({ id: 'sifirla', order: 130, title: 'Ayarları sıfırla', icon: 'rotate-ccw', kw: 'sıfırla', divider: true,
    desc: 'Ayarları ilk hâline döndürün.', component: ResetSection });
});
