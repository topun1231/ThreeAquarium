import {MeshBVH} from 'three-mesh-bvh';
import {reconnectGraphInBackground} from './habitat.js';

export function createColliderBuilder(signal,concurrency=1){
 if(typeof Worker==='undefined')return null;
 if(concurrency===1)return createColliderWorker(signal);
 const workers=Array.from({length:concurrency},()=>createColliderWorker(signal));
 let next=0;
 return {
  concurrency,
  build(geo,options){const worker=workers[next];next=(next+1)%workers.length;return worker.build(geo,options);},
  dispose(){for(const worker of workers)worker.dispose();},
 };
}

function createColliderWorker(signal){
 let worker,failed=false;
 const dispose=()=>{worker?.terminate();worker=null;};
 return {dispose,async build(geo,options){
  let abort, deadline;
  try{
   signal?.throwIfAborted();
   if(!failed){
    worker??=new Worker(new URL('./wallpaper-routes-worker.js',import.meta.url),{type:'module'});
    const tree=await new Promise((resolve,reject)=>{
     abort=()=>reject(signal.reason);
     signal?.addEventListener('abort',abort,{once:true});
     deadline=setTimeout(()=>reject(new Error('碰撞表面计算超时')),15000);
     worker.onmessage=({data})=>data.error?reject(new Error(data.error)):resolve(data.tree);
     worker.onerror=e=>reject(new Error(e.message||'碰撞表面计算中断'));
     worker.onmessageerror=()=>reject(new Error('碰撞表面结果读取失败'));
     // Keep the original buffers available for the exact local fallback.
     worker.postMessage({collider:{position:geo.attributes.position.array,index:geo.index.array,options}});
    });
    return MeshBVH.deserialize(tree,geo);
   }
  }catch(error){dispose();signal?.throwIfAborted();failed=true;}
  finally{clearTimeout(deadline);if(abort)signal?.removeEventListener('abort',abort);}
  return new MeshBVH(geo,options);
 }};
}

let workerLimit=3;
export async function connectWallpaperRoutes(habitat,anchors,signal,timeout=30000){
 signal?.throwIfAborted();
 if(typeof Worker==='undefined')return reconnectGraphInBackground(habitat,anchors,signal);
 const cores=globalThis.navigator?.hardwareConcurrency || 1;
 const count=Math.min(workerLimit,Math.max(1,Math.floor(cores/2)),Math.max(1,Math.floor(anchors.length/2000)));
 const workers=[];
 let abort, deadline;
 try{
  const surfaces=habitat.surfaces.map(s=>({
   kind:s.kind,owner:s.owner,min:s.box.min.toArray(),max:s.box.max.toArray(),
   position:s.geo.attributes.position.array,tree:MeshBVH.serialize(s.bvh,{cloneBuffers:false})
  }));
  const points=anchors.map(a=>({position:a.position.toArray(),normal:a.normal.toArray(),kind:a.kind,owner:a.owner,flora:a.flora}));
  // Interleave owners so one worker does not get all the densely planted anchors.
  const pending=Promise.all(Array.from({length:count},(_,i)=>new Promise((resolve,reject)=>{
   const worker=new Worker(new URL('./wallpaper-routes-worker.js',import.meta.url),{type:'module'});
   workers.push(worker);
   worker.onmessage=({data})=>data.error?reject(new Error(data.error)):resolve(data.routes);
   worker.onerror=e=>reject(new Error(e.message||'壁纸路线计算中断'));
   worker.onmessageerror=()=>reject(new Error('壁纸路线结果读取失败'));
   // Structured clone takes an independent snapshot. Transferring these live buffers would detach them.
   worker.postMessage({surfaces,points,start:i,stride:count});
  })));
  const interrupted=new Promise((_,reject)=>{
   deadline=setTimeout(()=>reject(new Error('壁纸路线计算超时')),timeout);
   abort=()=>reject(signal.reason);
   signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted)abort();
  });
  const parts=await Promise.race([pending,interrupted]);
  for(const [part,routes] of parts.entries()){
   for(const [i,route] of routes.entries())Object.assign(anchors[part+i*count],route);
  }
  if(parts.length>1){
   // Workers only emit forward edges. Restore the return paths after merging their rows.
   for(const [i,a] of anchors.entries())for(const j of a.edges)if(j>i)anchors[j].edges.push(i);
   for(const a of anchors)a.edges.sort((left,right)=>left-right);
  }
  return anchors;
 }catch(error){
  // A constrained host can retry the pending copy with just one geometry snapshot.
  if(count>1&&!signal?.aborted)workerLimit=1;
  throw error;
 }finally{clearTimeout(deadline);if(abort)signal?.removeEventListener('abort',abort);for(const worker of workers)worker.terminate();}
}
