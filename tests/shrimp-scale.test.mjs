import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {bodyPoints, bodyRadii, peerDepth, createHabitat, habitatQueries} from '../src/habitat.js';
import {juvenileFactor, shrimpBodyScale, shrimpSizeFactor, applyAgentScales} from '../src/shrimp-scale.js';
import {isFemale, MATURITY_DAYS} from '../src/care.js';

test('visual scale and collider scale share one formula', () => {
  assert.equal(juvenileFactor(0), 0.45);
  assert.equal(juvenileFactor(MATURITY_DAYS), 1);
  assert.equal(juvenileFactor(null), 1);
  const female = 'id-1';
  const male = 'id-0';
  assert.equal(isFemale(female), true);
  assert.equal(isFemale(male), false);
  assert.ok(shrimpSizeFactor(female) > shrimpSizeFactor(male));
  const baby = shrimpBodyScale({ageDays:0, id:female});
  const adult = shrimpBodyScale({ageDays:120, id:female});
  assert.ok(baby < 0.6);
  assert.ok(adult > 1);
  assert.ok(Math.abs(baby / adult - 0.45) < 1e-6);
});

test('body proxy and peer gap scale with the same factor as the mesh', () => {
  const p = new T.Vector3(0, 0.01, 0), q = new T.Quaternion();
  const adult = bodyPoints(p, q, 1), juvenile = bodyPoints(p, q, 0.45);
  const grown = bodyPoints(p, q, 1.08);
  assert.ok(adult[0].distanceTo(p) > juvenile[0].distanceTo(p));
  assert.ok(grown[0].distanceTo(p) > adult[0].distanceTo(p));
  assert.ok(bodyRadii(1.08)[7] > bodyRadii(0.45)[7]);
  const other = {position:p.clone(), rotation:q.clone(), scale:1};
  assert.ok(peerDepth(p, q, other, 1.08) >= peerDepth(p, q, {position:p.clone(), rotation:q.clone(), scale:0.45}, 0.45));
});

test('a big female hits a wall that a juvenile still clears while distant rocks skip body probes', async t => {
  const geo = new T.BoxGeometry(0.02, 0.03, 0.02);
  geo.translate(0.024, 0.01, 0);
  const habitat = await createHabitat({nodes:[], draws:[], geometries:[]}, new ArrayBuffer(0), () => {}, null, [{
    node:'wall', owner:'W0 test', kind:1, solid:true, rebuild:false,
    geometry:geo, transform:new T.Matrix4(),
  }, {
    node:'distant', owner:'R0 test', kind:1, solid:true,
    geometry:geo, transform:new T.Matrix4().makeTranslation(.4,0,0),
  }]);
  const distantProbe=t.mock.method(habitat.surfaces[1].box,'distanceToPoint');
  const p = new T.Vector3(0, 0.006, 0), q = new T.Quaternion();
  const juvenile = habitat.depth(p, q, 0.45);
  const female = habitat.depth(p, q, 1.08);
  assert.ok(female > juvenile, `female ${female} juvenile ${juvenile}`);
  assert.ok(female > 0.0003, 'female collider reaches the hardscape');
  assert.ok(juvenile <= 0.0003, 'juvenile is not blocked by the adult-sized body');
  assert.equal(distantProbe.mock.callCount(),0);
});

test('applyAgentScales writes the visual factor onto each agent', () => {
  const id = 'aaaaaaaa';
  const world = {agents:[{data:{CreatureId:id}, scale:1}]};
  applyAgentScales(world, {shrimp:{[id]:{ageDays:0}}});
  assert.ok(Math.abs(world.agents[0].scale - shrimpBodyScale({ageDays:0, id})) < 1e-9);
});

test('the three support probes share nearby surfaces and respect moving leaf bounds', t => {
  const leaf=new T.BoxGeometry(.08,.002,.08).translate(.4,0,0);
  leaf.computeBoundingBox();
  const surface={geo:leaf,bvh:new MeshBVH(leaf),box:leaf.boundingBox,kind:3,flora:true};
  const ray=t.mock.method(surface.bvh,'raycastFirst');
  const distance=t.mock.method(surface.box,'distanceToPoint');
  const habitat=habitatQueries([surface]),p=new T.Vector3(0,.002,0),up=new T.Vector3(0,1,0),q=new T.Quaternion();
  assert.equal(habitat.support(p,up,q),null);
  assert.equal(ray.mock.callCount(),0);
  assert.equal(distance.mock.callCount(),0);
  leaf.translate(-.4,0,0);
  surface.bvh.refit();
  assert.ok(habitat.support(p,up,q));
  assert.equal(ray.mock.callCount(),3);
});
