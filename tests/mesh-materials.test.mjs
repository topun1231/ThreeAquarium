import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {cloneCreatureMaterials, materialsOf, releaseCreatureMesh, stripEggMeshes, isEggMesh} from '../src/mesh-materials.js';

function shrimpLike(withEggs) {
  const geo = new T.BoxGeometry(0.01, 0.01, 0.01);
  const skin = new T.Mesh(geo, [
    new T.MeshStandardMaterial({name:'Shell', color:'#c33'}),
    new T.MeshStandardMaterial({name:'Eyes', color:'#111'}),
  ]);
  const rig = new T.Group();
  rig.add(skin);
  if (withEggs) {
    const eggs = new T.Mesh(new T.SphereGeometry(0.001, 6, 4), new T.MeshStandardMaterial({name:'Shrimp eggs', color:'#d9a531'}));
    eggs.name = 'Shrimp eggs';
    eggs.userData.eggs = true;
    rig.add(eggs);
  }
  return {rig, skin};
}

test('cloning a berried template does not treat egg material as an array', () => {
  const {rig} = shrimpLike(true);
  const copy = clone(rig);
  assert.ok(copy.children.some(isEggMesh));
  const stripped = stripEggMeshes(copy);
  assert.equal(stripped.length, 1);
  assert.ok(!Array.isArray(stripped[0].material));
  assert.doesNotThrow(() => {
    copy.traverse(o => { if (o.isMesh) cloneCreatureMaterials(o, 0.95); });
  });
  assert.equal(copy.children.filter(isEggMesh).length, 0);
});

test('removing a berried shrimp disposes the single egg material and geometry', () => {
  const {rig} = shrimpLike(true);
  const eggs = rig.children.find(isEggMesh);
  let geo = 0, mat = 0;
  eggs.geometry.dispose = () => { geo++; };
  eggs.material.dispose = () => { mat++; };
  assert.doesNotThrow(() => rig.traverse(o => { if (o.isMesh) releaseCreatureMesh(o); }));
  assert.equal(geo, 1);
  assert.equal(mat, 1);
  assert.equal(rig.children.filter(isEggMesh).length, 0);
});

test('skinned array materials still clone and dispose owned copies', () => {
  const {rig, skin} = shrimpLike(false);
  cloneCreatureMaterials(skin, 0.9);
  const list = materialsOf(skin);
  assert.equal(list.length, 2);
  assert.equal(list[0].userData.populationOwned, true);
  assert.equal(list[1].name, 'Eyes');
  let disposed = 0;
  list[0].dispose = () => { disposed++; };
  releaseCreatureMesh(skin);
  assert.equal(disposed, 1);
  assert.doesNotThrow(() => clone(rig));
});
