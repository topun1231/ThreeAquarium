import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {installShrimpLook} from '../src/shrimp-look.js';
import {shrimpSizeFactor} from '../src/shrimp-scale.js';

function animal(id = 'display-shrimp') {
  const rig = new T.Group(), shell = new T.MeshStandardMaterial({name:'Shell'}), eye = new T.MeshStandardMaterial({name:'Eyes'});
  const mesh = new T.Mesh(new T.BoxGeometry(0.025, 0.005, 0.005), shell), eyes = new T.Mesh(new T.SphereGeometry(0.001), eye);
  mesh.castShadow = mesh.receiveShadow = true;
  const host = new T.Bone(); host.name = 'Abdomen_02'; rig.add(mesh, eyes, host);
  return {id, rig, shell, eye, mesh};
}
const individual = (extra = {}) => ({id:'display-shrimp', sex:'female', colour:'red', pattern:'band', P:[8, 7, 6], adultAt:100, ...extra});

test('optional crystal callback preserves legacy material branch and shadows', () => {
  const a = animal(), look = installShrimpLook({record:() => ({ageDays:30}), simSeconds:() => 0});
  look.sync([a]);
  assert.equal(a.look.uniforms.aqCrystal.value, 0);
  assert.equal(a.sizeFactor, shrimpSizeFactor(a.id));
  assert.equal(a.mesh.castShadow, true); assert.equal(a.mesh.receiveShadow, true);
  const shader = {uniforms:{}, vertexShader:T.ShaderLib.standard.vertexShader, fragmentShader:T.ShaderLib.standard.fragmentShader};
  a.shell.onBeforeCompile(shader);
  assert.equal(shader.uniforms.aqCrystal, a.look.uniforms.aqCrystal);
  assert.ok(shader.vertexShader.includes('aqBody = position;'));
  assert.ok(shader.fragmentShader.includes('if (aqCrystal > 0.5)'));
  assert.ok(shader.fragmentShader.includes('#include <map_fragment>'));
  assert.ok(shader.fragmentShader.includes('#include <lights_physical_pars_fragment>'));
  assert.equal(a.shell.customProgramCacheKey(), 'shrimp-look-v2-crystal');
  const eyeShader = {uniforms:{}, vertexShader:'eye-vertex', fragmentShader:'eye-fragment'};
  a.eye.onBeforeCompile(eyeShader);
  assert.equal(eyeShader.fragmentShader, 'eye-fragment');
});

test('explicit sex, colour, pattern and adult qualities update independent uniforms without recompilation', () => {
  const a = animal(); let current = individual(), now = 100;
  const look = installShrimpLook({record:() => ({ageDays:30}), simSeconds:() => 0, crystal:() => ({individual:current, now})});
  look.sync([a]);
  assert.equal(a.look.female, true); assert.equal(a.sizeFactor, shrimpSizeFactor(a.id, 'female'));
  assert.equal(a.look.uniforms.aqCrystal.value, 1); assert.equal(a.look.uniforms.aqCrystalPattern.value, 0);
  const red = a.look.uniforms.aqCrystalColour.value.clone(), materialVersion = a.shell.version;
  current = individual({sex:'male', colour:'black', pattern:'hinomaru', P:[9, 9, 9]}); look.sync([a]);
  assert.equal(a.look.female, false); assert.equal(a.look.uniforms.aqCrystalPattern.value, 1);
  assert.ok(a.look.uniforms.aqCrystalColour.value.x < red.x);
  assert.equal(a.look.uniforms.aqCrystalCoverage.value, 1); assert.equal(a.look.uniforms.aqCrystalEdge.value, 1);
  current = individual({pattern:'mosura'}); look.sync([a]);
  assert.equal(a.look.uniforms.aqCrystalPattern.value, 2); assert.equal(a.shell.version, materialVersion);
});

test('juvenile visual quality cannot reveal locked adult P and eggs use real brood milliseconds', () => {
  const a = animal(); let current = individual({adultAt:1000, P:[9, 9, 9]}), now = 100;
  let batch = {motherId:a.id, status:'formed', formedAt:0, hatchAt:900};
  const look = installShrimpLook({record:() => ({ageDays:0, hatchAt:999999}), simSeconds:() => 0, crystal:() => ({individual:current, now, batch})});
  look.sync([a]);
  const before = [a.look.uniforms.aqCrystalCoverage.value, a.look.uniforms.aqCrystalEdge.value, a.look.uniforms.aqCrystalColour.value.toArray()];
  current = individual({adultAt:1000, P:[1, 1, 1]}); look.sync([a]);
  assert.deepEqual([a.look.uniforms.aqCrystalCoverage.value, a.look.uniforms.aqCrystalEdge.value, a.look.uniforms.aqCrystalColour.value.toArray()], before);
  assert.equal(a.look.eggs.visible, true);
  now = 900; batch = {...batch, status:'hatched'}; look.sync([a]);
  assert.equal(a.look.eggs.visible, false, 'old colony egg timestamps cannot keep crystal eggs after hatch');
  current = individual({sex:'male'}); batch = {...batch, status:'formed', hatchAt:2000}; look.sync([a]);
  assert.equal(a.look.eggs.visible, false);
});
