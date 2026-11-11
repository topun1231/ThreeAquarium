import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createWorkerProbe} from '../src/placement-worker-client.js';
import {MeshBVH} from 'three-mesh-bvh';

for(const event of ['error','messageerror'])for(const inFlight of [false,true])test(`worker ${event} ${inFlight?'during a solve':'between solves'} cannot strand the next placement`,async()=>{
 const original=globalThis.Worker,geometry=new T.BoxGeometry(.04,.04,.04),material=new T.MeshBasicMaterial();let worker,probe;
 globalThis.Worker=class extends EventTarget {
  constructor(){super();worker=this;this.sent=0;}
  set onerror(handler){this.errorHandler=handler;this.addEventListener('error',handler);}
  get onerror(){return this.errorHandler;}
  postMessage(message){this.sent++;if(message.init)queueMicrotask(()=>this.onmessage({data:{ready:true}}));}
  terminate(){this.terminated=true;}
 };
 const runtime={ensureCatalog:async()=>{},hardscape:()=>new T.Mesh(geometry,material)},current={soil:{snapshot:()=>({})},save:{Tank:{Hardscape:[]}},habitat:{surfaces:[]}};
 const settled=async promise=>{
  let timer;try{return await Promise.race([promise.then(()=>({resolved:true}),error=>({error})),new Promise(resolve=>{timer=setTimeout(()=>resolve({stuck:true}),100);})]);}finally{clearTimeout(timer);}
 };
 try{
  probe=await createWorkerProbe(runtime,'stone');
  const pending=inFlight?settled(probe.solve({x:0,y:0,z:0},current)):null;
  worker.dispatchEvent(Object.assign(new Event(event),{message:'Injected worker failure'}));
  if(pending)assert.ok((await pending).error,'in-flight operation must reject');
  const next=await settled(probe.solve({x:.1,y:0,z:0},current));
  assert.ok(next.error,'later placement must reject instead of waiting on a dead worker');
  assert.match(next.error.message,/重新选择木石/);
  assert.equal(worker.terminated,true);assert.equal(worker.sent,inFlight?2:1,'no new messages go to the failed worker');
 }finally{probe?.dispose();globalThis.Worker=original;geometry.dispose();material.dispose();}
});

test('cancelling worker initialization rejects and ignores a late response',async()=>{
 const original=globalThis.Worker,controller=new AbortController();let worker;
 globalThis.Worker=class extends EventTarget {constructor(){super();worker=this;}postMessage(){}terminate(){this.terminated=true;}};
 try{
  const pending=createWorkerProbe({ensureCatalog:async()=>{},hardscape:()=>new T.Group()},'stone',controller.signal);
  await Promise.resolve();controller.abort();await assert.rejects(pending,/取消/);
  worker.onmessage({data:{ready:true}});assert.equal(worker.terminated,true);
 }finally{globalThis.Worker=original;}
});

test('worker transfer carries an exact independent collision tree without detaching live buffers',async()=>{
 const original=globalThis.Worker,geo=new T.BoxGeometry(.08,.08,.08),bvh=new MeshBVH(geo),before=MeshBVH.serialize(bvh),positions=geo.attributes.position.array.slice();let payload,probe;
 globalThis.Worker=class extends EventTarget {
  postMessage(message,transfer=[]){const copy=structuredClone(message,{transfer});if(copy.world)payload=copy.world.surfaces[0];queueMicrotask(()=>this.onmessage({data:copy.init?{ready:true}:{valid:true}}));}
  terminate(){}
 };
 try{
  probe=await createWorkerProbe({ensureCatalog:async()=>{},hardscape:()=>new T.Group()},'stone',null,{UniqueId:'one'});
  await probe.solve({x:0,y:0,z:0},{soil:{snapshot:()=>({})},save:{Tank:{Hardscape:[]}},habitat:{surfaces:[{solid:true,owner:'one',kind:1,geo,bvh}]}});
  assert.deepEqual(payload.serialized,before);assert.deepEqual(payload.position,positions);
  const copy=new T.BufferGeometry();copy.setAttribute('position',new T.BufferAttribute(payload.position,3));copy.setIndex(new T.BufferAttribute(payload.index,1));
  const tree=MeshBVH.deserialize(payload.serialized,copy);copy.translate(.2,0,0);tree.refit();
  assert.deepEqual(MeshBVH.serialize(bvh),before);assert.deepEqual(geo.attributes.position.array,positions);copy.dispose();
 }finally{probe?.dispose();globalThis.Worker=original;geo.dispose()}
});
