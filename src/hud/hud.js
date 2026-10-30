/* VoxBrowser — HUD sayfası (bağımlılıksız): ?kind=status → bağlantı adresi balonu, ?kind=toast → bildirim yığını. */
(function () {
  'use strict';
  const kind = new URLSearchParams(location.search).get('kind');
  if (new URLSearchParams(location.search).get('motion') === 'full') document.documentElement.dataset.motion = 'full';
  const root = document.getElementById('hud');
  const api = window.voxHud;
  if (!api) return;

  function icon(name, size) {
    const lib = window.lucide && window.lucide.icons;
    const pascal = String(name || '').split('-').map((s) => (s ? s[0].toUpperCase() + s.slice(1) : '')).join('');
    const node = lib && (lib[pascal] || lib.Info);
    if (!node) return null;
    const svg = window.lucide.createElement(node);
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('stroke-width', '2.25');
    svg.setAttribute('aria-hidden', 'true');
    return svg;
  }

  if (kind === 'status') {
    const el = document.createElement('div');
    el.className = 'status';
    root.appendChild(el);
    api.on('hud:status', (text) => { el.textContent = text || ''; });
    return;
  }

  const stack = document.createElement('div');
  stack.className = 'stack';
  root.appendChild(stack);
  const report = () => requestAnimationFrame(() => api.size(stack.children.length ? stack.getBoundingClientRect().height + 4 : 0));
  function remove(node) {
    if (!node.isConnected || node.classList.contains('out')) return;
    node.classList.add('out');
    setTimeout(() => { node.remove(); report(); }, 170);
  }
  api.on('hud:toast', (t) => {
    // Aynı kimlikli bildirim yenisiyle değişir (ör. aynı sekmede art arda engellenen açılır pencereler).
    if (t.id) for (const old of [...stack.children]) if (old.dataset.id === t.id) old.remove();
    while (stack.children.length >= 3) stack.firstElementChild.remove();
    const node = document.createElement('div');
    if (t.id) node.dataset.id = t.id;
    node.className = `toast${t.tone ? ` tone-${t.tone}` : ''}`;
    node.setAttribute('role', 'status');
    if (t.icon) { const s = document.createElement('span'); s.className = 'ic'; const i = icon(t.icon, 18); if (i) s.appendChild(i); node.appendChild(s); }
    const text = document.createElement('span');
    text.className = 'text';
    if (t.title) { const b = document.createElement('b'); b.textContent = t.title; text.appendChild(b); }
    text.appendChild(document.createTextNode(t.text || ''));
    node.appendChild(text);
    if (t.action && t.action.label) {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'act';
      a.textContent = t.action.label;
      a.addEventListener('click', () => { api.action(t.id); remove(node); });
      node.appendChild(a);
    }
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'x';
    x.setAttribute('aria-label', 'Kapat');
    const xi = icon('x', 16);
    if (xi) x.appendChild(xi);
    x.addEventListener('click', () => remove(node));
    node.appendChild(x);
    stack.appendChild(node);
    report();
    if (t.duration !== 0) setTimeout(() => remove(node), t.duration || 3800);
  });
})();
