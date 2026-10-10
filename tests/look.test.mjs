import test from 'node:test';
import assert from 'node:assert/strict';
import {qualityPreset} from '../src/tank-look.js';

test('fixed high quality keeps shadows, all plants, water lighting and pearling', () => {
  const p = qualityPreset();
  assert.equal(p.floraDensity, 1);
  assert.equal(p.floraShadows, true);
  assert.equal(p.shrimpDetail, 'full');
  assert.equal(p.shafts, true);
  assert.equal(p.pearling, 1);
  assert.ok(p.caustic > 0 && p.fog > 0 && p.fog <= .25 && p.particles > 0);
  assert.equal(p.bubbles, undefined);
});
