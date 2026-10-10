#!/usr/bin/env node
/**
 * Same-camera full-tank + Anubias close-up shots via Chrome CDP.
 * Also reports first-load frame count, console errors, and Anubias map readiness.
 */
import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SHOT_PORT || 5173);
const CDP = Number(process.env.SHOT_CDP || 9223);
const PREFIX = process.env.SHOT_PREFIX || 'after';
const OUT = process.env.SHOT_OUT || path.join(root, 'evidence');
const ART = process.env.SHOT_ART || '/opt/cursor/artifacts/screenshots';
const chromeBin = process.env.CHROME || 'google-chrome';

function waitPort(port, ms = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = createConnection({host:'127.0.0.1', port}, () => { socket.end(); resolve(); });
      socket.on('error', () => {
        if (Date.now() - start > ms) reject(new Error('port ' + port + ' did not open'));
        else setTimeout(tryOnce, 200);
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
  const send = (method, params = {}, timeout = 20000) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)); }, timeout);
    pending.set(id, {resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); }});
    ws.send(JSON.stringify({id, method, params}));
  });
  return {send, events, close: () => ws.close()};
}

async function evaluate(session, expression, timeout = 20000) {
  const result = await session.send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true}, timeout);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'evaluate failed');
  return result.result?.value;
}

async function shot(session, file) {
  const data = await evaluate(session, `(() => {
    const r = aquarium.renderer, gl = r.getContext();
    if (aquarium.waterRenderer) aquarium.waterRenderer.render(performance.now()/1000, aquarium.game?.data?.Tank?.Setup?.Filled ?? true);
    else r.render(aquarium.scene, aquarium.camera);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(pixels.subarray((h-1-y)*w*4, (h-y)*w*4), y*w*4);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  })()`, 45000);
  if (typeof data !== 'string' || !data.startsWith('data:image')) throw new Error('bad canvas png');
  const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  await mkdir(path.dirname(file), {recursive:true});
  await writeFile(file, buf);
  return buf.length;
}

