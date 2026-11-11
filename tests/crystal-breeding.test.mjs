import test from 'node:test';
import assert from 'node:assert/strict';
import {createBreedingState, validateBreedingState, applyBreedingAction, publicBreedingState, shopCatalogue, batchTankId, naturalPair} from '../src/crystal-breeding.js';

const GROWTH = 2700000, FORM = 120000, HATCH = 600000;
const shrimp = (id, sex = 'female', tank = 'breeding', extra = {}) => ({id, sex, B:[6, 6, 6], P:[6, 6, 6], tank, adultAt:0, protected:false, source:'founder', parents:null, ...extra});
const initial = (extra = []) => createBreedingState([shrimp('mother'), shrimp('father', 'male'), ...extra], {now:0, seed:7});
const plan = (state, size = 4, now = state.now) => applyBreedingAction(state, {type:'plan', motherId:'mother', fatherId:'father', tankId:'breeding', size}, now);
const tick = (state, now) => applyBreedingAction(state, {type:'advance'}, now);

test('confirming a plan moves both parents atomically and includes them in destination capacity',()=>{
  const founders=[shrimp('mother','female','main'),shrimp('father','male','main')];
  const start=createBreedingState(founders,{now:0,seed:7});
  const planned=plan(start,4);
  assert.ok(planned.individuals.every(r=>r.tank==='breeding'));
  assert.ok(start.individuals.every(r=>r.tank==='main'));
  assert.equal(planned.batches.length,1);
  const occupied=createBreedingState([...founders,...Array.from({length:5},(_,i)=>shrimp('occupant-'+i))],{now:0,seed:7});
  const before=structuredClone(occupied);
  assert.throws(()=>plan(occupied,4),/空间不足/);
  assert.deepEqual(occupied,before,'failed reservation leaves both parents in their original tank');
  assert.equal(plan(occupied,2).batches[0].size,2);
});

test('2/4 offspring reserve actual room, form deterministically, hatch once, mature offline', () => {
  for (const size of [2, 4]) {
    const start = initial(), pending = plan(start, size);
    assert.equal(pending.rngState, start.rngState);
    assert.equal(pending.individuals.length, 2);
    assert.equal(pending.batches[0].children.length, 0);
    const formed = tick(pending, FORM);
    assert.equal(formed.batches[0].children.length, size);
    assert.equal(formed.individuals.length, 2);
    assert.notEqual(formed.rngState, pending.rngState);
    const hatched = tick(formed, HATCH);
    assert.equal(hatched.individuals.length, 2 + size);
    assert.equal(hatched.batches[0].status, 'hatched');
    const mature = tick(hatched, GROWTH);
    assert.equal(mature.batches[0].status, 'complete');
    assert.deepEqual(tick(mature, GROWTH), mature);
    const offline = tick(pending, GROWTH);
    assert.deepEqual(offline, mature);
    assert.deepEqual(tick(offline, 7 * 86400000).individuals, mature.individuals);
    assert.equal(start.batches.length, 0);
  }
});

test('JSON restoration preserves formed genetics, RNG, sold lineage, and duplicate hatch protection', () => {
  const formed = tick(plan(initial(), 2), FORM);
  const restored = validateBreedingState(JSON.parse(JSON.stringify(formed)));
  assert.deepEqual(restored, formed);
  const mature = tick(restored, GROWTH);
  const sold = applyBreedingAction(mature, {type:'sell', id:'mother'}, GROWTH);
  assert.equal(sold.cash, 108);
  assert.equal(sold.individuals[0].tank, null);
  assert.deepEqual(sold.individuals[2].parents, ['mother', 'father']);
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(sold))), sold);
  assert.throws(() => applyBreedingAction(sold, {type:'sell', id:'mother'}, GROWTH), /已转让/);
  assert.equal(tick(sold, GROWTH + 1).individuals.length, 4);
});

