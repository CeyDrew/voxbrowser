/* chrome · sekme arama (Ctrl+Shift+A): açık sekmeler (son kullanılana göre) ve son kapatılanlar arasında arama.
   ↑/↓ ile gezilir, Enter açar, Shift+Delete seçili sekmeyi kapatır. */
Vox.define('chrome.tabsearch', (Vox) => {
  const { html, useState, useRef, useLayoutEffect } = Vox.p;
  const { Icon, Favicon } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const ch = Vox.ch;

  // Ana süreç yalnızca en son kapatılanı geri açar (geçmişiyle). Daha eskiler adresinden açılır ve listeden burada düşülür.
  const reopened = new Set();
  const keyOf = (c) => `${c.closedAt}|${c.url}`;
  function reopen(entry) {
    const first = (store.get('closedTabs') || [])[0];
    if (first && keyOf(first) === keyOf(entry)) { Vox.tabs.reopenClosed(); return; }
    reopened.add(keyOf(entry));
    Vox.tabs.open(entry.url, { index: entry.index });
  }

  function TabSearch({ close }) {
    const tabs = Vox.useStore('tabs');
    const closed = Vox.useStore('closedTabs') || [];
    const groups = Vox.useStore('groups') || [];
    const activeId = Vox.useStore('activeTabId');
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(0);
    const listRef = useRef(null);

    const fq = ch.fold(q.trim());
    const hit = (o) => !fq || ch.fold(`${o.title || ''} ${o.url}`).includes(fq);
    const open = tabs.filter(hit).sort((a, b) => (b.id === activeId) - (a.id === activeId) || (b.lastActive || 0) - (a.lastActive || 0));
    const recent = closed.filter((c) => !reopened.has(keyOf(c)) && hit(c)).slice(0, 6);
    const rows = [...open.map((t) => ({ kind: 'open', t, key: t.id })), ...recent.map((c, i) => ({ kind: 'closed', c, key: `c${c.closedAt}-${i}` }))];
    const cur = Math.min(sel, Math.max(0, rows.length - 1));
    const gmap = new Map(groups.map((g) => [g.id, g]));

    useLayoutEffect(() => {
      const el = listRef.current && listRef.current.querySelector('.ch-ts-row.is-sel');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, [cur, q]);

    const choose = (r) => {
      if (!r) return;
      close();
      if (r.kind === 'open') Vox.tabs.activate(r.t.id); else reopen(r.c);
    };
    const onKey = (e) => {
      const n = rows.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (n) setSel((cur + (e.key === 'ArrowDown' ? 1 : -1) + n) % n); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(rows[cur]); }
      else if (e.key === 'Delete' && e.shiftKey && rows[cur] && rows[cur].kind === 'open') { e.preventDefault(); Vox.tabs.close(rows[cur].t.id); }
    };

    const body = [];
    rows.forEach((r, i) => {
      const isSel = i === cur;
      const common = { id: `ch-ts-${i}`, role: 'option', 'aria-selected': String(isSel), class: cx('ch-ts-row', isSel && 'is-sel'), onClick: () => choose(r), onPointerMove: () => { if (!isSel) setSel(i); } };
      if (i === 0 && r.kind === 'open') body.push(html`<div class="ch-ts-sec" key="h-open" role="presentation">Açık sekmeler <b>${open.length}</b></div>`);
      if (r.kind === 'closed' && (i === 0 || rows[i - 1].kind === 'open')) body.push(html`<div class="ch-ts-sec" key="h-closed" role="presentation">Son kapatılanlar</div>`);
      if (r.kind === 'open') {
        const t = r.t;
        const g = t.groupId && !t.pinned ? gmap.get(t.groupId) : null;
        body.push(html`<div key=${r.key} ...${common}>
          <span class=${cx('ch-ts-fav', t.id === activeId && 'is-now')}>${t.loading ? html`<span class="ch-spin"></span>` : html`<${Favicon} spec=${t.favicon} size=${18}/>`}</span>
          <span class="ch-ts-text">
            <span class="ch-ts-title">${ch.highlight(t.title || t.url, q)}</span>
            <span class="ch-ts-sub">
              ${g ? html`<span class=${cx('ch-ts-group', `ch-g-${g.color}`)}>${g.title || 'Adsız grup'}</span>` : null}
              ${t.pinned ? html`<${Icon} name="pin" size=${12}/>` : null}
              ${t.audible && !t.muted ? html`<${Icon} name="volume-2" size=${12}/>` : null}
              <span class="ch-ts-host">${ch.highlight(ch.hostLabel(t.url), q)}</span>
              ${t.id === activeId ? html`<span class="ch-ts-now">· şu anki sekme</span>` : null}
            </span>
          </span>
          <button type="button" class="ch-ts-x" tabindex="-1" aria-label=${`Sekmeyi kapat: ${t.title}`} data-tip="Sekmeyi kapat"
            onClick=${(e) => { e.stopPropagation(); Vox.tabs.close(t.id); }}><${Icon} name="x" size=${16}/></button>
        </div>`);
      } else {
        const c = r.c;
        body.push(html`<div key=${r.key} ...${common}>
          <span class="ch-ts-fav is-closed"><${Favicon} spec=${ch.faviconFor(c.url, c.favicon)} size=${18}/></span>
          <span class="ch-ts-text">
            <span class="ch-ts-title">${ch.highlight(c.title || c.url, q)}</span>
            <span class="ch-ts-sub"><span class="ch-ts-host">${ch.highlight(ch.hostLabel(c.url), q)}</span></span>
          </span>
          <span class="ch-ts-time">${Vox.fmt.rel(c.closedAt)}</span>
        </div>`);
      }
    });

    return html`<div class="ch-ts" onKeyDown=${onKey}>
      <div class="ch-ts-head">
        <${Icon} name="search" size=${18}/>
        <label class="sr-only" for="ch-ts-q">Sekmelerde ara</label>
        <input id="ch-ts-q" class="ch-ts-input" type="text" placeholder="Sekmelerde ara" value=${q} autocomplete="off" spellcheck="false"
          role="combobox" aria-expanded="true" aria-controls="ch-ts-list" aria-activedescendant=${rows.length ? `ch-ts-${cur}` : undefined}
          onInput=${(e) => { setQ(e.currentTarget.value); setSel(0); }}/>
        <span class="kbd"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd></span>
      </div>
      <div class="ch-ts-list" id="ch-ts-list" role="listbox" aria-label="Sekmeler" ref=${listRef}>
        ${rows.length ? body : html`<div class="ch-ts-empty"><${Icon} name="search-x" size=${26}/><b>Eşleşen sekme yok</b><span>“${q.trim()}” için açık ya da yeni kapatılmış sekme bulunamadı.</span></div>`}
      </div>
      <div class="ch-ts-foot" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> gezin</span><span><kbd>Enter</kbd> geç</span><span><kbd>Shift</kbd>+<kbd>Del</kbd> kapat</span>
      </div>
    </div>`;
  }

  Vox.commands.register('tab.search', {
    title: 'Sekmelerde ara', icon: 'search',
    run(a = {}) {
      if (ch.preview) ch.preview.hide();
      const anchor = (a.anchor instanceof Element && a.anchor) || document.querySelector('.ch-search-btn') || { x: innerWidth - 24, y: 56 };
      Vox.ui.popover({
        anchor, placement: 'bottom-end', width: Math.min(400, innerWidth - 24), className: 'ch-ts-pop', label: 'Sekmelerde ara', focusFirst: true,
        render: ({ close }) => html`<${TabSearch} close=${close}/>`,
      });
    },
  });
});
