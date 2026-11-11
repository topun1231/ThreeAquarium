import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {createHabitat} from './habitat.js';
import {seatHardscape} from './hardscape.js';
const ID='placement-preview';
export async function createHardscapeMoveProbe(current,id) {
  const original=current.save.Tank.Hardscape.find(r=>r.UniqueId===id);
  if(!original)throw Error('要移动的木石已经不在了');
  const habitat={surfaces:current.habitat.surfaces.filter(s=>s.solid).map(s=>{
    const geo=s.geo.clone(),serialized=s.serialized?{...s.serialized,roots:s.serialized.roots.map(r=>r.slice())}:s.bvh&&MeshBVH.serialize(s.bvh);
    const bvh=serialized?MeshBVH.deserialize(serialized,geo):new MeshBVH(geo);geo.computeBoundingBox();
    return {owner:s.owner,kind:s.kind,solid:true,geo,bvh,box:geo.boundingBox,transform:new T.Matrix4()};
  })};
  const baseline=habitat.surfaces.map(s=>({position:s.geo.attributes.position.array.slice(),box:s.box.clone(),tree:MeshBVH.serialize(s.bvh)})),cache=new Map();
  return {
    solve(point) {
      const records=structuredClone(current.save.Tank.Hardscape),record=records.find(r=>r.UniqueId===id),entities=new Map();
      for(const r of records){const n=new T.Group(),source=current.entities.get(r.UniqueId);n.name=source.name;n.userData.kind=source.userData.kind;entities.set(r.UniqueId,n);}
      const owner=entities.get(id).name,offset=new T.Matrix4().makeTranslation(point.x-original.Position.x,0,point.z-original.Position.z);
      habitat.surfaces.forEach((s,i)=>{const base=baseline[i];s.geo.attributes.position.array.set(base.position);s.geo.boundingBox.copy(base.box);s.box=s.geo.boundingBox;s.transform.identity();s.bvh=MeshBVH.deserialize({...base.tree,roots:base.tree.roots.map(r=>r.slice())},s.geo,{setIndex:false});if(s.owner===owner){s.geo.applyMatrix4(offset);s.transform.copy(offset);s.bvh.refit();}});
      record.Position.x=point.x;record.Position.z=point.z;
      try{seatHardscape({soil:current.soil,entities,habitat},records,id,{cache});return {valid:true,record,records};}
      catch(e){return {valid:false,reason:e.message};}
    },
    dispose(){habitat.surfaces.forEach(s=>s.geo.dispose());},
  };
}
export async function createHardscapeProbe(runtime,key) {
  await runtime.ensureCatalog();
  const record={UniqueId:ID,TypeId:key,Position:{x:0,y:0,z:0},Rotation:{x:0,y:0,z:0},Scale:{x:1,y:1,z:1},Burial:.003};
  const node=runtime.hardscape(record);node.updateMatrixWorld(true);
  const items=[];node.traverse(o=>{if(o.isMesh&&o.geometry.index?.count)items.push({node:ID+'/'+items.length,owner:node.name,solid:true,kind:node.userData.kind,geometry:o.geometry,transform:o.matrixWorld.clone()});});
  const {surfaces}=await createHabitat(null,null,()=>{},null,items);
  const originals=surfaces.map(s=>({position:s.geo.attributes.position.array.slice(),transform:s.transform.clone()}));
  const box=new T.Box3().setFromObject(node),center=box.getCenter(new T.Vector3());
  return {node,key,
    solve(point,current) {
      record.Position={x:point.x-center.x,y:point.y-box.min.y,z:point.z-center.z};record.Rotation={x:0,y:0,z:0};
      node.position.copy(record.Position);node.quaternion.identity();node.updateMatrixWorld(true);
      const offset=new T.Matrix4().makeTranslation(record.Position.x,record.Position.y,record.Position.z);
      surfaces.forEach((s,i)=>{s.geo.attributes.position.array.set(originals[i].position);s.geo.applyMatrix4(offset);s.geo.computeBoundingBox();s.box=s.geo.boundingBox;s.bvh.refit();s.transform.copy(originals[i].transform).premultiply(offset);});
      const candidate={soil:current.soil,entities:new Map([...current.entities,[ID,node]]),habitat:{surfaces:[...current.habitat.surfaces.filter(s=>s.solid),...surfaces]}};
      try {
        if(current.save.Tank.Hardscape.length>=24)throw Error('每缸最多 24 件木石');
        seatHardscape(candidate,[...current.save.Tank.Hardscape,record],ID,{onlyId:ID});
        return {valid:true,reason:'左键放置',record:structuredClone(record)};
      } catch(e) { return {valid:false,reason:e.message}; }
    },
    dispose(){surfaces.forEach(s=>s.geo.dispose());},
  };
}
