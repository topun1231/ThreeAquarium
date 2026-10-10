import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attributeArray,stableSeed,validateProgress} from '../src/state.js';

test('invalid or foreign browser saves never replace progress',()=>{
 const good={version:1,tankId:'a',camera:[0,.3,1],target:[0,.2,0],action:'Rest'};
 assert.deepEqual(validateProgress(good,'a'),good);
 for(const bad of [{...good,tankId:'b'},{...good,camera:[NaN,0,0]},{...good,target:[0,0]},{...good,action:'arbitrary'}])assert.throws(()=>validateProgress(bad,'a'));
});
test('binary reader rejects malformed byte ranges',()=>{const b=new Float32Array([1,2,3]).buffer;assert.deepEqual([...attributeArray(b,{offset:0,count:1,size:3,type:'float'})],[1,2,3]);for(const offset of [-1,1,12])assert.throws(()=>attributeArray(b,{offset,count:1,size:3,type:'float'}));});
test('individual seeds persist across reload',()=>{assert.equal(stableSeed('first'),stableSeed('first'));assert.notEqual(stableSeed('first'),stableSeed('second'));});
test('exported scene has original stock, complete skeletons and animation tracks',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../public/assets/scene.json',import.meta.url),'utf8'));
 const b=fs.readFileSync(new URL('../public/assets/geometry.bin',import.meta.url));const buffer=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
 assert.equal(p.plants,89);assert.equal(p.hardscape,8);assert.equal(p.animals.length,5);assert.equal(new Set(p.animals.map(a=>a.id)).size,5);
 for(const d of p.draws){assert.ok(p.nodes[d.node]);const g=p.geometries[d.geo];const positions=attributeArray(buffer,g.position);const idx=attributeArray(buffer,g.index);assert.equal(idx.length%3,0);assert.ok(idx.every(i=>i<positions.length/3));if(d.bones?.length){assert.equal(d.bones.length,48);assert.equal(g.bindposes.length,d.bones.length*16);assert.ok(d.bones.every(i=>p.nodes[i]?.bone));const weights=attributeArray(buffer,g.skinWeight);for(let i=0;i<weights.length;i+=4)assert.ok(Math.abs(weights[i]+weights[i+1]+weights[i+2]+weights[i+3]-1)<.002);}}
 for(const c of p.clips){assert.ok(c.duration>0);for(const t of c.tracks){assert.equal(t.positions.length,t.times.length*3);assert.equal(t.rotations.length,t.times.length*4);assert.ok(t.rotations.every(Number.isFinite));}}
 for(const name of ['Rest','Walk','Graze','Groom','EscapeSwim'])assert.ok(p.clips.some(c=>c.name===name),name);
});
