/* VoxBrowser — sayfa sağ tık menüsü (menu.pageContext).
   Ana süreç Chromium'un bağlam bilgisini gönderir (bağlantı, resim, ses/video, seçim, düzenlenebilir alan, yazım önerileri);
   menü arayüzde çizilir ve seçilen eylem ana süreçte sayfaya uygulanır (context:action). Her durumda en altta "İncele". */
Vox.define('toolbar.context', (Vox) => {
  const tb = Vox.tb;
  const K = tb.kbd;
  const short = (s, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  function pageContext(ctx = {}) {
    if (!ctx || !ctx.native) return;
    const tab = Vox.tabs.get(ctx.tabId) || Vox.tabs.active();
    if (!tab) return;
    const id = tab.id;
    const act = (action, params) => Vox.native.invoke('context:action', { tabId: id, action, params }).catch((e) => Vox.reportError(`context:${action}`, e));
    /** Editing commands run on the page's focused field: give the page focus back first. */
    const edit = (action, params) => () => Vox.nav.focusPage(id).then(() => act(action, params));
    const back = (fn) => () => { fn(); Vox.nav.focusPage(id); };
    const open = (url) => Vox.tabs.open(url, { active: false, opener: id });
    const pt = { x: Math.round(ctx.pageX || 0), y: Math.round(ctx.pageY || 0) };
    const f = ctx.editFlags || {};
    const sel = String(ctx.selection || '').replace(/\s+/g, ' ').trim();
    const voxi = Vox.commands.has('voxi.ask') && Vox.settings.get('voxi.enabled') !== false;
    const link = ctx.link || '';
    const src = ctx.srcURL || '';
    const media = ctx.mediaType === 'video' || ctx.mediaType === 'audio' ? ctx.mediaType : null;
    const items = [];
    const group = (...list) => {
      const l = list.filter(Boolean);
      if (!l.length) return;
      if (items.length) items.push('-');
      items.push(...l);
    };
    const selItem = () => (tb.urlish(sel) && !/\s/.test(sel)
      ? { label: `“${short(sel, 28)}” adresine git`, icon: 'globe', onSelect: () => Vox.tabs.open(sel, { opener: id }) }
      : { label: `“${short(sel, 18)}” için ${tb.loc(tb.engineName())} ara`, icon: 'search', onSelect: () => Vox.tabs.open(tb.searchUrl(sel), { opener: id }) });

    // Yazım denetimi
    if (ctx.editable && ctx.misspelledWord) {
      const sug = (ctx.dictionarySuggestions || []).slice(0, 5);
      group(
        ...(sug.length ? sug.map((w) => ({ label: w, onSelect: edit('replaceMisspelling', { word: w }) })) : [{ label: 'Yazım önerisi yok', disabled: true }]),
        { label: `“${short(ctx.misspelledWord, 20)}” sözcüğünü sözlüğe ekle`, icon: 'book-plus', onSelect: back(() => act('addToDictionary', { word: ctx.misspelledWord })) },
      );
    }
    // Bağlantı
    if (/^mailto:/i.test(link)) {
      group({ label: 'E-posta adresini kopyala', icon: 'link', onSelect: back(() => tb.copy(decodeURIComponent(link.slice(7).split('?')[0]), 'E-posta adresi')) });
    } else if (/^(https?|file|data):/i.test(link)) {
      group(
        { label: 'Bağlantıyı yeni sekmede aç', icon: 'square-arrow-out-up-right', onSelect: back(() => open(link)) },
        { label: 'Bağlantıyı yeni pencerede aç', icon: 'app-window', onSelect: () => Vox.native.invoke('window:new', { url: link }) },
        { label: 'Bağlantıyı gizli pencerede aç', icon: 'venetian-mask', onSelect: () => Vox.native.invoke('window:new', { url: link, private: true }) },
        { label: 'Bağlantıyı farklı kaydet…', icon: 'download', onSelect: () => act('saveURL', { url: link }) },
        { label: 'Bağlantı adresini kopyala', icon: 'link', onSelect: back(() => tb.copy(link, 'Bağlantı adresi')) },
        ctx.linkText && !sel ? { label: 'Bağlantı metnini kopyala', icon: 'type', onSelect: back(() => tb.copy(ctx.linkText.trim(), 'Bağlantı metni')) } : null,
      );
    }
    // Resim
    if (ctx.mediaType === 'image' && src) {
      group(
        /^(https?|data|file):/i.test(src) ? { label: 'Resmi yeni sekmede aç', icon: 'image', onSelect: back(() => open(src)) } : null,
        { label: 'Resmi farklı kaydet…', icon: 'image-down', onSelect: () => act('saveURL', { url: src }) },
        ctx.hasImageContents !== false ? { label: 'Resmi kopyala', icon: 'copy', onSelect: back(() => act('copyImageAt', pt)) } : null,
        /^https?:/i.test(src) ? { label: 'Resim adresini kopyala', icon: 'link', onSelect: back(() => tb.copy(src, 'Resim adresi')) } : null,
      );
    }
    // Ses / video
    if (media && /^(https?|file):/i.test(src)) {
      const video = media === 'video';
      group(
        { label: video ? 'Videoyu yeni sekmede aç' : 'Sesi yeni sekmede aç', icon: video ? 'film' : 'volume-2', onSelect: back(() => open(src)) },
        { label: video ? 'Videoyu farklı kaydet…' : 'Sesi farklı kaydet…', icon: 'file-down', onSelect: () => act('saveURL', { url: src }) },
        { label: video ? 'Video adresini kopyala' : 'Ses adresini kopyala', icon: 'link', onSelect: back(() => tb.copy(src, video ? 'Video adresi' : 'Ses adresi')) },
      );
    }
    // Düzenlenebilir alan
    if (ctx.editable) {
      group(
        { label: 'Geri al', icon: 'undo-2', kbd: 'Ctrl+Z', disabled: !f.canUndo, onSelect: edit('undo') },
        { label: 'Yinele', icon: 'redo-2', kbd: 'Ctrl+Y', disabled: !f.canRedo, onSelect: edit('redo') },
      );
      group(
        { label: 'Kes', icon: 'scissors', kbd: 'Ctrl+X', disabled: !f.canCut, onSelect: edit('cut') },
        { label: 'Kopyala', icon: 'copy', kbd: 'Ctrl+C', disabled: !f.canCopy, onSelect: edit('copy') },
        { label: 'Yapıştır', icon: 'clipboard-paste', kbd: 'Ctrl+V', disabled: !f.canPaste, onSelect: edit('paste') },
        { label: 'Düz metin olarak yapıştır', icon: 'clipboard-type', kbd: 'Ctrl+Shift+V', disabled: !f.canPaste, onSelect: edit('pasteAsPlain') },
        { label: 'Tümünü seç', icon: 'text-select', kbd: 'Ctrl+A', disabled: f.canSelectAll === false, onSelect: edit('selectAll') },
      );
      if (sel) group(selItem());
    } else if (sel) {
      // Seçili metin
      group(
        { label: 'Kopyala', icon: 'copy', kbd: 'Ctrl+C', onSelect: back(() => act('copy')) },
        selItem(),
        voxi ? { label: 'Voxi’ye sor', icon: 'audio-lines', onSelect: () => tb.run('voxi.ask', { text: sel }) } : null,
      );
    }
    // Sayfanın boş bir yeri
    if (!link && ctx.mediaType !== 'image' && !media && !sel && !ctx.editable) {
      group(
        { label: 'Geri', icon: 'arrow-left', kbd: K('nav.back'), disabled: !tab.canGoBack, onSelect: () => Vox.nav.back(id) },
        { label: 'İleri', icon: 'arrow-right', kbd: K('nav.forward'), disabled: !tab.canGoForward, onSelect: () => Vox.nav.forward(id) },
        { label: 'Yeniden yükle', icon: 'rotate-cw', kbd: K('nav.reload'), onSelect: () => Vox.nav.reload(id) },
      );
      const savable = /^(https?|file|data):/i.test(tab.realUrl || '');
      group(
        { label: 'Farklı kaydet…', icon: 'save', kbd: K('page.save'), disabled: !savable || id !== Vox.store.get('activeTabId'), onSelect: () => Vox.commands.run('page.save') },
        { label: 'Yazdır…', icon: 'printer', kbd: K('page.print'), disabled: id !== Vox.store.get('activeTabId'), onSelect: () => Vox.commands.run('page.print') },
        voxi && !tab.internal ? { label: 'Voxi ile bu sayfayı özetle', icon: 'audio-lines', onSelect: () => tb.run('voxi.ask', { text: 'Bu sayfayı özetle', tabId: id, action: 'summarize' }) } : null,
      );
      if (Vox.commands.has('page.viewSource') && tb.isWeb(tab.url) && id === Vox.store.get('activeTabId')) {
        group({ label: 'Sayfa kaynağını görüntüle', icon: 'code-xml', kbd: K('page.viewSource'), onSelect: () => Vox.commands.run('page.viewSource') });
      }
    }
    group({ label: 'İncele', icon: 'square-mouse-pointer', kbd: K('devtools.inspect') || 'Ctrl+Shift+C', onSelect: () => act('inspect', pt) });
    Vox.ui.menu({ anchor: { x: ctx.x, y: ctx.y }, placement: 'bottom-start', offset: 2, items, label: 'Sayfa menüsü', minWidth: 260, className: 'tb-menu tb-ctx' });
  }

  Vox.commands.register('menu.pageContext', { title: 'Sayfa menüsü', run: pageContext });
});
