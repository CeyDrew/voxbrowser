# VoxBrowser

**A friendly desktop web browser for Windows, built on Electron/Chromium, with Voxi — a built-in Turkish assistant that runs entirely on your computer.**

[Türkçe aşağıda](#türkçe) · Electron 44 · Windows x64 · MIT

> The user interface and the assistant speak Turkish.

## What it is

VoxBrowser is a full browser shell written from scratch on top of Electron: tabs, address bar, bookmarks, history, downloads, settings and internal pages (`vox://`), with its own design language. Its assistant **Voxi** understands typed Turkish requests and actually performs them in the browser — no cloud AI, no account, nothing sent anywhere.

## Features

**Browser**
- Tab strip with drag-and-drop reordering, tab groups, pinning, muting, tab search and "reopen closed tab"
- Address bar with search suggestions (Google, DuckDuckGo, Bing, Yandex, Brave), bookmarks bar and bookmark manager
- History, downloads, site info and per-site permission prompts
- Session restore, light / dark / system theme and zoom
- Internal pages: new tab, settings, history, bookmarks, downloads, extensions, friendly error and crash pages
- Turkish NSIS installer (one-click, per-user)

**Voxi assistant** (side panel, `Alt+V`)
- A rule-based intent engine for Turkish: normalises the request (case, diacritics, verb forms) and runs the first matching rule by priority
- Page actions — *"Bu sayfayı özetle"*, *"Sesli oku"*, *"Bu sayfada iklim bul"*
- Sites and search — *"YouTube'u aç"*, *"Vikipedi'de Atatürk ara"*
- Tabs, navigation and view — *"Kapattığım sekmeyi aç"*, *"%125 yap"*, *"Koyu temaya geç"*
- Bookmarks, reading list, history, downloads, privacy settings, task manager
- Read-aloud with the Web Speech API using an installed Turkish voice, split into sentence-sized chunks so it can be stopped instantly

## Security

Security defaults are set in the main process and verified by an automated test suite:

- Every view is **sandboxed** with **context isolation**; Node.js runs only in the main process; the `<webview>` tag is disabled
- The privileged `vox://` scheme is unreachable from web pages
- Permission requests are handled explicitly per site
- Electron **fuses** hardened: `runAsNode` off, `NODE_OPTIONS` and CLI inspect arguments disabled, ASAR integrity validation on, app loads only from ASAR, cookie encryption on
- Crash reports are kept locally and never uploaded
- `tests/e2e/security.mjs` runs a local "attacker" server and tries what a malicious page could do against the real app (cross-site navigation, privileged scheme access, popups, auth prompts and more)

## Project structure

| Path | Contents |
|---|---|
| `src/main/` | Main process: windows, tabs, sessions, IPC, permissions, downloads, history, `vox://` protocol |
| `src/preload/` | Sandboxed preload bridges for the UI, web pages and DevTools |
| `src/ui/` | Browser chrome (tab strip, toolbar), Voxi panel and intent rules |
| `src/internal/` | Internal pages: new tab, settings, history, bookmarks, errors |
| `src/shared/` | Shared core, icons, fonts, vendored Preact + htm and Lucide icons |
| `tests/unit/`, `tests/e2e/` | Unit tests (`node:test`), end-to-end, security and performance tests that drive the real app |

About 140 source files and ~19,000 lines of JavaScript, CSS and HTML. No front-end build step: the UI uses Preact with `htm` tagged templates directly.

## Getting started

Requirements: Windows 10/11 x64 and a current Node.js LTS.

```bash
git clone https://github.com/CeyDrew/voxbrowser.git
cd voxbrowser
npm install
npm start          # run the browser
npm test           # unit + end-to-end + security tests (the security test needs network access)
npm run dist       # build the Windows installer into dist/
```

For read-aloud, install a Turkish voice in Windows (*Settings → Time & language → Speech*).

## Third-party

[Preact](https://preactjs.com/) and [htm](https://github.com/developit/htm) (MIT), [Lucide](https://lucide.dev/) icons (ISC), and the Fredoka, Nunito and JetBrains Mono fonts (SIL Open Font License). Their licenses are in `src/shared/vendor/` and `src/shared/fonts/`.

## License

[MIT](LICENSE) © 2026 Abdurrahman Bilici

---

## Türkçe

**Electron/Chromium üzerine sıfırdan yazılmış, Windows için samimi bir masaüstü tarayıcı.** Yerleşik asistanı **Voxi**, yazılan Türkçe istekleri anlar ve tarayıcıda gerçekten uygular. Tamamen bilgisayarda çalışır: bulut yapay zekâsı yok, hesap yok, hiçbir yere veri gönderilmez.

- Sekmeler (sürükle-bırak, gruplar, sabitleme, sekme arama), adres çubuğu ve arama önerileri, yer imleri, geçmiş, indirilenler, site izinleri, oturum geri yükleme, açık/koyu tema
- Voxi (`Alt+V`): “Bu sayfayı özetle”, “Sesli oku”, “YouTube'u aç”, “Kapattığım sekmeyi aç”, “Koyu temaya geç” gibi komutlar
- Güvenlik: sandbox ve bağlam yalıtımı, sertleştirilmiş Electron fuse ayarları, kötü niyetli sayfa senaryolarını gerçek uygulamada deneyen otomatik güvenlik testleri

Çalıştırma: `npm install`, ardından `npm start`. Testler: `npm test`. Kurulum dosyası: `npm run dist`.
