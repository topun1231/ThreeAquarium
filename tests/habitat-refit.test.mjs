import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {createHabitat,groundConnections,reconnectGraph,reconnectGraphInBackground} from '../src/habitat.js';
import {Worker as NodeWorker} from 'node:worker_threads';
import {connectWallpaperRoutes,createColliderBuilder} from '../src/wallpaper-routes.js';
import {limitNavigationSamples,NAVIGATION_LIMIT} from '../src/navigation-budget.js';

test('dense tanks keep their floor, roots and every sampled owner inside the save budget',()=>{
 const samples=Array.from({length:NAVIGATION_LIMIT+3200},(_,i)=>({i,owner:'patch-'+Math.floor(i/40)}));
 const roots=900, kept=limitNavigationSamples(samples,roots);
 assert.equal(kept.length,NAVIGATION_LIMIT);
 assert.deepEqual(kept.slice(0,roots),samples.slice(0,roots));
 assert.deepEqual(new Set(kept.map(a=>a.owner)),new Set(samples.map(a=>a.owner)));
 assert.ok(kept.every((a,i)=>!i || a.i>kept[i-1].i));
 assert.deepEqual(kept,limitNavigationSamples(samples,roots));
 assert.equal(limitNavigationSamples(kept,roots),kept);
});

const build=(item,reuse=null)=>createHabitat(null,null,()=>{},reuse,[item]);
const dispose=h=>h.surfaces.forEach(s=>s.geo.dispose());
const item=()=>({node:'stone',owner:'stone',solid:true,kind:1,geometry:new T.TorusKnotGeometry(.04,.012,80,8),transform:new T.Matrix4()});
test('walk probes agree with the nearest hit through overlapping leaves and stones',async()=>{
 const plane=new T.PlaneGeometry(.2,.2).rotateX(-Math.PI/2);
 const heights=[-.018,0,.014-.00000004,.014+.00000004,.023];
 const habitat=await createHabitat(null,null,()=>{},null,heights.map((y,i)=>({
  node:'layer'+i,owner:'layer'+i,kind:i%2?1:3,geometry:plane,transform:new T.Matrix4().makeTranslation(0,y,0)
 })));
 const p=new T.Vector3(0,0,0),origin=new T.Vector3(0,.025,0),down=new T.Vector3(0,-1,0);
 for(const gap of [.014,.02]){
  for(let mask=0;mask<1<<heights.length;mask++){
   const layers=habitat.surfaces.filter((_,i)=>mask & (1<<i));
   for(const candidates of [layers,[...layers].reverse()]){
    const exact=habitat.cast(origin,down,.044,false,candidates);
    const probe=habitat.cast(origin,down,.044,false,candidates,'support',gap);
    assert.equal(!!probe && probe.point.distanceTo(p)<=gap,!!exact && exact.point.distanceTo(p)<=gap);
   }
  }
 }
 dispose(habitat);plane.dispose();
});
test('walking neighbours retain index order across cells and stop at vertical obstacles',async()=>{
 const floor=new T.PlaneGeometry(.5,.5).rotateX(-Math.PI/2);
 const wall=new T.PlaneGeometry(.10,.08).rotateY(Math.PI/2);
 const wallX=.052,items=[
  {node:'base',owner:'base',kind:0,geometry:floor,transform:new T.Matrix4()},
  {node:'rock',owner:'rock',kind:1,geometry:wall,transform:new T.Matrix4().makeTranslation(wallX,.02,0)}
 ];
 const habitat=await createHabitat(null,null,()=>{},null,items);
 const anchors=[.060,-.051,.015,.044,-.011,.054,.002,.20].map((x,i)=>({
  position:new T.Vector3(x,0,.001*i),normal:new T.Vector3(0,1,0),owner:i===4?'other':'base',kind:0
 }));
 const canSeatAt=groundConnections(habitat,anchors);
 const lazy=anchors.map((_,i)=>canSeatAt(i));
 assert.ok(lazy.includes(true) && lazy.includes(false));
 assert.ok(anchors.every(a=>a.edges===undefined));
 reconnectGraph(habitat,anchors);
 assert.deepEqual(lazy,anchors.map(a=>a.edges.length>0));
 for(const [i,a] of anchors.entries()){
  const expected=anchors.flatMap((b,j)=>i!==j &&
   a.position.distanceTo(b.position)<=(a.owner===b.owner?.042:.030) &&
   (a.position.x<wallX)===(b.position.x<wallX)?[j]:[]);
  assert.deepEqual(a.edges,expected);
  assert.equal(a.cover,Math.abs(wallX-a.position.x)<=.065?.18:0);
 }
 dispose(habitat);floor.dispose();wall.dispose();
});
test('wallpaper worker matches the local graph and leaves the live colliders usable',async t=>{
 const entry=new URL('data:text/javascript,'+encodeURIComponent(`
  import {parentPort,workerData} from 'node:worker_threads';
  globalThis.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};
  await import(workerData);
  parentPort.on('message',data=>self.onmessage({data}));
 `));
 let workerCount=0, terminated=0, failWorker;
 class BrowserWorker {
  constructor(url){
   workerCount++;
   if(workerCount===failWorker)throw Error('worker unavailable');
   this.thread=new NodeWorker(entry,{workerData:url.href});
   this.thread.on('message',data=>this.onmessage({data}));
   this.thread.on('error',e=>this.onerror(e));
  }
  postMessage(data){this.thread.postMessage(data);}
  terminate(){terminated++;this.thread.terminate();}
 }
 const original=Object.getOwnPropertyDescriptor(globalThis,'Worker');
 globalThis.Worker=BrowserWorker;
 t.after(()=>{if(original)Object.defineProperty(globalThis,'Worker',original);else delete globalThis.Worker;});
 const floor=new T.PlaneGeometry(.5,.5).rotateX(-Math.PI/2);
 const habitat=await build({node:'floor',owner:'floor',kind:0,geometry:floor,transform:new T.Matrix4()});
 const anchors=()=>Array.from({length:24},(_,i)=>({
  position:new T.Vector3(i*.01-.1,0,0),normal:new T.Vector3(0,1,0),kind:0,owner:'floor',food:i/24
 }));
 try{
  const expected=reconnectGraph(habitat,anchors());
  assert.ok(expected[0].edges.length);
  assert.deepEqual(await connectWallpaperRoutes(habitat,anchors()),expected);
  assert.deepEqual(await reconnectGraphInBackground(habitat,anchors()),expected);
  t.mock.getter(globalThis,'navigator',()=>({hardwareConcurrency:8}));
  // Both clusters span workers; the last row belongs to the longer partition.
  const large=Array.from({length:4001},(_,i)=>({
   position:new T.Vector3(i>=1999&&i<=2001?(i-2000)*.01:i+2,0,0),
   normal:new T.Vector3(0,1,0),kind:0,owner:'floor',food:.5
  }));
  for(let i=3998;i<=4000;i++)large[i].position.x=.16+(i-3999)*.01;
  const serial=reconnectGraph(habitat,large.map(a=>({...a})));
  assert.deepEqual(serial[2000].edges,[1999,2001]);
  assert.deepEqual(serial[4000].edges,[3998,3999]);
  assert.deepEqual(await connectWallpaperRoutes(habitat,large),serial);
  assert.equal(workerCount,3);
  const paused=new AbortController();
  const interrupted=large.map(({edges,cover,zone,...a})=>a);
  const pending=connectWallpaperRoutes(habitat,interrupted,paused.signal);
  paused.abort();
  await assert.rejects(pending,e=>e===paused.signal.reason);
  assert.equal(terminated,workerCount);
  assert.ok(interrupted.every(a=>!a.edges));
  assert.deepEqual(await connectWallpaperRoutes(habitat,interrupted),serial);
  assert.equal(workerCount,7,'resuming still uses both workers');
  failWorker=workerCount+2;
  const retry=large.map(({edges,cover,zone,...a})=>a);
  await assert.rejects(connectWallpaperRoutes(habitat,retry),/worker unavailable/);
  assert.ok(retry.every(a=>!a.edges));
  assert.deepEqual(await connectWallpaperRoutes(habitat,retry),serial);
  assert.equal(workerCount,10,'a failed split retries with a single worker');
  assert.ok(habitat.cast(new T.Vector3(0,.01,0),new T.Vector3(0,-1,0),.02));

  const solid=item(), plain=solid.geometry.clone(), remote=solid.geometry.clone(), other=solid.geometry.clone();
  const native=new MeshBVH(plain), builder=createColliderBuilder();
  const interruptedTree=new AbortController(), cancel=createColliderBuilder(interruptedTree.signal);
  const fallback=createColliderBuilder();
  try{
   assert.deepEqual(MeshBVH.serialize(await builder.build(other)),MeshBVH.serialize(native));
   assert.deepEqual(remote.attributes.position.array,plain.attributes.position.array);
   assert.deepEqual(MeshBVH.serialize(await builder.build(remote)),MeshBVH.serialize(native));
   assert.equal(workerCount,11,'both meshes reuse one worker');
   const pendingTree=cancel.build(solid.geometry);
   interruptedTree.abort();
   await assert.rejects(pendingTree,error=>error===interruptedTree.signal.reason);
   assert.notDeepEqual(solid.geometry.index.array,plain.index.array);
   failWorker=workerCount+1;
   assert.deepEqual(MeshBVH.serialize(await fallback.build(solid.geometry)),MeshBVH.serialize(native));
  }finally{
   builder.dispose();cancel.dispose();fallback.dispose();
   solid.geometry.dispose();plain.dispose();remote.dispose();other.dispose();
  }

  const largeMesh=new T.PlaneGeometry(.2,.2,230,230).rotateX(-Math.PI/2);
  const items=[largeMesh,floor,largeMesh].map((geometry,i)=>({
   node:String(i),owner:String(i),kind:1,solid:true,geometry,transform:new T.Matrix4()
  }));
  const before=workerCount, parallel=createColliderBuilder(undefined,2);
  const stop=new AbortController(), abortedBuilders=createColliderBuilder(stop.signal,2);
  failWorker=before+2; // The second large surface falls back while the first is on its worker.
  const local=await createHabitat(null,null,()=>{},null,items);
  let result;
  try{
   result=await createHabitat(null,null,()=>{},null,items,undefined,parallel);
   assert.equal(workerCount,before+2);
   assert.deepEqual(result.surfaces.map(s=>s.node),['0','1','2']);
   assert.deepEqual(result.surfaces.map(s=>MeshBVH.serialize(s.bvh)),local.surfaces.map(s=>MeshBVH.serialize(s.bvh)));
   const single=await createHabitat(null,null,()=>{},null,[items[0]],undefined,parallel);
   dispose(single);
   assert.equal(workerCount,before+2,'one large mesh uses the local path');
   const inFlight=createHabitat(null,null,()=>{},null,items,undefined,abortedBuilders);
   assert.equal(workerCount,before+4);
   stop.abort();
   await assert.rejects(inFlight,error=>error===stop.signal.reason);
   assert.equal(result.cast(new T.Vector3(0,.01,0),new T.Vector3(0,-1,0),.02).surface.node,'0');
  }finally{
   abortedBuilders.dispose();parallel.dispose();if(result)dispose(result);dispose(local);largeMesh.dispose();
  }
 }finally{dispose(habitat);floor.dispose();}
});

