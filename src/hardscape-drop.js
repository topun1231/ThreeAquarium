import * as T from 'three';
import {rotation,isMissingLegacyHardscape} from './tank-runtime.js';

let worker,requestId=0,warmTimer;
const requests=new Map();
const geometryCache=new WeakMap();
const pose=r=>new T.Matrix4().compose(new T.Vector3(r.Position.x,r.Position.y,r.Position.z),rotation(r.Rotation),new T.Vector3(1,1,1));

function requestDrop(input,signal,onFrame){
  signal?.throwIfAborted();
  if(!worker){
    worker=new Worker(new URL('./drop-worker.js',import.meta.url),{type:'module'});
    const active=worker;
    worker.onmessage=({data})=>{
      const request=requests.get(data.request);if(!request)return;
      try{if(data.error)throw Error(data.error);if(!data.warm)request.onFrame?.(data);if(data.done)request.finish(null,data.poses);}
      catch(e){stopDrop(e);}
    };
    worker.onerror=e=>{if(worker===active)stopDrop(Error(e.message||'物理模拟中断'));};
    worker.onmessageerror=()=>{if(worker===active)stopDrop(Error('物理结果传输失败'));};
  }
  return new Promise((resolve,reject)=>{
    const id=++requestId,abort=()=>stopDrop(new DOMException('已取消下落','AbortError'));
    // A blocked physics step cannot advance simulation time or run a worker-side timeout.
    const deadline=setTimeout(()=>stopDrop(Error('木石下落计算超时，本次操作已还原；请换个位置重试')),15000);
    const finish=(error,result)=>{clearTimeout(deadline);requests.delete(id);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
    requests.set(id,{finish,onFrame});signal?.addEventListener('abort',abort,{once:true});
    try{
    const sent=new Set(),buffers=[input.ground.heights.buffer],bodies=input.bodies.map(body=>{
      if(sent.has(body.key))return {...body,meshes:undefined};
      sent.add(body.key);
      const meshes=body.meshes.map(m=>({vertices:m.vertices.slice(),indices:m.indices.slice()}));
      for(const mesh of meshes)buffers.push(mesh.vertices.buffer,mesh.indices.buffer);
      return {...body,meshes};
    });
    worker.postMessage({...input,bodies,request:id},buffers);
    }catch(e){stopDrop(e);}
  });
}
function stopDrop(error){
  worker?.terminate();worker=null;
  for(const request of [...requests.values()])request.finish(error);
}

export function queueHardscapeDrop(runtime,record,moving){
  clearTimeout(warmTimer);
  warmTimer=setTimeout(()=>prewarmHardscapeDrop(runtime,record,moving).catch(()=>{}),80);
}
export async function prewarmHardscapeDrop(runtime,record,moving=true){
  clearTimeout(warmTimer);
  if([...requests.values()].some(r=>r.onFrame))return Promise.resolve();
  if(requests.size)stopDrop(new DOMException('物理准备已更换','AbortError'));
  const records=runtime.current.save.Tank.Hardscape.map(r=>r.UniqueId===record.UniqueId?record:r);
  if(!moving){if(records.length>=24)return Promise.resolve();records.push(record);}
  const entries=dropGeometry(runtime,records);
  return requestDrop({...dropInput(entries,runtime.current,record.UniqueId),warm:true});
}

// Hover only chooses a release position; gravity decides the final resting pose.
export function releasePose(node,record,point,current,moving=false) {
  node.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(node),center=box.getCenter(new T.Vector3());
  const dx=point.x-(moving?record.Position.x:center.x),dz=point.z-(moving?record.Position.z:center.z);
  box.translate(new T.Vector3(dx,0,dz));
  if(box.min.x<-.597||box.max.x>.597||box.min.z<-.297||box.max.z>.297)return {valid:false,reason:'木石超出缸壁，请往里移动'};
  let floor=current.soil.sample(point.x,point.z)+current.soil.crest(point.x,point.z);
  for(let i=0;i<current.soil.h.length;i++){
    const p=current.soil.point(i);
    if(p.x>=box.min.x&&p.x<=box.max.x&&p.z>=box.min.z&&p.z<=box.max.z)floor=Math.max(floor,current.soil.sample(p.x,p.z)+current.soil.crest(p.x,p.z));
  }
  for(const surface of current.habitat.surfaces) {
    if(!surface.solid||surface.owner.endsWith(record.UniqueId))continue;
    const b=surface.box;
    if(b.min.x<box.max.x&&b.max.x>box.min.x&&b.min.z<box.max.z&&b.max.z>box.min.z)floor=Math.max(floor,b.max.y);
  }
  const result=structuredClone(record);
  result.Position={x:record.Position.x+dx,y:record.Position.y+floor+.025-box.min.y,z:record.Position.z+dz};
  return {valid:true,record:result,reason:'点击释放 · 木石会自行下落 · Esc 取消'};
}

export function dropGeometry(runtime,records) {
  // Keep local geometry immutable; a committed tank gets its own cache.
  let sources=geometryCache.get(runtime.current);
  if(!sources){sources=new Map();geometryCache.set(runtime.current,sources);}
  // Legacy records absent from the rendered tank must not become invisible physics supports.
  return records.filter(record=>!isMissingLegacyHardscape(runtime,record)).map(record=>{
    const node=runtime.hardscape(record);node.updateMatrixWorld(true);
    const key=record.TypeId+JSON.stringify(record.Scale)+(runtime.entries.get(record.TypeId)?.legacy?record.UniqueId:'');
    const matrix=pose(record),inverse=matrix.clone().invert(),meshes=sources.get(key)||[];
    if(!sources.has(key))node.traverse(o=>{
      if(!o.isMesh||!o.geometry.index?.count)return;
      const geo=o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));
      if(inverse.clone().multiply(o.matrixWorld).determinant()<0){const a=geo.index.array;for(let i=0;i<a.length;i+=3)[a[i+1],a[i+2]]=[a[i+2],a[i+1]];}
      meshes.push({vertices:geo.attributes.position.array.slice(),indices:new Uint32Array(geo.index.array)});geo.dispose();
    });
    sources.set(key,meshes);
    const q=rotation(record.Rotation);
    return {record,node,matrix,inverse,body:{id:record.UniqueId,key,wood:node.userData.kind===2,position:[record.Position.x,record.Position.y,record.Position.z],rotation:{x:q.x,y:q.y,z:q.z,w:q.w},meshes}};
  });
}

