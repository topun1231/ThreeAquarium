import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SPECIES, growFlora, pruneFlora, sanitizeFlora, visibleNodes, floraSignature, parsePlantKind, checkFloraGround, checkFloraHost, makeFloraRecord, FLORA_CATALOG} from '../src/flora.js';
import * as T from 'three';
import {floraCollisionItems} from '../src/flora-view.js';
import {advanceEcology} from '../src/ecology.js';
import {validateSession} from '../src/session.js';
import {dressSample} from '../src/sample-aquascape.js';
import {createHabitat, vec} from '../src/habitat.js';
import {rotation} from '../src/tank-runtime.js';
import {Substrate} from '../src/substrate.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../public/assets/catalog.json', import.meta.url)));
const defs = catalog.definitions.map(JSON.parse), settings = JSON.parse(catalog.ground);
const source = JSON.parse(fs.readFileSync(new URL('../public/assets/setup.json', import.meta.url)));
const runtime = {definitions:defs, settings, entries:new Map(catalog.entries.map(e => [e.key, e]))};

const stem = (extra = {}) => ({UniqueId:'r1', Species:'rotala', Variant:1, Yaw:0.3, Scale:1, Hue:0, Nodes:10, X:0.3, Z:0.15, ...extra});
const moss = (extra = {}) => ({UniqueId:'m1', Species:'moss', Variant:0, Yaw:0, Scale:1, Hue:0.2, Nodes:14, Host:'wood', Local:[0.01, 0.02, 0], Normal:[0, 1, 0], ...extra});

test('growth adds nodes in ecology days and stops at the species maximum', () => {
  const list = [stem({Nodes:SPECIES.rotala.start})];
  growFlora(list, 86400 * 5);
  assert.ok(Math.abs(list[0].Nodes - (SPECIES.rotala.start + 5 * SPECIES.rotala.perDay)) < 1e-9);
  assert.equal(visibleNodes(list[0]), Math.floor(list[0].Nodes));
  growFlora(list, 86400 * 365);
  assert.equal(list[0].Nodes, SPECIES.rotala.max);
  const slow = [{...stem(), Species:'pala', Nodes:4, Host:'w', Local:[0, 0, 0], Normal:[0, 1, 0]}];
  growFlora(slow, 86400 * 7);
  assert.equal(visibleNodes(slow[0]), 4, 'anubias adds roughly one leaf per eight days');
});

test('pruning removes nodes from the top and regrowth resumes from there', () => {
  const r = stem({Nodes:20});
  pruneFlora(r, 11);
  assert.equal(r.Nodes, 11);
  growFlora([r], 86400 * 2);
  assert.ok(r.Nodes > 11 && r.Nodes < 13);
  const leaf = {...moss(), Species:'pala', Nodes:6};
  pruneFlora(leaf);
  assert.equal(leaf.Nodes, 5);
  const carpet = {...stem(), Species:'carpet', Nodes:70};
  pruneFlora(carpet);
  assert.equal(carpet.Nodes, 42);
  assert.throws(() => pruneFlora(stem({Nodes:2}), 2), /很短/);
});

test('sanitize keeps valid records, strips extras and rejects bad ones', () => {
  const clean = sanitizeFlora([{...stem(), Junk:1}, moss()]);
  assert.equal(clean[0].Junk, undefined);
  assert.deepEqual(clean[1].Local, [0.01, 0.02, 0]);
  assert.throws(() => sanitizeFlora([stem(), stem()]));
  assert.throws(() => sanitizeFlora([stem({Species:'kelp'})]));
  assert.throws(() => sanitizeFlora([stem({Nodes:99})]));
  assert.throws(() => sanitizeFlora([stem({X:2})]));
  assert.throws(() => sanitizeFlora([stem({Variant:4})]));
  assert.throws(() => sanitizeFlora([moss({Host:''})]));
  assert.throws(() => sanitizeFlora([moss({Local:[0, NaN, 0]})]));
});

