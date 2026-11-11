import * as T from 'three';
const up=new T.Vector3(0,1,0),down=new T.Vector3(0,-1,0);
const bounds=surfaces=>surfaces.reduce((b,s)=>b.union(s.box),new T.Box3());
function supportOffset(centre,contacts){
 const points=[...contacts].sort((a,b)=>a.x-b.x||a.z-b.z),cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const half=list=>{const h=[];for(const p of list){while(h.length>1&&cross(h.at(-2),h.at(-1),p)<=0)h.pop();h.push(p);}return h;};
 const lower=half(points),upper=half([...points].reverse()),hull=lower.slice(0,-1).concat(upper.slice(0,-1));
 if(!hull.length)hull.push(points[0]);
 if(hull.length>2&&hull.every((p,i)=>cross(p,hull[(i+1)%hull.length],centre)>=-1e-10))return new T.Vector3();
 let offset=null;
 for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length],edge=new T.Vector3(b.x-a.x,0,b.z-a.z),from=new T.Vector3(centre.x-a.x,0,centre.z-a.z),t=edge.lengthSq()?T.MathUtils.clamp(from.dot(edge)/edge.lengthSq(),0,1):0,v=from.addScaledVector(edge,-t);if(!offset||v.lengthSq()<offset.lengthSq())offset=v;}
 return offset;
}
function inside(p,s){if(!s.box.containsPoint(p))return false;let votes=0;for(const axis of [[1,0,0],[0,1,0],[0,0,1]]){let count=0;for(const sign of [-1,1]){const dir=new T.Vector3(...axis).multiplyScalar(sign),hit=s.bvh.raycastFirst(new T.Ray(p,dir),T.DoubleSide);if(hit&&hit.distance>.002&&hit.face.normal.dot(dir)>.15)count++;}if(count===2)votes++;}return votes>=2;}
export function clearHardscape(candidate,active=null){const solids=candidate.habitat.surfaces.filter(s=>s.solid);for(const s of solids)for(const other of solids){if(s.owner===other.owner||!s.box.intersectsBox(other.box)||active&&!active.has(s.owner)&&!active.has(other.owner))continue;const p=s.geo.attributes.position,stride=Math.max(1,Math.floor(p.count/180));let failures=0;for(let i=0;i<p.count;i+=stride){const point=new T.Vector3().fromBufferAttribute(p,i);if(s.pose)point.applyMatrix4(s.pose);if(inside(point,other)&&++failures>=3)throw new Error('木石相互穿入，请换一个落点或角度');}}}
export function seatHardscape(candidate,records,selectedId=null,{onlyId=null,cache=null}={}){
 const solids=candidate.habitat.surfaces.filter(s=>s.solid),sets=records.map(record=>({record,node:candidate.entities.get(record.UniqueId),surfaces:solids.filter(s=>s.owner.endsWith(record.UniqueId))})).filter(s=>s.surfaces.length);
 sets.sort((a,b)=>bounds(a.surfaces).min.y-bounds(b.surfaces).min.y);
 const settled=onlyId?sets.filter(s=>s.record.UniqueId!==onlyId):[];
 for(const item of sets){if(onlyId&&item.record.UniqueId!==onlyId)continue;if(/^[RW]0[1-6]$/.test(item.record.TypeId)&&item.record.UniqueId!==selectedId){settled.push(item);continue;}const box=bounds(item.surfaces),wood=item.node.userData.kind===2,underside=[],ray=new T.Ray();
  if(box.min.x<-.5971||box.max.x>.5971||box.min.z<-.2971||box.max.z>.2971)throw new Error('木石超出缸壁，请往里移动');
  const originals=item.surfaces,area=box.clone(),input=cache&&JSON.stringify([item.record,item.record.UniqueId===(onlyId||selectedId)]);
  const supports=settled.map(other=>({other,box:bounds(other.surfaces)}));
  const supportStamp=area=>JSON.stringify(supports.filter(({box:b})=>b.min.x<=area.max.x&&b.max.x>=area.min.x&&b.min.z<=area.max.z&&b.max.z>=area.min.z).map(s=>s.other.record));
  function finish(delta){
   for(const s of originals){s.geo.applyMatrix4(delta);s.geo.computeBoundingBox();s.box=s.geo.boundingBox;s.bvh.refit();s.transform.premultiply(delta);}item.surfaces=originals;
   const point=new T.Vector3(item.record.Position.x,item.record.Position.y,item.record.Position.z).applyMatrix4(delta),q=new T.Quaternion().setFromEuler(new T.Euler(...['x','y','z'].map(k=>item.record.Rotation[k]*Math.PI/180),'YXZ')).premultiply(new T.Quaternion().setFromRotationMatrix(delta));item.record.Position={x:point.x,y:point.y,z:point.z};const euler=new T.Euler().setFromQuaternion(q,'YXZ');item.record.Rotation={x:euler.x*180/Math.PI,y:euler.y*180/Math.PI,z:euler.z*180/Math.PI};settled.push(item);
  }
  // Probe-local cache: the soil and source meshes stay fixed; include every support along the trial path.
  const cached=cache?.get(item.record.UniqueId);
  if(cached?.input===input&&cached.supports===supportStamp(cached.area)){item.node.applyMatrix4(cached.delta);item.node.updateMatrixWorld(true);finish(cached.delta);continue;}
  if(wood){const cells=new Map();for(const s of item.surfaces){const p=s.geo.attributes.position;for(let i=0;i<p.count;i++){const point=new T.Vector3().fromBufferAttribute(p,i),key=Math.round(point.x/.003)+':'+Math.round(point.z/.003);if(!cells.has(key)||point.y<cells.get(key).y)cells.set(key,point);}}underside.push(...cells.values());}
  for(let x=0;x<23;x++)for(let z=0;z<23;z++){ray.set(new T.Vector3(T.MathUtils.lerp(box.min.x,box.max.x,x/22),box.min.y-.025,T.MathUtils.lerp(box.min.z,box.max.z,z/22)),up);let best=null;for(const s of item.surfaces){const h=s.bvh.raycastFirst(ray,T.DoubleSide,0,box.max.y-box.min.y+.05);if(h&&(!best||h.distance<best.distance))best=h;}if(best)underside.push(best.point);}
  const burial=T.MathUtils.clamp(item.record.Burial??.003,0,Math.min(.02,(box.max.y-box.min.y)*.18));
  function support(){let shift=-Infinity;const samples=[],current=bounds(item.surfaces);
   for(const p of underside){const soil=candidate.soil.sample(p.x,p.z);let need=soil+candidate.soil.crest(p.x,p.z)-Math.min(burial,Math.max(0,soil-candidate.soil.MinHeight))-p.y;
    for(const {other,box:ob} of supports){if(p.x<ob.min.x||p.x>ob.max.x||p.z<ob.min.z||p.z>ob.max.z)continue;ray.set(new T.Vector3(p.x,ob.max.y+.03,p.z),down);for(const surface of other.surfaces){const hit=surface.bvh.raycastFirst(ray,T.DoubleSide,0,ob.max.y-ob.min.y+.06);if(hit&&!(other.node.userData.kind===2&&hit.point.y>current.max.y+.002))need=Math.max(need,hit.point.y+.00035-p.y);}}
    samples.push({p,need});shift=Math.max(shift,need);
   }
   if(!Number.isFinite(shift))throw new Error('木石缺少可支撑的底面');return {shift,contacts:samples.filter(s=>s.need>=shift-.0015).map(s=>s.p)};
  }
  const totalDelta=new T.Matrix4(),inverse=new T.Matrix4(),centreOfMass=box.getCenter(new T.Vector3());
  // Rigid settling changes query coordinates, not thousands of mesh vertices on every trial turn.
  item.surfaces=originals.map(s=>({...s,box:s.box.clone(),pose:totalDelta,bvh:{raycastFirst(ray,...args){const hit=s.bvh.raycastFirst(ray.clone().applyMatrix4(inverse),...args);if(hit){hit.point.applyMatrix4(totalDelta);hit.face.normal.transformDirection(totalDelta);}return hit;}}}));
  // shortcut: fixed bounds centre approximates mass; use mesh-volume mass if irregular assets need it.
  function apply(delta){totalDelta.premultiply(delta);inverse.copy(totalDelta).invert();centreOfMass.applyMatrix4(delta);item.node.applyMatrix4(delta);item.node.updateMatrixWorld(true);const e=delta.elements,translation=e[0]===1&&e[5]===1&&e[10]===1&&e[1]===0&&e[2]===0&&e[4]===0&&e[6]===0&&e[8]===0&&e[9]===0;for(const s of item.surfaces){if(translation)s.box.translate(new T.Vector3(e[12],e[13],e[14]));else{s.box.makeEmpty();const p=s.geo.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++)s.box.expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(totalDelta));}area.union(s.box);}underside.forEach(p=>p.applyMatrix4(delta));}
  function inBounds(){const b=bounds(item.surfaces);return b.min.x>=-.5971&&b.max.x<=.5971&&b.min.z>=-.2971&&b.max.z<=.2971&&b.max.y<=.625&&b.min.y>=-.10;}
  let contact=support();apply(new T.Matrix4().makeTranslation(0,contact.shift,0));if(!inBounds())throw new Error('木石堆叠超出鱼缸范围');
  // A supported bridge may keep its gap; a one-sided overhang must keep settling.
  let angle=4;
  for(let pass=0;pass<48;pass++){contact=support();const centre=centreOfMass.clone(),offset=supportOffset(centre,contact.contacts);if(offset.length()<.003)break;const pivot=centre.clone().sub(offset);pivot.y=Math.max(...contact.contacts.map(p=>p.y));
   const axis=up.clone().cross(offset).normalize(),turn=new T.Matrix4().makeTranslation(...pivot.toArray()).multiply(new T.Matrix4().makeRotationAxis(axis,angle*Math.PI/180)).multiply(new T.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));apply(turn);const shift=support().shift,move=new T.Matrix4().makeTranslation(0,shift,0);apply(move);let good=inBounds()&&centreOfMass.y<=centre.y-.00001;
   if(good)try{clearHardscape({habitat:{surfaces:[...item.surfaces,...settled.flatMap(s=>s.surfaces)]}},new Set([item.node.name]));}catch{good=false;}
   if(!good){apply(move.clone().invert());apply(turn.clone().invert());angle/=2;if(angle<.25)break;}else angle=Math.min(4,angle*2);
  }
  // Legacy unsupported pieces must not block returning to soil editing.
  if(item.record.UniqueId===(onlyId||selectedId)&&supportOffset(centreOfMass,support().contacts).length()>.006)throw new Error('木石只有一侧支撑，无法稳定落放；请换个位置或增加承托');
  if(cache){area.expandByScalar(.00001);cache.set(item.record.UniqueId,{input,area,delta:totalDelta.clone(),supports:supportStamp(area)});}
  finish(totalDelta);
 }
 clearHardscape(candidate,new Set(sets.filter(s=>(!onlyId||s.record.UniqueId===onlyId)&&(!/^[RW]0[1-6]$/.test(s.record.TypeId)||s.record.UniqueId===selectedId)).map(s=>s.node.name)));
}
export function substrateMask(soil,habitat){soil.floor.fill(soil.MinHeight);soil.cap.fill(soil.MaxHeight);const ray=new T.Ray();for(let i=0;i<soil.h.length;i++){const p=soil.point(i),y=soil.h[i],point=new T.Vector3(p.x,y+.004,p.z);for(const s of habitat.surfaces.filter(s=>s.solid)){if(s.box.distanceToPoint(point)>.042)continue;const near=s.bvh.closestPointToPoint(point,{},0,.042);if(!near)continue;const w=1-T.MathUtils.smoothstep(near.distance,.022,.042);soil.floor[i]=Math.max(soil.floor[i],y-.003/Math.max(.01,w));soil.cap[i]=Math.min(soil.cap[i],y+.009/Math.max(.01,w));}
  const edge=Math.min(soil.Width/2-Math.abs(p.x),soil.Depth/2-Math.abs(p.z));soil.cap[i]=Math.min(soil.cap[i],T.MathUtils.lerp(.057,soil.MaxHeight,T.MathUtils.smoothstep(edge,0,.12)));
 }}
