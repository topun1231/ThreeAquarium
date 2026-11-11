import test from 'node:test';
import assert from 'node:assert/strict';
import {generateOffspring, scoreShrimp, rateScore} from '../src/crystal-genetics.js';

const sequence = values => {
  let index = 0;
  return () => values[index++];
};
const fixedDraw = (u, e, sex = 0) => sequence([u, e, u, e, u, e, sex]);

test('R6 fixed draws preserve fractional high-end slowdown and leave parents unchanged', () => {
  const mother = Object.freeze([8, 6, 9]), father = Object.freeze([8, 8, 9]);
  const samples = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  const child = generateOffspring(mother, father, sequence(samples));
  assert.deepEqual(child, {B:[7.95, 7, 8.8], P:[7.95, 7, 8.8], sex:'male'});
  assert.deepEqual(generateOffspring(mother, father, sequence(samples)), child);
  assert.deepEqual(mother, [8, 6, 9]);
  assert.deepEqual(father, [8, 8, 9]);
});

test('the inherited distribution has exactly 1/4/14/4/1 slots', () => {
  const counts = new Map();
  for (let i = 0; i < 24; i++) {
    const child = generateOffspring([4, 4, 4], [4, 4, 4], fixedDraw((i + 0.5) / 24, 0.5));
    counts.set(child.B[0], (counts.get(child.B[0]) || 0) + 1);
    assert.deepEqual(child.P, child.B);
  }
  assert.deepEqual([...counts], [[2, 1], [3, 4], [4, 14], [5, 4], [6, 1]]);
});

test('individual variation changes appearance only and has six equiprobable slots', () => {
  const values = [];
  for (let i = 0; i < 6; i++) {
    const child = generateOffspring([4, 4, 4], [4, 4, 4], fixedDraw(0.5, (i + 0.5) / 6));
    assert.deepEqual(child.B, [4, 4, 4]);
    values.push(child.P[0]);
  }
  assert.deepEqual(values, [3, 4, 4, 4, 4, 5]);
});

test('clipping applies to the inherited value before appearance and sex uses its own draw', () => {
  const child = generateOffspring([1, 1, 1], [1, 1, 1], fixedDraw(0, 0.999, 0.499));
  assert.deepEqual(child, {B:[1, 1, 1], P:[2, 2, 2], sex:'female'});
  const high = generateOffspring([9, 9, 9], [9, 9, 9], fixedDraw(0.999, 0.999, 0.999));
  assert.deepEqual(high, {B:[9, 9, 9], P:[9, 9, 9], sex:'male'});
});

test('better parents never lower a child under the same offset draws across the quality range', () => {
  for (let u = 0; u < 24; u++) for (let e = 0; e < 6; e++) {
    let previous;
    for (let mean = 1; mean <= 9; mean += 0.25) {
      const child = generateOffspring([mean, mean, mean], [mean, mean, mean], fixedDraw((u + 0.5) / 24, (e + 0.5) / 6));
      assert.ok(child.B.every(value => value >= 1 && value <= 9));
      assert.ok(child.P.every(value => value >= 1 && value <= 9));
      if (previous) {
        assert.ok(child.B[0] >= previous.B[0], `B: mean=${mean}, u=${u}`);
        assert.ok(child.P[0] >= previous.P[0], `P: mean=${mean}, u=${u}, e=${e}`);
      }
      previous = child;
    }
  }
});

test('invalid or sparse qualities and invalid random sources fail without repair', () => {
  const valid = [6, 6, 6];
  for (const invalid of [null, {}, [], [6, 6], [6, 6, 6, 6], Array(3), [6, undefined, 6], [NaN, 6, 6], [Infinity, 6, 6], ['6', 6, 6], [0, 6, 6], [10, 6, 6]]) {
    assert.throws(() => generateOffspring(invalid, valid, () => 0.5));
    assert.throws(() => generateOffspring(valid, invalid, () => 0.5));
    assert.throws(() => scoreShrimp(invalid, 'colour'));
  }
  for (const rng of [undefined, null, 0, {}]) assert.throws(() => generateOffspring(valid, valid, rng));
  for (const value of [undefined, null, '0.5', NaN, Infinity, -0.01, 1]) {
    assert.throws(() => generateOffspring(valid, valid, () => value));
    assert.throws(() => generateOffspring(valid, valid, sequence([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, value])));
  }
});

test('theme scores differ by the declared weights and ratings never round up', () => {
  assert.equal(scoreShrimp([8, 6.5, 7], 'colour'), 7.375);
  assert.equal(scoreShrimp([8, 6.5, 7], 'pattern'), 7.125);
  assert.equal(rateScore(scoreShrimp([7.95, 7.95, 7.95], 'colour')), 'silver');
  for (const [score, rating] of [[1, 'participation'], [5.999, 'participation'], [6, 'bronze'], [6.999, 'bronze'], [7, 'silver'], [7.999, 'silver'], [8, 'gold'], [9, 'gold']]) assert.equal(rateScore(score), rating);
  for (const invalid of [null, '8', NaN, Infinity, 0, 9.1]) assert.throws(() => rateScore(invalid));
  assert.throws(() => scoreShrimp([6, 6, 6], 'unknown'));
});
