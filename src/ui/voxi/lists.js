/* voxi — yan panel › Geçmiş (günlere göre gruplu, aranabilir, geri alınabilir silme) ve Okuma listesi
   (okunmamış/okunmuş, "Bu sayfayı ekle", okundu işaretle, kaldır). Veriler ana süreçteki gerçek kayıtlardır. */
Vox.define('voxi.lists', (Vox) => {
  const { html, useState, useMemo } = Vox.p;
  const { Icon, SearchField, Button, EmptyState, Segmented } = Vox.c;
  const store = Vox.store;
  const vx = Vox.vx;
  const LIMIT = 300; // panelde en fazla bu kadar satır; tamamı Geçmiş sayfasında
  const X = ({ label, onClick, icon = 'x' }) => html`<button type="button" class="vx-li-x" aria-label=${label} data-tip=${label} onClick=${onClick}>
    <${Icon} name=${icon} size=${16}/></button>`;
  const copied = (ok) => Vox.ui.toast(ok ? { icon: 'clipboard-check', text: 'Bağlantı kopyalandı.' } : { icon: 'clipboard-x', text: 'Bağlantı kopyalanamadı.' });

  function HistoryPanel() {
    const hist = Vox.useStore('history') || [];
    const cur = Vox.useStore((s) => { const t = s.tabs.find((x) => x.id === s.activeTabId); return t ? t.url : ''; });
    const priv = Vox.useStore('window.private');
    const [q, setQ] = vx.usePanelQuery('history');
    vx.useFocusOnOpen('history', 'vx-hi-q');
    const { groups, more } = useMemo(() => {
      const f = vx.fold(q.trim());
      const out = [];
      let n = 0, rest = 0;
      for (const e of hist) {
        if (f && !vx.fold(`${e.title} ${e.url}`).includes(f)) continue;
        if (n >= LIMIT) { rest++; continue; }
        const day = Vox.fmt.day(e.ts);
        if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] });
        out[out.length - 1].items.push(e);
        n++;
      }
      return { groups: out, more: rest };
    }, [hist, q]);
    const remove = (e) => {
      Vox.history.remove(e.id);
      Vox.ui.toast({ icon: 'trash-2', text: 'Geçmişten kaldırıldı.', action: { label: 'Geri al', onClick: () => store.set('history', (h = []) => [...h, e].sort((a, b) => b.ts - a.ts)) } });
    };
    const ctx = (ev, e) => Vox.ui.contextMenu(ev, [
      { label: 'Yeni sekmede aç', icon: 'plus', onSelect: () => Vox.tabs.open(e.url) },
      { label: 'Bağlantıyı kopyala', icon: 'link', onSelect: () => vx.copy(e.url).then(copied) },
      { label: 'Bu siteden daha fazlası', icon: 'search', onSelect: () => setQ(vx.hostOf(e.url)) },
      '-',
      { label: 'Geçmişten kaldır', icon: 'trash-2', danger: true, onSelect: () => remove(e) },
    ]);
    return html`<div class="vx-pane">
      <div class="vx-pane-top"><${SearchField} id="vx-hi-q" value=${q} onInput=${setQ} placeholder="Geçmişte ara"/>
        ${priv ? html`<p class="vx-pane-note"><${Icon} name="venetian-mask" size=${14}/>Gizli pencerede gezdikleriniz buraya kaydedilmez.</p>` : null}</div>
      <div class="vx-pane-body">
        ${groups.length ? groups.map((g) => html`<section class="vx-group" key=${g.day} aria-label=${g.day}>
          <h3 class="vx-group-h">${g.day}</h3>
          <ul class="vx-list">${g.items.map((e) => html`<${vx.Row} key=${e.id} url=${e.url} fav=${e.favicon} title=${e.title} sub=${vx.hostOf(e.url) || e.url}
            meta=${Vox.fmt.time(e.ts)} current=${e.url === cur} onOpen=${(ev) => vx.openFrom(e.url, ev)} onCtx=${(ev) => ctx(ev, e)}>
            <${X} label="Geçmişten kaldır" onClick=${() => remove(e)}/><//>`)}</ul>
        </section>`) : q.trim()
          ? html`<${EmptyState} icon="search-x" title="Sonuç yok" text=${`“${q.trim()}” geçmişinizde bulunamadı.`}/>`
          : html`<${EmptyState} icon="history" title="Geçmiş boş" text="Gezdiğiniz sayfalar burada günlere göre listelenir."/>`}
        ${more ? html`<button type="button" class="vx-more" onClick=${() => Vox.commands.run('open.history')}>
          <span>${Vox.fmt.num(more)} kayıt daha — Geçmiş sayfasında görün</span><${Icon} name="arrow-right" size=${16}/></button>` : null}
      </div>
      <div class="vx-pane-foot">
        <${Button} size="sm" variant="ghost" icon="trash-2" onClick=${() => Vox.commands.run('clearData.open')}>Tarama verilerini temizle…<//>
      </div>
    </div>`;
  }

  function ReadingPanel() {
    const list = Vox.useStore('readingList') || [];
    const tab = Vox.useStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
    const [view, setView] = useState('unread');
    const unread = list.filter((r) => !r.read), read = list.filter((r) => r.read);
    const shown = view === 'unread' ? unread : read;
    const web = vx.isWeb(tab);
    const exists = !!tab && list.some((r) => r.url === tab.url);
    const add = () => { if (vx.addReading(tab)) { setView('unread'); Vox.ui.toast({ icon: 'book-open', text: 'Okuma listesine eklendi.' }); } };
    const open = (r, e) => { vx.openFrom(r.url, e); if (!r.read) Vox.readingList.markRead(r.id, true); };
    const remove = (r) => {
      Vox.readingList.remove(r.id);
      Vox.ui.toast({ icon: 'trash-2', text: 'Okuma listesinden kaldırıldı.', action: { label: 'Geri al', onClick: () => store.set('readingList', (l = []) => [r, ...l].sort((a, b) => b.added - a.added)) } });
    };
    const ctx = (e, r) => Vox.ui.contextMenu(e, [
      { label: 'Yeni sekmede aç', icon: 'plus', onSelect: () => Vox.tabs.open(r.url) },
      { label: r.read ? 'Okunmadı olarak işaretle' : 'Okundu olarak işaretle', icon: r.read ? 'rotate-ccw' : 'check', onSelect: () => Vox.readingList.markRead(r.id, !r.read) },
      { label: 'Bağlantıyı kopyala', icon: 'link', onSelect: () => vx.copy(r.url).then(copied) },
      '-',
      { label: 'Kaldır', icon: 'trash-2', danger: true, onSelect: () => remove(r) },
    ]);
    return html`<div class="vx-pane">
      <div class="vx-pane-top vx-pane-top--stack">
        <${Button} variant="primary" size="sm" icon=${exists ? 'check' : 'plus'} disabled=${!web || exists} onClick=${add}
          title=${!web ? 'Yalnızca web sayfaları eklenebilir' : undefined}>${exists ? 'Bu sayfa listede' : 'Bu sayfayı ekle'}<//>
        <${Segmented} size="sm" label="Okuma listesi görünümü" value=${view} onChange=${setView}
          options=${[{ value: 'unread', label: `Okunmamış (${unread.length})` }, { value: 'read', label: `Okunmuş (${read.length})` }]}/>
      </div>
      <div class="vx-pane-body">
        ${shown.length ? html`<ul class="vx-list">${shown.map((r) => html`<${vx.Row} key=${r.id} url=${r.url} fav=${r.favicon} title=${r.title}
          sub=${`${vx.hostOf(r.url)} · ${Vox.fmt.rel(r.added)}`} onOpen=${(e) => open(r, e)} onCtx=${(e) => ctx(e, r)}>
          <${X} label=${r.read ? 'Okunmadı olarak işaretle' : 'Okundu olarak işaretle'} icon=${r.read ? 'rotate-ccw' : 'check'} onClick=${() => Vox.readingList.markRead(r.id, !r.read)}/>
          <${X} label="Listeden kaldır" onClick=${() => remove(r)}/><//>`)}</ul>`
        : html`<${EmptyState} icon=${view === 'unread' ? 'book-open' : 'book-check'}
            title=${view === 'unread' ? 'Okunacak sayfa kalmadı' : 'Henüz okunmuş sayfa yok'}
            text=${view === 'unread' ? 'İlginizi çeken yazıları sonra okumak için buraya ekleyin.' : 'Okuduğunuz sayfalar burada birikir.'}/>`}
      </div>
    </div>`;
  }

  vx.HistoryPanel = HistoryPanel;
  vx.ReadingPanel = ReadingPanel;
});
