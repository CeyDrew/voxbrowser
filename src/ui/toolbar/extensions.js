/* VoxBrowser — uzantılar.
   Bu sürümde uzantı desteği yok: yapboz düğmesi (data-anchor="extensions") yalnızca yüklü uzantı varken görünür.
   extensions.menu dürüst bir "bir sonraki sürümde" balonu açar ve Uzantılar sayfasına (vox://uzantilar/) bağlantı verir. */
Vox.define('toolbar.extensions', (Vox) => {
  const { html } = Vox.p;
  const { Icon, IconButton, Button } = Vox.c;
  const tb = Vox.tb;

  function ExtensionsButton() {
    const exts = Vox.useStore('extensions') || [];
    if (!exts.length) return null;
    return html`<${IconButton} icon="puzzle" label="Uzantılar" class="tb-puzzle" data-anchor="extensions" aria-haspopup="dialog"
      onClick=${(e) => Vox.commands.run('extensions.menu', { anchor: e.currentTarget })}/>`;
  }

  function SoonPanel({ close }) {
    const page = () => { close(); Vox.commands.run('open.extensions'); };
    return html`<div class="tb-soon">
      <header class="tb-pop-head">
        <span class="tb-pop-ic is-brand"><${Icon} name="puzzle" size=${18}/></span>
        <h2 class="tb-pop-title">Uzantılar</h2>
        <${IconButton} icon="x" label="Kapat" size="sm" onClick=${() => close()}/>
      </header>
      <div class="tb-soon-body">
        <span class="tb-soon-art" aria-hidden="true"><${Icon} name="puzzle" size=${28}/></span>
        <p class="tb-soon-text"><b>Uzantı desteği bir sonraki sürümde geliyor</b>
          <small>Hazır olduğunda uzantıları buradan kurup yönetebileceksiniz. Şimdilik VoxBrowser uzantısız çalışıyor.</small></p>
      </div>
      <footer class="tb-pop-foot">
        <${Button} variant="ghost" size="sm" onClick=${() => close()}>Tamam<//>
        <${Button} variant="secondary" size="sm" icon="puzzle" onClick=${page}>Uzantılar sayfası<//>
      </footer>
    </div>`;
  }

  tb.openExtMenu = (anchor) => {
    const a = anchor instanceof Element && anchor.isConnected ? anchor : tb.anchor('extensions');
    if (!a) return;
    Vox.ui.popover({ anchor: a, placement: 'bottom-end', width: 340, className: 'tb-pop', label: 'Uzantılar', render: ({ close }) => html`<${SoonPanel} close=${close}/>` });
  };

  tb.ExtensionsButton = ExtensionsButton;
  Vox.commands.register('extensions.menu', { title: 'Uzantılar (yakında)', icon: 'puzzle', run: (a = {}) => tb.openExtMenu(a.anchor) });
});
