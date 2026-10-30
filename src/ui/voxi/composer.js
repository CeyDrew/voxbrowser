/* voxi — yazma alanı ve Voxi paneli. Mikrofon düğmesi dürüst: sesli komutlar bir sonraki sürümde
   (cihaz üzerinde Whisper); basınca bunu söyleyen bir not gösterir ve yazma alanına odaklanır.
   ↑/↓ önceki komutları getirir; Esc önce yazılanı siler, sonra paneli kapatır. */
Vox.define('voxi.composer', (Vox) => {
  const { html, useRef, useEffect, useMemo, useState } = Vox.p;
  const { Icon, Button, EmptyState } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const vx = Vox.vx;
  const NOTE_MS = 9000;

  /** True when a ui.vx.focus token for `panel` was set a moment ago (panel opened by command or shortcut). */
  vx.wantsFocus = (tok, panel) => {
    const [p, at] = String(tok || '').split(':');
    return p === panel && Date.now() - Number(at) < 2000;
  };

  function VoiceNote() {
    const at = Vox.useStore('ui.vx.voiceNote') || 0;
    const [, tick] = useState(0);
    const left = NOTE_MS - (Date.now() - at);
    useEffect(() => {
      if (!at || left <= 0) return undefined;
      const t = setTimeout(() => tick((x) => x + 1), left);
      return () => clearTimeout(t);
    }, [at]);
    if (!at || left <= 0) return null;
    return html`<div class="vx-note" role="status" key=${at}>
      <span class="vx-note-ic" aria-hidden="true"><${Icon} name="mic-off" size=${16}/></span>
      <p><b>Sesli komutlar bir sonraki sürümde</b> — şimdilik yazarak sorabilirsiniz.</p>
      <button type="button" class="vx-note-x" aria-label="Notu kapat" onClick=${() => store.set('ui.vx.voiceNote', 0)}><${Icon} name="x" size=${14}/></button>
    </div>`;
  }

  function Composer() {
    const draft = Vox.useStore('ui.vx.draft') || '';
    const focusTok = Vox.useStore('ui.vx.focus');
    const talked = Vox.useStore((s) => (s.voxi.messages || []).length > 0);
    const ctx = Vox.useStore((s) => { const t = s.tabs.find((x) => x.id === s.activeTabId); return `${t ? `${t.id}|${t.url}` : ''}|${(s.settings.appearance || {}).theme}`; });
    const input = useRef();
    const recall = useRef(-1);
    const kbd = Vox.keys.label('voxi.listen') || 'Alt+V';
    const ideas = useMemo(() => Vox.voxi.suggestions().slice(0, 3), [ctx, talked]);
    useEffect(() => {
      if (vx.wantsFocus(focusTok, 'voxi') && input.current) input.current.focus({ preventScroll: true });
    }, [focusTok]);
    const setDraft = (v) => store.set('ui.vx.draft', v);
    const send = (e) => {
      if (e) e.preventDefault();
      const t = String(store.get('ui.vx.draft') || '').trim();
      if (!t) return;
      setDraft('');
      recall.current = -1;
      store.set('ui.vx.voiceNote', 0);
      Vox.voxi.ask(t);
    };
    const onKey = (e) => {
      // Enter keydown'da gönderilir (örtük form gönderimine güvenilmez; IME yazımı sürerken gönderilmez)
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { send(e); return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (draft) setDraft(''); else Vox.voxi.closePanel();
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const hist = (store.get('voxi.messages') || []).filter((m) => m.role === 'user').map((m) => m.text);
      if (!hist.length || (draft && recall.current < 0)) return;
      e.preventDefault();
      const i = Math.max(-1, Math.min(hist.length - 1, recall.current + (e.key === 'ArrowUp' ? 1 : -1)));
      recall.current = i;
      setDraft(i < 0 ? '' : hist[hist.length - 1 - i]);
    };
    return html`<form class="vx-composer" onSubmit=${send}>
      <${VoiceNote}/>
      ${talked ? html`<div class="vx-ideas" role="group" aria-label="Öneriler">
        ${ideas.map((x, i) => html`<${vx.Chip} key=${x.text} a=${{ label: x.text, icon: x.icon, ask: x.text }} i=${i}/>`)}</div>` : null}
      <div class="vx-compose">
        <label class="sr-only" for="vx-input">Voxi'ye yazın</label>
        <input id="vx-input" class="vx-input" ref=${input} autocomplete="off" spellcheck="false" maxlength="500" enterkeyhint="send"
          placeholder="Voxi'ye sorun ya da komut verin" value=${draft}
          onInput=${(e) => { recall.current = -1; setDraft(e.currentTarget.value); }} onKeyDown=${onKey}/>
        <button type="button" class="vx-mic" aria-label="Sesli komut — bir sonraki sürümde" data-tip="Sesli komutlar yakında" data-kbd=${kbd}
          onClick=${() => Vox.commands.run('voxi.listen')}><${Icon} name="mic" size=${19}/><span class="vx-mic-dot" aria-hidden="true"></span></button>
        <button type="submit" class="vx-send" aria-label="Gönder" data-tip="Gönder" data-kbd="Enter" disabled=${!draft.trim()}><${Icon} name="arrow-up" size=${18}/></button>
      </div>
      <p class="vx-foot"><${Icon} name="lock" size=${12}/><span>Bu bilgisayarda işlenir</span><span class="vx-foot-hint" aria-hidden="true">·</span><span class="vx-foot-hint">Önceki komutlar için <kbd>↑</kbd></span></p>
    </form>`;
  }

  function VoxiPanel() {
    const on = Vox.useStore('settings.voxi.enabled') !== false;
    if (!on) {
      return html`<div class="vx-off">
        <${EmptyState} icon="mic-off" title="Voxi kapalı" text="Voxi'yi açtığınızda sayfaları özetleyebilir, siteleri açabilir ve tarayıcıyı yazarak yönetebilirsiniz.">
          <div class="vx-off-acts">
            <${Button} variant="primary" icon="power" onClick=${() => Vox.settings.set('voxi.enabled', true)}>Voxi'yi aç<//>
            <${Button} variant="soft" icon="settings" onClick=${() => Vox.commands.run('open.settings', { section: 'voxi' })}>Voxi ayarları<//>
          </div>
        <//>
      </div>`;
    }
    return html`<div class=${cx('vx-voxi')}>
      <${vx.Chat}/>
      <${vx.SpeechBar}/>
      <${Composer}/>
    </div>`;
  }

  vx.VoxiPanel = VoxiPanel;
});
