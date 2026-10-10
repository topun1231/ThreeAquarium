import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {FOG_GLSL, viewZ, waterTravel, fogAmount} from '../src/water-fog.js';

const camera = new T.PerspectiveCamera(32, 16 / 9, 0.002, 30);
camera.position.set(0, 0.3, 1.2);
camera.lookAt(0, 0.2, 0);
camera.updateMatrixWorld();
const depthAt = distance => {
  const forward = new T.Vector3();
  camera.getWorldDirection(forward);
  const p = camera.position.clone().addScaledVector(forward, distance).project(camera);
  return (p.z + 1) / 2;
};

test('depth linearization recovers view distance', () => {
  for (const d of [0.3, 0.9, 1.5]) assert.ok(Math.abs(viewZ(depthAt(d), camera.near, camera.far) - d) < 1e-4);
});

test('fog path is scene depth minus glass depth and grows with distance through water', () => {
  const glass = depthAt(0.9);
  const near = waterTravel(glass, depthAt(1.0), camera.near, camera.far);
  const far = waterTravel(glass, depthAt(1.4), camera.near, camera.far);
  assert.ok(Math.abs(near - 0.1) < 1e-3, `near travel ${near}`);
  assert.ok(Math.abs(far - 0.5) < 1e-3, `far travel ${far}`);
  assert.ok(fogAmount(far, 0.22) > fogAmount(near, 0.22));
  assert.equal(waterTravel(glass, glass, camera.near, camera.far), 0);
  assert.equal(fogAmount(near, 0), 0);
  const inverted = Math.max(0, viewZ(glass, camera.near, camera.far) - viewZ(depthAt(1.4), camera.near, camera.far));
  assert.equal(inverted, 0);
});

test('shader uses the same ordering as the tested math', () => {
  assert.match(FOG_GLSL, /aqViewZ\(sceneDepth\)-aqViewZ\(glassDepth\)/);
  assert.match(FOG_GLSL, /aqTravel\(gl_FragCoord\.z,texture2D\(aqDepth,uv\)\.r\)/);
});
