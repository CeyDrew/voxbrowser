/* voxi — denetleyici: yan panel durumu (ui.sidePanel), konuşma (voxi.messages, pencere başına), yanıt çipleri,
   komutlar (voxi.toggle/listen/ask, sidepanel.open/toggle/close) ve isteğe bağlı konuşma kaydı
   (settings.voxi.saveHistory → settings.ui.voxi.messages; gizli pencerelerde hiçbir zaman). */
Vox.define('voxi.core', (Vox) => {
  const store = Vox.store;
  const vx = Vox.vx;
  const { uid, sleep } = Vox.util;
  const PANELS = ['voxi', 'bookmarks', 'history', 'reading'];
  const ALIAS = { 'yer-imleri': 'bookmarks', bookmark: 'bookmarks', gecmis: 'history', 'okuma-listesi': 'reading', readingList: 'reading', readinglist: 'reading' };
  const norm = (id) => { const k = ALIAS[id] || id; return PANELS.includes(k) ? k : null; };
  const enabled = () => Vox.settings.get('voxi.enabled') !== false;

  function offToast() {
    Vox.ui.toast({
      icon: 'mic-off', title: 'Voxi kapalı.', text: ' Ayarlar › Voxi bölümünden yeniden açabilirsiniz.',
      action: { label: 'Aç', onClick: () => { Vox.settings.set('voxi.enabled', true); openPanel('voxi', { focus: true }); } },
    });
  }

  /* ── Yan panel ────────────────────────────────────────── */
  /** opts: { focus } moves keyboard focus into the panel, { query } pre-fills a list panel's search. */
  function openPanel(id, opts = {}) {
    const want = norm(id);
    let k = want || store.get('ui.vx.lastPanel') || 'voxi';
    if (k === 'voxi' && !enabled()) {
      if (want === 'voxi') { offToast(); return false; }
      k = 'bookmarks';
    }
    store.update((s) => ({
      ...s,
      ui: {
        ...s.ui,
        sidePanel: k,
        vx: {
          ...s.ui.vx, lastPanel: k,
          focus: opts.focus ? `${k}:${Date.now()}` : s.ui.vx.focus,
          query: opts.query != null ? { panel: k, q: String(opts.query), at: Date.now() } : s.ui.vx.query,
        },
      },
    }));
    return true;
  }
  function closePanel(opts = {}) {
    if (!store.get('ui.sidePanel')) return;
    store.set('ui.sidePanel', null);
    if (opts.focusPage !== false) Vox.nav.focusPage();
    // Panel kapanınca sesli okuma sürer; durdurma düğmesi görünür kalsın.
    if (vx.speech.speaking()) Vox.ui.toast({ icon: 'volume-2', text: 'Sesli okuma sürüyor.', duration: 8000, action: { label: 'Durdur', onClick: () => vx.speech.stop() } });
  }
  function togglePanel(id) {
    const cur = store.get('ui.sidePanel');
    if (cur && (!norm(id) || cur === norm(id))) closePanel();
    else openPanel(id, { focus: true });
  }

  /* ── Konuşma ──────────────────────────────────────────── */
  const push = (m) => { const msg = { id: uid('vm'), ts: Date.now(), ...m }; store.set('voxi.messages', (l = []) => [...l, msg].slice(-80)); return msg.id; };
  const patch = (id, p) => store.set('voxi.messages', (l = []) => l.map((m) => (m.id === id ? { ...m, ...p } : m)));
  let gen = 0; // clear() bekleyen yanıtları iptal eder

  async function ask(text) {
    const t = String(text || '').trim().slice(0, 500);
    if (!t) return;
    if (!enabled()) { offToast(); return; }
    if (store.get('ui.sidePanel') !== 'voxi') openPanel('voxi');
    const my = gen;
    push({ role: 'user', text: t });
    const pid = push({ role: 'voxi', pending: true });
    const t0 = performance.now();
    let reply;
    try { reply = await vx.intents.respond(t); } catch (e) {
      Vox.reportError('voxi:intent', e);
      reply = { tone: 'unsure', text: 'Bir şeyler ters gitti. Yeniden dener misiniz?' };
    }
    const rest = 280 - (performance.now() - t0); // "düşünüyor" noktaları bir an görünsün, titremesin
    if (rest > 0) await sleep(rest);
    if (my !== gen) return;
    const { effect, ...msg } = reply || {};
    patch(pid, { pending: false, fresh: true, ...msg });
    if (effect) { try { await effect(); } catch (e) { Vox.reportError('voxi:effect', e); } }
  }
  /** Adds a Voxi message that answers a chip rather than a typed question. */
  function say(reply) { const { effect, ...msg } = reply || {}; push({ role: 'voxi', fresh: true, ...msg }); }
  function clear() { gen++; vx.speech.stop(); store.set('voxi.messages', []); }
  /** Voice input arrives with on-device recognition in a later version: open Voxi with the honest note instead. */
  function listen() {
    if (!enabled()) { offToast(); return; }
    openPanel('voxi', { focus: true });
    store.set('ui.vx.voiceNote', Date.now());
  }

  /* ── Yanıt çipleri ────────────────────────────────────── */
  vx.runAction = (a) => {
    if (!a) return undefined;
    if (a.ask) return ask(a.ask);
    if (a.panel) return openPanel(a.panel, { focus: true });
    if (a.command) return Vox.commands.run(a.command, a.args);
    if (a.url) return vx.openUrl(a.url, a.where || 'auto');
    if (a.search) return vx.search(a.search);
    if (a.speak) return vx.speakText(a.speak, a.title);
    if (a.copy) {
      return vx.copy(a.copy).then((ok) => Vox.ui.toast(ok ? { icon: 'clipboard-check', text: 'Panoya kopyalandı.' } : { icon: 'clipboard-x', text: 'Panoya kopyalanamadı.' }));
    }
    const fn = a.fn && vx.actionFns && vx.actionFns[a.fn];
    return fn ? fn(a.arg) : undefined;
  };

  /* ── İsteğe bağlı konuşma kaydı ───────────────────────── */
  const KEY = 'ui.voxi.messages';
  const keep = () => !!Vox.settings.get('voxi.saveHistory') && !store.get('window.private');
  const slim = (m) => { const { fresh, pending, ...r } = m; if (r.actions) r.actions = r.actions.filter((a) => !a.fn); return r; };
  const saved = Vox.settings.get(KEY);
  if (keep() && Array.isArray(saved) && saved.length && !(store.get('voxi.messages') || []).length) store.set('voxi.messages', saved.slice(-50));
  const save = Vox.util.debounce(() => {
    if (keep()) Vox.settings.set(KEY, (store.get('voxi.messages') || []).filter((m) => !m.pending).map(slim).slice(-50));
  }, 1500);
  const voxiSet = (s) => (s.settings && s.settings.voxi) || {};
  store.subscribe((s, prev) => {
    const on = !!voxiSet(s).saveHistory, was = !!voxiSet(prev).saveHistory;
    if (on && s.voxi !== prev.voxi && (s.voxi || {}).messages !== (prev.voxi || {}).messages) save();
    // Ayar değişikliği başka bir görünümden gelmiş olabilir: yazmayı bir sonraki tike bırak (eşitleme sırasında yazılanlar gönderilmez).
    if (on !== was) setTimeout(() => { if (on) save(); else if ((Vox.settings.get(KEY) || []).length) Vox.settings.set(KEY, []); }, 0);
    if (voxiSet(prev).enabled !== false && voxiSet(s).enabled === false) {
      setTimeout(() => { vx.speech.stop(); if (store.get('ui.sidePanel') === 'voxi') closePanel({ focusPage: false }); }, 0);
    }
  });

  Vox.voxi = { ask, say, listen, clear, openPanel, closePanel, togglePanel, enabled, suggestions: () => vx.intents.suggestions() };

  const R = Vox.commands.register;
  R('voxi.toggle', { title: 'Voxi panelini aç/kapat', icon: 'audio-lines', run: () => {
    if (!enabled()) { offToast(); return; }
    if (store.get('ui.sidePanel') === 'voxi') closePanel(); else openPanel('voxi', { focus: true });
  } });
  R('voxi.listen', { title: 'Voxi ile konuş', icon: 'mic', run: listen });
  R('voxi.ask', { title: "Voxi'ye sor", icon: 'audio-lines', run: (a) => ask(a && a.text) });
  R('sidepanel.open', { title: 'Yan paneli aç', icon: 'panel-left-open', run: (a) => openPanel(a && a.id, { focus: true }) });
  R('sidepanel.toggle', { title: 'Yan paneli göster/gizle', icon: 'panel-left', run: (a) => togglePanel(a && a.id) });
  R('sidepanel.close', { title: 'Yan paneli kapat', icon: 'panel-left-close', run: () => closePanel() });
});
