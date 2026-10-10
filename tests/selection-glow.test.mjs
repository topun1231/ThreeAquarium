import test from 'node:test';
import assert from 'node:assert/strict';
import {glowStrength} from '../src/selection-glow.js';

test('selection rim flashes and is gone after 1.5 s unless persistent', () => {
  assert.ok(glowStrength({selected:true, age:0.3}) > 0.5);
  assert.equal(glowStrength({selected:true, age:1.6}), 0);
  assert.ok(glowStrength({selected:true, age:5, persistent:true}) > 0);
  assert.ok(glowStrength({selected:true, age:5, persistent:true}) < 0.3);
  const hover = glowStrength({hovered:true, age:0});
  assert.ok(hover > 0 && hover < 0.2);
  assert.equal(glowStrength({age:0.3}), 0);
});
