/* VoxBrowser — Ayarlar › VoxBrowser hakkında (vox://hakkinda): logo, ana süreçten gerçek sürüm bilgileri (VoxBrowser,
   Chromium, Electron, Node.js, V8, işletim sistemi), kopyalama, açık kaynak lisansları, kullanıcı verileri klasörü.
   Otomatik güncelleme bir sonraki sürümde: denetim taklidi yapılmaz. */
Vox.define('settings.about', (Vox) => {
  const { html, useState, useEffect } = Vox.p;
  const { Icon, Button, Logo, Badge } = Vox.c;
  const st = Vox.st;
  const { Card, Row } = st;

  let infoP = null;
  const getInfo = () => infoP || (infoP = Vox.native.invoke('app:info').catch(() => null));
  function useInfo() {
    const [info, set] = useState(null);
    useEffect(() => { let on = true; getInfo().then((x) => { if (on) set(x || {}); }); return () => { on = false; }; }, []);
    return info;
  }

  const PLATFORM = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
  const bits = (a) => (a === 'x64' || a === 'arm64' ? '64 bit' : a === 'ia32' ? '32 bit' : a || '');
  const rowsOf = (i) => [
    ['VoxBrowser', `${i.version || '—'}${i.packaged === false ? ' (geliştirme sürümü)' : ''}`],
    ['Chromium', i.chrome || '—'],
    ['Electron', i.electron || '—'],
    ['Node.js', i.node || '—'],
    ['V8', i.v8 || '—'],
    ['İşletim sistemi', `${PLATFORM[i.platform] || i.platform || '—'} · ${i.arch || ''}`],
    ['Dil', i.locale || '—'],
  ];
  const copyAll = (i) => st.copy(rowsOf(i).map(([k, v]) => `${k}: ${v}`).join('\n'), 'Sürüm bilgileri kopyalandı.');

  const LICENSES = [
    ['Chromium', 'BSD-3-Clause', 'Web motoru'],
    ['Electron', 'MIT', 'Masaüstü uygulama çatısı'],
    ['Preact', 'MIT', 'Arayüz bileşenleri'],
    ['htm', 'Apache-2.0', 'Şablon sözdizimi'],
    ['Lucide', 'ISC', 'Simgeler'],
    ['Fredoka', 'SIL OFL 1.1', 'Başlık yazı tipi'],
    ['Nunito', 'SIL OFL 1.1', 'Gövde yazı tipi'],
    ['JetBrains Mono', 'SIL OFL 1.1', 'Kod yazı tipi'],
  ];
  const openLicenses = () => Vox.ui.dialog({
    title: 'Açık kaynak lisansları', icon: 'scale', width: 480, className: 'st-dialog',
    render: () => html`<div class="st-dlg"><p class="dialog-body">VoxBrowser, bu açık kaynak projelerin emeğiyle yapıldı. Teşekkürler!</p>
      <ul class="st-lic">${LICENSES.map(([n, l, d]) => html`<li key=${n}><span><b>${n}</b><small>${d}</small></span><${Badge} tone="neutral">${l}<//></li>`)}</ul></div>`,
    actions: [{ label: 'Kapat', variant: 'primary', value: true }],
  });

  function AboutSection() {
    const i = useInfo();
    return html`
      <${Card} kw="sürüm logo">
        <${Row} bare label="VoxBrowser sürümü" kw="sürüm versiyon güncelleme">
          <div class="st-about">
            <span class="st-about-logo"><${Logo} size=${96}/></span>
            <h3>VoxBrowser</h3>
            <p class="st-about-tag">Dost canlısı tarayıcınız.</p>
            <div class="st-about-chips">
              <button type="button" class="st-ver" data-tip="Sürüm bilgilerini kopyala" disabled=${!i} onClick=${() => i && copyAll(i)}>
                ${i ? `Sürüm ${i.version || '—'} · ${bits(i.arch)}` : 'Sürüm bilgisi alınıyor…'} <${Icon} name="copy" size=${14}/>
              </button>
              ${i && i.packaged === false ? html`<${Badge} tone="honey" icon="flask-conical">Geliştirme sürümü<//>` : null}
            </div>
            <div class="st-update">
              <span class="st-update-ic"><${Icon} name="calendar-clock" size=${22}/></span>
              <span class="st-update-text"><b>Otomatik güncellemeler bir sonraki sürümde</b><small>Şimdilik yeni sürümleri kendiniz kurmanız gerekiyor.</small></span>
            </div>
          </div>
        <//>
      <//>
      <${Card} title="Sürüm ayrıntıları" desc="Destek isterken bu bilgileri paylaşabilirsiniz." kw="chromium electron node v8 platform"
        actions=${html`<${Button} size="sm" variant="secondary" icon="copy" disabled=${!i} onClick=${() => i && copyAll(i)}>Kopyala<//>`}>
        <${Row} bare label="Sürüm ayrıntıları" kw="chromium electron node v8 işletim sistemi windows dil">
          <dl class="st-vers">${(i ? rowsOf(i) : rowsOf({})).map(([k, v]) => html`<div class="st-ver-row" key=${k}><dt>${k}</dt><dd>${i ? v : '…'}</dd></div>`)}</dl>
        <//>
      <//>
      <${Card} title="Bilgiler" kw="lisans klasör">
        <${Row} label="Açık kaynak lisansları" desc="VoxBrowser'ı mümkün kılan projeler." icon="scale" kw="lisans açık kaynak" onClick=${openLicenses}/>
        <${Row} label="Kullanıcı verileri klasörü" desc=${i ? i.userData || '—' : '…'} icon="folder" kw="profil klasör veri yol" wide class="st-row--path">
          <${Button} size="sm" variant="soft" icon="copy" disabled=${!i || !i.userData} onClick=${() => st.copy(i.userData, 'Klasör yolu kopyalandı.')}>Yolu kopyala<//>
        <//>
      <//>
      <p class="st-foot">© 2026 VoxBrowser · Chromium ve açık kaynak yazılımlar sayesinde mümkün oldu.</p>`;
  }

  st.register({ id: 'hakkinda', order: 140, title: 'VoxBrowser hakkında', icon: 'info', kw: 'hakkında sürüm güncelleme lisans',
    desc: 'Sürüm bilgileri, lisanslar ve veri klasörü.', component: AboutSection });
});
