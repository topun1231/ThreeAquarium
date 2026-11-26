import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {engineLauncher,wallpaperService} from '../tools/wallpaper-service.mjs';
import {createNewCrystalProgress} from '../src/crystal-progress.js';
import {applyBreedingAction} from '../src/crystal-breeding.js';
import {crystalColony} from '../src/crystal-rooms.js';
import {changedWallpaperNeighbours,tankGeometryKey,wallpaperBroodTag,wallpaperFamilyKey,wallpaperJournalBrood,wallpaperLayoutTag,wallpaperNamesTag,wallpaperNeighbourTags,wallpaperRoomKey} from '../src/wallpaper-layout.js';
import {growFlora,makeFloraRecord,pruneFlora,sanitizeFlora} from '../src/flora.js';
import {createWallpaperPlayback,followWallpaper,installWallpaperSync,loadWallpaperCopy,refreshWallpaper,waitForWallpaperRestart,wallpaperPreviewURL} from '../src/live-wallpaper.js';
import {readAsset,readTexture,setWallpaperAssetStatus} from '../src/asset-read.js';

test('宿主用稳定英文路径转入原始中文入口，保留独立试播与桌面入口',async t=>{
  const base=[tmpdir(),process.cwd()].find(path=>!/[^\x00-\x7f]/.test(path));
  if(!base)return t.skip('requires a writable ASCII directory for a native launcher');
  const dir=await mkdtemp(join(base,'aquarium-path-'));
  t.after(()=>rm(dir,{recursive:true}));
  const plain=join(dir,'room.html'),first=join(dir,'ascii'),fallback=join(dir,'other');
  assert.equal(await engineLauncher(plain,[]),plain);
  const tank=join(dir,'鱼缸 & #1'),source=join(tank,'preview.html');
  await mkdir(tank);
  await writeFile(source,'first still');
  const [entry,other]=await Promise.all([engineLauncher(source,[first]),engineLauncher(source,[first])]);
  assert.equal(other,entry);
  assert.doesNotMatch(entry,/[^\x00-\x7f]/);
  assert.equal(await readFile(entry,'utf8'),'first still');
  await writeFile(join(tank,'new.tmp'),'new still');
  await rename(join(tank,'new.tmp'),source);
  assert.equal(await readFile(entry,'utf8'),'new still');
  assert.notEqual(await engineLauncher(join(tank,'desktop.html'),[first]),entry);
  const occupied=join(dir,basename(dirname(entry)));
  await writeFile(occupied,'unrelated file');
  assert.equal(dirname(dirname(await engineLauncher(source,[dir,fallback]))),fallback);
  assert.equal(await readFile(occupied,'utf8'),'unrelated file');
  await assert.rejects(engineLauncher(source,[join(dir,'中文'),dir]),{code:'WALLPAPER_ENTRY_PATH'});
});

test('已同步的缸只能在同一游戏找到，换缸与更换灯光后仍能认出',()=>{
  const main={UniqueId:'窗边/主缸'},nursery={UniqueId:'crystal-breeding'};
  const breeding={contests:{cards:[{id:'colour-entry',seed:0}]}};
  const session=(activeId,active,otherId,other)=>({Tank:active,Breeding:breeding,BreedingRooms:{activeId,rooms:[{id:otherId,session:{Tank:other}}]}});
  const before=session('breeding',nursery,'main',main),after=session('main',main,'breeding',nursery);
  const key=wallpaperRoomKey(before);
  assert.ok(key && /^[\x21-\x7e]+$/.test(key));
  nursery.Environment={LightOn:false};
  assert.equal(wallpaperRoomKey(after,'breeding'),key);
  assert.notEqual(wallpaperRoomKey(after),key);
  assert.equal(wallpaperRoomKey(after,'breeding-3'),null);
  assert.equal(wallpaperRoomKey({Tank:main}),null);
  breeding.contests.cards[0].seed=1;
  assert.notEqual(wallpaperRoomKey(after,'breeding'),key);
});

test('壁纸手记优先等本缸即将孵化的一窝，否则选仍在缸里一起长大的最近一窝',()=>{
  const brood=(status,ids)=>({status,tankId:'main',size:2,children:ids.map(id=>({id}))});
  const batches=[brood('hatched',['A','B']),brood('hatched',['C','D']),brood('complete',['E','F'])];
  const session={Breeding:{batches}};
  assert.equal(wallpaperJournalBrood(session,['A','B','C','D','E','F']),1);
  assert.equal(wallpaperJournalBrood(session,['A','B','D']),0);
  assert.equal(wallpaperJournalBrood(session,['A','D','E','F']),2,'同步时整窝已成年也能回到手记');
  assert.equal(wallpaperJournalBrood(session,['A','D','E']),-1,'分缸后不把这一窝当成整窝在场');
  batches.push(brood('complete',['G','H']));
  assert.equal(wallpaperJournalBrood(session,['E','F','G','H']),3);
  batches.push({...brood('formed',[]),tankId:'breeding'});
  assert.equal(wallpaperJournalBrood(session,['A','B']),0);
  batches.push(brood('planned',[]));
  assert.equal(wallpaperJournalBrood(session,['A','B']),5);
});

test('载入中的留影只采用副本内的限长 JPEG 数据',()=>{
  for(const value of [undefined,null,{},'','https://example.invalid/preview','/9j/" alt="','/9j/'+'A'.repeat(90000)])
    assert.equal(wallpaperPreviewURL(value),'');
  assert.equal(wallpaperPreviewURL('/9j/2Q=='),'data:image/jpeg;base64,/9j/2Q==');
});

test('绘图恢复与宿主暂停独立，恢复后从零帧间隔重新播放',async t=>{
  const playback=createWallpaperPlayback(),changes=[];
  playback.onSuspensionChange(suspended=>changes.push(suspended));
  t.mock.timers.enable({apis:['setTimeout']});
  assert.equal(playback.frameDelta(0),0);
  playback.setContextLost(true);
  let polled=false;
  const waiting=playback.waitForPoll(10).then(()=>{polled=true;});
  playback.setPaused(true);playback.setHidden(true);playback.setContextLost(false);
  playback.setHidden(false);
  t.mock.timers.tick(1000);await Promise.resolve();
  assert.equal(polled,false);assert.equal(playback.frameDelta(1000),null);
  playback.setContextLost(true);playback.setPaused(false);
  assert.equal(playback.suspended,true);
  playback.setContextLost(false);await waiting;
  assert.deepEqual(changes,[true,false]);assert.equal(playback.frameDelta(9000),0);
});

test('低帧率壁纸在两帧间休眠，调速或恢复只预约一次绘制',t=>{
  const playback=createWallpaperPlayback(),queue=new Map(),elapsed=[];
  let id=0,now=0;
  t.mock.timers.enable({apis:['setTimeout']});
  t.mock.method(performance,'now',()=>now);
  const oldRequest=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame=cb=>{queue.set(++id,cb);return id;};
  globalThis.cancelAnimationFrame=key=>queue.delete(key);
  t.after(()=>{
    if(oldRequest)globalThis.requestAnimationFrame=oldRequest;else delete globalThis.requestAnimationFrame;
    if(oldCancel)globalThis.cancelAnimationFrame=oldCancel;else delete globalThis.cancelAnimationFrame;
  });
  function vsync(at=now){assert.equal(queue.size,1);const [key,cb]=queue.entries().next().value;queue.delete(key);cb(at);}
  function advance(ms){now+=ms;t.mock.timers.tick(ms);}
  playback.applyGeneralProperties({fps:1});
  playback.startFrames(at=>elapsed.push(playback.frameDelta(at)));
  vsync();advance(900);assert.equal(queue.size,0);
  advance(100);vsync();assert.deepEqual(elapsed,[0,1]);
  advance(100);playback.applyGeneralProperties({fps:30});vsync();
  advance(17);vsync();
  assert.equal(queue.size,1,'30 fps on a 60 Hz display needs no additional timer');
  advance(17);vsync();
  advance(7);vsync();
  advance(6);assert.equal(queue.size,0,'30 fps can sleep over intermediate high-refresh ticks');
  playback.setPaused(true);playback.setHidden(true);
  advance(2000);assert.equal(queue.size,0);
  playback.setPaused(false);assert.equal(queue.size,0);
  playback.setHidden(false);vsync();assert.deepEqual(elapsed,[0,1,0,null,.034,null,0]);
  const queued=now+34;
  advance(4500);vsync(queued);assert.equal(elapsed.at(-1),0);
  playback.applyGeneralProperties({fps:1});vsync();
  playback.setContextLost(true);advance(2000);assert.equal(queue.size,0);
  let attempts=0;
  playback.startFrames(at=>{assert.equal(playback.frameDelta(at),0);return ++attempts===3;});
  playback.setContextLost(false);vsync();
  advance(499);assert.equal(queue.size,0);
  advance(1);vsync();advance(999);assert.equal(queue.size,0);
  playback.setPaused(true);advance(5000);assert.equal(queue.size,0);
  playback.setPaused(false);vsync();assert.equal(attempts,3);
});

test('壁纸暂停和隐藏重叠时停止轮询，最后一个限制解除才恢复',async t=>{
  const playback=createWallpaperPlayback(), changes=[];
  playback.onSuspensionChange(value=>changes.push(value));
  t.mock.timers.enable({apis:['setTimeout']});
  let checks=0;
  const pending=playback.waitForPoll(5000).then(()=>{checks++;});
  playback.setPaused(true);playback.setPaused(true);playback.setHidden(true);
  t.mock.timers.tick(30000);await Promise.resolve();assert.equal(checks,0);
  playback.setPaused(false);assert.equal(playback.suspended,true);
  t.mock.timers.tick(30000);await Promise.resolve();assert.equal(checks,0);
  playback.setHidden(false);await pending;assert.equal(checks,1);
  assert.deepEqual(changes,[true,false]);
  playback.setHidden(true);
  const asleep=playback.waitForPoll(5000).then(()=>{checks++;});
  t.mock.timers.tick(30000);await Promise.resolve();assert.equal(checks,1);
  playback.setHidden(false);await asleep;
  const ordinary=playback.waitForPoll(5000).then(()=>{checks++;});
  t.mock.timers.tick(4999);await Promise.resolve();assert.equal(checks,2);
  t.mock.timers.tick(1);await ordinary;assert.equal(checks,3);
});

test('壁纸启动时重读临时中断的资源，正常游戏和非必需文件保留原错误',async t=>{
  t.after(()=>setWallpaperAssetStatus(null));
  const status={},network=new TypeError('connection interrupted');
  const request=t.mock.method(globalThis,'fetch',async()=>{throw network;});
  await assert.rejects(readAsset('/asset'),error=>error===network);
  setWallpaperAssetStatus(status,createWallpaperPlayback());
  request.mock.mockImplementationOnce(async()=>new Response(null,{status:503}));
  request.mock.mockImplementation(async(url,options)=>{
    assert.equal(options.cache,'reload');return new Response('{"ready":true}');
  });
  assert.deepEqual(await readAsset('/asset'),{ready:true});
  assert.match(status.textContent,/重试/);
  request.mock.mockImplementation(async()=>new Response(null,{status:404}));
  await assert.rejects(readAsset('/missing'),/404/);
  request.mock.mockImplementation(async()=>new Response('{'));
  await assert.rejects(readAsset('/bad-json'),SyntaxError);
  let source;
  const policies=[];
  request.mock.mockImplementation(async(_url,options)=>{policies.push(options.cache);return new Response('picture');});
  const loader={async loadAsync(url){
    assert.match(url,/^blob:/);
    if(!source){source=url;throw new Error('cached image did not decode');}
    assert.notEqual(url,source);return 'decoded';
  }};
  assert.equal(await readTexture(loader,'/image'),'decoded');
  assert.deepEqual(policies,['default','reload']);
  policies.length=0;
  await assert.rejects(readTexture({loadAsync(){throw Error('bad image');}},'/image'),/bad image/);
  assert.deepEqual(policies,['default','reload']);
});

test('壁纸启动所需贴图缺失及连续解码失败后，恢复宿主才再次读取',async t=>{
  const playback=createWallpaperPlayback(), status={}, policies=[], urls=[];
  setWallpaperAssetStatus(status,playback);t.after(()=>setWallpaperAssetStatus(null));
  t.mock.timers.enable({apis:['setTimeout']});
  t.mock.method(globalThis,'fetch',async (_url,{cache})=>{
    policies.push(cache);
    return policies.length===1 ? new Response(null,{status:404}) : new Response('texture');
  });
  const {resolveObjectURL}=await import('node:buffer');
  const result=readTexture({loadAsync(url){
    urls.push(url);
    if(urls.length<=2)throw Error('image incomplete');
    return 'decoded';
  }},'/assets/shell.webp',undefined,true);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush();assert.match(status.textContent,/shell\.webp/);
  t.mock.timers.tick(1500);await flush();assert.equal(urls.length,2);
  playback.setPaused(true);t.mock.timers.tick(60000);await flush();
  assert.deepEqual(policies,['default','reload','reload']);
  playback.setPaused(false);assert.equal(await result,'decoded');
  assert.deepEqual(policies,['default','reload','reload','reload']);
  assert.ok(urls.every(url=>!resolveObjectURL(url)));
});

test('桌面等待必需的场景文件恢复，同一副本可跨越缺文件和半份 JSON',async t=>{
  const status={}, delays=[], policies=[];
  const responses=[new Response(null,{status:404}), new Response('{"half":'), new Response('{"ready":true}')];
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    policies.push(options?.cache);
    return responses.shift() ?? new Response(null,{status:403});
  });
  setWallpaperAssetStatus(status,{...createWallpaperPlayback(),waitForPoll:async delay=>delays.push(delay)});
  t.after(()=>setWallpaperAssetStatus(null));
  const url='/assets/behavior.json';
  assert.deepEqual(await readAsset(url),{ready:true});
  assert.deepEqual(delays,[1500,3000]);
  assert.deepEqual(policies,['default','reload','reload']);
  assert.match(status.textContent,/behavior\.json/);
  await assert.rejects(readAsset(url),/403/);
  setWallpaperAssetStatus(null);
  responses.push(new Response(null,{status:404}));
  await assert.rejects(readAsset(url),/404/);
});

test('大模型持续传输可超过十五秒，中途断流时整份重读',async t=>{
  const playback=createWallpaperPlayback();
  setWallpaperAssetStatus({},playback);t.after(()=>setWallpaperAssetStatus(null));
  t.mock.timers.enable({apis:['setTimeout']});
  let stream,signal,attempts=0;
  t.mock.method(globalThis,'fetch',async (_url,options)=>{
    attempts++;signal=options.signal;
    if(attempts===2){assert.equal(options.cache,'reload');return new Response(Uint8Array.of(4,5));}
    return new Response(new ReadableStream({start(controller){
      stream=controller;signal.addEventListener('abort',()=>stream.error(signal.reason),{once:true});
    }}));
  });
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const pending=readAsset('/model','arrayBuffer');await flush();
  for(const value of [1,2,3]){
    t.mock.timers.tick(10000);assert.equal(signal.aborted,false);
    stream.enqueue(Uint8Array.of(value));await flush();
  }
  t.mock.timers.tick(15000);await flush();
  assert.ok(signal.aborted);assert.equal(attempts,1);
  t.mock.timers.tick(1500);
  assert.deepEqual([...new Uint8Array(await pending)],[4,5]);assert.equal(attempts,2);
});

