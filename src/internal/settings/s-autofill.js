/* VoxBrowser — Ayarlar › Parolalar ve otomatik doldurma: kayıtlı adresler (settings.autofillData.addresses; maskeli
   gösterim, ekle/düzenle/geri alınabilir sil; "Tarama verilerini temizle › Kayıtlı adresler" hepsini siler).
   Formları doldurma ve ödeme yöntemleri bir sonraki sürümde; kart bilgisi hiçbir yerde istenmez ya da saklanmaz. */
Vox.define('settings.autofill', (Vox) => {
  const { html, useReducer } = Vox.p;
  const { uid } = Vox.util;
  const { Icon, Button, IconButton, TextField, Segmented } = Vox.c;
  const st = Vox.st;
  const { Card, Row, ToggleRow, Hi, Note } = st;
  const store = Vox.store;

  const setAddresses = (fn) => store.set('settings.autofillData', (d) => {
    const cur = d && typeof d === 'object' ? d : {};
    return { ...cur, addresses: fn(Array.isArray(cur.addresses) ? cur.addresses : []) };
  });
  /** "Moda Caddesi No: 14 Daire: 3" → "Moda Caddesi No: •• Daire: •" */
  const maskNums = (s) => String(s || '').replace(/\d+/g, (m) => '•'.repeat(Math.min(2, m.length)));
  /** Keeps only the last two digits visible. */
  const maskPhone = (p) => {
    const s = String(p || '');
    const total = (s.match(/\d/g) || []).length;
    let i = 0;
    return s.replace(/\d/g, (d) => (++i > total - 2 ? d : '•'));
  };
  const LABELS = [{ value: 'Ev', label: 'Ev', icon: 'house' }, { value: 'İş', label: 'İş', icon: 'briefcase' }, { value: 'Diğer', label: 'Diğer', icon: 'map-pin' }];

  function AddressForm({ draft }) {
    const [, force] = useReducer((x) => x + 1, 0);
    draft.show = () => { draft.touched = true; force(); };
    const set = (k) => (e) => { draft[k] = e.currentTarget.value; force(); };
    const req = (k, msg) => (draft.touched && !String(draft[k] || '').trim() ? msg : '');
    return html`<form class="st-form" onSubmit=${st.submitDialog} onKeyDown=${st.enterSubmit} autocomplete="off">
      <${Segmented} value=${draft.label} label="Adres türü" onChange=${(v) => { draft.label = v; force(); }} options=${LABELS}/>
      <${TextField} label="Ad soyad" value=${draft.name} error=${req('name', 'Ad soyad gerekli.')} onInput=${set('name')} autocomplete="off" data-autofocus/>
      <${TextField} label="Adres" value=${draft.street} error=${req('street', 'Adresi yazın.')} onInput=${set('street')} autocomplete="off" placeholder="Mahalle, cadde, numara"/>
      <${TextField} label="İlçe / il" value=${draft.city} error=${req('city', 'İlçe ve ili yazın.')} onInput=${set('city')} autocomplete="off" placeholder="Kadıköy / İstanbul"/>
      <${TextField} label="Telefon (isteğe bağlı)" value=${draft.phone} onInput=${set('phone')} autocomplete="off" inputmode="tel"/>
    </form>`;
  }
  function addressDialog(a) {
    const draft = a ? { ...a } : { label: 'Ev', name: (store.get('profile') || {}).fullName || '', street: '', city: '', phone: '' };
    Vox.ui.dialog({
      title: a ? 'Adresi düzenle' : 'Adres ekle', icon: 'map-pin', width: 460,
      render: () => html`<${AddressForm} draft=${draft}/>`,
      actions: [
        { label: 'Vazgeç', value: false },
        { label: a ? 'Kaydet' : 'Ekle', variant: 'primary', onClick: () => {
          if (!draft.name.trim() || !draft.street.trim() || !draft.city.trim()) { draft.show(); return false; }
          const next = { id: a ? a.id : uid('ad'), label: draft.label, name: draft.name.trim(), street: draft.street.trim(), city: draft.city.trim(), phone: String(draft.phone || '').trim(), added: a ? a.added : Date.now() };
          setAddresses((l) => (a ? l.map((x) => (x.id === a.id ? next : x)) : [...l, next]));
          st.toast(a ? 'Adres güncellendi.' : 'Adres kaydedildi.');
          return true;
        } },
      ],
    });
  }
  function Addresses() {
    const d = Vox.useStore('settings.autofillData');
    const list = (d && Array.isArray(d.addresses)) ? d.addresses : [];
    const remove = (a, el) => {
      const i = list.findIndex((x) => x.id === a.id);
      st.leave(el, () => setAddresses((l) => l.filter((x) => x.id !== a.id)));
      st.undo('Adres silindi.', () => setAddresses((l) => { if (l.some((x) => x.id === a.id)) return l; const n = l.slice(); n.splice(Math.max(0, Math.min(i, n.length)), 0, a); return n; }));
    };
    return html`<div class="st-af">
      ${list.length ? html`<ul class="st-list" aria-label="Kayıtlı adresler">${list.map((a) => html`<li class="st-li" key=${a.id} data-ad=${a.id}>
        <span class="st-li-fav st-li-fav--ic"><${Icon} name=${a.label === 'İş' ? 'briefcase' : a.label === 'Ev' ? 'house' : 'map-pin'} size=${17}/></span>
        <span class="st-li-text"><b><${Hi} text=${`${a.label} · ${a.name}`}/></b><small>${maskNums(a.street)}, ${a.city}</small>${a.phone ? html`<small>${maskPhone(a.phone)}</small>` : null}</span>
        <${IconButton} icon="pencil" label="Adresi düzenle" size="sm" onClick=${() => addressDialog(a)}/>
        <${IconButton} icon="trash-2" label="Adresi sil" size="sm" onClick=${(e) => remove(a, e.currentTarget.closest('li'))}/>
      </li>`)}</ul>` : html`<p class="st-empty-line"><${Icon} name="map-pin" size=${18}/>Kayıtlı adres yok.</p>`}
      <${Button} size="sm" variant="secondary" icon="plus" onClick=${() => addressDialog(null)}>Adres ekle<//>
    </div>`;
  }

  function AutofillCards() {
    const d = Vox.useStore('settings.autofillData');
    const list = (d && Array.isArray(d.addresses)) ? d.addresses : [];
    return html`
      <${Card} title="Adresler" desc="Teslimat ve fatura adreslerinizi burada saklayabilirsiniz." kw="adres form otomatik doldurma teslimat">
        <${Row} bare label="Kayıtlı adresler" kw=${`adres ${list.map((a) => `${a.label} ${a.name} ${a.city}`).join(' ')}`}><${Addresses}/><//>
        <${ToggleRow} label="Formlarda adresleri doldur" desc="Sitelerdeki adres formlarını kayıtlı adreslerinizle tek dokunuşta doldurur." icon="text-cursor-input" kw="form adres otomatik doldurma" soon/>
      <//>
      <${Card} title="Ödeme yöntemleri" desc="Kartlarınızı güvenle saklayıp ödeme sırasında kullanma." kw="kart kredi banka ödeme" soon>
        <${Row} bare label="Ödeme yöntemleri hakkında" kw="kart ödeme">
          <${Note} icon="lock">Kart kaydetme bir sonraki sürümde, şifreli depolamayla birlikte geliyor. VoxBrowser şu an hiçbir kart bilgisini saklamıyor.<//>
        <//>
      <//>`;
  }
  st.AutofillCards = AutofillCards;
});
