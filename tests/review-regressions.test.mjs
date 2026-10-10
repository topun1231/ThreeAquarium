import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {createHabitat, reconnectGraph} from '../src/habitat.js';
import {CreatureWorld} from '../src/creatures.js';
import {resizePopulation} from '../src/population.js';
import {applyAgentScales, shrimpBodyScale} from '../src/shrimp-scale.js';
import {emptyColony, syncRoster, sanitizeColony} from '../src/care.js';
import {FloraView} from '../src/flora-view.js';
import {PlantContacts} from '../src/plant-contacts.js';
import {createPearling} from '../src/pearling.js';
import {TankRuntime} from '../src/tank-runtime.js';

const read = name => JSON.parse(fs.readFileSync(new URL('../public/assets/'+name, import.meta.url)));
const seed = read('behavior.json'), pack = read('scene.json');
const raw = fs.readFileSync(new URL('../public/assets/geometry.bin', import.meta.url));
const habitat = await createHabitat(pack, raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength));

test('resize clones the original rig scale and removing unregistered eggs preserves scenery', () => {
  const world = new CreatureWorld(seed, habitat), colony = syncRoster(emptyColony(), world.agents);
  colony.shrimp[world.agents[0].data.CreatureId].ageDays = 0;
  applyAgentScales(world, colony);
  const root = new T.Group(), fixed = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
  const animals = world.agents.map(agent => {
    const rig = new T.Group(), skin = new T.Mesh(new T.BoxGeometry(.01,.01,.01), [new T.MeshStandardMaterial()]);
    rig.add(skin); rig.scale.setScalar(2*agent.scale); root.add(rig);
    return {id:agent.data.CreatureId,rig,baseScale:2,mixer:new T.AnimationMixer(rig),actions:new Map()};
  });
  const aq = {root, animals, meshes:[...animals.map(a=>a.rig.children[0]),fixed]};
  const more = resizePopulation(aq, world, 10); more.commit();
  for (let i=5;i<10;i++) assert.ok(Math.abs(aq.animals[i].rig.scale.x/2-more.world.agents[i].scale)<1e-9);
  const eggs = new T.Mesh(new T.SphereGeometry(.001), new T.MeshStandardMaterial());
  eggs.name='Shrimp eggs'; eggs.userData.eggs=true; aq.animals[9].rig.add(eggs);
  let disposed=0;eggs.geometry.addEventListener('dispose',()=>disposed++);
  const fewer = resizePopulation(aq,more.world,5); fewer.commit();
  assert.equal(disposed,1); assert.ok(aq.meshes.includes(fixed));
  assert.equal(aq.meshes.length,6); assert.equal(aq.animals.length,5);
});

test('newborns use juvenile support from placement onward and persist valid colony records', () => {
  const world=new CreatureWorld(seed,habitat),colony=syncRoster(emptyColony(),world.agents);
  applyAgentScales(world,colony);
  const aq={root:new T.Group(),animals:[],templates:[{rig:new T.Group(),actions:new Map(),baseScale:1}],meshes:[]};
  const latest=structuredClone(colony),mother=world.agents[0].data.CreatureId;colony.shrimp[mother].hatchAt=0;latest.shrimp[mother].hatchAt=null;
  const result=resizePopulation(aq,world,6,{newborn:true,colony:latest}),baby=result.world.agents[5];
  assert.equal(result.world.colony.shrimp[mother].hatchAt,null,'a hatch cannot restore the stale deadline and hatch repeatedly');
  assert.equal(baby.scale,shrimpBodyScale({id:baby.data.CreatureId,ageDays:0}));
  assert.ok(baby.scale<.6);
  assert.doesNotThrow(()=>sanitizeColony(result.world.colony));
  const restored=new CreatureWorld(result.seed,habitat,result.world.snapshot(),result.world.colony);
  assert.equal(restored.agents[5].scale,baby.scale);result.dispose();
});

test('host validation transforms native units and rejects off-host or off-tank attachments', () => {
  const host=new T.Mesh(new T.BoxGeometry(200,40,100),new T.MeshBasicMaterial());host.scale.set(.001,.001,.001);host.position.y=.04;
  const runtime={hardscape:()=>host},tank={Hardscape:[{UniqueId:'wood'}],Flora:[{Host:'wood',Local:[50,20,0]}]};
  assert.doesNotThrow(()=>TankRuntime.prototype.validateFloraHosts.call(runtime,tank));
  tank.Flora[0].Local=[500,20,0];assert.throws(()=>TankRuntime.prototype.validateFloraHosts.call(runtime,tank),/超出木石/);
  tank.Flora[0].Local=[1000,20,0];assert.throws(()=>TankRuntime.prototype.validateFloraHosts.call(runtime,tank),/超出木石/);
});

