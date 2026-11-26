import test from 'node:test';
import assert from 'node:assert/strict';
import {createCrystalProgress,createNewCrystalProgress,validateCrystalProgress,applyCrystalAction,commissionCatalogue,commissionAppearance,meetsCommission} from '../src/crystal-progress.js';
import {rookieCard,contestStanding,exhibitionCard,nextExhibition} from '../src/crystal-contests.js';

const founder=(id,sex)=>({id,sex,B:[6,6,6],P:[6,6,6],tank:'breeding',adultAt:0,protected:false,source:'founder',parents:null,soldAt:null});
const create=()=>createCrystalProgress([founder('mother','female'),founder('father','male')],{now:0,seed:17});
const action=(s,a,t=s.now)=>applyCrystalAction(s,a,t).state;
const roundtrip=s=>validateCrystalProgress(JSON.parse(JSON.stringify(s)));

test('专题赛的两组共用一个名额，旧公开组档案与细白带组各按原得分恢复',()=>{
 const start=createNewCrystalProgress({now:0,seed:17});
 const fine={type:'exhibition',round:1,contestId:'exhibition:1:fine-band',id:'I1'};
 const open={type:'exhibition',round:1,id:'I3'};
 assert.throws(()=>action(start,{...fine,id:'I3'}),/条带纹/);
 assert.throws(()=>action(start,{...fine,id:'I6'}),/尚未成年/);
 assert.throws(()=>action(action(start,{type:'rest',id:'I1'}),fine),/静养/);
 for(const contestId of ['exhibition:2:fine-band','exhibition:1:unknown','exhibition:01:fine-band','exhibition:1:fine-band\n']){
  assert.throws(()=>action(start,{...fine,contestId}),/组别与届次/);
 }
 const old=action(start,open), first=old.contests.exhibitions[0];
 assert.deepEqual(roundtrip(old).contests.exhibitions,[first]);
 assert.deepEqual(action(start,{...open,contestId:'exhibition:1'}),old);
 const specialist=action(start,fine);
 assert.equal(specialist.contests.exhibitions[0].contestId,fine.contestId);
 assert.deepEqual(roundtrip(specialist),specialist);
 assert.deepEqual(specialist.individuals,start.individuals);
 assert.deepEqual(specialist.contests.records,start.contests.records);
 assert.equal(specialist.cash,start.cash);
 assert.throws(()=>action(specialist,open),/邀请已经变动/);
 assert.throws(()=>action(old,fine),/邀请已经变动/);
 const second={...fine,round:2,contestId:'exhibition:2:fine-band',id:'I2'}, opensAt=nextExhibition(old).opensAt;
 assert.throws(()=>action(old,second,opensAt-1),/尚未开放/);
 const both=action(old,second,opensAt+86400000);
 const sold=action(both,{type:'sell',id:'I2'});
 assert.deepEqual(roundtrip(sold).contests.exhibitions,both.contests.exhibitions);
 assert.deepEqual(sold.contests.exhibitions[0],first);
 assert.deepEqual(exhibitionCard(sold,2),exhibitionCard(old,2,second.contestId));
 const invalid=structuredClone(both);invalid.contests.exhibitions[1].entrantId='I3';
 assert.throws(()=>roundtrip(invalid),/历史与邀请/);
});

