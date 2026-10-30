/* voxi — bilinen siteler (adı → adresi, Türkçe belirtme hâli) ve site içi arama adresleri.
   Eşleştirme yazım hatalarına dayanıklıdır: "yutup", "githuba", "vikipediyi" de bulunur. */
Vox.define('voxi.sites', (Vox) => {
  const vx = Vox.vx;
  const S = (name, url, acc, keys, search, loc) => ({ name, url, acc, keys, search: search || null, loc: loc || `${name} içinde` });
  const SITES = [
    S('YouTube', 'https://www.youtube.com/', "YouTube'u", ['youtube', 'yutup', 'yutub', 'yt'], 'https://www.youtube.com/results?search_query=%s', "YouTube'da"),
    S('Google', 'https://www.google.com/', "Google'ı", ['google', 'gugil'], 'https://www.google.com/search?q=%s', "Google'da"),
    S('Gmail', 'https://mail.google.com/', "Gmail'i", ['gmail', 'googlemail', 'eposta']),
    S('Google Haritalar', 'https://www.google.com/maps', "Google Haritalar'ı", ['haritalar', 'harita', 'googleharitalar', 'googlemaps', 'maps'], 'https://www.google.com/maps/search/%s', "Google Haritalar'da"),
    S('Google Çeviri', 'https://translate.google.com/', "Google Çeviri'yi", ['ceviri', 'googleceviri', 'googletranslate', 'translate']),
    S('Vikipedi', 'https://tr.wikipedia.org/', "Vikipedi'yi", ['vikipedi', 'wikipedia', 'vikipedia', 'wiki'], 'https://tr.wikipedia.org/w/index.php?search=%s', "Vikipedi'de"),
    S('GitHub', 'https://github.com/', "GitHub'ı", ['github', 'gitub', 'githab'], 'https://github.com/search?q=%s', "GitHub'da"),
    S('X', 'https://x.com/', "X'i", ['twitter', 'x', 'tivitir', 'xcom'], 'https://x.com/search?q=%s', "X'te"),
    S('Instagram', 'https://www.instagram.com/', "Instagram'ı", ['instagram', 'insta', 'instegram']),
    S('Facebook', 'https://www.facebook.com/', "Facebook'u", ['facebook', 'fesbuk']),
    S('LinkedIn', 'https://www.linkedin.com/', "LinkedIn'i", ['linkedin', 'linkedn']),
    S('Reddit', 'https://www.reddit.com/', "Reddit'i", ['reddit'], 'https://www.reddit.com/search/?q=%s', "Reddit'te"),
    S('WhatsApp Web', 'https://web.whatsapp.com/', "WhatsApp Web'i", ['whatsapp', 'whatsappweb', 'vatsap']),
    S('Netflix', 'https://www.netflix.com/', "Netflix'i", ['netflix']),
    S('Spotify', 'https://open.spotify.com/', "Spotify'ı", ['spotify'], 'https://open.spotify.com/search/%s', "Spotify'da"),
    S('Twitch', 'https://www.twitch.tv/', "Twitch'i", ['twitch']),
    S('TikTok', 'https://www.tiktok.com/', "TikTok'u", ['tiktok']),
    S('Pinterest', 'https://www.pinterest.com/', "Pinterest'i", ['pinterest'], 'https://www.pinterest.com/search/pins/?q=%s', "Pinterest'te"),
    S('Outlook', 'https://outlook.live.com/', "Outlook'u", ['outlook', 'hotmail']),
    S('Yandex', 'https://yandex.com.tr/', "Yandex'i", ['yandex'], 'https://yandex.com.tr/search/?text=%s', "Yandex'te"),
    S('DuckDuckGo', 'https://duckduckgo.com/', "DuckDuckGo'yu", ['duckduckgo', 'ddg'], 'https://duckduckgo.com/?q=%s', "DuckDuckGo'da"),
    S('Bing', 'https://www.bing.com/', "Bing'i", ['bing'], 'https://www.bing.com/search?q=%s', "Bing'de"),
    S('Stack Overflow', 'https://stackoverflow.com/', "Stack Overflow'u", ['stackoverflow'], 'https://stackoverflow.com/search?q=%s', "Stack Overflow'da"),
    S('Hepsiburada', 'https://www.hepsiburada.com/', "Hepsiburada'yı", ['hepsiburada'], 'https://www.hepsiburada.com/ara?q=%s', "Hepsiburada'da"),
    S('Trendyol', 'https://www.trendyol.com/', "Trendyol'u", ['trendyol'], 'https://www.trendyol.com/sr?q=%s', "Trendyol'da"),
    S('Amazon', 'https://www.amazon.com.tr/', "Amazon'u", ['amazon'], 'https://www.amazon.com.tr/s?k=%s', "Amazon'da"),
    S('sahibinden.com', 'https://www.sahibinden.com/', "sahibinden.com'u", ['sahibinden']),
    S('n11', 'https://www.n11.com/', "n11'i", ['n11']),
    S('Ekşi Sözlük', 'https://eksisozluk.com/', "Ekşi Sözlük'ü", ['eksisozluk', 'eksi']),
    S('e-Devlet', 'https://www.turkiye.gov.tr/', "e-Devlet'i", ['edevlet', 'e-devlet', 'turkiye.gov.tr']),
    S('Hürriyet', 'https://www.hurriyet.com.tr/', "Hürriyet'i", ['hurriyet']),
    S('Sözcü', 'https://www.sozcu.com.tr/', "Sözcü'yü", ['sozcu']),
    S('Milliyet', 'https://www.milliyet.com.tr/', "Milliyet'i", ['milliyet']),
    S('NTV', 'https://www.ntv.com.tr/', "NTV'yi", ['ntv']),
    S('Habertürk', 'https://www.haberturk.com/', "Habertürk'ü", ['haberturk']),
    S('BBC Türkçe', 'https://www.bbc.com/turkce', "BBC Türkçe'yi", ['bbcturkce', 'bbc']),
  ];

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
  }
  const GLUED = /(nin|nun|yi|yu|ya|ye|nu|ni|na|ne|da|de|ta|te|u|i|a|e)$/;

  /** "youtube", "yutup", "githuba", "ekşi sözlük" → site, or null. */
  function find(target) {
    const k = vx.fold(target).replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\s+/g, '');
    if (!k) return null;
    const exact = (x) => SITES.find((s) => s.keys.includes(x) || vx.fold(s.name).replace(/\s+/g, '') === x);
    const hit = exact(k) || (k.length > 3 && exact(k.replace(GLUED, '')));
    if (hit) return hit;
    if (k.length < 5) return null;
    let best = null, bd = 9;
    for (const s of SITES) {
      for (const key of s.keys) {
        if (key.length < 5) continue;
        const d = lev(k, key);
        if (d <= (key.length >= 8 ? 2 : 1) && d < bd) { best = s; bd = d; }
      }
    }
    return best;
  }

  const DOMAIN = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;
  /** "github.com'a" (the user's own words) → "github.com", or null when it isn't an address. */
  function asAddress(raw) {
    const s = String(raw || '').trim().replace(/['’].*$/, '').replace(/[?!,;]+$/, '');
    if (/^https?:\/\/\S+$/i.test(s)) return s;
    if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/\S*)?$/i.test(s)) return `http://${s}`;
    if (!DOMAIN.test(s) || /\s/.test(s)) return null;
    // yalnızca alan adı küçültülür; yoldaki büyük/küçük harf korunur
    return (/^https?:/i.test(s) ? s : `https://${s}`).replace(/^(https?:\/\/)([^/?#]+)/i, (all, a, h) => a.toLowerCase() + h.toLowerCase());
  }
  const searchIn = (site, q) => (site && site.search ? site.search.replace('%s', encodeURIComponent(q)) : null);

  vx.sites = { list: SITES, find, asAddress, searchIn };
});
