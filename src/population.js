import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {stableSeed} from './state.js';
import {CreatureWorld} from './creatures.js';
import {vec,face,peerDepth} from './habitat.js';
import {shrimpBodyScale} from './shrimp-scale.js';
import {babyName, emptyColony, syncRoster} from './care.js';
import {cloneCreatureMaterials, releaseCreatureMesh, stripEggMeshes} from './mesh-materials.js';
export function populationRecords(base,count){
 if(!Number.isInteger(count)||count<0||count>50)throw new Error('虾数量应为 0–50');
 if(count&&!base?.creatures?.length)throw new Error('缺少可复用的虾记录');
 return Array.from({length:count},(_,i)=>{const c=structuredClone(base.creatures[i%base.creatures.length]);if(i>=base.creatures.length){c.CreatureId=base.tankId+'-shrimp-'+i;for(const key of Object.keys(c.Personality))c.Personality[key]=.8+stableSeed(c.CreatureId+key)/4294967295*.4;}return c;});
}
export function validateStock(stock){if(!stock||typeof stock.tankId!=='string'||stock.tankId.length>100||!Array.isArray(stock.creatures)||stock.creatures.length>50||new Set(stock.creatures.map(c=>c?.CreatureId)).size!==stock.creatures.length)throw new Error('虾群身份记录无效');for(const c of stock.creatures){if(typeof c.CreatureId!=='string'||!c.CreatureId.length||c.CreatureId.length>128||!['red-cherry-shrimp','crystal-shrimp'].includes(c.SpeciesId))throw new Error('虾品种或身份无效');for(const k of ['Activity','Boldness','FoodDrive','HideBias','ExploreBias'])if(!Number.isFinite(c.Personality?.[k])||c.Personality[k]<.75||c.Personality[k]>1.25)throw new Error('个体性格超出原品种范围');}return structuredClone(stock);}
export function resizePopulation(aq,world,count,{newborn=false,colony:currentColony=world.colony}={}){
 aq.templates??=[...aq.animals];aq.populationBase??={tankId:world.seed.tankId,creatures:structuredClone(world.seed.creatures.slice(0,5))};
 const creatures=world.agents.slice(0,count).map(a=>structuredClone(a.data)),seed={...world.seed,creatures},saved=world.snapshot(),records=populationRecords(aq.populationBase,count);
 const colony=structuredClone(currentColony||emptyColony()),bodyScale=id=>shrimpBodyScale({id,ageDays:colony.shrimp[id]?.ageDays});
 for(let i=creatures.length;i<count;i++){const c=records[i],h=stableSeed(c.CreatureId);c.Needs={Hunger:.35,Stress:0,Fatigue:.1,GroomNeed:.1,Monotony:0};c.CurrentIntent=c.ExecutionState='Rest';let pose=null;
  if(newborn)colony.shrimp[c.CreatureId]={name:babyName(colony),favorite:false,ageDays:0,hatchAt:null,restUntil:0};
  const start=h%world.anchors.length,scale=bodyScale(c.CreatureId);for(let j=0;j<world.anchors.length;j++){const at=(start+j)%world.anchors.length,a=world.anchors[at];if(!a.edges.length||a.kind!==0)continue;const q=face(new T.Vector3(-1,0,0),a.normal),candidate=world.habitat.support(a.position,a.normal,q,scale);if(candidate&&creatures.every(o=>peerDepth(candidate.position,candidate.rotation,{position:vec(o.Position),rotation:new T.Quaternion(o.Rotation.x,o.Rotation.y,o.Rotation.z,o.Rotation.w),scale:bodyScale(o.CreatureId)},scale)<=.0008)){pose=candidate;break;}}
  if(!pose)throw new Error(`当前造景找不到第 ${i+1} 只虾的安全位置`);c.Position={x:pose.position.x,y:pose.position.y,z:pose.position.z};c.Rotation={x:pose.rotation.x,y:pose.rotation.y,z:pose.rotation.y,w:pose.rotation.w};c.Rotation.z=pose.rotation.z;creatures.push(c);
 }
 syncRoster(colony,creatures.map(data=>({data})));seed.creatures=structuredClone(creatures);saved.creatures=creatures;delete saved.anchors;const nextWorld=new CreatureWorld(seed,world.habitat,saved,colony);
 return {...reconcilePopulation(aq,nextWorld),world:nextWorld,seed};
}
export function seatNewIndividuals(creatures,ids,candidate,colony,minGap=0,hatchSites=[]){
 const moved=new Set(ids),placed=creatures.filter(c=>!moved.has(c.CreatureId));
 const seats=new Map();
 const sites=new Map(hatchSites.map(s=>[s.id,s])),arrivals=creatures.filter(c=>moved.has(c.CreatureId));
 if(sites.size)arrivals.sort((a,b)=>Number(sites.has(a.CreatureId))-Number(sites.has(b.CreatureId)));
 const scale=c=>shrimpBodyScale({id:c.CreatureId,...colony.shrimp[c.CreatureId]});
 const connected=(a,i)=>a.edges.length || (a.kind!==3 && candidate.canSeatAt?.(i));
 let ground;
 for(const c of arrivals){
  const yaw=stableSeed(c.CreatureId+':arrival')*(2*Math.PI/4294967296);
  const direction=new T.Vector3(Math.cos(yaw),0,Math.sin(yaw)),size=scale(c);
  const peers=placed.map(o=>({position:vec(o.Position),rotation:new T.Quaternion(o.Rotation.x,o.Rotation.y,o.Rotation.z,o.Rotation.w),scale:scale(o)}));
  function findSeat(anchors,start,gap,clearance=0){
   for(const heading of [direction,new T.Vector3(-1,0,0)]){
    let fallback=null;
    for(let j=0;j<anchors.length;j++){
     const a=anchors[(start+j)%anchors.length];
     const test=candidate.habitat.support(a.position,a.normal,face(heading,a.normal),size);
     if(!test || peers.some(o=>test.position.distanceToSquared(o.position)<gap*gap || peerDepth(test.position,test.rotation,o,size)>.0008))continue;
     if(!clearance || peers.every(o=>test.position.distanceToSquared(o.position)>=clearance*clearance))return {anchor:a,pose:test};
     fallback??={anchor:a,pose:test};
    }
    if(fallback)return fallback;
   }
   return null;
  }
  let landing=null;
  const site=sites.get(c.CreatureId);
  const origin=site && (site.position ?? placed.find(p=>p.CreatureId===site.motherId)?.Position);
  if(origin){
   const aim=vec(origin).addScaledVector(direction,.021);
   const nearest=(a,b)=>a.position.distanceToSquared(aim)-b.position.distanceToSquared(aim);
   const nearby=candidate.anchors.filter((a,i)=>a.position.y<=origin.y+.018 &&
    (a.position.x-origin.x)**2+(a.position.z-origin.z)**2<=.085**2 && connected(a,i));
   // A swimming mother's column can contain a leaf, a branch, or the floor below her.
   landing=findSeat(nearby.sort(nearest),0,Math.max(minGap,.012));
   if(!landing)landing=findSeat(candidate.anchors.filter(connected).sort(nearest),0,minGap);
  }else{
   ground??=candidate.anchors.filter((a,i)=>a.kind===0 && (candidate.canSeatAt?.(i)??a.edges.length));
   const start=ground.length ? stableSeed(c.CreatureId)%ground.length : 0;
   landing=findSeat(ground,start,minGap,.055);
  }
  if(!landing)throw new Error('缸内暂时没有安全的入缸位置，原进度保留');
  const {pose,anchor}=landing;
  seats.set(c.CreatureId,candidate.anchors.indexOf(anchor));
  c.Position={x:pose.position.x,y:pose.position.y,z:pose.position.z};c.Rotation={x:pose.rotation.x,y:pose.rotation.y,z:pose.rotation.z,w:pose.rotation.w};c.CurrentIntent=c.ExecutionState='Rest';placed.push(c);
 }
 return seats;
}
export function applyCreaturePose(animal,agent,blend){
 if(blend>0){animal.rig.position.lerp(agent.position,blend);animal.rig.quaternion.slerp(agent.rotation,blend);}
 const state=agent.data.ExecutionState, walking=state==='Walk'||state==='Climb';
 animal.play(agent.manual||(walking?'Walk':state==='Hide'?'Rest':state));
 if(walking){
  const walk=animal.actions.get('Walk');
  if(walk)walk.timeScale=T.MathUtils.clamp(walk.getClip().duration*agent.speed/.005,.08,8);
 }
 if(!animal.baseScale)animal.baseScale=animal.rig.scale.x||1;
 animal.rig.scale.setScalar(animal.baseScale*(agent.scale||1));
}
// Match rigs by permanent identity, including same-count replacements and empty tanks.
export function reconcilePopulation(aq,world){
 validateStock({tankId:world.seed.tankId,creatures:world.agents.map(a=>a.data)});
 aq.templates??=[...aq.animals];
 const existing=new Map(aq.animals.map(a=>[a.id,a])),added=[],next=[];
 if(existing.size!==aq.animals.length)throw new Error('显示中的虾身份重复');
 const release=(a,prepared=false)=>{a.mixer.stopAllAction();a.mixer.uncacheRoot(a.rig);const meshes=[],skeletons=new Set();a.rig.traverse(o=>{if(o.isMesh)meshes.push(o);});for(const mesh of meshes){const index=aq.meshes.indexOf(mesh);if(index>=0)aq.meshes.splice(index,1);if(mesh.skeleton)skeletons.add(mesh.skeleton);if(!prepared||a.ownedMeshes.has(mesh))releaseCreatureMesh(mesh);}for(const skeleton of skeletons)skeleton.dispose();};
 try{for(let i=0;i<world.agents.length;i++){
  const id=world.agents[i].data.CreatureId,kept=existing.get(id);if(kept){next.push(kept);continue;}
  if(!aq.templates.length)throw new Error('缺少可复用的虾模型');
  const template=aq.templates[stableSeed(id)%aq.templates.length],baseScale=template.baseScale??template.rig.scale.x,rig=clone(template.rig),source=[],copies=[];template.rig.traverse(o=>source.push(o));rig.traverse(o=>copies.push(o));const uuids=new Map(source.map((o,j)=>[o.uuid,copies[j].uuid])),mixer=new T.AnimationMixer(rig),actions=new Map(),a={id,rig,mixer,actions,ownedMeshes:new Set()};added.push(a);
   copies[source.indexOf(template.star)]?.removeFromParent();stripEggMeshes(rig);
   for(const [name,action]of template.actions){const clip=action.getClip().clone();for(const track of clip.tracks){const dot=track.name.indexOf('.'),uuid=track.name.slice(0,dot);if(uuids.has(uuid))track.name=uuids.get(uuid)+track.name.slice(dot);}actions.set(name,mixer.clipAction(clip));}
   rig.scale.setScalar(baseScale*world.agents[i].scale);
   Object.assign(a,{baseScale,seed:stableSeed(id),active:null,antennae:copies.filter(n=>/^(Antennule_[LR]|AntennaLong_[LR]_0[123])$/.test(n.name)),deltas:[]});a.play=name=>{if(a.active===name||!actions.has(name))return;actions.get(a.active)?.fadeOut(.16);const next=actions.get(name).reset().fadeIn(.16);if(name==='EscapeSwim'){next.setLoop(T.LoopOnce,1);next.clampWhenFinished=true;}next.play();a.active=name;};a.play('Rest');mixer.setTime((a.seed%1000)/997);
   const {Position:p,Rotation:q}=world.agents[i].data;
   if(p && q){rig.position.set(p.x,p.y,p.z);rig.quaternion.set(q.x,q.y,q.z,q.w);}
   next.push(a);
   rig.traverse(o=>{if(o.isMesh){o.userData.creatureId=id;cloneCreatureMaterials(o,.90+(a.seed%101)/500);a.ownedMeshes.add(o);}});
  }
 }catch(e){added.forEach(a=>release(a,true));throw e;}
 let settled=false;
 return {dispose(){if(settled)return;settled=true;added.forEach(a=>release(a,true));},commit(){
  if(settled)return;settled=true;
  const retained=new Set(next);for(const a of aq.animals)if(!retained.has(a)){a.rig.removeFromParent();release(a);}
  for(const a of added){aq.root.add(a.rig);a.rig.traverse(o=>{if(o.isMesh)aq.meshes.push(o);});}
  aq.animals.splice(0,aq.animals.length,...next);
 }};
}
