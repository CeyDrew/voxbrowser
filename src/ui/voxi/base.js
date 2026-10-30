/* voxi — ortak yardımcılar: Türkçe metin katlama ve ayrıştırma (fiil çekimleri, nezaket sözcükleri),
   adres açma, arama adresi, site simgeleri, simgeli yer imi / okuma listesi ekleme, panoya kopyalama. */
Vox.define('voxi.base', (Vox) => {
  const store = Vox.store;
  const vx = (Vox.vx = Vox.vx || {});
  const { uid } = Vox.util;
  const { html } = Vox.p;

  store.set('ui.vx', (v) => ({ lastPanel: 'voxi', draft: '', speech: null, voiceNote: 0, focus: '', query: null, ...(v || {}) }));

  /** "Geliştirici Araçları'nı" → "gelistirici araclari ni": case/diacritic-insensitive matching. */
  vx.fold = (s) => String(s || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i')
    .replace(/[’'`´]/g, ' ').replace(/[^\p{L}\p{N}\s%/.,:+#&_-]/gu, ' ').replace(/[.,:]+(?=\s|$)/g, '')
    .replace(/\s+/g, ' ').trim();
  vx.clip = (s, n) => { const t = String(s || ''); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };
  vx.capFirst = (s) => (s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s);

  /* ── Ayrıştırma: "Voxi, YouTube'u açar mısın lütfen?" → "youtube u ac" ── */
  const FILLER = new Set(['lutfen', 'acaba', 'hemen', 'bana', 'hey', 'sunu', 'bakalim']);
  const PAIRS = [['rica', /^(etsem|ediyorum|ederim)$/], ['bir', /^zahmet$/], ['bi', /^zahmet$/], ['benim', /^icin$/]];
  const GREET = new Set(['merhaba', 'selam', 'selamlar', 'gunaydin']);
  const VOXI_SUFFIX = /^(yi|ye|ya|nin|cim|cigim|cugum)$/;
  const Q = /^m[iu]s[iu]n(iz)?$|^m[iu]$/;
  const VERB = new RegExp('^(ac|git|gir|ara|arat|bul|goster|getir|kapat|yenile|ozetle|oku|ekle|kaydet|sil|temizle|degistir|gec|yap|al|'
    + 'kopyala|durdur|dur|sabitle|cogalt|buyut|kucult|yakinlastir|uzaklastir|indir|sustur|anlat|soyle|cevir|kaldir|yazdir|yukle|'
    + 'tazele|cikar|sifirla|listele|dinle|bitir|baslat)(abilir|ebilir|yabilir|yebilir|ar|er|ir|ur|r|sana|sene|in|iniz|un|unuz|'
    + 'alim|elim|iver|ivir|uver)?(m[iu]s[iu]n(iz)?)?$');
  const SOFT = [[/^gid(er|elim|in|iniz|ebilir|eyim)(m[iu]s[iu]n(iz)?)?$/, 'git'], [/^kayded(er|elim|in|iniz|ebilir)(m[iu]s[iu]n(iz)?)?$/, 'kaydet']];
  const canon = (w) => {
    if (w.startsWith('gecmis')) return w;
    for (const [re, to] of SOFT) if (re.test(w)) return to;
    const m = w.match(VERB);
    return m ? m[1] : w;
  };

  /** → { raw, words (raw tokens), toks [{w, src, last, s, e}], f (normalized text), full (folded, unfiltered) } */
  vx.parse = (raw) => {
    const text = String(raw || '').trim();
    const words = text.split(/\s+/).filter(Boolean);
    const toks = [];
    words.forEach((word, src) => vx.fold(word).split(' ').filter(Boolean).forEach((w, k, arr) => toks.push({ w, src, last: k === arr.length - 1 })));
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], n = toks[i + 1];
      if (t.w === 'voxi') { if (n && n.src === t.src && VOXI_SUFFIX.test(n.w)) i++; continue; }
      if (FILLER.has(t.w) || (GREET.has(t.w) && !out.length && i < toks.length - 1)) continue;
      if (PAIRS.some(([a, b]) => a === t.w && n && b.test(n.w))) { i++; continue; }
      if (Q.test(t.w) && out.length) continue;
      out.push({ ...t, w: canon(t.w) });
    }
    let pos = 0;
    out.forEach((t) => { t.s = pos; t.e = pos + t.w.length; pos = t.e + 1; });
    return { raw: text, words, toks: out, f: out.map((t) => t.w).join(' '), full: vx.fold(text) };
  };

  /** The user's own words from token a to token b: "İstanbul'da" → "İstanbul" when only "istanbul" was taken. */
  vx.spanToks = (p, a, b) => {
    const ws = p.words.slice(a.src, b.src + 1);
    if (!b.last) ws[ws.length - 1] = ws[ws.length - 1].replace(/['’`´].*$/, '');
    return ws.join(' ').replace(/^[“"'‘(«]+|[”"'’)»?!.,:;]+$/g, '').trim();
  };
  /** The user's own words for a regex group (the regex needs the `d` flag). */
  vx.span = (p, m, g = 1) => {
    const ix = m && m.indices && m.indices[g];
    if (!ix) return (m && m[g]) || '';
    const [s, e] = ix;
    const ts = p.toks.filter((t) => t.s < e && t.e > s);
    return ts.length ? vx.spanToks(p, ts[0], ts[ts.length - 1]) : m[g] || '';
  };

  /* ── Sekmeler ve adresler ─────────────────────────────── */
  vx.activeTab = () => Vox.tabs.active();
  vx.hostOf = (url) => Vox.url.parse(url).host.replace(/^www\./, '');
  vx.isWeb = (t) => !!t && /^https?:/i.test(t.realUrl || t.url || '') && !t.crashed;
  vx.isNewTab = (t) => !!t && /^vox:\/\/yeni-sekme/i.test(t.realUrl || t.url || '');
  vx.isBlank = (t) => vx.isNewTab(t) || (!!t && /^about:blank/i.test(t.realUrl || ''));

  /** Navigates a tab without moving keyboard focus out of Voxi (main honours `focus:false` once supported). */
  vx.navigate = (tabId, url) => Vox.native.invoke('tabs:navigate', { tabId, input: url, focus: false })
    .catch((e) => { Vox.reportError('voxi:navigate', e); return false; });
  /** where: 'auto' (reuse a new-tab page, else new tab) | 'current' | 'new' | 'background' */
  vx.openUrl = (url, where = 'auto') => {
    const t = vx.activeTab();
    if (t && (where === 'current' || (where === 'auto' && vx.isBlank(t)))) return vx.navigate(t.id, url);
    return Vox.tabs.open(url, { active: where !== 'background' });
  };
  /** List rows: click → this tab · Ctrl/⌘ or middle click → background tab · Shift → new tab. */
  vx.openFrom = (url, e) => {
    if (e && (e.ctrlKey || e.metaKey || e.button === 1)) {
      Vox.tabs.open(url, { active: false });
      Vox.ui.toast({ icon: 'plus', text: 'Arka planda yeni sekmede açıldı.' });
    } else if (e && e.shiftKey) Vox.tabs.open(url);
    else { const t = vx.activeTab(); if (t) Vox.nav.go(url, { tabId: t.id }); else Vox.tabs.open(url); }
  };

  /* ── Arama motoru ─────────────────────────────────────── */
  const ENGINE_IN = { google: "Google'da", duckduckgo: "DuckDuckGo'da", bing: "Bing'de", yandex: "Yandex'te", brave: "Brave Search'te" };
  vx.engine = () => {
    const list = store.get('searchEngines') || [];
    return list.find((e) => e.id === store.get('settings.search.engine')) || list[0] || null;
  };
  vx.engineIn = () => { const e = vx.engine(); return e ? ENGINE_IN[e.id] || `${e.name} ile` : "web'de"; };
  vx.searchUrl = (q) => { const e = vx.engine(); return e && e.url ? e.url.replace('%s', encodeURIComponent(q)) : null; };
  vx.search = (q, where = 'auto') => { const u = vx.searchUrl(q); return u ? vx.openUrl(u, where) : Vox.nav.go(q); };

  /* ── Site simgeleri: kayıttaki simge, yoksa açık sekme ya da geçmişte görülen simge ── */
  const INTERNAL_ICON = {
    'yeni-sekme': { logo: true }, hakkinda: { logo: true }, ayarlar: { icon: 'settings' }, gecmis: { icon: 'history' },
    indirilenler: { icon: 'download' }, 'yer-imleri': { icon: 'book-marked' }, uzantilar: { icon: 'puzzle' }, surecler: { icon: 'activity' },
  };
  const okIcon = (f) => typeof f === 'string' && /^(https?:|data:image\/)/i.test(f);
  let favs = { h: null, t: null, url: new Map(), host: new Map() };
  vx.knownFavicon = (url) => {
    const h = store.get('history'), t = store.get('tabs');
    if (favs.h !== h || favs.t !== t) {
      const byUrl = new Map(), byHost = new Map();
      const add = (u, f) => {
        if (!u || !okIcon(f)) return;
        if (!byUrl.has(u)) byUrl.set(u, f);
        const ho = vx.hostOf(u);
        if (ho && !byHost.has(ho)) byHost.set(ho, f);
      };
      (t || []).forEach((x) => add(x.realUrl || x.url, x.faviconUrl));
      (h || []).forEach((e) => add(e.url, e.favicon));
      favs = { h, t, url: byUrl, host: byHost };
    }
    return favs.url.get(url) || favs.host.get(vx.hostOf(url)) || null;
  };
  vx.favSpec = (url, fav) => {
    if (okIcon(fav)) return { url: fav };
    const u = Vox.url.parse(url);
    if (u.scheme === 'vox') return INTERNAL_ICON[u.host] || { logo: true };
    const known = /^https?:/i.test(url || '') ? vx.knownFavicon(url) : null;
    return known ? { url: known } : { icon: 'globe' };
  };
  vx.Fav = ({ url, fav, size = 18 }) => html`<${Vox.c.Favicon} spec=${vx.favSpec(url, fav)} size=${size}/>`;

  /* ── Kaydetme (simgesiyle) ────────────────────────────── */
  vx.addBookmark = (t) => {
    const id = Vox.bookmarks.add({ url: t.url, title: t.title, parentId: 'bar' });
    if (okIcon(t.faviconUrl)) Vox.bookmarks.update(id, { favicon: t.faviconUrl });
    return id;
  };
  vx.addReading = (t) => {
    if (Vox.readingList.list().some((r) => r.url === t.url)) return false;
    const item = { id: uid('rl'), url: t.url, title: t.title || vx.hostOf(t.url), added: Date.now(), read: false };
    if (okIcon(t.faviconUrl)) item.favicon = t.faviconUrl;
    store.set('readingList', (l = []) => [item, ...l]);
    return true;
  };
  vx.copy = (text) => Vox.native.invoke('clipboard:write', { text: String(text || '') }).then(() => true, () => Vox.util.copy(text));

  /** Resolves when the tab has finished loading (or after `ms`). */
  vx.waitLoaded = (tabId, ms = 10000) => new Promise((resolve) => {
    const ok = () => { const t = Vox.tabs.get(tabId); return !t || !t.loading; };
    if (ok()) { resolve(true); return; }
    let off = () => {};
    const timer = setTimeout(() => { off(); resolve(false); }, ms);
    off = store.subscribe(() => { if (ok()) { clearTimeout(timer); off(); resolve(true); } });
  });
});
