import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PlantLayout} from '../src/layout.js';
import {createHabitat,vec} from '../src/habitat.js';
import {CreatureWorld,validateGame} from '../src/creatures.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../public/assets/'+n,import.meta.url)));
const pack=read('scene.json'),seed=read('behavior.json'),source=read('layout.json'),raw=fs.readFileSync(new URL('../public/assets/geometry.bin',import.meta.url)),buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const habitat=await createHabitat(pack,buffer),model=new PlantLayout(pack,buffer,seed,source,habitat),plant=source.plants.find(p=>p.record.UniqueId==='0c99a3418eb243ccafbe47f737b57daa'),id=plant.record.UniqueId;

test('every saved plant including primary maps uniquely; no edits retain every original field',()=>{
 assert.equal(new Set(source.plants.map(p=>p.node)).size,89);assert.equal(source.hardscape.length,8);
 const unity=JSON.parse(fs.readFileSync(new URL('../tools/seed.json',import.meta.url)));assert.deepEqual(model.records([]),unity.Tank.Plants);
 for(const p of source.plants){assert.equal(pack.nodes[p.node].parent,-1);assert.deepEqual(model.pose(p).p.toArray(),pack.nodes[p.node].p);}
});
test('invalid edits reject foreign identity, nonfinite coordinates, duplicate ids, tank edges, crowding and wood cover',()=>{
 for(const bad of [null,[{id:'missing',x:0,z:0,yaw:0}],[{id,x:NaN,z:0,yaw:0}],[{id,x:0,z:0,yaw:9}],[{id,x:0,z:0,yaw:0},{id,x:0,z:0,yaw:0}]])assert.throws(()=>model.validate(bad));
 assert.throws(()=>model.edit([],id,.59,-.1,0));
 const other=source.plants.find(p=>p!==plant),n=pack.nodes[other.node];assert.throws(()=>model.edit([],id,n.p[0],n.p[2],0));
 let blocked=0;for(const s of habitat.surfaces.filter(s=>s.solid)){const c=s.box.getCenter(vec([0,0,0]));try{model.edit([],id,c.x,c.z,0);}catch(e){if(e.message.includes('木石'))blocked++;}}
 assert.ok(blocked>0);
});
test('plant edit moves contact anchors, reuses untouched BVHs, preserves food/identities and safely restores',async()=>{
 const before=JSON.stringify(pack),layout=model.edit([],id,.42,-.18,.25),start=performance.now(),candidate=await model.prepare(layout),world=new CreatureWorld(seed,habitat);world.dropFood();
 model.ensureUnoccupied([],layout,world);const saved=world.snapshot(),next=model.relocate(saved,seed,candidate);
 assert.equal(JSON.stringify(pack),before);assert.equal(candidate.seed.anchors.length,seed.anchors.length);assert.deepEqual(next.snapshot().food,saved.food);assert.deepEqual(next.snapshot().pellet,saved.pellet);
 assert.deepEqual(next.agents.map(a=>a.data.Needs),world.agents.map(a=>a.data.Needs));assert.deepEqual(next.agents.map(a=>a.data.Personality),world.agents.map(a=>a.data.Personality));
 const changed=candidate.habitat.surfaces.filter(s=>!habitat.surfaces.includes(s));assert.ok(changed.length>0&&changed.length<5);
 for(const s of changed)assert.equal(model.rootForNode[s.node],plant.node);
 const indices=seed.anchors.map((a,i)=>({a,i})).filter(({a})=>a.owner.startsWith('Plant ')&&model.rootForNode[Number(a.owner.slice(6))]===plant.node);
 assert.ok(indices.length>0);for(const {a,i} of indices){const b=candidate.seed.anchors[i];assert.ok(vec(b.position).distanceTo(vec(a.position))>.1);assert.ok(candidate.habitat.closest(vec(b.position),.0001));}
 const records=model.records(layout),record=records.find(p=>p.UniqueId===id);assert.equal(record.Growth,plant.record.Growth);assert.deepEqual(record.Scale,plant.record.Scale);assert.deepEqual(record.Cuts,plant.record.Cuts);
 const reloaded=await model.prepare(layout);assert.deepEqual(reloaded.seed.anchors,candidate.seed.anchors);assert.doesNotThrow(()=>new CreatureWorld(reloaded.seed,reloaded.habitat,next.snapshot()));
 for(let i=0;i<1200;i++)next.step(.05);assert.doesNotThrow(()=>validateGame(next.snapshot(),candidate.seed));assert.ok(next.agents.every(a=>candidate.habitat.depth(a.position,a.rotation)<=.000301));
 const restored=await model.prepare([]);assert.equal(restored.habitat,habitat);assert.equal(restored.seed,seed);
 fs.writeFileSync(new URL('../evidence/layout-core.json',import.meta.url),JSON.stringify({plants:89,changedSurfaces:changed.length,reusedSurfaces:candidate.habitat.surfaces.length-changed.length,anchors:candidate.seed.anchors.length,checks:'records, validation, support, graph, immutable source, roundtrip, 60s simulation',milliseconds:performance.now()-start},null,2));
});
test('moving a plant currently occupied by a shrimp is rejected before mutation',()=>{
 const w=new CreatureWorld(seed,habitat),s=habitat.surfaces.find(s=>model.rootForNode[s.node]===plant.node),p=vec([0,0,0]).fromBufferAttribute(s.geo.attributes.position,0);w.agents[0].position.copy(p);
 assert.throws(()=>model.ensureUnoccupied([],model.edit([],id,.42,-.18,0),w),/有虾/);
});
