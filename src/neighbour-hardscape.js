import {BufferAttribute,BufferGeometry} from 'three';
import {isMissingLegacyHardscape} from './tank-runtime.js';

export function reducedGeometry(source,record){
 if(source.index.count<=3600)return source;
 if(record?.vertices!==source.attributes.position.count || record.indices!==source.index.count ||
    record.groups?.length!==source.groups.length)return null;
 const geometry=new BufferGeometry(), indices=[];
 for(const [i,group] of source.groups.entries()){
  const bytes=Uint8Array.from(atob(record.groups[i]),c=>c.charCodeAt(0));
  if(!bytes.length || bytes.length%12 || bytes.length/4>group.count)return null;
  const part=new Uint32Array(bytes.buffer);
  if(part.some(index=>index>=record.vertices))return null;
  geometry.addGroup(indices.length,part.length,group.materialIndex);
  const flipped=source.userData.neighbourFlipped;
  for(let k=0;k<part.length;k+=3){
   indices.push(part[k],part[k+(flipped?2:1)],part[k+(flipped?1:2)]);
  }
 }
 geometry.setIndex(new BufferAttribute(Uint32Array.from(indices),1));
 for(const [key,value] of Object.entries(source.attributes))geometry.setAttribute(key,value);
 geometry.boundingBox=source.boundingBox;geometry.boundingSphere=source.boundingSphere;
 return geometry;
}

export function createNeighbourHardscape(runtime,packed){
 const reduced=new WeakMap();
 return record=>{
  if(isMissingLegacyHardscape(runtime,record))return null;
  const node=runtime.hardscape(record), missing=[];
  node.traverse(mesh=>{
   if(!mesh.isMesh)return;
   const source=mesh.geometry, {neighbourId,neighbourPack}=source.userData;
   if(!reduced.has(source)){
    const entry=packed?.[neighbourPack]?.[neighbourId];
    try {reduced.set(source,reducedGeometry(source,entry));}
    catch {reduced.set(source,null);}
   }
   const geometry=reduced.get(source);
   if(geometry)mesh.geometry=geometry;
   else missing.push(mesh);
  });
  for(const mesh of missing)mesh.removeFromParent();
  return node;
 };
}
