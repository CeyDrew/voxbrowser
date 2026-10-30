/* VoxBrowser Demo — katmanlar: menüler, açılır paneller, diyaloglar, bildirimler (toast), ipuçları.
   Vox.ui.menu / popover / contextMenu / dialog / confirm / toast; <OverlayHost/> renders them all. */
(function () {
  'use strict';
  const Vox = window.Vox;
  if (!Vox || !Vox.p) return;
  const { html, useRef, useLayoutEffect, useEffect, useState } = Vox.p;
  const { cx, uid } = Vox.util;
  const ui = (Vox.ui = Vox.ui || {});

  /* ── Katman deposu ────────────────────────────────────── */
  let layers = [];
  const subs = new Set();
  const emit = () => subs.forEach((f) => f(layers));
  const overlay = (Vox.overlay = {
    list: () => layers,
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    open(layer) {
      const id = layer.id || uid('ly');
      const family = layer.parent ? (layers.find((l) => l.id === layer.parent) || {}).family || layer.parent : id;
      layers = [...layers, { ...layer, id, family, opener: document.activeElement }];
      emit();
      return id;
    },
    update(id, patch) { layers = layers.map((l) => (l.id === id ? { ...l, ...patch } : l)); emit(); },
    close(id, value) {
      const l = layers.find((x) => x.id === id);
      if (!l || l.closing) return;
      // önce alt katmanlar (alt menüler)
      layers.filter((x) => x.parent === id).forEach((c) => overlay.close(c.id));
      layers = layers.map((x) => (x.id === id ? { ...x, closing: true } : x));
      emit();
      if (l.onClose) { try { l.onClose(value); } catch (e) { Vox.reportError('overlay-onClose', e); } }
      if (l.resolve) l.resolve(value);
      const restore = !l.parent && l.kind !== 'toast' && l.kind !== 'tooltip' && l.opener && document.contains(l.opener);
      setTimeout(() => {
        layers = layers.filter((x) => x.id !== id);
        emit();
        // Katman DOM'dan bir sonraki karede kalkar; odak onunla kaybolduysa açan öğeye geri ver.
        if (restore) requestAnimationFrame(() => {
          const ae = document.activeElement;
          if ((!ae || ae === document.body || !ae.isConnected) && document.contains(l.opener)) {
            try { l.opener.focus({ preventScroll: true }); } catch (e) { /* yok say */ }
          }
        });
      }, Vox.motion.reduced() ? 0 : 150);
    },
    closeKind(kind) { layers.filter((l) => l.kind === kind && !l.closing).forEach((l) => overlay.close(l.id)); },
    top(kinds) { return [...layers].reverse().find((l) => !l.closing && (!kinds || kinds.includes(l.kind))); },
  });

  /* Tarayıcı arayüzünde: katman açıkken arayüz görünümü web sayfasının üstüne alınır (ana süreç z-sırası).
     Katman olmayan ama sayfa alanına taşan öğeler (öneri listesi, sekme önizleme kartı) Vox.ui.raise(anahtar, true) ile tutar. */
  const holds = new Set();
  let raised = false;
  const syncRaise = () => {
    if (!Vox.native || Vox.native.kind !== 'ui') return;
    const need = holds.size > 0 || layers.some((l) => l.kind !== 'toast');
    if (need !== raised) {
      raised = need;
      Vox.native.invoke('ui:raise', { on: need }).catch(() => {});
    }
  };
  overlay.subscribe(syncRaise);
  /** Keeps the browser UI above web pages while `key` is held (no-op outside the browser UI). */
  ui.raise = (key, on) => {
    if (on) holds.add(key); else holds.delete(key);
    syncRaise();
  };
  ui.isRaised = () => raised;

  /* ── Konumlandırma ────────────────────────────────────── */
  function rectOf(anchor) {
    if (!anchor) return { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 3, bottom: innerHeight / 3, width: 0, height: 0 };
    if (anchor instanceof Element) return anchor.getBoundingClientRect();
    if ('x' in anchor && !('width' in anchor)) return { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
    return anchor;
  }
  function place(a, r, placement, offset) {
    const vw = innerWidth, vh = innerHeight, m = 8;
    let [side, align = 'center'] = placement.split('-');
    const fits = {
      bottom: a.bottom + offset + r.height <= vh - m,
      top: a.top - offset - r.height >= m,
      right: a.right + offset + r.width <= vw - m,
      left: a.left - offset - r.width >= m,
    };
    const opposite = { bottom: 'top', top: 'bottom', right: 'left', left: 'right' };
    if (!fits[side] && fits[opposite[side]]) side = opposite[side];
    let left, top;
    if (side === 'bottom' || side === 'top') {
      top = side === 'bottom' ? a.bottom + offset : a.top - offset - r.height;
      left = align === 'start' ? a.left : align === 'end' ? a.right - r.width : a.left + a.width / 2 - r.width / 2;
    } else {
      left = side === 'right' ? a.right + offset : a.left - offset - r.width;
      top = align === 'start' ? a.top - 6 : align === 'end' ? a.bottom - r.height : a.top + a.height / 2 - r.height / 2;
    }
    left = Math.max(m, Math.min(left, vw - r.width - m));
    top = Math.max(m, Math.min(top, vh - r.height - m));
    const ox = side === 'left' ? 'right' : side === 'right' ? 'left' : align === 'end' ? 'right' : align === 'start' ? 'left' : 'center';
    const oy = side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : 'center';
    return { left, top, origin: `${oy} ${ox}`, side };
  }

  function Floating({ layer, className, children, role, label, onKeyDown, style }) {
    const ref = useRef();
    const [pos, setPos] = useState(null);
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const p = place(rectOf(layer.anchor), el.getBoundingClientRect(), layer.placement || 'bottom-start', layer.offset ?? 6);
      // Konumu hemen uygula: gizli (visibility:hidden) öğe odak alamaz, odak aynı tikte veriliyor.
      Object.assign(el.style, { left: `${p.left}px`, top: `${p.top}px`, visibility: 'visible', transformOrigin: p.origin });
      setPos(p);
      if (layer.autoFocus !== false) {
        const first = layer.focusFirst ? el.querySelector('[role^="menuitem"]:not([aria-disabled="true"]), input, button, [tabindex="0"]') : null;
        const target = first || el;
        target.focus({ preventScroll: true });
        if (document.activeElement !== target) requestAnimationFrame(() => { if (target.isConnected && !el.contains(document.activeElement)) target.focus({ preventScroll: true }); });
      }
    }, []);
    const st = pos ? `left:${pos.left}px;top:${pos.top}px;transform-origin:${pos.origin};${style || ''}` : `left:0;top:0;visibility:hidden;${style || ''}`;
    return html`<div ref=${ref} class=${cx('floating', className, pos && 'is-in', layer.closing && 'is-out', pos && `side-${pos.side}`)}
      style=${st} data-layer-id=${layer.id} role=${role} aria-label=${label} tabindex="-1" onKeyDown=${onKeyDown}>${children}</div>`;
  }

  /* ── Menü ─────────────────────────────────────────────── */
  function resolveItem(it) {
    if (it === '-' || it === null) return { separator: true };
    if (it.command) {
      const c = Vox.commands.get(it.command) || {};
      return { label: c.title || it.command, icon: c.icon, kbd: Vox.keys.label(it.command), onSelect: () => Vox.commands.run(it.command, it.args), ...it };
    }
    return it;
  }
  function focusables(el) { return Array.from(el.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])')); }
  function MenuLayer({ layer }) {
    const items = (layer.items || []).filter((x) => x !== undefined && x !== false).map(resolveItem);
    const subRef = useRef(null);
    const timer = useRef(0);
    const openSub = (it, el) => {
      if (subRef.current && subRef.current.el === el) return;
      if (subRef.current) overlay.close(subRef.current.id);
      const id = overlay.open({ kind: 'menu', parent: layer.id, items: it.submenu, anchor: el, placement: 'right-start', offset: 4, focusFirst: layer.keyboard, autoFocus: !!layer.keyboard, keyboard: layer.keyboard, onSelectAll: layer.onSelectAll || (() => overlay.close(layer.id)) });
      subRef.current = { id, el };
    };
    const closeSub = () => { if (subRef.current) { overlay.close(subRef.current.id); subRef.current = null; } };
    const closeAll = () => { const root = layers.find((l) => l.id === layer.family); overlay.close(root ? root.id : layer.id); };
    const activate = (it, el) => {
      if (it.disabled) return;
      if (it.submenu) { overlay.update(layer.id, { keyboard: true }); openSub(it, el); return; }
      closeAll();
      if (it.onSelect) setTimeout(() => it.onSelect(), 0);
    };
    const onKeyDown = (e) => {
      const el = e.currentTarget;
      const list = focusables(el);
      const i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = list.length; if (!n) return;
        const next = e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n;
        list[next].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault(); (e.key === 'Home' ? list[0] : list[list.length - 1])?.focus();
      } else if (e.key === 'ArrowRight' && i >= 0 && list[i].dataset.sub) {
        e.preventDefault(); overlay.update(layer.id, { keyboard: true }); list[i].click();
      } else if (e.key === 'ArrowLeft' && layer.parent) {
        e.preventDefault(); overlay.close(layer.id);
      }
    };
    return html`<${Floating} layer=${layer} className=${cx('menu', layer.className)} role="menu" label=${layer.label} onKeyDown=${onKeyDown} style=${layer.minWidth ? `min-width:${layer.minWidth}px` : ''}>
      ${items.map((it, idx) => {
        if (it.separator) return html`<div class="menu-sep" role="separator" key=${'s' + idx}></div>`;
        if (it.header) return html`<div class="menu-header" key=${'h' + idx}>${it.header}</div>`;
        if (it.render) return html`<div class="menu-custom" key=${'c' + idx}>${it.render({ close: closeAll })}</div>`;
        const role = it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem';
        return html`<button type="button" key=${idx} class=${cx('menu-item', it.danger && 'is-danger', it.checked && 'is-checked')}
          role=${role} aria-checked=${it.checked !== undefined ? String(!!it.checked) : undefined}
          aria-disabled=${it.disabled ? 'true' : undefined} aria-haspopup=${it.submenu ? 'menu' : undefined} data-sub=${it.submenu ? '1' : undefined}
          onPointerEnter=${(e) => { const el = e.currentTarget; clearTimeout(timer.current); timer.current = setTimeout(() => (it.submenu ? openSub(it, el) : closeSub()), 140); }}
          onClick=${(e) => activate(it, e.currentTarget)}>
          <span class="menu-ic">${it.checked !== undefined ? (it.checked ? html`<${Vox.c.Icon} name="check" size=${16}/>` : null) : it.icon ? html`<${Vox.c.Icon} name=${it.icon} size=${18}/>` : null}</span>
          <span class="menu-label">${it.label}${it.hint ? html`<small>${it.hint}</small>` : null}</span>
          ${it.badge ? html`<span class="menu-badge">${it.badge}</span>` : null}
          ${it.kbd ? html`<kbd class="menu-kbd">${it.kbd}</kbd>` : null}
          ${it.submenu ? html`<${Vox.c.Icon} name="chevron-right" size=${16} class="menu-chev"/>` : null}
        </button>`;
      })}
    <//>`;
  }

  /* ── Popover, diyalog, toast, ipucu ───────────────────── */
  function PopoverLayer({ layer }) {
    const close = (v) => overlay.close(layer.id, v);
    return html`<${Floating} layer=${layer} className=${cx('popover', layer.className)} role=${layer.role || 'dialog'} label=${layer.label}
      style=${layer.width ? `width:${layer.width}px` : ''}>${layer.render({ close })}<//>`;
  }

  function DialogLayer({ layer }) {
    const ref = useRef();
    const close = (v) => overlay.close(layer.id, v);
    useLayoutEffect(() => {
      const el = ref.current;
      const af = el && (el.querySelector('[data-autofocus]') || el.querySelector('input, select, textarea, button.btn--primary, button'));
      if (af) af.focus({ preventScroll: true });
    }, []);
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const f = Array.from(ref.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex="0"]'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const actions = layer.actions || [{ label: 'Tamam', variant: 'primary', value: true }];
    const Btn = Vox.c.Button;
    return html`<div class=${cx('dialog-scrim', layer.closing && 'is-out')} onPointerDown=${(e) => { if (e.target === e.currentTarget && layer.dismissible !== false) close(undefined); }}>
      <div ref=${ref} class=${cx('dialog', layer.className, layer.closing && 'is-out')} role="dialog" aria-modal="true" aria-labelledby=${layer.id + '-t'} data-layer-id=${layer.id}
        style=${`width:min(${layer.width || 460}px, calc(100vw - 32px))`} onKeyDown=${onKeyDown}>
        ${layer.icon ? html`<div class=${cx('dialog-icon', layer.tone && `tone-${layer.tone}`)}><${Vox.c.Icon} name=${layer.icon} size=${24}/></div>` : null}
        <h2 class="dialog-title" id=${layer.id + '-t'}>${layer.title}</h2>
        ${layer.render ? layer.render({ close }) : layer.body ? html`<div class="dialog-body">${layer.body}</div>` : null}
        ${actions.length ? html`<div class="dialog-actions">${actions.map((a) => html`<${Btn} variant=${a.variant || 'secondary'} onClick=${async () => {
          const r = a.onClick ? await a.onClick() : undefined;
          if (r !== false) close(a.value !== undefined ? a.value : r);
        }}>${a.label}<//>`)}</div>` : null}
      </div>
    </div>`;
  }

  function ToastLayer({ layer, index }) {
    useEffect(() => {
      if (layer.duration === 0) return undefined;
      const t = setTimeout(() => overlay.close(layer.id), layer.duration || 3800);
      return () => clearTimeout(t);
    }, []);
    return html`<div class=${cx('toast', layer.tone && `tone-${layer.tone}`, layer.closing && 'is-out')} role="status" style=${`--i:${index}`}>
      ${layer.icon ? html`<span class="toast-ic"><${Vox.c.Icon} name=${layer.icon} size=${18}/></span>` : null}
      <span class="toast-text">${layer.title ? html`<b>${layer.title}</b>` : null}${layer.text}</span>
      ${layer.action ? html`<button type="button" class="toast-action" onClick=${() => { overlay.close(layer.id); layer.action.onClick(); }}>${layer.action.label}</button>` : null}
      <button type="button" class="toast-x" aria-label="Kapat" onClick=${() => overlay.close(layer.id)}><${Vox.c.Icon} name="x" size=${16}/></button>
    </div>`;
  }

  function TooltipLayer({ layer }) {
    return html`<${Floating} layer=${{ ...layer, autoFocus: false }} className="tooltip" role="tooltip">
      ${layer.text}${layer.kbd ? html`<kbd>${layer.kbd}</kbd>` : null}<//>`;
  }

  function OverlayHost() {
    const [list, setList] = useState(layers);
    useEffect(() => overlay.subscribe((l) => setList(l)), []);
    const toasts = list.filter((l) => l.kind === 'toast');
    return html`<div class="overlay-root">
      ${list.filter((l) => l.kind !== 'toast').map((l) => {
        if (l.kind === 'menu') return html`<${MenuLayer} key=${l.id} layer=${l}/>`;
        if (l.kind === 'popover') return html`<${PopoverLayer} key=${l.id} layer=${l}/>`;
        if (l.kind === 'dialog') return html`<${DialogLayer} key=${l.id} layer=${l}/>`;
        if (l.kind === 'tooltip') return html`<${TooltipLayer} key=${l.id} layer=${l}/>`;
        return null;
      })}
      <div class="toast-stack">${toasts.slice(-3).map((l, i, a) => html`<${ToastLayer} key=${l.id} layer=${l} index=${a.length - 1 - i}/>`)}</div>
      <div id="vox-fx" class="fx-layer" aria-hidden="true"></div>
    </div>`;
  }
  Vox.c.OverlayHost = OverlayHost;

  /* ── Genel API ────────────────────────────────────────── */
  const toggleExisting = (kind, anchor) => {
    if (!(anchor instanceof Element)) return false;
    const ex = layers.find((l) => l.kind === kind && l.anchor === anchor && !l.closing);
    if (ex) { overlay.close(ex.id); return true; }
    return false;
  };
  ui.menu = (opts) => {
    if (toggleExisting('menu', opts.anchor)) return { close() {} };
    overlay.closeKind('menu');
    const id = overlay.open({ kind: 'menu', placement: 'bottom-start', focusFirst: !!opts.keyboard, ...opts });
    return { id, close: () => overlay.close(id) };
  };
  ui.contextMenu = (e, items, opts = {}) => {
    e.preventDefault();
    overlay.closeKind('menu');
    const id = overlay.open({ kind: 'menu', anchor: { x: e.clientX, y: e.clientY }, placement: 'bottom-start', offset: 2, items, ...opts });
    return { id, close: () => overlay.close(id) };
  };
  ui.popover = (opts) => {
    if (toggleExisting('popover', opts.anchor)) return { close() {} };
    if (!opts.stack) overlay.closeKind('popover');
    const id = overlay.open({ kind: 'popover', placement: 'bottom-end', offset: 8, ...opts });
    return { id, close: (v) => overlay.close(id, v) };
  };
  ui.dialog = (opts) => new Promise((resolve) => { overlay.open({ kind: 'dialog', ...opts, resolve }); });
  ui.confirm = ({ title, text, confirmLabel = 'Tamam', cancelLabel = 'Vazgeç', danger = false, icon }) =>
    ui.dialog({
      title, body: text, icon: icon || (danger ? 'triangle-alert' : undefined), tone: danger ? 'danger' : undefined,
      actions: [{ label: cancelLabel, variant: 'secondary', value: false }, { label: confirmLabel, variant: danger ? 'danger' : 'primary', value: true }],
    }).then((v) => v === true);
  const hudActions = new Map();
  if (Vox.native && Vox.native.kind === 'ui') {
    Vox.native.on('hud:action', ({ id }) => {
      const fn = hudActions.get(id);
      hudActions.delete(id);
      if (fn) { try { fn(); } catch (e) { Vox.reportError('toast-action', e); } }
    });
  }
  const textOf = (v) => {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    const div = document.createElement('div');
    try { Vox.p.render(v, div); } catch (e) { return ''; }
    return div.textContent || '';
  };
  ui.toast = (opts) => {
    const o = typeof opts === 'string' ? { text: opts } : opts;
    if (Vox.native && Vox.native.kind === 'ui') {
      const id = uid('ts');
      if (o.action && typeof o.action.onClick === 'function') hudActions.set(id, o.action.onClick);
      Vox.native.invoke('hud:toast', { id, text: textOf(o.text), title: textOf(o.title), icon: o.icon || '', tone: o.tone || '', action: o.action ? { label: textOf(o.action.label) } : null, duration: o.duration == null ? 3800 : o.duration }).catch(() => {});
      return () => {};
    }
    const id = overlay.open({ kind: 'toast', ...o });
    return () => overlay.close(id);
  };
  ui.closeAll = () => layers.filter((l) => l.kind !== 'toast').forEach((l) => overlay.close(l.id));

  /* ── Genel dinleyiciler: dışarı tıklama, Esc, ipuçları ── */
  document.addEventListener('pointerdown', (e) => {
    const open = layers.filter((l) => !l.closing && (l.kind === 'menu' || l.kind === 'popover' || l.kind === 'tooltip'));
    if (!open.length) return;
    const inLayer = e.target.closest && e.target.closest('[data-layer-id]');
    const famId = inLayer ? (layers.find((l) => l.id === inLayer.dataset.layerId) || {}).family : null;
    for (const l of open) {
      if (l.kind === 'tooltip') { overlay.close(l.id); continue; }
      if (famId && l.family === famId) continue;
      if (l.anchor instanceof Element && l.anchor.contains(e.target)) continue;
      if (l.parent) continue;
      if (l.persistent) continue;
      overlay.close(l.id);
    }
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const top = overlay.top(['menu', 'popover', 'dialog']);
    if (!top) return;
    if (top.kind === 'dialog' && top.dismissible === false) return;
    e.preventDefault();
    e.stopPropagation();
    overlay.close(top.id);
  }, true);
  window.addEventListener('resize', () => layers.filter((l) => l.kind === 'menu' || l.kind === 'tooltip').forEach((l) => overlay.close(l.id)));

  let tipTimer = 0, tipFor = null, tipId = null;
  const hideTip = () => { clearTimeout(tipTimer); tipFor = null; if (tipId) { overlay.close(tipId); tipId = null; } };
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el === tipFor) return;
    hideTip();
    if (!el || e.pointerType === 'touch') return;
    // Açık bir menü, açılır panel ya da diyalog varken ipucu gösterme (panelin üstüne binmesin)
    // (panelin kendi içindeki düğmelerin ipuçları gösterilir)
    const insideLayer = !!el.closest('[data-layer-id]');
    if (el.getAttribute('aria-expanded') === 'true' || layers.some((l) => !l.closing && (l.anchor === el || (!insideLayer && (l.kind === 'menu' || l.kind === 'popover' || l.kind === 'dialog'))))) return;
    tipFor = el;
    tipTimer = setTimeout(() => {
      if (!document.contains(el)) return;
      const cmd = el.dataset.cmd;
      tipId = overlay.open({ kind: 'tooltip', anchor: el, placement: el.dataset.tipPos || 'bottom', offset: 8, autoFocus: false, text: el.dataset.tip, kbd: el.dataset.kbd || (cmd ? Vox.keys.label(cmd) : '') });
    }, 520);
  });
  ['pointerdown', 'wheel', 'keydown'].forEach((ev) => document.addEventListener(ev, hideTip, true));
})();
