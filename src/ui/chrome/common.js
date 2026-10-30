/* chrome · ortak yardımcılar (Vox.ch): hareket, Türkçe dostu metin katlama, kısa adres etiketi, site simgesi,
   iyimser sekme sırası (şerit planı hemen gösterir, ana süreç onaylar), toplu kapatma + geri alma. */
Vox.define('chrome.common', (Vox) => {
  const { html } = Vox.p;
  const store = Vox.store;
  const ch = (Vox.ch = Vox.ch || {});

  ch.EASE = 'cubic-bezier(.22,1,.36,1)';
  ch.SPRING = 'cubic-bezier(.34,1.56,.64,1)';
  ch.INOUT = 'cubic-bezier(.65,0,.35,1)';

  /** el.animate() that honours reduced motion; always resolves (with the Animation, or null when skipped). */
  ch.anim = (el, frames, opts = {}) => {
    if (!el || !el.animate || Vox.motion.reduced()) return Promise.resolve(null);
    const a = el.animate(frames, { duration: 240, easing: ch.EASE, ...opts });
    return a.finished.then(() => a, () => a);
  };

  /* Katlama: büyük/küçük harf ve aksan duyarsız ("istanbul" → "İstanbul", "corba" → "Çorba").
     Her karakter tek karaktere dönüşür, böylece katlanmış metindeki konumlar asıl metinle aynı kalır. */
  const folded = new Map();
  function foldChar(c) {
    let f = folded.get(c);
    if (f !== undefined) return f;
    const low = c.toLocaleLowerCase('tr-TR');
    f = low.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (f === 'ı') f = 'i';
    if (f.length !== 1) f = low.length === 1 ? low : c;
    folded.set(c, f);
    return f;
  }
  ch.fold = (s) => {
    const str = String(s == null ? '' : s);
    let out = '';
    for (let i = 0; i < str.length; i++) out += foldChar(str[i]);
    return out;
  };

  /** Splits text into strings and <mark class="ch-hl"> parts around every (folded) match of q. */
  ch.highlight = (text, q) => {
    const t = String(text || '');
    const fq = ch.fold(String(q || '').trim());
    if (!fq) return t;
    const ft = ch.fold(t);
    const out = [];
    let i = 0;
    for (let j = ft.indexOf(fq); j >= 0; j = ft.indexOf(fq, i)) {
      if (j > i) out.push(t.slice(i, j));
      out.push(html`<mark class="ch-hl">${t.slice(j, j + fq.length)}</mark>`);
      i = j + fq.length;
    }
    if (i < t.length) out.push(t.slice(i));
    return out;
  };

  /** Form onKeyDown: Enter in a text field submits (forms with several fields have no implicit submit). */
  ch.enterSubmits = (submit) => (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); }
  };

  /** Short origin label: the host for web pages, "VoxBrowser" for vox:// pages. */
  ch.hostLabel = (url) => {
    const u = Vox.url.parse(url);
    if (u.scheme === 'vox') return 'VoxBrowser';
    if (u.host) return u.host.replace(/^www\./, '');
    return u.scheme ? `${u.scheme}:` : String(url || '');
  };

  /** Stable colour of a site (fallback art, letter icons): brand green for internal pages. */
  ch.tint = (url) => {
    const u = Vox.url.parse(url);
    if (!u.host || u.scheme === 'vox') return '#04A761';
    return Vox.util.hashColor(u.host.replace(/^www\./, ''));
  };

  const INTERNAL_ICONS = { ayarlar: 'settings', gecmis: 'history', indirilenler: 'download', 'yer-imleri': 'book-marked', uzantilar: 'puzzle', surecler: 'activity', hata: 'triangle-alert' };
  /** Favicon spec for a URL + optional favicon URL string (closed tabs, bookmarks). */
  ch.faviconFor = (url, favicon) => {
    if (favicon && /^(https?:|data:image\/)/i.test(favicon)) return { url: favicon };
    const u = Vox.url.parse(url);
    if (u.scheme === 'vox') return INTERNAL_ICONS[u.host] ? { icon: INTERNAL_ICONS[u.host] } : { logo: true };
    const host = (u.host || '').replace(/^www\./, '');
    if (!host) return { icon: 'globe' };
    return { letter: host[0].toLocaleUpperCase('tr-TR'), bg: Vox.util.hashColor(host), fg: '#FFFFFF' };
  };

  /* ── İyimser sıra ─────────────────────────────────────────
     Sekme sırası ana süreçte tutulur. Şerit yeni sırayı (plan) hemen gösterir; ana süreç aynı sırayı bildirince ya da
     1,5 sn sonra plan düşer. Sürüklerken plan "tutulur" ve ana sürece yalnızca bırakınca gönderilir. */
  let plan = null; // { ids, meta: Map(id → { groupId, pinned }), hold }
  let planTimer = 0;
  const planSubs = new Set();
  function setPlan(p) {
    plan = p;
    clearTimeout(planTimer);
    if (p && !p.hold) planTimer = setTimeout(() => setPlan(null), 1500);
    planSubs.forEach((f) => { try { f(); } catch (e) { Vox.reportError('chrome.plan', e); } });
  }
  const metaOf = (t) => ({ groupId: (!t.pinned && t.groupId) || null, pinned: !!t.pinned });
  const fits = (tabs, p) => tabs.length === p.ids.length && tabs.every((t, i) => {
    const m = p.meta.get(t.id);
    return t.id === p.ids[i] && (t.groupId || null) === m.groupId && !!t.pinned === m.pinned;
  });
  ch.plan = {
    get: () => plan,
    /** Shows `next` (tab objects) without telling the main process (while dragging). */
    show(next, hold = true) { setPlan(next ? { ids: next.map((t) => t.id), meta: new Map(next.map((t) => [t.id, metaOf(t)])), hold } : null); },
    clear: () => { if (plan) setPlan(null); },
    subscribe(fn) { planSubs.add(fn); return () => planSubs.delete(fn); },
  };
  /** Tabs as the strip should show them right now (pending plan applied). */
  ch.view = (tabs = store.get('tabs') || []) => {
    const p = plan;
    if (!p) return tabs;
    const by = new Map(tabs.map((t) => [t.id, t]));
    if (p.ids.length !== tabs.length || !p.ids.every((id) => by.has(id))) return tabs;
    return p.ids.map((id) => {
      const t = by.get(id), m = p.meta.get(id);
      return (t.groupId || null) !== m.groupId || !!t.pinned !== m.pinned ? { ...t, ...m } : t;
    });
  };
  store.subscribe((s, prev) => {
    if (plan && !plan.hold && s.tabs !== prev.tabs && fits(s.tabs || [], plan)) setPlan(null);
  });

  /** Applies a new order/grouping: shown at once, then sent to main (pin/group updates first, then the fewest moves).
      Main moves a tab itself when its pin changes (to the end of the pinned zone / the first normal slot): mirrored here. */
  ch.commit = (next) => {
    const base = ch.view();
    const by = new Map(base.map((t) => [t.id, t]));
    const sim = base.map((t) => t.id);
    const pinned = new Set(base.filter((t) => t.pinned).map((t) => t.id));
    ch.plan.show(next, false);
    for (const t of next) {
      const c = by.get(t.id);
      if (!c) continue;
      const m = metaOf(t), patch = {};
      if (!!c.pinned !== m.pinned) {
        patch.pinned = m.pinned;
        pinned.delete(t.id);
        sim.splice(sim.indexOf(t.id), 1);
        sim.splice(pinned.size, 0, t.id);
        if (m.pinned) pinned.add(t.id);
      }
      if ((c.groupId || null) !== m.groupId) patch.groupId = m.groupId;
      if (Object.keys(patch).length) Vox.tabs.update(t.id, patch);
    }
    next.forEach((t, k) => {
      if (sim[k] === t.id) return;
      const from = sim.indexOf(t.id);
      if (from < 0) return;
      sim.splice(from, 1);
      sim.splice(k, 0, t.id);
      Vox.tabs.move(t.id, k);
    });
  };

  /** Duplicate next to the original, keeping pin and group. */
  ch.duplicate = (id) => {
    const tabs = Vox.tabs.all();
    const i = tabs.findIndex((t) => t.id === id);
    const t = tabs[i];
    if (t) Vox.tabs.open(t.url, { index: i + 1, opener: id, pinned: t.pinned, groupId: t.pinned ? null : t.groupId });
  };

  /** Pin / unpin. Pinned tabs live at the start of the strip; a pinned tab leaves its group (as in other browsers). */
  ch.togglePin = (id, on) => {
    const tabs = ch.view();
    const t = tabs.find((x) => x.id === id);
    if (!t || (on !== undefined && !!on === !!t.pinned)) return;
    const rest = tabs.filter((x) => x.id !== id);
    rest.splice(rest.filter((x) => x.pinned).length, 0, { ...t, pinned: !t.pinned, groupId: null });
    ch.commit(rest);
  };

  /** Closes several tabs at once and offers to bring them all back (groups included). */
  ch.closeTabs = (ids, text) => {
    const tabs = Vox.tabs.all();
    const snap = [];
    tabs.forEach((t, index) => { if (ids.includes(t.id)) snap.push({ id: t.id, url: t.url, pinned: !!t.pinned, groupId: t.groupId || null, index }); });
    if (!snap.length) return;
    const groups = (store.get('groups') || []).filter((g) => snap.some((s) => s.groupId === g.id));
    const t0 = Date.now();
    // Son sekme de kapanırsa pencere kapanır; geri alabilmek için önce yeni bir sekme açılır.
    if (snap.length >= tabs.length) Vox.tabs.open('vox://yeni-sekme');
    // Sağdan sola: kaydedilen sıra numaraları geri açılışta aynı yerlere denk gelir.
    snap.slice().reverse().forEach((s) => Vox.tabs.close(s.id));
    Vox.ui.toast({
      icon: 'layers', duration: 6500,
      text: text || (snap.length === 1 ? 'Sekme kapatıldı.' : `${snap.length} sekme kapatıldı.`),
      action: { label: 'Geri al', onClick: () => restoreTabs(snap, groups, t0) },
    });
  };
  async function restoreTabs(snap, groups, t0) {
    const have = new Set((store.get('groups') || []).map((g) => g.id));
    const lost = groups.filter((g) => !have.has(g.id));
    if (lost.length) Vox.tabs.setGroups([...(store.get('groups') || []), ...lost.map((g) => ({ ...g, collapsed: false }))]);
    const asc = snap.slice().sort((a, b) => a.index - b.index);
    const keep = store.get('activeTabId');
    // Kapatılanlar listesinin başı tam olarak bu sekmelerse ana sürecin "yeniden aç"ı kullanılır (liste de temizlenir).
    const closed = store.get('closedTabs') || [];
    const ours = asc.every((s, k) => closed[k] && closed[k].url === s.url && closed[k].closedAt >= t0);
    for (const s of asc) {
      const id = ours ? await Vox.tabs.reopenClosed() : await Vox.tabs.open(s.url, { index: s.index, active: false, groupId: s.groupId });
      if (id && ours && (s.groupId || s.pinned)) Vox.tabs.update(id, { groupId: s.groupId, pinned: s.pinned });
    }
    if (keep && Vox.tabs.get(keep)) Vox.tabs.activate(keep);
  }
});
