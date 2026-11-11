import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {attributeArray} from './state.js';
import {bodyProxy} from './body-proxy.js';

// Simulation retains Unity coordinates; the display root alone mirrors Z.
export const vec=p=>Array.isArray(p)?new T.Vector3(...p):new T.Vector3(p.x,p.y,p.z);
export const up=new T.Vector3(0,1,0);
const proxyX=bodyProxy.map(p=>p.x),proxyY=bodyProxy.map(p=>p.y),radii=bodyProxy.map(p=>p.r);
const peerRadius=Math.max(...bodyProxy.map(p=>Math.hypot(p.x,p.y)+p.r)),peerCache=new WeakMap();
export const bodyScale=s=>Number.isFinite(s)&&s>0?s:1;
function cachedBodyPoints(p,q,scale){const s=bodyScale(scale),signature=[p.x,p.y,p.z,q.x,q.y,q.z,q.w,s],cached=peerCache.get(p);if(cached&&signature.every((v,i)=>v===cached.signature[i]))return cached.points;const points=bodyPoints(p,q,s);peerCache.set(p,{signature,points});return points;}
export function face(travel,normal){const x=travel.clone().projectOnPlane(normal);
 // Vertical travel has no tangent heading; keep a valid frame on the support plane.
 if(x.lengthSq()<1e-12)x.set(1,0,0).projectOnPlane(normal);
 if(x.lengthSq()<1e-12)x.set(0,0,1).projectOnPlane(normal);
 x.normalize().negate();const z=x.clone().cross(normal).normalize(),y=z.clone().cross(x);return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)).normalize();}
export const head=q=>new T.Vector3(-1,0,0).applyQuaternion(q);
export function bodyPoints(p,q,scale=1){const s=bodyScale(scale);return proxyX.map((x,i)=>new T.Vector3(x*s,proxyY[i]*s,0).applyQuaternion(q).add(p));}
export function bodyRadii(scale=1){const s=bodyScale(scale);return radii.map(r=>r*s);}
export function peerDepth(p,q,other,scale){const sa=bodyScale(scale),sb=bodyScale(other.scale);if(p.distanceToSquared(other.position)>(peerRadius*(sa+sb))**2)return 0;const a=cachedBodyPoints(p,q,sa),b=cachedBodyPoints(other.position,other.rotation,sb),ra=bodyRadii(sa),rb=bodyRadii(sb);let depth=0;for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const sum=ra[i]+rb[j],distance=a[i].distanceToSquared(b[j]);if(distance<sum*sum)depth=Math.max(depth,sum-Math.sqrt(distance));}return depth;}

