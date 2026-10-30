/* VoxBrowser — Ayarlar › Arama motoru (varsayılan motor, öneriler, motor ekle/düzenle/kaldır, @kısayollar) ve
   Voxi ve ses (Voxi'yi aç/kapat, araç çubuğu düğmesi; sesli komutlar bir sonraki sürümde). */
Vox.define('settings.searchVoxi', (Vox) => {
  const { html, useReducer } = Vox.p;
  const { cx, uid } = Vox.util;
  const { Button, Badge, Kbd, TextField, Favicon, MenuButton } = Vox.c;
  const st = Vox.st;
  const { Card, Row, ToggleRow, SelectRow, Hi, Note } = st;
  const store = Vox.store;

  /* ── Arama motoru ─────────────────────────────────────── */
  const engines = () => store.get('searchEngines') || [];
  const engineFav = (e) => ({ letter: (e.name || '?')[0].toLocaleUpperCase('tr-TR'), bg: Vox.util.hashColor(e.name || e.id), fg: '#FFFFFF' });
  /* Ana süreç kısayolu küçük harfe çevirip (yerelsiz) karşılaştırır; burada da aynısı yapılır. */
  const normKw = (k) => { const t = String(k || '').trim().replace(/\s+/g, ''); return (t.startsWith('@') ? t : `@${t}`).toLowerCase(); };
  const fullUrl = (u) => { const t = String(u || '').trim(); return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`; };
  function urlError(raw) {
    const t = String(raw || '').trim();
    if (!t) return 'Arama adresini yazın.';
    if (!t.includes('%s')) return 'Aranan sözcüğün yerine %s yazın; örneğin https://ara.ornek.com/?q=%s';
    try {
      const u = new URL(fullUrl(t).replace(/%s/g, 'x'));
      return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? '' : 'Adres http:// ya da https:// ile başlamalı.';
    } catch (e) {
      return 'Geçerli bir adres yazın.';
    }
  }
  const engineErrors = (d, others) => ({
    name: !d.name.trim() ? 'Bir ad yazın.' : '',
    keyword: normKw(d.keyword) === '@' ? 'Bir kısayol yazın.' : others.some((e) => e.keyword === normKw(d.keyword)) ? 'Bu kısayol başka bir arama motorunda kullanılıyor.' : '',
    url: urlError(d.url),
  });

  function EngineForm({ draft, others }) {
    const [, force] = useReducer((x) => x + 1, 0);
    const set = (k) => (e) => { draft[k] = e.currentTarget.value; force(); };
    draft.show = () => { draft.touched = true; force(); };
    const errs = draft.touched ? engineErrors(draft, others) : {};
    return html`<form class="st-form" onSubmit=${st.submitDialog} onKeyDown=${st.enterSubmit}>
      <${TextField} label="Ad" placeholder="Örnek Arama" value=${draft.name} error=${errs.name} onInput=${set('name')} data-autofocus/>
      <${TextField} label="Kısayol" placeholder="@ornek" value=${draft.keyword} error=${errs.keyword} onInput=${set('keyword')} spellcheck=${false}
        hint="Adres çubuğuna kısayolu yazıp boşluk bıraktığınızda doğrudan bu motorla ararsınız."/>
      <${TextField} label="Arama adresi" placeholder="https://ara.ornek.com/?q=%s" value=${draft.url} error=${errs.url} onInput=${set('url')} spellcheck=${false}
        hint="Aranan sözcüğün yerine %s yazın."/>
    </form>`;
  }
  function engineDialog(e) {
    const others = engines().filter((x) => !e || x.id !== e.id);
    const draft = { name: e ? e.name : '', keyword: e ? e.keyword : '', url: (e && e.url) || '' };
    Vox.ui.dialog({
      title: e ? 'Arama motorunu düzenle' : 'Arama motoru ekle', icon: 'search', width: 460,
      render: () => html`<${EngineForm} draft=${draft} others=${others}/>`,
      actions: [
        { label: 'Vazgeç', value: false },
        { label: e ? 'Kaydet' : 'Ekle', variant: 'primary', onClick: () => {
          const errs = engineErrors(draft, others);
          if (errs.name || errs.keyword || errs.url) { draft.show(); return false; }
          const next = { name: draft.name.trim(), keyword: normKw(draft.keyword), url: fullUrl(draft.url) };
          if (e) store.set('searchEngines', (l = []) => l.map((x) => (x.id === e.id ? { ...x, ...next } : x)));
          else store.set('searchEngines', (l = []) => [...l, { id: uid('se'), ...next }]);
          st.toast(e ? 'Arama motoru güncellendi.' : `${next.name} eklendi. Kısayolu: ${next.keyword}`);
          return true;
        } },
      ],
    });
  }
  const makeDefault = (e) => { Vox.settings.set('search.engine', e.id); st.toast(`${e.name} artık varsayılan arama motorunuz.`); };

  function EngineList() {
    const list = Vox.useStore('searchEngines') || [];
    const def = Vox.useStore('settings.search.engine');
    const remove = (e, i) => {
      store.set('searchEngines', (l = []) => l.filter((x) => x.id !== e.id));
      st.undo(`${e.name} kaldırıldı.`, () => store.set('searchEngines', (l = []) => {
        if (l.some((x) => x.id === e.id)) return l;
        const n = l.slice(); n.splice(Math.min(i, n.length), 0, e); return n;
      }));
    };
    if (!list.length) return html`<p class="st-empty-line">Arama motoru yok. “Ekle” ile bir tane ekleyin.</p>`;
    return html`<ul class="st-list st-engines" aria-label="Arama motorları">${list.map((e, i) => html`<li class=${cx('st-li', e.id === def && 'is-default')} key=${e.id}>
      <span class="st-li-fav"><${Favicon} spec=${engineFav(e)} size=${20}/></span>
      <span class="st-li-text">
        <span class="st-li-title"><b><${Hi} text=${e.name}/></b>${e.id === def ? html`<${Badge} tone="brand" icon="star">Varsayılan<//>` : null}</span>
        <small><code class="st-kw">${e.keyword}</code>${e.url ? ` · ${Vox.url.parse(e.url).host || e.url}` : ''}</small>
      </span>
      <${MenuButton} icon="ellipsis-vertical" label=${`${e.name} seçenekleri`} size="sm" items=${() => [
        { label: 'Varsayılan yap', icon: 'star', disabled: e.id === def, onSelect: () => makeDefault(e) },
        { label: 'Düzenle', icon: 'pencil', onSelect: () => engineDialog(e) },
        '-',
        { label: 'Kaldır', icon: 'trash-2', danger: true, disabled: e.id === def, hint: e.id === def ? 'Varsayılan motor kaldırılamaz' : undefined, onSelect: () => remove(e, i) },
      ]}/>
    </li>`)}</ul>`;
  }

  function SearchSection() {
    const list = Vox.useStore('searchEngines') || [];
    const opts = list.map((e) => ({ value: e.id, label: e.name, desc: e.keyword }));
    return html`
      <${Card} title="Arama motoru" desc="Adres çubuğuna yazdığınız aramalar bu motorla yapılır." kw="omnibox adres çubuğu">
        <${SelectRow} path="search.engine" label="Adres çubuğundaki arama motoru" icon="search" options=${opts} width=${200} kw="varsayılan arama motoru"
          onChange=${(v) => { const e = list.find((x) => x.id === v); if (e) st.toast(`${e.name} artık varsayılan arama motorunuz.`); }}/>
        <${ToggleRow} path="search.suggestions" label="Arama önerileri" desc="Yazarken adres çubuğunda motorun önerilerini gösterir. Yazdıklarınız bunun için arama motoruna gönderilir." icon="sparkles" kw="otomatik tamamlama öneri"/>
      <//>
      <${Card} title="Arama motorlarını yönet" desc="Kısayolu yazıp boşluk bırakın; doğrudan o motorla arayın." kw="kısayol anahtar kelime ekle düzenle"
        actions=${html`<${Button} size="sm" variant="secondary" icon="plus" onClick=${() => engineDialog(null)}>Ekle<//>`}>
        <${Row} bare label="Arama motorları listesi" kw=${list.map((e) => `${e.name} ${e.keyword}`).join(' ')}><${EngineList}/><//>
      <//>`;
  }

  /* ── Voxi ve ses ──────────────────────────────────────── */
  function VoxiSection() {
    const enabled = Vox.useStore('settings.voxi.enabled') !== false;
    return html`
      <${Card} title="Voxi" desc="VoxBrowser'ın yardımcısı." kw="asistan yardımcı">
        <${ToggleRow} path="voxi.enabled" label="Voxi'yi kullan" icon="bot" kw="asistan aç kapat"
          desc=${enabled ? 'Voxi’yi araç çubuğundan ya da Alt+V ile açabilirsiniz.' : 'Voxi kapalı; düğmesi ve paneli görünmez.'}/>
        <${ToggleRow} path="voxi.showInToolbar" label="Araç çubuğunda Voxi düğmesi" desc="Voxi’yi tek tıkla açın." icon="mouse-pointer-click" kw="düğme toolbar" disabled=${!enabled}/>
        <${Row} label="Klavye kısayolu" desc="Voxi’yi hızlıca açın." icon="keyboard" kw="kısayol tuş" wide disabled=${!enabled}>
          <span class="st-keys"><${Kbd} keys="Alt+V"/><small>veya</small><${Kbd} keys="Ctrl+Shift+Space"/></span>
        <//>
      <//>
      <${Card} title="Sesli komutlar" desc="Konuşarak arama yapın, sayfaları özetletin, sekmelerinizi düzenleyin." kw="ses mikrofon konuşma" soon>
        <${Row} bare label="Sesli komutlar hakkında" kw="mikrofon ses tanıma cihaz üzerinde whisper">
          <${Note} icon="mic-off">Sesli komutlar bir sonraki sürümde geliyor; konuşmanız bu bilgisayarda metne dönüştürülecek. Şu an mikrofonunuz hiç kullanılmıyor.<//>
        <//>
        <${ToggleRow} label="“Hey Voxi” ile başlat" desc="Cihaz yalnızca bu sözcüğü bekler; siz seslenene kadar hiçbir şey kaydedilmez." icon="audio-lines" kw="uyandırma sözcüğü wake word" soon/>
        <${SelectRow} label="Voxi'nin sesi" desc="Voxi'nin size yanıt verirken kullanacağı ses." icon="speech" kw="Deniz Ece Mert ses seç" soon width=${180}
          value="Deniz" options=${[{ value: 'Deniz', label: 'Deniz' }]}/>
        <${SelectRow} label="Konuşma dili" desc="Voxi bu dilde dinler ve yanıt verir." icon="languages" kw="dil language" soon width=${180}
          value="tr-TR" options=${[{ value: 'tr-TR', label: 'Türkçe' }]}/>
        <${ToggleRow} label="Ses geçmişini kaydet" desc="Önceki konuşmalarınızı hatırlar." icon="history" kw="kayıt konuşma" soon/>
      <//>`;
  }

  st.register({ id: 'arama', order: 40, title: 'Arama motoru', icon: 'search', kw: 'arama motoru omnibox',
    desc: 'Adres çubuğundan yaptığınız aramalar ve kısayollar.', component: SearchSection });
  st.register({ id: 'voxi', order: 50, title: 'Voxi ve ses', icon: 'audio-lines', kw: 'voxi asistan ses mikrofon',
    desc: 'Yardımcınız Voxi; sesli komutlar yakında.', component: VoxiSection });
});
