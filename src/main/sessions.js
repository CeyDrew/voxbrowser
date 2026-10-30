'use strict';
/* VoxBrowser — oturum (profil) yapılandırması: vox:// protokolü, indirmeler, izinler, gizlilik başlıkları,
   yalnızca HTTPS modu, sertifika istisnaları. Her bölüm (kalıcı profil ve her gizli pencere) bir kez yapılandırılır. */
const { app, session } = require('electron');
const store = require('./store');
const protocol = require('./protocol');
const downloads = require('./downloads');
const permissions = require('./permissions');

/** Every configured session (persistent profile + each private window), for applying language changes to all. */
const configured = new Set();
const httpAllowed = new Set();
const certAllowed = new Set();
/** host → last certificate Chromium verified for it (shown in the site information panel). */
const certs = new Map();
/** host → last certificate error seen for it; "Yine de devam et" is only valid for a host that really had one. */
const certErrors = new Map();
/** Never bypassable, like Chrome: revoked certificate, known interception software, key pinning failure. */
const NO_BYPASS = new Set(['net::ERR_CERT_REVOKED', 'net::ERR_CERT_KNOWN_INTERCEPTION_BLOCKED', 'net::ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN']);
let hooks = { notify: () => {}, ask: () => {} };

function isLocalHost(host) { return /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/i.test(host); }

function spellLanguages() {
  const map = { 'tr-TR': 'tr', 'en-US': 'en-US', 'en-GB': 'en-GB', 'de-DE': 'de', 'fr-FR': 'fr', 'es-ES': 'es', 'ar': 'ar', 'ru-RU': 'ru' };
  return (store.get('settings.languages.list') || ['tr-TR']).map((l) => map[l] || l);
}
/** Accept-Language for sites follows the user's language list; spellcheck follows it too. */
function applyLanguages(ses) {
  try {
    const list = (store.get('settings.languages.list') || []).filter((l) => /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(l)).slice(0, 12);
    if (list.length) ses.setUserAgent(app.userAgentFallback, list.join(','));
  } catch (e) { /* yok say */ }
  try {
    const on = !!store.get('settings.languages.spellcheck');
    const avail = new Set(ses.availableSpellCheckerLanguages || []);
    const langs = spellLanguages().filter((l) => !avail.size || avail.has(l));
    ses.setSpellCheckerEnabled(on);
    if (on && langs.length) ses.setSpellCheckerLanguages(langs);
  } catch (e) { /* bazı platformlarda dil listesi işletim sisteminden gelir */ }
}

function configure(ses) {
  if (configured.has(ses)) return ses;
  configured.add(ses);
  protocol.setup(ses);
  downloads.setup(ses, (ch, d) => hooks.notify(ch, d));
  permissions.setup(ses, (req) => hooks.ask(req));
  applyLanguages(ses);
  // Sertifikayı yalnızca kaydet; karar Chromium'un kendi doğrulamasıdır (-3 = Chromium sonucunu kullan).
  ses.setCertificateVerifyProc((req, cb) => {
    const c = req.certificate || {};
    certs.set(req.hostname, {
      subject: (c.subject && c.subject.commonName) || c.subjectName || '', issuer: (c.issuer && (c.issuer.organizations || [])[0]) || c.issuerName || '',
      issuerName: c.issuerName || '', validStart: c.validStart || 0, validExpiry: c.validExpiry || 0, fingerprint: c.fingerprint || '',
      ok: req.errorCode === 0, result: req.verificationResult || '',
    });
    if (certs.size > 500) certs.delete(certs.keys().next().value);
    cb(-3);
  });
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const h = details.requestHeaders;
    if (store.get('settings.privacy.gpc')) h['Sec-GPC'] = '1';
    if (store.get('settings.privacy.dnt')) h.DNT = '1';
    cb({ requestHeaders: h });
  });
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, cb) => {
    if (details.resourceType !== 'mainFrame' || !store.get('settings.privacy.httpsOnly')) { cb({}); return; }
    let u;
    try { u = new URL(details.url); } catch (e) { cb({}); return; }
    if (isLocalHost(u.host) || httpAllowed.has(u.host)) { cb({}); return; }
    u.protocol = 'https:';
    cb({ redirectURL: u.toString() });
  });
  return ses;
}

module.exports = {
  configure,
  setHooks(h) { hooks = { ...hooks, ...h }; },
  forPartition(partition) { return configure(session.fromPartition(partition)); },
  allowHttp(host) { if (host) httpAllowed.add(host); },
  /** The error page's "Yine de devam et". Returns false when there is nothing to allow or the error can't be bypassed. */
  allowCert(host) {
    const err = certErrors.get(host);
    if (!host || !err || NO_BYPASS.has(err)) return false;
    certAllowed.add(host);
    return true;
  },
  certFor(host) { return certs.get(String(host || '').replace(/:\d+$/, '')) || null; },
  isHttpAllowed(host) { return httpAllowed.has(host); },
  isCertAllowed(host) { return certAllowed.has(host); },
  /** Re-applies language settings (Accept-Language + spellcheck) to every session. */
  applySpellcheckAll() { for (const s of configured) applyLanguages(s); },
  /** Install once: certificate errors fail closed unless the user chose "Yine de devam et" for that host. */
  installCertificateHandler() {
    app.on('certificate-error', (event, wc, url, error, cert, callback) => {
      let host = '';
      try { host = new URL(url).host; } catch (e) { /* yok say */ }
      if (certAllowed.has(host)) { event.preventDefault(); callback(true); return; }
      if (host) {
        certErrors.set(host, String(error));
        if (certErrors.size > 500) certErrors.delete(certErrors.keys().next().value);
      }
      callback(false);
    });
  },
};
