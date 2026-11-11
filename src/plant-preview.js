import * as T from 'three';
import {keepVisibleLeaves} from './flora-view.js';

export function plantGhost(record,runtime,flora,material,scene=flora?.scene(runtime)) {
  const root=new T.Group();root.name='Plant ghost';
  const materials=new Map();
  const cutout=source=>{
    if(!source?.map&&!source?.alphaMap)return material;
    if(!materials.has(source)){const m=material.clone();m.color=material.color;m.map=source.map;m.alphaMap=source.alphaMap;m.alphaTest=source.alphaTest*material.opacity;materials.set(source,m);}
    return materials.get(source);
  };
  if(record.Species){
    for(const b of flora.instances([record],scene).values()){
      const geometry=keepVisibleLeaves(flora.units[b.key][b.variant],b.leaves[0]);
      const mesh=new T.InstancedMesh(geometry,cutout(flora.materials?.[b.key]),b.matrices.length);
      b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;
      mesh.userData.previewGeometry=true;mesh.frustumCulled=false;root.add(mesh);
    }
  } else {
    const node=runtime.plant(record,runtime.current.soil);
    node.traverse(o=>{if(o.isMesh){o.material=Array.isArray(o.material)?o.material.map(cutout):cutout(o.material);o.castShadow=false;o.receiveShadow=false;}});root.add(node);
  }
  root.userData.previewMaterials=[...materials.values()];
  return root;
}

export function disposePlantGhost(root) {
  root?.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.userData.previewGeometry||o.userData.ownedGeometry)o.geometry.dispose();});
  root?.userData.previewMaterials?.forEach(m=>m.dispose());
  root?.removeFromParent();
}
