import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {FloraView, floraUnitMetrics} from '../src/flora-view.js';

function view() {
  return new FloraView({root:new T.Group(), materials:[]});
}

function positions(flora, re) {
  const out = [], M = new T.Matrix4();
  for (const {mesh} of flora.meshes.values()) {
    if (!re.test(mesh.name) || !mesh.count) continue;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, M);
      out.push(new T.Vector3().setFromMatrixPosition(M));
    }
  }
  return out;
}

test('procedural units read as plants, not sticks or lawn grass', () => {
  const m = floraUnitMetrics();
  assert.ok(m.moss.y < 0.011, `moss is a low cushion, not upright grass ${m.moss.y}`);
  assert.ok(m.moss.verts > 80, 'moss is a dense mat of tiny leaflets');
  assert.ok(m.carpet.y < 0.012, 'carpet shoots stay low');
  assert.ok(Math.max(m.rotalaLeaves.y, m.rotalaLeaves.z) > 0.006, 'rotala leaves have readable width');
});

test('one carpet plant spreads into an irregular lawn, not a single mound', () => {
  const flora = view();
  flora.build([{UniqueId:'c1', Species:'carpet', Variant:0, Yaw:0.2, Scale:1, Hue:0, Nodes:90, X:0, Z:-0.16}], {
    soil:{sample:() => 0.04}, habitat:{surfaces:[]}, entities:new Map(),
  });
  const pts = positions(flora, /carpet/);
  assert.ok(pts.length > 40, `shoots ${pts.length}`);
  const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.03, 'spreads sideways');
  assert.ok(Math.max(...zs) - Math.min(...zs) > 0.02, 'spreads along the front');
});

test('pearl sites sit on leaf instances of the new plants', () => {
  const flora = view();
  flora.build([{UniqueId:'r1', Species:'rotala', Variant:0, Yaw:0.3, Scale:1, Hue:0, Nodes:14, X:0.2, Z:0.1}], {
    soil:{sample:() => 0.04}, habitat:{surfaces:[]}, entities:new Map(),
  });
  const sites = flora.pearlSites();
  const leaves = positions(flora, /rotalaLeaves/);
  assert.ok(sites.length > 0);
  assert.ok(sites.every(s => s.vigor > 1));
  assert.ok(sites.some(s => leaves.some(p => Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) < 0.03)));
});
