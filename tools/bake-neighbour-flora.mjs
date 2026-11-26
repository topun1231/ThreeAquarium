import fs from 'node:fs';
import {Group} from 'three';
import {MeshoptSimplifier} from 'meshoptimizer/simplifier';
import {anubiasGeometry} from '../src/anubias.js';
import {FloraView} from '../src/flora-view.js';

const root=new URL('../public/assets/',import.meta.url);
const pack=JSON.parse(fs.readFileSync(new URL('anubias/models.json',root),'utf8'));
const raw=fs.readFileSync(new URL('anubias/geometry.bin',root));
const models=anubiasGeometry(pack,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const view=new FloraView({root:new Group(),materials:[]});
view.installAnubias({models,materials:pack.materials});
await MeshoptSimplifier.ready;
const output={};
for(const [key,units] of Object.entries(view.units)){
 const unit=units[0], {position,uv,aqNode}=unit.attributes;
 if(!aqNode)continue;
 const parts=new Map(), original=unit.index.array;
 for(let i=0;i<original.length;i+=3){
  const leaf=aqNode.getX(original[i]);
  if(!parts.has(leaf))parts.set(leaf,[]);
  parts.get(leaf).push(original[i],original[i+1],original[i+2]);
 }
 const indices=[];
 for(const part of parts.values()){
  const target=Math.max(48,Math.floor(part.length/30)*3);
  const [reduced]=MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(part),position.array,3,uv.array,2,[.05,.05],null,target,.055,['Permissive','Prune']);
  const selected=reduced.length?reduced:part;
  for(const index of selected)indices.push(index);
 }
 const bytes=Buffer.from(Uint32Array.from(indices).buffer);
 output[key]={vertices:position.count,sourceCount:original.length,indices:bytes.toString('base64')};
 console.log(key,original.length/3,indices.length/3);
}
fs.writeFileSync(new URL('neighbour-flora.json',root),JSON.stringify(output));