test('播放中首次使用的模型和贴图在暂停时取消，卡住的资源退出本次同步',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const seen=[];
  t.mock.method(globalThis,'fetch',async (url,{signal})=>{
    seen.push(signal);
    return new Response(new ReadableStream({start(out){
      out.enqueue(Uint8Array.of(1));
      signal.addEventListener('abort',()=>out.error(signal.reason),{once:true});
    }}));
  });
  const apply=new AbortController();
  const geometry=readAsset('/model','arrayBuffer',false,apply.signal);
  const texture=readTexture({loadAsync(){assert.fail('incomplete image decoded');}},'/texture',apply.signal);
  await new Promise(resolve=>setImmediate(resolve));
  apply.abort();
  await Promise.all([geometry,texture].map(p=>assert.rejects(p,e=>e===apply.signal.reason)));
  assert.equal(seen.length,2);
  assert.ok(seen.every(s=>s.aborted));
  const retry=new AbortController(), stalled=readAsset('/model','arrayBuffer',false,retry.signal);
  await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(15000);
  await assert.rejects(stalled,{name:'AbortError'});
  assert.equal(retry.signal.aborted,false);
});

test('首次载入和播放中换缸均允许完整副本缓慢分段抵达',async t=>{
  const copy={version:4,view:{},game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}}};
  const bytes=new TextEncoder().encode(JSON.stringify(copy)), playback=createWallpaperPlayback();
  t.mock.timers.enable({apis:['setTimeout']});
  let stream,signal,reads=0,applied;
  t.mock.method(globalThis,'fetch',async (_url,options)=>{
    reads++;signal=options.signal;
    return new Response(new ReadableStream({start(controller){
      stream=controller;signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});
    }}),{headers:{etag:'new'}});
  });
  for(const first of [true,false]){
    const pending=first?loadWallpaperCopy({},playback):refreshWallpaper('old',playback,c=>{applied=c;});
    for(let i=0;i<3;i++){
      await new Promise(resolve=>setImmediate(resolve));
      t.mock.timers.tick(8000);
      assert.equal(signal.aborted,false);
      assert.equal(applied,undefined);
      stream.enqueue(bytes.slice(i*20,i===2?undefined:(i+1)*20));
    }
    stream.close();
    if(first)assert.deepEqual(await pending,{tag:'new',copy});
    else {assert.equal(await pending,'new');assert.deepEqual(applied,copy);}
  }
  assert.equal(reads,2);
});

test('贴图等待响应时暂停会中止下载，恢复后只解码完整图片并释放地址',async t=>{
  const playback=createWallpaperPlayback();
  setWallpaperAssetStatus({},playback);t.after(()=>setWallpaperAssetStatus(null));
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0,firstSignal,source;
  t.mock.method(globalThis,'fetch',async (_url,{signal})=>{
    if(++calls===1){
      firstSignal=signal;
      return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    }
    return new Response('picture',{headers:{'Content-Type':'image/webp'}});
  });
  const {resolveObjectURL}=await import('node:buffer');
  const pending=readTexture({async loadAsync(url){
    source=url;const blob=resolveObjectURL(url);
    assert.equal(blob.type,'image/webp');return blob.text();
  }},'/texture');
  playback.setPaused(true);assert.ok(firstSignal.aborted);
  await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(30000);assert.equal(calls,1);assert.equal(source,undefined);
  playback.setPaused(false);assert.equal(await pending,'picture');
  assert.equal(resolveObjectURL(source),undefined);
});

test('壁纸后台冷启动和失败重试都等到宿主恢复才发请求',async t=>{
  const playback=createWallpaperPlayback(),status={},reads=[];
  setWallpaperAssetStatus(status,playback);
  t.after(()=>setWallpaperAssetStatus(null));
  t.mock.timers.enable({apis:['setTimeout']});
  const copy={version:4,view:{},game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}}};
  t.mock.method(globalThis,'fetch',async url=>{
    reads.push(url);
    if(url==='/scene' && reads.filter(r=>r===url).length===1)return new Response(null,{status:503});
    return Response.json(url==='/scene' ? {} : copy);
  });
  playback.setHidden(true);
  const first=loadWallpaperCopy(status,playback);
  const image=readTexture({loadAsync(url){assert.match(url,/^blob:/);return 'decoded';}},'/leaf');
  const scene=readAsset('/scene');
  t.mock.timers.tick(30000);assert.deepEqual(reads,[]);
  playback.setHidden(false);
  await first;await image;
  assert.match(status.textContent,/重试/);
  playback.setPaused(true);playback.setHidden(true);
  t.mock.timers.tick(30000);playback.setPaused(false);
  await Promise.resolve();
  assert.deepEqual(reads.slice().sort(),['/api/wallpaper','/leaf','/scene']);
  playback.setHidden(false);await scene;
  assert.deepEqual(reads.filter(r=>r==='/scene'),['/scene','/scene']);
});

test('壁纸副本读取卡住时启动会重试，播放中暂停可中止半截响应',async t=>{
  const playback=createWallpaperPlayback(),status={},oldTag='"old"',newTag='"new"';
  const copy={version:4,view:{},game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}}};
  t.mock.timers.enable({apis:['setTimeout']});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  let phase='startup',requests=0,bodyStarted=false;
  const stalled=signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  t.mock.method(globalThis,'fetch',async (_url,{signal})=>{
    requests++;
    if(phase==='startup')return stalled(signal);
    if(phase==='partial')return {ok:true,headers:new Headers({etag:newTag}),json(){bodyStarted=true;return stalled(signal);}};
    return Response.json(copy,{headers:{etag:newTag}});
  });
  const first=loadWallpaperCopy(status,playback);
  t.mock.timers.tick(15000);await flush();
  assert.match(status.textContent,/等待本机/);
  phase='available';t.mock.timers.tick(5000);
  assert.equal((await first).tag,newTag);assert.equal(requests,2);
  phase='partial';
  const refresh=()=>refreshWallpaper(oldTag,playback,()=>assert.fail('incomplete copy applied'));
  const pending=refresh();await flush();assert.ok(bodyStarted);
  playback.setPaused(true);assert.equal(await pending,oldTag);
  playback.setPaused(false);
  const slow=refresh();await flush();
  const timedOut=assert.rejects(slow,{name:'AbortError'});
  t.mock.timers.tick(15000);await timedOut;
  phase='available';let applied;
  assert.equal(await refreshWallpaper(oldTag,playback,value=>{applied=value;}),newTag);
  assert.deepEqual(applied,copy);
});

test('首次响应跨过暂停时，恢复后首个副本取自最新发布',async t=>{
  for(const stage of ['headers','body']){
    await t.test(stage,async t=>{
      const playback=createWallpaperPlayback(),copy={version:4,view:{},game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}}};
      let reads=0,requests=0;
      function pauseAndResume(){
        playback.setHidden(true);playback.setPaused(true);
        playback.setHidden(false);playback.setPaused(false);
      }
      t.mock.method(globalThis,'fetch',async()=>{
        const first=++requests===1;
        if(first && stage==='headers')pauseAndResume();
        return {ok:true,headers:new Headers({etag:first?'old':'new'}),json:async()=>{
          reads++;
          if(first && stage==='body')pauseAndResume();
          return copy;
        }};
      });
      const result=await loadWallpaperCopy({},playback);
      assert.equal(result.tag,'new');assert.equal(requests,2);
      assert.equal(reads,stage==='headers'?1:2);
    });
  }
});

test('启动时按响应来源区分服务暂失、尚无副本和真正损坏的缸景',async t=>{
  const playback=createWallpaperPlayback(),status={},messages=[];
  const known={'x-aquarium-service':'three-aquarium-wallpaper'};
  const copy={version:4,game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}},view:{}};
  const replies=[new Response(null,{status:404}),new Response('<html>starting</html>',{headers:{etag:'same'}}),
    new Response(null,{status:404,headers:known}),new Response('{',{headers:known}),Response.json(copy,{headers:{etag:'same'}})];
  playback.waitForPoll=async()=>{messages.push(status.textContent);assert.ok(messages.length<=4,'player stayed on the waiting screen');};
  t.mock.method(globalThis,'fetch',async(url,{method})=>{
    if(url.endsWith('/health'))return new Response('<html>starting</html>');
    assert.notEqual(method,'HEAD','a foreign version must not park the player waiting for a new version');
    return replies.shift();
  });
  assert.deepEqual(await loadWallpaperCopy(status,playback),{copy,tag:'same'});
  assert.match(messages[0],/等待本机/);assert.match(messages[1],/等待本机/);
  assert.match(messages[2],/同步到实时壁纸/);assert.match(messages[3],/副本无法读取/);
});

test('播放中遇到其他网页时仍保留旧缸，同样的版本标记随后可接入真正副本',async t=>{
  const playback=createWallpaperPlayback(),copy={version:4,view:{},game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}}};
  const headers={etag:'reused-tag'};
  const responses=[new Response('<html>starting</html>',{headers}),new Response('<html>not health</html>'),Response.json(copy,{headers})];
  t.mock.method(globalThis,'fetch',async()=>responses.shift());
  await assert.rejects(refreshWallpaper('old',playback,()=>assert.fail('foreign page applied')),error=>
    !error.rejectedWallpaperTag && /等待本机/.test(error.message));
  let applied;
  assert.equal(await refreshWallpaper('old',playback,value=>{applied=value;}),'reused-tag');
  assert.deepEqual(applied,copy);
});

test('壁纸等候重新同步时只下载一次损坏副本，断线后仍能接到新缸',async t=>{
  const playback=createWallpaperPlayback(), status={}, requests=[];
  let waitingMessage;
  playback.waitForPoll=async()=>{};
  const copy={version:4,view:{},game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}}};
  t.mock.method(globalThis,'fetch',async(_url,{headers,method='GET'})=>{
    requests.push({method,headers});
    if(requests.length===1)return {ok:true,headers:new Headers({etag:'"bad"'}),json:async()=>{throw Error('stream interrupted');}};
    if(requests.length===2)return new Response('{',{headers:{etag:'"bad"','x-aquarium-service':'three-aquarium-wallpaper'}});
    if(requests.length===3)throw TypeError('offline');
    if(requests.length===4)return new Response(null,{status:304});
    if(method==='HEAD')return new Response(null,{headers:{etag:'"fixed"'}});
    waitingMessage=status.textContent;
    return Response.json(copy,{headers:{etag:'"fixed"'}});
  });
  assert.equal((await loadWallpaperCopy(status,playback,true)).tag,'"fixed"');
  assert.match(waitingMessage,/重新同步/);
  assert.deepEqual(requests.map(r=>r.method),['GET','GET','HEAD','HEAD','HEAD','GET']);
  for(const {method,headers} of requests){
    assert.deepEqual(headers,method==='HEAD'
      ? {'If-None-Match':'"bad"','X-Aquarium-Load-Failed':'desktop'}
      : {'X-Aquarium-Player':'desktop'});
  }
});

test('较慢的旧副本查询不能覆盖刚同步的缸名，重开观察能看到其他窗口的新副本',async t=>{
  const previous=globalThis.location;
  globalThis.location=new URL('http://127.0.0.1:5174');
  t.after(()=>{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;});
  const result=(room,n,status)=>new Response(null,{status,headers:{etag:'"copy"','x-aquarium-room':room,'x-aquarium-shrimp':String(n)}});
  let release,reads=0;
  const overview=[];
  t.mock.method(globalThis,'fetch',async (_url,{method})=>{
    if(method==='POST'){
      const res=result('breeding',2,204);res.headers.set('x-aquarium-follow',encodeURIComponent('小枫'));
      res.headers.set('x-aquarium-framing','whole-room');return res;
    }
    if(++reads===1)return new Promise(resolve=>{release=resolve;});
    return result('main',10,200);
  });
  const button={},hint={},link={hidden:true},download={hasAttribute:()=>true},thumbnail={removeAttribute(){delete this.src;}};
  const launcher=await readFile(new URL('../wallpaper/index.html',import.meta.url),'utf8');
  const refresh=installWallpaperSync({button,hint,link,download,thumbnail,launcher,snapshot:()=>({}),capture:()=>'/9j/2Q==',onPublishedFraming:value=>overview.push(value)});
  await button.onclick();
  release(result('main',7,200)); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(link.textContent,'预览「繁育缸」');
  assert.match(link.title,/繁育缸（同步时 2 只虾） · 整组缸远景/);
  assert.deepEqual(overview,[true]);
  assert.doesNotMatch(link.textContent,/跟随/);
  assert.equal(thumbnail.src,'data:image/jpeg;base64,/9j/2Q==');
  const first=download.href;
  const {resolveObjectURL}=await import('node:buffer');
  assert.match(await resolveObjectURL(first).text(),/data-aquarium-preview src="data:image\/jpeg;base64,\/9j\/2Q=="/);
  await refresh();
  assert.equal(link.textContent,'预览「我的造景缸」');
  assert.deepEqual(overview,[true,false]);
  assert.match(link.title,/我的造景缸（同步时 10 只虾）/);
  assert.doesNotMatch(link.textContent,/跟随/);
  assert.equal(thumbnail.hidden,true);
  assert.equal(resolveObjectURL(first),undefined);
  assert.doesNotMatch(await resolveObjectURL(download.href).text(),/data-aquarium-preview src=/);
});

test('同步中的提示跟随点击时的鱼缸，失败时保留已发布入口，副本移除后清除回执', async t=>{
  const previous=globalThis.location;
  globalThis.location=new URL('http://127.0.0.1:5174');
  t.after(()=>{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;});
  let room='main', release, published;
  const receipt=(room,status)=>new Response(null,{status,headers:{etag:'"'+room+'"','x-aquarium-room':room,'x-aquarium-shrimp':'4'}});
  t.mock.method(globalThis,'fetch',async (_url,init)=>{
    if(init.method==='POST')return new Promise(resolve=>{release=resolve;});
    if(_url.endsWith('/health'))return Response.json({service:'three-aquarium-wallpaper'});
    return published ? receipt(published,200) : new Response(null,{status:404});
  });
  const button={},hint={},setup={open:false},link={hidden:true},thumbnail={removeAttribute(){}},download={removeAttribute(){delete this.href;}};
  const refresh=installWallpaperSync({button,hint,link,download,setup,thumbnail,launcher:'',capture:()=>null,
    snapshot:()=>({game:{session:{BreedingRooms:{activeId:room}}}})});
  let pending=button.onclick();
  published='main'; release(receipt(published,204)); await pending;
  assert.equal(setup.open,true);
  setup.open=false;
  room='breeding'; pending=button.onclick(); room='main';
  assert.match(hint.textContent,/正在同步.*繁育缸/);
  assert.match(link.textContent,/我的造景缸/);
  published='breeding';release(receipt(published,204));await pending;
  assert.equal(setup.open,false,'leave the setup closed when the player syncs again');
  assert.match(hint.textContent,/已同步.*繁育缸/);
  pending=button.onclick();release(new Response(null,{status:204}));await pending;
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(hint.textContent,/尚未收到确认/);assert.match(link.textContent,/繁育缸/);
  pending=button.onclick();release(new Response(null,{status:503}));await pending;
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(hint.textContent,/未能保存/);assert.match(link.textContent,/繁育缸/);
  published=null;await refresh();
  assert.equal(link.hidden,true);assert.equal(download.hidden,true);assert.doesNotMatch(hint.textContent,/已同步|未能保存/);
});

