/* voxi — tarayıcı komutları: veri temizleme, okuma listesi, yer imleri, pencereler, sekmeler, gezinme,
   yakınlaştırma, tema, tarayıcı sayfaları, adres kopyalama, yazdırma. Her kural gerçek eylemi yapar;
   yanıt, eylemin gerçek sonucunu söyler (ör. yeni yakınlaştırma oranı). */
Vox.define('voxi.rules.browser', (Vox) => {
  const store = Vox.store;
  const vx = Vox.vx;
  const { rule } = vx.intents;
  const tab = () => vx.activeTab();
  const has = (id) => Vox.commands.has(id);
  const cmd = (id, args) => (has(id) ? Vox.commands.run(id, args) : undefined);
  const noTab = { text: 'Açık bir sekme yok.' };
  const named = (t) => `“${vx.clip(t.title || vx.hostOf(t.url) || 'Bu sayfa', 60)}”`;
  /** Effect that runs a moment after the reply appears (panel switches, theme reveal, closing the tab). */
  const later = (fn, ms = 650) => () => new Promise((r) => setTimeout(() => { try { fn(); } finally { r(); } }, ms));
  const panel = (id) => later(() => Vox.voxi.openPanel(id, { focus: true }));
  const fns = (vx.actionFns = vx.actionFns || {});

  /* ── Veri temizleme, okuma listesi, yer imleri ────────── */
  rule('clear-data', 30, /(gecmis|tarama veri|cerez|onbellek|site veri)\w*( \w+)? (temizle|sil|bosalt)|(temizle|sil|bosalt) (gecmis|tarama veri|cerez|onbellek)/, () => ({
    text: 'Tarama verilerini temizleme bölümünü açıyorum. Neyin, hangi zaman aralığında silineceğini orada siz seçersiniz.',
    effect: () => cmd('clearData.open'),
  }));

  const RL = { label: 'Okuma listesini aç', icon: 'book-open', panel: 'reading' };
  rule('reading-add', 32, /okuma liste\w*( \w+)? (ekle|kaydet|al)|(ekle|kaydet) .*okuma liste|sonra oku|sonra okumak/, () => {
    const t = tab();
    if (!t) return noTab;
    if (!vx.isWeb(t)) return { text: 'Okuma listesine yalnızca web sayfaları eklenebilir.' };
    if (!vx.addReading(t)) return { text: 'Bu sayfa zaten okuma listenizde.', actions: [RL] };
    return { text: `${named(t)} okuma listenize eklendi.`, actions: [RL] };
  });
  rule('reading', 33, /okuma liste/, () => ({ text: 'Okuma listenizi yan panelde açıyorum.', effect: panel('reading') }));

  const BM = '(?:yer ?imi|yer ?imler|favori)\\w*';
  const BMS = { label: 'Yer imlerini göster', icon: 'bookmark', panel: 'bookmarks' };
  fns.bookmarkRemove = (id) => { if (Vox.bookmarks.get(id)) { Vox.bookmarks.remove(id); Vox.ui.toast({ icon: 'bookmark-x', text: 'Yer imi kaldırıldı.' }); } };
  fns.bookmarkRestore = (a) => { if (a && a.node) { Vox.bookmarks.insert(a.node, a.parentId, a.index); Vox.ui.toast({ icon: 'bookmark-check', text: 'Yer imi geri getirildi.' }); } };
  fns.savePage = () => { const t = tab(); if (t) (has('page.save') ? cmd('page.save') : Vox.native.invoke('context:action', { tabId: t.id, action: 'savePage' })); };
  rule('bookmark-remove', 34, new RegExp(`${BM}( \\w+)? (cikar|kaldir|sil)|(cikar|kaldir|sil)\\w* .*${BM}`), () => {
    const t = tab();
    if (!t) return noTab;
    const node = Vox.bookmarks.findByUrl(t.url);
    if (!node) return { text: 'Bu sayfa yer imlerinizde değil.' };
    const parent = Vox.bookmarks.parentOf(node.id);
    const arg = { node, parentId: parent ? parent.id : 'bar', index: Vox.bookmarks.indexOf(node.id) };
    Vox.bookmarks.remove(node.id);
    return { text: `${named(t)} yer imlerinizden çıkarıldı.`, actions: [{ label: 'Geri al', icon: 'undo-2', fn: 'bookmarkRestore', arg }] };
  });
  rule('bookmark-add', 35, new RegExp(`${BM}( \\w+)? (ekle|kaydet|al)\\b|(ekle|kaydet)\\w* .*${BM}|^(bu )?sayfa\\w* kaydet$|^isaretle$`), () => {
    const t = tab();
    if (!t) return noTab;
    if (vx.isBlank(t)) return { text: 'Yeni sekme sayfası yer imlerine eklenemez; önce bir site açın.' };
    if (Vox.bookmarks.isBookmarked(t.url)) return { text: 'Bu sayfa zaten yer imlerinizde.', actions: [BMS] };
    const id = vx.addBookmark(t);
    const acts = [{ label: 'Geri al', icon: 'undo-2', fn: 'bookmarkRemove', arg: id }, BMS];
    if (vx.isWeb(t)) acts.push({ label: 'Dosya olarak kaydet', icon: 'download', fn: 'savePage' });
    return { text: `${named(t)} yer imleri çubuğuna eklendi.`, actions: acts };
  });
  rule('bookmarks-bar', 36, /yer ?imleri cubu\w*( \w+)? (gizle|goster|ac|kapat|kaldir)/, (m) => {
    const show = /goster|ac/.test(m[2]);
    if ((Vox.settings.get('appearance.showBookmarksBar') !== false) === show) return { text: show ? 'Yer imleri çubuğu zaten görünüyor.' : 'Yer imleri çubuğu zaten gizli.' };
    Vox.settings.set('appearance.showBookmarksBar', show);
    return { text: show ? 'Yer imleri çubuğunu gösteriyorum.' : 'Yer imleri çubuğunu gizledim.' };
  });
  rule('bookmarks-manager', 37, /yer ?imi yonetici|yer ?imleri sayfa|yer ?imleri\w* duzenle/, () => ({ text: 'Yer imi yöneticisini açıyorum.', effect: () => cmd('open.bookmarks') }));
  rule('bookmarks', 38, new RegExp(`^${BM}$|${BM}( \\w+)? (ac|goster|listele|gor)\\b|${BM} nerede`), () => ({ text: 'Yer imlerinizi yan panelde açıyorum.', effect: panel('bookmarks') }));

  /* ── Pencereler ───────────────────────────────────────── */
  rule('win-min', 40, /pencere\w*( \w+)? (kucult|simge|gizle|asagi al|indir)|simge durumu/, () => ({ text: 'Pencereyi simge durumuna küçültüyorum.', effect: later(() => cmd('window.minimize'), 500) }));
  rule('win-max', 40, /pencere\w*( \w+)? (buyut|ekrani kapla|tam boy|genislet)|ekrani kapla/, () => ({
    text: store.get('window.maximized') ? 'Pencereyi önceki boyutuna getiriyorum.' : 'Pencereyi ekranı kaplayacak şekilde büyütüyorum.', effect: () => cmd('window.maximize'),
  }));
  rule('fullscreen', 40, /tam ekran/, (m, p) => {
    const on = !!store.get('window.fullscreen');
    if (/cik|kapat|kapa|iptal|birak/.test(p.f) && !on) return { text: 'Zaten tam ekranda değilsiniz.' };
    return { text: on ? 'Tam ekrandan çıkıyorum.' : 'Tam ekrana geçiyorum. Çıkmak için F11 tuşuna basabilirsiniz.', effect: () => cmd('view.fullscreen') };
  });
  rule('win-private', 41, /gizli (pencere|sekme|mod|gezinti|tarama)|inkognito|incognito/, () => ({
    text: 'Yeni bir gizli pencere açıyorum. Orada gezdiğiniz sayfalar geçmişe kaydedilmez.', effect: () => cmd('window.private'),
  }));
  rule('win-new', 41, /yeni (bir )?pencere/, () => ({ text: 'Yeni bir pencere açıyorum.', effect: () => cmd('window.new') }));

  /* ── Sekmeler ─────────────────────────────────────────── */
  rule('tab-close-others', 42, /(diger|tum|butun|baska|obur) sekme\w*( \w+)? kapat/, () => {
    const t = tab();
    if (!t) return noTab;
    const all = Vox.tabs.all().filter((x) => x.id !== t.id);
    const n = all.filter((x) => !x.pinned).length;
    if (!n) return { text: 'Kapatılacak başka sekme yok.' };
    const pinned = all.length - n;
    return { text: `Bu sekme dışındaki ${n} sekmeyi kapatıyorum.${pinned ? ' Sabitlenmiş sekmeler açık kalıyor.' : ''}`, effect: () => Vox.tabs.closeOthers(t.id) };
  });
  rule('tab-reopen', 42, /kapat\w* sekme|sekme\w* geri (ac|getir|al)|son kapat|kapanan sekme/, () => {
    const c = store.get('closedTabs') || [];
    if (!c.length) return { text: 'Yeniden açılacak kapatılmış bir sekme yok.' };
    return { text: `“${vx.clip(c[0].title || vx.hostOf(c[0].url), 50)}” sekmesini yeniden açıyorum.`, effect: () => cmd('tab.reopen') };
  });
  rule('tab-close', 42, /sekme\w*( \w+)? kapat|^bu sayfayi kapat$/, () => {
    const t = tab();
    if (!t) return noTab;
    return { text: `${named(t)} sekmesini kapatıyorum.`, effect: later(() => Vox.tabs.close(t.id), 450) };
  });
  rule('tab-new', 42, /(^| )(yeni|bos) (bir )?sekme( |$)|^sekme( ac)?$/, () => ({ text: 'Yeni bir sekme açıyorum.', effect: () => cmd('tab.new') }));
  const ORD = { ilk: 1, birinci: 1, ikinci: 2, ucuncu: 3, dorduncu: 4, besinci: 5, altinci: 6, yedinci: 7, sekizinci: 8, dokuzuncu: 9, onuncu: 10, son: -1 };
  rule('tab-nth', 42, /^(\d+|ilk|birinci|ikinci|ucuncu|dorduncu|besinci|altinci|yedinci|sekizinci|dokuzuncu|onuncu|son) sekme\w*( (gec|git|ac|goster))?$/, (m) => {
    const all = Vox.tabs.all();
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : ORD[m[1]];
    const t = n === -1 ? all[all.length - 1] : all[n - 1];
    if (!t) return { text: `Şu an ${all.length} sekme açık; o sırada bir sekme yok.` };
    return { text: `${named(t)} sekmesine geçiyorum.`, effect: () => Vox.tabs.activate(t.id) };
  });
  const step = (dir) => () => {
    const all = Vox.tabs.all();
    if (all.length < 2) return { text: 'Açık başka sekme yok.' };
    const i = all.findIndex((x) => x.id === store.get('activeTabId'));
    const t = all[(i + dir + all.length) % all.length];
    return { text: `${named(t)} sekmesine geçiyorum.`, effect: () => Vox.tabs.activate(t.id) };
  };
  rule('tab-next', 42, /(sonraki|bir sonraki|sagdaki|siradaki|diger|obur) sekme/, step(1));
  rule('tab-prev', 42, /(onceki|bir onceki|soldaki) sekme/, step(-1));
  rule('tab-dup', 42, /sekme\w*( \w+)? (cogalt|kopyala|klonla|ikile)/, () => (tab() ? { text: 'Bu sekmenin bir kopyasını açıyorum.', effect: () => cmd('tab.duplicate') } : noTab));
  rule('tab-unpin', 42, /sabitleme\w*( \w+)? (kaldir|coz|iptal)|sabitlemeden cikar/, () => {
    const t = tab();
    if (!t) return noTab;
    if (!t.pinned) return { text: 'Bu sekme zaten sabitlenmemiş.' };
    return { text: 'Sekmenin sabitlemesini kaldırıyorum.', effect: () => Vox.tabs.pin(t.id, false) };
  });
  rule('tab-pin', 43, /sabitle/, () => {
    const t = tab();
    if (!t) return noTab;
    if (t.pinned) return { text: 'Bu sekme zaten sabitlenmiş.' };
    return { text: 'Sekmeyi sabitliyorum; sekme şeridinin başında küçük bir simge olarak duracak.', effect: () => Vox.tabs.pin(t.id, true) };
  });
  rule('tab-unmute', 43, /ses\w* (ac|geri ac|geri getir)|sessizden cikar|sessiz\w* kapat/, () => {
    const t = tab();
    if (!t) return noTab;
    if (!t.muted) return { text: 'Bu sekmenin sesi zaten açık.' };
    return { text: 'Bu sekmenin sesini yeniden açıyorum.', effect: () => Vox.tabs.mute(t.id, false) };
  });
  rule('tab-mute', 43, /ses\w*( \w+)? (kapat|kis|kes)|sessize al|sustur|sessiz yap/, () => {
    const t = tab();
    if (!t) return noTab;
    if (t.muted) return { text: 'Bu sekmenin sesi zaten kapalı.' };
    return { text: t.audible ? 'Bu sekmenin sesini kapatıyorum.' : 'Bu sekmenin sesini kapatıyorum; şu an zaten ses çalmıyordu.', effect: () => Vox.tabs.mute(t.id, true) };
  });

  /* ── Gezinme ──────────────────────────────────────────── */
  const navRule = (id, prio, re, fn) => rule(id, prio, re, () => { const t = tab(); return t ? fn(t) : noTab; });
  navRule('back', 50, /^geri$|geri (git|don|gel)|onceki sayfa/, (t) => (Vox.nav.canBack(t)
    ? { text: 'Bir önceki sayfaya dönüyorum.', effect: () => Vox.nav.back(t.id) } : { text: 'Bu sekmede geri gidilecek bir sayfa yok.' }));
  navRule('forward', 50, /^ileri$|ileri (git|gec)|sonraki sayfa/, (t) => (Vox.nav.canForward(t)
    ? { text: 'Bir sonraki sayfaya geçiyorum.', effect: () => Vox.nav.forward(t.id) } : { text: 'İleri gidilecek bir sayfa yok.' }));
  navRule('hard-reload', 50, /onbellek\w*( \w+)? (yenile|bosalt)|tamamen yenile|zorla yenile/, (t) => ({ text: 'Önbelleği atlayıp sayfayı baştan yüklüyorum.', effect: () => Vox.nav.reload(t.id, true) }));
  navRule('reload', 51, /yenile|yeniden yukle|tazele/, (t) => ({ text: 'Sayfayı yeniliyorum.', effect: () => Vox.nav.reload(t.id) }));
  navRule('stop', 51, /^durdur$|yukleme\w*( \w+)? durdur|sayfa\w* durdur/, (t) => (t.loading
    ? { text: 'Sayfanın yüklenmesini durduruyorum.', effect: () => Vox.nav.stop(t.id) } : { text: 'Sayfa zaten yüklendi; durdurulacak bir şey yok.' }));
  navRule('home', 51, /^ana ?sayfa\w*( (git|ac|don|gel))?$|ana ?sayfaya (git|don|gel)/, () => ({ text: 'Ana sayfaya gidiyorum.', effect: () => Vox.nav.home() }));

  /* ── Yakınlaştırma ────────────────────────────────────── */
  async function zoom(t, dir, pct) {
    const z0 = t.zoom || 100;
    const z = await (pct ? Vox.tabs.setZoom(t.id, pct) : Vox.tabs.zoomBy(t.id, dir));
    if (z == null) return { text: 'Yakınlaştırmayı değiştiremedim.', tone: 'unsure' };
    if (z === z0) {
      if (dir > 0) return { text: `Sayfa zaten en büyük boyutta (%${z}).` };
      if (dir < 0) return { text: `Sayfa zaten en küçük boyutta (%${z}).` };
      return { text: `Sayfa zaten %${z} boyutunda.` };
    }
    return { text: `Sayfayı %${z} boyutuna getirdim.`, actions: z !== 100 ? [{ label: 'Yakınlaştırmayı sıfırla', icon: 'rotate-ccw', ask: 'Yakınlaştırmayı sıfırla' }] : [] };
  }
  rule('zoom-set', 52, /^(?:(?:sayfa|yakinlastirma|zoom|boyut|yazi)\w* )?(?:%|yuzde) ?(\d{2,3})(?: (?:yap|olsun|ayarla|getir|yakinlastir|buyut|kucult))?$|^(?:sayfa|yakinlastirma|zoom|boyut)\w* (\d{2,3}) (?:yap|olsun|ayarla|getir)$/, (m) => {
    const t = tab();
    if (!t) return noTab;
    const n = Number(m[1] || m[2]);
    if (n < 25 || n > 500) return { text: 'Yakınlaştırma %25 ile %500 arasında olabilir.' };
    return zoom(t, 0, n);
  });
  navRule('zoom-reset', 52, /yakinlastirma\w*( \w+)? (sifirla|normal)|normal boyut|varsayilan boyut|gercek boyut|zoom\w* sifirla/, (t) => zoom(t, 0));
  navRule('zoom-in', 53, /yakinlastir|(yazi|sayfa|metin|harf)\w*( \w+)? (buyut|buyuk)|zoom in|daha buyuk|^buyut$/, (t) => zoom(t, 1));
  navRule('zoom-out', 53, /uzaklastir|(yazi|sayfa|metin|harf)\w*( \w+)? (kucult|kucuk)|zoom out|daha kucuk|^kucult$/, (t) => zoom(t, -1));

  /* ── Tema: yeni tema Voxi'nin simgesinden daire olarak yayılır ── */
  function origin() {
    const els = document.querySelectorAll('.vx-sp [data-vx-origin]');
    const el = els[els.length - 1];
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function themeTo(mode) {
    const cur = Vox.theme.mode();
    const name = { dark: 'koyu', light: 'açık' }[mode];
    if (cur === mode) return { text: mode === 'system' ? 'Tema zaten bilgisayarınızın ayarını izliyor.' : `Zaten ${name} temadasınız.` };
    if (mode !== 'system' && Vox.theme.effective() === mode) {
      return { text: `Görünüm zaten ${name}; bundan sonra bilgisayarınızın ayarından bağımsız olarak ${name} kalacak.`, effect: () => Vox.theme.set(mode) };
    }
    const text = { dark: 'Koyu temaya geçiyorum.', light: 'Açık temaya geçiyorum.', system: 'Tema artık bilgisayarınızın ayarını izleyecek.' }[mode];
    return { text, effect: later(() => Vox.theme.set(mode, origin()), 350) };
  }
  rule('theme-dark', 54, /(koyu|karanlik|gece|siyah) (tema|mod|gorunum|renk)|tema\w* (koyu|karart|karanlik)/, () => themeTo('dark'));
  rule('theme-light', 54, /(acik|aydinlik|gunduz|beyaz) (tema|mod|gorunum|renk)|tema\w* (acik|aydinlat|aydinlik)/, () => themeTo('light'));
  rule('theme-system', 54, /sistem tema|tema\w* sistem|otomatik tema|sisteme uy/, () => themeTo('system'));
  rule('theme-toggle', 55, /tema\w* degistir|tema\w* cevir|^tema$/, () => themeTo(Vox.theme.effective() === 'dark' ? 'light' : 'dark'));

  /* ── Tarayıcı sayfaları ───────────────────────────────── */
  rule('save-page', 59, /(sayfa\w*|bunu) (indir|bilgisayara kaydet|farkli kaydet|dosya olarak kaydet)|sayfa\w* bilgisayar\w* kaydet/, () => {
    const t = tab();
    if (!vx.isWeb(t)) return { text: 'Yalnızca web sayfaları dosya olarak kaydedilebilir.' };
    return { text: 'Sayfayı dosya olarak kaydediyorum.', effect: fns.savePage };
  });
  rule('history', 60, /^gecmis\w*$|gecmis\w*( \w+)? (ac|goster|listele|bak|gor)|tarama gecmis|gecmise (git|bak)/, () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = Vox.history.list().filter((e) => e.ts >= start.getTime()).length;
    return { text: `Geçmiş sayfasını açıyorum.${today ? ` Bugünden ${today} kayıt var.` : ''}`, effect: () => cmd('open.history'), actions: [{ label: 'Yan panelde göster', icon: 'panel-left', panel: 'history' }] };
  });
  rule('downloads', 60, /indir(ilen|meler|me listesi|diklerim|digim|me gecmis)|indirmeler/, () => {
    const l = Vox.downloads.list();
    const act = l.filter((d) => d.state === 'in_progress').length;
    const last = l.filter((d) => d.state === 'complete').sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))[0];
    return { text: `İndirilenler sayfasını açıyorum.${act ? ` Şu an ${act} dosya iniyor.` : ''}${last ? ` Son tamamlanan: ${last.filename}.` : ''}`, effect: () => cmd('open.downloads') };
  });
  const SECTIONS = [
    [/voxi|asistan/, 'voxi', 'Voxi ayarlarını'], [/gizlilik|guvenlik|cerez|izin/, 'gizlilik', 'Gizlilik ve güvenlik ayarlarını'],
    [/gorunum|tema|yazi tipi|font|yogunluk|yazi boyut/, 'gorunum', 'Görünüm ayarlarını'], [/arama/, 'arama', 'Arama motoru ayarlarını'],
    [/parola|sifre|otomatik doldurma/, 'parolalar', 'Parolalar ve otomatik doldurma bölümünü'], [/indirme/, 'indirilenler', 'İndirme ayarlarını'],
    [/\bdil|yazim denetim/, 'diller', 'Dil ayarlarını'], [/erisilebilirlik/, 'erisilebilirlik', 'Erişilebilirlik ayarlarını'],
    [/sistem|performans|donanim|bellek/, 'sistem', 'Sistem ve performans ayarlarını'], [/baslangic|acilis|ana ?sayfa/, 'baslangic', 'Açılış ayarlarını'],
    [/varsayilan tarayici/, 'varsayilan', 'Varsayılan tarayıcı bölümünü'], [/profil|hesap/, 'profil', 'Profil ayarlarını'],
    [/sifirla/, 'sifirla', 'Ayarları sıfırlama bölümünü'],
  ];
  const openSection = (s) => ({ text: `${s[2]} açıyorum.`, effect: () => cmd('open.settings', { section: s[1] }) });
  rule('passwords', 60, /parola|sifre/, () => openSection(SECTIONS[4]));
  rule('default-browser', 60, /varsayilan tarayici/, () => openSection(SECTIONS[10]));
  rule('settings', 61, /\bayar|tercihler/, (m, p) => {
    const s = SECTIONS.find(([re]) => re.test(p.full.replace(/\bayar\w*/g, '')));
    return s ? openSection(s) : { text: 'Ayarları açıyorum.', effect: () => cmd('open.settings') };
  });
  rule('processes', 60, /gorev yonetici|surecler|islem yonetici|bellek kullan|ram kullan|islemci kullan|ne kadar bellek/, () => ({
    text: 'Görev yöneticisini açıyorum; her sekmenin bellek ve işlemci kullanımını orada görebilirsiniz.', effect: () => cmd('open.processes'),
  }));
  rule('extensions', 60, /uzanti|eklenti/, () => ({ text: 'Uzantılar sayfasını açıyorum. Uzantı desteği bir sonraki sürümlerde geliyor.', effect: () => cmd('open.extensions') }));
  rule('about', 60, /(voxbrowser|tarayici)\w* hakkinda|^hakkinda$|surum|versiyon|guncelle/, async (m, p) => {
    let info = null;
    try { info = await Vox.native.invoke('app:info', {}); } catch (e) { /* bilgi yoksa yalnızca sayfayı aç */ }
    const v = info && info.version ? `VoxBrowser ${info.version} kullanıyorsunuz${info.chrome ? ` (Chromium ${String(info.chrome).split('.')[0]})` : ''}. ` : '';
    return { text: `${v}Hakkında sayfasını açıyorum.`, note: /guncel/.test(p.f) ? 'Otomatik güncelleme bir sonraki sürümlerde geliyor.' : undefined, effect: () => cmd('open.about') };
  });
  rule('devtools', 60, /gelistirici|devtools|\bf12\b|inceleme arac|\bkonsol|ogeyi incele|kaynak kod/, (m, p) => {
    const t = tab();
    if (!t) return noTab;
    if (/kapat|gizle/.test(p.f)) {
      return t.devtools ? { text: 'Geliştirici araçlarını kapatıyorum.', effect: () => Vox.native.invoke('devtools:close', { tabId: t.id }) } : { text: 'Geliştirici araçları zaten kapalı.' };
    }
    if (/kaynak kod/.test(p.f) && has('page.viewSource')) return { text: 'Sayfanın kaynak kodunu açıyorum.', effect: () => cmd('page.viewSource') };
    const con = /konsol/.test(p.f);
    return { text: con ? 'Konsolu açıyorum.' : 'Geliştirici araçlarını açıyorum. F12 ile de açıp kapatabilirsiniz.', effect: () => cmd(con ? 'devtools.console' : 'devtools.open') };
  });

  /* ── Adres, yazdırma ──────────────────────────────────── */
  rule('copy-url', 62, /(adres|baglanti|link|url)\w*( \w+)? kopyala|(adres|link)\w* (panoya )?al$/, async () => {
    const t = tab();
    if (!t) return noTab;
    const ok = await vx.copy(t.url);
    return ok ? { text: 'Sayfanın adresini panoya kopyaladım.', note: vx.clip(t.url, 90) } : { text: 'Adresi panoya kopyalayamadım.', tone: 'unsure' };
  });
  rule('print', 62, /yazdir|cikti al|yaziciya gonder/, () => {
    const t = tab();
    if (!vx.isWeb(t)) return { text: 'Yazdırmak için önce bir web sayfası açın.' };
    return { text: 'Yazdırma penceresini açıyorum.', effect: () => (has('page.print') ? cmd('page.print') : Vox.native.invoke('context:action', { tabId: t.id, action: 'print' })) };
  });
});
