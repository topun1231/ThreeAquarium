import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {TankRuntime} from '../src/tank-runtime.js';
import {catalogErrorMarkup} from '../src/gameplay.js';

const assets = fileURLToPath(new URL('../public/assets/', import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(assets, 'catalog.json')));
const setup = JSON.parse(fs.readFileSync(path.join(assets, 'setup.json')));

test('failed catalog fetch is not cached and a later call refetches', async () => {
  let geometryCalls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const name = String(url).split('/').pop();
    if (name === 'catalog.json') return {ok:true, json:async () => catalog};
    if (name === 'setup.json') return {ok:true, json:async () => setup};
    if (name === 'catalog-geometry.bin') {
      geometryCalls++;
      return {ok:false, url, status:500};
    }
    return {ok:false, url, status:404};
  };
  try {
    const runtime = await TankRuntime.load({root:new T.Group(), nodes:[], materials:[]}, {plants:[]}, () => {});
    const first = runtime.ensureCatalog();
    const concurrent = runtime.ensureCatalog();
    await assert.rejects(first, /资源读取失败/);
    await assert.rejects(concurrent, /资源读取失败/);
    assert.equal(geometryCalls, 1, 'in-flight callers share one fetch');
    assert.equal(runtime.catalog, null);
    assert.equal(runtime._catalogPending, null);
    await assert.rejects(() => runtime.ensureCatalog(), /资源读取失败/);
    assert.equal(geometryCalls, 2, 'retry after failure starts a new fetch');
    assert.equal(runtime._catalogPending, null);
  } finally {
    globalThis.fetch = original;
  }
});

test('catalog load failure shows a retry control', () => {
  const markup = catalogErrorMarkup();
  assert.match(markup, /id="catalog-error"/);
  assert.match(markup, /id="catalog-retry"/);
  assert.match(markup, /重试加载/);
});
