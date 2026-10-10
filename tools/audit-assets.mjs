import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {attributeArray} from '../src/state.js';
const root=path.resolve(import.meta.dirname,'..'),assets=path.join(root,'public/assets'),report={packs:[],errors:[]};
for(const [json,bin,nested]of [['scene.json','geometry.bin',false],['catalog.json','catalog-geometry.bin',true]]){
 const document=JSON.parse(fs.readFileSync(path.join(assets,json))),pack=nested?document.assets:document,raw=fs.readFileSync(path.join(assets,bin)),buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);let triangles=0,vertices=0,textures=new Set();
 for(const [i,g]of pack.geometries.entries()){
  for(const [key,value]of Object.entries(g))if(value&&typeof value==='object'&&'offset'in value){const a=attributeArray(buffer,value);assert.ok(!a||a.every(Number.isFinite),`${json} geometry ${i} ${key} finite`);}
  const indices=attributeArray(buffer,g.index);assert.ok(indices.every(n=>n<g.position.count),`${json} geometry ${i} indices`);assert.equal(indices.length%3,0);triangles+=indices.length/3;vertices+=g.position.count;
 }
 for(const draw of pack.draws){assert.ok(pack.nodes[draw.node]&&pack.geometries[draw.geo]);assert.ok(draw.materials.every(i=>pack.materials[i]));if(draw.bones?.length){const g=pack.geometries[draw.geo],indices=attributeArray(buffer,g.skinIndex),weights=attributeArray(buffer,g.skinWeight);assert.ok(indices.every(i=>i<draw.bones.length));for(let i=0;i<weights.length;i+=4)assert.ok(Math.abs(weights[i]+weights[i+1]+weights[i+2]+weights[i+3]-1)<.001);}}
 for(const m of pack.materials)for(const key of ['map','normal','roughnessMap','aoMap','metalMap','thicknessMap'])if(m[key]){assert.ok(fs.existsSync(path.join(assets,m[key])),m[key]);textures.add(m[key]);}
 report.packs.push({json,geometries:pack.geometries.length,draws:pack.draws.length,vertices,triangles,textures:textures.size,bytes:raw.byteLength});
}
function bytes(dir){return fs.readdirSync(dir,{withFileTypes:true}).reduce((sum,e)=>sum+(e.isDirectory()?bytes(path.join(dir,e.name)):fs.statSync(path.join(dir,e.name)).size),0);}
report.assetMiB=bytes(assets)/1048576;report.distMiB=bytes(path.join(root,'dist'))/1048576;report.catalogEntries=JSON.parse(fs.readFileSync(path.join(assets,'catalog.json'))).entries.length;
fs.writeFileSync(path.join(root,'evidence/audit-assets.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
