import fs from 'node:fs';
import {MeshoptSimplifier} from 'meshoptimizer/simplifier';
import {attributeArray} from '../src/state.js';

const assets=new URL('../public/assets/',import.meta.url);
const pack=JSON.parse(fs.readFileSync(new URL('scene.json',assets),'utf8'));
const raw=fs.readFileSync(new URL('geometry.bin',assets));
const buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const output={};
await MeshoptSimplifier.ready;
for(const draw of pack.draws.filter(draw=>draw.bones?.length)){
  if(output[draw.geo])continue;
  const g=pack.geometries[draw.geo],positions=attributeArray(buffer,g.position),uv=attributeArray(buffer,g.uv),indices=attributeArray(buffer,g.index);
  const groups=g.groups.map(({start,count,material})=>{
    const name=pack.materials[draw.materials[material]].name;
    const [low]=MeshoptSimplifier.simplifyWithAttributes(indices.subarray(start,start+count),positions,3,uv,2,
      [.05,.05],null,Math.min(count,/eye/i.test(name)?540:/shell/i.test(name)?3000:2400),.018,['Permissive']);
    if(!low.length || low.length%3 || low.length>count)throw Error('Invalid shrimp geometry: '+g.name);
    return Buffer.from(low.buffer,low.byteOffset,low.byteLength).toString('base64');
  });
  output[draw.geo]={vertices:g.position.count,indices:indices.length,groups};
  console.log(g.name,indices.length/3,groups.reduce((n,group)=>n+Buffer.from(group,'base64').byteLength/12,0));
}
fs.writeFileSync(new URL('neighbour-shrimp.json',assets),JSON.stringify(output));