function dropInput(entries,current,activeId,removedId){
  const soil=current.soil,heights=new Float32Array(soil.h.length);
  for(let x=0;x<soil.Columns;x++)for(let z=0;z<soil.Rows;z++){const p=soil.point(z*soil.Columns+x);heights[x*soil.Rows+z]=Math.max(soil.MinHeight,soil.sample(p.x,p.z)+soil.crest(p.x,p.z));}
  const boxes=new Map();
  for(const s of current.habitat.surfaces)if(s.solid){const id=s.owner.slice(3);if(!boxes.has(id))boxes.set(id,new T.Box3());boxes.get(id).union(s.box);}
  const wake=new Set(activeId?[activeId]:[]),removed=boxes.get(activeId||removedId),supports=removed?[removed]:[];
  for(const b of supports)for(const [id,box] of boxes)if(id!==removedId&&!wake.has(id)&&box.min.y>b.min.y+.002&&box.min.y<=b.max.y+.012&&box.max.x>b.min.x&&box.min.x<b.max.x&&box.max.z>b.min.z&&box.min.z<b.max.z){wake.add(id);supports.push(box);}
  return {bodies:entries.map(e=>e.body),ground:{heights,columns:soil.Columns,rows:soil.Rows,width:soil.Width,depth:soil.Depth},wake:[...wake]};
}