test('换缸同步与宿主启动互斥，同名旧版本被替换后要重新选择',async t=>{
  const previous=globalThis.location;
  globalThis.location=new URL('http://127.0.0.1:5174');
  t.after(()=>{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;});
  let tag='one',room='main',lamp='on',finish,service='three-aquarium-wallpaper';
  const posts=[];
  const summary=status=>new Response(null,{status,headers:{etag:tag,'x-aquarium-room':room,'x-aquarium-light':lamp,
    'x-aquarium-can-preview':'1','x-aquarium-can-apply':'1'}});
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    if(url.endsWith('/health'))return Response.json({service});
    if(init.method!=='POST')return summary(200);
    posts.push([url,init.headers['If-Match']]);
    return new Promise(resolve=>{finish=resolve;});
  });
  const button={},hint={},link={},download={},previewWindow={},applyDesktop={},thumbnail={removeAttribute(){}};
  t.after(()=>{if(download.href)URL.revokeObjectURL(download.href);});
  const refresh=installWallpaperSync({button,hint,link,download,previewWindow,applyDesktop,thumbnail,launcher:'',snapshot:()=>({}),capture:()=>null});
  await refresh();
  const sync=button.onclick();
  assert.ok(previewWindow.disabled && applyDesktop.disabled);
  await previewWindow.onclick();await applyDesktop.onclick();
  tag='two';room='breeding';finish(summary(204));await sync;
  const launch=previewWindow.onclick();
  assert.ok(button.disabled && applyDesktop.disabled);
  await button.onclick();
  tag='three';lamp='off';finish(new Response(null,{status:412}));await launch;
  assert.match(hint.textContent,/更新/);
  assert.match(previewWindow.textContent,/繁育缸.*缸灯关/);
  assert.equal(button.disabled,false);assert.equal(applyDesktop.disabled,false);
  const retry=applyDesktop.onclick();finish(new Response(null,{status:204}));await retry;
  assert.deepEqual(posts,[['/api/wallpaper','one'],['/api/wallpaper/preview','two'],['/api/wallpaper/apply','three']]);
  assert.match(hint.textContent,/已请求将/);
  const fallback=previewWindow.onclick();finish(new Response('<html></html>'));await fallback;
  assert.match(hint.textContent,/无法确认试播/);
  service='other';
  const foreign=applyDesktop.onclick();finish(new Response(null,{status:204}));await foreign;
  assert.match(hint.textContent,/无法确认第 1 屏/);
});

test('有其他桌面回执时也及时等待实际试播和目标屏幕',async t=>{
  const oldLocation=globalThis.location,oldDocument=globalThis.document;
  globalThis.location=new URL('http://127.0.0.1:5174');
  globalThis.document={hidden:false,addEventListener(){}};
  t.after(()=>{
    if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  });
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const tick=async ms=>{t.mock.timers.tick(ms);await new Promise(resolve=>setImmediate(resolve));};
  let preview=false, screens='1', reads=0;
  t.mock.method(globalThis,'fetch',async(_url,{method,headers})=>{
    if(method==='POST')return new Response(null,{status:204,headers:{'x-aquarium-service':'three-aquarium-wallpaper'}});
    reads++;
    const metadata={etag:'"scene"','x-aquarium-room':'main','x-aquarium-can-preview':'1','x-aquarium-can-apply':'1',
      'x-aquarium-can-select-monitor':'1','x-aquarium-desktop-loaded':'1','x-aquarium-desktop-screens':screens};
    if(preview)metadata['x-aquarium-preview-loaded']='1';
    return new Response(null,{status:headers['If-None-Match']?304:200,headers:metadata});
  });
  const button={getClientRects:()=>[{}]},hint={},receipt={},link={hidden:true},download={},thumbnail={removeAttribute(){}};
  const previewWindow={},applyDesktop={},screenNumber={validity:{valid:true},valueAsNumber:2,defaultValue:'2',parentElement:{}};
  t.after(()=>{if(download.href)URL.revokeObjectURL(download.href);});
  const refresh=installWallpaperSync({button,hint,receipt,link,download,previewWindow,applyDesktop,screenNumber,thumbnail,launcher:''});
  await refresh();
  const before=reads;
  await previewWindow.onclick();
  await tick(0);
  assert.equal(reads,before+1);
  assert.match(receipt.textContent,/试播窗口等待画面确认/);
  preview=true;await tick(1000);
  assert.match(receipt.textContent,/试播窗口已显示过这版缸景/);
  await applyDesktop.onclick();
  await tick(0);
  assert.match(receipt.textContent,/第 2 屏尚无这版缸景的回执/);
  screens='1,2';await tick(1000);
  assert.match(receipt.textContent,/第 2 屏已回报载入这版缸景/);
  const done=reads;
  await tick(1000);
  assert.equal(reads,done,'return to ordinary polling after both confirmations');
  preview=false;
  await previewWindow.onclick();await tick(0);
  assert.match(receipt.textContent,/等待画面确认/);
  await tick(20000);
  assert.doesNotMatch(receipt.textContent,/试播窗口等待画面确认/);
  const expired=reads;
  await tick(1000);
  assert.equal(reads,expired,'revert to ordinary polling when the trial does not report');
});

test('同步回包丢失后按完整副本确认，其他页面发布同一口缸也不能冒认',async t=>{
  const previous=globalThis.location;
  globalThis.location=new URL('http://127.0.0.1:5174');
  t.after(()=>{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;});
  const button={},hint={},link={hidden:true},download={},thumbnail={removeAttribute(){}};
  let posts=0, checks=0, body, stored='a different copy', version='old';
  t.mock.method(globalThis,'fetch',async(_url,init)=>{
    if(init.method==='POST'){posts++;body=init.body;throw new TypeError('reply lost');}
    const headers={etag:version,'x-aquarium-room':'main','x-aquarium-desktop-loaded':'0'};
    if(init.headers['X-Aquarium-Verify-Copy']){checks++;headers['x-aquarium-copy-sha256']=createHash('sha256').update(stored).digest('hex');}
    return new Response(null,{status:init.headers['If-None-Match']===version?304:200,headers});
  });
  const refresh=installWallpaperSync({button,hint,link,download,thumbnail,launcher:'',capture:()=>null,snapshot:()=>({note:'窗边的缸'})});
  await refresh();
  await button.onclick();await new Promise(resolve=>setImmediate(resolve));
  assert.match(hint.textContent,/内容与刚才提交的不同/);
  stored=body;version='new';await refresh(true);
  assert.match(hint.textContent,/已核对.*我的造景缸/);
  await refresh(true);assert.equal(checks,2);assert.equal(posts,1);
  URL.revokeObjectURL(download.href);
});

test('壁纸造景标记识别移动石头与同数量换虾，忽略游动顺序及日常生长',()=>{
  const tank={Hardscape:[{Position:{x:0,y:0,z:0}}],Plants:[{UniqueId:'p',Growth:.2}]};
  const original=wallpaperLayoutTag(tank,['a','b']);
  tank.Plants[0].Growth=.3;
  assert.equal(wallpaperLayoutTag(tank,['b','a']),original);
  assert.notEqual(wallpaperLayoutTag(tank,['c','a']),original);
  tank.Hardscape[0].Position.x=.1;
  assert.notEqual(wallpaperLayoutTag(tank,['a','b']),original);
});

test('复用壁纸场景要求实际几何一致，独立于灯态和生态时钟',()=>{
  const tank={UniqueId:'same-room',Setup:{Filled:true},Environment:{LightOn:true},
    Substrate:{Heightfield:{QuantizedHeights:[1,2]}},Hardscape:[{UniqueId:'rock',Rotation:{y:0}}],
    Plants:[{UniqueId:'stem',TypeId:'plant-a',Stage:2,Growth:.8,Position:{x:.1},Cuts:[]}],
    Flora:[{UniqueId:'rotala',Species:'rotala',Variant:0,Nodes:12.1,X:0,Z:.1,Yaw:0,Scale:1,Hue:0}]};
  const original=tankGeometryKey(tank);
  tank.Environment.LightOn=false;tank.Plants[0].EcologicalAgeSeconds=1000;tank.Flora[0].Nodes=12.75;
  assert.equal(tankGeometryKey(tank),original);
  for(const change of [
    t=>{t.UniqueId='different-room';},
    t=>{t.Substrate.Heightfield.QuantizedHeights[1]=0;},
    t=>{t.Hardscape[0].Rotation.y=2;},
    t=>{t.Plants[0].Position.x=.12;},
    t=>{t.Plants[0].Growth=.81;},
    t=>{t.Plants[0].Cuts.push({HeightFraction:.4});},
    t=>{t.Flora[0].Nodes=13;},
  ]){
    const changed=structuredClone(tank);change(changed);
    assert.notEqual(tankGeometryKey(changed),original);
  }
  tank.Plants[0].Cuts.push({HeightFraction:.4,EcologicalAgeAtCut:900});
  const cut=tankGeometryKey(tank);
  tank.Plants[0].EcologicalAgeSeconds++;
  assert.notEqual(tankGeometryKey(tank),cut);
});

test('桌面副本检测邻缸造景、灯态、注水和扩缸，日常生长或当前缸不混入提示',()=>{
  const tank={UniqueId:'a',Setup:{Filled:false},Environment:{LightOn:true},Plants:[{UniqueId:'stem',Growth:1}]};
  const session={Tank:{},BreedingRooms:{activeId:'main',rooms:[{id:'breeding',session:{Tank:tank}}]}};
  const tags=()=>wallpaperNeighbourTags(session), saved=tags();
  tank.Plants[0].Growth=2;session.Tank.Setup={Filled:true};
  assert.deepEqual(tags(),saved);
  tank.Environment.LightOn=false;
  assert.equal(changedWallpaperNeighbours(saved,tags()),'邻缸布置（繁育缸）');
  delete tank.Environment.LightOn;
  assert.deepEqual(tags(),saved);
  tank.Setup.Filled=true;
  assert.equal(changedWallpaperNeighbours(saved,tags()),'邻缸布置（繁育缸）');
  const wet=tags();
  tank.Plants[0].Position={x:.2};
  assert.notEqual(tags().breeding,wet.breeding);
  session.BreedingRooms.rooms.unshift({id:'breeding-2',session:{Tank:{...tank,UniqueId:'b'}}});
  const expanded=tags();
  assert.equal(changedWallpaperNeighbours(saved,expanded),'新增邻缸（第二繁育缸）、邻缸布置（繁育缸）');
  assert.equal(changedWallpaperNeighbours(expanded,saved),'减少邻缸（第二繁育缸）、邻缸布置（繁育缸）');
  session.BreedingRooms.rooms.push({id:'breeding-3',session:{Tank:{...tank,UniqueId:'c'}}});
  assert.equal(changedWallpaperNeighbours(expanded,tags()),'新增邻缸（第三繁育缸）');
  assert.equal(changedWallpaperNeighbours(expanded,expanded),'');
  assert.equal(changedWallpaperNeighbours(null,tags()),'');
});

test('邻缸副本标记包含待落位的居民，落位或动作本身不会提示再次同步',()=>{
  const tank={UniqueId:'origin',Setup:{Filled:true}};
  const state={Breeding:{individuals:[{id:'I1',tank:'breeding',soldAt:null},{id:'I2',tank:'rest',soldAt:null}]},
    BreedingRooms:{activeId:'main',rooms:[{id:'breeding',session:{Tank:tank}}],
      creatures:[{CreatureId:'I1',Position:{x:0}},{CreatureId:'I2',Position:{x:0}}],unseated:['I1']}};
  const pending=wallpaperNeighbourTags(state);
  state.BreedingRooms.unseated=[];
  const seated=wallpaperNeighbourTags(state);
  assert.deepEqual(seated,pending);
  state.BreedingRooms.creatures[0].Position.x=.1;
  assert.deepEqual(wallpaperNeighbourTags(state),seated);
  state.Breeding.individuals[0].soldAt=100;
  assert.notEqual(wallpaperNeighbourTags(state).breeding,pending.breeding);
});

test('剪草及撤销改变壁纸标记，读档与自然长高不改变标记',()=>{
  const plant=makeFloraRecord({id:'stem',species:'rotala',variant:0,x:0,z:0});
  const tank={Flora:[plant]}, tag=()=>wallpaperLayoutTag(tank,[]);
  const original=tag(), before=structuredClone(plant);
  pruneFlora(plant,8,120);
  const cut=tag();
  assert.notEqual(cut,original);
  growFlora(tank.Flora,86400*10);
  tank.Flora=sanitizeFlora(JSON.parse(JSON.stringify(tank.Flora)));
  assert.equal(tag(),cut);
  pruneFlora(tank.Flora[0],8,864120);
  assert.notEqual(tag(),cut);
  tank.Flora=sanitizeFlora([before]);
  assert.equal(tag(),original);
  assert.throws(()=>sanitizeFlora([{...before,LastTrim:{At:120,Nodes:-1}}]),/修剪记录/);
});

test('壁纸按出生缸比较繁育安排，保留孵化时钟并忽略正常成长',()=>{
  const session={BreedingRooms:{activeId:'main'},Breeding:{batches:[]},Colony:{shrimp:{I1:{name:'小枫'}}}};
  const tag=()=>wallpaperBroodTag(session), empty=tag(), names=wallpaperNamesTag(session);
  const batch={id:'b',motherId:'I1',fatherId:'I2',size:2,tankId:'main',formedAt:2,hatchAt:10,adultAt:50,status:'planned'};
  session.Breeding.batches.push(batch);
  const paired=tag();assert.notEqual(paired,empty);
  batch.status='cancelled';assert.equal(tag(),empty);
  for(const status of ['formed','hatched','complete']){batch.status=status;assert.equal(tag(),paired);}
  batch.relocations=[{at:12,to:'breeding'}];assert.equal(tag(),paired);
  batch.relocations=[{at:5,to:'breeding'}];assert.equal(tag(),empty);
  session.BreedingRooms.activeId='breeding';assert.equal(tag(),paired);
  session.Colony.shrimp.I1.ageDays=60;assert.equal(wallpaperNamesTag(session),names);
  session.Colony.shrimp.I1.name='朝露';assert.notEqual(wallpaperNamesTag(session),names);
});

