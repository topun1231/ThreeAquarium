import test from 'node:test';
import assert from 'node:assert/strict';
import {installWallpaperRecording,wallpaperVideoSize,wallpaperCaptureName} from '../src/wallpaper-recording.js';

test('整缸留影和视频用本地拍摄时间及来源缸命名',()=>{
  const midnight=new Date(2026,0,2,0,3,4);
  assert.equal(wallpaperCaptureName('繁育缸','png',midnight),'繁育缸-2026-01-02_00-03-04.png');
  assert.equal(wallpaperCaptureName('aquarium-main','mp4',midnight),'aquarium-main-2026-01-02_00-03-04.mp4');
});

test('壁纸视频沿用屏幕比例和像素密度，同时满足编码尺寸限制',()=>{
  assert.deepEqual(wallpaperVideoSize(1920,1080,2,8192),[1920,1080]);
  assert.deepEqual(wallpaperVideoSize(1080,1920,1,8192),[1080,1920]);
  assert.deepEqual(wallpaperVideoSize(853,481,1,8192),[852,480]);
  assert.deepEqual(wallpaperVideoSize(640,360,1.5,8192),[960,540]);
  assert.deepEqual(wallpaperVideoSize(3840,1080,1,1024),[1024,288]);
  assert.deepEqual(wallpaperVideoSize(1080,1920,2,8192,true),[404,720]);
});

