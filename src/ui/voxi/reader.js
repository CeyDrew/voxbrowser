/* voxi — sayfa okuyucu: etkin sekmenin metni ana süreçten gelir (page:text); burada cümlelere bölünür ve
   sözcük sıklığına göre en anlamlı cümleler seçilir (çıkarımsal özet). Türkçe ve İngilizce durak sözcükleri
   atılır; kök için ilk beş harf kullanılır. Hiçbir cümle yeniden yazılmaz, metin cihazdan çıkmaz. */
Vox.define('voxi.reader', (Vox) => {
  const vx = Vox.vx;
  const STOP = new Set(`acaba ama ancak artik aslinda az bazen bazi bazilari belki ben beni benim beri bile bir biraz birkac birlikte
    bircok birsey biz bize bizi bizim bu buna bunda bundan bunlar bunlari bunlarin bunu bunun burada boyle boylece cok cunku da daha
    dahi de defa degil diger diye dolayi dolayisiyla edilen eden eder ederek edildi en gibi gore hala halde hangi hatta hem hep hepsi
    her herhangi herkes hic hicbir icin ile ilgili ise iste itibaren kadar karsin kendi kendine kendisi ki kim kimse mi mu nasil ne
    neden nerede nereye niye olan olarak oldu oldugu oldugunu olmak olmasi olup olur olusan ona ondan onlar onlari onlarin onu onun
    oraya oysa pek sadece sanki sen siz sonra suna sunu tarafindan tum uzere var ve veya yani yine yok zaten ayni arasinda iki uc ilk
    son yeni gelen yapilan yapti aldi etti olmustur olmaktadir bulunan bulunmaktadir sahip ayrica ozellikle genellikle yaklasik cesitli
    vardir yoktur oldukca fazla uzerinde uzerine icinde icerisinde sirasinda sonucunda nedeniyle yil yili yilinda yillarinda sekilde
    the and but for with from that this these those are was were been being its his her their our your not can will would should
    could has have had does did which who whom what when where why how also more most other some such than then there into about
    over after before between during only very just all any each many may might one two new first last you they she`.split(/\s+/));
  const CITE = /\[(?:\d+|[a-z]|not \d+|kaynak belirtilmeli|citation needed|açıklama gerekli)\]/gi;
  /** Site boilerplate (cookie banners, sign-in prompts, footers) — never summary material. */
  const JUNK = /çerezleri kabul|çerez politikası|çerez kullan|cookie policy|accept (all )?cookies|we use cookies|tüm hakları saklıdır|all rights reserved|abone ol|bültenimize|giriş yap|oturum aç|sign in to|log in to|subscribe to|javascript'?i? etkinleştir|enable javascript/i;
  const ABBR = /(?:^|[\s(])(?:dr|prof|doç|yrd|av|sn|vb|vs|örn|bkz|no|st|mr|mrs|ms|jr|sr|vd|yy|ltd|şti|cad|sok|mah|apt|inc|co|corp|etc|vol|fig|ed|approx|dept|gen|gov|ss|ör|bk)\.$/i;
  /* Önceki cümleye gönderme yapan başlangıçlar ("Onun önderliğinde…") tek başına okununca anlamsızlaşır. */
  const ANAPHOR = /^(onun|onlar\w*|bunun|bunlar\w*|bu|şu|o|ayrıca|ancak|fakat|ama|bununla|böylece|dolayısıyla|bundan|ondan|this|these|they|it|he|she|however|also)\s/i;
  const REFERS = /\s(bunun|bunlar\w*|bundan|buna|söz konusu)\s/i; // cümle içinde öncekine gönderme

  const clean = (s) => String(s || '').replace(CITE, '').replace(/\s+/g, ' ').trim();
  const words = (s) => (s ? s.split(/\s+/).filter(Boolean).length : 0);
  const stemsOf = (s) => vx.fold(s).split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^[\d.,%/:+-]+$/.test(w))
    .map((w) => (w.length > 5 ? w.slice(0, 5) : w));

  /** Splits prose into sentences without breaking on abbreviations, initials or "19. yüzyıl". */
  function sentences(par) {
    const parts = String(par).split(/(?<=[.!?…])\s+(?=["“'‘(«]?[\p{Lu}\d])/u);
    const out = [];
    for (const piece of parts) {
      const prev = out[out.length - 1];
      if (prev && (ABBR.test(prev) || /(?:^|\s)\p{Lu}\.$/u.test(prev))) out[out.length - 1] = `${prev} ${piece}`;
      else out.push(piece);
    }
    return out.map((s) => s.replace(/^[•·▪◦\-–—*]\s*/, '').trim());
  }

  /** Prose blocks of the page: its <p> texts, or long lines of the body text when the page has few paragraphs. */
  function prose(pt) {
    let ps = (pt.paragraphs || []).map(clean).filter((p) => p.length >= 60 && !JUNK.test(p));
    if (ps.reduce((n, p) => n + p.length, 0) < 400) {
      ps = String(pt.text || '').split(/\n+/).map(clean).filter((l) => l.length >= 80 && words(l) >= 10 && !JUNK.test(l));
    }
    return ps;
  }

  const good = (s) => {
    if (s.length < 40 || s.length > 520 || words(s) < 6 || JUNK.test(s)) return false;
    const letters = (s.match(/\p{L}/gu) || []).length;
    return letters / s.replace(/\s/g, '').length > 0.6;
  };
  const jacc = (a, b) => {
    const A = new Set(a), B = new Set(b);
    let n = 0;
    A.forEach((x) => { if (B.has(x)) n++; });
    return n / Math.max(1, A.size + B.size - n);
  };

  /** → { title, bullets[], words, minutes, capped } — bullets are sentences taken verbatim from the page. */
  function summarize(pt) {
    const paras = prose(pt);
    const sents = [];
    paras.forEach((p, pi) => sentences(p).forEach((s) => { if (good(s)) sents.push({ s, pi, i: sents.length, stems: stemsOf(s) }); }));
    const total = Math.max(words(String(pt.text || '')), paras.reduce((n, p) => n + words(p), 0));
    const base = { title: clean(pt.title), words: total, minutes: Math.max(1, Math.round(total / 200)), capped: String(pt.text || '').length >= 19900 };
    if (!sents.length) return { ...base, bullets: [] };
    const df = new Map();
    sents.forEach((x) => new Set(x.stems).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
    const titled = new Set(stemsOf(`${pt.title || ''} ${(pt.headings || [])[0] || ''}`));
    const n = sents.length;
    for (const x of sents) {
      const uniq = new Set(x.stems);
      let sum = 0;
      uniq.forEach((w) => { const f = df.get(w) || 0; if (f > 1) sum += f * (titled.has(w) ? 2 : 1); });
      const pos = x.i === 0 ? 1.35 : x.i < n * 0.1 ? 1.2 : x.pi === 0 ? 1.15 : 1;
      x.score = (sum / Math.pow(uniq.size + 1, 0.6)) * pos * (ANAPHOR.test(x.s) ? 0.55 : REFERS.test(x.s) ? 0.75 : 1);
    }
    const k = n < 12 ? Math.min(3, n) : n < 40 ? 4 : 5;
    const picked = [];
    for (const x of [...sents].sort((a, b) => b.score - a.score)) {
      if (picked.length >= k) break;
      if (picked.some((y) => jacc(x.stems, y.stems) > 0.5)) continue;
      picked.push(x);
    }
    picked.sort((a, b) => a.i - b.i);
    return { ...base, bullets: picked.map((x) => vx.clip(x.s, 300)) };
  }

  /** Text to read aloud: the title, then the page's prose (up to ~max characters). */
  function readable(pt, max = 12000) {
    const parts = [clean(pt.title), ...prose(pt)].filter(Boolean);
    let out = '', capped = false;
    for (const p of parts) {
      if (out.length + p.length > max) { capped = true; break; }
      out += `${out ? '\n' : ''}${p}`;
    }
    return { text: out, capped };
  }

  /** Page text of a tab (waits for loading to finish) or { error } explaining why there is none. */
  async function pageOf(t) {
    if (!t) return { error: 'Açık bir sekme yok.' };
    if (t.crashed) return { error: 'Bu sekme çöktü; okuyabileceğim bir içerik yok.' };
    if (t.security === 'error' || /^vox:\/\/hata/i.test(t.realUrl || '')) return { error: 'Bu sayfa açılamadı; okuyabileceğim bir içerik yok.' };
    if (vx.isNewTab(t)) return { error: 'Burası yeni sekme sayfası; okunacak bir yazı yok. Bir haber ya da makale açtığınızda yardımcı olabilirim.', newtab: true };
    if (t.internal) return { error: `Burası VoxBrowser'ın “${t.title}” sayfası; özetlenecek bir yazı yok.` };
    if (t.loading) await vx.waitLoaded(t.id, 12000);
    let pt = null;
    try { pt = await Vox.native.invoke('page:text', { tabId: t.id }); } catch (e) { Vox.reportError('voxi:page-text', e); }
    if (!pt) return { error: 'Sayfanın metnine ulaşamadım. Sayfa yüklendikten sonra yeniden dener misiniz?' };
    return { pt };
  }

  vx.reader = { sentences, summarize, readable, pageOf, stemsOf };
});