test('wallpaper workers that stop responding are terminated and colliders fall back locally',async t=>{
 let terminated=0;
 class SilentWorker {
  postMessage(){}
  terminate(){terminated++;}
 }
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');
 globalThis.Worker=SilentWorker;
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'Worker',previous);else delete globalThis.Worker;});
 t.mock.timers.enable({apis:['setTimeout']});
 const route=connectWallpaperRoutes({surfaces:[]},[],undefined,8);
 const rejected=assert.rejects(route,/路线计算超时/);
 t.mock.timers.tick(8);
 await rejected;
 assert.equal(terminated,1);

 const geometry=item().geometry, expected=geometry.clone(), builder=createColliderBuilder();
 try {
  const pending=builder.build(geometry);
  t.mock.timers.tick(15000);
  assert.deepEqual(MeshBVH.serialize(await pending),MeshBVH.serialize(new MeshBVH(expected)));
  assert.equal(terminated,2);
 }finally{builder.dispose();geometry.dispose();expected.dispose();}
});
test('the local background graph stops between slices on pause',async t=>{
 const controller=new AbortController();
 let clock=0;
 t.mock.method(performance,'now',()=>clock+=9);
 const anchors=[0,1].map(x=>({position:new T.Vector3(x,0,0),normal:new T.Vector3(0,1,0),kind:0,owner:'floor'}));
 const pending=reconnectGraphInBackground({cast:()=>null},anchors,controller.signal);
 controller.abort();
 await assert.rejects(pending,error=>error===controller.signal.reason);
 assert.equal(anchors[1].zone,undefined);
});
test('short probes match direct triangle hits at edges, including through leaves',async()=>{
 const geometry=new T.PlaneGeometry(1,1), items=[0,-.25].map((z,i)=>({
  node:String(i),kind:i?1:3,geometry,transform:new T.Matrix4().makeTranslation(0,0,z)
 }));
 const habitat=await createHabitat(null,null,()=>{},null,items);
 const direction=new T.Vector3(0,0,-1);
 for(const x of [0,.5,.5001])for(const length of [.25,.5,.75,Infinity])for(const ignore of [false,true]){
  const origin=new T.Vector3(x,0,.5),ray=new T.Ray(origin,direction);
  const expected=habitat.surfaces.filter(s=>!ignore||s.kind!==3)
   .map(s=>s.bvh.raycastFirst(ray,T.DoubleSide,0,length)).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];
  assert.equal(habitat.cast(origin,direction,length,ignore)?.distance,expected?.distance);
 }
 dispose(habitat);geometry.dispose();
});
const triangles=s=>{
 const a=s.geo.index.array,out=[];for(let i=0;i<a.length;i+=3)out.push(`${a[i]},${a[i+1]},${a[i+2]}`);return out.sort();
};
function compare(a,b){
 assert.deepEqual(a.surfaces[0].geo.attributes.position.array,b.surfaces[0].geo.attributes.position.array);
 assert.deepEqual(triangles(a.surfaces[0]),triangles(b.surfaces[0]));
 const center=b.surfaces[0].box.getCenter(new T.Vector3());
 for(let i=1;i<=30;i++){
  const direction=new T.Vector3(Math.sin(i*1.7),Math.cos(i*2.3),Math.sin(i*.9)).normalize(),p=center.clone().addScaledVector(direction,.15);
  const pairs=[[a.cast(p,direction.clone().negate(),.3),b.cast(p,direction.clone().negate(),.3)],[a.closest(p,.3),b.closest(p,.3)]];
  for(const [kind,[x,y]] of pairs.entries()){
   assert.equal(!!x,!!y);if(!x)continue;assert.ok(Math.abs(x.distance-y.distance)<1e-8);assert.ok(x.point.distanceTo(y.point)<1e-7);
   if(kind===0)assert.ok(x.normal.distanceTo(y.normal)<1e-6);
   else for(const hit of [x,y]){
    // An edge can tie between adjacent faces; either face must still contain the reported closest point.
    const s=hit.surface,ids=s.geo.index.array,pos=s.geo.attributes.position,triangle=new T.Triangle(...[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(pos,ids[hit.faceIndex*3+k])));
    assert.ok(triangle.closestPointToPoint(hit.point,new T.Vector3()).distanceTo(hit.point)<1e-7);assert.ok(triangle.getNormal(new T.Vector3()).distanceTo(hit.normal)<1e-6);
   }
  }
 }
}

