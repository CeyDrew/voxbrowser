/* chrome · sekme şeridi (Vox.c.TabStrip) — pencerenin başlık çubuğudur: boş alanlar pencereyi sürükler (çift tık:
   ekranı kapla, Windows yapar), sekme ve düğmeler sürüklemez. Dost hap sekmeler, gruplar, açılış/kapanış animasyonları,
   FLIP ile yer değiştirme, taşmada kenarları solan yatay kaydırma, fareyle kapatırken genişlik kilidi, sekme arama
   düğmesi, gizli pencere rozeti ve pencere düğmeleri (tam ekranda gizli). */
Vox.define('chrome.tabstrip', (Vox) => {
  const { html, useState, useRef, useLayoutEffect, useEffect, useReducer, useCallback } = Vox.p;
  const { Icon, IconButton } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const ch = Vox.ch;
  const { Tab, GroupChip } = ch;
  const MAX_W = 220;

  /* Pencere açılınca Chromium odağı belgedeki ilk odaklanabilir öğeye (yeni sekme düğmesi) verebilir. Kullanıcı klavye
     ya da fareyle bir şey yapana dek şeritte odak halkası gösterilmez (odağın kendisine dokunulmaz). */
  const root = document.documentElement;
  root.classList.add('ch-boot');
  const awake = () => root.classList.remove('ch-boot');
  window.addEventListener('pointerdown', awake, { capture: true, once: true });
  window.addEventListener('keydown', awake, { capture: true, once: true });

  const sameLayout = (a, b) => a.length === b.length && a.every((t, i) => t.id === b[i].id && (t.groupId || null) === (b[i].groupId || null) && !!t.pinned === !!b[i].pinned);

  /** Keeps closed tabs rendered (flagged `exiting`) beside their old neighbour until the close animation ends. */
  function usePresence(tabs) {
    const st = useRef({ prev: [], gone: new Map() }).current;
    const [, force] = useReducer((x) => x + 1, 0);
    const ids = new Set(tabs.map((t) => t.id));
    st.prev.forEach((t, i) => {
      if (ids.has(t.id) || st.gone.has(t.id)) return;
      let after = null;
      for (let j = i - 1; j >= 0 && !after; j--) if (ids.has(st.prev[j].id) || st.gone.has(st.prev[j].id)) after = st.prev[j].id;
      st.gone.set(t.id, { tab: t, after });
    });
    for (const id of Array.from(st.gone.keys())) if (ids.has(id)) st.gone.delete(id);
    st.prev = tabs;
    const out = tabs.map((t) => ({ tab: t, exiting: false }));
    let pending = Array.from(st.gone.values());
    for (let pass = 0; pending.length && pass < 6; pass++) {
      const later = [];
      for (const g of pending) {
        const k = g.after ? out.findIndex((x) => x.tab.id === g.after) : -1;
        if (g.after && k < 0) { later.push(g); continue; }
        let at = k + 1;
        while (at < out.length && out[at].exiting) at++;
        out.splice(at, 0, { tab: g.tab, exiting: true });
      }
      if (later.length === pending.length) { later.forEach((g) => out.unshift({ tab: g.tab, exiting: true })); break; }
      pending = later;
    }
    const done = useCallback((id) => { if (st.gone.delete(id)) force(); }, []);
    return [out, done];
  }

  /* ── FLIP: sıra değişmeden önceki konumlar yakalanır, çizimden sonra oynatılır ── */
  function capture(sc) {
    const m = new Map();
    if (sc) sc.querySelectorAll('[data-flip-key]').forEach((el) => { if (!el.classList.contains('is-exiting')) m.set(el.dataset.flipKey, el.getBoundingClientRect().left); });
    return m;
  }
  function playFlip(sc, before, skip, dropped) {
    if (!sc || !before || Vox.motion.reduced()) return;
    sc.querySelectorAll('[data-flip-key]').forEach((el) => {
      const k = el.dataset.flipKey;
      if (k === skip || !before.has(k) || el.classList.contains('is-exiting') || el.classList.contains('is-collapsed')) return;
      el.getAnimations().forEach((a) => { if (a.id === 'ch-flip') a.cancel(); });
      const dx = before.get(k) - el.getBoundingClientRect().left;
      if (Math.abs(dx) > 0.5) el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], k === dropped ? { duration: 340, easing: ch.SPRING, id: 'ch-flip' } : { duration: 250, easing: ch.EASE, id: 'ch-flip' });
    });
  }

  /** Tabs to draw: the store's list with any pending plan applied. Positions are captured before each reorder. */
  function useView(snapRef, scRef) {
    const [, force] = useReducer((x) => x + 1, 0);
    const cur = useRef(null);
    if (cur.current === null) cur.current = ch.view();
    useLayoutEffect(() => {
      const update = (groupsChanged) => {
        const next = ch.view();
        if (next === cur.current) return;
        if (!snapRef.current && (groupsChanged || !sameLayout(next, cur.current))) snapRef.current = capture(scRef.current);
        cur.current = next;
        force();
      };
      const a = store.subscribe((s, p) => { if (s.tabs !== p.tabs || s.groups !== p.groups) update(s.groups !== p.groups); });
      const b = ch.plan.subscribe(() => update(false));
      return () => { a(); b(); };
    }, []);
    return cur.current;
  }

  /* ── Pencere düğmeleri: büyütülmüş pencerede köşeye kadar tıklanabilir (Fitts) ── */
  function WindowControls({ max }) {
    const run = (id) => () => Vox.commands.run(id);
    const maxLabel = max ? 'Önceki boyutuna getir' : 'Ekranı kapla';
    return html`<div class="ch-winctl no-drag" role="group" aria-label="Pencere">
      <button type="button" class="ch-wc" aria-label="Simge durumuna küçült" data-tip="Simge durumuna küçült" onClick=${run('window.minimize')}>
        <span class="ch-wc-ic"><${Icon} name="minus" size=${18}/></span></button>
      <button type="button" class="ch-wc" aria-label=${maxLabel} data-tip=${maxLabel} onClick=${run('window.maximize')}>
        <span class="ch-wc-ic"><${Icon} name=${max ? 'copy' : 'square'} size=${max ? 15 : 14} class=${max ? 'ch-flipx' : ''}/></span></button>
      <button type="button" class="ch-wc ch-wc--close" aria-label="Kapat" data-tip="Kapat" onClick=${run('window.close')}>
        <span class="ch-wc-ic"><${Icon} name="x" size=${18}/></span></button>
    </div>`;
  }

  /* ── Şerit ────────────────────────────────────────────── */
  function TabStrip() {
    const snap = useRef(null);
    const scRef = useRef(null);
    const tabs = useView(snap, scRef);
    const activeId = Vox.useStore('activeTabId');
    const groups = Vox.useStore('groups') || [];
    const priv = Vox.useStore('window.private');
    const max = Vox.useStore('window.maximized');
    const full = Vox.useStore('window.fullscreen');
    const previews = Vox.useStore('settings.appearance.tabPreviews') !== false;
    const [list, onExited] = usePresence(tabs);
    const [dragId, setDragId] = useState(null);
    const [lock, setLock] = useState(0);
    const known = useRef(null);
    const drag = useRef(null);
    const ctx = useRef(null);
    if (!ctx.current) ctx.current = { scRef, drag, setDragId, dropped: null };
    const h = useRef(null);
    if (!h.current) {
      h.current = {
        down: (e, t) => ch.drag.down(ctx.current, e, t),
        aux: (e, t) => { if (e.button === 1) { e.preventDefault(); ch.preview.hide(); h.current.lockAt(e.currentTarget); Vox.tabs.close(t.id); } },
        menu: (e, t) => { ch.preview.hide(); Vox.ui.contextMenu(e, ch.tabMenu(t)); },
        enter: (e, t) => { if (!drag.current || !drag.current.started) ch.preview.hover(t.id, e.currentTarget); },
        leave: () => ch.preview.leave(),
        close: (e, t) => { ch.preview.hide(); if (e.detail) h.current.lockAt(e.currentTarget.closest('.ch-tab')); Vox.tabs.close(t.id); },
        // Fareyle art arda kapatırken sekmeler genişlemez: bir sonraki kapat düğmesi imlecin altına gelir.
        lockAt: (el) => { if (el && !el.classList.contains('is-pinned') && el.offsetWidth < MAX_W - 1) setLock(el.offsetWidth); },
      };
    }
    const unlock = () => setLock(0);
    useEffect(() => { window.addEventListener('blur', unlock); return () => window.removeEventListener('blur', unlock); }, []);
    const count = useRef(tabs.length);
    useEffect(() => { if (tabs.length > count.current) unlock(); count.current = tabs.length; }, [tabs.length]);

    const fades = () => {
      const sc = scRef.current;
      if (!sc) return;
      const v = (sc.scrollLeft > 2 ? 'l' : '') + (sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2 ? 'r' : '');
      if (sc.dataset.fade !== v) sc.dataset.fade = v;
    };

    useLayoutEffect(() => {
      const d = drag.current;
      playFlip(scRef.current, snap.current, d && d.started ? d.id : null, ctx.current.dropped);
      if (snap.current) ctx.current.dropped = null;
      snap.current = null;
      if (tabs.length) known.current = new Set(tabs.map((t) => t.id));
      if (d && d.started) ch.drag.follow(ctx.current, false);
      fades();
    });

    // Etkin sekme her zaman görünür kalsın (açılış animasyonu bitince ve şerit boyu değişince bir kez daha bakılır).
    const reveal = (smooth) => {
      const sc = scRef.current, el = sc && sc.querySelector(`.ch-tab[data-tab-id="${store.get('activeTabId')}"]`);
      if (!el || !el.isConnected || (drag.current && drag.current.started)) return;
      const w = el._chW || el.offsetWidth, l = el.offsetLeft, pad = 32;
      let x = null;
      if (l - pad < sc.scrollLeft) x = l - pad;
      else if (l + w + pad > sc.scrollLeft + sc.clientWidth) x = l + w + pad - sc.clientWidth;
      if (x != null) sc.scrollTo({ left: Math.max(0, x), behavior: smooth && !Vox.motion.reduced() ? 'smooth' : 'instant' });
    };
    useLayoutEffect(() => {
      reveal(true);
      const t = setTimeout(() => { reveal(true); fades(); }, 300);
      return () => clearTimeout(t);
    }, [activeId, tabs.length]);

    useEffect(() => {
      const sc = scRef.current;
      if (!sc || !window.ResizeObserver) return undefined;
      const ro = new ResizeObserver(() => { reveal(false); fades(); });
      ro.observe(sc);
      return () => ro.disconnect();
    }, []);

    const onWheel = (e) => {
      const sc = scRef.current;
      if (!sc || sc.scrollWidth <= sc.clientWidth + 1 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      sc.scrollLeft += e.deltaY;
      ch.preview.hide();
    };

    const onKeyDown = (e) => {
      const chip = e.target.closest('.ch-chip');
      const menuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
      if (chip && menuKey) { e.preventDefault(); Vox.tabGroups.menu(chip.dataset.groupId, chip, true); return; }
      const el = e.target.closest('.ch-tab');
      if (!el || e.target !== el) return;
      const all = Array.from(scRef.current.querySelectorAll('.ch-tab:not(.is-exiting):not(.is-collapsed)'));
      const i = all.indexOf(el);
      const id = el.dataset.tabId;
      const go = (n) => n && n.focus();
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); go(all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length]); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); go(e.key === 'Home' ? all[0] : all[all.length - 1]); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Vox.tabs.activate(id); }
      else if (e.key === 'Delete') { e.preventDefault(); const n = all[i + 1] || all[i - 1]; Vox.tabs.close(id); go(n); }
      else if (menuKey) {
        e.preventDefault();
        const t = Vox.tabs.get(id);
        if (t) Vox.ui.menu({ anchor: el, placement: 'bottom-start', keyboard: true, items: ch.tabMenu(t) });
      }
    };
    // Sekme listesinin boşlukları sürükleme alanı değildir (tekerlek ve sağ tık burada çalışır); çift tık yine büyütür.
    const empty = (e) => !e.target.closest('.ch-tab, .ch-chip, button');
    const onDbl = (e) => { if (empty(e)) Vox.commands.run('window.maximize'); };
    const onCtx = (e) => { if (!e.defaultPrevented && empty(e)) Vox.ui.contextMenu(e, ch.stripMenu()); };

    const gmap = new Map(groups.map((g) => [g.id, g]));
    const counts = {};
    tabs.forEach((t) => { if (t.groupId && !t.pinned) counts[t.groupId] = (counts[t.groupId] || 0) + 1; });
    const kids = [];
    const chips = new Set();
    list.forEach((entry, i) => {
      const t = entry.tab;
      const g = !entry.exiting && !t.pinned && t.groupId ? gmap.get(t.groupId) || null : null;
      if (g && !chips.has(g.id)) { chips.add(g.id); kids.push(html`<${GroupChip} key=${`g:${g.id}`} group=${g} count=${counts[g.id] || 0}/>`); }
      let end = false;
      if (g) { const nx = list.slice(i + 1).find((x) => !x.exiting); end = !nx || nx.tab.pinned || nx.tab.groupId !== g.id; }
      kids.push(html`<${Tab} key=${t.id} tab=${t} active=${!entry.exiting && t.id === activeId} group=${g} groupEnd=${end}
        collapsed=${!!(g && g.collapsed)} isNew=${!!(known.current && !known.current.has(t.id))} exiting=${entry.exiting}
        onExited=${onExited} dragging=${dragId === t.id} h=${h.current} previews=${previews}/>`);
    });

    return html`<div class=${cx('ch-strip drag', dragId && 'is-dragging', priv && 'is-private', max && 'is-max')}>
      <div class=${cx('ch-tabs no-drag', lock && 'is-locked')} style=${lock ? `--ch-lockw:${lock}px` : ''} ref=${scRef} role="tablist" aria-label="Sekmeler"
        onWheel=${onWheel} onScroll=${fades} onKeyDown=${onKeyDown} onDblClick=${onDbl} onContextMenu=${onCtx} onPointerLeave=${unlock}>${kids}</div>
      <${IconButton} icon="plus" label="Yeni sekme" cmd="tab.new" class="ch-newtab" onClick=${() => Vox.commands.run('tab.new')}/>
      <div class="ch-space"></div>
      ${priv ? html`<span class="ch-private no-drag" role="img" aria-label="Gizli pencere" data-tip="Gizli pencere: geçmiş kaydedilmez, çerezler pencereyle birlikte silinir">
        <${Icon} name="venetian-mask" size=${18}/></span>` : null}
      <${IconButton} icon="chevron-down" label="Sekmelerde ara" cmd="tab.search" size="sm" class="ch-search-btn"
        onClick=${(e) => Vox.commands.run('tab.search', { anchor: e.currentTarget })}/>
      ${full ? null : html`<${WindowControls} max=${max}/>`}
    </div>`;
  }

  Vox.c.TabStrip = TabStrip;
});
