import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGrowthDueCheck,legacyHatchReady} from '../src/crystal-breeding.js';
import {unifyAquarium,emptyUnifiedProgress} from '../src/unified-aquarium.js';
import {starterIndividuals,createNewCrystalProgress,applyCrystalAction,validateCrystalProgress} from '../src/crystal-progress.js';
import {blankBreedingRoom,projectCrystalRooms,validateCrystalRoster,crystalGrowthEvents} from '../src/crystal-rooms.js';
import {validateSession} from '../src/session.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../public/assets/'+name,import.meta.url)));
const source=read('setup.json'),population=read('initial-population.json'),template=population[0],cat=read('catalog.json');
const runtime={definitions:cat.definitions.map(JSON.parse),settings:JSON.parse(cat.ground),entries:new Map(cat.entries.map(e=>[e.key,e]))};
const now=10000000,opts={source,template,now,seed:31};

test('原有观赏虾的幼虾不会继承玩家写给母虾的观察',()=>{
  const old=own(1);
  old.session.Colony.shrimp['resident-0'].hatchAt=old.session.SimulationSeconds+100;
  const base=unifyAquarium(old,opts).session.Breeding;
  const noted=applyCrystalAction(base,{type:'observation',id:'resident-0',value:'第一次看到它抱卵'},now).state;
  const due=base.individuals[0].legacyHatchAt;
  const {state,hatches}=applyCrystalAction(noted,{type:'advance'},due);
  const [dam,child]=state.individuals;
  assert.equal(dam.observation,'第一次看到它抱卵');
  assert.equal(child.observation,undefined);
  assert.deepEqual(hatches,[{id:child.id,motherId:dam.id,tankId:'main',at:due}]);
  assert.deepEqual(applyCrystalAction(state,{type:'advance'},due).hatches,[]);
  assert.equal(child.parents,null);
});

test('原有虾的卵满位时等待，有空位后重新检查即能孵化',()=>{
  const full=own(50);
  full.session.Colony.shrimp['resident-0'].hatchAt=full.session.SimulationSeconds;
  const state=unifyAquarium(full,opts).session.Breeding, due=createGrowthDueCheck();
  assert.equal(due(state,now),false);
  const freed=applyCrystalAction(state,{type:'rest',id:'resident-1'},now).state;
  assert.equal(due(freed,now),true);
  const hatched=applyCrystalAction(freed,{type:'advance'},now).state;
  assert.equal(hatched.individuals[0].legacyHatchAt,null);
  assert.equal(due(hatched,now),false);
});

test('离线回缸与壁纸分段播放得到相同的旧虾孵化时间和水晶虾身份',()=>{
  const base=unifyAquarium(own(3),opts).session.Breeding;
  const stocked=applyCrystalAction(base,{type:'stock'},now).state;
  const form=now+stocked.stageMs.form;
  for(const [i,at] of [form+2000,form-1000,form].entries()) stocked.individuals[i].legacyHatchAt=at;
  const planned=applyCrystalAction(stocked,{type:'plan',motherId:'I1',fatherId:'I3',tankId:'main',size:2},now).state;
  const step=(s,at)=>applyCrystalAction(s,{type:'advance'},at).state;
  const end=form+stocked.growthMs+5000;
  const online=[form-800,form+350,form+2300,now+stocked.stageMs.hatch,end].reduce(step,planned);
  const offline=step(JSON.parse(JSON.stringify(planned)),end);
  assert.deepEqual(offline,online);
  const babies=offline.individuals.filter(r=>r.legacy && r.legacyAgeDays===0);
  assert.deepEqual(babies.map(r=>r.adultAt),[form-1000,form,form+2000].map(at=>at+stocked.growthMs));
  const notices=(before,after)=>crystalGrowthEvents(before,after).filter(e=>babies.some(r=>r.id===e.id));
  const justBorn=step(planned,form+2400);
  assert.deepEqual(notices(planned,justBorn),babies.toReversed().map(r=>({kind:'individual',id:r.id,stage:'hatched',at:r.adultAt-stocked.growthMs})));
  const adultEvents=babies.toReversed().map(r=>({kind:'individual',id:r.id,stage:'complete',at:r.adultAt}));
  assert.deepEqual(notices(planned,offline),adultEvents);
  assert.deepEqual(notices(justBorn,online),adultEvents);
  assert.deepEqual(notices(offline,offline),[]);
  assert.deepEqual(step(offline,end),offline);
});