test('壁纸录制中断时保留上次成片并释放轨道，可以再次录制', async t => {
  const document = new EventTarget(), window = new EventTarget();
  let frames=2, video,finalChunk='video';
  document.createElement=()=>video={getVideoPlaybackQuality:()=>({totalVideoFrames:frames}),play:()=>Promise.resolve(),pause(){},removeAttribute(){},load(){}};
  const button = {textContent:'录制动态壁纸'}, discard={hidden:true}, hint = {}, download = {hidden:true};
  let stoppedTracks = 0, reason = '尚未注水', recorder;
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { recorder = this; }
    start(interval) { assert.ok(interval>0); this.state = 'recording'; }
    chunk(value) { this.ondataavailable({data:new Blob([value])}); }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({data:new Blob([finalChunk])});
      this.onstop();
    }
  }
  for (const [key, value] of Object.entries({document, window, MediaRecorder:Recorder})) {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {configurable:true, value});
    t.after(() => before ? Object.defineProperty(globalThis, key, before) : delete globalThis[key]);
  }
  let capturing=false, failCapture=false;
  const canvas = {captureStream:() => {
    assert.equal(capturing,true);
    if(failCapture)throw Error('无法捕获画面');
    return {getTracks:() => [{stop:() => stoppedTracks++}]};
  }};
  let room='main';
  const checkRecording=installWallpaperRecording({canvas, button, discard, download, hint, roomId:()=>room, unavailable:() => reason, setRecording:value=>{capturing=value;}});
  button.onclick();
  assert.equal(hint.textContent, reason);
  assert.equal(recorder, undefined);
  assert.equal(capturing,false);
  reason = '';
  button.onclick(); button.onclick();
  assert.equal(button.disabled,true);
  recorder.chunk('');
  assert.equal(recorder.state,'recording');
  recorder.chunk('first');
  assert.equal(recorder.state,'recording','one chunk may only hold a header or a single frame');
  recorder.chunk('second');
  assert.equal(recorder.state,'inactive');
  assert.equal(capturing,false);
  assert.equal(download.hidden,true);
  video.onended();await Promise.resolve();
  const first = download.href;
  assert.equal((await (await fetch(first)).blob()).type, 'video/mp4');
  assert.equal(download.hidden, false);
  assert.equal(download.textContent,'保存「我的造景缸」的 MP4');
  assert.match(download.download,/^aquarium-main-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.mp4$/);
  button.onclick(); button.onclick();
  frames=1;
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(download.href, first);
  assert.equal(capturing,false);
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  video.onended();await Promise.resolve();
  assert.equal(download.href,first);
  assert.match(hint.textContent,/后台.*没有足够.*上次的视频/);
  button.onclick();
  recorder.state='inactive';
  recorder.onerror();
  recorder.chunk('incomplete-tail');
  recorder.onstop();
  frames=2;video.ontimeupdate();await Promise.resolve();
  assert.equal(download.href,first,'two early frames cannot validate an interrupted encoder');
  assert.equal(button.disabled,true);
  video.onerror();await Promise.resolve();
  assert.equal(download.href, first);
  assert.match(hint.textContent,/未通过播放检查.*上次的视频仍可保存/);
  assert.equal(stoppedTracks, 3);
  assert.equal(capturing,false);
  failCapture=true;button.onclick();
  assert.equal(capturing,false);
  assert.equal(download.href,first);
  failCapture=false;
  frames=1;
  button.onclick(); recorder.chunk('first'); recorder.chunk('second'); button.onclick();
  video.onended();await Promise.resolve();
  assert.equal(download.href,first);
  assert.match(hint.textContent,/连续画面/);
  frames=2;
  button.onclick(); recorder.chunk('first'); recorder.chunk('second'); button.onclick();
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(download.href,first);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));
  video.onended();await Promise.resolve();
  const validated=download.href;
  assert.notEqual(validated,first,'切换标签不应放弃已结束且能解码的录像');
  await assert.rejects(fetch(first));
  button.onclick(); recorder.chunk('first'); recorder.chunk('second'); checkRecording();
  assert.equal(recorder.state,'recording');
  room='breeding';checkRecording();
  assert.equal(recorder.state,'inactive');
  video.ontimeupdate();await Promise.resolve();
  assert.match(download.download,/^aquarium-main-.*\.mp4$/);
  assert.match(hint.textContent,/保留此前/);
  assert.notEqual(download.href, validated);
  await assert.rejects(fetch(validated));
  const previous=download.href;
  frames=1;
  button.onclick();checkRecording('显卡画面中断');video.onended();await Promise.resolve();
  assert.equal(download.href,previous,'刚开始便失去画面时保留上次有效成片');
  assert.equal(capturing,false);
  assert.equal(button.disabled,false);
  button.onclick();assert.equal(discard.hidden,false);
  button.onclick();assert.equal(button.disabled,true);
  discard.onclick();
  assert.equal(discard.hidden,true);assert.equal(button.disabled,false);
  assert.equal(download.href,previous);assert.match(hint.textContent,/放弃.*仍可保存/);
  finalChunk='';
  button.onclick();checkRecording('预看已定格');
  assert.equal(download.href,previous);
  assert.match(hint.textContent,/预看已定格.*上次的视频仍可保存/);
  assert.ok((await (await fetch(previous)).blob()).size);
  frames=2;button.onclick();
  recorder.state='inactive';recorder.onerror();
  recorder.chunk('usable final bytes');
  recorder.onstop();video.onended();await Promise.resolve();
  const recovered=download.href;
  assert.notEqual(recovered,previous);
  assert.equal(await (await fetch(recovered)).text(),'usable final bytes');
  assert.match(hint.textContent,/中断.*保留此前/);
  button.onclick();recorder.chunk('truncated');recorder.state='inactive';recorder.onstop();
  video.ontimeupdate();await Promise.resolve();
  assert.equal(button.disabled,true,'source ended silently: early frames do not prove the tail is decodable');
  video.onerror();await Promise.resolve();
  assert.equal(download.href,recovered);
  assert.match(hint.textContent,/画面采集已提前结束.*未通过播放检查.*上次的视频仍可保存/);
  button.onclick();recorder.chunk('private');recorder.onerror({error:{name:'SecurityError'}});
  assert.equal(download.href,recovered);
  assert.match(hint.textContent,/权限已中断/);
  URL.revokeObjectURL(recovered);
});
