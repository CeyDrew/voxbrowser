/* chrome · sekme grupları: renkler, Vox.tabGroups API'si (gruplar ana süreçte saklanır: Vox.tabs.setGroups,
   üyelik: Vox.tabs.update(id, {groupId})), grup menüsü (renk satırı), ad/renk diyaloğu ve şerit düzeni:
   boşalan grup silinir, sabitlenen sekme gruptan çıkar, sabitlenmişler başta durur, gruplu sekmeden açılan
   sekme gruba katılır, daraltılmış grupta etkin sekme varsa grup açılır. Grup üyeleri şeritte hep bitişiktir. */
Vox.define('chrome.groups', (Vox) => {
  const { html, useState } = Vox.p;
  const { Icon, TextField } = Vox.c;
  const { uid, cx } = Vox.util;
  const store = Vox.store;
  const ch = Vox.ch;

  const COLORS = [['honey', 'Bal'], ['green', 'Yeşil'], ['blue', 'Mavi'], ['red', 'Kırmızı'], ['purple', 'Mor'], ['gray', 'Gri']]
    .map(([id, label]) => ({ id, label }));
  const list = () => store.get('groups') || [];
  const get = (id) => list().find((g) => g.id === id) || null;
  const membersOf = (gid, tabs = Vox.tabs.all()) => tabs.filter((t) => t.groupId === gid && !t.pinned);
  const save = (groups) => Vox.tabs.setGroups(groups);
  const patch = (id, p) => save(list().map((g) => (g.id === id ? { ...g, ...p } : g)));
  const nextColor = () => {
    const used = new Set(list().map((g) => g.color));
    return (COLORS.find((c) => !used.has(c.id)) || COLORS[list().length % COLORS.length]).id;
  };
  let collapsedAt = { gid: null, at: 0 };

  /** Re-inserts tab `id` after the last member of `gid` (an empty group keeps the tab where it is). */
  function joinGroup(tabs, id, gid) {
    const i = tabs.findIndex((t) => t.id === id);
    if (i < 0) return tabs;
    const rest = tabs.filter((t) => t.id !== id);
    let at = -1;
    rest.forEach((t, k) => { if (t.groupId === gid && !t.pinned) at = k + 1; });
    if (at < 0) at = Math.max(Math.min(i, rest.length), rest.filter((t) => t.pinned).length);
    rest.splice(at, 0, { ...tabs[i], groupId: gid, pinned: false });
    return rest;
  }
  /** Takes tab `id` out of its group; it lands right after the group so the group stays in one piece. */
  function leaveGroup(tabs, id) {
    const i = tabs.findIndex((t) => t.id === id);
    if (i < 0 || !tabs[i].groupId) return tabs;
    const gid = tabs[i].groupId;
    const rest = tabs.filter((t) => t.id !== id);
    let at = i;
    rest.forEach((t, k) => { if (t.groupId === gid) at = Math.max(at, k + 1); });
    rest.splice(at, 0, { ...tabs[i], groupId: null });
    return rest;
  }

  const api = (Vox.tabGroups = {
    COLORS, list, get, members: membersOf,
    /** Creates a group from tab ids (they gather behind the first one). Returns the new group id. */
    create({ title = '', color, tabIds = [] } = {}) {
      const id = uid('g');
      save([...list(), { id, title, color: color || nextColor(), collapsed: false }]);
      let tabs = ch.view();
      tabIds.forEach((tid) => { tabs = joinGroup(tabs, tid, id); });
      ch.commit(tabs);
      return id;
    },
    rename: (id, title) => patch(id, { title }),
    setColor: (id, color) => patch(id, { color }),
    addTab(tabId, gid) {
      const g = get(gid);
      if (!g) return;
      ch.commit(joinGroup(ch.view(), tabId, gid));
      if (g.collapsed && tabId === store.get('activeTabId')) patch(gid, { collapsed: false });
    },
    removeTab: (tabId) => ch.commit(leaveGroup(ch.view(), tabId)),
    /** Puts the tab into a brand-new group, then asks for a name and colour. */
    newGroupWith(tabId) {
      const id = api.create({ tabIds: [tabId] });
      setTimeout(() => editDialog(id, true), 240);
      return id;
    },
    newTab(gid) {
      const tabs = Vox.tabs.all();
      let at = tabs.length;
      tabs.forEach((t, i) => { if (t.groupId === gid && !t.pinned) at = i + 1; });
      if ((get(gid) || {}).collapsed) patch(gid, { collapsed: false });
      return Vox.tabs.open('vox://yeni-sekme', { index: at, groupId: gid });
    },
    ungroup(gid) {
      membersOf(gid).forEach((t) => Vox.tabs.update(t.id, { groupId: null }));
      save(list().filter((g) => g.id !== gid));
    },
    close(gid) {
      const g = get(gid);
      ch.closeTabs(membersOf(gid).map((t) => t.id), `“${(g && g.title) || 'Adsız grup'}” grubu kapatıldı.`);
    },
    /** Collapse / expand. Collapsing the group of the active tab first moves to the nearest visible tab. */
    toggle(gid, force) {
      const g = get(gid);
      if (!g) return;
      const collapsed = force === undefined ? !g.collapsed : !!force;
      if (collapsed === !!g.collapsed) return;
      const act = Vox.tabs.active();
      if (collapsed && act && act.groupId === gid && !act.pinned) {
        const tabs = Vox.tabs.all();
        const i = tabs.indexOf(act);
        const ok = (t) => t.groupId !== gid && !(t.groupId && !t.pinned && (get(t.groupId) || {}).collapsed);
        const alt = tabs.slice(i + 1).find(ok) || tabs.slice(0, i).reverse().find(ok);
        if (alt) Vox.tabs.activate(alt.id); else Vox.tabs.open('vox://yeni-sekme');
      }
      if (collapsed) collapsedAt = { gid, at: Date.now() };
      patch(gid, { collapsed });
    },
    edit: (gid) => editDialog(gid),
    menu: (gid, anchor, keyboard) => groupMenu(gid, anchor, keyboard),
  });
  ch.joinGroup = joinGroup;

  /* ── Şerit düzeni (her sekme durumu değişiminden sonra, bir mikro görevde) ── */
  let queued = false, base = null;
  const fixing = new Map(); // tabId → zaman (aynı düzeltme iki kez gönderilmesin)
  store.subscribe((s, p) => {
    if (s.tabs === p.tabs && s.activeTabId === p.activeTabId && s.groups === p.groups) return;
    if (!queued) { queued = true; base = p; queueMicrotask(() => { queued = false; const prev = base; base = null; tidy(prev, store.get()); }); }
  });
  const fresh = (id) => { const t = fixing.get(id); return t && Date.now() - t < 1200; };
  function tidy(prev, s) {
    const tabs = s.tabs || [];
    const groups = s.groups || [];
    if (!tabs.length || ch.dragging) return;
    const gids = new Set(groups.map((g) => g.id));
    // 1) Sabitlenmiş sekme grupta duramaz.
    tabs.forEach((t) => {
      if (t.pinned && t.groupId && !fresh(t.id)) { fixing.set(t.id, Date.now()); Vox.tabs.update(t.id, { groupId: null }); }
    });
    // 2) Sabitlenmişler başta; 3) gruplu sekmeden (ya da grubun ortasına) açılan sekme gruba katılır.
    if (!ch.plan.get()) {
      let next = null;
      const firstFree = tabs.findIndex((t) => !t.pinned);
      if (firstFree >= 0 && tabs.slice(firstFree).some((t) => t.pinned)) next = [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
      const had = new Set((prev.tabs || []).map((t) => t.id));
      if (had.size) {
        (next || tabs).forEach((t, i, arr) => {
          if (had.has(t.id) || t.pinned || t.groupId || fresh(t.id)) return;
          const L = arr[i - 1], R = arr[i + 1];
          const inG = (x, gid) => x && !x.pinned && x.groupId === gid && gids.has(gid);
          const opener = t.openerId && tabs.find((x) => x.id === t.openerId);
          let gid = null;
          if (L && L.groupId && inG(R, L.groupId) && inG(L, L.groupId)) gid = L.groupId;
          else if (opener && opener.groupId && !opener.pinned && inG(L, opener.groupId)) gid = opener.groupId;
          if (gid) { fixing.set(t.id, Date.now()); Vox.tabs.update(t.id, { groupId: gid }); }
        });
      }
      if (next) ch.commit(next);
    }
    if (!groups.length) return;
    // 4) Üyesi kalmayan grup silinir; 5) daraltılmış gruptaki sekme etkinleşirse grup açılır.
    const live = (list2) => new Set((list2 || []).filter((t) => t.groupId && !t.pinned).map((t) => t.groupId));
    const before = live(prev.tabs), now = live(tabs);
    const dead = groups.filter((g) => before.has(g.id) && !now.has(g.id)).map((g) => g.id);
    const act = tabs.find((t) => t.id === s.activeTabId);
    const recent = collapsedAt.gid && Date.now() - collapsedAt.at < 900 ? collapsedAt.gid : null;
    const reveal = act && !act.pinned && act.groupId && act.groupId !== recent && groups.some((g) => g.id === act.groupId && g.collapsed) ? act.groupId : null;
    if (!dead.length && !reveal) return;
    save(groups.filter((g) => !dead.includes(g.id)).map((g) => (g.id === reveal ? { ...g, collapsed: false } : g)));
  }

  /* ── Renk satırı, grup menüsü, ad/renk diyaloğu ────────── */
  function ColorRow({ value, onPick, radio }) {
    return html`<div class="ch-colors" role=${radio ? 'radiogroup' : 'group'} aria-label="Grup rengi">
      ${COLORS.map((c) => html`<button type="button" key=${c.id} role=${radio ? 'radio' : 'menuitemradio'} aria-checked=${String(value === c.id)}
        aria-label=${c.label} data-tip=${c.label} class=${cx('ch-swatch', `ch-g-${c.id}`, value === c.id && 'is-on')} onClick=${() => onPick(c.id)}>
        <${Icon} name="check" size=${14} stroke=${3}/></button>`)}
    </div>`;
  }
  api.ColorRow = ColorRow;

  function GroupHead({ gid }) {
    const g = Vox.useStore((s) => (s.groups || []).find((x) => x.id === gid));
    const n = Vox.useStore((s) => s.tabs.filter((t) => t.groupId === gid && !t.pinned).length);
    if (!g) return null;
    return html`<div class="ch-gm-head">
      <div class="ch-gm-name"><span class=${cx('ch-gdot', `ch-g-${g.color}`)}></span><b>${g.title || 'Adsız grup'}</b><small>${n} sekme</small></div>
      <${ColorRow} value=${g.color} onPick=${(c) => patch(gid, { color: c })}/>
    </div>`;
  }

  function groupMenu(gid, anchor, keyboard) {
    const g = get(gid);
    if (!g) return;
    if (ch.preview) ch.preview.hide();
    Vox.ui.menu({
      anchor, placement: 'bottom-start', minWidth: 256, keyboard, label: 'Grup menüsü',
      items: [
        { render: () => html`<${GroupHead} gid=${gid}/>` },
        '-',
        { label: 'Gruba yeni sekme ekle', icon: 'plus', onSelect: () => api.newTab(gid) },
        { label: 'Adı ve rengi düzenle…', icon: 'pencil', onSelect: () => editDialog(gid) },
        { label: g.collapsed ? 'Grubu genişlet' : 'Grubu daralt', icon: g.collapsed ? 'chevrons-left-right' : 'chevrons-right-left', onSelect: () => api.toggle(gid) },
        '-',
        { label: 'Grubu çöz', icon: 'ungroup', hint: 'Sekmeler açık kalır', onSelect: () => api.ungroup(gid) },
        { label: 'Grubu kapat', icon: 'circle-x', danger: true, onSelect: () => api.close(gid) },
      ],
    });
  }

  function GroupForm({ draft, submit }) {
    const [color, setColor] = useState(draft.color);
    return html`<form class="ch-form" onSubmit=${(e) => { e.preventDefault(); submit(); }} onKeyDown=${ch.enterSubmits(submit)}>
      <${TextField} label="Grup adı" value=${draft.title} placeholder="Örneğin: Tatil planı" maxLength=${40} autocomplete="off" data-autofocus
        onInput=${(e) => { draft.title = e.currentTarget.value; }} onFocus=${(e) => e.currentTarget.select()}/>
      <div class="ch-form-row"><span class="tf-label">Renk</span>
        <${ColorRow} radio=${true} value=${color} onPick=${(c) => { draft.color = c; setColor(c); }}/></div>
    </form>`;
  }

  function editDialog(gid, fresh) {
    const g = get(gid);
    if (!g) return;
    const draft = { title: g.title || '', color: g.color };
    Vox.ui.dialog({
      title: fresh ? 'Yeni sekme grubu' : 'Grubu düzenle', icon: 'tag', width: 420,
      render: ({ close }) => html`<${GroupForm} draft=${draft} submit=${() => close('save')}/>`,
      actions: [{ label: 'Vazgeç', value: 'cancel' }, { label: 'Kaydet', variant: 'primary', value: 'save' }],
    }).then((v) => { if (v === 'save' && get(gid)) patch(gid, { title: draft.title.trim(), color: draft.color }); });
  }

  Vox.commands.register('tab.newGroup', {
    title: 'Sekmeyi yeni gruba ekle', icon: 'group',
    run: (a = {}) => { const id = a.tabId || store.get('activeTabId'); if (id) api.newGroupWith(id); },
  });
});
