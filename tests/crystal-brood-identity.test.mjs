import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBreedingAction, publicBreedingState, tankOccupancy, validateBreedingState} from '../src/crystal-breeding.js';
import {createNewCrystalProgress} from '../src/crystal-progress.js';

const start = seed => createNewCrystalProgress({now:0, seed});
const pair = (state, size = 4) => applyBreedingAction(state, {type:'plan', motherId:'I4', fatherId:'I2', tankId:'breeding', size}, state.now);
const buy = state => applyBreedingAction(state, {type:'buy', productId:'basic-male', tankId:'main'}, state.now);
const advance = (state, time) => applyBreedingAction(state, {type:'advance'}, time);
const readBack = state => validateBreedingState(JSON.parse(JSON.stringify(state)));
const looks = children => children.map(kid => kid.colour + ':' + kid.pattern);

test('雪团与墨点的第一窝在独立新档可出现四种合法组合，每个出生位置都有变化', () => {
  const byPosition = Array.from({length:4}, () => new Set());
  const orders = new Set();
  const allowed = ['black:band', 'black:mosura', 'red:band', 'red:mosura'];
  for (let seed = 0; seed < 128; seed++) {
    const planned = pair(start(seed));
    const children = advance(planned, planned.stageMs.form).batches[0].children;
    const appearance = looks(children);
    appearance.forEach((value, i) => byPosition[i].add(value));
    orders.add(appearance.join('/'));
    assert.equal(planned.rngState, seed);
  }
  for (const position of byPosition) assert.deepEqual([...position].sort(), allowed);
  assert.ok(orders.size > 40);
});

test('买虾、重读已安排的进度、分段或一次离线长大，都会留下相同的个体及出生记录', () => {
  for (const size of [2, 4]) {
    const planned = pair(start(7), size), batch = planned.batches[0];
    const direct = advance(planned, batch.adultAt);
    const bought = buy(readBack(planned));
    const steps = [batch.formedAt, batch.hatchAt, batch.adultAt].reduce(advance, bought);
    assert.deepEqual(advance(readBack(bought), batch.adultAt), steps);
    assert.deepEqual(steps.batches[0].children, direct.batches[0].children);
    assert.deepEqual(steps.batches[0].children.map(kid => kid.id), batch.reservedChildIds);
    assert.deepEqual(steps.batches[0].children.map(kid => kid.name),
      Array.from({length:size}, (_, i) => '幼虾' + (i + 2)));
    assert.equal(steps.rngState, direct.rngState);
    assert.equal(steps.purchases.length, 1);
    assert.equal(steps.individuals.length, direct.individuals.length + 1);
    assert.throws(() => buy(bought), /已经购买/);
    assert.deepEqual(bought.batches, planned.batches);
  }
});

test('同一时刻在另一口缸加开自然繁殖，仍按确认顺序形成，两窝各有自己的身份', () => {
  const state = start(27);
  state.nextId = 8; // The next plan's numeric ID sorts before this one's as text.
  const first = pair(state);
  const both = applyBreedingAction(first, {type:'natural', size:2}, first.now);
  const unique = new Set(both.batches.flatMap(b => b.reservedChildIds));
  assert.equal(unique.size, 6);
  const offline = advance(both, both.growthMs);
  const online = [both.stageMs.form, both.stageMs.hatch, both.growthMs].reduce(advance, readBack(both));
  assert.deepEqual(online, offline);
  assert.deepEqual(online.batches[0].children, advance(first, first.growthMs).batches[0].children);
  assert.deepEqual(online.batches[1].children.map(k => k.id), both.batches[1].reservedChildIds);
  assert.deepEqual(both.batches.map(b => b.children), [[], []]);
});