test('failed plan or move preserves original state, time, money, and random state', () => {
  const full = initial(Array.from({length:8}, (_, i) => shrimp(`other-${i}`)));
  const before = JSON.stringify(full);
  assert.throws(() => plan(full, 2, 100), /空间不足/);
  assert.equal(JSON.stringify(full), before);
  const crowdedMain = initial(Array.from({length:20}, (_, i) => shrimp(`main-${i}`, 'male', 'main')));
  const previous = JSON.stringify(crowdedMain);
  assert.throws(() => applyBreedingAction(crowdedMain, {type:'move', id:'mother', tankId:'main'}, 100), /空间不足/);
  assert.equal(JSON.stringify(crowdedMain), previous);
});

test('reservations block extra arrivals, and a smaller brood fits where a standard brood does not', () => {
  const state = initial([...Array.from({length:6}, (_, i) => shrimp(`extra-${i}`)), shrimp('visitor', 'male', 'main')]);
  assert.throws(() => plan(state, 4), /空间不足/);
  const pending = plan(state, 2);
  assert.throws(() => applyBreedingAction(pending, {type:'move', id:'visitor', tankId:'breeding'}, 1), /空间不足/);
  assert.equal(tick(pending, HATCH).individuals.filter(record => record.tank === 'breeding').length, 10);
});

test('cancellation before formation releases reservations without drawing offspring; formation cannot be cancelled', () => {
  const start = initial(), pending = plan(start);
  const cancelled = applyBreedingAction(pending, {type:'cancel', batchId:pending.batches[0].id}, FORM - 1);
  assert.equal(cancelled.rngState, start.rngState);
  assert.equal(tick(cancelled, GROWTH).individuals.length, 2);
  assert.equal(plan(cancelled, 2).batches.length, 2);
  const before = JSON.stringify(pending);
  assert.throws(() => applyBreedingAction(pending, {type:'cancel', batchId:pending.batches[0].id}, FORM), /不能取消/);
  assert.equal(JSON.stringify(pending), before);
});

test('father releases on formation, mother stays protected through recovery; normal moves require explicit action', () => {
  const pending = plan(initial());
  for (const id of ['mother', 'father']) {
    assert.throws(() => applyBreedingAction(pending, {type:'move', id, tankId:'main'}, 1), /活动亲虾/);
    assert.throws(() => applyBreedingAction(pending, {type:'sell', id}, 1), /活动亲虾/);
  }
  const formed = tick(pending, FORM);
  const fatherMoved = applyBreedingAction(formed, {type:'move', id:'father', tankId:'main'}, FORM);
  assert.equal(fatherMoved.individuals[1].tank, 'main');
  const fatherSold = applyBreedingAction(fatherMoved, {type:'sell', id:'father'}, FORM);
  const hatched = tick(fatherSold, HATCH);
  assert.equal(applyBreedingAction(hatched, {type:'move', id:'mother', tankId:'main'}, HATCH).individuals[0].tank, 'main');
  assert.equal(applyBreedingAction(hatched, {type:'move', id:'mother', tankId:'main'}, GROWTH).individuals[0].tank, 'main');
  const moved = applyBreedingAction(initial(), {type:'move', id:'mother', tankId:'main'}, 0);
  assert.equal(plan(moved).individuals[0].tank, 'breeding');
  assert.equal(moved.individuals[0].tank, 'main');
});

test('protected or juvenile offspring cannot be sold, and public data hides B and premature P', () => {
  const protectedState = applyBreedingAction(initial(), {type:'protect', id:'mother', value:true}, 0);
  assert.throws(() => applyBreedingAction(protectedState, {type:'sell', id:'mother'}, 0), /收藏/);
  const formed = tick(plan(protectedState), FORM);
  const projection = publicBreedingState(formed);
  assert.ok(!Object.hasOwn(projection, 'rngState'));
  assert.ok(projection.individuals.every(record => !Object.hasOwn(record, 'B')));
  assert.ok(!Object.hasOwn(projection.batches[0], 'children'));
  const hatched = tick(formed, HATCH), childId = hatched.individuals[2].id;
  assert.throws(() => applyBreedingAction(hatched, {type:'sell', id:childId}, HATCH), /未成年/);
  assert.ok(!Object.hasOwn(publicBreedingState(hatched).individuals[2], 'P'));
  assert.ok(Object.hasOwn(publicBreedingState(tick(hatched, GROWTH)).individuals[2], 'P'));
});

