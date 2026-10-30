/* VoxBrowser hata sayfası — Chromium ağ hata kodlarını (net_error_list.h) Türkçe başlık, açıklama, öneri ve
   Voxi çizimiyle eşler. Vox.err.classify(code, desc, url) → sayfanın ihtiyaç duyduğu her şey. */
Vox.define('errors.codes', (Vox) => {
  const { html } = Vox.p;
  const E = (Vox.err = Vox.err || {});
  const H = (host) => html`<b class="err-host">${host}</b>`;

  const in_ = (code, list) => list.includes(code);
  const DNS = [-105, -137];
  const CONN = [-100, -101, -102, -103, -104, -108, -109, -15, -147];
  const TIMEOUT = [-7, -118, -803];
  const PROXY = [-111, -115, -120, -121, -127, -130, -131, -136, -180, -181, -182, -336];
  const SSL = [-107, -110, -112, -113, -117, -123, -125, -126, -134, -135, -141, -148, -149, -151, -153, -159, -164, -167, -171, -172, -174, -175, -176, -177, -178, -218];
  const BLOCKED = [-20, -22, -27, -29, -30, -32];
  const FILE = [-6, -8, -10, -17];
  const PORT = [-311, -312];
  const SCHEME = [-300, -301, -302, -303];
  const RESPONSE = [-320, -321, -324, -325, -331, -337, -338, -352, -353, -355, -356, -357, -358, -359, -370, -371, -374, -375, -379];

  /** What is wrong with the certificate, in plain Turkish. */
  const CERT = {
    '-200': 'Bu sitenin güvenlik sertifikası başka bir adres için verilmiş; bu adres için geçerli değil.',
    '-201': 'Bu sitenin güvenlik sertifikasının süresi dolmuş ya da henüz geçerli değil.',
    '-202': 'Bu sitenin sertifikası, bilgisayarınızın güvendiği bir kuruluş tarafından verilmemiş (kendinden imzalı ya da bilinmeyen bir kuruluş).',
    '-203': 'Sertifikada hatalar var.',
    '-204': 'Sertifikanın iptal edilip edilmediği denetlenemiyor.',
    '-205': 'Sertifikanın iptal edilip edilmediği şu anda denetlenemedi.',
    '-206': 'Bu sitenin sertifikası, veren kuruluş tarafından iptal edilmiş.',
    '-207': 'Sertifika geçersiz.',
    '-208': 'Sertifika artık güvenli sayılmayan zayıf bir imza algoritması kullanıyor.',
    '-210': 'Sertifika, herkese açık olmayan bir ad için verilmiş.',
    '-211': 'Sertifikanın şifreleme anahtarı çok zayıf.',
    '-212': 'Sertifikayı veren kuruluşun bu ad için sertifika verme yetkisi yok.',
    '-213': 'Sertifikanın geçerlilik süresi izin verilenden uzun.',
    '-214': 'Sertifika, Sertifika Şeffaflığı kurallarına uygun olarak yayımlanmamış.',
    '-215': 'Sertifika artık güvenilmeyen eski bir kuruluş tarafından verilmiş.',
    '-217': 'Bu bağlantıyı dinlemek için kullanıldığı bilinen bir sertifika algılandı.',
    '-219': 'Yerel ağdaki bir cihaz kendinden imzalı bir sertifika kullanıyor.',
    '-150': 'Sitenin sertifikası, bu site için beklenen anahtarla eşleşmiyor.',
  };
  /** Certificate problems the user may not click through (as in Chromium). */
  const NO_BYPASS = new Set([-206, -217, -150]);

  function parse(url) {
    try {
      const u = new URL(url);
      let path = decodeURIComponent(u.pathname);
      if (u.protocol === 'file:' && /^\/[a-z]:\//i.test(path)) path = path.slice(1).replace(/\//g, '\\'); // file:///C:/a/b → C:\a\b
      return { host: u.host, hostname: u.hostname, port: u.port, scheme: u.protocol.replace(':', ''), path };
    } catch (e) {
      return { host: '', hostname: '', port: '', scheme: (String(url).match(/^([a-z][a-z0-9+.-]*):/i) || [])[1] || '', path: '' };
    }
  }

  E.classify = (rawCode, desc, url) => {
    const code = Number(rawCode);
    const u = parse(url);
    const host = u.host || url || 'Bu sayfa';
    const base = { code, desc: desc || '', url: url || '', ...u, tips: [], tone: null, retry: !!url, back: false, http: false, cert: null };
    const conn = { ...base, http: true, art: { mood: 'worried', prop: 'plug' }, title: 'Bu siteye ulaşılamıyor',
      tips: ['İnternet bağlantınızı kontrol edin.', 'Site geçici olarak kapalı olabilir; biraz sonra yeniden deneyin.', 'Güvenlik duvarı, virüs koruması ya da proxy ayarlarınız bağlantıyı engelliyor olabilir.'] };

    if (in_(code, DNS) || (code <= -800 && code > -900)) {
      return { ...base, kind: 'dns', title: 'Bu siteye ulaşılamıyor', art: { mood: 'curious', prop: 'magnifier' }, guess: true,
        lead: html`${H(host)} adresinin sunucusu bulunamadı.`,
        tips: ['Adresi doğru yazdığınızdan emin olun.', 'İnternet bağlantınızı kontrol edin.', 'Sorun sürerse ağınızın DNS ayarlarına bakın.'] };
    }
    if (code === -106) {
      return { ...base, kind: 'offline', title: 'İnternet bağlantısı yok', art: { mood: 'worried', prop: 'plug' },
        lead: html`${u.host ? html`${H(host)} açılamadı; ` : null}cihazınız çevrimdışı görünüyor.`,
        tips: ['Modem ya da yönlendiricinizi kontrol edin.', 'Wi‑Fi ağına yeniden bağlanın.', 'Uçak modunun kapalı olduğundan emin olun.'] };
    }
    if (code === -21) {
      return { ...base, kind: 'netchange', title: 'Ağ bağlantınız değişti', art: { mood: 'curious', prop: 'plug' },
        lead: 'Sayfa yüklenirken ağ bağlantınız değişti.', tips: ['Yeniden deneyin; yeni bağlantı hazırsa sayfa açılacaktır.'] };
    }
    if (in_(code, TIMEOUT)) {
      return { ...conn, kind: 'timeout', art: { mood: 'worried', prop: 'clock' }, lead: html`${H(host)} yanıt vermek için çok uzun süre bekledi.`,
        tips: ['İnternet bağlantınızı kontrol edin.', 'Site şu anda yoğun olabilir; biraz sonra yeniden deneyin.', 'Proxy ya da güvenlik duvarı ayarlarınızı kontrol edin.'] };
    }
    if (in_(code, CONN)) {
      const lead = code === -102 ? html`${H(host)} bağlanmayı reddetti.`
        : code === -101 ? 'Bağlantı sıfırlandı.'
        : code === -100 ? html`${H(host)} bağlantıyı beklenmedik şekilde kapattı.`
        : code === -103 ? 'Bağlantı yarıda kesildi.'
        : code === -109 ? html`${H(host)} adresine ulaşılamıyor.`
        : code === -108 ? 'Bu adres geçersiz.'
        : html`${H(host)} ile bağlantı kurulamadı.`;
      return { ...conn, kind: 'conn', lead, tips: code === -102 ? ['Adresin ve bağlantı noktasının doğru olduğundan emin olun.', ...conn.tips.slice(1)] : conn.tips };
    }
    if ((code <= -200 && code > -300 && code !== -218) || code === -150) {
      return { ...base, kind: 'cert', tone: 'danger', retry: false, back: true, http: true, art: { mood: 'worried', prop: 'lock' },
        title: 'Bağlantınız gizli değil',
        lead: html`Saldırganlar ${H(u.hostname || host)} üzerinden bilgilerinizi (örneğin parolalar, mesajlar ya da kart bilgileri) çalmaya çalışıyor olabilir.`,
        cert: { problem: CERT[String(code)] || 'Bu sitenin güvenlik sertifikasında bir sorun var.', bypass: !NO_BYPASS.has(code), clock: code === -201 } };
    }
    if (in_(code, SSL)) {
      const lead = code === -113 || code === -218 ? html`${H(host)} desteklenmeyen ya da eski bir güvenlik protokolü kullanıyor.`
        : code === -110 ? html`${H(host)} sizden bir istemci sertifikası istiyor.`
        : html`${H(host)} geçersiz bir yanıt gönderdi.`;
      const tips = code === -110 ? ['VoxBrowser bu sürümde istemci sertifikası seçmeyi desteklemiyor.', 'Kurumunuzun sitesiyse sistem yöneticinize danışın.']
        : ['Adresi doğru yazdığınızdan emin olun.', 'Site güncel bir güvenlik protokolü kullanmıyor olabilir; site sahibine bildirin.'];
      return { ...base, kind: 'ssl', http: true, art: { mood: 'worried', prop: 'lock' }, title: 'Bu site güvenli bağlantı sağlayamıyor', lead, tips };
    }
    if (in_(code, PROXY)) {
      return { ...base, kind: 'proxy', art: { mood: 'worried', prop: 'plug' }, title: 'Proxy sunucusuna bağlanılamadı',
        lead: 'Bağlantınız bir proxy sunucusu üzerinden geçiyor ve bu sunucu yanıt vermiyor.',
        tips: ['Windows’ta Ayarlar › Ağ ve İnternet › Proxy bölümünü kontrol edin.', 'Bir kurum ağındaysanız ağ yöneticinize danışın.'] };
    }
    if (code === -310) {
      return { ...base, kind: 'redirects', art: { mood: 'dizzy', prop: 'question' }, title: 'Bu sayfa çalışmıyor',
        lead: html`${H(host)} sizi çok fazla yönlendirdi.`,
        tips: ['Bu sitenin çerezlerini silmeyi deneyin (adres çubuğundaki site bilgisi düğmesinden ya da Ayarlar › Gizlilik ve güvenlik bölümünden).', 'Sorun sitenin kendisinde olabilir; biraz sonra yeniden deneyin.'] };
    }
    if (in_(code, BLOCKED)) {
      const lead = code === -22 ? 'Bu sayfa yöneticiniz tarafından engellendi.'
        : code === -27 ? html`${H(host)} bu sayfanın bu şekilde açılmasına izin vermiyor.`
        : code === -29 ? 'Bu sayfa şifresiz (HTTP) bağlantıyla açılamaz.'
        : 'Bu sayfanın açılması engellendi.';
      return { ...base, kind: 'blocked', retry: code !== -22, back: true, art: { mood: 'sad', prop: 'lock' }, title: 'Bu sayfa engellendi', lead,
        tips: ['Adresin doğru olduğundan emin olun.', 'Sayfayı sitenin ana sayfasından açmayı deneyin.'] };
    }
    if (in_(code, FILE)) {
      return { ...base, kind: 'file', back: true, art: { mood: 'worried', prop: 'map' }, title: 'Dosyanıza erişilemiyor',
        lead: html`<code class="err-path">${u.path || url}</code>`,
        tips: code === -10 ? ['Bu dosyayı açma izniniz yok.', 'Dosyanın başka bir uygulamada açık olmadığından emin olun.']
          : ['Dosya taşınmış, silinmiş ya da adı değişmiş olabilir.', 'Adresi ya da dosya yolunu kontrol edin.'] };
    }
    if (in_(code, PORT)) {
      return { ...base, kind: 'port', retry: false, back: true, art: { mood: 'curious', prop: 'lock' }, title: 'Bu adres engellendi',
        lead: html`${H(u.hostname || host)} adresi, güvenlik nedeniyle engellenen ${u.port ? html`<b>${u.port}</b> numaralı ` : ''}bağlantı noktasını kullanıyor.`,
        tips: ['Bu bağlantı noktası e-posta, dosya aktarımı gibi web dışı hizmetler için ayrılmıştır; tarayıcılar bu noktalara bağlanmaz.', 'Adresi doğru yazdığınızdan emin olun.'] };
    }
    if (in_(code, SCHEME)) {
      return { ...base, kind: 'scheme', retry: false, back: true, art: { mood: 'curious', prop: 'question' }, title: 'Bu adres açılamıyor',
        lead: html`<code class="err-path">${url}</code>`, tips: ['Adres geçersiz ya da VoxBrowser’ın açamadığı bir türde.', 'Adresin “https://” ile başladığından emin olun.'] };
    }
    if (in_(code, RESPONSE)) {
      const lead = code === -324 ? html`${H(host)} hiç veri göndermedi.`
        : code === -379 ? html`${H(host)} bu isteği şu anda karşılayamıyor.`
        : html`${H(host)} geçersiz bir yanıt gönderdi.`;
      return { ...base, kind: 'response', art: { mood: 'sad', prop: 'question' }, title: 'Bu sayfa çalışmıyor', lead,
        tips: ['Sayfayı yeniden yüklemeyi deneyin.', 'Sorun sürerse site sahibine bildirin.'] };
    }
    return { ...base, kind: 'generic', art: { mood: 'curious', prop: 'question' }, title: 'Bu sayfa açılamadı',
      lead: u.host ? html`${H(host)} yüklenirken bir sorun oluştu.` : 'Sayfa yüklenirken bir sorun oluştu.',
      tips: ['Sayfayı yeniden yüklemeyi deneyin.', 'İnternet bağlantınızı kontrol edin.'] };
  };

  /** Short tab title for an error: the host, like other browsers, or a fixed name for some kinds. */
  E.tabTitle = (query) => {
    const e = E.classify(query.code, query.desc, query.url || '');
    if (e.kind === 'cert') return 'Gizlilik hatası';
    if (e.kind === 'offline') return 'İnternet bağlantısı yok';
    if (e.kind === 'file') return (e.path || '').split(/[\\/]/).pop() || 'Dosya bulunamadı';
    return e.hostname || 'Bu sayfa açılamadı';
  };
});
