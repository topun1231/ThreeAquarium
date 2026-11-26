import test from 'node:test';
import assert from 'node:assert/strict';
import {createContest, validateContest, evaluateContest, emptyContestRecordbook, validateContestRecordbook, settleContest,parentContestMarks,rivalComparison,contestLineup,contestStanding,lineContestHistory} from '../src/crystal-contests.js';
import {scoreShrimp} from '../src/crystal-genetics.js';

const card = (overrides = {}) => createContest({id:'colour-entry-1', theme:'colour', tier:'entry', seed:42, ...overrides});
const shrimp = (overrides = {}) => ({id:'shrimp-1', B:[7, 7, 7], P:[7, 7, 7], adultAt:1000, tank:'main', soldAt:null, ...overrides});
test('家系手记按个体和实报的赛卡列成绩，保留已售与静养记录，区分窝次、届次和组别',()=>{
  const colour=card({id:'colour-entry'}), pattern=card({id:'pattern-entry',theme:'pattern'});
  const dam=shrimp({id:'dam',name:'明',soldAt:2900,tank:null,contestDebuts:{'colour-entry':1000}});
  const child=shrimp({id:'child',name:'明',tank:'rest',P:[4,8,7],contestDebuts:{'colour-entry':1500,'pattern-entry':1800}});
  const sibling=shrimp({id:'sibling',name:'明',P:[9,9,9],contestDebuts:{'pattern-entry':1100}});
  const receipt=(id,entrantId)=>({contestId:id,entrantId,rank:2,rating:'silver',score:7,enteredAt:2000});
  const rookie=receipt('B2','child'),open=receipt('exhibition:1','dam'),fine=receipt('exhibition:2:fine-band','child');
  const state=freeze({individuals:[child,sibling,dam],batches:[{id:'B1',rookieEntry:receipt('B1','sibling')},{id:'B2',rookieEntry:rookie}],
    contests:{cards:[colour,pattern],exhibitions:[open,fine,receipt('exhibition:3','sibling')]}});
  const found=lineContestHistory(state,{founderId:'dam',members:['child']});
  assert.deepEqual(found.map(show=>show.id),['colour-entry','pattern-entry','rookie:B2','exhibition:1','exhibition:2:fine-band']);
  assert.deepEqual(found[0].entries,[dam,child].map(r=>({entrantId:r.id,enteredAt:r.contestDebuts['colour-entry'],...contestStanding(colour,r)})));
  assert.deepEqual(found.slice(2).map(show=>show.entries),[[rookie],[open],[fine]]);
  assert.equal(found[2].broodNumber,2);
  assert.deepEqual(lineContestHistory(state,{founderId:'sibling',members:[]}).map(show=>show.id),['pattern-entry','rookie:B1','exhibition:3']);
  assert.deepEqual(lineContestHistory({individuals:[shrimp()],batches:[],contests:{cards:[colour]}},{founderId:'shrimp-1',members:[]}),[]);
});
test('细白带展按可见宽度评红黑两色，三只对手也按同一规则展出条带纹', () => {
  const show=card({id:'exhibition:1:fine-band',theme:'fine-band'});
  const narrow=shrimp({colour:'red',pattern:'band',P:[6,4,6]}), wide={...narrow,P:[6,8,6]};
  assert.deepEqual([narrow,wide].map(r=>evaluateContest(show,r,1000).score),[6,4]);
  assert.deepEqual([narrow,wide].map(r=>evaluateContest(card(),r,1000).score),[5.5,6.5]);
  assert.deepEqual(evaluateContest(show,{...narrow,colour:'black',B:[1,9,1]},1000),evaluateContest(show,narrow,1000));
  const entries=contestLineup(show,narrow);
  assert.equal(entries[0].rank,evaluateContest(show,narrow,1000).rank);
  for(const {record,score} of entries.slice(1)){
    assert.equal(record.pattern,'band');
    assert.equal(score,evaluateContest(show,{...record,B:record.P,tank:'breeding',soldAt:null},1000).score);
  }
  assert.deepEqual(contestLineup(validateContest(structuredClone(show)),narrow),entries);
  for(const pattern of ['hinomaru','mosura',undefined])assert.throws(()=>evaluateContest(show,{...narrow,pattern},1000),/条带纹/);
  const comparison=rivalComparison({...show,npcs:[{P:[9,8,9]}]},narrow);
  assert.equal(comparison.trait,1);assert.ok(comparison.gap>0);
  assert.throws(()=>settleContest(emptyContestRecordbook(),show,narrow,1000),/本届专题赛/);
  assert.throws(()=>card({theme:'fine-band'}),/组别/);
  assert.throws(()=>validateContest({...show,theme:'colour'}),/组别/);
});
test('亲代同卡实绩在转让后仍可对照，孩子参赛后才显示分差',()=>{
  const event=card(), marks={[event.id]:0};
  const dam=shrimp({id:'dam',tank:null,soldAt:1500,contestDebuts:marks});
  const sire=shrimp({id:'sire',P:[9,7,7],contestDebuts:{'other-card':0}});
  const kid=shrimp({parents:['dam','sire']});
  const compare=()=>parentContestMarks(event,kid,[dam,sire]);
  assert.deepEqual(compare(),[{parent:dam,score:7,gap:null}]);
  kid.contestDebuts=marks; sire.contestDebuts=marks;
  assert.deepEqual(compare(),[{parent:dam,score:7,gap:0},{parent:sire,score:8,gap:-1}]);
  assert.deepEqual(parentContestMarks(event,shrimp(),[dam,sire]),[]);
});
test('评语比较前一名，领先时比较最高对手，按主题权重解释分差',()=>{
  const npcs=[[3,3,3],[7,7,7],[9,9,9]].map(P=>({P}));
  const compare=(theme,P)=>rivalComparison({theme,npcs},{P});
  assert.equal(compare('colour',[5,4,7]).rival.index,1);
  assert.equal(compare('colour',[5,4,7]).trait,0);
  assert.equal(compare('pattern',[5,4,7]).trait,1);
  assert.equal(compare('pattern',[9,9,9]).trait,null);
  const lead=rivalComparison({theme:'pattern',npcs:npcs.slice(0,2)},{P:[8,7,9]});
  assert.deepEqual([lead.rival.index,lead.gap,lead.trait],[1,1.25,2]);
});
function freeze(value) {
  if (value && typeof value === 'object') {Object.freeze(value); Object.values(value).forEach(freeze);}
  return value;
}