test('专题赛每届留一份邀请，按主动报名时间开放下一届',()=>{
 const start=createNewCrystalProgress({now:0,seed:17}), first={type:'exhibition',round:1,id:'I3'};
 assert.equal(roundtrip(start).contests.exhibitions,undefined);
 assert.throws(()=>action(start,{...first,id:'I6'}),/尚未成年/);
 const joined=action(start,first);
 assert.throws(()=>action(joined,first),/邀请已经变动/);
 assert.equal(joined.cash,start.cash);
 assert.deepEqual(joined.contests.records,start.contests.records);
 assert.deepEqual(joined.individuals,start.individuals);
 const next=nextExhibition(joined), second={type:'exhibition',round:2,id:'I1'};
 assert.equal(next.opensAt,2*60*60*1000);
 assert.throws(()=>action(joined,second,next.opensAt-1),/尚未开放/);
 const offline=roundtrip(action(joined,{type:'advance'},7*86400000));
 assert.deepEqual(nextExhibition(offline),next);
 assert.deepEqual(exhibitionCard(joined,2),exhibitionCard(offline,2));
 assert.equal(exhibitionCard(offline,1).theme,'colour');
 assert.equal(exhibitionCard(offline,2).theme,'pattern');
 assert.equal(exhibitionCard(offline,3).tier,'advanced');
 assert.equal(exhibitionCard(offline,4).theme,'pattern');
 assert.equal(exhibitionCard(offline,5).tier,'entry');
 const completed=action(offline,second,1);
 assert.equal(completed.contests.exhibitions.at(-1).enteredAt,offline.now);
 assert.deepEqual(roundtrip(completed),completed);
 assert.equal(nextExhibition(completed).opensAt,offline.now+next.opensAt);
 const sold=action(completed,{type:'sell',id:'I3'});
 assert.deepEqual(roundtrip(sold).contests.exhibitions,completed.contests.exhibitions);
 const changed=structuredClone(completed);changed.contests.exhibitions[0].rank=99;
 assert.throws(()=>roundtrip(changed),/成绩与本届评审不一致/);
 const tooEarly=structuredClone(completed);tooEarly.contests.exhibitions[1].enteredAt=1;
 assert.throws(()=>roundtrip(tooEarly),/历史与邀请/);
});

test('同窝求购目标在读档和成年后保留，未选委托的旧窝不会补记',()=>{
 const start=createNewCrystalProgress({now:0,seed:17});
 const plan={type:'plan',motherId:'I4',fatherId:'I3',tankId:'breeding',size:2,goal:'red:mosura'};
 const ordinary=action(start,plan);
 const tagged=action(start,{...plan,commissionGoal:'C1'});
 assert.equal(roundtrip(ordinary).batches[0].commissionGoal,undefined);
 const mature=s=>roundtrip(action(roundtrip(s),{type:'advance'},s.batches[0].adultAt));
 const grown=mature(tagged),batch=grown.batches[0];
 assert.equal(batch.commissionGoal,'C1');assert.deepEqual(batch.children,mature(ordinary).batches[0].children);
 const finished=action(grown,{type:'commission',commissionId:'C1',id:'I3'});
 assert.equal(roundtrip(finished).batches[0].commissionGoal,'C1');
 assert.throws(()=>action(finished,{...plan,fatherId:'I2',commissionGoal:'C1'}),/求购已经完成/);
 for(const bad of ['C2','unknown',null]){
  const broken=structuredClone(tagged);broken.batches[0].commissionGoal=bad;
  assert.throws(()=>roundtrip(broken),/求购目标/);
 }
 assert.throws(()=>action(start,{type:'natural',size:2,commissionGoal:'C1'}),/求购目标/);
 assert.equal(start.batches.length,0);
});

test('求购的选育方向与成年验虾共用花色要求，覆盖刚好达标就可以',()=>{
 const [red,spot]=commissionCatalogue();
 for(const colour of ['red','black'])for(const pattern of ['mosura','band','hinomaru']){
  const look={colour,pattern};
  for(const [card,matches] of [[red,colour==='red'],[spot,pattern==='hinomaru']]){
   assert.equal(commissionAppearance(look,card),matches);
   assert.equal(meetsCommission({...look,P:[9,card.minCoverage,9]},card),matches);
   assert.equal(meetsCommission({...look,P:[9,card.minCoverage-.01,9]},card),false);
   assert.equal(meetsCommission({...look,legacy:true},card),false);
  }
 }
});

test('一次安排准确返回新手记的编号，即使上一窝已取消',()=>{
 const start=createNewCrystalProgress({now:0,seed:17});
 const directed=applyCrystalAction(start,{type:'plan',motherId:'I1',fatherId:'I3',tankId:'breeding',size:2},0);
 assert.equal(directed.result.batchId,directed.state.batches[0].id);
 const cancelled=action(directed.state,{type:'cancel',batchId:directed.result.batchId});
 const natural=applyCrystalAction(cancelled,{type:'natural',size:2},1);
 assert.equal(natural.result.batchId,natural.state.batches[1].id);
 assert.notEqual(natural.result.batchId,directed.result.batchId);
});

