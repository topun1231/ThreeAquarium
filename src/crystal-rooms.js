import {stableSeed} from './state.js';
import {emptyColony, MATURITY_DAYS} from './care.js';
import {validateStock} from './population.js';
import {validateGame} from './creatures.js';
import {ecologySeconds} from './ecology.js';

export const CRYSTAL_BACKUP_KEY='aquarium.three.before-crystal.v1';
export const CRYSTAL_RESUME_KEY='aquarium.three.crystal-resume.v1';
export function crystalChangeNotice(before,after){
 const born=after.individuals.filter(r=>r.soldAt===null&&!before.individuals.some(p=>p.id===r.id)).length;
 const adult=before.individuals.filter(r=>r.soldAt===null&&r.adultAt>before.now&&r.adultAt<=after.now).length;
 const formed=after.batches.filter(b=>b.status==='formed'&&before.batches.find(p=>p.id===b.id)?.status==='planned').length;
 return born?`新增 ${born} 只后代，已按经过的时间成长；可以去虾册查看。`:adult?`${adult} 只水晶虾成年了，可以比较品质、留种或参赛。`:formed?`${formed} 窝已经抱卵，后代结果已固定，敲玻璃不会掉卵。`:'';
}
export function roomCore(session){const core=structuredClone(session);delete core.Breeding;delete core.BreedingRooms;return core;}
export function crystalColony(state,tankId,old=emptyColony(),now=state.now,simSeconds=0){
 const colony={...structuredClone(old),shrimp:{}};
 for(const r of state.individuals.filter(r=>r.soldAt===null&&r.tank===tankId)){
  if(r.legacy){const previous=old.shrimp?.[r.id]||{};colony.shrimp[r.id]={...previous,name:r.name,favorite:r.protected,sex:r.sex,ageDays:Math.max(r.legacyAgeDays,now>=r.adultAt?MATURITY_DAYS:MATURITY_DAYS*(1-(r.adultAt-now)/state.growthMs)),hatchAt:r.legacyHatchAt===null?null:simSeconds+ecologySeconds(Math.max(0,r.legacyHatchAt-now)/1000),restUntil:previous.restUntil||0};continue;}
  const born=state.batches.find(b=>b.children.some(c=>c.id===r.id))?.hatchAt??r.adultAt-(state.growthMs-state.stageMs.hatch);
  const ageDays=now>=r.adultAt?120:MATURITY_DAYS*Math.max(0,(now-born)/(r.adultAt-born));
  colony.shrimp[r.id]={name:r.name||[...r.id].slice(0,16).join(''),favorite:r.protected,sex:r.sex,ageDays,hatchAt:null,restUntil:0};
 }
 return colony;
}
export function blankBreedingRoom(source,id){
 const s=roomCore(source);s.Tank.UniqueId='crystal-'+id;s.Tank.Plants=[];s.Tank.Hardscape=[];s.Tank.Flora=[];
 s.Tank.Setup={...s.Tank.Setup,Filled:true,PreparationStep:3};s.Tank.Environment={...s.Tank.Environment,WaterLevel:.92};
 s.Colony=emptyColony();s.LastSaveUtc=new Date().toISOString();return s;
}
function newCreature(individual,template){
 const c=structuredClone(template);c.CreatureId=individual.id;c.SpeciesId=individual.legacy?individual.species:'crystal-shrimp';
 for(const key of Object.keys(c.Personality))c.Personality[key]=.8+stableSeed(individual.id+key)/4294967295*.4;
 c.Needs={Hunger:.35,Stress:0,Fatigue:.1,GroomNeed:.1,Monotony:0};c.CurrentIntent=c.ExecutionState='Rest';
 c.Memory={...c.Memory,RecentThreatTime:-1,FavouriteStrength:0,LastFoodAnchor:'',LastHideAnchor:'',RecentBehaviour:''};return c;
}
// The active room lives in the normal save; only inactive layouts/creatures are stored here.
export function projectCrystalRooms(session,game,state,source,template,target=session.BreedingRooms.activeId){
 const old=session.BreedingRooms,oldId=old.activeId,rooms=structuredClone(old.rooms);
 if(!state.tanks.some(t=>t.id===target))throw new Error('繁育缸尚未购买');
 if(target!==oldId){rooms.push({id:oldId,session:roomCore(session),game:{elapsed:game.elapsed,food:game.food,navigation:game.navigation,pellet:game.pellet}});}
 for(const tank of state.tanks)if(tank.id!==oldId&&!rooms.some(r=>r.id===tank.id))rooms.push({id:tank.id,session:blankBreedingRoom(source,tank.id)});
 const core=target===oldId?roomCore(session):rooms.find(r=>r.id===target).session;
 const records=new Map([...old.creatures,...game.creatures].map(c=>[c.CreatureId,c]));
 const pending=new Set(old.unseated||[]);
 const currentIds=new Set(target===oldId?game.creatures.map(c=>c.CreatureId):old.creatures.filter(c=>session.Breeding.individuals.find(r=>r.id===c.CreatureId)?.tank===target).map(c=>c.CreatureId));
 const active=[],inactive=[],arrivals=[];
 for(const r of state.individuals.filter(r=>r.soldAt===null)){
  if(!records.has(r.id)||session.Breeding.individuals.find(i=>i.id===r.id)?.tank!==r.tank)pending.add(r.id);
  const c=structuredClone(records.get(r.id)||newCreature(r,template));
  if(r.tank===target){active.push(c);if(!currentIds.has(r.id)||pending.has(r.id))arrivals.push(r.id);pending.delete(r.id);}else inactive.push(c);
 }
 const next={...core,Breeding:state,BreedingRooms:{version:1,...(old.unified===1?{unified:1}:{}),activeId:target,rooms:rooms.filter(r=>r.id!==target),creatures:inactive,unseated:[...pending].filter(id=>inactive.some(c=>c.CreatureId===id))}};
 next.Colony=crystalColony(state,target,next.Colony,state.now,next.SimulationSeconds);
 const out={...structuredClone(game),creatures:active,stock:{tankId:next.Tank.UniqueId,creatures:structuredClone(active)}};delete out.anchors;
 if(target!==oldId)Object.assign(out,rooms.find(r=>r.id===target).game||{food:[],navigation:[],pellet:null,elapsed:0});
 return {session:next,game:out,arrivals};
}
export function validateCrystalRooms(session,validateCore){
 const state=session.Breeding,rooms=session.BreedingRooms;
 if(rooms?.unified!==undefined&&(rooms.unified!==1||!state.unified))throw new Error('统一鱼缸标记无效');
 if(!rooms||rooms.version!==1||!state.tanks.some(t=>t.id===rooms.activeId)||!Array.isArray(rooms.rooms)||rooms.rooms.length!==state.tanks.length-1||new Set(rooms.rooms.map(r=>r?.id)).size!==rooms.rooms.length)throw new Error('养成鱼缸记录无效');
 const unique=new Set([session.Tank.UniqueId]);
 for(const room of rooms.rooms){
  if(!state.tanks.some(t=>t.id===room.id)||room.id===rooms.activeId||room.session?.Breeding||room.session?.BreedingRooms)throw new Error('养成鱼缸关联无效');
  room.session=validateCore(room.session);
  if(unique.has(room.session.Tank.UniqueId))throw new Error('两个鱼缸不能使用同一身份');unique.add(room.session.Tank.UniqueId);
  const g=room.game;
  if(g){
   if(!Number.isFinite(g.elapsed)||g.elapsed<0||g.elapsed>1e12||!Array.isArray(g.food)||g.food.length>12000||g.food.some(v=>!Number.isFinite(v)||v<0||v>1)||!Array.isArray(g.navigation)||g.navigation.length!==g.food.length||g.navigation.some(a=>typeof a?.owner!=='string'||!Number.isInteger(a.kind)||a.kind<0||a.kind>3||!Array.isArray(a.position)||a.position.length!==3||a.position.some(v=>!Number.isFinite(v)||Math.abs(v)>1)))throw new Error('分缸生态记录无效');
   if(g.pellet!==null&&(!Number.isInteger(g.pellet?.anchor)||!g.navigation[g.pellet.anchor]||!Number.isFinite(g.pellet.age)||g.pellet.age<0||g.pellet.age>240))throw new Error('分缸饲料记录无效');
  }
 }
 validateCrystalRoster(state,rooms.creatures,rooms.activeId,false);
 if(rooms.unseated!==undefined&&(!Array.isArray(rooms.unseated)||new Set(rooms.unseated).size!==rooms.unseated.length||rooms.unseated.some(id=>!rooms.creatures.some(c=>c.CreatureId===id))))throw new Error('待入缸身份记录无效');
}
export function validateCrystalRoster(state,creatures,tankId,active=true){
 const expected=state.individuals.filter(r=>r.soldAt===null&&(active?r.tank===tankId:r.tank!==tankId));
 const stock=validateStock({tankId,creatures});
 if(creatures.length!==expected.length||creatures.some(c=>{const r=expected.find(r=>r.id===c.CreatureId);return !r||c.SpeciesId!==(r.legacy?r.species:'crystal-shrimp');}))throw new Error('水晶虾身份与所在缸不匹配');
 validateGame({version:1,tankId,elapsed:0,creatures,food:[],pellet:null},{...stock,anchors:[]});
}
