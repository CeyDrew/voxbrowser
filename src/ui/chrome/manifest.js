/* chrome arayüz modülünün dosyaları — yollar src/ui/index.html'e göredir. Sıra önemlidir. */
Vox.manifest({
  name: 'chrome',
  scripts: [
    'chrome/common.js', 'chrome/groups.js', 'chrome/tabmenu.js', 'chrome/preview.js', 'chrome/tab.js', 'chrome/tabdrag.js',
    'chrome/tabstrip.js', 'chrome/tabsearch.js', 'chrome/bmhelpers.js', 'chrome/bookmarksbar.js', 'chrome/findbar.js', 'chrome/infobar.js',
  ],
  styles: ['chrome/chrome.css'],
});
