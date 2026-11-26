import * as T from 'three';
import {readAsset,readTexture} from './asset-read.js';

/** Reuse the authored positions, normals and UVs; only the offline exporter changes units and attachment origin. */
export function anubiasGeometry(pack, buffer) {
  if(pack.version!==1)throw new Error('水榕模型版本不支持');
  const models={};
  for(const [species, variants] of Object.entries(pack.models)) models[species]=variants.map(model=>({...model,parts:model.parts.map(part=>{
    const geo=new T.BufferGeometry();
    for(const [key,size] of [['position',3],['normal',3],['uv',2]]){const a=part[key];geo.setAttribute(key,new T.BufferAttribute(new Float32Array(buffer,a.offset,a.count),size));}
    const a=part.index;geo.setIndex(new T.BufferAttribute(new Uint32Array(buffer,a.offset,a.count),1));
    return {...part,geometry:geo};
  })}));
  return models;
}

export async function loadAnubias(signal) {
  const root='/assets/anubias/';
  const [pack,buffer]=await Promise.all([readAsset(root+'models.json','json',false,signal,true),readAsset(root+'geometry.bin','arrayBuffer',false,signal,true)]);
  const loader=new T.TextureLoader(),maps=new Map();
  // Extracted glTF textures retain top-left UVs; FBX textures use the usual flipped upload.
  for(const m of pack.materials)if(m.map&&!maps.has(m.map)){const t=await readTexture(loader,root+m.map,signal,true);t.flipY=m.flipY??true;t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;maps.set(m.map,t);}
  return {models:anubiasGeometry(pack,buffer),materials:pack.materials,maps};
}
