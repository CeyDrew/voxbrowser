/* VoxBrowser — ana menü (⋮, Alt+F) ve sayfa komutları.
   Dar pencerede araç çubuğundan düşen düğmeler (ileri, yer imi, ana sayfa, profil) menünün başına gelir.
   Komutlar: menu.open, page.print (Ctrl+P), page.save (Ctrl+S), help.shortcuts (F1). Başka alanın komutu yüklü değilse
   ilgili satır devre dışı görünür, menü çökmez. */
Vox.define('toolbar.menu', (Vox) => {
  const { html } = Vox.p;
  const { Icon, Avatar, Kbd } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const tb = Vox.tb;
  const K = tb.kbd;

  const savable = (t) => !!t && !t.crashed && /^(https?|file|data):/i.test(t.realUrl || t.url);

  /* ── Özel satırlar ────────────────────────────────────── */
  function ZoomRow({ close }) {
    const tab = tb.useActiveTab();
    const z = tab ? tab.zoom || 100 : 100;
    const full = !!Vox.useStore('window.fullscreen');
    const step = (id, off) => () => { if (!off) Vox.commands.run(id); };
    return html`<div class="tb-menurow">
      <span class="tb-menurow-label"><span class="menu-ic"><${Icon} name="zoom-in" size=${18}/></span>Yakınlaştırma</span>
      <span class="tb-zoomctl" role="group" aria-label="Yakınlaştırma">
        <button type="button" role="menuitem" class="tb-zbtn" aria-label="Uzaklaştır" data-tip="Uzaklaştır" data-kbd=${K('page.zoomOut')} aria-disabled=${!tab || z <= 25 ? 'true' : undefined} onClick=${step('page.zoomOut', !tab || z <= 25)}><${Icon} name="minus" size=${16}/></button>
        <output class="tb-zval" aria-live="polite">%${z}</output>
        <button type="button" role="menuitem" class="tb-zbtn" aria-label="Yakınlaştır" data-tip="Yakınlaştır" data-kbd=${K('page.zoomIn')} aria-disabled=${!tab || z >= 500 ? 'true' : undefined} onClick=${step('page.zoomIn', !tab || z >= 500)}><${Icon} name="plus" size=${16}/></button>
      </span>
      <button type="button" role="menuitem" class="tb-zbtn" aria-label=${full ? 'Tam ekrandan çık' : 'Tam ekran'} data-tip=${full ? 'Tam ekrandan çık' : 'Tam ekran'} data-kbd=${K('view.fullscreen')}
        onClick=${() => { close(); setTimeout(() => Vox.commands.run('view.fullscreen'), 0); }}><${Icon} name=${full ? 'minimize' : 'maximize'} size=${16}/></button>
    </div>`;
  }

  /** Buttons that left the toolbar at narrow widths. */
  function NavRow({ close }) {
    const tab = tb.useActiveTab();
    const marked = Vox.useStore((s) => !!(tab && tab.url && Vox.bookmarks.findByUrl(tab.url)) && !!s.bookmarks);
    const showHome = Vox.useStore('settings.appearance.showHomeButton') !== false;
    const items = [
      ['arrow-right', 'İleri', !Vox.nav.canForward(tab), () => Vox.nav.forward()],
      ['star', marked ? 'Yer imini düzenle' : 'Yer imlerine ekle', !tab || tb.isNtp(tab.url), () => tb.bookmarkCurrent()],
      showHome ? ['house', 'Ana sayfa', false, () => Vox.nav.home()] : null,
      ['shield-check', 'Site bilgisi', !tab || tb.isNtp(tab.url), () => Vox.commands.run('siteinfo.open')],
    ].filter(Boolean);
    return html`<div class="tb-menurow tb-navrow" role="group" aria-label="Sayfa">
      ${items.map(([icon, label, off, fn]) => html`<button type="button" role="menuitem" class=${cx('tb-zbtn', icon === 'star' && marked && 'is-on')}
        aria-label=${label} data-tip=${label} aria-disabled=${off ? 'true' : undefined} onClick=${() => { if (off) return; close(); setTimeout(fn, 0); }}>
        <${Icon} name=${icon} size=${18}/></button>`)}
    </div>`;
  }

  function ProfileRow({ close }) {
    const p = Vox.useStore('profile') || {};
    const priv = Vox.useStore('window.private');
    const name = p.fullName || p.name || 'Profiliniz';
    return html`<button type="button" role="menuitem" class="menu-item tb-mi tb-mi-prof" onClick=${() => { close(); setTimeout(() => tb.openProfile(tb.anchor('menu')), 0); }}>
      ${priv ? html`<span class="tb-mi-mask"><${Icon} name="venetian-mask" size=${18}/></span>` : html`<${Avatar} name=${p.name || name} color=${p.color} size=${32}/>`}
      <span class="menu-label"><span class="tb-mi-title">${priv ? 'Gizli pencere' : name}</span><small>${priv ? 'Geçmiş kaydedilmiyor' : p.email || 'Yerel profil'}</small></span>
      <${Icon} name="chevron-right" size=${16} class="menu-chev"/>
    </button>`;
  }

  /* ── Alt menüler ──────────────────────────────────────── */
  function historyItems() {
    const closed = (store.get('closedTabs') || []).slice(0, 5);
    const recent = [];
    if (!store.get('window.private')) {
      const seen = new Set();
      for (const h of Vox.history.list()) {
        if (!h || seen.has(h.url)) continue;
        seen.add(h.url);
        recent.push(h);
        if (recent.length >= 6) break;
      }
    }
    return [
      tb.cmdItem('open.history', { label: 'Geçmiş', icon: 'history' }),
      tb.cmdItem('tab.reopen', { label: 'Kapatılan sekmeyi yeniden aç', icon: 'undo-2', disabled: !closed.length }),
      ...(closed.length ? ['-', { header: 'Son kapatılanlar' }, ...closed.map((c) => tb.favItem({ title: c.title || tb.bare(c.url), url: c.url, fav: c.favicon, hint: Vox.fmt.rel(c.closedAt), onSelect: () => Vox.tabs.reopenClosed(c.closedAt) }))] : []),
      ...(recent.length ? ['-', { header: 'Son ziyaret edilenler' }, ...recent.map((h) => tb.favItem({ title: h.title || tb.bare(h.url), url: h.url, fav: h.favicon, hint: Vox.fmt.rel(h.ts), onSelect: () => Vox.nav.go(h.url) }))] : []),
    ];
  }

  const toggleBar = () => {
    if (Vox.commands.has('bookmarksBar.toggle')) Vox.commands.run('bookmarksBar.toggle');
    else Vox.settings.set('appearance.showBookmarksBar', Vox.settings.get('appearance.showBookmarksBar') === false);
  };
  function bookmarkItems() {
    const tab = Vox.tabs.active();
    const page = !!tab && !tb.isNtp(tab.url);
    const on = page && Vox.bookmarks.isBookmarked(tab.url);
    const bar = Vox.bookmarks.get('bar');
    const other = Vox.bookmarks.get('other');
    const nodes = (list) => {
      const kids = (list || []).slice(0, 30);
      return [...kids.filter((n) => n.type !== 'folder'), ...kids.filter((n) => n.type === 'folder')].map((n) => (n.type === 'folder'
        ? { label: n.title || 'Klasör', icon: 'folder', submenu: n.children && n.children.length ? nodes(n.children) : [{ label: 'Boş klasör', disabled: true }] }
        : tb.favItem({ title: n.title || tb.bare(n.url), url: n.url, fav: n.favicon, onSelect: () => Vox.nav.go(n.url) })));
    };
    return [
      { label: on ? 'Yer imini düzenle…' : 'Bu sekmeyi yer imlerine ekle…', icon: 'star', kbd: K('bookmark.toggleCurrent'), disabled: !page, onSelect: () => tb.bookmarkCurrent() },
      tb.cmdItem('bookmark.allTabs', { label: 'Tüm sekmeleri yer imlerine ekle…', icon: 'bookmark-plus' }),
      '-',
      { label: 'Yer imi çubuğunu göster', checked: Vox.settings.get('appearance.showBookmarksBar') !== false, kbd: K('bookmarksBar.toggle'), onSelect: toggleBar },
      tb.cmdItem('open.bookmarks', { label: 'Yer imi yöneticisi', icon: 'book-marked' }),
      ...(bar && bar.children && bar.children.length ? ['-', { header: 'Yer imi çubuğu' }, ...nodes(bar.children)] : []),
      ...(other && other.children && other.children.length ? [{ label: other.title || 'Diğer yer imleri', icon: 'folder', submenu: nodes(other.children) }] : []),
    ];
  }

  const devItems = () => [
    tb.cmdItem('devtools.toggle', { label: 'Geliştirici araçları', icon: 'square-terminal' }),
    tb.cmdItem('page.viewSource', { label: 'Sayfa kaynağını görüntüle', icon: 'code-xml', disabled: !tb.isWeb((Vox.tabs.active() || {}).url) }),
    tb.cmdItem('open.processes', { label: 'Görev yöneticisi', icon: 'activity' }),
    tb.cmdItem('command.palette', { label: 'Komut paleti', icon: 'command' }),
  ];
  const helpItems = () => [
    tb.cmdItem('help.shortcuts', { label: 'Klavye kısayolları', icon: 'keyboard' }),
    tb.cmdItem('open.about', { label: 'VoxBrowser hakkında', icon: 'info' }),
  ];

  function mainItems(level) {
    const priv = !!store.get('window.private');
    const tab = Vox.tabs.active();
    const active = Vox.downloads.active().filter((d) => !!d.private === priv).length;
    const dark = Vox.theme.effective() === 'dark';
    const showHome = Vox.settings.get('appearance.showHomeButton') !== false;
    const point = () => { const a = tb.anchor('menu'); const r = a ? a.getBoundingClientRect() : { left: innerWidth - 40, top: 40, width: 0, height: 0 }; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    return [
      ...(level >= 3 ? [{ render: ({ close }) => html`<${NavRow} close=${close}/>` }, '-'] : []),
      ...(level >= 2 ? [{ render: ({ close }) => html`<${ProfileRow} close=${close}/>` }, '-'] : []),
      tb.cmdItem('tab.new', { label: 'Yeni sekme', icon: 'plus' }),
      tb.cmdItem('window.new', { label: 'Yeni pencere', icon: 'app-window' }),
      tb.cmdItem('window.private', { label: 'Yeni gizli pencere', icon: 'venetian-mask' }),
      '-',
      { label: 'Geçmiş', icon: 'history', submenu: historyItems() },
      tb.cmdItem('open.downloads', { label: 'İndirilenler', icon: 'download', badge: active ? `${active} etkin` : undefined }),
      { label: 'Yer imleri', icon: 'star', submenu: bookmarkItems() },
      { label: 'Uzantılar', icon: 'puzzle', badge: 'Yakında', onSelect: () => Vox.commands.run('extensions.menu') },
      ...(level >= 1 && level < 3 && showHome ? [tb.cmdItem('nav.home', { label: 'Ana sayfa', icon: 'house' })] : []),
      '-',
      { render: ({ close }) => html`<${ZoomRow} close=${close}/>` },
      '-',
      tb.cmdItem('page.print', { label: 'Yazdır…', icon: 'printer', disabled: !tab || tab.crashed }),
      tb.cmdItem('page.save', { label: 'Sayfayı farklı kaydet…', icon: 'save', disabled: !savable(tab) }),
      tb.cmdItem('find.open', { label: 'Sayfada bul…', icon: 'search', disabled: !tab }),
      { label: 'Geliştirici araçları', icon: 'square-terminal', submenu: devItems() },
      tb.cmdItem('clearData.open', { label: 'Tarama verilerini temizle…', icon: 'trash-2' }),
      '-',
      { label: dark ? 'Açık temaya geç' : 'Koyu temaya geç', icon: dark ? 'sun' : 'moon', onSelect: () => Vox.commands.run('theme.toggle', { point: point() }) },
      tb.cmdItem('open.settings', { label: 'Ayarlar', icon: 'settings' }),
      { label: 'Yardım', icon: 'circle-help', submenu: helpItems() },
      '-',
      Vox.commands.has('app.quit') ? tb.cmdItem('app.quit', { label: 'Çıkış', icon: 'log-out' }) : tb.cmdItem('window.close', { label: 'Pencereyi kapat', icon: 'log-out' }),
    ];
  }

  tb.openMenu = ({ keyboard } = {}) => {
    const a = tb.anchor('menu');
    if (!a) return;
    Vox.ui.menu({ anchor: a, placement: 'bottom-end', minWidth: 300, keyboard: !!keyboard, className: 'tb-menu', label: 'VoxBrowser menüsü', items: mainItems(tb.level || 0) });
  };

  /* ── Klavye kısayolları penceresi (yalnızca gerçekten bağlı olanlar) ── */
  const SHORTCUTS = [
    ['Sekmeler ve pencereler', [['tab.new', 'Yeni sekme'], ['tab.close', 'Sekmeyi kapat'], ['tab.reopen', 'Kapatılan sekmeyi aç'], ['tab.next', 'Sonraki sekme'],
      ['tab.prev', 'Önceki sekme'], ['tab.search', 'Sekmelerde ara'], ['window.new', 'Yeni pencere'], ['window.private', 'Yeni gizli pencere'], ['view.fullscreen', 'Tam ekran']]],
    ['Gezinme', [['omnibox.focus', 'Adres çubuğuna git'], ['nav.back', 'Geri'], ['nav.forward', 'İleri'], ['nav.reload', 'Yeniden yükle'],
      ['nav.hardReload', 'Önbelleği atlayarak yükle'], ['nav.home', 'Ana sayfa'], ['find.open', 'Sayfada bul'], ['page.zoomIn', 'Yakınlaştır'],
      ['page.zoomOut', 'Uzaklaştır'], ['page.zoomReset', 'Yakınlaştırmayı sıfırla']]],
    ['Sayfa ve araçlar', [['bookmark.toggleCurrent', 'Yer imlerine ekle'], ['bookmark.allTabs', 'Tüm sekmeleri yer imlerine ekle'], ['bookmarksBar.toggle', 'Yer imi çubuğu'],
      ['page.print', 'Yazdır'], ['page.save', 'Sayfayı kaydet'], ['open.history', 'Geçmiş'], ['open.downloads', 'İndirilenler'], ['open.bookmarks', 'Yer imi yöneticisi'],
      ['clearData.open', 'Tarama verilerini temizle'], ['command.palette', 'Komut paleti'], ['menu.open', 'Menü'], ['devtools.toggle', 'Geliştirici araçları'],
      ['page.viewSource', 'Sayfa kaynağı'], ['open.processes', 'Görev yöneticisi'], ['help.shortcuts', 'Klavye kısayolları'], ['app.quit', 'Çıkış'], ['voxi.listen', null]]],
  ];
  const shortcuts = () => Vox.ui.dialog({
    title: 'Klavye kısayolları', icon: 'keyboard', width: 780,
    render: () => html`<div class="tb-keys">${SHORTCUTS.map(([title, list], si) => html`<section key=${title}><h3 class="tb-pop-h">${title}</h3>
      <dl>${list.filter(([id]) => Vox.commands.has(id) && Vox.keys.label(id)).map(([id, label]) => html`<div key=${id}><dt>${label || Vox.commands.get(id).title}</dt><dd><${Kbd} keys=${K(id)}/></dd></div>`)}
        ${si === 0 ? html`<div><dt>1.–8. sekmeye git</dt><dd><${Kbd} keys="Ctrl+1"/> – <${Kbd} keys="Ctrl+8"/></dd></div><div><dt>Son sekmeye git</dt><dd><${Kbd} keys="Ctrl+9"/></dd></div>` : null}
      </dl></section>`)}</div>`,
    actions: [{ label: 'Tamam', variant: 'primary', value: true }],
  });

  const R = Vox.commands.register;
  R('menu.open', { title: 'Menüyü aç', icon: 'ellipsis-vertical', run: (a = {}) => tb.openMenu({ keyboard: !!(a.event || a.fromPage) }) });
  /** Runs a page action; a shortcut pressed inside the page gives the keyboard back to the page afterwards. */
  const pageAction = (action, a = {}) => {
    const t = Vox.tabs.active();
    if (!t || t.crashed) return;
    Vox.native.invoke('context:action', { tabId: t.id, action }).catch((e) => Vox.reportError(`page.${action}`, e));
    if (a.fromPage) Vox.nav.focusPage(t.id);
  };
  R('page.print', { title: 'Yazdır', icon: 'printer', run: (a) => pageAction('print', a) });
  R('page.save', { title: 'Sayfayı farklı kaydet', icon: 'save', run: (a) => {
    if (!savable(Vox.tabs.active())) { tb.toast('Bu sayfa kaydedilemez.', 'save'); return; }
    pageAction('savePage', a);
  } });
  R('help.shortcuts', { title: 'Klavye kısayolları', icon: 'keyboard', run: () => { shortcuts(); } });
  Vox.keys.bind('Ctrl+P', 'page.print');
  Vox.keys.bind('Ctrl+S', 'page.save');
  Vox.keys.bind('F1', 'help.shortcuts');
});
