import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {createHabitat,paths,route,face,head,up} from '../src/habitat.js';
import {CreatureWorld,scores,validateGame} from '../src/creatures.js';
import {tickSwim} from '../src/swimming.js';
const pack=JSON.parse(fs.readFileSync(new URL('../public/assets/scene.json',import.meta.url))),seed=JSON.parse(fs.readFileSync(new URL('../public/assets/behavior.json',import.meta.url))),raw=fs.readFileSync(new URL('../public/assets/geometry.bin',import.meta.url));
const habitat=await createHabitat(pack,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const make=()=>new CreatureWorld(seed,habitat);

test('restoring a swimming pose cannot leave a resting shrimp suspended above its surface',()=>{
 const w=make(),saved=w.snapshot(),a=saved.creatures[0],before=a.Position.y;
 a.Position.y+=.014;a.ExecutionState='RoutineSwim';
 const restored=new CreatureWorld(seed,habitat,saved).agents[0];
 assert.ok(restored.position.y<before+.008);assert.equal(restored.swim,null);
});

test('blocked return turn lands gradually instead of ending the swim in midair',()=>{
 const a={position:new T.Vector3(0,.12,0),rotation:new T.Quaternion(),swim:{kind:'RoutineSwim',returning:true,turning:true,clock:0,wait:0,start:new T.Vector3(.1,0,0),landing:{position:new T.Vector3(0,0,0)}}};
 let arrivals=0;
 const world={agents:[a],anchors:[{position:new T.Vector3(),edges:[1]}],sync(){},arrive(){arrivals++;},habitat:{traverse:(p,q,n,r)=>p.distanceTo(n)>0&&q.angleTo(r)<1e-8,cast:()=>({point:new T.Vector3(0,.0014,0),normal:up}),support:()=>({position:new T.Vector3(0,.0014,0),rotation:new T.Quaternion()})}};
 for(let i=0;i<150&&a.swim;i++){const before=a.position.clone();tickSwim(world,a,.05);assert.ok(a.position.distanceTo(before)<=.001251);if(arrivals)assert.ok(a.position.y<.0015);}
 assert.equal(arrivals,1);assert.equal(a.swim,null);
});
test('swim takeoff levels the whole body even when its head already points ahead',()=>{
 const a={position:new T.Vector3(0,.12,0),rotation:new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI),swim:{kind:'RoutineSwim',direction:new T.Quaternion(),returning:false,turning:true,clock:0,wait:0}};
 const world={agents:[a],habitat:{traverse:()=>true},sync(){}};
 tickSwim(world,a,.05);
 assert.equal(a.swim.turning,true,'matching headings must not let a belly-up shrimp depart');
 for(let i=0;i<40&&a.swim.turning;i++)tickSwim(world,a,.05);
 assert.equal(a.swim.turning,false);
 assert.ok(up.clone().applyQuaternion(a.rotation).y>.9);
});

test('swimming only finishes after the body aligns to its landing surface',()=>{
 for(const kind of ['RoutineSwim','EscapeSwim'])for(const returning of [false,true]){
  const surface=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2);
  const start=new T.Vector3(0,.08,0),end=new T.Vector3(.06,.08,0);
  const a={position:(returning?end:start).clone(),rotation:new T.Quaternion(),data:{},swim:{kind,start,rotation:surface.clone(),direction:new T.Quaternion(),control:new T.Vector3(.03,.12,0),landing:{position:end,rotation:surface.clone()},target:1,origin:0,t:returning?1:0,duration:1.1,wait:0,returning,turning:false,clock:0}};
  let arrivals=0;
  const world={agents:[a],elapsed:0,habitat:{traverse:()=>true},sync(){},arrive(){arrivals++;assert.ok(a.rotation.angleTo(surface)<.01,`${kind} returning=${returning} must align before arrival`);}};
  for(let i=0;i<200&&a.swim;i++)tickSwim(world,a,.05);
  assert.equal(arrivals,1);
  assert.ok(a.position.distanceTo(returning?start:end)<1e-8);
 }
});

test('vertical or zero travel still produces a finite supported orientation',()=>{
 for(const normal of [up,new T.Vector3(1,0,0),new T.Vector3(0,0,1)])for(const travel of [normal,normal.clone().negate(),new T.Vector3()]){
  const q=face(travel,normal);
  assert.ok(Math.abs(q.length()-1)<1e-8);
  assert.ok(up.clone().applyQuaternion(q).dot(normal)>.99999);
  assert.ok(Math.abs(head(q).dot(normal))<1e-8);
 }
});

