/* voxi — sesli okuma: Chromium'un konuşma sentezi (Web Speech API) ve bilgisayarda yüklü bir Türkçe ses.
   Uzun metin cümle öbeklerine bölünüp sıraya alınır; durum ui.vx.speech'te ({ title, total, index, voice }).
   Türkçe ses yoksa okumaz, bunu dürüstçe söyler. */
Vox.define('voxi.speech', (Vox) => {
  const store = Vox.store;
  const vx = Vox.vx;
  const synth = window.speechSynthesis || null;
  let voices = [];
  let gen = 0;
  const load = () => { try { voices = synth ? synth.getVoices() : []; } catch (e) { voices = []; } };
  if (synth) { load(); if (synth.addEventListener) synth.addEventListener('voiceschanged', load); }
  const isTr = (v) => /^tr([-_]|$)/i.test(v.lang || '');

  async function ready() {
    if (!synth || voices.length) return;
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 1500);
      if (synth.addEventListener) synth.addEventListener('voiceschanged', () => { clearTimeout(t); resolve(); }, { once: true });
    });
    load();
  }
  /** The installed Turkish voice (a local one when there is a choice), or null. */
  async function voice() {
    await ready();
    const tr = voices.filter(isTr);
    return tr.find((v) => v.localService) || tr[0] || null;
  }

  /** Sentence-sized pieces (≤ max chars) so long pages queue well and can be stopped at once. */
  function chunks(text, max = 220) {
    const out = [];
    for (const para of String(text || '').split(/\n+/)) {
      let cur = '';
      for (const s of vx.reader.sentences(para)) {
        const piece = s.length > max ? s.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) || [s] : [s];
        for (const p of piece) {
          if (cur && cur.length + p.length + 1 > max) { out.push(cur); cur = ''; }
          cur = cur ? `${cur} ${p.trim()}` : p.trim();
        }
      }
      if (cur) out.push(cur);
    }
    return out.filter(Boolean);
  }

  function finish(my) { if (my === gen) { gen++; store.set('ui.vx.speech', null); } }
  function stop() {
    const was = !!store.get('ui.vx.speech');
    gen++;
    try { if (synth) synth.cancel(); } catch (e) { /* yok say */ }
    if (was) store.set('ui.vx.speech', null);
    return was;
  }

  /** → { ok:true, voice, parts } | { ok:false, reason:'unsupported'|'no-voice'|'empty' } */
  async function speak(text, { title = '' } = {}) {
    const busy = stop();
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return { ok: false, reason: 'unsupported' };
    const v = await voice();
    if (!v) return { ok: false, reason: 'no-voice' };
    const parts = chunks(text).slice(0, 160);
    if (!parts.length) return { ok: false, reason: 'empty' };
    if (busy) await Vox.util.sleep(80); // Chromium: cancel() hemen ardından speak() bazen yutulur
    const my = ++gen;
    const rate = Vox.util.clamp(Number(Vox.settings.get('voxi.speed')) || 1, 0.5, 2);
    store.set('ui.vx.speech', { title, total: parts.length, index: 0, voice: v.name });
    parts.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      u.voice = v;
      u.lang = v.lang;
      u.rate = rate;
      u.onstart = () => { if (my === gen) store.set('ui.vx.speech', (s) => (s ? { ...s, index: i } : s)); };
      u.onend = () => { if (i === parts.length - 1) finish(my); };
      u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') finish(my); };
      synth.speak(u);
    });
    return { ok: true, voice: v.name, parts: parts.length };
  }

  vx.speech = { speak, stop, voice, chunks, supported: () => !!synth, speaking: () => !!store.get('ui.vx.speech') };
});