test('赛后的三只电脑虾沿用参赛性别和品质，每个赛场有可重现的个体照', () => {
  const event=freeze(card()), entrant=freeze(shrimp()), before=JSON.stringify(event);
  const entries=contestLineup(event,entrant), rivals=entries.slice(1);
  assert.equal(entries[0].record,entrant);
  assert.equal(entries[0].record.pattern,undefined);
  assert.deepEqual(rivals.map(({number})=>number),[1,2,3]);
  assert.deepEqual(rivals.map(({record})=>[record.colour,record.pattern]),[['black','band'],['red','band'],['red','band']]);
  for(const [i,{record,score}] of rivals.entries()){
    const npc=event.npcs[i];
    assert.deepEqual([record.sex,record.P,record.adultAt],[npc.sex,npc.P,0]);
    assert.equal(score,scoreShrimp(npc.P,event.theme));
    assert.ok(['red','black'].includes(record.colour));
    assert.ok(['band','mosura','hinomaru'].includes(record.pattern));
  }
  assert.deepEqual(contestLineup(validateContest(JSON.parse(before)),shrimp()),entries);
  assert.deepEqual(contestLineup(event,shrimp({P:[1,1,1]})).slice(1).map(e=>e.record),rivals.map(e=>e.record));
  for(const other of [card({id:'exhibition:1'}),card({seed:43})]){
    const oldIds=new Set(rivals.map(({record})=>record.id));
    assert.ok(contestLineup(other,entrant).slice(1).every(({record})=>!oldIds.has(record.id)));
  }
  assert.equal(JSON.stringify(event),before);
});

test('同场对照按四只的原始分数排名，并列和仅显示同分的成绩能区分', () => {
  const event={...card(),npcs:[6.004,6.003,6].map((p,i)=>({id:'npc-'+i,sex:'female',P:[p,p,p]}))};
  const entrant=shrimp({P:[6.003,6.003,6.003]});
  const entries=contestLineup(event,entrant);
  assert.deepEqual(entries.map(({rank,tied})=>[rank,tied]),[[2,true],[1,false],[2,true],[4,false]]);
  assert.equal(entries[0].rank,contestStanding(event,entrant).rank);
});

