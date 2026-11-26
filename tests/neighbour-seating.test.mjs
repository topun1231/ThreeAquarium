import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Quaternion, Vector3} from 'three';
import {createWallpaperPlayback} from '../src/live-wallpaper.js';
import {createNeighbourSeating} from '../src/neighbour-seating.js';
import {seatNewIndividuals} from '../src/population.js';

test('new residents spread across reachable ground while the original resident keeps its pose',()=>{
  const anchors=Array.from({length:128},(_,i)=>({kind:i<8?0:1,edges:[0],position:new Vector3(i*.08,0,0),normal:new Vector3(0,1,0)}));
  const candidate={anchors,habitat:{support:(position,normal,rotation)=>({position,rotation})}};
  const resident={CreatureId:'old',Position:{x:0,y:0,z:0},Rotation:{x:0,y:0,z:0,w:1}};
  const arrivals=Array.from({length:5},(_,i)=>({CreatureId:'I'+(i+1)}));
  const population=[structuredClone(resident),...arrivals];
  seatNewIndividuals(population,arrivals.map(a=>a.CreatureId),candidate,{shrimp:{}});
  assert.deepEqual(population[0],resident);
  assert.equal(new Set(population.map(a=>a.Position.x)).size,population.length);
  assert.ok(new Set(arrivals.map(a=>a.Rotation.y)).size>1);
});
import {face} from '../src/habitat.js';

test('hatchlings can land on connected branches and leaves and must clear the mother and siblings',()=>{
  const p=(x,y,z)=>({x,y,z});
  const mother={CreatureId:'dam',Position:p(.3,.12,0),Rotation:{x:0,y:0,z:0,w:1}};
  const kids=Array.from({length:4},(_,i)=>({CreatureId:'juvenile'+i}));
  const anchors=[
    [-.4,0,0,0],[.3,.12,0,2],[.288,.12,0,2],[.32,.12,0,2],
    [.3,.12,.028,3],[.275,.12,-.032,2],[.342,.12,.028,3],[.32,.12,-.035,3]
  ].map(([x,y,z,kind])=>({position:new Vector3(x,y,z),normal:new Vector3(0,1,0),kind,edges:[0]}));
  anchors[2].edges=[];
  const blocked=anchors[3].position;
  const candidate={anchors,habitat:{support:(point,normal,rotation)=>point!==blocked && {position:point,rotation}}};
  const colony={shrimp:Object.fromEntries(kids.map(c=>[c.CreatureId,{ageDays:0}]))};
  const ids=kids.map(c=>c.CreatureId), sites=ids.map(id=>({id,motherId:'dam'}));
  seatNewIndividuals([mother,...kids],ids,candidate,colony,0,sites);
  assert.equal(new Set(kids.map(k=>JSON.stringify(k.Position))).size,4);
  for(const {Position:s} of kids){
    assert.equal(s.y,.12);
    assert.ok(Math.hypot(s.x-.3,s.z)<.07);
    for(const a of [anchors[1],anchors[2],anchors[3]])assert.notDeepEqual(s,p(a.position.x,.12,a.position.z));
  }
  // The mother can have swum above the only connected surface in her column.
  const high={id:'swimmer-child',position:p(.3,.4,0)};
  const ground=[-.54,.3].map(x=>({kind:0,edges:[1],position:new Vector3(x,.02,0),normal:new Vector3(0,1,0)}));
  const only={CreatureId:high.id};
  seatNewIndividuals([only],[high.id],{...candidate,anchors:ground},colony,0,[high]);
  assert.deepEqual(only.Position,p(.3,.02,0));
});
test('a previously unseated mother lands before her hatchlings even if their stored order is reversed',()=>{
  const anchors=Array.from({length:26},(_,i)=>({kind:0,edges:[0],position:new Vector3(-.5+i*.04,.02,0),normal:new Vector3(0,1,0)}));
  const candidate={anchors,habitat:{support:(position,normal,rotation)=>({position,rotation})}};
  const kids=[{CreatureId:'a'},{CreatureId:'b'}], dam={CreatureId:'mother'};
  const records=[...kids,dam], ids=records.map(r=>r.CreatureId),births=kids.map(r=>({id:r.CreatureId,motherId:'mother'}));
  seatNewIndividuals(records,ids,candidate,{shrimp:{}},.008,births);
  assert.ok(kids.every(k=>Math.abs(k.Position.x-dam.Position.x)<.085));
  assert.notDeepEqual(kids[0].Position,kids[1].Position);
  const unsupported={...candidate,habitat:{support:()=>null}};
  assert.throws(()=>seatNewIndividuals(records,ids,unsupported,{shrimp:{}},0,births),/安全的入缸位置/);
});

