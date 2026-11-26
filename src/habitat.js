import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {attributeArray} from './state.js';
import {bodyProxy} from './body-proxy.js';

// Simulation retains Unity coordinates; the display root alone mirrors Z.
export const vec=p=>Array.isArray(p)?new T.Vector3(...p):new T.Vector3(p.x,p.y,p.z);
export const up=new T.Vector3(0,1,0);
const walkProbeOffset=.025;
const proxyX=bodyProxy.map(p=>p.x),proxyY=bodyProxy.map(p=>p.y),radii=bodyProxy.map(p=>p.r);
const largestBodyRadius=Math.max(...radii);
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

export async function createHabitat(pack,buffer,onProgress=()=>{},reuse=null,dynamic=null,checkpoint,colliderBuilder){
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
 const largeCollider=item=>item.geometry.index.count>=300000;
 const concurrency=colliderBuilder?.concurrency??1;
 const threaded=colliderBuilder&&(concurrency===1||dynamic?.filter(largeCollider).length>1);
 const built=[],pending=[];
 async function finishColliders(){
  const failed=(await Promise.all(pending)).find(Boolean);
  pending.length=0;
  if(failed)throw failed.error;
 }
 try{for(const item of dynamic??[]){
  const pause=checkpoint?.();if(pause)await pause;
  const previous=reuse?.surfaces.find(s=>s.node===item.node&&s.source===item.geometry);
  const cached=!item.rebuild&&previous?.transform.equals(item.transform)&&previous;
  if(cached){surfaces.push(cached);continue;}
  const geo=new T.BufferGeometry();built.push(geo);geo.setAttribute('position',item.geometry.attributes.position.clone());geo.applyMatrix4(item.transform);geo.computeBoundingBox();
  const surface={...item,source:item.geometry,geo,box:geo.boundingBox};
  if(item.solid&&previous?.solid&&previous.transform.determinant()*item.transform.determinant()>0){
   // Copy the tree and its triangle order before refitting; an aborted edit must leave the live collider untouched.
   surface.bvh=MeshBVH.deserialize(MeshBVH.serialize(previous.bvh,{cloneBuffers:true}),geo);surface.bvh.refit();
  }else{
   geo.setIndex(item.geometry.index.clone());
   if(item.transform.determinant()<0){const idx=geo.index.array;for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];}
   // Swaying flora refits most branches at once. Larger leaves reduce that traversal.
   const options=item.flora?{targetLeafSize:24}:undefined;
   if(threaded && largeCollider(item)){
    const result=colliderBuilder.build(geo,options);
    if(concurrency>1){
     // Keep the input surface order so equally close contacts choose the same face as before.
     pending.push(result.then(bvh=>{surface.bvh=bvh;},error=>({error})));
     if(pending.length===concurrency)await finishColliders();
    }else surface.bvh=await result;
   }else surface.bvh=new MeshBVH(geo,options);
  }
  surfaces.push(surface);
 }if(pending.length)await finishColliders();
 }catch(error){if(pending.length)await Promise.all(pending);for(const geo of built)geo.dispose();throw error;}
 onProgress(`碰撞表面 ${surfaces.length} 处就绪`);return habitatQueries(surfaces);
}
export function habitatQueries(surfaces){
 const bodySurfaces=surfaces.filter(surface=>surface.kind!==3);
 const ray=new T.Ray(),tri=new T.Triangle(),segment=new T.Box3(),end=new T.Vector3();
 function normal(s,index){const ids=s.geo.index.array,p=s.geo.attributes.position;tri.a.fromBufferAttribute(p,ids[index*3]);tri.b.fromBufferAttribute(p,ids[index*3+1]);tri.c.fromBufferAttribute(p,ids[index*3+2]);return tri.getNormal(new T.Vector3());}
 function cast(origin,direction,length,ignorePlants=false,candidates=surfaces,result='contact',supportGap=0){
  ray.set(origin,direction);
  const bounded=Number.isFinite(length)&&Math.abs(direction.lengthSq()-1)<1e-7;
  if(bounded){
   end.copy(direction).multiplyScalar(length).add(origin);
   segment.set(origin,origin).expandByPoint(end).expandByScalar(1e-7);
  }
  let best=null,surface,far=length;
  for(const s of candidates){
   if((ignorePlants&&s.kind===3)||(bounded&&!segment.intersectsBox(s.box)))continue;
   const h=s.bvh.raycastFirst(ray,T.DoubleSide,0,far);
   if(h && result==='obstruction')return h;
   if(!h || (best && h.distance>=best.distance))continue;
   best=h;surface=s;
   if(result==='support' && bounded){
    const near=walkProbeOffset-supportGap;
    // Once a point is in the support band, only a surface in front of that band can invalidate it.
    if(h.distance<near-1e-7)return h;
    far=Math.min(far,h.distance+1e-7);
    if(h.distance>=near+1e-7 && h.distance<walkProbeOffset+supportGap-1e-7)far=Math.min(far,near+1e-7);
    end.copy(direction).multiplyScalar(far).add(origin);
    segment.set(origin,origin).expandByPoint(end).expandByScalar(1e-7);
   }
  }
  if(!best||result==='support'||result==='point')return best;
  const n=normal(surface,best.faceIndex);
  if(n.dot(direction)>0)n.negate();
  return {...best,normal:n,surface};
 }
 function closest(p,limit=.025,candidates=surfaces){let best=null;for(const s of candidates){if(s.box.distanceToPoint(p)>limit)continue;const h=s.bvh.closestPointToPoint(p,{},0,best?best.distance:limit);if(h&&h.distance<=limit&&(!best||h.distance<best.distance))best={...h,normal:normal(s,h.faceIndex),surface:s};}return best;}
 const centers=bodyProxy.map(()=>new T.Vector3()),bodyBox=new T.Box3();
 const insideDirection=new T.Vector3(.913,.271,.304).normalize();
 function depth(p,q,scale=1){
  const s=bodyScale(scale);let deepest=0;
  bodyBox.makeEmpty();
  for(let i=0;i<centers.length;i++){
   const c=centers[i].set(proxyX[i]*s,proxyY[i]*s,0).applyQuaternion(q).add(p),r=radii[i]*s;
   if(Math.abs(c.x)+r>.591||Math.abs(c.z)+r>.294||c.y+r>.58)return 1;
   bodyBox.expandByPoint(c);
  }
  bodyBox.expandByScalar(largestBodyRadius*s+1e-10);
  for(const surf of bodySurfaces){
   if(!bodyBox.intersectsBox(surf.box))continue;
   for(let i=0;i<centers.length;i++){
    const c=centers[i],r=radii[i]*s;
    if(surf.box.distanceToPoint(c)>r)continue;
    const near=surf.bvh.closestPointToPoint(c,{},0,r);if(near)deepest=Math.max(deepest,r-near.distance);
    if(surf.solid&&surf.box.containsPoint(c)){ray.set(c,insideDirection);const hit=surf.bvh.raycastFirst(ray,T.DoubleSide);if(hit&&normal(surf,hit.faceIndex).dot(insideDirection)>.001)deepest=Math.max(deepest,r+Math.min(.01,hit.distance));}
   }
  }return deepest;
 }
 function traverse(p,q,next,rotation,scale=1){const steps=Math.max(1,Math.ceil(p.distanceTo(next)/.001),Math.ceil(q.angleTo(rotation)/(Math.PI/18)));for(let i=1;i<=steps;i++)if(depth(p.clone().lerp(next,i/steps),q.clone().slerp(rotation,i/steps),scale)>.0003)return false;return true;}
 const supportBox=new T.Box3(),nearSupport=[];
 function support(point,hint,rotation,scale=1){
  const s=bodyScale(scale),samples=[-.001,.01,.02].map(x=>x*s);
  const points=samples.map(x=>new T.Vector3(x,0,0).applyQuaternion(rotation).add(point));
  let candidates=surfaces;
  if(Math.abs(hint.lengthSq()-1)<1e-7){
   // Each ray starts .023 above its sample and ends .025 below. Include the nearby-leaf fallback as well.
   supportBox.setFromPoints(points).expandByScalar(.026*s+1e-7);
   nearSupport.length=0;
   for(const surface of surfaces)if(supportBox.intersectsBox(surface.box))nearSupport.push(surface);
   candidates=nearSupport;
  }
  const down=hint.clone().negate();
  const hits=points.map(sample=>{
   let h=cast(sample.clone().addScaledVector(hint,.023*s),down,.048*s,false,candidates);
   if(!h||h.point.distanceTo(sample)>.004*s){
    const near=closest(sample,.002*s,candidates);
    if(near?.surface.flora){h=near;if(h.normal.dot(hint)<0)h.normal.negate();}
   }
   return h&&h.point.distanceTo(sample)<.02*s?h:null;
  });
  if(!hits.some(Boolean))return null;let n=new T.Vector3();for(const h of hits)if(h)n.add(h.normal);n.normalize();let axis=new T.Vector3(1,0,0).applyQuaternion(rotation).projectOnPlane(n).normalize();
  if(hits[0]&&hits[2]){const chord=hits[2].point.clone().sub(hits[0].point);if(chord.lengthSq()>.000064*s*s&&chord.clone().normalize().dot(axis)>.55){axis=chord.normalize();n.projectOnPlane(axis).normalize();}}
  const lift=.0014*s,q=face(axis.negate(),n),i=hits[1]?1:hits[0]?0:2,p=hits[i].point.clone().addScaledVector(n,lift).sub(new T.Vector3(samples[i],0,0).applyQuaternion(q));
  hits.forEach((h,j)=>{if(!h)return;const foot=new T.Vector3(samples[j],0,0).applyQuaternion(q).add(p),gap=foot.sub(h.point).dot(h.normal);if(gap<lift)p.addScaledVector(n,lift-gap);});
  if(p.distanceTo(point)>.028)return null;
  for(let k=0;k<5;k++){const d=depth(p,q,s);if(d<=.0003)return {position:p,rotation:q,normal:n};if(d>.005)return null;p.addScaledVector(n,d+.0001);}return null;
 }
 return {surfaces,cast,closest,depth,traverse,support};
}
export function buildGraph(habitat,food){
 const anchors=[];
 for(const f of food){const h=habitat.closest(vec(f.Position),.018);if(!h||h.normal.y<-.25)continue;
  const position=h.point.clone(),normal=h.normal,kind=h.surface.kind;if(anchors.some(a=>a.position.distanceToSquared(position)<.00012))continue;
  anchors.push({position,normal,kind,owner:h.surface.owner,food:f.Value,edges:[]});
 }
 return reconnectGraph(habitat,anchors);
}
const cellSize=.05; // Wider than the longest legal step (.042).
function routeCells(anchors){
 const cells=new Map();
 for(const [i,a] of anchors.entries()){
  const x=Math.floor(a.position.x/cellSize),z=Math.floor(a.position.z/cellSize),key=x+','+z;
  if(!cells.has(key))cells.set(key,[]);
  cells.get(key).push(i);
 }
 return cells;
}
function routeProbeSurfaces(habitat,anchors){
 // Cover probes reach .009 + .065; the shorter edge and support probes also stay within .08.
 const local=habitat.surfaces && anchors.every(a=>!(a.normal.lengthSq()>1.00001));
 return position=>local ? habitat.surfaces.filter(s=>s.box.distanceToPoint(position)<=.08) : undefined;
}
function traversableEdge(habitat,a,b,pa,nearby){
 const {position,normal}=a,same=a.owner===b.owner,flora=a.flora||b.flora;
 if(position.distanceTo(b.position)>(same ? .042 : .030)||
    normal.dot(b.normal)<(same ? (flora ? -.9 : .25) : -.15))return false;
 const line=b.position.clone().addScaledVector(b.normal,.009).sub(pa);
 if(habitat.cast(pa,line.clone().normalize(),line.length(),!!flora,nearby,'obstruction'))return false;
 const gap=flora&&(a.kind===0||b.kind===0) ? .02 : .014;
 for(let k=1;k<=3;k++){
  const t=k*.25,p=position.clone().lerp(b.position,t),n=normal.clone().lerp(b.normal,t).normalize();
  const h=habitat.cast(p.clone().addScaledVector(n,walkProbeOffset),n.clone().negate(),.044,false,nearby,'support',gap);
  if(h&&h.point.distanceTo(p)<=gap)continue;
  const near=flora&&same ? habitat.closest(p,.002,nearby) : null;
  if(!near||near.surface.owner!==a.owner)return false;
 }
 return true;
}
export function groundConnections(habitat,anchors){
 const cells=routeCells(anchors),probe=routeProbeSurfaces(habitat,anchors),cache=new Map();
 function hasEdge(i){
  const {position}=anchors[i],x=Math.floor(position.x/cellSize),z=Math.floor(position.z/cellSize);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const j of cells.get((x+dx)+','+(z+dz))||[]){
   if(i===j)continue;
   // Match the live graph's probe direction across cell boundaries.
   const a=anchors[Math.min(i,j)],b=anchors[Math.max(i,j)];
   if(traversableEdge(habitat,a,b,a.position.clone().addScaledVector(a.normal,.009),probe(a.position)))return true;
  }
  return false;
 }
 return i=>{
  if(!cache.has(i))cache.set(i,hasEdge(i));
  return cache.get(i);
 };
}
function* graphRows(habitat,anchors,start,end,stride,slice=0){
 const partial=start!==0||end!==anchors.length||stride!==1;
 const cells=routeCells(anchors),probe=routeProbeSurfaces(habitat,anchors);
 const directions=[new T.Vector3(1,0,0),new T.Vector3(-1,0,0),new T.Vector3(0,0,1),new T.Vector3(0,0,-1),up];
 for(const a of anchors)a.edges=[];
 let deadline=slice?performance.now()+slice:0;
 for(let i=start;i<end;i+=stride){
  const a=anchors[i],{position,normal}=a,x=Math.floor(position.x/cellSize),z=Math.floor(position.z/cellSize);
  const nearby=probe(position);
  const pa=position.clone().addScaledVector(normal,.009);
  a.zone=(position.x<-.2?'Left':position.x<.15?'Centre':'Right')+(position.z<0?'Front':'Rear');let cover=a.kind===3?.48:0;
  for(const d of directions)if(habitat.cast(pa,d,.065,false,nearby,'obstruction'))cover+=.18;
  a.cover=Math.min(1,cover);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const j of cells.get((x+dx)+','+(z+dz))||[]){
   if(j<=i)continue;
   const b=anchors[j];
   if(traversableEdge(habitat,a,b,pa,nearby)){a.edges.push(j);if(!partial)b.edges.push(i);}
  }
  if(deadline && performance.now()>=deadline){yield;deadline=performance.now()+slice;}
 }
 // Route ties follow the original anchor order regardless of which cell held the neighbour.
 for(const a of anchors)a.edges.sort((left,right)=>left-right);
 return anchors;
}
export function reconnectGraph(habitat,anchors,start=0,end=anchors.length,stride=1){
 return graphRows(habitat,anchors,start,end,stride).next().value;
}
export async function reconnectGraphInBackground(habitat,anchors,signal){
 signal?.throwIfAborted();
 for(const _ of graphRows(habitat,anchors,0,anchors.length,1,8)){
  await new Promise(resolve=>setTimeout(resolve,0));
  signal?.throwIfAborted();
 }
 return anchors;
}
export function paths(anchors,start,range=Infinity,available,destination){
 const costs=new Map([[start,0]]),previous=new Map(),queue=[start];
 const expanded=new Float64Array(anchors.length);
 for(let i=0;i<queue.length;i++){
  const here=queue[i],cost=costs.get(here);
  // Several cheaper arrivals can queue the same anchor before it expands at its latest cost.
  if(cost>=range || (cost>0 && expanded[here]===cost))continue;
  expanded[here]=cost;
  const {edges,position}=anchors[here];
  for(const next of edges){
   if(available && !available(here,next))continue;
   const distance=cost+position.distanceTo(anchors[next].position),best=costs.get(next);
   if(distance>=range || (best!==undefined && distance+.0001>=best))continue;
   costs.set(next,distance);previous.set(next,here);queue.push(next);
   // After a detour reaches its target, only a cheaper route can replace it.
   if(next===destination)range=distance;
  }
 }
 return {costs,previous};
}
export function route(previous,start,end){const result=[];for(let n=end;n!==start;n=previous.get(n)){if(!previous.has(n))return [];result.unshift(n);if(result.length>previous.size)return [];}return result;}
export function nearest(anchors,p){let at=-1,dist=Infinity;anchors.forEach((a,i)=>{const d=a.position.distanceToSquared(p);if(a.edges.length&&d<dist){dist=d;at=i;}});return at;}
