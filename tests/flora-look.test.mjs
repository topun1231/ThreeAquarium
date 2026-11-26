import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {FloraView, floraUnitMetrics, swayFloraPoint} from '../src/flora-view.js';
import {makeFloraRecord, pruneFlora, growFlora, sanitizeFlora} from '../src/flora.js';
import {plantGhost, disposePlantGhost} from '../src/plant-preview.js';

function view() {
  return new FloraView({root:new T.Group(), materials:[]});
}

test('ribbon leaves rise from the crown, bend downstream and flex at the tips',()=>{
  const flora=view(), scene={soil:{sample:()=>.04},entities:new Map(),habitat:{surfaces:[]}};
  for(const yaw of [0,Math.PI]){
    const record=makeFloraRecord({id:'current-ribbon',species:'vallisneria',variant:0,x:-.25,z:.10,yaw});
    const tips=[];
    for(const bucket of flora.instances([record],scene).values()){
      const position=flora.units.vallisneria[bucket.variant].attributes.position;
      for(const [i,pose] of bucket.matrices.entries()){
        const centre=row=>new T.Vector3().fromBufferAttribute(position,row*5+2).applyMatrix4(pose);
        const rows=position.count/5-1, root=centre(0), lower=centre(rows/4), upper=centre(rows*3/4), tip=centre(rows);
        assert.ok(lower.y-root.y>Math.abs(lower.x-root.x),'the base rises first');
        assert.ok(tip.x-root.x>.075 && tip.x-upper.x>tip.y-upper.y,'the upper ribbon sweeps right');
        const move=(p,time)=>swayFloraPoint(p.clone(),bucket.stems[i],flora.materials.vallisneria.userData.sway,time);
        assert.ok(move(root,0).distanceTo(move(root,3))<.00001);
        assert.ok([1,3,6].some(t=>move(tip,t).distanceTo(move(tip,0))>.001));
        tips.push(tip.z);
      }
    }
    assert.ok(Math.max(...tips)-Math.min(...tips)>.04,'the leaves open to different depths within the current');
  }
  for(const x of [-.56,.56]) for(const z of [-.26,.26]){
    const record=makeFloraRecord({id:'edge3',species:'vallisneria',variant:0,x,z,yaw:3});
    record.Scale=1.6; record.Nodes=14;
    for(const b of flora.instances([record],scene).values()){
      const vertices=flora.units.vallisneria[b.variant].attributes.position;
      for(const [i,pose] of b.matrices.entries())for(let v=0;v<vertices.count;v++){
        const p=new T.Vector3().fromBufferAttribute(vertices,v).applyMatrix4(pose);
        for(const time of [0,2,4,6]){
          const moving=swayFloraPoint(p.clone(),b.stems[i],flora.materials.vallisneria.userData.sway,time);
          assert.ok(Math.abs(moving.x)<.6 && Math.abs(moving.z)<.3,'the full blade stays inside the glass');
        }
      }
    }
  }
});

test('only some tall ribbons extend beyond the ordinary fan',()=>{
  const flora=view(), scene={soil:{sample:()=>.05}};
  const record=makeFloraRecord({id:'open-bank',species:'vallisneria',variant:0,x:-.25,z:0});
  function reachPerScale(scale){
    record.Scale=scale;
    return [...flora.instances([record],scene).values()].map(b=>{
      const vertices=flora.units.vallisneria[b.variant].attributes.position,pose=b.matrices[0];
      const tip=new T.Vector3().fromBufferAttribute(vertices,vertices.count-3).applyMatrix4(pose);
      return (tip.x-pose.elements[12])/scale;
    });
  }
  const short=reachPerScale(1),tall=reachPerScale(1.42);
  assert.equal(tall.filter((x,i)=>x>short[i]*1.25).length,2);
  assert.equal(tall.filter((x,i)=>Math.abs(x-short[i])<.001).length,2);
});

