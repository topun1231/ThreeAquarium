import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Substrate} from '../src/substrate.js';

for(const moving of [true,false])test(`placement worker ${moving?'move':'add'} survives repeated solves and a replaced world`,async()=>{
 const original=globalThis.self,replies=[],settings={Width:1.2,Depth:.6,Columns:9,Rows:5,MinHeight:0,MaxHeight:.3};
 globalThis.self={postMessage:reply=>replies.push(reply)};
 const shape=new T.BoxGeometry(.08,.08,.08),soil=new Substrate(settings);soil.h.fill(.04);
 const record={UniqueId:'base',TypeId:'stone',Position:{x:0,y:.0821,z:0},Rotation:{x:0,y:0,z:0},Scale:{x:1,y:1,z:1},Burial:0};
 const world=()=>{const geo=shape.clone().translate(0,record.Position.y,0);return{soil:soil.snapshot(),records:[structuredClone(record)],surfaces:[{owner:'R0 base',kind:1,position:geo.attributes.position.array,index:geo.index.array}]}};
 const send=async data=>{await self.onmessage({data});const reply=replies.pop();assert.ok(reply);assert.equal(reply.error,undefined);return reply};
 try{
  await import(`../src/placement-worker.js?test=${moving}`);
  await send({init:true,key:'stone',moveId:moving?'base':undefined,settings,kind:1,model:moving?[]:[{position:shape.attributes.position.array,index:shape.index.array,matrix:new T.Matrix4().toArray()}]});
  const point={x:.25,y:.04,z:0},first=await send({world:world(),point});assert.equal(first.valid,true,first.reason);
  assert.equal((await send({point:{x:.7,y:.04,z:0}})).valid,false);
  const repeat=await send({point});assert.deepEqual(repeat.record,first.record);
  record.Position.x=-.2;
  const replacement=world();replacement.surfaces[0].position=new Float32Array(replacement.surfaces[0].position);
  for(let i=0;i<replacement.surfaces[0].position.length;i+=3)replacement.surfaces[0].position[i]-=.2;
  assert.equal((await send({world:replacement,point})).valid,true);
 }finally{globalThis.self=original;shape.dispose()}
});
