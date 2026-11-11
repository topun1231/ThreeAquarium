import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {prewarmHardscapeDrop,animateHardscapeDrop} from '../src/hardscape-drop.js';

test('wall-clock deadline terminates a silent or stalled worker, restores the view, and permits retry',async()=>{
 const original={Worker:globalThis.Worker,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout},timers=new Map(),workers=[];
 globalThis.setTimeout=(fn,ms)=>{const key={};timers.set(key,{fn,ms});return key;};
 globalThis.clearTimeout=key=>timers.delete(key);
 globalThis.Worker=class {constructor(){workers.push(this);}postMessage(data){this.data=data;}terminate(){this.terminated=true;}};
 const geometry=new T.BoxGeometry(.08,.08,.08),material=new T.MeshBasicMaterial(),node=new T.Mesh(geometry,material);
 const record={UniqueId:'stone',TypeId:'stone',Position:{x:0,y:.2,z:0},Rotation:{x:0,y:0,z:0},Scale:{x:1,y:1,z:1}};
 const current={save:{Tank:{Hardscape:[record],Flora:[]}},entities:new Map([['stone',node]]),habitat:{surfaces:[]},soil:{h:new Float32Array(4),Columns:2,Rows:2,Width:1.2,Depth:.6,MinHeight:0,sample:()=>.04,crest:()=>0,point:i=>({x:i%2,z:Math.floor(i/2)})}};
 const runtime={current,entries:new Map([['stone',{}]]),hardscape:()=>new T.Mesh(geometry,material)},aq={root:new T.Group()},flora={meshes:new Map()},before=JSON.stringify(current.save);
 try{
  for(const warm of [true,false]){
   const promise=warm?prewarmHardscapeDrop(runtime,record):animateHardscapeDrop({runtime,flora,aq,records:[record],activeId:'stone',signal:new AbortController().signal});
   const rejected=assert.rejects(promise,/计算超时/),worker=workers.at(-1);
   assert.ok(worker.data.ground.heights.every(h=>Math.abs(h-.04)<1e-7),'physical soil must not be lowered for legacy burial');
   const poses=[{id:'stone',position:[0,.15,0],rotation:{x:0,y:0,z:0,w:1}}];
   if(!warm)worker.onmessage({data:{request:worker.data.request,poses,elapsed:.05,done:false}});
   assert.equal(timers.size,1,'progress must not postpone the deadline');
   const timer=[...timers.values()][0];assert.equal(timer.ms,15000);timer.fn();await rejected;
   assert.equal(worker.terminated,true);assert.equal(timers.size,0);assert.equal(node.visible,true);assert.equal(aq.root.children.length,0);assert.equal(JSON.stringify(current.save),before);
   worker.onmessage({data:{request:worker.data.request,poses,done:true}});
   assert.equal(aq.root.children.length,0,'late result cannot resurrect a cancelled drop');
  }
  const retry=prewarmHardscapeDrop(runtime,record),worker=workers.at(-1);
  workers[0].onerror({message:'late failure from terminated worker'});
  workers[0].onmessageerror();
  assert.notEqual(worker.terminated,true,'stale errors must not cancel the retry');
  worker.onmessage({data:{request:worker.data.request,warm:true,done:true}});await retry;
  assert.equal(timers.size,0,'success removes the deadline');assert.equal(workers.length,3);
 }finally{
  workers.at(-1)?.onerror({message:'test cleanup'});
  Object.assign(globalThis,original);geometry.dispose();material.dispose();
 }
});