test('new plant leaves and curved stems have connected support all the way to their tips', async () => {
  const flora=new FloraView({root:new T.Group(),materials:[]}),r={UniqueId:'stem',Species:'rotala',Variant:0,Yaw:.3,Scale:1,Hue:0,Nodes:16,X:.2,Z:.1};
  const scene={soil:{sample:()=>.04},entities:new Map(),habitat:{surfaces:[]}};
  flora.build([r],scene);const items=flora.collisionItems([r],scene);
  const h=await createHabitat(null,null,()=>{},null,items),anchors=[],cells=new Set();
  for(const point of items[0].samples){const hit=h.closest(point,.001);if(!hit)continue;if(hit.normal.y<0)hit.normal.negate();const key=hit.point.toArray().map(n=>Math.round(n/.012)).join(':');if(cells.has(key))continue;cells.add(key);anchors.push({position:hit.point,normal:hit.normal,owner:hit.surface.owner,kind:3,flora:true,food:.6,edges:[]});}
  reconnectGraph(h,anchors);
  assert.ok(anchors.some(a=>a.position.y>.14&&a.edges.length),'tip anchors have graph edges');
  const before=h.surfaces[0].box.max.y;r.Nodes=24;const grown=flora.collisionItems([r],scene)[0];grown.geometry.computeBoundingBox();assert.ok(grown.geometry.boundingBox.max.y>before);
  const site=flora.pearlSites()[0];assert.ok(h.closest(new T.Vector3(site.x,site.y,site.z),1e-6));
  const world={habitat:h,anchors,agents:[{position:new T.Vector3(site.x,site.y+.005,site.z),route:[],rotation:new T.Quaternion(),swim:{},scale:1}],sync(){}};
  flora.update(3);new PlantContacts().update(world,{pack,geometries:[]},3);
  const moved=site.resolve();assert.ok(h.closest(moved,1e-6),'swaying collision follows rendered leaf');
  for(const s of h.surfaces){s.geo.dispose();s.source.dispose();}grown.geometry.dispose();
});

test('growing an instancing buffer disposes replaced geometry and pearl sites follow replacement', () => {
  const flora=new FloraView({root:new T.Group(),materials:[]}),scene={soil:{sample:()=>.04},entities:new Map(),habitat:{surfaces:[]}},r={UniqueId:'stem',Species:'rotala',Variant:0,Yaw:0,Scale:1,Hue:0,Nodes:14,X:0,Z:0};
  flora.build([r],scene);const sites=flora.pearlSites(),watched=[...flora.meshes].map(([key,e])=>({key,geo:e.mesh.geometry,disposed:0}));
  for(const w of watched)w.geo.addEventListener('dispose',()=>w.disposed++);
  r.Nodes=30;r.X=.1;flora.build([r],scene);
  const replaced=watched.filter(w=>flora.meshes.get(w.key).mesh.geometry!==w.geo);
  assert.ok(replaced.length);assert.ok(replaced.every(w=>w.disposed===1));
  const live=sites.map(s=>s.resolve()).filter(Boolean);assert.ok(live.length);assert.ok(live.every(p=>p.x>.05),'surviving attachment follows current instance after rebuild');
  flora.build([],scene);assert.equal(sites[0].resolve(),null);
});

test('a shrimp can reach the new stem from substrate across a ground-to-stem transition', async () => {
  const flora=new FloraView({root:new T.Group(),materials:[]}),scene={soil:{sample:()=>.037},entities:new Map(),habitat:{surfaces:[]}};
  const r={UniqueId:'8083004d56664383912caef72cf2972b',Species:'rotala',Variant:0,Yaw:-1.485,Scale:1,Hue:0,Nodes:12,X:-.4996,Z:-.0600};
  const items=flora.collisionItems([r],scene),floor=new T.PlaneGeometry(1.2,.6).rotateX(-Math.PI/2).translate(0,.037,0);
  const h=await createHabitat(null,null,()=>{},null,[{node:'ground',owner:'ground',kind:0,solid:false,geometry:floor,transform:new T.Matrix4()},...items]);
  const anchors=[{position:new T.Vector3(-.501,.037,-.042),normal:new T.Vector3(0,1,0),owner:'ground',kind:0,edges:[]}],cells=new Set();
  for(const point of items[0].samples){const hit=h.closest(point,.001);if(!hit||hit.surface.kind!==3)continue;if(hit.normal.y<0)hit.normal.negate();const key=hit.point.toArray().map(n=>Math.round(n/.012)).join(':');if(cells.has(key))continue;cells.add(key);anchors.push({position:hit.point,normal:hit.normal,owner:hit.surface.owner,kind:3,flora:true,edges:[]});}
  reconnectGraph(h,anchors);const queue=[0],seen=new Set(queue);for(let i=0;i<queue.length;i++)for(const j of anchors[queue[i]].edges)if(!seen.has(j)){seen.add(j);queue.push(j);}
  assert.ok(queue.some(i=>anchors[i].kind===3&&anchors[i].position.y>.08));
  for(const s of h.surfaces){s.geo.dispose();if(s.ownedSource)s.source.dispose();}floor.dispose();
});

test('clinging pearls follow live leaf sites, detach independently, and vanish when the leaf is deleted', () => {
  let point=new T.Vector3(.1,.08,.02),light=true;
  const pearls=createPearling({root:new T.Group(),sites:()=>[{...point,resolve:()=>point}],lightOn:()=>light});
  pearls.update(.1,1);const first=pearls.group.children.find(m=>m.visible);assert.ok(first);
  point=new T.Vector3(.2,.1,.04);pearls.update(.1,1.1);assert.deepEqual(first.position.toArray(),point.toArray());
  first.userData.cling=.15;pearls.update(.1,1.2);const origin=first.userData.origin.clone();point=new T.Vector3(.5,.4,.2);pearls.update(.1,1.3);assert.ok(first.position.x<.3);assert.ok(first.position.y>origin.y);
  first.userData.life=0;first.userData.cling=5;point=null;pearls.update(.1,1.4);assert.equal(first.visible,false);
  light=false;pearls.update(.1,1.5);assert.equal(pearls.stats().alive,0);
});