export async function animateHardscapeDrop({runtime,flora,aq,records,activeId,removedId,signal,onFrame}) {
  signal.throwIfAborted();clearTimeout(warmTimer);
  const entries=dropGeometry(runtime,records),input=dropInput(entries,runtime.current,activeId,removedId),wake=new Set(input.wake);
  const group=new T.Group();group.name='Falling hardscape';
  const hidden=[];
  for(const r of runtime.current.save.Tank.Hardscape){const n=runtime.current.entities.get(r.UniqueId);if(n){hidden.push([n,n.visible]);n.visible=false;}}
  for(const e of entries){e.local=e.node.matrix.clone();const old=runtime.current.save.Tank.Hardscape.find(r=>r.UniqueId===e.record.UniqueId);e.hostInverse=old?pose(old).invert():e.inverse;group.add(e.node);}
  aq.root.add(group);
  const attached=new Map((runtime.current.save.Tank.Flora||[]).filter(r=>r.Host).map(r=>[r.UniqueId,r.Host])),leaves=[];
  for(const entry of flora.meshes.values())entry.mesh.userData.owners.forEach((owner,i)=>{
    const host=attached.get(owner.id);if(!host)return;
    const m=new T.Matrix4();entry.mesh.getMatrixAt(i,m);
    leaves.push({entry,i,host,m,stem:new T.Vector3(entry.stems.getX(i),entry.stems.getY(i),entry.stems.getZ(i))});
  });
  let complete=false;
  const restore=()=>{
    group.removeFromParent();for(const [n,visible] of hidden)n.visible=visible;
    if(!complete)for(const l of leaves){l.entry.mesh.setMatrixAt(l.i,l.m);l.entry.stems.setXYZ(l.i,...l.stem.toArray());l.entry.mesh.instanceMatrix.needsUpdate=true;l.entry.stems.needsUpdate=true;}
  };
  const moveLeaves=deltas=>{
    for(const l of leaves){
      const d=deltas.get(l.host);
      if(d){l.entry.mesh.setMatrixAt(l.i,d.clone().multiply(l.m));l.entry.stems.setXYZ(l.i,...l.stem.clone().applyMatrix4(d).toArray());}
      else if(l.host===removedId)l.entry.mesh.setMatrixAt(l.i,new T.Matrix4().makeScale(0,0,0));
      l.entry.mesh.instanceMatrix.needsUpdate=true;l.entry.stems.needsUpdate=true;
    }
  };
  try {
    signal.throwIfAborted();
    moveLeaves(new Map(entries.map(e=>[e.record.UniqueId,e.matrix.clone().multiply(e.hostInverse)])));
    const byId=new Map(entries.map(e=>[e.record.UniqueId,e]));
    const final=await requestDrop(input,signal,data=>{
        const deltas=new Map();
        for(const p of data.poses){
          const e=byId.get(p.id),q=new T.Quaternion(p.rotation.x,p.rotation.y,p.rotation.z,p.rotation.w),m=new T.Matrix4().compose(new T.Vector3(...p.position),q,new T.Vector3(1,1,1)),delta=m.multiply(e.inverse);
          delta.clone().multiply(e.local).decompose(e.node.position,e.node.quaternion,e.node.scale);e.node.updateMatrixWorld(true);deltas.set(p.id,new T.Matrix4().compose(new T.Vector3(...p.position),q,new T.Vector3(1,1,1)).multiply(e.hostInverse));
        }
        moveLeaves(deltas);
        onFrame?.(data);
    });
    const result=records.map(record=>{
      if(!wake.has(record.UniqueId))return structuredClone(record);
      const p=final.find(p=>p.id===record.UniqueId),r=structuredClone(record);
      const e=new T.Euler().setFromQuaternion(new T.Quaternion(p.rotation.x,p.rotation.y,p.rotation.z,p.rotation.w),'YXZ');
      r.Position={x:p.position[0],y:p.position[1],z:p.position[2]};r.Rotation={x:e.x*180/Math.PI,y:e.y*180/Math.PI,z:e.z*180/Math.PI};return r;
    });
    return {records:result,dispose(committed=false){complete=committed;restore();}};
  }catch(e){restore();throw e;}
}
