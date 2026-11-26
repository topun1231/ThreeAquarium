import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNewCrystalProgress,applyCrystalAction} from '../src/crystal-progress.js';
import {blankBreedingRoom,projectCrystalRooms,validateCrystalRoster,crystalColony,updateCrystalResidentClocks,crystalGrowthEvents} from '../src/crystal-rooms.js';
import {validateSession} from '../src/session.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../public/assets/'+name,import.meta.url)));
const source=read('setup.json'),template=read('initial-population.json')[0],cat=read('catalog.json');
const runtime={definitions:cat.definitions.map(JSON.parse),settings:JSON.parse(cat.ground),entries:new Map(cat.entries.map(e=>[e.key,e]))};
function fixture(){
 const state=createNewCrystalProgress({now:10000000,seed:31}),session=structuredClone(source);
 session.Tank.UniqueId='crystal-main';session.Breeding=state;session.BreedingRooms={version:1,activeId:'main',rooms:[{id:'breeding',session:blankBreedingRoom(source,'breeding')}],creatures:[]};
 return projectCrystalRooms(session,{version:1,tankId:'crystal-main',elapsed:9,creatures:[],food:[],navigation:[],pellet:null},state,source,template);
}
function actInRoom(current,action,now=current.session.Breeding.now,target=current.session.BreedingRooms.activeId){
 const {state,hatches}=applyCrystalAction(current.session.Breeding,action,now);
 return projectCrystalRooms(current.session,current.game,state,source,template,target,hatches);
}
test('an unseen clutch keeps its actual birth site until first entry, even if its mother moves',()=>{
 const planned=actInRoom(fixture(),{type:'plan',motherId:'I1',fatherId:'I3',tankId:'breeding',size:4});
 const {hatchAt}=planned.session.Breeding.batches[0];
 const there=actInRoom(planned,{type:'advance'},hatchAt-500,'breeding');
 const position={x:.31,y:.15,z:.06};
 there.game.creatures.find(c=>c.CreatureId==='I1').Position=position;
 const away=actInRoom(there,{type:'advance'},hatchAt-200,'main');
 const birth=actInRoom(away,{type:'advance'},hatchAt+50);
 const children=birth.session.Breeding.batches[0].children.map(c=>c.id);
 const sites=children.map(id=>({id,motherId:'I1',tankId:'breeding',at:hatchAt,position}));
 assert.deepEqual(birth.hatchSites,[]);
 assert.deepEqual(birth.session.BreedingRooms.pendingHatches,sites);
 const saved={...birth,session:validateSession(JSON.parse(JSON.stringify(birth.session)),runtime)};
 const moved=actInRoom(saved,{type:'move',id:'I1',tankId:'main'},hatchAt+150);
 const entered=actInRoom(moved,{type:'advance'},hatchAt+200,'breeding');
 assert.deepEqual(entered.hatchSites,sites);
 assert.ok(!entered.game.creatures.some(c=>c.CreatureId==='I1'));
 assert.equal(entered.session.BreedingRooms.pendingHatches,undefined);
 assert.deepEqual(actInRoom(entered,{type:'advance'}).hatchSites,[]);

 const transferred=actInRoom(saved,{type:'move',id:children[0],tankId:'main'},hatchAt+200);
 assert.deepEqual(transferred.hatchSites,[]);
 const returned=actInRoom(transferred,{type:'move',id:children[0],tankId:'breeding'},hatchAt+300);
 assert.deepEqual(actInRoom(returned,{type:'advance'},hatchAt+500,'breeding').hatchSites,sites.slice(1));
 const later=actInRoom(saved,{type:'advance'},hatchAt+120_000,'breeding');
 assert.deepEqual(later.arrivals,children);
 assert.deepEqual(later.hatchSites,[]);
 const corrupt=structuredClone(birth.session);
 corrupt.BreedingRooms.pendingHatches[0].position={x:8,y:0,z:0};
 assert.throws(()=>validateSession(corrupt,runtime),/出生位置/);
});
test('parents entering with new hatchlings are distinguished from unrelated arrivals and grown offspring',()=>{
 const f=fixture(),plan=actInRoom(f,{type:'plan',motherId:'I1',fatherId:'I3',tankId:'breeding',size:2});
 const batch=plan.session.Breeding.batches[0],birth=actInRoom(plan,{type:'advance'},batch.hatchAt,'breeding');
 assert.deepEqual(birth.hatchSites,birth.session.Breeding.batches[0].children.map(c=>({id:c.id,motherId:'I1',tankId:'breeding',at:batch.hatchAt})));
 assert.deepEqual(birth.arrivals.slice(0,2),['I1','I3']);
 assert.deepEqual(actInRoom(plan,{type:'advance'},batch.adultAt+86400000,'breeding').hatchSites,[]);
 assert.deepEqual(actInRoom(f,{type:'buy',productId:'basic-female',tankId:'main'}).hatchSites,[]);
});
test('rooms retain layouts, exact permanent identities, feeding and elapsed time across switches',()=>{
 const f=fixture();f.game.food=[.81];f.game.navigation=[{owner:'floor',kind:0,position:[0,.04,0]}];f.game.pellet={anchor:0,age:3};
 const state=applyCrystalAction(f.session.Breeding,{type:'plan',motherId:'I1',fatherId:'I3',tankId:'breeding',size:2},10000000).state;
 const p=projectCrystalRooms(f.session,f.game,state,source,template);
 assert.deepEqual(p.game.creatures.map(c=>c.CreatureId),['I2','I4','I5','I6','I7']);
 validateSession(p.session,runtime);validateCrystalRoster(state,p.game.creatures,'main');
 const b=projectCrystalRooms(p.session,p.game,state,source,template,'breeding');
 assert.deepEqual(b.arrivals,['I1','I3']);assert.equal(b.session.BreedingRooms.unseated.length,0);
 assert.deepEqual(b.game.creatures.map(c=>c.CreatureId),['I1','I3']);assert.equal(b.session.Tank.Hardscape.length,0);
 const back=projectCrystalRooms(b.session,b.game,state,source,template,'main');
 assert.deepEqual(back.game.food,[.81]);assert.equal(back.game.pellet.age,3);assert.equal(back.game.elapsed,9);assert.deepEqual(back.session.Tank,f.session.Tank);
 assert.deepEqual(back.game.creatures.find(c=>c.CreatureId==='I2').Personality,f.game.creatures.find(c=>c.CreatureId==='I2').Personality);
});
test('offline births project into correct inactive room once and preserve hidden genetics',()=>{
 const f=fixture();let state=applyCrystalAction(f.session.Breeding,{type:'plan',motherId:'I1',fatherId:'I3',tankId:'breeding',size:4},10000000).state;
 const before=state;state=applyCrystalAction(state,{type:'advance'},10000000+state.growthMs).state;
 const notices=crystalGrowthEvents(before,state);
 assert.deepEqual(notices.filter(n=>n.kind==='batch'),[{kind:'batch',id:state.batches[0].id,stage:'complete',at:state.batches[0].adultAt}]);
 assert.deepEqual(notices.filter(n=>n.kind==='individual').map(n=>n.id).sort(),['I6','I7']);
 assert.deepEqual(crystalGrowthEvents(state,state),[]);
 const p=projectCrystalRooms(f.session,f.game,state,source,template);assert.equal(p.session.BreedingRooms.creatures.length,6);
 const b=projectCrystalRooms(p.session,p.game,state,source,template,'breeding');assert.equal(b.game.creatures.length,6);
 assert.equal(b.arrivals.length,6,'parents and offline babies need target-room seating on first entry');
 const restored=validateSession(JSON.parse(JSON.stringify(b.session)),runtime);assert.deepEqual(restored.Breeding,state);
 assert.ok(Object.values(crystalColony(state,'breeding').shrimp).every(r=>r.ageDays===120));
});
test('壁纸播放中的幼虾按游戏时钟长大，时钟回拨不缩小，其他缸不增加个体',()=>{
 const start=fixture().session.Breeding;
 const planned=applyCrystalAction(start,{type:'plan',motherId:'I1',fatherId:'I3',tankId:'breeding',size:2},start.now).state;
 const {hatchAt,adultAt}=planned.batches[0];
 const state=applyCrystalAction(planned,{type:'advance'},hatchAt).state;
 const copy=structuredClone(state),colony=crystalColony(state,'breeding'),mid=(hatchAt+adultAt)/2;
 const id=state.batches[0].children[0].id;
 assert.equal(colony.shrimp[id].ageDays,0);
 updateCrystalResidentClocks(state,colony,mid,0);
 assert.equal(colony.shrimp[id].ageDays,37.5);
 assert.deepEqual(colony,crystalColony(state,'breeding',undefined,mid));
 updateCrystalResidentClocks(state,colony,hatchAt-1,0);
 assert.equal(colony.shrimp[id].ageDays,37.5);
 updateCrystalResidentClocks(state,colony,adultAt,0);
 assert.deepEqual(colony,crystalColony(state,'breeding',undefined,adultAt));
 assert.deepEqual(state,copy);
});
test('静观时旧档母虾的孵化时间随生态时钟更新，满缸等待时保留抱卵',()=>{
 const state=fixture().session.Breeding;
 const mother={...state.individuals[0],legacy:true,legacyAgeDays:120,legacyHatchAt:state.now+10000};
 state.individuals=[mother];
 const colony=crystalColony(state,mother.tank);
 for(const [now,sim] of [[state.now+2000,450],[mother.legacyHatchAt+1,560]]){
  updateCrystalResidentClocks(state,colony,now,sim);
  assert.deepEqual(colony,crystalColony(state,mother.tank,undefined,now,sim));
  assert.notEqual(colony.shrimp[mother.id].hatchAt,null);
 }
});
test('未读消息随缸保存，同一窝进展替换旧消息，已读消息不会因换缸复现',()=>{
 let p=fixture();
 const start=p.session.Breeding.now;
 function apply(action,offset){
  const state=applyCrystalAction(p.session.Breeding,action,start+offset).state;
  p=projectCrystalRooms(p.session,p.game,state,source,template);
  p.session=validateSession(JSON.parse(JSON.stringify(p.session)),runtime);
 }
 apply({type:'plan',motherId:'I1',fatherId:'I3',tankId:'breeding',size:2},0);
 const batch=p.session.Breeding.batches[0];
 apply({type:'advance'},batch.hatchAt-start);
 assert.deepEqual(p.session.BreedingRooms.unreadGrowth.map(e=>e.stage),['hatched']);
 apply({type:'advance'},batch.adultAt-start);
 const unread=p.session.BreedingRooms.unreadGrowth;
 assert.equal(unread.filter(e=>e.id===batch.id).length,1);
 assert.equal(unread.find(e=>e.id===batch.id).stage,'complete');
 const invalid=structuredClone(p.session);
 invalid.BreedingRooms.unreadGrowth[0].at++;
 assert.throws(()=>validateSession(invalid,runtime),/成长消息/);
 p.session.BreedingRooms.unreadGrowth=unread.filter(e=>e.id!==batch.id);
 const switched=projectCrystalRooms(p.session,p.game,p.session.Breeding,source,template,'breeding');
 assert.deepEqual(switched.session.BreedingRooms.unreadGrowth.map(e=>e.id).sort(),['I6','I7']);
});
test('tampered inactive roster or room state rejects before publication',()=>{
 const f=fixture();let s=structuredClone(f.session);s.BreedingRooms.creatures=[structuredClone(f.game.creatures[0])];assert.throws(()=>validateSession(s,runtime));
 s=structuredClone(f.session);s.BreedingRooms.rooms[0].session.Breeding={};assert.throws(()=>validateSession(s,runtime));
 s=structuredClone(f.session);s.BreedingRooms.rooms[0].game={elapsed:0,food:[2],navigation:[],pellet:null};assert.throws(()=>validateSession(s,runtime));
 assert.throws(()=>validateCrystalRoster(s.Breeding,f.game.creatures.slice(1),'main'));
 for(const value of [null,false,0,'']){s=structuredClone(source);s.Breeding=value;assert.throws(()=>validateSession(s,runtime));}
});

