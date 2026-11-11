import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNewCrystalProgress,applyCrystalAction} from '../src/crystal-progress.js';
import {blankBreedingRoom,projectCrystalRooms,validateCrystalRoster,crystalColony,crystalChangeNotice} from '../src/crystal-rooms.js';
import {validateSession} from '../src/session.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../public/assets/'+name,import.meta.url)));
const source=read('setup.json'),template=read('initial-population.json')[0],cat=read('catalog.json');
const runtime={definitions:cat.definitions.map(JSON.parse),settings:JSON.parse(cat.ground),entries:new Map(cat.entries.map(e=>[e.key,e]))};
function fixture(){
 const state=createNewCrystalProgress({now:10000000,seed:31}),session=structuredClone(source);
 session.Tank.UniqueId='crystal-main';session.Breeding=state;session.BreedingRooms={version:1,activeId:'main',rooms:[{id:'breeding',session:blankBreedingRoom(source,'breeding')}],creatures:[]};
 return projectCrystalRooms(session,{version:1,tankId:'crystal-main',elapsed:9,creatures:[],food:[],navigation:[],pellet:null},state,source,template);
}
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
 assert.match(crystalChangeNotice(before,state),/新增 4/);assert.equal(crystalChangeNotice(state,state),'');
 const p=projectCrystalRooms(f.session,f.game,state,source,template);assert.equal(p.session.BreedingRooms.creatures.length,6);
 const b=projectCrystalRooms(p.session,p.game,state,source,template,'breeding');assert.equal(b.game.creatures.length,6);
 assert.equal(b.arrivals.length,6,'parents and offline babies need target-room seating on first entry');
 const restored=validateSession(JSON.parse(JSON.stringify(b.session)),runtime);assert.deepEqual(restored.Breeding,state);
 assert.ok(Object.values(crystalColony(state,'breeding').shrimp).every(r=>r.ageDays===120));
});
test('tampered inactive roster or room state rejects before publication',()=>{
 const f=fixture();let s=structuredClone(f.session);s.BreedingRooms.creatures=[structuredClone(f.game.creatures[0])];assert.throws(()=>validateSession(s,runtime));
 s=structuredClone(f.session);s.BreedingRooms.rooms[0].session.Breeding={};assert.throws(()=>validateSession(s,runtime));
 s=structuredClone(f.session);s.BreedingRooms.rooms[0].game={elapsed:0,food:[2],navigation:[],pellet:null};assert.throws(()=>validateSession(s,runtime));
 assert.throws(()=>validateCrystalRoster(s.Breeding,f.game.creatures.slice(1),'main'));
 for(const value of [null,false,0,'']){s=structuredClone(source);s.Breeding=value;assert.throws(()=>validateSession(s,runtime));}
});
