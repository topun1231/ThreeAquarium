import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {releasePose,dropGeometry} from '../src/hardscape-drop.js';

test('old invisible R04/R06 records stay in the save but do not load catalog meshes for physics',()=>{
 const geometry=new T.BoxGeometry(.08,.06,.04),called=[];
 const records=['missing-four','missing-six','visible-four','modern'].map((id,i)=>({UniqueId:id,TypeId:['R04','R06','R04','stone'][i],Position:{x:0,y:.2,z:0},Rotation:{x:0,y:0,z:0},Scale:{x:1,y:1,z:1}}));
 const before=JSON.stringify(records),runtime={current:{},entries:new Map([['R04',{legacy:true}],['R06',{legacy:true}],['stone',{}]]),originals:new Map([['visible-four',{}]]),hardscape:r=>{
  called.push(r.UniqueId);if(r.UniqueId.startsWith('missing'))throw Error('Catalog must stay unloaded');
  return new T.Mesh(geometry);
 }};
 try{const entries=dropGeometry(runtime,records);assert.deepEqual(entries.map(e=>e.body.id),['visible-four','modern']);assert.deepEqual(called,['visible-four','modern']);assert.equal(JSON.stringify(records),before);}
 finally{geometry.dispose();}
});

test('release preview accepts a one-sided overhang and starts above the whole soil footprint',()=>{
 const record={UniqueId:'drop',TypeId:'stone',Position:{x:0,y:0,z:0},Rotation:{x:0,y:0,z:0},Scale:{x:1,y:1,z:1}};
 const node=new T.Mesh(new T.BoxGeometry(.2,.1,.08)),before=JSON.stringify(record);
 const soil={h:[.04,.16],sample:(x)=>x>.22?.16:.04,crest:()=>0,point:i=>({x:i?.23:0,z:0})};
 const current={soil,habitat:{surfaces:[{solid:true,owner:'R0 support',box:new T.Box3(new T.Vector3(.10,.04,-.1),new T.Vector3(.13,.2,.1))}]}};
 const release=releasePose(node,record,{x:.2,y:0,z:0},current);
 assert.equal(release.valid,true);assert.ok(release.record.Position.y-.05>=.225-1e-8);
 current.habitat.surfaces=[];
 assert.ok(releasePose(node,record,{x:.2,y:0,z:0},current).record.Position.y-.05>=.185-1e-8);
 assert.equal(releasePose(node,record,{x:.58,y:0,z:0},current).valid,false);
 assert.equal(JSON.stringify(record),before);assert.deepEqual(node.position.toArray(),[0,0,0]);node.geometry.dispose();node.material.dispose();
});

test('repeated material instances share shape payload but preserve independent poses',()=>{
 const geometry=new T.BoxGeometry(.08,.06,.04),runtime={current:{},entries:new Map([['stone',{}]]),hardscape:r=>{const n=new T.Mesh(geometry);n.position.set(r.Position.x,r.Position.y,r.Position.z);n.rotation.y=r.Rotation.y*Math.PI/180;return n;}};
 const records=[0,1].map(i=>({UniqueId:String(i),TypeId:'stone',Position:{x:i*.2,y:.2,z:0},Rotation:{x:0,y:i*30,z:0},Scale:{x:1,y:1,z:1}}));
 const entries=dropGeometry(runtime,records);assert.equal(entries[0].body.meshes,entries[1].body.meshes);assert.notDeepEqual(entries[0].body.position,entries[1].body.position);assert.notDeepEqual(entries[0].body.rotation,entries[1].body.rotation);
 records[0].Position.y=.4;
 assert.equal(dropGeometry(runtime,records)[0].body.meshes,entries[0].body.meshes);
 runtime.current={};
 assert.notEqual(dropGeometry(runtime,records)[0].body.meshes,entries[0].body.meshes);
 geometry.dispose();
});
