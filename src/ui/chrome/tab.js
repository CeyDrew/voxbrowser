/* chrome · tek sekme ve grup çipi. Sekme: site simgesi / yükleniyor (bekleme → yükleme) / ses / çöktü durumları,
   kapat düğmesi, açılışta genişleyerek belirme, kapanışta daralarak kaybolma, grup daralınca kapanma. */
Vox.define('chrome.tab', (Vox) => {
  const { html, useRef, useState, useLayoutEffect } = Vox.p;
  const { Icon, Favicon } = Vox.c;
  const { cx } = Vox.util;
  const ch = Vox.ch;

  /* Genişlik animasyonları max-width + dolgu + boşluk üzerinden; ölçü o anki doğal boyuttan alınır. */
  const measure = (el) => {
    const cs = getComputedStyle(el);
    return { w: el.offsetWidth, pl: cs.paddingLeft, pr: cs.paddingRight, mr: cs.marginRight };
  };
  const ZERO = { maxWidth: '0px', minWidth: '0px', paddingLeft: '0px', paddingRight: '0px', marginRight: '0px', opacity: 0 };
  const FULL = (m) => ({ maxWidth: `${m.w}px`, minWidth: '0px', paddingLeft: m.pl, paddingRight: m.pr, marginRight: m.mr, opacity: 1 });

  function TabIcon({ tab }) {
    if (tab.crashed) return html`<span class="ch-tab-ic is-crashed" key="crash"><${Icon} name="frown" size=${16}/></span>`;
    // Sunucu yanıtı beklenirken gri, sayfa çizilirken yeşil döner (ana süreç ilerlemeyi bildirir).
    if (tab.loading) return html`<span class=${cx('ch-spin', tab.progress < 0.3 && 'is-waiting')} key="spin" aria-hidden="true"></span>`;
    return html`<span class="ch-tab-ic" key=${`f:${tab.faviconUrl || (tab.favicon && (tab.favicon.icon || (tab.favicon.logo && 'logo'))) || ''}`}><${Favicon} spec=${tab.favicon} size=${16}/></span>`;
  }

  function Tab({ tab, active, group, groupEnd, collapsed, isNew, exiting, onExited, dragging, h, previews }) {
    const ref = useRef(null);
    const last = useRef(null);
    const was = useRef(collapsed);
    const [sizing, setSizing] = useState(!!isNew);

    useLayoutEffect(() => {
      const el = ref.current;
      if (!isNew || !el) return;
      const m = measure(el);
      el._chW = m.w;
      ch.anim(el, [ZERO, FULL(m)], { duration: 260 }).then(() => setSizing(false));
    }, []);

    useLayoutEffect(() => {
      const el = ref.current;
      if (!exiting || !el) return;
      ch.anim(el, [FULL(measure(el)), ZERO], { duration: 210, easing: ch.INOUT, fill: 'forwards' }).then(() => onExited(tab.id));
    }, [exiting]);

    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      if (was.current !== collapsed) {
        was.current = collapsed;
        if (collapsed) ch.anim(el, [FULL(last.current || measure(el)), ZERO], { duration: 230, easing: ch.INOUT });
        else {
          const m = measure(el);
          setSizing(true);
          ch.anim(el, [ZERO, FULL(m)], { duration: 280 }).then(() => setSizing(false));
        }
      }
      if (!collapsed && !exiting && !sizing) last.current = measure(el);
    });

    const title = tab.title || Vox.url.display(tab.url);
    const audio = tab.audible || tab.muted;
    const state = [
      tab.pinned && 'sabitlenmiş', tab.loading && 'yükleniyor', tab.crashed && 'çöktü',
      tab.muted ? 'sesi kapalı' : tab.audible && 'ses çalıyor', group && `grup: ${group.title || 'adsız'}`,
    ].filter(Boolean).join(', ');

    return html`<div ref=${ref} role="tab" id=${`ch-tab-${tab.id}`} data-tab-id=${tab.id} data-flip-key=${tab.id}
      class=${cx('ch-tab', active && 'is-active', tab.pinned && 'is-pinned', group && `in-group ch-g-${group.color}`, groupEnd && 'is-gend',
        collapsed && 'is-collapsed', exiting && 'is-exiting', sizing && 'is-sizing', dragging && 'is-dragging', tab.crashed && 'is-crashed')}
      aria-selected=${String(!!active)} aria-label=${state ? `${title} (${state})` : title} tabindex=${active ? '0' : '-1'}
      aria-hidden=${exiting || collapsed ? 'true' : undefined} data-tip=${previews ? undefined : title}
      onPointerDown=${(e) => h.down(e, tab)} onAuxClick=${(e) => h.aux(e, tab)} onContextMenu=${(e) => h.menu(e, tab)}
      onPointerEnter=${(e) => h.enter(e, tab)} onPointerLeave=${h.leave}>
      <span class="ch-tab-fav">
        <${TabIcon} tab=${tab}/>
        ${tab.pinned && audio ? html`<span class=${cx('ch-pin-audio', tab.muted && 'is-muted')}><${Icon} name=${tab.muted ? 'volume-x' : 'volume-2'} size=${10} stroke=${3}/></span>` : null}
      </span>
      ${tab.pinned ? null : html`<span class="ch-tab-title">${title}</span>`}
      ${!tab.pinned && audio ? html`<button type="button" tabindex="-1" class=${cx('ch-tab-btn ch-tab-audio', tab.muted ? 'is-muted' : 'is-playing')}
        aria-label=${tab.muted ? 'Sekmenin sesini aç' : 'Sekmenin sesini kapat'} data-tip=${tab.muted ? 'Sesi aç' : 'Sesi kapat'}
        onClick=${(e) => { e.stopPropagation(); Vox.tabs.mute(tab.id); }}><${Icon} name=${tab.muted ? 'volume-x' : 'volume-2'} size=${16}/></button>` : null}
      ${tab.pinned ? null : html`<button type="button" tabindex="-1" class="ch-tab-btn ch-tab-close" aria-label=${`Sekmeyi kapat: ${title}`}
        onClick=${(e) => { e.stopPropagation(); h.close(e, tab); }}><${Icon} name="x" size=${15} stroke=${2.5}/></button>`}
    </div>`;
  }

  /** Coloured chip in front of a group's tabs. Click: collapse/expand. Right-click: group menu. */
  function GroupChip({ group, count }) {
    const name = group.title || '';
    return html`<button type="button" data-group-id=${group.id} data-flip-key=${`g:${group.id}`}
      class=${cx('ch-chip', `ch-g-${group.color}`, group.collapsed && 'is-collapsed', !name && 'is-blank')}
      aria-expanded=${String(!group.collapsed)} aria-label=${`${name || 'Adsız grup'}: ${count} sekme`}
      data-tip=${group.collapsed ? 'Grubu genişlet' : 'Grubu daralt'}
      onClick=${() => { ch.preview.hide(); Vox.tabGroups.toggle(group.id); }}
      onContextMenu=${(e) => { e.preventDefault(); Vox.tabGroups.menu(group.id, e.currentTarget); }}>
      <span class="ch-chip-pill">
        ${name ? html`<span class="ch-chip-name">${name}</span>` : null}
        ${group.collapsed ? html`<span class="ch-chip-count">${count}</span>` : null}
      </span>
    </button>`;
  }

  ch.Tab = Tab;
  ch.GroupChip = GroupChip;
});
