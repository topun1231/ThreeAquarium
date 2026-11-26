import {Float32BufferAttribute,Group,Mesh,MeshStandardMaterial} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {floraSignature} from './flora.js';
import {plantGeometryRows} from './wallpaper-layout.js';

function replaceCatalogPlants(root,records,runtime,soil){
 const batches=new Map();
 for(const record of records){
  const plant=runtime.plant(record,soil);
  plant.updateMatrixWorld(true);
  plant.traverse(mesh=>{
   if(!mesh.isMesh) return;
   const material=[].concat(mesh.material)[0];
   const key=[material.map?.uuid,material.alphaTest,material.side,mesh.castShadow,mesh.receiveShadow].join('/');
   if(!batches.has(key))batches.set(key,{mesh,material,parts:[]});
   const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
   if(mesh.userData.ownedGeometry)mesh.geometry.dispose();
   for(const attr of Object.keys(geometry.attributes)){
    if(!['position','normal','uv'].includes(attr))geometry.deleteAttribute(attr);
   }
   const colors=new Float32Array(geometry.attributes.position.count*3);
   for(let i=0;i<colors.length;i+=3)material.color.toArray(colors,i);
   geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
   batches.get(key).parts.push(geometry);
  });
 }
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  mesh.geometry.dispose();mesh.material.dispose();
 });
 root.clear();
 for(const {mesh,material,parts} of batches.values()){
  const geometry=mergeGeometries(parts,false);
  for(const part of parts)part.dispose();
  const batch=new Mesh(geometry,new MeshStandardMaterial({
   map:material.map,alphaTest:material.alphaTest,side:material.side,roughness:.68,vertexColors:true
  }));
  batch.castShadow=mesh.castShadow;batch.receiveShadow=mesh.receiveShadow;
  batch.userData.plantParts=parts.length;
  geometry.computeBoundingSphere();root.add(batch);
 }
}

export function createNeighbourPlants(runtime,flora,packed){
 const decoded=new Map();
 function pickIndices(unit,key){
  const data=packed?.[key];
  if(!data || data.vertices!==unit.attributes.position.count || data.sourceCount!==unit.index.count)return null;
  if(!decoded.has(key)){
   try{
    const bytes=Uint8Array.from(atob(data.indices),c=>c.charCodeAt(0)), indices=new Uint32Array(bytes.buffer);
    decoded.set(key,indices.length%3 || !indices.length || indices.some(i=>i>=data.vertices)?null:indices);
   }catch{decoded.set(key,null);}
  }
  return decoded.get(key);
 }
 return root=>{
  const catalog=new Group(), procedural=new Group(), meshes=new Map();
  catalog.name='Neighbour catalog plants';procedural.name='Neighbour procedural plants';
  root.add(catalog,procedural);
  let previousCatalog,previousFlora,previousSoil,previousStones;
  return (tank,soil,stones)=>{
   const plants=tank.Plants||[], list=tank.Flora||[];
   const catalogSignature=JSON.stringify(plantGeometryRows(plants,p=>runtime.plantGeometryGrowth(p))), signature=floraSignature(list);
   const soilChanged=soil!==previousSoil, stonesChanged=stones!==previousStones;
   const catalogChanged=catalogSignature!==previousCatalog || (soilChanged && plants.length>0);
   const floraChanged=signature!==previousFlora || (list.length>0 && (soilChanged || stonesChanged));
   if(catalogChanged)replaceCatalogPlants(catalog,plants,runtime,soil);
   if(floraChanged){
    const entities=new Map(stones.map(node=>[node.userData.entity,node]));
    const scene={soil,entities,habitat:{surfaces:[]},hostMatrix:id=>entities.get(id)?.matrix};
    for(const node of stones)node.updateMatrix();
    flora.build(list,scene,{root:procedural,meshes,distant:true,pickIndices});
   }
   previousCatalog=catalogSignature;previousFlora=signature;previousSoil=soil;previousStones=stones;
   return catalogChanged || floraChanged;
  };
 };
}