test('corrupt saves are rejected rather than repaired', () => {
  const state = tick(plan(initial()), GROWTH);
  const corruptions = [
    s => { s.version = 2; }, s => { s.cash = -1; }, s => { s.rngState = NaN; },
    s => { s.individuals.push(structuredClone(s.individuals[0])); },
    s => { s.individuals[0].B[0] = 0; },
    s => { s.individuals[0].parents = ['missing', 'father']; },
    s => { s.individuals[0].parents = ['mother', 'father']; },
    s => { s.batches[0].children.pop(); }, s => { s.individuals.pop(); },
    s => { s.batches[0].status = 'planned'; }, s => { s.batches[0].hatchAt++; },
    s => { s.individuals[2].P[0] += 0.1; }, s => { s.tanks[0].capacity = 100; },
  ];
  for (const corrupt of corruptions) {
    const bad = structuredClone(state); corrupt(bad);
    assert.throws(() => validateBreedingState(bad));
  }
  assert.throws(() => tick(state, GROWTH - 1), /倒退/);
  assert.throws(() => applyBreedingAction(state, {type:'unknown'}, GROWTH));
});

test('non-default growth requires an explicit valid stage clock', () => {
  const records = initial().individuals;
  assert.throws(() => createBreedingState(records, {now:0, seed:1, growthMs:5400000}), /明确提供/);
  const slow = createBreedingState(records, {now:0, seed:1, growthMs:5400000, stageMs:{form:120000, hatch:900000}});
  assert.equal(plan(slow).batches[0].hatchAt, 900000);
  assert.throws(() => createBreedingState(records, {now:0, seed:1, growthMs:5400000, stageMs:{form:900000, hatch:120000}}), /阶段时间/);
});

test('a completed batch may be followed by another batch without losing the first lineage', () => {
  const first = tick(plan(initial(), 2), GROWTH);
  const second = plan(first, 2);
  const final = tick(second, 2 * GROWTH);
  assert.equal(final.individuals.length, 6);
  assert.equal(final.batches.length, 2);
  assert.deepEqual(final.batches[0].children, first.batches[0].children);
  assert.equal(new Set(final.individuals.map(record => record.id)).size, 6);
});

test('historical overlapping plans and identity counter exhaustion reject safely', () => {
  const cancelled = applyBreedingAction(plan(initial()), {type:'cancel', batchId:'crystal-1'}, 100);
  const malformed = structuredClone(cancelled);
  malformed.batches.push({...structuredClone(malformed.batches[0]), id:'other-batch'});
  assert.throws(() => validateBreedingState(malformed), /占用重叠/);
  const counter = initial([shrimp(`crystal-${Number.MAX_SAFE_INTEGER - 1}`, 'male', 'main')]);
  counter.nextId = Number.MAX_SAFE_INTEGER - 1;
  const original = JSON.stringify(counter);
  assert.throws(() => plan(counter), /序号已用尽/);
  assert.equal(JSON.stringify(counter), original);
});

test('fixed shop candidates cannot be overridden and purchased identity survives sale and reload', () => {
  const catalogue = shopCatalogue();
  assert.deepEqual(catalogue.map(item => [item.id, item.price, item.P]), [
    ['basic-female', 16, [5, 5, 5]], ['basic-male', 16, [5, 5, 5]], ['b1-colour-male', 40, [9, 5, 6]],
    ['black-mosura-female', 16, [5, 5, 5]], ['red-mosura-male', 16, [5, 5, 5]],
  ]);
  assert.ok(catalogue.every(item => item.developerCandidate && !Object.hasOwn(item, 'B')));
  catalogue[0].P[0] = 9;
  assert.equal(shopCatalogue()[0].P[0], 5);
  const bought = applyBreedingAction(initial(), {type:'buy', productId:'b1-colour-male', tankId:'main', price:0, B:[9, 9, 9], P:[9, 9, 9], sex:'female'}, 100);
  const record = bought.individuals.at(-1);
  assert.equal(bought.cash, 60);
  assert.equal(record.sex, 'male');
  assert.deepEqual(record.B, [9, 5, 6]);
  assert.equal(record.adultAt, 100);
  assert.equal(record.source, 'shop:b1-colour-male');
  assert.equal(record.parents, null);
  const sold = applyBreedingAction(bought, {type:'sell', id:record.id}, 100);
  const restored = validateBreedingState(JSON.parse(JSON.stringify(sold)));
  const before = JSON.stringify(restored);
  assert.throws(() => applyBreedingAction(restored, {type:'buy', productId:'b1-colour-male', tankId:'main'}, 200), /已经购买/);
  assert.equal(JSON.stringify(restored), before);
  assert.equal(restored.cash, 68);
});

