import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {insideSoil,soilFootprint,createHardscapeProbe} from '../src/placement-preview.js';
import {createHabitat} from '../src/habitat.js';
import {createHardscapeMoveProbe} from '../src/hardscape-probe.js';
import {MeshBVH} from 'three-mesh-bvh';

const soil={Width:1.2,Depth:.6,MinHeight:0,sample:(x,z)=>.04+x*.01+z*.02,crest:()=>.001};

test('move cache matches fresh settling when supports enter, leave or move beneath another stack',async()=>{
 const geometry=new T.BoxGeometry(.08,.08,.08),entities=new Map(),records=[],items=[];let samples=0;
 for(let layer=0;layer<3;layer++)for(let column=0;column<4;column++){
  const id=`piece-${layer}-${column}`,r={UniqueId:id,TypeId:'stone',Position:{x:column%2?.2:-.2,y:.08+layer*.08035,z:column<2?-.1:.1},Rotation:{x:0,y:0,z:0},Scale:{x:1,y:1,z:1},Burial:0},node=new T.Group();node.name='R0 '+id;node.userData.kind=1;entities.set(id,node);records.push(r);
  items.push({node:id,owner:node.name,kind:1,solid:true,geometry,transform:new T.Matrix4().makeTranslation(r.Position.x,r.Position.y,r.Position.z)});
 }
 const habitat=await createHabitat(null,null,()=>{},null,items),current={soil:{...soil,sample:()=>{samples++;return .04},crest:()=>0},save:{Tank:{Hardscape:records}},entities,habitat};
 const sourceTrees=habitat.surfaces.map(s=>MeshBVH.serialize(s.bvh)),probe=await createHardscapeMoveProbe(current,records[0].UniqueId);
 try{
  for(const x of [-.195,-.19,.2,.21,.59,-.19,-.195]){
   samples=0;const actual=probe.solve({x,y:0,z:-.1}),cachedSamples=samples,fresh=await createHardscapeMoveProbe(current,records[0].UniqueId);
   try{samples=0;const expected=fresh.solve({x,y:0,z:-.1});assert.deepEqual(actual,expected,`cached outcome at ${x}`);if(x===-.19)assert.ok(cachedSamples<samples,'unaffected stacks reuse their settled result');}finally{fresh.dispose()}
  }
  habitat.surfaces.forEach((s,i)=>assert.deepEqual(MeshBVH.serialize(s.bvh),sourceTrees[i],'live collision tree stays unchanged'));
 }finally{probe.dispose();habitat.surfaces.forEach(s=>s.geo.dispose());geometry.dispose()}
});
test('soil footprint follows terrain, shows dose radius and stays within tank',()=>{
 const p={x:0,z:0},a=soilFootprint(soil,p,'pour');
 assert.equal(a.length%6,0);assert.equal(Math.max(...a.filter((_,i)=>i%3===0)),.12);
 for(let i=0;i<a.length;i+=3)assert.ok(Math.abs(a[i+1]-soil.sample(a[i],a[i+2])-.003)<1e-8);
 const edge=soilFootprint(soil,{x:.595,z:.295},'level');
 for(let i=0;i<edge.length;i+=3)assert.ok(insideSoil(soil,{x:edge[i],z:edge[i+2]}));
 assert.equal(insideSoil(soil,{x:.601,z:0}),false);assert.equal(insideSoil(soil,null),false);
 const push=soilFootprint(soil,p,'push',false),pull=soilFootprint(soil,p,'pull',false);
 assert.ok(Math.max(...push.filter((_,i)=>i%3===0))>.06);
 assert.ok(Math.min(...pull.filter((_,i)=>i%3===0))<-.06);
});

