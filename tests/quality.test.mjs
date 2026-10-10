import test from 'node:test';
import assert from 'node:assert/strict';
import {startQuality, initialQuality, qualityPreset} from '../src/tank-look.js';

const store = initial => { const m = new Map(Object.entries(initial)); return {getItem:k => m.get(k) ?? null, setItem:(k, v) => m.set(k, String(v))}; };

test('saved quality wins over the dropdown default after reload', () => {
  const select = {value:'high'};
  assert.equal(startQuality(select, store({'aquarium.three.quality.v1':'low'}), () => false), 'low');
  assert.equal(select.value, 'low');
  const medium = {value:'high'};
  assert.equal(startQuality(medium, store({'aquarium.three.quality.v1':'medium'}), () => false), 'medium');
  assert.equal(medium.value, 'medium');
});

test('without a saved choice narrow screens start low and wide screens high', () => {
  assert.equal(initialQuality(store({}), () => true), 'low');
  assert.equal(initialQuality(store({}), () => false), 'high');
  assert.equal(initialQuality(store({'aquarium.three.quality.v1':'bogus'}), () => false), 'high');
});

test('free-floating bubble streams are gone from every preset', () => {
  for (const level of ['high', 'medium', 'low']) assert.equal(qualityPreset(level).bubbles, undefined);
  assert.equal(qualityPreset('low').pearling, 0);
  assert.ok(qualityPreset('high').pearling > qualityPreset('medium').pearling);
});