test('打开的观察面板持续显示最新同步的缸、时间和桌面回执',async t=>{
  const oldLocation=globalThis.location, oldDocument=globalThis.document;
  globalThis.location=new URL('http://127.0.0.1:5174');
  globalThis.document={hidden:false,addEventListener(){}};
  t.after(()=>{
    if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  });
  t.mock.timers.enable({apis:['setTimeout']});
  const tick=async ms=>{t.mock.timers.tick(ms);await new Promise(resolve=>setImmediate(resolve));};
  let room=null, loaded=false, reads=0, contact, reachable=true, failed=false, requested=false, lastLayout, lastNeighbours;
  const tank={Substrate:{Depth:1},Hardscape:[{Position:{x:0}}],Plants:[{Position:{x:0}}]};
  const occupants=['I1','I2'], saved=wallpaperLayoutTag(tank,occupants);
  const family={id:'b',plannedAt:20,motherId:'m',fatherId:'f',size:2,status:'hatched',children:[{id:'kid1',B:[5,5,5]},{id:'kid2',B:[6,6,6]}]};
  const familyKey=wallpaperFamilyKey(family), broodJournal={};
  let foreign=null;
  let localBatch=family, opened=null, lastRoomKey;
  t.mock.method(globalThis,'fetch',async(_url,{headers})=>{
    reads++;
    if(!reachable)throw new TypeError('service unavailable');
    if(foreign!==null)return new Response(null,{status:foreign,headers:{etag:foreign===304?room:'unrelated-file'}});
    if(!room)return new Response(null,{status:404,headers:{'x-aquarium-service':'three-aquarium-wallpaper'}});
    const result={etag:room,'last-modified':new Date(2026,10,19,10,23,41).toUTCString(),'x-aquarium-room':room,'x-aquarium-desktop-loaded':loaded?'1':'0'};
    if(loaded)result['x-aquarium-desktop-brood']='3/2';
    if(loaded && adultReceipt)result['x-aquarium-desktop-adult-brood']=adultReceipt;
    if(contact)result['x-aquarium-last-desktop-contact']=contact;
    if(lastLayout)result['x-aquarium-last-desktop-layout']=lastLayout;
    if(lastNeighbours)result['x-aquarium-last-desktop-neighbours']=lastNeighbours;
    if(lastRoomKey)result['x-aquarium-last-desktop-room-key']=lastRoomKey;
    if(failed)result['x-aquarium-desktop-load-failed']='1';
    if(requested)result['x-aquarium-desktop-requested']='1';
    if(headers['If-None-Match']!==room){
      result['x-aquarium-room-key']='save-a:'+room;
      result['x-aquarium-shrimp']=room==='breeding'?'2':'0';
      result['x-aquarium-layout']=room==='breeding'?saved:'123';
      result['x-aquarium-neighbours']='{"main":1}';
      result['x-aquarium-family-key']=familyKey;
      if(room==='main'){
        result['x-aquarium-pending-brood']='3/2';
        result['x-aquarium-hatch-at']=String(new Date(2026,10,19,10,35).getTime());
      }else result['x-aquarium-hatched-brood']='2/4';
      if(room==='breeding')result['x-aquarium-names']='original-names';
      result['x-aquarium-light']='on';
      result['x-aquarium-feeding']='1';
      result['x-aquarium-meal']='t100';
      result['x-aquarium-hardscape']=room==='breeding'?'1':'0';
      result['x-aquarium-plants']=room==='breeding'?'1':'6';
      result['x-aquarium-hatches']=JSON.stringify(room==='breeding'?[[200,wallpaperLayoutTag(tank,[...occupants,'kid1','kid2']),'with-names',4]]:[[200,'with-babies','with-names']]);
    }
    if(room==='breeding'){
      result['x-aquarium-last-desktop-room']=loaded || lastLayout?'breeding':'main';
      result['x-aquarium-last-desktop-light']=loaded?'on':'off';
      result['x-aquarium-last-desktop-modified']=new Date(2026,10,19,9,18,12).toUTCString();
      result['x-aquarium-last-desktop-shrimp']='0';
    }
    return new Response(null,{status:headers['If-None-Match']===room?304:200,headers:result});
  });
  let adultReceipt;
  const button={getClientRects:()=>[{}]}, receipt={}, link={hidden:true}, download={}, hint={};
  const current={room:'main',tag:'123',light:'on',hardscape:0,plants:6}, lamp=new EventTarget();
  installWallpaperSync({button,receipt,hint,link,download,lamp,broodJournal,getBatch:i=>i===2 && localBatch,openBrood:b=>{opened=b;},thumbnail:{removeAttribute(){}},launcher:'',currentLayout:()=>current});
  await tick(0);
  assert.equal(receipt.hidden,true);
  room='main';await tick(15000);
  assert.match(receipt.textContent,/已同步 · 我的造景缸.*:23:41 同步.*\n等待桌面载入/);
  assert.match(receipt.textContent,/同步 · 0 只虾/);
  assert.match(receipt.textContent,/同步时第 3 窝待孵化，预计 .*10:35 孵出 2 只/);
  const savedEntry=download.href;
  for(foreign of [404,200,304,422]){
    await tick(5000);
    assert.match(receipt.textContent,/暂时读不到桌面回执/);
    assert.equal(link.hidden,false);
    assert.equal(download.href,savedEntry);
  }
  foreign=null;
  loaded=true;await tick(5000);
  assert.match(receipt.textContent,/我的造景缸.*\n桌面入口已载入/);
  assert.match(receipt.textContent,/第 3 窝已孵化 2 只/);
  assert.doesNotMatch(receipt.textContent,/待孵化/);
  assert.equal(broodJournal.hidden,false);
  adultReceipt='2/2';await tick(15000);
  assert.match(receipt.textContent,/第 3 窝已孵化 2 只/);
  adultReceipt='3/2';await tick(15000);
  assert.match(receipt.textContent,/第 3 窝的 2 只虾已成年/);
  assert.equal(broodJournal.textContent,'看这一窝的手记');
  localBatch={...family,children:[{...family.children[0],B:[8,5,5]},family.children[1]]};
  broodJournal.onclick();
  assert.equal(opened,null,'another save with the same brood number must not open');
  assert.equal(broodJournal.hidden,true);
  localBatch={...family,status:'complete'};
  lamp.dispatchEvent(new Event('click'));
  assert.equal(broodJournal.hidden,false);
  broodJournal.onclick();
  assert.equal(opened,localBatch);
  assert.equal(broodJournal.textContent,'看这一窝的成年对照');
  const beforeLight=reads;
  current.roomKey='save-b:main';
  lamp.dispatchEvent(new Event('click'));
  assert.match(receipt.textContent,/再次同步会换成当前存档的「我的造景缸」/);
  current.roomKey='save-a:main';
  Object.assign(current,{tag:'changed',light:'off',hardscape:2,plants:5});
  lamp.dispatchEvent(new Event('click'));
  assert.match(receipt.textContent,/缸灯（开 → 关）.*木石（0 → 2 件）.*水草（6 → 5 株）/);
  Object.assign(current,{tag:'123',light:'on',hardscape:0,plants:6});
  lamp.dispatchEvent(new Event('click'));
  assert.doesNotMatch(receipt.textContent,/再次同步|有改动/);
  assert.equal(reads,beforeLight);
  current.meal='t120';await tick(15000);
  assert.match(receipt.textContent,/这次加餐尚未同步/);
  current.meal='t100';await tick(15000);
  assert.doesNotMatch(receipt.textContent,/这次加餐尚未同步/);
  Object.assign(current,{now:200,tag:'with-babies',names:'with-names'});await tick(15000);
  assert.doesNotMatch(receipt.textContent,/有改动|与上次同步不同/);
  current.names='renamed';await tick(15000);
  assert.match(receipt.textContent,/虾名与上次同步不同/);
  current.now=199;
  current.tag='124';await tick(15000);
  assert.match(receipt.textContent,/本缸有改动/);
  room='breeding';loaded=false;await tick(15000);
  assert.match(receipt.textContent,/同步时第 2 窝的 4 只幼虾都在缸里/);
  assert.doesNotMatch(receipt.textContent,/待孵化/);
  assert.match(receipt.textContent,/繁育缸.*缸灯开.*\n等待桌面载入.*桌面上次载入「我的造景缸」 · 缸灯关 · 0 只虾/);
  assert.doesNotMatch(receipt.textContent,/已孵化/);
  assert.equal(broodJournal.hidden,true);
  assert.match(receipt.textContent,/再次同步将切换到「我的造景缸」/);
  requested=true;await tick(5000);
  assert.match(receipt.textContent,/桌面已请求「繁育缸」，等待画面确认.*桌面上次载入「我的造景缸」/);
  assert.doesNotMatch(receipt.textContent,/已孵化|桌面入口已载入/);
  failed=true;await tick(5000);
  assert.match(receipt.textContent,/桌面切换未成功.*重试.*桌面上次载入「我的造景缸」/);
  reachable=false;await tick(5000);
  assert.match(receipt.textContent,/暂时读不到桌面回执.*上次确认载入「我的造景缸」/);
  lamp.dispatchEvent(new Event('click'));assert.match(receipt.textContent,/暂时读不到桌面回执/);
  reachable=true;failed=false;
  lastLayout=wallpaperLayoutTag({...tank,Hardscape:[{Position:{x:.25}}]},occupants);
  await tick(5000);
  assert.match(receipt.textContent,/木石布置尚待桌面确认/);
  assert.match(receipt.textContent,/桌面上次载入[^\n]*09:18:12 同步/);
  assert.match(receipt.textContent,/缸灯（关 → 开）、木石布置尚待桌面确认/);
  lastNeighbours='{"main":0}';await tick(5000);
  assert.match(receipt.textContent,/邻缸布置（我的造景缸）尚待桌面确认/);
  lastRoomKey='save-b:breeding';await tick(5000);
  assert.match(receipt.textContent,/另一份存档中的同名缸/);
  assert.doesNotMatch(receipt.textContent,/木石布置尚待桌面确认/);
  current.roomKey=lastRoomKey='save-a:breeding';
  Object.assign(current,{room:'breeding',tag:saved,names:'original-names',hardscape:1,plants:1});
  loaded=true;await tick(5000);
  assert.doesNotMatch(receipt.textContent,/尚待桌面确认/);
  assert.match(receipt.textContent,/繁育缸.*\n桌面入口已载入/);
  assert.doesNotMatch(receipt.textContent,/我的造景缸/);
  tank.Hardscape[0].Burial=.003;
  assert.equal(wallpaperLayoutTag(tank,occupants),saved,'legacy burial defaults to the current placement depth');
  tank.Substrate.Depth++;
  tank.Plants[0].Position.x=.12;
  tank.Hardscape[0].Position.x=.2;
  current.tag=wallpaperLayoutTag(tank,occupants);
  current.names='renamed';
  lamp.dispatchEvent(new Event('click'));
  assert.match(receipt.textContent,/底床铺设、木石布置、水草布置或修剪、虾名与上次同步不同/);
  current.tag=wallpaperLayoutTag(tank,['I2','I3']);
  lamp.dispatchEvent(new Event('click'));
  assert.match(receipt.textContent,/缸里的虾与上次同步不同/);
  assert.doesNotMatch(receipt.textContent,/虾名/);
  current.shrimp=2;lamp.dispatchEvent(new Event('click'));
  assert.match(receipt.textContent,/只数相同，成员有变化/);
  current.tag=wallpaperLayoutTag(tank,['I2']);current.shrimp=1;lamp.dispatchEvent(new Event('click'));
  assert.match(receipt.textContent,/缸里的虾（2 → 1 只）/);
  current.now=200;current.shrimp=3;lamp.dispatchEvent(new Event('click'));
  assert.match(receipt.textContent,/按孵化进度预计 4 只，本缸 3 只/);
  current.now=199;
  Object.assign(current,{tag:saved,names:'original-names'});
  lamp.dispatchEvent(new Event('click'));
  assert.doesNotMatch(receipt.textContent,/有改动|与上次同步不同/);
  current.neighbours={main:2};
  lamp.dispatchEvent(new Event('click'));
  assert.match(receipt.textContent,/邻缸布置（我的造景缸）与上次同步不同/);
  current.neighbours={main:1};
  lamp.dispatchEvent(new Event('click'));
  assert.doesNotMatch(receipt.textContent,/邻缸布置/);
  contact=new Date(Date.now()-60000).toISOString();await tick(15000);
  assert.match(receipt.textContent,/上次联系.*尚无新回执/);
  assert.doesNotMatch(receipt.textContent,/刚刚联系/);
  reachable=false;await tick(15000);
  assert.match(receipt.textContent,/暂时读不到桌面回执/);
  assert.equal(download.hidden,false);
  const offlineReads=reads;
  current.light='off';lamp.dispatchEvent(new Event('click'));
  assert.match(receipt.textContent,/缸灯（开 → 关）与上次核对的副本不同/);
  assert.doesNotMatch(receipt.textContent,/刚刚联系|桌面入口已载入/);
  current.light='on';lamp.dispatchEvent(new Event('click'));
  assert.doesNotMatch(receipt.textContent,/与上次核对的副本不同/);
  assert.equal(reads,offlineReads);
  reachable=true;contact=new Date().toISOString();await tick(5000);
  assert.match(receipt.textContent,/桌面入口已载入.*刚刚联系/);
  const before=reads;globalThis.document.hidden=true;await tick(5000);
  assert.equal(reads,before);
  URL.revokeObjectURL(download.href);
});

test('同步已写入但回执超时，按钮恢复并重读已发布的缸',async t=>{
  const prev=globalThis.location;
  globalThis.location=new URL('http://127.0.0.1:5174');
  t.after(()=>{if(prev===undefined)delete globalThis.location;else globalThis.location=prev;});
  t.mock.timers.enable({apis:['setTimeout']});
  let stored=false,posts=0;
  t.mock.method(globalThis,'fetch',async(_url,{method,signal})=>{
    if(method==='POST'){
      posts++;stored=true;
      return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    }
    return stored?new Response(null,{headers:{etag:'new','x-aquarium-room':'main','x-aquarium-shrimp':'7'}}):
      new Response(null,{status:404});
  });
  const button={},hint={},link={},download={hasAttribute:()=>false},thumbnail={removeAttribute(){}};
  installWallpaperSync({button,hint,link,download,thumbnail,launcher:'<html></html>',snapshot:()=>({}),capture:()=>null});
  const pending=button.onclick();
  assert.equal(button.disabled,true);
  t.mock.timers.tick(15000);await pending;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(posts,1);assert.equal(button.disabled,false);
  assert.match(hint.textContent,/尚未收到确认/);
  assert.equal(link.hidden,false);assert.match(link.title,/7 只虾/);
  URL.revokeObjectURL(download.href);
});

test('接近大小上限的壁纸优先保留完整缸景',async t=>{
  const previous=globalThis.location;
  globalThis.location=new URL('http://127.0.0.1:5174');
  t.after(()=>{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;});
  const limit=16*1024*1024, copy={label:''};
  copy.label='缸'.repeat(Math.floor((limit-Buffer.byteLength(JSON.stringify(copy)))/3));
  let posted;
  t.mock.method(globalThis,'fetch',async (_url,init)=>{
    if(init.method!=='POST')return new Response(null,{status:404});
    posted=init.body;return new Response(null,{status:204,headers:{etag:'copy','x-aquarium-room':'main'}});
  });
  const button={},thumbnail={removeAttribute(){}};
  let captures=0,budget;
  installWallpaperSync({button,thumbnail,hint:{},link:{},download:{hasAttribute:()=>true},
    launcher:'<img data-aquarium-preview>',snapshot:()=>copy,capture:remaining=>{captures++;budget=remaining;return '/9j/2Q==';}});
  await button.onclick();
  assert.deepEqual(JSON.parse(posted),copy);
  assert.ok(Buffer.byteLength(posted)<=limit);
  assert.equal(thumbnail.hidden,true);
  assert.equal(captures,0);
  copy.label=copy.label.slice(100);
  await button.onclick();
  assert.equal(budget,limit-Buffer.byteLength(JSON.stringify(copy))-20);
  assert.equal(JSON.parse(posted).previewJpeg,'/9j/2Q==');
});