test('每窝只保留玩家当时写的想法，旧窝和下一窝可留白，原话不参与遗传或评选',()=>{
 const start=createNewCrystalProgress({now:0,seed:7});
 const plan={type:'plan',motherId:'I1',fatherId:'I2',tankId:'breeding',size:4};
 const intent='想看小枫身上那道白带，在孩子身上会是什么样？';
 const planned=action(start,{...plan,intent}), blank=action(start,plan);
 const advance={type:'advance'}, due=planned.batches[0].adultAt;
 const mature=roundtrip(action(planned,advance,due)), control=roundtrip(action(blank,advance,due));
 assert.equal(mature.batches[0].intent,intent);
 const comparable=structuredClone(mature);delete comparable.batches[0].intent;
 assert.deepEqual(comparable,control);
 const next=action(mature,plan);
 assert.equal(Object.hasOwn(next.batches[1],'intent'),false);
 assert.equal(roundtrip(next).batches[0].intent,intent);
 const natural=action(start,{type:'natural',size:2,intent:'这次想看看公虾的后代。'});
 assert.equal(roundtrip(action(natural,{type:'cancel',batchId:natural.batches[0].id})).batches[0].intent,'这次想看看公虾的后代。');
 assert.equal(Object.hasOwn(action(start,{...plan,intent:''}).batches[0],'intent'),false);
 assert.equal(action(start,{...plan,intent:'🦐'.repeat(60)}).batches[0].intent,'🦐'.repeat(60));
 for(const bad of [null,{},'虾'.repeat(61),'两\n行',' 前后空格','两\u2028行']){
  assert.throws(()=>action(start,{...plan,intent:bad}),/观察/);
  const damaged=structuredClone(mature);damaged.batches[0].intent=bad;
  assert.throws(()=>roundtrip(damaged),/观察/);
 }
 assert.equal(start.batches.length,0);
});

test('成年窝的新秀邀请不因离线逾期，每窝只结算一只，离缸后仍可核实成绩',()=>{
 let state=createNewCrystalProgress({now:0,seed:17});
 const plan={type:'plan',motherId:'I1',fatherId:'I3',tankId:'breeding',size:2};
 state=action(state,plan);
 const first=state.batches[0], nextWeek=7*86400000;
 const enter=id=>({type:'rookieContest',batchId:first.id,id});
 state=action(state,{type:'advance'},first.hatchAt);
 const [a,b]=state.batches[0].children.map(k=>k.id);
 assert.throws(()=>action(state,enter(a)),/成年/);
 state=action(state,{type:'advance'},nextWeek);
 state=action(state,plan);
 state=action(state,{type:'advance'},state.batches[1].adultAt);
 const second=state.batches[1], cards=state.batches.map(batch=>rookieCard(state,batch));
 assert.notDeepEqual(cards[0].npcs,cards[1].npcs);
 assert.throws(()=>action(state,enter(second.children[0].id)),/本窝/);
 state=action(state,{type:'rest',id:a});
 assert.throws(()=>action(state,enter(a)),/静养/);
 const before=roundtrip(state), settled=applyCrystalAction(state,enter(b),state.now);
 state=roundtrip(settled.state);
 assert.deepEqual(rookieCard(state,state.batches[0]),cards[0]);
 assert.equal(settled.result.rank,contestStanding(cards[0],state.individuals.find(r=>r.id===b)).rank);
 assert.deepEqual(state.batches[0].rookieEntry,{...settled.result,seed:cards[0].seed,theme:cards[0].theme});
 assert.equal(state.cash,before.cash);assert.equal(state.rngState,before.rngState);
 assert.deepEqual(state.contests,before.contests);assert.equal(state.batches[1].rookieEntry,undefined);
 assert.throws(()=>action(state,enter(b)),/已经参加/);
 state=action(state,{type:'sell',id:b},state.now+1);
 assert.equal(roundtrip(state).batches[0].rookieEntry.entrantId,b);
 for(const entry of [null,{entrantId:'I1',enteredAt:state.now},{entrantId:b,enteredAt:first.hatchAt},{entrantId:b,enteredAt:state.now+4}]){
   const corrupt=structuredClone(state);corrupt.batches[0].rookieEntry=entry;
   assert.throws(()=>roundtrip(corrupt),/新秀赛/);
 }
 const forged=structuredClone(state);forged.batches[0].rookieEntry.score+=1;
 assert.throws(()=>roundtrip(forged),/新秀赛成绩/);
});

