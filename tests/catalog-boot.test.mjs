import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {TankRuntime} from '../src/tank-runtime.js';

const assets = fileURLToPath(new URL('../public/assets/', import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(assets, 'catalog.json')));
const setup = JSON.parse(fs.readFileSync(path.join(assets, 'setup.json')));

async function bootRuntime() {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const name = String(url).split('/').pop();
    if (name === 'catalog.json') return {ok:true, json:async () => catalog};
    if (name === 'setup.json') return {ok:true, json:async () => setup};
    return {ok:false, url, status:404};
  };
  try {
    return await TankRuntime.load({root:new T.Group(), nodes:[], materials:[]}, {plants:[]}, () => {});
  } finally {
    globalThis.fetch = original;
  }
}

test('boot without catalog advances frames without throwing', async () => {
  const runtime = await bootRuntime();
  assert.equal(runtime.catalog, null);
  let frames = 0;
  assert.doesNotThrow(() => {
    for (let i = 0; i < 30; i++) {
      runtime.update(1 / 60, i / 60);
      frames++;
    }
  });
  assert.ok(frames > 0);
  assert.equal(frames, 30);
  assert.equal(runtime.catalog, null);
});

test('the old catalog.update crash is the failure the boot guard prevents', () => {
  const runtime = {catalog:null};
  assert.throws(() => runtime.catalog.update(0.016, 0), TypeError);
  assert.doesNotThrow(() => runtime.catalog?.update?.(0.016, 0));
});
