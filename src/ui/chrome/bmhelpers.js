/* chrome · yer imi yardımcıları (Vox.ch.bm): site simgesi (kayıtlı simge → geçmişteki simge → harf), açma biçimleri,
   klasör menüleri, sağ tık menüleri, düzenleme / yeni klasör diyalogları, geri alınabilir silme. */
Vox.define('chrome.bmhelpers', (Vox) => {
  const { html, useState } = Vox.p;
  const { Favicon, TextField, Select } = Vox.c;
  const store = Vox.store;
  const B = Vox.bookmarks;
  const ch = Vox.ch;
  const bm = (ch.bm = {});

  /* Yer iminde simge yoksa aynı adresin (ya da sitenin) geçmişteki simgesi kullanılır. */
  let hsrc = null, byUrl = null, byOrigin = null;
  function historyIcon(url) {
    const h = store.get('history') || [];
    if (h !== hsrc) {
      hsrc = h;
      byUrl = new Map();
      byOrigin = new Map();
      for (const e of h) {
        if (!e.favicon) continue;
        if (!byUrl.has(e.url)) byUrl.set(e.url, e.favicon);
        const o = Vox.url.parse(e.url).origin;
        if (o && !byOrigin.has(o)) byOrigin.set(o, e.favicon);
      }
    }
    return byUrl.get(url) || byOrigin.get(Vox.url.parse(url).origin) || null;
  }
  bm.favicon = (node) => ch.faviconFor(node.url, node.favicon || historyIcon(node.url));
  bm.Icon = ({ node, size = 16 }) => html`<${Favicon} spec=${bm.favicon(node)} size=${size}/>`;

  const webUrl = (url) => !/^vox:/i.test(String(url || ''));
  /** how: 'current' | 'new' (foreground tab) | 'background' | 'window' | 'private' (new window with that page) */
  bm.open = (url, how = 'current') => {
    if (how === 'background') return Vox.tabs.open(url, { active: false, opener: store.get('activeTabId') });
    if (how === 'new') return Vox.tabs.open(url);
    if ((how === 'window' || how === 'private') && webUrl(url)) return Vox.native.invoke('window:new', { private: how === 'private', url });
    const t = Vox.tabs.active();
    return t ? Vox.nav.go(url, { tabId: t.id }) : Vox.tabs.open(url);
  };
  const urlsIn = (folder) => (folder.children || []).filter((n) => n.type === 'url').map((n) => n.url);
  bm.openAll = (folder, how = 'new') => {
    urlsIn(folder).forEach((u, i) => Vox.tabs.open(u, { active: how !== 'background' && i === 0 }));
  };

  /** Menu items for a folder's dropdown (sub-folders become submenus). */
  bm.menuItems = (folder) => {
    const kids = folder.children || [];
    if (!kids.length) return [{ label: 'Bu klasör boş', disabled: true }];
    const items = kids.map((n) => (n.type === 'folder'
      ? { label: n.title || 'Adsız klasör', icon: 'folder', submenu: bm.menuItems(n) }
      : { label: html`<span class="ch-bmi"><${bm.Icon} node=${n}/><span>${n.title || Vox.url.display(n.url)}</span></span>`, onSelect: () => bm.open(n.url) }));
    const n = urlsIn(folder).length;
    if (n > 1) items.push('-', { label: `Tümünü yeni sekmelerde aç (${n})`, icon: 'external-link', onSelect: () => bm.openAll(folder) });
    return items;
  };

  /** Puts a removed node back exactly where it was. */
  bm.restore = (node, parentId, index) => B.insert(node, parentId, index);
  bm.remove = (node) => {
    const parent = B.parentOf(node.id);
    if (!parent) return;
    const index = (parent.children || []).findIndex((c) => c.id === node.id);
    B.remove(node.id);
    Vox.ui.toast({
      icon: 'trash-2', duration: 6500,
      text: node.type === 'folder' ? `“${node.title}” klasörü silindi.` : `“${node.title || Vox.url.display(node.url)}” silindi.`,
      action: { label: 'Geri al', onClick: () => bm.restore(node, parent.id, index) },
    });
  };

  bm.addCurrent = (parentId = 'bar', index) => {
    const t = Vox.tabs.active();
    if (!t || B.isBookmarked(t.url)) return;
    B.add({ title: t.title, url: t.url, parentId, index, favicon: t.faviconUrl || undefined });
  };

  /* ── Diyaloglar ───────────────────────────────────────── */
  /** True when folder `id` sits somewhere below `ancestorId` (a folder can't move into itself). */
  const isInside = (id, ancestorId) => {
    const anc = B.get(ancestorId);
    const has = (x) => x.id === id || (x.children || []).some(has);
    return !!anc && (anc.children || []).some(has);
  };
  function EditForm({ draft, submit }) {
    const [, redraw] = useState(0);
    draft.redraw = () => redraw((x) => x + 1);
    const folders = B.folders().filter((f) => f.id !== draft.id && !isInside(f.id, draft.id));
    return html`<form class="ch-form" onSubmit=${(e) => { e.preventDefault(); submit(); }} onKeyDown=${ch.enterSubmits(submit)}>
      <${TextField} label="Ad" value=${draft.title} autocomplete="off" maxLength=${120} data-autofocus
        onInput=${(e) => { draft.title = e.currentTarget.value; }} onFocus=${(e) => e.currentTarget.select()}/>
      ${draft.folder ? null : html`<${TextField} label="Adres (URL)" value=${draft.url} error=${draft.err} spellcheck="false" autocomplete="off"
        onInput=${(e) => { draft.url = e.currentTarget.value; if (draft.err) { draft.err = ''; redraw((x) => x + 1); } }}/>`}
      <div class="ch-form-row"><span class="tf-label">Klasör</span>
        <${Select} label="Klasör" value=${draft.parentId} onChange=${(v) => { draft.parentId = v; redraw((x) => x + 1); }}
          options=${folders.map((f) => ({ value: f.id, icon: 'folder', label: `${'   '.repeat(Math.max(0, f.depth))}${f.title}` }))}/></div>
    </form>`;
  }
  /** Address-bar style input → URL, without turning text into a web search (a bookmark needs an address). */
  const normalize = (text) => {
    const t = String(text || '').trim();
    if (!t) return { err: 'Bir adres yazın.' };
    if (/\s/.test(t)) return { err: 'Adreste boşluk olamaz.' };
    if (/^(https?|vox|file):\/\//i.test(t) || /^(data:|about:blank$)/i.test(t)) return { url: t };
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[^:/]+:\d+/.test(t)) return { err: 'Bu adres türü yer imi olarak açılamaz.' };
    if (/^localhost(:\d+)?([/?#].*)?$/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#].*)?$/.test(t)) return { url: `http://${t}` };
    if (/^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return { url: `https://${t}` };
    return { err: 'Bu geçerli bir adrese benzemiyor.' };
  };
  bm.editDialog = (node) => {
    const parent = B.parentOf(node.id);
    const folder = node.type === 'folder';
    const draft = { id: node.id, folder, title: node.title || '', url: node.url || '', parentId: parent ? parent.id : 'bar', err: '' };
    const save = () => {
      if (folder) return 'save';
      const r = normalize(draft.url);
      if (r.err) { draft.err = r.err; if (draft.redraw) draft.redraw(); return false; }
      draft.url = r.url;
      return 'save';
    };
    Vox.ui.dialog({
      title: folder ? 'Klasörü düzenle' : 'Yer imini düzenle', icon: folder ? 'folder-pen' : 'bookmark', width: 460,
      render: ({ close }) => html`<${EditForm} draft=${draft} submit=${() => { const v = save(); if (v) close(v); }}/>`,
      actions: [{ label: 'Vazgeç', value: 'cancel' }, { label: 'Kaydet', variant: 'primary', onClick: save }],
    }).then((v) => {
      if (v !== 'save' || !B.get(node.id)) return;
      const title = draft.title.trim() || (folder ? 'Adsız klasör' : Vox.url.display(draft.url));
      const p = B.parentOf(node.id);
      const changedUrl = !folder && draft.url !== node.url;
      B.update(node.id, folder ? { title } : { title, url: draft.url, ...(changedUrl ? { favicon: null } : {}) });
      if (p && p.id !== draft.parentId) B.move(node.id, draft.parentId);
    });
  };
  bm.folderDialog = (parentId = 'bar', index) => {
    const draft = { title: '' };
    Vox.ui.dialog({
      title: 'Yeni klasör', icon: 'folder-plus', width: 400,
      render: ({ close }) => html`<form class="ch-form" onSubmit=${(e) => { e.preventDefault(); close('save'); }} onKeyDown=${ch.enterSubmits(() => close('save'))}>
        <${TextField} label="Klasör adı" placeholder="Örneğin: Okunacaklar" maxLength=${60} autocomplete="off" data-autofocus
          onInput=${(e) => { draft.title = e.currentTarget.value; }}/></form>`,
      actions: [{ label: 'Vazgeç', value: 'cancel' }, { label: 'Oluştur', variant: 'primary', value: 'save' }],
    }).then((v) => { if (v === 'save') B.addFolder({ title: draft.title.trim() || 'Yeni klasör', parentId, index }); });
  };

  /* ── Sağ tık menüleri ─────────────────────────────────── */
  const barToggle = () => ({ label: 'Yer imleri çubuğunu göster', checked: Vox.settings.get('appearance.showBookmarksBar') !== false, kbd: Vox.keys.label('bookmarksBar.toggle'), onSelect: () => Vox.commands.run('bookmarksBar.toggle') });
  const manager = () => ({ label: 'Yer imi yöneticisi', icon: 'book-marked', kbd: Vox.keys.label('open.bookmarks'), onSelect: () => Vox.commands.run('open.bookmarks') });
  bm.itemMenu = (e, node) => {
    const parent = B.parentOf(node.id);
    const at = parent ? (parent.children || []).findIndex((c) => c.id === node.id) + 1 : undefined;
    const n = node.type === 'folder' ? urlsIn(node).length : 0;
    const items = node.type === 'folder' ? [
      { label: `Tümünü aç${n ? ` (${n})` : ''}`, icon: 'external-link', disabled: !n, onSelect: () => bm.openAll(node) },
      '-',
      { label: 'Yeniden adlandır…', icon: 'pencil', onSelect: () => bm.editDialog(node) },
      { label: 'Sil', icon: 'trash-2', danger: true, onSelect: () => bm.remove(node) },
    ] : [
      { label: 'Aç', icon: 'arrow-up-right', onSelect: () => bm.open(node.url) },
      { label: 'Yeni sekmede aç', icon: 'square-plus', onSelect: () => bm.open(node.url, 'background') },
      webUrl(node.url) && { label: 'Yeni pencerede aç', icon: 'app-window', onSelect: () => bm.open(node.url, 'window') },
      webUrl(node.url) && { label: 'Gizli pencerede aç', icon: 'venetian-mask', onSelect: () => bm.open(node.url, 'private') },
      '-',
      { label: 'Düzenle…', icon: 'pencil', onSelect: () => bm.editDialog(node) },
      { label: 'Bağlantıyı kopyala', icon: 'link', onSelect: () => Vox.native.invoke('clipboard:write', { text: node.url }).then(() => Vox.ui.toast({ icon: 'clipboard-check', text: 'Bağlantı kopyalandı.' }), () => Vox.ui.toast({ icon: 'info', text: 'Pano kullanılamıyor.' })) },
      { label: 'Sil', icon: 'trash-2', danger: true, onSelect: () => bm.remove(node) },
    ];
    Vox.ui.contextMenu(e, [...items, '-', { label: 'Yeni klasör…', icon: 'folder-plus', onSelect: () => bm.folderDialog(parent ? parent.id : 'bar', at) }, barToggle(), manager()]);
  };
  bm.barMenu = (e) => {
    const t = Vox.tabs.active();
    Vox.ui.contextMenu(e, [
      { label: 'Bu sayfayı ekle', icon: 'bookmark-plus', disabled: !t || B.isBookmarked(t.url), onSelect: () => bm.addCurrent() },
      { label: 'Yeni klasör…', icon: 'folder-plus', onSelect: () => bm.folderDialog('bar') },
      '-', barToggle(), manager(),
    ]);
  };
});
