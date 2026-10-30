// VoxBrowser uçtan uca test düzeneği: Electron'u temiz bir profille (ekran dışında) başlatır,
// arayüz, sekme ve ana süreç bağlamlarında kod çalıştırır, konsol hatalarını toplar, pencere görüntüsü alır.
import { spawn, execFile } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..', '..');
const ELECTRON = path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => 9400 + Math.floor(Math.random() * 500);

async function json(url) {
  const r = await fetch(url);
  return r.json();
}
async function waitFor(fn, timeout = 20000, step = 150) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { /* tekrar dene */ }
    await sleep(step);
  }
  throw new Error('waitFor zaman aşımı');
}

/** Minimal CDP client over WebSocket. */
async function cdp(wsUrl, label, sink) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      sink.errors.push(`[${label}] ${(d.exception && d.exception.description) || d.text}`);
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const t = m.params.type;
      const text = m.params.args.map((a) => (a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : a.description || a.type)).join(' ');
      if (t === 'error' || t === 'warning' || /^\[Vox/.test(text)) sink.console.push(`[${label}] ${t}: ${text}`);
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      if (e.level === 'error' && !/favicon|ERR_ABORTED/.test(e.text + (e.url || ''))) sink.console.push(`[${label}] log: ${e.text} ${e.url || ''}`);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return {
    send,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    },
    close() { try { ws.close(); } catch (e) { /* yok say */ } },
  };
}

/** userData: reuse an existing profile folder (e.g. to test session restore); keepProfile: don't delete it on close. */
export async function launch({ offscreen = true, extraArgs = [], keepProfile = false, userData: reuse = null } = {}) {
  const userData = reuse || mkdtempSync(path.join(tmpdir(), 'vox-e2e-'));
  const port = rnd(), inspectPort = port + 500;
  const sink = { errors: [], console: [], stdout: [] };
  const proc = spawn(ELECTRON, [`--inspect=${inspectPort}`, `--remote-debugging-port=${port}`, '.', ...extraArgs], {
    cwd: root,
    env: { ...process.env, VOX_USER_DATA: userData, VOX_TEST_DOWNLOADS: path.join(userData, 'indirilenler'), VOX_TEST: '1', VOX_TEST_OFFSCREEN: offscreen ? '1' : '', ELECTRON_ENABLE_LOGGING: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onOut = (b) => String(b).split(/\r?\n/).filter(Boolean).forEach((l) => {
    sink.stdout.push(l);
    if (/crash|Uncaught|Error:/i.test(l) && !/DevTools listening|Debugger listening|For help|gpu_init|cert_verify|ssl_client|handshake/i.test(l)) sink.console.push(`[stdio] ${l}`);
  });
  proc.stdout.on('data', onOut);
  proc.stderr.on('data', onOut);
  await waitFor(() => json(`http://127.0.0.1:${port}/json/version`), 30000);
  const mainList = await waitFor(() => json(`http://127.0.0.1:${inspectPort}/json/list`), 30000);
  const main = await cdp(mainList[0].webSocketDebuggerUrl, 'main', sink);
  await main.send('Runtime.enable');
  const sessions = new Map();
  async function targets() { return json(`http://127.0.0.1:${port}/json/list`); }
  async function attach(match, label) {
    const t = await waitFor(async () => (await targets()).find((x) => match(x)));
    if (sessions.has(t.id)) return sessions.get(t.id);
    const s = await cdp(t.webSocketDebuggerUrl, label || t.url.slice(0, 40), sink);
    await s.send('Runtime.enable');
    await s.send('Log.enable');
    try { await s.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { /* yok say */ }
    sessions.set(t.id, s);
    return s;
  }
  const ui = await attach((t) => /^vox:\/\/ui\/index\.html/.test(t.url), 'ui');
  await waitFor(() => ui.eval('!!(window.Vox && Vox.ready)'), 30000);
  const app = {
    proc, port, sink, ui, main, userData, attach, targets,
    /** Session for the active tab's page (re-resolved each call). */
    async page() {
      const url = await main.eval(`(() => { const w = [...__vox.windows.values()][0]; const t = w.tabs.active(); return t ? t.wc.getURL() : ''; })()`);
      return attach((t) => t.type === 'page' && t.url === url, 'page');
    },
    async hwnd() { return main.eval(`[...__vox.windows.values()][0].win.getNativeWindowHandle().readBigUInt64LE(0).toString()`); },
    async snap(file) {
      mkdirSync(path.dirname(file), { recursive: true });
      const h = await app.hwnd();
      return new Promise((res) => execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'snap.ps1'), h, file], (err, out) => res((out || '').trim() || String(err))));
    },
    async key(session, key, mods = []) {
      const m = (mods.includes('alt') ? 1 : 0) | (mods.includes('ctrl') ? 2 : 0) | (mods.includes('shift') ? 8 : 0);
      const vk = /^F\d+$/.test(key) ? 111 + Number(key.slice(1)) : key.length === 1 ? key.toUpperCase().charCodeAt(0) : { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Backspace: 8 }[key] || 0;
      const code = /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key;
      const k = key.length === 1 ? (mods.includes('shift') ? key.toUpperCase() : key.toLowerCase()) : key;
      await session.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: m });
      if (k.length === 1 && !(m & 3)) await session.send('Input.dispatchKeyEvent', { type: 'char', key: k, text: k, modifiers: m });
      await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: m });
    },
    async type(session, text) { await session.send('Input.insertText', { text }); },
    async close() {
      for (const s of sessions.values()) s.close();
      main.close();
      try { proc.kill(); } catch (e) { /* yok say */ }
      await sleep(600);
      if (!keepProfile) { try { rmSync(userData, { recursive: true, force: true }); } catch (e) { /* yok say */ } }
    },
  };
  return app;
}

export { sleep, waitFor };
