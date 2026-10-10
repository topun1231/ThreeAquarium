#!/usr/bin/env node
/**
 * First-load browser smoke: count rendered frames and console errors.
 * This is the check that would have caught catalog.update() throwing on a null catalog
 * (0 frames, welcome overlay never dismissing behind a dead animation loop).
 */
import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 5173);
const CDP = Number(process.env.SMOKE_CDP || 9222);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const chromeBin = process.env.CHROME || 'google-chrome';

function waitPort(port, ms = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = createConnection({host:'127.0.0.1', port}, () => { socket.end(); resolve(); });
      socket.on('error', () => {
        if (Date.now() - start > ms) reject(new Error('port ' + port + ' did not open'));
        else setTimeout(tryOnce, 150);
      });
    };
    tryOnce();
  });
}

async function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let next = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null && pending.has(msg.id)) {
      const {resolve, reject} = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) events.push(msg);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, method, params}));
  });
  return {send, events, close: () => ws.close()};
}

async function main() {
  const errors = [];
  let vite, chrome, session;
  const startedVite = !process.env.SMOKE_EXISTING;
  try {
    if (startedVite) {
      vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
        cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      });
      vite.stderr.on('data', chunk => process.stderr.write(chunk));
      await waitPort(PORT);
    }
    chrome = spawn(chromeBin, [
      '--headless=new', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
      '--hide-scrollbars', '--window-size=1280,720',
      `--remote-debugging-port=${CDP}`, `--user-data-dir=/tmp/aq-boot-smoke-${Date.now()}`,
      '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      'about:blank',
    ], {stdio: ['ignore', 'pipe', 'pipe']});
    await waitPort(CDP, 15000);
    const version = await fetch(`http://127.0.0.1:${CDP}/json/version`).then(r => r.json());
    session = await cdpSession(version.webSocketDebuggerUrl);
    await session.send('Runtime.enable');
    await session.send('Page.enable');
    await session.send('Page.navigate', {url: ORIGIN});
    await session.send('Page.loadEventFired').catch(() => {});
    const deadline = Date.now() + 90000;
    let ready = false;
    while (Date.now() < deadline) {
      const result = await session.send('Runtime.evaluate', {
        expression: `({ready:!!window.aquarium?.ready, error:window.aquarium?.error||null, frames:window.aquarium?.renderedFrames||0})`,
        returnByValue: true,
      });
      const value = result.result?.value;
      if (value?.error) throw new Error('boot failed: ' + value.error);
      if (value?.ready) { ready = true; break; }
      await new Promise(r => setTimeout(r, 400));
    }
    if (!ready) throw new Error('aquarium.ready timed out');
    await new Promise(r => setTimeout(r, 1500));
    const snap = await session.send('Runtime.evaluate', {
      expression: `({
        ready: !!window.aquarium?.ready,
        frames: window.aquarium?.renderedFrames || 0,
        catalogLoaded: !!window.aquarium?.catalogLoaded,
        welcome: !document.getElementById('welcome')?.hidden,
        loading: !!document.getElementById('loading'),
      })`,
      returnByValue: true,
    });
    const value = snap.result?.value || {};
    for (const ev of session.events) {
      if (ev.method === 'Runtime.exceptionThrown') {
        errors.push(ev.params?.exceptionDetails?.exception?.description || ev.params?.exceptionDetails?.text || 'exception');
      }
      if (ev.method === 'Runtime.consoleAPICalled' && ev.params?.type === 'error') {
        errors.push((ev.params.args || []).map(a => a.value || a.description || '').join(' '));
      }
    }
    const catalogCrash = errors.some(e => /Cannot read properties of null \(reading ['"]update['"]\)/.test(e) || /catalog\.update/.test(e));
    const result = {
      ok: value.frames > 0 && !catalogCrash && errors.length === 0,
      frames: value.frames,
      catalogLoaded: value.catalogLoaded,
      welcome: value.welcome,
      loading: value.loading,
      errors,
    };
    await mkdir(path.join(root, 'evidence'), {recursive: true});
    await writeFile(path.join(root, 'evidence/boot-smoke.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    try { session?.close(); } catch {}
    if (chrome) chrome.kill('SIGKILL');
    if (vite && startedVite) vite.kill('SIGTERM');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
