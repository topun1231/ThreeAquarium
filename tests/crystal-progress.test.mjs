import test from 'node:test';
import assert from 'node:assert/strict';
import {createCrystalProgress,createNewCrystalProgress,validateCrystalProgress,applyCrystalAction,commissionCatalogue} from '../src/crystal-progress.js';

const founder=(id,sex)=>({id,sex,B:[6,6,6],P:[6,6,6],tank:'breeding',adultAt:0,protected:false,source:'founder',parents:null,soldAt:null});
const create=()=>createCrystalProgress([founder('mother','female'),founder('father','male')],{now:0,seed:17});
const action=(s,a,t=s.now)=>applyCrystalAction(s,a,t).state;
const roundtrip=s=>validateCrystalProgress(JSON.parse(JSON.stringify(s)));

test('new-game factory explicitly creates seven named appearance cards with five adults and two juveniles',()=>{
 for(const growthMs of [2700000,5400000]){
  const state=createNewCrystalProgress({now:1000,seed:17,growthMs});
  assert.equal(state.individuals.length,7);
  assert.equal(state.individuals.filter(i=>i.adultAt<=1000).length,5);
  assert.ok(state.individuals.every(i=>i.name&&i.colour&&i.pattern&&i.traitGroup==='crystal-game-v1'&&i.parents===null&&i.tank==='main'));
  assert.deepEqual(state.individuals[0].P,[6,5,8]);
  assert.equal(state.individuals[6].adultAt,1000+growthMs);
  assert.equal(state.stageMs.hatch,growthMs===2700000?600000:900000);
  assert.deepEqual(roundtrip(state),state);
  const planned=action(state,{type:'plan',motherId:'I1',fatherId:'I3',tankId:'breeding',size:2});
  assert.ok(action(planned,{type:'advance'},1000+growthMs).individuals.slice(7).every(i=>i.name&&i.colour&&i.pattern));
 }
 assert.throws(()=>createNewCrystalProgress({now:0.5,seed:17}));
});

test('full domain roundtrip keeps one brood, one reward, exact purchases and sold-parent history',()=>{
 const start=create();
 let state=action(start,{type:'plan',motherId:'mother',fatherId:'father',tankId:'breeding',size:2});
 state=action(roundtrip(state),{type:'advance'},2700000);
 const child=state.batches[0].children[0].id;
 const entered=applyCrystalAction(state,{type:'contest',contestId:'colour-entry',id:child},state.now);
 assert.equal(entered.result.reward,10);assert.equal(entered.state.cash,110);
 state=action(roundtrip(entered.state),{type:'contest',contestId:'colour-entry',id:child});
 assert.equal(state.cash,110);
 state=action(state,{type:'sell',id:child});
 assert.equal(roundtrip(state).contests.records.bestByContest['colour-entry'].entrantId,child);
 state=action(state,{type:'buy',productId:'basic-female',tankId:'main'});
 assert.equal(state.cash,102);assert.equal(state.purchases.length,1);
 assert.equal(state.individuals.length,5);assert.equal(state.individuals.filter(i=>i.soldAt===null).length,4);
 assert.equal(start.cash,100);assert.equal(start.batches.length,0);
 assert.deepEqual(roundtrip(state),state);
});

test('failed actions keep genetic RNG, reserves, cash and reward records unchanged',()=>{
 const state=create(),copy=structuredClone(state);
 assert.throws(()=>applyCrystalAction(state,{type:'contest',contestId:'colour-entry',id:'unknown'},600000));
 assert.deepEqual(state,copy);
 let scheduled=action(state,{type:'plan',motherId:'mother',fatherId:'father',tankId:'breeding',size:4});
 const before=structuredClone(scheduled);
 assert.throws(()=>applyCrystalAction(scheduled,{type:'sell',id:'mother'},120000));
 assert.deepEqual(scheduled,before,'failed transaction cannot form a brood in the original state');
 const offline=action(roundtrip(scheduled),{type:'advance'},7*86400000);
 const backwards=action(offline,{type:'advance'},1000);
 assert.deepEqual(backwards,offline,'clock rollback neither repeats nor reverses births');
 assert.throws(()=>applyCrystalAction(offline,{type:'advance'},NaN));
});

