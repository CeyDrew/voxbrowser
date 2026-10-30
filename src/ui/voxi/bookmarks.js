/* voxi — yan panel › Yer imleri: açılıp kapanan klasör ağacı (role="tree", ok tuşlarıyla gezinme), arama,
   sağ tık menüsü, geri alınabilir silme, gerçek site simgeleri. Ayrıca diğer panellerin kullandığı vx.Row satırı. */
Vox.define('voxi.bookmarks', (Vox) => {
  const { html, useState, useMemo, useEffect } = Vox.p;
  const { Icon, SearchField, Button, EmptyState } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const vx = Vox.vx;
  let openSet = new Set(['bar', 'other']); // panel kapanıp açılınca korunur

  vx.Row = ({ url, fav, title, sub, meta, onOpen, onCtx, current, children }) => html`<li class=${cx('vx-li', current && 'is-current')}>
    <button type="button" class="vx-li-main" title=${url} onClick=${onOpen} onAuxClick=${(e) => { if (e.button === 1) { e.preventDefault(); onOpen(e); } }}
      onMouseDown=${(e) => { if (e.button === 1) e.preventDefault(); }} onContextMenu=${onCtx}>
      <${vx.Fav} url=${url} fav=${fav} size=${18}/>
      <span class="vx-li-text"><span class="vx-li-title">${title || url}</span>${sub ? html`<span class="vx-li-sub">${sub}</span>` : null}</span>
      ${meta ? html`<span class="vx-li-meta">${meta}</span>` : null}
    </button>
    ${children ? html`<span class="vx-li-acts">${children}</span>` : null}
  </li>`;

  /** Search text handed over by a command ("Yer imlerinde X ara"), used once when it is fresh. */
  vx.usePanelQuery = (panel) => {
    const tok = Vox.useStore('ui.vx.query');
    const fresh = (t) => t && t.panel === panel && Date.now() - t.at < 3000;
    const [q, setQ] = useState(() => (fresh(tok) ? tok.q : ''));
    useEffect(() => { if (fresh(tok)) setQ(tok.q); }, [tok]);
    return [q, setQ];
  };
  /** Focuses the panel's search field when the panel was opened by a command or shortcut. */
  vx.useFocusOnOpen = (panel, id) => {
    const tok = Vox.useStore('ui.vx.focus');
    useEffect(() => { if (vx.wantsFocus(tok, panel)) { const el = document.getElementById(id); if (el) el.focus({ preventScroll: true }); } }, [tok]);
  };

  const urlsIn = (n) => { const out = []; const w = (x) => (x.type === 'url' ? out.push(x.url) : (x.children || []).forEach(w)); w(n); return out; };
  function remove(node) {
    const parent = Vox.bookmarks.parentOf(node.id);
    const pid = parent ? parent.id : 'other';
    const idx = Math.max(0, Vox.bookmarks.indexOf(node.id));
    Vox.bookmarks.remove(node.id);
    Vox.ui.toast({
      icon: 'bookmark-x', text: node.type === 'folder' ? `“${node.title}” klasörü silindi.` : `“${vx.clip(node.title, 50)}” silindi.`,
      action: { label: 'Geri al', onClick: () => Vox.bookmarks.insert(node, pid, idx) },
    });
  }
  const copied = (ok) => Vox.ui.toast(ok ? { icon: 'clipboard-check', text: 'Bağlantı kopyalandı.' } : { icon: 'clipboard-x', text: 'Bağlantı kopyalanamadı.' });
  const menuFor = (e, n) => Vox.ui.contextMenu(e, n.type === 'folder' ? [
    { label: `Tümünü yeni sekmelerde aç (${urlsIn(n).length})`, icon: 'layers', disabled: !urlsIn(n).length, onSelect: () => urlsIn(n).forEach((u, i) => Vox.tabs.open(u, { active: i === 0 })) },
    '-',
    { label: 'Klasörü sil', icon: 'trash-2', danger: true, disabled: n.id === 'bar' || n.id === 'other', onSelect: () => remove(n) },
  ] : [
    { label: 'Aç', icon: 'arrow-up-right', onSelect: () => vx.openFrom(n.url) },
    { label: 'Yeni sekmede aç', icon: 'plus', onSelect: () => Vox.tabs.open(n.url) },
    { label: 'Yeni pencerede aç', icon: 'app-window', onSelect: () => Vox.native.invoke('window:new', { private: false, url: n.url }) },
    { label: 'Bağlantıyı kopyala', icon: 'link', onSelect: () => vx.copy(n.url).then(copied) },
    '-',
    { label: 'Sil', icon: 'trash-2', danger: true, onSelect: () => remove(n) },
  ]);

  function Tree({ root, cur }) {
    const [, force] = useState(0);
    const [focusId, setFocusId] = useState(null);
    const toggle = (id, on) => {
      const next = new Set(openSet);
      if (on === false || (on === undefined && next.has(id))) next.delete(id); else next.add(id);
      openSet = next;
      force((x) => x + 1);
    };
    const kids = (root && root.children) || [];
    const tabStop = focusId || (kids[0] && kids[0].id);
    const items = (nodes, level) => nodes.map((n) => {
      const folder = n.type === 'folder';
      const open = folder && openSet.has(n.id);
      return html`<li role="treeitem" key=${n.id} data-id=${n.id} aria-level=${level} aria-expanded=${folder ? String(open) : undefined}
        aria-selected=${!folder && n.url === cur ? 'true' : undefined} tabindex=${n.id === tabStop ? 0 : -1}
        class=${cx('vx-ti', folder && 'is-folder', !folder && n.url === cur && 'is-current')}
        onContextMenu=${(e) => { e.stopPropagation(); menuFor(e, n); }}>
        <div class="vx-ti-row" style=${`--lv:${level - 1}`} title=${folder ? undefined : n.url}
          onClick=${(e) => { setFocusId(n.id); if (folder) toggle(n.id); else vx.openFrom(n.url, e); }}
          onMouseDown=${(e) => { if (e.button === 1) e.preventDefault(); }}
          onAuxClick=${(e) => { if (!folder && e.button === 1) vx.openFrom(n.url, e); }}>
          ${folder ? html`<${Icon} name="chevron-right" size=${16} class="vx-ti-chev"/>` : html`<span class="vx-ti-chev"></span>`}
          ${folder ? html`<${Icon} name=${open ? 'folder-open' : 'folder'} size=${18} class="vx-ti-folder"/>` : html`<${vx.Fav} url=${n.url} fav=${n.favicon} size=${16}/>`}
          <span class="vx-ti-title">${n.title || n.url}</span>
          ${folder ? html`<span class="vx-ti-count">${(n.children || []).length}</span>` : null}
        </div>
        ${open && n.children && n.children.length ? html`<ul role="group" class="vx-tg">${items(n.children, level + 1)}</ul>` : null}
      </li>`;
    });
    const onKeyDown = (e) => {
      const all = Array.from(e.currentTarget.querySelectorAll('[role="treeitem"]'));
      const el = document.activeElement && document.activeElement.closest('[role="treeitem"]');
      const i = all.indexOf(el);
      if (i < 0) return;
      const n = Vox.bookmarks.get(el.dataset.id);
      if (!n) return;
      const folder = n.type === 'folder', open = folder && openSet.has(n.id);
      const go = (t) => { if (t) { t.focus(); setFocusId(t.dataset.id); } };
      const keys = {
        ArrowDown: () => go(all[i + 1]), ArrowUp: () => go(all[i - 1]), Home: () => go(all[0]), End: () => go(all[all.length - 1]),
        ArrowRight: () => (folder && !open ? toggle(n.id, true) : open ? go(all[i + 1]) : null),
        ArrowLeft: () => (open ? toggle(n.id, false) : go(el.parentElement.closest('[role="treeitem"]'))),
        Enter: () => (folder ? toggle(n.id) : vx.openFrom(n.url, e)),
        ' ': () => (folder ? toggle(n.id) : vx.openFrom(n.url, e)),
        Delete: () => (n.id !== 'bar' && n.id !== 'other' ? remove(n) : null),
      };
      if (!keys[e.key]) return;
      e.preventDefault();
      keys[e.key]();
    };
    if (!urlsIn(root || {}).length && kids.every((k) => !(k.children || []).length)) {
      return html`<${EmptyState} icon="bookmark" title="Henüz yer imi yok" text="Sık gittiğiniz sayfaları aşağıdaki düğmeyle ya da Ctrl+D ile buraya ekleyin."/>`;
    }
    return html`<ul class="vx-tree" role="tree" aria-label="Yer imleri" onKeyDown=${onKeyDown}>${items(kids, 1)}</ul>`;
  }

  function Results({ q, cur }) {
    const tree = Vox.useStore('bookmarks');
    const list = useMemo(() => {
      const f = vx.fold(q);
      const out = [];
      const walk = (n, path) => (n.children || []).forEach((c) => {
        if (c.type === 'folder') walk(c, [...path, c.title]);
        else if (vx.fold(`${c.title} ${c.url}`).includes(f)) out.push({ ...c, path });
      });
      if (tree) walk(tree, []);
      return out;
    }, [tree, q]);
    if (!list.length) return html`<${EmptyState} icon="search-x" title="Sonuç yok" text=${`“${q}” ile eşleşen bir yer imi bulunamadı.`}/>`;
    return html`<ul class="vx-list" aria-label="Arama sonuçları">${list.map((b) => html`<${vx.Row} key=${b.id} url=${b.url} fav=${b.favicon} title=${b.title}
      sub=${b.path.join(' › ') || vx.hostOf(b.url)} current=${b.url === cur} onOpen=${(e) => vx.openFrom(b.url, e)} onCtx=${(e) => menuFor(e, b)}/>`)}</ul>`;
  }

  function BookmarksPanel() {
    const tree = Vox.useStore('bookmarks');
    const tab = Vox.useStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
    const [q, setQ] = vx.usePanelQuery('bookmarks');
    vx.useFocusOnOpen('bookmarks', 'vx-bm-q');
    const cur = tab ? tab.url : '';
    const marked = !!cur && Vox.bookmarks.isBookmarked(cur);
    const can = !!tab && !vx.isBlank(tab);
    const toggleCurrent = (e) => {
      if (!can) return;
      const node = Vox.bookmarks.findByUrl(tab.url);
      if (node) { remove(node); return; }
      vx.addBookmark(tab);
      const r = e.currentTarget.getBoundingClientRect();
      Vox.motion.burst(r.left + 22, r.top + r.height / 2);
      Vox.ui.toast({ icon: 'bookmark-check', text: 'Yer imleri çubuğuna eklendi.' });
    };
    return html`<div class="vx-pane">
      <div class="vx-pane-top"><${SearchField} id="vx-bm-q" value=${q} onInput=${setQ} placeholder="Yer imlerinde ara"/></div>
      <div class="vx-pane-body">${q.trim() ? html`<${Results} q=${q.trim()} cur=${cur}/>` : html`<${Tree} root=${tree} cur=${cur}/>`}</div>
      <div class="vx-pane-foot">
        <${Button} size="sm" variant=${marked ? 'soft' : 'secondary'} icon=${marked ? 'bookmark-minus' : 'bookmark-plus'} disabled=${!can} onClick=${toggleCurrent}>
          ${marked ? 'Yer iminden çıkar' : 'Bu sayfayı ekle'}<//>
        <span class="vx-pane-hint">${Vox.keys.label('bookmark.toggleCurrent') || 'Ctrl+D'}</span>
      </div>
    </div>`;
  }

  vx.BookmarksPanel = BookmarksPanel;
});
