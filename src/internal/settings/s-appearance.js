/* VoxBrowser — Ayarlar › Görünüm: tema kartları (tıklanan noktadan dairesel geçiş; sitelerin renk düzeni de değişir),
   yoğunluk, varsayılan yakınlaştırma, yazı tipi boyutu, yumuşak kaydırma, canlı araç çubuğu önizlemesi, yeni sekme arka planı. */
Vox.define('settings.appearance', (Vox) => {
  const { html, useRef } = Vox.p;
  const { cx } = Vox.util;
  const { Icon, Segmented, Favicon, Slider } = Vox.c;
  const st = Vox.st;
  const { Card, Row, ToggleRow, SelectRow, RestartRow } = st;

  const THEMES = [
    { id: 'light', label: 'Açık', icon: 'sun', desc: 'Ferah ve aydınlık' },
    { id: 'dark', label: 'Koyu', icon: 'moon', desc: 'Göz yormayan gece modu' },
    { id: 'system', label: 'Sistem', icon: 'monitor', desc: Vox.native.platform === 'win32' ? 'Windows ayarınıza uyar' : 'Sistem ayarınıza uyar' },
  ];
  const Win = ({ tone }) => html`<span class=${cx('st-pv-win', `is-${tone}`)}>
    <span class="st-pv-tabs"><i></i><i class="is-on"></i><i></i></span>
    <span class="st-pv-bar"><i></i></span>
    <span class="st-pv-page"><b></b><i></i><i class="is-short"></i><span class="st-pv-acc"></span></span>
  </span>`;

  function ThemePicker() {
    const mode = Vox.useStore('settings.appearance.theme') || 'system';
    const ref = useRef();
    const pick = (id, e) => {
      if (id === mode) return;
      const r = e.currentTarget.getBoundingClientRect();
      const pt = e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      Vox.theme.set(id, pt);
    };
    const onKey = (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const i = THEMES.findIndex((t) => t.id === mode);
      const btn = ref.current.querySelector(`[data-theme-id="${THEMES[(i + d + THEMES.length) % THEMES.length].id}"]`);
      btn.focus();
      btn.click();
    };
    return html`<div class="st-themes" role="radiogroup" aria-label="Tema" ref=${ref} onKeyDown=${onKey}>
      ${THEMES.map((t) => html`<button type="button" role="radio" key=${t.id} data-theme-id=${t.id} aria-checked=${String(mode === t.id)}
        tabindex=${mode === t.id ? 0 : -1} class=${cx('st-theme', mode === t.id && 'is-on')} onClick=${(e) => pick(t.id, e)}>
        <span class=${cx('st-theme-pv', `is-${t.id}`)} aria-hidden="true">
          ${t.id === 'system' ? html`<${Win} tone="light"/><${Win} tone="dark"/>` : html`<${Win} tone=${t.id}/>`}
        </span>
        <span class="st-theme-label"><${Icon} name=${t.icon} size=${16}/><b>${t.label}</b></span>
        <small class="st-theme-desc">${t.desc}</small>
        <span class="st-theme-check" aria-hidden="true"><${Icon} name="check" size=${14} stroke=${3}/></span>
      </button>`)}
    </div>`;
  }

  function Density() {
    const v = Vox.useStore('settings.appearance.density');
    return html`<${Segmented} value=${v || 'comfortable'} label="Yoğunluk" onChange=${(nv) => Vox.settings.set('appearance.density', nv)}
      options=${[{ value: 'comfortable', label: 'Rahat', icon: 'rows-2' }, { value: 'compact', label: 'Sıkı', icon: 'rows-4' }]}/>`;
  }

  const ZOOMS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
  const zoomOpts = ZOOMS.map((z) => ({ value: z, label: `%${z}${z === 100 ? ' (önerilen)' : ''}` }));

  /* Varsayılan yazı tipi boyutu (ana süreç yeni sekmelerde Chromium'a verir; kendi boyutunu belirten siteler etkilenmez). */
  const fsName = (v) => (v <= 12 ? 'Çok küçük' : v <= 14 ? 'Küçük' : v <= 17 ? 'Orta' : v <= 20 ? 'Büyük' : 'Çok büyük');
  function FontSize() {
    const v = Vox.useStore('settings.appearance.fontSize') || 16;
    return html`<div class="st-font">
      <${Slider} value=${v} min=${10} max=${24} step=${1} label=${fsName(v)} format=${(x) => `${x} px`} onChange=${(x) => Vox.settings.set('appearance.fontSize', x)}/>
      <div class="st-font-pv" style=${`font-size:${v}px`} aria-hidden="true">
        <b>Kapadokya'da gün doğumu</b>
        <p>Sabahın ilk ışıklarıyla yüzlerce balon gökyüzüne yükselir.</p>
      </div>
    </div>`;
  }

  /** Live sketch of the toolbar: follows the toggles below and shows the first items of the real bookmarks bar. */
  function ToolbarPreview() {
    const a = Vox.useStore('settings.appearance') || {};
    const voxi = Vox.useStore((s) => ((s.settings || {}).voxi || {}).showInToolbar !== false && ((s.settings || {}).voxi || {}).enabled !== false);
    const bar = Vox.useStore((s) => ((s.bookmarks && s.bookmarks.children) || []).find((c) => c.id === 'bar'));
    const items = ((bar && bar.children) || []).slice(0, 4);
    return html`<div class="st-tbpv" aria-hidden="true">
      <div class="st-tbpv-bar">
        <${Icon} name="arrow-left" size=${15}/><${Icon} name="arrow-right" size=${15}/><${Icon} name="rotate-cw" size=${15}/>
        <span class=${cx('st-tbpv-opt', a.showHomeButton !== false && 'is-on')}><${Icon} name="house" size=${15}/></span>
        <span class="st-tbpv-addr"><${Icon} name="search" size=${12}/>Arayın ya da adres yazın</span>
        <span class=${cx('st-tbpv-opt st-tbpv-voxi', voxi && 'is-on')}><${Vox.c.Logo} size=${22} decorative=${true}/></span>
        <${Icon} name="ellipsis-vertical" size=${15}/>
      </div>
      <div class=${cx('st-tbpv-bm', a.showBookmarksBar !== false && 'is-on')}>
        ${items.length
          ? items.map((b) => html`<span key=${b.id}>${b.type === 'folder' ? html`<${Icon} name="folder" size=${12}/>` : html`<${Favicon} spec=${st.fav(b.url)} size=${12}/>`}${b.title || Vox.url.display(b.url || '')}</span>`)
          : html`<span class="st-tbpv-ph"><i></i><i></i><i></i></span><small>Yer imleri çubuğunuz boş</small>`}
      </div>
    </div>`;
  }

  const BGS = [
    { id: 'yaprak', label: 'Yaprak', desc: 'Yeşil ve ferah' },
    { id: 'gece', label: 'Gece', desc: 'Yıldızlı ve sakin' },
    { id: 'duz', label: 'Düz', desc: 'Sade, dikkat dağıtmaz' },
  ];
  const LEAVES = html`<svg class="st-bg-art" viewBox="0 0 120 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path d="M-8 60C10 36 36 32 50 46C32 64 8 70-8 60Z" fill="#04A761" opacity=".85"/><path d="M-8 60C12 52 30 48 50 46" stroke="#E2F1E6" stroke-width="1.2" fill="none" opacity=".7"/>
    <path d="M84-8C92 16 110 28 128 24C122 6 104-8 84-8Z" fill="#34C584" opacity=".75"/>
    <path d="M94 80C98 58 114 48 132 52C128 70 112 82 94 80Z" fill="#049C3E" opacity=".8"/><path d="M94 80C108 66 118 58 132 52" stroke="#E2F1E6" stroke-width="1.2" fill="none" opacity=".6"/>
  </svg>`;
  const NIGHT = html`<svg class="st-bg-art" viewBox="0 0 120 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <circle cx="96" cy="16" r="9" fill="#F5B83D"/><circle cx="100" cy="13" r="8" fill="#10283A"/>
    ${[[14, 12], [30, 26], [52, 10], [70, 22], [22, 44], [110, 40], [84, 52], [44, 58]].map(([x, y], i) => html`<circle cx=${x} cy=${y} r=${i % 3 ? 0.9 : 1.4} fill="#FFF1D1" class="st-star" style=${`--i:${i}`}/>`)}
  </svg>`;
  function NewTabBg() {
    const v = Vox.useStore('settings.appearance.newTabBackground') || 'yaprak';
    return html`<div class="st-bgs" role="radiogroup" aria-label="Yeni sekme arka planı">
      ${BGS.map((b) => html`<button type="button" role="radio" key=${b.id} aria-checked=${String(v === b.id)} class=${cx('st-bg', v === b.id && 'is-on')}
        onClick=${() => Vox.settings.set('appearance.newTabBackground', b.id)}>
        <span class=${cx('st-bg-pv', `is-${b.id}`)} aria-hidden="true">
          ${b.id === 'yaprak' ? LEAVES : b.id === 'gece' ? NIGHT : null}
          <span class="st-bg-search"></span><span class="st-bg-dots"><i></i><i></i><i></i><i></i></span>
        </span>
        <span class="st-bg-label"><b>${b.label}</b><small>${b.desc}</small></span>
        <span class="st-theme-check" aria-hidden="true"><${Icon} name="check" size=${14} stroke=${3}/></span>
      </button>`)}
    </div>`;
  }

  function AppearanceSection() {
    const voxiOn = Vox.useStore('settings.voxi.enabled') !== false;
    return html`
      <${Card} title="Tema" desc="VoxBrowser'ın renklerini seçin. Siteler de açık ya da koyu görünümlerini buna göre seçer." kw="açık koyu karanlık gece modu dark light sistem renk">
        <${Row} bare label="Tema" kw="açık koyu karanlık gece gündüz modu dark light sistem"><${ThemePicker}/><//>
        <${Row} label="Yoğunluk" desc="Sıkı modda sekmeler ve araç çubuğu incelir, ekranda daha çok yer kalır." icon="rows-3" kw="sıkı rahat kompakt boyut" wide>
          <${Density}/>
        <//>
      <//>
      <${Card} title="Sayfalar" desc="Sitelerin varsayılan görünümü." kw="yazı tipi font zoom">
        <${SelectRow} path="appearance.pageZoom" label="Sayfa yakınlaştırma" desc="Yeni açılan sekmeler bu oranla açılır. Açık bir sekmede Ctrl + ve Ctrl − ile değiştirebilirsiniz." icon="zoom-in"
          kw="zoom büyüt küçült ölçek yüzde" options=${zoomOpts} width=${190}/>
        <${Row} stack label="Yazı tipi boyutu" desc="Kendi boyutunu belirtmeyen sitelerde metinler bu boyutta görünür. Yeni açılan sekmelerde geçerli olur." icon="type"
          kw="font punto metin büyük küçük harf"><${FontSize}/><//>
        <${ToggleRow} path="appearance.smoothScroll" label="Yumuşak kaydırma" desc="Sayfalar kaydırılırken akıcı biçimde hareket eder. VoxBrowser yeniden açıldığında geçerli olur." icon="mouse" kw="scroll kaydır animasyon"/>
        <${RestartRow}/>
      <//>
      <${Card} title="Araç çubuğu" desc="Pencerenin üst kısmında neleri görmek istediğinizi seçin." kw="düğme toolbar">
        <${Row} bare label="Araç çubuğu önizlemesi" kw="ana sayfa düğmesi yer imleri çubuğu voxi"><${ToolbarPreview}/><//>
        <${ToggleRow} path="appearance.showHomeButton" label="Ana sayfa düğmesi" icon="house" kw="home"/>
        <${ToggleRow} path="appearance.showBookmarksBar" label="Yer imleri çubuğu" desc="Ctrl+Shift+B ile de açıp kapatabilirsiniz." icon="bookmark" kw="favoriler bookmarks"/>
        <${ToggleRow} path="voxi.showInToolbar" label="Voxi düğmesi" desc=${voxiOn ? 'Voxi’yi tek tıkla açın.' : 'Voxi kapalı; Voxi ve ses bölümünden açabilirsiniz.'} icon="bot" kw="asistan" disabled=${!voxiOn}/>
        <${ToggleRow} path="appearance.tabPreviews" label="Sekme önizlemeleri" desc="İmleci bir sekmenin üzerinde tuttuğunuzda küçük bir önizleme gösterir." icon="picture-in-picture-2" kw="hover kart"/>
      <//>
      <${Card} title="Yeni sekme" desc="Yeni sekme sayfasının arka planı." kw="new tab duvar kağıdı arka plan">
        <${Row} bare label="Yeni sekme arka planı" kw="yaprak gece düz duvar kağıdı tema"><${NewTabBg}/><//>
        <${Row} label="Yeni sekme sayfasını aç" desc="Seçtiğiniz arka planı görün." icon="square-plus" onClick=${() => Vox.tabs.open('vox://yeni-sekme')}/>
      <//>`;
  }

  st.register({ id: 'gorunum', order: 30, title: 'Görünüm', icon: 'palette', kw: 'tema renk yoğunluk',
    desc: 'Tema, yoğunluk, yakınlaştırma ve araç çubuğu.', component: AppearanceSection });
});
