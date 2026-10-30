/* VoxBrowser — yer imi yöneticisi işlemleri: ağaç yardımcıları, geri alınabilir silme/taşıma/sıralama,
   düzenle/yeni yer imi/yeni klasör diyalogları, HTML dosyasına dışa aktarma (gerçek dosya) ve içe aktarma ("yakında"). */
Vox.define('pages.bookmarksOps', (Vox) => {
  const { html, useState } = Vox.p;
  const { Icon, Button, TextField, Select } = Vox.c;
  const store = Vox.store;
  const pg = Vox.pg;
  const B = Vox.bookmarks;
  const ROOTS = new Set(['root', 'bar', 'other']);
  const coll = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });

  const mapTree = (node, fn) => {
    const n = fn(node);
    if (!n || !n.children) return n;
    const kids = n.children.map((c) => mapTree(c, fn)).filter(Boolean);
    return kids.length !== n.children.length || kids.some((k, i) => k !== n.children[i]) ? { ...n, children: kids } : n;
  };
  const setTree = (fn) => store.set('bookmarks', fn);
  const indexIn = (id) => { const p = B.parentOf(id); return p ? { parentId: p.id, index: B.indexOf(id) } : {}; };
  const isAncestor = (aId, id) => { for (let p = B.parentOf(id); p; p = B.parentOf(p.id)) if (p.id === aId) return true; return false; };
  /** Ancestor folders of id, outermost first (without the hidden root). */
  const pathTo = (id) => { const out = []; for (let p = B.parentOf(id); p && p.id !== 'root'; p = B.parentOf(p.id)) out.unshift(p); return out; };
  const topLevel = (ids) => ids.filter((id) => !ids.some((o) => o !== id && isAncestor(o, id)));
  const setChildren = (parentId, ids) => setTree((t) => mapTree(t, (n) => (n.id !== parentId ? n : {
    ...n, children: ids.map((id) => n.children.find((c) => c.id === id)).filter(Boolean).concat(n.children.filter((c) => !ids.includes(c.id))),
  })));
  const urlsIn = (node) => { const out = []; const rec = (n) => { if (n.type === 'url') out.push(n.url); (n.children || []).forEach(rec); }; rec(node); return out; };
  /** Web addresses, plus VoxBrowser pages and local files that may already be bookmarked. */
  const normalizeUrl = (s) => {
    const t = String(s || '').trim();
    if (/^vox:\/\/[a-z-]+/i.test(t) || /^file:\/\/\//i.test(t)) return t;
    return pg.normalizeUrl(t);
  };

  /* ── Geri alınabilir işlemler ─────────────────────────── */
  function removeMany(ids) {
    const list = topLevel(ids).filter((id) => !ROOTS.has(id)).map((id) => ({ node: B.get(id), ...indexIn(id) })).filter((x) => x.node);
    if (!list.length) return;
    list.forEach((x) => B.remove(x.node.id));
    const one = list.length === 1 ? list[0].node : null;
    pg.undoToast(one ? `"${one.title}" ${one.type === 'folder' ? 'klasörü' : 'yer imi'} silindi.` : `${list.length} öğe silindi.`,
      () => [...list].sort((a, b) => a.index - b.index).forEach((x) => B.insert(x.node, x.parentId, x.index)));
  }
  /** Reorders inside one folder: ids move (keeping their order) before beforeId (null = end). Returns an undo fn or null. */
  function reorder(parentId, ids, beforeId) {
    const parent = B.get(parentId);
    if (!parent) return null;
    const prev = parent.children.map((c) => c.id);
    const moving = prev.filter((id) => ids.includes(id));
    const rest = prev.filter((id) => !ids.includes(id));
    let at = beforeId ? rest.indexOf(beforeId) : rest.length;
    if (at < 0) at = rest.length;
    const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
    if (next.join('|') === prev.join('|')) return null;
    setChildren(parentId, next);
    return () => setChildren(parentId, prev);
  }
  function moveInto(ids, folderId) {
    const folder = B.get(folderId);
    if (!folder || folder.type !== 'folder') return;
    const list = topLevel(ids).filter((id) => id !== folderId && !ROOTS.has(id) && !isAncestor(id, folderId))
      .map((id) => ({ id, ...indexIn(id) })).filter((x) => x.parentId && x.parentId !== folderId);
    if (!list.length) return;
    list.forEach((x) => B.move(x.id, folderId));
    const first = B.get(list[0].id);
    pg.undoToast(list.length === 1 ? `"${first.title}", "${folder.title}" klasörüne taşındı.` : `${list.length} öğe "${folder.title}" klasörüne taşındı.`,
      () => [...list].sort((a, b) => a.index - b.index).forEach((x) => B.move(x.id, x.parentId, x.index)), 'folder-input');
  }
  function sortFolder(folderId) {
    const f = B.get(folderId);
    if (!f || !f.children || f.children.length < 2) { Vox.ui.toast({ icon: 'arrow-down-a-z', text: 'Sıralanacak öğe yok.' }); return; }
    const prev = f.children.map((c) => c.id);
    const next = [...f.children].sort((a, b) => (a.type === b.type ? coll.compare(a.title, b.title) : a.type === 'folder' ? -1 : 1)).map((c) => c.id);
    if (next.join('|') === prev.join('|')) { Vox.ui.toast({ icon: 'arrow-down-a-z', text: 'Bu klasör zaten A–Z sıralı.' }); return; }
    setChildren(folderId, next);
    pg.undoToast(`"${f.title}" A–Z sıralandı. Klasörler önce gelir.`, () => setChildren(folderId, prev), 'arrow-down-a-z');
  }
  async function openAll(ids) {
    const urls = [...new Set(topLevel(ids).flatMap((id) => urlsIn(B.get(id) || {})))];
    if (!urls.length) { Vox.ui.toast({ icon: 'info', text: 'Açılacak yer imi yok.' }); return; }
    if (urls.length > 6 && !(await Vox.ui.confirm({ title: `${urls.length} sekme açılsın mı?`, text: 'Seçtiğiniz yer imlerinin hepsi yeni sekmelerde açılacak.', confirmLabel: 'Tümünü aç' }))) return;
    urls.forEach((u) => Vox.tabs.open(u, { active: false }));
    Vox.ui.toast({ icon: 'external-link', text: `${urls.length} yer imi arka planda açıldı.` });
  }

  /* ── Diyaloglar ───────────────────────────────────────── */
  const folderOptions = (excludeId) => B.folders().filter((f) => !excludeId || (f.id !== excludeId && !isAncestor(excludeId, f.id)))
    .map((f) => ({ value: f.id, label: f.title, icon: f.id === 'bar' ? 'bookmark' : 'folder', desc: f.depth ? pathTo(f.id).map((p) => p.title).join(' › ') : undefined }));

  function EditForm({ node, kind, parentId: initialParent, close }) {
    const [title, setTitle] = useState(node ? node.title : kind === 'folder' ? 'Yeni klasör' : '');
    const [url, setUrl] = useState(node && node.url ? node.url : '');
    const [parentId, setParentId] = useState(initialParent || (node && (B.parentOf(node.id) || {}).id) || 'bar');
    const [err, setErr] = useState({});
    const locked = node && ROOTS.has(node.id);
    const submit = (e) => {
      e.preventDefault();
      const u = kind === 'url' ? normalizeUrl(url) : null;
      const errs = {};
      if (kind === 'url' && !u) errs.url = 'Geçerli bir adres girin, örneğin vikipedi.org';
      if (kind === 'folder' && !title.trim()) errs.title = 'Klasöre bir ad verin.';
      if (Object.keys(errs).length) { setErr(errs); return; }
      close({ title: title.trim() || pg.siteName(u), url: u, parentId });
    };
    return html`<form class="pg-form" onSubmit=${submit} noValidate>
      <${TextField} label="Ad" value=${title} error=${err.title} maxlength="200" data-autofocus="true" onInput=${(e) => { setTitle(e.currentTarget.value); setErr({}); }}/>
      ${kind === 'url' ? html`<${TextField} label="Adres" value=${url} error=${err.url} placeholder="https://" spellcheck="false" inputmode="url" autocomplete="off"
        onInput=${(e) => { setUrl(e.currentTarget.value); setErr({}); }}/>` : null}
      ${locked ? null : html`<div class="tf"><span class="tf-label">Klasör</span>
        <${Select} value=${parentId} label="Klasör" options=${folderOptions(node && node.type === 'folder' ? node.id : null)} onChange=${setParentId}/></div>`}
      <div class="dialog-actions">
        <${Button} variant="secondary" onClick=${() => close()}>Vazgeç<//>
        <${Button} variant="primary" type="submit">${node ? 'Kaydet' : 'Ekle'}<//>
      </div>
    </form>`;
  }
  const openEdit = ({ node, kind, parentId }) => Vox.ui.dialog({
    title: node ? (kind === 'folder' ? 'Klasörü yeniden adlandır' : 'Yer imini düzenle') : kind === 'folder' ? 'Yeni klasör' : 'Yeni yer imi',
    icon: kind === 'folder' ? (node ? 'pencil' : 'folder-plus') : node ? 'pencil' : 'bookmark-plus', width: 460, actions: [],
    render: ({ close }) => html`<${EditForm} node=${node} kind=${kind} parentId=${parentId} close=${close}/>`,
  });
  async function editNode(node) {
    const v = await openEdit({ node, kind: node.type });
    if (!v) return;
    B.update(node.id, node.type === 'url' ? { title: v.title, url: v.url } : { title: v.title });
    const cur = B.parentOf(node.id);
    if (cur && v.parentId && v.parentId !== cur.id && !ROOTS.has(node.id)) B.move(node.id, v.parentId);
    Vox.ui.toast({ icon: 'check', tone: 'success', text: 'Değişiklikler kaydedildi.' });
  }
  async function addNode(kind, parentId) {
    const v = await openEdit({ kind, parentId });
    if (!v) return null;
    return kind === 'folder' ? B.addFolder({ title: v.title, parentId: v.parentId }) : B.add({ title: v.title, url: v.url, parentId: v.parentId });
  }

  /** Import is not in this version: say so honestly and point to what works today. */
  const openImport = () => Vox.ui.dialog({
    title: 'Yer imlerini içe aktarma yakında', icon: 'import', width: 460,
    body: html`<p>Başka bir tarayıcıdan ya da yer imi dosyasından içe aktarma VoxBrowser’ın bir sonraki sürümünde gelecek.</p>
      <p class="pg-dialog-note">Şimdilik yer imlerini buradan ekleyebilir, “Dışa aktar” ile yedeğini alabilirsiniz.</p>`,
    actions: [{ label: 'Tamam', variant: 'primary', value: true }],
  });

  /* ── Dışa aktarma: tarayıcıların ortak "Netscape" yer imi dosyası ── */
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const secs = (ms) => Math.floor((ms || Date.now()) / 1000);
  function toHtml(tree) {
    const lines = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<!-- VoxBrowser yer imleri. Diğer tarayıcılar bu dosyayı içe aktarabilir. -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>'];
    const rec = (n, depth) => {
      const pad = '    '.repeat(depth);
      if (n.type === 'url') { lines.push(`${pad}<DT><A HREF="${esc(n.url)}" ADD_DATE="${secs(n.added)}">${esc(n.title)}</A>`); return; }
      lines.push(`${pad}<DT><H3 ADD_DATE="${secs(n.added)}"${n.id === 'bar' ? ' PERSONAL_TOOLBAR_FOLDER="true"' : ''}>${esc(n.title)}</H3>`, `${pad}<DL><p>`);
      (n.children || []).forEach((c) => rec(c, depth + 1));
      lines.push(`${pad}</DL><p>`);
    };
    ((tree && tree.children) || []).forEach((c) => rec(c, 1));
    lines.push('</DL><p>');
    return lines.join('\n');
  }
  function exportAll() {
    let n = 0;
    B.walk((x) => { if (x.type === 'url') n++; return true; });
    if (!n) { Vox.ui.toast({ icon: 'info', text: 'Dışa aktarılacak yer imi yok.' }); return; }
    const d = new Date();
    const name = `vox-yer-imleri-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.html`;
    const blob = new Blob([toHtml(B.tree())], { type: 'text/html;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
    Vox.ui.toast({ icon: 'file-down', tone: 'success', text: `${n} yer imi ${name} dosyası olarak kaydediliyor.`, action: { label: 'İndirilenler', onClick: () => Vox.tabs.open('vox://indirilenler/') } });
  }

  pg.bm = { ROOTS, coll, mapTree, isAncestor, pathTo, topLevel, urlsIn, removeMany, reorder, moveInto, sortFolder, openAll, editNode, addNode, openImport, exportAll, folderOptions, toHtml };
});
