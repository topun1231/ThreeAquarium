import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {anubiasGeometry,loadAnubias} from '../src/anubias.js';
import {FloraView,floraUnitMetrics,swayFloraPoint} from '../src/flora-view.js';
import {floraFlow} from '../src/plant-contacts.js';
import {FLORA_CATALOG,sanitizeFlora,pruneFlora,floraSignature,growFlora,makeFloraRecord} from '../src/flora.js';

const pack=JSON.parse(fs.readFileSync(new URL('../public/assets/anubias/models.json',import.meta.url)));
const bytes=fs.readFileSync(new URL('../public/assets/anubias/geometry.bin',import.meta.url));
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const record=(species,id=species)=>({UniqueId:id,Species:species,Variant:0,Yaw:.2,Scale:1,Hue:0,Nodes:6,Host:'wood',Local:[0,.01,0],Normal:[0,1,0]});
function fixture(){const flora=new FloraView({root:new T.Group(),materials:[]});flora.installAnubias({models:anubiasGeometry(pack,buffer),materials:pack.materials});const host=new T.Object3D();host.name='W0 wood';host.updateMatrixWorld(true);const scene={unity:true,soil:{sample:()=>.04},habitat:{surfaces:[]},entities:new Map([['wood',host]])};return {flora,host,scene};}

test('asset loader preserves glTF texture orientation without flipping the FBX maps',async()=>{
  const originalFetch=globalThis.fetch,originalLoad=T.TextureLoader.prototype.loadAsync;
  try{
    globalThis.fetch=async()=>({ok:true,json:async()=>pack,arrayBuffer:async()=>buffer});
    T.TextureLoader.prototype.loadAsync=async()=>new T.Texture();
    const assets=await loadAnubias();
    assert.equal(assets.maps.get('nullified.webp').flipY,false);
    for(const name of ['pala-0.webp','pala-1.webp','pala-2.webp'])assert.equal(assets.maps.get(name).flipY,true);
    for(const map of assets.maps.values()){assert.equal(map.colorSpace,T.SRGBColorSpace);map.dispose();}
    for(const variants of Object.values(assets.models))for(const model of variants)for(const part of model.parts)part.geometry.dispose();
  }finally{globalThis.fetch=originalFetch;T.TextureLoader.prototype.loadAsync=originalLoad;}
});

test('Anubias stay anchored on steep hosts and turn upward with ecological growth',()=>{
  const {flora,host,scene}=fixture();
  host.rotation.z=Math.PI/2;host.updateMatrixWorld(true);
  for(const species of ['pala','nullified']){
    const r=record(species);r.Upright=0;
    const pose=()=>[...flora.instances([r],scene).values()][0].matrices[0];
    const up=()=>new T.Vector3(0,1,0).transformDirection(pose());
    const anchor=new T.Vector3(...r.Local).applyMatrix4(host.matrixWorld);
    assert.ok(Math.abs(up().angleTo(new T.Vector3(0,1,0))-T.MathUtils.degToRad(25))<1e-7);
    const signature=floraSignature([r]);growFlora([r],1);assert.equal(floraSignature([r]),signature);
    growFlora([r],86400*1.5);assert.ok(up().y>.97);assert.notEqual(floraSignature([r]),signature);
    const saved=sanitizeFlora(JSON.parse(JSON.stringify([r])))[0];assert.equal(saved.Upright,r.Upright);
    pruneFlora(r);assert.equal(r.Upright,saved.Upright,'pruning must not tilt the plant again');
    growFlora([r],86400*3);assert.equal(r.Upright,1);assert.ok(up().y>1-1e-10);
    assert.ok(new T.Vector3().setFromMatrixPosition(pose()).distanceTo(anchor)<1e-10);
    delete r.Upright;assert.ok(up().y>1-1e-10,'old saves immediately recover upward growth');
  }
});

test('upward-growth state is validated and new attachments start a fresh adaptation',()=>{
  for(const value of [null,-.1,1.1,NaN,Infinity,'1'])assert.throws(()=>sanitizeFlora([{...record('pala'),Upright:value}]),/向上生长/);
  assert.equal(sanitizeFlora([record('pala')])[0].Upright,1);
  assert.equal(makeFloraRecord({id:'new',species:'pala',variant:0,host:'wood',local:[0,0,0],normal:[1,0,0]}).Upright,0);
});

test('cached dense-leaf contact flow matches the rendered flow across stems and times',()=>{
 const stems=new T.Float32BufferAttribute([.2,.05,.1,1,.2,.05,.1,1,-.1,.12,.2,3],4),sways=new T.Float32BufferAttribute([.0008,.085,.0008,.085,.0045,.22],2),flow=floraFlow(stems,sways);
 for(const time of [0,10,10,120])for(const i of [0,1,2,1])for(const y of [-.1,.05,.06,.15,.3,.9]){
  const p=new T.Vector3(.1,y,.2),expected=swayFloraPoint(p.clone(),stems.array.subarray(i*4,i*4+4),{amplitude:sways.getX(i),height:sways.getY(i)},time);
  assert.ok(expected.distanceTo(flow(p,i,time))<1e-12);
 }
});

