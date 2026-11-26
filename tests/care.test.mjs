import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ADULT_AGE,BERRY_DAYS,babyName,biofilmRichness,careNeeds,careSummary,colonyTick,emptyColony,favoriteRoster,isFemale,noteTreat,observationGroups,observationRoster,parseShrimpName,sanitizeColony,shrimpDetail,syncRoster,tankEntry,TREAT_BONUS} from '../src/care.js';
import {advanceCreatureEcology} from '../src/ecology.js';

test('观察名单按在缸个体区分同名，尚无名字时仍能按身份定位',()=>{
  const agents=['id2','id1','id3'].map(CreatureId=>({data:{CreatureId}}));
  const colony={shrimp:{id1:{name:'小枫'},id2:{name:'小枫'},away:{name:'小枫'}}};
  assert.deepEqual(observationRoster(agents,colony),[{value:'id2',label:'小枫 · 同名第 1 只'},{value:'id1',label:'小枫 · 同名第 2 只'},{value:'id3',label:'id3'}]);
  assert.deepEqual(observationRoster(agents.slice(1,2),colony),[{value:'id1',label:'小枫'}]);
});
import {validateSession} from '../src/session.js';

test('找虾时收藏排在前面，同名个体保留身份，取消收藏后恢复在缸顺序',()=>{
  const agents=['a','b','c'].map(CreatureId=>({data:{CreatureId}}));
  const colony={shrimp:{a:{name:'小雪'},b:{name:'小雪',favorite:true},c:{name:'小红',favorite:true}}};
  assert.deepEqual(observationRoster(agents,colony),[
    {value:'b',label:'小雪 · 同名第 2 只 · 已收藏'},{value:'c',label:'小红 · 已收藏'},{value:'a',label:'小雪 · 同名第 1 只'}
  ]);
  colony.shrimp.b.favorite=false;
  assert.deepEqual(observationRoster(agents,colony).map(item=>item.value),['c','a','b']);
});

test('观察名单沿用出生手记的窝号，区分同名虾，未孵化个体不标窝号',()=>{
  const agents=['first','new','other'].map(CreatureId=>({data:{CreatureId}}));
  const colony={shrimp:{first:{name:'小雪'},new:{name:'小雪'},other:{name:'小红'}}};
  const batches=[
    {status:'cancelled'},
    {status:'complete',children:[{id:'first'},{id:'moved'}]},
    {status:'formed',children:[{id:'other'}]},
    {status:'hatched',children:[{id:'new'}]},
  ];
  assert.deepEqual(observationRoster(agents,colony,batches),[
    {value:'first',label:'小雪 · 第 2 窝第 1 只'},
    {value:'new',label:'小雪 · 第 4 窝第 1 只'},
    {value:'other',label:'小红'},
  ]);
});

test('缸边按出生顺序区分同名兄妹，只标记在本缸的实际参赛代表',()=>{
  const agents=['second','first'].map(CreatureId=>({data:{CreatureId,ExecutionState:'Walk'}}));
  const colony={shrimp:{first:{name:'小雪'},second:{name:'小雪'}}};
  const batch={status:'complete',children:[{id:'first'},{id:'second'}],rookieEntry:{entrantId:'second',rank:2}};
  assert.deepEqual(observationRoster(agents,colony,[batch]).map(r=>r.label),['小雪 · 第 1 窝第 2 只 · 新秀赛第 2 名','小雪 · 第 1 窝第 1 只']);
  const groups=observationGroups(agents,colony,[batch]);
  assert.deepEqual(groups.RookieEntrants,['second']);
  assert.deepEqual(groups.Walk,['second','first']);
  assert.deepEqual(observationGroups(agents.slice(1),colony,[batch]).RookieEntrants,[]);
});

