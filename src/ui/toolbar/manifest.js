/* toolbar arayüz modülünün dosyaları — yollar src/ui/index.html'e göredir. Sıra önemlidir: util ve suggest önce, toolbar en son. */
Vox.manifest({
  name: 'toolbar',
  scripts: [
    'toolbar/util.js',
    'toolbar/suggest.js',
    'toolbar/siteinfo.js',
    'toolbar/permission.js',
    'toolbar/bookmark.js',
    'toolbar/omnibox.js',
    'toolbar/extensions.js',
    'toolbar/downloads.js',
    'toolbar/profile.js',
    'toolbar/menu.js',
    'toolbar/context.js',
    'toolbar/palette.js',
    'toolbar/toolbar.js',
  ],
  styles: ['toolbar/toolbar.css', 'toolbar/popovers.css'],
});
