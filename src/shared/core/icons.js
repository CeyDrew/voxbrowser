/* VoxBrowser Demo — ikonlar (Lucide 0.469.0, ISC) ve logo.
   <${Icon} name="arrow-left" size=${20}/> — any Lucide name in kebab-case (lucide.dev/icons). Dost stroke: 2.25. */
(function () {
  'use strict';
  const Vox = window.Vox;
  if (!Vox || !Vox.p) return;
  const { h } = Vox.p;
  const lib = window.lucide && window.lucide.icons ? window.lucide.icons : {};
  const cache = new Map();
  const warned = new Set();

  const pascal = (name) => String(name).split('-').map((s) => (s ? s[0].toUpperCase() + s.slice(1) : '')).join('');

  function nodeFor(name) {
    if (cache.has(name)) return cache.get(name);
    const n = lib[name] || lib[pascal(name)];
    if (!n && !warned.has(name)) { warned.add(name); console.warn(`[Vox] ikon bulunamadı: ${name}`); }
    const node = n || lib.Circle || ['svg', {}, []];
    cache.set(name, node);
    return node;
  }

  /** Icon component. Decorative by default; pass label to make it an image. */
  function Icon({ name, size = 20, stroke = 2.25, label, class: cls, className, style }) {
    const [, , children] = nodeFor(name);
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': stroke,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: Vox.util.cx('ic', cls, className),
      style,
      role: label ? 'img' : undefined,
      'aria-label': label || undefined,
      'aria-hidden': label ? undefined : 'true',
      focusable: 'false',
    }, (children || []).map(([tag, attrs], i) => h(tag, { key: i, ...attrs })));
  }

  /** Same icon as an SVG string (for non-Preact DOM such as fly animations). */
  function iconSvg(name, size = 20, stroke = 2.25) {
    const [, , children] = nodeFor(name);
    const inner = (children || []).map(([tag, attrs]) =>
      `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ')}/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }

  /* Varsayılan işaret: kullanıcının mevcut robot logosunun sadeleştirilmiş hâli (logo adayları gelene kadar). */
  const FALLBACK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="{{uid}}-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#049F61"/><stop offset="1" stop-color="#04AF61"/></linearGradient></defs><rect width="256" height="256" rx="72" fill="url(#{{uid}}-g)"/><circle cx="128" cy="40" r="16" fill="#fff"/><rect x="120" y="44" width="16" height="30" fill="#fff"/><rect x="48" y="70" width="160" height="134" rx="56" fill="#fff"/><path d="M98 196L156 230C160 232 164 229 164 224L164 196Z" fill="#fff"/><circle cx="100" cy="134" r="20" fill="#049C3E"/><circle cx="156" cy="134" r="20" fill="#049C3E"/></svg>';

  const logos = () => (Array.isArray(window.VOX_LOGOS) && window.VOX_LOGOS.length ? window.VOX_LOGOS : []);
  function logoMarkup(id, size) {
    const list = logos();
    const L = list.find((l) => l.id === id) || list[0];
    if (!L) return FALLBACK;
    return size <= 24 && L.small ? L.small : L.svg;
  }

  /** Logo: the currently selected candidate (ui.logo) unless `id` is given. */
  function Logo({ size = 32, id, label = 'VoxBrowser', decorative = false, class: cls }) {
    const selected = Vox.useStore('ui.logo');
    const uid = Vox.p.useMemo(() => Vox.util.uid('lg'), []);
    const markup = logoMarkup(id || selected, size).split('{{uid}}').join(uid);
    return h('span', {
      class: Vox.util.cx('vox-logo', cls),
      style: `width:${size}px;height:${size}px`,
      role: decorative ? undefined : 'img',
      'aria-label': decorative ? undefined : label,
      'aria-hidden': decorative ? 'true' : undefined,
      dangerouslySetInnerHTML: { __html: markup },
    });
  }

  Vox.c.Icon = Icon;
  Vox.c.Logo = Logo;
  Vox.iconSvg = iconSvg;
  Vox.logos = { list: logos, markup: logoMarkup, fallback: FALLBACK };
})();
