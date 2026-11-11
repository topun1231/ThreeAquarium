import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadAquarium} from '../src/assets.js';
import {TankRuntime} from '../src/tank-runtime.js';
import {dropGeometry} from '../src/hardscape-drop.js';
import {highestDetailDraws} from '../src/asset-lod.js';
import {createDropWorld} from '../src/drop-physics.js';

test('real small boulder tips off a dense branch end instead of sleeping on its side contact',async()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../public/assets/catalog.json',import.meta.url)));
 const records=[
  {UniqueId:'branch',TypeId:'branch_driftwood__large__original',Position:{x:.1326684356,y:-.043773815,z:-.0740469396},Rotation:{x:28.5108387,y:-11.4537762,z:-6.0840262},Scale:{x:1,y:1,z:1}},
  {UniqueId:'stone',TypeId:'boulder_01__small__original',Position:{x:-.1535835266,y:.3171117568,z:.0985815451},Rotation:{x:-1.78432256,y:.87062232,z:-28.4477434},Scale:{x:1,y:1,z:1}},
 ];
 const roots=records.map(r=>catalog.entries.find(e=>e.key===r.TypeId).root),pack=catalog.assets;
 const draws=highestDetailDraws(pack).filter(d=>{for(let i=d.node;i>=0;i=pack.nodes[i].parent)if(roots.includes(i))return true;return false;});
 const indices=[...new Set(draws.map(d=>d.geo))],bytes=fs.readFileSync(new URL('../public/assets/catalog-geometry.bin',import.meta.url));
 const assets=await loadAquarium(()=>{},{pack:{...pack,materials:[],animals:[],geometries:indices.map(i=>pack.geometries[i]),draws:draws.map(d=>({...d,geo:indices.indexOf(d.geo),materials:[]}))},buffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 const runtime={current:{},catalog:assets,entries:new Map(catalog.entries.map(e=>[e.key,e])),cloneOriginal:()=>null,hardscape:TankRuntime.prototype.hardscape};
 const bodies=dropGeometry(runtime,records).map(e=>e.body),origin=[...bodies[1].position],shapes=new Map();
 let prepared;
 try{
  for(const [dx,dz] of [[0,0],[.02,0],[0,-.02],[.02,-.02]]){
   bodies[1].position=[origin[0]+dx,(dx!==0||dz!==0) ? .3301792047304915 : origin[1],origin[2]+dz];
   const sim=await createDropWorld({bodies,wake:['stone'],ground:{rows:2,columns:2,width:1.2,depth:.6,heights:new Float32Array(4).fill(.04)}},shapes,prepared);
   prepared??=sim.snapshot();
   try{
    let frame,turned=false;
    for(let i=0;i<360;i++){frame=sim.step();const q=frame.poses[1].rotation,initial=bodies[1].rotation;turned ||= Math.abs(q.x*initial.x+q.y*initial.y+q.z*initial.z+q.w*initial.w)<.95;if(frame.done)break;}
    assert.ok(frame.done,`stone at ${dx},${dz} must settle within three simulated seconds`);
    assert.ok(frame.poses[1].position[1]<.14,JSON.stringify(frame.poses[1]));
    assert.ok(turned,'stone must tip before settling');
    assert.deepEqual(frame.poses[0].position,bodies[0].position.map(Math.fround),'fixed branch stays in place');
   }finally{sim.dispose();}
  }
 }finally{assets.geometries.forEach(g=>g.dispose());}
});
