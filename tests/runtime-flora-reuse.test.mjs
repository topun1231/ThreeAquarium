import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {TankRuntime} from '../src/tank-runtime.js';
import {makeFloraRecord} from '../src/flora.js';
import {createNeighbourPlants} from '../src/neighbour-plants.js';

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

test('distant catalog plants keep the same meshes until their geometry changes',t=>{
 const {rt}=fixture(), root=new T.Group();
 const source=new T.Mesh(new T.PlaneGeometry(),[new T.MeshStandardMaterial()]);
 const build=t.mock.method(rt,'plant',()=>source);
 const restore=createNeighbourPlants(rt,{build(){}})(root), soil={}, stones=[];
 const plant={UniqueId:'catalog-stem',TypeId:'stem',Stage:1,Growth:.52,Cuts:[],EcologicalAgeSeconds:10};
 const tank={Plants:[plant]};
 assert.equal(restore(tank,soil,stones),true);
 const catalog=root.getObjectByName('Neighbour catalog plants');
 const first=catalog.children[0], dispose=t.mock.method(first.geometry,'dispose');
 plant.EcologicalAgeSeconds++;plant.Health=.9;plant.Growth=.53;
 assert.equal(restore(tank,soil,stones),false);
 assert.equal(catalog.children[0],first);
 assert.equal(dispose.mock.calls.length,0);
 assert.equal(build.mock.calls.length,1);
 plant.UseContinuousVisualGrowth=true;
 assert.equal(restore(tank,soil,stones),true);
 plant.Growth=.54;
 assert.equal(restore(tank,soil,stones),true);
 plant.Cuts.push({EcologicalAgeAtCut:9});
 assert.equal(restore(tank,soil,stones),true);
 plant.EcologicalAgeSeconds++;
 assert.equal(restore(tank,soil,stones),true);
 assert.equal(dispose.mock.calls.length,1);
 assert.equal(build.mock.calls.length,5);
 restore({Plants:[]},soil,stones);
 source.geometry.dispose();source.material[0].dispose();
});

test('saved session validation distinguishes rejected data from a catalogue read failure',async t=>{
 const {rt,save}=fixture();
 save.Tank.Setup.PreparationStep=0;
 save.Tank.Environment.Stability=-.1;
 await assert.rejects(rt.readyForSession(save),{code:'INVALID_AQUARIUM_SESSION',message:'水环境记录无效'});
 const unavailable=Object.assign(Error('目录暂时不可读'),{code:'CATALOG_LOAD_FAILED'});
 t.mock.method(rt,'needsCatalogFor',()=>true);
 t.mock.method(rt,'ensureCatalog',async()=>{throw unavailable;});
 await assert.rejects(rt.readyForSession(save),error=>error===unavailable);
});

for(const [name,switching] of [['game',{switchingRoom:true}],['wallpaper',{backgroundNavigation:true,cacheRoomRoutes:true}]])
test(name+' room switches retain just the last graph and only for identical geometry',async()=>{
 const {rt,save}=fixture();
 save.Tank.Setup.Filled=true;
 const first=await rt.prepare(save);rt.commit(first);
 assert.ok(first.anchors.some(a=>a.edges.length));
 const other=structuredClone(save);other.Tank.UniqueId='other-room';
 const second=await rt.prepare(other,first,switching);rt.commit(second);
 const back=await rt.prepare(save,second,switching);
 assert.equal(back.anchors,first.anchors);
 assert.notEqual(back.habitat,first.habitat);
 assert.notEqual(back.group,first.group);
 const rebuilt=await rt.prepare(save,second);
 assert.deepEqual(back.anchors,rebuilt.anchors);
 rebuilt.dispose();
 back.dispose();

 const changed=structuredClone(save);changed.Tank.Flora[0].X+=.05;
 const moved=await rt.prepare(changed,second,switching);
 assert.notEqual(moved.anchors,first.anchors);
 moved.dispose();
 const retry=await rt.prepare(save,second,switching);
 assert.equal(retry.anchors,first.anchors);
 rt.commit(retry);
 assert.deepEqual(rt.previousRoomRoutes,{key:second.routeKey,anchors:second.anchors});
 const fresh=await rt.prepare(other,retry);
 assert.notEqual(fresh.anchors,second.anchors);
 fresh.dispose();retry.dispose();
});

test('dry unchanged plants share collision trees across commit and aborted preparation',async()=>{
 const {rt,save}=fixture(),first=await rt.prepare(save,null,options);rt.commit(first);
 let disposed=0;for(const s of flora(first))for(const geo of [s.source,s.geo])geo.addEventListener('dispose',()=>disposed++);
 const aborted=await rt.prepare(structuredClone(save),first,options);
 assert.deepEqual(flora(aborted),flora(first));aborted.dispose();assert.equal(disposed,0);
 const next=await rt.prepare(structuredClone(save),first,options);rt.commit(next);
 assert.equal(next.sharedWith,null,'a published scene must release its rollback reference');
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