test('shop rejects unaffordable, unknown, full and reserved destinations without charging or drawing RNG', () => {
  const poor = initial(); poor.cash = 15;
  const full = initial(Array.from({length:20}, (_, i) => shrimp(`main-${i}`, 'male', 'main')));
  const reserved = plan(initial(Array.from({length:6}, (_, i) => shrimp(`other-${i}`))), 2);
  for (const [state, productId, tankId, message] of [
    [poor, 'basic-female', 'main', /资金不足/],
    [full, 'basic-female', 'main', /空间不足/],
    [reserved, 'basic-female', 'breeding', /空间不足/],
    [initial(), 'invented', 'main', /商品不存在/],
    [initial(), 'basic-female', 'breeding-2', /目标缸不存在/],
  ]) {
    const before = JSON.stringify(state);
    assert.throws(() => applyBreedingAction(state, {type:'buy', productId, tankId}, FORM), message);
    assert.equal(JSON.stringify(state), before);
  }
});

test('purchased basic parents can breed without inventing lineage or resetting their identities', () => {
  let state = createBreedingState([], {now:0, seed:1});
  state = applyBreedingAction(state, {type:'buy', productId:'basic-female', tankId:'breeding'}, 0);
  state = applyBreedingAction(state, {type:'buy', productId:'basic-male', tankId:'breeding'}, 0);
  const [mother, father] = state.individuals;
  state = applyBreedingAction(state, {type:'plan', motherId:mother.id, fatherId:father.id, tankId:'breeding', size:2}, 0);
  const mature = tick(state, GROWTH);
  assert.equal(mature.cash, 68);
  assert.deepEqual(mature.individuals.at(-1).parents, [mother.id, father.id]);
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(mature))), mature);
});

test('two explicit expansion purchases reach 50 slots, support breeding and refuse replay or third purchase', () => {
  const start = initial(); start.cash = 300; // Isolated balance fixture, not a player money action.
  let state = applyBreedingAction(start, {type:'expand', tankId:'breeding-2'}, 0);
  const before = JSON.stringify(state);
  assert.throws(() => applyBreedingAction(state, {type:'expand', tankId:'breeding-2'}, 1), /已经购买/);
  assert.equal(JSON.stringify(state), before);
  state = applyBreedingAction(state, {type:'expand', tankId:'breeding-3'}, 0);
  assert.equal(state.cash, 120);
  assert.equal(state.tanks.reduce((sum, tank) => sum + tank.capacity, 0), 50);
  assert.throws(() => applyBreedingAction(state, {type:'expand', tankId:'breeding-4'}, 0), /50位上限/);
  for (const id of ['mother', 'father']) state = applyBreedingAction(state, {type:'move', id, tankId:'breeding-3'}, 0);
  state = applyBreedingAction(state, {type:'plan', motherId:'mother', fatherId:'father', tankId:'breeding-3', size:4}, 0);
  const restored = validateBreedingState(JSON.parse(JSON.stringify(state)));
  assert.equal(tick(restored, GROWTH).individuals.filter(record => record.tank === 'breeding-3').length, 6);
  const poor = initial(); poor.cash = 89;
  assert.throws(() => applyBreedingAction(poor, {type:'expand', tankId:'breeding-2'}, 0), /资金不足/);
  assert.equal(poor.cash, 89);
  assert.throws(() => applyBreedingAction(initial(), {type:'expand', tankId:'breeding-3'}, 0), /目标无效/);
});