test('copied solid trees match rebuilt triangles and queries through repeated transforms',async()=>{
 const source=item();let current=await build(source);
 for(let i=1;i<=16;i++){
  const next={...source,transform:new T.Matrix4().compose(new T.Vector3(i*.01,.02,-.03),new T.Quaternion().setFromEuler(new T.Euler(i*.19,i*.23,-i*.17)),new T.Vector3(i>8?-1:1,1.2,.8))};
  const candidate=await build(next,current),fresh=await build(next);compare(candidate,fresh);dispose(fresh);dispose(current);current=candidate;
 }
 dispose(current);source.geometry.dispose();
});

test('mutable candidate owns its vertices, triangle order and tree even without a transform change',async()=>{
 const source=item(),live=await build(source),s=live.surfaces[0],before=MeshBVH.serialize(s.bvh),positions=s.geo.attributes.position.array.slice();
 const candidate=await build({...source,rebuild:true},live),c=candidate.surfaces[0];
 assert.notEqual(c,s);assert.notEqual(c.geo.index.array.buffer,s.geo.index.array.buffer);assert.notEqual(c.bvh._roots[0],s.bvh._roots[0]);
 c.geo.translate(.2,.1,0);c.bvh.refit();dispose(candidate);
 assert.deepEqual(MeshBVH.serialize(s.bvh),before);assert.deepEqual(s.geo.attributes.position.array,positions);
 const fresh=await build(source);compare(live,fresh);dispose(fresh);dispose(live);source.geometry.dispose();
});

