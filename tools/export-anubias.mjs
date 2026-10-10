import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import * as T from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

const pala = process.argv[2], nullified = process.argv[3];
assert.ok(pala && nullified, 'Pass the retained Pala FBX and rebuilt Nullified GLB');
const out = new URL('../public/assets/anubias/', import.meta.url);
fs.mkdirSync(out, {recursive:true});
const pack = {version:1, materials:[], models:{pala:[], nullified:[]}}, chunks=[];
let offset=0;
function array(a) {const bytes=Buffer.from(a.buffer,a.byteOffset,a.byteLength);const r={offset,count:a.length};chunks.push(bytes);offset+=bytes.length;while(offset%4){chunks.push(Buffer.alloc(1));offset++;}return r;}
function part(geo, material, leaf, node) {
  for(const key of Object.keys(geo.attributes)) if(!['position','normal','uv'].includes(key)) geo.deleteAttribute(key);
  if(!geo.index) geo=mergeVertices(geo,1e-6);
  assert.ok(Array.from(geo.attributes.position.array).every(Number.isFinite));
  return {material,leaf,node,position:array(geo.attributes.position.array),normal:array(geo.attributes.normal.array),uv:array(geo.attributes.uv.array),index:array(Uint32Array.from(geo.index.array))};
}
function convert(input,name,alpha=false) {
  const dest=path.join(fileURLToPath(out),name);
  const py="from PIL import Image; import sys; im=Image.open(sys.argv[1]); im=im.convert('RGBA' if sys.argv[3]=='1' else 'RGB'); im.save(sys.argv[2],format='WEBP',lossless=True,method=6)";
  const r=spawnSync('python',['-c',py,input,dest,alpha?'1':'0'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  return name;
}
T.TextureLoader.prototype.load=function(url){const t=new T.Texture();t.userData.url=url;return t;};
const bytes=fs.readFileSync(pala), root=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
const maps=['IMG_30751.png','IMG_30621.png','IMG_30631.png'];
for(const [i,file] of maps.entries()) pack.materials.push({map:convert(path.join(path.dirname(pala),'textures',file),`pala-${i}.webp`,true),flipY:true,color:[1,1,1],roughness:.46,clearcoat:.22,alphaTest:.45});
root.traverse(o=>{
  if(!o.isMesh)return;
  // Pala's petiole bases meet at minimum Z in mesh space: convert its Z-up growth axis to Y-up.
  const g=o.geometry.clone().rotateX(-Math.PI/2);g.computeBoundingBox();const b=g.boundingBox;
  const anchor=new T.Vector3((b.min.x+b.max.x)/2,b.min.y,(b.min.z+b.max.z)/2), scale=.075/(b.max.y-b.min.y);
  // Root vertices determine the attachment point rather than the spread of upper leaves.
  const p=g.attributes.position, feet=[];
  for(let i=0;i<p.count;i++)if(p.getY(i)<b.min.y+(b.max.y-b.min.y)*.03)feet.push(new T.Vector3().fromBufferAttribute(p,i));
  anchor.x=feet.reduce((a,v)=>a+v.x,0)/feet.length;anchor.z=feet.reduce((a,v)=>a+v.z,0)/feet.length;
  g.translate(-anchor.x,-anchor.y,-anchor.z).scale(scale,scale,scale);
  const parts=[];
  // FBX material runs contain complete original leaf/petiole cards, so pruning never synthesizes a new leaf shape.
  for(const [i,group] of g.groups.entries()) {
    const leaf=new T.BufferGeometry();
    for(const k of ['position','normal','uv']){const a=g.attributes[k];leaf.setAttribute(k,new T.BufferAttribute(a.array.slice(group.start*a.itemSize,(group.start+group.count)*a.itemSize),a.itemSize));}
    parts.push(part(leaf,group.materialIndex,true,i));
  }
  pack.models.pala.push({name:o.name,leaves:parts.length,parts});
});
assert.equal(pack.models.pala.length,3);
const glb=fs.readFileSync(nullified), jl=glb.readUInt32LE(12), j=JSON.parse(glb.subarray(20,20+jl)), bin=glb.subarray(28+jl);
const types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}, sizes={VEC3:3,VEC2:2,SCALAR:1};
function read(id){const a=j.accessors[id],v=j.bufferViews[a.bufferView],C=types[a.componentType];assert.ok(!v.byteStride);return new C(bin.buffer,bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*sizes[a.type]).slice();}
const model={name:'Nullified rebuilt',leaves:8,parts:[]};
// Centre of the rebuilt creeping rhizome; fine roots are allowed to extend into the host.
const rh=j.meshes.find(m=>m.name==='Rebuilt_creeping_rhizome'), rp=read(rh.primitives[0].attributes.POSITION), anchor=new T.Vector3();
for(let i=0;i<rp.length;i+=3)anchor.add(new T.Vector3(rp[i],rp[i+1],rp[i+2]));anchor.multiplyScalar(3/rp.length);
const all=j.meshes.flatMap(m=>Array.from(read(m.primitives[0].attributes.POSITION)).filter((_,i)=>i%3===1)), scale=.085/(Math.max(...all)-anchor.y);
for(const [i,m] of j.materials.entries()) {
  const p=m.pbrMetallicRoughness;let map;
  if(p.baseColorTexture){const im=j.images[j.textures[p.baseColorTexture.index].source],v=j.bufferViews[im.bufferView],temp=path.join(process.env.TEMP,'aquarium-nullified-color.png');fs.writeFileSync(temp,bin.subarray(v.byteOffset,v.byteOffset+v.byteLength));map=convert(temp,'nullified.webp');fs.unlinkSync(temp);}
  pack.materials.push({map,flipY:false,color:p.baseColorFactor?.slice(0,3)||[1,1,1],roughness:i===0?.55:p.roughnessFactor,clearcoat:i===0?.12:0,alphaTest:0});
}
for(const m of j.meshes){const p=m.primitives[0],g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(read(p.attributes.POSITION),3));g.setAttribute('normal',new T.BufferAttribute(read(p.attributes.NORMAL),3));g.setAttribute('uv',new T.BufferAttribute(read(p.attributes.TEXCOORD_0),2));g.setIndex(new T.BufferAttribute(read(p.indices),1));g.translate(-anchor.x,-anchor.y,-anchor.z).scale(scale,scale,scale);const match=/^(?:Original_leaf_group_|Rebuilt_petiole_)(\d+)$/.exec(m.name);model.parts.push(part(g,3+p.material,m.name.startsWith('Original_leaf_group_'),match?Number(match[1]):-1));}
pack.models.nullified.push(model);
fs.writeFileSync(new URL('geometry.bin',out),Buffer.concat(chunks));fs.writeFileSync(new URL('models.json',out),JSON.stringify(pack));
console.log(JSON.stringify({bytes:offset,pala:pack.models.pala.map(m=>({name:m.name,triangles:m.parts.reduce((n,p)=>n+p.index.count/3,0)})),nullified:model.parts.reduce((n,p)=>n+p.index.count/3,0)},null,2));
