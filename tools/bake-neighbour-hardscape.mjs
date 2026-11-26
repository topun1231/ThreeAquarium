import fs from 'node:fs';
import {MeshoptSimplifier} from 'meshoptimizer/simplifier';
import {attributeArray} from '../src/state.js';
import {highestDetailDraws} from '../src/asset-lod.js';

const assets=new URL('../public/assets/',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(name,assets),'utf8'));
const catalog=read('catalog.json'), scene=read('scene.json'), setup=read('setup.json');
const sceneRoots=setup.Tank.Hardscape.map(record=>scene.nodes.findIndex(node=>/^[WR]0 /.test(node.name) && node.name.includes(record.UniqueId))).filter(i=>i>=0);
const catalogRoots=catalog.entries.filter(entry=>!entry.key.startsWith('plant-')).map(entry=>entry.root);
const output={scene:{},catalog:{}};

await MeshoptSimplifier.ready;
for(const [name,pack,roots,file] of [
 ['scene',scene,sceneRoots,'geometry.bin'],
 ['catalog',catalog.assets,catalogRoots,'catalog-geometry.bin']
]){
 const raw=fs.readFileSync(new URL(file,assets)), buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
 const included=new Set(roots);
 for(const [i,node] of pack.nodes.entries())if(included.has(node.parent))included.add(i);
 const ids=new Set(highestDetailDraws(pack).filter(draw=>included.has(draw.node)).map(draw=>draw.geo));
 for(const id of ids){
  const g=pack.geometries[id], positions=attributeArray(buffer,g.position), indices=attributeArray(buffer,g.index);
  if(!g.groups.length || indices.length<=3600)continue;
  const uv=attributeArray(buffer,g.uv);
  const groups=g.groups.map(group=>{
   const part=indices.subarray(group.start,group.start+group.count);
   const [low]=uv ? MeshoptSimplifier.simplifyWithAttributes(part,positions,3,uv,2,[.05,.05],null,3600,.04,['Permissive','Prune']) :
    MeshoptSimplifier.simplify(part,positions,3,3600,.04,['Permissive','Prune']);
   if(low.length>part.length || low.length%3 || !low.length)throw Error(name+' invalid reduced mesh '+g.name);
   return Buffer.from(low.buffer,low.byteOffset,low.byteLength).toString('base64');
  });
  output[name][id]={vertices:g.position.count,indices:indices.length,groups};
  console.log(name,id,g.name,indices.length/3,groups.reduce((n,b64)=>n+Buffer.from(b64,'base64').byteLength/12,0));
 }
}
fs.writeFileSync(new URL('neighbour-hardscape.json',assets),JSON.stringify(output));
