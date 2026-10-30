/* VoxBrowser — site izin istekleri (permission.prompt).
   Bir site kamera, konum, bildirim… isteyince site düğmesine bağlı balon açılır: İzin ver / Engelle / Yalnızca bu sefer.
   Balonun dışına tıklanınca istek adres çubuğunda küçük bir çipe dönüşür (sayfa kullanılmaya devam eder); X ya da Esc = engelle
   (hatırlanmaz). İstek başka sekmedense o sekmeye geçilince gösterilir. Her istek mutlaka yanıtlanır: sekme kapanır, başka siteye
   geçilir ya da 85 sn dolarsa engellenir (ana süreç 90 sn'de kendisi engeller). */
Vox.define('toolbar.permission', (Vox) => {
  const { html } = Vox.p;
  const { Icon, IconButton, Button } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const tb = Vox.tb;
  const TIMEOUT = 85000;
  const WIGGLE = [{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg) scale(1.08)' }, { transform: 'rotate(11deg) scale(1.08)' },
    { transform: 'rotate(-7deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' }];

  /** { id, req, top (page origin when asked), state: 'new'|'open'|'chip', timer, done } */
  let items = [];
  let current = null; // { item, layerId }
  let n = 0;
  /* Çekirdek Esc ile katmanı değer vermeden kapatır; aynı tuş olayında burada not alınır, karar bir sonraki tikte verilir. */
  let escAt = 0;
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') escAt = Date.now(); }, true);

  const publish = () => store.set('ui.tb.permReqs', items.map((i) => ({ id: i.id, tabId: i.req.tabId, perm: i.req.perm, chip: i.state === 'chip' || (i.state === 'open' && i.viaChip) })));
  /** Remembers this session's answers for the address-bar chips. */
  const note = (origin, perm, value) => store.set('ui.tb.permUsed', (m = {}) => ({ ...m, [origin]: { ...(m[origin] || {}), [perm]: value } }));

  function settle(item, decision, remember) {
    if (item.done) return;
    item.done = true;
    clearTimeout(item.timer);
    items = items.filter((i) => i !== item);
    try { item.req.resolve(decision, remember); } catch (e) { Vox.reportError('permission.resolve', e); }
    publish();
    if (current && current.item === item) { const id = current.layerId; current = null; Vox.overlay.close(id, 'answered'); }
    setTimeout(pump, 260);
  }

  function add(req) {
    const tab = Vox.tabs.get(req.tabId);
    const item = { id: `pq${++n}`, req, top: tab ? tb.origin(tab.url) : '', state: 'new', done: false };
    item.timer = setTimeout(() => settle(item, 'block', false), TIMEOUT);
    items.push(item);
    publish();
    pump();
  }

  /** Shows the next new request of the active tab (waits while the user works in a dialog, menu or another panel). */
  function pump() {
    if (current || Vox.overlay.top(['dialog', 'menu', 'popover'])) return;
    const active = store.get('activeTabId');
    const item = items.find((i) => !i.done && i.state === 'new' && i.req.tabId === active);
    if (item) show(item);
  }

  function show(item, anchor) {
    const a = anchor instanceof Element && anchor.isConnected ? anchor : tb.anchor('siteinfo');
    if (!a) return;
    tb.closeOn(a);
    item.state = 'open';
    item.viaChip = !!anchor;
    publish();
    if (!anchor) Vox.motion.animate(a, WIGGLE, { duration: 640, easing: 'ease-in-out', fill: 'none' });
    const ctl = Vox.ui.popover({
      anchor: a, placement: 'bottom-start', width: 344, className: 'tb-pop tb-door', persistent: true, autoFocus: false,
      role: 'alertdialog', label: 'İzin isteği',
      render: ({ close }) => html`<${Prompt} item=${item} close=${close} anchor=${a}/>`,
      onClose: (v) => {
        if (current && current.item === item) current = null;
        if (item.done || v === 'answered') return;
        if (v === 'dismiss') { settle(item, 'block', false); return; }
        // Esc bu sefer engeller; dışarı tıklama, sekme değişimi ya da başka bir katmanın açılması isteği çipe küçültür.
        setTimeout(() => {
          if (item.done) return;
          if (v === undefined && Date.now() - escAt < 400) { settle(item, 'block', false); return; }
          item.state = 'chip';
          publish();
          setTimeout(pump, 260);
        }, 0);
      },
    });
    current = { item, layerId: ctl.id };
  }

  function Prompt({ item, close, anchor }) {
    tb.useOutsideClose(() => close('collapse'), anchor);
    const req = item.req;
    const m = tb.perm(req.perm);
    const host = Vox.url.parse(req.origin).host || req.origin;
    const top = item.top && item.top !== req.origin ? tb.host(item.top) : '';
    const decide = (decision, remember) => { note(item.top || req.origin, req.perm, decision); settle(item, decision, remember); };
    return html`<div class="tb-door-body">
      <div class="tb-door-head">
        <span class="tb-door-ic"><${Icon} name=${m.icon} size=${22}/></span>
        <p class="tb-door-text"><b>${host}</b> ${m.ask}${top ? html`<small>${top} sayfasına yerleştirilmiş içerik</small>` : null}</p>
        <${IconButton} icon="x" label="Kapat ve bu sefer engelle" size="sm" onClick=${() => close('dismiss')}/>
      </div>
      <div class="tb-door-actions">
        <${Button} variant="soft" onClick=${() => decide('block', true)}>Engelle<//>
        <${Button} variant="primary" onClick=${() => decide('allow', true)}>İzin ver<//>
        <${Button} variant="ghost" size="sm" class="tb-door-once" onClick=${() => decide('allow', false)}>Yalnızca bu sefer izin ver<//>
      </div>
    </div>`;
  }

  /** Reopens a collapsed request from its chip (or collapses it again when it is showing). */
  const reopen = (id, el) => {
    const item = items.find((i) => i.id === id && !i.done);
    if (!item) return;
    if (current && current.item === item) { Vox.overlay.close(current.layerId, 'collapse'); return; }
    if (current) Vox.overlay.close(current.layerId, 'collapse');
    show(item, el);
  };
  /** Used by the site button: collapses an open prompt instead of opening the site panel; true when it did. */
  tb.collapsePrompt = () => { if (!current) return false; Vox.overlay.close(current.layerId, 'collapse'); return true; };

  /* ── Adres çubuğu çipleri ─────────────────────────────── */
  const sameList = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => Vox.util.shallowEqual(x, b[i])));
  /** Waiting requests of the active tab that were put aside: a honey chip that reopens the prompt. */
  function RequestChip({ tab }) {
    const reqs = Vox.useStore((s) => (s.ui && s.ui.tb && s.ui.tb.permReqs) || [], sameList);
    const mine = tab ? reqs.filter((r) => r.tabId === tab.id && r.chip) : [];
    if (!mine.length) return null;
    const r = mine[0];
    const m = tb.perm(r.perm);
    const label = mine.length > 1 ? `${mine.length} izin isteği bekliyor` : `${m.label} izni isteniyor`;
    return html`<button type="button" class="tb-reqchip" aria-label=${`${label} — yanıtlamak için tıklayın`} data-tip=${label}
      onClick=${(e) => reopen(r.id, e.currentTarget)}>
      <${Icon} name=${m.icon} size=${16}/><span class="tb-reqchip-label">${mine.length > 1 ? `${mine.length} istek` : 'İzin isteği'}</span>
    </button>`;
  }

  /** This session's answers for the page's site (click → site information). */
  function PermChips({ tab }) {
    const origin = tab ? tb.origin(tab.url) : '';
    const used = Vox.useStore((s) => (origin && s.ui && s.ui.tb && s.ui.tb.permUsed ? s.ui.tb.permUsed[origin] || null : null));
    if (!used) return null;
    return Object.keys(used).slice(-2).map((perm) => {
      const m = tb.perm(perm);
      const blocked = used[perm] === 'block';
      const label = blocked ? `${m.label}: engellendi` : `${m.label}: izin verildi`;
      return html`<button type="button" key=${perm} class=${cx('tb-chipbtn tb-permchip', blocked && 'is-blocked')} aria-label=${label} data-tip=${label}
        onClick=${() => Vox.commands.run('siteinfo.open')}><${Icon} name=${blocked ? m.off : m.icon} size=${17}/></button>`;
    });
  }

  /* Sekme kapanınca ya da başka siteye geçince bekleyen istekler engellenir; sekme değişince balon küçülür. */
  store.subscribe((s, p) => {
    if (s.tabs === p.tabs && s.activeTabId === p.activeTabId) return;
    const gone = items.filter((i) => {
      const t = (s.tabs || []).find((x) => x.id === i.req.tabId);
      return !t || (i.top && tb.origin(t.url) !== i.top);
    });
    if (gone.length) setTimeout(() => gone.forEach((i) => settle(i, 'block', false)), 0);
    if (s.activeTabId !== p.activeTabId) {
      if (current && current.item.req.tabId !== s.activeTabId) { const id = current.layerId; setTimeout(() => Vox.overlay.close(id, 'collapse'), 0); }
      setTimeout(pump, 220);
    }
  });
  let pumpT = 0;
  Vox.overlay.subscribe(() => {
    if (current || !items.some((i) => i.state === 'new')) return;
    clearTimeout(pumpT);
    pumpT = setTimeout(pump, 200);
  });

  tb.RequestChip = RequestChip;
  tb.PermChips = PermChips;
  Vox.commands.register('permission.prompt', { title: 'İzin isteği', run: (req) => { if (req && typeof req.resolve === 'function') add(req); } });
});