test('tall ribbon crowns approach the water without breaking through on a raised bed',()=>{
  const flora=view();
  for(const bed of [.05,.18]) for(const id of ['cup','left-bank','regrown']){
    const scene={soil:{sample:()=>bed},entities:new Map(),habitat:{surfaces:[]}};
    const record=makeFloraRecord({id,species:'vallisneria',variant:0,x:-.54,z:.25});
    record.Scale=1.58;
    record.Nodes=14;
    let crest=0;
    for(const b of flora.instances([record],scene).values()){
      const bounds=flora.units.vallisneria[b.variant].boundingBox;
      for(const pose of b.matrices) crest=Math.max(crest,bounds.clone().applyMatrix4(pose).max.y);
    }
    assert.ok(crest>.54 && crest<.573,`ribbon crest at ${crest} on bed ${bed}`);
  }
});

test('Java fern keeps its rhizome on the host and the same surviving fronds through a trim and reload',()=>{
  const flora=view(), matrix=new T.Matrix4().makeTranslation(-.17,.15,.04);
  const scene={soil:{sample:()=>0},entities:new Map(),hostMatrix:()=>matrix,habitat:{surfaces:[]}};
  const r=makeFloraRecord({id:'fern',species:'javafern',variant:0,host:'wood',local:[0,0,0],normal:[0,1,0]});
  const fronds=record=>new Map([...flora.instances([record],scene).values()].filter(b=>b.key==='javafern')
    .flatMap(b=>b.owners.map((owner,i)=>[owner.node,b.matrices[i].toArray()])));
  const before=fronds(r);
  assert.equal(before.size,8);
  const material=new T.MeshBasicMaterial();
  const ghost=plantGhost(r,null,flora,material,scene);
  assert.ok(ghost.children.some(mesh=>mesh.count>8),'the preview includes the creeping rhizome and fine roots');
  disposePlantGhost(ghost);material.dispose();
  pruneFlora(r);
  const [saved]=sanitizeFlora(JSON.parse(JSON.stringify([r])));
  const after=fronds(saved);
  assert.ok(after.size<before.size);
  for(const [node,pose] of after)assert.deepEqual(pose,before.get(node));
  growFlora([saved],86400*8);
  assert.ok(fronds(saved).size>after.size);
  const [item]=flora.collisionItems([saved],scene);
  item.geometry.computeBoundingBox();
  assert.ok(item.geometry.boundingBox.max.y>.24);
  item.geometry.dispose();
});

test('riverbank leaves preview, prune and regrow from the same rooted meshes after reload', () => {
  const flora = view(), scene = {soil:{sample:()=>.055}, entities:new Map(), habitat:{surfaces:[]}};
  const material = new T.MeshBasicMaterial();
  for (const species of ['vallisneria','browncrypt']) {
    const record = makeFloraRecord({id:'edge-'+species,species,variant:0,x:.56,z:-.26,yaw:1});
    record.Scale=1.6;
    const buckets = () => [...flora.instances([record],scene).values()];
    const poses = () => new Map(buckets().flatMap(b => b.owners.map((owner,i)=>[owner.node,b.matrices[i].toArray()])));
    const expected = poses();
    assert.equal(expected.size,record.Nodes);
    const ghost = plantGhost(record,null,flora,material,scene);
    assert.equal(ghost.children.reduce((n,m)=>n+m.count,0),record.Nodes);
    disposePlantGhost(ghost);
    const items=flora.collisionItems([record],scene);
    assert.equal(items.length,1);
    const geometry=items[0].geometry;
    geometry.computeBoundingBox();
    const box=geometry.boundingBox;
    assert.ok(box.max.x<.6 && box.min.z>-.3);
    assert.ok(Math.abs(box.min.y-.054)<.001);
    assert.ok(species==='vallisneria' ? box.max.y>.28 : box.max.y<.22);
    geometry.dispose();
    pruneFlora(record);
    for(const [node,pose] of poses()) assert.deepEqual(pose,expected.get(node));
    assert.ok(poses().size<expected.size);
    assert.deepEqual(sanitizeFlora(JSON.parse(JSON.stringify([record]))),[record]);
    growFlora([record],86400*40);
    assert.ok(poses().size>expected.size);
    for(const [node,pose] of expected) assert.deepEqual(poses().get(node),pose);
  }
  material.dispose();
});

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
