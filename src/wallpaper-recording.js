import {tankNames} from './crystal-breeding.js';

export function wallpaperCaptureName(room,extension,date=new Date()){
  const two=value=>String(value).padStart(2,'0');
  const day=[date.getFullYear(),two(date.getMonth()+1),two(date.getDate())].join('-');
  const time=[date.getHours(),date.getMinutes(),date.getSeconds()].map(two).join('-');
  return room+'-'+day+'_'+time+'.'+extension;
}

export function wallpaperVideoSize(width,height,pixelRatio,textureLimit,smallEncoder=false){
  const longEdge=Math.min(textureLimit,smallEncoder?720:1920);
  const shortEdge=smallEncoder?480:1080;
  const scale=Math.min(pixelRatio,longEdge/Math.max(width,height),shortEdge/Math.min(width,height));
  const even=n=>Math.max(2,2*Math.floor(n*scale/2));
  return [even(width),even(height)];
}

// A MediaRecorder chunk can contain just the MP4 header. Check the finished video itself.
export function hasMultipleVideoFrames(url,checkToEnd=false) {
  const video=document.createElement('video');
  video.muted=true;
  video.playsInline=true;
  return new Promise(resolve=>{
    let settled=false,timer,attempt=0,lastTime=0;
    const multiple=()=>video.getVideoPlaybackQuality?.().totalVideoFrames>=2;
    const abandon=()=>done(false);
    function checkVisible(){
      const current=++attempt;
      clearTimeout(timer);
      if(document.hidden){video.pause();return;}
      timer=setTimeout(abandon,5000);
      video.play().catch(()=>{if(current===attempt)done(false);});
    }
    function done(valid){
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange',checkVisible);
      window.removeEventListener('pagehide',abandon);
      video.ontimeupdate=video.onended=video.onerror=null;
      video.pause();video.removeAttribute('src');video.load();
      resolve(valid);
    }
    video.ontimeupdate=()=>{
      if(!checkToEnd && multiple()){done(true);return;}
      if(checkToEnd && !document.hidden && video.currentTime>lastTime){
        lastTime=video.currentTime;
        clearTimeout(timer);timer=setTimeout(abandon,5000);
      }
    };
    video.onended=()=>done(multiple());
    video.onerror=()=>done(false);
    video.src=url;
    if(checkToEnd)video.playbackRate=4;
    document.addEventListener('visibilitychange',checkVisible);
    window.addEventListener('pagehide',abandon);
    checkVisible();
  });
}

