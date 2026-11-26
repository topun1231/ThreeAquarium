import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {anubiasGeometry} from '../src/anubias.js';
import {FloraView, keepVisibleLeaves} from '../src/flora-view.js';
import {pruneFlora} from '../src/flora.js';

const pack = JSON.parse(fs.readFileSync(new URL('../public/assets/anubias/models.json', import.meta.url)));
const bytes = fs.readFileSync(new URL('../public/assets/anubias/geometry.bin', import.meta.url));
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

function anubiasView() {
  const flora = new FloraView({root:new T.Group(), materials:[]});
  flora.installAnubias({models:anubiasGeometry(pack, buffer), materials:pack.materials});
  const host = new T.Object3D();
  host.name = 'W0 wood';
  host.updateMatrixWorld(true);
  const scene = {unity:true, soil:{sample:() => 0.04}, habitat:{surfaces:[]}, entities:new Map([['wood', host]])};
  return {flora, scene};
}

function tris(item) {
  return item.geometry.index ? item.geometry.index.count / 3 : item.geometry.attributes.position.count / 3;
}

test('background flora generation retains collider order, samples and triangle data', async t => {
  const {flora, scene} = anubiasView();
  const common = {Yaw:.2, Scale:1, Hue:0, Nodes:24};
  const list = [
    {...common, UniqueId:'red', Species:'rotala', Variant:1, X:-.1, Z:0},
    {...common, UniqueId:'green', Species:'rotala', Variant:0, X:.1, Z:0},
    {...common, UniqueId:'wood-moss', Species:'moss', Variant:2, Host:'wood', Local:[0,.02,0], Normal:[0,1,0]},
    {...common, UniqueId:'anubias', Species:'nullified', Variant:0, Host:'wood', Local:[.1,.01,0], Normal:[0,1,0]},
  ];
  const plain = flora.collisionItems(list, scene);
  let pauses = 0;
  const background = await flora.collisionItems(list, scene, () => {
    pauses++;
    return new Promise(resolve => setImmediate(resolve));
  });
  assert.ok(pauses > list.length * 2);
  const data = items => items.map(({node, geometry, samples}) => ({
    node, samples, index:geometry.index.array,
    attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([key, attribute]) => [key, attribute.array])),
  }));
  assert.deepEqual(data(background), data(plain));
  for (const item of [...plain, ...background]) item.geometry.dispose();

  const disposed = t.mock.method(T.BufferGeometry.prototype, 'dispose');
  const abort = new DOMException('wallpaper paused', 'AbortError');
  pauses = 0;
  await assert.rejects(flora.collisionItems(list, scene, () => {
    if (++pauses === list.length + 3) return Promise.reject(abort);
  }), error => error === abort);
  assert.ok(disposed.mock.calls.length >= 16);
  const templates = new Set(Object.values(flora.units).flat());
  assert.ok(disposed.mock.calls.every(call => !templates.has(call.this)));
});