test('静养个体冻结原有行为档案，50只在另一缸时仍可保存、读档并校验身份',()=>{
 const f=fixture(),state=f.session.Breeding;
 state.unified=true;state.tanks[0].capacity=50;
 while(state.individuals.length<50)state.individuals.push({...structuredClone(state.individuals[0]),id:'main-'+state.individuals.length});
 for(let i=0;i<4;i++)state.individuals.push({...structuredClone(state.individuals[0]),id:'rest-'+i,tank:'rest'});
 const p=projectCrystalRooms(f.session,f.game,state,source,template,'breeding');
 assert.equal(p.game.creatures.length,0);assert.equal(p.session.BreedingRooms.creatures.length,50);assert.equal(p.session.BreedingRooms.resting.length,4);
 const saved=validateSession(JSON.parse(JSON.stringify(p.session)),runtime);
 const bad=structuredClone(saved);bad.BreedingRooms.resting[0]=bad.BreedingRooms.creatures[0];
 assert.throws(()=>validateSession(bad,runtime),/不匹配/);
 const missing=structuredClone(saved);delete missing.BreedingRooms.resting;assert.throws(()=>validateSession(missing,runtime));
 const same=projectCrystalRooms(saved,p.game,state,source,template,'main');
 assert.deepEqual(same.session.BreedingRooms.resting,p.session.BreedingRooms.resting);
});