test('满缸时等候的抱卵虾从腾出空位时开始计算幼虾年龄',()=>{
  const base=unifyAquarium(own(50),opts).session.Breeding;
  base.individuals[0].legacyHatchAt=now;
  const freedAt=now+base.growthMs*2;
  const room=applyCrystalAction(base,{type:'rest',id:'resident-1'},freedAt).state;
  assert.equal(room.individuals.length,50);
  const later=applyCrystalAction(room,{type:'advance'},freedAt+10000).state;
  assert.equal(later.individuals.at(-1).adultAt,freedAt+base.growthMs);
});
function own(n=5){const session=structuredClone(source);session.Tank.UniqueId='my-layout';session.Tank.Setup.Filled=false;session.Colony={shrimp:{},journal:[],treat:null};const creatures=Array.from({length:n},(_,i)=>({...structuredClone(template),CreatureId:'resident-'+i,SpeciesId:'red-cherry-shrimp'}));for(const c of creatures)session.Colony.shrimp[c.CreatureId]={name:'老朋友',sex:'female',ageDays:120,favorite:true,hatchAt:null,restUntil:0};return {session,creatures,stock:{tankId:session.Tank.UniqueId,creatures},elapsed:9,food:[],navigation:[],pellet:null};}
function crystal(){const state=createNewCrystalProgress({now,seed:31}),session=structuredClone(source);session.Tank.UniqueId='old-crystal';session.Breeding=state;session.BreedingRooms={version:1,activeId:'main',rooms:[{id:'breeding',session:blankBreedingRoom(source,'breeding')}],creatures:[]};const p=projectCrystalRooms(session,{version:1,tankId:'old-crystal',elapsed:9,creatures:[],food:[],navigation:[],pellet:null},state,source,template);return {...p.game,session:p.session};}
function check(p){validateCrystalProgress(p.session.Breeding);validateSession(p.session,runtime);validateCrystalRoster(p.session.Breeding,p.game.creatures,p.session.BreedingRooms.activeId);}
test('adoption maps each preview to its new resident even when a legacy shrimp already uses its ID',()=>{
  const base=unifyAquarium(own(2),opts).session.Breeding;
  base.individuals[0].id='I7';
  base.individuals[1].id='starter-I7';
  const {result,state}=applyCrystalAction(base,{type:'stock'},now);
  assert.equal(result.individualIds.length,7);
  assert.equal(result.individualIds[6],'starter-starter-I7');
  assert.deepEqual(state.individuals.slice(0,2),base.individuals);
  const cards=starterIndividuals(now,base.growthMs,base.individuals);
  for(const [i,id] of result.individualIds.entries()){
    assert.deepEqual(state.individuals.find(r=>r.id===id),cards[i]);
  }
});
test('own dry layout, identities, species, names and favorites migrate without invented genes or mutation',()=>{const old=own(),copy=structuredClone(old),p=unifyAquarium(old,opts);check(p);assert.deepEqual(old,copy);assert.deepEqual(p.session.Tank,old.session.Tank);assert.equal(p.session.Tank.Setup.Filled,false);assert.equal(p.session.Breeding.starterPending,true);assert.deepEqual(p.game.creatures,old.creatures);assert.ok(p.session.Breeding.individuals.every(r=>r.legacy&&r.P===null&&r.B===null&&r.name==='老朋友'&&r.protected));assert.equal(unifyAquarium({...p.game,session:p.session},opts),null);});
test('split old game merges crystal progress and original layout, including inactive main',()=>{const original=own(),c=crystal();c.session.Breeding=applyCrystalAction(c.session.Breeding,{type:'contest',id:'I1',contestId:c.session.Breeding.contests.cards[0].id},now).state;const b=projectCrystalRooms(c.session,c,c.session.Breeding,source,template,'breeding');const active={...b.game,session:b.session},p=unifyAquarium(active,{...opts,original});check(p);assert.deepEqual(p.session.Tank,original.session.Tank);assert.equal(p.session.Breeding.individuals.length,12);assert.deepEqual(p.session.Breeding.contests,c.session.Breeding.contests);assert.equal(p.session.Breeding.cash,c.session.Breeding.cash);assert.equal(p.session.BreedingRooms.activeId,'main');assert.equal(p.arrivals.length,7);assert.equal(p.session.Breeding.starterPending,undefined);});
test('resume path restores both rosters without changing input snapshots',()=>{const original=own(),resume=crystal(),copy=structuredClone(resume),p=unifyAquarium(original,{...opts,resume});check(p);assert.deepEqual(resume,copy);assert.equal(p.game.creatures.length,12);});
test('full old 50-shrimp main stays valid; conflicting or overflowing merge fails atomically',()=>{const o=own(50),p=unifyAquarium(o,opts);check(p);assert.equal(p.session.Breeding.tanks[0].capacity,50);const c=crystal(),copy=structuredClone(c);assert.throws(()=>unifyAquarium(c,{...opts,original:o}),/50|配置/);assert.deepEqual(c,copy);const conflict=own(1);conflict.creatures[0].CreatureId='I1';assert.throws(()=>unifyAquarium(c,{...opts,original:conflict}),/冲突/);});
test('one-time adoption in main preserves old residents and refuses repeat or overcapacity',()=>{const p=unifyAquarium(own(),opts);const s=applyCrystalAction(p.session.Breeding,{type:'stock'},now).state;assert.equal(s.individuals.length,12);assert.equal(s.individuals.filter(r=>r.legacy).length,5);assert.throws(()=>applyCrystalAction(s,{type:'stock'},now));const full=unifyAquarium(own(50),opts).session.Breeding,before=structuredClone(full);assert.throws(()=>applyCrystalAction(full,{type:'stock'},now));assert.deepEqual(full,before);});
test('directed breeding works in own main and legacy residents cannot enter breeding or contest',()=>{let s=unifyAquarium(own(),opts).session.Breeding;s=applyCrystalAction(s,{type:'stock'},now).state;const planned=applyCrystalAction(s,{type:'plan',motherId:'I1',fatherId:'I3',tankId:'main',size:2},now).state;assert.equal(planned.batches[0].tankId,'main');assert.equal(planned.individuals.find(r=>r.id==='I1').tank,'main');assert.throws(()=>applyCrystalAction(s,{type:'plan',motherId:'resident-0',fatherId:'I3',tankId:'main',size:2},now),/原有虾/);assert.throws(()=>applyCrystalAction(s,{type:'contest',id:'resident-0',contestId:s.contests.cards[0].id},now),/原有虾/);});
test('old carried eggs hatch once without invented genetics and wait safely when full',()=>{const o=own(1);o.session.Colony.shrimp['resident-0'].hatchAt=o.session.SimulationSeconds;let s=unifyAquarium(o,opts).session.Breeding;const rng=s.rngState;s=applyCrystalAction(s,{type:'advance'},now).state;assert.equal(s.individuals.length,2);assert.equal(s.individuals[0].legacyHatchAt,null);assert.ok(s.individuals[1].legacy);assert.equal(s.rngState,rng);assert.equal(applyCrystalAction(s,{type:'advance'},now+1).state.individuals.length,2);const full=own(50);full.session.Colony.shrimp['resident-0'].hatchAt=full.session.SimulationSeconds;const blocked=applyCrystalAction(unifyAquarium(full,opts).session.Breeding,{type:'advance'},now).state;assert.equal(blocked.individuals.length,50);assert.equal(blocked.individuals[0].legacyHatchAt,now);assert.equal(legacyHatchReady(blocked,blocked.individuals[0],now),false,'full egg wait must not write every second');});
test('empty new unified progress starts with no shrimp; malformed legacy fields and flags reject',()=>{const s=emptyUnifiedProgress(now,31);assert.equal(s.individuals.length,0);validateCrystalProgress(s);const p=unifyAquarium(own(1),opts).session.Breeding;p.individuals[0].B=[5,5,5];assert.throws(()=>validateCrystalProgress(p));p.individuals[0].B=null;delete p.unified;assert.throws(()=>validateCrystalProgress(p));});