test('pruning Anubias drops hidden leaves from collider, picking and shadow mesh', () => {
  const {flora, scene} = anubiasView();
  const r = {UniqueId:'n1', Species:'nullified', Variant:0, Yaw:0.2, Scale:1, Hue:0, Nodes:8, Host:'wood', Local:[0, 0.01, 0], Normal:[0, 1, 0], Upright:1};
  flora.build([r], scene);
  const full = flora.collisionItems([r], scene)[0];
  assert.equal(tris(full), 36205);
  full.geometry.dispose();

  r.Nodes = 1;
  flora.build([r], scene);
  const cut = flora.collisionItems([r], scene)[0];
  const cutTris = tris(cut);
  assert.ok(cutTris < 36205, `collider still ${cutTris} tris after prune`);
  assert.ok(cutTris < 20000, `pruned collider ${cutTris} should be well below the full 8-leaf hull`);

  const mesh = [...flora.meshes.values()].map(e => e.mesh).find(m => m.geometry.attributes.aqNode && m.count);
  assert.ok(mesh, 'authored leaf mesh is instanced');
  assert.ok(mesh.customDepthMaterial, 'shadow caster uses the same leaf clip');
  assert.equal(mesh.customDepthMaterial, mesh.material.customDepthMaterial);

  const nodeAttr = mesh.geometry.attributes.aqNode, leafAttr = mesh.geometry.attributes.aqLeaves;
  const leaves = leafAttr.getX(0);
  assert.ok(leaves <= 3, `visible leaf groups ${leaves}`);
  let hidden = -1;
  for (let i = 0; i < nodeAttr.count; i++) if (nodeAttr.getX(i) >= leaves) { hidden = i; break; }
  assert.ok(hidden >= 0, 'pruned mesh still contains hidden leaf verts to filter');
  assert.equal(flora.owner({object:mesh, instanceId:0, face:{a:hidden, b:hidden, c:hidden}}), null);

  const local = new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, hidden);
  const matrix = new T.Matrix4();
  mesh.getMatrixAt(0, matrix);
  const world = local.applyMatrix4(matrix);
  const ray = new T.Raycaster(world.clone().add(new T.Vector3(0, 0.03, 0)), new T.Vector3(0, -1, 0));
  for (const hit of ray.intersectObject(mesh)) {
    assert.ok(nodeAttr.getX(hit.face.a) < leafAttr.getX(hit.instanceId), 'raycast must miss removed leaves');
    assert.ok(flora.owner(hit));
  }
  cut.geometry.dispose();
});

test('剪去前株水榕的叶片后，同一个落点能直接选中后株',()=>{
  const {flora,scene}=anubiasView();
  const front={UniqueId:'near',Species:'nullified',Variant:0,Yaw:0,Scale:1,Hue:0,Nodes:8,Host:'wood',Local:[0,.22,0],Normal:[0,1,0],Upright:1};
  const back={...front,UniqueId:'far',Local:[0,.08,0]};
  const pair=[front,back], ray=new T.Raycaster(), points=[];
  flora.build(pair,scene);
  const meshes=[...flora.meshes.values()].map(m=>m.mesh);
  const bounds=new T.Box3().setFromObject(flora.root);
  function first(point){
    ray.set(point,new T.Vector3(0,-1,0));
    return flora.owner(ray.intersectObjects(meshes,false)[0])?.id;
  }
  for(let x=1;x<12;x++)for(let z=1;z<12;z++){
    const p=new T.Vector3().lerpVectors(bounds.min,bounds.max,x/12);
    p.y=bounds.max.y+.01;p.z=T.MathUtils.lerp(bounds.min.z,bounds.max.z,z/12);
    if(first(p)===front.UniqueId)points.push(p);
  }
  pruneFlora(front);
  flora.build(pair,scene);
  assert.ok(points.some(p=>first(p)===back.UniqueId),'至少一处剪口实际命中后株');
  assert.ok(points.some(p=>first(p)===front.UniqueId),'留下的叶片仍可选中');
});

test('pruning Bacopa drops stem and leaf triangles from the collider', () => {
  const flora = new FloraView({root:new T.Group(), materials:[]});
  const scene = {unity:true, soil:{sample:() => 0.04}, habitat:{surfaces:[]}, entities:new Map()};
  const r = {UniqueId:'bacopa', Species:'rotala', Variant:0, Yaw:0.2, Scale:1, Hue:0, Nodes:8, X:0.12, Z:0.05};
  const full = flora.collisionItems([r], scene)[0];
  const fullTris = tris(full);
  pruneFlora(r);
  r.Nodes = 2;
  const cut = flora.collisionItems([r], scene)[0];
  assert.ok(tris(cut) < fullTris, `Bacopa collider ${tris(cut)} after 8→2, was ${fullTris}`);
  full.geometry.dispose();
  cut.geometry.dispose();
});

test('keepVisibleLeaves removes only triangles at or past the visible count', () => {
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0,  2,0,0, 3,0,0, 2,1,0], 3));
  geo.setAttribute('aqNode', new T.Float32BufferAttribute([0, 0, 0, 4, 4, 4], 1));
  geo.setIndex([0, 1, 2, 3, 4, 5]);
  const kept = keepVisibleLeaves(geo, 2);
  assert.equal(kept.index.count, 3);
  kept.dispose();
});
