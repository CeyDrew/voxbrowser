/* VoxBrowser — iç sayfa uygulaması: adresteki sayfayı (vox://<sayfa>/…) bulur ve çizer. */
(function () {
  'use strict';
  const Vox = window.Vox;
  if (!Vox || !Vox.p) return;
  const { html, useEffect } = Vox.p;
  const store = Vox.store;

  function NotFound({ url }) {
    return html`<main class="int-notfound">
      <${Vox.c.Logo} size=${72}/>
      <h1>Bu VoxBrowser sayfası yok</h1>
      <p><code>${url}</code> adresinde bir iç sayfa bulunamadı.</p>
      <div class="int-actions">
        <a class="btn btn--primary btn--md" href="vox://yeni-sekme/">Yeni sekmeye dön</a>
        <a class="btn btn--secondary btn--md" href="vox://ayarlar/">Ayarlar</a>
      </div>
    </main>`;
  }

  function Root() {
    const route = Vox.useRoute();
    const page = Vox.pages.find(route.url);
    const sub = page ? route.url.split(/[?#]/)[0].slice(page.url.replace(/\/$/, '').length) || '/' : '/';
    const title = page ? (typeof page.title === 'function' ? page.title(sub, route.query) : page.title) : 'Sayfa bulunamadı';
    useEffect(() => { if (title && document.title !== title) document.title = title; }, [title]);
    if (!page) return html`<${NotFound} url=${route.url}/>`;
    const Page = page.component;
    const tab = Vox.tabs.active();
    return html`<${Page} tab=${tab} url=${route.url} path=${sub} subpath=${sub} query=${route.query} params=${{}} route=${{ kind: 'page', internal: true, subpath: sub, query: route.query }}/>`;
  }

  /* Yeni sekme modülü yüklenmezse bile arama kutusu olan sade bir sayfa çıksın. */
  function FallbackNewTab() {
    const onSubmit = (e) => { e.preventDefault(); const v = e.currentTarget.elements.q.value.trim(); if (v) Vox.nav.go(v); };
    return html`<main class="int-notfound">
      <${Vox.c.Logo} size=${88}/>
      <h1>Merhaba!</h1>
      <form class="int-search" onSubmit=${onSubmit} role="search">
        <${Vox.c.TextField} name="q" label="Ara ya da adres yazın" icon="search" autofocus=${true} autocomplete="off"/>
      </form>
    </main>`;
  }

  const SLICES = ['settings', 'bookmarks', 'history', 'downloads', 'permissions', 'profile', 'readingList', 'shortcuts', 'searchEngines', 'passwords', 'notifications', 'extensions'];
  Vox.boot = async function () {
    store.replace({
      ui: { logo: 'pencere' }, window: { private: false }, tabs: [], activeTabId: null, groups: [],
      settings: {}, bookmarks: { id: 'root', type: 'folder', children: [] }, history: [], downloads: [], permissions: {}, profile: {},
      readingList: [], shortcuts: [], searchEngines: [], passwords: [], notifications: [], extensions: [],
    });
    if (Vox.native.kind !== 'none') await Vox.data.subscribe(SLICES);
    await Vox.loadManifests();
    Vox.runModules();
    if (!Vox.pages.find('vox://yeni-sekme/')) Vox.pages.register({ url: 'vox://yeni-sekme', title: 'Yeni sekme', component: FallbackNewTab });
    Vox.theme.apply();
    Vox.p.render(html`<${Root}/><${Vox.c.OverlayHost}/>`, document.getElementById('vox-app'));
    Vox.ready = true;
    document.documentElement.classList.add('is-ready');
    Vox.bus.emit('ready');
  };
  const start = () => Vox.boot().catch((e) => Vox.reportError('boot', e));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
