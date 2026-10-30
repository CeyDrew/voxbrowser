/* VoxBrowser — Ayarlar › Siz ve VoxBrowser (yerel profil; eşitleme ve içe aktarma yakında) ve Açılışta (açılış davranışı,
   açılış sayfaları, ana sayfa). Açılış sayfaları ana sürecin okuduğu biçimde, adres dizisi olarak saklanır. */
Vox.define('settings.profile', (Vox) => {
  const { html, useState, useReducer } = Vox.p;
  const { cx } = Vox.util;
  const { Avatar, Button, Icon, TextField, RadioGroup, Segmented, IconButton, Favicon } = Vox.c;
  const st = Vox.st;
  const { Card, Row, ToggleRow, Reveal, Note } = st;
  const store = Vox.store;

  const COLORS = ['#F5B83D', '#04A761', '#2E8BC0', '#E07A5F', '#8E7CC3', '#C2577A', '#3D9970', '#D4A017'];

  /* ── Profil ───────────────────────────────────────────── */
  function ProfileForm({ draft }) {
    const [, force] = useReducer((x) => x + 1, 0);
    const set = (k, v) => { draft[k] = v; force(); };
    return html`<div class="st-form" onKeyDown=${st.enterSubmit}>
      <div class="st-form-av"><${Avatar} name=${draft.fullName || draft.name || '?'} color=${draft.color} size=${64}/></div>
      <${TextField} label="Ad soyad" value=${draft.fullName} error=${draft.fullName.trim() ? '' : 'Adınızı yazın.'} onInput=${(e) => set('fullName', e.currentTarget.value)} data-autofocus/>
      <${TextField} label="Size nasıl hitap edelim?" value=${draft.name} onInput=${(e) => set('name', e.currentTarget.value)}/>
      <div class="st-swatches" role="radiogroup" aria-label="Profil rengi">
        ${COLORS.map((c) => html`<button type="button" role="radio" aria-checked=${String(draft.color === c)} aria-label=${`Renk ${c}`}
          class=${cx('st-swatch', draft.color === c && 'is-on')} style=${`--sw:${c}`} onClick=${() => set('color', c)}><${Icon} name="check" size=${14} stroke=${3}/></button>`)}
      </div>
    </div>`;
  }
  function editProfile() {
    const p = store.get('profile') || {};
    const draft = { name: p.name || '', fullName: p.fullName || p.name || '', color: p.color || COLORS[0] };
    Vox.ui.dialog({
      title: 'Profili düzenle', icon: 'user-pen', width: 440,
      render: () => html`<${ProfileForm} draft=${draft}/>`,
      actions: [
        { label: 'Vazgeç', value: false },
        { label: 'Kaydet', variant: 'primary', onClick: () => {
          if (!draft.fullName.trim()) return false;
          store.patch('profile', { fullName: draft.fullName.trim(), name: (draft.name.trim() || draft.fullName.trim().split(/\s+/)[0]), color: draft.color });
          st.toast('Profiliniz güncellendi.');
          return true;
        } },
      ],
    });
  }

  function ProfileHero() {
    const p = Vox.useStore('profile') || {};
    const name = p.fullName || p.name || 'Profiliniz';
    return html`<div class="st-hero">
      <div class="st-hero-av"><${Avatar} name=${name} color=${p.color} size=${72}/></div>
      <div class="st-hero-text">
        <h3>${name}</h3>
        ${p.email ? html`<p>${p.email}</p>` : null}
        <p class="st-hero-status"><${Icon} name="hard-drive" size=${15}/>Yerel profil · verileriniz bu bilgisayarda</p>
      </div>
      <div class="st-hero-actions"><${Button} size="sm" variant="secondary" icon="user-pen" onClick=${editProfile}>Profili düzenle<//></div>
    </div>`;
  }

  function ProfileSection() {
    return html`
      <${Card} kw="hesap e-posta ad avatar renk">
        <${Row} bare label="Profil" kw="hesap ad soyad avatar renk düzenle hitap"><${ProfileHero}/><//>
      <//>
      <${Card} title="Senkronizasyon" desc="Yer imleriniz, geçmişiniz, parolalarınız ve ayarlarınız cihazlarınız arasında şifreli olarak eşitlenecek." kw="sync eşitleme bulut cihaz" soon>
        <${ToggleRow} label="Cihazlar arasında eşitle" icon="refresh-cw" kw="sync eşitleme bulut hesap" soon
          desc="Şimdilik tüm verileriniz yalnızca bu bilgisayarda saklanır."/>
      <//>
      <${Card} title="Başka bir tarayıcıdan geçiş" kw="taşı aktar" soon>
        <${Row} label="Verileri içe aktar" desc="Yer imlerinizi, geçmişinizi ve parolalarınızı başka bir tarayıcıdan taşıma bir sonraki sürümde geliyor." icon="import"
          kw="içe aktarma taşı yer imi geçmiş parola html chrome edge firefox" soon/>
      <//>`;
  }

  /* ── Açılışta ─────────────────────────────────────────── */
  const MODES = [
    { value: 'newtab', label: 'Yeni sekme sayfasını aç', desc: 'Her açılışta temiz bir sayfayla başlayın.', icon: 'square-plus' },
    { value: 'continue', label: 'Kaldığım yerden devam et', desc: 'Son oturumdaki sekmeleriniz ve sekme gruplarınız geri gelir.', icon: 'history' },
    { value: 'pages', label: 'Belirli sayfaları aç', desc: 'Seçtiğiniz sayfalar her açılışta yüklenir.', icon: 'layout-list' },
  ];
  const NTP = 'vox://yeni-sekme';
  const BAD_URL = 'Geçerli bir adres girin; örneğin wikipedia.org';

  function UrlForm({ draft }) {
    const [text, setText] = useState(draft.url);
    const [touched, setTouched] = useState(false);
    draft.touch = () => setTouched(true);
    const err = touched && !st.toUrl(text) ? BAD_URL : '';
    return html`<form class="st-form" onSubmit=${st.submitDialog} onKeyDown=${st.enterSubmit}>
      <${TextField} label="Site adresi" placeholder="ornek.com" icon="link" value=${text} error=${err} data-autofocus spellcheck=${false}
        onInput=${(e) => { setText(e.currentTarget.value); draft.url = e.currentTarget.value; }} onBlur=${() => text && setTouched(true)}/>
    </form>`;
  }
  function pageDialog(url, onSave) {
    const draft = { url: url || '' };
    Vox.ui.dialog({
      title: url ? 'Sayfayı düzenle' : 'Açılış sayfası ekle', icon: 'link', width: 440,
      render: () => html`<${UrlForm} draft=${draft}/>`,
      actions: [
        { label: 'Vazgeç', value: false },
        { label: url ? 'Kaydet' : 'Ekle', variant: 'primary', onClick: () => {
          const u = st.toUrl(draft.url);
          if (!u) { if (draft.touch) draft.touch(); return false; }
          onSave(u);
          return true;
        } },
      ],
    });
  }

  /** Open site tabs of this window (from the main process' process list, which knows every tab). */
  async function openTabs() {
    const m = await Vox.native.invoke('system:metrics').catch(() => null);
    const all = (m && m.tabs) || [];
    const me = all.find((t) => t.url === location.href) || all.find((t) => /^vox:\/\/(ayarlar|hakkinda)/.test(t.url || ''));
    return all.filter((t) => (!me || t.windowId === me.windowId) && /^https?:/i.test(t.url || ''));
  }

  function PagesEditor() {
    const pages = (Vox.useStore('settings.startup.pages') || []).filter((u) => typeof u === 'string');
    Vox.useStore('history');
    const set = (fn) => Vox.settings.set('startup.pages', fn((Vox.settings.get('startup.pages') || []).filter((u) => typeof u === 'string')));
    const remove = (url, i) => {
      set((l) => l.filter((x, k) => k !== i));
      st.undo(`“${st.titleFor(url)}” kaldırıldı.`, () => set((l) => { const n = l.slice(); n.splice(Math.min(i, n.length), 0, url); return n; }));
    };
    const useOpen = async () => {
      const tabs = await openTabs();
      if (!tabs.length) { Vox.ui.toast({ icon: 'info', text: 'Bu pencerede açık bir site sekmesi yok.' }); return; }
      const urls = [...new Set(tabs.map((t) => t.url))];
      set(() => urls);
      st.toast(urls.length === 1 ? 'Açık sayfa eklendi.' : `${urls.length} açık sayfa eklendi.`);
    };
    return html`<div class="st-pages">
      ${pages.length
        ? html`<ul class="st-list" aria-label="Açılış sayfaları">${pages.map((url, i) => html`<li class="st-li" key=${url + i}>
            <span class="st-li-fav"><${Favicon} spec=${st.fav(url)} size=${18}/></span>
            <span class="st-li-text"><b>${st.titleFor(url)}</b><small>${Vox.url.display(url)}</small></span>
            <${IconButton} icon="pencil" label="Düzenle" size="sm" onClick=${() => pageDialog(url, (nu) => set((l) => l.map((x, k) => (k === i ? nu : x))))}/>
            <${IconButton} icon="x" label="Kaldır" size="sm" onClick=${() => remove(url, i)}/>
          </li>`)}</ul>`
        : html`<p class="st-empty-line"><${Icon} name="layout-list" size=${18}/>Henüz sayfa eklemediniz. Bir adres ekleyin ya da açık sekmelerinizi kullanın.</p>`}
      <div class="st-btns">
        <${Button} size="sm" variant="secondary" icon="plus" onClick=${() => pageDialog(null, (nu) => set((l) => (l.includes(nu) ? l : [...l, nu])))}>Sayfa ekle<//>
        <${Button} size="sm" variant="ghost" icon="app-window" onClick=${useOpen}>Açık sayfaları kullan<//>
      </div>
    </div>`;
  }

  function HomeUrl() {
    const home = Vox.useStore('settings.startup.homeUrl') || NTP;
    const isNtp = /^vox:\/\/yeni-sekme\/?$/.test(home);
    const [mode, setMode] = useState(isNtp ? 'ntp' : 'custom');
    const [text, setText] = useState(isNtp ? '' : home);
    const [err, setErr] = useState('');
    const save = () => {
      const u = st.toUrl(text);
      if (!u) { setErr(BAD_URL); return; }
      setErr('');
      if (u !== home) { Vox.settings.set('startup.homeUrl', u); st.toast('Ana sayfa güncellendi.'); }
    };
    const pick = (v) => { setMode(v); if (v === 'ntp') { setErr(''); if (!isNtp) Vox.settings.set('startup.homeUrl', NTP); } };
    return html`<div class="st-home">
      <${Segmented} value=${mode} label="Ana sayfa" onChange=${pick}
        options=${[{ value: 'ntp', label: 'Yeni sekme sayfası', icon: 'square-plus' }, { value: 'custom', label: 'Özel adres', icon: 'link' }]}/>
      <${Reveal} open=${mode === 'custom'}>
        <form class="st-inline-form" onSubmit=${(e) => { e.preventDefault(); save(); }}>
          <${TextField} label="Ana sayfa adresi" placeholder="ornek.com" icon="link" value=${text} error=${err} spellcheck=${false}
            onInput=${(e) => setText(e.currentTarget.value)}/>
          <${Button} type="submit" variant="secondary">Kaydet<//>
        </form>
      <//>
    </div>`;
  }

  function StartupSection() {
    const mode = Vox.useStore('settings.startup.mode') || 'newtab';
    return html`
      <${Card} title="Açılış davranışı" desc="VoxBrowser'ı başlattığınızda ne görmek istersiniz?" kw="başlangıç oturum">
        <${Row} bare label="Açılış davranışı" kw="başlangıç oturum sekme geri yükle devam yeni sekme belirli sayfalar">
          <${RadioGroup} value=${mode} options=${MODES} label="Açılış davranışı" onChange=${(v) => Vox.settings.set('startup.mode', v)}/>
        <//>
        ${mode === 'pages' ? html`<${Row} stack label="Açılış sayfaları" kw="sayfa ekle adres açık sekmeler"><${Reveal} open=${true}><${PagesEditor}/><//><//>` : null}
        ${mode === 'continue' ? html`<${Row} bare label="Kaldığım yerden devam et" kw="oturum geri yükle">
          <${Note} icon="info">Gizli pencerelerdeki sekmeler hiçbir zaman geri yüklenmez.<//>
        <//>` : null}
      <//>
      <${Card} title="Ana sayfa" desc="Ana sayfa düğmesine bastığınızda açılacak sayfa." kw="home">
        <${ToggleRow} path="appearance.showHomeButton" label="Ana sayfa düğmesini göster" desc="Araç çubuğunda, yenile düğmesinin yanında görünür." icon="house" kw="home düğme"/>
        <${Row} stack label="Ana sayfa adresi" kw="home adres yeni sekme özel"><${HomeUrl}/><//>
        <${Row} label="Ana sayfayı yeni sekmede aç" icon="square-arrow-out-up-right" kw="home" onClick=${() => Vox.tabs.open(Vox.settings.get('startup.homeUrl') || NTP)}/>
      <//>`;
  }

  st.register({ id: 'profil', order: 10, title: 'Siz ve VoxBrowser', icon: 'user-round', kw: 'profil hesap sync',
    desc: 'Profiliniz; eşitleme ve başka tarayıcılardan taşıma yakında.', component: ProfileSection });
  st.register({ id: 'baslangic', order: 20, title: 'Açılışta', icon: 'power', kw: 'başlangıç ana sayfa',
    desc: 'Açılışta görecekleriniz ve ana sayfa düğmesi.', component: StartupSection });
});
