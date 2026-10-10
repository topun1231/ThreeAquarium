import test from 'node:test';
import assert from 'node:assert/strict';
import {qualityPreset} from '../src/tank-look.js';

test('picture quality can turn the heavy water effects off', () => {
  assert.equal(qualityPreset('low').caustic, 0);
  assert.equal(qualityPreset('low').fog, 0);
  assert.equal(qualityPreset('low').particles, 0);
  assert.equal(qualityPreset('low').shafts, false);
  assert.equal(qualityPreset('low').bubbles, false);
  assert.ok(qualityPreset('high').caustic > qualityPreset('medium').caustic);
  assert.ok(qualityPreset('high').fog <= 0.25);
  assert.equal(qualityPreset('high').shafts, true);
  assert.equal(qualityPreset('medium').shafts, false);
  assert.equal(qualityPreset('nope').fog, qualityPreset('high').fog);
});