test('utility scores retain Unity species coefficients',()=>{
 const data=structuredClone(seed.creatures[0]);Object.assign(data.Needs,{Hunger:.8,Fatigue:.2,Monotony:.3,Stress:.4,GroomNeed:.5});for(const k in data.Personality)data.Personality[k]=1;
 const s=scores(data,{food:.6,cover:.5,knows:true},seed.profile);
 assert.ok(Math.abs(s.Graze-1.59)<1e-9);assert.ok(Math.abs(s.Hide-.8)<1e-9);assert.ok(Math.abs(s.Groom-.5735)<1e-9);assert.ok(Math.abs(s.Rest-.413)<1e-9);
});
test('head is -X and path query respects cooled edges',()=>{
 for(const dir of [new T.Vector3(1,0,0),new T.Vector3(0,0,-1),new T.Vector3(-1,0,0)])assert.ok(head(face(dir,up)).dot(dir)>.99999);
 const anchors=[0,1,2].map(x=>({position:new T.Vector3(x,0,0),edges:x===1?[0,2]:[1]}));const open=paths(anchors,0);assert.deepEqual(route(open.previous,0,2),[1,2]);assert.equal(paths(anchors,0,Infinity,(a,b)=>a!==1||b!==2).costs.has(2),false);
});
test('food discovery is staggered; feeding changes hunger only when grazing',()=>{
 const w=make();w.dropFood();assert.equal(w.pellet.age,0);assert.equal(new Set(w.agents.map(a=>a.discoveryAt)).size,5);assert.ok(w.agents.every(a=>a.discoveryAt>=4&&!w.knows(a)));
 const a=w.agents[0];a.data.ExecutionState='Graze';a.data.CurrentIntent='Graze';a.hold=100;a.data.Needs.Hunger=.8;w.anchors[a.at].food=.8;
 w.step(.05);assert.ok(a.data.Needs.Hunger<.8);assert.ok(w.metrics.consumed>0);const b=w.agents[1];b.data.ExecutionState='Groom';b.hold=100;b.data.Needs.GroomNeed=.8;w.step(.05);assert.ok(b.data.Needs.GroomNeed<.8);
});
test('snapshot validation preserves identities and rejects malformed inputs before mutation',()=>{
 const w=make(),s=w.snapshot();assert.deepEqual(validateGame(s,seed),s);const restored=new CreatureWorld(seed,habitat,s);assert.deepEqual(restored.agents.map(a=>a.data.Personality),seed.creatures.map(a=>a.Personality));assert.deepEqual(restored.agents.map(a=>a.at),w.agents.map(a=>a.at));assert.deepEqual(restored.agents.map(a=>a.position.toArray()),w.agents.map(a=>a.position.toArray()));
 for(const mutate of [s=>s.tankId='other',s=>s.creatures[0].Needs.Hunger=NaN,s=>s.creatures[0].Personality.Activity=99,s=>s.creatures[1].CreatureId=s.creatures[0].CreatureId,s=>s.creatures[0].Position.x=.9,s=>s.food.pop(),s=>s.pellet={anchor:99999,age:0}]){const bad=structuredClone(s);mutate(bad);assert.throws(()=>validateGame(bad,seed));}
 assert.deepEqual(w.snapshot(),s);
});
test('ten-minute real-scene run retains safe surfaces, independent behavior and useful movement',()=>{
 const w=make(),start=w.agents.map(a=>a.position.clone()),travel=w.agents.map(()=>0),states=w.agents.map(()=>new Set());let maxDepth=0,reverse=0;w.dropFood();const begin=performance.now();
 for(let i=0;i<12000;i++){
  const old=w.agents.map(a=>({p:a.position.clone(),q:a.rotation.clone()}));w.step(.05);
  for(const [j,a] of w.agents.entries()){
   const delta=a.position.clone().sub(old[j].p);travel[j]+=delta.length();states[j].add(a.data.ExecutionState);assert.ok(a.position.toArray().every(Number.isFinite));
   if(a.speed>0&&!a.swim){const normal=up.clone().applyQuaternion(old[j].q).add(up.clone().applyQuaternion(a.rotation)).normalize(),heading=head(old[j].q).add(head(a.rotation)).projectOnPlane(normal).normalize();if(delta.projectOnPlane(normal).dot(heading)<-1e-6)reverse++;}
   if(i%10===0)maxDepth=Math.max(maxDepth,habitat.depth(a.position,a.rotation,a.scale));
  }
 }
 const result={seconds:600,computeMs:performance.now()-begin,maxBodyPenetrationMetres:maxDepth,reverseTranslationSteps:reverse,totalTravelMetres:travel,netTravelMetres:w.agents.map((a,i)=>a.position.distanceTo(start[i])),states:states.map(s=>[...s]),metrics:w.metrics};
 fs.writeFileSync(new URL('../evidence/behavior-longrun.json',import.meta.url),JSON.stringify(result,null,2));
 assert.ok(maxDepth<=.000301,JSON.stringify(result));assert.equal(reverse,0);assert.ok(travel.every(d=>d>.04));assert.ok(w.metrics.consumed>1);assert.ok(states.every(s=>s.has('Walk')&&s.has('Groom')));assert.ok(!w.pellet);assert.doesNotThrow(()=>validateGame(w.snapshot(),seed));
});

test('rounded REAL002 proxy registers the wood lip contact within tolerance',()=>{
 const p=new T.Vector3(.22392576059754318,.04336130551949709,-.03370120909589011),q=new T.Quaternion(-.09298824065624844,.7614719027129314,-.018082825960406383,.6412384423002799);
 const depth=habitat.depth(p,q);assert.ok(depth>.00005&&depth<=.0003,'Calibrated proxy registers the shallow contact');
});

test('online ecological credit still reaches manually observed shrimp and food surfaces',()=>{const w=make();for(const a of w.agents)a.manual='Rest';const a=w.agents[0];a.data.Needs.Hunger=.2;a.data.Needs.Stress=.3;w.anchors[0].food=0;w.step(.1);assert.ok(Math.abs(a.data.Needs.Hunger-(.2+.1/3600*seed.profile.EcologicalHungerPerHour))<1e-12);assert.ok(a.data.Needs.Stress<.3);assert.ok(w.anchors[0].food>0);});
