import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';

// Keep high-poly settling off the render thread; the visible model stays shared.
export async function createWorkerProbe(runtime,key,signal,moving=null) {
  await runtime.ensureCatalog();
  signal?.throwIfAborted();
  const node=runtime.hardscape(moving||{UniqueId:'placement-preview',TypeId:key,Position:{x:0,y:0,z:0},Rotation:{x:0,y:0,z:0},Scale:{x:1,y:1,z:1}});
  node.updateMatrixWorld(true);
  const model=[];if(!moving)node.traverse(o=>{if(o.isMesh&&o.geometry.index)model.push({position:o.geometry.attributes.position.array.slice(),index:o.geometry.index.array.slice(),matrix:o.matrixWorld.toArray()});});
  const worker=new Worker(new URL('./placement-worker.js',import.meta.url),{type:'module'});
  let pending=null,world=null,disposed=false,failure=null;
  const send=(message,transfer=[])=>new Promise((resolve,reject)=>{pending={resolve,reject};worker.postMessage(message,transfer);});
  worker.onmessage=({data})=>{const p=pending;pending=null;if(data.error)p?.reject(Error(data.error));else p?.resolve(data);};
  worker.onerror=e=>{failure=Error((e.message||'木石预览计算中断')+'（请重新选择木石重试）');dispose();};
  worker.addEventListener('messageerror',worker.onerror);
  function dispose(){disposed=true;worker.terminate();pending?.reject(failure||Error('预览已取消'));pending=null;signal?.removeEventListener('abort',dispose);}
  signal?.addEventListener('abort',dispose,{once:true});
  try{await send({init:true,key,moveId:moving?.UniqueId,kind:node.userData.kind,model,settings:runtime.settings},model.flatMap(m=>[m.position.buffer,m.index.buffer]));}catch(e){dispose();throw e;}
  const box=new T.Box3().setFromObject(node),center=box.getCenter(new T.Vector3());
  return {node,key,center,bottom:box.min.y,dispose,
    async solve(point,current){
      if(disposed)throw failure||Error('预览已取消');
      const message={point:{x:point.x,y:point.y,z:point.z}},transfer=[];
      if(world!==current){
        message.world={soil:current.soil.snapshot(),records:current.save.Tank.Hardscape,surfaces:current.habitat.surfaces.filter(s=>s.solid).map(s=>{
          const position=s.geo.attributes.position.array.slice(),serialized=moving?MeshBVH.serialize(s.bvh):null,index=serialized?.index||s.geo.index.array.slice();transfer.push(position.buffer,index.buffer,...(serialized?.roots||[]));
          if(serialized?.indirectBuffer)transfer.push(serialized.indirectBuffer.buffer);
          return {owner:s.owner,kind:s.kind,position,index,serialized};
        })};world=current;
      }
      try{return await send(message,transfer);}catch(e){world=null;throw e;}
    },
  };
}
