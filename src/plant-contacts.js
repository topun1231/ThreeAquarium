import * as T from 'three';
import {peerDepth} from './habitat.js';
const clamp=T.MathUtils.clamp;
export function flowPoint(p,b,w,m,time){const t=time,phase=m.phase,motion=m.motion,h=clamp((p.y-.025)/.4,0,1),global=h*h,local=clamp((p.y-b[0])/.23,0,1)**2*b[1];
 if(m.lowGrass>.5){const phaseLocal=phase+b[2];p.x+=motion*w[0]*(Math.sin(t*.58+phaseLocal)*.0016+Math.sin(t*.31+phaseLocal*.7)*.00045);p.z+=motion*w[0]*Math.sin(t*.46+phaseLocal+.8)*.0011;}
 else {p.x+=motion*(global*(Math.sin(t*.64+phase)*.0038+Math.sin(t*.39+phase)*.0012)+local*Math.sin(t*.55+b[2]+phase)*.0025);p.z+=motion*(global*Math.sin(t*.48+.9+phase)*.002+local*Math.sin(t*.42+b[2]+phase)*.0014);p.y+=motion*m.leaf*w[2]*w[2]*h*Math.sin(t*.81+b[3]+phase)*.0008;}return p;
}
export class PlantContacts {
 constructor(){this.next=0;this.world=null;this.rest=new WeakMap();this.anchorRest=new WeakMap();}
 update(world,aq,time){if(this.world!==world){this.world=world;this.next=0;this.rest=new WeakMap();}if(time<this.next)return;this.next=time+.1;
  for(const s of world.habitat.surfaces){if(s.kind!==3)continue;if(!s.source){const d=aq.pack.draws.find(d=>d.node===s.node);if(!d)continue;s.source=aq.geometries[d.geo];s.material=aq.materials[d.materials[0]].userData.source;}
   if(!s.material||s.material.leaf<0||!s.material.motion)continue;const active=world.agents.filter(a=>s.box.distanceToPoint(a.position)<.045||world.anchors[a.route[0]]?.owner===s.owner);if(!active.length)continue;
   const p=s.source.attributes.position,branch=s.source.attributes.branchData,weights=s.source.attributes.plantWeights;if(!branch||!weights)continue;
   let anchors=this.rest.get(s);if(!anchors){const inverse=s.transform.clone().invert();anchors=world.anchors.filter(a=>a.owner===s.owner&&s.box.distanceToPoint(a.position)<.006).map(a=>{const local=a.position.clone().applyMatrix4(inverse);let index=0,distance=Infinity;for(let i=0;i<p.count;i++){const d=local.distanceToSquared(new T.Vector3().fromBufferAttribute(p,i));if(d<distance){distance=d;index=i;}}if(s.flowTime!==undefined){const b=Array.from(branch.array.subarray(index*4,index*4+4)),w=Array.from(weights.array.subarray(index*4,index*4+4)),rest=new T.Vector3().fromBufferAttribute(p,index);local.sub(flowPoint(rest.clone(),b,w,s.material,s.flowTime).sub(rest));}return {a,local,index,normal:a.normal.clone()};});this.rest.set(s,anchors);}
   const out=s.geo.attributes.position;for(let i=0;i<p.count;i++){const b=Array.from(branch.array.subarray(i*4,i*4+4)),w=Array.from(weights.array.subarray(i*4,i*4+4)),v=flowPoint(new T.Vector3().fromBufferAttribute(p,i),b,w,s.material,time).applyMatrix4(s.transform);out.setXYZ(i,v.x,v.y,v.z);}s.geo.computeBoundingBox();s.box=s.geo.boundingBox;s.bvh.refit();s.flowTime=time;
   for(const entry of anchors){const {a,local,index}=entry,b=Array.from(branch.array.subarray(index*4,index*4+4)),w=Array.from(weights.array.subarray(index*4,index*4+4));a.position.copy(flowPoint(local.clone(),b,w,s.material,time).applyMatrix4(s.transform));}
   for(const a of active){if(a.route.length||a.swim||world.anchors[a.at].owner!==s.owner)continue;const anchor=world.anchors[a.at],pose=world.habitat.support(anchor.position,anchor.normal,a.rotation);if(pose&&world.habitat.traverse(a.position,a.rotation,pose.position,pose.rotation)&&world.agents.every(o=>o===a||peerDepth(pose.position,pose.rotation,o)<=.0003)){a.position.copy(pose.position);a.rotation.slerp(pose.rotation,.3);world.sync(a);}}
  }
 }
}