test('fixed seed snapshots contain three independent NPCs and survive JSON restore', () => {
  for (const theme of ['colour', 'pattern']) for (const tier of ['entry', 'advanced']) {
    const contest = card({theme, tier});
    assert.deepEqual(card({theme, tier}), contest);
    assert.equal(contest.npcs.length, 3);
    assert.deepEqual(validateContest(JSON.parse(JSON.stringify(contest))), contest);
    assert.notDeepEqual(card({theme, tier, seed:43}).npcs, contest.npcs);
    const before = structuredClone(contest);
    evaluateContest(freeze(contest), shrimp({P:[1, 1, 1]}), 1000);
    evaluateContest(contest, shrimp({P:[9, 9, 9]}), 1000);
    assert.deepEqual(contest, before);
  }
});

test('repeat evaluation is pure, scores unrounded 7.95 as silver, and respects themes', () => {
  const contest = freeze(card()), individual = freeze(shrimp({P:[7.95, 7.95, 7.95]}));
  const result = evaluateContest(contest, individual, 1000);
  assert.equal(result.score, 7.95);
  assert.equal(result.rating, 'silver');
  assert.deepEqual(evaluateContest(contest, individual, 1000), result);
  assert.deepEqual(evaluateContest(contest, individual, 2000), {...result, enteredAt:2000});
  assert.notEqual(evaluateContest(card(), shrimp({P:[8, 6, 4]}), 1000).score, evaluateContest(card({theme:'pattern'}), shrimp({P:[8, 6, 4]}), 1000).score);
});

test('exact ties share rank without random tie breaking', () => {
  const contest = card();
  for (const npc of contest.npcs) {
    const result = evaluateContest(contest, shrimp({P:[...npc.P]}), 1000);
    const expected = 1 + contest.npcs.filter(other => scoreShrimp(other.P, contest.theme) > result.score).length;
    assert.equal(result.rank, expected);
    assert.deepEqual(evaluateContest(contest, shrimp({P:[...npc.P]}), 1000), result);
  }
});

test('juveniles, sold shrimp, malformed qualities and timestamps cannot enter', () => {
  const contest = card();
  assert.throws(() => evaluateContest(contest, shrimp(), 999));
  assert.doesNotThrow(() => evaluateContest(contest, shrimp(), 1000));
  for (const soldAt of [0, 999, 2000, undefined]) assert.throws(() => evaluateContest(contest, shrimp({soldAt}), 1000));
  for (const tank of [null, undefined, '']) assert.throws(() => evaluateContest(contest, shrimp({tank}), 1000));
  for (const quality of [[NaN, 7, 7], [10, 7, 7], [7, 7], Array(3), ['7', 7, 7]]) {
    assert.throws(() => evaluateContest(contest, shrimp({P:quality}), 1000));
    assert.throws(() => evaluateContest(contest, shrimp({B:quality}), 1000));
  }
  for (const value of [NaN, Infinity, -1, 1.5, '1000']) {
    assert.throws(() => evaluateContest(contest, shrimp(), value));
    assert.throws(() => evaluateContest(contest, shrimp({adultAt:value}), 1000));
  }
});

test('first theme entry awards ten once, including other tiers/cards and JSON reload', () => {
  const original = freeze(emptyContestRecordbook());
  const first = settleContest(original, card(), shrimp(), 1000);
  assert.equal(first.reward, 10);
  assert.deepEqual(original, emptyContestRecordbook());
  assert.equal(settleContest(first.recordbook, card(), shrimp(), 1000).reward, 0);
  const second = settleContest(JSON.parse(JSON.stringify(first.recordbook)), card({id:'advanced-2', tier:'advanced', seed:76}), shrimp(), 1000);
  assert.equal(second.reward, 0);
  const third = settleContest(second.recordbook, card({id:'pattern-1', theme:'pattern'}), shrimp(), 1000);
  assert.equal(third.reward, 10);
  assert.equal(settleContest(third.recordbook, card({id:'pattern-2', theme:'pattern', tier:'advanced'}), shrimp(), 1000).reward, 0);
  assert.deepEqual(validateContestRecordbook(third.recordbook), third.recordbook);
});

test('same card retains only best score and every settlement recomputes caller data', () => {
  const contest = card();
  const first = settleContest(emptyContestRecordbook(), contest, shrimp(), 1000);
  const before = structuredClone(first.recordbook);
  const worse = settleContest(freeze(first.recordbook), contest, shrimp({id:'worse', P:[6, 6, 6], score:9, rank:1, rating:'gold'}), 1000);
  assert.equal(worse.result.score, 6);
  assert.deepEqual(worse.recordbook.bestByContest[contest.id], before.bestByContest[contest.id]);
  const better = settleContest(first.recordbook, contest, shrimp({id:'better', P:[8, 8, 8]}), 1000);
  assert.equal(better.reward, 0);
  assert.equal(better.recordbook.bestByContest[contest.id].entrantId, 'better');
  assert.deepEqual(first.recordbook, before);
  assert.throws(() => settleContest(first.recordbook, card({seed:43}), shrimp(), 1000));
  assert.throws(() => settleContest(first.recordbook, contest, first.result, 1000));
});

