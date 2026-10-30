/* VoxBrowser — yeni sekmenin büyük arama kutusu: yazarken yerel öneriler (yer imleri + geçmiş), "Adrese git" ve
   "<arama motoru> ile arayın" satırları. Gönderilen metni ana süreç çözer (adres mi, arama mı). */
Vox.define('pages.newtabSearch', (Vox) => {
  const { html, useState, useMemo } = Vox.p;
  const { Icon, IconButton } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const pg = Vox.pg;

  /** Suggestions for the typed text; noHistory (private window) leaves the browsing history out. */
  function suggest(q, noHistory) {
    const s = q.trim();
    if (!s) return [];
    const out = [];
    const target = pg.normalizeUrl(s);
    const eng = pg.engine();
    const search = { key: 'search', kind: 'search', url: pg.searchUrl(s), title: s, sub: eng ? `${eng.name} ile arayın` : 'Web’de arayın' };
    if (target) out.push({ key: 'go', kind: 'go', url: target, title: pg.shortUrl(target), sub: 'Adrese git' }, search);
    else out.push(search);
    const seen = new Set(out.map((o) => o.url));
    const lo = s.toLocaleLowerCase('tr-TR');
    const score = (p) => {
      const host = pg.siteName(p.url).toLocaleLowerCase('tr-TR');
      return (host.startsWith(lo) ? 0 : 2) + (p.kind === 'bm' ? 0 : 1);
    };
    const pool = [];
    Vox.bookmarks.walk((n) => { if (n.type === 'url' && pg.match(s, n.title, n.url)) pool.push({ url: n.url, title: n.title, kind: 'bm' }); return pool.length < 40; });
    for (const h of noHistory ? [] : store.get('history') || []) {
      if (pool.length >= 80) break;
      if (pg.match(s, h.title, h.url)) pool.push({ url: h.url, title: h.title || pg.shortUrl(h.url), kind: 'hi' });
    }
    pool.sort((a, b) => score(a) - score(b));
    for (const p of pool) {
      if (out.length >= 7) break;
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      out.push({ key: p.url, kind: p.kind, url: p.url, title: p.title, sub: pg.shortUrl(p.url) });
    }
    return out;
  }

  /** Big search box with a suggestion listbox (combobox pattern). Never autofocuses: the address bar has focus. */
  function SearchBox({ placeholder = 'Arayın ya da adres yazın', noHistory = false }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(-1);
    const lid = pg.useId('pgnts');
    const list = useMemo(() => suggest(q, noHistory), [q, noHistory]);
    const shown = open && list.length > 0;
    const go = (item) => {
      const text = q.trim();
      if (!item && !text) return;
      setOpen(false);
      Vox.nav.go(item ? item.url : text);
    };
    const onKeyDown = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!list.length) return;
        e.preventDefault();
        setOpen(true);
        const n = list.length;
        setHi((h) => (e.key === 'ArrowDown' ? (h + 1) % n : (h <= 0 ? n - 1 : h - 1)));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        go(shown && hi >= 0 ? list[hi] : null);
      } else if (e.key === 'Escape' && (shown || q)) {
        e.preventDefault();
        if (shown) setOpen(false); else setQ('');
      }
    };
    return html`<div class=${cx('pg-nt-search', shown && 'is-open')} role="search">
      <div class="pg-nt-field">
        <${Icon} name="search" size=${22}/>
        <label class="sr-only" for=${`${lid}-in`}>${placeholder}</label>
        <input id=${`${lid}-in`} type="text" role="combobox" aria-expanded=${String(shown)} aria-controls=${lid} aria-autocomplete="list"
          aria-activedescendant=${shown && hi >= 0 ? `${lid}-${hi}` : undefined} autocomplete="off" spellcheck="false"
          placeholder=${placeholder} value=${q}
          onInput=${(e) => { setQ(e.currentTarget.value); setOpen(true); setHi(-1); }}
          onFocus=${() => setOpen(true)} onBlur=${() => setTimeout(() => setOpen(false), 120)} onKeyDown=${onKeyDown}/>
        ${q ? html`<${IconButton} icon="x" label="Temizle" size="sm" onClick=${() => setQ('')}/>` : null}
        <${IconButton} icon="arrow-right" label="Git" variant="solid" class="pg-nt-go" disabled=${!q.trim()} onClick=${() => go(null)}/>
      </div>
      ${shown ? html`<ul class="pg-nt-sug" id=${lid} role="listbox" aria-label="Öneriler">
        ${list.map((it, i) => html`<li key=${it.key} id=${`${lid}-${i}`} role="option" aria-selected=${String(i === hi)} class=${cx('pg-nt-sug-item', i === hi && 'is-hi')}
            onPointerDown=${(e) => e.preventDefault()} onClick=${() => go(it)} onPointerMove=${() => hi !== i && setHi(i)}>
          <span class="pg-nt-sug-ic">${it.kind === 'search' ? html`<${Icon} name="search" size=${18}/>` : it.kind === 'go' ? html`<${Icon} name="globe" size=${18}/>` : html`<${pg.SiteIcon} url=${it.url} label=${it.title} size=${18}/>`}</span>
          <span class="pg-nt-sug-text"><b>${it.kind === 'search' || it.kind === 'go' ? it.title : pg.highlight(it.title, q)}</b><small>${it.sub}</small></span>
          ${it.kind === 'bm' ? html`<span class="pg-nt-sug-tag"><${Icon} name="star" size=${13}/>Yer imi</span>` : null}
          ${it.kind === 'hi' ? html`<span class="pg-nt-sug-tag"><${Icon} name="history" size=${13}/>Geçmiş</span>` : null}
        </li>`)}
      </ul>` : null}
    </div>`;
  }

  pg.SearchBox = SearchBox;
});
