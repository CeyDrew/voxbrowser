/* VoxBrowser Demo — çekirdek: ad alanı, modüller, store, olay yolu, komutlar, kısayollar, hareket, biçimlendirme.
   Every feature file runs inside Vox.define(name, fn) so one broken module never takes the others down. */
(function () {
  'use strict';
  const P = window.htmPreact;
  const Vox = (window.Vox = window.Vox || {});
  if (!P) {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.innerHTML = '<p style="padding:24px;font:16px system-ui">VoxBrowser arayüzü yüklenemedi: arayüz kütüphanesi bulunamadı. Uygulamayı yeniden kurmayı deneyin.</p>';
    });
    return;
  }

  // Türkçe büyük harf dönüşümü (i → İ) ve ekran okuyucular için belge dili.
  document.documentElement.lang = 'tr';

  Vox.version = '1.0.0';
  Vox.build = '2026.10.23-demo';
  Vox.p = P;
  Vox.html = P.html;
  Vox.h = P.h;
  Vox.c = Vox.c || {};
  Vox.errors = [];

  /* ── Modüller ─────────────────────────────────────────── */
  const modules = [];
  Vox.define = (name, fn) => modules.push({ name, fn });
  Vox.runModules = () => {
    for (const m of modules) {
      try { m.fn(Vox); } catch (e) { Vox.reportError(m.name, e); }
    }
  };
  Vox.reportError = (where, e) => {
    Vox.errors.push({ where, message: String(e && e.message || e) });
    console.error(`[Vox:${where}]`, e);
  };

  /* ── Manifest yükleyici ───────────────────────────────── */
  const manifests = [];
  Vox.manifest = (m) => manifests.push({ scripts: [], styles: [], ...m });
  Vox.loadManifests = () => {
    const head = document.head;
    for (const m of manifests) {
      for (const href of m.styles) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        head.appendChild(l);
      }
    }
    const jobs = [];
    for (const m of manifests) {
      for (const src of m.scripts) {
        jobs.push(new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = src;
          s.async = false; // ekleme sırasıyla çalışır
          s.onload = () => resolve(true);
          s.onerror = () => { console.warn(`[Vox] betik yüklenemedi: ${src}`); resolve(false); };
          head.appendChild(s);
        }));
      }
    }
    return Promise.all(jobs);
  };

  /* ── Yardımcılar ──────────────────────────────────────── */
  let uidN = 0;
  const util = (Vox.util = {
    uid: (p = 'v') => `${p}${(++uidN).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    clamp: (n, a, b) => Math.min(b, Math.max(a, n)),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    cx: (...a) => a.flat().filter(Boolean).join(' '),
    /** Debounced fn with .flush() (run now if pending), .pending() and .cancel(). */
    debounce(fn, ms) {
      let t = 0, last = [];
      const run = () => { t = 0; fn(...last); };
      const d = (...args) => { last = args; clearTimeout(t); t = setTimeout(run, ms); };
      d.pending = () => !!t;
      d.flush = () => { if (t) { clearTimeout(t); run(); } };
      d.cancel = () => { clearTimeout(t); t = 0; };
      return d;
    },
    throttle(fn, ms) {
      let last = 0, t;
      return (...args) => {
        const now = Date.now();
        if (now - last >= ms) { last = now; fn(...args); }
        else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...args); }, ms - (now - last)); }
      };
    },
    getIn: (obj, path) => (path ? String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj) : obj),
    setIn(obj, path, value) {
      const keys = String(path).split('.');
      const rec = (o, i) => {
        const cur = o == null ? {} : o;
        const k = keys[i];
        const next = i === keys.length - 1
          ? (typeof value === 'function' ? value(cur[k]) : value)
          : rec(cur[k], i + 1);
        if (cur[k] === next) return cur;
        if (Array.isArray(cur)) { const c = cur.slice(); c[k] = next; return c; }
        return { ...cur, [k]: next };
      };
      return rec(obj, 0);
    },
    shallowEqual(a, b) {
      if (Object.is(a, b)) return true;
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      return ka.every((k) => Object.is(a[k], b[k]));
    },
    hashColor(str) {
      const palette = ['#04A761', '#F5B83D', '#2E8BC0', '#E07A5F', '#8E7CC3', '#3D9970', '#D4A017', '#C2577A'];
      let h = 0;
      for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return palette[h % palette.length];
    },
    copy(text) {
      try { return navigator.clipboard.writeText(text).then(() => true, () => false); }
      catch (e) { return Promise.resolve(false); }
    },
  });

  /* ── Biçimlendirme (tr-TR) ────────────────────────────── */
  const tf = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const df = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const wf = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const nf = new Intl.NumberFormat('tr-TR');
  Vox.fmt = {
    num: (n) => nf.format(n),
    bytes(n) {
      if (n == null || isNaN(n)) return '—';
      const u = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0;
      while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
      return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1).replace('.', ',')} ${u[i]}`;
    },
    speed: (bps) => `${Vox.fmt.bytes(bps)}/sn`,
    time: (ts) => tf.format(ts),
    date: (ts) => df.format(ts),
    day(ts) {
      const d = new Date(ts), now = new Date();
      const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const diff = Math.round((start(now) - start(d)) / 86400000);
      if (diff === 0) return `Bugün — ${wf.format(ts)}`;
      if (diff === 1) return `Dün — ${wf.format(ts)}`;
      return wf.format(ts);
    },
    rel(ts) {
      const s = Math.round((Date.now() - ts) / 1000);
      if (s < 45) return 'az önce';
      if (s < 3600) return `${Math.round(s / 60)} dk önce`;
      if (s < 86400) return `${Math.round(s / 3600)} sa önce`;
      if (s < 86400 * 7) return `${Math.round(s / 86400)} gün önce`;
      return df.format(ts);
    },
    duration(ms) {
      if (ms < 1000) return `${Math.round(ms)} ms`;
      const s = ms / 1000;
      if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1).replace('.', ',')} sn`;
      const m = Math.floor(s / 60);
      return `${m} dk ${Math.round(s % 60)} sn`;
    },
    eta(seconds) {
      if (!isFinite(seconds)) return '—';
      if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sn kaldı`;
      return `${Math.round(seconds / 60)} dk kaldı`;
    },
  };

  /* ── Store ────────────────────────────────────────────── */
  const subs = new Set();
  let state = {};
  const store = (Vox.store = {
    get: (path) => util.getIn(state, path),
    set(path, value) { commit(util.setIn(state, path, value)); },
    patch(path, partial) { commit(util.setIn(state, path, (cur) => ({ ...(cur || {}), ...partial }))); },
    update(fn) { commit(fn(state)); },
    replace(next) { commit(next); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  });
  function commit(next) {
    if (next === state) return;
    const prev = state;
    state = next;
    for (const fn of Array.from(subs)) {
      try { fn(state, prev); } catch (e) { Vox.reportError('store-subscriber', e); }
    }
  }
  /** useStore('ui.devtools.open') or useStore(s => s.tabs, eq?) — re-renders when the selected value changes. */
  Vox.useStore = (selector, eq = Object.is) => {
    const sel = typeof selector === 'function' ? selector : (s) => util.getIn(s, selector);
    const [, force] = P.useReducer((x) => x + 1, 0);
    const selRef = P.useRef(sel);
    selRef.current = sel;
    const value = sel(state);
    const valRef = P.useRef(value);
    valRef.current = value;
    P.useLayoutEffect(() => store.subscribe((s) => {
      let v;
      try { v = selRef.current(s); } catch (e) { return; }
      if (!eq(v, valRef.current)) { valRef.current = v; force(); }
    }), []);
    return value;
  };

  /* ── Olay yolu ────────────────────────────────────────── */
  const handlers = new Map();
  Vox.bus = {
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt).add(fn);
      return () => handlers.get(evt) && handlers.get(evt).delete(fn);
    },
    once(evt, fn) { const off = Vox.bus.on(evt, (d) => { off(); fn(d); }); return off; },
    emit(evt, data) {
      const set = handlers.get(evt);
      if (!set) return;
      for (const fn of Array.from(set)) {
        try { fn(data); } catch (e) { Vox.reportError(`bus:${evt}`, e); }
      }
    },
  };
  /** Hook: subscribe to a bus event for the component's lifetime. */
  Vox.useBus = (evt, fn) => {
    const ref = P.useRef(fn);
    ref.current = fn;
    P.useEffect(() => Vox.bus.on(evt, (d) => ref.current(d)), [evt]);
  };

  /* ── Komutlar ─────────────────────────────────────────── */
  const commands = new Map();
  Vox.commands = {
    register(id, def) { commands.set(id, { id, ...def }); },
    has: (id) => commands.has(id),
    get: (id) => commands.get(id),
    list: () => Array.from(commands.values()),
    run(id, args) {
      const c = commands.get(id);
      if (!c) {
        console.warn(`[Vox] tanımsız komut: ${id}`);
        if (Vox.ui && Vox.ui.toast) Vox.ui.toast({ icon: 'info', text: 'Bu özellik henüz hazır değil.' });
        return undefined;
      }
      try { return c.run(args); } catch (e) { Vox.reportError(`command:${id}`, e); return undefined; }
    },
  };

  /* ── Klavye kısayolları ───────────────────────────────── */
  const bindings = new Map();
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  function keyName(e) {
    let k = e.key;
    if (!k) return '';
    if (k === ' ') return 'Space';
    if (k.length === 1) {
      k = k.toUpperCase();
      if (k === 'İ' || k === 'I') return 'I';
      if (/^[A-Z0-9]$/.test(k) === false && e.code && /^Key[A-Z]$/.test(e.code) && (e.ctrlKey || e.metaKey || e.altKey)) k = e.code.slice(3);
      if (k === '+') return '=';
    }
    return k;
  }
  function comboOf(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    parts.push(keyName(e));
    return parts.join('+');
  }
  function normalizeCombo(c) {
    const ps = c.split('+').map((s) => s.trim());
    const key = ps.pop();
    const mods = ['Ctrl', 'Alt', 'Shift'].filter((m) => ps.some((p) => p.toLowerCase() === m.toLowerCase() || (m === 'Ctrl' && /^(cmd|meta|mod)$/i.test(p))));
    const k = key.length === 1 ? key.toUpperCase() : key;
    return [...mods, k === '+' ? '=' : k].join('+');
  }
  const editable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  let suspended = 0;
  Vox.keys = {
    /** Pause all shortcuts (e.g. while recording a key combo); returns resume(). */
    suspend() { suspended++; let done = false; return () => { if (!done) { done = true; suspended--; } }; },
    bind(combo, target, opts = {}) {
      const list = Array.isArray(combo) ? combo : [combo];
      for (const c of list) bindings.set(normalizeCombo(c), { target, ...opts });
    },
    unbind(combo) { bindings.delete(normalizeCombo(combo)); },
    /** Display label for a command's first binding, e.g. "Ctrl+Shift+I". */
    label(commandId) {
      for (const [combo, b] of bindings) if (b.target === commandId) return isMac ? combo.replace('Ctrl', '⌘') : combo;
      return '';
    },
    /** All bound combos (sent to the main process so it can intercept them inside web pages). */
    combos: () => Array.from(bindings.keys()),
    /** Runs the binding for a combo that was pressed while a web page had focus. */
    run(combo) {
      const b = bindings.get(combo);
      if (!b || suspended > 0) return false;
      if (b.when && !b.when({ target: document.body })) return false;
      if (typeof b.target === 'function') b.target({ target: document.body, preventDefault() {}, stopPropagation() {} });
      else Vox.commands.run(b.target, { fromPage: true });
      return true;
    },
    handle(e) {
      if (suspended > 0) return false;
      const combo = comboOf(e);
      const b = bindings.get(combo);
      if (!b) return false;
      if (editable(e.target) && !b.inInputs && !/^(F\d+|Escape)$/.test(combo.split('+').pop()) && !e.ctrlKey && !e.metaKey && !e.altKey) return false;
      if (b.when && !b.when(e)) return false;
      e.preventDefault();
      e.stopPropagation();
      if (typeof b.target === 'function') b.target(e);
      else Vox.commands.run(b.target, { event: e });
      return true;
    },
  };
  window.addEventListener('keydown', (e) => { if (!e.defaultPrevented) Vox.keys.handle(e); }, true);

  /* ── Hareket ──────────────────────────────────────────── */
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  Vox.motion = {
    /** Reduced when the user asks for it in Ayarlar, or the OS asks — unless they chose "animasyonları her zaman göster". */
    reduced() {
      if (store.get('settings.a11y.reduceMotion')) return true;
      if (store.get('settings.a11y.forceMotion') || store.get('settings.a11y.remoteSession')) return false;
      return !!mq.matches;
    },
    /** True when the OS requests reduced motion (for a notice offering to turn animations on). */
    systemPrefersReduced: () => !!mq.matches,
    animate(el, keyframes, opts = {}) {
      if (!el || !el.animate || Vox.motion.reduced()) return Promise.resolve();
      const a = el.animate(keyframes, { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both', ...opts });
      return a.finished.then(() => a, () => a);
    },
    /** FLIP: call before a DOM change with the elements to track; returns play() to call after the change. */
    flip(getEls) {
      const before = new Map();
      for (const el of getEls()) before.set(el.dataset.flipKey || el, el.getBoundingClientRect());
      return () => {
        if (Vox.motion.reduced()) return;
        for (const el of getEls()) {
          const r0 = before.get(el.dataset.flipKey || el);
          if (!r0) continue;
          const r1 = el.getBoundingClientRect();
          const dx = r0.left - r1.left, dy = r0.top - r1.top;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' });
        }
      };
    },
    /** Flies a small element from one rect/element to another (downloads, bookmarks). */
    fly({ from, to, node, html, size = 28, duration = 720 }) {
      const host = document.getElementById('vox-fx');
      const r0 = from instanceof Element ? from.getBoundingClientRect() : from;
      const r1 = to instanceof Element ? to.getBoundingClientRect() : to;
      if (!host || !r0 || !r1 || Vox.motion.reduced()) return Promise.resolve();
      const el = node || document.createElement('div');
      if (!node) { el.className = 'vox-fly'; el.innerHTML = html || ''; }
      el.style.cssText += `;position:fixed;left:0;top:0;width:${size}px;height:${size}px;pointer-events:none;z-index:1300`;
      host.appendChild(el);
      const x0 = r0.left + r0.width / 2 - size / 2, y0 = r0.top + r0.height / 2 - size / 2;
      const x1 = r1.left + r1.width / 2 - size / 2, y1 = r1.top + r1.height / 2 - size / 2;
      const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 120;
      const a = el.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${x0}px, ${y0}px) scale(1.1)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${x1}px, ${y1}px) scale(.45)`, opacity: 0.2 },
      ], { duration, easing: 'cubic-bezier(.45,0,.25,1)' });
      return a.finished.then(() => el.remove(), () => el.remove());
    },
    /** Small celebratory particle burst at a point (bookmark star, install done). */
    burst(x, y, { colors = ['#04A761', '#F5B83D', '#34C584', '#049C3E'], count = 14, spread = 46 } = {}) {
      const host = document.getElementById('vox-fx');
      if (!host || Vox.motion.reduced()) return;
      for (let i = 0; i < count; i++) {
        const p = document.createElement('i');
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const dist = spread * (0.6 + Math.random() * 0.6);
        const s = 4 + Math.random() * 5;
        p.style.cssText = `position:fixed;left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;border-radius:${Math.random() > 0.5 ? '50%' : '2px'};background:${colors[i % colors.length]};pointer-events:none;z-index:1300`;
        host.appendChild(p);
        p.animate([
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) scale(.3) rotate(${Math.random() * 180}deg)`, opacity: 0 },
        ], { duration: 520 + Math.random() * 260, easing: 'cubic-bezier(.22,1,.36,1)' }).finished.then(() => p.remove(), () => p.remove());
      }
    },
  };

  /* ── Ana süreç köprüsü ve veri eşitleme ───────────────────
     Kalıcı veri (ayarlar, yer imleri, geçmiş, …) ana süreçte tutulur. Görünüm bu dilimlere abone olur;
     yerel değişiklik ana sürece yazılır, ana süreçten gelen değişiklik yerel depoya uygulanır. */
  const N = window.voxNative;
  Vox.native = N ? {
    kind: N.kind,
    platform: N.platform,
    invoke: (ch, p) => N.invoke(ch, p),
    on: (ch, fn) => N.on(ch, fn),
  } : {
    kind: 'none',
    platform: '',
    invoke: (ch) => Promise.reject(new Error(`Köprü yok: ${ch}`)),
    on: () => () => {},
  };
  /** Slices a view may write back to the main process (others are owned by main). */
  const WRITABLE = ['settings', 'bookmarks', 'history', 'permissions', 'profile', 'readingList', 'shortcuts', 'searchEngines', 'passwords'];
  const subscribed = new Set();
  let applyingRemote = false;
  const quiet = new Set(); // dilim yol düzeyinde yazılırken bütün dilim ayrıca gönderilmez
  Vox.data = {
    /** Writes one path (e.g. 'settings.appearance.theme') to the main process right away instead of the whole slice
        later, so two views changing different settings at the same moment can't overwrite each other. */
    write(path, value) {
      const slice = String(path).split('.')[0];
      if (!WRITABLE.includes(slice) || !subscribed.has(slice) || slice === path) { store.set(path, value); return; }
      quiet.add(slice);
      try { store.set(path, value); } finally { quiet.delete(slice); }
      Vox.native.invoke('data:set', { path, value: util.getIn(state, path) }).catch((e) => Vox.reportError(`data:set ${path}`, e));
    },
    /** Subscribes to main-process data slices; resolves once the initial values are in the store. */
    async subscribe(slices) {
      const want = slices.filter((x) => !subscribed.has(x));
      if (!want.length) return;
      want.forEach((x) => subscribed.add(x));
      try {
        const snap = await Vox.native.invoke('data:subscribe', { slices: want });
        applyingRemote = true;
        let next = state;
        for (const k of Object.keys(snap || {})) next = util.setIn(next, k, snap[k]);
        commit(next);
      } catch (e) {
        Vox.reportError('data:subscribe', e);
      } finally {
        applyingRemote = false;
      }
    },
  };
  Vox.native.on('data:changed', ({ slice, value }) => {
    applyingRemote = true;
    try { commit(util.setIn(state, slice, value)); } finally { applyingRemote = false; }
  });
  // Her dilimin kendi gecikmeli yazıcısı var: aynı anda değişen iki dilim (ör. ayarlar + yer imleri) ayrı ayrı gider.
  const pushers = new Map();
  const pusher = (slice) => {
    if (!pushers.has(slice)) {
      pushers.set(slice, util.debounce(() => {
        Vox.native.invoke('data:set', { path: slice, value: state[slice] }).catch((e) => Vox.reportError(`data:set ${slice}`, e));
      }, 150));
    }
    return pushers.get(slice);
  };
  store.subscribe((s, prev) => {
    if (applyingRemote) return;
    for (const slice of WRITABLE) {
      if (subscribed.has(slice) && s[slice] !== prev[slice] && !quiet.has(slice)) pusher(slice)();
    }
  });
  // Sayfa kapanırken bekleyen yazımlar kaybolmasın (ör. ayar değiştirip sekmeyi hemen kapatmak).
  window.addEventListener('pagehide', () => {
    for (const p of pushers.values()) p.flush();
  });
})();
