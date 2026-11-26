import test from 'node:test';
import assert from 'node:assert/strict';
import {appearanceOutcomes, broodQualityTarget, goalPartners, orderParentCandidates, pastGoalResults} from '../src/crystal-traits.js';
import {createNewCrystalProgress} from '../src/crystal-progress.js';
import {applyBreedingAction, validateBreedingState} from '../src/crystal-breeding.js';

test('挑伴侣先看与已选亲虾的目标花色机会，再按可见品质比较，同分保持原顺序',()=>{
  const list=[['other',5],['high',8],['half',4],['quarter',9],['tie',8.004]].map(([id,score])=>({id,P:[1,score,1]}));
  const matches=new Map([['other',new Map([['else',1]])],['high',new Map([['mate',.5]])],['half',new Map([['mate',.5]])],['quarter',new Map([['mate',.25]])],['tie',new Map([['mate',.5]])],['mate',new Map([['high',.5]])]]);
  const order=(map,id,key)=>orderParentCandidates([...list],map,id,key).map(r=>r.id);
  assert.deepEqual(order(matches,'mate','coverage'),['high','tie','half','quarter','other']);
  const otherPair=new Map([['half',new Map([['else',1]])]]);
  assert.deepEqual(order(otherPair,null,'coverage'),['half','quarter','high','tie','other']);
  assert.deepEqual(order(otherPair,'unmatched','coverage'),['quarter','high','tie','other','half']);
  assert.deepEqual(order(null,'mate','coverage'),['quarter','high','tie','other','half']);
  assert.deepEqual(order(null,null,''),list.map(r=>r.id));
});

test('回看同一对亲虾时两项目标必须落在同一只成年后代身上',()=>{
  const target=broodQualityTarget('coverage',{P:[4,7,8]},{P:[2,6,9]});
  const child=(pattern,coverage)=>({colour:'red',pattern,P:[3,coverage,4]});
  const broods=[
    {status:'complete',children:[child('band',6),child('mosura',8)]},
    {status:'complete',children:[child('band',8),{P:[3,9,4]}]},
    {status:'hatched',children:[child('band',9)]},
  ];
  assert.deepEqual(pastGoalResults(broods,'red:band',target),{evaluated:3,matched:1,unknown:1});
  assert.deepEqual(pastGoalResults(broods,'red:band',null),{evaluated:3,matched:2,unknown:1});
  assert.deepEqual(pastGoalResults(broods,'',target),{evaluated:4,matched:3,unknown:0});
});

test('按目标找搭档只使用候选亲虾的已知花色，交叉分支按每只后代列出',()=>{
  const adults=createNewCrystalProgress({now:0,seed:42}).individuals;
  const available=adults.filter(r=>r.id!=='I7').concat({id:'unknown',sex:'male'});
  const matches=goalPartners(available,'black:mosura');
  assert.deepEqual([...matches.get('I4')],[['I2',.25]]);
  assert.deepEqual([...matches.get('I2')],[['I4',.25]]);
  assert.equal(matches.has('I1'),false);
  assert.equal(matches.has('unknown'),false);
  assert.equal(goalPartners(available.filter(r=>r.id!=='I4'),'black:mosura').size,0);
  assert.equal(goalPartners(adults,'').size,0);
});

test('选亲目标只记录合法花色，读档后固定的后代与无目标的旧流程一致', () => {
  const initial = createNewCrystalProgress({now:0,seed:42});
  const outcomes = appearanceOutcomes(initial.individuals[3], initial.individuals[1]);
  assert.equal(new Set(outcomes.map(o => o.key)).size, 4);
  assert.ok(outcomes.every(o => o.probability === .25));
  const plan = {type:'plan', motherId:'I4', fatherId:'I2', size:2, tankId:'breeding'};
  assert.throws(() => applyBreedingAction(initial,{...plan,goal:'black:hinomaru'},0), /目标花色/);
  const planned = applyBreedingAction(initial,{...plan,goal:'black:mosura',qualityGoal:'coverage'},0);
  const grown = applyBreedingAction(JSON.parse(JSON.stringify(planned)),{type:'advance'},2700000);
  const old = applyBreedingAction(applyBreedingAction(initial,plan,0),{type:'advance'},2700000);
  assert.equal(grown.batches[0].goal,'black:mosura');
  assert.equal(grown.batches[0].qualityGoal,'coverage');
  assert.equal(old.batches[0].qualityGoal,undefined);
  assert.equal(old.batches[0].goal,undefined);
  assert.deepEqual(grown.batches[0].children,old.batches[0].children);
  grown.batches[0].goal = 'black:hinomaru';
  assert.throws(() => validateBreedingState(grown), /目标/);
});

test('品质目标按玩家看得到的分数比较，满分时可追求保持', () => {
  const dam={P:[9,5.502,3]}, sire={P:[7,5,8]};
  const target=broodQualityTarget('coverage',dam,sire);
  assert.equal(target.best,5.5);
  assert.equal(target.matches({P:[8,5.504,4]}),false);
  assert.equal(target.difference({P:[8,5.504,4]}),0);
  assert.equal(target.difference({P:[8,5.514,4]}),.01);
  assert.equal(target.difference({P:[8,5.486,4]}),-.01);
  assert.equal(target.matches({P:[8,5.51,4]}),true);
  const capped = broodQualityTarget('colour',dam,sire);
  assert.equal(capped.matches({P:[9,7,5]}),true);
  assert.equal(capped.matches({P:[8.99,9,9]}),false);
  assert.equal(broodQualityTarget('edge',dam,sire).best,8);
  assert.equal(broodQualityTarget('coverage',dam,null),null);
});

