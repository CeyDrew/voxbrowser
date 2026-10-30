/* VoxBrowser — vox://yer-imleri: klasör ağacı (aç/kapat, seç, üzerine bırak) + seçili klasörün listesi.
   Genel arama, araç çubuğu, satır menüsü, Ctrl/Shift çoklu seçim, sürükleyip sıralama, tam klavye kullanımı.
   Seçili klasör adrese yazılır (?id=…): yenileyince ve Geri ile aynı klasöre dönülür. */
Vox.define('pages.bookmarks', (Vox) => {
  const { html, useState, useMemo, useRef, useEffect } = Vox.p;
  const { Icon, Button, SearchField, EmptyState, MenuButton } = Vox.c;
  const { cx } = Vox.util;
  const pg = Vox.pg;
  const bm = pg.bm;
  const B = Vox.bookmarks;

  function flatTree(tree, expanded) {
    const out = [];
    const visit = (n, depth) => {
      const kids = (n.children || []).filter((c) => c.type === 'folder');
      out.push({ node: n, depth, hasKids: kids.length > 0, count: (n.children || []).length });
      if (expanded.has(n.id)) kids.forEach((k) => visit(k, depth + 1));
    };
    ((tree && tree.children) || []).forEach((c) => c.type === 'folder' && visit(c, 0));
    return out;
  }
  const folderFromQuery = (query) => (query && query.id && B.get(query.id) && B.get(query.id).type === 'folder' ? query.id : 'bar');

  function BookmarksPage({ query }) {
    const tree = Vox.useStore('bookmarks');
    Vox.useStore('history');
    const start = folderFromQuery(query);
    const [folderId, setFolderId] = useState(start);
    const [expanded, setExpanded] = useState(() => new Set(['bar', 'other', ...bm.pathTo(start).map((p) => p.id), start]));
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(() => new Set());
    const [focusId, setFocusId] = useState(null);
    const [treeFocus, setTreeFocus] = useState(start);
    const [drop, setDrop] = useState(null);
    const [dragIds, setDragIds] = useState(null);
    const anchor = useRef(null);
    const dragRef = useRef(null);
    const dropRef = useRef(null);
    const expandTimer = useRef({ id: null, t: 0 });
    const listRef = useRef();
    const treeRef = useRef();
    const searching = !!q.trim();
    const folder = B.get(folderId) || B.get('bar') || { id: 'bar', title: 'Yer imleri çubuğu', children: [] };

    useEffect(() => { if (!B.get(folderId)) setFolderId('bar'); }, [tree]);
    /* Geri/İleri ile adres değişince klasörü izle */
    useEffect(() => { const id = folderFromQuery(query); if (id !== folderId) selectFolder(id, false, true); }, [query && query.id]);
    const items = useMemo(() => {
      if (!searching) return (folder && folder.children) || [];
      const out = [];
      B.walk((n) => { if (!bm.ROOTS.has(n.id) && pg.match(q, n.title, n.url || '')) out.push(n); return true; });
      return out;
    }, [tree, folderId, q]);
    const ids = items.map((n) => n.id);
    pg.useAutoFlip(listRef, ids.join('|'));
    useEffect(() => {
      setSel((s) => { if (!s.size) return s; const n = new Set([...s].filter((id) => ids.includes(id))); return n.size === s.size ? s : n; });
    }, [items]);
    const flat = useMemo(() => flatTree(tree, expanded), [tree, expanded]);

    /* ── Klasör seçimi ── */
    function selectFolder(id, focusTree, fromRoute) {
      setFolderId(id); setTreeFocus(id); setSel(new Set()); setQ(''); setFocusId(null);
      setExpanded((s) => new Set([...s, ...bm.pathTo(id).map((p) => p.id)]));
      if (!fromRoute) Vox.tabs.update(null, { url: id === 'bar' ? 'vox://yer-imleri/' : `vox://yer-imleri/?id=${encodeURIComponent(id)}` });
      if (focusTree) requestAnimationFrame(() => { const el = treeRef.current && treeRef.current.querySelector(`[data-tree-id="${id}"]`); if (el) el.focus(); });
    }
    const toggleExpand = (id, on) => setExpanded((s) => { const n = new Set(s); if (on === true || (on === undefined && !n.has(id))) n.add(id); else n.delete(id); return n; });
    const onTreeKey = (e) => {
      const id = document.activeElement && document.activeElement.dataset.treeId;
      const i = flat.findIndex((x) => x.node.id === id);
      if (i < 0) return;
      const cur = flat[i];
      const go = (x) => { if (x) { e.preventDefault(); selectFolder(x.node.id, true); } };
      if (e.key === 'ArrowDown') go(flat[i + 1]);
      else if (e.key === 'ArrowUp') go(flat[i - 1]);
      else if (e.key === 'Home') go(flat[0]);
      else if (e.key === 'End') go(flat[flat.length - 1]);
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (cur.hasKids && !expanded.has(id)) toggleExpand(id, true); else if (cur.hasKids) go(flat[i + 1]); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (cur.hasKids && expanded.has(id)) toggleExpand(id, false); else { const p = B.parentOf(id); if (p && p.id !== 'root') selectFolder(p.id, true); } }
      else if (e.key === 'Enter') { e.preventDefault(); const first = listRef.current && listRef.current.querySelector('.pg-bm-row'); if (first) first.focus(); }
    };

    /* ── Seçim ── */
    const selected = () => ids.filter((id) => sel.has(id));
    const rangeTo = (id, keep) => setSel((cur) => {
      const a = ids.indexOf(anchor.current), b = ids.indexOf(id);
      if (a < 0 || b < 0) { anchor.current = id; return new Set([id]); }
      const n = keep ? new Set(cur) : new Set();
      ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => n.add(x));
      return n;
    });
    const toggleOne = (id) => {
      setSel((cur) => { const s = new Set(cur); if (s.has(id)) s.delete(id); else s.add(id); return s; });
      anchor.current = id;
    };
    const onRowClick = (e, n) => {
      if (e.target.closest('button')) return;
      if (e.shiftKey && anchor.current) rangeTo(n.id, e.ctrlKey || e.metaKey);
      else if (e.ctrlKey || e.metaKey) toggleOne(n.id);
      else { setSel(new Set([n.id])); anchor.current = n.id; }
    };
    const openNode = (n, newTab) => {
      if (n.type === 'folder') { selectFolder(n.id); return; }
      if (newTab) Vox.tabs.open(n.url, { active: false }); else Vox.nav.go(n.url);
    };
    const focusRow = (id) => requestAnimationFrame(() => {
      const el = listRef.current && listRef.current.querySelector(`[data-flip-key="${id}"]`);
      if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
    });
    const nudge = (dir) => {
      const s = selected();
      if (!s.length || searching) return;
      const first = ids.indexOf(s[0]), last = ids.indexOf(s[s.length - 1]);
      const before = dir < 0 ? ids[first - 1] : ids[last + 2] || null;
      if (dir < 0 && first === 0) return;
      if (dir > 0 && last === ids.length - 1) return;
      bm.reorder(folder.id, s, before);
      focusRow(focusId || s[0]);
    };
    const removeSel = (n) => {
      const s = sel.has(n.id) ? selected() : [n.id];
      pg.collapseOut(s.map((id) => listRef.current && listRef.current.querySelector(`[data-flip-key="${id}"]`))).then(() => { bm.removeMany(s); setSel(new Set()); });
    };
    const onRowKey = (e, n) => {
      const i = ids.indexOf(n.id);
      const step = (j) => {
        const t = items[Math.max(0, Math.min(items.length - 1, j))];
        if (!t) return;
        if (e.shiftKey) rangeTo(t.id); else { setSel(new Set([t.id])); anchor.current = t.id; }
        setFocusId(t.id); focusRow(t.id);
      };
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && mod && e.shiftKey) { e.preventDefault(); nudge(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(i + (e.key === 'ArrowDown' ? 1 : -1)); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); step(e.key === 'Home' ? 0 : items.length - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); openNode(n, mod); }
      else if (e.key === ' ') { e.preventDefault(); toggleOne(n.id); }
      else if (e.key === 'Delete') { e.preventDefault(); removeSel(n); }
      else if (e.key === 'F2') { e.preventDefault(); bm.editNode(n); }
      else if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); setSel(new Set(ids)); }
      else if (mod && (e.key === 'c' || e.key === 'C') && n.url) { e.preventDefault(); pg.copyLink(n.url); }
      else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); Vox.ui.menu({ anchor: e.currentTarget, items: menuFor(n), keyboard: true }); }
      else if (e.key === 'Escape' && sel.size) { e.preventDefault(); setSel(new Set()); }
    };

    /* ── Menüler ── */
    const moveMenu = (list) => bm.folderOptions().map((f) => ({ label: f.label, hint: f.desc, icon: f.icon, disabled: list.some((id) => id === f.value || bm.isAncestor(id, f.value)), onSelect: () => bm.moveInto(list, f.value) }));
    function menuFor(n) {
      const multi = sel.has(n.id) && sel.size > 1 ? selected() : null;
      if (multi) {
        return [
          { header: `${multi.length} öğe seçildi` },
          { label: 'Tümünü yeni sekmelerde aç', icon: 'external-link', onSelect: () => bm.openAll(multi) },
          { label: 'Taşı', icon: 'folder-input', submenu: moveMenu(multi) },
          '-',
          { label: 'Sil', icon: 'trash-2', danger: true, kbd: 'Delete', onSelect: () => removeSel(n) },
        ];
      }
      if (n.type === 'folder') {
        return [
          { label: 'Klasörü aç', icon: 'folder-open', onSelect: () => selectFolder(n.id) },
          { label: 'Tümünü yeni sekmelerde aç', icon: 'external-link', onSelect: () => bm.openAll([n.id]) },
          '-',
          { label: 'Yeniden adlandır', icon: 'pencil', kbd: 'F2', onSelect: () => bm.editNode(n) },
          { label: 'Taşı', icon: 'folder-input', submenu: moveMenu([n.id]) },
          '-',
          { label: 'Sil', icon: 'trash-2', danger: true, kbd: 'Delete', onSelect: () => removeSel(n) },
        ];
      }
      return [
        { label: 'Yeni sekmede aç', icon: 'external-link', onSelect: () => openNode(n, true) },
        { label: 'Bu sekmede aç', icon: 'arrow-right', onSelect: () => openNode(n, false) },
        '-',
        { label: 'Düzenle', icon: 'pencil', kbd: 'F2', onSelect: () => bm.editNode(n) },
        { label: 'Bağlantıyı kopyala', icon: 'link', kbd: 'Ctrl+C', onSelect: () => pg.copyLink(n.url) },
        { label: 'Taşı', icon: 'folder-input', submenu: moveMenu([n.id]) },
        '-',
        { label: 'Sil', icon: 'trash-2', danger: true, kbd: 'Delete', onSelect: () => removeSel(n) },
      ];
    }
    const folderMenu = (f) => [
      { label: 'Tümünü yeni sekmelerde aç', icon: 'external-link', onSelect: () => bm.openAll([f.id]) },
      { label: 'Yeni klasör', icon: 'folder-plus', onSelect: () => addFolder(f.id) },
      { label: 'A–Z sırala', icon: 'arrow-down-a-z', onSelect: () => bm.sortFolder(f.id) },
      '-',
      { label: 'Yeniden adlandır', icon: 'pencil', disabled: bm.ROOTS.has(f.id), onSelect: () => bm.editNode(f) },
      { label: 'Sil', icon: 'trash-2', danger: true, disabled: bm.ROOTS.has(f.id), onSelect: () => { if (f.id === folderId) selectFolder((B.parentOf(f.id) || {}).id || 'bar'); bm.removeMany([f.id]); } },
    ];

    /* ── Ekleme ── */
    const addBookmark = async () => { const id = await bm.addNode('url', searching ? 'bar' : folder.id); if (id) { setQ(''); setSel(new Set([id])); setFocusId(id); focusRow(id); } };
    const addFolder = async (parentId) => {
      const id = await bm.addNode('folder', parentId || folder.id);
      if (id) { toggleExpand(parentId || folder.id, true); Vox.ui.toast({ icon: 'folder-plus', tone: 'success', text: 'Klasör oluşturuldu.' }); }
    };

    /* ── Sürükle-bırak ── */
    const setDropIf = (d) => {
      const c = dropRef.current;
      if ((c && d && c.id === d.id && c.pos === d.pos && c.tree === d.tree) || (!c && !d)) return;
      dropRef.current = d; setDrop(d);
    };
    const endDrag = () => { dragRef.current = null; dropRef.current = null; setDragIds(null); setDrop(null); };
    const onDragStart = (e, n) => {
      if (searching) { e.preventDefault(); return; }
      const list = sel.has(n.id) ? selected() : [n.id];
      if (!sel.has(n.id)) { setSel(new Set([n.id])); anchor.current = n.id; }
      dragRef.current = list;
      setDragIds(list);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', list.map((id) => { const x = B.get(id); return x.url || x.title; }).join('\n'));
      const ghost = document.createElement('div');
      ghost.className = 'pg-bm-ghost';
      ghost.textContent = list.length > 1 ? `${list.length} öğe` : n.title;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 18, 18);
      setTimeout(() => ghost.remove(), 0);
    };
    const onRowDragOver = (e, n) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.includes(n.id)) { setDropIf(null); return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = e.currentTarget.getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height;
      let pos = y < 0.5 ? 'before' : 'after';
      if (n.type === 'folder' && y > 0.25 && y < 0.75 && !d.some((id) => bm.isAncestor(id, n.id))) pos = 'into';
      setDropIf({ id: n.id, pos });
    };
    const onRowDrop = (e, n) => {
      e.preventDefault();
      const d = dragRef.current, t = dropRef.current;
      endDrag();
      if (!d || !t) return;
      if (t.pos === 'into') { bm.moveInto(d, n.id); return; }
      const rest = ids.filter((id) => !d.includes(id));
      bm.reorder(folder.id, d, t.pos === 'before' ? n.id : rest[rest.indexOf(n.id) + 1] || null);
    };
    const onTreeDragOver = (e, f) => {
      const d = dragRef.current;
      if (!d || d.some((id) => id === f.id || bm.isAncestor(id, f.id))) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropIf({ tree: f.id });
      const x = expandTimer.current;
      if (x.id !== f.id) { clearTimeout(x.t); x.id = f.id; x.t = setTimeout(() => toggleExpand(f.id, true), 700); }
    };
    const onTreeDrop = (e, f) => { e.preventDefault(); const d = dragRef.current; endDrag(); if (d) bm.moveInto(d, f.id); };

    const pathLabel = (n) => bm.pathTo(n.id).map((p) => p.title).join(' › ');
    const crumbs = folder ? [...bm.pathTo(folder.id), folder] : [];
    const selList = selected();
    const rovingId = focusId && ids.includes(focusId) ? focusId : ids[0];

    return html`<div class="pg-page pg-bm" onKeyDown=${pg.slashToSearch}>
      <div class="pg-wrap">
        <${pg.PageHeader} icon="book-marked" title="Yer imleri" sub="Sık kullandığınız sayfalar, klasör klasör"
          search=${html`<${SearchField} value=${q} onInput=${(v) => { setQ(v); setSel(new Set()); }} placeholder="Tüm yer imlerinde arayın"/>`}/>
        <div class="pg-bm-toolbar" role="toolbar" aria-label="Yer imi işlemleri">
          <${Button} variant="secondary" size="sm" icon="bookmark-plus" aria-label="Yeni yer imi" onClick=${addBookmark}>Yeni yer imi<//>
          <${Button} variant="ghost" size="sm" icon="folder-plus" aria-label="Yeni klasör" onClick=${() => addFolder()}>Yeni klasör<//>
          <${Button} variant="ghost" size="sm" icon="arrow-down-a-z" aria-label="A–Z sırala" disabled=${searching} onClick=${() => bm.sortFolder(folder.id)}>A–Z sırala<//>
          <span class="pg-bm-tsep" aria-hidden="true"></span>
          <${Button} variant="ghost" size="sm" icon="import" aria-label="İçe aktar" onClick=${bm.openImport}>İçe aktar<//>
          <${Button} variant="ghost" size="sm" icon="file-down" aria-label="Dışa aktar" onClick=${bm.exportAll}>Dışa aktar<//>
        </div>
        <div class="pg-bm-layout">
          <nav class="pg-card pg-bm-side" aria-label="Klasörler">
            <div class="pg-bm-tree" role="tree" aria-label="Klasörler" ref=${treeRef} onKeyDown=${onTreeKey}>
              ${flat.map(({ node: f, depth, hasKids, count }) => html`<div key=${f.id} role="treeitem" data-tree-id=${f.id} aria-level=${depth + 1}
                  aria-expanded=${hasKids ? String(expanded.has(f.id)) : undefined} aria-selected=${String(f.id === folder.id && !searching)}
                  tabindex=${f.id === treeFocus ? 0 : -1} style=${`--d:${depth}`}
                  class=${cx('pg-bm-tnode', f.id === folder.id && !searching && 'is-sel', drop && drop.tree === f.id && 'is-drop')}
                  onClick=${() => selectFolder(f.id)} onDragOver=${(e) => onTreeDragOver(e, f)} onDrop=${(e) => onTreeDrop(e, f)}
                  onDragLeave=${(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropIf(null); }}
                  onContextMenu=${(e) => { Vox.ui.contextMenu(e, folderMenu(f)); }}>
                <span class=${cx('pg-bm-twist', expanded.has(f.id) && 'is-open')} aria-hidden="true"
                  onClick=${(e) => { if (hasKids) { e.stopPropagation(); toggleExpand(f.id); } }}>${hasKids ? html`<${Icon} name="chevron-right" size=${16}/>` : null}</span>
                <${Icon} name=${f.id === 'bar' ? 'bookmark' : expanded.has(f.id) && hasKids ? 'folder-open' : 'folder'} size=${18} class="pg-bm-ficon"/>
                <span class="pg-bm-tlabel">${f.title}</span>
                <span class="pg-bm-tcount" aria-label=${`${count} öğe`}>${count}</span>
              </div>`)}
            </div>
            <p class="pg-bm-hint">İpucu: yer imlerini buradaki klasörlerin üzerine sürükleyip bırakın.</p>
          </nav>
          <section class="pg-card pg-bm-main" aria-label=${searching ? 'Arama sonuçları' : folder.title}>
            <header class="pg-bm-listhead">
              ${searching ? html`<h2 class="pg-bm-crumbs"><span>Arama sonuçları</span></h2><span class="pg-count">${items.length} sonuç</span>`
                : html`<h2 class="pg-bm-crumbs">${crumbs.map((c, i) => html`${i ? html`<${Icon} name="chevron-right" size=${14} class="pg-bm-crumb-sep"/>` : null}${i < crumbs.length - 1
                    ? html`<button type="button" class="pg-bm-crumb" onClick=${() => selectFolder(c.id)}>${c.title}</button>` : html`<span>${c.title}</span>`}`)}</h2>
                  <span class="pg-count">${items.length} öğe</span>`}
            </header>
            ${items.length ? html`<ul class=${cx('pg-bm-list', dragIds && 'is-dragging')} ref=${listRef} role="listbox" aria-multiselectable="true"
                aria-label=${searching ? 'Arama sonuçları' : `${folder.title} içindekiler`} onDragLeave=${(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropIf(null); }}>
                ${items.map((n, i) => {
                  const on = sel.has(n.id);
                  return html`<li key=${n.id} data-flip-key=${n.id} role="option" aria-selected=${String(on)} tabindex=${n.id === rovingId ? 0 : -1} style=${`--i:${i}`}
                    class=${cx('pg-bm-row pg-enter', on && 'is-sel', dragIds && dragIds.includes(n.id) && 'is-dragged', drop && drop.id === n.id && `is-drop-${drop.pos}`)}
                    draggable=${searching ? 'false' : 'true'} onDragStart=${(e) => onDragStart(e, n)} onDragOver=${(e) => onRowDragOver(e, n)} onDrop=${(e) => onRowDrop(e, n)} onDragEnd=${endDrag}
                    onClick=${(e) => onRowClick(e, n)} onDblClick=${() => openNode(n)} onKeyDown=${(e) => onRowKey(e, n)} onFocus=${() => setFocusId(n.id)}
                    onContextMenu=${(e) => { if (!on) { setSel(new Set([n.id])); anchor.current = n.id; } Vox.ui.contextMenu(e, menuFor(n)); }}>
                    ${searching ? null : html`<span class="pg-bm-grip" aria-hidden="true"><${Icon} name="grip-vertical" size=${16}/></span>`}
                    <span class=${cx('pg-bm-ic', n.type === 'folder' && 'is-folder')}>${n.type === 'folder' ? html`<${Icon} name="folder" size=${20}/>` : html`<${pg.SiteIcon} url=${n.url} src=${n.favicon} label=${n.title} size=${20}/>`}</span>
                    <span class="pg-bm-text">
                      <span class="pg-bm-title">${pg.highlight(n.title, q)}</span>
                      ${searching ? html`<span class="pg-bm-path"><${Icon} name="folder" size=${12}/>${pathLabel(n)}</span>` : null}
                    </span>
                    <span class="pg-bm-url">${n.type === 'folder' ? `${(n.children || []).length} öğe` : pg.highlight(pg.shortUrl(n.url), q)}</span>
                    <${MenuButton} icon="ellipsis-vertical" label=${`İşlemler: ${n.title}`} size="sm" class="pg-bm-more" tabindex="-1" items=${() => menuFor(n)}/>
                  </li>`;
                })}
              </ul>`
            : searching ? html`<${EmptyState} icon="search-x" title=${`"${q.trim()}" için sonuç yok`} text="Yer iminin adını ya da adresinin bir bölümünü deneyin."
                action=${html`<${Button} variant="secondary" onClick=${() => setQ('')}>Aramayı temizle<//>`}/>`
            : html`<${EmptyState} icon="folder-open" title="Bu klasör boş" text="Bir sayfayı adres çubuğundaki yıldızla kaydedin, buradan ekleyin ya da başka bir klasörden sürükleyin."
                action=${html`<${Button} variant="primary" icon="bookmark-plus" onClick=${addBookmark}>Yer imi ekle<//>`}/>`}
            <p class="pg-bm-keys" aria-hidden="true"><${Vox.c.Kbd} keys="Ctrl+tık"/> ekle · <${Vox.c.Kbd} keys="Shift+tık"/> aralık · <${Vox.c.Kbd} keys="Ctrl+Shift+↑"/> taşı · <${Vox.c.Kbd} keys="F2"/> düzenle</p>
          </section>
        </div>
      </div>
      <${pg.BulkBar} count=${selList.length > 1 ? selList.length : 0} onClear=${() => setSel(new Set())}>
        <${Button} variant="ghost" size="sm" icon="external-link" aria-label="Yeni sekmelerde aç" onClick=${() => bm.openAll(selList)}>Aç<//>
        <${Button} variant="ghost" size="sm" icon="folder-input" aria-label="Klasöre taşı" aria-haspopup="menu" onClick=${(e) => Vox.ui.menu({ anchor: e.currentTarget, placement: 'top-start', items: moveMenu(selList) })}>Taşı<//>
        <${Button} variant="danger" size="sm" icon="trash-2" onClick=${() => selList[0] && removeSel(B.get(selList[0]))}>Sil<//>
      <//>
    </div>`;
  }

  Vox.pages.register({ url: 'vox://yer-imleri', title: 'Yer imleri', icon: 'book-marked', component: BookmarksPage });
});