test('replaced geometry and non-solid surfaces keep the full rebuild path',async()=>{
 const source=item(),live=await build(source),replacement={...source,geometry:new T.SphereGeometry(.04,12,8),transform:new T.Matrix4().makeTranslation(.1,0,0)};
 const changed=await build(replacement,live),fresh=await build(replacement);compare(changed,fresh);
 const plant={...source,solid:false,kind:3},plants=await build(plant),moved={...plant,transform:new T.Matrix4().makeRotationY(.5)},next=await build(moved,plants),expected=await build(moved);compare(next,expected);
 for(const h of [live,changed,fresh,plants,next,expected])dispose(h);source.geometry.dispose();replacement.geometry.dispose();
});

test('interrupting background collider construction disposes only its own geometry',async t=>{
 const source=item(),live=await build(source);
 const released=t.mock.method(T.BufferGeometry.prototype,'dispose');
 const second={...source,node:'other'}, third={...source,node:'unbuilt'};
 const abort=new DOMException('wallpaper paused','AbortError');
 let visits=0;
 await assert.rejects(createHabitat(null,null,()=>{},live,[source,second,third],()=>{
  if(++visits===3)return Promise.reject(abort);
 }),error=>error===abort);
 const disposed=released.mock.calls.map(call=>call.this);
 assert.equal(disposed.length,1);
 assert.notEqual(disposed[0],live.surfaces[0].geo);
 assert.notEqual(disposed[0],source.geometry);
 assert.equal((await build(source,live)).surfaces[0],live.surfaces[0]);
 dispose(live);source.geometry.dispose();
});
