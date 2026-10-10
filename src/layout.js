import * as T from 'three';
import {createHabitat,reconnectGraph,vec,up,nearest} from './habitat.js';
import {CreatureWorld,validateGame} from './creatures.js';

// Layout stores rigid edits only; approved meshes, growth, cuts and individual materials stay intact.
export class PlantLayout {
 constructor(pack,buffer,seed,source,habitat){
  if(source.version!==1||source.tankId!==pack.tankId||source.plants.length!==pack.plants)throw new Error('造景源数据不匹配');
  this.pack=pack;this.buffer=buffer;this.seed=seed;this.source=source;this.baseHabitat=habitat;
  this.byId=new Map(source.plants.map(p=>[p.record.UniqueId,p]));
  this.rootForNode=pack.nodes.map((_,i)=>{for(let n=i;n>=0;n=pack.nodes[n].parent)if(source.plants.some(p=>p.node===n))return n;return -1;});
 }
 validate(layout){
  if(!Array.isArray(layout)||layout.length>this.byId.size||new Set(layout.map(p=>p?.id)).size!==layout.length)throw new Error('水草布局数据无效');
  return layout.map(p=>{if(!p||!this.byId.has(p.id)||!['x','z','yaw'].every(k=>Number.isFinite(p[k]))||Math.abs(p.x)>.6||Math.abs(p.z)>.3||Math.abs(p.yaw)>Math.PI)throw new Error('水草位置或方向无效');return {id:p.id,x:p.x,z:p.z,yaw:p.yaw};});
 }
 ground(x,z){const s=this.baseHabitat.surfaces.find(s=>s.kind===0),h=s.bvh.raycastFirst(new T.Ray(new T.Vector3(x,.7,z),new T.Vector3(0,-1,0)),T.DoubleSide,0,1);if(!h||h.point.y<=this.source.minimumSoilHeight+.0002)throw new Error('这里没有可种植的底床');return h.point.y;}
 pose(plant,edit){
  const n=this.pack.nodes[plant.node],p=vec(n.p),q=new T.Quaternion(...n.q);
  if(edit){p.x=edit.x;p.z=edit.z;if(Math.hypot(p.x-n.p[0],p.z-n.p[2])>1e-7)p.y+=this.ground(p.x,p.z)-this.ground(n.p[0],n.p[2]);q.premultiply(new T.Quaternion().setFromAxisAngle(up,edit.yaw));}
  return {p,q};
 }
 checkPlacement(layout){
  const edits=this.validate(layout),positions=this.source.plants.map(p=>({plant:p,...this.pose(p,edits.find(e=>e.id===p.record.UniqueId))}));
  for(const e of edits){const plant=this.byId.get(e.id),n=this.pack.nodes[plant.node],moved=Math.hypot(e.x-n.p[0],e.z-n.p[2])>1e-7;if(!moved)continue;
   if(Math.abs(e.x)>.56||Math.abs(e.z)>.26)throw new Error('请在缸内可种植范围落点');
   const y=this.ground(e.x,e.z),ray=new T.Ray(new T.Vector3(e.x,.7,e.z),new T.Vector3(0,-1,0));
   for(const s of this.baseHabitat.surfaces.filter(s=>s.solid)){const hit=s.bvh.raycastFirst(ray,T.DoubleSide,0,1);if(hit&&hit.point.y>y+.015)throw new Error('这里有木石遮挡，请选择裸露底床');}
   const spacing=plant.record.TypeId.includes('finegrass')?.011:.024;
   if(positions.some(o=>o.plant!==plant&&Math.hypot(e.x-o.p.x,e.z-o.p.z)<spacing-1e-6))throw new Error('离其他水草太近，请留出种植间距');
  }
  return edits;
 }
 edit(layout,id,x,z,yaw){
  if(!this.byId.has(id))throw new Error('请先选择一株水草');
  const n=this.pack.nodes[this.byId.get(id).node],e={id,x,z,yaw:Math.atan2(Math.sin(yaw),Math.cos(yaw))};
  const next=layout.filter(p=>p.id!==id);if(Math.hypot(x-n.p[0],z-n.p[2])>1e-7||Math.abs(e.yaw)>1e-7)next.push(e);
  return this.checkPlacement(next);
 }
 ensureUnoccupied(before,after,world){
  const changed=this.source.plants.filter(p=>JSON.stringify(before.find(e=>e.id===p.record.UniqueId))!==JSON.stringify(after.find(e=>e.id===p.record.UniqueId))).map(p=>p.node);
  for(const a of world.agents)for(const s of world.habitat.surfaces)if(changed.includes(this.rootForNode[s.node])&&s.box.distanceToPoint(a.position)<.025&&s.bvh.closestPointToPoint(a.position,{},0,.025))throw new Error('这株草附近有虾，请先完成调整，等虾离开后再试');
 }
 async prepare(layout,reuse=this.baseHabitat){
  const edits=this.checkPlacement(layout);if(!edits.length)return {layout:[],seed:this.seed,habitat:this.baseHabitat};
  const nodes=this.pack.nodes.slice(),transforms=new Map();
  for(const e of edits){const plant=this.byId.get(e.id),n=nodes[plant.node],{p,q}=this.pose(plant,e),old=new T.Matrix4().compose(vec(n.p),new T.Quaternion(...n.q),vec(n.s)),now=new T.Matrix4().compose(p,q,vec(n.s));transforms.set(plant.node,now.clone().multiply(old.invert()));nodes[plant.node]={...n,p:p.toArray(),q:q.toArray()};}
  const habitat=await createHabitat({...this.pack,nodes},this.buffer,()=>{},reuse);
  const anchors=this.seed.anchors.map(a=>{const p=vec(a.position),n=vec(a.normal),node=a.owner.startsWith('Plant ')?this.rootForNode[Number(a.owner.slice(6))]:-1,delta=transforms.get(node);if(delta){p.applyMatrix4(delta);n.transformDirection(delta);}return {...a,position:p,normal:n,edges:[]};});
  reconnectGraph(habitat,anchors);
  return {layout:edits,habitat,seed:{...this.seed,anchors:anchors.map(a=>({...a,position:a.position.toArray(),normal:a.normal.toArray()}))}};
 }
 relocate(game,currentSeed,candidate){
  const saved=validateGame(game,currentSeed);
  saved.anchors=saved.creatures.map(c=>nearest(candidate.seed.anchors.map(a=>({...a,position:vec(a.position)})),vec(c.Position)));
  const world=new CreatureWorld(candidate.seed,candidate.habitat,saved);
  // A layout edit must not silently teleport an animal off its old support.
  if(world.agents.some(a=>a.position.distanceTo(vec(saved.creatures.find(c=>c.CreatureId===a.data.CreatureId).Position))>.006))throw new Error('此次移动会影响虾的落脚位置，请换一个落点');
  return world;
 }
 apply(aq,layout){for(const p of this.source.plants){const pose=this.pose(p,layout.find(e=>e.id===p.record.UniqueId));aq.nodes[p.node].position.copy(pose.p);aq.nodes[p.node].quaternion.copy(pose.q);}aq.root.updateMatrixWorld(true);}
 records(layout){return this.source.plants.map(p=>{const record=structuredClone(p.record),edit=layout.find(e=>e.id===record.UniqueId);if(edit){const {p:pos,q}=this.pose(p,edit),n=this.pack.nodes[p.node],euler=new T.Euler().setFromQuaternion(q,'YXZ');record.Position={x:record.Position.x+pos.x-n.p[0],y:record.Position.y+pos.y-n.p[1],z:record.Position.z+pos.z-n.p[2]};record.Rotation={x:T.MathUtils.radToDeg(euler.x),y:T.MathUtils.radToDeg(euler.y),z:T.MathUtils.radToDeg(euler.z)};}return record;});}
}
