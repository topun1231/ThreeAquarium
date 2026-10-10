import test from 'node:test';
import assert from 'node:assert/strict';
import {createPearling, pearlRate} from '../src/pearling.js';
import * as T from 'three';

test('pearling is off in the dark and on low quality, and ramps up while the light stays on', () => {
  assert.equal(pearlRate({lightOn:false, litSeconds:200, quality:1}), 0);
  assert.equal(pearlRate({lightOn:true, litSeconds:200, quality:0}), 0);
  assert.ok(pearlRate({lightOn:true, litSeconds:10, quality:1}) < pearlRate({lightOn:true, litSeconds:90, quality:1}));
  assert.equal(pearlRate({lightOn:true, litSeconds:200, quality:1}), 1);
  assert.ok(pearlRate({lightOn:true, litSeconds:90, quality:0.5}) < 0.6);
});

test('pearls cling to supplied leaf sites, then rise, and vanish in the dark', () => {
  const root = new T.Group();
  let light = true;
  const pearls = createPearling({
    root,
    sites:() => [{x:0.1, y:0.08, z:0.02, vigor:1.3}],
    lightOn:() => light,
    waterLevel:() => 0.58,
  });
  pearls.setQuality({pearling:1});
  for (let i = 0; i < 40; i++) pearls.update(0.5, i);
  const clinging = pearls.stats();
  assert.ok(clinging.alive > 0, 'some pearls spawned on the leaf');
  assert.equal(clinging.sites, 1);
  const mesh = pearls.group.children.find(m => m.visible);
  assert.ok(mesh);
  assert.ok(Math.abs(mesh.position.x - 0.1) < 0.01);
  assert.ok(mesh.position.y >= 0.08);
  for (let i = 0; i < 30; i++) pearls.update(0.4, 40 + i);
  const risen = pearls.group.children.filter(m => m.visible);
  assert.ok(risen.some(m => m.position.y > 0.09), 'detached pearls rise');
  const beforePop = Math.max(...pearls.group.children.filter(m => m.visible).map(m => m.scale.x), 0);
  assert.ok(beforePop < 0.01, `pearls stay drop-sized, not ${beforePop}`);
  light = false;
  pearls.update(0.2, 80);
  assert.equal(pearls.stats().alive, 0);
});