test('wallpaper seats a copy, discards invalid geometry and resumes a paused preparation',async()=>{
  const playback=createWallpaperPlayback(), controller=new AbortController();
  const creatures=[{CreatureId:'I1',Position:{x:-.2,y:.1,z:0}}], old=structuredClone(creatures);
  const room={Tank:{UniqueId:'breeding'}};
  let started, attempts=0, discarded=0, fail=false;
  const preparing=new Promise(resolve=>{started=resolve;});
  const runtime={async prepare(scene,reuse,{signal,backgroundNavigation,seatOnly}){
    assert.equal(scene,room);assert.equal(reuse,null);assert.equal(backgroundNavigation,true);assert.equal(seatOnly,true);
    if(++attempts===1){
      started();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    }
    return {anchors:[{kind:0,edges:[],position:new Vector3(.25,.04,0),normal:new Vector3(0,1,0)}],canSeatAt:index=>index===0,
      habitat:{support(position,normal,rotation){return !fail && {position,rotation:new Quaternion()};}},
      dispose(){discarded++;}};
  }};
  const {seat}=createNeighbourSeating(runtime,playback);
  const request=()=>seat(room,creatures,['I1'],{shrimp:{}},controller.signal);
  const first=request();await preparing;playback.setPaused(true);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(attempts,1);
  playback.setPaused(false);
  assert.deepEqual((await first).creatures[0].Position,{x:.25,y:.04,z:0});
  assert.deepEqual(creatures,old);assert.equal(discarded,1);
  fail=true;await assert.rejects(request(),/没有安全的入缸位置/);
  assert.deepEqual(creatures,old);assert.equal(discarded,2);
  fail=false;assert.deepEqual((await request()).creatures[0].Position,{x:.25,y:.04,z:0});
  controller.abort();await assert.rejects(request(),{name:'AbortError'});
  assert.equal(attempts,4);assert.equal(discarded,3);
});

test('distant movement uses the existing collision checks and releases its private habitat',async()=>{
  const {creatures:[original],profile}=JSON.parse(readFileSync(new URL('../public/assets/behavior.json',import.meta.url)));
  const normal=new Vector3(0,1,0), direction=new Vector3(-1,0,0);
  const {x,y,z,w}=face(direction,normal);
  const record={...original,Position:{x:0,y:.04,z:0},Rotation:{x,y,z,w}};
  const anchors=[0,-.032,-.064].map(x=>({kind:0,owner:'floor',food:.4,edges:[],normal,position:new Vector3(x,.04,0)}));
  let builds=0, disposed=0, traversals=0;
  const habitat={depth:()=>0,support:(position,_normal,rotation)=>({position,rotation}),
    cast:(from,to)=>to.y<-.5?{point:from.clone().setY(.04)}:null,
    traverse(){traversals++;return true;}};
  const runtime={async prepare(){builds++;return {anchors,habitat,dispose(){disposed++;}};}};
  const playback=createWallpaperPlayback();
  const {seat,move}=createNeighbourSeating(runtime,playback,profile);
  const room={Tank:{UniqueId:'breeding'}}, colony={shrimp:{}}, signal=new AbortController().signal;
  const seated=await seat(room,[record],[],colony,signal,true);
  const prepared=await move(room,seated.creatures,colony,signal,seated.prepared);
  assert.equal(builds,1);
  assert.equal(disposed,0);
  const {world}=prepared, [agent]=world.agents;
  agent.data.CurrentIntent='Explore';world.setState(agent,'Walk',10);agent.age=2;agent.target=1;agent.route=[1];
  for(let i=0;i<20;i++)world.step(.05);
  assert.ok(traversals>0 && agent.position.x<-.002);
  assert.deepEqual(record.Position,{x:0,y:.04,z:0});
  prepared.dispose();assert.equal(disposed,1);
  const waiting=await seat(room,[record],[],colony,signal,true);
  const abort=new AbortController();abort.abort();
  await assert.rejects(move(room,waiting.creatures,colony,abort.signal,waiting.prepared),{name:'AbortError'});
  assert.equal(builds,2);assert.equal(disposed,2);
});
