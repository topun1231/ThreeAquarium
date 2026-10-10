import test from 'node:test';
import assert from 'node:assert/strict';
import {initialQuality, qualityPreset} from '../src/tank-look.js';

const store = initial => { const m = new Map(Object.entries(initial)); return {getItem:k => m.get(k) ?? null, setItem:(k, v) => m.set(k, String(v))}; };

test('legacy medium/low settings migrate to high', () => {
  for (const saved of ['low','medium','high','bogus']) {
    const storage = store({'aquarium.three.quality.v1':saved});
    assert.equal(initialQuality(storage), 'high');
    assert.equal(storage.getItem('aquarium.three.quality.v1'), 'high');
    assert.equal(qualityPreset(saved), qualityPreset('high'));
  }
});

test('narrow screens and blocked storage also use high quality', () => {
  assert.equal(initialQuality(store({}), () => true), 'high');
  assert.equal(initialQuality(store({}), () => false), 'high');
  assert.equal(initialQuality(store({'aquarium.three.quality.v1':'bogus'}), () => false), 'high');
  assert.equal(initialQuality({setItem(){throw new Error('storage blocked');}}), 'high');
});

test('free-floating bubble streams are gone from every preset', () => {
  for (const level of ['high', 'medium', 'low']) assert.equal(qualityPreset(level).bubbles, undefined);
  assert.equal(qualityPreset('low').pearling, 1);
});