const DAY = 86400;
test('幼虾只按出生窝想要的花色入选，移缸与成年后及时更新',()=>{
  const children=['sister','moved','brother'].map(id=>({id,colour:'red',pattern:'band'}));
  const clutch={status:'hatched',goal:'red:band',qualityGoal:'edge',children:[
    ...children,{id:'other',colour:'red',pattern:'mosura'},{id:'legacy'}
  ]};
  const batches=[clutch,{...clutch,goal:undefined,children:[{...children[0],id:'noGoal'}]},
    {...clutch,status:'formed',children:[{...children[0],id:'unborn'}]}];
  const matches=(...ids)=>observationGroups(ids.map(id=>agent(id)),null,batches).GoalHatchlings;
  assert.deepEqual(matches('unborn','noGoal','legacy','other','brother','sister'),['sister','brother']);
  assert.deepEqual(matches('moved'),['moved']);
  clutch.status='complete';
  assert.deepEqual(matches('moved','sister','brother'),[]);
});
test('观察达标成虾沿用出生窝目标，并按当前缸里实际存在的个体筛选',()=>{
  const kid=(id,coverage,pattern='band')=>({id,P:[7,coverage,6],colour:'red',pattern});
  const parents=[kid('mother',7),kid('father',6),kid('champion',9)];
  const brood=(children,goals)=>({status:'complete',motherId:'mother',fatherId:'father',children,...goals});
  const batches=[
    brood([kid('better',7.1),kid('rounded',7.001),kid('otherLook',8,'mosura'),kid('away',8)],{qualityGoal:'coverage',goal:'red:band'}),
    brood([kid('cap',9)],{motherId:'champion',qualityGoal:'coverage'}),
    brood([kid('colourOnly',4),{id:'old'}],{goal:'red:band'}),
    brood([kid('young',8)],{status:'hatched',goal:'red:band'}),
    brood([kid('noGoal',9)],{})
  ];
  const residents=batches.flatMap(b=>b.children).filter(k=>k.id!=='away').map(k=>agent(k.id));
  assert.deepEqual(observationGroups(residents,null,batches,parents).GoalAdults,['colourOnly','cap','better']);
  assert.deepEqual(observationGroups([agent('away')],null,batches,parents).GoalAdults,['away']);
});
const catalog = JSON.parse(fs.readFileSync(new URL('../public/assets/catalog.json', import.meta.url)));
const settings = JSON.parse(catalog.ground);
const defs = catalog.definitions.map(JSON.parse);
const source = JSON.parse(fs.readFileSync(new URL('../public/assets/setup.json', import.meta.url)));
const runtime = {definitions:defs, settings, entries:new Map(catalog.entries.map(entry => [entry.key, entry]))};
const agent = (id, {hunger = 0.2, stress = 0.1, state = 'Rest'} = {}) => ({data:{CreatureId:id, ExecutionState:state, Needs:{Hunger:hunger, Stress:stress, Fatigue:0.1}}});
const record = (name, extra = {}) => ({name, favorite:false, ageDays:ADULT_AGE, hatchAt:null, restUntil:0, ...extra});
const colonyOf = entries => ({shrimp:Object.fromEntries(entries), journal:[], treat:0});
test('轮看最近孵化且仍有成员在本缸的一窝，按出生顺序跳过离缸个体',()=>{
  const brood=(hatchAt,status,...ids)=>({hatchAt,status,children:ids.map(id=>({id}))});
  const batches=[brood(20,'hatched','a','away','b'),brood(10,'complete','older'),brood(30,'complete','moved'),brood(40,'formed','future')];
  const latest=(...ids)=>observationGroups(ids.map(id=>agent(id)),null,batches).LatestBrood;
  assert.deepEqual(latest('b','older','a','future'),['a','b']);
  assert.deepEqual(latest('older','future'),['older']);
  assert.deepEqual(latest('future'),[]);
  assert.deepEqual(latest('moved','a'),['moved']);
});
test('加餐观察只认本缸最近一餐实际吃过的个体，区分同名与普通觅食',()=>{
  const residents=[agent('a'),agent('b'),agent('grazer',{state:'Graze'})];
  const colony=colonyOf(residents.map(({data})=>[data.CreatureId,record('小雪')]));
  const diners=()=>observationGroups(residents,colony).MealVisitors;
  assert.deepEqual(diners(),[]);
  colony.lastFeeding=['b','moved','a'];
  assert.deepEqual(diners(),['a','b']);
  colony.lastFeeding=[];
  assert.deepEqual(diners(),[]);
});
test('观察分组允许动作与成长阶段重叠，只列当前缸，旧缸也能找到抱卵个体',()=>{
  const residents=[agent('mother',{state:'Graze'}),agent('child'),agent('legacy')];
  const colony=colonyOf([['mother',record('小雪')],['child',record('小雪',{ageDays:0})],['legacy',record('小红',{hatchAt:20})]]);
  const brood={motherId:'mother',status:'formed'};
  const groups=observationGroups(residents,colony,[brood,{motherId:'other-room',status:'formed'}]);
  assert.deepEqual(groups.Berried,['mother','legacy']);
  assert.deepEqual(groups.Graze,['mother']);
  assert.deepEqual(groups.Juvenile,['child']);
  assert.deepEqual(groups.Rest,['child','legacy']);
  brood.status='hatched';colony.shrimp.child.ageDays=ADULT_AGE;
  const later=observationGroups(residents,colony,[brood]);
  assert.deepEqual(later.Juvenile,[]);
  assert.deepEqual(later.Berried,['legacy']);
});
test('care observations distinguish a namesake even when only one needs attention',()=>{
  const agents=[agent('a',{hunger:.7,stress:.85}), agent('b',{hunger:.699}),agent('c',{stress:.73})];
  const colony=colonyOf([['a',record('小雪')],['b',record('小雪')],['c',record('小枫')] ]);
  assert.deepEqual(careNeeds(agents,colony),[
    {id:'a',name:'小雪',identity:'小雪 · a',signs:'饥饿 70% · 压力 85%'},
    {id:'c',name:'小枫',identity:'小枫',signs:'压力 73%'}
  ]);
  agents[0].data.Needs.Hunger=agents[0].data.Needs.Stress=.2;
  assert.deepEqual(careNeeds(agents,colony).map(r=>r.id),['c']);
  assert.deepEqual(careNeeds([],colony),[]);
});
const idFor = female => {
  for (let n = 0; n < 40; n++) {
    const id = `shrimp-${n}`;
    if (isFemale(id) === female) return id;
  }
  throw new Error('找不到对应性别的虾');
};