test('实时壁纸只确认成功接入的版本，下载途中暂停也能恢复接入',async t=>{
  const playback=createWallpaperPlayback(), old='"first"', next='"second"';
  const copy={version:4,game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}},view:{version:1}};
  let code=304, payload=copy, pauseOnRead=false, applied=0;
  const request=t.mock.method(globalThis,'fetch',async (url,options)=>{
    assert.equal(url,'/api/wallpaper');
    assert.equal(options.headers['If-None-Match'],old);
    return {ok:code===200,status:code,headers:new Headers({etag:next,'x-aquarium-service':'three-aquarium-wallpaper'}),json:async()=>{
      if(pauseOnRead)playback.setPaused(true);
      return payload;
    }};
  });
  const refresh=()=>refreshWallpaper(old,playback,async (value,_signal,tag)=>{assert.equal(tag,next);assert.deepEqual(value,copy);applied++;});
  assert.equal(await refresh(),old);
  code=200;pauseOnRead=true;assert.equal(await refresh(),old);
  assert.equal(await refresh(),old);assert.equal(request.mock.callCount(),2);
  assert.equal(applied,0);
  playback.setPaused(false);pauseOnRead=false;payload={};
  await assert.rejects(refresh(),/副本不完整/);
  code=503;await assert.rejects(refresh(),/无法读取/);
  code=200;payload=copy;
  await assert.rejects(refreshWallpaper(old,playback,()=>{throw Error('invalid tank');}),/invalid tank/);
  assert.equal(await refresh(),next);assert.equal(applied,1);
  assert.equal(await refreshWallpaper(old,playback,async(_,signal)=>{
    playback.setPaused(true);
    signal.throwIfAborted();
  }),old,'a pause before commit must leave the previous tag in place');
  playback.setPaused(false);
  assert.equal(await refreshWallpaper(old,playback,async(_,signal)=>{
    assert.equal(signal.aborted,false);
    playback.setPaused(true);
    // A transaction already committed synchronously before this pause.
  }),next);
});

test('只有桌面应用新版本失败才回报该版本，普通预览与暂停不报失败',async t=>{
  const playback=createWallpaperPlayback(), reports=[];
  const copy={version:4,game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}},view:{}};
  t.mock.method(globalThis,'fetch',async(_url,{method,headers})=>{
    if(method==='HEAD'){reports.push(headers);return new Response(null,{status:304});}
    return new Response(JSON.stringify(copy),{headers:{etag:'"new"'}});
  });
  const failure=Error('scene rejected'), reject=()=>{throw failure;};
  for(const desktop of [false,true]){
    await assert.rejects(refreshWallpaper('"old"',playback,reject,desktop),e=>e===failure);
    assert.equal(reports.length,desktop?1:0);
  }
  assert.deepEqual(reports[0],{'If-None-Match':'"new"','X-Aquarium-Load-Failed':'desktop'});
  assert.equal(await refreshWallpaper('"old"',playback,(_copy,signal)=>{
    playback.setPaused(true);signal.throwIfAborted();
  },true),'"old"');
  assert.equal(reports.length,1);
});

test('桌面接过新缸就回执，服务断开时拉长重试间隔',async t=>{
  const waits=[], requests=[], stop=Error('end of test');
  const playback=createWallpaperPlayback();
  playback.waitForPoll=async delay=>{waits.push(delay);if(waits.length===6)throw stop;};
  t.mock.method(globalThis,'fetch',async(_url,{headers})=>{
    requests.push(headers);
    if(requests.length===1)return new Response(JSON.stringify({version:4,game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}},view:{version:1}}),{headers:{etag:'"two"'}});
    if(requests.length<=3)throw Error('offline');
    return new Response(null,{status:304});
  });
  let applied=0;
  await assert.rejects(followWallpaper('"one"',playback,()=>{applied++;},true,()=>applied?4:2,
    ()=>applied?{id:'1/2',adult:requests.length>=3}:null),e=>e===stop);
  assert.equal(applied,1);
  assert.deepEqual(waits,[0,0,5000,10000,5000,5000]);
  assert.deepEqual(requests.map(r=>r['If-None-Match']),['"one"','"two"','"two"','"two"','"two"']);
  assert.ok(requests.every(r=>r['X-Aquarium-Loaded']==='desktop'));
  assert.deepEqual(requests.map(r=>r['X-Aquarium-Desktop-Shrimp']),['2','4','4','4','4']);
  assert.deepEqual(requests.map(r=>r['X-Aquarium-Desktop-Brood']),[undefined,'1/2','1/2','1/2','1/2']);
  assert.deepEqual(requests.map(r=>r['X-Aquarium-Desktop-Adult-Brood']),[undefined,undefined,undefined,'1/2','1/2']);
});

test('播放中收到完整坏副本时保留旧缸，等到另一版本再下载',async t=>{
  const playback=createWallpaperPlayback(),stop=Error('test finished'),applied=[],heads=[],reads=[];
  let tag='"broken"';
  playback.waitForPoll=async()=>{if(reads.length>5 || heads.length>4 || applied.length && reads.at(-1)===tag)throw stop;};
  t.mock.method(globalThis,'fetch',async(_url,{method,headers})=>{
    if(method==='HEAD'){
      heads.push(headers);
      if(heads.length===3)tag='"fixed"';
      return new Response(null,{status:headers['If-None-Match']===tag?304:200,headers:{etag:tag}});
    }
    reads.push(headers['If-None-Match']);
    if(headers['If-None-Match']===tag)return new Response(null,{status:304});
    const body=tag==='"broken"'?'{}':JSON.stringify({version:4,game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}},view:{}});
    return new Response(body,{headers:{etag:tag,'x-aquarium-service':'three-aquarium-wallpaper'}});
  });
  await assert.rejects(followWallpaper('"old"',playback,(_copy,_signal,version)=>applied.push(version),true),e=>e===stop);
  assert.deepEqual(applied,['"fixed"']);
  assert.deepEqual(reads,['"old"','"old"','"fixed"']);
  assert.equal(heads.length,3);
  assert.ok(heads.every(h=>h['If-None-Match']==='"broken"' && h['X-Aquarium-Load-Failed']==='desktop'));
});

test('壁纸在服务通知后立刻取新版，旧服务继续普通轮询',async t=>{
  const copy={version:4,game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}},view:{version:1}};
  for(const supported of [true,false]){
    const delays=[],applied=[],requests=[],stop=Error('finished');
    const playback=createWallpaperPlayback();
    playback.waitForPoll=async ms=>{delays.push(ms);if(delays.length>3)throw stop;};
    const fetch=t.mock.method(globalThis,'fetch',async(url,{headers})=>{
      requests.push([url,headers]);
      if(url.endsWith('/wait'))return new Response(null,{status:204});
      const etag=requests.length===1?'"old"':'"new"';
      const metadata={etag,...(supported?{'X-Aquarium-Can-Wait':'1'}:{})};
      return etag===headers['If-None-Match'] ? new Response(null,{status:304,headers:metadata}) :
        new Response(JSON.stringify(copy),{headers:metadata});
    });
    await assert.rejects(followWallpaper('"old"',playback,(_copy,_signal,tag)=>applied.push(tag),true),e=>e===stop);
    assert.deepEqual(delays,[0,supported?0:5000,0,supported?0:5000]);
    assert.deepEqual(applied,['"new"']);
    assert.equal(requests.filter(([url])=>url.endsWith('/wait')).length,supported?2:0);
    assert.equal(requests.filter(([url])=>!url.endsWith('/wait')).at(-1)[1]['If-None-Match'],'"new"');
    fetch.mock.restore();
  }
});

test('完整副本的数据错误等待新版本，资源读取错误重试同一版本',async t=>{
  const copy={version:4,game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}},view:{version:1}};
  for(const permanent of [true,false]){
    const playback=createWallpaperPlayback(),stop=Error('finished'),downloaded=[],waits=[],applied=[];
    let tag='"original"', attempts=0;
    playback.waitForPoll=async()=>{if(applied.length || ++attempts>6)throw stop;};
    const mock=t.mock.method(globalThis,'fetch',async(url,{method,headers})=>{
      const expected=headers['If-None-Match'];
      if(url.endsWith('/wait')){
        waits.push(expected);tag='"replacement"';
        return new Response(null,{status:204});
      }
      const metadata={etag:tag,'X-Aquarium-Can-Wait':'1'};
      if(method==='HEAD' || expected===tag)return new Response(null,{status:expected===tag?304:200,headers:metadata});
      downloaded.push(tag);
      return new Response(JSON.stringify(copy),{headers:metadata});
    });
    await assert.rejects(followWallpaper('"old"',playback,(_copy,_signal,version)=>{
      if(downloaded.length===1)throw Object.assign(Error('cannot prepare session'),{code:permanent?'INVALID_AQUARIUM_SESSION':'CATALOG_LOAD_FAILED'});
      applied.push(version);
    },true),error=>error===stop);
    assert.deepEqual(waits,permanent?['"original"']:[]);
    assert.deepEqual(downloaded,permanent?['"original"','"replacement"']:['"original"','"original"']);
    assert.deepEqual(applied,[downloaded.at(-1)]);
    mock.mock.restore();
  }
});

test('启动和播放中的坏副本都能收到重新同步通知',async t=>{
  const copy={version:4,game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}},view:{version:1}};
  for(const [cold,disconnect] of [[true,false],[false,false],[false,true]]){
    const playback=createWallpaperPlayback(), stop=Error('finished'), delays=[], downloaded=[], waits=[], reports=[];
    let tag='"bad"', applied;
    playback.waitForPoll=async delay=>{
      delays.push(delay);
      if(applied || delays.length>5)throw stop;
      if(disconnect && delay===5000)tag='"repaired"';
    };
    const mock=t.mock.method(globalThis,'fetch',async(url,{method,headers,signal})=>{
      const incoming=headers['If-None-Match'];
      if(url.endsWith('/wait')){
        waits.push(incoming);
        assert.equal(signal.aborted,false);
        if(disconnect)throw new TypeError('notification connection interrupted');
        tag='"repaired"';
        return new Response(null,{status:204});
      }
      const metadata={etag:tag,'X-Aquarium-Service':'three-aquarium-wallpaper','X-Aquarium-Can-Wait':'1'};
      if(method==='HEAD')reports.push([incoming,headers['X-Aquarium-Load-Failed']]);
      if(incoming===tag || method==='HEAD')return new Response(null,{status:incoming===tag?304:200,headers:metadata});
      downloaded.push(tag);
      return new Response(JSON.stringify(tag==='"bad"'?{}:copy),{headers:metadata});
    });
    if(cold)assert.equal((await loadWallpaperCopy({},playback,true)).tag,'"repaired"');
    else await assert.rejects(followWallpaper('"old"',playback,(_copy,_signal,version)=>{applied=version;},true),e=>e===stop);
    assert.deepEqual(waits,['"bad"']);
    assert.deepEqual(downloaded,['"bad"','"repaired"']);
    assert.deepEqual(reports,[['"bad"','desktop'],['"bad"','desktop']]);
    assert.deepEqual(delays.filter(delay=>delay!==0),disconnect?[5000]:[]);
    mock.mock.restore();
  }
});

test('还没有副本时可等待第一次发布，旧服务沿用定期查询',async t=>{
  const copy={version:4,game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}},view:{version:1}};
  for(const [cold,supported] of [[true,true],[false,true],[true,false],[false,false]]){
    const playback=createWallpaperPlayback(), stop=Error('finished'), waits=[], delays=[];
    let published=false, applied;
    playback.waitForPoll=async ms=>{
      if(applied || delays.length>4)throw stop;
      delays.push(ms);
      if(ms===5000)published=true;
    };
    const mock=t.mock.method(globalThis,'fetch',async(url,{headers})=>{
      if(url.endsWith('/wait')){
        waits.push(headers['If-None-Match']);
        if(supported)published=true;
        return new Response(null,{status:supported?204:404});
      }
      if(!published)return new Response(null,{status:404,headers:{'X-Aquarium-Service':'three-aquarium-wallpaper','X-Aquarium-Can-Wait':'1'}});
      return new Response(JSON.stringify(copy),{headers:{etag:'"new"'}});
    });
    if(cold)assert.equal((await loadWallpaperCopy({},playback)).tag,'"new"');
    else await assert.rejects(followWallpaper('"old"',playback,(_copy,_signal,tag)=>{applied=tag;},'preview'),e=>e===stop);
    assert.deepEqual(waits,['*']);
    assert.deepEqual(delays.filter(Boolean),supported?[]:[5000]);
    if(!cold)assert.equal(applied,'"new"');
    mock.mock.restore();
  }
});

test('首次载入失败等服务恢复，旧版本重启有间隔，新版本无需等待',async t=>{
  const playback=createWallpaperPlayback(), requests=[];
  let now=0, reload=false, current='"same"';
  t.mock.method(performance,'getEntriesByType',()=>[{type:reload?'reload':'navigate'}]);
  t.mock.method(performance,'now',()=>now);
  playback.waitForPoll=async ms=>{now+=ms;};
  t.mock.method(globalThis,'fetch',async(_url,{method,headers})=>{
    assert.equal(method,'HEAD');requests.push(headers);
    if(now<10000)throw Error('offline');
    return new Response(null,{status:current===headers['If-None-Match']?304:200,headers:{etag:current}});
  });
  await waitForWallpaperRestart(current,playback,true);
  assert.equal(now,10000);assert.equal(requests.at(-1)['X-Aquarium-Load-Failed'],'desktop');
  reload=true;
  await waitForWallpaperRestart(current,playback,false);
  assert.equal(now,60000);assert.equal(requests.at(-1)['X-Aquarium-Load-Failed'],undefined);
  now=2*60*60*1000;
  await waitForWallpaperRestart(current,playback,false);
  assert.equal(now,2*60*60*1000+5000);
  current='"replacement"';await waitForWallpaperRestart('"same"',playback,true);
  assert.equal(now,2*60*60*1000+5000);
  const rejectedAt=now;
  current='"invalid"';
  playback.waitForPoll=async ms=>{now+=ms;if(now>=rejectedAt+10000)current='"replacement"';};
  await waitForWallpaperRestart('"invalid"',playback,true,undefined,true);
  assert.equal(now,rejectedAt+10000);
});

test('首帧自行恢复会取消重启检查，包括迟到的响应和暂停中的等待',async t=>{
  const playback=createWallpaperPlayback(), current='"same"', requests=[];
  let respond;
  t.mock.method(globalThis,'fetch',(_url,{signal})=>{
    requests.push(signal);
    return new Promise(resolve=>{respond=resolve;});
  });
  const check=new AbortController();
  const running=waitForWallpaperRestart(current,playback,false,check.signal);
  check.abort();
  assert.ok(requests[0].aborted);
  respond(new Response(null,{headers:{etag:'"replaced"'}}));
  assert.equal(await running,false);

  playback.setPaused(true);
  const waiting=new AbortController();
  const asleep=waitForWallpaperRestart(current,playback,false,waiting.signal);
  waiting.abort();
  assert.equal(await asleep,false);
  playback.setPaused(false);
  assert.equal(requests.length,1);
});

test('壁纸按宿主帧率播放，后台或暂停不累计动作时间',()=>{
  const playback=createWallpaperPlayback();
  function sample(frames,hz,offset=0){
    return Array.from({length:frames},(_,i)=>playback.frameDelta(offset+i*1000/hz)).filter(dt=>dt!==null);
  }
  assert.equal(sample(144,144).length,30);
  playback.applyGeneralProperties({fps:15});
  const deltas=sample(144,144,1000);
  assert.equal(deltas.length,15);assert.ok(deltas.reduce((a,b)=>a+b,0)>.9);
  playback.setHidden(true);playback.setPaused(true);
  assert.equal(playback.frameDelta(3000),null);
  playback.setHidden(false);assert.equal(playback.frameDelta(50000),null);
  playback.setPaused(false);assert.equal(playback.frameDelta(90000),0);
  assert.equal(playback.frameDelta(91000),.1);
  assert.equal(playback.frameDelta(200000),0);
  assert.equal(playback.frameDelta(200050),null);
  assert.equal(playback.frameDelta(200070),.07);
  playback.applyGeneralProperties({fps:60});playback.applyGeneralProperties({fps:0});
  assert.equal(sample(144,144,201000).length,60);
});

