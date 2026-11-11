import test from 'node:test';
import assert from 'node:assert/strict';
import {createContest, validateContest, evaluateContest, emptyContestRecordbook, validateContestRecordbook, settleContest} from '../src/crystal-contests.js';
import {scoreShrimp} from '../src/crystal-genetics.js';

const card = (overrides = {}) => createContest({id:'colour-entry-1', theme:'colour', tier:'entry', seed:42, ...overrides});
const shrimp = (overrides = {}) => ({id:'shrimp-1', B:[7, 7, 7], P:[7, 7, 7], adultAt:1000, tank:'main', soldAt:null, ...overrides});
function freeze(value) {
  if (value && typeof value === 'object') {Object.freeze(value); Object.values(value).forEach(freeze);}
  return value;
}

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