test('个体保留各张赛卡的首次参赛，被超越和离缸后仍可回看；旧档只恢复有据的个体',()=>{
 const debut=(s,id,t)=>action(s,{type:'contest',id,contestId:'colour-entry'},t);
 let state=debut(createNewCrystalProgress({now:0,seed:17}),'I1',100);
 delete state.individuals.find(i=>i.id==='I1').contestDebuts;
 state=debut(roundtrip(state),'I3',200);
 state=debut(state,'I1',300);
 state=action(state,{type:'contest',id:'I1',contestId:'pattern-entry'},400);
 state=action(state,{type:'protect',id:'I1',value:false},450);
 state=action(state,{type:'sell',id:'I1'},500);
 const archive=roundtrip(state), individual=archive.individuals.find(i=>i.id==='I1');
 assert.equal(archive.contests.records.bestByContest['colour-entry'].entrantId,'I3');
 assert.deepEqual(individual.contestDebuts,{'colour-entry':100,'pattern-entry':400});
 assert.equal(archive.individuals.find(i=>i.id==='I2').contestDebuts,undefined);
 for(const at of [-1,501,3.5]){
  individual.contestDebuts['colour-entry']=at;
  assert.throws(()=>roundtrip(archive),/参赛/);
 }
});

test('静养保留冠军身份和收藏；四个位置独立于全局活体与预留',()=>{
 let state=createNewCrystalProgress({now:0,seed:17});
 state.unified=true;state.tanks[0].capacity=50;
 while(state.individuals.length<50)state.individuals.push({...structuredClone(state.individuals[0]),id:'resident-'+state.individuals.length});
 const act=a=>{state=action(state,a);};
 act({type:'contest',contestId:'colour-entry',id:'I1'});
 const original=structuredClone(state.individuals[0]), cash=state.cash, honours=structuredClone(state.contests);
 assert.throws(()=>act({type:'rest',id:'I6'}),/成虾/);
 for(const id of ['I1','I3','I5','resident-7'])act({type:'rest',id});
 assert.throws(()=>act({type:'rest',id:'resident-8'}),/静养位置/);
 for(const a of [{type:'contest',contestId:'colour-entry',id:'I1'},{type:'sell',id:'I3'},{type:'move',id:'I1',tankId:'main'},{type:'plan',motherId:'I1',fatherId:'I2',size:2,tankId:'main'}])assert.throws(()=>act(a),/静养/);
 act({type:'plan',motherId:'I4',fatherId:'I2',size:4,tankId:'main'});
 assert.throws(()=>act({type:'rest',id:'I4'}),/空闲/);
 assert.throws(()=>act({type:'recall',id:'I1',tankId:'breeding'}),/全局/);
 const batch=state.batches[0];
 state=action(roundtrip(state),{type:'advance'},batch.adultAt);
 assert.equal(state.individuals.length,54);assert.throws(()=>act({type:'recall',id:'I1',tankId:'breeding'}),/全局/);
 act({type:'sell',id:state.batches[0].children[0].id});act({type:'recall',id:'I1',tankId:'main'});
 assert.deepEqual(state.individuals[0],original);assert.deepEqual(state.contests,honours);assert.equal(state.cash,cash+8);
 assert.deepEqual(roundtrip(state),state);
});

