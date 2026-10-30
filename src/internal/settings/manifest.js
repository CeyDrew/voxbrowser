/* settings iç sayfa modülünün dosyaları — yollar mutlak (/_/internal/...). Sıra önemlidir: önce kit, sonra bölümler, en son sayfa. */
Vox.manifest({
  name: 'settings',
  scripts: [
    '/_/internal/settings/kit.js',
    '/_/internal/settings/s-profile.js',
    '/_/internal/settings/s-appearance.js',
    '/_/internal/settings/s-search-voxi.js',
    '/_/internal/settings/s-privacy.js',
    '/_/internal/settings/clear-data.js',
    '/_/internal/settings/s-passwords.js',
    '/_/internal/settings/s-autofill.js',
    '/_/internal/settings/s-files-lang.js',
    '/_/internal/settings/s-system.js',
    '/_/internal/settings/s-about.js',
    '/_/internal/settings/page.js',
  ],
  styles: ['/_/internal/settings/settings.css', '/_/internal/settings/settings-sections.css'],
});
