'use strict';
// Ana süreç saf mantığı (Electron gerekmeden): adres çubuğu çözümleme, kısayol adları, izin kararları.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/main/store');
const { SEARCH_ENGINES } = require('../../src/main/defaults');
const urls = require('../../src/main/urls');
const { comboOf } = require('../../src/main/keys');
const permissions = require('../../src/main/permissions');

// Depo yerine sabit veri: arama motoru Google, site izinleri örnek.
const fake = {
  'settings.search.engine': 'google',
  searchEngines: SEARCH_ENGINES,
  permissions: { 'https://harita.example': { location: 'allow' }, 'https://kamera.example': { camera: 'allow', microphone: 'block' } },
  'settings.sitePermissions': { location: 'ask', camera: 'ask', microphone: 'ask', notifications: 'block' },
};
store.get = (p) => fake[p];

test('adres çubuğu: tam adresler olduğu gibi kalır', () => {
  assert.equal(urls.fromInput('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(urls.fromInput('  http://localhost:3000/  '), 'http://localhost:3000/');
  assert.equal(urls.fromInput('about:blank'), 'about:blank');
  assert.equal(urls.fromInput('mailto:ali@example.com'), 'mailto:ali@example.com');
});

test('adres çubuğu: alan adı, yerel adres, IP ve dosya yolu', () => {
  assert.equal(urls.fromInput('example.com'), 'https://example.com');
  assert.equal(urls.fromInput('tr.wikipedia.org/wiki/Türkiye'), 'https://tr.wikipedia.org/wiki/Türkiye');
  assert.equal(urls.fromInput('localhost:8080'), 'http://localhost:8080');
  assert.equal(urls.fromInput('192.168.1.1'), 'http://192.168.1.1');
  assert.equal(urls.fromInput('C:\\Users\\ali\\belge.pdf'), 'file:///C:/Users/ali/belge.pdf');
});

test('adres çubuğu: iç sayfalar vox:// biçimine getirilir', () => {
  assert.equal(urls.fromInput('vox:ayarlar'), 'vox://ayarlar/');
  assert.equal(urls.fromInput('vox://gecmis'), 'vox://gecmis/');
  assert.equal(urls.fromInput('vox://ayarlar/gizlilik'), 'vox://ayarlar/gizlilik');
});

test('adres çubuğu: metin aramaya, @anahtar seçili motora gider', () => {
  assert.equal(urls.fromInput('hava durumu istanbul'), 'https://www.google.com/search?q=hava%20durumu%20istanbul');
  assert.equal(urls.fromInput('merhaba'), 'https://www.google.com/search?q=merhaba');
  assert.equal(urls.fromInput('@ddg kedi videoları'), `https://duckduckgo.com/?q=${encodeURIComponent('kedi videoları')}`);
  assert.equal(urls.fromInput('@yok bir şey'), `https://www.google.com/search?q=${encodeURIComponent('@yok bir şey')}`);
  assert.equal(urls.fromInput('   '), null);
});

test('sekmede açılabilecek şemalar sınırlı', () => {
  for (const ok of ['https://a.com', 'http://a.com', 'vox://ayarlar/', 'about:blank', 'data:text/html,x', 'file:///C:/a.txt']) assert.ok(urls.allowedInTab(ok), ok);
  for (const bad of ['javascript:alert(1)', 'chrome://settings', 'devtools://devtools/x', 'about:config', 'ftp://a.com']) assert.ok(!urls.allowedInTab(bad), bad);
  assert.ok(urls.isInternal('vox://yeni-sekme/'));
  assert.equal(urls.internalInfo('vox://gecmis/').title, 'Geçmiş');
});

test('kısayol adları: değiştiriciler, harfler, Türkçe İ, + tuşu, AltGr', () => {
  assert.equal(comboOf({ key: 't', control: true }), 'Ctrl+T');
  assert.equal(comboOf({ key: 'T', control: true, shift: true }), 'Ctrl+Shift+T');
  assert.equal(comboOf({ key: 'İ', code: 'KeyI', control: true, shift: true }), 'Ctrl+Shift+I');
  assert.equal(comboOf({ key: 'F12' }), 'F12');
  assert.equal(comboOf({ key: 'ArrowLeft', alt: true }), 'Alt+ArrowLeft');
  assert.equal(comboOf({ key: '+', control: true, shift: true }), 'Ctrl+Shift+=');
  assert.equal(comboOf({ key: ' ', control: true, shift: true }), 'Ctrl+Shift+Space');
  assert.equal(comboOf({ key: '@', code: 'KeyQ', control: true, alt: true }), 'Ctrl+Alt+Q');
  assert.equal(comboOf({ key: 'ş', code: 'Semicolon', control: true }), 'Ctrl+Ş');
});

test('izin adları Electron adlarından eşlenir', () => {
  assert.equal(permissions.keyOf('media', { mediaTypes: ['video', 'audio'] }), 'camera+microphone');
  assert.equal(permissions.keyOf('media', { mediaTypes: ['audio'] }), 'microphone');
  assert.equal(permissions.keyOf('geolocation'), 'location');
  assert.equal(permissions.keyOf('clipboard-read'), 'clipboard');
});

test('izin kararı: site kaydı → varsayılan → sor', () => {
  assert.equal(permissions.decision('https://harita.example', 'location'), 'allow');
  assert.equal(permissions.decision('https://baska.example', 'location'), 'ask');
  assert.equal(permissions.decision('https://baska.example', 'notifications'), 'block');
  assert.equal(permissions.decision('https://kamera.example', 'camera+microphone'), 'block');
  assert.equal(permissions.decision('https://kamera.example', 'camera'), 'allow');
  assert.equal(permissions.originOf('https://a.example:8443/yol?x=1'), 'https://a.example:8443');
  assert.equal(permissions.originOf('geçersiz'), '');
});

test('kaynak görüntüleme adresleri yalnızca web sayfaları için', () => {
  assert.equal(urls.fromInput('view-source:example.com'), 'view-source:https://example.com');
  assert.equal(urls.fromInput('view-source:https://a.example/x'), 'view-source:https://a.example/x');
  assert.equal(urls.fromInput('view-source:vox://ayarlar'), null);
  assert.ok(urls.allowedInTab('view-source:https://a.example/'));
  assert.ok(!urls.allowedInTab('view-source:file:///C:/a.txt'));
});

test('dış uygulama bağlantıları: güvenli şemalar sorulur, tehlikeliler hiç açılmaz', () => {
  const { externalScheme } = require('../../src/main/prompts');
  assert.equal(externalScheme('mailto:ali@example.com'), 'mailto');
  assert.equal(externalScheme('tel:+905551112233'), 'tel');
  assert.equal(externalScheme('zoommtg://zoom.us/join?confno=1'), 'zoommtg');
  for (const bad of ['https://a.com', 'javascript:alert(1)', 'file:///C:/Windows', 'ms-msdt:/id', 'search-ms:query=x', 'vox://ayarlar', 'data:text/html,x', 'ms-officecmd:x']) {
    assert.equal(externalScheme(bad), null, bad);
  }
});
