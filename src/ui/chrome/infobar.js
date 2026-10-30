/* chrome · bilgi çubukları (Vox.c.InfoBar): diğer modüller için Vox.infobar.show({ id, icon, tone, text, actions,
   dismissible }) / hide(id), ve "varsayılan tarayıcınız değil" çubuğu. Bu çubuk yalnızca kurulu (paketlenmiş) sürümde,
   VoxBrowser gerçekten varsayılan değilse, kullanıcı kapatmamışsa ve gizli pencere değilse görünür. "Varsayılan yap"
   Windows'un Varsayılan uygulamalar ayarını açar; seçim yapılınca (pencereye dönüşte denetlenir) kutlanır. */
Vox.define('chrome.infobar', (Vox) => {
  const { html, useState, useEffect, useRef } = Vox.p;
  const { Icon, Button, IconButton } = Vox.c;
  const { cx } = Vox.util;
  const store = Vox.store;
  const N = Vox.native;

  Vox.infobar = {
    /** bar: { id, icon, tone:'info'|'warn'|'success', text, label, actions:[{ label, variant, onClick, close }], dismissible } */
    show(bar) { store.set('ui.chrome.infobars', (l = []) => [...l.filter((b) => b.id !== bar.id), { dismissible: true, ...bar }]); },
    hide(id) { store.set('ui.chrome.infobars', (l = []) => l.filter((b) => b.id !== id)); },
  };

  /** Slides open on mount; when `leaving` it folds shut, then calls onGone. */
  function Frame({ leaving, onGone, children }) {
    const gone = useRef(onGone);
    gone.current = onGone;
    useEffect(() => {
      if (!leaving) return undefined;
      const t = setTimeout(() => gone.current(), Vox.motion.reduced() ? 0 : 330);
      return () => clearTimeout(t);
    }, [leaving]);
    return html`<div class=${cx('ch-ib-wrap', leaving && 'is-leaving')}><div class="ch-ib-clip">${children}</div></div>`;
  }

  const isDefault = async () => {
    const d = await N.invoke('defaultBrowser:get').catch(() => null);
    return d ? !!(d.http && d.https) : null;
  };

  function DefaultBrowserBar() {
    const priv = Vox.useStore('window.private');
    const dismissed = Vox.useStore('settings.ui.chrome.defaultDismissed');
    const focused = Vox.useStore('window.focused');
    const [phase, setPhase] = useState('check'); // check → ask → waiting → done → leaving → gone
    const btn = useRef(null);
    const why = useRef('');

    useEffect(() => {
      if (priv || dismissed || phase !== 'check') return undefined;
      let alive = true;
      (async () => {
        const info = await N.invoke('app:info').catch(() => null);
        if (!info || !info.packaged || !info.defaultBrowserReady) return; // kurulum Windows'a kayıt yapana dek sorma
        const def = await isDefault();
        if (alive && def === false) setPhase('ask');
      })();
      return () => { alive = false; };
    }, [priv, dismissed]);

    // Windows ayarlarından dönünce yeniden bakılır.
    useEffect(() => {
      if (phase !== 'waiting' || !focused) return;
      isDefault().then((def) => {
        if (!def) return;
        const r = btn.current ? btn.current.getBoundingClientRect() : null;
        why.current = 'done';
        setPhase('done');
        if (r) Vox.motion.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 20, spread: 64 });
        setTimeout(() => setPhase((p) => (p === 'done' ? 'leaving' : p)), 2400);
      });
    }, [phase, focused]);

    if (priv || (dismissed && phase === 'ask') || !['ask', 'waiting', 'done', 'leaving'].includes(phase)) return null;
    const make = async () => { const ok = await N.invoke('defaultBrowser:set').catch(() => false); setPhase(ok ? 'waiting' : 'ask'); };
    const dismiss = () => { why.current = 'dismiss'; setPhase('leaving'); };
    const gone = () => { if (why.current === 'dismiss') Vox.settings.set('ui.chrome.defaultDismissed', true); setPhase('gone'); };
    const done = phase === 'done' || (phase === 'leaving' && why.current === 'done');
    return html`<${Frame} leaving=${phase === 'leaving'} onGone=${gone}>
      <div class=${cx('ch-ib', done && 'is-done')} role=${done ? 'status' : 'region'} aria-label="Varsayılan tarayıcı">
        <span class="ch-ib-ic" key=${done ? 'ic-done' : 'ic-ask'} ref=${btn}><${Icon} name=${done ? 'party-popper' : 'monitor-check'} size=${18}/></span>
        <span class="ch-ib-text" key=${done ? 't-done' : phase === 'waiting' ? 't-wait' : 't-ask'}>
          ${done ? html`<b>Harika!</b> VoxBrowser artık varsayılan tarayıcınız.`
            : phase === 'waiting' ? 'Windows ayarları açıldı: “Web tarayıcısı” olarak VoxBrowser’ı seçin.'
              : 'VoxBrowser varsayılan tarayıcınız değil.'}
        </span>
        ${phase === 'ask' ? html`<${Button} size="sm" variant="primary" onClick=${make}>Varsayılan yap<//>` : null}
        ${phase === 'waiting' ? html`<${Button} size="sm" variant="secondary" onClick=${make}>Ayarları yeniden aç<//>` : null}
        ${done ? null : html`<${IconButton} icon="x" label="Kapat" size="sm" onClick=${dismiss}/>`}
      </div>
    <//>`;
  }

  function GenericBar({ bar }) {
    const [leaving, setLeaving] = useState(false);
    const act = (a) => {
      try { if (a.onClick) a.onClick(); } catch (e) { Vox.reportError('infobar', e); }
      if (a.close !== false) setLeaving(true);
    };
    return html`<${Frame} leaving=${leaving} onGone=${() => Vox.infobar.hide(bar.id)}>
      <div class=${cx('ch-ib', `tone-${bar.tone || 'info'}`)} role="region" aria-label=${bar.label || 'Bilgi'}>
        <span class="ch-ib-ic"><${Icon} name=${bar.icon || 'info'} size=${18}/></span>
        <span class="ch-ib-text">${bar.text}</span>
        ${(bar.actions || []).map((a) => html`<${Button} size="sm" variant=${a.variant || 'secondary'} onClick=${() => act(a)}>${a.label}<//>`)}
        ${bar.dismissible !== false ? html`<${IconButton} icon="x" label="Kapat" size="sm" onClick=${() => setLeaving(true)}/>` : null}
      </div>
    <//>`;
  }

  function InfoBar() {
    const bars = Vox.useStore('ui.chrome.infobars') || [];
    return html`<div class="ch-ibs"><${DefaultBrowserBar}/>${bars.map((b) => html`<${GenericBar} key=${b.id} bar=${b}/>`)}</div>`;
  }
  Vox.c.InfoBar = InfoBar;
});
