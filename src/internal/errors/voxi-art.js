/* Voxi çizimleri — hata sayfaları (vox://hata) ve çökmüş sekme ekranı (arayüz) için ortak; renkler voxi.css'teki --vx-* belirteçlerinden.
   Vox.err.Voxi({ mood:'curious'|'happy'|'sad'|'worried'|'dizzy', prop:'magnifier'|'map'|'lock'|'plug'|'bandage'|'question'|'clock', size }) */
Vox.define('errors.voxiArt', (Vox) => {
  const { html } = Vox.p;
  const E = (Vox.err = Vox.err || {});

  /* Kafa = konuşma balonu (logodaki gibi): önce kalın dış çizgi, üstüne dolgu — birleşim yeri görünmez. */
  const HEAD = '<rect x="34" y="60" width="132" height="98" rx="42"/><path d="M84 150 L120 180 Q127 185 127 177 L127 150 Z"/>';

  const EYES = {
    curious: '<circle class="err-vx-eye" cx="76" cy="106" r="12"/><circle class="err-vx-eye" cx="124" cy="104" r="15"/>'
      + '<circle class="err-vx-glint" cx="80" cy="102" r="3.5"/><circle class="err-vx-glint" cx="129" cy="99" r="4.5"/>'
      + '<path class="err-vx-brow" d="M110 80 q15 -9 29 0"/>',
    happy: '<path class="err-vx-lid" d="M63 110 q13 -15 26 0"/><path class="err-vx-lid" d="M111 110 q13 -15 26 0"/>',
    sad: '<path class="err-vx-eye" d="M64 104 a12 12 0 0 0 24 0 z"/><path class="err-vx-eye" d="M112 104 a12 12 0 0 0 24 0 z"/>'
      + '<path class="err-vx-brow" d="M62 94 l24 -8"/><path class="err-vx-brow" d="M114 86 l24 8"/>'
      + '<path class="err-vx-tear" d="M138 114 q6 10 0 14 q-6 -4 0 -14 z"/>',
    worried: '<circle class="err-vx-eye" cx="76" cy="110" r="11"/><circle class="err-vx-eye" cx="124" cy="110" r="11"/>'
      + '<circle class="err-vx-glint" cx="79" cy="107" r="3"/><circle class="err-vx-glint" cx="127" cy="107" r="3"/>'
      + '<path class="err-vx-brow" d="M62 92 l24 -7"/><path class="err-vx-brow" d="M114 85 l24 7"/>'
      + '<path class="err-vx-sweat" d="M158 70 q7 11 0 15 q-7 -4 0 -15 z"/>',
    dizzy: '<path class="err-vx-lid" d="M67 97 l18 18 M85 97 l-18 18"/><path class="err-vx-lid" d="M115 97 l18 18 M133 97 l-18 18"/>',
  };
  const MOUTH = {
    curious: '<ellipse class="err-vx-mouth-o" cx="100" cy="136" rx="6" ry="7"/>',
    happy: '<path class="err-vx-mouth" d="M86 130 q14 12 28 0"/>',
    sad: '<path class="err-vx-mouth" d="M88 140 q12 -10 24 0"/>',
    worried: '<path class="err-vx-mouth" d="M86 137 q4.7 -5 9.3 0 t9.3 0 t9.3 0"/>',
    dizzy: '<path class="err-vx-mouth" d="M88 136 h24"/>',
  };

  const PROPS = {
    magnifier: '<g class="err-vx-prop err-vx-sweep"><line class="err-vx-handle" x1="164" y1="146" x2="184" y2="170"/>'
      + '<circle class="err-vx-glass" cx="150" cy="130" r="21"/><path class="err-vx-shine" d="M138 124 a14 14 0 0 1 9 -9"/></g>'
      + '<text class="err-vx-q err-vx-float1" x="22" y="58">?</text><text class="err-vx-q err-vx-q2 err-vx-float2" x="168" y="44">?</text>',
    question: '<text class="err-vx-q err-vx-float1" x="18" y="62">?</text><text class="err-vx-q err-vx-q2 err-vx-float2" x="166" y="50">?</text>'
      + '<text class="err-vx-q err-vx-q3 err-vx-float1" x="176" y="112">!</text>',
    map: '<g class="err-vx-prop err-vx-map-g"><path class="err-vx-map" d="M6 140 l22 -8 l22 8 l22 -8 v42 l-22 8 l-22 -8 l-22 8 z"/>'
      + '<path class="err-vx-map-fold" d="M28 132 v42 M50 140 v42"/><path class="err-vx-route" d="M12 168 q10 -18 22 -8 t26 -14"/>'
      + '<path class="err-vx-x" d="M58 142 l6 6 M64 142 l-6 6"/></g>',
    lock: '<g class="err-vx-wiggle"><g class="err-vx-prop" transform="translate(136 118)"><path class="err-vx-shackle" d="M10 20 v-9 a13 13 0 0 1 26 0 v9"/>'
      + '<rect class="err-vx-lockbody" x="0" y="18" width="46" height="38" rx="10"/><circle class="err-vx-keyhole" cx="23" cy="34" r="5"/>'
      + '<rect class="err-vx-keyhole" x="21" y="35" width="4" height="11" rx="2"/></g></g>',
    plug: '<path class="err-vx-cable" d="M58 154 c-14 24 6 30 30 30 h14"/>'
      + '<g class="err-vx-prop"><rect class="err-vx-plug" x="100" y="174" width="18" height="18" rx="4"/><path class="err-vx-prong" d="M118 178 h7 M118 188 h7"/></g>'
      + '<rect class="err-vx-socket" x="150" y="168" width="26" height="28" rx="6"/><path class="err-vx-hole" d="M158 177 v4 M168 177 v4"/>'
      + '<path class="err-vx-spark" d="M132 172 l4 6 l-5 2 l5 7 M140 168 l3 4"/>',
    bandage: '<g class="err-vx-prop" transform="rotate(-28 70 74)"><rect class="err-vx-band" x="48" y="66" width="46" height="16" rx="8"/>'
      + '<rect class="err-vx-bandpad" x="63" y="66" width="16" height="16"/><circle class="err-vx-banddot" cx="55" cy="74" r="1.6"/><circle class="err-vx-banddot" cx="87" cy="74" r="1.6"/></g>'
      + '<g class="err-vx-smoke"><circle cx="128" cy="26" r="7"/><circle cx="140" cy="16" r="9"/><circle cx="154" cy="10" r="6"/></g>',
    clock: '<g class="err-vx-prop err-vx-clock-g"><circle class="err-vx-clock" cx="166" cy="56" r="22"/>'
      + '<path class="err-vx-clock-tick" d="M166 38v4M166 70v4M148 56h4M180 56h4"/>'
      + '<line class="err-vx-hand err-vx-hand--h" x1="166" y1="56" x2="175" y2="56"/><line class="err-vx-hand err-vx-hand--m" x1="166" y1="56" x2="166" y2="42"/>'
      + '<circle class="err-vx-clock-pin" cx="166" cy="56" r="2.6"/></g>'
      + '<text class="err-vx-z err-vx-float1" x="14" y="70">z</text><text class="err-vx-z err-vx-z2 err-vx-float2" x="28" y="48">z</text>',
  };

  /** Full SVG markup string (also used by the crash screen in the browser UI). */
  E.voxiSvg = ({ mood = 'curious', prop = '' } = {}) => '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'
    + '<ellipse class="err-vx-shadow" cx="100" cy="190" rx="50" ry="6"/>'
    + '<g class="err-vx-bob">'
    + '<line class="err-vx-stem" x1="100" y1="62" x2="100" y2="38"/><circle class="err-vx-bulb" cx="100" cy="31" r="9"/>'
    + `<g class="err-vx-line">${HEAD}</g><g class="err-vx-fill">${HEAD}</g>`
    + '<ellipse class="err-vx-cheek" cx="56" cy="126" rx="9" ry="5.5"/><ellipse class="err-vx-cheek" cx="144" cy="126" rx="9" ry="5.5"/>'
    + `<g class="err-vx-eyes">${EYES[mood] || EYES.curious}</g>${MOUTH[mood] || MOUTH.curious}`
    + '</g>'
    + (PROPS[prop] || '')
    + '</svg>';

  E.Voxi = ({ mood, prop, size = 168, class: cls }) => html`<div class=${Vox.util.cx('err-vx', `err-vx--${mood || 'curious'}`, cls)}
    style=${`width:${size}px;height:${size}px`} aria-hidden="true" dangerouslySetInnerHTML=${{ __html: E.voxiSvg({ mood, prop }) }}></div>`;
});
