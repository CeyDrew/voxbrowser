/* VoxBrowser — komut paleti (command.palette, Ctrl+K).
   Kayıtlı komutlar, açık sekmeler, yer imleri ve geçmiş üzerinde bulanık arama; ön ekler: > komut, @ sekme, * yer imi, # geçmiş.
   ↑↓ gezinme, Enter çalıştırma (Alt+Enter: adresi yeni sekmede aç), Esc kapatma; kısayollar sağda görünür. */
Vox.define('toolbar.palette', (Vox) => {
  const { html, useState, useRef, useMemo, useLayoutEffect } = Vox.p;
  const { Icon, Favicon, Kbd } = Vox.c;
  const { cx } = Vox.util;
  const tb = Vox.tb;

  const GROUPS = { cmd: 'Komutlar', tab: 'Açık sekmeler', bm: 'Yer imleri', hist: 'Geçmiş' };
  const PREFIX = { '>': 'cmd', '@': 'tab', '*': 'bm', '#': 'hist' };
  const SUGGESTED = ['tab.new', 'open.settings', 'devtools.toggle', 'theme.toggle', 'open.history', 'open.downloads', 'window.private', 'bookmark.toggleCurrent', 'help.shortcuts'];
  const recent = [];

  function collect() {
    const out = [];
    for (const c of Vox.commands.list()) {
      if (!c.title || tb.HIDDEN_COMMANDS.has(c.id)) continue;
      out.push({ id: `cmd:${c.id}`, g: 'cmd', icon: c.icon || 'zap', title: c.title, kbd: tb.kbd(c.id), run: () => Vox.commands.run(c.id) });
    }
    const active = Vox.store.get('activeTabId');
    for (const t of Vox.tabs.all()) {
      out.push({ id: `tab:${t.id}`, g: 'tab', fav: t.favicon, title: t.title || t.url, sub: tb.isNtp(t.url) ? 'Yeni sekme' : tb.bare(t.url), badge: t.id === active ? 'Bu sekme' : null, run: () => Vox.tabs.activate(t.id) });
    }
    Vox.bookmarks.walk((n) => {
      if (n.type === 'url' && n.url) out.push({ id: `bm:${n.id}`, g: 'bm', url: n.url, fav: n.favicon, title: n.title || tb.bare(n.url), sub: tb.bare(n.url) });
      return true;
    });
    for (const e of tb.historyTable().slice(0, 400)) {
      out.push({ id: `hist:${e.url}`, g: 'hist', url: e.url, fav: e.favicon, title: e.title || e.bare, sub: e.bare, hint: Vox.fmt.rel(e.last) });
    }
    return out;
  }

  /** → [{ key, title, items }] */
  function search(all, raw) {
    let q = raw.trim();
    let only = null;
    if (PREFIX[q[0]]) { only = PREFIX[q[0]]; q = q.slice(1).trim(); }
    const pool = only ? all.filter((x) => x.g === only) : all;
    if (!q) {
      if (only) return [{ key: only, title: GROUPS[only], items: pool.slice(0, 50) }];
      const ids = [...recent, ...SUGGESTED.map((id) => `cmd:${id}`)].filter((x, i, a) => a.indexOf(x) === i);
      const sug = ids.map((id) => pool.find((x) => x.id === id)).filter(Boolean).slice(0, 7);
      return [
        { key: 'sug', title: recent.length ? 'Son kullanılanlar ve öneriler' : 'Önerilenler', items: sug },
        { key: 'tab', title: GROUPS.tab, items: pool.filter((x) => x.g === 'tab').slice(0, 6) },
      ];
    }
    const hits = [];
    for (const x of pool) {
      const m = tb.fuzzy(q, x.title);
      if (m) { hits.push({ ...x, hits: m.hits, score: m.score + (x.g === 'cmd' ? 6 : x.g === 'tab' ? 4 : 0) }); continue; }
      const m2 = x.sub ? tb.fuzzy(q, x.sub) : null;
      if (m2 && m2.score >= 100) hits.push({ ...x, hits: null, score: m2.score * 0.6 });
    }
    const byGroup = {};
    for (const h of hits) (byGroup[h.g] = byGroup[h.g] || []).push(h);
    return Object.keys(byGroup)
      .map((g) => ({ key: g, title: GROUPS[g], items: byGroup[g].sort((a, b) => b.score - a.score).slice(0, only ? 50 : g === 'hist' ? 5 : 6) }))
      .sort((a, b) => b.items[0].score - a.items[0].score);
  }

  function ItemIcon({ x }) {
    if (x.g === 'tab') return html`<${Favicon} spec=${x.fav} size=${16}/>`;
    if (x.g === 'bm' || x.g === 'hist') return html`<${Favicon} spec=${tb.favFor(x.url, x.fav)} size=${16}/>`;
    return html`<${Icon} name=${x.icon} size=${18}/>`;
  }

  function Palette({ close }) {
    const all = useMemo(collect, []);
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(0);
    const sections = useMemo(() => search(all, q), [q]);
    const flat = sections.reduce((a, s) => a.concat(s.items), []);
    const listRef = useRef();
    useLayoutEffect(() => {
      const el = listRef.current && listRef.current.querySelector('.tb-pal-item.is-sel');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, [sel, q]);
    const run = (x, newTab) => {
      if (!x) return;
      const i = recent.indexOf(x.id);
      if (i >= 0) recent.splice(i, 1);
      recent.unshift(x.id);
      recent.length = Math.min(recent.length, 4);
      close();
      setTimeout(() => (x.run ? x.run() : tb.open(x.url, { newTab })), 40);
    };
    const searchWeb = () => { const t = q.replace(/^[>@*#]/, '').trim(); if (!t) return; close(); setTimeout(() => Vox.tabs.open(tb.searchUrl(t)), 40); };
    const onKey = (e) => {
      const n = flat.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (n) setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
      } else if (e.key === 'PageDown' || e.key === 'PageUp') {
        e.preventDefault();
        if (n) setSel((s) => Math.max(0, Math.min(n - 1, s + (e.key === 'PageDown' ? 6 : -6))));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (n) run(flat[Math.min(sel, n - 1)], e.altKey || e.ctrlKey); else searchWeb();
      }
    };
    let idx = -1;
    return html`<div class="tb-pal">
      <div class="tb-pal-search">
        <${Icon} name="search" size=${20}/>
        <input class="tb-pal-input" type="text" value=${q} data-autofocus=${true} autocomplete="off" spellcheck=${false}
          placeholder="Komut, sekme, yer imi ya da geçmiş arayın" aria-label="Komut paleti" role="combobox" aria-expanded="true"
          aria-controls="tb-pal-list" aria-activedescendant=${flat.length ? `tb-pal-${Math.min(sel, flat.length - 1)}` : undefined}
          onInput=${(e) => { setQ(e.currentTarget.value); setSel(0); }} onKeyDown=${onKey}/>
        <${Kbd} keys="Esc"/>
      </div>
      <div class="tb-pal-list" id="tb-pal-list" role="listbox" aria-label="Sonuçlar" ref=${listRef}>
        ${flat.length ? sections.map((s) => (s.items.length ? html`<div class="tb-pal-sec" role="group" aria-label=${s.title} key=${s.key}>
          <div class="tb-pal-h" aria-hidden="true">${s.title}</div>
          ${s.items.map((x) => {
            idx += 1;
            const i = idx;
            return html`<div id=${`tb-pal-${i}`} key=${x.id} role="option" aria-selected=${String(i === sel)} class=${cx('tb-pal-item', i === sel && 'is-sel')}
              style=${`--i:${Math.min(i, 12)}`} onMouseMove=${() => { if (i !== sel) setSel(i); }} onClick=${(e) => run(x, e.altKey || e.ctrlKey)}>
              <span class=${cx('tb-pal-ic', `is-${x.g}`)}><${ItemIcon} x=${x}/></span>
              <span class="tb-pal-title">${x.hits ? tb.mark(x.title, x.hits) : x.title}</span>
              ${x.sub ? html`<span class="tb-pal-sub">${x.sub}</span>` : null}
              ${x.hint ? html`<span class="tb-pal-hint">${x.hint}</span>` : null}
              ${x.badge ? html`<span class="badge badge--brand">${x.badge}</span>` : null}
              ${x.kbd ? html`<${Kbd} keys=${x.kbd}/>` : null}
            </div>`;
          })}
        </div>` : null)) : html`<div class="tb-pal-empty">
          <span class="tb-pal-empty-ic"><${Icon} name="search-x" size=${26}/></span>
          <p>“${q.replace(/^[>@*#]/, '').trim()}” için sonuç yok.</p>
          ${q.replace(/^[>@*#]/, '').trim() ? html`<button type="button" class="btn btn--secondary btn--sm" onClick=${searchWeb}>${tb.loc(tb.engineName())} ara</button>` : null}
        </div>`}
      </div>
      <footer class="tb-pal-foot" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> gezin</span><span><kbd>Enter</kbd> çalıştır</span>
        <span class="tb-pal-pfx"><kbd>${'>'}</kbd> komut <kbd>@</kbd> sekme <kbd>*</kbd> yer imi <kbd>#</kbd> geçmiş</span>
      </footer>
    </div>`;
  }

  tb.openPalette = () => {
    const open = Vox.overlay.list().find((l) => l.kind === 'dialog' && l.className === 'tb-palette' && !l.closing);
    if (open) { Vox.overlay.close(open.id); return; }
    Vox.ui.closeAll();
    Vox.ui.dialog({ title: 'Komut paleti', className: 'tb-palette', width: 640, actions: [], render: ({ close }) => html`<${Palette} close=${close}/>` });
  };
  Vox.commands.register('command.palette', { title: 'Komut paleti', icon: 'command', run: () => tb.openPalette() });
});
