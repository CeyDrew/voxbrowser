/* VoxBrowser — "Tarama verilerini temizle" (vox://ayarlar/gizlilik/temizle, Ctrl+Shift+Delete).
   Zaman aralığı + veri türleri → ana süreçteki data:clearBrowsing. Her tür sırayla, ayrı bir çağrıyla silinir; adım ancak
   gerçekten bittiğinde işaretlenir. Sayılar yalnızca bilinenler için gösterilir: önbellek boyutu ana süreçten
   (data:cacheSize) gelir, çerezlerin boyutu bilinmez. */
Vox.define('settings.clearData', (Vox) => {
  const { html, useState, useRef, useEffect } = Vox.p;
  const { cx } = Vox.util;
  const { Button, Icon, Checkbox, Select, ProgressBar, Spinner } = Vox.c;
  const st = Vox.st;
  const store = Vox.store;
  const H = 3600e3, D = 86400e3;

  const RANGES = [
    { value: 'saat', label: 'Son 1 saat', ms: H },
    { value: 'gun', label: 'Son 24 saat', ms: D },
    { value: 'hafta', label: 'Son 7 gün', ms: 7 * D },
    { value: 'ay', label: 'Son 4 hafta', ms: 28 * D },
    { value: 'tum', label: 'Tüm zamanlar', ms: 0 },
  ];
  const sinceOf = (r) => { const x = RANGES.find((y) => y.value === r) || RANGES[1]; return x.ms ? Date.now() - x.ms : 0; };
  /* timed: ana süreç bu türde zaman aralığını uygular; diğerleri her zaman tümüyle silinir. */
  const ITEMS = [
    { id: 'history', label: 'Tarama geçmişi', icon: 'history', timed: true },
    { id: 'downloads', label: 'İndirme geçmişi', icon: 'download', timed: true },
    { id: 'cookies', label: 'Çerezler ve diğer site verileri', icon: 'cookie' },
    { id: 'cache', label: 'Önbellekteki resimler ve dosyalar', icon: 'database' },
    { id: 'passwords', label: 'Kayıtlı parolalar', icon: 'key-round' },
    { id: 'permissions', label: 'Siteye özel izinler', icon: 'shield-check' },
    { id: 'autofill', label: 'Kayıtlı adresler', icon: 'map-pin' },
  ];
  const PREFS = 'ui.settings.clearData';

  /** cacheBytes: Chromium cache size of this profile (null while unknown). */
  function measure(since, cacheBytes = null) {
    const s = store.get();
    const known = Number.isFinite(cacheBytes);
    const hist = (s.history || []).filter((e) => e.ts >= since).length;
    const dls = (s.downloads || []).filter((d) => (!since || d.startedAt >= since) && d.state !== 'in_progress').length;
    const pws = (s.passwords || []).length;
    const sites = Object.keys(s.permissions || {}).length;
    const addr = (((s.settings || {}).autofillData || {}).addresses || []).length;
    return {
      history: { n: hist, text: hist ? `${Vox.fmt.num(hist)} sayfa` : 'Bu aralıkta geçmiş yok', sum: `${Vox.fmt.num(hist)} geçmiş öğesi` },
      downloads: { n: dls, text: dls ? `${Vox.fmt.num(dls)} kayıt · dosyalar diskte kalır` : 'Bu aralıkta indirme kaydı yok', sum: `${Vox.fmt.num(dls)} indirme kaydı` },
      cookies: { n: -1, text: 'Çoğu siteden çıkış yaparsınız', sum: 'çerezler' },
      cache: !known ? { n: -1, text: 'Siteler bir sonraki ziyarette biraz daha yavaş açılabilir', sum: 'önbellek' }
        : cacheBytes > 0 ? { n: cacheBytes, text: `${Vox.fmt.bytes(cacheBytes)} boşalır`, sum: `${Vox.fmt.bytes(cacheBytes)} önbellek` }
        : { n: 0, text: 'Önbellek boş', sum: 'önbellek' },
      passwords: { n: pws, text: pws ? `${Vox.fmt.num(pws)} parolanın tümü` : 'Kayıtlı parola yok', sum: `${Vox.fmt.num(pws)} parola` },
      permissions: { n: sites, text: sites ? `${Vox.fmt.num(sites)} sitenin izinleri sıfırlanır` : 'Siteye özel izin yok', sum: `${Vox.fmt.num(sites)} sitenin izinleri` },
      autofill: { n: addr, text: addr ? `${Vox.fmt.num(addr)} adresin tümü` : 'Kayıtlı adres yok', sum: `${Vox.fmt.num(addr)} adres` },
    };
  }

  function ClearDialog({ close }) {
    const prefs = store.get(`settings.${PREFS}`) || {};
    const [range, setRange] = useState(prefs.range || 'gun');
    const [sel, setSel] = useState(prefs.items || { history: true, cookies: true, cache: true });
    const [phase, setPhase] = useState('pick');
    const [step, setStep] = useState(-1);
    const [plan, setPlan] = useState([]);
    const [failed, setFailed] = useState({});
    const [cacheBytes, setCacheBytes] = useState(null);
    const ref = useRef();
    const alive = useRef(true);
    useEffect(() => () => { alive.current = false; }, []);
    /* Önbellek boyutu (gerçek, bu profilin Chromium önbelleği) */
    useEffect(() => {
      Vox.native.invoke('data:cacheSize').then((n) => { if (alive.current && Number.isFinite(n)) setCacheBytes(n); }, () => {});
    }, []);
    /* canlı sayımlar için ilgili verilere abone ol */
    Vox.useStore('history'); Vox.useStore('downloads'); Vox.useStore('passwords'); Vox.useStore('permissions'); Vox.useStore('settings.autofillData');
    const since = sinceOf(range);
    const m = measure(since, cacheBytes);
    const chosen = ITEMS.filter((i) => sel[i.id]);
    const partial = range !== 'tum' && chosen.some((i) => !i.timed);

    const run = async () => {
      st.setNow(PREFS, { range, items: sel }); // hemen yazılır: "autofill" temizliği ayarlar dilimini ana süreçten yeniden yayınlar
      const snap = chosen.map((i) => ({ ...i, ...m[i.id] }));
      setPlan(snap);
      setPhase('run');
      st.lockDialog(ref.current, true);
      const bad = {};
      for (let k = 0; k < snap.length; k++) {
        setStep(k);
        const t0 = performance.now();
        const ok = await Vox.native.invoke('data:clearBrowsing', { since: snap[k].timed ? since : 0, types: [snap[k].id] })
          .then(() => true, (e) => { Vox.reportError('data:clearBrowsing', e); return false; });
        if (!ok) { bad[snap[k].id] = true; setFailed({ ...bad }); }
        /* Çok hızlı biten adımlar da göz tarafından fark edilsin diye kısa bir aralık (ilerleme gerçek). */
        const rest = 160 - (performance.now() - t0);
        if (rest > 0 && !Vox.motion.reduced()) await Vox.util.sleep(rest);
        if (!alive.current) return;
      }
      setStep(snap.length);
      setPhase('done');
      st.lockDialog(ref.current, false);
      const okParts = snap.filter((i) => !bad[i.id] && i.n !== 0).map((i) => i.sum);
      const failCount = Object.keys(bad).length;
      setTimeout(() => {
        if (alive.current) close(true);
        if (failCount) Vox.ui.toast({ icon: 'triangle-alert', tone: 'danger', text: `${failCount === snap.length ? 'Veriler' : 'Bazı veriler'} temizlenemedi. Lütfen yeniden deneyin.` });
        else Vox.ui.toast({ icon: 'sparkles', tone: 'success', title: 'Temizlendi.', text: okParts.length ? ` ${st.joinTr(okParts)} silindi.` : ' Silinecek veri yoktu.' });
      }, Vox.motion.reduced() ? 300 : 1100);
    };

    if (phase === 'pick') {
      return html`<div class="st-dlg st-clear" ref=${ref}>
        <div class="st-dlg-field st-clear-range"><span class="st-dlg-label">Zaman aralığı</span>
          <${Select} value=${range} options=${RANGES} label="Zaman aralığı" onChange=${setRange}/>
        </div>
        <div class="st-clear-list">
          ${ITEMS.map((i) => html`<div class=${cx('st-clear-item', sel[i.id] && 'is-on')} key=${i.id}>
            <span class="st-clear-ic"><${Icon} name=${i.icon} size=${18}/></span>
            <${Checkbox} checked=${!!sel[i.id]} label=${i.label} desc=${m[i.id].text} onChange=${(v) => setSel((s) => ({ ...s, [i.id]: v }))}/>
          </div>`)}
        </div>
        ${partial ? html`<${st.Note} icon="info">Zaman aralığı yalnızca geçmiş ve indirme kayıtlarına uygulanır; seçtiğiniz diğer veriler tümüyle silinir.<//>` : null}
        <div class="dialog-actions">
          <${Button} onClick=${() => close(false)}>Vazgeç<//>
          <${Button} variant="primary" icon="trash-2" disabled=${!chosen.length} onClick=${run}>Verileri temizle<//>
        </div>
      </div>`;
    }
    const total = plan.length ? Math.min(1, step / plan.length) : 1;
    const anyFail = Object.keys(failed).length > 0;
    return html`<div class="st-dlg st-clear" ref=${ref} aria-busy=${phase === 'run' ? 'true' : 'false'}>
      ${phase === 'done'
        ? html`<div class="st-clear-done">${anyFail ? html`<span class="st-clear-fail"><${Icon} name="triangle-alert" size=${30}/></span>` : html`<${st.CheckDraw} size=${56}/>`}
            <b>${anyFail ? 'Bazı veriler temizlenemedi' : 'Hepsi temizlendi'}</b></div>`
        : html`<p class="dialog-body">Temizleniyor…</p>`}
      <ul class="st-steps">${plan.map((i, k) => html`<li class=${cx('st-step', k < step && 'is-done', k === step && 'is-run', failed[i.id] && 'is-fail')} key=${i.id}>
        <span class="st-step-ic"><${Icon} name=${i.icon} size=${18}/></span>
        <span class="st-step-label">${i.label}<small>${i.n === 0 ? 'Silinecek veri yok' : i.n > 0 ? i.sum : i.text}</small></span>
        <span class="st-step-state">${failed[i.id] ? html`<span class="st-step-x"><${Icon} name="x" size=${16} stroke=${3}/></span>`
          : k < step ? html`<span class="st-step-ok"><${Icon} name="check" size=${16} stroke=${3}/></span>`
          : k === step ? html`<${Spinner} size=${20}/>` : html`<span class="st-step-wait">Sırada</span>`}</span>
      </li>`)}</ul>
      <${ProgressBar} value=${total} label="Temizleme ilerlemesi"/>
    </div>`;
  }

  let open = false;
  function openDialog() {
    if (open) return;
    open = true;
    Vox.ui.dialog({ title: 'Tarama verilerini temizle', icon: 'trash-2', width: 540, actions: [], className: 'st-dialog', render: ({ close }) => html`<${ClearDialog} close=${close}/>` })
      .then(() => { open = false; });
  }
  st.clearData = { open: openDialog, measure, RANGES };
});
