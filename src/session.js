import {Substrate,sanitizeSubstrateKind} from './substrate.js';
import {sanitizeColony} from './care.js';
import {sanitizeFlora} from './flora.js';
const finite=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
export function validateSession(value,runtime){
 if(!value||value.SaveVersion!==1||!value.Tank||!finite(value.SimulationSeconds,0,1e12)||!Number.isFinite(Date.parse(value.LastSaveUtc)))throw new Error('完整鱼缸存档无效');
 const s=structuredClone(value),tank=s.Tank,ids=new Set();if(typeof tank.UniqueId!=='string'||tank.UniqueId.length>100||!tank.Setup||!Number.isInteger(tank.Setup.PreparationStep)||tank.Setup.PreparationStep<0||tank.Setup.PreparationStep>3||typeof tank.Setup.Filled!=='boolean')throw new Error('鱼缸阶段无效');
 if(!Array.isArray(tank.Plants)||tank.Plants.length>120||!Array.isArray(tank.Hardscape)||tank.Hardscape.length>24)throw new Error('造景数量超出上限');
 for(const r of [...tank.Plants,...tank.Hardscape]){if(typeof r.UniqueId!=='string'||r.UniqueId.length>100||ids.has(r.UniqueId))throw new Error('造景身份无效');ids.add(r.UniqueId);for(const k of ['x','y','z'])if(!finite(r.Position?.[k],-1,1)||!finite(r.Rotation?.[k],-3600,3600)||!finite(r.Scale?.[k],.000001,100))throw new Error('造景位置或尺寸无效');if(Math.abs(r.Position.x)>.65||Math.abs(r.Position.z)>.35||r.Position.y<-.1||r.Position.y>.65)throw new Error('造景超出鱼缸');}
 for(const p of tank.Plants){if(!runtime.definitions.some(d=>d.TypeId===p.TypeId)||!finite(p.Growth,0,1e6)||!finite(p.EcologicalAgeSeconds,0,1e12)||!Number.isInteger(p.Stage)||p.Stage<0||p.Stage>3||!finite(p.Health,0,1)||!Array.isArray(p.Cuts)||p.Cuts.length>100)throw new Error('植物生长记录无效');
  for(const c of p.Cuts)if(!['x','y','z'].every(k=>finite(c.LocalCenter?.[k],-10,10))||!finite(c.RadiusMeters,.001,.3)||!finite(c.HeightFraction,0,1)||!finite(c.HeightMeters,0,1)||!finite(c.EcologicalAgeAtCut,0,p.EcologicalAgeSeconds))throw new Error('修剪记录无效');
 }
 for(const r of tank.Hardscape)if(!runtime.entries.has(r.TypeId)||r.Burial!==undefined&&!finite(r.Burial,0,.03))throw new Error('木石规格无效');
 for(const key of ['PlantGrowthMultiplier','TankMaturityMultiplier','EvaporationMultiplier','AlgaeGrowthMultiplier','MaintenancePressureMultiplier'])if(!finite(s.Rates?.[key],0,1000))throw new Error('生态倍率无效');
 if(!tank.Environment||!['WaterLevel','Stability','Cleanliness','Algae'].every(k=>finite(tank.Environment[k],0,1))||typeof tank.Environment.LightOn!=='boolean')throw new Error('水环境记录无效');
 if(s.Colony!=null)s.Colony=sanitizeColony(s.Colony);
 if(tank.Flora!=null){tank.Flora=sanitizeFlora(tank.Flora);for(const r of tank.Flora){if(ids.has(r.UniqueId))throw new Error('造景身份无效');ids.add(r.UniqueId);if(r.Host&&!tank.Hardscape.some(h=>h.UniqueId===r.Host))throw new Error('附生水草缺少附着木石');}runtime.validateFloraHosts?.(tank);}
 sanitizeSubstrateKind(tank.Substrate);
 new Substrate(runtime.settings,tank.Substrate);return s;
}

