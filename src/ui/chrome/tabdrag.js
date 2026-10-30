/* chrome · sekmeyi sürükleyerek sıralama. Sekme işaretçiyi izler (kendi bölgesinde: sabitlenmiş / normal), şerit canlı
   olarak yeniden dizilir (yalnızca yerel plan); bırakınca yeni sıra tek seferde ana sürece gönderilir, Esc iptal eder.
   Grubun içine bırakılan sekme gruba katılır, dışarı sürüklenen ayrılır. Sürükleme boyunca arayüz sayfanın üstünde
   tutulur; imleç sayfa alanına kaysa da olaylar şeride gelmeye devam eder. */
Vox.define('chrome.tabdrag', (Vox) => {
  const store = Vox.store;
  const ch = Vox.ch;

  const tabEl = (ctx, id) => ctx.scRef.current && ctx.scRef.current.querySelector(`.ch-tab[data-tab-id="${id}"]`);
  const collapsedGroup = (gid) => (store.get('groups') || []).some((g) => g.id === gid && g.collapsed);
  const sameLayout = (a, b) => a.length === b.length && a.every((t, i) => t.id === b[i].id && (t.groupId || null) === (b[i].groupId || null) && !!t.pinned === !!b[i].pinned);

  /** pointerdown on a tab: activates it, and starts a drag once the pointer travels 6px. */
  function down(ctx, e, tab) {
    if (e.button === 1) { e.preventDefault(); return; } // orta tık: otomatik kaydırma yok, kapanış auxclick'te
    if (e.button !== 0 || e.target.closest('button')) return;
    ch.preview.hide();
    if (tab.id !== store.get('activeTabId')) Vox.tabs.activate(tab.id);
    if (e.pointerType === 'touch') return;
    const el = e.currentTarget;
    const d = { id: tab.id, el, pid: e.pointerId, x0: e.clientX, x: e.clientX, grab: e.clientX - el.getBoundingClientRect().left, started: false, raf: 0 };
    ctx.drag.current = d;
    const stop = (cancel) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', blur);
      if (ctx.drag.current === d) finish(ctx, d, cancel);
    };
    const move = (ev) => {
      if (ev.pointerId !== d.pid || ctx.drag.current !== d) return;
      if (ev.buttons === 0) { stop(false); return; } // düğme pencere dışında bırakıldı
      d.x = ev.clientX;
      if (!d.started) {
        if (Math.abs(d.x - d.x0) < 6) return;
        d.started = true;
        ch.dragging = true;
        document.documentElement.classList.add('ch-grabbing');
        Vox.ui.raise('ch-tabdrag', true);
        ctx.setDragId(d.id);
        d.raf = requestAnimationFrame(() => edgeScroll(ctx));
      }
      follow(ctx, true);
    };
    const up = (ev) => { if (ev.pointerId === d.pid) stop(ev.type === 'pointercancel'); };
    const key = (ev) => {
      if (ev.key !== 'Escape' || !d.started) return;
      ev.preventDefault();
      ev.stopPropagation();
      stop(true);
    };
    const blur = () => stop(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', blur);
  }

  /** Moves the dragged tab under the pointer (clamped to its zone and the visible strip) and reorders. */
  function follow(ctx, reorder) {
    const d = ctx.drag.current, sc = ctx.scRef.current;
    if (!d || !d.started || !sc) return;
    const el = tabEl(ctx, d.id);
    if (!el) return;
    d.el = el;
    const base = sc.getBoundingClientRect().left - sc.scrollLeft;
    const w = el.offsetWidth;
    const pinned = el.classList.contains('is-pinned');
    const zone = Array.from(sc.querySelectorAll('.ch-tab:not(.is-exiting):not(.is-collapsed), .ch-chip')).filter((x) => x.classList.contains('is-pinned') === pinned);
    if (!zone.length) return;
    const min = Math.min(...zone.map((x) => x.offsetLeft));
    const max = Math.max(...zone.map((x) => x.offsetLeft + x.offsetWidth));
    let left = d.x - d.grab - base;
    left = Math.max(left, min - 8, sc.scrollLeft - 6);
    left = Math.min(left, max - w + 8, sc.scrollLeft + sc.clientWidth - w + 6);
    el.style.transform = `translateX(${left - el.offsetLeft}px)`;
    if (reorder) place(ctx, left + w / 2);
  }

  /** Finds the slot for the dragged tab's centre `cx` (content coordinates) and joins/leaves groups by neighbours. */
  function place(ctx, cx) {
    const d = ctx.drag.current;
    const tabs = ch.view();
    const me = tabs.find((t) => t.id === d.id);
    if (!me || !d.el) return;
    const w = d.el.offsetWidth;
    const slot = w + (parseFloat(getComputedStyle(d.el).marginRight) || 0);
    const myLeft = d.el.offsetLeft;
    const pos = (el) => el.offsetLeft - (el.offsetLeft > myLeft ? slot : 0); // sürüklenen sekme yokmuş gibi düzen
    const without = tabs.filter((t) => t.id !== d.id);
    const same = (t) => !!t.pinned === !!me.pinned;
    let idx = -1;
    for (let k = 0; k < without.length; k++) {
      const t = without[k];
      if (!same(t)) continue;
      const el = tabEl(ctx, t.id);
      if (!el || el.classList.contains('is-collapsed') || el.classList.contains('is-exiting')) continue;
      if (cx < pos(el) + el.offsetWidth / 2) { idx = k; break; }
    }
    if (idx < 0) {
      let last = -1;
      without.forEach((t, k) => { if (same(t)) last = k; });
      idx = last >= 0 ? last + 1 : me.pinned ? 0 : without.filter((t) => t.pinned).length;
    }
    let gid = null;
    if (!me.pinned) {
      const L = without[idx - 1], R = without[idx];
      const open = (t) => t && !t.pinned && t.groupId && !collapsedGroup(t.groupId);
      if (open(L) && open(R) && L.groupId === R.groupId) gid = L.groupId;
      else {
        const le = open(L) && tabEl(ctx, L.id), re = open(R) && tabEl(ctx, R.id);
        if (le && cx < pos(le) + le.offsetWidth + w * 0.35) gid = L.groupId;
        else if (re && cx > pos(re) - w * 0.35) gid = R.groupId;
      }
    }
    if (idx === tabs.indexOf(me) && gid === (me.groupId || null)) return;
    const next = without.slice();
    next.splice(idx, 0, gid === (me.groupId || null) ? me : { ...me, groupId: gid });
    ch.plan.show(next, true);
  }

  function edgeScroll(ctx) {
    const d = ctx.drag.current, sc = ctx.scRef.current;
    if (!d || !d.started || !sc) return;
    const r = sc.getBoundingClientRect(), edge = 40;
    let v = 0;
    if (d.x < r.left + edge) v = -Math.ceil((r.left + edge - d.x) / 5);
    else if (d.x > r.right - edge) v = Math.ceil((d.x - r.right + edge) / 5);
    if (v && sc.scrollWidth > sc.clientWidth) {
      const before = sc.scrollLeft;
      sc.scrollLeft += v;
      if (sc.scrollLeft !== before) follow(ctx, true);
    }
    d.raf = requestAnimationFrame(() => edgeScroll(ctx));
  }

  /** Drop (or cancel): the strip settles; the dragged tab glides from where it was let go into its slot (FLIP). */
  function finish(ctx, d, cancel) {
    ctx.drag.current = null;
    if (!d.started) return;
    cancelAnimationFrame(d.raf);
    ch.dragging = false;
    document.documentElement.classList.remove('ch-grabbing');
    Vox.ui.raise('ch-tabdrag', false);
    const el = tabEl(ctx, d.id) || d.el;
    const next = ch.view();
    const hadPlan = !!ch.plan.get();
    const m = /translateX\((-?[\d.]+)px\)/.exec((el && el.style.transform) || '');
    ctx.dropped = d.id;
    // Plan düşerken konumlar (sürüklenen sekmenin bırakıldığı yer dahil) yakalanır; ardından kaydırma temizlenir.
    ch.plan.clear();
    if (!cancel && hadPlan && !sameLayout(next, store.get('tabs') || [])) ch.commit(next);
    if (el) el.style.transform = '';
    ctx.setDragId(null);
    if (!hadPlan && el && m && Math.abs(parseFloat(m[1])) > 0.5) ch.anim(el, [{ transform: m[0] }, { transform: 'none' }], { duration: 340, easing: ch.SPRING });
  }

  ch.drag = { down, follow };
});