test('满缸可以指定两只虾换位，四个未孵化预留、收藏、履历和家系都随原档恢复',()=>{
 let state=createNewCrystalProgress({now:0,seed:17});
 state.unified=true;
 while(state.individuals.length<17){
  state.individuals.push({...structuredClone(state.individuals[0]),id:'guest-'+state.individuals.length});
 }
 state=action(state,{type:'contest',contestId:'colour-entry',id:'I1'});
 state=action(state,{type:'observation',id:'I1',value:'以前带它去过颜色赛'});
 state=action(state,{type:'protect',id:'I3',value:true});
 state=action(state,{type:'rest',id:'I1'});
 state=action(state,{type:'plan',motherId:'I4',fatherId:'I2',size:4,tankId:'main'});
 const before=roundtrip(state);
 const recall={type:'recall',id:'I1',tankId:'main'};
 assert.throws(()=>action(state,recall),/空间不足/);
 assert.equal(action(state,{...recall,tankId:'breeding'}).individuals.find(r=>r.id==='I1').tank,'breeding');
 for(const restId of ['I1','I6','I2','I4','missing',null])assert.throws(()=>action(state,{...recall,restId}));
 assert.throws(()=>action(state,{...recall,tankId:'breeding',restId:'I3'}),/目标缸/);
 const released=action(state,{type:'protect',id:'guest-8',value:false});
 const sold=action(released,{type:'sell',id:'guest-8'});
 assert.throws(()=>action(sold,{...recall,restId:'guest-8'}));
 const withClutch=structuredClone(state);
 const carrier=withClutch.individuals.findIndex(r=>r.id==='guest-8');
 withClutch.individuals[carrier]={id:'guest-8',sex:'female',source:'legacy-resident',tank:'main',
  species:'crystal-shrimp',legacy:true,legacyAgeDays:120,legacyHatchAt:50000,adultAt:0,
  parents:null,B:null,P:null,protected:true,soldAt:null};
 assert.throws(()=>action(roundtrip(withClutch),{...recall,restId:'guest-8'}),/空闲成虾/);
 const expected=structuredClone(before);
 expected.individuals.find(r=>r.id==='I1').tank='main';
 expected.individuals.find(r=>r.id==='I3').tank='rest';
 const exchanged=action(state,{...recall,restId:'I3'});
 assert.deepEqual(roundtrip(exchanged),expected);
 assert.throws(()=>action(exchanged,{...recall,restId:'I3'}),/静养/);
 assert.deepEqual(state,before);
});

test('全留路线：双缸满位后用旧窝办相册，零出售零参赛也能买齐五只亲虾和四缸',()=>{
 let state=createNewCrystalProgress({now:0,seed:17});
 const act=a=>{state=action(state,a);};
 act({type:'buy',productId:'b1-colour-male',tankId:'main'});
 for(const size of [4,4,4,4,4,2]){
  act({type:'plan',motherId:'I1',fatherId:'I3',tankId:'breeding',size});
  const planned=state.batches.at(-1);
  assert.throws(()=>action(state,{type:'featureBrood',batchId:planned.id,id:'I1'}),/成年/);
  state=action(state,{type:'advance'},planned.adultAt);
  for(const kid of state.batches.at(-1).children){
   if(state.individuals.filter(r=>r.tank==='main').length<20)act({type:'move',id:kid.id,tankId:'main'});
  }
 }
 assert.equal(state.individuals.length,30);assert.equal(state.cash,60);
 const [first,second]=state.batches;
 const feature=(b,id=b.children[0].id)=>act({type:'featureBrood',batchId:b.id,id});
 assert.throws(()=>feature(first,second.children[0].id),/这一窝/);
 const before=structuredClone(state.individuals);
 feature(first);assert.equal(state.cash,100);
 feature(first);feature(first,first.children[1].id);assert.equal(state.cash,100);
 assert.deepEqual(state.individuals,before);
 state=roundtrip(state);assert.equal(state.batches[0].representativeId,first.children[1].id);
 act({type:'expand',tankId:'breeding-2'});
 for(const b of state.batches.slice(1))feature(b);
 assert.equal(state.cash,170);
 act({type:'expand',tankId:'breeding-3'});
 for(const productId of ['basic-female','basic-male','black-mosura-female','red-mosura-male'])act({type:'buy',productId,tankId:'breeding-3'});
 assert.equal(state.cash,16);assert.equal(state.purchases.length,5);assert.equal(state.tanks.length,4);
 assert.ok(state.individuals.every(r=>r.soldAt===null));assert.deepEqual(roundtrip(state),state);
 const forged=structuredClone(state);forged.batches[0].representativeId=second.children[0].id;
 assert.throws(()=>validateCrystalProgress(forged),/相册代表/);
});

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
