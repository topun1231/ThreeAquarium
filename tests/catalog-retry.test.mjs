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

for (const failure of ['http', 'network', 'body']) test(`catalog ${failure} failure is identified and a later call refetches`, async () => {
  let geometryCalls = 0;
  const cause = new TypeError('Failed to fetch');
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const name = String(url).split('/').pop();
    if (name === 'catalog.json') return {ok:true, json:async () => catalog};
    if (name === 'setup.json') return {ok:true, json:async () => setup};
    if (name === 'catalog-geometry.bin') {
      geometryCalls++;
      if (failure === 'network') throw cause;
      if (failure === 'body') return {ok:true, arrayBuffer:async () => {throw cause;}};
      return {ok:false, url, status:500};
    }
    return {ok:false, url, status:404};
  };
  try {
    const runtime = await TankRuntime.load({root:new T.Group(), nodes:[], materials:[]}, {plants:[]}, () => {});
    const first = runtime.ensureCatalog();
    const concurrent = runtime.ensureCatalog();
    const catalogFailure = error => {
      assert.equal(error.code, 'CATALOG_LOAD_FAILED');
      if (failure === 'http') assert.match(error.cause.message, /资源读取失败/);
      else assert.equal(error.cause, cause);
      assert.equal(error.message, error.cause.message);
      return true;
    };
    await assert.rejects(first, catalogFailure);
    await assert.rejects(concurrent, catalogFailure);
    assert.equal(geometryCalls, 1, 'in-flight callers share one fetch');
    assert.equal(runtime.catalog, null);
    assert.equal(runtime._catalogPending, null);
    await assert.rejects(() => runtime.ensureCatalog(), catalogFailure);
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