test('all 50 slots count living individuals and brood reservations across expanded tanks', () => {
  let state = initial(); state.cash = 200;
  for (const tankId of ['breeding-2', 'breeding-3']) state = applyBreedingAction(state, {type:'expand', tankId}, 0);
  for (const tank of state.tanks) {
    const existing = state.individuals.filter(record => record.tank === tank.id).length;
    const target = tank.id === 'breeding' ? 8 : tank.capacity;
    for (let i = existing; i < target; i++) state.individuals.push(shrimp(`${tank.id}-${i}`, 'female', tank.id, {soldAt:null}));
  }
  state = plan(validateBreedingState(state), 2);
  const before = JSON.stringify(state);
  assert.throws(() => applyBreedingAction(state, {type:'buy', productId:'basic-female', tankId:'breeding'}, 0), /空间不足/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(tick(state, GROWTH).individuals.length, 50);
});

test('illegal expansions and damaged purchase receipts reject instead of repairing', () => {
  const state = applyBreedingAction(initial(), {type:'buy', productId:'basic-male', tankId:'main'}, 0);
  for (const damage of [
    s => { delete s.purchases; }, s => { s.purchases = []; },
    s => { s.purchases.push({...s.purchases[0]}); },
    s => { s.purchases[0].individualId = 'missing'; },
    s => { s.purchases[0].price = 0; }, s => { s.purchases[0].boughtAt = 1; },
    s => { s.individuals.at(-1).B[0] = 6; },
    s => { s.tanks.push({id:'made-up', capacity:10}); },
    s => { s.tanks.push({id:'breeding-3', capacity:10}); },
    s => { s.tanks.push({id:'breeding-2', capacity:20}); },
    s => { s.individuals[0].tank = 'breeding-2'; },
  ]) {
    const bad = structuredClone(state); damage(bad);
    assert.throws(() => validateBreedingState(bad));
  }
});

test('all breeding timestamps require nonnegative safe integer milliseconds', () => {
  const state = initial();
  const before = JSON.stringify(state);
  for (const now of [0.5, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createBreedingState([], {now, seed:1}), /时钟无效/);
    assert.throws(() => tick(state, now), /时间不能倒退/);
  }
  assert.equal(JSON.stringify(state), before);
  const cancelled = applyBreedingAction(plan(state), {type:'cancel', batchId:'crystal-1'}, 100);
  const bought = applyBreedingAction(state, {type:'buy', productId:'basic-male', tankId:'main'}, 100);
  for (const [source, damage] of [
    [state, s => { s.stageMs.form = 120000.5; }],
    [state, s => { s.stageMs.hatch = 600000.5; }],
    [state, s => { s.growthMs += 0.5; }],
    [state, s => { s.individuals[0].adultAt = 0.5; }],
    [cancelled, s => { s.batches[0].cancelledAt = 99.5; }],
    [bought, s => { s.purchases[0].boughtAt = 99.5; s.individuals.at(-1).adultAt = 99.5; }],
    [applyBreedingAction(state, {type:'sell', id:'mother'}, 100), s => { s.individuals[0].soldAt = 99.5; }],
  ]) {
    const bad = structuredClone(source); damage(bad);
    assert.throws(() => validateBreedingState(bad));
  }
  const nearLimit = createBreedingState([], {now:Number.MAX_SAFE_INTEGER, seed:1});
  assert.equal(tick(nearLimit, Number.MAX_SAFE_INTEGER).now, Number.MAX_SAFE_INTEGER);
});

test('appearance locks at formation without changing any quality, sex or RNG draw; names remain editable', () => {
  const old = initial(), named = initial();
  Object.assign(named.individuals[0], {name:'小枫', colour:'red', pattern:'band', traitGroup:'crystal-game-v1'});
  Object.assign(named.individuals[1], {name:'墨点', colour:'black', pattern:'hinomaru', traitGroup:'crystal-game-v1'});
  const plainFormed = tick(plan(old), FORM), namedFormed = tick(plan(named), FORM);
  assert.equal(namedFormed.rngState, plainFormed.rngState);
  for (let i = 0; i < 4; i++) for (const key of ['B', 'P', 'sex']) assert.deepEqual(namedFormed.batches[0].children[i][key], plainFormed.batches[0].children[i][key]);
  const restored = validateBreedingState(JSON.parse(JSON.stringify(namedFormed)));
  const hatched = tick(restored, HATCH), child = hatched.individuals[2];
  const renamed = applyBreedingAction(hatched, {type:'rename', id:child.id, name:'第一窝小宝'}, HATCH);
  assert.equal(renamed.individuals[2].name, '第一窝小宝');
  assert.equal(renamed.batches[0].children[0].name, child.name, 'birth snapshot keeps the original name');
  const visible = publicBreedingState(renamed).individuals[2];
  assert.equal(visible.colour, child.colour); assert.equal(visible.pattern, child.pattern);
  assert.ok(!Object.hasOwn(visible, 'B') && !Object.hasOwn(visible, 'P'));
  const bad = structuredClone(namedFormed); bad.batches[0].children[0].pattern = 'mosura';
  assert.throws(() => validateBreedingState(bad), /外观与固定亲代/);
  assert.throws(() => applyBreedingAction(renamed, {type:'rename', id:child.id, name:'虾'.repeat(17)}, HATCH), /名字/);
  const firstParent = applyBreedingAction(namedFormed, {type:'rename', id:'mother', name:'新的名字'}, FORM);
  assert.deepEqual(firstParent.batches[0].children, namedFormed.batches[0].children);
});

test('formed mother moves with reservations and unborn children, preserving the original historical tank', () => {
  const formed = tick(plan(initial(), 4), FORM);
  const moved = applyBreedingAction(formed, {type:'move', id:'mother', tankId:'main'}, FORM);
  assert.equal(moved.batches[0].tankId, 'breeding');
  assert.equal(batchTankId(moved.batches[0]), 'main');
  assert.equal(publicBreedingState(moved).batches[0].currentTankId, 'main');
  assert.deepEqual(moved.batches[0].relocations, [{at:FORM, from:'breeding', to:'main'}]);
  assert.ok(moved.batches[0].children.every(child => child.tank === 'main'));
  const hatch = tick(validateBreedingState(JSON.parse(JSON.stringify(moved))), HATCH);
  assert.equal(hatch.individuals.filter(record => record.tank === 'main').length, 5);
  const recovering = applyBreedingAction(hatch, {type:'move', id:'mother', tankId:'breeding'}, HATCH);
  assert.equal(recovering.individuals.filter(record => record.tank === 'main').length, 4, 'born children stay in their own tank');
  assert.ok(recovering.batches[0].children.every(child => child.tank === 'main'));
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(tick(recovering, GROWTH)))), tick(recovering, GROWTH));
});

