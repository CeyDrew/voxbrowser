/* voxi — sohbet görünümü: karşılama + öneri çipleri, kullanıcı/Voxi balonları, "düşünüyor" noktaları,
   konuşur gibi beliren yanıt metni (ui.vx.speaking), madde listeleri, eylem çipleri ve sesli okuma çubuğu. */
Vox.define('voxi.chat', (Vox) => {
  const { html, useState, useEffect, useRef, useLayoutEffect } = Vox.p;
  const { Icon, Logo } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const vx = Vox.vx;
  const progress = new Map(); // mesaj id → gösterilen karakter (panel kapanıp açılınca kaldığı yerden sürer)

  const Avatar = ({ speaking }) => html`<span class=${cx('vx-av', speaking && 'is-speaking')} data-vx-origin aria-hidden="true">
    <${Logo} size=${30} decorative=${true}/></span>`;
  const Eq = () => html`<span class="vx-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;

  /** Reveals text at a speaking pace (settings.voxi.speed); instant for old messages and reduced motion. */
  function useReveal(m) {
    const full = m.text || '';
    const [n, setN] = useState(() => (!m.fresh || Vox.motion.reduced() ? full.length : progress.get(m.id) || 0));
    useEffect(() => {
      if (n >= full.length) return undefined;
      store.set('ui.vx.speaking', m.id);
      const cps = 60 * Math.max(0.5, Number(Vox.settings.get('voxi.speed')) || 1);
      let raf = 0, last = performance.now(), acc = n, cur = n;
      const step = (t) => {
        acc += ((t - last) / 1000) * cps;
        last = t;
        const k = Math.min(full.length, Math.floor(acc));
        if (k !== cur) { cur = k; progress.set(m.id, k); setN(k); }
        if (k < full.length) { raf = requestAnimationFrame(step); return; }
        progress.delete(m.id);
        store.set('voxi.messages', (l = []) => l.map((x) => (x.id === m.id ? { ...x, fresh: false } : x)));
        if (store.get('ui.vx.speaking') === m.id) store.set('ui.vx.speaking', null);
      };
      raf = requestAnimationFrame(step);
      return () => { cancelAnimationFrame(raf); if (store.get('ui.vx.speaking') === m.id) store.set('ui.vx.speaking', null); };
    }, []);
    return [full.slice(0, n), n >= full.length];
  }

  const Chip = ({ a, i }) => html`<button type="button" class="vx-chip" style=${`--i:${i}`} onClick=${() => vx.runAction(a)}>
    ${a.icon ? html`<${Icon} name=${a.icon} size=${15}/>` : null}<span>${a.label}</span></button>`;

  function VoxiMsg({ m }) {
    const speaking = Vox.useStore('ui.vx.speaking') === m.id;
    const [shown, done] = useReveal(m);
    return html`<div class=${cx('vx-msg vx-msg--voxi', m.tone && `is-${m.tone}`, m.kind && `is-${m.kind}`)}>
      <${Avatar} speaking=${speaking}/>
      <div class="vx-bubble">
        <div class="vx-msg-who">Voxi${speaking ? html`<${Eq}/>` : null}</div>
        <p class="vx-msg-text"><span aria-hidden="true">${shown}${done ? null : html`<span class="vx-caret"></span>`}</span><span class="sr-only">${m.text}</span></p>
        ${done && m.bullets && m.bullets.length ? html`<ul class="vx-bullets">${m.bullets.map((b, i) => html`<li style=${`--i:${i}`}>
          ${typeof b === 'string' ? b : html`<b>${b.head}</b> — ${b.text}`}</li>`)}</ul>` : null}
        ${done && m.note ? html`<p class="vx-msg-note">${m.note}</p>` : null}
        ${done && m.actions && m.actions.length ? html`<div class="vx-acts">${m.actions.map((a, i) => html`<${Chip} a=${a} i=${i}/>`)}</div>` : null}
      </div>
    </div>`;
  }

  const UserMsg = ({ m }) => html`<div class="vx-msg vx-msg--user"><p class="vx-bubble">${m.text}</p></div>`;
  const Thinking = () => html`<div class="vx-msg vx-msg--voxi"><${Avatar} speaking=${false}/>
    <div class="vx-bubble vx-thinking" role="status" aria-label="Voxi düşünüyor"><i></i><i></i><i></i></div></div>`;

  function Greeting() {
    const name = Vox.useStore('profile.name');
    Vox.useStore('settings.appearance.theme'); // tema önerisi tersine dönsün
    Vox.useStore((s) => vx.isWeb(s.tabs.find((x) => x.id === s.activeTabId))); // sayfa türüne göre öneriler
    const chips = Vox.voxi.suggestions();
    return html`<div class="vx-hello">
      <div class="vx-hello-orb" aria-hidden="true"><span class="vx-hello-halo"></span><${Logo} size=${64} decorative=${true}/></div>
      <h2 class="vx-hello-title">Merhaba${name ? ` ${name}` : ''}! Ben Voxi.</h2>
      <p class="vx-hello-text">Sayfaları özetler, siteleri açar, tarayıcıyı sizin için yönetirim. Ne yapmak istediğinizi yazmanız yeterli.</p>
      <span class="vx-ondevice"><${Icon} name="shield-check" size=${15}/>Komutlarınız bu bilgisayarda işlenir</span>
      <div class="vx-chips" role="group" aria-label="Öneriler">
        ${chips.map((c, i) => html`<${Chip} key=${c.text} a=${{ label: c.text, icon: c.icon, ask: c.text }} i=${i}/>`)}
      </div>
    </div>`;
  }

  /** Reading-aloud status with a stop button (also reachable by typing "dur"). */
  function SpeechBar() {
    const sp = Vox.useStore('ui.vx.speech');
    if (!sp) return null;
    const pct = sp.total ? Math.round(((sp.index + 1) / sp.total) * 100) : 0;
    return html`<div class="vx-speech" role="status">
      <span class="vx-speech-ic" aria-hidden="true"><${Icon} name="volume-2" size=${18}/></span>
      <span class="vx-speech-text"><b>Sesli okunuyor</b><span>${vx.clip(sp.title || '', 60)}</span>
        <span class="vx-speech-bar" aria-hidden="true"><i style=${`width:${pct}%`}></i></span></span>
      <button type="button" class="vx-speech-stop" onClick=${() => vx.speech.stop()}><${Icon} name="square" size=${14}/><span>Durdur</span></button>
    </div>`;
  }

  /** Scrollable log; sticks to the bottom while Voxi is talking unless the user scrolled up. */
  function Chat() {
    const msgs = Vox.useStore('voxi.messages') || [];
    const sc = useRef();
    const inner = useRef();
    const stick = useRef(true);
    useEffect(() => {
      if (!window.ResizeObserver || !inner.current) return undefined;
      const ro = new ResizeObserver(() => { if (stick.current && sc.current) sc.current.scrollTop = sc.current.scrollHeight; });
      ro.observe(inner.current);
      return () => ro.disconnect();
    }, []);
    useLayoutEffect(() => { if (sc.current) { sc.current.scrollTop = sc.current.scrollHeight; stick.current = true; } }, [msgs.length]);
    const onScroll = (e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 56; };
    return html`<div class="vx-chat" ref=${sc} onScroll=${onScroll}>
      <div class="vx-chat-in" ref=${inner} role="log" aria-live="polite" aria-label="Voxi ile konuşma">
        ${msgs.length ? msgs.map((m) => (m.role === 'user' ? html`<${UserMsg} key=${m.id} m=${m}/>`
          : m.pending ? html`<${Thinking} key=${m.id}/>` : html`<${VoxiMsg} key=${m.id} m=${m}/>`)) : html`<${Greeting}/>`}
      </div>
    </div>`;
  }

  vx.Chat = Chat;
  vx.Chip = Chip;
  vx.SpeechBar = SpeechBar;
});