test('cross-file validation rejects a forged contest result and changed opponent card',()=>{
 const state=action(create(),{type:'contest',contestId:'colour-entry',id:'mother'});
 const unknown=structuredClone(state);unknown.contests.records.bestByContest['colour-entry'].entrantId='missing';
 assert.throws(()=>validateCrystalProgress(unknown),/未知个体/);
 const quality=structuredClone(state);quality.individuals[0].P=[9,9,9];
 assert.throws(()=>validateCrystalProgress(quality),/品质不一致/);
 const changed=structuredClone(state);changed.contests.cards[0]=changed.contests.cards[1];
 assert.throws(()=>validateCrystalProgress(changed),/身份重复/);
 const invalid=structuredClone(state);delete invalid.contests;
 assert.throws(()=>validateCrystalProgress(invalid));
});

const commissionStart=()=>createCrystalProgress([
 {...founder('mother','female'),colour:'red',pattern:'hinomaru',P:[6,7,6]},
 {...founder('father','male'),colour:'red',pattern:'hinomaru',P:[6,7,6]},
],{now:0,seed:17});

test('optional finite commissions pay total ten once and preserve the sold archive through restoration',()=>{
 const catalogue=commissionCatalogue();assert.equal(catalogue.length,2);assert.ok(catalogue.every(c=>c.price===10&&c.developerCandidate));
 catalogue[0].price=100;assert.equal(commissionCatalogue()[0].price,10);
 const start=commissionStart();
 let state=action(start,{type:'commission',commissionId:'C1',id:'mother',price:1000});
 assert.equal(state.cash,110);assert.equal(state.individuals.length,2);assert.equal(state.individuals[0].soldAt,0);
 assert.equal(state.individuals[0].commissionId,'C1');assert.equal(state.individuals[0].tank,null);
 state=roundtrip(state);
 const before=JSON.stringify(state);
 assert.throws(()=>action(state,{type:'commission',commissionId:'C1',id:'father'}),/已经完成/);
 assert.equal(JSON.stringify(state),before);
 assert.throws(()=>action(state,{type:'commission',commissionId:'C2',id:'mother'}),/已转让/);
 state=action(state,{type:'commission',commissionId:'C2',id:'father'});
 assert.equal(state.cash,120);assert.equal(state.commissions.deliveries.length,2);
 assert.deepEqual(roundtrip(state),state);assert.equal(start.cash,100);
});

test('commissions reject protected juveniles busy parents and unmet directions without advancing original state',()=>{
 const protectedState=action(commissionStart(),{type:'protect',id:'mother',value:true});
 const juvenile=commissionStart();juvenile.individuals[0].adultAt=1000;
 const pending=action(commissionStart(),{type:'plan',motherId:'mother',fatherId:'father',tankId:'breeding',size:2});
 const black=commissionStart();black.individuals[0].colour='black';
 const band=commissionStart();band.individuals[0].pattern='band';
 const low=commissionStart();low.individuals[0].P[1]=5;
 for(const [state,id,commissionId,pattern] of [[protectedState,'mother','C1',/收藏/],[juvenile,'mother','C1',/未成年/],[pending,'mother','C1',/活动亲虾/],[pending,'father','C1',/活动亲虾/],[black,'mother','C1',/不符合/],[band,'mother','C2',/不符合/],[low,'mother','C1',/不符合/]]){
  const before=JSON.stringify(state);assert.throws(()=>action(state,{type:'commission',commissionId,id}),pattern);assert.equal(JSON.stringify(state),before);
 }
});

test('commission receipts reject corruption and old missing optional book gains no rewards',()=>{
 const state=action(commissionStart(),{type:'commission',commissionId:'C1',id:'mother'});
 for(const damage of [s=>{s.commissions.version=2;},s=>{s.commissions.deliveries.push({...s.commissions.deliveries[0]});},s=>{s.commissions.deliveries[0].price=18;},s=>{s.commissions.deliveries[0].individualId='missing';},s=>{s.commissions.deliveries[0].deliveredAt=.5;},s=>{s.individuals[0].P[1]=5;},s=>{delete s.commissions;}]){
  const bad=structuredClone(state);damage(bad);assert.throws(()=>roundtrip(bad));
 }
 const legacy=create();delete legacy.commissions;
 const restored=roundtrip(legacy);assert.equal(restored.cash,100);assert.deepEqual(restored.commissions,{version:1,deliveries:[]});
 assert.ok(!Object.hasOwn(legacy,'commissions'));
});