export async function createHabitat(pack,buffer,onProgress=()=>{},reuse=null,dynamic=null){
 const matrices=[];
 function matrix(i){if(matrices[i])return matrices[i];const n=pack.nodes[i],m=new T.Matrix4().compose(vec(n.p),new T.Quaternion(...n.q),vec(n.s));return matrices[i]=n.parent<0?m:matrix(n.parent).clone().multiply(m);}
 const surfaces=[];
 for(const d of dynamic?[]:pack.draws){
  let owner=null;for(let n=d.node;n>=0;n=pack.nodes[n].parent){if(/^[WR]0 /.test(pack.nodes[n].name)){owner=pack.nodes[n].name;break;}}
  const name=pack.nodes[d.node].name,ground=name.startsWith('Deposited substrate'),plant=name==='Approved plant surface'||name==='BakedStemSkeleton'||name==='BakedIndividualLeaves';
  if(!owner&&!ground&&!plant)continue;
  if(plant)owner='Plant '+pack.nodes[d.node].parent;
  const transform=matrix(d.node),cached=reuse?.surfaces.find(s=>s.node===d.node&&s.transform.equals(transform));
  if(cached){surfaces.push(cached);continue;}
  const g=pack.geometries[d.geo],geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.BufferAttribute(attributeArray(buffer,g.position).slice(),3));geo.setIndex(new T.BufferAttribute(attributeArray(buffer,g.index).slice(),1));
  const idx=geo.index.array,pos=geo.attributes.position,norm=attributeArray(buffer,g.normal);let agreement=0;
  if(norm)for(let i=0;i<idx.length;i+=Math.max(3,Math.floor(idx.length/300)*3)){const a=new T.Vector3().fromBufferAttribute(pos,idx[i]),b=new T.Vector3().fromBufferAttribute(pos,idx[i+1]),c=new T.Vector3().fromBufferAttribute(pos,idx[i+2]);agreement+=b.sub(a).cross(c.sub(a)).dot(new T.Vector3().fromArray(norm,idx[i]*3));}
  if(agreement<0)for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
  geo.applyMatrix4(transform);if(transform.determinant()<0)for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
  geo.computeBoundingBox();surfaces.push({node:d.node,transform,owner:owner||'Aquarium living substrate',kind:ground?0:plant?3:owner.startsWith('W')?2:1,solid:!plant&&!ground,geo,bvh:new MeshBVH(geo),box:geo.boundingBox});
 }
 if(dynamic)for(const item of dynamic){
  const previous=reuse?.surfaces.find(s=>s.node===item.node&&s.source===item.geometry);
  const cached=!item.rebuild&&previous?.transform.equals(item.transform)&&previous;
  if(cached){surfaces.push(cached);continue;}
  const geo=new T.BufferGeometry();geo.setAttribute('position',item.geometry.attributes.position.clone());geo.applyMatrix4(item.transform);geo.computeBoundingBox();
  let bvh;
  if(item.solid&&previous?.solid&&previous.transform.determinant()*item.transform.determinant()>0){
   // Copy the tree and its triangle order before refitting; an aborted edit must leave the live collider untouched.
   bvh=MeshBVH.deserialize(MeshBVH.serialize(previous.bvh,{cloneBuffers:true}),geo);bvh.refit();
  }else{
   geo.setIndex(item.geometry.index.clone());
   if(item.transform.determinant()<0){const idx=geo.index.array;for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];}
   bvh=new MeshBVH(geo);
  }
  surfaces.push({...item,source:item.geometry,geo,bvh,box:geo.boundingBox});
 }
 const ray=new T.Ray(),tri=new T.Triangle();
 function normal(s,index){const ids=s.geo.index.array,p=s.geo.attributes.position;tri.a.fromBufferAttribute(p,ids[index*3]);tri.b.fromBufferAttribute(p,ids[index*3+1]);tri.c.fromBufferAttribute(p,ids[index*3+2]);return tri.getNormal(new T.Vector3());}
 function cast(origin,direction,length,ignorePlants=false){ray.set(origin,direction);let best=null;for(const s of surfaces){if(ignorePlants&&s.kind===3)continue;const h=s.bvh.raycastFirst(ray,T.DoubleSide,0,length);if(h&&(!best||h.distance<best.distance)){best={...h,normal:normal(s,h.faceIndex),surface:s};if(best.normal.dot(direction)>0)best.normal.negate();}}return best;}
 function closest(p,limit=.025){let best=null;for(const s of surfaces){if(s.box.distanceToPoint(p)>limit)continue;const h=s.bvh.closestPointToPoint(p,{},0,best?best.distance:limit);if(h&&h.distance<=limit&&(!best||h.distance<best.distance))best={...h,normal:normal(s,h.faceIndex),surface:s};}return best;}
 function depth(p,q,scale=1){const s=bodyScale(scale),rs=bodyRadii(s);let deepest=0;const centers=bodyPoints(p,q,s);for(let i=0;i<centers.length;i++){const c=centers[i];if(Math.abs(c.x)+rs[i]>.591||Math.abs(c.z)+rs[i]>.294||c.y+rs[i]>.58)return 1;
   for(const surf of surfaces){if(surf.kind===3||surf.box.distanceToPoint(c)>rs[i])continue;
    const near=surf.bvh.closestPointToPoint(c,{},0,rs[i]);if(near)deepest=Math.max(deepest,rs[i]-near.distance);
    if(surf.solid&&surf.box.containsPoint(c)){const direction=new T.Vector3(.913,.271,.304).normalize();ray.set(c,direction);const hit=surf.bvh.raycastFirst(ray,T.DoubleSide);if(hit&&normal(surf,hit.faceIndex).dot(direction)>.001)deepest=Math.max(deepest,rs[i]+Math.min(.01,hit.distance));}
   }
  }return deepest;
 }
 function traverse(p,q,next,rotation,scale=1){const steps=Math.max(1,Math.ceil(p.distanceTo(next)/.001),Math.ceil(q.angleTo(rotation)/(Math.PI/18)));for(let i=1;i<=steps;i++)if(depth(p.clone().lerp(next,i/steps),q.clone().slerp(rotation,i/steps),scale)>.0003)return false;return true;}
 function support(point,hint,rotation,scale=1){const s=bodyScale(scale),samples=[-.001,.01,.02].map(x=>x*s);const hits=samples.map(x=>{const sample=new T.Vector3(x,0,0).applyQuaternion(rotation).add(point);let h=cast(sample.clone().addScaledVector(hint,.023*s),hint.clone().negate(),.048*s);if(!h||h.point.distanceTo(sample)>.004*s){const near=closest(sample,.002*s);if(near?.surface.flora){h=near;if(h.normal.dot(hint)<0)h.normal.negate();}}return h&&h.point.distanceTo(sample)<.02*s?h:null;});
  if(!hits.some(Boolean))return null;let n=new T.Vector3();for(const h of hits)if(h)n.add(h.normal);n.normalize();let axis=new T.Vector3(1,0,0).applyQuaternion(rotation).projectOnPlane(n).normalize();
  if(hits[0]&&hits[2]){const chord=hits[2].point.clone().sub(hits[0].point);if(chord.lengthSq()>.000064*s*s&&chord.clone().normalize().dot(axis)>.55){axis=chord.normalize();n.projectOnPlane(axis).normalize();}}
  const lift=.0014*s,q=face(axis.negate(),n),i=hits[1]?1:hits[0]?0:2,p=hits[i].point.clone().addScaledVector(n,lift).sub(new T.Vector3(samples[i],0,0).applyQuaternion(q));
  hits.forEach((h,j)=>{if(!h)return;const foot=new T.Vector3(samples[j],0,0).applyQuaternion(q).add(p),gap=foot.sub(h.point).dot(h.normal);if(gap<lift)p.addScaledVector(n,lift-gap);});
  if(p.distanceTo(point)>.028)return null;
  for(let k=0;k<5;k++){const d=depth(p,q,s);if(d<=.0003)return {position:p,rotation:q,normal:n};if(d>.005)return null;p.addScaledVector(n,d+.0001);}return null;
 }
 onProgress(`碰撞表面 ${surfaces.length} 处就绪`);return {surfaces,cast,closest,depth,traverse,support};
}
export function buildGraph(habitat,food){
 const anchors=[];
 for(const f of food){const h=habitat.closest(vec(f.Position),.018);if(!h||h.normal.y<-.25)continue;
  const position=h.point.clone(),normal=h.normal,kind=h.surface.kind;if(anchors.some(a=>a.position.distanceToSquared(position)<.00012))continue;
  anchors.push({position,normal,kind,owner:h.surface.owner,food:f.Value,edges:[]});
 }
 return reconnectGraph(habitat,anchors);
}
export function reconnectGraph(habitat,anchors){
 for(const a of anchors){const {position,normal}=a;a.edges=[];a.zone=(position.x<-.2?'Left':position.x<.15?'Centre':'Right')+(position.z<0?'Front':'Rear');let cover=a.kind===3?.48:0;
  for(const d of [new T.Vector3(1,0,0),new T.Vector3(-1,0,0),new T.Vector3(0,0,1),new T.Vector3(0,0,-1),up])if(habitat.cast(position.clone().addScaledVector(normal,.009),d,.065))cover+=.18;
  a.cover=Math.min(1,cover);
 }
 for(let i=0;i<anchors.length;i++)for(let j=i+1;j<anchors.length;j++){const a=anchors[i],b=anchors[j],same=a.owner===b.owner,flora=a.flora||b.flora,d=a.position.distanceTo(b.position);if(d>(same?.042:.030)||a.normal.dot(b.normal)<(same?(flora?-.9:.25):-.15))continue;
  const pa=a.position.clone().addScaledVector(a.normal,.009),pb=b.position.clone().addScaledVector(b.normal,.009),line=pb.clone().sub(pa);if(habitat.cast(pa,line.clone().normalize(),line.length(),!!flora))continue;
  const gap=flora&&(a.kind===0||b.kind===0)?.02:.014;
  let valid=true;for(let k=1;k<=3;k++){const t=k*.25,p=a.position.clone().lerp(b.position,t),n=a.normal.clone().lerp(b.normal,t).normalize(),h=habitat.cast(p.clone().addScaledVector(n,.025),n.clone().negate(),.044);if(!h||h.point.distanceTo(p)>gap){const near=flora&&same?habitat.closest(p,.002):null;if(!near||near.surface.owner!==a.owner){valid=false;break;}}}
  if(valid){a.edges.push(j);b.edges.push(i);}
 }return anchors;
}
export function paths(anchors,start,range=Infinity,available=()=>true){const costs=new Map([[start,0]]),previous=new Map(),queue=[start];for(let i=0;i<queue.length;i++){const here=queue[i];for(const next of anchors[here].edges){if(!available(here,next))continue;const distance=costs.get(here)+anchors[here].position.distanceTo(anchors[next].position);if(distance>=range)continue;if(!costs.has(next)||distance+.0001<costs.get(next)){costs.set(next,distance);previous.set(next,here);queue.push(next);}}}return {costs,previous};}
export function route(previous,start,end){const result=[];for(let n=end;n!==start;n=previous.get(n)){if(!previous.has(n))return [];result.unshift(n);if(result.length>previous.size)return [];}return result;}
export function nearest(anchors,p){let at=-1,dist=Infinity;anchors.forEach((a,i)=>{const d=a.position.distanceToSquared(p);if(a.edges.length&&d<dist){dist=d;at=i;}});return at;}
