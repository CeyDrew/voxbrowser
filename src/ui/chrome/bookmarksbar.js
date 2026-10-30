/* chrome · yer imleri çubuğu (Vox.c.BookmarksBar): "bar" klasöründeki hap öğeler (gerçek site simgeleri), klasör
   menüleri (alt menülerle), sığmayanlar için » menüsü, sağda "Diğer yer imleri", sürükleyerek sıralama / klasöre
   bırakma (sürüklerken yalnızca görünüm değişir, bırakınca tek kayıt), eklenen öğenin zıplayarak gelmesi.
   Ctrl+Shift+B ile açılıp kapanır (yumuşak katlanma); görünürlük ayarlarda saklanır. */
Vox.define('chrome.bookmarksbar', (Vox) => {
  const { html, useState, useRef, useLayoutEffect, useEffect } = Vox.p;
  const { Icon } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const ch = Vox.ch;
  const bm = ch.bm;

  function Item({ n, i, off, fresh, dragging, drop, open, rove, h }) {
    const folder = n.type === 'folder';
    return html`<button type="button" data-bm-id=${n.id} data-i=${i}
      class=${cx('ch-bm-item', folder && 'is-folder', off && 'is-off', fresh && 'is-new', dragging && 'is-dragging', drop && 'is-drop', open && 'is-open')}
      tabindex=${off ? '-1' : rove ? '0' : '-1'} aria-hidden=${off ? 'true' : undefined} aria-haspopup=${folder ? 'menu' : undefined}
      aria-expanded=${folder ? String(!!open) : undefined} data-tip=${folder || dragging ? undefined : Vox.url.display(n.url)}
      onClick=${(e) => h.click(e, n)} onAuxClick=${(e) => h.aux(e, n)} onContextMenu=${(e) => h.menu(e, n)}
      onPointerDown=${(e) => h.down(e, n)} onPointerEnter=${(e) => h.enter(e, n)} onFocus=${() => h.focus(i)}>
      ${folder ? html`<${Icon} name=${open ? 'folder-open' : 'folder'} size=${16} class="ch-bm-fic"/>` : html`<${bm.Icon} node=${n}/>`}
      <span class="ch-bm-title">${n.title || Vox.url.display(n.url || '')}</span>
    </button>`;
  }

  function BookmarksBar() {
    const show = Vox.useStore('settings.appearance.showBookmarksBar') !== false;
    const tree = Vox.useStore('bookmarks');
    Vox.useStore('history'); // simgesi olmayan yer imleri geçmişteki simgeyi kullanır
    const roots = (tree && tree.children) || [];
    const bar = roots.find((c) => c.id === 'bar') || { id: 'bar', children: [] };
    const other = roots.find((c) => c.id === 'other') || { id: 'other', title: 'Diğer yer imleri', children: [] };
    const stored = bar.children || [];
    const listRef = useRef(null);
    const fresh = useRef(new Set());
    const seen = useRef(null);
    const drag = useRef(null);
    const snap = useRef(null);
    const dragEnd = useRef(0);
    const [cut, setCut] = useState(Infinity);
    const [order, setOrder] = useState(null); // sürüklerken yerel sıra (kimlikler)
    const [dragId, setDragId] = useState(null);
    const [dropId, setDropId] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [rove, setRove] = useState(0);
    const byId = new Map(stored.map((n) => [n.id, n]));
    const items = order ? order.map((id) => byId.get(id)).filter(Boolean) : stored;

    // Yeni eklenen öğeler (bu pencereden, başka pencereden ya da yer imi sayfasından) zıplayarak gelir.
    if (seen.current) stored.forEach((n) => { if (!seen.current.has(n.id)) { fresh.current.add(n.id); setTimeout(() => fresh.current.delete(n.id), 900); } });
    seen.current = new Set(stored.map((n) => n.id));

    /* Sığmayan öğeler yerinde kalır ama görünmez olur; böylece ölçüm hep kararlı kalır. */
    const measure = () => {
      const ul = listRef.current;
      if (!ul) return;
      const els = Array.from(ul.querySelectorAll(':scope > .ch-bm-item'));
      let c = els.length;
      for (let k = 0; k < els.length; k++) if (els[k].offsetLeft + els[k].offsetWidth > ul.clientWidth + 0.5) { c = k; break; }
      setCut((p) => (p === c ? p : c));
    };
    useLayoutEffect(measure);
    useEffect(() => {
      const ul = listRef.current;
      if (!ul || !window.ResizeObserver) return undefined;
      const ro = new ResizeObserver(measure);
      ro.observe(ul);
      return () => ro.disconnect();
    }, []);

    // Açık klasör menüsünü izle (düğmenin "açık" görünümü ve menü çubuğu gibi üzerinden geçerek değiştirme).
    useEffect(() => Vox.overlay.subscribe((layers) => {
      const m = layers.find((l) => l.kind === 'menu' && !l.closing && l.chFolder && !l.parent);
      setOpenId(m ? m.chFolder : null);
    }), []);

    /* FLIP: sıra değişince öğeler yeni yerlerine kayar */
    const capture = () => {
      if (snap.current || !listRef.current) return;
      const m = new Map();
      listRef.current.querySelectorAll('[data-bm-id]').forEach((el) => m.set(el.dataset.bmId, el.getBoundingClientRect().left));
      snap.current = m;
    };
    useLayoutEffect(() => store.subscribe((s, p) => { if (s.bookmarks !== p.bookmarks) capture(); }), []);
    useLayoutEffect(() => {
      const before = snap.current;
      snap.current = null;
      const d = drag.current;
      if (before && listRef.current && !Vox.motion.reduced()) {
        listRef.current.querySelectorAll('[data-bm-id]').forEach((el) => {
          const k = el.dataset.bmId;
          if (!before.has(k) || (d && d.started && d.id === k)) return;
          el.getAnimations().forEach((a) => { if (a.id === 'ch-flip') a.cancel(); });
          const dx = before.get(k) - el.getBoundingClientRect().left;
          if (Math.abs(dx) > 0.5) el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 240, easing: ch.EASE, id: 'ch-flip' });
        });
      }
      if (d && d.started) follow(false);
    });

    /* ── Sürükle-bırak ── */
    const elOf = (id) => listRef.current && listRef.current.querySelector(`[data-bm-id="${id}"]`);
    function follow(reorder) {
      const d = drag.current, ul = listRef.current;
      if (!d || !d.started || !ul) return;
      const el = elOf(d.id);
      if (!el) return;
      d.el = el;
      const base = ul.getBoundingClientRect().left;
      const w = el.offsetWidth;
      const left = Math.max(-4, Math.min(ul.clientWidth - w + 4, d.x - d.grab - base));
      el.style.transform = `translateX(${left - el.offsetLeft}px)`;
      if (reorder) place(left + w / 2, d.x - base);
    }
    function place(cx, px) {
      const d = drag.current, ul = listRef.current;
      const ids = d.order;
      const slot = d.el.offsetWidth + (parseFloat(getComputedStyle(ul).columnGap) || 0);
      const myLeft = d.el.offsetLeft;
      const pos = (el) => el.offsetLeft - (el.offsetLeft > myLeft ? slot : 0);
      let into = null;
      for (const id of ids) {
        const n = byIdNow(id);
        if (id === d.id || !n || n.type !== 'folder') continue;
        const el = elOf(id);
        if (!el || el.classList.contains('is-off')) continue;
        const l = pos(el);
        if (px > l + el.offsetWidth * 0.22 && px < l + el.offsetWidth * 0.78) { into = id; break; }
      }
      if (into !== d.into) { d.into = into; setDropId(into); }
      if (into) return;
      const without = ids.filter((id) => id !== d.id);
      let idx = without.length;
      for (let k = 0; k < without.length; k++) {
        const el = elOf(without[k]);
        if (el && cx < pos(el) + el.offsetWidth / 2) { idx = k; break; }
      }
      if (idx === ids.indexOf(d.id)) return;
      without.splice(idx, 0, d.id);
      d.order = without;
      capture();
      setOrder(without);
    }
    const byIdNow = (id) => ((Vox.bookmarks.get('bar') || {}).children || []).find((n) => n.id === id);
    function onDown(e, n) {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      const el = e.currentTarget;
      const d = { id: n.id, el, pid: e.pointerId, x0: e.clientX, x: e.clientX, grab: e.clientX - el.getBoundingClientRect().left, started: false, into: null, order: null };
      drag.current = d;
      const end = (cancel) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        window.removeEventListener('keydown', key, true);
        if (drag.current === d) drop(d, cancel);
      };
      const move = (ev) => {
        if (ev.pointerId !== d.pid || drag.current !== d) return;
        if (ev.buttons === 0) { end(false); return; } // düğme pencere dışında bırakıldı
        d.x = ev.clientX;
        if (!d.started) {
          if (Math.abs(d.x - d.x0) < 6) return;
          d.started = true;
          d.order = ((Vox.bookmarks.get('bar') || {}).children || []).map((x) => x.id);
          Vox.overlay.closeKind('menu');
          document.documentElement.classList.add('ch-grabbing');
          Vox.ui.raise('ch-bmdrag', true);
          setOrder(d.order);
          setDragId(d.id);
        }
        follow(true);
      };
      const up = (ev) => { if (ev.pointerId === d.pid) end(ev.type === 'pointercancel'); };
      const key = (ev) => { if (ev.key === 'Escape' && d.started) { ev.preventDefault(); ev.stopPropagation(); end(true); } };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener('keydown', key, true);
    }
    function drop(d, cancel) {
      drag.current = null;
      if (!d.started) return;
      dragEnd.current = Date.now();
      document.documentElement.classList.remove('ch-grabbing');
      Vox.ui.raise('ch-bmdrag', false);
      const el = elOf(d.id) || d.el;
      const m = /translateX\((-?[\d.]+)px\)/.exec(el.style.transform || '');
      setDragId(null);
      setDropId(null);
      if (d.into && !cancel) {
        const folder = Vox.bookmarks.get(d.into);
        const node = Vox.bookmarks.get(d.id);
        const fel = elOf(d.into);
        ch.anim(el, [{ transform: m ? m[0] : 'none', opacity: 1 }, { transform: `${m ? m[0] : ''} scale(.3)`, opacity: 0 }], { duration: 180, easing: ch.INOUT, fill: 'forwards' })
          .then((a) => {
            el.style.transform = '';
            setOrder(null);
            Vox.bookmarks.move(d.id, d.into);
            if (a) a.cancel();
            if (fel) ch.anim(fel, [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 380, easing: ch.SPRING });
            if (folder && node) Vox.ui.toast({ icon: 'folder-input', text: `“${node.title}”, “${folder.title}” klasörüne taşındı.` });
          });
        return;
      }
      const idx = d.order ? d.order.indexOf(d.id) : -1;
      const now = ((Vox.bookmarks.get('bar') || {}).children || []).findIndex((x) => x.id === d.id);
      capture();
      el.style.transform = '';
      if (!cancel && idx >= 0 && idx !== now) Vox.bookmarks.move(d.id, 'bar', idx);
      setOrder(null);
    }

    /* ── Tıklama, menüler, klavye ── */
    const openFolder = (n, anchor, keyboard) => Vox.ui.menu({ anchor, placement: 'bottom-start', keyboard, minWidth: 230, label: n.title, chFolder: n.id, items: bm.menuItems(n) });
    const h = {
      click(e, n) {
        if (Date.now() - dragEnd.current < 120) return;
        if (n.type === 'folder') { openFolder(n, e.currentTarget, e.detail === 0); return; }
        bm.open(n.url, e.ctrlKey || e.metaKey ? 'background' : e.shiftKey ? 'window' : 'current');
      },
      aux(e, n) {
        if (e.button !== 1) return;
        e.preventDefault();
        if (n.type === 'folder') bm.openAll(n, 'background'); else bm.open(n.url, 'background');
      },
      menu(e, n) { bm.itemMenu(e, n); },
      down: onDown,
      enter(e, n) {
        if (drag.current && drag.current.started) return;
        const m = Vox.overlay.list().find((l) => l.kind === 'menu' && !l.closing && l.chFolder && !l.parent);
        if (m && m.chFolder !== n.id && n.type === 'folder') openFolder(n, e.currentTarget, false);
      },
      focus: (i) => setRove(i),
    };
    const onKey = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      const all = Array.from(e.currentTarget.querySelectorAll('.ch-bm-item:not(.is-off), .ch-bm-more'));
      const i = all.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
      all[n].focus();
    };

    const hidden = cut < items.length ? items.slice(cut) : [];
    const hasOther = (other.children || []).length > 0;
    return html`<div class=${cx('ch-bm-wrap', !show && 'is-hidden')} inert=${show ? undefined : true}>
      <div class="ch-bm" role="toolbar" aria-label="Yer imleri çubuğu" onKeyDown=${onKey} onContextMenu=${(e) => { if (!e.defaultPrevented) bm.barMenu(e); }}>
        <div class=${cx('ch-bm-list', dragId && 'is-dragging')} ref=${listRef}>
          ${items.length ? items.map((n, i) => html`<${Item} key=${n.id} n=${n} i=${i} off=${i >= cut} fresh=${fresh.current.has(n.id)}
            dragging=${dragId === n.id} drop=${dropId === n.id} open=${openId === n.id} rove=${i === Math.min(rove, items.length - 1)} h=${h}/>`)
          : html`<div class="ch-bm-empty"><${Icon} name="bookmark" size=${15}/><span>Sık açtığınız sayfaları buraya ekleyin.</span>
              <button type="button" class="ch-bm-link" onClick=${() => bm.addCurrent()}>Bu sayfayı ekle</button></div>`}
        </div>
        ${hidden.length ? html`<button type="button" class=${cx('ch-bm-more', openId === '__more' && 'is-open')} aria-label="Sığmayan yer imleri" data-tip="Diğer öğeler" aria-haspopup="menu"
          onClick=${(e) => Vox.ui.menu({ anchor: e.currentTarget, placement: 'bottom-end', keyboard: e.detail === 0, minWidth: 230, chFolder: '__more', items: bm.menuItems({ children: hidden }) })}>
          <${Icon} name="chevrons-right" size=${16}/></button>` : null}
        ${hasOther ? html`<span class="ch-bm-sep" aria-hidden="true"></span>
        <button type="button" class=${cx('ch-bm-item ch-bm-other is-folder', openId === 'other' && 'is-open')} aria-haspopup="menu" aria-expanded=${String(openId === 'other')}
          onClick=${(e) => openFolder(other, e.currentTarget, e.detail === 0)} onContextMenu=${(e) => bm.barMenu(e)}
          onPointerEnter=${(e) => h.enter(e, other)}>
          <${Icon} name=${openId === 'other' ? 'folder-open' : 'folder'} size=${16} class="ch-bm-fic"/><span class="ch-bm-title">Diğer yer imleri</span>
        </button>` : null}
      </div>
    </div>`;
  }

  Vox.c.BookmarksBar = BookmarksBar;

  Vox.commands.register('bookmarksBar.toggle', {
    title: 'Yer imleri çubuğunu göster / gizle', icon: 'bookmark',
    run() {
      const on = Vox.settings.get('appearance.showBookmarksBar') !== false;
      Vox.settings.set('appearance.showBookmarksBar', !on);
      if (on) Vox.ui.toast({ icon: 'bookmark', text: `Yer imleri çubuğu gizlendi. Geri getirmek için ${Vox.keys.label('bookmarksBar.toggle') || 'Ctrl+Shift+B'}.` });
    },
  });
});
