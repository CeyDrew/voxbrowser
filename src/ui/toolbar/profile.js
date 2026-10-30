/* VoxBrowser — profil.
   Avatar düğmesi (data-anchor="profile"; gizli pencerede "Gizli" hapı) ve paneli: bu cihazdaki yerel profilin adı,
   profili düzenleme (Ayarlar › Profil), yeni gizli pencere. Hesap ve senkronizasyon bu sürümde yok: dürüstçe "yakında". */
Vox.define('toolbar.profile', (Vox) => {
  const { html } = Vox.p;
  const { Icon, Avatar, Button } = Vox.c;
  const tb = Vox.tb;

  const nameOf = (p) => p.fullName || p.name || 'Profiliniz';

  function ProfileButton() {
    const p = Vox.useStore('profile') || {};
    const priv = Vox.useStore('window.private');
    const open = (e) => tb.openProfile(e.currentTarget);
    if (priv) {
      return html`<button type="button" class="tb-incog" data-anchor="profile" aria-label="Gizli pencere" data-tip="Gizli moddasınız" aria-haspopup="dialog" onClick=${open}>
        <${Icon} name="venetian-mask" size=${18}/><span>Gizli</span></button>`;
    }
    const name = nameOf(p);
    return html`<button type="button" class="ibtn tb-profile" data-anchor="profile" aria-label=${`Profil: ${name}`} data-tip=${name} aria-haspopup="dialog" onClick=${open}>
      <${Avatar} name=${p.name || name} color=${p.color} size=${28}/>
    </button>`;
  }

  function ProfilePanel({ close }) {
    const p = Vox.useStore('profile') || {};
    const priv = Vox.useStore('window.private');
    const act = (fn) => () => { close(); setTimeout(fn, 0); };
    if (priv) {
      return html`<div class="tb-prof is-private">
        <div class="tb-prof-hero">
          <span class="tb-prof-mask"><${Icon} name="venetian-mask" size=${30}/></span>
          <h2 class="tb-prof-name">Gizli moddasınız</h2>
          <p class="tb-prof-mail">Bu pencerede gezdiğiniz sayfalar geçmişe yazılmaz; çerezler ve site verileri diske kaydedilmez, diğer pencerelerle paylaşılmaz. Yer imleri ve indirdiğiniz dosyalar kalır.</p>
        </div>
        <footer class="tb-pop-foot"><${Button} variant="primary" size="sm" icon="x" onClick=${act(() => Vox.commands.run('window.close'))}>Gizli pencereyi kapat<//></footer>
      </div>`;
    }
    const kbd = tb.kbd('window.private');
    return html`<div class="tb-prof">
      <div class="tb-prof-hero">
        <span class="tb-prof-avatar"><${Avatar} name=${p.name || nameOf(p)} color=${p.color} size=${64}/></span>
        <h2 class="tb-prof-name">${nameOf(p)}</h2>
        <p class="tb-prof-mail">${p.email || 'Bu cihazdaki yerel profil'}</p>
        <div class="tb-prof-sync" role="status"><${Icon} name="cloud-off" size=${16}/><span>Senkronizasyon yakında</span></div>
      </div>
      <div class="tb-pop-list">
        <button type="button" class="tb-pop-row" onClick=${act(() => tb.openSettings('profil'))}>
          <span class="tb-pop-ic"><${Icon} name="user-cog" size=${18}/></span><span class="tb-pop-text"><b>Profili düzenle</b><small>Ad, renk ve profil ayarları</small></span></button>
        <button type="button" class="tb-pop-row" onClick=${act(() => Vox.commands.run('window.private'))}>
          <span class="tb-pop-ic"><${Icon} name="venetian-mask" size=${18}/></span><span class="tb-pop-text"><b>Yeni gizli pencere</b></span>
          ${kbd ? html`<kbd class="menu-kbd">${kbd}</kbd>` : null}</button>
      </div>
    </div>`;
  }

  tb.openProfile = (anchor) => {
    const a = anchor instanceof Element && anchor.isConnected ? anchor : tb.anchor('profile');
    if (!a) return;
    Vox.ui.popover({ anchor: a, placement: 'bottom-end', width: 320, className: 'tb-pop', label: 'Profil', render: ({ close }) => html`<${ProfilePanel} close=${close}/>` });
  };

  tb.ProfileButton = ProfileButton;
  Vox.commands.register('profile.menu', { title: 'Profil', icon: 'circle-user-round', run: (a = {}) => tb.openProfile(a.anchor) });
});