test('invalid cards or records reject without changing input; reserved object keys remain safe', () => {
  for (const overrides of [{seed:-1}, {seed:4294967296}, {seed:1.5}, {theme:'other'}, {tier:'other'}, {id:''}]) assert.throws(() => card(overrides));
  const tampered = card(); tampered.npcs[0].P[0] = tampered.npcs[0].P[0] === 9 ? 8 : 9;
  assert.throws(() => evaluateContest(tampered, shrimp(), 1000));
  const book = emptyContestRecordbook(); book.rewardedThemes.push('colour');
  const before = structuredClone(book);
  assert.throws(() => settleContest(book, card(), shrimp(), 1000));
  assert.deepEqual(book, before);
  const special = settleContest(emptyContestRecordbook(), card({id:'__proto__'}), shrimp(), 1000);
  assert.equal(Object.hasOwn(special.recordbook.bestByContest, '__proto__'), true);
  assert.deepEqual(validateContestRecordbook(JSON.parse(JSON.stringify(special.recordbook))), special.recordbook);
});

test('saved scores cross-check permanent identities and qualities without rejecting sold history', () => {
  const individual = shrimp(), first = settleContest(emptyContestRecordbook(), card(), individual, 1000);
  assert.equal(first.result.enteredAt, 1000);
  assert.equal(first.recordbook.bestByContest['colour-entry-1'].enteredAt, 1000);
  for (const soldAt of [null, 1000, 2000]) {
    const archive = freeze([shrimp({soldAt, tank:soldAt === null ? 'main' : null})]);
    assert.deepEqual(validateContestRecordbook(first.recordbook, archive, 2000), first.recordbook);
  }
  for (const archive of [[], [shrimp({id:'unknown'})], [shrimp({P:[8, 8, 8]})], [shrimp(), shrimp()]]) {
    assert.throws(() => validateContestRecordbook(first.recordbook, archive, 2000));
  }
  const forged = structuredClone(first.recordbook);
  forged.bestByContest['colour-entry-1'].entrantId = 'invented';
  assert.throws(() => validateContestRecordbook(forged, [individual], 2000));
});

test('history validation checks adulthood, sale ordering and optional current time', () => {
  const first = settleContest(emptyContestRecordbook(), card(), shrimp({adultAt:0}), 1000);
  assert.throws(() => validateContestRecordbook(first.recordbook, [shrimp({adultAt:1001})], 2000));
  assert.throws(() => validateContestRecordbook(first.recordbook, [shrimp({adultAt:0, soldAt:999, tank:null})], 2000));
  assert.throws(() => validateContestRecordbook(first.recordbook, [shrimp({adultAt:0, soldAt:2001, tank:null})], 2000));
  assert.throws(() => validateContestRecordbook(first.recordbook, [shrimp({adultAt:0})], 999));
  assert.throws(() => validateContestRecordbook(first.recordbook, undefined, 999));
  assert.throws(() => settleContest(first.recordbook, card(), shrimp({adultAt:0}), 999));
  for (const enteredAt of [undefined, -1, NaN, Infinity, 1000.5]) {
    const invalid = structuredClone(first.recordbook);
    invalid.bestByContest['colour-entry-1'].enteredAt = enteredAt;
    assert.throws(() => validateContestRecordbook(invalid, [shrimp({adultAt:0})], 2000));
  }
});

test('failed archive validation preserves the supplied book and successful equal scores preserve original entry time', () => {
  const first = settleContest(emptyContestRecordbook(), card(), shrimp(), 1000);
  const before = structuredClone(first.recordbook);
  assert.throws(() => validateContestRecordbook(freeze(first.recordbook), freeze([shrimp({P:[1, 1, 1]})]), 2000));
  assert.deepEqual(first.recordbook, before);
  const again = settleContest(first.recordbook, card(), shrimp(), 2000);
  assert.equal(again.result.enteredAt, 2000);
  assert.equal(again.recordbook.bestByContest['colour-entry-1'].enteredAt, 1000);
  assert.equal(again.reward, 0);
  assert.deepEqual(validateContestRecordbook(again.recordbook, [shrimp()], 2000), again.recordbook);
});
