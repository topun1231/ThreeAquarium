import assert from 'node:assert/strict';
import fs from 'node:fs';import * as T from 'three';import {attributeArray} from '../src/state.js';
const pack=JSON.parse(fs.readFileSync('public/assets/scene.json')),raw=fs.readFileSync('public/assets/geometry.bin'),buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),d=pack.draws.find(d=>d.bones?.length),g=pack.geometries[d.geo];
let matrix=new T.Matrix4();for(let i=d.node;pack.nodes[i].parent>=0;i=pack.nodes[i].parent){const n=pack.nodes[i];matrix.premultiply(new T.Matrix4().compose(new T.Vector3(...n.p),new T.Quaternion(...n.q),new T.Vector3(...n.s)));}
const pos=attributeArray(buffer,g.position),skin=attributeArray(buffer,g.skinIndex),weights=attributeArray(buffer,g.skinWeight),points=[];
for(let i=0;i<pos.length/3;i++){let core=0;for(let j=0;j<4;j++)if(skin[i*4+j]>=1&&skin[i*4+j]<=7)core+=weights[i*4+j];if(core<.8)continue;points.push(new T.Vector3().fromArray(pos,i*3).applyMatrix4(matrix));}
console.log('core',points.length,new T.Box3().setFromPoints(points));
const spheres=[];for(let x=-.001;x<=.026;x+=.0015){const near=points.filter(p=>Math.abs(p.x-x)<=.00085);if(!near.length)continue;const bounds=new T.Box3().setFromPoints(near),y=(bounds.min.y+bounds.max.y)/2;const radius=Math.max(...near.map(p=>p.distanceTo(new T.Vector3(x,y,0))))+.00005;spheres.push({x,y,r:radius});}
const maxUncovered=Math.max(...points.map(p=>Math.min(...spheres.map(s=>p.distanceTo(new T.Vector3(s.x,s.y,0))-s.r))));assert.ok(points.length>30000&&maxUncovered<=0,'Body proxy must contain the approved trunk');console.log({spheres:spheres.length,maxUncovered});
fs.writeFileSync('evidence/body-proxy-fit.json',JSON.stringify({vertices:points.length,maxUncovered,spheres},null,2));

fs.writeFileSync('src/body-proxy.js','// Fitted to the approved REAL002 trunk in creature-root space; regenerate with tools/fit-body-proxy.mjs.\nexport const bodyProxy='+JSON.stringify([...spheres,{x:.0205,y:.0025476,r:.0017875}])+';\n');
