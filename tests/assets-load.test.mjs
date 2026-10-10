import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {TankRuntime, needsCatalogMeshes} from '../src/tank-runtime.js';

const assets = fileURLToPath(new URL('../public/assets/', import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(assets, 'catalog.json')));
const setup = JSON.parse(fs.readFileSync(path.join(assets, 'setup.json')));
const scene = JSON.parse(fs.readFileSync(path.join(assets, 'scene.json')));

function referenced(pack) {
  const files = new Set();
  for (const m of pack.materials || []) {
    for (const k of ['map', 'normal', 'roughnessMap', 'aoMap', 'metalMap', 'thicknessMap']) if (m[k]) files.add(m[k]);
  }
  return files;
}

test('catalog geometry stays off the startup fetch list', async () => {
  const fetched = [];
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    fetched.push(String(url));
    const name = String(url).split('/').pop();
    if (name === 'catalog.json') return {ok:true, json:async () => catalog};
    if (name === 'setup.json') return {ok:true, json:async () => setup};
    return {ok:false, url, status:404};
  };
  try {
    const aq = {root:new T.Group(), nodes:[], materials:[]};
    const runtime = await TankRuntime.load(aq, {plants:[]}, () => {});
    assert.ok(fetched.every(u => !u.includes('catalog-geometry')));
    assert.ok(fetched.some(u => u.includes('catalog.json')));
    assert.ok(fetched.some(u => u.includes('setup.json')));
    assert.equal(runtime.catalog, null);
    assert.equal(needsCatalogMeshes(runtime, {Tank:{Hardscape:[], Plants:[]}}), false);
    assert.equal(needsCatalogMeshes(runtime, {Tank:{Hardscape:[{UniqueId:'new-stone', TypeId:'W01'}], Plants:[]}}), true);
  } finally {
    globalThis.fetch = original;
  }
});

test('scene and catalog texture files exist and catalog-only maps are listed', () => {
  const sceneMaps = referenced(scene);
  const catalogMaps = referenced(catalog.assets);
  for (const file of sceneMaps) assert.ok(fs.existsSync(path.join(assets, file)), file);
  for (const file of catalogMaps) assert.ok(fs.existsSync(path.join(assets, file)), file);
  const catalogOnly = [...catalogMaps].filter(f => !sceneMaps.has(f));
  assert.ok(catalogOnly.some(f => f.startsWith('catalog-texture-')), catalogOnly.join(','));
  assert.ok(fs.existsSync(path.join(assets, 'catalog-geometry.bin')));
  assert.ok(fs.existsSync(path.join(assets, 'anubias/models.json')));
  assert.ok(!fs.existsSync(path.join(assets, 'texture-16.jpg')));
  assert.ok(scene.materials.some(m => m.map === 'texture-16.webp'));
});

test('runtime color and normal maps stay at or below 2048', () => {
  const overs = execFileSync('python3', ['-c', `
import json, os
from PIL import Image
root = ${JSON.stringify(assets)}
scene = json.load(open(os.path.join(root, 'scene.json')))
bad = []
for m in scene['materials']:
    for k in ('map', 'normal'):
        f = m.get(k)
        if not f: continue
        im = Image.open(os.path.join(root, f))
        if max(im.size) > 2048: bad.append(f'{f} {im.size}')
print('\\n'.join(bad))
`], {encoding: 'utf8'}).trim();
  assert.equal(overs, '');
});
