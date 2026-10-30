/* chrome · sekme ve sekme şeridi sağ tık menüleri; sekmeyi klavyeyle taşıma (Ctrl+Shift+PageUp/PageDown);
   sabitleme, çoğaltma ve sekme gezintisi komutlarının şeride uygun hâlleri. */
Vox.define('chrome.tabmenu', (Vox) => {
  const { html } = Vox.p;
  const { cx } = Vox.util;
  const store = Vox.store;
  const ch = Vox.ch;
  const G = Vox.tabGroups;
  const kbd = (id) => Vox.keys.label(id);

  const groupOption = (g) => html`<span class="ch-gm-opt"><span class=${cx('ch-gdot', `ch-g-${g.color}`)}></span>${g.title || 'Adsız grup'}</span>`;

  /** Items for a tab's context menu (also used by keyboard: Shift+F10 / menu key on a focused tab). */
  ch.tabMenu = (tab) => {
    const tabs = Vox.tabs.all();
    const i = tabs.findIndex((t) => t.id === tab.id);
    const groups = (store.get('groups') || []).filter((g) => g.id !== tab.groupId);
    const others = tabs.filter((t) => t.id !== tab.id && !t.pinned).map((t) => t.id);
    const right = tabs.slice(i + 1).filter((t) => !t.pinned).map((t) => t.id);
    const closed = (store.get('closedTabs') || []).length;
    return [
      { label: 'Sağa yeni sekme', icon: 'plus', onSelect: () => Vox.tabs.open('vox://yeni-sekme', { index: i + 1, groupId: tab.pinned ? null : tab.groupId }) },
      '-',
      { label: 'Yeniden yükle', icon: 'rotate-cw', kbd: kbd('nav.reload'), onSelect: () => Vox.nav.reload(tab.id) },
      { label: 'Çoğalt', icon: 'copy-plus', onSelect: () => ch.duplicate(tab.id) },
      { label: tab.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle', icon: tab.pinned ? 'pin-off' : 'pin', onSelect: () => ch.togglePin(tab.id) },
      { label: tab.muted ? 'Sitenin sesini aç' : 'Sitenin sesini kapat', icon: tab.muted ? 'volume-2' : 'volume-x', onSelect: () => Vox.tabs.mute(tab.id) },
      '-',
      tab.pinned ? false : {
        label: 'Gruba ekle', icon: 'group',
        submenu: [
          { label: 'Yeni grup', icon: 'plus', onSelect: () => G.newGroupWith(tab.id) },
          ...(groups.length ? ['-'] : []),
          ...groups.map((g) => ({ label: groupOption(g), onSelect: () => G.addTab(tab.id, g.id) })),
        ],
      },
      tab.groupId && !tab.pinned ? { label: 'Gruptan çıkar', icon: 'ungroup', onSelect: () => G.removeTab(tab.id) } : false,
      tab.pinned ? false : '-',
      { label: 'Diğer sekmeleri kapat', icon: 'copy-x', disabled: !others.length, onSelect: () => ch.closeTabs(others) },
      { label: 'Sağdakileri kapat', icon: 'arrow-right-to-line', disabled: !right.length, onSelect: () => ch.closeTabs(right) },
      { command: 'tab.reopen', disabled: !closed },
      '-',
      { label: 'Kapat', icon: 'x', kbd: kbd('tab.close'), onSelect: () => Vox.tabs.close(tab.id) },
    ];
  };

  /** Items for a right-click on the empty part of the tab list. */
  ch.stripMenu = () => {
    const groups = store.get('groups') || [];
    const open = groups.filter((g) => !g.collapsed && G.members(g.id).length);
    return [
      { command: 'tab.new' },
      { command: 'tab.reopen', disabled: !(store.get('closedTabs') || []).length },
      '-',
      { command: 'tab.search' },
      { label: 'Tüm grupları daralt', icon: 'chevrons-right-left', disabled: !open.length, onSelect: () => open.forEach((g) => G.toggle(g.id, true)) },
      '-',
      { command: 'open.processes' },
    ];
  };

  /* Ctrl+Shift+PageUp/PageDown: etkin sekmeyi bir adım taşır; komşularına göre gruba girer ya da gruptan çıkar. */
  function moveActive(dir) {
    const tabs = ch.view();
    const t = tabs.find((x) => x.id === store.get('activeTabId'));
    if (!t) return;
    const zone = tabs.filter((x) => !!x.pinned === !!t.pinned);
    const target = zone[zone.indexOf(t) + dir];
    if (!target) return;
    const next = tabs.filter((x) => x.id !== t.id);
    // Daraltılmış grubun üzerinden tek adımda atlanır (sekme gruba girmez).
    if (!target.pinned && target.groupId && target.groupId !== t.groupId && (G.get(target.groupId) || {}).collapsed) {
      const members = next.filter((x) => x.groupId === target.groupId && !x.pinned);
      const edge = dir > 0 ? members[members.length - 1] : members[0];
      next.splice(next.indexOf(edge) + (dir > 0 ? 1 : 0), 0, t.groupId ? { ...t, groupId: null } : t);
      ch.commit(next);
      return;
    }
    const at = next.findIndex((x) => x.id === target.id) + (dir > 0 ? 1 : 0);
    const L = next[at - 1], R = next[at];
    let gid = null;
    if (!t.pinned) {
      if (L && R && L.groupId && L.groupId === R.groupId) gid = L.groupId;
      else if (t.groupId && ((L && L.groupId === t.groupId) || (R && R.groupId === t.groupId))) gid = t.groupId;
    }
    next.splice(at, 0, gid === (t.groupId || null) ? t : { ...t, groupId: gid });
    ch.commit(next);
  }
  const R = Vox.commands.register;
  R('tab.moveLeft', { title: 'Sekmeyi sola taşı', icon: 'arrow-left', run: () => moveActive(-1) });
  R('tab.moveRight', { title: 'Sekmeyi sağa taşı', icon: 'arrow-right', run: () => moveActive(1) });
  // Çekirdek komutların şeride uygun hâlleri: sabitlenmişler başta toplanır, çoğaltılan sekme grubunu korur,
  // Ctrl+Tab daraltılmış gruplardaki sekmeleri atlar.
  R('tab.pin', { title: 'Sekmeyi sabitle', icon: 'pin', run: (a = {}) => ch.togglePin(a.tabId || store.get('activeTabId')) });
  R('tab.duplicate', { title: 'Sekmeyi çoğalt', icon: 'copy', run: (a = {}) => ch.duplicate(a.tabId || store.get('activeTabId')) });
  const step = (dir) => {
    const tabs = Vox.tabs.all();
    const hidden = (t) => !t.pinned && t.groupId && (G.get(t.groupId) || {}).collapsed;
    const i = tabs.findIndex((t) => t.id === store.get('activeTabId'));
    for (let k = 1; k <= tabs.length; k++) {
      const t = tabs[(i + dir * k + tabs.length * k) % tabs.length];
      if (t && !hidden(t)) { Vox.tabs.activate(t.id); return; }
    }
  };
  R('tab.next', { title: 'Sonraki sekme', run: () => step(1) });
  R('tab.prev', { title: 'Önceki sekme', run: () => step(-1) });
  Vox.keys.bind('Ctrl+Shift+PageUp', 'tab.moveLeft');
  Vox.keys.bind('Ctrl+Shift+PageDown', 'tab.moveRight');
  Vox.keys.sync();
});