test('moving a support previews dependent settling, preserves identity and never mutates the live tank',async()=>{
 const geometry=new T.BoxGeometry(.08,.08,.08),material=new T.MeshBasicMaterial(),entities=new Map();
 const records=['base','top'].map((id,i)=>({UniqueId:id,TypeId:'stone',Position:{x:0,y:.08+i*.08035,z:0},Rotation:{x:0,y:30,z:0},Scale:{x:1,y:1,z:1},Burial:0}));
 const items=records.map(r=>{const node=new T.Group();node.name='R0 '+r.UniqueId;node.userData.kind=1;node.position.set(r.Position.x,r.Position.y,r.Position.z);node.rotation.y=Math.PI/6;node.add(new T.Mesh(geometry,material));node.updateMatrixWorld(true);entities.set(r.UniqueId,node);return {node:r.UniqueId,owner:node.name,kind:1,solid:true,geometry,transform:node.matrixWorld.clone()};});
 const habitat=await createHabitat(null,null,()=>{},null,items),flat={...soil,sample:()=>.04,crest:()=>0};
 const current={soil:flat,save:{Tank:{Hardscape:records}},entities,habitat},before=JSON.stringify(records),positions=habitat.surfaces.map(s=>s.geo.attributes.position.array.slice());
 const probe=await createHardscapeMoveProbe(current,'base');
 try{
  const result=probe.solve({x:.3,y:0,z:0});assert.equal(result.valid,true,result.reason);
  assert.equal(result.record.UniqueId,'base');assert.deepEqual(result.record.Scale,records[0].Scale);assert.ok(Math.abs(result.record.Rotation.y-30)<1e-6);
  assert.ok(Math.abs(result.record.Position.x-.3)<1e-6);assert.ok(Math.abs(result.records[1].Position.y-.08)<.001,'upper rock settles after its support moves');
  assert.equal(JSON.stringify(records),before);habitat.surfaces.forEach((s,i)=>assert.deepEqual(s.geo.attributes.position.array,positions[i]));assert.equal(entities.get('base').position.x,0);
  assert.equal(probe.solve({x:.59,y:0,z:0}).valid,false,'out-of-tank movement rejected');assert.deepEqual(probe.solve({x:.3,y:0,z:0}),result,'invalid preview does not contaminate the next result');
 }finally{probe.dispose();habitat.surfaces.forEach(s=>s.geo.dispose());geometry.dispose();material.dispose();}
});
test('hardscape probe seats deterministically without changing live supports or shared assets',async()=>{
 const geometry=new T.BoxGeometry(.08,.08,.08),material=new T.MeshBasicMaterial();let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
 const live=new T.Group();live.name='stone-existing';live.position.y=.1;live.userData.kind=1;live.add(new T.Mesh(geometry,material));live.updateMatrixWorld(true);
 const habitat=await createHabitat(null,null,()=>{},null,[{node:'base',owner:live.name,kind:1,solid:true,geometry,transform:live.matrixWorld.clone()}]);
 const record={UniqueId:'existing',TypeId:'stone',Position:{x:0,y:.1,z:0},Rotation:{x:0,y:0,z:0},Burial:0};
 const current={soil,save:{Tank:{Hardscape:[record]}},entities:new Map([['existing',live]]),habitat};
 const runtime={ensureCatalog:async()=>{},hardscape:r=>{const n=new T.Group();n.name='stone-'+r.UniqueId;n.userData.kind=1;n.add(new T.Mesh(geometry,material));return n;}};
 const probe=await createHardscapeProbe(runtime,'stone'),before=JSON.stringify(record),positions=habitat.surfaces[0].geo.attributes.position.array.slice();
 const a=probe.solve(new T.Vector3(0,.2,0),current);assert.equal(a.valid,true,a.reason);assert.ok(a.record.Position.y>.179);
 assert.deepEqual(probe.node.position.toArray(),Object.values(a.record.Position));
 probe.solve(new T.Vector3(.3,.1,.1),current);const b=probe.solve(new T.Vector3(0,.2,0),current);assert.deepEqual(a,b);
 assert.equal(JSON.stringify(record),before);assert.equal(live.position.y,.1);assert.deepEqual(habitat.surfaces[0].geo.attributes.position.array,positions);
 assert.equal(probe.solve(new T.Vector3(.59,.1,0),current).valid,false);
 probe.dispose();assert.equal(disposed,0);assert.equal(probe.solve(new T.Vector3(0,.2,0),{...current,save:{Tank:{Hardscape:Array(24).fill(record)}}}).valid,false);
 habitat.surfaces[0].geo.dispose();geometry.dispose();material.dispose();
});
