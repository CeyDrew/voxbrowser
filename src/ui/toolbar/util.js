/* VoxBrowser — araç çubuğu ortak yardımcıları (Vox.tb).
   Metin eşleştirme (fold/fuzzy/mark), adres ve arama motoru yardımcıları, izin bilgileri, dosya simgeleri,
   çapa bulma, favicon'lu menü satırları ve iç içe katman barındıran paneller için dışarı tıklama kancası. */
Vox.define('toolbar.util', (Vox) => {
  const { html, useEffect, useRef } = Vox.p;
  const { Favicon } = Vox.c;
  const store = Vox.store;
  const tb = (Vox.tb = Vox.tb || {});

  /* ── Metin eşleştirme ─────────────────────────────────── */
  const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  /** Lower-cases Turkish text and drops diacritics one char per char, so match indices stay valid. */
  // Hız: ASCII harfler doğrudan çevrilir (Türkçede I → ı), diğer karakterlerin küçük hali bir kez hesaplanıp saklanır.
  // (Her karakter için toLocaleLowerCase çağırmak 5000 kayıtlı geçmişte ilk öneriyi ~300 ms geciktiriyordu.)
  const lowerTr = new Map();
  const lower = (ch) => {
    const c = ch.charCodeAt(0);
    if (c < 128) return c === 73 ? 'ı' : c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : ch;
    let l = lowerTr.get(ch);
    if (l === undefined) { l = ch.toLocaleLowerCase('tr-TR'); if (lowerTr.size < 4096) lowerTr.set(ch, l); }
    return l;
  };
  tb.fold = (s) => {
    const str = s == null ? '' : String(s);
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const l = lower(str[i]);
      out += l.length === 1 ? FOLD[l] || l : str[i];
    }
    return out;
  };
  const SEP = /[\s\-—–/.:_(),|·]/;
  const range = (at, n) => Array.from({ length: n }, (_, i) => at + i);
  /** Fuzzy match: substring > all words > tight subsequence. Returns { score, hits } or null. */
  tb.fuzzy = (query, text) => {
    const q = tb.fold(query).trim();
    if (!q) return { score: 0, hits: [] };
    const t = tb.fold(text);
    const at = t.indexOf(q);
    if (at >= 0) {
      const ws = at === 0 || SEP.test(t[at - 1]);
      return { score: 200 + (ws ? 60 : 0) + (at === 0 ? 40 : 0) - at - t.length * 0.1, hits: range(at, q.length) };
    }
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      let score = 100;
      const hits = [];
      for (const w of words) {
        const i = t.indexOf(w);
        if (i < 0) { score = -1; break; }
        score += (i === 0 || SEP.test(t[i - 1]) ? 20 : 0) - i * 0.2;
        hits.push(...range(i, w.length));
      }
      if (score >= 0) return { score, hits };
    }
    const chars = q.replace(/\s+/g, '');
    let from = 0, prev = -2, score = 0;
    const hits = [];
    for (const ch of chars) {
      const i = t.indexOf(ch, from);
      if (i < 0) return null;
      score += 1 + (i === prev + 1 ? 4 : 0) + (i === 0 || SEP.test(t[i - 1]) ? 6 : 0);
      hits.push(i); prev = i; from = i + 1;
    }
    if (chars.length > 1 && score < chars.length * 3.2) return null; // dağınık eşleşmeleri ele
    return { score: score - t.length * 0.1, hits };
  };
  /** Wraps the matched characters in <mark>. */
  tb.mark = (text, hits) => {
    const s = String(text || '');
    if (!hits || !hits.length) return s;
    const set = new Set(hits);
    const out = [];
    let buf = '', on = false;
    for (let i = 0; i < s.length; i++) {
      const h = set.has(i);
      if (h !== on && buf) { out.push(on ? html`<mark class="tb-mark">${buf}</mark>` : buf); buf = ''; }
      on = h; buf += s[i];
    }
    if (buf) out.push(on ? html`<mark class="tb-mark">${buf}</mark>` : buf);
    return out;
  };
  /** Highlights the first plain occurrence of `q` inside `text`. */
  tb.markQuery = (text, q) => {
    const k = tb.fold(q).trim();
    const at = k ? tb.fold(text).indexOf(k) : -1;
    return at < 0 ? text : tb.mark(text, range(at, k.length));
  };

  /* ── Adresler ─────────────────────────────────────────── */
  tb.NTP = 'vox://yeni-sekme/';
  tb.isNtp = (url) => !url || /^vox:\/\/yeni-sekme\/?([?#].*)?$/i.test(String(url));
  tb.isWeb = (url) => /^https?:\/\//i.test(String(url || ''));
  /** A tab's site icon URL when it is a real image (Chromium may report "data:," for sites without one). */
  tb.favUrl = (tab) => (tab && /^(https?:|data:image\/)/i.test(tab.faviconUrl || '') ? tab.faviconUrl : null);
  tb.origin = (url) => { const u = Vox.url.parse(url); return u.scheme === 'http' || u.scheme === 'https' ? u.origin : ''; };
  tb.host = (url) => Vox.url.parse(url).host;
  /** Bidi control characters (could make a decoded address read differently than it is). */
  const isBidi = (s) => Array.from(s).some((ch) => { const c = ch.codePointAt(0); return c === 0x200E || c === 0x200F || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069); });
  /** Shows percent-encoded non-ASCII text (İstanbul, ıspanak…) as letters, like Chrome; ASCII escapes such as %20 stay. */
  tb.decode = (s) => String(s || '').replace(/(?:%[89a-f][0-9a-f])+/gi, (m) => {
    try { const d = decodeURIComponent(m); return isBidi(d) ? m : d; } catch (e) { return m; }
  });
  /** Address-bar form of a URL: no scheme, no www, no lone slash (other schemes stay as they are). */
  tb.bare = (url) => {
    const u = Vox.url.parse(url);
    if (u.scheme !== 'http' && u.scheme !== 'https') return String(url || '');
    return tb.decode(`${u.host.replace(/^www\./, '')}${u.path === '/' ? '' : u.path}${u.search}`);
  };
  /** Same rules as the main process (urls.fromInput): true when the text is opened as an address, not searched. */
  tb.urlish = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return false;
    if (/^vox:/i.test(t) || /^about:blank$/i.test(t) || /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(mailto|tel|data):/i.test(t) || /^[a-z]:[\\/]/i.test(t)) return true;
    if (/\s/.test(t)) return false;
    if (/^localhost(:\d+)?(\/.*)?$/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(t)) return true;
    return /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t);
  };

  /* ── Arama motorları ──────────────────────────────────── */
  tb.engines = () => store.get('searchEngines') || [];
  tb.engine = () => { const id = store.get('settings.search.engine'); const l = tb.engines(); return l.find((e) => e.id === id) || l[0] || null; };
  tb.engineName = () => (tb.engine() || {}).name || 'Web';
  tb.searchUrl = (q, eng = tb.engine()) => (eng && eng.url ? eng.url.replace('%s', encodeURIComponent(String(q).trim())) : String(q));
  /** The engine whose results page this URL is, or null. */
  tb.engineOf = (url) => tb.engines().find((e) => e.url && String(url || '').startsWith(e.url.split('%s')[0])) || null;
  /** "@ddg kedi" → { engine, query }; "@dd" → { partial: '@dd' }; else null. */
  tb.keyword = (raw) => {
    const m = String(raw || '').match(/^(@\S*)(?:\s+(.*))?$/);
    if (!m) return null;
    const eng = tb.engines().find((e) => e.keyword && e.keyword.toLowerCase() === m[1].toLowerCase());
    if (eng && m[2] !== undefined) return { engine: eng, query: m[2] };
    return m[2] === undefined ? { partial: m[1] } : null;
  };
  /** Turkish locative: "Google" → "Google'da", "Bing" → "Bing'de", "Yandex" → "Yandex'te" (by pronunciation for known names). */
  const SAID = { google: 'gugıl', 'brave search': 'breyv sörç', duckduckgo: 'dakdakgo', bing: 'bing', yandex: 'yandeks', ecosia: 'ekozya', startpage: 'startpeyc' };
  tb.loc = (word) => {
    const lw = SAID[String(word).toLocaleLowerCase('tr-TR')] || String(word).toLocaleLowerCase('tr-TR');
    const vowels = lw.match(/[aeıioöuü]/g) || ['e'];
    const back = 'aıou'.includes(vowels[vowels.length - 1]);
    const hard = /[çfhkpsştx]$/.test(lw);
    return `${word}'${hard ? 't' : 'd'}${back ? 'a' : 'e'}`;
  };

  /* ── Gezinme ve komutlar ──────────────────────────────── */
  /** Opens a URL here, or in a new (background) tab. */
  tb.open = (url, { newTab, background } = {}) => (newTab
    ? Vox.tabs.open(url, { active: !background, opener: store.get('activeTabId') })
    : Vox.nav.go(url));
  tb.openSettings = (section) => Vox.commands.run('open.settings', section ? { section } : {});
  /** Hook: the active tab object (re-renders whenever it changes). */
  tb.useActiveTab = () => Vox.useStore((s) => (s.tabs || []).find((t) => t.id === s.activeTabId) || null);
  const PRETTY = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Delete: 'Del' };
  /** Shortcut label for a command with arrow keys shown as glyphs ('' when nothing is bound). */
  tb.kbd = (id) => { const l = Vox.keys.label(id); return l ? l.split('+').map((k) => PRETTY[k] || k).join('+') : ''; };
  /** Runs a command only when some module registered it (other areas may be missing). */
  tb.run = (id, args) => (Vox.commands.has(id) ? Vox.commands.run(id, args) : undefined);
  /** Menu item for a command; disabled when the command is not registered. */
  tb.cmdItem = (id, extra = {}) => ({ command: id, kbd: tb.kbd(id), ...extra, disabled: !Vox.commands.has(id) || !!extra.disabled });
  tb.toast = (text, icon = 'info', more = {}) => Vox.ui.toast({ icon, text, ...more });
  /** Copies text with the main process clipboard (works without page focus). */
  tb.copy = (text, what) => Vox.native.invoke('clipboard:write', { text: String(text || '') })
    .then(() => what && tb.toast(`${what} panoya kopyalandı.`, 'clipboard-check'), () => tb.toast('Panoya erişilemedi.', 'clipboard'));

  /* ── İzinler (ana süreçteki anahtarlar) ───────────────── */
  tb.PERMS = {
    location: { label: 'Konum', icon: 'map-pin', off: 'map-pin-off', ask: 'konumunuzu öğrenmek istiyor' },
    camera: { label: 'Kamera', icon: 'camera', off: 'camera-off', ask: 'kameranızı kullanmak istiyor' },
    microphone: { label: 'Mikrofon', icon: 'mic', off: 'mic-off', ask: 'mikrofonunuzu kullanmak istiyor' },
    'camera+microphone': { label: 'Kamera ve mikrofon', icon: 'video', off: 'video-off', ask: 'kameranızı ve mikrofonunuzu kullanmak istiyor' },
    notifications: { label: 'Bildirimler', icon: 'bell', off: 'bell-off', ask: 'size bildirim göndermek istiyor' },
    clipboard: { label: 'Pano', icon: 'clipboard', off: 'clipboard-x', ask: 'panonuzdaki metni ve görselleri görmek istiyor' },
    midi: { label: 'MIDI cihazları', icon: 'music', off: 'ban', ask: 'MIDI cihazlarınızı kullanmak istiyor' },
    screen: { label: 'Ekran paylaşımı', icon: 'screen-share', off: 'screen-share-off', ask: 'ekranınızı paylaşmak istiyor' },
    windows: { label: 'Pencere yönetimi', icon: 'app-window', off: 'ban', ask: 'ekranlarınızı görüp pencereleri yerleştirmek istiyor' },
    idle: { label: 'Cihaz kullanımı', icon: 'clock', off: 'ban', ask: 'cihazınızı ne zaman kullandığınızı bilmek istiyor' },
    storage: { label: 'Çerez erişimi', icon: 'cookie', off: 'ban', ask: 'başka sitelerde kayıtlı çerezlerini kullanmak istiyor' },
    files: { label: 'Dosya düzenleme', icon: 'file-pen', off: 'ban', ask: 'cihazınızdaki dosyaları düzenlemek istiyor' },
    keyboard: { label: 'Klavye kilidi', icon: 'keyboard', off: 'ban', ask: 'klavyenizi kilitlemek istiyor' },
    speakers: { label: 'Hoparlörler', icon: 'speaker', off: 'ban', ask: 'ses çıkış cihazınızı seçmek istiyor' },
    drm: { label: 'Korumalı içerik', icon: 'shield', off: 'shield-off', ask: 'korumalı içerik oynatmak istiyor' },
  };
  /** Permissions the main process really enforces, always listed in the site panel. */
  tb.SITE_PERMS = ['location', 'camera', 'microphone', 'notifications', 'clipboard'];
  tb.perm = (id) => tb.PERMS[id] || { label: id, icon: 'shield', off: 'shield-off', ask: `bir izin istiyor (${id})` };

  /* ── Dosyalar ─────────────────────────────────────────── */
  tb.fileIcon = (d) => {
    const n = String(d.filename || '').toLowerCase(), m = d.mime || '';
    if (d.state === 'dangerous') return 'file-warning';
    if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif|ico)$/.test(n)) return 'file-image';
    if (m.startsWith('video/') || /\.(mp4|webm|mkv|mov)$/.test(n)) return 'file-video';
    if (m.startsWith('audio/') || /\.(mp3|ogg|wav|flac|m4a)$/.test(n)) return 'file-audio';
    if (m === 'application/pdf' || /\.(pdf|txt|md|docx?|odt|rtf)$/.test(n)) return 'file-text';
    if (/zip|rar|7z|tar|gzip/.test(m) || /\.(zip|rar|7z|gz|tgz)$/.test(n)) return 'file-archive';
    if (/\.(html?|css|js|mjs|json|xml)$/.test(n)) return 'file-code';
    return 'file';
  };

  /* ── Çapalar ──────────────────────────────────────────── */
  const visible = (el) => !!(el && el.isConnected && el.getClientRects().length);
  /** A visible toolbar anchor by name, falling back to the menu button / omnibox when it is collapsed away. */
  tb.anchor = (name) => {
    const el = document.querySelector(`[data-anchor="${name}"]`);
    if (visible(el)) return el;
    return [document.querySelector('[data-anchor="menu"]'), document.querySelector('.tb-omni')].find(visible) || null;
  };
  /* Paneli açık olan araç çubuğu düğmesi aria-expanded="true" alır (çekirdek o sırada ipucunu da göstermez). */
  const expanded = new Set();
  Vox.overlay.subscribe((layers) => {
    const open = new Set();
    for (const l of layers) {
      if (!l.closing && (l.kind === 'popover' || l.kind === 'menu') && l.anchor instanceof Element && l.anchor.closest('.tb')) open.add(l.anchor);
    }
    for (const el of open) if (!expanded.has(el)) { expanded.add(el); el.setAttribute('aria-expanded', 'true'); }
    for (const el of Array.from(expanded)) if (!open.has(el)) { expanded.delete(el); if (el.isConnected) el.setAttribute('aria-expanded', 'false'); }
  });
  /** The open popover layer anchored to `el` (optionally of a class), or null. */
  tb.popoverOn = (el, cls) => (el && Vox.overlay.list().find((l) => l.kind === 'popover' && l.anchor === el && !l.closing && (!cls || String(l.className).includes(cls)))) || null;
  /** Closes the popover anchored to `el`; true when one was open. */
  tb.closeOn = (el) => { const l = tb.popoverOn(el); if (l) Vox.overlay.close(l.id); return !!l; };
  tb.overlayOpen = () => !!Vox.overlay.top(['menu', 'popover', 'dialog']);

  /* ── Menü satırları ───────────────────────────────────── */
  /** Favicon spec for a known page URL: open tab → bookmark → history; else a globe. */
  tb.favFor = (url, known) => {
    if (known) return typeof known === 'string' ? { url: known } : known;
    if (!url) return { icon: 'globe' };
    if (/^vox:/i.test(url)) return { logo: true };
    const t = Vox.tabs.all().find((x) => x.url === url);
    if (t && tb.favUrl(t)) return { url: t.faviconUrl };
    const b = Vox.bookmarks.findByUrl(url);
    if (b && b.favicon) return { url: b.favicon };
    const h = Vox.history.list().find((x) => x.url === url && x.favicon);
    return h ? { url: h.favicon } : { icon: 'globe' };
  };
  /** Menu row with a site favicon; keyboard-navigable like core items. */
  tb.favItem = ({ title, url, fav, hint, onSelect }) => ({
    render: ({ close }) => html`<button type="button" role="menuitem" class="menu-item tb-mi" title=${url || undefined}
      onClick=${() => { close(); setTimeout(onSelect, 0); }}>
      <span class="menu-ic"><${Favicon} spec=${tb.favFor(url, fav)} size=${16}/></span>
      <span class="menu-label"><span class="tb-mi-title">${title}</span>${hint ? html`<small>${hint}</small>` : null}</span>
    </button>`,
  });

  /** Focuses an element once it is visible (for fields inside popovers opened with autoFocus:false). */
  tb.focusSoon = (find, select) => {
    let n = 0;
    const tick = () => {
      const el = find();
      if (el && el.isConnected && getComputedStyle(el).visibility === 'visible') {
        if (document.activeElement !== el) el.focus({ preventScroll: true });
        if (document.activeElement === el) { if (select && el.select) el.select(); return; }
      }
      if (++n < 30) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /** For `persistent` popovers that host Selects or menus: close on pointerdown outside every overlay layer and the anchor. */
  tb.useOutsideClose = (close, anchor) => {
    const ref = useRef(close);
    ref.current = close;
    useEffect(() => {
      const onDown = (e) => {
        const t = e.target;
        if (!t || !t.closest || t.closest('[data-layer-id]') || t.closest('.toast') || t.closest('.dialog-scrim')) return;
        if (anchor instanceof Element && anchor.contains(t)) return;
        ref.current();
      };
      document.addEventListener('pointerdown', onDown, true);
      return () => document.removeEventListener('pointerdown', onDown, true);
    }, []);
  };
});
