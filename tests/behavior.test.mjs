import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {createHabitat,paths,route,face,head,up} from '../src/habitat.js';
import {CreatureWorld,scores,validateGame} from '../src/creatures.js';
import {scheduleSwim,startSwim,tickSwim} from '../src/swimming.js';
import {seatNewIndividuals} from '../src/population.js';
import {PELLET_SINK_SECONDS} from '../src/feeding-pellet.js';
import {MATURITY_DAYS} from '../src/care.js';
import {advanceCreatureEcology,ecologySeconds} from '../src/ecology.js';
const pack=JSON.parse(fs.readFileSync(new URL('../public/assets/scene.json',import.meta.url))),seed=JSON.parse(fs.readFileSync(new URL('../public/assets/behavior.json',import.meta.url))),raw=fs.readFileSync(new URL('../public/assets/geometry.bin',import.meta.url));
const habitat=await createHabitat(pack,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const make=()=>new CreatureWorld(seed,habitat);

function nurseryPatch(positions=[0,.06,.14,.22,.34,.52]) {
 const world=make(), shrimp=world.agents[0], record={ageDays:0};
 world.anchors=positions.map((x,i)=>({
  position:new T.Vector3(x,.1,0),normal:up,kind:0,zone:'Centre',owner:'soil',food:.32+i*.13,cover:i===3?1:0,
  edges:[i-1,i+1].filter(n=>n>=0 && n<positions.length),
 }));
 world.agents=[shrimp];world.colony={shrimp:{[shrimp.data.CreatureId]:record}};
 world.habitat={support:(position,normal,rotation)=>({position,rotation}),traverse:()=>true};
 shrimp.at=0;shrimp.position.copy(world.anchors[0].position);shrimp.rotation.identity();shrimp.phase=0;
 return {world,shrimp,record};
}

test('local grazing and exploration widen with age while a hatchling can still reach shelter',()=>{
 const {world,shrimp,record}=nurseryPatch();
 for(const [age,target] of [[0,1],[MATURITY_DAYS/2,2],[MATURITY_DAYS,3],[120,3]]){
  record.ageDays=age;
  const seen=world.observe(shrimp);
  assert.deepEqual([seen.food,seen.explore,seen.cover],[target,target,3]);
 }
 delete world.colony.shrimp[shrimp.data.CreatureId];
 assert.equal(world.observe(shrimp).explore,3,'an older save without age uses the adult range');
});

test('juveniles can take a sparse first step and keep their cooldowns on blocked routes',()=>{
 const {world,shrimp}=nurseryPatch();
 world.anchors[0].edges=[1,2];world.reject(shrimp,1,2,true);
 const open=world.observe(shrimp);
 assert.deepEqual([open.food,open.explore],[2,2]);
 assert.ok(!open.graph.previous.has(1) || open.graph.previous.get(1)!==0);
 world.anchors[0].edges=[1];
 const isolated=world.observe(shrimp);
 assert.deepEqual([isolated.food,isolated.explore],[0,0]);
});

test('a young shrimp notices a distant meal on its own clock and ignores unrelated distant grazing spots',()=>{
 const {world,shrimp}=nurseryPatch();
 world.anchors[3].food=1;
 assert.ok(world.dropFood(world.anchors[5].position));
 assert.equal(world.observe(shrimp).food,1);
 world.elapsed=shrimp.discoveryAt;
 const seen=world.observe(shrimp);
 assert.equal(seen.food,5,'can walk to the actual meal');
 assert.equal(seen.explore,1,'recognising food does not send a newborn exploring across the tank');
 shrimp.data.Needs.Hunger=1;world.decide(shrimp);
 assert.equal(shrimp.data.CurrentIntent,'Graze');assert.equal(shrimp.route.at(-1),5);
});

test('voluntary swim distance grows but even a newborn can flee farther when startled',()=>{
 const {world,shrimp,record}=nurseryPatch([0,.04,.09,.16]);
 const swimAt=age=>{
  record.ageDays=age;shrimp.swim=null;shrimp.route=[];shrimp.swimAttempts=0;
  shrimp.data.ExecutionState='Rest';shrimp.data.CurrentIntent='Explore';shrimp.data.Needs.Stress=0;
  for(let n=0;n<100 && !shrimp.swim;n++){shrimp.nextSwim=0;scheduleSwim(world,shrimp,n);}
  assert.equal(shrimp.swim?.kind,'RoutineSwim');return shrimp.swim.target;
 };
 assert.equal(swimAt(0),1);assert.equal(swimAt(MATURITY_DAYS),2);
 record.ageDays=0;shrimp.swim=null;
 world.threaten(shrimp.position,.2,1);
 assert.equal(shrimp.swim?.kind,'EscapeSwim');assert.equal(shrimp.swim.target,3);
});

test('a queued route expands an anchor only at a new cost and preserves cheaper arrivals',()=>{
 const anchors=[
  [0,0,[1,2,3]],[0,3,[4]],[1,1,[4]],[.8,0,[5]],
  [2,0,[6]],[1.5,0,[4]],[3,0,[]],
 ].map(([x,y,edges])=>({position:new T.Vector3(x,y,0),edges}));
 let passes=0;
 const result=paths(anchors,0,Infinity,from=>{if(from===4)passes++;return true;});
 assert.equal(passes,2,'skip the duplicate queued cost, then expand again for the shorter route');
 assert.deepEqual([...result.costs.keys()],[0,1,2,3,4,5,6]);
 assert.equal(result.costs.get(6),3);
 assert.deepEqual(route(result.previous,0,6),[3,5,4,6]);
});

test('routine swimmers try connected landings in preference order and stop searching after a clear landing',()=>{
 const anchors=[[],[2],[3],[4],[]].map((edges,i)=>({edges,position:new T.Vector3(i*.02,.1,0),normal:up}));
 const a={at:1,position:anchors[1].position.clone(),rotation:new T.Quaternion(),scale:1};
 const tried=[];
 const w={anchors,agents:[a],metrics:{},setState(){},habitat:{
  support(position,normal,rotation){tried.push(position);return position===anchors[2].position?null:{position,rotation};},traverse(){return true;}
 }};
 const picks=ids=>ids.map(i=>({i,p:anchors[i]}));
 assert.equal(startSwim(w,a,picks([0,2,3])),true);assert.equal(a.swim.target,3);
 assert.deepEqual(tried,[anchors[2].position,anchors[3].position]);
 Object.defineProperty(anchors[3],'edges',{get(){throw Error('searched past the chosen landing');}});
 assert.equal(startSwim(w,a,picks([2,3,4])),true);
});

test('a staged hatch keeps existing live agents and the active meal through commit',()=>{
 const world=make(),original=world.agents.slice(),kept=original.slice(1).reverse();
 world.dropFood(original[1].position);
 const pellet=world.pellet;assert.ok(pellet);
 kept[0].noticed=true;kept[0].discoveryAt=world.elapsed;
 const existingRoutes=kept.map(a=>a.route),oldSeed=world.seed,oldIndices=original.map(a=>a.index);
 const newcomer={...structuredClone(original[0].data),CreatureId:'new-hatchling'};
 const colony={shrimp:{'new-hatchling':{ageDays:0,sex:'female'}}};
 const records=[...kept.map(a=>structuredClone(a.data)),newcomer];
 const seats=seatNewIndividuals(records,[newcomer.CreatureId],world,colony);
 const staged=world.prepareRoster(records,seats,colony);
 const saved=validateGame(world.snapshot(staged.agents),staged.seed);
 assert.equal(world.seed,oldSeed);
 assert.deepEqual(world.agents.map(a=>a.index),oldIndices);
 assert.equal(world.agentsById.has(newcomer.CreatureId),false);
 assert.deepEqual(saved.creatures.map(c=>c.CreatureId),records.map(c=>c.CreatureId));
 assert.equal(saved.pellet.cues[0].noticed,true);
 assert.equal(saved.pellet.cues.at(-1).noticed,false);
 assert.equal(saved.anchors.at(-1),seats.get(newcomer.CreatureId));
 staged.commit();
 assert.equal(world.pellet,pellet);assert.equal(world.colony,colony);
 assert.equal(world.agentsById.has(original[0].data.CreatureId),false);
 kept.forEach((a,i)=>{
  assert.equal(world.agents[i],a);
  assert.equal(a.index,i);assert.equal(a.route,existingRoutes[i]);
 });
 const baby=world.agentsById.get(newcomer.CreatureId);
 assert.equal(baby.scale<kept[0].scale,true);assert.ok(baby.discoveryAt>world.elapsed);
 assert.deepEqual(world.snapshot(),saved);
 world.step(.05);
});

test('a missing resident or disconnected landing cannot partially apply a roster',()=>{
 const world=make(),old=world.snapshot(),original=world.agents,records=structuredClone(old.creatures);
 records[0].CreatureId='arriving';
 assert.throws(()=>world.prepareRoster(records,new Map(),{}),/居民/);
 assert.throws(()=>world.prepareRoster(records,new Map([['arriving',world.anchors.length]]),{}),/落脚/);
 assert.equal(world.agents,original);assert.deepEqual(world.snapshot(),old);
});

// Flat connected perches, with safe space on either side of the male.
function pairingTank(){
 const w=make(),[male,female]=w.agents;
 w.agents=[male,female];
 w.agentsById=new Map([['male',male],['female',female]]);
 w.anchors=[0,-.09,.09,.18].map((x,i)=>({
  position:new T.Vector3(x,.1,0),normal:up,edges:i===0?[1,2]:i===2?[0,3]:[i===1?0:2],
 }));
 for(const [agent,at] of [[male,0],[female,3]]){
  agent.idSeed=0;agent.at=at;agent.position.copy(w.anchors[at].position);agent.rotation.identity();
 }
 male.data.Needs.Stress=male.data.Needs.Hunger=male.data.Needs.Fatigue=0;
 male.data.ExecutionState=male.data.CurrentIntent='Graze';
 male.data.Memory.RecentThreatTime=-1;
 w.habitat={support:(position,normal,rotation)=>({position,rotation}),traverse:()=>true};
 const batch={id:'brood',motherId:'female',fatherId:'male',tankId:'breeding',plannedAt:0,formedAt:120000,status:'planned'};
 return {w,male,female,batch,state:{now:0,batches:[batch]}};
}

test('a planned brood permits two brief swims near the female, including across record-only saves',()=>{
 const {w,male,female,state}=pairingTank(),before=structuredClone(state);
 const observe=t=>w.observeBreeding(state,'breeding',t);
 observe(0);observe(2900);observe(3000);
 assert.equal(male.swim?.pairing,true);
 assert.equal(male.swim.target,2,'lands near her with space between them');
 assert.equal(female.swim,null);
 male.swim=null;
 w.observeBreeding(structuredClone(state),'breeding',3000);observe(3100);
 assert.equal(male.swim,null,'saving or replacing a ledger does not replay this pass');
 observe(15450);observe(15500);
 assert.equal(male.swim?.pairing,true);male.swim=null;
 observe(16000);observe(120000);
 assert.equal(w.metrics.routineSwims,2);assert.deepEqual(state,before);
});

test('pending motion stays in its tank and never replays after a late return, cancellation or egg formation',()=>{
 const {w,male,batch,state}=pairingTank();
 for(const t of [0,2900,3000])w.observeBreeding(state,'main',t);
 assert.equal(male.swim,null);
 w.observeBreeding(state,'breeding',12000);
 w.observeBreeding(state,'breeding',18000);
 assert.equal(male.swim,null,'crossing a due time while away does not catch up');
 for(const status of ['cancelled','formed','hatched','complete']){
  const resolved={...state,batches:[{...batch,status}]};
  for(const t of [0,2900,3000])w.observeBreeding(resolved,'breeding',t);
  assert.equal(male.swim,null);
 }
 const reloaded=pairingTank();
 for(const t of [20000,20100,120000])reloaded.w.observeBreeding(state,'breeding',t);
 assert.equal(reloaded.male.swim,null);
});

test('a pairing swim yields to ordinary care, manual control, fear and solid obstacles',()=>{
 for(const prevent of [
  (w,male)=>{male.manual={};},
  (w,male)=>{male.data.Needs.Stress=.9;},
  (w,male)=>{male.data.Memory.RecentThreatTime=w.elapsed;},
  (w,male)=>{male.data.CurrentIntent='Hide';},
  (w,male)=>{male.data.Needs.Fatigue=.9;},
  (w,male)=>{male.data.Needs.Hunger=.9;},
  w=>{w.knows=()=>true;},
  w=>{w.habitat.traverse=()=>false;},
 ]){
  const {w,male,state}=pairingTank(),start=male.position.clone();
  prevent(w,male);
  for(const t of [0,2900,3000,3100])w.observeBreeding(state,'breeding',t);
  assert.equal(male.swim,null);assert.ok(male.position.equals(start));
 }
});

test('a blocked grazer detours or rests without claiming a meal it never reached',()=>{
 for(const peer of [false,true]){
  const w=make(),a=w.agents[0],start=a.at;
  const goal=w.anchors[start].edges[0],via=w.anchors[start].edges[1];
  assert.notEqual(via,undefined);
  w.anchors[start].edges=[goal,via];w.anchors[goal].edges=[start,via];w.anchors[via].edges=[start,goal];
  w.agents=[a];w.pellet={anchor:goal,age:0};a.noticed=true;
  a.data.CurrentIntent='Graze';a.data.ExecutionState='Walk';a.target=goal;a.route=[goal];
  a.nextRecovery=Infinity;
  const obstruct=to=>{for(let i=0;i<41 && a.route[0]===to;i++)w.reject(a,to,.05,peer);};
  obstruct(goal);assert.deepEqual(a.route,[via,goal]);assert.equal(a.data.CurrentIntent,'Graze');
  obstruct(via);assert.deepEqual(a.route,[]);assert.equal(a.at,start);
  assert.equal(a.data.ExecutionState,'Rest');assert.equal(a.target,start);assert.equal(w.metrics.arrivals,0);
  const visitors=[];w.step(.05,visitors);
  assert.equal(w.metrics.consumed,0);assert.deepEqual(visitors,[]);
  w.elapsed+=31;assert.ok(w.reachable(a,Infinity).costs.has(goal));
 }
});

test('a depleted pellet checks food at the current positions of nearby anchors',()=>{
 const w=make();w.agents=[];
 const [center,leaf]=w.anchors;
 w.anchors=[center,leaf];center.position.set(0,0,0);leaf.position.set(.20,0,0);
 center.food=leaf.food=0;
 w.dropFood(center.position);w.step(.05);assert.ok(w.pellet);
 assert.ok(center.food<.01,'The sinking meal stays active above bare ground without feeding it yet');
 while(w.pellet.age<PELLET_SINK_SECONDS)w.step(.05);
 assert.equal(center.food,1);
 center.food=.01;leaf.food=.20;
 leaf.position.x=.054;w.step(.05);assert.ok(w.pellet,'food on the leaf keeps this meal active');
 leaf.position.x=.055;w.step(.05);assert.equal(w.pellet,null,'a moving leaf at the radius boundary no longer counts');
});

test('feeding pressure includes approaching grazers while exploration counts only nearby bodies',()=>{
 const w=make(), [self,near,approaching,boundary,far]=w.agents;
 const p={position:new T.Vector3()}, target={position:new T.Vector3(.01,0,0)};
 w.anchors=[target];w.agents=[self,near,approaching,boundary,far];
 for(const [i,a] of w.agents.entries()){
  a.position.set([0,.02,-.5,.04,.085][i],0,0);
  a.target=0;a.route=[];a.data.CurrentIntent='Graze';
 }
 approaching.route=[0];near.route=[0];
 const occupancy={strips:new Map()},expected=2*(1-.01/.085)+(1-.04/.085);
 assert.ok(Math.abs(w.crowd(self,p,occupancy)-expected)<1e-12);
 assert.equal(occupancy.close,1);
 assert.equal(w.crowd(self,p),w.crowd(self,p,occupancy));
 w.crowd(self,{position:new T.Vector3(1,1,1)},occupancy);
 assert.equal(occupancy.close,0);
});

test('a grazer looking for a quieter site scores each swim candidate once before testing landings',()=>{
 const w=make(),a=w.agents[0],attempts=[],scored=[];
 w.anchors=Array.from({length:20},(_,i)=>({position:new T.Vector3(i ? .08+i*.001 : 0,0,0),normal:up,edges:i?[0]:Array.from({length:19},(_,j)=>j+1)}));
 a.at=0;a.position.copy(w.anchors[0].position);a.route=[];a.swim=null;a.residence=30;
 a.data.ExecutionState='Graze';a.data.Needs.Stress=0;
 w.knows=()=>false;
 w.crowd=(_,anchor)=>{const i=w.anchors.indexOf(anchor);if(i)scored.push(i);return 20-i;};
 w.habitat={support(position){attempts.push(w.anchors.findIndex(p=>p.position===position));return null;}};
 for(let seed=0;seed<100 && !attempts.length;seed++){a.nextSwim=0;scheduleSwim(w,a,seed);}
 assert.deepEqual(scored,Array.from({length:19},(_,i)=>i+1));
 assert.deepEqual(attempts,scored.slice().reverse().slice(0,16));
});

test('legacy saves prefer nearby aligned anchors, then fall back to the nearest connected one',()=>{
 const saved=make().snapshot(),record=saved.creatures[0];
 const axis=up.clone().applyQuaternion(new T.Quaternion().copy(record.Rotation));
 const anchors=[0,.005,.01].map((dx,i)=>({...seed.anchors[0],
  position:[record.Position.x+dx,record.Position.y,record.Position.z],
  normal:axis.clone().multiplyScalar(i===0?-1:1).toArray(),edges:[(i+1)%3]}));
 const one={...seed,anchors,creatures:[seed.creatures[0]]};
 saved.creatures=[record];saved.food=[.5,.5,.5];delete saved.anchors;
 const surface={cast:()=>({}),depth:()=>0,support(){throw Error('valid saved pose should not be reseated');}};
 assert.equal(new CreatureWorld(one,surface,saved).agents[0].at,1);
 anchors.forEach(a=>a.normal=axis.clone().negate().toArray());
 assert.equal(new CreatureWorld(one,surface,saved).agents[0].at,0);
 saved.anchors=[2];
 assert.equal(new CreatureWorld(one,surface,saved).agents[0].at,2);
});

test('restored shrimp IDs resolve to the new live agents even when their order changes',()=>{
 const original=make(), saved=original.snapshot();
 const restored=new CreatureWorld({...seed,creatures:[...seed.creatures].reverse()},habitat,saved);
 for(const agent of original.agents){
  const id=agent.data.CreatureId;
  assert.equal(original.agentsById.get(id),agent);
  assert.equal(restored.agentsById.get(id),restored.agents.find(a=>a.data.CreatureId===id));
  assert.notEqual(restored.agentsById.get(id),agent);
 }
 assert.equal(restored.agentsById.get('absent'),undefined);
});

test('a blocked edge becomes traversable at the exact expiry of its own cooldown',()=>{
 const w=make(),a=w.agents[0];
 w.anchors=[0,1,2].map(i=>({position:new T.Vector3(i*.02,0,0),edges:i===1?[0,2]:[1]}));
 // Meet both blockages while moving left, then try the same edges going right.
 const hold=10+5*Math.sin(a.phase);
 w.elapsed=0; a.at=a.target=1; w.reject(a,0,2,true);
 w.elapsed=3; a.at=a.target=2; w.reject(a,1,2,true);
 a.at=0;
 for(const [time,sites,cooldowns] of [[3,[0],2],[hold,[0,1],1],[hold+3,[0,1,2],0]]){
  w.elapsed=time;
  assert.deepEqual([...w.reachable(a,.1).costs.keys()],sites);
  assert.equal(a.blocked.size,cooldowns);
 }
});

test('only actual feeding near a current pellet adds a visitor, once per individual',()=>{
 const w=make(), [first,second,far]=w.agents, visitors=[];
 const near=first.at;
 w.dropFood(w.anchors[near].position);
 for(const a of w.agents)a.manual='Rest';
 for(const a of [first,second,far]){
  a.at=near;a.route=[];a.swim=null;a.noticed=true;a.hold=99;a.nextSwim=Infinity;
  a.data.ExecutionState='Graze';
 }
 far.at=w.anchors.findIndex(a=>a.position.distanceTo(w.anchors[near].position)>.2);
 assert.ok(far.at>=0);
 first.manual=far.manual=null;
 const originalFood=w.anchors[near].food;
 w.step(.05,visitors);
 assert.deepEqual(visitors,[],'Grazing the biofilm before the food lands is not a visit');
 assert.ok(w.anchors[near].food<originalFood);
 while(w.pellet.age<PELLET_SINK_SECONDS)w.step(.05,visitors);
 w.step(.05,visitors);
 assert.deepEqual(visitors,[first.data.CreatureId]);
 second.manual=null;w.step(.05,visitors);
 assert.deepEqual(visitors,[first.data.CreatureId,second.data.CreatureId]);
 w.pellet.age=240;far.at=near;w.step(.05,visitors);
 assert.equal(w.pellet,null);assert.equal(visitors.length,2);
});

test('restoring a swimming pose cannot leave a resting shrimp suspended above its surface',()=>{
 const w=make(),saved=w.snapshot(),a=saved.creatures[0],before=a.Position.y;
 a.Position.y+=.014;a.ExecutionState='RoutineSwim';
 const restored=new CreatureWorld(seed,habitat,saved).agents[0];
 assert.ok(restored.position.y<before+.008);assert.equal(restored.swim,null);
});

test('an escape saved over open water restores to a supported unoccupied landing',()=>{
 const w=make(),saved=w.snapshot(),shrimp=saved.creatures[0];
 shrimp.Position.y=.54;shrimp.ExecutionState='EscapeSwim';shrimp.Needs.Stress=1;
 const position=new T.Vector3(shrimp.Position.x,shrimp.Position.y,shrimp.Position.z);
 assert.ok(w.anchors.every(anchor=>anchor.position.distanceTo(position)>.06));
 const restored=new CreatureWorld(seed,habitat,saved).agents[0];
 assert.equal(restored.data.ExecutionState,'Rest');
 assert.equal(restored.data.Needs.Stress,1);
 assert.ok(restored.position.distanceTo(w.anchors[restored.at].position)<.028);
 assert.ok(habitat.depth(restored.position,restored.rotation,restored.scale)<=.0003);
});

test('a resting shrimp can find new ground after its perch moves, but an unsupported save still fails',()=>{
 const saved=make().snapshot(),shrimp=saved.creatures[0];
 shrimp.Position.y=.54;shrimp.ExecutionState='Rest';
 assert.throws(()=>new CreatureWorld(seed,habitat,saved),/没有合法恢复位置/);
 const world=new CreatureWorld(seed,habitat,saved,undefined,{hardscapeChanged:true});
 const a=world.agents[0];
 assert.equal(a.data.CreatureId,shrimp.CreatureId);
 assert.deepEqual(a.data.Needs,shrimp.Needs);
 assert.ok(a.position.distanceTo(world.anchors[a.at].position)<.028);
 assert.ok(habitat.depth(a.position,a.rotation,a.scale)<=.0003);
 assert.throws(()=>new CreatureWorld(seed,{...habitat,support:()=>null},saved,undefined,{hardscapeChanged:true}),/没有合法恢复位置/);
});

test('repeated taps preserve the flight already underway and still register stress',()=>{
 const w=make(),a=w.agents[0];
 for(const kind of ['EscapeSwim','RoutineSwim']){
  const flight={kind,t:.4};
  a.swim=flight;a.data.ExecutionState=kind;a.data.Needs.Stress=0;
  w.threaten(a.position,.01,kind==='RoutineSwim' ? .01 : 1.3);
  assert.ok(a.data.Needs.Stress>0);
  assert.equal(a.swim,flight);
  assert.equal(a.data.ExecutionState,kind);
 }
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
test('detours can improve the first route found without expanding branches beyond it',()=>{
 const anchors=[[0,0,[1,2,5]],[0,4,[4]],[1,0,[3]],[2,0,[4]],[3,0,[]],[10,0,[6]],[11,0,[]]]
  .map(([x,z,edges])=>({position:new T.Vector3(x,0,z),edges}));
 for(const blocked of [false,true]){
  const allowed=(a,b)=>!blocked||a!==2||b!==3;
  const full=paths(anchors,0,Infinity,allowed);
  let far=false;
  const detour=paths(anchors,0,Infinity,(a,b)=>{if(a===5)far=true;return allowed(a,b);},4);
  assert.deepEqual(route(detour.previous,0,4),blocked?[1,4]:[2,3,4]);
  assert.equal(detour.costs.get(4),full.costs.get(4));
  assert.equal(far,false);
 }
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
test('a published meal keeps each shrimp’s discovery time and response across restore',()=>{
 const w=make();w.dropFood();
 const first=w.agents[0];first.noticed=true;first.discoveryAt=w.elapsed;
 const saved=w.snapshot();saved.creatures.reverse();saved.anchors.reverse();
 const restored=new CreatureWorld(seed,habitat,saved);
 assert.ok(Number.isSafeInteger(saved.pellet.fedAt));assert.equal(restored.pellet.fedAt,w.pellet.fedAt);
 for(const a of restored.agents){
   const original=w.agents.find(other=>other.data.CreatureId===a.data.CreatureId);
   assert.equal(a.noticed,original.noticed);
   assert.ok(Math.abs(a.discoveryAt-original.discoveryAt)<1e-8);
 }
 assert.equal(restored.pellet.pendingFood,true);
 const legacy=structuredClone(saved);delete legacy.pellet.cues;delete legacy.pellet.fedAt;delete legacy.pellet.pendingFood;
 const recovered=new CreatureWorld(seed,habitat,legacy);
 assert.equal(recovered.pellet.fedAt,undefined);
 assert.ok(recovered.agents.every(a=>!recovered.knows(a)));
 advanceCreatureEcology(saved,ecologySeconds(3),seed.profile,seed.anchors,3);
 const later=new CreatureWorld(seed,habitat,saved);
 assert.equal(later.pellet.pendingFood,undefined);
 assert.equal(later.pellet.fedAt,restored.pellet.fedAt);
 assert.throws(()=>validateGame({...saved,pellet:{...saved.pellet,fedAt:-1}},seed),/投喂时间/);
 assert.ok(Math.abs(later.agents[1].discoveryAt-w.agents[1].discoveryAt+3)<1e-8);
 saved.pellet.cues.push(saved.pellet.cues[0]);
 assert.throws(()=>validateGame(saved,seed),/饲料/);
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
