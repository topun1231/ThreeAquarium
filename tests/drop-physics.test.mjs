import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createDropWorld,dropSignature} from '../src/drop-physics.js';

const mesh=g=>({vertices:g.attributes.position.array.slice(),indices:new Uint32Array(g.index.array)});
const box=(id,x,y,width,height,depth)=>({id,key:id,position:[x,y,0],rotation:{x:0,y:0,z:0,w:1},meshes:[mesh(new T.BoxGeometry(width,height,depth))]});
const ground={rows:2,columns:2,width:1.2,depth:.6,heights:new Float32Array(4).fill(.04)};
test('fixed collision shapes discard unused vertices and keep the same directed triangles',async()=>{
 const base=box('base',0,.08,.08,.08,.08),mesh=base.meshes[0];
 const positions=new Float32Array(mesh.vertices.length*2);
 for(let i=0;i<mesh.vertices.length;i+=3)positions.set(mesh.vertices.subarray(i,i+3),i*2+3);
 const indices=mesh.indices.map(i=>2*i+1);
 base.meshes=[{vertices:positions,indices}];
 const shapes=new Map(),world=await createDropWorld({ground,bodies:[base]},shapes);
 try{
  const shape=shapes.get('base:0:true');
  assert.equal(shape.vertices.length,new Set(indices).size*3);
  const triangles=({vertices,indices})=>Array.from(indices,i=>vertices.slice(3*i,3*i+3).join(','));
  assert.deepEqual(triangles(shape),triangles(mesh));
 }finally{world.dispose();}
});
test('prepared collision world restores independent bodies at new poses and invalidates changed ground or roles',async()=>{
 const input={ground,bodies:[box('base',-.12,.08,.08,.08,.08),box('drop',0,.3,.08,.08,.08)],wake:['drop']};
 const original=await createDropWorld(input),prepared=original.snapshot();original.step();original.dispose();
 const next=structuredClone(input);next.bodies[0].position[0]=.12;next.bodies[1].position[0]=.12;next.bodies[1].id='new';next.wake=['new'];
 assert.equal(dropSignature(input),dropSignature(next));
 const cold=await createDropWorld(next),warm=await createDropWorld(next,new Map(),prepared),ready=await createDropWorld(input);
 ready.release(next.bodies);
 try{for(let i=0;i<500;i++){const a=cold.step(),b=warm.step();assert.deepEqual(b,a);assert.deepEqual(ready.step(),a);if(a.done)break;}}
 finally{cold.dispose();warm.dispose();ready.dispose();}
 const changed=structuredClone(next);changed.ground.heights.fill(.1);changed.wake=['base','new'];
 assert.notEqual(dropSignature(changed),prepared.signature);
 const rebuilt=await createDropWorld(changed,new Map(),prepared);
 try{assert.equal(rebuilt.world.getRigidBody(prepared.handles[0]).isDynamic(),true);}
 finally{rebuilt.dispose();}
});
test('gravity shows falling then rests on soil without a support eligibility test',async()=>{
 const sim=await createDropWorld({ground,bodies:[box('drop',0,.3,.08,.08,.08)],wake:['drop']});
 try{
  let frame,low=.3;
  for(let i=0;i<1441;i++){frame=sim.step();low=Math.min(low,frame.poses[0].position[1]);if(frame.done)break;}
  assert.ok(frame.done);assert.ok(low<.1);assert.ok(Math.abs(frame.poses[0].position[1]-.08)<.002);
 }finally{sim.dispose();}
});

test('fixed concave wood preserves an opening for a falling stone',async()=>{
 const pieces=[new T.BoxGeometry(.04,.20,.20).translate(-.10,.15,0),new T.BoxGeometry(.04,.20,.20).translate(.10,.15,0),new T.BoxGeometry(.24,.20,.04).translate(0,.15,.12)];
 const geometry=mergeGeometries(pieces),wood={id:'wood',key:'wood',wood:true,position:[0,0,0],rotation:{x:0,y:0,z:0,w:1},meshes:[mesh(geometry)]};
 const sim=await createDropWorld({ground,bodies:[wood,box('stone',0,.35,.04,.04,.04)],wake:['stone']});
 try{let frame;for(let i=0;i<1441;i++){frame=sim.step();if(frame.done)break;}assert.ok(frame.done);assert.ok(Math.abs(frame.poses[1].position[1]-.06)<.002);assert.deepEqual(frame.poses[0].position,[0,0,0]);}
 finally{sim.dispose();geometry.dispose();pieces.forEach(g=>g.dispose());}
});
test('one-sided beam tips onto the lower floor while a supported bridge keeps its gap',async()=>{
 for(const bridge of [false,true]){
  const bodies=[box('left',-.12,.082,.10,.08,.16),...(bridge?[box('right',.12,.082,.10,.08,.16)]:[]),box('beam',0,.15,.36,.025,.05)];
  const sim=await createDropWorld({ground,bodies,wake:['beam']});
  try{let frame,turned=false;
   for(let i=0;i<1441;i++){frame=sim.step();const beam=frame.poses.at(-1);turned ||= Math.abs(beam.rotation.z)>.1;if(frame.done)break;}
   assert.ok(frame.done);
   if(bridge){assert.ok(frame.poses.at(-1).position[1]>.12);assert.equal(turned,false);}
   else {assert.ok(turned,JSON.stringify(frame));assert.ok(frame.poses.at(-1).position[1]<.12);}
  }finally{sim.dispose();}
 }
});
