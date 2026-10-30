/* VoxBrowser Demo — ortak bileşen kiti (Dost). Her ekran bunları kullanır; görünüm base.css'te.
   Button, IconButton, Toggle, Checkbox, RadioGroup, Segmented, Select, Slider, TextField, SearchField,
   Tabs, Badge, Kbd, Spinner, ProgressBar, ProgressRing, Avatar, Favicon, EmptyState, Section, ListRow, Skeleton, MenuButton. */
(function () {
  'use strict';
  const Vox = window.Vox;
  if (!Vox || !Vox.p) return;
  const { html, useRef, useState, useLayoutEffect, useEffect } = Vox.p;
  const { cx, uid } = Vox.util;
  const C = Vox.c;
  const Icon = (p) => C.Icon(p);

  function Button({ variant = 'secondary', size = 'md', icon, iconRight, loading, children, class: cls, type = 'button', ...rest }) {
    return html`<button type=${type} class=${cx('btn', `btn--${variant}`, `btn--${size}`, loading && 'is-loading', cls)} ...${rest}>
      ${loading ? html`<${Spinner} size=${16}/>` : icon ? html`<${Icon} name=${icon} size=${size === 'sm' ? 16 : 18}/>` : null}
      ${children != null ? html`<span class="btn-label">${children}</span>` : null}
      ${iconRight ? html`<${Icon} name=${iconRight} size=${16}/>` : null}
    </button>`;
  }

  /** Icon-only button. `label` becomes aria-label + tooltip; `cmd` adds the shortcut to the tooltip. */
  function IconButton({ icon, label, cmd, kbd, size = 'md', variant = 'ghost', active, badge, tipPos, class: cls, iconSize, children, ...rest }) {
    return html`<button type="button" class=${cx('ibtn', `ibtn--${size}`, `ibtn--${variant}`, active && 'is-active', cls)}
      aria-label=${label} data-tip=${label} data-tip-pos=${tipPos} data-cmd=${cmd} data-kbd=${kbd} aria-pressed=${active === undefined ? undefined : String(!!active)} ...${rest}>
      <${Icon} name=${icon} size=${iconSize || (size === 'sm' ? 16 : size === 'lg' ? 22 : 20)}/>
      ${badge != null && badge !== false ? html`<span class="ibtn-badge">${badge === true ? '' : badge}</span>` : null}
      ${children}
    </button>`;
  }

  /** Switch. With `label` it renders a full settings row; alone, pass `ariaLabel`. */
  function Toggle({ checked, onChange, label, desc, id, disabled, size = 'md', ariaLabel, class: cls }) {
    const tid = useRef(id || uid('tg')).current;
    const sw = html`<button type="button" role="switch" id=${tid} aria-checked=${String(!!checked)} disabled=${disabled}
      class=${cx('switch', `switch--${size}`, checked && 'is-on')} onClick=${() => onChange && onChange(!checked)}
      aria-label=${label ? undefined : ariaLabel}><span class="switch-knob"></span></button>`;
    if (!label) return sw;
    return html`<div class=${cx('field-row', disabled && 'is-disabled', cls)}>
      <label class="field-row-text" for=${tid}><span class="field-row-label">${label}</span>${desc ? html`<span class="field-row-desc">${desc}</span>` : null}</label>
      ${sw}
    </div>`;
  }

  function Checkbox({ checked, indeterminate, onChange, label, desc, id, disabled, class: cls }) {
    const cid = useRef(id || uid('cb')).current;
    return html`<label class=${cx('check', disabled && 'is-disabled', cls)} for=${cid}>
      <input type="checkbox" id=${cid} checked=${!!checked} disabled=${disabled} ref=${(el) => { if (el) el.indeterminate = !!indeterminate; }}
        onChange=${(e) => onChange && onChange(e.currentTarget.checked)}/>
      <span class="check-box" aria-hidden="true"><${Icon} name=${indeterminate ? 'minus' : 'check'} size=${14} stroke=${3}/></span>
      ${label ? html`<span class="check-text"><span>${label}</span>${desc ? html`<small>${desc}</small>` : null}</span>` : null}
    </label>`;
  }

  function RadioGroup({ value, options, onChange, name, label, class: cls }) {
    const gid = useRef(name || uid('rg')).current;
    return html`<div class=${cx('radio-group', cls)} role="radiogroup" aria-label=${label}>
      ${options.map((o) => html`<label class=${cx('radio', value === o.value && 'is-on', o.disabled && 'is-disabled')} key=${o.value}>
        <input type="radio" name=${gid} value=${o.value} checked=${value === o.value} disabled=${o.disabled} onChange=${() => onChange && onChange(o.value)}/>
        <span class="radio-dot" aria-hidden="true"></span>
        <span class="radio-text">${o.icon ? html`<${Icon} name=${o.icon} size=${18}/>` : null}<span><b>${o.label}</b>${o.desc ? html`<small>${o.desc}</small>` : null}</span></span>
      </label>`)}
    </div>`;
  }

  /** Measures the selected child (for sliding thumbs/indicators) and re-measures when the container resizes. */
  function useIndicator(ref, selector, deps) {
    const [ind, setInd] = useState(null);
    useLayoutEffect(() => {
      const measure = () => {
        const el = ref.current && ref.current.querySelector(selector);
        if (el) setInd((p) => (p && p.left === el.offsetLeft && p.width === el.offsetWidth ? p : { left: el.offsetLeft, width: el.offsetWidth }));
      };
      measure();
      if (!window.ResizeObserver || !ref.current) return undefined;
      const ro = new ResizeObserver(measure);
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, deps);
    return ind;
  }

  /** Pill segmented control with a sliding thumb. */
  function Segmented({ value, options, onChange, label, size = 'md', class: cls }) {
    const ref = useRef();
    const thumb = useIndicator(ref, '[aria-checked="true"]', [value, options.length]);
    return html`<div ref=${ref} class=${cx('seg', `seg--${size}`, cls)} role="radiogroup" aria-label=${label}>
      ${thumb ? html`<span class="seg-thumb" style=${`transform:translateX(${thumb.left}px);width:${thumb.width}px`}></span>` : null}
      ${options.map((o) => html`<button type="button" role="radio" key=${o.value} aria-checked=${String(value === o.value)} class="seg-opt"
        onClick=${(e) => onChange && onChange(o.value, e)}>${o.icon ? html`<${Icon} name=${o.icon} size=${16}/>` : null}${o.label ? html`<span>${o.label}</span>` : null}</button>`)}
    </div>`;
  }

  /** Dropdown select built on the menu layer (keyboard friendly). */
  function Select({ value, options, onChange, label, id, width, class: cls, disabled }) {
    const sid = useRef(id || uid('sl')).current;
    const cur = options.find((o) => o.value === value) || options[0] || { label: '' };
    const open = (e) => Vox.ui.menu({
      anchor: e.currentTarget, placement: 'bottom-start', keyboard: e.detail === 0, minWidth: e.currentTarget.offsetWidth,
      items: options.map((o) => ({ label: o.label, hint: o.desc, icon: o.icon, checked: o.value === value, onSelect: () => onChange && onChange(o.value) })),
    });
    return html`<button type="button" id=${sid} class=${cx('select', cls)} style=${width ? `width:${width}px` : ''} aria-haspopup="listbox" aria-label=${label} disabled=${disabled} onClick=${open}>
      ${cur.icon ? html`<${Icon} name=${cur.icon} size=${18}/>` : null}<span class="select-val">${cur.label}</span><${Icon} name="chevron-down" size=${16}/>
    </button>`;
  }

  function Slider({ value, min = 0, max = 100, step = 1, onChange, label, format, id, marks }) {
    const sid = useRef(id || uid('sd')).current;
    const pct = ((value - min) / (max - min)) * 100;
    return html`<div class="slider">
      ${label ? html`<label for=${sid} class="slider-label"><span>${label}</span><output>${format ? format(value) : value}</output></label>` : null}
      <input id=${sid} type="range" min=${min} max=${max} step=${step} value=${value} style=${`--pct:${pct}%`} onInput=${(e) => onChange && onChange(Number(e.currentTarget.value))}/>
      ${marks ? html`<div class="slider-marks" aria-hidden="true">${marks.map((m) => html`<span>${m}</span>`)}</div>` : null}
    </div>`;
  }

  function TextField({ label, hint, error, icon, id, class: cls, multiline, trailing, ...rest }) {
    const fid = useRef(id || uid('tf')).current;
    const input = multiline
      ? html`<textarea id=${fid} class="tf-input" ...${rest}></textarea>`
      : html`<input id=${fid} class="tf-input" ...${rest}/>`;
    return html`<div class=${cx('tf', error && 'is-error', cls)}>
      ${label ? html`<label class="tf-label" for=${fid}>${label}</label>` : null}
      <div class="tf-box">${icon ? html`<${Icon} name=${icon} size=${18}/>` : null}${input}${trailing}</div>
      ${error ? html`<p class="tf-hint is-error">${error}</p>` : hint ? html`<p class="tf-hint">${hint}</p>` : null}
    </div>`;
  }

  function SearchField({ value, onInput, placeholder = 'Ara', label, id, class: cls, autoFocus }) {
    const fid = useRef(id || uid('sf')).current;
    return html`<div class=${cx('search', cls)}>
      <label for=${fid} class="sr-only">${label || placeholder}</label>
      <${Icon} name="search" size=${18}/>
      <input id=${fid} type="search" value=${value} placeholder=${placeholder} autofocus=${autoFocus} onInput=${(e) => onInput && onInput(e.currentTarget.value)}/>
      ${value ? html`<button type="button" class="search-clear" aria-label="Aramayı temizle" onClick=${() => onInput && onInput('')}><${Icon} name="x" size=${16}/></button>` : null}
    </div>`;
  }

  /** Tabs with an animated indicator. items: [{value, label, icon, badge}] */
  function Tabs({ value, items, onChange, label, variant = 'line', class: cls }) {
    const ref = useRef();
    const ind = useIndicator(ref, '[aria-selected="true"]', [value, items.length]);
    const onKeyDown = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = items.findIndex((t) => t.value === value);
      const n = items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
      onChange(n.value);
      setTimeout(() => ref.current && ref.current.querySelector('[aria-selected="true"]')?.focus(), 0);
    };
    return html`<div ref=${ref} class=${cx('tabs', `tabs--${variant}`, cls)} role="tablist" aria-label=${label} onKeyDown=${onKeyDown}>
      ${items.map((t) => html`<button type="button" role="tab" key=${t.value} aria-selected=${String(t.value === value)} tabindex=${t.value === value ? 0 : -1}
        class="tabs-tab" onClick=${() => onChange(t.value)}>${t.icon ? html`<${Icon} name=${t.icon} size=${16}/>` : null}<span>${t.label}</span>${t.badge != null ? html`<span class="tabs-badge">${t.badge}</span>` : null}</button>`)}
      ${ind ? html`<span class="tabs-ind" style=${`transform:translateX(${ind.left}px);width:${ind.width}px`}></span>` : null}
    </div>`;
  }

  const Badge = ({ tone = 'neutral', children, icon, class: cls }) =>
    html`<span class=${cx('badge', `badge--${tone}`, cls)}>${icon ? html`<${Icon} name=${icon} size=${14}/>` : null}${children}</span>`;
  const Kbd = ({ keys }) => html`<span class="kbd">${String(keys).split('+').map((k, i) => html`${i ? '+' : ''}<kbd>${k}</kbd>`)}</span>`;
  const Spinner = ({ size = 18, class: cls }) =>
    html`<span class=${cx('spinner', cls)} style=${`width:${size}px;height:${size}px`} role="progressbar" aria-label="Yükleniyor"></span>`;
  const ProgressBar = ({ value, indeterminate, tone, label }) =>
    html`<div class=${cx('pbar', indeterminate && 'is-indeterminate', tone && `tone-${tone}`)} role="progressbar" aria-label=${label}
      aria-valuenow=${indeterminate ? undefined : Math.round((value || 0) * 100)} aria-valuemin="0" aria-valuemax="100"><span style=${`width:${Math.round((value || 0) * 100)}%`}></span></div>`;
  function ProgressRing({ value = 0, size = 28, stroke = 3, label, children, tone }) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return html`<span class=${cx('pring', tone && `tone-${tone}`)} style=${`width:${size}px;height:${size}px`} role="progressbar" aria-label=${label} aria-valuenow=${Math.round(value * 100)}>
      <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx=${size / 2} cy=${size / 2} r=${r} stroke-width=${stroke} class="pring-track"/>
        <circle cx=${size / 2} cy=${size / 2} r=${r} stroke-width=${stroke} class="pring-val" stroke-dasharray=${c} stroke-dashoffset=${c * (1 - Math.max(0, Math.min(1, value)))}/>
      </svg>${children ? html`<span class="pring-in">${children}</span>` : null}</span>`;
  }
  function Avatar({ name = '?', color, size = 32, class: cls }) {
    const initials = String(name).split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toLocaleUpperCase('tr-TR');
    return html`<span class=${cx('avatar', cls)} style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${color || Vox.util.hashColor(name)}`} aria-hidden="true">${initials}</span>`;
  }

  /** Favicon from a spec: {logo:true} | {icon:'settings'} | {letter:'L', bg, fg} | {svg:'<svg…>'}; or from a URL via the route table. */
  function Favicon({ spec, url, size = 16, class: cls }) {
    let s = spec;
    if (!s && url && Vox.routes) { try { s = Vox.routes.resolve(url).favicon; } catch (e) { s = null; } }
    if (typeof s === 'string') s = { url: s };
    s = s || { icon: 'globe' };
    const st = `width:${size}px;height:${size}px`;
    if (s.url) {
      return html`<span class=${cx('favicon favicon--img', cls)} style=${st} aria-hidden="true"><img src=${s.url} width=${size} height=${size} alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async"
        onError=${(e) => { e.currentTarget.style.display = 'none'; const p = e.currentTarget.parentNode; if (p) p.classList.add('is-broken'); }}/></span>`;
    }
    if (s.logo) return html`<${C.Logo} size=${size} decorative=${true} class=${cx('favicon', cls)}/>`;
    if (s.svg) return html`<span class=${cx('favicon', cls)} style=${st} aria-hidden="true" dangerouslySetInnerHTML=${{ __html: s.svg }}></span>`;
    if (s.letter) {
      return html`<span class=${cx('favicon favicon--letter', cls)} aria-hidden="true"
        style=${`${st};background:${s.bg || '#04A761'};color:${s.fg || '#fff'};font-size:${Math.round(size * 0.62)}px;border-radius:${s.round === false ? Math.round(size * 0.28) + 'px' : '50%'}`}>${s.letter}</span>`;
    }
    return html`<span class=${cx('favicon favicon--icon', cls)} style=${st} aria-hidden="true"><${Icon} name=${s.icon} size=${size} stroke=${2.25}/></span>`;
  }

  const EmptyState = ({ icon = 'sparkles', title, text, action, children, class: cls }) =>
    html`<div class=${cx('empty', cls)}>
      <div class="empty-art" aria-hidden="true"><${Icon} name=${icon} size=${30}/></div>
      <h3 class="empty-title">${title}</h3>${text ? html`<p class="empty-text">${text}</p>` : null}${action || null}${children}
    </div>`;
  const Section = ({ title, desc, children, id, actions, class: cls }) =>
    html`<section class=${cx('section', cls)} id=${id} aria-labelledby=${id ? id + '-h' : undefined}>
      ${title ? html`<div class="section-head"><div><h2 class="section-title" id=${id ? id + '-h' : undefined}>${title}</h2>${desc ? html`<p class="section-desc">${desc}</p>` : null}</div>${actions || null}</div>` : null}
      <div class="section-body">${children}</div>
    </section>`;
  function ListRow({ icon, leading, title, desc, trailing, onClick, href, active, class: cls, ...rest }) {
    const inner = html`${leading || (icon ? html`<span class="row-ic"><${Icon} name=${icon} size=${20}/></span>` : null)}
      <span class="row-text"><span class="row-title">${title}</span>${desc ? html`<span class="row-desc">${desc}</span>` : null}</span>
      ${trailing !== undefined ? html`<span class="row-trail">${trailing}</span>` : onClick || href ? html`<${Icon} name="chevron-right" size=${18} class="row-chev"/>` : null}`;
    if (href) return html`<a class=${cx('row', 'is-link', active && 'is-active', cls)} href=${href} ...${rest}>${inner}</a>`;
    if (onClick) return html`<button type="button" class=${cx('row', 'is-link', active && 'is-active', cls)} onClick=${onClick} ...${rest}>${inner}</button>`;
    return html`<div class=${cx('row', cls)} ...${rest}>${inner}</div>`;
  }
  const Skeleton = ({ w = '100%', h = 14, r = 8, class: cls }) =>
    html`<span class=${cx('skel', cls)} style=${`width:${typeof w === 'number' ? w + 'px' : w};height:${h}px;border-radius:${r}px`} aria-hidden="true"></span>`;

  /** IconButton that opens a menu built lazily by items(). */
  const MenuButton = ({ items, placement = 'bottom-end', minWidth, ...rest }) =>
    html`<${IconButton} aria-haspopup="menu" ...${rest} onClick=${(e) => Vox.ui.menu({ anchor: e.currentTarget, placement, minWidth, keyboard: e.detail === 0, items: typeof items === 'function' ? items() : items })}/>`;

  /** Runs fn on every animation frame while `active` (for live meters, timelines). */
  function useTicker(active, fn) {
    const ref = useRef(fn);
    ref.current = fn;
    useEffect(() => {
      if (!active) return undefined;
      let raf = 0;
      const loop = (t) => { ref.current(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, [active]);
  }

  Object.assign(C, {
    Button, IconButton, Toggle, Checkbox, RadioGroup, Segmented, Select, Slider, TextField, SearchField, Tabs,
    Badge, Kbd, Spinner, ProgressBar, ProgressRing, Avatar, Favicon, EmptyState, Section, ListRow, Skeleton, MenuButton,
  });
  Vox.useTicker = useTicker;
})();
