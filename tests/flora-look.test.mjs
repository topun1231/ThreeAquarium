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
  assert.ok(m.moss.y < 0.022, `moss is a low draping cushion, not upright grass ${m.moss.y}`);
  assert.ok(m.moss.verts > 400, `moss is a dense branching mat ${m.moss.verts}`);
  assert.ok(m.moss.x > 0.012 && m.moss.z > 0.012, 'moss spreads across the host as a mat');
  assert.ok(m.carpet.y < 0.008, `carpet shoots stay low ${m.carpet.y}`);
  assert.ok(m.carpet.verts > 400, 'carpet is a mound of many tiny leaflets');
  assert.ok(m.rotalaLeaves.x > m.rotalaLeaves.z * 1.7, `rotala is lanceolate, not a wide ellipse ${m.rotalaLeaves.x}×${m.rotalaLeaves.z}`);
  assert.ok(m.rotalaLeaves.z < 0.008, 'rotala blades stay narrow');
});

test('carpet leaflets are round coins, not pointed triangles', () => {
  const flora = view();
  const geo = flora.units.carpet[0];
  const p = geo.attributes.position, idx = geo.index.array;
  const faces = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    for (const v of [idx[i], idx[i + 1], idx[i + 2]]) {
      if (!faces.has(v)) faces.set(v, []);
      faces.get(v).push([idx[i], idx[i + 1], idx[i + 2]]);
    }
  }
  let coins = 0;
  for (const [v, tris] of faces) {
    if (tris.length < 8 || tris.length > 12) continue;
    const center = new T.Vector3().fromBufferAttribute(p, v);
    const neighbors = new Set();
    for (const t of tris) for (const i of t) if (i !== v) neighbors.add(i);
    const radii = [...neighbors].map(i => new T.Vector3().fromBufferAttribute(p, i).distanceTo(center));
    const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
    const spread = Math.max(...radii) - Math.min(...radii);
    if (mean > 0.0004 && mean < 0.0022 && spread / mean < 0.28) coins++;
  }
  assert.ok(coins >= 30, `round coin leaflets ${coins}`);
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

test('moss mats cover a host with many overlapping patches', () => {
  const flora = view();
  const host = new T.Object3D();
  host.name = 'W0 wood';
  host.updateMatrixWorld(true);
  flora.build([{UniqueId:'m1', Species:'moss', Variant:1, Yaw:0.4, Scale:1, Hue:0, Nodes:16, Host:'wood', Local:[0, 0.02, 0], Normal:[0, 1, 0]}], {
    soil:{sample:() => 0.04}, habitat:{surfaces:[]}, entities:new Map([['wood', host]]),
  });
  const pts = positions(flora, /moss/);
  assert.ok(pts.length >= 22, `moss patches ${pts.length}`);
  const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.02, 'covers sideways along the host');
  assert.ok(Math.max(...zs) - Math.min(...zs) > 0.015, 'covers along the host');
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
