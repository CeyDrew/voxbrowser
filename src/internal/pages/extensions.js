/* VoxBrowser — vox://uzantilar: bu sürümde uzantı desteği yok. Sahte mağaza ya da uzantı yerine dürüst, sıcak bir
   "yakında" sayfası: ne geleceğini (Chrome uyumlu uzantılar) ve bugün neyin hazır olduğunu anlatır. */
Vox.define('pages.extensions', (Vox) => {
  const { html } = Vox.p;
  const { Icon } = Vox.c;
  const pg = Vox.pg;

  /** Puzzle pieces drifting together around a soft halo (decorative). */
  const Art = () => html`<div class="pg-ex-art" aria-hidden="true">
    <span class="pg-ex-halo"></span>
    <svg class="pg-ex-piece pg-ex-piece--a" viewBox="0 0 64 64"><path d="M8 14a6 6 0 0 1 6-6h12a6 6 0 1 1 12 0h12a6 6 0 0 1 6 6v12a6 6 0 1 0 0 12v12a6 6 0 0 1-6 6H38a6 6 0 1 0-12 0H14a6 6 0 0 1-6-6z"/></svg>
    <svg class="pg-ex-piece pg-ex-piece--b" viewBox="0 0 64 64"><path d="M8 14a6 6 0 0 1 6-6h12a6 6 0 1 1 12 0h12a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V38a6 6 0 1 0 0-12z"/></svg>
    <svg class="pg-ex-piece pg-ex-piece--c" viewBox="0 0 64 64"><path d="M8 14a6 6 0 0 1 6-6h36a6 6 0 0 1 6 6v12a6 6 0 1 1 0 12v12a6 6 0 0 1-6 6H38a6 6 0 1 1-12 0H14a6 6 0 0 1-6-6z"/></svg>
    <span class="pg-ex-spark pg-ex-spark--1"></span><span class="pg-ex-spark pg-ex-spark--2"></span><span class="pg-ex-spark pg-ex-spark--3"></span>
  </div>`;

  const FACTS = [
    { icon: 'blocks', title: 'Chrome ile uyumlu olacak', text: 'Uzantı desteği geldiğinde Chrome için yazılmış uzantıları VoxBrowser’a da kurabileceksiniz.' },
    { icon: 'package-x', title: 'Şu an kurulu uzantı yok', text: 'Bu sürümde tarayıcınıza hiçbir uzantı eklenmedi; VoxBrowser yalnızca kendi özellikleriyle çalışıyor.' },
    { icon: 'shield-check', title: 'Bu arada korumalar hazır', text: 'Yalnızca HTTPS modu ve izlenmeme isteği gibi gizlilik ayarları şimdiden çalışıyor.', link: { href: 'vox://ayarlar/gizlilik', label: 'Gizlilik ayarları' } },
  ];

  function ExtensionsPage() {
    return html`<div class="pg-page pg-ex">
      <div class="pg-wrap pg-wrap--narrow">
        <${pg.PageHeader} icon="puzzle" title="Uzantılar" sub="Tarayıcınıza yeni özellikler katan küçük programlar"/>
        <section class="pg-card pg-ex-soon" aria-labelledby="pg-ex-soon-h">
          <${Art}/>
          <div class="pg-ex-soon-text">
            <span class="pg-ex-eyebrow"><${Icon} name="sparkles" size=${15}/>Bir sonraki sürümde</span>
            <h2 id="pg-ex-soon-h">Uzantılar yakında geliyor</h2>
            <p>Reklam engelleyiciler, parola yöneticileri, çeviri araçları… Uzantı desteği VoxBrowser’ın sonraki sürümlerinden biriyle gelecek. Şimdilik kurulabilecek bir uzantı yok.</p>
          </div>
        </section>
        <ul class="pg-ex-facts">
          ${FACTS.map((f, i) => html`<li key=${f.title} class="pg-card pg-ex-fact" style=${`--i:${i}`}>
            <span class="pg-ex-fact-ic"><${Icon} name=${f.icon} size=${20}/></span>
            <b>${f.title}</b>
            <p>${f.text}</p>
            ${f.link ? html`<a class="pg-link" href=${f.link.href}>${f.link.label}<${Icon} name="arrow-right" size=${15}/></a>` : null}
          </li>`)}
        </ul>
      </div>
    </div>`;
  }

  Vox.pages.register({ url: 'vox://uzantilar', title: 'Uzantılar', icon: 'puzzle', component: ExtensionsPage });
});