test('品质观察可独立记录，拒绝损坏的目标和自然繁殖的定向目标', () => {
  const initial=createNewCrystalProgress({now:0,seed:42});
  const action={type:'plan',motherId:'I4',fatherId:'I2',size:2,tankId:'breeding',qualityGoal:'edge'};
  const planned=applyBreedingAction(initial,action,0);
  assert.equal(planned.batches[0].goal,undefined);
  assert.equal(validateBreedingState(planned).batches[0].qualityGoal,'edge');
  planned.batches[0].qualityGoal=null;
  assert.throws(()=>validateBreedingState(planned),/品质目标/);
  assert.throws(()=>applyBreedingAction(initial,{...action,qualityGoal:'hidden'},0),/品质目标/);
  assert.throws(()=>applyBreedingAction(initial,{type:'natural',size:2,qualityGoal:'colour'},0),/品质目标/);
  assert.equal(initial.batches.length,0);
});

test('同窝可分别追细、追宽或自由观察，形成、孵化和成年读档均保留同一批后代',()=>{
  const initial=createNewCrystalProgress({now:0,seed:8});
  const [mother,father]=initial.individuals;
  const plan={type:'plan',motherId:mother.id,fatherId:father.id,tankId:'breeding',size:4};
  let baseline;
  for(const [goal,indices] of [[undefined,[]],['fine-band',[1]],['wide-band',[3]],['coverage',[3]]]){
    let state=applyBreedingAction(initial,goal?{...plan,qualityGoal:goal}:plan,0);
    const batch=state.batches[0];
    for(const at of [batch.plannedAt,batch.formedAt,batch.hatchAt,batch.adultAt]){
      state=applyBreedingAction(validateBreedingState(JSON.parse(JSON.stringify(state))),{type:'advance'},at);
      assert.equal(state.batches[0].qualityGoal,goal);
    }
    const children=state.batches[0].children;
    assert.deepEqual(children.map(k=>k.P[1]),[7,4,7,8]);
    const target=broodQualityTarget(goal,mother,father);
    assert.deepEqual(children.flatMap((k,i)=>target?.matches(k)?[i]:[]),indices);
    const outcome={children,rng:state.rngState,nextId:state.nextId};
    baseline??=outcome;
    assert.deepEqual(outcome,baseline);
  }
});

test('宽窄只对照条带亲虾和后代，两端用显示精度判断保持，其他纹样和同分保序',()=>{
  const band=width=>({colour:'red',pattern:'band',P:[5,width,5]});
  const other={...band(9),pattern:'mosura'};
  for(const [key,limit,different] of [['fine-band',1,1.01],['wide-band',9,8.99]]){
    const target=broodQualityTarget(key,band(limit),other);
    assert.equal(target.best,limit);
    assert.equal(target.atLimit,true);
    assert.equal(target.matches(band(key==='fine-band'?1.004:8.996)),true);
    assert.equal(target.matches(band(different)),false);
    assert.equal(target.difference(other),null);
    assert.equal(target.matches(other),false);
    assert.equal(broodQualityTarget(key,other,other),null);
    assert.equal(broodQualityTarget(key,band(5),{P:[1,4,1]}),null);
    const kids=[other,band(5.504),band(5.5),band(limit),{P:[8,1,9]}];
    assert.deepEqual(orderParentCandidates([...kids],null,null,key),[kids[3],kids[1],kids[2],kids[0],kids[4]]);
    assert.deepEqual(pastGoalResults([{status:'complete',children:kids}],'',target),{evaluated:4,matched:1,unknown:1});
  }
  assert.equal(broodQualityTarget('fine-band',band(5.5),other).difference(band(5.49)),.01);
});

test('不可比较的白带目标在建立计划及读档时被拒绝，原有亲虾、名额和随机状态均保留',()=>{
  const state=createNewCrystalProgress({now:0,seed:8});
  const before=structuredClone(state);
  const plan={type:'plan',motherId:'I4',fatherId:'I2',tankId:'breeding',size:4};
  for(const qualityGoal of ['fine-band','wide-band']){
    assert.throws(()=>applyBreedingAction(state,{...plan,qualityGoal,goal:'black:mosura'},0),/只比较条带纹/);
    assert.throws(()=>applyBreedingAction(state,{...plan,qualityGoal,fatherId:'I3'},0),/都没有条带纹/);
    assert.throws(()=>applyBreedingAction(state,{type:'natural',qualityGoal,size:2},0),/品质目标/);
    const saved=applyBreedingAction(state,{...plan,qualityGoal},0);
    saved.batches[0].goal='black:mosura';
    assert.throws(()=>validateBreedingState(saved),/只比较条带纹/);
  }
  assert.deepEqual(state,before);
});
