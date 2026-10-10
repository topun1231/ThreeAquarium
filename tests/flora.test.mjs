import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SPECIES, growFlora, pruneFlora, sanitizeFlora, planFlora, visibleNodes, floraSignature, parsePlantKind, checkFloraGround, checkFloraHost, makeFloraRecord, FLORA_CATALOG} from '../src/flora.js';
import * as T from 'three';
import {floraCollisionItems} from '../src/flora-view.js';
import {advanceEcology} from '../src/ecology.js';
import {validateSession} from '../src/session.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../public/assets/catalog.json', import.meta.url)));
const defs = catalog.definitions.map(JSON.parse), settings = JSON.parse(catalog.ground);
const source = JSON.parse(fs.readFileSync(new URL('../public/assets/setup.json', import.meta.url)));
const runtime = {definitions:defs, settings, entries:new Map(catalog.entries.map(e => [e.key, e]))};

const stem = (extra = {}) => ({UniqueId:'r1', Species:'rotala', Variant:1, Yaw:0.3, Scale:1, Hue:0, Nodes:10, X:0.3, Z:0.15, ...extra});
const moss = (extra = {}) => ({UniqueId:'m1', Species:'moss', Variant:0, Yaw:0, Scale:1, Hue:0.2, Nodes:14, Host:'wood', Local:[0.01, 0.02, 0], Normal:[0, 1, 0], ...extra});

// A flat tank floor with one wooden ridge across the back left.
const probe = (x, z) => {
  if (Math.abs(x) > 0.57 || Math.abs(z) > 0.28) return null;
  if (x < -0.1 && x > -0.4 && z > 0 && z < 0.12) return {y:0.09, kind:2, owner:'W0 wood', normal:[0, 0.9, 0.2]};
  return {y:0.04, kind:0, owner:'Aquarium living substrate', normal:[0, 1, 0]};
};

test('growth adds nodes in ecology days and stops at the species maximum', () => {
  const list = [stem({Nodes:SPECIES.rotala.start})];
  growFlora(list, 86400 * 5);
  assert.ok(Math.abs(list[0].Nodes - (SPECIES.rotala.start + 5 * SPECIES.rotala.perDay)) < 1e-9);
  assert.equal(visibleNodes(list[0]), Math.floor(list[0].Nodes));
  growFlora(list, 86400 * 365);
  assert.equal(list[0].Nodes, SPECIES.rotala.max);
  const slow = [{...stem(), Species:'anubias', Nodes:4, Host:'w', Local:[0, 0, 0], Normal:[0, 1, 0]}];
  growFlora(slow, 86400 * 7);
  assert.equal(visibleNodes(slow[0]), 4, 'anubias adds roughly one leaf per eight days');
});

test('pruning removes nodes from the top and regrowth resumes from there', () => {
  const r = stem({Nodes:20});
  pruneFlora(r, 11);
  assert.equal(r.Nodes, 11);
  growFlora([r], 86400 * 2);
  assert.ok(r.Nodes > 11 && r.Nodes < 13);
  const leaf = {...moss(), Species:'anubias', Nodes:6};
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

test('default planting is deterministic, uses every species and respects existing plants', () => {
  const a = planFlora('tank-a', probe), b = planFlora('tank-a', probe), c = planFlora('tank-b', probe);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const species of Object.keys(SPECIES)) assert.ok(a.some(r => r.Species === species), species);
  assert.ok(a.filter(r => r.Species === 'moss').every(r => r.Host === 'W0 wood' && r.World[1] === 0.09));
  assert.ok(a.filter(r => r.Species === 'carpet').every(r => r.Z < -0.1), 'carpet stays in the foreground');
  const blocked = planFlora('tank-a', probe, [{x:0.44, z:0.17}]);
  assert.ok(blocked.filter(r => r.Species === 'rotala').every(r => Math.hypot(r.X - 0.44, r.Z - 0.17) > 0.012));
  const variants = new Set(a.map(r => r.Variant));
  assert.ok(variants.size >= 3);
});

test('flora grows through advanceEcology and survives a session round trip', () => {
  const save = structuredClone(source);
  save.Tank.Flora = [stem({Nodes:9}), moss()];
  advanceEcology(save, defs, 86400 * 3);
  assert.ok(Math.abs(save.Tank.Flora[0].Nodes - (9 + 3 * 0.8)) < 1e-9);
  const loaded = validateSession(JSON.parse(JSON.stringify(save)), runtime);
  assert.deepEqual(loaded.Tank.Flora, save.Tank.Flora);
  assert.equal(validateSession(structuredClone(source), runtime).Tank.Flora, undefined, 'older saves do not grow a default layout');
  assert.throws(() => validateSession({...structuredClone(save), Tank:{...save.Tank, Flora:[stem({Nodes:-1})]}}, runtime));
  assert.notEqual(floraSignature(save.Tank.Flora), floraSignature([stem({Nodes:20}), moss()]));
});

test('catalog covers every species and variant, with ground and host placement rules', () => {
  assert.equal(FLORA_CATALOG.length, 16);
  assert.deepEqual(parsePlantKind('1'), {unity:1});
  assert.deepEqual(parsePlantKind('flora:rotala:2'), {species:'rotala', variant:2});
  assert.throws(() => parsePlantKind('flora:kelp:0'));
  checkFloraGround([], {x:0.1, z:-0.15, species:'rotala'});
  assert.throws(() => checkFloraGround([], {x:0.1, z:-0.15, species:'moss'}), /木石/);
  assert.throws(() => checkFloraGround([stem({X:0.1, Z:-0.15})], {x:0.105, z:-0.15, species:'rotala'}), /太近/);
  assert.throws(() => checkFloraGround([], {x:0.8, z:0, species:'carpet'}), /缸内/);
  checkFloraHost([], {host:'W1', local:[0, 0.01, 0], species:'anubias'});
  assert.throws(() => checkFloraHost([], {host:'', local:[0, 0, 0], species:'anubias'}));
  const planted = makeFloraRecord({id:'n1', species:'carpet', variant:1, x:0.2, z:-0.2});
  assert.equal(planted.Nodes, SPECIES.carpet.start);
  assert.equal(planted.Variant, 1);
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
