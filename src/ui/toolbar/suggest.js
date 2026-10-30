/* VoxBrowser — adres çubuğu önerileri.
   tb.suggest(text, {resolved, remote}) → satırlar: yazdığınız (git / ara), açık sekmeler, yer imleri, geçmiş (sıklık+yakınlık),
   iç sayfalar, eylem, arama motoru önerileri ve (Voxi varsa) "Voxi'ye sor". @anahtar ile başka motorda arama.
   Adres çözümü (search:url) ve motor önerileri (search:suggest) ana süreçten gelir; burada önbelleğe alınır. */
Vox.define('toolbar.suggest', (Vox) => {
  const tb = Vox.tb;
  const store = Vox.store;

  /** Commands that need context, duplicate a page, or would be odd to offer from the address bar / palette. */
  tb.HIDDEN_COMMANDS = new Set(['menu.pageContext', 'menu.uiContext', 'permission.prompt', 'command.palette', 'omnibox.focus', 'nav.stop',
    'tab.next', 'tab.prev', 'window.minimize', 'window.maximize', 'window.close', 'devtools.open', 'devtools.console',
    'devtools.inspect', 'devtools.dock', 'app.quit']);

  tb.INTERNAL_PAGES = [
    { url: 'vox://ayarlar/', title: 'Ayarlar', icon: 'settings', keys: 'ayarlar tercihler secenekler settings' },
    { url: 'vox://gecmis/', title: 'Geçmiş', icon: 'history', keys: 'gecmis history' },
    { url: 'vox://indirilenler/', title: 'İndirilenler', icon: 'download', keys: 'indirilenler indirmeler downloads' },
    { url: 'vox://yer-imleri/', title: 'Yer imleri', icon: 'book-marked', keys: 'yer imleri favoriler bookmarks' },
    { url: 'vox://uzantilar/', title: 'Uzantılar', icon: 'puzzle', keys: 'uzantilar eklentiler extensions' },
    { url: 'vox://surecler/', title: 'Görev yöneticisi', icon: 'activity', keys: 'gorev yoneticisi surecler processes' },
    { url: 'vox://hakkinda/', title: 'VoxBrowser hakkında', icon: 'info', keys: 'hakkinda surum about' },
  ];

  /* ── Geçmiş tablosu: adres başına ziyaret sayısı + yakınlık ağırlığı (frecency) ── */
  const weight = (age) => { const d = age / 86400e3; return d < 4 ? 100 : d < 14 ? 70 : d < 31 ? 50 : d < 90 ? 30 : 10; };
  let histRef = null, histTable = [];
  function table() {
    const list = Vox.history.list();
    if (list === histRef) return histTable;
    histRef = list;
    const now = Date.now();
    const map = new Map();
    for (const h of list) {
      if (!h || !h.url) continue;
      let e = map.get(h.url);
      if (!e) { e = { url: h.url, title: h.title || '', favicon: h.favicon || null, ids: [], visits: 0, score: 0, last: h.ts || 0 }; map.set(h.url, e); }
      e.ids.push(h.id);
      e.visits += 1;
      if (!e.title && h.title) e.title = h.title;
      if (!e.favicon && h.favicon) e.favicon = h.favicon;
      if (e.visits <= 10) e.score += weight(now - (h.ts || 0));
      if ((h.ts || 0) > e.last) e.last = h.ts;
    }
    histTable = Array.from(map.values()).map((e) => ({ ...e, bare: tb.bare(e.url), key: tb.fold(`${e.title} ${tb.bare(e.url)}`) }))
      .sort((a, b) => b.score - a.score);
    return histTable;
  }
  tb.historyTable = table;
  // Geçmiş her ziyaretle değişir: tablo boşta önceden kurulur ki adres çubuğundaki ilk harf beklemesin.
  const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 50));
  let warmT = 0;
  const warm = () => { clearTimeout(warmT); warmT = setTimeout(() => idle(() => { table(); candidates(); }), 400); };
  store.subscribe((s, p) => { if (s.history !== p.history || s.bookmarks !== p.bookmarks) warm(); });
  warm();

  /* ── Satır içi tamamlama adayları: siteler (kök) ve sayfalar ── */
  let candRef = null, candList = [];
  function candidates() {
    const hist = table();
    const bm = store.get('bookmarks');
    if (candRef && candRef.hist === hist && candRef.bm === bm) return candList;
    const map = new Map();
    const add = (url, title, w, visits, fav) => {
      if (!tb.isWeb(url)) return;
      const b = tb.bare(url);
      const cur = map.get(b);
      if (cur) { cur.score += w; cur.visits += visits; if (!cur.title && title) cur.title = title; if (!cur.fav && fav) cur.fav = fav; }
      else map.set(b, { url, title, score: w, visits, bare: b, fav });
    };
    for (const e of hist) {
      add(e.url, e.title, e.score, e.visits, e.favicon);
      const u = Vox.url.parse(e.url);
      if (u.host) add(`${u.scheme}://${u.host}/`, null, e.score * 1.5, e.visits, e.favicon);
    }
    Vox.bookmarks.walk((n) => { if (n.type === 'url' && n.url) add(n.url, n.title, 120, 2, n.favicon); return true; });
    candList = Array.from(map.values()).filter((c) => c.visits >= 2);
    candRef = { hist, bm };
    return candList;
  }

  /** Best inline completion for `q`: { url, title, bare, rest, fav }. */
  function inlineFor(q) {
    if (!q || /\s/.test(q) || /^vox:/i.test(q)) return null;
    const withScheme = /^https?:\/\//i.test(q);
    const www = /^www\./i.test(q);
    const key = tb.fold(withScheme ? q : www ? q.slice(4) : q);
    let best = null;
    for (const c of candidates()) {
      const target = withScheme ? c.url : c.bare;
      if (target.length <= key.length || !tb.fold(target).startsWith(key)) continue;
      if (!best || c.score > best.score || (c.score === best.score && target.length < best.target.length)) best = { ...c, target };
    }
    if (!best) return null;
    return { url: best.url, title: best.title, bare: best.bare, fav: best.fav, rest: best.target.slice(key.length) };
  }

  /** Substring / all-words match on a page's title or address (no scattered subsequences). */
  const matchOf = (q, title, url) => {
    const a = tb.fuzzy(q, title || ''), b = tb.fuzzy(q, tb.bare(url));
    const sa = a && a.score >= 100 ? a.score : -1, sb = b && b.score >= 100 ? b.score * 0.9 : -1;
    if (sa < 0 && sb < 0) return null;
    return sa >= sb ? { score: sa, titleHits: a.hits } : { score: sb, subHits: b.hits };
  };
  const quick = (words, key) => words.every((w) => key.includes(w));

  function actionFor(q) {
    let best = null;
    for (const c of Vox.commands.list()) {
      if (!c.title || tb.HIDDEN_COMMANDS.has(c.id) || c.id.startsWith('open.')) continue;
      const m = tb.fuzzy(q, c.title);
      if (m && m.score >= 250 && (!best || m.score > best.m.score)) best = { c, m };
    }
    return best && { kind: 'action', command: best.c.id, icon: best.c.icon || 'zap', title: best.c.title, titleHits: best.m.hits, sub: 'Eylem', kbd: tb.kbd(best.c.id) };
  }

  /* ── Ana süreçten: adres çözümü ve motor önerileri (önbellekli) ── */
  const resolved = new Map();
  tb.resolvedFor = (q) => resolved.get(q);
  tb.resolveInput = (q) => {
    if (resolved.has(q)) return Promise.resolve(resolved.get(q));
    return Vox.native.invoke('search:url', { input: q }).then((u) => {
      if (resolved.size > 300) resolved.clear();
      resolved.set(q, u || null);
      return u || null;
    }, () => null);
  };
  const remote = new Map();
  let lastRemote = null;
  /** Engine suggestions for q; while a fetch is pending, the previous list filtered to what still matches. */
  tb.remoteFor = (q) => {
    if (remote.has(q)) return remote.get(q);
    if (!lastRemote || !q.startsWith(lastRemote.q)) return [];
    const k = tb.fold(q);
    return lastRemote.list.filter((s) => tb.fold(s).startsWith(k));
  };
  tb.fetchRemote = (q) => {
    if (remote.has(q)) return Promise.resolve(remote.get(q));
    return Vox.native.invoke('search:suggest', { q }).then((l) => {
      const list = Array.isArray(l) ? l.filter((s) => typeof s === 'string' && s.trim()).slice(0, 8) : [];
      if (remote.size > 200) remote.clear();
      remote.set(q, list);
      lastRemote = { q, list };
      return list;
    }, () => []);
  };

  /* ── Öneri listesi ────────────────────────────────────── */
  tb.suggest = (raw, opts = {}) => {
    const q = String(raw || '').trim();
    if (!q) return [];
    const rows = [];
    const byUrl = new Map();
    const push = (r) => {
      const key = r.id || (r.url ? `u:${r.url}` : `${r.kind}:${r.command || r.title}`);
      if (r.url && byUrl.has(r.url) && r.kind !== 'search') { if (r.tabId) byUrl.get(r.url).tabId = r.tabId; return; }
      if (rows.some((x) => x.id === key)) return;
      const row = { ...r, id: key };
      if (r.url && r.kind !== 'search') byUrl.set(r.url, row);
      rows.push(row);
    };

    // @anahtar: başka bir arama motoruyla ara
    const kw = tb.keyword(q);
    if (kw && kw.engine) {
      const text = kw.query.trim();
      push(text
        ? { kind: 'search', id: 'kw', url: tb.searchUrl(text, kw.engine), title: text, sub: `${tb.loc(kw.engine.name)} ara`, fill: q }
        : { kind: 'engine', id: 'kw', title: `${kw.engine.name} ile arayın`, sub: 'Aramak istediğinizi yazın', fill: q, engine: kw.engine });
      return rows;
    }
    if (kw && kw.partial) {
      const p = kw.partial.toLowerCase();
      for (const e of tb.engines()) {
        if (e.keyword && e.keyword.toLowerCase().startsWith(p)) push({ kind: 'engine', id: `k:${e.id}`, title: e.keyword, sub: `${e.name} ile ara`, fill: `${e.keyword} `, engine: e });
      }
      if (rows.length) return rows;
    }

    const res = opts.resolved;
    const isUrl = tb.urlish(q) || (typeof res === 'string' && !tb.engineOf(res));
    const where = `${tb.loc(tb.engineName())} ara`;
    const auto = inlineFor(q);
    if (auto) push({ kind: 'url', url: auto.url, fav: auto.fav, title: auto.title || auto.bare, sub: auto.title ? auto.bare : 'Siteye git', fill: q + auto.rest, inline: auto.rest });
    else if (isUrl) push({ kind: 'url', url: typeof res === 'string' ? res : q, title: q, sub: 'Siteye git', fill: q });
    if (!/^[a-z][a-z0-9+.-]*:/i.test(q)) push({ kind: 'search', id: 'typed', url: tb.searchUrl(q), title: q, sub: where, fill: q });

    // Sayfalar: sekmeler, yer imleri, geçmiş, iç sayfalar — puana göre en iyi dördü (motor önerisi yoksa altısı)
    const k = tb.fold(q);
    const words = k.split(/\s+/).filter(Boolean);
    const navs = [];
    const active = store.get('activeTabId');
    for (const t of Vox.tabs.all()) {
      if (t.id === active || tb.isNtp(t.url)) continue;
      const m = matchOf(q, t.title, t.url);
      if (m) navs.push({ s: m.score + 60, r: { kind: 'tab', url: t.url, tabId: t.id, fav: t.favicon, title: t.title, sub: tb.bare(t.url), fill: t.url, ...m } });
    }
    Vox.bookmarks.walk((n) => {
      if (n.type === 'url' && n.url) {
        const m = matchOf(q, n.title, n.url);
        if (m) navs.push({ s: m.score + 50, r: { kind: 'bookmark', url: n.url, fav: n.favicon, title: n.title || tb.bare(n.url), sub: tb.bare(n.url), fill: n.url, ...m } });
      }
      return true;
    });
    let hn = 0;
    for (const e of table()) {
      if (!quick(words, e.key)) continue;
      const m = matchOf(q, e.title, e.url);
      if (!m) continue;
      navs.push({ s: m.score + Math.min(60, e.score / 10), r: { kind: 'history', url: e.url, ids: e.ids, fav: e.favicon, title: e.title || e.bare, sub: e.bare, fill: e.url, ...m } });
      if (++hn >= 30) break;
    }
    if (k.length >= 2) {
      for (const p of tb.INTERNAL_PAGES) {
        const m = tb.fuzzy(q, p.title);
        const hit = (m && m.score >= 100) || p.keys.includes(k) || p.url.startsWith(k);
        if (hit) navs.push({ s: (m && m.score >= 100 ? m.score : 120) + 10, r: { kind: 'internal', url: p.url, icon: p.icon, title: p.title, sub: p.url, fill: p.url, titleHits: m && m.score >= 100 ? m.hits : null } });
      }
    }
    const remoteList = (opts.remote || []).filter((s) => tb.fold(s).trim() !== k);
    navs.sort((a, b) => b.s - a.s).slice(0, remoteList.length ? 4 : 6).forEach((x) => push(x.r));

    if (k.length >= 3) { const act = actionFor(q); if (act) push({ ...act, fill: q }); }
    if (!isUrl || remoteList.length) {
      remoteList.slice(0, Math.max(2, 8 - rows.length)).forEach((s) => push({ kind: 'search', id: `s:${s}`, url: tb.searchUrl(s), title: s, sub: where, fill: s, completes: q }));
    }
    const out = rows.slice(0, 9);
    if (!isUrl && Vox.commands.has('voxi.ask') && Vox.settings.get('voxi.enabled') !== false) out.push({ kind: 'voxi', id: 'voxi', title: q, sub: "Voxi'ye sor", fill: q });
    return out;
  };

  /** Rows for an empty, focused bar (↓ pressed): recently visited unique pages. */
  tb.zeroSuggest = () => {
    const out = [];
    const seen = new Set();
    for (const h of Vox.history.list()) {
      if (!h || seen.has(h.url)) continue;
      seen.add(h.url);
      const e = table().find((x) => x.url === h.url);
      out.push({ kind: 'history', id: `u:${h.url}`, url: h.url, ids: e ? e.ids : [h.id], fav: h.favicon || (e && e.favicon), title: h.title || tb.bare(h.url), sub: tb.bare(h.url), fill: h.url });
      if (out.length >= 6) break;
    }
    return out;
  };

  /** Runs a suggestion row: switch to tab, run an action, ask Voxi or open the address (here or in a new tab). */
  tb.runSuggestion = (r, { newTab } = {}) => {
    if (!r) return;
    if (r.kind === 'voxi') { tb.run('voxi.ask', { text: r.title }); return; }
    if (r.kind === 'action') { Vox.commands.run(r.command); return; }
    if (r.tabId && !newTab && Vox.tabs.get(r.tabId)) { Vox.tabs.activate(r.tabId); return; }
    if (r.url) tb.open(r.url, { newTab });
  };
});
