import {tankNames} from './crystal-breeding.js';
import {startWallpaperRequest} from './wallpaper-request.js';
import {isWallpaperScreen,wallpaperEntry,wallpaperPreviewURL} from './wallpaper-entry.js';
import {changedWallpaperNeighbours,compareWallpaperLayouts,wallpaperFamilyKey} from './wallpaper-layout.js';
import {guardGameStorage} from './local-game-save.js';
export {wallpaperPreviewURL};

const entryParams=new URLSearchParams(globalThis.location?.search);
const desktopScreen=entryParams.get('aq-screen');
const screenReceipt=isWallpaperScreen(desktopScreen) ? {'X-Aquarium-Desktop-Screen':desktopScreen} : {};
export const wallpaperMode = entryParams.has('wallpaper');
const memory = wallpaperMode ? new Map() : null;
const storage = {
  getItem(key) { return memory ? memory.get(key) ?? null : globalThis.localStorage.getItem(key); },
  setItem(key,value) { if (memory) memory.set(key,String(value)); else globalThis.localStorage.setItem(key,value); },
};
export const gameStorage = memory ? storage : guardGameStorage(storage);

const endpoint = '/api/wallpaper';
const broodReport=/^([1-9]\d*)\/([24])$/;

export function wallpaperScenery(light, hardscape, plants) {
  return [light==='on' ? '缸灯开' : light==='off' ? '缸灯关' : '', /^\d+$/.test(hardscape) && hardscape+' 件木石', /^\d+$/.test(plants) && plants+' 株水草'].filter(Boolean).join(' · ');
}

