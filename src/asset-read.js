import {startWallpaperRequest} from './wallpaper-request.js';

let startupStatus = null;
let startupPlayback;
// Every tank needs these before its first frame. Optional scenery may use its own fallback.
const bootFiles=new Set(['scene.json','geometry.bin','behavior.json','layout.json','setup.json','catalog.json','initial-population.json'].map(name=>'/assets/'+name));

export function setWallpaperAssetStatus(node, playback) {
  startupStatus = node;
  startupPlayback = playback;
}

export async function readAsset(url, format = 'json', reload = false, signal, requiredAtBoot = bootFiles.has(url)) {
  let delay = 0;
  for (;;) {
    while (startupPlayback?.suspended) await startupPlayback.waitForPoll(0);
    const playback=startupPlayback;
    const request=startupStatus || signal ? startWallpaperRequest(playback,signal) : null;
    let response,failure;
    try {
      response = await fetch(url, request ? {signal:request.signal,cache:delay||reload?'reload':'default'} : undefined);
      if (!response.ok) throw new Error(`资源读取失败 ${url} (${response.status})`);
      return await (request ? request.read(response,format) : response[format]());
    } catch (error) {
      signal?.throwIfAborted();
      const transient = response && !response.ok
        ? response.status >= 500 || response.status === 408 || response.status === 429
        : error instanceof TypeError || error.name === 'AbortError';
      const waitingForFile=requiredAtBoot && (response?.status===404 || format==='json' && error instanceof SyntaxError);
      if (!startupStatus || !(transient || waitingForFile)) throw error;
      failure=error;
      startupStatus.textContent = waitingForFile
        ? `正在等待读取 ${url.split('/').pop()}，文件恢复后会自动播放。`
        : '本机资源读取中断，正在重试…';
      delay = Math.min(delay * 2 || 1500, 15000);
    } finally { request?.finish(); }
    await playback.waitForPoll(delay);
    if (!startupStatus) throw failure;
  }
}

export async function readTexture(loader, url, signal, requiredAtBoot = false) {
  if(!startupStatus && !signal)return loader.loadAsync(url);
  let delay=0;
  for(let reload=false;;reload=true){
    const blobUrl=URL.createObjectURL(await readAsset(url,'blob',reload,signal,requiredAtBoot));
    try { return await loader.loadAsync(blobUrl); }
    catch(error){
      signal?.throwIfAborted();
      if(!startupStatus || reload && !requiredAtBoot)throw error;
      if(reload){
        startupStatus.textContent=`正在等待读取 ${url.split('/').pop()}，文件恢复后会自动播放。`;
        delay=Math.min(delay*2 || 1500,15000);
      }
    }
    finally { URL.revokeObjectURL(blobUrl); }
    if(delay)await startupPlayback.waitForPoll(delay);
  }
}
