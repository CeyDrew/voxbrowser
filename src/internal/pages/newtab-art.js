/* VoxBrowser — yeni sekme çizimleri: yaprak arka planı, gece gökyüzü, gizli pencere kalkanı.
   Renkler CSS'ten gelir (pages.css › .pg-art-*), böylece açık/koyu temada kendiliğinden uyum sağlar. */
Vox.define('pages.newtabArt', (Vox) => {
  const { html } = Vox.p;
  const pg = Vox.pg;

  /* Tek yaprak: sapı (0,0) noktasında, sağa doğru uzanır. */
  const leaf = (x, y, rot, s, tone = 'a', key) => html`<g key=${key} transform=${`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <path class=${`pg-art-leaf pg-art-leaf--${tone}`} d="M0 0C46-50 150-52 210 0C150 52 46 50 0 0Z"/>
    <path class="pg-art-vein" d="M6 0H196M60 0L92-22M60 0L92 22M112 0L140-20M112 0L140 20"/>
  </g>`;

  /** "yaprak": two soft branches in opposite corners, gently swaying. */
  function LeafBackdrop() {
    return html`<div class="pg-art pg-art--yaprak" aria-hidden="true">
      <svg class="pg-art-branch pg-art-branch--tl" viewBox="0 0 520 420" preserveAspectRatio="xMinYMin meet">
        <path class="pg-art-stem" d="M-20 40C120 70 220 150 300 290"/>
        ${leaf(40, 50, 18, 1.05, 'a', 1)}${leaf(120, 92, -28, 0.85, 'b', 2)}${leaf(170, 140, 52, 0.95, 'a', 3)}
        ${leaf(236, 214, -8, 0.7, 'b', 4)}${leaf(262, 252, 78, 0.6, 'c', 5)}${leaf(-10, 120, 64, 0.8, 'b', 6)}
      </svg>
      <svg class="pg-art-branch pg-art-branch--br" viewBox="0 0 520 420" preserveAspectRatio="xMaxYMax meet">
        <path class="pg-art-stem" d="M540 380C400 350 300 280 230 150"/>
        ${leaf(480, 372, 198, 1.05, 'a', 1)}${leaf(400, 330, 152, 0.9, 'b', 2)}${leaf(340, 280, 232, 0.95, 'a', 3)}
        ${leaf(282, 210, 170, 0.72, 'c', 4)}${leaf(250, 168, 250, 0.62, 'b', 5)}
      </svg>
      <span class="pg-art-seed" style="left:18%;top:62%"></span><span class="pg-art-seed" style="left:78%;top:22%"></span>
      <span class="pg-art-seed" style="left:62%;top:74%"></span><span class="pg-art-seed" style="left:30%;top:18%"></span>
    </div>`;
  }

  /* Gece: yıldızlar sabit tohumdan üretilir (her açılışta aynı gökyüzü). */
  const STARS = (() => {
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    return Array.from({ length: 46 }, (_, i) => ({ x: rnd() * 100, y: rnd() * 62, r: 0.6 + rnd() * 1.5, d: (rnd() * 4).toFixed(2), k: i }));
  })();
  function NightBackdrop() {
    return html`<div class="pg-art pg-art--gece" aria-hidden="true">
      ${STARS.map((st) => html`<span key=${st.k} class="pg-art-star"
        style=${`left:${st.x.toFixed(2)}%;top:${st.y.toFixed(2)}%;width:${(st.r * 2).toFixed(1)}px;height:${(st.r * 2).toFixed(1)}px;animation-delay:-${st.d}s`}></span>`)}
      <svg class="pg-art-moon" viewBox="0 0 120 120"><circle class="pg-art-moon-glow" cx="60" cy="60" r="56"/><path class="pg-art-moon-body" d="M74 26a36 36 0 1 0 22 58A30 30 0 1 1 74 26Z"/></svg>
      <svg class="pg-art-hills" viewBox="0 0 1200 220" preserveAspectRatio="none">
        <path class="pg-art-hill pg-art-hill--far" d="M0 130C160 80 300 70 460 110S760 170 900 120 1120 60 1200 90V220H0Z"/>
        <path class="pg-art-hill pg-art-hill--near" d="M0 180C200 140 380 150 560 175S900 210 1060 170 1180 150 1200 156V220H0Z"/>
      </svg>
    </div>`;
  }

  /** Background layer for the new tab: 'yaprak' | 'gece' | 'duz'. */
  pg.NewTabBackdrop = ({ kind }) => (kind === 'gece' ? html`<${NightBackdrop}/>` : kind === 'yaprak' ? html`<${LeafBackdrop}/>` : null);

  /** Private window: a calm shield with a venetian mask. */
  pg.PrivateArt = () => html`<svg class="pg-art-private" viewBox="0 0 220 180" aria-hidden="true">
    <circle class="pg-art-pv-halo" cx="110" cy="92" r="82"/>
    <path class="pg-art-pv-shield" d="M110 24l58 22v40c0 38-25 66-58 78-33-12-58-40-58-78V46z"/>
    <path class="pg-art-pv-shine" d="M110 38l44 17v31c0 29-19 51-44 61z"/>
    <g class="pg-art-pv-mask">
      <path d="M62 84c14-10 30-12 48-4 18-8 34-6 48 4 2 18-6 34-22 36-11 1-19-6-26-14-7 8-15 15-26 14-16-2-24-18-22-36z"/>
      <ellipse class="pg-art-pv-eye" cx="86" cy="96" rx="11" ry="7"/><ellipse class="pg-art-pv-eye" cx="134" cy="96" rx="11" ry="7"/>
    </g>
    <path class="pg-art-pv-spark" d="M178 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3zM38 128l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>
  </svg>`;
});
