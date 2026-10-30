/* voxi — niyet motoru: kuralı yazılan Türkçe isteği (vx.parse ile katlanmış, fiil çekimleri sadeleşmiş) sırayla
   dener; ilk eşleşen kural gerçek eylemi yapar ve bir yanıt döndürür: { text, bullets?, note?, actions?, tone?, effect? }.
   Kurallar öncelik sırasıyla (küçük önce) denenir; tarayıcı ve web kuralları rules-*.js dosyalarında. */
Vox.define('voxi.intents', (Vox) => {
  const store = Vox.store;
  const vx = Vox.vx;
  const rules = [];
  let sorted = null;
  /** rule(id, priority, regex | (f, parsed) => match, (match, parsed) => reply | null | Promise) */
  const rule = (id, prio, re, fn) => { rules.push({ id, prio, re, fn, n: rules.length }); sorted = null; };
  const ask = (label, icon) => ({ label, icon, ask: label });

  /** Context-aware ideas for the greeting and the chips above the input. */
  function suggestions() {
    const t = vx.activeTab();
    const dark = Vox.theme.effective() === 'dark';
    const theme = { text: dark ? 'Açık temaya geç' : 'Koyu temaya geç', icon: dark ? 'sun' : 'moon' };
    if (vx.isWeb(t)) {
      return [{ text: 'Bu sayfayı özetle', icon: 'list' }, { text: 'Sayfayı sesli oku', icon: 'volume-2' },
        { text: 'Yer imlerine ekle', icon: 'bookmark-plus' }, theme];
    }
    return [{ text: "Vikipedi'yi aç", icon: 'globe' }, { text: 'Hava durumu nasıl?', icon: 'cloud-sun' },
      { text: 'Neler yapabilirsin?', icon: 'circle-help' }, theme];
  }

  /* ── Panel ve konuşma ─────────────────────────────────── */
  const later = (fn, ms) => () => new Promise((r) => setTimeout(() => { try { fn(); } finally { r(); } }, ms));
  rule('chat-clear', 24, /(konusma|sohbet|mesaj)\w*( \w+)? (temizle|sil)|ekrani temizle/, () => ({ text: 'Konuşmayı temizliyorum.', effect: later(() => Vox.voxi.clear(), 900) }));
  rule('panel-close', 24, /^(kapat|paneli kapat|yan paneli kapat|kendini kapat|gizlen|kapan)$/, () => ({
    text: `Paneli kapatıyorum. Yeniden açmak için ${Vox.keys.label('voxi.listen') || 'Alt+V'} tuşlarına basabilirsiniz.`, effect: later(() => Vox.voxi.closePanel(), 900),
  }));

  /* ── Sohbet, yardım, saat ve tarih ────────────────────── */
  const dayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  rule('time', 70, /saat kac|saat ne|saati soyle|saat su an/, () => ({ text: `Saat ${Vox.fmt.time(Date.now())}.` }));
  rule('date', 70, /bugun (ayin kaci|gunlerden ne|ne gunu|hangi gun)|tarih (ne|kac)|hangi gun(deyiz)?|bugunun tarihi|ayin kaci|bugun ne$/,
    () => ({ text: `Bugün ${dayFmt.format(new Date())}.` }));

  rule('hello', 74, /^(merhaba|selam|selamlar|gunaydin|iyi (aksamlar|gunler|geceler)|alo|naber)$/, () => {
    const name = store.get('profile.name');
    return {
      text: `Merhaba${name ? ` ${name}` : ''}! Size nasıl yardımcı olabilirim? Bir sayfayı özetleyebilir, bir siteyi açabilir ya da tarayıcıyı sizin için yönetebilirim.`,
      actions: suggestions().slice(0, 3).map((s) => ask(s.text, s.icon)),
    };
  });
  rule('how', 74, /nasilsin|naber|ne haber|keyfin nasil/, () => ({ text: 'İyiyim, teşekkür ederim! Size nasıl yardımcı olabilirim?' }));
  rule('thanks', 74, /(^| )(tesekkur\w*|sag ?ol\w*|eyvallah|harikasin|eline saglik)( |$)|^(super|cok iyi|harika)$/, () => ({ text: 'Rica ederim! Başka bir şey olursa buradayım.' }));
  rule('who', 74, /sen kimsin|kimsin|adin ne|sen nesin/, () => ({
    text: "Ben Voxi, VoxBrowser'ın yerleşik asistanıyım. Yazdığınız komutları bu bilgisayarda anlar, tarayıcıda gerçekten uygularım. Sesli komutlar bir sonraki sürümde geliyor.",
    actions: [ask('Neler yapabilirsin?', 'circle-help')],
  }));
  rule('help', 74, /neler yapabilirsin|ne yapabilirsin|yardim|komutlar|nasil kullan|ne ise yarar|ozelliklerin/, () => ({
    text: 'Şunları yapabilirim; örnekteki gibi yazmanız yeterli:',
    bullets: [
      { head: 'Sayfa', text: '“Bu sayfayı özetle”, “Sesli oku”, “Bu sayfada iklim bul”' },
      { head: 'Siteler ve arama', text: "“YouTube'u aç”, “github.com'a git”, “kedi videoları ara”, “Vikipedi'de Atatürk ara”" },
      { head: 'Sekmeler', text: '“Yeni sekme”, “Sekmeyi kapat”, “Kapattığım sekmeyi aç”, “Sonraki sekme”, “Sesi kapat”, “Sekmeyi sabitle”' },
      { head: 'Gezinme ve görünüm', text: '“Geri”, “Yenile”, “Yakınlaştır”, “%125 yap”, “Koyu temaya geç”' },
      { head: 'Kaydetme', text: '“Yer imlerine ekle”, “Okuma listesine ekle”, “Adresi kopyala”' },
      { head: 'Tarayıcı', text: '“Geçmişi göster”, “İndirilenler”, “Gizlilik ayarları”, “Görev yöneticisi”, “Gizli pencere”, “Geliştirici araçları”' },
      { head: 'Diğer', text: '“Saat kaç?”, “Bugün ayın kaçı?”, “Hava durumu nasıl?”' },
    ],
    note: 'Şimdilik yazılı komutları anlıyorum; sesli komutlar bir sonraki sürümde.',
    actions: suggestions().slice(0, 3).map((s) => ask(s.text, s.icon)),
  }));

  /* ── Sonraki sürümlerde gelecek özellikler: dürüstçe söyle ── */
  const soon = (what, extra) => ({ text: `${what} bir sonraki sürümlerde geliyor; şimdilik bunu yapamıyorum.`, ...extra });
  rule('soon-translate', 64, /(sayfa\w*|bunu|metni|yaziyi) (turkceye |ingilizceye )?cevir|turkceye cevir|ingilizceye cevir|tercume et|ceviri yap/, () => {
    const t = vx.activeTab();
    return soon('Sayfa çevirisi', vx.isWeb(t) ? {
      text: 'Sayfa çevirisi bir sonraki sürümlerde geliyor. İsterseniz bu sayfayı Google Çeviri ile yeni sekmede açabilirim.',
      actions: [{ label: "Google Çeviri'de aç", icon: 'languages', url: `https://translate.google.com/translate?sl=auto&tl=tr&u=${encodeURIComponent(t.url)}`, where: 'new' }],
    } : {});
  });
  rule('soon-adblock', 64, /reklam\w*( \w+)? (engel|kapat|kaldir|gizle)|reklam engel/, () => soon('Reklam engelleme'));
  rule('soon-sync', 64, /senkroniz|esitle|eslestir|hesabima baglan/, () => soon('Cihazlar arası eşitleme'));
  rule('soon-import', 64, /ice aktar|(chrome|edge|firefox|opera|safari)\w* .*\b(aktar|tasi|getir)\b/, () => soon('Başka tarayıcılardan içe aktarma'));
  rule('soon-autofill', 64, /(parola|sifre)\w*( \w+)? (doldur|gir)|otomatik doldur/, () => soon('Sayfalarda parolaları otomatik doldurma'));

  function fallback(p) {
    const q = p.raw.replace(/[?!.]+$/, '');
    if (!p.f) return { intent: 'unknown', tone: 'unsure', text: 'Bunu anlayamadım. Ne yapmamı istediğinizi birkaç kelimeyle yazar mısınız?', actions: [ask('Neler yapabilirsin?', 'circle-help')] };
    return {
      intent: 'unknown', tone: 'unsure',
      text: `“${vx.clip(q, 60)}” isteğini anlayamadım. İsterseniz bunu ${vx.engineIn()} arayabilirim.`,
      actions: [{ label: "Web'de ara", icon: 'search', search: q }, ask('Neler yapabilirsin?', 'circle-help')],
    };
  }

  async function respond(raw) {
    const p = vx.parse(raw);
    if (!p.f) return fallback(p);
    if (!sorted) sorted = [...rules].sort((a, b) => a.prio - b.prio || a.n - b.n);
    for (const r of sorted) {
      const m = typeof r.re === 'function' ? r.re(p.f, p) : p.f.match(r.re);
      if (!m) continue;
      const out = await r.fn(m, p);
      if (out) return { intent: r.id, ...out };
    }
    return fallback(p);
  }

  vx.intents = { rule, ask, respond, suggestions, rules };
});
