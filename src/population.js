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
export function seatNewIndividuals(creatures,ids,candidate,colony){
 const moved=new Set(ids),placed=creatures.filter(c=>!moved.has(c.CreatureId));
 const scale=c=>shrimpBodyScale({id:c.CreatureId,...colony.shrimp[c.CreatureId]});
 for(const c of creatures.filter(c=>moved.has(c.CreatureId))){
  let pose=null;const start=stableSeed(c.CreatureId)%candidate.anchors.length;
  for(let j=0;j<candidate.anchors.length;j++){
   const a=candidate.anchors[(start+j)%candidate.anchors.length];if(a.kind!==0||!a.edges.length)continue;
   const test=candidate.habitat.support(a.position,a.normal,face(new T.Vector3(-1,0,0),a.normal),scale(c));
   if(test&&placed.every(o=>peerDepth(test.position,test.rotation,{position:vec(o.Position),rotation:new T.Quaternion(o.Rotation.x,o.Rotation.y,o.Rotation.z,o.Rotation.w),scale:scale(o)},scale(c))<=.0008)){pose=test;break;}
  }
  if(!pose)throw new Error('缸内暂时没有安全的入缸位置，原进度保留');
  c.Position={x:pose.position.x,y:pose.position.y,z:pose.position.z};c.Rotation={x:pose.rotation.x,y:pose.rotation.y,z:pose.rotation.z,w:pose.rotation.w};c.CurrentIntent=c.ExecutionState='Rest';placed.push(c);
 }
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
