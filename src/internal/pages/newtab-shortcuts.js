/* VoxBrowser — yeni sekme kısayolları: kutucuklar (gerçek site simgesi ya da harf), üzerine gelince düzenle/kaldır,
   "Kısayol ekle" diyaloğu, sürükleyerek sıralama (FLIP) ve klavyeyle taşıma (Ctrl+Shift+← / →). Veri: store.shortcuts. */
Vox.define('pages.shortcuts', (Vox) => {
  const { html, useState, useRef, useLayoutEffect } = Vox.p;
  const { Icon, Button, TextField } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const pg = Vox.pg;
  const MAX = 12;

  /** Default name for a new shortcut: the bookmark or history title of that page, else the site name. */
  const knownTitle = (u) => {
    const b = Vox.bookmarks.findByUrl(u);
    if (b && b.title) return b.title;
    const h = (store.get('history') || []).find((x) => x.url === u && x.title);
    return h ? h.title.split(/ [—–|-] /)[0].slice(0, 40) : pg.siteName(u);
  };

  function ShortcutForm({ init, close }) {
    const [title, setTitle] = useState(init ? init.title : '');
    const [url, setUrl] = useState(init ? init.url : '');
    const [err, setErr] = useState('');
    const submit = (e) => {
      e.preventDefault();
      const u = pg.normalizeUrl(url);
      if (!u) { setErr('Geçerli bir adres girin, örneğin vikipedi.org'); return; }
      close({ title: title.trim() || knownTitle(u), url: u });
    };
    const preview = pg.normalizeUrl(url);
    return html`<form class="pg-form" onSubmit=${submit} noValidate>
      <div class="pg-sc-preview" aria-hidden="true">
        <span class="pg-sc-ic">${preview ? html`<${pg.SiteIcon} url=${preview} label=${title.trim() || null} size=${34}/>` : html`<${Icon} name="globe" size=${26}/>`}</span>
        <span class="pg-sc-title">${title.trim() || (preview ? knownTitle(preview) : 'Yeni kısayol')}</span>
      </div>
      <${TextField} label="Ad" value=${title} maxlength="40" placeholder="Örneğin Vikipedi" onInput=${(e) => setTitle(e.currentTarget.value)}/>
      <${TextField} label="Adres" value=${url} error=${err} placeholder="https://" spellcheck="false" inputmode="url" autocomplete="off"
        data-autofocus=${init ? undefined : 'true'} onInput=${(e) => { setUrl(e.currentTarget.value); setErr(''); }}/>
      <div class="dialog-actions">
        <${Button} variant="secondary" onClick=${() => close()}>Vazgeç<//>
        <${Button} variant="primary" type="submit">${init ? 'Kaydet' : 'Ekle'}<//>
      </div>
    </form>`;
  }

  const openForm = (init) => Vox.ui.dialog({
    title: init ? 'Kısayolu düzenle' : 'Kısayol ekle', icon: init ? 'pencil' : 'plus', width: 420, actions: [],
    render: ({ close }) => html`<${ShortcutForm} init=${init} close=${close}/>`,
  });

  /** The shortcut grid. Works on a local order while dragging, commits on drop. */
  function Shortcuts() {
    const shortcuts = Vox.useStore('shortcuts') || [];
    Vox.useStore('history');
    const [order, setOrder] = useState(null);
    const [dragging, setDragging] = useState(null);
    const [say, setSay] = useState('');
    const ref = useRef();
    const drag = useRef(null);
    const orderRef = useRef(null);
    const pendingPlay = useRef(null);
    const suppress = useRef(false);
    const helpId = pg.useId('pgsc');
    const list = order ? order.map((id) => shortcuts.find((s) => s.id === id)).filter(Boolean) : shortcuts;

    const tiles = (exceptId) => (ref.current ? Array.from(ref.current.querySelectorAll('.pg-sc[data-flip-key]')) : [])
      .filter((el) => el.dataset.flipKey !== exceptId);
    const tileOf = (id) => ref.current && ref.current.querySelector(`.pg-sc[data-flip-key="${id}"]`);

    function place() {
      const d = drag.current;
      const el = d && d.active && tileOf(d.id);
      if (!el) return;
      el.style.transform = 'none';
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${d.x - d.gx - r.left}px, ${d.y - d.gy - r.top}px) scale(1.06) rotate(-2deg)`;
    }
    useLayoutEffect(() => {
      if (pendingPlay.current) { const p = pendingPlay.current; pendingPlay.current = null; p(); }
      place();
    });

    function onMove(e) {
      const d = drag.current;
      if (!d) return;
      d.x = e.clientX; d.y = e.clientY;
      if (!d.active) {
        if (Math.hypot(d.x - d.x0, d.y - d.y0) < 6) return;
        d.active = true;
        orderRef.current = shortcuts.map((s) => s.id);
        setOrder(orderRef.current);
        setDragging(d.id);
        document.documentElement.classList.add('pg-is-dragging');
      }
      place();
      let best = null, bd = Infinity;
      for (const el of tiles(d.id)) {
        const r = el.getBoundingClientRect();
        const dist = Math.hypot(r.left + r.width / 2 - d.x, r.top + r.height / 2 - d.y);
        if (dist < bd) { bd = dist; best = el; }
      }
      if (!best || bd > best.offsetWidth * 0.62) return;
      const cur = orderRef.current;
      const from = cur.indexOf(d.id), to = cur.indexOf(best.dataset.flipKey);
      if (from < 0 || to < 0 || from === to) return;
      const next = cur.slice();
      next.splice(from, 1);
      next.splice(to, 0, d.id);
      pendingPlay.current = Vox.motion.flip(() => tiles(d.id));
      orderRef.current = next;
      setOrder(next);
    }
    function onUp() {
      const d = drag.current;
      drag.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!d || !d.active) return;
      suppress.current = true;
      setTimeout(() => { suppress.current = false; }, 0);
      document.documentElement.classList.remove('pg-is-dragging');
      const el = tileOf(d.id);
      if (el) {
        const from = el.style.transform;
        el.style.transform = '';
        Vox.motion.animate(el, [{ transform: from }, { transform: 'none' }], { duration: 300, fill: 'none', easing: 'cubic-bezier(.34,1.56,.64,1)' });
      }
      const next = orderRef.current || [];
      store.set('shortcuts', (l = []) => next.map((id) => l.find((s) => s.id === id)).filter(Boolean).concat(l.filter((s) => !next.includes(s.id))));
      setOrder(null);
      setDragging(null);
    }
    const onPointerDown = (e, s) => {
      if (e.button !== 0 || e.pointerType === 'touch' || e.target.closest('.pg-sc-tools')) return;
      const r = e.currentTarget.getBoundingClientRect();
      drag.current = { id: s.id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, active: false };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    const moveBy = (s, dir) => {
      const ids = shortcuts.map((x) => x.id);
      const from = ids.indexOf(s.id), to = Math.max(0, Math.min(ids.length - 1, from + dir));
      if (from === to) return;
      pendingPlay.current = Vox.motion.flip(() => tiles());
      ids.splice(from, 1);
      ids.splice(to, 0, s.id);
      store.set('shortcuts', (l = []) => ids.map((id) => l.find((x) => x.id === id)).filter(Boolean));
      setSay(`${s.title}, ${to + 1}. sıraya taşındı.`);
      requestAnimationFrame(() => { const el = tileOf(s.id); const a = el && el.querySelector('.pg-sc-link'); if (a) a.focus(); });
    };
    const onKey = (e, s) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        moveBy(s, e.key === 'ArrowLeft' ? -1 : 1);
      }
    };

    const edit = async (s) => {
      const v = await openForm(s);
      if (v) store.set('shortcuts', (l = []) => l.map((x) => (x.id === s.id ? { ...x, ...v } : x)));
    };
    const add = async () => {
      const v = await openForm(null);
      if (v) store.set('shortcuts', (l = []) => [...l, { id: Vox.util.uid('sc'), ...v }].slice(0, MAX));
    };
    const remove = (s, e) => {
      const el = e.currentTarget.closest('.pg-sc');
      const idx = shortcuts.findIndex((x) => x.id === s.id);
      pg.popOut(el).then(() => {
        pendingPlay.current = Vox.motion.flip(() => tiles(s.id));
        store.set('shortcuts', (l = []) => l.filter((x) => x.id !== s.id));
        pg.undoToast(`"${s.title}" kısayolu kaldırıldı.`, () => store.set('shortcuts', (l = []) => {
          if (l.some((x) => x.id === s.id)) return l;
          const n = l.slice();
          n.splice(Math.min(idx, n.length), 0, s);
          return n;
        }));
      });
    };

    return html`<div class="pg-sc-wrap">
      <ul class=${cx('pg-sc-grid', dragging && 'is-dragging')} ref=${ref} aria-label="Kısayollar"
        onClickCapture=${(e) => { if (suppress.current) { e.preventDefault(); e.stopPropagation(); } }}>
        ${list.map((s, i) => html`<li key=${s.id} data-flip-key=${s.id} class=${cx('pg-sc', dragging === s.id && 'is-drag')} style=${`--i:${i}`}
            onPointerDown=${(e) => onPointerDown(e, s)}>
          <a class="pg-sc-link" href=${s.url} draggable="false" title=${`${s.title}\n${pg.shortUrl(s.url)}`} onKeyDown=${(e) => onKey(e, s)}
            aria-describedby=${helpId}>
            <span class="pg-sc-ic"><${pg.SiteIcon} url=${s.url} label=${s.title} size=${30}/></span>
            <span class="pg-sc-title">${s.title}</span>
          </a>
          <div class="pg-sc-tools">
            <button type="button" class="pg-sc-tool" aria-label=${`Düzenle: ${s.title}`} data-tip="Düzenle" onClick=${() => edit(s)}><${Icon} name="pencil" size=${14}/></button>
            <button type="button" class="pg-sc-tool" aria-label=${`Kaldır: ${s.title}`} data-tip="Kaldır" onClick=${(e) => remove(s, e)}><${Icon} name="x" size=${15}/></button>
          </div>
        </li>`)}
        ${list.length < MAX ? html`<li class="pg-sc pg-sc--add" key="add">
          <button type="button" class="pg-sc-link" onClick=${add}>
            <span class="pg-sc-ic"><${Icon} name="plus" size=${24}/></span><span class="pg-sc-title">Kısayol ekle</span>
          </button>
        </li>` : null}
      </ul>
      <p class="sr-only" id=${helpId}>Sırasını değiştirmek için Ctrl+Shift ve sol ya da sağ ok tuşlarını kullanın.</p>
      <p class="sr-only" aria-live="polite">${say}</p>
    </div>`;
  }

  pg.Shortcuts = Shortcuts;
});
