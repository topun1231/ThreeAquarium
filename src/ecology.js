const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
/** Ecology seconds advanced for each real second. 6 means 4 real hours = 1 ecology day. */
export const ECOLOGY_RATE=6;
export function ecologySeconds(realSeconds){return Math.max(0,realSeconds)*ECOLOGY_RATE;}
export function ecologyRateCaption(){const hours=24/ECOLOGY_RATE,shown=Number.isInteger(hours)?String(hours):String(Math.round(hours*10)/10);return `游戏 1 天 = 现实 ${shown} 小时`;}
export function realSpanLabel(ecologyDays){const hours=Math.max(0,ecologyDays)*(24/ECOLOGY_RATE);if(hours<1)return '现实不到 1 小时';if(hours<48)return `现实约 ${Math.round(hours)} 小时`;const days=hours/24,shown=Math.round(days*10)/10;return `现实约 ${shown} 天`;}
export function curve(keys,t){
 if(!keys?.length)throw new Error('植物生长曲线缺失');
 if(t<=keys[0].time)return keys[0].value;
 for(let i=1;i<keys.length;i++){const a=keys[i-1],b=keys[i];if(t>b.time)continue;const d=b.time-a.time,u=(t-a.time)/d;
  return (2*u**3-3*u*u+1)*a.value+(u**3-2*u*u+u)*d*a.outSlope+(-2*u**3+3*u*u)*b.value+(u**3-u*u)*d*b.inSlope;
 }return keys.at(-1).value;
}
export function offlineSeconds(savedUtc,now,config){
 const stamp=Date.parse(savedUtc);if(!Number.isFinite(stamp)||!Number.isFinite(now))throw new Error('存档时间无效');
 const hours=clamp((now-stamp)/3600000,0,config.OfflineMaximumRealDays*24),full=config.OfflineFullHours,end=config.OfflineSlowUntilHours,tail=config.OfflineTailRate;
 const x=clamp(hours-full,0,end-full),effective=Math.min(hours,full)+x-(end>full?(1-tail)*x*x/(2*(end-full)):0)+Math.max(0,hours-end)*tail;
 return Math.min(config.OfflineMaximumEffectiveDays*86400,effective*3600);
}
export function advanceEcology(save,definitions,seconds){
 if(!Number.isFinite(seconds)||seconds<0||seconds>365*86400)throw new Error('生态时间无效');
 if(save.Tank.UsesSetupFlow&&!save.Tank.Setup.Filled)return;
 save.SimulationSeconds+=seconds;
 for(const p of save.Tank.Plants){const d=definitions.find(d=>d.TypeId===p.TypeId);if(!d)throw new Error('未知植物品种');p.EcologicalAgeSeconds+=seconds;
  p.Growth=d.UseSpeciesGrowthCurve?Math.min(d.PeakGrowth,Math.max(p.Growth,d.PeakGrowth*curve(d.SpeciesGrowthCurve.m_Curve,clamp(p.EcologicalAgeSeconds/86400*save.Rates.PlantGrowthMultiplier/d.DaysToPeak)))):Math.min(1e6,p.Growth+d.GrowthPerEcologicalDay*seconds/86400*save.Rates.PlantGrowthMultiplier);
  p.Stage=p.Growth<.25?0:p.Growth<.75?1:p.Growth<1.2?2:3;p.LastUpdatedSimulationSeconds=save.SimulationSeconds;
  p.Cuts=p.Cuts.filter(c=>(p.EcologicalAgeSeconds-c.EcologicalAgeAtCut)/86400<d.TrimRecoveryDays);
 }
 settleContinuousGrowth(save.Tank.Plants,definitions);
}
export function plantStructureChanged(before,after){
 if(!before||!after||before.length!==after.length)return true;
 return after.some((plant,index)=>plant.Stage!==before[index].Stage||plant.Cuts.length!==before[index].Cuts.length);
}
export function settleContinuousGrowth(plants,definitions){
 for(const plant of plants){if(!plant.UseContinuousVisualGrowth)continue;const definition=definitions.find(item=>item.TypeId===plant.TypeId);if(definition&&plant.Stage===3&&plant.Growth>=definition.PeakGrowth-1e-3)plant.UseContinuousVisualGrowth=false;}
}
export function plantHeight(record,heights,definition,species){
 const h=[heights[0]*(species===2?2.8125:1),heights[1]*(species===2?1.2:1),heights[2],heights[3]*(species===0?1.04:1)],g=record.Growth,lerp=(a,b,t)=>a+(b-a)*clamp(t);
 return g<.25?lerp(h[0]*.95,h[0],g/.25):g<.75?lerp(h[0],h[1],(g-.25)/.5):g<1.2?lerp(h[1],h[2],(g-.75)/.45):lerp(h[2],h[3],(g-1.2)/(definition.PeakGrowth-1.2));
}
export function advanceCreatureEcology(game,seconds,profile,anchors,realSeconds=seconds){const hours=Math.min(seconds/3600,336);for(const c of game.creatures){c.Needs.Hunger=clamp(c.Needs.Hunger+hours*profile.EcologicalHungerPerHour);c.Needs.Stress=Math.max(0,c.Needs.Stress-hours*profile.EcologicalStressRecoveryPerHour);}game.food=game.food.map((v,i)=>{const target=[.32,.62,.85,.55][anchors[i]?.kind??0],step=hours*.035;return v<target?Math.min(target,v+step):Math.max(target,v-step);});if(game.pellet){game.pellet.age+=Math.min(241,Math.max(0,realSeconds));if(game.pellet.age>240)game.pellet=null;}return game;}
