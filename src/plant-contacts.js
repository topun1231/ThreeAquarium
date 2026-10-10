import * as T from 'three';
import {peerDepth} from './habitat.js';
import {swayFloraPoint} from './flora-view.js';
const clamp=T.MathUtils.clamp;
export function flowPoint(p,b,w,m,time){const t=time,phase=m.phase,motion=m.motion,h=clamp((p.y-.025)/.4,0,1),global=h*h,local=clamp((p.y-b[0])/.23,0,1)**2*b[1];
 if(m.lowGrass>.5){const phaseLocal=phase+b[2];p.x+=motion*w[0]*(Math.sin(t*.58+phaseLocal)*.0016+Math.sin(t*.31+phaseLocal*.7)*.00045);p.z+=motion*w[0]*Math.sin(t*.46+phaseLocal+.8)*.0011;}
 else {p.x+=motion*(global*(Math.sin(t*.64+phase)*.0038+Math.sin(t*.39+phase)*.0012)+local*Math.sin(t*.55+b[2]+phase)*.0025);p.z+=motion*(global*Math.sin(t*.48+.9+phase)*.002+local*Math.sin(t*.42+b[2]+phase)*.0014);p.y+=motion*m.leaf*w[2]*w[2]*h*Math.sin(t*.81+b[3]+phase)*.0008;}return p;
}
export function floraFlow(stems,sways){
 const last=new Float64Array(7).fill(NaN),wind=new T.Vector3();let rootY=0,height=1;
 return (point,index,time)=>{
  const a=stems.array,o=index*4,amplitude=sways.getX(index),h=sways.getY(index);
  if(last[0]!==time||last[1]!==a[o]||last[2]!==a[o+1]||last[3]!==a[o+2]||last[4]!==a[o+3]||last[5]!==amplitude||last[6]!==h){
   last.set([time,a[o],a[o+1],a[o+2],a[o+3],amplitude,h]);rootY=a[o+1];height=h;
   // Every vertex in an authored plant shares this flow; only the height weight varies.
   wind.set(a[o],rootY+height,a[o+2]);swayFloraPoint(wind,a.subarray(o,o+4),{amplitude,height},time);wind.x-=a[o];wind.z-=a[o+2];
  }
  const weight=clamp(Math.max(0,point.y-rootY)/height,0,1.6)**2;point.x+=wind.x*weight;point.z+=wind.z*weight;return point;
 };
}
export class PlantContacts {
 constructor(){this.next=0;this.world=null;this.rest=new WeakMap();this.anchorRest=new WeakMap();}
 update(world,aq,time){if(this.world!==world){this.world=world;this.next=0;this.rest=new WeakMap();}if(time<this.next)return;this.next=time+.1;
  for(const s of world.habitat.surfaces){if(s.kind!==3)continue;if(!s.source){const d=aq.pack.draws.find(d=>d.node===s.node);if(!d)continue;s.source=aq.geometries[d.geo];s.material=aq.materials[d.materials[0]].userData.source;}
   if(!s.material||s.material.leaf<0||!s.material.motion)continue;const active=world.agents.filter(a=>s.box.distanceToPoint(a.position)<.045*(a.scale||1)||world.anchors[a.route[0]]?.owner===s.owner);if(!active.length)continue;
   const p=s.source.attributes.position,branch=s.source.attributes.branchData,weights=s.source.attributes.plantWeights;const stems=s.source.attributes.floraStem,sways=s.source.attributes.floraSway;if(!stems&&(!branch||!weights))continue;
   const flow=stems?floraFlow(stems,sways):(point,index,t)=>flowPoint(point,branch.array.subarray(index*4,index*4+4),weights.array.subarray(index*4,index*4+4),s.material,t),vertex=new T.Vector3();
   let anchors=this.rest.get(s);if(!anchors){const inverse=s.transform.clone().invert();anchors=world.anchors.filter(a=>a.owner===s.owner&&s.box.distanceToPoint(a.position)<.006).map(a=>{const local=a.position.clone().applyMatrix4(inverse);let index=0,distance=Infinity;for(let i=0;i<p.count;i++){const d=local.distanceToSquared(vertex.fromBufferAttribute(p,i));if(d<distance){distance=d;index=i;}}if(s.flowTime!==undefined){const rest=new T.Vector3().fromBufferAttribute(p,index);local.sub(flow(rest.clone(),index,s.flowTime).sub(rest));}return {a,local,index,normal:a.normal.clone()};});this.rest.set(s,anchors);}
   const out=s.geo.attributes.position;for(let i=0;i<p.count;i++){const v=flow(vertex.fromBufferAttribute(p,i),i,time).applyMatrix4(s.transform);out.setXYZ(i,v.x,v.y,v.z);}s.geo.computeBoundingBox();s.box=s.geo.boundingBox;s.bvh.refit();s.flowTime=time;
   for(const entry of anchors){const {a,local,index}=entry;a.position.copy(flow(local.clone(),index,time).applyMatrix4(s.transform));}
   for(const a of active){if(a.route.length||a.swim||world.anchors[a.at].owner!==s.owner)continue;const anchor=world.anchors[a.at],pose=world.habitat.support(anchor.position,anchor.normal,a.rotation,a.scale);if(pose&&world.habitat.traverse(a.position,a.rotation,pose.position,pose.rotation,a.scale)&&world.agents.every(o=>o===a||peerDepth(pose.position,pose.rotation,o,a.scale)<=.0003)){a.position.copy(pose.position);a.rotation.slerp(pose.rotation,.3);world.sync(a);}}
  }
 }
}
