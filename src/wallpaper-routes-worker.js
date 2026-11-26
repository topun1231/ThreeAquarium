import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {habitatQueries,reconnectGraph,vec} from './habitat.js';

self.onmessage=({data})=>{
 try{
  if(data.collider){
   const {position,index,options}=data.collider,geo=new T.BufferGeometry();
   geo.setAttribute('position',new T.BufferAttribute(position,3));
   geo.setIndex(new T.BufferAttribute(index,1));
   // The caller already has the world vertices. Only the tree and reordered faces need to return.
   const tree=MeshBVH.serialize(new MeshBVH(geo,options),{cloneBuffers:false});
   self.postMessage({tree},[tree.index.buffer,...tree.roots]);
   return;
  }
  const surfaces=data.surfaces.map(({kind,owner,min,max,position,tree})=>{
   const geo=new T.BufferGeometry();
   geo.setAttribute('position',new T.BufferAttribute(position,3));
   const bvh=MeshBVH.deserialize(tree,geo);
   return {kind,owner,geo,bvh,box:new T.Box3(vec(min),vec(max))};
  });
  const anchors=data.points.map(a=>({...a,position:vec(a.position),normal:vec(a.normal)}));
  const {start,stride}=data;
  reconnectGraph(habitatQueries(surfaces),anchors,start,anchors.length,stride);
  const routes=[];
  for(let i=start;i<anchors.length;i+=stride){
   const {zone,cover,edges}=anchors[i];
   routes.push({zone,cover,edges});
  }
  self.postMessage({routes});
 }catch(error){self.postMessage({error:error.message});}
};
