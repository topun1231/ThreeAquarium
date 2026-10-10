import * as T from 'three';
const up=new T.Vector3(0,1,0),down=new T.Vector3(0,-1,0);
const bounds=surfaces=>surfaces.reduce((b,s)=>b.union(s.box),new T.Box3());
function inside(p,s){if(!s.box.containsPoint(p))return false;let votes=0;for(const axis of [[1,0,0],[0,1,0],[0,0,1]]){let count=0;for(const sign of [-1,1]){const dir=new T.Vector3(...axis).multiplyScalar(sign),hit=s.bvh.raycastFirst(new T.Ray(p,dir),T.DoubleSide);if(hit&&hit.distance>.002&&hit.face.normal.dot(dir)>.15)count++;}if(count===2)votes++;}return votes>=2;}
export function clearHardscape(candidate,active=null){const solids=candidate.habitat.surfaces.filter(s=>s.solid);for(const s of solids)for(const other of solids){if(s.owner===other.owner||!s.box.intersectsBox(other.box)||active&&!active.has(s.owner)&&!active.has(other.owner))continue;const p=s.geo.attributes.position,stride=Math.max(1,Math.floor(p.count/180));let failures=0;for(let i=0;i<p.count;i+=stride)if(inside(new T.Vector3().fromBufferAttribute(p,i),other)&&++failures>=3)throw new Error('木石相互穿入，请换一个落点或角度');}}
export function seatHardscape(candidate,records,selectedId=null){
 const solids=candidate.habitat.surfaces.filter(s=>s.solid),sets=records.map(record=>({record,node:candidate.entities.get(record.UniqueId),surfaces:solids.filter(s=>s.owner.endsWith(record.UniqueId))})).filter(s=>s.surfaces.length);
 sets.sort((a,b)=>bounds(a.surfaces).min.y-bounds(b.surfaces).min.y);
 const settled=[];
 for(const item of sets){if(/^[RW]0[1-6]$/.test(item.record.TypeId)&&item.record.UniqueId!==selectedId){settled.push(item);continue;}const box=bounds(item.surfaces),wood=item.node.userData.kind===2,underside=[],ray=new T.Ray();
  if(box.min.x<-.5971||box.max.x>.5971||box.min.z<-.2971||box.max.z>.2971)throw new Error('木石超出缸壁，请往里移动');
  if(wood){const cells=new Map();for(const s of item.surfaces){const p=s.geo.attributes.position;for(let i=0;i<p.count;i++){const point=new T.Vector3().fromBufferAttribute(p,i),key=Math.round(point.x/.003)+':'+Math.round(point.z/.003);if(!cells.has(key)||point.y<cells.get(key).y)cells.set(key,point);}}underside.push(...cells.values());}
  else for(let x=0;x<23;x++)for(let z=0;z<23;z++){ray.set(new T.Vector3(T.MathUtils.lerp(box.min.x,box.max.x,x/22),box.min.y-.025,T.MathUtils.lerp(box.min.z,box.max.z,z/22)),up);let best=null;for(const s of item.surfaces){const h=s.bvh.raycastFirst(ray,T.DoubleSide,0,box.max.y-box.min.y+.05);if(h&&(!best||h.distance<best.distance))best=h;}if(best)underside.push(best.point);}
  const burial=T.MathUtils.clamp(item.record.Burial??.003,0,Math.min(.02,(box.max.y-box.min.y)*.18));
  function support(){let shift=-Infinity;const samples=[],current=bounds(item.surfaces);
   for(const p of underside){const soil=candidate.soil.sample(p.x,p.z);let need=soil+candidate.soil.crest(p.x,p.z)-Math.min(burial,Math.max(0,soil-candidate.soil.MinHeight))-p.y;
    for(const other of settled){const ob=bounds(other.surfaces);if(p.x<ob.min.x||p.x>ob.max.x||p.z<ob.min.z||p.z>ob.max.z)continue;ray.set(new T.Vector3(p.x,ob.max.y+.03,p.z),down);for(const surface of other.surfaces){const hit=surface.bvh.raycastFirst(ray,T.DoubleSide,0,ob.max.y-ob.min.y+.06);if(hit&&!(other.node.userData.kind===2&&hit.point.y>current.max.y+.002))need=Math.max(need,hit.point.y+.00035-p.y);}}
    samples.push({p,need});shift=Math.max(shift,need);
   }
   if(!Number.isFinite(shift))throw new Error('木石缺少可支撑的底面');return {shift,contacts:samples.filter(s=>s.need>=shift-.0015).map(s=>s.p)};
  }
  const totalDelta=new T.Matrix4();
  function apply(delta){totalDelta.premultiply(delta);item.node.applyMatrix4(delta);item.node.updateMatrixWorld(true);for(const s of item.surfaces){s.geo.applyMatrix4(delta);s.geo.computeBoundingBox();s.box=s.geo.boundingBox;s.bvh.refit();s.transform.premultiply(delta);}underside.forEach(p=>p.applyMatrix4(delta));}
  function inBounds(){const b=bounds(item.surfaces);return b.min.x>=-.5971&&b.max.x<=.5971&&b.min.z>=-.2971&&b.max.z<=.2971&&b.max.y<=.625&&b.min.y>=-.10;}
  let contact=support();apply(new T.Matrix4().makeTranslation(0,contact.shift,0));if(!inBounds())throw new Error('木石堆叠超出鱼缸范围');
  // Original settling: at most three four-degree steps, only when the centre lowers safely.
  for(let pass=0;pass<3;pass++){contact=support();const centre=bounds(item.surfaces).getCenter(new T.Vector3()),pivot=contact.contacts.reduce((v,p)=>v.add(p),new T.Vector3()).multiplyScalar(1/contact.contacts.length),offset=centre.clone().sub(pivot);offset.y=0;if(offset.length()<.012)break;
   const axis=up.clone().cross(offset).normalize(),turn=new T.Matrix4().makeTranslation(...pivot.toArray()).multiply(new T.Matrix4().makeRotationAxis(axis,4*Math.PI/180)).multiply(new T.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));apply(turn);const shift=support().shift,move=new T.Matrix4().makeTranslation(0,shift,0);apply(move);let good=inBounds()&&bounds(item.surfaces).getCenter(new T.Vector3()).y<=centre.y-.00035;
   if(good)try{clearHardscape({habitat:{surfaces:[...item.surfaces,...settled.flatMap(s=>s.surfaces)]}},new Set([item.node.name]));}catch{good=false;}
   if(!good){apply(move.clone().invert());apply(turn.clone().invert());break;}
  }
  const recordPoint=new T.Vector3(item.record.Position.x,item.record.Position.y,item.record.Position.z).applyMatrix4(totalDelta),recordQ=new T.Quaternion().setFromEuler(new T.Euler(...['x','y','z'].map(k=>item.record.Rotation[k]*Math.PI/180),'YXZ')).premultiply(new T.Quaternion().setFromRotationMatrix(totalDelta));item.record.Position={x:recordPoint.x,y:recordPoint.y,z:recordPoint.z};const euler=new T.Euler().setFromQuaternion(recordQ,'YXZ');item.record.Rotation={x:euler.x*180/Math.PI,y:euler.y*180/Math.PI,z:euler.z*180/Math.PI};settled.push(item);
 }
 clearHardscape(candidate,new Set(sets.filter(s=>!/^[RW]0[1-6]$/.test(s.record.TypeId)||s.record.UniqueId===selectedId).map(s=>s.node.name)));
}
export function substrateMask(soil,habitat){soil.floor.fill(soil.MinHeight);soil.cap.fill(soil.MaxHeight);const ray=new T.Ray();for(let i=0;i<soil.h.length;i++){const p=soil.point(i),y=soil.h[i],point=new T.Vector3(p.x,y+.004,p.z);for(const s of habitat.surfaces.filter(s=>s.solid)){if(s.box.distanceToPoint(point)>.042)continue;const near=s.bvh.closestPointToPoint(point,{},0,.042);if(!near)continue;const w=1-T.MathUtils.smoothstep(near.distance,.022,.042);soil.floor[i]=Math.max(soil.floor[i],y-.003/Math.max(.01,w));soil.cap[i]=Math.min(soil.cap[i],y+.009/Math.max(.01,w));}
  const edge=Math.min(soil.Width/2-Math.abs(p.x),soil.Depth/2-Math.abs(p.z));soil.cap[i]=Math.min(soil.cap[i],T.MathUtils.lerp(.057,soil.MaxHeight,T.MathUtils.smoothstep(edge,0,.12)));
 }}
