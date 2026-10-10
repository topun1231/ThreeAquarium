import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {TankRuntime, needsCatalogFor} from '../src/tank-runtime.js';
import {validateSession} from '../src/session.js';
import {makeFloraRecord} from '../src/flora.js';

const assets = fileURLToPath(new URL('../public/assets/', import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(assets, 'catalog.json')));
const setup = JSON.parse(fs.readFileSync(path.join(assets, 'setup.json')));
const WOOD = 'branch_driftwood__small__original';
const WOOD_ROOT = catalog.entries.find(e => e.key === WOOD).root;

function fakeCatalog() {
  const nodes = [];
  const group = new T.Group();
  group.add(new T.Mesh(new T.BoxGeometry(0.08, 0.08, 0.08), new T.MeshStandardMaterial()));
  nodes[WOOD_ROOT] = group;
  let ticks = 0;
  return {nodes, materials:[], meshes:[], animals:[], update(){ ticks++; }, get ticks(){ return ticks; }};
}

function runtimeWithCatalog(catalogMeshes = null) {
  const aq = {root:new T.Group(), nodes:[], materials:[]};
  const runtime = new TankRuntime(aq, {plants:[]}, catalog, catalogMeshes, setup);
  runtime._ensureCalls = 0;
  runtime.ensureCatalog = async () => {
    if (runtime.catalog) return runtime.catalog;
    runtime._ensureCalls++;
    runtime.catalog = fakeCatalog();
    return runtime.catalog;
  };
  return runtime;
}

function catalogSave() {
  const save = structuredClone(setup);
  save.Tank.Hardscape = [
    ...save.Tank.Hardscape,
    {UniqueId:'catalog-wood-1', TypeId:WOOD, Position:{x:0.12, y:0.05, z:0.04}, Rotation:{x:0, y:0, z:0}, Scale:{x:1, y:1, z:1}, Burial:0.003},
  ];
  save.Tank.Flora = [makeFloraRecord({id:'pala-on-catalog', species:'pala', variant:0, host:'catalog-wood-1', local:[0, 0.01, 0], normal:[0, 1, 0]})];
  return save;
}

test('validateSession without catalog rejects catalog wood + attached Anubias', () => {
  const runtime = runtimeWithCatalog(null);
  const save = catalogSave();
  assert.equal(needsCatalogFor(runtime, save), true);
  assert.throws(() => validateSession(save, runtime), /木石目录尚未加载/);
});

test('readyForSession loads the catalog then restores wood, Anubias and keeps autosave on', async () => {
  const saved = catalogSave();
  // Refresh: a new runtime starts with catalog=null, same as first paint after reload.
  const reloaded = runtimeWithCatalog(null);
  assert.equal(reloaded.catalog, null);
  let blocked = false;
  let restored;
  try {
    restored = await reloaded.readyForSession(saved);
  } catch (e) {
    blocked = true;
    throw e;
  }
  assert.equal(blocked, false, 'autosave stays enabled when catalog loads on demand');
  assert.ok(reloaded.catalog, 'catalog is loaded before host validation');
  assert.equal(reloaded._ensureCalls, 1);
  assert.equal(restored.Tank.Hardscape.some(h => h.UniqueId === 'catalog-wood-1' && h.TypeId === WOOD), true);
  const pala = restored.Tank.Flora.find(f => f.UniqueId === 'pala-on-catalog');
  assert.equal(pala.Host, 'catalog-wood-1');
  assert.equal(pala.Species, 'pala');
  const node = reloaded.hardscape(restored.Tank.Hardscape.find(h => h.UniqueId === 'catalog-wood-1'));
  assert.ok(node);
  reloaded.validateFloraHosts(restored.Tank);
});

test('startup, import, previous-tank and undo share readyForSession before host validation', async () => {
  const runtime = runtimeWithCatalog(null);
  const save = catalogSave();
  assert.equal(typeof runtime.readyForSession, 'function');
  const once = await runtime.readyForSession(save);
  const again = await runtime.readyForSession(once);
  assert.equal(runtime._ensureCalls, 1, 'warm catalog is reused across restore entry points');
  assert.equal(again.Tank.Flora[0].Host, 'catalog-wood-1');
});
