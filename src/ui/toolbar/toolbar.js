/* VoxBrowser — araç çubuğu (Vox.c.Toolbar).
   Geri/ileri (sağ tık ya da basılı tutunca sekmenin gerçek geçmişi, orta tık yeni sekmede), yenile ↔ durdur
   (Shift/Ctrl+tık önbelleği atlar), ana sayfa, adres çubuğu, uzantılar, indirilenler, profil, menü ve yükleme çizgisi.
   Genişlik daraldıkça düğmeler menüye taşınır (tb.level 0–3). */
Vox.define('toolbar.toolbar', (Vox) => {
  const { html, useState, useRef, useEffect, useLayoutEffect } = Vox.p;
  const { Icon, IconButton } = Vox.c;
  const { cx } = Vox.util;
  const tb = Vox.tb;

  /** 0: hepsi · 1: ana sayfa menüde · 2: profil ve uzantılar menüde · 3: ileri ve yıldız menüde */
  const levelFor = (w) => (w < 560 ? 3 : w < 720 ? 2 : w < 900 ? 1 : 0);
  tb.level = 0;

  /** Address an entry stands for (error pages carry the URL that failed). */
  const shownUrl = (url) => {
    const u = Vox.url.parse(url);
    return u.scheme === 'vox' && u.host === 'hata' && u.query.url ? u.query.url : url;
  };

  function HistoryButton({ tab, dir }) {
    const back = dir < 0;
    const can = back ? Vox.nav.canBack(tab) : Vox.nav.canForward(tab);
    const timer = useRef(0);
    const longPress = useRef(false);
    useEffect(() => () => clearTimeout(timer.current), []);
    const neighbours = async () => {
      const res = tab ? await Vox.nav.entries(tab.id) : null;
      const rows = [];
      if (!res || !Array.isArray(res.entries)) return rows;
      for (let i = res.index + dir; i >= 0 && i < res.entries.length && rows.length < 14; i += dir) rows.push({ e: res.entries[i], i });
      return rows;
    };
    const openList = async (el) => {
      const rows = await neighbours();
      if (!rows.length || !el.isConnected) return;
      Vox.ui.menu({
        anchor: el, placement: 'bottom-start', minWidth: 280, className: 'tb-menu', label: back ? 'Geri gidilecek sayfalar' : 'İleri gidilecek sayfalar',
        items: [
          ...rows.map(({ e, i }) => {
            const u = shownUrl(e.url);
            return tb.favItem({ title: e.title || tb.bare(u) || u, url: u, hint: tb.isNtp(u) ? '' : tb.bare(u), onSelect: () => Vox.nav.goto(tab.id, i) });
          }),
          '-',
          tb.cmdItem('open.history', { label: 'Tüm geçmiş', icon: 'history' }),
        ],
      });
    };
    const down = (e) => {
      if (e.button !== 0 || !can) return;
      longPress.current = false;
      const el = e.currentTarget;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { longPress.current = true; openList(el); }, 460);
    };
    const cancel = () => clearTimeout(timer.current);
    const click = () => {
      if (longPress.current) { longPress.current = false; return; }
      if (!tab) return;
      if (back) Vox.nav.back(tab.id); else Vox.nav.forward(tab.id);
    };
    const aux = async (e) => {
      if (e.button !== 1 || !can) return;
      e.preventDefault();
      const [first] = await neighbours();
      if (first) Vox.tabs.open(shownUrl(first.e.url), { active: false, opener: tab.id });
    };
    return html`<${IconButton} icon=${back ? 'arrow-left' : 'arrow-right'} class="tb-histbtn" disabled=${!can}
      label=${back ? 'Geri' : 'İleri'} cmd=${back ? 'nav.back' : 'nav.forward'} kbd=${tb.kbd(back ? 'nav.back' : 'nav.forward')} aria-haspopup="menu"
      onPointerDown=${down} onPointerUp=${cancel} onPointerLeave=${cancel} onClick=${click} onAuxClick=${aux}
      onContextMenu=${(e) => { e.preventDefault(); cancel(); if (can) openList(e.currentTarget); }}/>`;
  }

  function ReloadButton({ tab }) {
    const loading = !!(tab && tab.loading);
    const [spin, setSpin] = useState(0);
    useEffect(() => {
      if (!spin) return undefined;
      const t = setTimeout(() => setSpin(0), 520);
      return () => clearTimeout(t);
    }, [spin]);
    const stop = loading && !spin;
    const icon = stop ? 'x' : 'rotate-cw';
    const onClick = (e) => {
      if (!tab) return;
      if (stop) { Vox.nav.stop(tab.id); return; }
      setSpin(Date.now());
      Vox.nav.reload(tab.id, e.shiftKey || e.ctrlKey || e.metaKey);
    };
    const menu = (e) => {
      e.preventDefault();
      if (!tab) return;
      Vox.ui.menu({ anchor: e.currentTarget, placement: 'bottom-start', className: 'tb-menu', label: 'Yeniden yükleme', items: [
        { label: 'Yeniden yükle', icon: 'rotate-cw', kbd: tb.kbd('nav.reload'), onSelect: () => Vox.nav.reload(tab.id) },
        { label: 'Önbelleği atlayarak yeniden yükle', icon: 'refresh-cw', kbd: tb.kbd('nav.hardReload'), onSelect: () => Vox.nav.reload(tab.id, true) },
      ] });
    };
    return html`<button type="button" class=${cx('ibtn ibtn--md ibtn--ghost tb-reload', spin && 'is-spin')}
      aria-label=${stop ? 'Bu sayfanın yüklenmesini durdur' : 'Bu sayfayı yeniden yükle'} data-tip=${stop ? 'Durdur' : 'Yeniden yükle'}
      data-kbd=${stop ? '' : tb.kbd('nav.reload')} disabled=${!tab} onClick=${onClick} onContextMenu=${menu}>
      <span class="tb-swap" key=${icon}><${Icon} name=${icon} size=${20}/></span>
    </button>`;
  }

  /** Thin progress line under the address bar, driven by tab.progress; fades out when the load ends. */
  function LoadLine({ tab }) {
    const loading = !!(tab && tab.loading);
    const p = tab ? Math.max(0, Math.min(1, tab.progress || 0)) : 0;
    const gen = useRef(0);
    const was = useRef(false);
    if (loading && !was.current) gen.current += 1;
    was.current = loading;
    return html`<div key=${`${tab ? tab.id : 'x'}:${gen.current}`} class=${cx('tb-load', loading ? 'is-on' : 'is-off')} aria-hidden="true">
      <span class="tb-load-bar" style=${`transform:scaleX(${loading ? Math.max(p, 0.04) : p})`}></span>
    </div>`;
  }

  function Toolbar() {
    const tab = tb.useActiveTab();
    const ref = useRef();
    const [level, setLevel] = useState(0);
    const showHome = Vox.useStore('settings.appearance.showHomeButton') !== false;
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return undefined;
      const update = () => { const l = levelFor(el.clientWidth); tb.level = l; setLevel(l); };
      update();
      if (!window.ResizeObserver) { window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);
    const Omni = tb.Omnibox;
    return html`<div ref=${ref} class=${cx('tb', `tb--l${level}`)}>
      <div class="tb-nav">
        <${HistoryButton} tab=${tab} dir=${-1}/>
        ${level < 3 ? html`<${HistoryButton} tab=${tab} dir=${1}/>` : null}
        <${ReloadButton} tab=${tab}/>
        ${showHome && level < 1 ? html`<${IconButton} icon="house" label="Ana sayfa" cmd="nav.home" onClick=${() => Vox.nav.home()}/>` : null}
      </div>
      ${Omni ? html`<${Omni} tab=${tab} level=${level}/>` : null}
      <div class="tb-actions">
        ${level < 2 && tb.ExtensionsButton ? html`<${tb.ExtensionsButton}/>` : null}
        ${tb.DownloadsButton ? html`<${tb.DownloadsButton}/>` : null}
        ${level < 2 && tb.ProfileButton ? html`<${tb.ProfileButton}/>` : null}
        <${IconButton} icon="ellipsis-vertical" label="VoxBrowser’ı özelleştirin ve yönetin" data-tip="Menü" cmd="menu.open"
          data-anchor="menu" aria-haspopup="menu" class="tb-menubtn" onClick=${(e) => tb.openMenu({ keyboard: e.detail === 0 })}/>
      </div>
      <${LoadLine} tab=${tab}/>
    </div>`;
  }

  Vox.c.Toolbar = Toolbar;
});
