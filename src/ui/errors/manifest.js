/* errors (arayüz) modülünün dosyaları: çökmüş sekme ekranı. Yollar src/ui/index.html'e göredir.
   Voxi çizimi ve err- düzeni iç sayfalardaki hata sayfasıyla ortaktır (src/internal/errors/). */
Vox.manifest({
  name: 'errors-ui',
  scripts: ['../internal/errors/voxi-art.js', 'errors/crash.js'],
  styles: ['../internal/errors/voxi.css', '../internal/errors/errors.css', 'errors/crash.css'],
});
