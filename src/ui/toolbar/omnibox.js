/* VoxBrowser — adres çubuğu.
   Odaksızken kısa adres (alan adı vurgulu), odaklanınca tam adres seçili. Yazarken öneri listesi ve satır içi tamamlama;
   ↑↓ Enter Esc Tab, Alt+Enter yeni sekmede, Ctrl+Enter www…com, Shift+Delete geçmişten sil. Liste sayfanın üstüne taştığı için
   açıkken arayüz yukarı alınır (Vox.ui.raise). Sağda izin / yakınlaştırma çipleri, yer imi yıldızı ve Voxi düğmesi. */
Vox.define('toolbar.omnibox', (Vox) => {
  const { html, useState, useRef, useEffect, useLayoutEffect } = Vox.p;
  const { Icon, Favicon } = Vox.c;
  const { cx, uid } = Vox.util;
  const store = Vox.store;
  const tb = Vox.tb;

  const EMPTY = { editing: false, typed: '', value: '', inline: 0, rows: [], sel: -1, open: false };
  /** "Yapıştır ve git": the next paste into the bar navigates right away (until this time). */
  let pasteGo = 0;
  const KIND_ICON = { url: 'globe', search: 'search', tab: 'app-window', bookmark: 'star', history: 'history', voxi: 'audio-lines', action: 'zap', internal: 'settings', engine: 'search' };

  /** Text the bar shows: '' on the new tab page, the full URL when focused, the short form otherwise. */
  const textFor = (url, focused) => {
    if (tb.isNtp(url)) return '';
    if (focused) return url;
    const d = Vox.url.display(url);
    return tb.isWeb(url) ? tb.decode(d) : d || url; // view-source: gibi şemalarda kısa biçim boş dönebilir
  };

  function DisplayText({ url }) {
    const u = Vox.url.parse(url);
    if (u.scheme === 'vox') {
      const rest = url.slice(6);
      const cut = rest.search(/[/?#]/);
      return html`<span class="tb-dim">vox://</span><b>${cut < 0 ? rest : rest.slice(0, cut)}</b><span class="tb-dim">${cut < 0 ? '' : rest.slice(cut)}</span>`;
    }
    if (u.scheme === 'http' || u.scheme === 'https') {
      const d = tb.decode(Vox.url.display(url));
      const cut = d.search(/[/?#]/);
      return html`<b>${cut < 0 ? d : d.slice(0, cut)}</b><span class="tb-dim">${cut < 0 ? '' : d.slice(cut)}</span>`;
    }
    return html`<span>${url}</span>`;
  }

  function SugIcon({ r }) {
    if (r.kind === 'url' || r.kind === 'history' || r.kind === 'tab') {
      return html`<span class="tb-sug-ic"><${Favicon} spec=${tb.favFor(r.url, r.fav)} size=${16}/></span>`;
    }
    const icon = r.kind === 'action' || r.kind === 'internal' ? r.icon : KIND_ICON[r.kind];
    return html`<span class=${cx('tb-sug-ic', `is-${r.kind}`)}><${Icon} name=${icon || 'globe'} size=${16}/></span>`;
  }

  function Suggestions({ id, rows, sel, onPick, onRemove }) {
    const ref = useRef();
    useLayoutEffect(() => {
      const el = ref.current && ref.current.querySelector('.tb-sug.is-sel');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, [sel]);
    const pick = (r, e) => onPick(r, { newTab: e.ctrlKey || e.metaKey || e.button === 1 || e.altKey });
    return html`<div ref=${ref} class="tb-sugs" onMouseDown=${(e) => e.preventDefault()}>
      <div id=${id} role="listbox" aria-label="Adres çubuğu önerileri">
        ${rows.map((r, i) => html`<div key=${r.id} id=${`${id}-${i}`} role="option" aria-selected=${String(i === sel)} style=${`--i:${i}`}
          class=${cx('tb-sug', `tb-sug--${r.kind}`, i === sel && 'is-sel')} onClick=${(e) => pick(r, e)} onAuxClick=${(e) => e.button === 1 && pick(r, e)}>
          <${SugIcon} r=${r}/>
          <span class="tb-sug-text">
            <span class="tb-sug-title">${r.kind === 'voxi' ? html`<span class="tb-sug-lead">Voxi'ye sor:</span> ` : null}${r.titleHits ? tb.mark(r.title, r.titleHits) : r.completes ? tb.markQuery(r.title, r.completes) : r.title}</span>
            ${r.sub && r.kind !== 'voxi' ? html`<span class="tb-sug-sep" aria-hidden="true">—</span><span class="tb-sug-sub">${r.subHits ? tb.mark(r.sub, r.subHits) : r.sub}</span>` : null}
          </span>
          ${r.tabId ? html`<span class="tb-sug-chip"><${Icon} name="arrow-right" size=${14}/><span class="tb-sug-chip-label">Sekmeye geç</span></span>` : null}
          ${r.kind === 'action' ? html`<span class="tb-sug-chip is-action">Çalıştır${r.kbd ? html` <kbd>${r.kbd}</kbd>` : null}</span>` : null}
          ${r.kind === 'engine' ? html`<span class="tb-sug-chip">Tab</span>` : null}
          ${r.kind === 'history' ? html`<button type="button" class="tb-sug-x" tabindex="-1" aria-label="Geçmişten kaldır" data-tip="Geçmişten kaldır" data-kbd="Shift+Del"
            onClick=${(e) => { e.stopPropagation(); onRemove(r); }}><${Icon} name="x" size=${15}/></button>` : null}
        </div>`)}
      </div>
      <div class="tb-sugs-foot" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> gezin</span><span><kbd>Tab</kbd> tamamla</span><span><kbd>Alt</kbd>+<kbd>Enter</kbd> yeni sekmede</span><span><kbd>Esc</kbd> vazgeç</span>
      </div>
    </div>`;
  }

  /** Voxi (data-anchor="voxi"): shown only when the assistant is on, wanted in the toolbar and its module is loaded. */
  function VoxiButton() {
    const enabled = Vox.useStore('settings.voxi.enabled');
    const show = Vox.useStore('settings.voxi.showInToolbar');
    const active = Vox.useStore((s) => { const sp = s.ui && s.ui.sidePanel; return sp === 'voxi' || !!(sp && sp.id === 'voxi'); });
    if (enabled === false || show === false || !Vox.commands.has('voxi.toggle')) return null;
    const label = active ? 'Voxi’yi kapat' : 'Voxi’yi aç';
    return html`<button type="button" class=${cx('tb-voxi', active && 'is-active')} data-anchor="voxi" aria-pressed=${String(active)}
      aria-label=${label} data-tip=${label} data-cmd="voxi.toggle" onClick=${() => Vox.commands.run('voxi.toggle')}>
      <${Icon} name="audio-lines" size=${19}/>
    </button>`;
  }

  function Omnibox({ tab, level = 0 }) {
    const inputRef = useRef();
    const boxRef = useRef();
    const ids = useRef({ input: uid('tbin'), list: uid('tbls') }).current;
    const [focused, setFocused] = useState(false);
    const [st, setSt] = useState(EMPTY);
    const stRef = useRef(st);
    stRef.current = st;
    const remoteT = useRef(0);
    const url = tab ? tab.url : '';
    const tabId = tab ? tab.id : null;

    useEffect(() => { setSt(EMPTY); }, [tabId]);
    // Yeni sekmede kendiliğinden odaklanmış (yazılmamış) çubuk, sayfa başka yere gidince odağı sayfaya bırakır.
    const prevUrl = useRef(url);
    useEffect(() => {
      const was = prevUrl.current;
      prevUrl.current = url;
      const el = inputRef.current;
      if (was !== url && tb.isNtp(was) && !tb.isNtp(url) && el && document.activeElement === el && !stRef.current.editing) el.blur();
    }, [url]);
    useLayoutEffect(() => { if (focused && inputRef.current && !stRef.current.editing) inputRef.current.select(); }, [focused]);
    useLayoutEffect(() => {
      const el = inputRef.current;
      if (focused && el && st.inline > 0 && document.activeElement === el) el.setSelectionRange(st.value.length - st.inline, st.value.length);
    }, [st]);
    // Liste sayfa alanına taşar: açıkken arayüz sayfanın üstünde kalır.
    const open = focused && st.open;
    useEffect(() => { Vox.ui.raise('tb-suggest', open); }, [open]);
    useEffect(() => () => { Vox.ui.raise('tb-suggest', false); clearTimeout(remoteT.current); }, []);
    // Dar alanlarda öneri listesi tüm araç çubuğu genişliğine yayılır.
    useLayoutEffect(() => {
      const box = boxRef.current;
      const list = box && box.querySelector('.tb-sugs');
      const bar = box && box.closest('.tb');
      if (!list || !bar) return;
      const b = box.getBoundingClientRect(), r = bar.getBoundingClientRect();
      const wide = b.width < 520;
      list.style.left = wide ? `${r.left + 8 - b.left}px` : '';
      list.style.right = wide ? `${b.right - (r.right - 8)}px` : '';
    }, [open, level]);

    const value = focused ? (st.editing ? st.value : textFor(url, true)) : textFor(url, false);
    const showDisplay = !focused && !!value;

    const rowsFor = (typed) => {
      const q = typed.trim();
      return tb.suggest(typed, { resolved: tb.resolvedFor(q), remote: tb.remoteFor(q) });
    };
    /** Re-ranks the open list when an async answer (address resolution, engine suggestions) arrives. */
    const refresh = (typed) => setSt((s) => {
      if (!s.editing || s.typed !== typed) return s;
      const rows = rowsFor(typed);
      const prev = s.rows[s.sel];
      let sel = prev ? rows.findIndex((r) => r.id === prev.id) : -1;
      if (sel < 0 && s.sel >= 0) sel = rows.length ? 0 : -1;
      const keep = sel === s.sel && prev && rows[sel] && rows[sel].id === prev.id;
      return { ...s, rows, sel, open: !!typed.trim() && rows.length > 0, ...(keep ? {} : { value: s.typed, inline: 0 }) };
    });
    const ask = (typed) => {
      const q = typed.trim();
      if (!q) return;
      if (tb.resolvedFor(q) === undefined) tb.resolveInput(q).then(() => refresh(typed));
      clearTimeout(remoteT.current);
      if (/^@\S*(\s|$)/.test(q) || /^[a-z][a-z0-9+.-]*:/i.test(q)) return;
      remoteT.current = setTimeout(() => tb.fetchRemote(q).then(() => refresh(typed)), 120);
    };

    const selectAllSoon = () => requestAnimationFrame(() => { const el = inputRef.current; if (el && document.activeElement === el) el.select(); });
    const finish = () => { setSt(EMPTY); if (inputRef.current) inputRef.current.blur(); };
    const setTyped = (typed, rows = rowsFor(typed)) => setSt({ editing: true, typed, value: typed, inline: 0, rows, sel: rows.length ? 0 : -1, open: !!typed.trim() && rows.length > 0 });
    const go = (row, opts = {}) => {
      if (!row) return;
      if (row.kind === 'engine') { setTyped(row.fill); ask(row.fill); return; }
      tb.runSuggestion(row, opts);
      finish();
    };
    const navigateText = (text, opts = {}) => {
      let t = String(text || '').trim();
      if (!t) return;
      if (opts.www && !/[\s./:]/.test(t)) t = `www.${t}.com`;
      if (opts.newTab) Vox.tabs.open(t, { opener: tabId || undefined }); else Vox.nav.go(t);
      finish();
    };

    const onMouseDown = (e) => {
      if (focused || e.button !== 0) return;
      e.preventDefault();
      inputRef.current.focus();
    };
    const onInput = (e) => {
      const el = e.currentTarget;
      const typed = el.value;
      if (pasteGo > Date.now() && /paste/i.test(e.inputType || '')) { pasteGo = 0; if (typed.trim()) { navigateText(typed); return; } }
      const deleting = /^delete/.test(e.inputType || '') || e.inputType === 'historyUndo';
      const rows = rowsFor(typed);
      const top = rows[0];
      const inline = !deleting && el.selectionStart === typed.length && top && top.inline ? top.inline : '';
      setSt({ editing: true, typed, value: typed + inline, inline: inline.length, rows, sel: rows.length ? 0 : -1, open: !!typed.trim() && rows.length > 0 });
      ask(typed);
    };
    const select = (s, i) => {
      const r = s.rows[i];
      if (!r) return { ...s, sel: -1, value: s.typed, inline: 0 };
      if (i === 0 && r.inline) return { ...s, sel: 0, value: s.typed + r.inline, inline: r.inline.length };
      return { ...s, sel: i, value: r.kind === 'search' || r.kind === 'voxi' ? r.title : r.fill || r.title, inline: 0 };
    };
    const move = (dir) => {
      const s = stRef.current;
      if (!s.open) {
        const typed = s.editing ? s.typed : inputRef.current.value;
        const zero = !(s.editing && typed.trim());
        const rows = zero ? tb.zeroSuggest() : rowsFor(typed);
        if (!rows.length) return;
        setSt({ ...s, editing: true, typed, value: typed, inline: 0, rows, sel: -1, open: true, zero });
        return;
      }
      const n = s.rows.length;
      let i = s.sel + dir;
      if (i >= n) i = -1;
      if (i < -1) i = n - 1;
      setSt(select(s, i));
    };
    const removeRow = (r) => {
      if (r.kind !== 'history') return;
      Vox.history.remove(r.ids && r.ids.length ? r.ids : Vox.history.list().filter((h) => h.url === r.url).map((h) => h.id));
      const s = stRef.current;
      const rows = (s.zero || !s.typed.trim() ? tb.zeroSuggest() : rowsFor(s.typed)).filter((x) => x.url !== r.url);
      setSt({ ...s, rows, sel: Math.min(s.sel, rows.length - 1), open: rows.length > 0, value: s.typed, inline: 0 });
      tb.toast('Sayfa geçmişten kaldırıldı.', 'history');
    };
    const onKeyDown = (e) => {
      const s = stRef.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const opts = { newTab: e.altKey || e.shiftKey, www: e.ctrlKey };
        if (s.open && s.sel >= 0 && s.rows[s.sel] && !e.ctrlKey) go(s.rows[s.sel], opts);
        else navigateText(e.currentTarget.value, opts);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (s.open || s.editing) { setSt(EMPTY); selectAllSoon(); } else { e.currentTarget.blur(); if (tabId) Vox.nav.focusPage(tabId); }
        return;
      }
      if (e.key === 'Tab' && !e.altKey && !e.ctrlKey) {
        const r = s.open ? s.rows[s.sel] : null;
        if (r && r.kind === 'engine' && !e.shiftKey) { e.preventDefault(); go(r); return; }
        if (s.inline > 0 && s.sel === 0 && !e.shiftKey) {
          e.preventDefault();
          const typed = s.value;
          setTyped(typed);
          ask(typed);
          requestAnimationFrame(() => { const el = inputRef.current; if (el) el.setSelectionRange(typed.length, typed.length); });
          return;
        }
        if (s.open) { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
        return;
      }
      if (e.key === 'Delete' && e.shiftKey && s.open && s.rows[s.sel] && s.rows[s.sel].kind === 'history') {
        e.preventDefault();
        removeRow(s.rows[s.sel]);
      }
    };
    const onBlur = (e) => {
      setFocused(false);
      setSt(EMPTY);
      // Pencere odağı sayfaya geçtiyse odağı burada bırakma: kısayol arayüze dönünce adres çubuğu kendiliğinden açılmasın.
      const el = e.currentTarget;
      if (!document.hasFocus()) setTimeout(() => { if (document.activeElement === el && !document.hasFocus()) el.blur(); }, 0);
    };

    const sel = open && st.sel >= 0 ? st.rows[st.sel] : null;
    const editIcon = focused && st.editing ? (sel ? (sel.kind === 'action' || sel.kind === 'internal' ? sel.icon : KIND_ICON[sel.kind]) : 'search') : null;
    const ntp = tb.isNtp(url);
    const S = tb;
    return html`<div ref=${boxRef} class=${cx('tb-omni', focused && 'is-focused', open && 'is-open', ntp && 'is-ntp')}>
      ${S.SiteButton ? html`<${S.SiteButton} tab=${tab} editIcon=${editIcon}/>` : null}
      <div class="tb-omni-field">
        <label class="sr-only" for=${ids.input}>Adres ve arama çubuğu</label>
        <input ref=${inputRef} id=${ids.input} class=${cx('tb-omni-input', showDisplay && 'has-display')} type="text" value=${value}
          role="combobox" aria-expanded=${String(open)} aria-controls=${ids.list} aria-autocomplete="both"
          aria-activedescendant=${sel ? `${ids.list}-${st.sel}` : undefined}
          autocomplete="off" autocapitalize="off" spellcheck=${false} enterkeyhint="go"
          placeholder=${`${tb.loc(tb.engineName())} arayın ya da adres yazın`}
          onMouseDown=${onMouseDown} onFocus=${() => setFocused(true)} onBlur=${onBlur}
          onInput=${onInput} onKeyDown=${onKeyDown}/>
        ${showDisplay ? html`<div class="tb-omni-display" aria-hidden="true"><${DisplayText} url=${url}/></div>` : null}
      </div>
      ${!st.editing && S.RequestChip ? html`<${S.RequestChip} tab=${tab}/>` : null}
      ${!st.editing && S.PermChips ? html`<${S.PermChips} tab=${tab}/>` : null}
      ${!st.editing && S.ZoomChip ? html`<${S.ZoomChip} tab=${tab}/>` : null}
      ${!ntp && level < 3 && S.StarButton ? html`<${S.StarButton} tab=${tab}/>` : null}
      <${VoxiButton}/>
      ${open ? html`<${Suggestions} id=${ids.list} rows=${st.rows} sel=${st.sel} onPick=${go} onRemove=${removeRow}/>` : null}
    </div>`;
  }

  tb.Omnibox = Omnibox;
  tb.focusOmnibox = () => {
    const el = document.querySelector('.tb-omni-input');
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  };
  /* Adres çubuğunun düzenleme menüsü (çekirdek 'ui:edit-menu'): "Yapıştır ve git" ya da pano bir adres değilse "Yapıştır ve ara".
     Pano metni sağ tık anında okunur (menü ana süreçten birkaç ms sonra gelir); okunamadıysa metin yapıştırılır ve açılır.
     İşlem, menü kapanıp odak çubuğa döndükten sonra yapılır; sayfaya gidince odak sayfaya geçer. */
  const isOmni = (el) => !!(el && el.classList && el.classList.contains('tb-omni-input'));
  let clip = { at: 0, text: null };
  document.addEventListener('contextmenu', (e) => {
    if (!isOmni(e.target)) return;
    const my = (clip = { at: Date.now(), text: null });
    try { navigator.clipboard.readText().then((t) => { my.text = String(t || ''); }, () => {}); } catch (err) { /* pano okunamıyor */ }
  }, true);
  Vox.bus.on('ui:edit-menu', ({ p, target, items, edit }) => {
    if (!isOmni(target) || !p || !p.isEditable) return;
    const text = Date.now() - clip.at < 4000 && clip.text != null ? clip.text.replace(/\s+/g, ' ').trim() : null;
    const search = !!text && !tb.urlish(text);
    const go = () => setTimeout(() => {
      if (text) { target.blur(); Vox.nav.go(text); return; }
      pasteGo = Date.now() + 1500;
      target.focus({ preventScroll: true });
      target.select();
      edit('paste')();
    }, 220);
    const item = { label: search ? 'Yapıştır ve ara' : 'Yapıştır ve git', icon: search ? 'search' : 'arrow-right', disabled: !(p.editFlags || {}).canPaste || text === '', onSelect: go };
    // Çubuğun kendi adresini web'de aramak anlamsız: seçim araması (çekirdeğin son öğesi) adres çubuğunda gösterilmez.
    const s = items.findIndex((it) => it && typeof it === 'object' && /web'de ara$/.test(it.label || ''));
    if (s >= 0) items.splice(s > 0 && items[s - 1] === '-' ? s - 1 : s, s > 0 && items[s - 1] === '-' ? 2 : 1);
    const i = items.findIndex((it) => it && typeof it === 'object' && it.label === 'Yapıştır');
    items.splice(i >= 0 ? i + 1 : items.length, 0, item);
  });
  Vox.commands.register('omnibox.focus', { title: 'Adres çubuğuna git', icon: 'search', run: () => tb.focusOmnibox() });

  /* Yeni sekme sayfası etkin olunca adres çubuğuna odaklan (Chrome gibi); menü/panel açıksa dokunma. */
  let lastActive = null;
  store.subscribe((s) => {
    if (s.activeTabId === lastActive) return;
    lastActive = s.activeTabId;
    const t = (s.tabs || []).find((x) => x.id === s.activeTabId);
    if (!t || !tb.isNtp(t.realUrl || t.url)) return;
    setTimeout(() => {
      if (store.get('activeTabId') !== t.id || tb.overlayOpen()) return;
      const a = document.activeElement;
      const typing = a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !a.closest('.tb');
      if (!typing) tb.focusOmnibox();
    }, 60);
  });
});