test('only a mature calm female in a living tank starts a 28-day berry', () => {
  const female = idFor(true), male = idFor(false), sim = 10 * DAY;
  const born = colonyTick(colonyOf([[female, record('小红')]]), [agent(female)], DAY, sim, {richness:0.8});
  assert.equal(born.hatches, 0);
  assert.equal(born.colony.shrimp[female].hatchAt, sim + BERRY_DAYS * DAY);
  assert.equal(born.colony.shrimp[female].name, '小红');
  assert.equal(agent(female).data.CreatureId, female);
  for (const [id, hunger, stress, age, richness] of [[male, 0.2, 0.1, ADULT_AGE, 0.8], [female, 0.8, 0.1, ADULT_AGE, 0.8], [female, 0.2, 0.5, ADULT_AGE, 0.8], [female, 0.2, 0.1, 10, 0.8], [female, 0.2, 0.1, ADULT_AGE, 0.1]]) {
    const colony = colonyOf([[id, record('虾', {ageDays:age})]]);
    const result = colonyTick(colony, [agent(id, {hunger, stress})], DAY, sim, {richness});
    assert.equal(result.colony.shrimp[id].hatchAt, null, id);
    assert.equal(result.hatches, 0);
  }
});

test('a berry hatches one juvenile after 28 days and not a day earlier', () => {
  const id = idFor(true), sim = 10 * DAY, shrimp = agent(id);
  const started = colonyTick(colonyOf([[id, record('小红', {favorite:true})]]), [shrimp], DAY, sim, {richness:0.8});
  const waiting = colonyTick(started.colony, [shrimp], 27 * DAY, sim + 27 * DAY, {richness:0.8});
  assert.equal(waiting.hatches, 0);
  assert.equal(waiting.colony.shrimp[id].hatchAt, sim + 28 * DAY);
  assert.equal(waiting.colony.shrimp[id].favorite, true);
  const hatched = colonyTick(waiting.colony, [shrimp], DAY, sim + 28 * DAY, {richness:0.8});
  assert.equal(hatched.hatches, 1);
  assert.equal(hatched.colony.shrimp[id].hatchAt, null);
  assert.deepEqual(Object.keys(hatched.colony.shrimp), [id]);
  assert.equal(shrimp.data.CreatureId, id);
});

