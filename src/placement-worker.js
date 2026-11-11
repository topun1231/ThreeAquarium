import * as T from 'three';
import {createHardscapeProbe,createHardscapeMoveProbe} from './hardscape-probe.js';
import {createHabitat} from './habitat.js';
import {Substrate} from './substrate.js';

let probe,current,settings,moveId;
const geometry=m=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(m.position,3));g.setIndex(new T.BufferAttribute(m.index,1));return g;};
self.onmessage=async({data})=>{
  try {
    if(data.init){
      settings=data.settings;
      moveId=data.moveId;
      if(moveId){self.postMessage({ready:true});return;}
      const node=new T.Group();node.name='preview-placement-preview';node.userData.kind=data.kind;
      const originals=data.model.map(m=>{const g=geometry(m),mesh=new T.Mesh(g);mesh.applyMatrix4(new T.Matrix4().fromArray(m.matrix));node.add(mesh);return mesh;});
      probe=await createHardscapeProbe({ensureCatalog:async()=>{},hardscape:()=>node},data.key);
      originals.forEach(m=>{m.geometry.dispose();m.material.dispose();});
      self.postMessage({ready:true});return;
    }
    if(data.world){
      if(moveId)probe?.dispose();
      current?.habitat.surfaces.forEach(s=>s.geo.dispose());
      const {soil,records,surfaces}=data.world,source=surfaces.map((s,i)=>({...s,node:String(i),solid:true,geometry:geometry(s),transform:new T.Matrix4()}));
      // The move probe builds its own BVH; retain only source geometry here.
      const habitat=moveId?{surfaces:source.map(s=>({...s,geo:s.geometry}))}:await createHabitat(null,null,()=>{},null,source);
      if(!moveId)source.forEach(s=>s.geometry.dispose());
      const entities=new Map(records.map(r=>{const n=new T.Group(),s=surfaces.find(s=>s.owner.endsWith(r.UniqueId));n.name=s?.owner||r.UniqueId;n.userData.kind=s?.kind;return [r.UniqueId,n];}));
      current={soil:new Substrate(settings,soil),save:{Tank:{Hardscape:records}},entities,habitat};
      if(moveId)probe=await createHardscapeMoveProbe(current,moveId);
    }
    const start=performance.now(),result=probe.solve(data.point,current);
    self.postMessage({...result,...(!moveId?{position:probe.node.position.toArray(),quaternion:probe.node.quaternion.toArray()}:{}),solveMs:performance.now()-start});
  } catch(e){self.postMessage({error:e.message});}
};
