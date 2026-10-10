import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {stableSeed} from './state.js';
import {CreatureWorld} from './creatures.js';
import {vec,face,up,peerDepth} from './habitat.js';
import {shrimpSizeFactor} from './shrimp-scale.js';
import {cloneCreatureMaterials, releaseCreatureMesh, stripEggMeshes} from './mesh-materials.js';
export function populationRecords(base,count){
 if(!Number.isInteger(count)||count<1||count>50)throw new Error('虾数量应为 1–50');
 return Array.from({length:count},(_,i)=>{const c=structuredClone(base.creatures[i%base.creatures.length]);if(i>=base.creatures.length){c.CreatureId=base.tankId+'-shrimp-'+i;for(const key of Object.keys(c.Personality))c.Personality[key]=.8+stableSeed(c.CreatureId+key)/4294967295*.4;}return c;});
}
export function validateStock(stock){if(!stock||typeof stock.tankId!=='string'||stock.tankId.length>100||!Array.isArray(stock.creatures)||stock.creatures.length<1||stock.creatures.length>50||new Set(stock.creatures.map(c=>c?.CreatureId)).size!==stock.creatures.length)throw new Error('虾群身份记录无效');for(const c of stock.creatures){if(typeof c.CreatureId!=='string'||c.CreatureId.length>128||c.SpeciesId!=='red-cherry-shrimp')throw new Error('虾品种或身份无效');for(const k of ['Activity','Boldness','FoodDrive','HideBias','ExploreBias'])if(!Number.isFinite(c.Personality?.[k])||c.Personality[k]<.75||c.Personality[k]>1.25)throw new Error('个体性格超出原品种范围');}return structuredClone(stock);}
export function resizePopulation(aq,world,count){
 aq.templates??=[...aq.animals];aq.populationBase??={tankId:world.seed.tankId,creatures:structuredClone(world.seed.creatures.slice(0,5))};
 const creatures=world.agents.slice(0,count).map(a=>structuredClone(a.data)),seed={...world.seed,creatures},saved=world.snapshot(),records=populationRecords(aq.populationBase,count);
 for(let i=creatures.length;i<count;i++){const c=records[i],h=stableSeed(c.CreatureId);c.Needs={Hunger:.35,Stress:0,Fatigue:.1,GroomNeed:.1,Monotony:0};c.CurrentIntent=c.ExecutionState='Rest';let pose=null;
  const start=h%world.anchors.length,scale=shrimpSizeFactor(c.CreatureId);for(let j=0;j<world.anchors.length;j++){const at=(start+j)%world.anchors.length,a=world.anchors[at];if(!a.edges.length||a.kind!==0)continue;const q=face(new T.Vector3(-1,0,0),a.normal),candidate=world.habitat.support(a.position,a.normal,q,scale);if(candidate&&creatures.every(o=>peerDepth(candidate.position,candidate.rotation,{position:vec(o.Position),rotation:new T.Quaternion(o.Rotation.x,o.Rotation.y,o.Rotation.z,o.Rotation.w),scale:shrimpSizeFactor(o.CreatureId)},scale)<=.0008)){pose=candidate;break;}}
  if(!pose)throw new Error(`当前造景找不到第 ${i+1} 只虾的安全位置`);c.Position={x:pose.position.x,y:pose.position.y,z:pose.position.z};c.Rotation={x:pose.rotation.x,y:pose.rotation.y,z:pose.rotation.y,w:pose.rotation.w};c.Rotation.z=pose.rotation.z;creatures.push(c);
 }
 seed.creatures=structuredClone(creatures);saved.creatures=creatures;delete saved.anchors;const nextWorld=new CreatureWorld(seed,world.habitat,saved),added=[];
 try{for(let i=aq.animals.length;i<count;i++){const template=aq.templates[i%aq.templates.length],rig=clone(template.rig),source=[],copies=[];template.rig.traverse(o=>source.push(o));rig.traverse(o=>copies.push(o));const uuids=new Map(source.map((o,j)=>[o.uuid,copies[j].uuid])),mixer=new T.AnimationMixer(rig),actions=new Map(),id=creatures[i].CreatureId;
   for(const [name,action]of template.actions){const clip=action.getClip().clone();for(const track of clip.tracks){const dot=track.name.indexOf('.'),uuid=track.name.slice(0,dot);if(uuids.has(uuid))track.name=uuids.get(uuid)+track.name.slice(dot);}actions.set(name,mixer.clipAction(clip));}
   const a={id,rig,mixer,actions,seed:stableSeed(id),active:null,antennae:copies.filter(n=>/^(Antennule_[LR]|AntennaLong_[LR]_0[123])$/.test(n.name)),deltas:[]};a.play=name=>{if(a.active===name||!actions.has(name))return;actions.get(a.active)?.fadeOut(.16);const next=actions.get(name).reset().fadeIn(.16);if(name==='EscapeSwim'){next.setLoop(T.LoopOnce,1);next.clampWhenFinished=true;}next.play();a.active=name;};a.play('Rest');mixer.setTime((a.seed%1000)/997);
   stripEggMeshes(rig);
   rig.traverse(o=>{if(o.isMesh){o.userData.creatureId=id;cloneCreatureMaterials(o,.90+(a.seed%101)/500);}});added.push(a);
  }
 }catch(e){for(const a of added)a.rig.traverse(o=>{if(o.isMesh)releaseCreatureMesh(o);});throw e;}
 return {world:nextWorld,seed,dispose(){for(const a of added){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.rig);a.rig.traverse(o=>{if(o.isMesh){o.skeleton?.dispose();releaseCreatureMesh(o);}});}},commit(){while(aq.animals.length>count){const a=aq.animals.pop();a.rig.parent.remove(a.rig);a.mixer.stopAllAction();a.mixer.uncacheRoot(a.rig);a.rig.traverse(o=>{if(o.isMesh){aq.meshes.splice(aq.meshes.indexOf(o),1);o.skeleton?.dispose();releaseCreatureMesh(o);}});}for(const a of added){aq.root.add(a.rig);aq.animals.push(a);a.rig.traverse(o=>{if(o.isMesh)aq.meshes.push(o);});}}};
}