test('sixty real seconds does not finish a hatch', () => {
  const id = idFor(true);
  const result = colonyTick(colonyOf([[id, record('小红')]]), [agent(id)], 60, 100000, {richness:0.8});
  assert.equal(result.hatches, 0);
  assert.equal(result.colony.shrimp[id].hatchAt, 100000 + BERRY_DAYS * DAY);
});

test('stress never drops an existing berry but still prevents a new one', () => {
  const id = idFor(true), shrimp = agent(id, {stress:1}), hatchAt = 28 * DAY;
  const original = colonyOf([[id, record('小红', {hatchAt})]]);
  const shocked = colonyTick(original, [shrimp], 1, 1, {richness:0.8});
  assert.equal(shocked.colony.shrimp[id].hatchAt, hatchAt);
  const restored = sanitizeColony(JSON.parse(JSON.stringify(shocked.colony)));
  const waiting = colonyTick(restored, [shrimp], 27 * DAY, 27 * DAY + 1, {richness:0.8});
  assert.equal(waiting.colony.shrimp[id].hatchAt, hatchAt);
  const hatched = colonyTick(waiting.colony, [shrimp], DAY - 1, hatchAt, {richness:0.8});
  assert.equal(hatched.hatches, 1);
  assert.equal(hatched.colony.shrimp[id].hatchAt, null);
  assert.equal(hatched.colony.journal.some(item => item.text.includes('没有保住')), false);
  const next = colonyTick(hatched.colony, [shrimp], 30 * DAY, 58 * DAY, {richness:0.8});
  assert.equal(next.colony.shrimp[id].hatchAt, null);
  assert.equal(original.shrimp[id].hatchAt, hatchAt);
});

test('a full tank keeps the mother and drops the juvenile', () => {
  const agents = Array.from({length:50}, (_, index) => agent(`full-${index}`));
  const colony = emptyColony();
  colony.shrimp['full-0'] = record('老大', {hatchAt:0});
  const result = colonyTick(colony, agents, DAY, DAY, {richness:0.8});
  assert.equal(result.hatches, 0);
  assert.match(result.colony.journal.at(-1).text, /缸已满/);
  assert.equal(agents[0].data.CreatureId, 'full-0');
});

test('thirty-six shrimp do not start another berry', () => {
  const id = idFor(true);
  const agents = [agent(id), ...Array.from({length:35}, (_, index) => agent(`crowd-${index}`))];
  const result = colonyTick(colonyOf([[id, record('小红')]]), agents, DAY, 10 * DAY, {richness:0.8});
  assert.equal(agents.length, 36);
  assert.equal(result.colony.shrimp[id].hatchAt, null);
});

