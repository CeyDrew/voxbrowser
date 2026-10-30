/* voxi arayüz modülünün dosyaları — yollar src/ui/index.html'e göredir. Sıra önemlidir. */
Vox.manifest({
  name: 'voxi',
  scripts: [
    'voxi/base.js', // Türkçe ayrıştırma, adres açma, arama adresi, site simgeleri, kaydetme yardımcıları
    'voxi/sites.js', // bilinen siteler + site içi arama adresleri
    'voxi/reader.js', // sayfa metninden çıkarımsal özet
    'voxi/speech.js', // sesli okuma (Web Speech API, Türkçe ses)
    'voxi/intents.js', // niyet motoru + sohbet, yardım, saat/tarih, "yakında" yanıtları
    'voxi/rules-browser.js', // sekmeler, gezinme, yakınlaştırma, tema, pencereler, tarayıcı sayfaları
    'voxi/rules-web.js', // özet, sesli okuma, sayfada bul, arama, site açma
    'voxi/voxi.js', // denetleyici + voxi.*, sidepanel.* komutları
    'voxi/chat.js', // sohbet görünümü
    'voxi/composer.js', // yazma alanı + VoxiPanel
    'voxi/bookmarks.js', // Yer imleri paneli (+ vx.Row)
    'voxi/lists.js', // Geçmiş ve Okuma listesi panelleri
    'voxi/sidepanel.js', // SidePanel yuvası
  ],
  styles: ['voxi/voxi.css'],
});
