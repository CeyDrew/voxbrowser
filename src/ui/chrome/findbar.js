/* chrome · sayfada bul (Vox.c.FindBar; Ctrl+F, F3 / Shift+F3, Ctrl+G / Ctrl+Shift+G): araç çubuğunun altında açılan
   bir şerit (sayfanın üstüne binmez, sayfayı biraz aşağı iter). Arama Chromium'un sayfa içi bulmasıyla yapılır:
   eşleşmeler sayfada vurgulanır, sayaç ana süreçten gelir (find:result). Enter / Shift+Enter: sonraki / önceki,
   Esc: kapat (vurgular temizlenir, odak sayfaya döner). Her sekme kendi aramasını hatırlar. */
Vox.define('chrome.findbar', (Vox) => {
  const { html, useState, useRef, useEffect } = Vox.p;
  const { Icon, IconButton } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const ch = Vox.ch;
  const PF = Vox.pageFind;

  const perTab = new Map(); // tabId → { text, matchCase, result, url } (çubuk o sekmede açıkken)
  let text = '';
  let matchCase = false;
  let wantFocus = false;    // çubuk açılınca giriş kutusu odak alsın
  let result = null;        // { tabId, ordinal, matches, final }
  const subs = new Set();
  const emit = () => subs.forEach((f) => f());
  const setResult = (r) => { result = r; emit(); };
  const isOpen = () => !!store.get('ui.findOpen');
  const activeId = () => store.get('activeTabId');

  /* Yeni metin (ya da büyük/küçük harf değişimi) yeni bir arama oturumu açar: Chromium son eşleşmenin yerinden başlar,
     böylece yazdıkça vurgu yerinde kalır. Sonraki/önceki aynı oturumu sürdürür (findNext). */
  function search(tabId, q, { next = false, forward = true } = {}) {
    if (!tabId) return;
    if (!q) { PF.stop(tabId, 'clearSelection'); setResult(null); return; }
    PF.start(q, { tabId, forward, matchCase, findNext: next });
  }
  const step = (dir) => search(activeId(), text, { next: true, forward: dir > 0 });

  // Yeni oturumun ilk yanıtı çoğu zaman "0 eşleşme"dir, gerçek sayı hemen ardından gelir: sıfır biraz bekletilir.
  let zeroT = 0, lastAt = 0;
  Vox.bus.on('find:result', (r) => {
    if (!r || r.tabId !== activeId() || !isOpen() || !text) return;
    lastAt = Date.now();
    const res = { tabId: r.tabId, ordinal: r.activeMatchOrdinal || 0, matches: r.matches || 0, final: !!r.finalUpdate };
    clearTimeout(zeroT);
    if (res.matches) setResult(res); else zeroT = setTimeout(() => setResult(res), 160);
  });

  /** a: { text } doldurup arar (ör. Voxi: "bu sayfada X bul"); { focus:false } odağı çağıranda bırakır. */
  function openBar(a = {}) {
    const wasOpen = isOpen();
    const pre = typeof a.text === 'string' ? a.text.trim().slice(0, 300) : '';
    wantFocus = a.focus !== false;
    if (pre) text = pre;
    if (!wasOpen) store.set('ui.findOpen', true);
    if (text && (pre || !wasOpen)) search(activeId(), text);
    Vox.bus.emit(wantFocus ? 'chrome:find-focus' : 'chrome:find-sync');
  }
  function closeBar() {
    if (!isOpen()) return;
    const id = activeId();
    PF.stop(id, 'clearSelection');
    perTab.delete(id);
    const inBar = document.activeElement && document.activeElement.id === 'ch-find-q';
    store.set('ui.findOpen', false);
    setResult(null);
    if (inBar) Vox.nav.focusPage(id);
  }

  // Sekme değişince: eski sekmenin araması (sonucuyla) saklanır; dönülünce aynen geri gelir. Sekme bu arada başka
  // sayfaya geçtiyse aynı metin yeniden aranır. Çubuğu hiç açılmamış sekmede çubuk kapanır.
  const urlOf = (id) => (Vox.tabs.get(id) || {}).realUrl;
  store.subscribe((s, p) => {
    if (s.activeTabId === p.activeTabId) return;
    if (p.activeTabId && p.ui && p.ui.findOpen) perTab.set(p.activeTabId, { text, matchCase, result: result && result.tabId === p.activeTabId ? result : null, url: urlOf(p.activeTabId) });
    const saved = perTab.get(s.activeTabId);
    queueMicrotask(() => {
      setResult(null);
      if (saved) {
        text = saved.text;
        matchCase = saved.matchCase;
        if (!isOpen()) store.set('ui.findOpen', true);
        Vox.bus.emit('chrome:find-sync');
        if (saved.result && saved.url === urlOf(s.activeTabId)) setResult(saved.result);
        else if (text) search(s.activeTabId, text);
      } else if (isOpen()) store.set('ui.findOpen', false);
    });
  });
  // Sekmede yeni sayfa açılınca eski sonuçlar düşer. Chromium açık oturumu yeni sayfada çoğu zaman kendisi yeniler;
  // yükleme bitince sonuç gelmediyse aynı metin sessizce yeniden aranır.
  let navKey = '', research = null;
  store.subscribe((s, p) => {
    if (s.tabs === p.tabs) return;
    const ids = new Set((s.tabs || []).map((t) => t.id));
    for (const id of Array.from(perTab.keys())) if (!ids.has(id)) perTab.delete(id);
    const t = (s.tabs || []).find((x) => x.id === s.activeTabId);
    if (!t) return;
    const k = `${t.id}|${t.realUrl}`;
    if (k !== navKey) {
      const same = navKey.startsWith(`${t.id}|`);
      navKey = k;
      if (same) { research = t.id; if (result) setResult(null); }
    }
    if (research === t.id && !t.loading) {
      research = null;
      const done = Date.now();
      if (isOpen() && text) setTimeout(() => { if (isOpen() && activeId() === t.id && lastAt < done - 50) search(t.id, text); }, 450);
    }
  });

  const keep = (e) => e.preventDefault(); // düğmeye basınca odak giriş kutusunda kalsın

  function FindBar() {
    const open = Vox.useStore('ui.findOpen');
    const [, redraw] = useState(0);
    const [q, setQ] = useState(text);
    const [phase, setPhase] = useState(open ? 'in' : 'off');
    const inputRef = useRef(null);
    const fieldRef = useRef(null);
    const timer = useRef(0);
    const wasNone = useRef(false);

    useEffect(() => { const f = () => redraw((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
    useEffect(() => {
      if (open) { setPhase('in'); setQ(text); return undefined; }
      setPhase((v) => (v === 'off' ? v : 'out'));
      const t = setTimeout(() => setPhase('off'), Vox.motion.reduced() ? 0 : 200);
      return () => clearTimeout(t);
    }, [open]);
    const focusInput = () => requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      wantFocus = false;
      el.focus({ preventScroll: true });
      el.select();
    });
    // İlk açılışta çubuk henüz çizilmemiştir: odak, giriş kutusu oluşunca verilir.
    useEffect(() => { if (open && wantFocus) focusInput(); }, [open, phase]);
    Vox.useBus('chrome:find-focus', () => { setQ(text); focusInput(); });
    Vox.useBus('chrome:find-sync', () => setQ(text));
    useEffect(() => () => clearTimeout(timer.current), []);

    const onInput = (e) => {
      const v = e.currentTarget.value;
      setQ(v);
      text = v;
      clearTimeout(timer.current);
      if (!v) { search(activeId(), ''); return; }
      timer.current = setTimeout(() => search(activeId(), text), v.length < 3 ? 140 : 60);
    };
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (text) step(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeBar(); }
    };
    const toggleCase = () => {
      matchCase = !matchCase;
      redraw((x) => x + 1);
      if (text) search(activeId(), text);
    };

    // Sonuç yoksa kutu hafifçe sallanır (boş metinde "sonuç yok" gösterilmez).
    const r = result && result.tabId === activeId() ? result : null;
    const none = !!q && !!r && r.final && r.matches === 0;
    useEffect(() => {
      if (none && !wasNone.current) ch.anim(fieldRef.current, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 340 });
      wasNone.current = none;
    }, [none]);

    if (!open && phase === 'off') return null;
    const count = q && r ? `${r.matches ? r.ordinal : 0}/${r.matches}` : '';
    const has = !!(r && r.matches);
    return html`<div class=${cx('ch-findrow', !open && 'is-out')}>
      <div class="ch-findrow-clip">
        <div class=${cx('ch-find', none && 'is-none')} role="search" aria-label="Sayfada bul">
          <div class="ch-find-field" ref=${fieldRef}>
            <${Icon} name="search" size=${18}/>
            <label class="sr-only" for="ch-find-q">Sayfada bul</label>
            <input id="ch-find-q" ref=${inputRef} class="ch-find-input" type="text" placeholder="Sayfada bul" value=${q} autocomplete="off" spellcheck="false"
              onInput=${onInput} onKeyDown=${onKey}/>
            <output class="ch-find-count" for="ch-find-q" aria-live="polite">${none ? 'Sonuç yok' : count}</output>
          </div>
          <span class="ch-find-sep" aria-hidden="true"></span>
          <${IconButton} icon="case-sensitive" label="Büyük/küçük harfe duyarlı" size="sm" class="ch-find-case" active=${matchCase} onMouseDown=${keep} onClick=${toggleCase}/>
          <${IconButton} icon="chevron-up" label="Önceki eşleşme" kbd="Shift+Enter" size="sm" disabled=${!has} onMouseDown=${keep} onClick=${() => step(-1)}/>
          <${IconButton} icon="chevron-down" label="Sonraki eşleşme" kbd="Enter" size="sm" disabled=${!has} onMouseDown=${keep} onClick=${() => step(1)}/>
          <${IconButton} icon="x" label="Kapat" kbd="Esc" size="sm" onClick=${closeBar}/>
        </div>
      </div>
    </div>`;
  }
  Vox.c.FindBar = FindBar;

  const R = Vox.commands.register;
  R('find.open', { title: 'Sayfada bul', icon: 'search', run: (a) => openBar(a || {}) });
  R('find.next', { title: 'Sonraki eşleşme', icon: 'chevron-down', run: () => (isOpen() && text ? step(1) : openBar()) });
  R('find.prev', { title: 'Önceki eşleşme', icon: 'chevron-up', run: () => (isOpen() && text ? step(-1) : openBar()) });
  R('find.close', { title: 'Bul çubuğunu kapat', icon: 'x', run: closeBar });
  Vox.keys.bind(['F3', 'Ctrl+G'], 'find.next');
  Vox.keys.bind(['Shift+F3', 'Ctrl+Shift+G'], 'find.prev');
  Vox.keys.sync();
});