test('mother transfer checks all reserved places and rejects an occupied brood slot without mutation', () => {
  const crowded = initial(Array.from({length:18}, (_, i) => shrimp(`main-${i}`, 'male', 'main')));
  const formed = tick(plan(crowded), FORM), before = JSON.stringify(formed);
  assert.throws(() => applyBreedingAction(formed, {type:'move', id:'mother', tankId:'main'}, FORM), /空间不足/);
  assert.equal(JSON.stringify(formed), before);
  let state = initial([shrimp('mother-2', 'female', 'main')]);
  state = tick(plan(state, 2), FORM);
  state = applyBreedingAction(state, {type:'move', id:'mother', tankId:'main'}, FORM);
  state = applyBreedingAction(state, {type:'plan', motherId:'mother-2', fatherId:'father', tankId:'breeding', size:2}, FORM);
  const snapshot = JSON.stringify(state);
  assert.throws(() => applyBreedingAction(state, {type:'move', id:'mother', tankId:'breeding'}, FORM), /已有未孵化批次/);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(tick(state, GROWTH + FORM).individuals.length, 7, 'a new batch may use a genuinely vacated historical slot');
});

test('corrupt relocation histories reject and same-time round trips retain distinct tank intervals', () => {
  let moved = applyBreedingAction(tick(plan(initial(), 2), FORM), {type:'move', id:'mother', tankId:'main'}, FORM);
  moved = applyBreedingAction(moved, {type:'move', id:'mother', tankId:'breeding'}, FORM);
  assert.equal(batchTankId(moved.batches[0]), 'breeding');
  assert.equal(tick(moved, GROWTH).individuals.length, 4);
  for (const damage of [
    s => { s.batches[0].relocations[0].at = FORM - 1; },
    s => { s.batches[0].relocations[0].from = 'main'; },
    s => { s.batches[0].relocations[0].to = 'missing'; },
    s => { s.batches[0].relocations[0].at = FORM + 0.5; },
    s => { s.batches[0].relocations = null; },
  ]) {
    const bad = structuredClone(moved); damage(bad);
    assert.throws(() => validateBreedingState(bad));
  }
});