test('a treat helps once and does not shorten the berry', () => {
  const id = idFor(true), colony = colonyOf([[id, record('小红')]]);
  colony.treat = TREAT_BONUS;
  const helped = colonyTick(colony, [agent(id, {hunger:0.5})], DAY, 10 * DAY, {richness:0.25});
  assert.equal(helped.colony.shrimp[id].hatchAt, 10 * DAY + BERRY_DAYS * DAY);
  const again = noteTreat({shrimp:{}, journal:[], treat:TREAT_BONUS}, false);
  assert.equal(again.stacked, false);
  assert.equal(again.colony.treat, TREAT_BONUS);
  const first = noteTreat(emptyColony(), false);
  assert.equal(first.stacked, true);
  assert.equal(first.colony.treat, TREAT_BONUS);
  assert.equal(emptyColony().treat, 0);
  assert.equal(noteTreat(emptyColony(), true).stacked, false);
});

test('care text leads with condition and keeps hunger on the selected shrimp', () => {
  const id = idFor(true), sim = 10 * DAY;
  const calm = agent(id), grazing = agent('grazing', {state:'Graze'});
  const colony = colonyOf([[id, record('小红', {favorite:true, hatchAt:sim + 3 * DAY})], ['grazing', record('二号')]]);
  const text = careSummary([calm, grazing], colony, {simSeconds:sim, richness:0.8});
  assert.match(text, /^状态良好/);
  assert.match(text, /觅食中 1/);
  assert.match(text, /抱卵 1 只，约 3 天后孵出（现实约 12 小时）/);
  assert.match(text, /生态第 11 天/);
  assert.match(text, /收藏：★小红/);
  assert.doesNotMatch(text, /偏饿/);
  const detail = shrimpDetail(calm, colony.shrimp[id], sim);
  assert.match(detail, /★ 小红/);
  assert.match(detail, /饥饿 20%/);
  assert.match(detail, /约 3 天后孵出（现实约 12 小时）/);
  assert.deepEqual(favoriteRoster([grazing, calm], colony).map(item => item.id), [id]);
});

test('biofilm is a richness scalar, not a requirement to hand-feed', () => {
  assert.equal(biofilmRichness(), 0);
  const example = biofilmRichness({plants:89, hardscape:6, simSeconds:7 * DAY});
  assert.ok(example > 0.7 && example <= 1);
});

test('offline grazing and hunger accrue together before saturation', () => {
  const profile={EcologicalHungerPerHour:.04,EcologicalStressRecoveryPerHour:.1,MinimumHunger:.06};
  function hunger(start,cover,hours,parts=1){
    const game={creatures:[{Needs:{Hunger:start,Stress:0}}],food:[]};
    for(let i=0;i<parts;i++)advanceCreatureEcology(game,hours*3600/parts,profile,[],0,cover);
    return game.creatures[0].Needs.Hunger;
  }
  assert.equal(hunger(.8,.38,24),1);
  assert.ok(Math.abs(hunger(.8,1,24)-.32)<1e-10);
  assert.ok(Math.abs(hunger(.8,1,24,24)-hunger(.8,1,24))<1e-10);
  assert.equal(hunger(.8,1,1000),.06);
  assert.equal(hunger(.02,1,0),.02);
});

test('hatchlings accrue only their own offline time while food and residents accrue the full interval', () => {
  const creatures=['parent','young','just-hatched'].map(CreatureId=>({CreatureId,Needs:{Hunger:.35,Stress:.6}}));
  const game={creatures,food:[0],pellet:{anchor:0,age:0}};
  const profile={EcologicalHungerPerHour:.04,EcologicalStressRecoveryPerHour:.1,MinimumHunger:.06};
  advanceCreatureEcology(game,7200,profile,[{kind:0}],1200,.5,new Map([['young',3600],['just-hatched',0]]));
  for(const [i,hours] of [2,1,0].entries()){
    assert.ok(Math.abs(creatures[i].Needs.Hunger-(.35+.01*hours))<1e-12);
    assert.ok(Math.abs(creatures[i].Needs.Stress-(.6-.1*hours))<1e-12);
  }
  assert.equal(game.food[0],.07);
  assert.equal(game.pellet,null);
});