test('预留身份在配对前台不可见，取消释放空间，损坏的预留不能冒充其他虾或家庭', () => {
  const planned = pair(start(19), 2), batch = planned.batches[0];
  const ids = batch.reservedChildIds;
  const publicBatch = publicBreedingState(planned).batches[0];
  assert.ok(!Object.hasOwn(publicBatch, 'reservedChildIds') && !Object.hasOwn(publicBatch, 'children'));
  assert.equal(planned.individuals.length, 7);
  assert.deepEqual(tankOccupancy(planned, 'breeding'), {animals:2, reserved:2});
  const cancelled = applyBreedingAction(planned, {type:'cancel', batchId:batch.id}, planned.now);
  assert.equal(cancelled.rngState, planned.rngState);
  assert.deepEqual(tankOccupancy(cancelled, 'breeding'), {animals:2, reserved:0});
  assert.ok(!Object.hasOwn(cancelled.batches[0], 'reservedChildIds'));
  assert.deepEqual(cancelled.batches[0].children, []);
  const again = pair(cancelled, 2);
  assert.equal(new Set([...ids, ...again.batches[1].reservedChildIds]).size, 4);
  for (const badIds of [null, [], [ids[0], ids[0]], [...ids].reverse(), [batch.id, 'crystal-4'], [ids[0], 'crystal-other-9']]) {
    const bad = structuredClone(planned);
    bad.batches[0].reservedChildIds = badIds;
    assert.throws(() => validateBreedingState(bad), /预留身份/);
  }
  const formed = advance(planned, batch.formedAt);
  formed.batches[0].reservedChildIds = ids;
  assert.throws(() => validateBreedingState(formed), /预留身份/);
});

// A pre-reservation save: numeric IDs were previously issued when the plan formed.
function oldPlannedBrood() {
  const state = start(7);
  for (const parent of state.individuals.filter(k => ['I4', 'I2'].includes(k.id))) parent.tank = 'breeding';
  state.nextId = 2;
  state.batches.push({id:'crystal-1', source:'directed', motherId:'I4', fatherId:'I2', tankId:'breeding',
    size:4, plannedAt:0, formedAt:state.stageMs.form, hatchAt:state.stageMs.hatch, adultAt:state.growthMs,
    cancelledAt:null, status:'planned', children:[]});
  return state;
}

test('旧档尚未形成的窝保留旧出生顺序，已形成、孵化和成年的旧记录逐项保留', () => {
  const old = oldPlannedBrood();
  const direct = advance(old, old.growthMs);
  const expected = direct.batches[0].children;
  assert.deepEqual(expected.map(k => k.id), ['crystal-2', 'crystal-3', 'crystal-4', 'crystal-5']);
  assert.deepEqual(looks(expected), ['red:mosura', 'black:band', 'red:mosura', 'red:mosura']);
  for (const time of [0, old.stageMs.form, old.stageMs.hatch, old.growthMs]) {
    const loaded = readBack(advance(old, time));
    const shopped = buy(loaded);
    assert.deepEqual(advance(readBack(shopped), old.growthMs).batches, direct.batches);
    assert.deepEqual(advance(loaded, old.growthMs).batches, direct.batches);
  }
  assert.ok(!('reservedChildIds' in old.batches[0]));
});

test('迁移旧配对时按照原先时间线给它留号，考虑先出生的旧观赏虾和同时形成的旧窝', () => {
  const state = oldPlannedBrood();
  state.unified = true;
  state.individuals.push({id:'old-berried', name:'旧抱卵虾', legacy:true, species:'red-cherry-shrimp', sex:'female',
    B:null, P:null, tank:'main', adultAt:0, protected:false, source:'legacy-resident', parents:null, soldAt:null,
    legacyAgeDays:100, legacyHatchAt:state.stageMs.form - 1000});
  state.batches[0].id = 'crystal-9';
  state.batches.push({...state.batches[0], id:'crystal-10', source:'natural', motherId:'I1', fatherId:'I3', tankId:'main', size:2, children:[]});
  state.nextId = 11;
  const direct = advance(state, state.growthMs);
  // The old resident used 11. The historic tie ordered crystal-10 before crystal-9.
  assert.deepEqual(direct.batches.map(b => b.children.map(k => k.id)), [
    ['crystal-14','crystal-15','crystal-16','crystal-17'], ['crystal-12','crystal-13']]);
  const shopped = buy(readBack(state));
  const restored = advance(readBack(shopped), state.growthMs);
  assert.deepEqual(restored.batches, direct.batches);
  assert.equal(restored.rngState, direct.rngState);
});
