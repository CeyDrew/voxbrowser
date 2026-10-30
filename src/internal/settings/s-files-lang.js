/* VoxBrowser — Ayarlar › İndirilenler (gerçek klasör seçici, her seferinde sor, PDF görüntüleyici, indirme baloncuğu) ve
   Diller (sürükleyerek ya da klavyeyle sıralanan dil listesi — sitelere bu sırayla bildirilir —, dil ekleme, yazım
   denetimi; çeviri yakında). */
Vox.define('settings.filesLang', (Vox) => {
  const { html, useState, useRef } = Vox.p;
  const { Button, Badge, Kbd, Checkbox, SearchField, MenuButton, Icon } = Vox.c;
  const st = Vox.st;
  const { Card, Row, ToggleRow } = st;

  /* ── İndirilenler ─────────────────────────────────────── */
  async function pickFolder() {
    const cur = Vox.settings.get('downloads.location') || '';
    const p = await Vox.native.invoke('dialog:folder', { defaultPath: cur }).catch((e) => { Vox.reportError('dialog:folder', e); return null; });
    if (!p || p === cur) return;
    Vox.settings.set('downloads.location', p);
    st.toast(`İndirmeler artık buraya kaydedilecek: ${p}`, { icon: 'folder-check' });
  }

  function DownloadsSection() {
    const loc = Vox.useStore('settings.downloads.location');
    return html`
      <${Card} title="Konum" desc="İndirdiğiniz dosyaların kaydedileceği yer." kw="klasör dizin kaydet">
        <${Row} label="İndirilenler klasörü" desc=${loc || 'Windows’un İndirilenler klasörü'} icon="folder-open" kw="konum klasör dizin değiştir" wide class="st-row--path">
          <${Button} size="sm" variant="secondary" icon="folder-search" onClick=${pickFolder}>Değiştir<//>
        <//>
        <${ToggleRow} path="downloads.askWhere" label="Her dosyayı nereye kaydedeceğimi sor" desc="İndirme başlamadan önce kaydetme penceresi açılır." icon="message-circle-question" kw="sor kaydet konum"/>
      <//>
      <${Card} title="İndirme davranışı" kw="pdf baloncuk">
        <${ToggleRow} path="downloads.openPdfInBrowser" label="PDF'leri VoxBrowser'da aç" desc="Kapalıysa PDF dosyaları açılmadan indirilir. Yeni açılan sekmelerde geçerli olur." icon="file-text" kw="pdf belge görüntüle"/>
        <${ToggleRow} path="downloads.showBubble" label="İndirme baloncuğunu göster" desc="İndirme başladığında araç çubuğunda ilerlemeyi gösterir." icon="circle-arrow-down" kw="bildirim ilerleme"/>
        <${Row} label="İndirilenleri aç" desc="Tüm indirmelerinizi görün ve yönetin." icon="download" kw="indirme listesi" onClick=${() => Vox.tabs.open('vox://indirilenler')}>
          <${Kbd} keys="Ctrl+J"/>
        <//>
      <//>`;
  }

  /* ── Diller ───────────────────────────────────────────── */
  const LANGS = [
    ['tr-TR', 'Türkçe', 'Türkçe'], ['en-US', 'İngilizce (ABD)', 'English (United States)'], ['en-GB', 'İngilizce (Birleşik Krallık)', 'English (United Kingdom)'],
    ['de-DE', 'Almanca', 'Deutsch'], ['fr-FR', 'Fransızca', 'Français'], ['es-ES', 'İspanyolca', 'Español'], ['it-IT', 'İtalyanca', 'Italiano'],
    ['nl-NL', 'Felemenkçe', 'Nederlands'], ['pt-BR', 'Portekizce (Brezilya)', 'Português (Brasil)'], ['az-AZ', 'Azerbaycan dili', 'Azərbaycan dili'],
    ['ku', 'Kürtçe (Kurmancî)', 'Kurdî'], ['ar', 'Arapça', 'العربية'], ['fa-IR', 'Farsça', 'فارسی'], ['ru-RU', 'Rusça', 'Русский'],
    ['uk-UA', 'Ukraynaca', 'Українська'], ['el-GR', 'Yunanca', 'Ελληνικά'], ['bg-BG', 'Bulgarca', 'Български'], ['ja-JP', 'Japonca', '日本語'],
    ['ko-KR', 'Korece', '한국어'], ['zh-CN', 'Çince (Basitleştirilmiş)', '中文（简体）'],
  ].map(([code, name, native]) => ({ code, name, native }));
  const lang = (code) => LANGS.find((l) => l.code === code) || { code, name: code, native: code };
  const getList = () => (Vox.settings.get('languages.list') || []).slice();
  const setList = (l) => Vox.settings.set('languages.list', l);

  function LangList() {
    const list = Vox.useStore('settings.languages.list') || [];
    const ref = useRef();
    const drag = useRef(null);
    const rows = () => Array.from(ref.current ? ref.current.querySelectorAll('[data-lang]') : []);
    const commit = (from, to, focus) => {
      if (to < 0 || to >= list.length || from === to) return;
      const play = Vox.motion.flip(rows);
      const n = list.slice();
      const [x] = n.splice(from, 1);
      n.splice(to, 0, x);
      setList(n);
      requestAnimationFrame(() => { play(); if (focus) { const g = ref.current && ref.current.querySelector(`[data-lang="${x}"] .st-lang-grip`); if (g) g.focus(); } });
    };
    const remove = (code, el) => {
      if (list.length < 2) return;
      const i = list.indexOf(code);
      st.leave(el, () => setList(getList().filter((c) => c !== code)));
      st.undo(`${lang(code).name} kaldırıldı.`, () => { const n = getList(); if (n.includes(code)) return; n.splice(Math.min(i, n.length), 0, code); setList(n); });
    };
    const onDown = (e, i) => {
      if (e.button !== 0 || list.length < 2) return;
      const els = rows();
      drag.current = { i, y0: e.clientY, rects: els.map((r) => r.getBoundingClientRect()), els, to: i };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* yalnızca etkin işaretçiler yakalanabilir */ }
      els[i].classList.add('is-dragging');
      ref.current.classList.add('is-sorting');
    };
    const onMove = (e) => {
      const d = drag.current;
      if (!d) return;
      const dy = e.clientY - d.y0, r = d.rects[d.i], mid = r.top + r.height / 2 + dy;
      const gap = d.rects.length > 1 ? d.rects[1].top - d.rects[0].bottom : 6;
      let to = d.i;
      d.rects.forEach((x, k) => { const m = x.top + x.height / 2; if (k < d.i && mid < m) to = Math.min(to, k); if (k > d.i && mid > m) to = Math.max(to, k); });
      d.to = to;
      d.els.forEach((el, k) => {
        if (k === d.i) { el.style.transform = `translateY(${dy}px)`; return; }
        const s = to > d.i && k > d.i && k <= to ? -(r.height + gap) : to < d.i && k >= to && k < d.i ? r.height + gap : 0;
        el.style.transform = s ? `translateY(${s}px)` : '';
      });
    };
    const onUp = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      const host = ref.current;
      host.classList.add('no-anim');
      d.els.forEach((el) => { el.style.transform = ''; el.classList.remove('is-dragging'); });
      host.classList.remove('is-sorting');
      if (d.to !== d.i) {
        const n = list.slice();
        const [x] = n.splice(d.i, 1);
        n.splice(d.to, 0, x);
        setList(n);
        st.toast(`${lang(x).name} ${d.to + 1}. sıraya taşındı.`, { icon: 'move-vertical' });
      }
      requestAnimationFrame(() => requestAnimationFrame(() => host && host.classList.remove('no-anim')));
    };
    const onKey = (e, i) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); commit(i, i + (e.key === 'ArrowUp' ? -1 : 1), true); }
    };
    return html`<ol class="st-langs" ref=${ref} aria-label="Tercih ettiğiniz diller">${list.map((code, i) => {
      const l = lang(code);
      return html`<li class="st-lang" key=${code} data-lang=${code}>
        <button type="button" class="st-lang-grip" aria-label=${`${l.name}: sırayı değiştirmek için sürükleyin ya da yukarı/aşağı oklarını kullanın`}
          onPointerDown=${(e) => onDown(e, i)} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp} onKeyDown=${(e) => onKey(e, i)}>
          <${Icon} name="grip-vertical" size=${18}/></button>
        <span class="st-lang-n">${i + 1}</span>
        <span class="st-li-text"><span class="st-li-title"><b><${st.Hi} text=${l.name}/></b>${code === 'tr-TR' ? html`<${Badge} tone="brand">Arayüz dili<//>` : null}</span><small>${l.native} · ${code}</small></span>
        <${MenuButton} icon="ellipsis-vertical" label=${`${l.name} seçenekleri`} size="sm" items=${() => [
          { label: 'En üste taşı', icon: 'arrow-up-to-line', disabled: i === 0, onSelect: () => commit(i, 0) },
          { label: 'Yukarı taşı', icon: 'arrow-up', disabled: i === 0, onSelect: () => commit(i, i - 1) },
          { label: 'Aşağı taşı', icon: 'arrow-down', disabled: i === list.length - 1, onSelect: () => commit(i, i + 1) },
          '-',
          { label: 'Kaldır', icon: 'trash-2', danger: true, disabled: list.length < 2, hint: list.length < 2 ? 'En az bir dil kalmalı' : undefined, onSelect: () => remove(code, ref.current.querySelector(`[data-lang="${code}"]`)) },
        ]}/>
      </li>`;
    })}</ol>`;
  }

  function AddLangs({ close }) {
    const [q, setQ] = useState('');
    const [sel, setSel] = useState([]);
    const have = new Set(getList());
    const nq = st.norm(q.trim());
    const items = LANGS.filter((l) => !have.has(l.code) && (!nq || st.hit(nq, l.name, l.native, l.code)));
    const add = () => {
      setList([...getList(), ...sel.filter((c) => !have.has(c))]);
      close(true);
      st.toast(sel.length === 1 ? `${lang(sel[0]).name} eklendi.` : `${sel.length} dil eklendi.`, { icon: 'languages' });
    };
    return html`<div class="st-dlg">
      <${SearchField} value=${q} onInput=${setQ} placeholder="Dil ara" label="Eklenecek dili ara" autoFocus=${true}/>
      <div class="st-addlang">${items.length ? items.map((l) => html`<${Checkbox} key=${l.code} checked=${sel.includes(l.code)} label=${l.name} desc=${`${l.native} · ${l.code}`}
        onChange=${(v) => setSel((s) => (v ? [...s, l.code] : s.filter((c) => c !== l.code)))}/>`) : html`<p class="st-empty-line">Eşleşen dil yok.</p>`}</div>
      <div class="dialog-actions">
        <${Button} onClick=${() => close(false)}>Vazgeç<//>
        <${Button} variant="primary" icon="plus" disabled=${!sel.length} onClick=${add}>${sel.length > 1 ? `${sel.length} dil ekle` : 'Ekle'}<//>
      </div>
    </div>`;
  }
  const openAdd = () => Vox.ui.dialog({ title: 'Dil ekle', icon: 'languages', width: 460, actions: [], className: 'st-dialog', render: ({ close }) => html`<${AddLangs} close=${close}/>` });

  /** What sites are told: main sends this order as Accept-Language with every request, from the next request on. */
  function SitesNote({ list }) {
    if (!list.length) return null;
    const names = list.map((c) => lang(c).name);
    const order = names.length === 1 ? names[0] : `önce ${names[0]}, sonra ${st.joinTr(names.slice(1))}`;
    return html`<p class="st-lang-note"><${Icon} name="globe" size=${16}/><span>Sitelere dil tercihiniz şu sırayla bildirilir: ${order}.</span></p>`;
  }

  function LanguagesSection() {
    const list = Vox.useStore('settings.languages.list') || [];
    return html`
      <${Card} title="Tercih ettiğiniz diller" desc="Siteler içeriği bu sıraya göre sunar; yazım denetimi de bu dilleri kullanır. Sürükleyerek sıralayın." kw="dil sıralama language accept-language"
        actions=${html`<${Button} size="sm" variant="secondary" icon="plus" onClick=${openAdd}>Dil ekle<//>`}>
        <${Row} bare label="Dil listesi" kw=${`dil sırala taşı sitelere bildir tercih ${list.map((c) => `${lang(c).name} ${lang(c).native}`).join(' ')}`}>
          <${LangList}/><${SitesNote} list=${list}/>
        <//>
      <//>
      <${Card} title="Yazım ve çeviri" kw="translate spellcheck">
        <${ToggleRow} path="languages.spellcheck" label="Yazım denetimi" desc="Formlara yazarken yazım hatalarının altını çizer; sağ tıkla öneri sunar." icon="spell-check" kw="imla yazım hata spellcheck"/>
        <${ToggleRow} label="Sayfaları çevirmeyi öner" desc="Okuyamadığınız bir dildeki sayfalarda çeviri seçeneği gösterir." icon="languages" kw="çeviri tercüme translate" soon/>
      <//>`;
  }

  st.register({ id: 'indirilenler', order: 80, title: 'İndirilenler', icon: 'download', kw: 'indirme klasör pdf',
    desc: 'Dosyaların nereye kaydedileceği ve indirme davranışı.', component: DownloadsSection });
  st.register({ id: 'diller', order: 90, title: 'Diller', icon: 'languages', kw: 'dil çeviri yazım',
    desc: 'Sitelere bildirilen diller ve yazım denetimi.', component: LanguagesSection });
});
