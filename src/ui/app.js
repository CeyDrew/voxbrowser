/* VoxBrowser — tarayıcı arayüzü iskeleti: pencere düzeni, yuvalar (slots), çekirdek komutlar, kısayollar, açılış.
   Sayfa içeriği bu belgede değil, ana sürecin yerleştirdiği sekme görünümünde çizilir; .viewport yalnızca yer tutucudur. */
(function () {
  'use strict';
  const Vox = window.Vox;
  if (!Vox || !Vox.p) return;
  const { html, useRef, useEffect, useLayoutEffect } = Vox.p;
  const { cx } = Vox.util;
  const store = Vox.store;
  const params = new URLSearchParams(location.search);

  const Slot = ({ name, fallback = null, ...props }) => {
    const C = Vox.c[name];
    return C ? html`<${C} ...${props}/>` : fallback;
  };

  /* Yedek parçalar: ilgili modül yüklenmezse tarayıcı yine kullanılabilir kalır. */
  function WindowControls() {
    const max = Vox.useStore('window.maximized');
    const act = (a) => () => Vox.native.invoke('window:action', { action: a });
    return html`<div class="win-ctrls">
      <button type="button" class="win-ctrl" aria-label="Simge durumuna küçült" onClick=${act('minimize')}><${Vox.c.Icon} name="minus" size=${18}/></button>
      <button type="button" class="win-ctrl" aria-label=${max ? 'Önceki boyut' : 'Ekranı kapla'} onClick=${act('maximize')}><${Vox.c.Icon} name=${max ? 'copy' : 'square'} size=${max ? 15 : 14}/></button>
      <button type="button" class="win-ctrl win-ctrl--close" aria-label="Kapat" onClick=${act('close')}><${Vox.c.Icon} name="x" size=${18}/></button>
    </div>`;
  }
  function FallbackTabStrip() {
    const tabs = Vox.useStore('tabs');
    const active = Vox.useStore('activeTabId');
    return html`<div class="fb-tabs" role="tablist" aria-label="Sekmeler">
      ${tabs.map((t) => html`<div class=${cx('fb-tab', t.id === active && 'is-active')} key=${t.id}>
        <button type="button" role="tab" aria-selected=${String(t.id === active)} class="fb-tab-main" onClick=${() => Vox.tabs.activate(t.id)}>
          ${t.loading ? html`<${Vox.c.Spinner} size=${14}/>` : html`<${Vox.c.Favicon} spec=${t.favicon}/>`}<span>${t.title}</span></button>
        <button type="button" class="fb-tab-x" aria-label=${`Sekmeyi kapat: ${t.title}`} onClick=${() => Vox.tabs.close(t.id)}><${Vox.c.Icon} name="x" size=${14}/></button>
      </div>`)}
      <${Vox.c.IconButton} icon="plus" label="Yeni sekme" cmd="tab.new" onClick=${() => Vox.commands.run('tab.new')}/>
      <span class="fb-drag"></span>
      <${WindowControls}/>
    </div>`;
  }
  function FallbackToolbar() {
    const tab = Vox.useStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
    const ref = useRef();
    useEffect(() => { if (ref.current && document.activeElement !== ref.current) ref.current.value = tab ? (tab.internal && /yeni-sekme/.test(tab.url) ? '' : tab.url) : ''; });
    return html`<form class="fb-toolbar" onSubmit=${(e) => { e.preventDefault(); Vox.nav.go(ref.current.value); ref.current.blur(); }}>
      <${Vox.c.IconButton} icon="arrow-left" label="Geri" disabled=${!Vox.nav.canBack(tab)} onClick=${() => Vox.nav.back()}/>
      <${Vox.c.IconButton} icon="arrow-right" label="İleri" disabled=${!Vox.nav.canForward(tab)} onClick=${() => Vox.nav.forward()}/>
      <${Vox.c.IconButton} icon=${tab && tab.loading ? 'x' : 'rotate-cw'} label=${tab && tab.loading ? 'Durdur' : 'Yeniden yükle'} onClick=${() => (tab && tab.loading ? Vox.nav.stop() : Vox.nav.reload())}/>
      <label class="sr-only" for="fb-addr">Adres</label>
      <input id="fb-addr" ref=${ref} name="addr" class="fb-addr" placeholder="Arayın ya da adres yazın" autocomplete="off" spellcheck="false" onFocus=${(e) => e.currentTarget.select()}/>
      <${Vox.c.IconButton} icon="code-xml" label="Geliştirici araçları" cmd="devtools.toggle" onClick=${() => Vox.commands.run('devtools.toggle')}/>
    </form>`;
  }

  /** The area where the active tab's page is drawn (by the main process). */
  function Viewport() {
    const ref = useRef();
    const tab = Vox.useStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
    const crashed = !!(tab && tab.crashed);
    useLayoutEffect(() => { Vox.layout.viewport.attach(ref.current); return () => Vox.layout.viewport.detach(ref.current); }, []);
    useEffect(() => { Vox.native.invoke('ui:contentHidden', { on: crashed }).catch(() => {}); }, [crashed]);
    return html`<div ref=${ref} class=${cx('viewport', crashed && 'is-crashed')} id="vox-viewport">
      ${crashed ? html`<${Slot} name="CrashPage" tab=${tab} fallback=${html`<div class="page-crash">
        <h1>Eyvah, bu sekme çöktü</h1>
        <p>Sayfanın süreci beklenmedik biçimde kapandı. Diğer sekmeleriniz etkilenmedi.</p>
        <${Vox.c.Button} variant="primary" icon="rotate-cw" onClick=${() => Vox.nav.reload(tab.id)}>Yeniden yükle<//>
      </div>`}/>` : null}
    </div>`;
  }

  /** Space for Chromium DevTools of the active tab (drawn by the main process) + resize handle. */
  function DevToolsDock() {
    const dock = Vox.useStore('ui.devtools.dock');
    const size = Vox.useStore('ui.devtools.size');
    const ref = useRef();
    const area = useRef();
    useLayoutEffect(() => { Vox.layout.devtools.attach(area.current); return () => Vox.layout.devtools.detach(area.current); }, []);
    const setSize = (v) => {
      const host = ref.current && ref.current.parentElement;
      const max = host ? (dock === 'bottom' ? host.clientHeight : host.clientWidth) - 160 : 900;
      store.set('ui.devtools.size', Math.round(Math.max(160, Math.min(max, v))));
    };
    const onDown = (e) => {
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const host = ref.current.parentElement.getBoundingClientRect();
      document.documentElement.classList.add('is-resizing', dock === 'bottom' ? 'resize-y' : 'resize-x');
      Vox.native.invoke('ui:raise', { on: true }).catch(() => {});
      const move = (ev) => setSize(dock === 'bottom' ? host.bottom - ev.clientY : host.right - ev.clientX);
      const up = () => {
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
        document.documentElement.classList.remove('is-resizing', 'resize-y', 'resize-x');
        if (!Vox.overlay.list().length) Vox.native.invoke('ui:raise', { on: false }).catch(() => {});
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    };
    const onKey = (e) => {
      const step = e.shiftKey ? 60 : 20;
      if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); setSize(size + step); }
      if (['ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); setSize(size - step); }
    };
    const IB = Vox.c.IconButton;
    const run = (id, a) => () => Vox.commands.run(id, a);
    return html`<div ref=${ref} class=${cx('dt-dock', `dt-dock--${dock}`)} style=${`--dt-size:${size}px`}>
      <div class="dt-resizer" role="separator" tabindex="0" aria-orientation=${dock === 'bottom' ? 'horizontal' : 'vertical'}
        aria-label="Geliştirici araçlarının boyutu" aria-valuenow=${size} onPointerDown=${onDown} onKeyDown=${onKey}></div>
      <div class="dt-head">
        <span class="dt-title"><${Vox.c.Icon} name="code-xml" size=${16}/>Geliştirici araçları</span>
        <span class="dt-sp"></span>
        <${IB} icon="panel-bottom" size="sm" label="Alta yerleştir" active=${dock === 'bottom'} onClick=${run('devtools.dock', { side: 'bottom' })}/>
        <${IB} icon="panel-right" size="sm" label="Sağa yerleştir" active=${dock === 'right'} onClick=${run('devtools.dock', { side: 'right' })}/>
        <span class="dt-sep" aria-hidden="true"></span>
        <${IB} icon="x" size="sm" label="Geliştirici araçlarını kapat" cmd="devtools.toggle" onClick=${run('devtools.close')}/>
      </div>
      <div ref=${area} class="dt-area" aria-label="Geliştirici araçları"></div>
    </div>`;
  }

  function App() {
    const priv = Vox.useStore('window.private');
    const max = Vox.useStore('window.maximized');
    const full = Vox.useStore('window.fullscreen');
    const dtOpen = Vox.useStore((s) => { const t = s.tabs.find((x) => x.id === s.activeTabId); return !!(t && t.devtools); });
    const dock = Vox.useStore('ui.devtools.dock');
    return html`<div class=${cx('win', priv && 'is-private', max && 'is-max', full && 'is-full')} id="vox-window">
      <header class="chrome-top">
        <${Slot} name="TabStrip" fallback=${html`<${FallbackTabStrip}/>`}/>
        <${Slot} name="Toolbar" fallback=${html`<${FallbackToolbar}/>`}/>
        <${Slot} name="BookmarksBar"/>
        <${Slot} name="InfoBar"/>
        <${Slot} name="FindBar"/>
      </header>
      <div class=${cx('workspace', dtOpen && `has-dt dt-${dock}`)}>
        <${Slot} name="SidePanel"/>
        <div class="main-col">
          <${Viewport}/>
          ${dtOpen && dock === 'bottom' ? html`<${DevToolsDock}/>` : null}
        </div>
        ${dtOpen && dock !== 'bottom' ? html`<${DevToolsDock}/>` : null}
      </div>
    </div>
    <${Vox.c.OverlayHost}/>`;
  }

  /* ── Çekirdek komutlar (modüller aynı kimlikle yeniden kaydedip zenginleştirebilir) ── */
  const activeTab = () => Vox.tabs.active();
  function coreCommands() {
    const R = Vox.commands.register;
    R('tab.new', { title: 'Yeni sekme', icon: 'plus', run: () => Vox.tabs.open('vox://yeni-sekme') });
    R('tab.close', { title: 'Sekmeyi kapat', icon: 'x', run: () => Vox.tabs.close() });
    R('tab.reopen', { title: 'Kapatılan sekmeyi yeniden aç', icon: 'undo-2', run: () => Vox.tabs.reopenClosed() });
    R('tab.next', { title: 'Sonraki sekme', run: () => Vox.tabs.next(1) });
    R('tab.prev', { title: 'Önceki sekme', run: () => Vox.tabs.next(-1) });
    R('tab.duplicate', { title: 'Sekmeyi çoğalt', icon: 'copy', run: (a = {}) => Vox.tabs.duplicate(a.tabId || store.get('activeTabId')) });
    R('tab.pin', { title: 'Sekmeyi sabitle', icon: 'pin', run: (a = {}) => Vox.tabs.pin(a.tabId || store.get('activeTabId')) });
    R('tab.mute', { title: 'Sekmenin sesini kapat', icon: 'volume-x', run: (a = {}) => Vox.tabs.mute(a.tabId || store.get('activeTabId')) });
    R('nav.back', { title: 'Geri', icon: 'arrow-left', run: () => Vox.nav.back() });
    R('nav.forward', { title: 'İleri', icon: 'arrow-right', run: () => Vox.nav.forward() });
    R('nav.reload', { title: 'Yeniden yükle', icon: 'rotate-cw', run: () => Vox.nav.reload() });
    R('nav.hardReload', { title: 'Önbelleği boşaltıp yeniden yükle', icon: 'rotate-cw', run: () => Vox.nav.reload(undefined, true) });
    R('nav.stop', { title: 'Durdur', icon: 'x', run: () => Vox.nav.stop() });
    R('nav.home', { title: 'Ana sayfa', icon: 'house', run: () => Vox.nav.home() });
    R('page.zoomIn', { title: 'Yakınlaştır', icon: 'zoom-in', run: () => { const t = activeTab(); if (t) Vox.tabs.zoomBy(t.id, 1); } });
    R('page.zoomOut', { title: 'Uzaklaştır', icon: 'zoom-out', run: () => { const t = activeTab(); if (t) Vox.tabs.zoomBy(t.id, -1); } });
    R('page.zoomReset', { title: 'Yakınlaştırmayı sıfırla', icon: 'search', run: () => { const t = activeTab(); if (t) Vox.tabs.zoomBy(t.id, 0); } });
    R('page.viewSource', { title: 'Sayfa kaynağını görüntüle', icon: 'file-code-2', run: () => { const t = activeTab(); if (t && /^https?:/i.test(t.url)) Vox.tabs.open(`view-source:${t.url}`, { opener: t.id }); } });
    const openPage = (url) => () => {
      const t = Vox.tabs.all().find((x) => x.realUrl && x.realUrl.split(/[?#]/)[0].replace(/\/$/, '') === url.replace(/\/$/, ''));
      if (t) Vox.tabs.activate(t.id); else Vox.tabs.open(url);
    };
    R('open.settings', { title: 'Ayarlar', icon: 'settings', run: (a = {}) => (a.section ? Vox.tabs.open(`vox://ayarlar/${a.section}`) : openPage('vox://ayarlar/')()) });
    R('open.history', { title: 'Geçmiş', icon: 'history', run: openPage('vox://gecmis/') });
    R('open.downloads', { title: 'İndirilenler', icon: 'download', run: openPage('vox://indirilenler/') });
    R('open.bookmarks', { title: 'Yer imi yöneticisi', icon: 'book-marked', run: openPage('vox://yer-imleri/') });
    R('open.extensions', { title: 'Uzantılar', icon: 'puzzle', run: openPage('vox://uzantilar/') });
    R('open.processes', { title: 'Görev yöneticisi', icon: 'activity', run: openPage('vox://surecler/') });
    R('open.about', { title: 'VoxBrowser hakkında', icon: 'info', run: openPage('vox://hakkinda/') });
    R('clearData.open', { title: 'Tarama verilerini temizle', icon: 'trash-2', run: () => Vox.commands.run('open.settings', { section: 'gizlilik/temizle' }) });
    R('theme.toggle', { title: 'Açık / koyu tema', icon: 'sun-moon', run: (a = {}) => Vox.theme.set(Vox.theme.effective() === 'dark' ? 'light' : 'dark', a.point) });
    R('window.new', { title: 'Yeni pencere', icon: 'app-window', run: () => Vox.native.invoke('window:new', { private: false }) });
    R('window.private', { title: 'Yeni gizli pencere', icon: 'venetian-mask', run: () => Vox.native.invoke('window:new', { private: true }) });
    R('window.minimize', { title: 'Simge durumuna küçült', icon: 'minus', run: () => Vox.native.invoke('window:action', { action: 'minimize' }) });
    R('window.maximize', { title: 'Ekranı kapla', icon: 'square', run: () => Vox.native.invoke('window:action', { action: 'maximize' }) });
    R('window.close', { title: 'Pencereyi kapat', icon: 'x', run: () => Vox.native.invoke('window:action', { action: 'close' }) });
    R('app.quit', { title: "VoxBrowser'dan çık", icon: 'log-out', run: () => Vox.native.invoke('app:quit', {}) });
    R('view.fullscreen', { title: 'Tam ekran', icon: 'maximize', run: () => Vox.native.invoke('window:action', { action: 'fullscreen' }) });
    R('devtools.toggle', { title: 'Geliştirici araçları', icon: 'code-xml', run: () => { const t = activeTab(); if (t) Vox.native.invoke('devtools:toggle', { tabId: t.id }); } });
    R('devtools.open', { title: 'Geliştirici araçlarını aç', icon: 'code-xml', run: () => { const t = activeTab(); if (t) Vox.native.invoke('devtools:open', { tabId: t.id }); } });
    R('devtools.console', { title: 'Konsol', icon: 'square-terminal', run: () => Vox.commands.run('devtools.open') });
    R('devtools.inspect', { title: 'Öğe seç', icon: 'square-mouse-pointer', run: () => Vox.commands.run('devtools.open') });
    R('devtools.close', { title: 'Geliştirici araçlarını kapat', icon: 'x', run: () => { const t = activeTab(); if (t) Vox.native.invoke('devtools:close', { tabId: t.id }); } });
    R('devtools.dock', { title: 'Geliştirici araçlarının yeri', icon: 'panel-bottom', run: (a = {}) => store.set('ui.devtools.dock', a.side || (store.get('ui.devtools.dock') === 'bottom' ? 'right' : 'bottom')) });
  }

  function coreKeys() {
    const K = Vox.keys.bind;
    K(['Ctrl+T', 'Alt+T'], 'tab.new');
    K(['Ctrl+W', 'Ctrl+F4'], 'tab.close');
    K('Ctrl+Shift+T', 'tab.reopen');
    K(['Ctrl+Tab', 'Ctrl+PageDown'], 'tab.next');
    K(['Ctrl+Shift+Tab', 'Ctrl+PageUp'], 'tab.prev');
    K('Alt+ArrowLeft', 'nav.back');
    K('Alt+ArrowRight', 'nav.forward');
    K(['F5', 'Ctrl+R'], 'nav.reload');
    K(['Ctrl+F5', 'Ctrl+Shift+R'], 'nav.hardReload');
    K('Alt+Home', 'nav.home');
    K('Ctrl+=', 'page.zoomIn');
    K('Ctrl+-', 'page.zoomOut');
    K('Ctrl+0', 'page.zoomReset');
    K('Ctrl+U', 'page.viewSource');
    K('Ctrl+H', 'open.history');
    K('Ctrl+J', 'open.downloads');
    K('Ctrl+Shift+O', 'open.bookmarks');
    K('Shift+Escape', 'open.processes');
    K('Ctrl+N', 'window.new');
    K('Ctrl+Shift+N', 'window.private');
    K('F11', 'view.fullscreen');
    K('Ctrl+Shift+Q', 'app.quit');
    K(['F12', 'Ctrl+Shift+I'], 'devtools.toggle');
    K('Ctrl+Shift+C', 'devtools.inspect');
    K('Ctrl+Shift+J', 'devtools.console');
    for (let i = 1; i <= 8; i++) K(`Ctrl+${i}`, () => { const t = Vox.tabs.all()[i - 1]; if (t) Vox.tabs.activate(t.id); });
    K('Ctrl+9', () => { const all = Vox.tabs.all(); if (all.length) Vox.tabs.activate(all[all.length - 1].id); });
    // Diğer modüllerin komutları (ilgili modül kaydeder)
    K(['Ctrl+L', 'Alt+D', 'F6'], 'omnibox.focus');
    K('Ctrl+D', 'bookmark.toggleCurrent');
    K('Ctrl+Shift+B', 'bookmarksBar.toggle');
    K(['Ctrl+F', 'F3'], 'find.open');
    K(['Alt+F', 'Alt+E'], 'menu.open');
    K('Ctrl+K', 'command.palette');
    K('Ctrl+Shift+A', 'tab.search');
    K('Ctrl+Shift+Delete', 'clearData.open');
    K(['Alt+V', 'Ctrl+Shift+Space'], 'voxi.listen');
  }

  const DATA_SLICES = ['settings', 'bookmarks', 'history', 'downloads', 'permissions', 'profile', 'readingList', 'shortcuts', 'searchEngines', 'notifications', 'extensions'];
  Vox.boot = async function () {
    store.replace({
      window: { private: params.get('private') === '1', maximized: false, fullscreen: false, focused: true, id: Number(params.get('win')) || 0 },
      ui: { sidePanel: null, sidePanelWidth: 380, devtools: { dock: 'bottom', size: 340 }, findOpen: false, logo: 'pencere' },
      tabs: [], activeTabId: null, groups: [], closedTabs: [],
      voxi: { listening: false, messages: [] },
      settings: {}, bookmarks: { id: 'root', type: 'folder', children: [] }, history: [], downloads: [], permissions: {}, profile: {},
      readingList: [], shortcuts: [], searchEngines: [], notifications: [], extensions: [],
    });
    await Vox.data.subscribe(DATA_SLICES);
    coreCommands();
    coreKeys();
    await Vox.loadManifests();
    Vox.runModules();
    Vox.theme.apply();
    Vox.p.render(html`<${App}/>`, document.getElementById('vox-app'));
    const st = await Vox.native.invoke('ui:ready', { keys: Vox.keys.combos() });
    if (st && st.tabs) store.update((s) => ({ ...s, window: { ...s.window, private: !!st.private, id: st.windowId } }));
    Vox.ready = true;
    document.documentElement.classList.add('is-ready');
    Vox.bus.emit('ready');
  };
  /** Modules that add key bindings after boot call this so shortcuts also work while a web page has focus. */
  Vox.keys.sync = Vox.util.debounce(() => Vox.native.invoke('keys:register', { keys: Vox.keys.combos() }).catch(() => {}), 50);

  const start = () => Vox.boot().catch((e) => Vox.reportError('boot', e));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
