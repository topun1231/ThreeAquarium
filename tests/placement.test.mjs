import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {seatHardscape} from '../src/hardscape.js';
import {validateStock,populationRecords} from '../src/population.js';
import {flowPoint} from '../src/plant-contacts.js';
import {createHabitat} from '../src/habitat.js';
import fs from 'node:fs';

function stack(){
 const candidate={entities:new Map(),habitat:{surfaces:[]},soil:{sample:()=>.04,crest:()=>0,MinHeight:0}},records=[];
 for(const [id,y,size] of [['base',.08,.10],['top',.17,.04]]){const node=new T.Group();node.name=id;node.position.y=y;node.userData.kind=1;const geo=new T.BoxGeometry(size,size,size);geo.translate(0,y,0);geo.computeBoundingBox();candidate.entities.set(id,node);candidate.habitat.surfaces.push({owner:id,solid:true,geo,box:geo.boundingBox,bvh:new MeshBVH(geo),transform:new T.Matrix4()});records.push({UniqueId:id,TypeId:'stone',Position:{x:0,y,z:0},Rotation:{x:0,y:0,z:0},Burial:0});}
 return {candidate,records};
}
test('selected upper stone seats after its base; removing support reseats it on soil',()=>{const {candidate,records}=stack();seatHardscape(candidate,records,'top');assert.ok(Math.abs(records[0].Position.y-.09)<1e-6);assert.ok(Math.abs(records[1].Position.y-.16035)<1e-6);candidate.habitat.surfaces.shift();seatHardscape(candidate,[records[1]],'top');assert.ok(Math.abs(records[1].Position.y-.06)<1e-6);});
test('placement rejects wall overhang before commit',()=>{const {candidate,records}=stack(),s=candidate.habitat.surfaces[0];s.geo.translate(.59,0,0);s.geo.computeBoundingBox();s.box=s.geo.boundingBox;s.bvh.refit();assert.throws(()=>seatHardscape(candidate,records,'base'),/缸壁/);});

function ledge(bridge=false){
 const candidate={entities:new Map(),habitat:{surfaces:[]},soil:{sample:()=>.04,crest:()=>0,MinHeight:0}},records=[];
 const shapes=[['left',-.12,.10,.06,.12,.09],...(bridge?[['right',.12,.10,.06,.12,.09]]:[]),['beam',0,.22,.36,.025,.05]];
 for(const [id,x,y,width,height,depth] of shapes){const node=new T.Group();node.name=id;node.position.set(x,y,0);node.userData.kind=1;const geo=new T.BoxGeometry(width,height,depth);geo.translate(x,y,0);geo.computeBoundingBox();candidate.entities.set(id,node);candidate.habitat.surfaces.push({owner:id,solid:true,geo,box:geo.boundingBox,bvh:new MeshBVH(geo),transform:new T.Matrix4()});records.push({UniqueId:id,TypeId:'stone',Position:{x,y,z:0},Rotation:{x:0,y:0,z:0},Burial:0});}
 return {candidate,records};
}
test('a one-sided ledge keeps settling beyond twelve degrees until its far end rests',()=>{
 for(const kind of [1,2]){
 const {candidate,records}=ledge();candidate.entities.get('beam').userData.kind=kind;seatHardscape(candidate,records,'beam');
 const beam=records.at(-1),surface=candidate.habitat.surfaces.at(-1);
 assert.ok(Math.abs(beam.Rotation.z)>12);
 assert.ok(surface.box.min.y<.043,'far end reaches soil instead of stopping in midair');
 assert.ok(surface.box.min.y>=.039,'settling does not sink through soil');
 }
});
test('a bridge supported on both ends keeps its intentional gap',()=>{
 const {candidate,records}=ledge(true);seatHardscape(candidate,records,'beam');
 assert.ok(Math.abs(records.at(-1).Rotation.z)<.01);
 assert.ok(candidate.habitat.surfaces.at(-1).box.min.y>.15);
});

test('settling refits each mesh once and leaves final collision queries current',()=>{
 const {candidate,records}=ledge();let refits=0;
 for(const s of candidate.habitat.surfaces){const refit=s.bvh.refit.bind(s.bvh);s.bvh.refit=(...args)=>{refits++;return refit(...args);};}
 seatHardscape(candidate,records,'beam');assert.equal(refits,records.length);
 for(const s of candidate.habitat.surfaces){const centre=s.box.getCenter(new T.Vector3()),ray=new T.Ray(new T.Vector3(centre.x,s.box.max.y+.1,centre.z),new T.Vector3(0,-1,0));
  const actual=s.bvh.raycastFirst(ray,T.DoubleSide),fresh=new MeshBVH(s.geo.clone()).raycastFirst(ray,T.DoubleSide);
  assert.ok(actual&&fresh);assert.ok(actual.point.distanceTo(fresh.point)<1e-8);
 }
});
test('editable solid candidates cannot mutate cached live collision geometry',async()=>{const geometry=new T.BoxGeometry(.1,.1,.1),item={node:'stone',owner:'stone',kind:1,solid:true,geometry,transform:new T.Matrix4()},live=await createHabitat(null,null,()=>{},null,[item]),cached=await createHabitat(null,null,()=>{},live,[item]),draft=await createHabitat(null,null,()=>{},live,[{...item,rebuild:true}]);assert.equal(live.surfaces[0],cached.surfaces[0]);assert.notEqual(live.surfaces[0],draft.surfaces[0]);const before=live.surfaces[0].geo.attributes.position.array.slice();draft.surfaces[0].geo.translate(0,.1,0);assert.deepEqual(live.surfaces[0].geo.attributes.position.array,before);});
test('population keeps source personality and validates imported identities',()=>{const creatures=JSON.parse(fs.readFileSync(new URL('../public/assets/initial-population.json',import.meta.url)));creatures.forEach((c,i)=>c.CreatureId='source-'+i);const stock={tankId:'tank',creatures};validateStock(stock);const a=populationRecords(stock,50),b=populationRecords(stock,50);assert.deepEqual(a,b);assert.deepEqual(a[0].Personality,creatures[0].Personality);assert.equal(new Set(a.map(c=>c.CreatureId)).size,50);assert.throws(()=>validateStock({...stock,creatures:[creatures[0],creatures[0]]}));assert.throws(()=>populationRecords(stock,51));});
test('leaf collision flow is bounded, deterministic and leaves root still',()=>{const m={phase:.7,motion:1,lowGrass:0,leaf:1},b=[.1,1,2,3],w=[1,1,1,1],root=new T.Vector3(.02,0,.03);assert.deepEqual(flowPoint(root.clone(),b,w,m,30),root);for(let time=0;time<120;time+=.1){const p=new T.Vector3(.02,.3,.03),q=flowPoint(p.clone(),b,w,m,time);assert.ok(q.distanceTo(p)<.01);assert.deepEqual(q,flowPoint(p.clone(),b,w,m,time));}});
