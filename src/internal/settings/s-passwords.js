/* VoxBrowser — Ayarlar › Parolalar ve otomatik doldurma: kayıtlı parolalar (ana süreçte şifreli saklanır) — arama,
   ekle/düzenle, geri alınabilir silme, göster, kopyala; parola sağlığı (zayıf / tekrar kullanılan, yerelde hesaplanır),
   güçlü parola önerisi. Sitelerde parola kaydetme/doldurma ve sızıntı denetimi bir sonraki sürümde. Adresler: s-autofill.js */
Vox.define('settings.passwords', (Vox) => {
  const { html, useState, useReducer } = Vox.p;
  const { cx, uid } = Vox.util;
  const { Icon, Button, IconButton, Badge, TextField, SearchField, ProgressRing, Favicon, MenuButton } = Vox.c;
  const st = Vox.st;
  const { Card, Row, ToggleRow, Strength, Hi, CountUp, Note, Soon } = st;
  const store = Vox.store;

  /* ── Yardımcılar ──────────────────────────────────────── */
  function strengthOf(pw) {
    const s = String(pw || '');
    let n = 0;
    if (s.length >= 8) n++;
    if (s.length >= 12) n++;
    if (/[a-zçğıöşü]/.test(s) && /[A-ZÇĞİÖŞÜ]/.test(s)) n++;
    if (/\d/.test(s)) n++;
    if (/[^A-Za-z0-9çğıöşüÇĞİÖŞÜ]/.test(s)) n++;
    return n >= 4 ? 'güçlü' : n === 3 ? 'orta' : 'zayıf';
  }
  /** Adds the live health flags (never stored). */
  function withHealth(list) {
    const c = new Map();
    list.forEach((p) => c.set(p.password, (c.get(p.password) || 0) + 1));
    return list.map((p) => ({ ...p, strength: strengthOf(p.password), reused: c.get(p.password) > 1 }));
  }
  function generate() {
    const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const r = new Uint32Array(16);
    window.crypto.getRandomValues(r);
    const s = Array.from(r, (x) => abc[x % abc.length]);
    s[3] = String(2 + (r[3] % 8)); s[6] = 'QWERTYUP'[r[6] % 8];
    return `${s.slice(0, 4).join('')}-${s.slice(4, 8).join('')}-${s.slice(8, 12).join('')}-${s.slice(12).join('')}`;
  }
  function health(list) {
    const weak = list.filter((p) => p.strength === 'zayıf').length;
    const reused = list.filter((p) => p.reused).length;
    const bad = list.filter((p) => p.strength === 'zayıf' || p.reused).length;
    return { weak, reused, total: list.length, safe: list.length - bad };
  }
  const matches = (p, f) => !f || (f === 'weak' ? p.strength === 'zayıf' : !!p[f]);
  const originOf = (text) => { const u = st.toUrl(text); return u && /^https?:/.test(u) ? new URL(u).origin : ''; };
  const save = (fn) => store.set('passwords', (l = []) => fn(l));

  /* ── Sağlık kartı ─────────────────────────────────────── */
  const TILES = [
    { id: 'reused', label: 'Tekrar kullanılan', icon: 'copy', tone: 'warn', hint: 'Her siteye ayrı bir parola verin.' },
    { id: 'weak', label: 'Zayıf', icon: 'shield-half', tone: 'warn', hint: 'Daha uzun ve karışık bir parola seçin.' },
  ];
  function Health({ filter, setFilter }) {
    const list = withHealth(Vox.useStore('passwords') || []);
    const h = health(list);
    const ratio = h.total ? h.safe / h.total : 1;
    return html`<div class="st-health">
      <div class="st-health-main">
        <${ProgressRing} value=${ratio} size=${86} stroke=${8} tone=${ratio < 0.6 ? 'honey' : undefined} label="Güvenli parola oranı">
          <span class="st-health-pct"><b>${h.safe}</b><small>/${h.total}</small></span>
        <//>
        <div class="st-health-text">
          <b>${!h.total ? 'Henüz kayıtlı parolanız yok' : h.safe === h.total ? 'Parolalarınız sağlıklı görünüyor' : `${h.total - h.safe} parola ilgilenmenizi bekliyor`}</b>
          <small>${!h.total ? 'Eklediğiniz parolaların gücü ve tekrarı burada denetlenir.'
            : `${h.safe ? `${h.safe} parolada sorun görünmüyor` : 'Her parolada iyileştirilecek bir şey var'} · denetim bu bilgisayarda yapılır`}</small>
        </div>
      </div>
      <div class="st-htiles">${TILES.map((t) => {
        const n = h[t.id];
        return html`<button type="button" key=${t.id} class=${cx('st-htile', `tone-${t.tone}`, !n && 'is-zero', filter === t.id && 'is-on')}
          aria-pressed=${String(filter === t.id)} disabled=${!n} onClick=${() => setFilter(filter === t.id ? null : t.id)}>
          <span class="st-htile-top"><span class="st-htile-ic"><${Icon} name=${n ? t.icon : 'check'} size=${16}/></span><span class="st-htile-n"><${CountUp} value=${n}/></span></span>
          <b>${t.label}</b><small>${n ? t.hint : 'Sorun yok.'}</small>
        </button>`;
      })}
        <div class="st-htile is-zero is-soon" aria-disabled="true">
          <span class="st-htile-top"><span class="st-htile-ic"><${Icon} name="shield-alert" size=${16}/></span><${Soon}/></span>
          <b>Sızıntı denetimi</b><small>Parolalarınız bilinen veri sızıntılarıyla karşılaştırılacak.</small>
        </div>
      </div>
    </div>`;
  }

  /* ── Liste ────────────────────────────────────────────── */
  function PwForm({ draft, p }) {
    const [, force] = useReducer((x) => x + 1, 0);
    const [show, setShow] = useState(!p);
    draft.show = () => { draft.touched = true; force(); };
    const set = (k) => (e) => { draft[k] = e.currentTarget.value; force(); };
    const errs = draft.touched ? {
      site: !p && !originOf(draft.site) ? 'Geçerli bir site adresi yazın; örneğin wikipedia.org' : '',
      username: !draft.username.trim() ? 'Kullanıcı adını yazın.' : '',
      password: draft.password.length < 4 ? 'Parola en az 4 karakter olmalı.' : '',
    } : {};
    const lvl = strengthOf(draft.password);
    return html`<form class="st-form" onSubmit=${st.submitDialog} onKeyDown=${st.enterSubmit} autocomplete="off">
      ${p ? html`<div class="st-pw-dlg-site"><span class="st-li-fav"><${Favicon} spec=${st.fav(p.origin)} size=${20}/></span><b>${st.host(p.origin)}</b></div>`
        : html`<${TextField} label="Site" placeholder="ornek.com" icon="globe" value=${draft.site} error=${errs.site} onInput=${set('site')} spellcheck=${false} data-autofocus/>`}
      <${TextField} label="Kullanıcı adı" icon="user-round" value=${draft.username} error=${errs.username} onInput=${set('username')} autocomplete="off" spellcheck=${false} data-autofocus=${p ? true : undefined}/>
      <${TextField} label="Parola" icon="key-round" value=${draft.password} error=${errs.password} onInput=${set('password')} autocomplete="off" spellcheck=${false}
        class=${show ? '' : 'st-masked'} trailing=${html`<${IconButton} icon=${show ? 'eye-off' : 'eye'} label=${show ? 'Parolayı gizle' : 'Parolayı göster'} size="sm" onClick=${() => setShow(!show)}/>`}/>
      <div class="st-pw-meter">
        <${Strength} level=${draft.password ? lvl : null}/><span>${draft.password ? `Parola gücü: ${lvl}` : 'Parola gücü'}</span>
        <${Button} size="sm" variant="ghost" icon="wand-sparkles" onClick=${() => { draft.password = generate(); setShow(true); force(); }}>Güçlü parola öner<//>
      </div>
    </form>`;
  }
  function editPw(p) {
    const draft = { site: '', username: p ? p.username : '', password: p ? p.password : generate() };
    Vox.ui.dialog({
      title: p ? 'Parolayı düzenle' : 'Parola ekle', icon: 'key-round', width: 460,
      render: () => html`<${PwForm} draft=${draft} p=${p}/>`,
      actions: [
        { label: 'Vazgeç', value: false },
        { label: p ? 'Kaydet' : 'Ekle', variant: 'primary', onClick: () => {
          const origin = p ? p.origin : originOf(draft.site);
          if (!origin || !draft.username.trim() || draft.password.length < 4) { draft.show(); return false; }
          if (p) save((l) => l.map((x) => (x.id === p.id ? { ...x, username: draft.username.trim(), password: draft.password, changed: Date.now() } : x)));
          else save((l) => [{ id: uid('pw'), origin, username: draft.username.trim(), password: draft.password, added: Date.now() }, ...l]);
          st.toast(p ? 'Parola güncellendi.' : `${st.host(origin)} için parola kaydedildi.`);
          return true;
        } },
      ],
    });
  }

  function PwList({ filter, setFilter }) {
    const list = withHealth(Vox.useStore('passwords') || []);
    Vox.useStore('history');
    const [q, setQ] = useState('');
    const [shown, setShown] = useState({});
    const nq = st.norm(q.trim());
    const items = list.filter((p) => matches(p, filter) && (!nq || st.hit(nq, st.host(p.origin), p.username)));
    const remove = (p, el) => {
      const raw = (store.get('passwords') || []).find((x) => x.id === p.id);
      const i = (store.get('passwords') || []).findIndex((x) => x.id === p.id);
      st.leave(el, () => save((l) => l.filter((x) => x.id !== p.id)));
      st.undo(`${st.host(p.origin)} parolası silindi.`, () => save((l) => {
        if (!raw || l.some((x) => x.id === raw.id)) return l;
        const n = l.slice(); n.splice(Math.max(0, Math.min(i, n.length)), 0, raw); return n;
      }));
    };
    const tile = TILES.find((t) => t.id === filter);
    return html`<div class="st-pw">
      <div class="st-pw-tools">
        <${SearchField} value=${q} onInput=${setQ} placeholder="Parolalarda ara" label="Kayıtlı parolalarda ara"/>
        ${tile ? html`<button type="button" class="st-chip is-on" onClick=${() => setFilter(null)}>${tile.label}<${Icon} name="x" size=${14}/></button>` : null}
      </div>
      ${items.length ? html`<ul class="st-pw-list" aria-label="Kayıtlı parolalar">${items.map((p) => html`<li class="st-pw-row" key=${p.id} data-pw=${p.id}>
        <span class="st-li-fav"><${Favicon} spec=${st.fav(p.origin)} size=${20}/></span>
        <span class="st-pw-site"><b><${Hi} text=${st.host(p.origin)}/></b><small><${Hi} text=${p.username}/></small></span>
        <span class="st-pw-secret">
          ${shown[p.id] ? html`<code class="st-pw-plain">${p.password}</code>` : html`<span class="st-pw-dots" role="img" aria-label="Gizli parola">${'•'.repeat(Math.min(12, p.password.length))}</span>`}
          <${Strength} level=${p.strength}/>
          ${p.reused ? html`<${Badge} tone="warn" icon="copy">Tekrar<//>` : null}
        </span>
        <span class="st-pw-actions">
          <${IconButton} icon=${shown[p.id] ? 'eye-off' : 'eye'} label=${shown[p.id] ? 'Parolayı gizle' : 'Parolayı göster'} size="sm" onClick=${() => setShown((s) => ({ ...s, [p.id]: !s[p.id] }))}/>
          <${IconButton} icon="copy" label="Parolayı kopyala" size="sm" onClick=${() => st.copy(p.password, 'Parola panoya kopyalandı.')}/>
          <${MenuButton} icon="ellipsis-vertical" label=${`${st.host(p.origin)} seçenekleri`} size="sm" items=${() => [
            { label: 'Kullanıcı adını kopyala', icon: 'user-round', onSelect: () => st.copy(p.username, 'Kullanıcı adı panoya kopyalandı.') },
            { label: 'Düzenle', icon: 'pencil', onSelect: () => editPw((store.get('passwords') || []).find((x) => x.id === p.id)) },
            { label: 'Siteye git', icon: 'square-arrow-out-up-right', onSelect: () => Vox.tabs.open(`${p.origin}/`) },
            '-',
            { label: 'Sil', icon: 'trash-2', danger: true, onSelect: () => remove(p, document.querySelector(`li[data-pw="${p.id}"]`)) },
          ]}/>
        </span>
      </li>`)}</ul>`
        : html`<p class="st-empty-line"><${Icon} name=${list.length ? 'search-x' : 'key-round'} size=${18}/>${list.length ? 'Bu aramayla eşleşen parola yok.' : 'Kayıtlı parolanız yok. “Ekle” ile bir parola kaydedebilirsiniz.'}</p>`}
    </div>`;
  }

  function PasswordsSection() {
    const [filter, setFilter] = useState(null);
    const list = Vox.useStore('passwords') || [];
    return html`
      <${Card} title="Parola sağlığı" desc="Zayıf ve birden çok sitede kullanılan parolalarınızı bulun." kw="güvenlik denetim">
        <${Row} bare label="Parola sağlığı" kw="zayıf tekrar kullanılan sızıntı denetim şifre"><${Health} filter=${filter} setFilter=${setFilter}/><//>
      <//>
      <${Card} title="Kayıtlı parolalar" desc=${list.length ? `${list.length} parola bu bilgisayarda şifreli olarak saklanıyor.` : 'Parolalarınız bu bilgisayarda şifreli olarak saklanır.'} kw="şifre parola yöneticisi"
        actions=${html`<${Button} size="sm" variant="secondary" icon="plus" onClick=${() => editPw(null)}>Ekle<//>`}>
        <${Row} bare label="Kayıtlı parolalar" kw=${`şifre ${list.map((p) => `${st.host(p.origin)} ${p.username}`).join(' ')}`}><${PwList} filter=${filter} setFilter=${setFilter}/><//>
        <${ToggleRow} label="Parolaları kaydetmeyi öner" desc="Bir sitede oturum açtığınızda parolayı kaydetmeyi önerir." icon="key-round" kw="şifre kaydet" soon/>
        <${ToggleRow} label="Otomatik oturum aç" desc="Kayıtlı bilgilerle sitelere kendiliğinden girer." icon="log-in" kw="giriş doldur" soon/>
        <${Row} bare label="Sitelerde parola kaydetme hakkında" kw="otomatik doldurma">
          <${Note} icon="info">Sitelerde parola kaydetme ve formları doldurma bir sonraki sürümde geliyor. Şimdilik parolalarınızı buradan ekleyip kopyalayabilirsiniz.<//>
        <//>
      <//>
      ${st.AutofillCards ? html`<${st.AutofillCards}/>` : null}`;
  }

  st.passwords = { strengthOf, generate };
  st.register({ id: 'parolalar', order: 70, title: 'Parolalar ve otomatik doldurma', icon: 'key-round', kw: 'şifre parola adres kart ödeme',
    desc: 'Parola yöneticisi ve kayıtlı adresler.', component: PasswordsSection });
});
