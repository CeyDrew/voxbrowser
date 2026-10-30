/* errors iç sayfa modülünün dosyaları — yollar mutlak (/_/internal/...). Sıra önemlidir.
   voxi-art.js ve voxi.css/errors.css arayüzdeki çökme ekranıyla ortaktır (src/ui/errors/manifest.js). */
Vox.manifest({
  name: 'errors',
  scripts: [
    '/_/internal/errors/voxi-art.js',
    '/_/internal/errors/codes.js',
    '/_/internal/errors/hopper.js',
    '/_/internal/errors/errors.js',
  ],
  styles: ['/_/internal/errors/voxi.css', '/_/internal/errors/errors.css'],
});