test('natural action arranges exactly one main-tank brood using stable existing order', () => {
  const state = createBreedingState([shrimp('first-mother','female','main',{protected:true}),shrimp('first-father','male','main'),shrimp('later-mother','female','main'),shrimp('later-father','male','main')],{now:0,seed:7});
  const snapshot=JSON.stringify(state);
  assert.deepEqual(naturalPair(state),{motherId:'first-mother',fatherId:'first-father'});
  assert.equal(JSON.stringify(state),snapshot);
  for (const size of [2,4]) {
    const pending=applyBreedingAction(state,{type:'natural',size,motherId:'later-mother',fatherId:'later-father',tankId:'breeding'},0);
    const batch=pending.batches[0];
    assert.equal(batch.source,'natural'); assert.equal(batch.tankId,'main');
    assert.deepEqual([batch.motherId,batch.fatherId],['first-mother','first-father']);
    assert.equal(pending.rngState,state.rngState);
    assert.throws(()=>applyBreedingAction(pending,{type:'natural',size},FORM),/已有未孵化批次/);
    assert.throws(()=>applyBreedingAction(pending,{type:'move',id:'first-mother',tankId:'breeding'},0),/活动亲虾/);
    const matured=tick(validateBreedingState(JSON.parse(JSON.stringify(pending))),7*86400000);
    const previewSource=JSON.stringify(pending);
    assert.deepEqual(naturalPair(pending,7*86400000),naturalPair(matured));
    assert.equal(JSON.stringify(pending),previewSource,'preview does not generate children or consume RNG');
    assert.equal(matured.individuals.length,4+size);assert.equal(matured.batches.length,1);
    assert.equal(tick(matured,14*86400000).batches.length,1,'no automatic renewal');
  }
  assert.throws(()=>applyBreedingAction(state,{type:'plan',motherId:'first-mother',fatherId:'first-father',tankId:'main',size:2},0),/繁育缸/);
});

test('natural capacity failures are atomic, cancellation releases room, and formed mothers retain relocation safety', () => {
  const rows=[shrimp('mother','female','main'),shrimp('father','male','main'),...Array.from({length:17},(_,i)=>shrimp(`other-${i}`,'female','main'))];
  const crowded=createBreedingState(rows,{now:0,seed:7}),before=JSON.stringify(crowded);
  assert.throws(()=>applyBreedingAction(crowded,{type:'natural',size:2},0),/空间不足/);
  assert.equal(JSON.stringify(crowded),before);
  const state=createBreedingState(rows.slice(0,2),{now:0,seed:7});
  const pending=applyBreedingAction(state,{type:'natural',size:2},0);
  const cancelled=applyBreedingAction(pending,{type:'cancel',batchId:pending.batches[0].id},1);
  assert.equal(tick(cancelled,GROWTH).individuals.length,2);
  const moved=applyBreedingAction(pending,{type:'move',id:'mother',tankId:'breeding'},FORM);
  assert.equal(moved.batches[0].tankId,'main');assert.equal(batchTankId(moved.batches[0]),'breeding');
  assert.equal(tick(moved,GROWTH).individuals.filter(r=>r.tank==='breeding').length,3);
  const missing=createBreedingState([shrimp('only','female','main')],{now:0,seed:7});
  assert.throws(()=>applyBreedingAction(missing,{type:'natural',size:2},0),/主缸需要一对/);
});
