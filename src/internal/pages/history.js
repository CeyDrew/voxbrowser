/* VoxBrowser — vox://gecmis: arama, güne göre gruplar, üzerine gelince beliren onay kutularıyla çoklu seçim,
   alttan kayan seçim çubuğu, satır menüsü, geri alınabilir silme ve en çok ziyaret edilen siteler (gerçek geçmişten). */
Vox.define('pages.history', (Vox) => {
  const { html, useState, useMemo, useRef, useEffect } = Vox.p;
  const { Icon, Button, SearchField, EmptyState, MenuButton } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const pg = Vox.pg;

  const restore = (entries) => store.set('history', (h = []) => {
    const ids = new Set(h.map((e) => e.id));
    return [...h, ...entries.filter((e) => !ids.has(e.id))].sort((a, b) => b.ts - a.ts);
  });

  function Row({ h, i, q, selected, onToggle, menu, selecting }) {
    const title = h.title || pg.shortUrl(h.url);
    return html`<li class=${cx('pg-hi-row pg-enter', selected && 'is-sel')} data-flip-key=${h.id} style=${`--i:${i}`}
      onContextMenu=${(e) => { Vox.ui.contextMenu(e, menu()); }}
      onClick=${(e) => { if (selecting && !e.target.closest('a, button, input, label')) onToggle(e); }}>
      <span class="pg-hi-time">${Vox.fmt.time(h.ts)}</span>
      <span class="pg-hi-slot">
        <${pg.SiteIcon} url=${h.url} src=${h.favicon} label=${title} size=${20} class="pg-hi-fav"/>
        <label class="check pg-hi-check">
          <input type="checkbox" checked=${selected} aria-label=${`Seç: ${title}`} onClick=${(e) => onToggle(e)}/>
          <span class="check-box" aria-hidden="true"><${Icon} name="check" size=${14} stroke=${3}/></span>
        </label>
      </span>
      <a class="pg-hi-link" href=${h.url} title=${h.url}>
        <span class="pg-hi-title">${pg.highlight(title, q)}</span>
        <span class="pg-hi-host">${pg.highlight(pg.siteName(h.url), q)}</span>
      </a>
      <${MenuButton} icon="ellipsis-vertical" label=${`Diğer işlemler: ${title}`} size="sm" class="pg-hi-more" items=${menu}/>
    </li>`;
  }

  /** Most visited sites, counted from the real history entries. */
  function TopSites({ all, onPick }) {
    const top = useMemo(() => {
      const m = new Map();
      for (const e of all) {
        const host = pg.hostOf(e.url);
        if (!host) continue;
        const x = m.get(host) || { host, n: 0, url: e.url, favicon: null };
        x.n++;
        if (!x.favicon && e.favicon) x.favicon = e.favicon;
        m.set(host, x);
      }
      return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6);
    }, [all]);
    return html`<section class="pg-card pg-hi-side">
      <header class="pg-hi-side-head"><h2><${Icon} name="trending-up" size=${18}/>En çok ziyaret ettikleriniz</h2></header>
      ${top.length ? html`<ul class="pg-hi-mini">${top.map((t) => html`<li key=${t.host}>
          <button type="button" class="pg-hi-mini-row" onClick=${() => onPick(t.host)} title=${`Yalnızca ${t.host} sayfalarını göster`}>
            <${pg.SiteIcon} url=${t.url} src=${t.favicon} size=${18}/>
            <span class="pg-hi-mini-text"><b>${t.host.replace(/^www\./, '')}</b><small>${t.n} ziyaret</small></span>
            <${Icon} name="filter" size=${15} class="pg-hi-mini-go"/>
          </button></li>`)}</ul>`
        : html`<p class="pg-hi-side-empty">Gezdikçe en sık açtığınız siteler burada görünür.</p>`}
    </section>`;
  }

  function PrivacyCard() {
    return html`<section class="pg-card pg-hi-side">
      <header class="pg-hi-side-head"><h2><${Icon} name="shield-check" size=${18}/>Geçmişiniz sizde</h2></header>
      <p class="pg-hi-side-empty">Geçmiş yalnızca bu bilgisayarda saklanır. Gizli pencerelerde açtığınız sayfalar buraya hiç eklenmez.</p>
      <a class="pg-link pg-hi-side-more" href="vox://ayarlar/gizlilik/temizle"><${Icon} name="trash-2" size=${15}/>Tarama verilerini temizle</a>
    </section>`;
  }

  function HistoryPage({ query }) {
    const all = Vox.useStore('history') || [];
    const priv = Vox.useStore('window.private');
    const [q, setQ] = useState(query && query.q ? query.q : '');
    const [sel, setSel] = useState(() => new Set());
    const anchor = useRef(null);
    const listRef = useRef();
    pg.useNow(60000);

    const items = useMemo(() => (q.trim() ? all.filter((e) => pg.match(q, e.title, e.url)) : all), [all, q]);
    const inc = pg.useIncremental(items.length, 150, q);
    const groups = useMemo(() => {
      const m = new Map();
      for (const e of items.slice(0, inc.limit)) { const k = Vox.fmt.day(e.ts); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
      return Array.from(m, ([day, list]) => ({ day, list }));
    }, [items, inc.limit]);
    useEffect(() => {
      setSel((s) => {
        if (!s.size) return s;
        const ids = new Set(items.map((e) => e.id));
        const n = new Set([...s].filter((id) => ids.has(id)));
        return n.size === s.size ? s : n;
      });
    }, [items]);

    const toggle = (id, e) => {
      const range = e && e.shiftKey && anchor.current && anchor.current !== id;
      setSel((s) => {
        const n = new Set(s);
        if (range) {
          const ids = items.map((x) => x.id);
          const a = ids.indexOf(anchor.current), b = ids.indexOf(id);
          if (a >= 0 && b >= 0) {
            const on = !s.has(id);
            ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => (on ? n.add(x) : n.delete(x)));
            return n;
          }
        }
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
      });
      anchor.current = id;
    };
    const removeIds = async (ids) => {
      const set = new Set(ids);
      const entries = all.filter((e) => set.has(e.id));
      if (!entries.length) return;
      const root = listRef.current;
      const els = [];
      for (const g of groups) {
        if (g.list.every((e) => set.has(e.id))) els.push(root && root.querySelector(`[data-group="${g.day}"]`));
        else g.list.forEach((e) => set.has(e.id) && els.push(root && root.querySelector(`[data-flip-key="${e.id}"]`)));
      }
      await pg.collapseOut(els);
      Vox.history.remove(ids);
      setSel(new Set());
      pg.undoToast(entries.length === 1 ? 'Sayfa geçmişten kaldırıldı.' : `${entries.length} sayfa geçmişten kaldırıldı.`, () => restore(entries));
    };
    const openMany = (ids) => {
      const set = new Set(ids);
      const list = all.filter((e) => set.has(e.id));
      list.forEach((e, i) => Vox.tabs.open(e.url, { active: i === list.length - 1 }));
      setSel(new Set());
    };
    const rowMenu = (h) => () => [
      { label: 'Yeni sekmede aç', icon: 'external-link', onSelect: () => Vox.tabs.open(h.url) },
      { label: 'Bağlantıyı kopyala', icon: 'link', onSelect: () => pg.copyLink(h.url) },
      { label: 'Bu siteden daha fazlası', icon: 'filter', onSelect: () => setQ(pg.hostOf(h.url)) },
      '-',
      { label: 'Geçmişten kaldır', icon: 'trash-2', danger: true, onSelect: () => removeIds(sel.has(h.id) && sel.size > 1 ? [...sel] : [h.id]) },
    ];
    const onListKey = (e) => {
      const row = e.target.closest && e.target.closest('.pg-hi-row');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pg.moveFocus(listRef.current, e.key === 'ArrowDown' ? 1 : -1, '.pg-hi-link'); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); pg.moveFocus(listRef.current, e.key === 'Home' ? 'first' : 'last', '.pg-hi-link'); }
      else if (e.key === ' ' && row && e.target.classList.contains('pg-hi-link')) { e.preventDefault(); toggle(row.dataset.flipKey, e); }
      else if (e.key === 'Delete' && row) { e.preventDefault(); removeIds(sel.size ? [...sel] : [row.dataset.flipKey]); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); setSel(new Set(items.map((x) => x.id))); }
      else if (e.key === 'Escape' && sel.size) { e.preventDefault(); setSel(new Set()); }
    };

    const selecting = sel.size > 0;
    const searching = !!q.trim();
    const allSelected = selecting && sel.size === items.length;
    const oldest = all.length ? all.reduce((m, e) => Math.min(m, e.ts), Infinity) : 0;
    return html`<div class="pg-page pg-hi" onKeyDown=${pg.slashToSearch}>
      <div class="pg-wrap">
        <${pg.PageHeader} icon="history" title="Geçmiş" sub=${all.length ? `${Vox.fmt.num(all.length)} kayıt · ${Vox.fmt.date(oldest)} tarihinden beri` : null}
          search=${html`<${SearchField} value=${q} onInput=${setQ} placeholder="Geçmişte arayın"/>`}>
          <a class="btn btn--ghost btn--sm" href="vox://ayarlar/gizlilik/temizle" aria-label="Tarama verilerini temizle"><${Icon} name="trash-2" size=${16}/><span class="btn-label">Tarama verilerini temizle</span></a>
        <//>
        ${priv ? html`<p class="pg-note pg-note--honey"><${Icon} name="venetian-mask" size=${18}/>Bu gizli pencerede ziyaret ettiğiniz sayfalar geçmişe eklenmez.</p>` : null}
        <div class="pg-hi-layout">
          <div class="pg-hi-main">
            ${items.length ? html`<div class="pg-hi-tools">
                <span class="pg-count" aria-live="polite">${searching ? `"${q.trim()}" için ${Vox.fmt.num(items.length)} sonuç` : `${Vox.fmt.num(items.length)} sayfa`}</span>
                <button type="button" class="pg-link" onClick=${() => setSel(allSelected ? new Set() : new Set(items.map((x) => x.id)))}>${allSelected ? 'Seçimi kaldır' : 'Tümünü seç'}</button>
              </div>
              <div class=${cx('pg-hi-groups', selecting && 'is-selecting')} ref=${listRef} onKeyDown=${onListKey}>
                ${groups.map((g) => html`<section class="pg-card pg-hi-group" key=${g.day} data-group=${g.day} aria-label=${g.day}>
                  <h2 class="pg-hi-day">${g.day}</h2>
                  <ul class="pg-hi-list">${g.list.map((h, i) => html`<${Row} key=${h.id} h=${h} i=${i} q=${q} selected=${sel.has(h.id)} selecting=${selecting}
                      onToggle=${(e) => toggle(h.id, e)} menu=${rowMenu(h)}/>`)}</ul>
                </section>`)}
                ${inc.sentinel}
              </div>`
            : searching ? html`<div class="pg-card"><${EmptyState} icon="search-x" title=${`"${q.trim()}" için sonuç yok`} text="Başka bir kelime deneyin ya da sitenin adresini yazın."
                action=${html`<${Button} variant="secondary" onClick=${() => setQ('')}>Aramayı temizle<//>`}/></div>`
            : html`<div class="pg-card"><${EmptyState} icon="history" title="Geçmişiniz boş" text="Ziyaret ettiğiniz sayfalar burada gün gün listelenir."
                action=${html`<a class="btn btn--primary btn--md" href="vox://yeni-sekme/">Gezinmeye başlayın</a>`}/></div>`}
          </div>
          <aside class="pg-hi-aside" aria-label="Geçmiş özeti">
            <${TopSites} all=${all} onPick=${(host) => { setQ(host); window.scrollTo({ top: 0, behavior: Vox.motion.reduced() ? 'auto' : 'smooth' }); }}/>
            <${PrivacyCard}/>
          </aside>
        </div>
      </div>
      <${pg.BulkBar} count=${sel.size} onClear=${() => setSel(new Set())}>
        <${Button} variant="ghost" size="sm" icon="external-link" aria-label="Yeni sekmelerde aç" onClick=${() => openMany([...sel])}>Yeni sekmelerde aç<//>
        <${Button} variant="danger" size="sm" icon="trash-2" onClick=${() => removeIds([...sel])}>Sil<//>
      <//>
    </div>`;
  }

  Vox.pages.register({ url: 'vox://gecmis', title: 'Geçmiş', icon: 'history', component: HistoryPage });
});
