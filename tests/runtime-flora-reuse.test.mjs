import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {TankRuntime} from '../src/tank-runtime.js';
import {makeFloraRecord} from '../src/flora.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../public/assets/catalog.json',import.meta.url)));
const setup=JSON.parse(fs.readFileSync(new URL('../public/assets/setup.json',import.meta.url)));
const options={navigation:false};
function fixture(){
 const ground=new T.Mesh(new T.PlaneGeometry(),new T.MeshStandardMaterial());ground.name='Deposited substrate';
 const rt=new TankRuntime({root:new T.Group(),nodes:[],meshes:[ground],materials:[]},{plants:[]},catalog,null,setup);
 const save=structuredClone(setup);save.Tank.Setup={Filled:false};save.Tank.Hardscape=[];save.Tank.Plants=[];
 save.Tank.Flora=['a','b'].map((id,i)=>makeFloraRecord({id,species:'rotala',variant:i,x:i*.1,z:0}));
 return {rt,save};
}
const flora=c=>c.habitat.surfaces.filter(s=>s.flora);

test('dry unchanged plants share collision trees across commit and aborted preparation',async()=>{
 const {rt,save}=fixture(),first=await rt.prepare(save,null,options);rt.commit(first);
 let disposed=0;for(const s of flora(first))for(const geo of [s.source,s.geo])geo.addEventListener('dispose',()=>disposed++);
 const aborted=await rt.prepare(structuredClone(save),first,options);
 assert.deepEqual(flora(aborted),flora(first));aborted.dispose();assert.equal(disposed,0);
 const next=await rt.prepare(structuredClone(save),first,options);rt.commit(next);
 assert.equal(disposed,0);for(const s of flora(next))assert.ok(s.bvh.closestPointToPoint(s.box.getCenter(new T.Vector3())));
 const empty=structuredClone(save);empty.Tank.Flora=[];rt.commit(await rt.prepare(empty,next,options));assert.equal(disposed,4);
});

test('moving, pruning and deleting plants invalidate only changed dry ground collisions',async()=>{
 const {rt,save}=fixture(),first=await rt.prepare(save,null,options);
 for(const edit of [r=>r.X+=.05,r=>r.Nodes=3]){
  const edited=structuredClone(save);edit(edited.Tank.Flora[0]);
  const next=await rt.prepare(edited,first,options),fresh=await rt.prepare(edited,null,options);
  assert.notEqual(flora(next)[0],flora(first)[0]);assert.equal(flora(next)[1],flora(first)[1]);
  for(let i=0;i<2;i++)assert.deepEqual(flora(next)[i].geo.attributes.position.array,flora(fresh)[i].geo.attributes.position.array);
  next.dispose();fresh.dispose();
 }
 const removed=structuredClone(save);removed.Tank.Flora.shift();const next=await rt.prepare(removed,first,options);
 assert.equal(flora(next).length,1);assert.equal(flora(next)[0],flora(first)[1]);next.dispose();first.dispose();
});

test('soil changes, filling and previously swaying surfaces cannot reuse dry plant collisions',async()=>{
 const {rt,save}=fixture(),first=await rt.prepare(save,null,options);
 const changed=structuredClone(save);first.soil.h.fill(first.soil.MinHeight+.02);changed.Tank.Substrate=first.soil.snapshot();
 const soilEdit=await rt.prepare(changed,first,options);assert.ok(flora(soilEdit).every(s=>!flora(first).includes(s)));soilEdit.dispose();
 const wet=structuredClone(save);wet.Tank.Setup.Filled=true;
 const filled=await rt.prepare(wet,first,options);assert.ok(flora(filled).every(s=>!flora(first).includes(s)));
 const drained=await rt.prepare(save,filled,options);assert.ok(flora(drained).every(s=>!flora(filled).includes(s)));drained.dispose();filled.dispose();
 flora(first)[0].flowTime=1;const stale=await rt.prepare(save,first,options);assert.notEqual(flora(stale)[0],flora(first)[0]);stale.dispose();first.dispose();
});