export function installWallpaperRecording({canvas, button, discard, download, hint, unavailable, roomId, setRecording = () => {}}) {
  const smallEncoderType='video/mp4;codecs=avc1.42E01E';
  const type = ['video/mp4;codecs=avc1', smallEncoderType]
    .find(value => globalThis.MediaRecorder?.isTypeSupported(value));
  if (!type || !canvas.captureStream) {
    button.disabled = true;
    hint.textContent = '此浏览器无法录制 H.264 壁纸，请用支持录制 MP4 的桌面浏览器。';
    return;
  }
  let active = null, url = null;
  const idleLabel = button.textContent;
  async function finish(session, error) {
    if (active !== session || session.finishing) return;
    session.finishing=true;
    // A capture track can end without a recorder error or a stop request from the game.
    if(!session.requestedStop && !session.interruption)session.interruption='画面采集已提前结束';
    const checkToEnd=session.encoderInterrupted || !session.requestedStop;
    const returnFocus=document.activeElement===discard;
    discard.hidden=true;
    clearTimeout(session.timer);
    session.stream.getTracks().forEach(track => track.stop());
    setRecording(false);
    button.disabled = true;
    let next;
    try {
      if(error){hint.textContent=error;return;}
      if(session.chunks.length){
        button.textContent='正在生成视频…';
        hint.textContent=session.interruption ? session.interruption+'，正在检查已录片段。' : '正在检查已录片段。';
        next=URL.createObjectURL(new Blob(session.chunks,{type:'video/mp4'}));
      }
      const multiple=next && await hasMultipleVideoFrames(next,checkToEnd);
      if(session.reason || !multiple){
        hint.textContent=session.reason || (session.interruption
          ? session.interruption+(checkToEnd?'，这次的片段未通过播放检查。':'，这次没有足够的连续画面。')+(url?'上次的视频仍可保存。':'画面恢复后可重新录制。')
          : '未能确认录到了连续画面，请保持游戏可见并重新录制。');
        return;
      }
      if(url)URL.revokeObjectURL(url);
      download.href=url=next;
      next=null;
      download.download=session.filename;
      download.textContent='保存「'+session.room+'」的 MP4';
      download.hidden=false;
      hint.textContent=(session.interruption?session.interruption+'，已保留此前录下的片段。':'录制完成。')+'保存 MP4 后，可在 Wallpaper Engine 中作为本地视频壁纸打开。';
    } catch {
      hint.textContent=session.reason || '未能生成可播放的 MP4，请重新录制。';
    } finally {
      if(next)URL.revokeObjectURL(next);
      active=null;
      button.disabled=false;
      button.textContent=idleLabel;
      if(returnFocus && !document.hidden && document.activeElement===document.body)button.focus({preventScroll:true});
    }
  }
  function stop(reason) {
    if (!active) return;
    if(reason)active.reason = reason;
    if(active.finishing || active.recorder.state==='inactive')return;
    button.disabled = true;
    active.requestedStop=true;
    active.recorder.stop();
  }
  discard.onclick=()=>stop(url ? '已放弃本次录制，上次的视频仍可保存。' : '已放弃本次录制，可以重新开始。');
  button.onclick = () => {
    if (active) {
      if (active.chunks.length>=2) stop();
      else {
        active.stopAfterChunk = true;
        button.disabled = true;
        hint.textContent = '正在等连续画面，录到后会自动结束。';
      }
      return;
    }
    const reason = unavailable();
    if (reason) { hint.textContent = reason; return; }
    let stream;
    try {
      setRecording(true,type===smallEncoderType);
      stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, {mimeType:type, videoBitsPerSecond:8000000});
      const id=roomId(),room=tankNames[id] || tankNames.main;
      const session = {stream, recorder, chunks:[], id, room, filename:wallpaperCaptureName('aquarium-'+id,'mp4')};
      active = session;
      recorder.ondataavailable = e => {
        if (active !== session || !e.data.size) return;
        session.chunks.push(e.data);
        if (session.stopAfterChunk && session.chunks.length>=2) stop();
      };
      recorder.onstop = () => finish(session, session.reason);
      recorder.onerror = event => {
        if(active!==session || session.finishing)return;
        if(event?.error?.name==='SecurityError'){
          stop('录制权限已中断，本次片段无法保存。');return;
        }
        session.encoderInterrupted=true;
        session.interruption='视频录制中断';
        // The recorder may still deliver its final bytes before the stop event.
        stop();
      };
      recorder.start(500);
      discard.hidden=false;
      session.timer = setTimeout(() => stop(), 30000);
      button.textContent = '结束并保留片段';
      hint.textContent = '正在录制「'+room+'」'+canvas.width+'×'+canvas.height+' 整缸远景，30 秒后结束。请保持此页可见。';
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      active = null;
      setRecording(false);
      hint.textContent = '无法开始录制：' + error.message;
    }
  };
  document.addEventListener('visibilitychange', () => {
    if(document.hidden)checkRecording('页面已切到后台');
  });
  window.addEventListener('pagehide', () => stop('页面已关闭，本次录制已取消。'));
  function checkRecording(interruption){
    if(active?.recorder.state==='recording' && (interruption || active.id!==roomId() || unavailable())){
      active.interruption=interruption || '观察已中断';
      stop();
    }
  }
  return checkRecording;
}