async function main() {
  const errors = [];
  let vite, chrome, session;
  try {
    vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
      cwd: root, stdio:['ignore', 'pipe', 'pipe'],
    });
    vite.stderr.on('data', chunk => process.stderr.write(chunk));
    await waitPort(PORT);
    chrome = spawn(chromeBin, [
      '--headless=new', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
      '--hide-scrollbars', '--window-size=1440,900',
      `--remote-debugging-port=${CDP}`, '--remote-allow-origins=*',
      `--user-data-dir=/tmp/aq-shots-${PREFIX}-${Date.now()}`,
      '--no-first-run', '--no-default-browser-check',
      'about:blank',
    ], {stdio:['ignore', 'pipe', 'pipe']});
    await waitPort(CDP, 20000);
    await new Promise(r => setTimeout(r, 400));
    const targets = await fetch(`http://127.0.0.1:${CDP}/json/list`).then(r => r.json());
    const page = targets.find(t => t.type === 'page') || targets[0];
    if (!page?.webSocketDebuggerUrl) throw new Error('no CDP page target');
    session = await cdpSession(page.webSocketDebuggerUrl);
    await session.send('Runtime.enable');
    await session.send('Page.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {width:1440, height:900, deviceScaleFactor:1, mobile:false});
    await session.send('Page.navigate', {url:`http://127.0.0.1:${PORT}/`});
    console.error('navigated, waiting for aquarium.ready');
    const deadline = Date.now() + 120000;
    let ready = false;
    while (Date.now() < deadline) {
      const value = await evaluate(session, `({ready:!!window.aquarium?.ready, error:window.aquarium?.error||null, frames:window.aquarium?.renderedFrames||0})`).catch(() => null);
      if (value?.error) throw new Error('boot failed: ' + value.error);
      if (value?.ready) { ready = true; break; }
      await new Promise(r => setTimeout(r, 400));
    }
    if (!ready) throw new Error('aquarium.ready timed out');
    await evaluate(session, `document.getElementById('welcome-dismiss')?.click(); document.getElementById('welcome') && (document.getElementById('welcome').hidden = true); localStorage.setItem('aquarium.three.welcome.v1','1');`);
    for (let i = 0; i < 40; i++) {
      const n = await evaluate(session, `window.aquarium?.renderedFrames||0`).catch(() => 0);
      if (n >= 20) break;
      await new Promise(r => setTimeout(r, 300));
    }
    const boot = await evaluate(session, `({
      frames: window.aquarium?.renderedFrames || 0,
      catalogLoaded: !!window.aquarium?.catalogLoaded,
      welcome: !document.getElementById('welcome')?.hidden,
      loading: !!document.getElementById('loading'),
    })`);
    await evaluate(session, `aquarium.reset(); aquarium.controls.update();`);
    await new Promise(r => setTimeout(r, 600));
    await mkdir(OUT, {recursive:true});
    await mkdir(ART, {recursive:true});
    const fullName = `${PREFIX}-tank-full.png`;
    const fullBytes = await shot(session, path.join(OUT, fullName));
    await writeFile(path.join(ART, fullName), await (await import('node:fs/promises')).readFile(path.join(OUT, fullName)));

    let close = {ok:false};
    for (let i = 0; i < 25; i++) {
      close = await evaluate(session, `(() => {
        const flora = aquarium.flora;
        if (!flora) return {ok:false, reason:'no flora'};
        let mesh = null;
        for (const {mesh: m} of flora.meshes.values()) {
          if (m.count && (m.geometry.attributes.aqNode || /pala|nullified|Authored/i.test(m.name + (m.material?.name || '')))) { mesh = m; break; }
        }
        const maps = [];
        for (const {mesh: m} of flora.meshes.values()) {
          if (!m.count) continue;
          const map = m.material?.map;
          const img = map?.image;
          maps.push({
            name: m.name,
            material: m.material?.name,
            hasMap: !!map,
            ready: !!(img && (img.width || img.naturalWidth)),
            width: img?.width || img?.naturalWidth || 0,
            height: img?.height || img?.naturalHeight || 0,
          });
        }
        if (!mesh) return {ok:false, reason:'no anubias mesh', names:[...flora.meshes.values()].map(e => e.mesh.name), maps};
        const arr = mesh.instanceMatrix.array;
        const x = arr[12], y = arr[13], z = arr[14];
        aquarium.controls.target.set(x, y, z);
        aquarium.camera.position.set(x + 0.055, y + 0.035, z + 0.07);
        aquarium.controls.update();
        const textured = maps.filter(m => /pala|nullified|anubias|Authored/i.test(m.name + m.material));
        return {ok:true, maps, at:[x, y, z], texturedReady: textured.length > 0 && textured.every(m => m.hasMap && m.ready && m.width > 16)};
      })()`);
      if (close.ok && close.texturedReady) break;
      await new Promise(r => setTimeout(r, 400));
    }
    await new Promise(r => setTimeout(r, 1200));
    const closeName = `${PREFIX}-anubias-close.png`;
    const closeBytes = await shot(session, path.join(OUT, closeName));
    await writeFile(path.join(ART, closeName), await (await import('node:fs/promises')).readFile(path.join(OUT, closeName)));

    for (const ev of session.events) {
      if (ev.method === 'Runtime.exceptionThrown') {
        errors.push(ev.params?.exceptionDetails?.exception?.description || ev.params?.exceptionDetails?.text || 'exception');
      }
      if (ev.method === 'Runtime.consoleAPICalled' && ev.params?.type === 'error') {
        errors.push((ev.params.args || []).map(a => a.value || a.description || '').join(' '));
      }
    }
    const anubiasMaps = (close.maps || []).filter(m => /pala|nullified|anubias|Authored/i.test(m.name + m.material));
    const leafMaps = anubiasMaps.filter(m => m.hasMap);
    const result = {
      prefix: PREFIX,
      ok: boot.frames > 0 && errors.length === 0,
      frames: boot.frames,
      catalogLoaded: boot.catalogLoaded,
      welcome: boot.welcome,
      close,
      anubiasTextured: leafMaps.length > 0 && leafMaps.every(m => m.ready && m.width > 16),
      anubiasMaps,
      errors,
      files: {full: fullName, close: closeName, fullBytes, closeBytes},
    };
    await writeFile(path.join(OUT, `${PREFIX}-shots.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    process.exit(result.ok ? 0 : 1);
  } finally {
    try { session?.close(); } catch {}
    if (chrome) { try { chrome.kill('SIGKILL'); } catch {} }
    if (vite) { try { vite.kill('SIGKILL'); } catch {} }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