test('shrimp names trim, allow Chinese, and reject empty or overlong text', () => {
  assert.equal(parseShrimpName('  小红  '), '小红');
  assert.equal(parseShrimpName('樱花虾'), '樱花虾');
  assert.equal(parseShrimpName('小 红'), '小 红');
  assert.equal(parseShrimpName('虾'.repeat(16)), '虾'.repeat(16));
  assert.throws(() => parseShrimpName('虾'.repeat(17)), /1–16/);
  assert.throws(() => parseShrimpName(''), /1–16/);
  assert.throws(() => parseShrimpName('   '), /1–16/);
  assert.throws(() => parseShrimpName('小\n红'), /无效/);
  assert.throws(() => parseShrimpName(12), /无效/);
});

test('names and favorites persist through a v4 session and old progress loads as defaults', () => {
  const id = 'stable-shrimp-id';
  const save = structuredClone(source);
  save.Colony = {shrimp:{[id]:{name:'  小红  ', favorite:true, ageDays:80}}, journal:[{day:2, text:'小红抱卵'}], treat:0.1};
  const loaded = validateSession(save, runtime);
  assert.equal(loaded.Colony.shrimp[id].name, '小红');
  assert.equal(loaded.Colony.shrimp[id].favorite, true);
  assert.equal(loaded.Colony.shrimp[id].ageDays, 80);
  assert.deepEqual(Object.keys(loaded.Colony.shrimp), [id]);
  const again = validateSession(JSON.parse(JSON.stringify(loaded)), runtime);
  assert.deepEqual(again.Colony.shrimp[id], loaded.Colony.shrimp[id]);
  const creatures = [{CreatureId:id}, {CreatureId:'other-shrimp'}];
  syncRoster(again.Colony, creatures.map(item => ({data:{CreatureId:item.CreatureId}})));
  assert.deepEqual(creatures.map(item => item.CreatureId), [id, 'other-shrimp']);
  assert.equal(again.Colony.shrimp[id].name, '小红');
  assert.equal(again.Colony.shrimp[id].favorite, true);
  assert.equal(again.Colony.shrimp['other-shrimp'].name, '2号');
  assert.equal(again.Colony.shrimp['other-shrimp'].favorite, false);
  assert.equal(again.Colony.shrimp['other-shrimp'].ageDays, ADULT_AGE);
  const legacy = structuredClone(source);
  legacy.Colony = {progress:0.4};
  assert.deepEqual(validateSession(legacy, runtime).Colony, emptyColony());
  assert.equal(validateSession(structuredClone(source), runtime).Colony, undefined);
  assert.throws(() => validateSession({...structuredClone(source), Colony:{progress:2}}, runtime));
  const named = structuredClone(source);
  named.Colony = {shrimp:{'abcd-stable':{ageDays:40}}, journal:[], treat:0};
  const defaults = validateSession(named, runtime).Colony.shrimp['abcd-stable'];
  assert.equal(defaults.name, 'abcd');
  assert.equal(defaults.favorite, false);
  assert.equal(sanitizeColony({progress:1}).shrimp && true, true);
  const fresh = emptyColony();
  fresh.shrimp.kept = record('幼虾1');
  assert.equal(babyName(fresh), '幼虾2');
  assert.equal(babyName(emptyColony()), '幼虾1');
  const invalid = structuredClone(source);
  invalid.Colony = {shrimp:{bad:{name:'', favorite:false}}, journal:[], treat:0};
  assert.throws(() => validateSession(invalid, runtime));
});

test('glass aim hits the near tank wall', () => {
  const hit = tankEntry({x:0, y:0.2, z:-2}, {x:0, y:0, z:1});
  assert.ok(Math.abs(hit.x) < 1e-9);
  assert.ok(Math.abs(hit.y - 0.2) < 1e-9);
  assert.ok(Math.abs(hit.z + 0.28) < 1e-9);
});