test('低帧率壁纸保留正常显示刷新误差，卡顿和暂停时间仍有界',()=>{
  for(const [fps,hz] of [[7,60],[8,30],[3,60],[1,30],[5,5]]){
    const playback=createWallpaperPlayback();
    playback.applyGeneralProperties({fps});
    let simulated=0, lastFrame=0, frames=0;
    for(let n=0;n<=120*hz;n++){
      const now=n*1000/hz+(n%2)*2;
      const dt=playback.frameDelta(now);
      if(dt===null)continue;
      simulated+=dt;lastFrame=now;frames++;
    }
    assert.ok(Math.abs(frames-(120*fps+1))<=1,`frame count at ${fps} fps: ${frames}`);
    assert.ok(Math.abs(simulated-lastFrame/1000)<.001,`clock at ${fps} fps: ${simulated}`);
    assert.equal(playback.frameDelta(lastFrame+60000),0,'first frame after a long stall must hold its pose');
    playback.setPaused(true);playback.setPaused(false);
    assert.equal(playback.frameDelta(lastFrame+120000),0);
  }
});

for(const failure of ['首次下载模块失败','重载时仍无法创建画面'])test(failure+'，壁纸等到可见、宿主恢复且本机服务就绪才重试', async()=>{
  const firstVisit=failure==='首次下载模块失败';
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const boot=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const host=new EventTarget(), doc=new EventTarget(), classes=new Set(), status={};
  doc.hidden=false;doc.documentElement={classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}};
  doc.getElementById=()=>status;
  let pending, delay, schedules=0, service='other', reloads=0;
  const context={URL,URLSearchParams,AbortController,performance:{getEntriesByType:()=>[{type:firstVisit?'navigate':'reload'}]},document:doc,window:host,
    location:{search:'',reload:()=>reloads++},
    fetch:async()=>Response.json({service}),setTimeout:(fn,ms)=>{delay=ms;schedules++;return pending=fn;},clearTimeout:id=>{if(pending===id)pending=null;}};
  runInNewContext(boot,context);assert.equal(host.wallpaperPropertyListener,undefined);
  context.location.search='?wallpaper';runInNewContext(boot,context);
  assert.ok(classes.has('wallpaper-boot'));
  const listener=host.wallpaperPropertyListener, event=new Event('error');
  // Browser resource errors reach the window in capture with the failed script as their target.
  Object.defineProperty(event,'target',{value:{matches:()=>true,src:'http://localhost/src/main.js'}});
  if(firstVisit){host.dispatchEvent(event);assert.match(status.textContent,/等待/);}
  else {listener.retryStartup('暂时无法绘制鱼缸，壁纸会自动重试。');assert.match(status.textContent,/自动重试/);}
  const retryDelay=firstVisit?4000:30000;
  assert.equal(delay,retryDelay);
  listener.setPaused(false);listener.setPaused(false);
  assert.equal(schedules,2,'初次等待和失败重试各安排一次，重复宿主状态不推迟重连');
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.ok(!pending);
  listener.setPaused(true);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.ok(!pending);
  listener.setPaused(false);assert.equal(delay,0);await pending();assert.equal(reloads,0);
  assert.equal(delay,retryDelay,'服务未就绪时继续按原间隔退避');
  service='three-aquarium-wallpaper';await pending();assert.equal(reloads,1);
  listener.applyGeneralProperties({fps:12});listener.applyGeneralProperties({});
  listener.setPaused(true);let paused,fps;
  listener.startPlayback({setPaused:v=>paused=v,applyGeneralProperties:v=>fps=v.fps});
  assert.equal(paused,true);assert.equal(fps,12);assert.ok(!classes.has('wallpaper-boot'));
});

test('模块一直不返回时检查服务；慢启动先成功便撤销重载',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const boot=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for(const recovered of [false,true]){
    const window=new EventTarget(),document=new EventTarget(),status={};
    document.documentElement={classList:{add(){},remove(){}}};document.getElementById=()=>status;
    let pending,delay,respond,reloads=0;
    runInNewContext(boot,{window,document,URLSearchParams,AbortController,performance:{getEntriesByType:()=>[]},
      location:{search:'?wallpaper=desktop',reload:()=>reloads++},fetch:()=>new Promise(resolve=>respond=resolve),
      setTimeout:(fn,ms)=>{delay=ms;return pending=fn;},clearTimeout:id=>{if(pending===id)pending=null;}});
    const listener=window.wallpaperPropertyListener;
    assert.equal(delay,45000);
    listener.setPaused(true);assert.equal(pending,null);
    listener.setPaused(false);assert.equal(delay,45000);
    pending();assert.match(status.textContent,/重新连接/);assert.equal(delay,4000);
    const check=pending();
    if(recovered)listener.startPlayback({setPaused(){},applyGeneralProperties(){}});
    respond(Response.json({service:'three-aquarium-wallpaper'}));await check;
    assert.equal(reloads,recovered?0:1);assert.equal(pending,null);
  }
});

test('启动重连中暂停会释放请求，可见且恢复后立刻重连，旧响应不能重载页面',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const boot=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const window=new EventTarget(),document=new EventTarget(),timers=new Map(),requests=[];
  document.getElementById=()=>null;document.documentElement={classList:{add(){},remove(){}}};
  let reloads=0;
  runInNewContext(boot,{window,document,URLSearchParams,AbortController,performance:{getEntriesByType:()=>[]},
    location:{search:'?wallpaper=desktop',reload:()=>reloads++},
    fetch:(_,options)=>new Promise(resolve=>requests.push({signal:options.signal,resolve})),
    setTimeout:(fn,ms)=>{timers.set(fn,ms);return fn;},clearTimeout:fn=>timers.delete(fn)});
  const fire=ms=>{const fn=[...timers.keys()].find(key=>timers.get(key)===ms);assert.ok(fn);timers.delete(fn);return fn();};
  const listener=window.wallpaperPropertyListener;
  listener.retryStartup('连接中');
  const old=fire(4000);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
  assert.ok(requests[0].signal.aborted);
  listener.setPaused(true);document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));
  assert.ok(![...timers.values()].includes(0));
  listener.setPaused(false);
  const current=fire(0);
  requests[0].resolve(Response.json({service:'three-aquarium-wallpaper'}));await old;
  assert.equal(reloads,0);
  requests[1].resolve(Response.json({service:'three-aquarium-wallpaper'}));await current;
  assert.equal(reloads,1);
});

test('壁纸重载在副本就绪前恢复本页留影，游戏入口和无效留影不显示照片',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('aquariumWallpaperJpeg'));
  for(const [search,jpeg,shown] of [['?wallpaper=desktop','/9j/2Q==',true],['','/9j/2Q==',false],
    ['?wallpaper',undefined,false],['?wallpaper','https://example.invalid/',false],['?wallpaper','/9j/'+'A'.repeat(90000),false]]){
    let img;
    runInNewContext(script,{URLSearchParams,location:{search},history:{state:{aquariumWallpaperJpeg:jpeg}},
      Image:class { remove(){img=null;} },document:{getElementById:()=>({prepend:image=>{img=image;}})}});
    assert.equal(Boolean(img),shown);
    if(shown){assert.equal(img.src,'data:image/jpeg;base64,'+jpeg);img.onerror();assert.equal(img,null);}
  }
  for(const [hash,expected] of [['#aq-preview=/9j/+Q==','/9j/+Q=='],['#aq-preview=broken','/9j/2Q==']]){
    let img,cleanURL;
    const history={state:{aquariumWallpaperJpeg:'/9j/2Q==',aquariumWallpaperTag:'old-copy',other:3},replaceState(state,title,url){this.state=state;cleanURL=url;}};
    runInNewContext(script,{URLSearchParams,history,location:{pathname:'/',search:'?wallpaper=desktop',hash},
      Image:class {},document:{getElementById:()=>({prepend:image=>{img=image;}})}});
    assert.equal(img.src,'data:image/jpeg;base64,'+expected);
    assert.equal(history.state.aquariumWallpaperJpeg,expected);assert.equal(history.state.other,3);
    assert.equal(history.state.aquariumWallpaperTag,expected==='/9j/2Q=='?'old-copy':null);
    assert.equal(cleanURL,'/?wallpaper=desktop');
  }
});

test('下载的壁纸入口先等本机服务，重试成功才离开入口页',async()=>{
  const html=await readFile(new URL('../wallpaper/index.html',import.meta.url),'utf8');
  const entry='http://localhost:12345/?wallpaper', status={parentElement:{dataset:{}}};
  let probe,retry,delay,destination,visibility,requests=0;
  const link=new URL(entry),host=new EventTarget(),doc={hidden:false,querySelector:key=>key==='a'?link:key==='[data-aquarium-preview]'?{getAttribute:()=>'data:image/jpeg;base64,/9j/+Q=='}:status,addEventListener:(_,fn)=>{visibility=fn;}};
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{
    URL,Image:class {constructor(){probe=this;} set src(url){this.url=url;requests++;}get src(){return this.url;}removeAttribute(){this.url=null;}},document:doc,window:host,
    location:{replace:url=>{destination=url;}},setTimeout:(fn,ms)=>{retry=fn;delay=ms;},clearTimeout:()=>{retry=null;},
  });
  const asset=new URL(probe.src);
  assert.equal(asset.origin,new URL(entry).origin);
  assert.equal(asset.pathname,'/api/wallpaper/ready.gif');
  assert.equal(typeof retry,'function','a local service may accept the request without returning an image');
  assert.equal(delay,5000);retry();
  assert.equal(requests,2);
  assert.equal(delay,10000);
  retry();assert.equal(delay,20000);
  retry();assert.equal(delay,30000);
  retry();assert.equal(delay,30000);
  probe.onerror();
  assert.equal(destination,undefined);
  assert.match(status.textContent,/等待/);
  assert.equal(status.parentElement.dataset.waiting,'1');
  assert.equal(delay,5000,'an answered failure should not inherit the stalled request timeout');
  retry();assert.equal(delay,5000);
  const stale=probe,lateLoad=probe.onload;
  host.wallpaperPropertyListener.setPaused(true);
  assert.equal(retry,null);assert.equal(stale.src,null);
  stale.naturalWidth=3;stale.naturalHeight=2;lateLoad.call(stale);
  assert.equal(destination,undefined);
  doc.hidden=true;host.wallpaperPropertyListener.setPaused(false);
  assert.equal(requests,6);
  doc.hidden=false;visibility();probe.naturalWidth=320;probe.naturalHeight=180;probe.onload();
  assert.equal(delay,5000);lateLoad.call(stale);
  assert.equal(destination,undefined,'a generic image on the port is not the player');
  const beforeRetry=requests, click=new Event('click',{cancelable:true});
  link.onclick(click);
  assert.equal(click.defaultPrevented,true,'offline retry must stay on the launcher');
  assert.equal(status.parentElement.dataset.waiting,undefined,'manual retry brings the status back');
  assert.equal(requests,beforeRetry+1);
  probe.onerror();assert.equal(destination,undefined);
  host.wallpaperPropertyListener.setPaused(true);link.onclick(click);
  assert.equal(requests,beforeRetry+1,'manual retry respects host pause');
  host.wallpaperPropertyListener.applyGeneralProperties({fps:7});
  host.wallpaperPropertyListener.applyGeneralProperties({fps:0});
  assert.equal(requests,beforeRetry+1,'changing FPS must not reconnect a paused launcher');
  host.wallpaperPropertyListener.setPaused(false);
  probe.naturalWidth=3;probe.naturalHeight=2;probe.onload();
  const target=new URL(destination);
  assert.equal(target.origin,new URL(entry).origin);
  assert.ok(target.searchParams.has('wallpaper'));assert.equal(target.searchParams.get('aq-fps'),'7');
  assert.equal(target.hash,'#aq-preview=/9j/+Q==');
  assert.equal(link.href,destination,'the manual link carries the same still');
});

test('新版壁纸入口先确认播放页可用，首次请求失败可以自动重试',async()=>{
  const html=await readFile(new URL('../wallpaper/index.html',import.meta.url),'utf8');
  const link=new URL('http://localhost:12345/?wallpaper=preview'),status={parentElement:{dataset:{}}};
  const frames=[],host=new EventTarget();
  let probe, check, destination;
  const doc={hidden:false,querySelector:key=>key==='a'?link:key==='[data-aquarium-preview]'?{getAttribute:()=>null}:status,addEventListener(){},
    body:{append:frame=>frames.push(frame)},createElement:()=>({
      setAttribute(){}, remove(){this.removed=true;},contentWindow:{},
    }),
  };
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{
    URL,Image:class {constructor(){probe=this;this.naturalWidth=4;this.naturalHeight=2;}},document:doc,window:host,
    location:{replace:value=>{destination=value;}},setTimeout:fn=>{check=fn;},clearTimeout:()=>{check=null;},
  });
  assert.equal(new URL(probe.src).searchParams.get('launcher'),'frame');
  probe.onload();
  const [old]=frames;
  check();
  assert.equal(old.removed,true);
  assert.equal(destination,undefined);
  assert.match(status.textContent,/等待鱼缸/);
  probe.onload();
  const replacement=frames[1];
  assert.equal(new URL(replacement.src).searchParams.get('aq-launcher'),'check');
  const message=(origin,source)=>host.dispatchEvent(Object.assign(new Event('message'),{origin,source,data:'aquarium-wallpaper-shell'}));
  message(link.origin,old.contentWindow);
  message('http://outside.invalid',replacement.contentWindow);
  assert.equal(destination,undefined);
  assert.equal(typeof check,'function');
  host.wallpaperPropertyListener.applyGeneralProperties({fps:15});
  host.wallpaperPropertyListener.setPaused(true);
  message(link.origin,replacement.contentWindow);
  assert.equal(check,null);
  assert.equal(destination,undefined);
  host.wallpaperPropertyListener.setPaused(false);
  probe.onload();
  message(link.origin,frames[2].contentWindow);
  assert.equal(new URL(destination).searchParams.get('aq-fps'),'15');
  assert.equal(new URL(destination).searchParams.has('aq-launcher'),false);
});

test('重连继承入口帧率，宿主改档优先，重载仍用最新档位',async()=>{
  const boot=(await readFile(new URL('../index.html',import.meta.url),'utf8')).match(/<script>([\s\S]*?)<\/script>/)[1];
  const history={state:{aquariumWallpaperTag:'copy'},replaceState(s){this.state=s;}};
  function open(search){
    const window=new EventTarget(),document=new EventTarget(),rates=[];
    document.documentElement={classList:{add(){},remove(){}}};
    runInNewContext(boot,{window,document,history,URLSearchParams,location:{search},performance:{getEntriesByType:()=>[]},setTimeout(){},clearTimeout(){}});
    const listener=window.wallpaperPropertyListener;
    listener.startPlayback({setPaused(){},applyGeneralProperties:settings=>rates.push(settings.fps)});
    return {listener,rates};
  }
  assert.deepEqual(open('?wallpaper&aq-fps=Infinity').rates,[]);
  const search='?wallpaper=desktop&aq-fps=7',first=open(search);
  assert.deepEqual(first.rates,[7]);
  first.listener.applyGeneralProperties({fps:15});first.listener.applyGeneralProperties({fps:null});
  assert.deepEqual(first.rates,[7,15]);assert.equal(history.state.aquariumWallpaperTag,'copy');
  assert.deepEqual(open(search).rates,[15]);
});

