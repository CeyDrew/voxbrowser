/* VoxBrowser — Ayarlar: ortak parçalar. Bölüm kaydı, arama eşleştirme/vurgulama, kart ve satır bileşenleri,
   "Yakında" işareti, yeniden başlatma gerektiren ayarlar ve küçük animasyonlu yardımcılar.
   Bölüm dosyaları Vox.st.register({ id, order, title, icon, desc, kw, component }) çağırır. */
Vox.define('settings.kit', (Vox) => {
  const { html, createContext, useContext, useRef, useState, useEffect } = Vox.p;
  const { cx, uid } = Vox.util;
  const C = Vox.c;
  const store = Vox.store;
  const N = Vox.native;

  /* ── Arama: Türkçe harfleri katlayarak eşleştir ("sifre" → "Şifre"). Uzunluk korunur, vurgu indeksleri tutar. ── */
  const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  const norm = (s) => String(s == null ? '' : s).toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (c) => FOLD[c]);
  const QCtx = createContext('');
  const ShowCtx = createContext(false);
  const hit = (q, ...texts) => texts.some((t) => typeof t === 'string' && t && norm(t).includes(q));
  const NOOP = () => undefined;

  /** Highlights the current search query inside text. */
  function Hi({ text }) {
    const q = useContext(QCtx);
    if (!q || typeof text !== 'string') return text || null;
    const n = norm(text), out = [];
    let i = 0, j = n.indexOf(q);
    while (j >= 0) {
      if (j > i) out.push(text.slice(i, j));
      out.push(html`<mark class="st-mark">${text.slice(j, j + q.length)}</mark>`);
      i = j + q.length;
      j = n.indexOf(q, i);
    }
    if (!out.length) return text;
    if (i < text.length) out.push(text.slice(i));
    return out;
  }

  /* ── Bölüm kaydı ve gezinme ───────────────────────────── */
  const sections = [];
  const favCache = { hist: null, map: new Map() };
  const st = (Vox.st = {
    norm, hit, Hi, QCtx, ShowCtx,
    register(def) { sections.push({ order: 100, kw: '', ...def }); sections.sort((a, b) => a.order - b.order); },
    sections: () => sections.slice(),
    get: (id) => sections.find((s) => s.id === id),
    url: (id) => `vox://ayarlar/${id}`,
    title: (s) => (s ? `Ayarlar — ${s.title}` : 'Ayarlar'),
    /** Switches to another section without reloading; adds a history entry so Geri/İleri work. */
    go(id, { replace = false } = {}) {
      const s = st.get(id);
      if (!s) return;
      const url = st.url(id), title = st.title(s);
      if (location.host !== 'ayarlar') { location.href = url; return; } // vox://hakkinda → başka köken: gerçek gezinme
      if (replace) {
        history.replaceState(null, '', url);
        document.title = title;
        Vox.bus.emit('route', { url });
        return;
      }
      Vox.tabs.update(null, { url, title });
    },
    toast: (text, extra = {}) => Vox.ui.toast({ icon: 'check', tone: 'success', text, ...extra }),
    /** ['a', 'b', 'c'] → "a, b ve c" */
    joinTr: (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ve ${parts[parts.length - 1]}`),
    host: (url) => Vox.url.parse(url).host || url,
    /** Favicon spec for a URL/origin: the site's icon from history when known, else a letter tile. */
    fav(url) {
      const u = Vox.url.parse(url);
      if (u.scheme === 'vox') return { logo: true };
      const hist = store.get('history') || [];
      if (favCache.hist !== hist) { favCache.hist = hist; favCache.map = new Map(); }
      if (!favCache.map.has(u.host)) {
        const e = hist.find((x) => x.favicon && Vox.url.parse(x.url).host === u.host);
        const h = u.host.replace(/^www\./, '') || '?';
        favCache.map.set(u.host, e ? { url: e.favicon } : { letter: h[0].toLocaleUpperCase('tr-TR'), bg: Vox.util.hashColor(u.host), fg: '#FFFFFF' });
      }
      return favCache.map.get(u.host);
    },
    /** Title for a URL from history, else its short address. */
    titleFor(url) {
      const e = (store.get('history') || []).find((x) => x.url === url && x.title);
      return e ? e.title : Vox.url.display(url);
    },
    /** Address-bar style text → full URL ("wikipedia.org" → "https://wikipedia.org/"); null when it isn't an address. */
    toUrl(text) {
      const t = String(text || '').trim();
      if (!t || /\s/.test(t)) return null;
      if (/^vox:\/\/[a-z]/i.test(t)) return t;
      try {
        const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
        if (!/^https?:$/.test(u.protocol) || !(u.hostname.includes('.') || u.hostname === 'localhost')) return null;
        return u.href;
      } catch (e) {
        return null;
      }
    },
    /** Collapses a list row out, then runs fn (the actual removal). */
    leave(el, fn) {
      if (!el || Vox.motion.reduced()) { fn(); return; }
      el.style.overflow = 'hidden';
      Vox.motion.animate(el, [
        { opacity: 1, transform: 'none', height: `${el.offsetHeight}px` },
        { opacity: 0, transform: 'translateX(28px)', height: `${el.offsetHeight}px`, offset: 0.55 },
        { opacity: 0, transform: 'translateX(28px)', height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', borderWidth: '0px' },
      ], { duration: 340, easing: 'cubic-bezier(.4,0,.2,1)' }).then(fn);
    },
    /** Toast with "Geri al". */
    undo(text, onUndo, icon = 'trash-2') { Vox.ui.toast({ icon, text, duration: 6000, action: { label: 'Geri al', onClick: onUndo } }); },
    /** Form onSubmit inside a Vox.ui.dialog: presses the dialog's primary action (Enter to save). */
    submitDialog(e) {
      e.preventDefault();
      const d = e.currentTarget.closest('.dialog');
      const b = d && d.querySelector('.dialog-actions .btn--primary');
      if (b && !b.disabled) b.click();
    },
    /** onKeyDown for dialog forms: Enter in a text field saves (keydown is cancelled, so no double submit). */
    enterSubmit(e) {
      if (e.key !== 'Enter' || e.isComposing || !(e.target instanceof HTMLInputElement) || e.target.type === 'checkbox') return;
      st.submitDialog(e);
    },
    /** Locks the dialog an element lives in (no Esc / outside click) while a task runs. */
    lockDialog(el, locked) {
      const host = el && el.closest('[data-layer-id]');
      if (host) Vox.overlay.update(host.dataset.layerId, { dismissible: !locked });
    },
    copy(text, done = 'Panoya kopyalandı.') {
      return N.invoke('clipboard:write', { text: String(text) })
        .then(() => { Vox.ui.toast({ icon: 'copy', tone: 'success', text: done }); return true; })
        .catch(() => { Vox.ui.toast({ icon: 'copy', text: 'Kopyalanamadı.' }); return false; });
    },
  });

  /* Ayarlar Vox.settings.set ile yazılır; ana süreç etkilerini (tema, yazım denetimi…) kendi izleyicisinde uygular. */
  /** Writes a settings path to main right away (not after the store's debounce), e.g. before main itself rewrites settings. */
  st.setNow = (path, value) => {
    Vox.settings.set(path, value);
    return N.invoke('data:set', { path: `settings.${path}`, value }).catch((e) => Vox.reportError('settings.setNow', e));
  };

  /* ── Yeniden başlatma gerektiren ayarlar (donanım hızlandırma, yumuşak kaydırma). Ana süreç bunları yalnızca açılışta
     okur; sayfa açıldığındaki değerden farklıysa "Yeniden başlat" önerilir (eski değere dönülürse öneri kalkar). ── */
  const RESTART_KEYS = ['system.hardwareAccel', 'appearance.smoothScroll'];
  const initial = Object.fromEntries(RESTART_KEYS.map((k) => [k, store.get(`settings.${k}`)]));
  st.needsRestart = (s) => RESTART_KEYS.some((k) => Vox.util.getIn(s.settings, k) !== initial[k]);
  st.relaunch = async () => {
    const cont = store.get('settings.startup.mode') === 'continue';
    const ok = await Vox.ui.confirm({
      title: 'VoxBrowser yeniden başlatılsın mı?', icon: 'rotate-cw', confirmLabel: 'Yeniden başlat',
      text: cont ? 'Açık sekmeleriniz yeniden açılır.' : 'Açık sekmeleriniz kapanır. Kaldığınız yerden devam etmek için Açılışta bölümünde “Kaldığım yerden devam et”i seçebilirsiniz.',
    });
    if (!ok) return;
    await N.invoke('data:set', { path: 'settings', value: store.get('settings') }).catch(() => null);
    const r = await N.invoke('app:relaunch').catch(() => false);
    if (!r) Vox.ui.toast({ icon: 'info', text: 'Yeniden başlatılamadı. VoxBrowser’ı kapatıp yeniden açın.' });
  };

  /* ── Kart ve satırlar ─────────────────────────────────── */
  /** "Yakında" badge for features that come in a later version. */
  const Soon = ({ label = 'Yakında' }) => html`<span class="st-soon"><${C.Icon} name="hourglass" size=${12} stroke=${2.5}/>${label}</span>`;

  /** Settings card: heading above a rounded surface. Its rows hide while searching unless they match. */
  function Card({ title, desc, kw, icon, actions, children, class: cls, id, soon }) {
    const q = useContext(QCtx);
    const shown = useContext(ShowCtx);
    const match = shown || (q.length > 2 && hit(q, title, kw));
    const hid = useRef(id || uid('st-card')).current;
    return html`<${ShowCtx.Provider} value=${match}>
      <section class=${cx('st-card', soon && 'is-soon', cls)} aria-labelledby=${title ? hid : undefined}>
        ${title ? html`<header class="st-card-head">
          ${icon ? html`<span class="st-card-ic"><${C.Icon} name=${icon} size=${18}/></span>` : null}
          <div class="st-card-titles"><h3 id=${hid}><${Hi} text=${title}/>${soon ? html`<${Soon}/>` : null}</h3>${desc ? html`<p><${Hi} text=${desc}/></p>` : null}</div>
          ${actions ? html`<div class="st-card-actions">${actions}</div>` : null}
        </header>` : null}
        <div class="st-card-body">${children}</div>
      </section>
    <//>`;
  }

  /** One setting. Text on the left, control on the right; `stack` puts the control below; `wide` stacks on narrow cards;
      `bare` renders only the children (custom blocks) but still takes part in search via label/kw; `soon` = coming later. */
  function Row({ label, desc, kw, icon, children, stack, wide, bare, htmlFor, onClick, external, disabled, badge, class: cls, tone, alwaysShow, soon }) {
    const q = useContext(QCtx);
    const shown = useContext(ShowCtx);
    if (q && !alwaysShow && !shown && !hit(q, label, desc, kw)) return null;
    if (bare) return html`<div class=${cx('st-row st-row--bare', cls)} data-st-row>${children}</div>`;
    const lead = icon ? html`<span class=${cx('st-row-ic', tone && `tone-${tone}`)}><${C.Icon} name=${icon} size=${18}/></span>` : null;
    const Text = htmlFor && !soon ? 'label' : 'span';
    const text = html`<${Text} class="st-row-text" for=${Text === 'label' ? htmlFor : undefined}>
      <span class="st-row-label"><${Hi} text=${label}/>${soon ? html`<${Soon}/>` : badge || null}</span>
      ${desc ? html`<span class="st-row-desc"><${Hi} text=${desc}/></span>` : null}
    <//>`;
    const k = cx('st-row', stack && 'st-row--stack', wide && 'st-row--wide', (disabled || soon) && 'is-disabled', soon && 'is-soon', cls);
    if (onClick && !soon) {
      return html`<button type="button" class=${cx(k, 'is-link')} data-st-row onClick=${onClick} disabled=${disabled}>
        ${lead}${text}${children ? html`<span class="st-row-ctl">${children}</span>` : null}
        <${C.Icon} name=${external ? 'square-arrow-out-up-right' : 'chevron-right'} size=${18} class="st-row-chev"/>
      </button>`;
    }
    return html`<div class=${k} data-st-row>
      ${lead}${text}${children ? html`<div class="st-row-ctl">${children}</div>` : null}
    </div>`;
  }

  /** Toggle row bound to a settings path (or controlled via value/onChange). A `soon` toggle is shown off and disabled. */
  function ToggleRow({ path, value, onChange, disabled, soon, ...rest }) {
    const sv = Vox.useStore(path ? `settings.${path}` : NOOP);
    const id = useRef(uid('st-tg')).current;
    const v = soon ? false : path ? sv : value;
    return html`<${Row} ...${rest} soon=${soon} htmlFor=${id} disabled=${disabled}>
      <${C.Toggle} id=${id} checked=${!!v} disabled=${disabled || soon} ariaLabel=${soon ? `${rest.label} (yakında)` : undefined}
        onChange=${(nv) => { if (path) Vox.settings.set(path, nv); if (onChange) onChange(nv); }}/>
    <//>`;
  }

  /** Select row bound to a settings path. Stacks under the text on narrow cards unless `inline` (short labels). */
  function SelectRow({ path, value, onChange, options, disabled, width, soon, inline, ...rest }) {
    const sv = Vox.useStore(path ? `settings.${path}` : NOOP);
    const v = path ? sv : value;
    return html`<${Row} ...${rest} soon=${soon} wide=${!inline} disabled=${disabled}>
      <${C.Select} value=${v} options=${options} label=${rest.label} disabled=${disabled || soon} width=${width}
        onChange=${(nv) => { if (nv === v) return; if (path) Vox.settings.set(path, nv); if (onChange) onChange(nv, v); }}/>
    <//>`;
  }

  /** "Yeniden başlat" row that appears while a restart-only setting differs from its value when the page opened. */
  function RestartRow() {
    const need = Vox.useStore(st.needsRestart);
    if (!need) return null;
    return html`<${Row} label="Değişikliğin uygulanması için yeniden başlatın" desc="Bu ayar VoxBrowser yeniden açıldığında geçerli olur." icon="rotate-cw" tone="honey" alwaysShow class="st-reveal">
      <${C.Button} size="sm" variant="primary" icon="rotate-cw" onClick=${st.relaunch}>Yeniden başlat<//>
    <//>`;
  }

  /** Animated check mark that draws itself. */
  const CheckDraw = ({ size = 56, tone = 'brand' }) => html`<span class=${cx('st-checkdraw', `tone-${tone}`)} style=${`width:${size}px;height:${size}px`} aria-hidden="true">
    <svg viewBox="0 0 52 52" width=${size} height=${size}><circle cx="26" cy="26" r="23"/><path d="M15 27.5l7.2 7.2L37.5 19"/></svg>
  </span>`;

  /** Number that counts up when it first appears (respects reduced motion). */
  function CountUp({ value, format = Vox.fmt.num, duration = 900 }) {
    const [v, setV] = useState(Vox.motion.reduced() ? value : 0);
    const from = useRef(0);
    useEffect(() => {
      if (Vox.motion.reduced()) { setV(value); return undefined; }
      const start = performance.now(), a = from.current;
      let raf = 0;
      const step = (t) => {
        const p = Math.min(1, (t - start) / duration), e = 1 - Math.pow(1 - p, 3);
        setV(Math.round(a + (value - a) * e));
        if (p < 1) raf = requestAnimationFrame(step); else from.current = value;
      };
      raf = requestAnimationFrame(step);
      return () => { cancelAnimationFrame(raf); from.current = value; };
    }, [value]);
    return html`<span class="st-num">${format(v)}</span>`;
  }

  /** Mounts children with a soft reveal (used for options that appear when a choice is made). */
  const Reveal = ({ open, children, class: cls }) => (open ? html`<div class=${cx('st-reveal', cls)}>${children}</div>` : null);

  /** Small note inside a card. */
  const Note = ({ icon = 'info', children, tone }) => html`<div class=${cx('st-note', tone && `tone-${tone}`)}><${C.Icon} name=${icon} size=${18}/><div>${children}</div></div>`;

  /** Strength meter: 4 segments. level: 'zayıf' | 'orta' | 'güçlü' */
  const Strength = ({ level, label }) => {
    const n = level === 'güçlü' ? 4 : level === 'orta' ? 2 : level === 'zayıf' ? 1 : 0;
    const tone = n >= 4 ? 'good' : n >= 2 ? 'mid' : 'bad';
    return html`<span class=${cx('st-strength', `is-${tone}`)} role="img" aria-label=${label || `Parola gücü: ${level || 'bilinmiyor'}`}>
      ${[0, 1, 2, 3].map((i) => html`<i class=${i < n ? 'is-on' : ''} style=${`--i:${i}`}></i>`)}
    </span>`;
  };

  Object.assign(st, { Card, Row, ToggleRow, SelectRow, RestartRow, CheckDraw, CountUp, Reveal, Note, Strength, Soon });
});
