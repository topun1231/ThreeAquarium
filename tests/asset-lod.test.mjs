import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {highestDetailDraws} from '../src/asset-lod.js';
test('catalog renders one highest-detail rock mesh per sibling group, preserving scene draws',()=>{
 const pack=JSON.parse(fs.readFileSync(new URL('../public/assets/catalog.json',import.meta.url))).assets;
 const draws=highestDetailDraws(pack),names=draws.map(d=>pack.nodes[d.node].name);
 assert.ok(pack.draws.length>draws.length);assert.ok(names.includes('boulder_01_LOD0'));
 assert.ok(!names.some(n=>/_LOD[1-9]/.test(n)));
 const scene=JSON.parse(fs.readFileSync(new URL('../public/assets/scene.json',import.meta.url)));
 assert.deepEqual(highestDetailDraws(scene),scene.draws);
});
test('LOD selection preserves independent parents, multipart draws and fallback-only assets',()=>{
 const nodes=[{name:'rock_LOD0',parent:10},{name:'rock_LOD1',parent:10},{name:'rock_LOD2',parent:20},{name:'plant',parent:10}];
 const draws=[{node:0,part:0},{node:0,part:1},{node:1},{node:2},{node:3}];
 assert.deepEqual(highestDetailDraws({nodes,draws}),[draws[0],draws[1],draws[3],draws[4]]);
});