test('重新打开观察可修复磁盘坏副本，其他窗口先同步则保住它的新缸',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'aquarium repair '));
  const server=http.createServer(wallpaperService(dir,null));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,origin='http://127.0.0.1:'+port,file=join(dir,port+'.json');
  const previous=globalThis.location, request=globalThis.fetch;
  globalThis.location=new URL(origin);
  t.after(async()=>{
    if(previous===undefined)delete globalThis.location;else globalThis.location=previous;
    await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true});
  });
  t.mock.method(globalThis,'fetch',(url,init)=>request(origin+url,{...init,headers:{...init.headers,origin}}));
  const copy={version:4,view:{version:1,camera:[0,0,1],target:[0,0,0]},game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}}};
  const button={},hint={},link={hidden:true},download={removeAttribute(){delete this.href;}},thumbnail={removeAttribute(){}};
  const refresh=installWallpaperSync({button,hint,link,download,thumbnail,launcher:'',snapshot:()=>copy,capture:()=>null});
  t.after(()=>{if(download.href)URL.revokeObjectURL(download.href);});
  for(const broken of ['{"game":','{"game":{}}']){
    await writeFile(file,broken);await refresh();
    assert.equal(link.hidden,true);assert.match(hint.textContent,/重新同步/);
    assert.equal(await readFile(file,'utf8'),broken);
    await button.onclick();assert.deepEqual(JSON.parse(await readFile(file,'utf8')),copy);
    assert.equal(link.hidden,false);
  }
  await writeFile(file,'null');await refresh();
  const other={...copy,game:{...copy.game,session:{...copy.game.session,BreedingRooms:{activeId:'breeding'}}}};
  const saved=await request(origin+'/api/wallpaper',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(other)});
  assert.equal(saved.status,204);await button.onclick();await refresh(true);
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')),other);assert.match(link.textContent,/繁育缸/);
});

test('有效发布唤醒等待的壁纸，冲突的发布不唤醒',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'aquarium publish wake '));
  const middleware=wallpaperService(dir,null);
  const server=http.createServer((req,res)=>middleware(req,res,()=>res.writeHead(404).end()));
  t.after(async()=>{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port, endpoint=origin+'/api/wallpaper';
  const copy={version:4,view:{version:1,camera:[0,0,1],target:[0,0,0]},game:{creatures:[],session:{Tank:{Setup:{Filled:true}}}}};
  const publish=tag=>fetch(endpoint,{method:'POST',headers:{origin,'content-type':'application/json',...(tag?{'If-Match':tag}:{})},body:JSON.stringify(copy)});
  let firstWoken=false;
  const empty=fetch(endpoint+'/wait',{headers:{'If-None-Match':'*'},signal:AbortSignal.timeout(3000)}).then(res=>{firstWoken=true;return res;});
  assert.equal((await publish('"wrong"')).status,412);
  assert.equal(firstWoken,false);
  const first=await publish(), tag=first.headers.get('etag');
  assert.equal(first.status,204);
  assert.equal((await empty).status,204);
  assert.equal((await fetch(endpoint+'/wait',{headers:{'If-None-Match':'*'},signal:AbortSignal.timeout(1000)})).status,204);
  assert.equal((await fetch(endpoint,{headers:{'If-None-Match':tag}})).headers.get('x-aquarium-can-wait'),'1');
  let woken=false;
  const pending=fetch(endpoint+'/wait',{headers:{'If-None-Match':tag},signal:AbortSignal.timeout(3000)}).then(res=>{woken=true;return res;});
  assert.equal((await publish('"wrong"')).status,412);
  assert.equal(woken,false);
  copy.view.camera[0]=.5;
  assert.equal((await publish(tag)).status,204);
  assert.equal((await pending).status,204);
  // A publication that wins the race before the subscription also wakes immediately.
  assert.equal((await fetch(endpoint+'/wait',{headers:{'If-None-Match':tag},signal:AbortSignal.timeout(1000)})).status,204);
});

test('窗口试播只使用独立入口，校验已发布版本并保留桌面回执',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'aquarium preview '));
  const launches=[];
  const server=http.createServer(wallpaperService(dir,null,async(file,windowName,size)=>{launches.push({file,windowName,size});}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true});});
  const port=server.address().port,origin='http://127.0.0.1:'+port,url=origin+'/api/wallpaper';
  const copy={version:4,framing:'whole-tank',previewJpeg:'/9j/2Q==',view:{version:1,camera:[0,0,1],target:[0,0,0]},game:{session:{Tank:{Setup:{Filled:true}}},creatures:[]}};
  const post=await fetch(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(copy)});
  const tag=post.headers.get('etag');
  assert.equal(post.headers.get('x-aquarium-can-preview'),'1');
  assert.equal(post.headers.has('x-aquarium-can-apply'),false);
  const preview=(origin,tag,size)=>fetch(url+'/preview',{method:'POST',headers:{origin,'if-match':tag,...(size && {'x-aquarium-preview-size':size})}});
  assert.equal((await preview('https://example.invalid',tag)).status,403);
  assert.equal((await preview(origin,'"old"')).status,412);
  assert.deepEqual(launches,[]);
  assert.equal((await preview(origin,tag)).status,204);
  const file=join(dir,port+'-preview.html');
  assert.deepEqual(launches,[{file,windowName:'ThreeAquariumPreview-'+port,size:undefined}]);
  for(const invalid of ['0x600','801x450','640x601','portrait'])assert.equal((await preview(origin,tag,invalid)).status,400);
  assert.equal((await preview(origin,tag,'338x600')).status,204);
  assert.deepEqual(launches[1].size,[338,600]);
  const entry=await readFile(file,'utf8');
  assert.ok(entry.includes(origin+'/?wallpaper=preview') && !entry.includes('wallpaper=desktop'));
  assert.ok(entry.includes('data:image/jpeg;base64,'+copy.previewJpeg));
  await assert.rejects(readFile(join(dir,port+'-desktop.html')),{code:'ENOENT'});
  const summary=await fetch(url,{headers:{'X-Aquarium-Summary':'1'}});
  assert.equal(summary.headers.get('etag'),tag);
  assert.equal(summary.headers.get('x-aquarium-desktop-loaded'),'0');
  assert.equal(summary.headers.has('x-aquarium-preview-loaded'),false);
  const previewAck=etag=>fetch(url,{headers:{'If-None-Match':etag,'X-Aquarium-Loaded':'preview'}});
  const readSummary=()=>fetch(url,{method:'HEAD',headers:{'X-Aquarium-Summary':'1'}});
  assert.equal((await previewAck(tag)).status,304);
  const seen=await readSummary();
  assert.equal(seen.headers.get('x-aquarium-preview-loaded'),'1');
  assert.equal(seen.headers.get('x-aquarium-desktop-loaded'),'0');
  for(const jpeg of ['/9j/AQ==',undefined]){
    const updated=await fetch(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({...copy,previewJpeg:jpeg})});
    assert.equal(updated.status,204);
    await previewAck(tag);
    assert.equal((await readSummary()).headers.has('x-aquarium-preview-loaded'),false);
    const html=await readFile(file,'utf8');
    assert.ok(html.includes(origin+'/?wallpaper=preview'));
    if(jpeg)assert.ok(html.includes('data:image/jpeg;base64,'+jpeg),'重新打开试播入口应显示最新留影');
    else assert.doesNotMatch(html,/data-aquarium-preview src=/);
    await assert.rejects(readFile(join(dir,port+'-desktop.html')),{code:'ENOENT'});
  }
  assert.equal(launches.length,2);
});

test('第一屏只响应本机对当前已发布副本的明确请求，交给宿主的入口使用该端口及留影',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'aquarium desktop '));
  const opened=[];
  const monitors=[];
  const server=http.createServer(wallpaperService(dir,async(file,_window,_size,index)=>{
    if(index===2)throw Object.assign(Error('monitor disconnected'),{code:4});
    monitors.push(index);opened.push(file);
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true});});
  const origin='http://127.0.0.1:'+server.address().port, url=origin+'/api/wallpaper';
  const copy={version:4,framing:'whole-tank',previewJpeg:'/9j/2Q==',view:{version:1,camera:[0,0,1],target:[0,0,0]},game:{session:{Tank:{Setup:{Filled:true}}},creatures:[]}};
  const post=await fetch(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(copy)});
  assert.equal(post.status,204);
  assert.equal(post.headers.has('x-aquarium-entry-stale'),false);
  await assert.rejects(readFile(join(dir,server.address().port+'-desktop.html')),{code:'ENOENT'});
  const tag=post.headers.get('etag');
  const apply=headers=>fetch(url+'/apply',{method:'POST',headers});
  assert.equal((await fetch(url+'/apply')).status,405);
  assert.equal((await apply({origin})).status,403);
  assert.equal((await apply({origin:'https://example.invalid','if-match':tag})).status,403);
  assert.equal((await apply({origin,'if-match':'"old"'})).status,412);
  assert.equal(opened.length,0);
  assert.equal((await apply({origin,'if-match':tag})).status,204);
  assert.deepEqual(opened,[join(dir,server.address().port+'-desktop-1.html')]);
  const entry=await readFile(opened[0],'utf8');
  const choose=(index,etag=tag)=>fetch(url+'/apply-monitor',{method:'POST',headers:{origin,'if-match':etag,'x-aquarium-monitor':index}});
  for(const invalid of ['0','-1','1.5','2147483647'])assert.equal((await choose(invalid)).status,400);
  assert.equal((await choose('1','"old"')).status,412);
  assert.equal((await apply({origin,'if-match':tag,'x-aquarium-monitor':'1'})).status,400);
  assert.equal((await choose('2')).headers.get('x-aquarium-monitor-missing'),'1');
  assert.equal((await choose('1')).status,204);
  assert.deepEqual(monitors,[0,1]);
  assert.notEqual(opened[0],opened[1],'each managed screen needs its own launcher');
  assert.ok(entry.includes(origin+'/?wallpaper=desktop'));
  assert.ok(entry.includes('data:image/jpeg;base64,'+copy.previewJpeg));
  assert.match(entry,/aq-screen=1/);
  assert.match(await readFile(opened[1],'utf8'),/aq-screen=2/);
  const summary=async()=> (await fetch(url,{method:'HEAD',headers:{'X-Aquarium-Summary':'1'}})).headers;
  const seen=(screen,etag=tag)=>fetch(url,{headers:{'If-None-Match':etag,'X-Aquarium-Loaded':'desktop',...(screen && {'X-Aquarium-Desktop-Screen':screen})}});
  assert.equal((await summary()).get('x-aquarium-desktop-loaded'),'0');
  await seen(null);
  assert.equal((await summary()).get('x-aquarium-desktop-loaded'),'1');
  assert.equal((await summary()).get('x-aquarium-desktop-screens'),'');
  await seen('1');
  assert.equal((await summary()).get('x-aquarium-desktop-screens'),'1');
  await seen('4');
  assert.equal((await summary()).get('x-aquarium-desktop-screens'),'1');
  await seen('2');
  assert.equal((await summary()).get('x-aquarium-desktop-screens'),'1,2');
  await fetch(url,{method:'HEAD',headers:{'If-None-Match':tag,'X-Aquarium-Load-Failed':'desktop','X-Aquarium-Desktop-Screen':'2'}});
  const partialReceipt=await summary();
  assert.equal(partialReceipt.get('x-aquarium-desktop-screens'),'1');
  assert.equal(partialReceipt.get('x-aquarium-desktop-loaded'),'1');
  await seen('2');
  const sync=copy=>fetch(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(copy)});
  const pictures=['/9j/AA==','/9j/AQ==','/9j/Ag=='];
  assert.equal((await sync({...copy,previewJpeg:pictures[0]})).status,204);
  await seen('2');
  assert.equal((await summary()).get('x-aquarium-desktop-screens'),'');
  assert.ok((await readFile(opened[0],'utf8')).includes('data:image/jpeg;base64,'+pictures[0]),'重新打开同一入口应先看到最近一次同步的缸');
  assert.ok((await readFile(opened[1],'utf8')).includes('data:image/jpeg;base64,'+pictures[0]));
  const updates=await Promise.all(pictures.map(previewJpeg=>sync({...copy,previewJpeg})));
  assert.ok(updates.every(response=>response.status===204));
  const current=await (await fetch(url)).json();
  assert.ok((await readFile(opened[0],'utf8')).includes('data:image/jpeg;base64,'+current.previewJpeg),'并发发布后入口应与实际播放的副本一致');
  assert.equal((await sync({...copy,previewJpeg:undefined})).status,204);
  assert.doesNotMatch(await readFile(opened[0],'utf8'),/data-aquarium-preview src=/,'新副本没留影时不展示旧缸');
  assert.equal(opened.length,2,'两次主动设置之后，后续同步不能再次设置系统桌面');
  await rm(opened[0]);await mkdir(opened[0]);
  const partial=await sync(copy);
  assert.equal(partial.status,204);
  assert.equal(partial.headers.get('x-aquarium-entry-stale'),'1');
  assert.deepEqual(await (await fetch(url)).json(),copy,'更新启动图失败仍可播放本次发布的缸');
});

test('两个窗口从同一版或空白开始同步时只写入一个副本',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'aquarium-wall-race-'));
  const server=http.createServer(wallpaperService(dir));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true});});
  const origin='http://127.0.0.1:'+server.address().port,url=origin+'/api/wallpaper';
  const copy={version:4,game:{session:{Tank:{Setup:{Filled:true}}},creatures:[]},view:{version:1,camera:[0,0,1],target:[0,0,0]}};
  let condition={'If-None-Match':'*'};
  for(const round of [1,2]){
    const contenders=[0,1].map(index=>({...copy,note:round+'-'+index}));
    const results=await Promise.all(contenders.map(value=>fetch(url,{method:'POST',headers:{origin,'Content-Type':'application/json',...condition},body:JSON.stringify(value)})));
    assert.deepEqual(results.map(r=>r.status).sort(),[204,412]);
    const winner=results.findIndex(r=>r.status===204);
    const saved=await fetch(url);
    assert.deepEqual(await saved.json(),contenders[winner]);
    assert.equal(saved.headers.get('etag'),results[winner].headers.get('etag'));
    condition={'If-Match':saved.headers.get('etag')};
  }
});