export function createWallpaperPlayback() {
  let interval=1000/30, previous=null, next=0, suspensions=0;
  const listeners=new Set(), holds=new Set();
  let draw, frameId=null, frameTimer, retryDelay=0;
  let refresh=1000/60, lastDirectTick=null;
  const sleepGap=()=>Math.max(2000,4*interval);
  function requestFrame(){frameId=requestAnimationFrame(tick);}
  function tick(now){
    frameId=null;
    const delivered=performance.now();
    // The host can deliver a queued frame with its pre-sleep timestamp.
    if(delivered-now>=sleepGap())now=delivered;
    if(lastDirectTick!==null && now>lastDirectTick)refresh=now-lastDirectTick;
    lastDirectTick=null;
    if(draw(now)===false){
      // A failed render leaves the still on screen. Resume simulation from the retry, not the missed time.
      previous=null;
      retryDelay=Math.min(8000,retryDelay ? retryDelay*2 : 500);
      if(!holds.size && frameId===null)frameTimer=setTimeout(requestFrame,retryDelay);
      return;
    }
    retryDelay=0;
    if(holds.size || frameId!==null)return;
    // A timer plus a draw costs two callbacks. Sleep only when that skips extra display ticks.
    const wait=next-performance.now()-5;
    if(interval>=1000/30 && wait>2*refresh)frameTimer=setTimeout(requestFrame,wait);
    else {lastDirectTick=now;requestFrame();}
  }
  function restartFrames(){
    if(!draw)return;
    clearTimeout(frameTimer);
    lastDirectTick=null;
    if(frameId!==null)cancelAnimationFrame(frameId);
    frameId=null;
    if(!holds.size)requestFrame();
  }
  function setSuspension(reason,active) {
    const was=holds.size>0;
    if(active)holds.add(reason);else holds.delete(reason);
    const suspended=holds.size>0;
    if(was===suspended)return;
    if(suspended)suspensions++;
    previous=null;
    restartFrames();
    for (const listener of listeners) listener(suspended);
  }
  return {
    get suspended(){return holds.size>0;},
    get suspensions(){return suspensions;},
    startFrames(callback){draw=callback;restartFrames();},
    setHidden(value){setSuspension('hidden',value);},
    setPaused(value){if(typeof value==='boolean')setSuspension('paused',value);},
    setContextLost(value){setSuspension('context',value);},
    onSuspensionChange(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    waitForPoll(delay,signal){
      return new Promise(resolve=>{
        if(signal?.aborted){resolve();return;}
        let timer;
        function finish(){clearTimeout(timer);listeners.delete(changed);signal?.removeEventListener('abort',finish);resolve();}
        function changed(suspended){clearTimeout(timer);if(!suspended)finish();}
        listeners.add(changed);
        signal?.addEventListener('abort',finish,{once:true});
        if(!holds.size)timer=setTimeout(finish,delay);
      });
    },
    applyGeneralProperties(properties){
      const fps=properties?.fps;
      if(Number.isFinite(fps) && fps>=1 && interval!==1000/fps){interval=1000/fps;previous=null;restartFrames();}
    },
    frameDelta(now){
      if(holds.size || previous!==null && now+.25<next)return null;
      const gap=previous===null?0:Math.max(0,now-previous);
      const elapsed=gap>=sleepGap()?0:gap;
      // Keep the cadence across refresh rates that are not multiples of the configured FPS.
      if(previous===null || now-next>=interval) next=now+interval;
      else next+=interval;
      previous=now;
      // Low target rates land on alternating display ticks. Allow up to one extra simulation step.
      const limit=Math.max(100,interval+Math.min(interval/2,50));
      return Math.min(elapsed,limit)/1000;
    },
  };
}

async function readCopy(response,request) {
  try {
    const copy=await request.read(response,'json');
    if(copy?.version!==4 || copy.game?.session?.Tank?.Setup?.Filled!==true || !Array.isArray(copy.game.creatures) || !copy.view)
      throw new SyntaxError('壁纸副本不完整，请从游戏重新同步。');
    return copy;
  } catch(error) {
    if(!request.signal.aborted && error instanceof SyntaxError && !await isWallpaperService(response,request))
      throw new Error('正在等待本机鱼缸服务…');
    throw error;
  }
}

async function isWallpaperService(response,request) {
  if(response.headers.get('x-aquarium-service')==='three-aquarium-wallpaper')return true;
  // Older services identify themselves only at the health endpoint.
  const health=await fetch(endpoint+'/health',{cache:'no-store',signal:request.signal});
  if(!health.ok)return false;
  try {return (await request.read(health,'json'))?.service==='three-aquarium-wallpaper';}
  catch(error){if(error instanceof SyntaxError)return false;throw error;}
}

function canWaitForFirstCopy(response){
  return response.status===404 && response.headers.get('x-aquarium-service')==='three-aquarium-wallpaper' &&
    response.headers.get('x-aquarium-can-wait')==='1';
}

export async function loadWallpaperCopy(status,playback,desktop=false) {
  // The host can start before the player publishes the first tank.
  while (true) {
    while (playback.suspended) await playback.waitForPoll(0);
    const started=playback.suspensions;
    const request=startWallpaperRequest(playback);
    let rejectedTag, waitForFirst;
    try {
      const headers=desktop?{'X-Aquarium-Player':'desktop',...screenReceipt}:{};
      const response = await fetch(endpoint,{headers,cache:'no-store',signal:request.signal});
      if(started!==playback.suspensions){response.body?.cancel().catch(()=>{});continue;}
      if (response.ok) {
        try {
          const copy=await readCopy(response,request);
          if(started!==playback.suspensions)continue;
          return {copy,tag:response.headers.get('etag')};
        }
        catch (error) {
          if(request.signal.aborted || !(error instanceof SyntaxError))throw error;
          // Only a finished, invalid copy can be skipped. Interrupted downloads still need a full retry.
          rejectedTag=response.headers.get('etag');
          status.textContent='壁纸副本无法读取，请从游戏重新同步。';
        }
      } else {
        waitForFirst=canWaitForFirstCopy(response);
        status.textContent = response.status === 404 && await isWallpaperService(response,request)
          ? '先在游戏的「观察」中点「同步到实时壁纸」。' : '正在等待本机鱼缸服务…';
      }
    } catch { status.textContent = '正在等待本机鱼缸服务…'; }
    finally { request.finish(); }
    if(rejectedTag){await waitForWallpaperChange(rejectedTag,playback,desktop,Infinity);continue;}
    if(waitForFirst && started===playback.suspensions){
      try {if(await waitForPublishedCopy('*',playback))continue;}
      catch { /* An older or interrupted service can still be polled. */ }
    }
    if(started===playback.suspensions)await playback.waitForPoll(5000);
  }
}

export async function refreshWallpaper(tag,playback,applyCopy,player,getShrimpCount,getDrawnBrood,status) {
  if(player===true)player='desktop';
  if(playback.suspended)return tag;
  const started=playback.suspensions;
  const request=startWallpaperRequest(playback);
  let next,copy;
  try {
    const headers=tag ? {'If-None-Match':tag} : {};
    if(tag && player){
      headers['X-Aquarium-Loaded']=player;
      if(player==='desktop')Object.assign(headers,screenReceipt);
      if(player==='desktop' && getShrimpCount)headers['X-Aquarium-Desktop-Shrimp']=String(getShrimpCount());
      const brood=player==='desktop' && getDrawnBrood?.();
      if(brood){
        headers['X-Aquarium-Desktop-Brood']=brood.id ?? brood;
        if(brood.adult)headers['X-Aquarium-Desktop-Adult-Brood']=brood.id;
      }
    }
    const response=await fetch(endpoint,{headers,cache:'no-store',signal:request.signal});
    if(started!==playback.suspensions){response.body?.cancel().catch(()=>{});return tag;}
    if(status){
      status.canWait=response.headers.get('x-aquarium-can-wait')==='1';
      status.waitForFirst=canWaitForFirstCopy(response);
    }
    if(status?.waitForFirst)return tag;
    if(response.status===304)return tag;
    if(!response.ok)throw Error('暂时无法读取壁纸副本');
    next=response.headers.get('etag');
    if(!next || next===tag)return tag;
    copy=await readCopy(response,request);
  } catch(error) {
    if(started!==playback.suspensions)return tag;
    if(next && !request.signal.aborted && error instanceof SyntaxError)error.rejectedWallpaperTag=next;
    throw error;
  } finally { request.finish(); }
  if(started!==playback.suspensions)return tag;
  const apply=new AbortController();
  const unsubscribe=playback.onSuspensionChange(suspended=>{if(suspended)apply.abort();});
  try {
    await applyCopy(copy,apply.signal,next);
    return next;
  } catch(error) {
    if(apply.signal.aborted && error===apply.signal.reason)return tag;
    if(error?.code==='INVALID_AQUARIUM_SESSION'){
      error.rejectedWallpaperTag=next;
      throw error;
    }
    if(player==='desktop' && started===playback.suspensions){
      // Report only a failed scene change, with the exact copy the host tried.
      const report=startWallpaperRequest(playback);
      try { await fetch(endpoint,{method:'HEAD',headers:{'If-None-Match':next,'X-Aquarium-Load-Failed':'desktop',...screenReceipt},cache:'no-store',signal:report.signal}); }
      catch { /* Playback still retries if the local service cannot receive the receipt. */ }
      finally { report.finish(); }
    }
    throw error;
  } finally {unsubscribe();}
}

async function waitForPublishedCopy(tag,playback,signal) {
  const request=startWallpaperRequest(playback,signal);
  try {
    const response=await fetch(endpoint+'/wait',{headers:{'If-None-Match':tag},cache:'no-store',signal:request.signal});
    if(response.status===204)return true;
    if(response.status>=500)throw Error('本机壁纸服务暂不可用');
    response.body?.cancel().catch(()=>{});
    return false;
  } finally {request.finish();}
}

export async function followWallpaper(tag,playback,applyCopy,player,getShrimpCount,getDrawnBrood) {
  let delay=player && tag ? 0 : 5000;
  const status={canWait:false};
  while (true) {
    await playback.waitForPoll(delay);
    if(playback.suspended)continue;
    const started=playback.suspensions;
    try {
      const loaded=await refreshWallpaper(tag,playback,applyCopy,player,getShrimpCount,getDrawnBrood,status);
      // Acknowledge a newly applied copy before waiting for the next publication.
      delay=player && loaded!==tag ? 0 : 5000;
      tag=loaded;
      if(delay && tag && status.canWait && started===playback.suspensions){
        delay=0;
        if(!await waitForPublishedCopy(status.waitForFirst?'*':tag,playback))delay=5000;
      }
    } catch(error) {
      if(error?.rejectedWallpaperTag){
        // A complete but unreadable version cannot improve on a second download.
        await waitForWallpaperChange(error.rejectedWallpaperTag,playback,player==='desktop' || player===true,Infinity);
        delay=0;
      }else delay=Math.min(Math.max(5000,delay*2),30000);
    }
    if(started!==playback.suspensions)delay=0;
  }
}

export async function waitForWallpaperRestart(tag,playback,desktopEntry,signal,requiresNewCopy=false) {
  // Limit reload loops from the last navigation, not from a fault late in playback.
  const reloaded=performance.getEntriesByType('navigation')[0]?.type==='reload';
  const retryAt=requiresNewCopy ? Infinity : Math.max(performance.now()+5000,reloaded?60000:0);
  return waitForWallpaperChange(tag,playback,desktopEntry,retryAt,signal);
}

async function waitForWallpaperChange(tag,playback,desktopEntry,retryAt,signal) {
  const headers={'If-None-Match':tag};
  if(desktopEntry)Object.assign(headers,{'X-Aquarium-Load-Failed':'desktop',...screenReceipt});
  for(;;){
    while(playback.suspended && !signal?.aborted)await playback.waitForPoll(0,signal);
    if(signal?.aborted)return false;
    const started=playback.suspensions;
    const request=startWallpaperRequest(playback,signal);
    let waitForRepair=false;
    try {
      const response=await fetch(endpoint,{method:'HEAD',headers,cache:'no-store',signal:request.signal});
      const current=response.headers.get('etag');
      if(!request.signal.aborted && current && (response.ok && current!==tag || response.status===304 && current===tag && performance.now()>=retryAt))return true;
      waitForRepair=retryAt===Infinity && response.status===304 && current===tag && response.headers.get('x-aquarium-can-wait')==='1';
    } catch { /* Keep the loading screen while the service is unavailable. */ }
    finally {request.finish();}
    if(waitForRepair && started===playback.suspensions){
      try {if(await waitForPublishedCopy(tag,playback,signal))continue;}
      catch { /* Use the regular retry interval if the notification connection breaks. */ }
    }
    if(started===playback.suspensions)await playback.waitForPoll(5000,signal);
  }
}

export function installWallpaperSync({button, hint, receipt, broodJournal, getBatch, openBrood, visitButton, updateRoomButton, canVisitRoom, visitRoom, roomStatus, link, download, setup, applyDesktop, screenNumber, previewWindow, thumbnail, publishedCaption, launcher, snapshot, capture, currentLayout, lamp, onPublishedFraming}) {
  if (!['127.0.0.1','localhost','[::1]'].includes(location.hostname)) return;
  button.hidden = false;
  let revision = 0, summaryTag = null;
  let receiptTimer, launchReceipt, publishedLabel='', lastDesktopScene='', syncError=false;
  let pendingDigest;
  let publishedRoom, publishedLayout, publishedNeighbours, publishedBroods, publishedNames, publishedMeal, publishedMealTag, publishedHatches=[];
  let lastReceipt, publishedLight, publishedHardscape, publishedPlants, publishedCount;
  let syncedBrood='';
  let publishedFamilyKey, publishedRoomKey;
  function syncTime(header){
    const at=Date.parse(header);
    return Number.isFinite(at) ? new Date(at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' 同步' : '';
  }
  function localHatchedBatch(){
    if(link.hidden || !publishedFamilyKey || lastReceipt?.get('x-aquarium-desktop-loaded')!=='1')return null;
    const brood=lastReceipt.get('x-aquarium-desktop-brood')?.match(broodReport);
    const batch=brood && getBatch?.(Number(brood[1])-1);
    return batch && batch.size===Number(brood[2]) && wallpaperFamilyKey(batch)===publishedFamilyKey ? batch : null;
  }
  if(broodJournal)broodJournal.onclick=()=>{
    const batch=localHatchedBatch();
    if(batch)openBrood(batch);
    else broodJournal.hidden=true;
  };
  const watching=()=>receipt && !document.hidden && button.getClientRects().length>0;
  let pendingAction=null;
  function showVisitRoom(){
    if(!visitButton && !updateRoomButton)return;
    const available=!link.hidden && publishedRoomKey && canVisitRoom(publishedRoom,publishedRoomKey);
    if(visitButton){
      visitButton.hidden=!available;
      if(available)visitButton.textContent='回游戏照料「'+tankNames[publishedRoom]+'」';
    }
    if(updateRoomButton){
      updateRoomButton.hidden=!available;
      if(available)updateRoomButton.textContent='回到「'+tankNames[publishedRoom]+'」并更新壁纸';
    }
  }
  if(roomStatus)new MutationObserver(showVisitRoom).observe(roomStatus,{childList:true});
  async function visitPublished(sync){
    showVisitRoom();
    if((sync?updateRoomButton:visitButton).hidden || pendingAction)return;
    const room=publishedRoom, key=publishedRoomKey, tag=summaryTag;
    setPendingAction('visit');
    try {await visitRoom(room,sync);}
    catch(error){hint.textContent='换缸未完成：'+error.message;return;}
    finally {setPendingAction(null);showVisitRoom();}
    if(!sync)return;
    if(currentLayout?.()?.roomKey!==key || summaryTag!==tag){
      hint.textContent='壁纸副本或鱼缸已变动。请核对后手动同步。';
    }else await publishCurrent(tag);
    if(watching())button.focus({preventScroll:true});
  }
  if(visitButton)visitButton.onclick=()=>visitPublished(false);
  if(updateRoomButton)updateRoomButton.onclick=()=>visitPublished(true);
  function targetScreen(){
    if(!screenNumber || screenNumber.parentElement.hidden)return 1;
    return screenNumber.validity.valid ? screenNumber.valueAsNumber : null;
  }
  function updateDesktopButton(){
    if(!applyDesktop)return;
    const n=targetScreen();
    applyDesktop.disabled=pendingAction!==null || !n;
    const scene=tankNames[publishedRoom] || '已同步的缸', light=wallpaperScenery(publishedLight);
    applyDesktop.textContent=n?'将「'+scene+'」设为第 '+n+' 屏壁纸'+(light?' · '+light:''):'请输入有效的屏幕序号';
  }
  const screenKey='aquarium.three.wallpaper-screen';
  if(screenNumber){
    try {
      screenNumber.value=gameStorage.getItem(screenKey) ?? screenNumber.defaultValue;
      if(!screenNumber.validity.valid)screenNumber.value=screenNumber.defaultValue;
    } catch { /* Screen selection also works when browser storage is unavailable. */ }
    screenNumber.oninput=()=>{updateDesktopButton();if(lastReceipt)paintReceipt();};
  }
  function setPendingAction(action){
    pendingAction=action;
    for(const control of [button,previewWindow,screenNumber,visitButton,updateRoomButton])if(control)control.disabled=action!==null;
    updateDesktopButton();
  }
  async function openInEngine(control,preview){
    if(pendingAction || !summaryTag || control.hidden || control.disabled)return;
    const tag=summaryTag;
    const n=targetScreen(), target='第 '+n+' 屏';
    if(!preview && !n)return;
    const scene=[tankNames[publishedRoom] || '已同步的缸',wallpaperScenery(publishedLight)].filter(Boolean).join(' · ');
    setPendingAction('launch');
    hint.textContent=preview?'正在请求窗口试播「'+scene+'」…':'正在请求将「'+scene+'」设为'+target+'壁纸…';
    const request=startWallpaperRequest();
    try {
      const headers={'If-Match':tag};
      if(preview && globalThis.screen?.width>0 && screen.height>0){
        const scale=Math.min(1,800/screen.width,600/screen.height);
        headers['X-Aquarium-Preview-Size']=Math.max(1,Math.round(screen.width*scale))+'x'+Math.max(1,Math.round(screen.height*scale));
      }
      if(!preview && n>1)headers['X-Aquarium-Monitor']=String(n-1);
      const response=await fetch(endpoint+(preview?'/preview':n>1?'/apply-monitor':'/apply'),{method:'POST',headers,signal:request.signal});
      if(!await isWallpaperService(response,request))throw Error();
      if(response.status===412){await refreshPublished();hint.textContent='已同步的缸景刚刚更新，请核对新版后再选试播或设置桌面。';}
      else if(response.status===204){
        if(!preview && screenNumber && !screenNumber.parentElement.hidden){
          try {gameStorage.setItem(screenKey,String(n));} catch { /* The request already succeeded. */ }
        }
        launchReceipt={tag,screen:preview?null:n,until:Date.now()+20000};
        checkReceiptLater(0);
        hint.textContent=preview?'已请求窗口试播「'+scene+'」。看完可直接关闭窗口。':'已请求将「'+scene+'」设为'+target+'壁纸。请在该屏查看。';
      }
      else if(response.status===409 && response.headers.get('x-aquarium-monitor-missing')==='1')hint.textContent='未找到'+target+'。请核对已连接的屏幕，或复制下方地址到 Wallpaper Engine 中选屏。';
      else if(response.status===409)hint.textContent=preview?'请先打开 Wallpaper Engine，再点窗口试播。':'请先打开 Wallpaper Engine，再点一次设置按钮。';
      else if(response.status===422)hint.textContent='宿主读不到当前入口路径。请在下方复制壁纸地址，或把下载的 HTML 放在全英文路径再用 Wallpaper Engine 打开。';
      else throw Error();
    } catch {hint.textContent=preview?'暂时无法确认试播窗口是否打开。也可以直接点「预览」在浏览器里看。':'暂时无法确认'+target+'是否已设置。可查看桌面或用下方手动入口。';}
    finally {request.finish();setPendingAction(null);}
  }
  if(previewWindow)previewWindow.onclick=()=>openInEngine(previewWindow,true);
  if(applyDesktop)applyDesktop.onclick=()=>openInEngine(applyDesktop,false);
  function checkReceiptLater(delay=5000){
    clearTimeout(receiptTimer);
    if(watching())receiptTimer=setTimeout(()=>{if(watching())refreshPublished(true);},delay);
  }
  function updateReceipt(response) {
    if(!receipt)return;
    lastReceipt=response?.headers;
    if(launchReceipt){
      const screens=lastReceipt?.get('x-aquarium-desktop-screens');
      const confirmed=launchReceipt.screen===null ? lastReceipt?.get('x-aquarium-preview-loaded')==='1'
        : screens!=null ? screens.split(',').includes(String(launchReceipt.screen)) : lastReceipt?.get('x-aquarium-desktop-loaded')==='1';
      if(link.hidden || launchReceipt.tag!==summaryTag || Date.now()>=launchReceipt.until || confirmed)launchReceipt=null;
    }
    paintReceipt();
    checkReceiptLater(launchReceipt ? 1000 : lastReceipt?.get('x-aquarium-desktop-loaded')==='1' || link.hidden ? 15000 : 5000);
  }
  function neighbourTags(value){
    if(!value)return null;
    try {
      const tags=JSON.parse(value);
      return tags && typeof tags==='object' && !Array.isArray(tags) &&
        Object.entries(tags).every(([id,hash])=>Object.hasOwn(tankNames,id) && Number.isInteger(hash)) ? tags : null;
    } catch { return null; }
  }
  function paintReceipt(){
    receipt.hidden=link.hidden;
    const loaded=lastReceipt?.get('x-aquarium-desktop-loaded')==='1';
    const lastRoom=tankNames[lastReceipt?.get('x-aquarium-last-desktop-room')] || (loaded && tankNames[publishedRoom]);
    const previousLight=lastReceipt?.get('x-aquarium-last-desktop-light');
    const lastLamp=wallpaperScenery(previousLight);
    const lastCount=lastReceipt?.get('x-aquarium-last-desktop-shrimp');
    lastDesktopScene=lastRoom ? ['「'+lastRoom+'」',lastLamp,/^\d+$/.test(lastCount) && lastCount+' 只虾',syncTime(lastReceipt?.get('x-aquarium-last-desktop-modified'))].filter(Boolean).join(' · ') : '';
    const failed=lastReceipt?.get('x-aquarium-desktop-load-failed')==='1';
    const requested=lastReceipt?.get('x-aquarium-desktop-requested')==='1';
    const lastContact=Date.parse(lastReceipt?.get('x-aquarium-last-desktop-contact'));
    let label=link.hidden?'':'已同步 · '+publishedLabel+'\n';
    if(label){
      if(loaded)label+='桌面入口已载入';
      else if(failed)label+=(lastDesktopScene?'桌面切换未成功':'桌面尚未载入')+'，可重新同步缸景，桌面会自动重试';
      else if(requested)label+='桌面已请求「'+(tankNames[publishedRoom] || '这版缸景')+'」，等待画面确认';
      else label+='等待桌面载入';
    }
    const count=lastReceipt?.get('x-aquarium-desktop-shrimp');
    if(label && loaded && count)label+=' · 桌面上次回报 '+count+' 只虾';
    const brood=lastReceipt?.get('x-aquarium-desktop-brood')?.match(broodReport);
    const grown=!!brood && lastReceipt.get('x-aquarium-desktop-adult-brood')===brood[0];
    if(label && loaded && brood)label+=' · 第 '+brood[1]+' 窝'+(grown?'的 '+brood[2]+' 只虾已成年':'已孵化 '+brood[2]+' 只');
    else if(label && syncedBrood)label+=' · '+syncedBrood;
    if(label && !loaded && lastDesktopScene)label+=' · 桌面上次载入'+lastDesktopScene;
    if(label && !loaded && publishedRoom===lastReceipt?.get('x-aquarium-last-desktop-room')){
      const previousRoomKey=lastReceipt.get('x-aquarium-last-desktop-room-key');
      if(publishedRoomKey && previousRoomKey && publishedRoomKey!==previousRoomKey){
        label+='（另一份存档中的同名缸）';
      }else{
        const diff=compareWallpaperLayouts(lastReceipt.get('x-aquarium-last-desktop-layout'),publishedLayout);
        const lampChange=previousLight && publishedLight && previousLight!==publishedLight;
        const neighbourChange=changedWallpaperNeighbours(neighbourTags(lastReceipt.get('x-aquarium-last-desktop-neighbours')),publishedNeighbours);
        const pending=[lampChange && '缸灯（'+(previousLight==='on'?'开 → 关':'关 → 开')+'）',diff?.soil && '底床铺设',diff?.hardscape && '木石布置',diff?.plants && '水草布置或修剪',neighbourChange].filter(Boolean);
        if(pending.length)label+=' · '+pending.join('、')+'尚待桌面确认';
      }
    }
    if(label && Number.isFinite(lastContact)){
      if(Date.now()-lastContact>30000){
        const time=new Date(lastContact).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
        label+=' · 上次联系 '+time+'，尚无新回执';
      }else if(loaded)label+=' · 刚刚联系';
    }
    if(label && lastReceipt?.get('x-aquarium-preview-loaded')==='1')label+=' · 试播窗口已显示过这版缸景';
    else if(label && launchReceipt?.screen===null)label+=' · 试播窗口等待画面确认';
    const screens=lastReceipt?.get('x-aquarium-desktop-screens'), target=targetScreen();
    if(label && screens!=null && screenNumber && !screenNumber.parentElement.hidden && target){
      label+='\n第 '+target+' 屏'+(screens.split(',').includes(String(target))?'已回报载入这版缸景':'尚无这版缸景的回执');
    }
    label+=localChanges();
    if(receipt.textContent!==label)receipt.textContent=label;
    showVisitRoom();
    if(broodJournal){
      const batch=localHatchedBatch();
      broodJournal.hidden=!batch;
      broodJournal.textContent=batch?.status==='complete'?'看这一窝的成年对照':'看这一窝的手记';
    }
  }
  function localChanges(offline=false){
    let label='';
    if(!link.hidden && currentLayout && publishedLayout){
      const current=currentLayout();
      if(current && current.room!==publishedRoom)label+=(offline?'\n游戏当前在「':'\n再次同步将切换到「')+tankNames[current.room]+'」';
      else if(current?.roomKey && publishedRoomKey && current.roomKey!==publishedRoomKey)
        label+=offline?'\n游戏当前打开的是另一份存档中的同名缸':'\n再次同步会换成当前存档的「'+tankNames[current.room]+'」';
      else if(current){
        const hatch=publishedHatches.findLast(([at])=>at<=current.now);
        const layout=hatch?.[1] ?? publishedLayout, names=hatch?.[2] ?? publishedNames;
        const changes=[];
        const diff=compareWallpaperLayouts(layout,current.tag);
        if(publishedLight && current.light && current.light!==publishedLight)changes.push('缸灯（'+(publishedLight==='on'?'开 → 关':'关 → 开')+'）');
        if(diff?.soil)changes.push('底床铺设');
        if(publishedHardscape!==null && Number.isInteger(current.hardscape) && String(current.hardscape)!==publishedHardscape)changes.push('木石（'+publishedHardscape+' → '+current.hardscape+' 件）');
        else if(diff?.hardscape)changes.push('木石布置');
        if(publishedPlants!==null && Number.isInteger(current.plants) && String(current.plants)!==publishedPlants)changes.push('水草（'+publishedPlants+' → '+current.plants+' 株）');
        else if(diff?.plants)changes.push('水草布置或修剪');
        if(diff?.occupants){
          const before=hatch?hatch[3]:publishedCount;
          let detail='';
          if(Number.isInteger(before) && Number.isInteger(current.shrimp)){
            if(before===current.shrimp)detail='（只数相同，成员有变化）';
            else detail=hatch?'（按孵化进度预计 '+before+' 只，本缸 '+current.shrimp+' 只）':'（'+before+' → '+current.shrimp+' 只）';
          }
          changes.push('缸里的虾'+detail);
        }
        if(publishedBroods && current.broods!==publishedBroods)changes.push('繁育安排');
        const neighbourChange=changedWallpaperNeighbours(publishedNeighbours,current.neighbours);
        if(neighbourChange)changes.push(neighbourChange);
        // Moving a named shrimp changes the roster too; report that as a tank change.
        if((diff ? !diff.occupants : current.tag===layout) && names && current.names!==names)changes.push('虾名');
        if(changes.length)label+='\n'+changes.join('、')+(offline?'与上次核对的副本不同':'与上次同步不同，再次同步可更新壁纸');
        else if(current.tag!==layout)label+=offline?'\n本缸与上次核对的副本不同':'\n本缸有改动，再次同步可更新壁纸';
        if(current.meal && (!publishedMeal || publishedMealTag && publishedMealTag!==current.meal))label+=offline?'\n上次核对的副本没有这次加餐':'\n这次加餐尚未同步';
      }
    }
    return label;
  }
  lamp?.addEventListener('click',()=>{
    if(!watching() || link.hidden)return;
    if(lastReceipt)paintReceipt();else paintUnavailable();
  });
  thumbnail.onerror = () => { thumbnail.hidden = true; };
  function paintUnavailable(){
    if(receipt){
      receipt.hidden=false;
      const label=(link.hidden?'':'上次核对的副本 · '+publishedLabel+'\n')+'暂时读不到桌面回执，连接恢复后会自动更新。'+(lastDesktopScene?'上次确认载入'+lastDesktopScene+'。':'')+localChanges(true);
      if(receipt.textContent!==label)receipt.textContent=label;
    }
  }
  function receiptUnavailable(){
    lastReceipt=null;
    if(broodJournal)broodJournal.hidden=true;
    paintUnavailable();
    checkReceiptLater();
  }
  function showPublishedCopy(response, previewJpeg) {
    const overview=response.headers.get('x-aquarium-framing')==='whole-room';
    onPublishedFraming?.(overview);
    publishedRoom=response.headers.get('x-aquarium-room');
    publishedRoomKey=response.headers.get('x-aquarium-room-key');
    publishedLayout=response.headers.get('x-aquarium-layout');
    publishedNeighbours=neighbourTags(response.headers.get('x-aquarium-neighbours'));
    publishedBroods=response.headers.get('x-aquarium-broods');
    publishedFamilyKey=response.headers.get('x-aquarium-family-key');
    publishedNames=response.headers.get('x-aquarium-names');
    publishedHatches=JSON.parse(response.headers.get('x-aquarium-hatches') || '[]');
    const name=tankNames[response.headers.get('x-aquarium-room')], count=response.headers.get('x-aquarium-shrimp');
    publishedCount=/^\d+$/.test(count)?Number(count):null;
    publishedLabel=[name || '壁纸副本',syncTime(response.headers.get('last-modified')),publishedCount!==null && publishedCount+' 只虾'].filter(Boolean).join(' · ');
    const pending=response.headers.get('x-aquarium-pending-brood')?.match(broodReport);
    const hatched=response.headers.get('x-aquarium-hatched-brood')?.match(broodReport);
    const grown=response.headers.get('x-aquarium-grown-brood')?.match(broodReport);
    syncedBrood='';
    if(pending){
      const hatchAt=new Date(Number(response.headers.get('x-aquarium-hatch-at') ?? NaN));
      const when=Number.isFinite(hatchAt.getTime()) ? hatchAt.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' ' : '';
      syncedBrood='同步时第 '+pending[1]+' 窝待孵化，预计 '+when+'孵出 '+pending[2]+' 只';
    }else if(hatched)syncedBrood='同步时第 '+hatched[1]+' 窝的 '+hatched[2]+' 只幼虾都在缸里';
    else if(grown)syncedBrood='同步时第 '+grown[1]+' 窝的 '+grown[2]+' 只虾均已成年，同在这口缸';
    if(publishedCaption)publishedCaption.textContent=['上次同步',publishedLabel,syncedBrood].filter(Boolean).join(' · ');
    publishedMeal=response.headers.get('x-aquarium-feeding')==='1';
    publishedMealTag=response.headers.get('x-aquarium-meal');
    if(publishedMeal)publishedLabel+=' · 同步时有投喂点';
    link.textContent = name ? `预览「${name}」` : '预览已同步的壁纸';
    publishedLight=response.headers.get('x-aquarium-light');
    const lampLabel=wallpaperScenery(publishedLight);
    if(lampLabel)publishedLabel+=' · '+lampLabel;
    publishedHardscape=response.headers.get('x-aquarium-hardscape');
    publishedPlants=response.headers.get('x-aquarium-plants');
    const scenery=wallpaperScenery(publishedLight,publishedHardscape,publishedPlants);
    link.title=[name && /^\d+$/.test(count) ? `${name}（同步时 ${count} 只虾）` : name, overview?'整组缸远景':'整缸远景', scenery].filter(Boolean).join(' · ');
    link.hidden = false;
    showVisitRoom();
    const preview=wallpaperPreviewURL(previewJpeg);
    thumbnail.hidden = !preview;
    if (preview) thumbnail.src = preview;
    else thumbnail.removeAttribute('src');
    if(applyDesktop){
      applyDesktop.hidden=response.headers.get('x-aquarium-can-apply')!=='1';
      if(screenNumber)screenNumber.parentElement.hidden=applyDesktop.hidden || response.headers.get('x-aquarium-can-select-monitor')!=='1';
      updateDesktopButton();
    }
    if(previewWindow){
      previewWindow.hidden=response.headers.get('x-aquarium-can-preview')!=='1';
      previewWindow.textContent='窗口试播「'+(name || '已同步的缸')+'」'+(lampLabel?' · '+lampLabel:'');
    }
    const entry=wallpaperEntry(launcher,location.origin,previewJpeg);
    if (download.href) URL.revokeObjectURL(download.href);
    download.href=URL.createObjectURL(new Blob([entry],{type:'text/html;charset=utf-8'}));
    download.hidden = false;
  }
  // Returning to Observe should allow opening the last copy, even from a different or unfinished tank.
  async function refreshPublished(keepError = false) {
    if (pendingAction==='sync') return;
    const current=++revision;
    const request=startWallpaperRequest();
    try {
      const headers = {'X-Aquarium-Summary':'1'};
      if (summaryTag && !link.hidden) headers['If-None-Match'] = summaryTag;
      if (pendingDigest) headers['X-Aquarium-Verify-Copy']='1';
      const response=await fetch(endpoint,{headers,cache:'no-store',signal:request.signal});
      if (revision!==current) return;
      const firstCopy=link.hidden;
      if (response.status===304 && !link.hidden && summaryTag && response.headers.get('etag')===summaryTag
          && response.headers.has('x-aquarium-desktop-loaded')) {
        updateReceipt(response);
        if(!pendingDigest && !keepError && syncError){hint.textContent='';syncError=false;}
      } else if (response.ok && response.headers.has('etag') && response.headers.has('x-aquarium-room')) {
        const summary=response.headers.get('x-aquarium-summary')==='1' ? await request.read(response,'json') : null;
        if (revision!==current) return;
        showPublishedCopy(response,summary?.previewJpeg);
        summaryTag=response.headers.get('etag');
        updateReceipt(response);
        if (!pendingDigest && (!keepError || !syncError)) {hint.textContent='';syncError=false;}
      } else if (response.status===404 || response.status===422 && response.headers.has('etag')) {
        const known=await isWallpaperService(response,request);
        if(revision!==current)return;
        if(!known){receiptUnavailable();return;}
        summaryTag=response.status===422 ? response.headers.get('etag') : null;
        if(response.status===404)onPublishedFraming?.(false);
        link.hidden=true; download.hidden=true; thumbnail.hidden=true;
        showVisitRoom();
        thumbnail.removeAttribute('src');
        if(publishedCaption)publishedCaption.textContent=summaryTag?'上次同步的副本无法读取':'上次同步';
        if(applyDesktop)applyDesktop.hidden=true;
        if(screenNumber)screenNumber.parentElement.hidden=true;
        if(previewWindow)previewWindow.hidden=true;
        updateReceipt();
        if (download.href) { URL.revokeObjectURL(download.href); download.removeAttribute('href'); }
        if(summaryTag)hint.textContent='上次同步的壁纸副本已损坏。请选择要显示的缸，重新同步即可恢复。';
        else if(pendingDigest)hint.textContent='已连上本机，目前还没有壁纸副本。可以再次同步。';
        else if (!keepError || !syncError) {hint.textContent='还没有壁纸副本。';syncError=false;}
      } else {receiptUnavailable();return;}
      const storedDigest=response.headers.get('x-aquarium-copy-sha256');
      if(pendingDigest && storedDigest && (response.status===304 || response.ok)){
        if(storedDigest===pendingDigest){
          if(setup && firstCopy && !response.headers.has('x-aquarium-last-desktop-room'))setup.open=true;
          hint.textContent='已核对，本机已保存刚才同步的「'+(tankNames[publishedRoom] || '鱼缸')+'」。';
          syncError=false;
          pendingDigest=null;
        }else hint.textContent='已连上本机，当前保存的内容与刚才提交的不同。需要这次改动时可再次同步。';
      }
    } catch { if(revision===current)receiptUnavailable(); }
    finally { request.finish(); }
  }
  if(receipt)document.addEventListener('visibilitychange',()=>{
    if(watching() || !document.hidden && document.body.classList.contains('building'))refreshPublished();
  });
  refreshPublished();
  button.onclick = () => publishCurrent(summaryTag);
  async function publishCurrent(expectedTag){
    if (pendingAction || button.disabled) return;
    ++revision;
    setPendingAction('sync');
    syncError=false;
    pendingDigest=null;
    try {
      const copy = snapshot();
      const roomName=tankNames[copy.game?.session?.BreedingRooms?.activeId] || tankNames.main;
      hint.textContent=`正在同步「${roomName}」…`;
      let body = JSON.stringify(copy), previewJpeg;
      try {
        // A tank which fit before thumbnails must still fit in the 16 MiB envelope.
        const budget=Math.min(90000,16*1024*1024-new Blob([body]).size-20);
        const jpeg = budget>0 && capture(budget);
        if (jpeg && jpeg.length <= budget) {
          previewJpeg = jpeg;
          body = JSON.stringify({...copy,previewJpeg});
        }
      } catch { /* Keep the playable copy when this canvas cannot be captured. */ }
      const request=startWallpaperRequest();
      let res;
      const version=expectedTag ? {'If-Match':expectedTag} : {'If-None-Match':'*'};
      try {
        res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...version},body,signal:request.signal});
        if(res.status===204 && (!res.headers.get('etag') || !res.headers.get('x-aquarium-room')))throw Error('missing wallpaper receipt');
      }
      catch {
        // A lost response can follow a successful write. Keep only its fingerprint while reconnecting.
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
        pendingDigest=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
        throw Error('同步尚未收到确认，连接恢复后会自动核对。');
      }
      finally { request.finish(); }
      if (res.status === 412) throw Error('壁纸副本已变动。请查看当前缸景，想换成这口缸时可再次同步。');
      if (res.status !== 204) throw Error(res.status === 413 ? '鱼缸数据超过 16 MB。' : '本机服务未能保存壁纸副本。');
      if(setup && link.hidden && !res.headers.has('x-aquarium-last-desktop-room'))setup.open=true;
      summaryTag=res.headers.get('etag');
      showPublishedCopy(res,previewJpeg);
      updateReceipt(res);
      hint.textContent = `已同步「${tankNames[res.headers.get('x-aquarium-room')] || roomName}」。`;
      if(res.headers.get('x-aquarium-entry-stale')==='1')hint.textContent+='壁纸入口的等待画面未全部更新，可稍后再同步一次。';
    } catch (error) {
      syncError=true;
      hint.textContent = error.message;
    }
    finally { setPendingAction(null); }
    if(syncError)refreshPublished(true);
  }
  return refreshPublished;
}
