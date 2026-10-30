/* voxi — sayfa ve web komutları: sesli komut notu, sesli okuma, sayfa özeti, geçmişte/yer imlerinde arama,
   sayfada bul, hava durumu, site içi arama, web araması ve site açma ("YouTube'u aç", "github.com'a git"). */
Vox.define('voxi.rules.web', (Vox) => {
  const vx = Vox.vx;
  const { rule, ask } = vx.intents;
  const tab = () => vx.activeTab();
  const noTab = { text: 'Açık bir sekme yok.' };
  const later = (fn, ms = 650) => () => new Promise((r) => setTimeout(() => { try { fn(); } finally { r(); } }, ms));
  const fns = (vx.actionFns = vx.actionFns || {});

  /* ── Ses: sesli komutlar sonraki sürümde; sesli okuma bilgisayardaki Türkçe sesle ── */
  rule('voice', 10, /sesli komut|mikrofon|beni dinle|sesimi (duy|tani|algila)|konusarak|sesle (komut|kontrol|yonet|sor)|sesli asistan|konusabilir miyim/, () => ({
    text: 'Sesli komutlar bir sonraki sürümde geliyor; konuşmanız bu bilgisayarda işlenecek. Şimdilik yazarak sorabilirsiniz.',
  }));
  fns.speechStop = () => vx.speech.stop();
  rule('speech-stop', 12, /^(dur|sus|kes|yeter|sessiz ol|tamam dur|durdur)$|okuma\w*( \w+)? (durdur|kes|bitir|kapat)|sesli okuma|konusma\w* kes|okumayi birak/, (m, p) => {
    if (!vx.speech.speaking()) {
      if (p.f === 'durdur' || !/(dur|sus|kes|yeter|bitir|kapat|birak)/.test(p.f)) return null; // yüklemeyi durdur / sesli okumayı başlat
      return { text: 'Şu an sesli okuma yapmıyorum.' };
    }
    vx.speech.stop();
    return { text: 'Sesli okumayı durdurdum.' };
  });

  /** Starts reading aloud and describes the honest outcome. */
  async function speakReply(text, title, note) {
    const res = await vx.speech.speak(text, { title });
    if (res.ok) return { text: `“${vx.clip(title, 60)}” metnini sesli okuyorum.`, note: [note, `Ses: ${res.voice}`].filter(Boolean).join(' · '), actions: [{ label: 'Durdur', icon: 'square', fn: 'speechStop' }] };
    if (res.reason === 'no-voice') {
      return { tone: 'unsure', text: 'Bilgisayarınızda yüklü bir Türkçe ses bulamadım, bu yüzden sesli okuyamıyorum.', note: 'Windows Ayarlar › Zaman ve dil › Konuşma bölümünden Türkçe bir ses ekleyebilirsiniz.' };
    }
    if (res.reason === 'unsupported') return { tone: 'unsure', text: 'Bu sistemde konuşma sentezi kullanılamıyor.' };
    return { text: 'Okuyacak bir metin bulamadım.' };
  }
  /** For chips: reads `text`; only reports back when it could not start. */
  vx.speakText = async (text, title = 'Seçilen metin') => {
    const r = await speakReply(text, title);
    if (r.tone === 'unsure' || !/okuyorum/.test(r.text)) Vox.voxi.say(r);
  };
  rule('speech-read', 14, /sesli oku|yuksek sesle|seslendir|(sayfa\w*|metni|yaziyi|bunu|haberi|makaleyi|icerigi) oku\b|^oku$|bana oku/, async (m, p) => {
    const t = tab();
    const r = await vx.reader.pageOf(t);
    if (r.error) return { text: r.error };
    if (/ozet/.test(p.f)) {
      const s = vx.reader.summarize(r.pt);
      return s.bullets.length ? speakReply(s.bullets.join(' '), 'Sayfanın özeti') : { text: 'Bu sayfada okuyacak kadar metin bulamadım.' };
    }
    const rd = vx.reader.readable(r.pt);
    if (!rd.text) return { text: 'Bu sayfada okuyacak kadar metin bulamadım.' };
    return speakReply(rd.text, r.pt.title || t.title, rd.capped ? 'Sayfa uzun; ilk bölümlerini okuyorum' : '');
  });

  /* ── Sayfa özeti: sayfadaki cümlelerden seçilir, yeniden yazılmaz ── */
  rule('summary', 16, /ozet|ne anlatiyor|ne diyor|kisaca anlat|ana fikr|\btl ?dr\b|neyden bahsediyor|ne hakkinda|konusu ne/, async () => {
    const t = tab();
    const r = await vx.reader.pageOf(t);
    if (r.error) return { text: r.error, actions: r.newtab ? [ask("Vikipedi'yi aç", 'globe')] : undefined };
    const s = vx.reader.summarize(r.pt);
    if (!s.bullets.length) return { text: 'Bu sayfada özetleyecek kadar metin bulamadım.', tone: 'unsure' };
    const url = r.pt.url || t.url;
    const title = s.title || t.title;
    return {
      kind: 'summary',
      text: `Sayfadaki cümlelerden özet — “${vx.clip(title, 70)}”`,
      bullets: s.bullets,
      note: `Bu cümleler sayfadan olduğu gibi seçildi. Tamamını okumak ${s.capped ? 'en az' : 'yaklaşık'} ${s.minutes} dakika sürer · ${vx.hostOf(url)}`,
      actions: [
        { label: 'Özeti sesli oku', icon: 'volume-2', speak: s.bullets.join(' '), title: 'Sayfanın özeti' },
        { label: 'Özeti kopyala', icon: 'copy', copy: `${title}\n${s.bullets.map((b) => `• ${b}`).join('\n')}\n${url}` },
      ],
    };
  });

  /* ── Geçmişte / yer imlerinde ara: yan paneli aramayla açar ── */
  rule('history-search', 20, /^gecmis(?:te|imde|ten|teki|imden) (.+?) (?:ara|bul|goster)$/d, (m, p) => {
    const q = vx.span(p, m, 1);
    return { text: `Geçmişinizde “${q}” için arıyorum.`, effect: later(() => Vox.voxi.openPanel('history', { query: q })) };
  });
  rule('bookmark-search', 20, /^(?:yer ?imlerinde|yer ?imlerimde|favorilerde|favorilerimde) (.+?) (?:ara|bul|goster)$/d, (m, p) => {
    const q = vx.span(p, m, 1);
    return { text: `Yer imlerinizde “${q}” için arıyorum.`, effect: later(() => Vox.voxi.openPanel('bookmarks', { query: q })) };
  });

  /* ── Sayfada bul: Chromium'un sayfa içi araması, gerçek eşleşme sayısıyla ── */
  async function findOnPage(m, p) {
    const t = tab();
    if (!t) return noTab;
    const q = vx.span(p, m, 1);
    if (!q) return null;
    if (t.crashed) return { text: 'Bu sekme çöktü; içinde arama yapamıyorum.' };
    const res = await new Promise((resolve) => {
      let timer = 0, grace = 0;
      const done = (r) => { clearTimeout(timer); clearTimeout(grace); off(); resolve(r); };
      const off = Vox.bus.on('find:result', (r) => {
        if (r.tabId !== t.id || !r.finalUpdate) return;
        if (r.matches) { done(r); return; }
        // Sekme gezinirken Chromium önce eski bir 0 gönderebilir; gerçek sayı birkaç ms sonra gelir.
        clearTimeout(grace);
        grace = setTimeout(() => done(r), 150);
      });
      timer = setTimeout(() => done(null), 3000);
      // Bul çubuğu varsa metni o doldurup aramayı kendisi başlatır; odak Voxi'de kalır. Yoksa doğrudan aranır.
      if (Vox.commands.has('find.open')) Vox.commands.run('find.open', { text: q, focus: false });
      else Vox.pageFind.start(q, { tabId: t.id });
    });
    if (!res) return { text: `“${q}” için sayfada arama başlattım.` };
    if (!res.matches) return { tone: 'unsure', text: `“${q}” bu sayfada geçmiyor.`, actions: [{ label: `${vx.engineIn()} ara`, icon: 'search', search: q }] };
    return { text: `“${q}” bu sayfada ${res.matches} kez geçiyor; ilkini işaretledim.` };
  }
  rule('find', 22, /^(?:bu )?sayfa(?:da|nin icinde|icinde|nin icinde) (.+?) (?:kelimesini |sozcugunu |ifadesini |yazisini )?(?:ara|bul|gecen yerleri (?:bul|goster)|nerede)$/d, findOnPage);
  rule('find-word', 22, /^(.+?) (?:kelimesini|sozcugunu|ifadesini) (?:sayfada |bu sayfada )?(?:ara|bul)$/d, findOnPage);

  /* ── Hava durumu: Voxi tahmin bilmez, arama motorunun güncel sonucunu açar ── */
  const NOT_CITY = /^(hava|burada|orada|nerede|yarin|simdi|bugun|sabah|aksam|gece|hafta|internet|web|net|google|sehir|bolge)/;
  rule('weather', 72, /\bhava (durumu|nasil|nasildir|ne durumda|kac derece|sicak mi|soguk mu|yagmurlu mu)|yagmur yag|kar yag|kac derece|semsiye/, (m, p) => {
    let city = '';
    const i = p.toks.findIndex((t, k) => k > 0 && /^(da|de|ta|te|nda|nde)$/.test(t.w));
    if (i > 0 && !NOT_CITY.test(p.toks[i - 1].w)) city = vx.spanToks(p, p.toks[i - 1], p.toks[i - 1]);
    else if (i < 0) {
      const g = p.toks.find((t) => t.w.length > 5 && /(da|de|ta|te)$/.test(t.w) && !NOT_CITY.test(t.w));
      if (g) city = vx.spanToks(p, g, g).replace(/(da|de|ta|te)$/i, '');
    }
    const q = `${city ? `${vx.capFirst(city)} ` : ''}hava durumu${/yarin/.test(p.f) ? ' yarın' : ''}`;
    return { text: `“${q}” için ${vx.engineIn()} arıyorum.`, note: 'Güncel tahmini arama sonucunda görebilirsiniz.', effect: () => vx.search(q) };
  });

  /* ── Site içi arama: "YouTube'da kedi videoları ara", "Vikipedi'de Atatürk ara" ── */
  rule('site-search', 80, (f, p) => {
    if (!/ (ara|arat|bul)$/.test(f)) return null;
    const toks = p.toks;
    for (let i = 0; i < toks.length - 2; i++) {
      const w = toks[i].w;
      let name = null;
      if (i > 0 && /^(da|de|ta|te|nda|nde)$/.test(w)) name = toks.slice(0, i).map((t) => t.w).join(' ');
      else if (w.length > 4 && /(da|de|ta|te)$/.test(w)) name = [...toks.slice(0, i).map((t) => t.w), w.slice(0, -2)].join(' ');
      const site = name && vx.sites.find(name);
      if (site && site.search) return { site, a: toks[i + 1], b: toks[toks.length - 2] };
    }
    return null;
  }, (m, p) => {
    const q = vx.spanToks(p, m.a, m.b);
    return q ? { text: `${m.site.loc} “${vx.clip(q, 60)}” için arıyorum.`, effect: () => vx.openUrl(vx.sites.searchIn(m.site, q)) } : null;
  });

  /* ── Web araması ──────────────────────────────────────── */
  const doSearch = (q) => (q ? { text: `“${vx.clip(q, 60)}” için ${vx.engineIn()} arıyorum.`, effect: () => vx.search(q) } : null);
  rule('question', 82, /^(.+?) (nedir|kimdir|ne demek|ne demektir|nerede|nerededir|nasil yapilir|ne zaman|kac yasinda|ne kadar)$/, (m, p) => doSearch(p.raw.replace(/[?!.]+$/, '')));
  rule('search', 82, /^(?:(?:internette|webde|web de|netten|internetten) )?(.+?) (?:(?:icin|hakkinda|ile ilgili) )?(?:arama yap|aramasi yap|ara|arat|bul|arastir)$/d, (m, p) => doSearch(vx.span(p, m, 1)));
  rule('search-head', 82, /^(?:ara|arat|arastir|internette ara|webde ara|web de ara) (.+)$/d, (m, p) => doSearch(vx.span(p, m, 1)));

  /* ── Site ya da adres açma ────────────────────────────── */
  function openTarget(raw, folded, where) {
    const addr = vx.sites.asAddress(raw);
    if (addr) return { text: `${vx.hostOf(addr) || addr} adresini açıyorum.`, effect: () => vx.openUrl(addr, where) };
    const site = vx.sites.find(folded);
    if (site) return { text: `${site.acc} açıyorum.`, effect: () => vx.openUrl(site.url, where) };
    return null;
  }
  const WHERE = '(yeni (?:bir )?sekmede|bu sekmede|ayni sekmede|burada)';
  const OPEN = new RegExp(`^(?:${WHERE} )?(.+?)(?: (?:web )?(?:sitesi|sayfasi|adresi)\\w*)?(?: (?:u|i|a|e|y[aeiu]|n[aeiu]|[dt][ae]))?(?: ${WHERE})? (ac|git|gir|goster|getir|yukle)$`, 'd');
  rule('open', 84, OPEN, (m, p) => {
    const w = m[1] || m[3] || '';
    const where = /yeni/.test(w) ? 'new' : w || m[4] === 'git' || m[4] === 'gir' ? 'current' : 'auto';
    const raw = vx.span(p, m, 2);
    const hit = openTarget(raw, m[2], where);
    if (hit) return hit;
    return { tone: 'unsure', text: `“${vx.clip(raw, 50)}” adında bir site tanımıyorum. İsterseniz ${vx.engineIn()} arayabilirim.`, actions: [{ label: "Web'de ara", icon: 'search', search: raw }] };
  });
  rule('bare', 86, (f, p) => (vx.sites.asAddress(p.raw) || p.toks.length <= 2 ? f || p.raw : null), (m, p) => openTarget(p.raw, p.f, 'auto'));
});