test('本机壁纸只发布完整请求；失败保留上次副本，未更新时只返回版本',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'aquarium-wall-'));
  const server=http.createServer(wallpaperService(dir));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve)); await rm(dir,{recursive:true});});
  const origin='http://127.0.0.1:'+server.address().port, url=origin+'/api/wallpaper';
  const copy={version:4,view:{version:1,camera:[0,0,1],target:[0,0,0]},game:{session:{Tank:{Setup:{Filled:true}}},creatures:[]}};
  const post=(body,from=origin)=>fetch(url,{method:'POST',headers:{origin:from,'Content-Type':'application/json'},body});
  assert.deepEqual(await (await fetch(url+'/health')).json(),{service:'three-aquarium-wallpaper'});
  const fileHeaders={origin:'null','sec-fetch-site':'cross-site'};
  const marker=await fetch(url+'/ready.gif?t=1',{headers:fileHeaders});
  assert.equal(marker.headers.get('content-type'),'image/gif');
  const bytes=Buffer.from(await marker.arrayBuffer());
  assert.equal(bytes.toString('ascii',0,6),'GIF89a');
  assert.deepEqual([bytes.readUInt16LE(6),bytes.readUInt16LE(8)],[3,2]);
  const capable=await fetch(url+'/ready.gif?launcher=frame&t=1',{headers:fileHeaders});
  const framed=Buffer.from(await capable.arrayBuffer());
  assert.deepEqual([framed.readUInt16LE(6),framed.readUInt16LE(8)],[4,2]);
  assert.equal((await fetch(url+'/ready.gif',{method:'POST',headers:fileHeaders})).status,405);
  for(const path of ['', '/health'])assert.equal((await fetch(url+path,{headers:fileHeaders})).status,403);
  assert.equal((await fetch(url+'/health',{method:'POST'})).status,405);
  assert.equal((await fetch(url+'/health',{headers:{origin:'http://outside.invalid'}})).status,403);
  const empty=await fetch(url);
  assert.equal(empty.status,404);
  assert.equal(empty.headers.get('x-aquarium-service'),'three-aquarium-wallpaper');
  assert.equal((await post(JSON.stringify(copy),'http://outside.invalid')).status,403);
  const published=await post(JSON.stringify(copy));
  assert.equal(published.status,204);
  assert.ok(Number.isFinite(Date.parse(published.headers.get('last-modified'))));
  const proof=await fetch(url,{headers:{'X-Aquarium-Summary':'1','X-Aquarium-Verify-Copy':'1','If-None-Match':published.headers.get('etag')}});
  assert.equal(proof.status,304);
  assert.equal(proof.headers.get('x-aquarium-copy-sha256'),createHash('sha256').update(JSON.stringify(copy)).digest('hex'));
  assert.equal(published.headers.get('x-aquarium-room'),'main');
  assert.equal(published.headers.get('x-aquarium-framing'),'whole-tank');
  assert.equal(published.headers.get('x-aquarium-light'),null);
  assert.equal(published.headers.get('x-aquarium-feeding'),null);
  assert.equal(published.headers.get('x-aquarium-shrimp'),'0');
  assert.equal(published.headers.get('x-aquarium-follow'),null);
  const describe=()=>fetch(url,{method:'HEAD',headers:{'X-Aquarium-Summary':'1'}});
  const thumbnail=()=>fetch(url,{headers:{'X-Aquarium-Summary':'1'}});
  assert.equal((await describe()).headers.get('x-aquarium-room'),'main');
  assert.deepEqual(await (await thumbnail()).json(),{previewJpeg:null});
  const first=await fetch(url), etag=first.headers.get('etag');
  assert.equal(etag,published.headers.get('etag'));
  assert.equal(first.headers.get('last-modified'),published.headers.get('last-modified'));
  assert.deepEqual(await first.json(),copy);
  const loaded=()=>fetch(url,{headers:{'If-None-Match':etag,'X-Aquarium-Summary':'1'}});
  const acknowledge=(tag,count)=>fetch(url,{headers:{'If-None-Match':tag,'X-Aquarium-Loaded':'desktop',...(count===undefined?{}:{'X-Aquarium-Desktop-Shrimp':String(count)})}});
  await fetch(url,{headers:{'If-None-Match':etag}});
  assert.equal((await loaded()).headers.get('x-aquarium-desktop-loaded'),'0','ordinary preview does not confirm the desktop entry');
  assert.equal((await loaded()).headers.get('x-aquarium-last-desktop-contact'),null);
  assert.equal((await loaded()).headers.get('x-aquarium-desktop-requested'),null);
  await fetch(url,{headers:{'X-Aquarium-Player':'desktop'}});
  const starting=await loaded();
  assert.equal(starting.headers.get('x-aquarium-desktop-requested'),'1');
  assert.equal(starting.headers.get('x-aquarium-desktop-loaded'),'0');
  assert.equal((await acknowledge(etag)).status,304);
  for(const count of [0,13,50,51,'3.5']){
    await acknowledge(etag,count);
    assert.equal((await loaded()).headers.get('x-aquarium-desktop-shrimp'),[0,13,50].includes(count)?String(count):null);
  }
  await acknowledge(etag,13);
  const seen=await loaded(), contact=seen.headers.get('x-aquarium-last-desktop-contact');
  assert.equal(seen.headers.get('x-aquarium-desktop-loaded'),'1');
  assert.ok(Number.isFinite(Date.parse(contact)));
  assert.equal((await post('{')).status,400);
  assert.equal((await post('{}')).status,400);
  const malformed=structuredClone(copy);
  malformed.game.session.Tank.Setup.Filled='false';
  assert.equal((await post(JSON.stringify(malformed))).status,400);
  assert.equal((await fetch(url,{method:'HEAD',headers:{'If-None-Match':etag}})).status,304);
  copy.view.camera[2]=2;
  copy.game.pellet={anchor:0,age:2};
  Object.assign(copy.game.session.Tank,{Environment:{LightOn:false},Hardscape:[{}],Plants:[{}],Flora:[{},{}]});
  copy.game.session.BreedingRooms={activeId:'breeding',creatures:[{},{}]};
  copy.game.creatures.push({CreatureId:'I1'});
  copy.game.session.Colony={shrimp:{I1:{name:'小枫🌿'}}};
  copy.followId='I1';
  copy.previewJpeg='/9j/2Q==';
  const nextPublished=await post(JSON.stringify(copy));
  assert.equal(nextPublished.status,204);
  assert.equal(nextPublished.headers.get('x-aquarium-last-desktop-room'),'main');
  assert.equal(nextPublished.headers.get('x-aquarium-last-desktop-layout'),published.headers.get('x-aquarium-layout'));
  assert.equal(nextPublished.headers.get('x-aquarium-last-desktop-contact'),contact);
  assert.equal(nextPublished.headers.get('x-aquarium-last-desktop-modified'),first.headers.get('last-modified'));
  assert.equal(nextPublished.headers.get('x-aquarium-last-desktop-shrimp'),'13');
  assert.equal(nextPublished.headers.get('x-aquarium-last-desktop-light'),null);
  assert.equal((await describe()).headers.get('x-aquarium-desktop-requested'),null);
  await acknowledge(etag);
  const updated=await describe();
  assert.equal(updated.headers.get('x-aquarium-last-desktop-contact'),contact);
  assert.equal(updated.headers.get('x-aquarium-desktop-loaded'),'0','old playback cannot confirm a new tank');
  assert.equal(updated.headers.get('x-aquarium-last-desktop-room'),'main');
  const nextTag=updated.headers.get('etag');
  const receiptHeaders={'If-None-Match':nextTag,'X-Aquarium-Summary':'1'};
  const waiting=await fetch(url,{headers:receiptHeaders});
  assert.equal(waiting.status,304);
  assert.equal(waiting.headers.get('x-aquarium-desktop-shrimp'),null);
  assert.equal(waiting.headers.get('x-aquarium-desktop-requested'),'1');
  assert.equal(waiting.headers.get('x-aquarium-last-desktop-room'),'main');
  assert.equal(waiting.headers.get('x-aquarium-last-desktop-shrimp'),'13');
  const reportFailure=tag=>fetch(url,{method:'HEAD',headers:{'If-None-Match':tag,'X-Aquarium-Load-Failed':'desktop'}});
  await reportFailure(etag);
  assert.equal((await describe()).headers.get('x-aquarium-desktop-load-failed'),null);
  await reportFailure(nextTag);
  const failed=await fetch(url,{headers:receiptHeaders});
  assert.equal(failed.headers.get('x-aquarium-desktop-load-failed'),'1');
  assert.equal(failed.headers.get('x-aquarium-last-desktop-room'),'main');
  await acknowledge(nextTag);
  const switched=await fetch(url,{headers:receiptHeaders});
  assert.equal(switched.headers.get('x-aquarium-desktop-loaded'),'1');
  assert.equal(switched.headers.get('x-aquarium-desktop-load-failed'),null);
  assert.equal(switched.headers.get('x-aquarium-last-desktop-room'),'breeding');
  assert.equal(switched.headers.get('x-aquarium-last-desktop-light'),'off');
  assert.equal(switched.headers.get('x-aquarium-last-desktop-shrimp'),null);
  await reportFailure(nextTag);
  const restarted=await fetch(url,{headers:receiptHeaders});
  assert.equal(restarted.headers.get('x-aquarium-desktop-loaded'),'0');
  assert.equal(restarted.headers.get('x-aquarium-desktop-load-failed'),'1');
  assert.equal(restarted.headers.get('x-aquarium-last-desktop-room'),'breeding');
  await acknowledge(nextTag);
  assert.equal((await describe()).headers.get('x-aquarium-desktop-loaded'),'1');
  assert.equal(updated.headers.get('x-aquarium-room'),'breeding');
  for (const response of [updated,await describe()]) {
    assert.equal(response.headers.get('x-aquarium-feeding'),'1');
    assert.equal(response.headers.get('x-aquarium-meal'),'a0','旧投喂点可按落点对照');
    assert.equal(response.headers.get('x-aquarium-light'),'off');
    assert.equal(response.headers.get('x-aquarium-hardscape'),'1');
    assert.equal(response.headers.get('x-aquarium-plants'),'3');
  }
  assert.equal(updated.headers.get('x-aquarium-shrimp'),'1');
  assert.equal(decodeURIComponent(updated.headers.get('x-aquarium-follow')),'小枫🌿');
  const image=await thumbnail();
  assert.equal(image.headers.get('etag'),updated.headers.get('etag'));
  assert.deepEqual(await image.json(),{previewJpeg:null});
  for (const previewJpeg of ['https://example.invalid/picture','/9j/'+'a'.repeat(90000),null]) {
    assert.equal((await post(JSON.stringify({...copy,previewJpeg}))).status,400);
  }
  for (const followId of [null,'','I2',{},42]) {
    assert.equal((await post(JSON.stringify({...copy,followId}))).status,400);
  }
  assert.equal(await updated.text(),'');
  assert.equal((await describe()).headers.get('etag'),updated.headers.get('etag'));
  assert.deepEqual(await (await fetch(url,{headers:{'If-None-Match':etag}})).json(),copy);
  delete copy.followId; copy.framing='whole-room';
  const overview=await post(JSON.stringify(copy)), overviewSummary=await thumbnail();
  assert.equal(overview.status,204);
  for(const result of [overview,overviewSummary])assert.equal(result.headers.get('x-aquarium-framing'),'whole-room');
  assert.deepEqual(await overviewSummary.json(),{previewJpeg:copy.previewJpeg});
  const founders=createNewCrystalProgress({now:100,seed:37});
  const paired=applyBreedingAction(founders,{type:'plan',tankId:'breeding',motherId:'I1',fatherId:'I3',size:2},100);
  const members=s=>s.individuals.filter(r=>r.tank==='breeding');
  copy.game.session.Breeding=paired;
  copy.game.creatures=members(paired).map(r=>({CreatureId:r.id}));
  copy.game.session.Colony=crystalColony(paired,'breeding');
  const pending=await post(JSON.stringify(copy)), at=paired.batches[0].hatchAt;
  const pendingTag=pending.headers.get('etag');
  assert.equal(pending.headers.get('x-aquarium-hatch-at'),String(at));
  await fetch(url,{headers:{'If-None-Match':pendingTag,'X-Aquarium-Loaded':'desktop','X-Aquarium-Desktop-Brood':'1/2','X-Aquarium-Desktop-Shrimp':'1'}});
  assert.equal((await describe()).headers.get('x-aquarium-desktop-brood'),null);
  for(const [tag,player,brood,expected] of [[pendingTag,'preview','1/2',null],[etag,'desktop','1/2',null],
      [pendingTag,'desktop','2/2',null],[pendingTag,'desktop','1/4',null],[pendingTag,'desktop','1/2','1/2']]){
    await fetch(url,{headers:{'If-None-Match':tag,'X-Aquarium-Loaded':player,'X-Aquarium-Desktop-Brood':brood,'X-Aquarium-Desktop-Shrimp':'4'}});
    assert.equal((await describe()).headers.get('x-aquarium-desktop-brood'),expected);
  }
  const hatched=applyBreedingAction(paired,{type:'advance'},at);
  for(const [tag,player,adult,count,expected] of [[etag,'desktop','1/2','4',null],[pendingTag,'preview','1/2','4',null],
      [pendingTag,'desktop','1/2','1',null],[pendingTag,'desktop','2/2','4',null],[pendingTag,'desktop','1/2','4','1/2']]){
    await fetch(url,{headers:{'If-None-Match':tag,'X-Aquarium-Loaded':player,'X-Aquarium-Desktop-Brood':'1/2',
      'X-Aquarium-Desktop-Adult-Brood':adult,'X-Aquarium-Desktop-Shrimp':count}});
    assert.equal((await describe()).headers.get('x-aquarium-desktop-adult-brood'),expected);
  }
  assert.equal(pending.headers.get('x-aquarium-family-key'),wallpaperFamilyKey(hatched.batches[0]));
  const afterHatch=wallpaperLayoutTag(copy.game.session.Tank,members(hatched).map(r=>r.id));
  const namesAfterHatch=wallpaperNamesTag({Colony:crystalColony(hatched,'breeding')});
  assert.deepEqual(JSON.parse(pending.headers.get('x-aquarium-hatches')),[[at,afterHatch,namesAfterHatch,members(hatched).length]]);
  assert.notEqual(pending.headers.get('x-aquarium-layout'),afterHatch);
  assert.equal(pending.headers.get('x-aquarium-shrimp'),'2');
  assert.deepEqual(await (await fetch(url)).json(),copy,'forecasting does not advance the saved copy');
  await post(JSON.stringify(copy));
  assert.equal((await describe()).headers.get('x-aquarium-desktop-brood'),null);
  assert.equal((await describe()).headers.get('x-aquarium-desktop-adult-brood'),null);
  const grown=applyBreedingAction(hatched,{type:'advance'},paired.batches[0].adultAt);
  copy.game.session.Breeding=grown;
  copy.game.session.Colony=crystalColony(grown,'breeding');
  copy.game.creatures=members(grown).map(r=>({CreatureId:r.id}));
  const resynced=await post(JSON.stringify(copy));
  assert.equal(resynced.headers.get('x-aquarium-grown-brood'),'1/2');
  assert.equal(resynced.headers.get('x-aquarium-family-key'),pending.headers.get('x-aquarium-family-key'));
  for(const key of ['pending-brood','hatch-at','hatched-brood','desktop-adult-brood']){
    assert.equal(resynced.headers.get('x-aquarium-'+key),null);
  }
  await fetch(url,{headers:{'If-None-Match':resynced.headers.get('etag'),'X-Aquarium-Loaded':'desktop',
    'X-Aquarium-Desktop-Brood':'1/2','X-Aquarium-Desktop-Adult-Brood':'1/2','X-Aquarium-Desktop-Shrimp':'4'}});
  assert.equal((await describe()).headers.get('x-aquarium-desktop-adult-brood'),'1/2');
});
