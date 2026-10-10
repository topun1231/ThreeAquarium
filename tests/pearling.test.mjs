import test from 'node:test';
import assert from 'node:assert/strict';
import {pearlRate} from '../src/pearling.js';

test('pearling is off in the dark and on low quality, and ramps up while the light stays on', () => {
  assert.equal(pearlRate({lightOn:false, litSeconds:200, quality:1}), 0);
  assert.equal(pearlRate({lightOn:true, litSeconds:200, quality:0}), 0);
  assert.ok(pearlRate({lightOn:true, litSeconds:10, quality:1}) < pearlRate({lightOn:true, litSeconds:90, quality:1}));
  assert.equal(pearlRate({lightOn:true, litSeconds:200, quality:1}), 1);
  assert.ok(pearlRate({lightOn:true, litSeconds:90, quality:0.5}) < 0.6);
});
