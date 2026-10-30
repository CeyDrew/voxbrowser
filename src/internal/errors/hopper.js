/* Çevrimdışı mini oyun (vox://hata, internet yokken): Voxi engellerin üzerinden zıplar (Boşluk / Yukarı ok / tıklama / dokunma).
   Oyun yalnızca kullanıcı başlatınca çalışır; hareketi azalt açıkken süs hareketleri (bulut, esneme, sarsıntı) kapalıdır.
   En iyi skor bu profilde saklanır (vox://hata kaynağının yerel deposu). */
Vox.define('errors.hopper', (Vox) => {
  const { html, useRef, useEffect, useState } = Vox.p;
  const E = (Vox.err = Vox.err || {});
  const KEY = 'vox-hopper-best';
  let best = 0;
  try { best = Math.max(0, parseInt(localStorage.getItem(KEY), 10) || 0); } catch (e) { best = 0; }
  const saveBest = () => { try { localStorage.setItem(KEY, String(best)); } catch (e) { /* gizli pencerede depo olmayabilir */ } };

  const H = 176, GROUND = 30, VX = 56, GRAV = 2600, JUMP = 780;

  function Hopper() {
    const wrapRef = useRef(null);
    const cvRef = useRef(null);
    const api = useRef({});
    const [phase, setPhase] = useState('idle'); // idle | run | paused | over
    const [result, setResult] = useState({ score: 0, best, record: false });

    useEffect(() => {
      const canvas = cvRef.current;
      const wrap = wrapRef.current;
      const ctx = canvas.getContext('2d');
      const S = { w: 600, dpr: 1, phase: 'idle', y: 0, vy: 0, hold: false, buffer: 0, speed: 340, dist: 0, spawn: 320, obs: [], clouds: [], pebbles: [], squash: 0, shake: 0, overAt: 0, last: 0, raf: 0, col: {} };
      for (let i = 0; i < 4; i++) S.clouds.push({ x: 60 + i * 170 + Math.random() * 60, y: 16 + Math.random() * 46, s: 0.7 + Math.random() * 0.5 });
      for (let i = 0; i < 14; i++) S.pebbles.push({ x: Math.random() * 640, y: 6 + Math.random() * 16, w: 2 + Math.random() * 5 });
      const reduced = () => Vox.motion.reduced();
      const token = (n, fb) => (getComputedStyle(canvas).getPropertyValue(n) || '').trim() || fb;
      const colors = () => {
        const dark = Vox.theme.effective() === 'dark';
        S.col = { ink: token('--text', '#18271F'), soft: token('--text-2', '#4D6056'), faint: token('--line', '#D3E0D1'), line: token('--line-strong', '#7E8F84'),
          face: dark ? '#E8F3EA' : '#FFFFFF', brand: '#04A761', eye: dark ? '#04774A' : '#04603C', honey: '#F5B83D', danger: token('--danger', '#C2412D'), cloud: token('--surface-2', '#E7F0E6') };
      };
      const gy = () => H - GROUND;
      const rr = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };

      function drawCloud(x, y, s, fill) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(x, y, 10 * s, 0, 7); ctx.arc(x + 13 * s, y - 6 * s, 13 * s, 0, 7); ctx.arc(x + 28 * s, y, 10 * s, 0, 7);
        ctx.fill();
        rr(x - 2 * s, y - 2 * s, 32 * s, 12 * s, 6 * s); ctx.fill();
      }
      function drawVoxi(over) {
        const w = 34, h = 28, base = gy() - S.y;
        const sq = reduced() ? 0 : S.squash;
        // gölge
        ctx.fillStyle = S.col.faint;
        ctx.beginPath(); ctx.ellipse(VX + w / 2, gy() + 3, Math.max(6, 16 - S.y / 9), 3, 0, 0, 7); ctx.fill();
        ctx.save();
        ctx.translate(VX + w / 2, base);
        ctx.scale(1 + sq * 0.14, 1 - sq * 0.2);
        ctx.translate(-w / 2, -h);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = S.col.brand; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, -8); ctx.stroke();
        ctx.fillStyle = S.col.honey; ctx.beginPath(); ctx.arc(w / 2, -10, 3.6, 0, 7); ctx.fill();
        ctx.fillStyle = S.col.face;
        ctx.beginPath(); ctx.moveTo(13, h - 3); ctx.lineTo(25, h + 7); ctx.lineTo(25, h - 3); ctx.closePath(); ctx.fill(); ctx.stroke();
        rr(0, 0, w, h, 11); ctx.fill(); ctx.stroke();
        ctx.fillStyle = S.col.face; ctx.fillRect(14.5, h - 4.5, 9, 3.5);
        ctx.fillStyle = S.col.eye; ctx.strokeStyle = S.col.eye; ctx.lineWidth = 2.4;
        if (over) {
          for (const ex of [11, 23]) { ctx.beginPath(); ctx.moveTo(ex - 3.5, 9.5); ctx.lineTo(ex + 3.5, 16.5); ctx.moveTo(ex + 3.5, 9.5); ctx.lineTo(ex - 3.5, 16.5); ctx.stroke(); }
        } else {
          const look = S.vy < -60 ? -2 : S.vy > 60 ? 1.5 : 0;
          for (const ex of [11, 23]) { ctx.beginPath(); ctx.arc(ex, 13 + look, 3.5, 0, 7); ctx.fill(); }
        }
        ctx.restore();
      }
      function drawObs(o) {
        const g = gy();
        ctx.lineCap = 'round';
        if (o.kind === 'cloud') {
          const y = g - o.alt - 8;
          drawCloud(o.x + 4, y, 1.05, S.col.line);
          ctx.strokeStyle = S.col.danger; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(o.x + 8, y - 14); ctx.lineTo(o.x + 30, y + 10); ctx.stroke();
          return;
        }
        ctx.fillStyle = S.col.soft; ctx.strokeStyle = S.col.soft;
        if (o.kind === 'plug') {
          rr(o.x, g - o.h, o.w, o.h, 4); ctx.fill();
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(o.x + o.w * 0.3, g - o.h); ctx.lineTo(o.x + o.w * 0.3, g - o.h - 7);
          ctx.moveTo(o.x + o.w * 0.7, g - o.h); ctx.lineTo(o.x + o.w * 0.7, g - o.h - 7); ctx.stroke();
        } else {
          rr(o.x, g - o.h, o.w, o.h, 5); ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(o.x + 6, g - o.h); ctx.lineTo(o.x + 2, g - o.h - 10); ctx.moveTo(o.x + o.w - 6, g - o.h); ctx.lineTo(o.x + o.w - 2, g - o.h - 10); ctx.stroke();
          ctx.fillStyle = S.col.danger; ctx.beginPath(); ctx.arc(o.x + o.w - 8, g - o.h / 2, 2.4, 0, 7); ctx.fill();
          ctx.fillStyle = S.col.honey; ctx.beginPath(); ctx.arc(o.x + o.w - 15, g - o.h / 2, 2.4, 0, 7); ctx.fill();
        }
      }
      const box = (o) => {
        const g = gy();
        if (o.kind === 'cloud') return { x: o.x + 2, y: g - o.alt - 22, w: 34, h: 22 };
        if (o.kind === 'plug') return { x: o.x, y: g - o.h - 6, w: o.w, h: o.h + 6 };
        return { x: o.x, y: g - o.h - 8, w: o.w, h: o.h + 8 };
      };
      const hit = (a, b) => a.x + 4 < b.x + b.w && a.x + a.w - 4 > b.x && a.y + 4 < b.y + b.h && a.y + a.h - 3 > b.y;

      function draw() {
        const { w, dpr } = S;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, H);
        if (S.shake > 0 && !reduced()) ctx.translate((Math.random() - 0.5) * 6 * S.shake, 0);
        for (const c of S.clouds) drawCloud(c.x % (w + 80) - 40, c.y, c.s, S.col.cloud);
        ctx.strokeStyle = S.col.line; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, gy() + 0.5); ctx.lineTo(w, gy() + 0.5); ctx.stroke();
        ctx.fillStyle = S.col.faint;
        for (const p of S.pebbles) ctx.fillRect(((p.x - S.dist * 0.999) % (w + 20) + w + 20) % (w + 20) - 10, gy() + p.y, p.w, 2);
        for (const o of S.obs) drawObs(o);
        drawVoxi(S.phase === 'over');
        const score = Math.floor(S.dist / 12);
        ctx.font = '700 13px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillStyle = S.col.soft;
        ctx.fillText(`EN İYİ ${String(best).padStart(5, '0')}`, w - 92, 12);
        ctx.fillStyle = S.col.ink;
        ctx.fillText(String(score).padStart(5, '0'), w - 14, 12);
      }

      function spawn() {
        const score = Math.floor(S.dist / 12);
        const r = Math.random();
        let o;
        if (score > 220 && r < 0.2) o = { kind: 'cloud', x: S.w + 20, w: 36, alt: 50 + Math.random() * 8 };
        else if (r < 0.62) o = { kind: 'plug', x: S.w + 20, w: 15 + Math.random() * 6, h: 18 + Math.random() * 16 };
        else o = { kind: 'router', x: S.w + 20, w: 28 + Math.random() * 10, h: 18 + Math.random() * 10 };
        S.obs.push(o);
        if (score > 140 && o.kind === 'plug' && Math.random() < 0.3) S.obs.push({ ...o, x: o.x + o.w + 5, h: o.h * 0.75 });
        S.spawn = S.speed * (0.6 + Math.random() * 0.75) + 170;
      }

      function step(dt) {
        S.speed = Math.min(720, S.speed + dt * 9);
        S.dist += S.speed * dt;
        if (S.y > 0 || S.vy < 0) {
          S.vy += GRAV * dt;
          if (!S.hold && S.vy < -330) S.vy = -330; // kısa basış = alçak zıplama
          S.y -= S.vy * dt;
          if (S.y <= 0) {
            S.y = 0; S.vy = 0; S.squash = 1;
            if (S.buffer > 0) { S.vy = -JUMP; S.hold = true; S.buffer = 0; }
          }
        }
        S.buffer = Math.max(0, S.buffer - dt);
        S.squash = Math.max(0, S.squash - dt * 7);
        S.shake = Math.max(0, S.shake - dt * 4);
        for (const o of S.obs) o.x -= S.speed * dt;
        S.obs = S.obs.filter((o) => o.x + (o.w || 40) > -20);
        S.spawn -= S.speed * dt;
        if (S.spawn <= 0) spawn();
        if (!reduced()) for (const c of S.clouds) { c.x -= S.speed * dt * 0.06 * c.s; if (c.x < -60) c.x += S.w + 140; }
        const me = { x: VX, y: gy() - S.y - 38, w: 34, h: 38 };
        if (S.obs.some((o) => hit(me, box(o)))) gameOver();
      }

      function gameOver() {
        const score = Math.floor(S.dist / 12);
        const record = score > best;
        best = Math.max(best, score);
        if (record) saveBest();
        S.phase = 'over'; S.overAt = performance.now(); S.shake = 0;
        setPhase('over');
        setResult({ score, best, record });
        draw();
        if (reduced()) return;
        const t0 = performance.now();
        const shake = (t) => {
          if (S.phase !== 'over') return;
          S.shake = Math.max(0, 1 - (t - t0) / 320);
          draw();
          if (S.shake > 0) requestAnimationFrame(shake);
        };
        requestAnimationFrame(shake);
      }

      const visible = () => canvas.isConnected && canvas.offsetParent !== null && !document.hidden;
      function loop(t) {
        if (S.phase !== 'run') return;
        if (!visible()) { S.phase = 'paused'; setPhase('paused'); return; }
        const dt = Math.min(0.033, Math.max(0, (t - S.last) / 1000));
        S.last = t;
        step(dt);
        draw();
        if (S.phase === 'run') S.raf = requestAnimationFrame(loop);
      }
      function reset() { Object.assign(S, { y: 0, vy: 0, hold: false, buffer: 0, speed: 340, dist: 0, spawn: 320, obs: [], squash: 0, shake: 0 }); }
      function run() { colors(); S.phase = 'run'; setPhase('run'); S.last = performance.now(); cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(loop); }

      api.current.press = () => {
        if (S.phase === 'over' && performance.now() - S.overAt < 450) return; // yanlışlıkla yeniden başlatmayı önle
        if (S.phase === 'idle' || S.phase === 'over') { reset(); run(); }
        else if (S.phase === 'paused') { run(); return; }
        if (S.y === 0 && S.vy === 0) { S.vy = -JUMP; S.hold = true; }
        else if (S.y < 22 && S.vy > 0) S.buffer = 0.14;
      };
      api.current.release = () => { S.hold = false; };

      const resize = () => {
        S.w = Math.max(240, Math.min(960, wrap.clientWidth - 2));
        S.dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(S.w * S.dpr);
        canvas.height = Math.round(H * S.dpr);
        canvas.style.width = `${S.w}px`;
        canvas.style.height = `${H}px`;
        draw();
      };
      colors();
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
      if (ro) ro.observe(wrap);
      resize();
      const offTheme = Vox.bus.on('theme:change', () => { colors(); draw(); });
      /* Sayfada odak yokken (body) Boşluk da oyunu oynatır — tarayıcıların çevrimdışı oyunu gibi. */
      const onKey = (e) => {
        if (e.target !== document.body || !visible()) return;
        if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); if (e.type === 'keydown') { if (!e.repeat) api.current.press(); } else api.current.release(); }
      };
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);
      return () => {
        S.phase = 'idle';
        cancelAnimationFrame(S.raf);
        if (ro) ro.disconnect();
        offTheme();
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
      };
    }, []);

    const isJump = (e) => e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || (e.key === 'Enter' && phase !== 'run');
    const onKeyDown = (e) => { if (!isJump(e)) return; e.preventDefault(); e.stopPropagation(); if (!e.repeat) api.current.press(); };
    const onKeyUp = (e) => { if (isJump(e)) { e.preventDefault(); api.current.release(); } };
    const onDown = (e) => {
      if (e.button > 0) return;
      if (e.pointerType !== 'mouse') { e.preventDefault(); e.currentTarget.focus({ preventScroll: true }); } // dokunmada çift dokunma yakınlaştırmasını önle
      api.current.press();
    };
    const hint = phase === 'over' ? 'tekrar oynayın' : phase === 'paused' ? 'devam edin' : 'başlayın';

    return html`<div class="err-game" ref=${wrapRef}>
      <div class="err-game-stage" tabindex="0" role="application"
        aria-label="Voxi zıplama oyunu. Zıplamak için Boşluk tuşuna basın, tıklayın ya da dokunun."
        onKeyDown=${onKeyDown} onKeyUp=${onKeyUp} onPointerDown=${onDown} onPointerUp=${() => api.current.release()} onPointerCancel=${() => api.current.release()}>
        <canvas ref=${cvRef} class="err-game-canvas" aria-hidden="true"></canvas>
        ${phase !== 'run' ? html`<div class="err-game-overlay">
          ${phase === 'over' ? html`<p class="err-game-result"><b>Oyun bitti</b><span>Skor ${result.score}${result.record ? ' · Yeni rekor!' : ''}</span></p>` : null}
          ${phase === 'paused' ? html`<p class="err-game-result"><b>Duraklatıldı</b></p>` : null}
          <p class="err-game-hint"><kbd>Boşluk</kbd> tuşuna basarak ya da dokunarak ${hint}</p>
        </div>` : null}
      </div>
      <p class="sr-only" aria-live="polite">${phase === 'over' ? `Oyun bitti. Skorunuz ${result.score}. En iyi skor ${result.best}.` : ''}</p>
    </div>`;
  }

  E.Hopper = Hopper;
});
