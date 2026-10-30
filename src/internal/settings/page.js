/* VoxBrowser — Ayarlar sayfası: başlık + "Ayarlarda ara", sol gezinme (dar ekranda bölüm seçici),
   animasyonlu bölüm geçişleri ve bölümlere göre gruplanmış canlı arama sonuçları. vox://ayarlar[/bolum] ve vox://hakkinda. */
Vox.define('settings.page', (Vox) => {
  const { html, useState, useRef, useEffect, useLayoutEffect } = Vox.p;
  const { cx } = Vox.util;
  const { Icon, SearchField, Button, EmptyState } = Vox.c;
  const st = Vox.st;
  const SUGGEST = ['tema', 'çerez', 'parola', 'Voxi', 'yakınlaştırma', 'indirme'];
  const scroller = () => document.scrollingElement || document.documentElement;

  const sectionOf = (url, path) => {
    if (Vox.url.parse(url).host === 'hakkinda') return 'hakkinda';
    const id = String(path || '/').split('/').filter(Boolean)[0];
    return st.get(id) ? id : st.sections()[0].id;
  };

  function Nav({ cur, searching, counts, onGo }) {
    const ref = useRef();
    const pill = useRef();
    const shownFor = useRef(null);
    /* Uzun listede alt/üst kenarı yumuşakça soldur */
    const edges = () => {
      const n = ref.current;
      if (!n) return;
      n.classList.toggle('is-more', n.scrollTop + n.clientHeight < n.scrollHeight - 4);
      n.classList.toggle('is-less', n.scrollTop > 4);
    };
    /* Etkin bölümü kaydırarak görünür tut (bölüm değişince ve yükseklik değişince) */
    const reveal = (smooth) => {
      const nav = ref.current;
      const el = nav && nav.querySelector('[aria-current="page"]');
      if (!el) return;
      const top = el.offsetTop - 12, bottom = el.offsetTop + el.offsetHeight + 28;
      const to = top < nav.scrollTop ? top : bottom > nav.scrollTop + nav.clientHeight ? bottom - nav.clientHeight : null;
      if (to != null) nav.scrollTo({ top: to, behavior: smooth && !Vox.motion.reduced() ? 'smooth' : 'auto' });
    };
    useEffect(() => {
      const ro = new ResizeObserver(() => { reveal(false); edges(); });
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);
    useLayoutEffect(() => {
      const nav = ref.current;
      const el = nav && nav.querySelector('[aria-current="page"]');
      const p = pill.current;
      if (!p) return;
      if (!el || searching) { p.style.opacity = '0'; edges(); return; }
      const first = !p.style.height;
      if (first) p.style.transition = 'none';
      p.style.opacity = '1';
      p.style.transform = `translateY(${el.offsetTop}px)`;
      p.style.height = `${el.offsetHeight}px`;
      if (first) requestAnimationFrame(() => { p.style.transition = ''; });
      if (shownFor.current !== cur) { shownFor.current = cur; reveal(!first); }
      edges();
    });
    return html`<nav class=${cx('st-nav', searching && 'is-searching')} aria-label="Ayar bölümleri" ref=${ref} onScroll=${edges}>
      <span class="st-nav-pill" ref=${pill} aria-hidden="true"></span>
      ${st.sections().map((s) => {
        const n = counts[s.id] || 0;
        return html`${s.divider ? html`<span class="st-nav-sep" role="separator" key=${s.id + '-sep'}></span>` : null}
          <a key=${s.id} href=${st.url(s.id)} class=${cx('st-nav-item', searching && !n && 'is-dim')}
            aria-current=${!searching && s.id === cur ? 'page' : undefined}
            onClick=${(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onGo(s.id); }}>
            <span class="st-nav-ic"><${Icon} name=${s.icon} size=${18}/></span>
            <span class="st-nav-label">${s.title}</span>
            ${searching && n ? html`<span class="st-nav-count" aria-label=${`${n} sonuç`}>${n}</span>` : null}
          </a>`;
      })}
    </nav>`;
  }

  function SectionView({ sec, dir, go }) {
    const Comp = sec.component;
    return html`<div class=${cx('st-sec', dir < 0 ? 'from-up' : 'from-down')} data-sec=${sec.id}>
      <header class="st-sec-head">
        <span class="st-sec-ic"><${Icon} name=${sec.icon} size=${24}/></span>
        <div><h2>${sec.title}</h2>${sec.desc ? html`<p>${sec.desc}</p>` : null}</div>
      </header>
      <div class="st-sec-cards"><${Comp} go=${go}/></div>
    </div>`;
  }

  function Results({ nq, q, go, counts, setQ, resRef }) {
    const total = Object.values(counts.c || {}).reduce((a, b) => a + b, 0);
    const done = counts.q === nq;
    return html`<${st.QCtx.Provider} value=${nq}>
      <div class="st-results" ref=${resRef}>
        <p class="st-results-sum" aria-live="polite">${done && total ? html`<b>“${q.trim()}”</b> için ${total} ayar bulundu` : ' '}</p>
        ${st.sections().map((s) => html`<div class="st-group" data-st-sec=${s.id} key=${s.id}>
          <div class="st-group-head">
            <span class="st-group-ic"><${Icon} name=${s.icon} size=${16}/></span>
            <h2><${st.Hi} text=${s.title}/></h2>
            <${Button} size="sm" variant="ghost" iconRight="arrow-right" onClick=${() => { setQ(''); st.go(s.id); }}>Bölüme git<//>
          </div>
          <${st.ShowCtx.Provider} value=${nq.length > 2 && st.hit(nq, s.title, s.kw)}>
            <div class="st-sec-cards"><${s.component} go=${go}/></div>
          <//>
        </div>`)}
        ${done && !total ? html`<${EmptyState} icon="search-x" title="Eşleşen ayar yok" class="st-noresults"
          text=${`“${q.trim()}” için bir şey bulamadık. Başka bir sözcük deneyin:`}>
          <div class="st-suggest">${SUGGEST.map((w) => html`<button type="button" class="st-chip" onClick=${() => setQ(w)}>${w}</button>`)}</div>
        <//>` : null}
      </div>
    <//>`;
  }

  function SettingsPage({ url, path, query }) {
    const cur = sectionOf(url, path);
    const [q, setQ] = useState((query && query.ara) || '');
    const nq = st.norm(q.trim().replace(/\s+/g, ' '));
    const [counts, setCounts] = useState({ q: '', c: {} });
    const prev = useRef(cur);
    const dir = useRef(1);
    const headRef = useRef();
    const resRef = useRef();
    if (prev.current !== cur) {
      const ids = st.sections().map((s) => s.id);
      dir.current = ids.indexOf(cur) >= ids.indexOf(prev.current) ? 1 : -1;
      prev.current = cur;
    }
    /* Adres değişerek (Geri/İleri) bölüm değişirse aramadan çık */
    const mounted = useRef(false);
    useEffect(() => { if (mounted.current) setQ(''); mounted.current = true; }, [cur]);

    /* Bölüm değişince başa dön */
    useLayoutEffect(() => {
      const sc = scroller();
      if (sc.scrollTop > 0) sc.scrollTo({ top: 0, behavior: 'instant' });
    }, [cur, !!nq]);

    /* Kaydırınca başlığın altına ince bir gölge */
    useEffect(() => {
      const onScroll = () => headRef.current && headRef.current.classList.toggle('is-scrolled', scroller().scrollTop > 4);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return () => window.removeEventListener('scroll', onScroll);
    }, []);

    /* "/" arama kutusuna odaklanır; arama kutusunda yazım denetimi gerekmez */
    useEffect(() => {
      const box = document.getElementById('st-q');
      if (box) box.spellcheck = false;
      const onKey = (e) => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (Vox.overlay.top(['menu', 'popover', 'dialog'])) return;
        const inp = document.getElementById('st-q');
        if (inp) { e.preventDefault(); inp.focus(); }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    /* Derin bağlantı: vox://ayarlar/gizlilik/temizle → Gizlilik bölümü + temizleme penceresi */
    useEffect(() => {
      const seg = String(path || '').split('/').filter(Boolean);
      if (seg[0] !== 'gizlilik' || seg[1] !== 'temizle') return undefined;
      st.go('gizlilik', { replace: true });
      const t = setTimeout(() => st.clearData && st.clearData.open(), Vox.motion.reduced() ? 0 : 320);
      return () => clearTimeout(t);
    }, [path]);

    /* Arama sonuçlarını bölüm bölüm say (gezinmedeki rozetler + özet) */
    useLayoutEffect(() => {
      const el = resRef.current;
      if (!nq || !el) return undefined;
      let raf = 0;
      const calc = () => {
        const c = {};
        el.querySelectorAll('[data-st-sec]').forEach((g) => { c[g.dataset.stSec] = g.querySelectorAll('[data-st-row]').length; });
        setCounts((p) => (p.q === nq && Vox.util.shallowEqual(p.c, c) ? p : { q: nq, c }));
      };
      calc();
      const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(calc); });
      mo.observe(el, { childList: true, subtree: true });
      return () => { mo.disconnect(); cancelAnimationFrame(raf); };
    }, [nq]);

    const go = (id) => {
      if (nq) {
        const g = resRef.current && resRef.current.querySelector(`[data-st-sec="${id}"]`);
        if (g && counts.c[id]) { g.scrollIntoView({ behavior: Vox.motion.reduced() ? 'auto' : 'smooth', block: 'start' }); return; }
        setQ('');
      }
      st.go(id);
    };
    const sec = st.get(cur);
    const openPicker = (e) => Vox.ui.menu({
      anchor: e.currentTarget, placement: 'bottom-start', keyboard: e.detail === 0, minWidth: Math.min(300, e.currentTarget.offsetWidth),
      items: st.sections().map((s) => ({ label: s.title, icon: s.icon, badge: !nq && s.id === cur ? 'Buradasınız' : undefined, onSelect: () => go(s.id) })),
    });
    const onSearchKey = (e) => { if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); } };

    return html`<div class=${cx('st-page', nq && 'is-searching')}>
      <header class="st-head" ref=${headRef}>
        <div class="st-brand"><span class="st-brand-ic"><${Icon} name="settings" size=${22}/></span><h1>Ayarlar</h1></div>
        <button type="button" class="st-picker" aria-haspopup="menu" aria-label="Bölüm seç" onClick=${openPicker}>
          <span class="st-picker-ic"><${Icon} name=${nq ? 'search' : sec.icon} size=${18}/></span>
          <span class="st-picker-label">${nq ? 'Arama sonuçları' : sec.title}</span>
          <${Icon} name="chevron-down" size=${16}/>
        </button>
        <div class="st-search" role="search" onKeyDown=${onSearchKey}>
          <${SearchField} id="st-q" value=${q} onInput=${setQ} placeholder="Ayarlarda ara" label="Ayarlarda ara"/>
          ${q ? null : html`<kbd class="st-search-kbd" aria-hidden="true">/</kbd>`}
        </div>
      </header>
      <div class="st-body">
        <${Nav} cur=${cur} searching=${!!nq} counts=${counts.q === nq ? counts.c : {}} onGo=${go}/>
        <main class="st-main">
          ${nq
            ? html`<${Results} nq=${nq} q=${q} go=${go} counts=${counts} setQ=${setQ} resRef=${resRef}/>`
            : html`<${SectionView} key=${cur} sec=${sec} dir=${dir.current} go=${go}/>`}
        </main>
      </div>
    </div>`;
  }

  const title = (sub) => {
    const id = String(sub || '/').split('/').filter(Boolean)[0];
    return st.title(id ? st.get(id) : null);
  };
  Vox.pages.register({ url: 'vox://ayarlar', title, icon: 'settings', component: SettingsPage });
  Vox.pages.register({ url: 'vox://hakkinda', title: 'VoxBrowser hakkında', icon: 'info', component: SettingsPage });
});
