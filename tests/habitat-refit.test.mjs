import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {createHabitat} from '../src/habitat.js';

const build=(item,reuse=null)=>createHabitat(null,null,()=>{},reuse,[item]);
const dispose=h=>h.surfaces.forEach(s=>s.geo.dispose());
const item=()=>({node:'stone',owner:'stone',solid:true,kind:1,geometry:new T.TorusKnotGeometry(.04,.012,80,8),transform:new T.Matrix4()});
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
