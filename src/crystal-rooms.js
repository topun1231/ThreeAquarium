import {stableSeed} from './state.js';
import {LEGACY_NAVIGATION_LIMIT} from './navigation-budget.js';
import {emptyColony, MATURITY_DAYS} from './care.js';
import {validateStock} from './population.js';
import {validateGame,validatePellet} from './creatures.js';
import {ecologySeconds} from './ecology.js';
import {crystalGrowthFraction} from './crystal-breeding.js';

export const CRYSTAL_BACKUP_KEY='aquarium.three.before-crystal.v1';
export const CRYSTAL_RESUME_KEY='aquarium.three.crystal-resume.v1';
const FRESH_HATCH_MS=60_000;
const growthMilestones={formed:'formedAt',hatched:'hatchAt',complete:'adultAt'};
export function crystalGrowthEvents(before,after){
 if(!before || !after)return [];
 const events=[],stages=new Map(before.batches.map(b=>[b.id,b.status]));
 for(const b of after.batches){
  if(stages.has(b.id) && stages.get(b.id)!==b.status && growthMilestones[b.status])
   events.push({kind:'batch',id:b.id,stage:b.status,at:b[growthMilestones[b.status]]});
 }
 const previous=new Set(before.individuals.map(r=>r.id));
 for(const r of after.individuals){
  if(r.source==='bred' || r.soldAt!==null)continue;
  if(previous.has(r.id)){
   if(r.adultAt>before.now && r.adultAt<=after.now)events.push({kind:'individual',id:r.id,stage:'complete',at:r.adultAt});
  }else if(r.legacy && r.legacyAgeDays===0){
   // A carried clutch's child gets one full growth period from its actual birth, including after a capacity wait.
   const birthAt=r.adultAt-after.growthMs;
   if(birthAt>=before.now && birthAt<=after.now){
    const adult=r.adultAt<=after.now;
    events.push({kind:'individual',id:r.id,stage:adult?'complete':'hatched',at:adult?r.adultAt:birthAt});
   }
  }
 }
 return events.sort((a,b)=>b.at-a.at);
}
export function roomCore(session){const core=structuredClone(session);delete core.Breeding;delete core.BreedingRooms;return core;}
function crystalAgeDays(state,r,now){
 if(r.legacy)return Math.max(r.legacyAgeDays,now>=r.adultAt?MATURITY_DAYS:MATURITY_DAYS*(1-(r.adultAt-now)/state.growthMs));
 if(now>=r.adultAt)return 120;
 return MATURITY_DAYS*crystalGrowthFraction(r,now,state);
}
function legacyHatchTime(r,now,simSeconds){
 return r.legacyHatchAt===null?null:simSeconds+ecologySeconds(Math.max(0,r.legacyHatchAt-now)/1000);
}
export function updateCrystalResidentClocks(state,colony,now,simSeconds){
 if(!Object.values(colony.shrimp).some(r=>r.ageDays<MATURITY_DAYS || r.hatchAt!=null))return;
 now=Math.max(now,state.now);
 for(const r of state.individuals){
  const resident=colony.shrimp[r.id];
  if(!resident)continue;
  if(resident.ageDays<MATURITY_DAYS)resident.ageDays=Math.max(resident.ageDays,crystalAgeDays(state,r,now));
  if(resident.hatchAt!=null && r.legacy)resident.hatchAt=legacyHatchTime(r,now,simSeconds);
 }
}
export function crystalColony(state,tankId,old=emptyColony(),now=state.now,simSeconds=0){
 const colony={...structuredClone(old),shrimp:{}};
 for(const r of state.individuals.filter(r=>r.soldAt===null&&r.tank===tankId)){
  const ageDays=crystalAgeDays(state,r,now);
  if(r.legacy){const previous=old.shrimp?.[r.id]||{};colony.shrimp[r.id]={...previous,name:r.name,favorite:r.protected,sex:r.sex,ageDays,hatchAt:legacyHatchTime(r,now,simSeconds),restUntil:previous.restUntil||0};continue;}
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
export function projectCrystalRooms(session,game,state,source,template,target=session.BreedingRooms.activeId,hatches=[]){
 const old=session.BreedingRooms,oldId=old.activeId,rooms=structuredClone(old.rooms);
 if(!state.tanks.some(t=>t.id===target))throw new Error('繁育缸尚未购买');
 if(target!==oldId){rooms.push({id:oldId,session:roomCore(session),game:{elapsed:game.elapsed,food:game.food,navigation:game.navigation,pellet:game.pellet}});}
 for(const tank of state.tanks)if(tank.id!==oldId&&!rooms.some(r=>r.id===tank.id))rooms.push({id:tank.id,session:blankBreedingRoom(source,tank.id)});
 const core=target===oldId?roomCore(session):rooms.find(r=>r.id===target).session;
 const records=new Map([...old.creatures,...(old.resting||[]),...game.creatures].map(c=>[c.CreatureId,c]));
 const previous=new Map(session.Breeding.individuals.map(r=>[r.id,r]));
 const pending=new Set(old.unseated||[]);
 const sites=new Map((old.pendingHatches||[]).map(site=>[site.id,site]));
 for(const hatch of hatches){
  // An unseated mother has no position in this room yet. Seat her first on entry.
  const located=previous.get(hatch.motherId)?.tank===hatch.tankId && !pending.has(hatch.motherId);
  const position=located && records.get(hatch.motherId)?.Position;
  sites.set(hatch.id,position?{...hatch,position:{...position}}:hatch);
 }
 const currentIds=new Set(target===oldId?game.creatures.map(c=>c.CreatureId):old.creatures.filter(c=>previous.get(c.CreatureId)?.tank===target).map(c=>c.CreatureId));
 const active=[],inactive=[],resting=[],arrivals=[],hatchSites=[],pendingHatches=[];
 for(const r of state.individuals.filter(r=>r.soldAt===null)){
  const moved=previous.has(r.id) && previous.get(r.id).tank!==r.tank;
  if(!records.has(r.id)||previous.get(r.id)?.tank!==r.tank)pending.add(r.id);
  const c=structuredClone(records.get(r.id)||newCreature(r,template));
  if(r.tank==='rest'){resting.push(c);continue;}
  const site=sites.get(r.id);
  if(site && pending.has(r.id) && !moved && site.tankId===r.tank && state.now-site.at<=FRESH_HATCH_MS && state.now<r.adultAt)
   (r.tank===target?hatchSites:pendingHatches).push(site);
  if(r.tank===target){active.push(c);if(!currentIds.has(r.id)||pending.has(r.id))arrivals.push(r.id);pending.delete(r.id);}else inactive.push(c);
 }
 const next={...core,Breeding:state,BreedingRooms:{version:1,...(old.unified===1?{unified:1}:{}),activeId:target,rooms:rooms.filter(r=>r.id!==target),creatures:inactive,unseated:[...pending].filter(id=>inactive.some(c=>c.CreatureId===id))}};
 if(pendingHatches.length)next.BreedingRooms.pendingHatches=pendingHatches;
 const unread=new Map((old.unreadGrowth || []).map(e=>[e.kind+':'+e.id,e]));
 const growthEvents=crystalGrowthEvents(session.Breeding,state);
 for(const event of growthEvents)unread.set(event.kind+':'+event.id,event);
 if(unread.size)next.BreedingRooms.unreadGrowth=[...unread.values()];
 if(resting.length)next.BreedingRooms.resting=resting;
 next.Colony=crystalColony(state,target,next.Colony,state.now,next.SimulationSeconds);
 const out={...structuredClone(game),creatures:active,stock:{tankId:next.Tank.UniqueId,creatures:structuredClone(active)}};delete out.anchors;
 if(target!==oldId)Object.assign(out,rooms.find(r=>r.id===target).game||{food:[],navigation:[],pellet:null,elapsed:0});
 return {session:next,game:out,arrivals,growthEvents,hatchSites};
}
export function validateCrystalRooms(session,validateCore){
 const state=session.Breeding,rooms=session.BreedingRooms;
 if(rooms?.unified!==undefined&&(rooms.unified!==1||!state.unified))throw new Error('统一鱼缸标记无效');
 if(!rooms||rooms.version!==1||!state.tanks.some(t=>t.id===rooms.activeId)||!Array.isArray(rooms.rooms)||rooms.rooms.length!==state.tanks.length-1||new Set(rooms.rooms.map(r=>r?.id)).size!==rooms.rooms.length)throw new Error('养成鱼缸记录无效');
 if(rooms.unreadGrowth!==undefined){
  const events=rooms.unreadGrowth;
  if(!Array.isArray(events)||events.length>state.batches.length+state.individuals.length)throw new Error('成长消息记录无效');
  const batches=new Map(state.batches.map(b=>[b.id,b])), individuals=new Map(state.individuals.map(r=>[r.id,r])), keys=new Set();
  for(const e of events){
   const batch=e?.kind==='batch' && batches.get(e.id), individual=e?.kind==='individual' && individuals.get(e.id);
   const valid=batch && Object.hasOwn(growthMilestones,e.stage) && batch.status===e.stage && e.at===batch[growthMilestones[e.stage]]
    || individual && individual.source!=='bred' && (e.stage==='complete' && e.at===individual.adultAt || e.stage==='hatched' && individual.legacy && e.at<individual.adultAt);
   if(!valid||!Number.isSafeInteger(e.at)||e.at<0||e.at>state.now||keys.has(e.kind+':'+e.id))throw new Error('成长消息与虾册不一致');
   keys.add(e.kind+':'+e.id);
  }
 }
 const unique=new Set([session.Tank.UniqueId]);
 for(const room of rooms.rooms){
  if(!state.tanks.some(t=>t.id===room.id)||room.id===rooms.activeId||room.session?.Breeding||room.session?.BreedingRooms)throw new Error('养成鱼缸关联无效');
  room.session=validateCore(room.session);
  if(unique.has(room.session.Tank.UniqueId))throw new Error('两个鱼缸不能使用同一身份');unique.add(room.session.Tank.UniqueId);
  const g=room.game;
  if(g){
   if(!Number.isFinite(g.elapsed)||g.elapsed<0||g.elapsed>1e12||!Array.isArray(g.food)||g.food.length>LEGACY_NAVIGATION_LIMIT||g.food.some(v=>!Number.isFinite(v)||v<0||v>1)||!Array.isArray(g.navigation)||g.navigation.length!==g.food.length||g.navigation.some(a=>typeof a?.owner!=='string'||!Number.isInteger(a.kind)||a.kind<0||a.kind>3||!Array.isArray(a.position)||a.position.length!==3||a.position.some(v=>!Number.isFinite(v)||Math.abs(v)>1)))throw new Error('分缸生态记录无效');
   validatePellet(g.pellet,g.navigation.length);
  }
 }
 validateCrystalRoster(state,rooms.creatures,rooms.activeId,false);
 if(rooms.resting!==undefined || state.individuals.some(r=>r.tank==='rest'))validateCrystalRoster(state,rooms.resting,'rest');
 if(rooms.unseated!==undefined&&(!Array.isArray(rooms.unseated)||new Set(rooms.unseated).size!==rooms.unseated.length||rooms.unseated.some(id=>!rooms.creatures.some(c=>c.CreatureId===id))))throw new Error('待入缸身份记录无效');
 if(rooms.pendingHatches!==undefined){
  const sites=rooms.pendingHatches,residents=new Map(state.individuals.map(r=>[r.id,r]));
  if(!Array.isArray(sites)||sites.length>(rooms.unseated?.length??0)||new Set(sites.map(s=>s?.id)).size!==sites.length)throw new Error('待入缸出生位置无效');
  for(const site of sites){
   const child=residents.get(site?.id),mother=residents.get(site?.motherId);
   const related=child?.source==='bred'?child.parents[0]===mother?.id:child?.legacy && child.legacyAgeDays===0 && mother?.legacy;
   const p=site?.position;
   if(!mother||!child||mother===child||!related||!rooms.unseated.includes(child.id)||child.tank!==site.tankId||
      site.at!==child.adultAt-state.growthMs+(child.legacy?0:state.stageMs.hatch)||site.at>state.now||
      (p!==undefined && (!p||![p.x,p.y,p.z].every(Number.isFinite)||Math.abs(p.x)>.6||Math.abs(p.z)>.3||p.y<0||p.y>.59)))
    throw new Error('出生位置与待入缸幼虾不一致');
  }
 }
}
export function validateCrystalRoster(state,creatures,tankId,active=true){
 const expected=state.individuals.filter(r=>r.soldAt===null&&(active?r.tank===tankId:r.tank!==tankId&&r.tank!=='rest'));
 const stock=validateStock({tankId,creatures});
 if(creatures.length!==expected.length||creatures.some(c=>{const r=expected.find(r=>r.id===c.CreatureId);return !r||c.SpeciesId!==(r.legacy?r.species:'crystal-shrimp');}))throw new Error('水晶虾身份与所在缸不匹配');
 validateGame({version:1,tankId,elapsed:0,creatures,food:[],pellet:null},{...stock,anchors:[]});
}