test('the sample has one wooded fern island with a clear sand cove and grazing stone', async () => {
  const read=name=>fs.readFileSync(new URL('../public/assets/'+name,import.meta.url));
  const bytes=read('geometry.bin');
  const habitat=await createHabitat(JSON.parse(read('scene.json')),bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const save=structuredClone(source);
  dressSample(save,settings,habitat);
  const t=validateSession(save,runtime).Tank,soil=new Substrate(settings,t.Substrate);
  assert.deepEqual(t.Hardscape.map(r=>r.TypeId),['W01','R01','R02','R03','R05','R01']);
  const [frontBoulder,bankBoulder]=t.Hardscape.filter(r=>r.TypeId==='R01');
  assert.deepEqual(bankBoulder.Rotation,frontBoulder.Rotation);
  const wood=t.Hardscape[0];
  const pose=r=>new T.Matrix4().compose(vec(r.Position),rotation(r.Rotation),vec(r.Scale));
  const original=source.Tank.Hardscape.find(r=>r.UniqueId===wood.UniqueId);
  const transform=pose(wood).multiply(pose(original).invert()),bounds=new T.Box3(),point=new T.Vector3();
  for(const surface of habitat.surfaces.filter(s=>s.solid&&s.owner.endsWith(wood.UniqueId))){
    const vertices=surface.geo.attributes.position;
    for(let i=0;i<vertices.count;i++)bounds.expandByPoint(point.fromBufferAttribute(vertices,i).applyMatrix4(transform));
  }
  const span=bounds.getSize(new T.Vector3());
  assert.ok(span.x>.65 && bounds.max.y>.28 && bounds.max.y<.36 && bounds.max.x<.30,'the root slopes down from the planted bank and leaves the cove open');
  assert.ok(bounds.min.x>-.59 && bounds.max.x<.59,'the main root needs clearance from both side panes');
  const flat=t.Hardscape.find(r=>r.TypeId==='R05');
  function sampleHit(piece,origin,direction){
    const original=source.Tank.Hardscape.find(r=>r.UniqueId===piece.UniqueId);
    const toSample=pose(piece).multiply(pose(original).invert());
    const ray=new T.Ray().set(origin,direction).applyMatrix4(toSample.clone().invert());
    const surface=habitat.surfaces.find(s=>s.solid && s.owner.endsWith(piece.UniqueId));
    return surface.bvh.raycastFirst(ray,T.DoubleSide)?.point.applyMatrix4(toSample);
  }
  let previousGap=.075;
  for(const [x,z] of [[.16,-.075],[.18,-.082],[.25,-.124]]){
    const stoneTop=sampleHit(flat,new T.Vector3(x,1,z),new T.Vector3(0,-1,0));
    assert.ok(stoneTop,'the branch reaches the actual stone');
    const underside=sampleHit(wood,stoneTop,new T.Vector3(0,1,0));
    const gap=underside?.y-stoneTop.y;
    assert.ok(gap>.025 && gap<previousGap,'the branch descends towards the rock, leaving room below');
    previousGap=gap;
  }
  assert.ok(t.Flora.some(r=>r.Host===flat.UniqueId && r.Species==='moss'));
  const rock=t.Hardscape.find(r=>r.TypeId==='R02');
  assert.equal(t.Flora.find(r=>r.Species==='pala').Host,rock.UniqueId);
  assert.equal(t.Flora.find(r=>r.Species==='nullified').Host,wood.UniqueId);
  assert.ok(t.Flora.filter(r=>r.Species==='javafern').length===3);
  assert.ok(!t.Plants.some(r=>r.TypeId.endsWith('background-stem-prototype')));
  assert.ok(!t.Flora.some(r=>r.Species==='rotala'));
  const ribbons=t.Flora.filter(r=>r.Species==='vallisneria');
  const bank=ribbons.filter(r=>r.X<-.30),fork=ribbons.filter(r=>r.X>=-.30 && r.X<-.07);
  assert.equal(bank.length,6);
  assert.equal(fork.length,3);
  assert.ok(fork.every(r=>r.X<-.10 && r.Z>.18 && r.Nodes<=9),'sparse clumps grow behind the fork');
  assert.ok(bank.every(r=>r.Z>.10));
  const rear=bank.filter(r=>r.Z>.21);
  assert.equal(rear.length,3);
  const corner=rear.find(r=>r.X<-.52);
  assert.ok(corner && soil.kind(soil.cell(corner.X,corner.Z))===2,'a rear ribbon is rooted on the sand by the cup-side corner');
  const backLayer=ribbons.filter(r=>r.Z>.21),frontLayer=ribbons.filter(r=>r.Z<=.21);
  assert.equal(backLayer.length,5);
  assert.ok(Math.min(...backLayer.map(r=>r.Scale)) > Math.max(...frontLayer.map(r=>r.Scale)));
  const hosts=new Set(t.Hardscape.map(r=>r.UniqueId));
  assert.ok(t.Flora.filter(r=>r.Host).every(r=>hosts.has(r.Host)));
  const shore=t.Flora.filter(r=>!r.Host && r.X>=-.07).sort((a,b)=>a.X-b.X);
  assert.deepEqual(shore.map(r=>r.Species),['vallisneria','vallisneria']);
  assert.deepEqual(t.Flora.filter(r=>r.Species==='browncrypt').map(r=>[r.X,r.Z]),[[-.388,-.093],[-.357,-.145]]);
  assert.ok(shore[0].Scale>shore[1].Scale && shore[0].Nodes>shore[1].Nodes);
  assert.ok(shore.every(r=>r.Z>.02 && r.X<.28),'the foreground sand cove stays open');
  assert.ok(t.Plants.every(r=>r.Position.x<-.07&&Math.abs(r.Position.y-soil.sample(r.Position.x,r.Position.z))<.00001));
  assert.ok(soil.sample(-.20,.07)>soil.sample(.42,-.10)+.10);
  assert.equal(soil.kind(soil.cell(-.20,.09)),4);
  assert.equal(soil.kind(soil.cell(.43,-.12)),2);
  soil.layers.forEach((layers,i)=>assert.ok(Math.abs(layers.reduce((sum,l)=>sum+l.Volume,0)/soil.area[i]-(soil.h[i]-soil.MinHeight))<.00001));
});

test('flora grows through advanceEcology and survives a session round trip', () => {
  const save = structuredClone(source);
  save.Tank.Flora = [stem({Nodes:9}), moss({Host:save.Tank.Hardscape[0].UniqueId})];
  advanceEcology(save, defs, 86400 * 3);
  assert.ok(Math.abs(save.Tank.Flora[0].Nodes - (9 + 3 * 0.8)) < 1e-9);
  const loaded = validateSession(JSON.parse(JSON.stringify(save)), runtime);
  assert.deepEqual(loaded.Tank.Flora, save.Tank.Flora);
  assert.equal(validateSession(structuredClone(source), runtime).Tank.Flora, undefined, 'older saves do not grow a default layout');
  assert.throws(() => validateSession({...structuredClone(save), Tank:{...save.Tank, Flora:[stem({Nodes:-1})]}}, runtime));
  assert.notEqual(floraSignature(save.Tank.Flora), floraSignature([stem({Nodes:20}), moss()]));
});

test('生态推进只在叶节、叶姿、原生水草阶段或剪口确实变化时要求更新落脚面',()=>{
  const save=structuredClone(source), plant=save.Tank.Plants[0];
  save.Tank.Plants=[plant];
  const shoot=stem({Nodes:9}), leaf={...moss(),Species:'pala',Nodes:6,Upright:0};
  save.Tank.Flora=[shoot,leaf];
  const advance=()=>advanceEcology(save,defs,1);
  assert.equal(advance(),false);
  shoot.Nodes=9.9999999;
  assert.equal(advance(),true);
  assert.equal(visibleNodes(shoot),10);
  leaf.Upright=1/12-1e-8;
  assert.equal(advance(),true);
  plant.Stage=0;
  assert.equal(advance(),true);
  plant.Cuts=[{EcologicalAgeAtCut:plant.EcologicalAgeSeconds-defs.find(d=>d.TypeId===plant.TypeId).TrimRecoveryDays*86400}];
  assert.equal(advance(),true);
  assert.deepEqual(plant.Cuts,[]);
  assert.equal(advance(),false);
  save.Tank.Setup.Filled=false;
  const dry=structuredClone(save);
  assert.equal(advance(),false);
  assert.deepEqual(save,dry);
});

test('catalog covers every species and variant, with ground and host placement rules', () => {
  assert.equal(FLORA_CATALOG.length, 19);
  assert.deepEqual(parsePlantKind('1'), {unity:1});
  assert.deepEqual(parsePlantKind('flora:rotala:2'), {species:'rotala', variant:2});
  assert.throws(() => parsePlantKind('flora:kelp:0'));
  checkFloraGround([], {x:0.1, z:-0.15, species:'rotala'});
  assert.throws(() => checkFloraGround([], {x:0.1,z:-0.15,species:'javafern'}), /木石/);
  checkFloraHost([], {host:'R1',local:[0,0.01,0],species:'javafern'});
  assert.throws(() => checkFloraGround([], {x:0.1, z:-0.15, species:'moss'}), /木石/);
  assert.throws(() => checkFloraGround([stem({X:0.1, Z:-0.15})], {x:0.105, z:-0.15, species:'rotala'}), /太近/);
  assert.throws(() => checkFloraGround([], {x:0.8, z:0, species:'carpet'}), /缸内/);
  checkFloraHost([], {host:'W1', local:[0, 0.01, 0], species:'pala'});
  assert.throws(() => checkFloraHost([], {host:'', local:[0, 0, 0], species:'pala'}));
  const planted = makeFloraRecord({id:'n1', species:'carpet', variant:1, x:0.2, z:-0.2});
  assert.equal(planted.Nodes, SPECIES.carpet.start);
  assert.equal(planted.Variant, 1);
});

test('native host coordinates are measured in metres for spacing and yaw wraps', () => {
  const matrix = new T.Matrix4().makeScale(.001,.002,.001), record = moss({Local:[100,10,0]});
  assert.doesNotThrow(()=>sanitizeFlora([record]));
  assert.throws(()=>checkFloraHost([record],{host:'wood',local:[101,10,0],species:'moss',matrix}),/太近/);
  checkFloraHost([record],{host:'wood',local:[150,10,0],species:'moss',matrix});
  checkFloraHost([record],{host:'wood',local:[100,10,0],species:'moss',matrix,ignore:'m1'});
  assert.ok(Math.abs(makeFloraRecord({id:'fourth',species:'rotala',variant:0,x:0,z:0,yaw:7.197}).Yaw)<=Math.PI);
  assert.throws(()=>sanitizeFlora([stem({Yaw:Infinity})]));
  const save=structuredClone(source);save.Tank.Flora=[record];
  assert.throws(()=>validateSession(save,runtime),/附着木石/);
});

test('procedural plants export walkable hulls for shrimp', () => {
  const soil = {sample:() => 0.04};
  const items = floraCollisionItems([
    stem({X:0.2, Z:0.1, Nodes:16}),
    moss({Host:'wood', Local:[0.01, 0.02, 0], Normal:[0, 1, 0]}),
  ], {soil, hostMatrix:id => id === 'wood' ? new T.Matrix4() : null});
  assert.equal(items.length, 2);
  assert.ok(items.every(item => item.kind === 3 && item.owner.startsWith('Plant ') && !item.solid));
});
