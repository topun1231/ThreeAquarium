import * as T from 'three';
import {peerDepth} from './habitat.js';
import {swayFloraPoint} from './flora-view.js';
const clamp=T.MathUtils.clamp;
const identityMatrix=new T.Matrix4();
export function importedFlow(branch,weights,m){
 const {phase,motion}=m;
 let at,branchPhase,leafPhase,globalX,globalZ,branchX,branchZ,leafY;
 return (p,index,time)=>{
  const offset=index*4, b=branch[offset+2], leaf=branch[offset+3], tick=time!==at;
  if(m.lowGrass>.5){
   if(tick || b!==branchPhase){
    const phaseLocal=phase+b;
    branchX=Math.sin(time*.58+phaseLocal)*.0016+Math.sin(time*.31+phaseLocal*.7)*.00045;
    branchZ=Math.sin(time*.46+phaseLocal+.8);
   }
   const sway=motion*weights[offset];
   p.x+=sway*branchX; p.z+=sway*branchZ*.0011;
  }else{
   // A whole shoot shares the current; neighbouring leaf vertices also share their branch phase.
   if(tick){
    globalX=Math.sin(time*.64+phase)*.0038+Math.sin(time*.39+phase)*.0012;
    globalZ=Math.sin(time*.48+.9+phase);
   }
   if(tick || b!==branchPhase){
    branchX=Math.sin(time*.55+b+phase);branchZ=Math.sin(time*.42+b+phase);
   }
   if(tick || leaf!==leafPhase)leafY=Math.sin(time*.81+leaf+phase);
   const h=clamp((p.y-.025)/.4,0,1), global=h*h, local=clamp((p.y-branch[offset])/.23,0,1)**2*branch[offset+1];
   p.x+=motion*(global*globalX+local*branchX*.0025);
   p.z+=motion*(global*globalZ*.002+local*branchZ*.0014);
   p.y+=motion*m.leaf*weights[offset+2]*weights[offset+2]*h*leafY*.0008;
  }
  at=time;branchPhase=b;leafPhase=leaf;
  return p;
 };
}
export function flowPoint(p,branch,weights,m,time,offset=0){
 return importedFlow(branch,weights,m)(p,offset/4,time);
}
const swayWeight=(y,rootY,height)=>clamp(Math.max(0,y-rootY)/height,0,1.6)**2;
function shootWind(wind,stem,sway,time){
 wind.set(stem[0],stem[1]+sway.height,stem[2]);swayFloraPoint(wind,stem,sway,time);
 wind.x-=stem[0];wind.z-=stem[2];
}
export function floraFlow(stems,sways){
 const last=new Float64Array(7).fill(NaN),wind=new T.Vector3();let rootY=0,height=1;
 return (point,index,time)=>{
  const a=stems.array,o=index*4,amplitude=sways.getX(index),h=sways.getY(index);
  if(last[0]!==time||last[1]!==a[o]||last[2]!==a[o+1]||last[3]!==a[o+2]||last[4]!==a[o+3]||last[5]!==amplitude||last[6]!==h){
   last.set([time,a[o],a[o+1],a[o+2],a[o+3],amplitude,h]);rootY=a[o+1];height=h;
   // Every vertex in an authored plant shares this flow; only the height weight varies.
   shootWind(wind,a.subarray(o,o+4),{amplitude,height},time);
  }
  const weight=swayWeight(point.y,rootY,height);point.x+=wind.x*weight;point.z+=wind.z*weight;return point;
 };
}
// Collision mesh parts are concatenated by shoot. Their rest heights and sway weights stay fixed until a rebuild.
function prepareFloraSurface(surface){
 const {position,floraStem,floraSway}=surface.source.attributes;
 const stems=floraStem.array,sways=floraSway.array,runs=[],weights=new Float64Array(position.count);
 for(let i=0;i<position.count;i++){
  const k=i*4,j=i*2;
  if(!i || stems[k]!==stems[k-4] || stems[k+1]!==stems[k-3] || stems[k+2]!==stems[k-2] ||
     stems[k+3]!==stems[k-1] || sways[j]!==sways[j-2] || sways[j+1]!==sways[j-1]){
   runs.push({stem:stems.subarray(k,k+4),amplitude:sways[j],height:sways[j+1],end:i});
  }
  runs[runs.length-1].end=i+1;
  weights[i]=swayWeight(position.getY(i),stems[k+1],sways[j+1]);
 }
 const vertex=new T.Vector3(),wind=new T.Vector3();
 return time=>{
  const out=surface.geo.attributes.position,identity=surface.transform.equals(identityMatrix);
  const source=position.array,target=out.array;
  const packed=identity && position.isBufferAttribute && out.isBufferAttribute &&
   source instanceof Float32Array && target instanceof Float32Array &&
   position.itemSize===3 && out.itemSize===3 && !position.normalized && !out.normalized;
  let i=0;
  for(const run of runs){
   shootWind(wind,run.stem,run,time);
   if(packed){
    for(;i<run.end;i++){
     const offset=i*3,weight=weights[i];
     target[offset]=source[offset]+wind.x*weight;
     target[offset+1]=source[offset+1];
     target[offset+2]=source[offset+2]+wind.z*weight;
    }
    continue;
   }
   for(;i<run.end;i++){
    vertex.set(position.getX(i)+wind.x*weights[i],position.getY(i),position.getZ(i)+wind.z*weights[i]);
    if(!identity)vertex.applyMatrix4(surface.transform);
    out.setXYZ(i,vertex.x,vertex.y,vertex.z);
   }
  }
 };
}
function treeCoversAllPositions(geo){
 const {index,drawRange,groups,attributes:{position}}=geo;
 if(!index?.count||groups.length||drawRange.start!==0||drawRange.count<index.count||geo.morphAttributes.position||!(position.array instanceof Float32Array))return false;
 const used=new Uint8Array(position.count);
 for(const i of index.array)used[i]=1;
 return !used.includes(0);
}
export class PlantContacts {
 constructor(){this.next=0;this.world=null;this.rest=new WeakMap();this.floraSurfaces=new WeakMap();}
 update(world,aq,time){
  if(this.world!==world){
   this.world=world;this.next=0;this.rest=new WeakMap();this.ownerAnchors=null;
  }
  if(time<this.next)return;this.next=time+.1;
  const vertex=new T.Vector3();
  for(const s of world.habitat.surfaces){if(s.kind!==3)continue;if(!s.source){const d=aq.pack.draws.find(d=>d.node===s.node);if(!d)continue;s.source=aq.geometries[d.geo];s.material=aq.materials[d.materials[0]].userData.source;}
   if(!s.material||s.material.leaf<0||!s.material.motion)continue;const active=world.agents.filter(a=>s.box.distanceToPoint(a.position)<.045*(a.scale||1)||world.anchors[a.route[0]]?.owner===s.owner);if(!active.length)continue;
   const p=s.source.attributes.position,branch=s.source.attributes.branchData,weights=s.source.attributes.plantWeights;const stems=s.source.attributes.floraStem,sways=s.source.attributes.floraSway;if(!stems&&(!branch||!weights))continue;
   const flow=stems?floraFlow(stems,sways):importedFlow(branch.array,weights.array,s.material);
   let anchors=this.rest.get(s);
   if(!anchors){
    if(!this.ownerAnchors){
     this.ownerAnchors=new Map();
     for(const a of world.anchors){
      if(!this.ownerAnchors.has(a.owner))this.ownerAnchors.set(a.owner,[]);
      this.ownerAnchors.get(a.owner).push(a);
     }
    }
    const inverse=s.transform.clone().invert();
    anchors=(this.ownerAnchors.get(s.owner)??[]).filter(a=>s.box.distanceToPoint(a.position)<.006).map(a=>{
     const local=a.position.clone().applyMatrix4(inverse);
     let index=0,distance=Infinity;
     for(let i=0;i<p.count;i++){const d=local.distanceToSquared(vertex.fromBufferAttribute(p,i));if(d<distance){distance=d;index=i;}}
     if(s.flowTime!==undefined){
      const rest=new T.Vector3().fromBufferAttribute(p,index);
      local.sub(flow(rest.clone(),index,s.flowTime).sub(rest));
     }
     return {a,local,index};
    });
    this.rest.set(s,anchors);
   }
   if(stems){
    let update=this.floraSurfaces.get(s);
    if(!update){update=prepareFloraSurface(s);this.floraSurfaces.set(s,update);}
    update(time);
   }else{
    const out=s.geo.attributes.position;for(let i=0;i<p.count;i++){const v=flow(vertex.fromBufferAttribute(p,i),i,time).applyMatrix4(s.transform);out.setXYZ(i,v.x,v.y,v.z);}
   }
   s.bvh.refit();
   // Pruning can leave unused vertices; those still count toward the proximity box.
   s.treeCoversPositions??=treeCoversAllPositions(s.geo);
   if(s.treeCoversPositions)s.bvh.getBoundingBox(s.geo.boundingBox);
   else s.geo.computeBoundingBox();
   s.box=s.geo.boundingBox;s.flowTime=time;
   for(const entry of anchors){const {a,local,index}=entry;a.position.copy(flow(local.clone(),index,time).applyMatrix4(s.transform));}
   for(const a of active){if(a.route.length||a.swim||world.anchors[a.at].owner!==s.owner)continue;const anchor=world.anchors[a.at],pose=world.habitat.support(anchor.position,anchor.normal,a.rotation,a.scale);if(pose&&world.habitat.traverse(a.position,a.rotation,pose.position,pose.rotation,a.scale)&&world.agents.every(o=>o===a||peerDepth(pose.position,pose.rotation,o,a.scale)<=.0003)){a.position.copy(pose.position);a.rotation.slerp(pose.rotation,.3);world.sync(a);}}
  }
 }
}