test('real Anubias replace the retired catalog and migrate old plants without losing attachment',()=>{
  assert.equal(FLORA_CATALOG.filter(r=>r.species==='pala').length,3);
  assert.equal(FLORA_CATALOG.filter(r=>r.species==='nullified').length,1);
  assert.ok(!FLORA_CATALOG.some(r=>r.species==='anubias'||/Pala|Nullified/i.test(r.label)));
  assert.ok(FLORA_CATALOG.some(r=>r.label==='纳纳小榕 · 大叶'));
  assert.ok(FLORA_CATALOG.some(r=>r.label==='巴氏榕'));
  assert.ok(!floraUnitMetrics().anubiasLeaf);
  const old=record('anubias','old-plant'),a=sanitizeFlora([old])[0];
  assert.ok(['pala','nullified'].includes(a.Species));
  assert.deepEqual(sanitizeFlora([old]),[a]);
  for(const k of ['UniqueId','Host','Local','Normal','Yaw','Scale','Hue','Nodes','Variant'])assert.deepEqual(a[k],old[k]);
  assert.equal(old.Species,'anubias');
  assert.notEqual(floraSignature([record('pala')]),floraSignature([record('nullified','pala')]));
  assert.throws(()=>sanitizeFlora([{...old,UniqueId:null}]));
});

test('authored meshes retain all original Pala triangles and stone-free rebuilt Nullified geometry',()=>{
  const models=anubiasGeometry(pack,buffer);
  assert.deepEqual(models.pala.map(m=>m.parts.reduce((n,p)=>n+p.geometry.index.count/3,0)),[2588,1288,2598]);
  assert.equal(models.nullified[0].parts.reduce((n,p)=>n+p.geometry.index.count/3,0),36205);
  assert.equal(models.nullified[0].leaves,8);
  for(const variants of Object.values(models))for(const model of variants)for(const part of model.parts){
    const g=part.geometry;assert.ok(g.attributes.uv);assert.ok(Array.from(g.index.array).every(i=>i<g.attributes.position.count));
    g.computeBoundingBox();assert.ok(g.boundingBox.max.y<.09);assert.ok(g.boundingBox.min.y>-.04);
  }
});

test('Pala petiole bases sit at the attachment origin below their leaves in all three forms',()=>{
  for(const model of anubiasGeometry(pack,buffer).pala)for(const part of model.parts){
    part.geometry.computeBoundingBox();
    const box=part.geometry.boundingBox;
    assert.ok(box.min.y>=-1e-7 && box.min.y<.008,'every original petiole starts near root height, not mid-crown');
    assert.ok(box.max.y>box.min.y+.01,'each leaf group grows upward from its petiole');
  }
});

test('both models share instance geometry, follow host poses, prune and expose actual walkable leaves',()=>{
  const {flora,host,scene}=fixture(),list=[record('pala'),record('nullified')];
  flora.build(list,scene);
  assert.ok([...flora.meshes.values()].every(e=>e.mesh.castShadow&&e.mesh.receiveShadow));
  const before=[...flora.meshes.values()][0].mesh, matrix=new T.Matrix4();before.getMatrixAt(0,matrix);const original=matrix.clone();
  host.position.x=.1;host.rotation.y=.6;host.updateMatrixWorld(true);flora.build(list,scene);before.getMatrixAt(0,matrix);
  assert.ok(new T.Vector3().setFromMatrixPosition(matrix).distanceTo(new T.Vector3().setFromMatrixPosition(original))>.09);
  assert.ok(new T.Quaternion().setFromRotationMatrix(matrix).angleTo(new T.Quaternion().setFromRotationMatrix(original))>.5);
  const beforeLeaves=flora.stats().visibleLeaves;pruneFlora(list[1]);flora.build(list,scene);assert.ok(flora.stats().visibleLeaves<beforeLeaves);
  list[1].Nodes=12;pruneFlora(list[1]);assert.equal(list[1].Nodes,5,'a mature authored plant still loses an actual leaf group when pruned');
  const items=flora.collisionItems(list,scene);assert.equal(items.length,2);assert.ok(items.every(i=>i.samples.length>10&&i.geometry.attributes.floraSway));items.forEach(i=>i.geometry.dispose());
  assert.ok(flora.pearlSites().length>0);
  flora.build([],scene);assert.ok([...flora.meshes.values()].every(e=>!e.mesh.count));assert.equal(flora.pearlSites().length,0);
});

test('authored Anubias merge same-material parts so one plant is a handful of draws',()=>{
  const {flora,scene}=fixture();
  flora.build([record('nullified')],scene);
  assert.ok(flora.stats().draws<=4,`nullified draws ${flora.stats().draws}`);
  flora.build([record('pala'),record('nullified')],scene);
  assert.ok(flora.stats().draws<=8,`pala+nullified draws ${flora.stats().draws}`);
  assert.ok(flora.stats().visibleLeaves>0);
});
