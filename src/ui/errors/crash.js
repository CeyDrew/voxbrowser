/* Çökmüş sekme ekranı — Vox.c.CrashPage({ tab }): etkin sekmenin işlemi durunca çekirdek bunu sayfa alanında çizer
   (ana süreç sayfayı gizler). Nedene göre (tab.crashReason) başlık, açıklama ve Voxi; "Yeniden yükle" ve görev yöneticisi. */
Vox.define('errors.crash', (Vox) => {
  const { html, useRef } = Vox.p;
  const { Button, Icon } = Vox.c;
  const stamp = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const TIPS = ['Sayfayı yeniden yüklemek çoğu zaman sorunu çözer.', 'Sık oluyorsa hangi sayfaların çok bellek ya da işlemci kullandığını görev yöneticisinde görebilirsiniz.'];
  /** render-process-gone nedenleri (Electron): başlık, açıklama, Voxi ve öneriler. */
  const REASONS = {
    crashed: { title: 'Eyvah! Bu sekme çöktü', text: 'Bu sayfayı gösteren işlem beklenmedik şekilde durdu.', mood: 'sad', prop: 'bandage', tips: TIPS },
    'abnormal-exit': { title: 'Eyvah! Bu sekme çöktü', text: 'Bu sayfayı gösteren işlem bir hatayla kapandı.', mood: 'sad', prop: 'bandage', tips: TIPS },
    killed: { title: 'Bu sekmenin işlemi sonlandırıldı', text: 'Sayfanın işlemi görev yöneticisinden ya da sistem tarafından durduruldu.', mood: 'worried', prop: 'plug',
      tips: ['Yeniden yükleyerek sayfayı geri getirebilirsiniz.', 'Kaydedilmemiş bilgiler (ör. yarım kalmış bir form) kaybolmuş olabilir.'] },
    oom: { title: 'Bu sayfanın belleği yetmedi', text: 'Sayfa çok fazla bellek kullandığı için durduruldu.', mood: 'dizzy', prop: 'bandage',
      tips: ['Sayfayı yeniden yükleyin.', 'Sorun sürerse kullanmadığınız sekmeleri kapatın; görev yöneticisi hangi sayfanın çok bellek kullandığını gösterir.'] },
    'memory-eviction': { title: 'Bellek boşaltmak için sekme durduruldu', text: 'Bilgisayarınızın belleği azaldığı için bu sayfa durduruldu.', mood: 'dizzy', prop: 'bandage',
      tips: ['Sayfayı yeniden yükleyin.', 'Kullanmadığınız sekmeleri ya da uygulamaları kapatmak belleği rahatlatır.'] },
    'launch-failed': { title: 'Bu sayfa başlatılamadı', text: 'Sayfayı gösterecek işlem başlatılamadı.', mood: 'curious', prop: 'question',
      tips: ['Sayfayı yeniden yükleyin.', 'Sorun sürerse VoxBrowser’ı kapatıp yeniden açın.'] },
    'integrity-failure': { title: 'Sayfa güvenlik denetiminden geçemedi', text: 'Windows kod bütünlüğü denetimi bu sayfanın işlemini durdurdu.', mood: 'worried', prop: 'lock',
      tips: ['Bir güvenlik ya da virüs koruma yazılımı VoxBrowser’ı engelliyor olabilir.', 'VoxBrowser’ı güncelleyip yeniden deneyin.'] },
  };

  function CrashPage({ tab }) {
    const E = Vox.err || {};
    const at = useRef(Date.now()).current;
    const r = (tab && REASONS[tab.crashReason]) || REASONS.crashed;
    const url = tab ? tab.url : '';
    const rows = [['Adres', url || '—'], ['Neden', (tab && tab.crashReason) || 'bilinmiyor'], ['Zaman', stamp.format(at)]];
    return html`<div class="err-wrap err-wrap--crash" data-error="crash" data-reason=${(tab && tab.crashReason) || ''}>
      <div class="err-page err-page--crash">
        <div class="err-main">
          <div class="err-art">${E.Voxi ? html`<${E.Voxi} mood=${r.mood} prop=${r.prop} size=${176}/>` : null}</div>
          <div class="err-body" role="status">
            <h1 class="err-title">${r.title}</h1>
            <p class="err-lead">${r.text} Diğer sekmeleriniz ve verileriniz güvende.</p>
            <ul class="err-tips">${r.tips.map((t) => html`<li key=${t}>${t}</li>`)}</ul>
            <div class="err-actions">
              <${Button} variant="primary" icon="rotate-cw" loading=${!!(tab && tab.loading)} onClick=${() => tab && Vox.nav.reload(tab.id)}>Yeniden yükle<//>
              <${Button} variant="secondary" icon="activity" onClick=${() => Vox.commands.run('open.processes')}>Görev yöneticisi<//>
            </div>
            <details class="err-details">
              <summary><${Icon} name="chevron-right" size=${16} class="err-details-chev"/>Teknik ayrıntılar</summary>
              <dl>${rows.map(([k, v]) => html`<div key=${k}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
            </details>
          </div>
        </div>
      </div>
    </div>`;
  }

  Vox.c.CrashPage = CrashPage;
});
