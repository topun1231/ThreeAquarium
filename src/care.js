import {stableSeed} from './state.js';
import {broodQualityTarget,hasGoalColour,meetsBroodGoal} from './crystal-traits.js';
import {realSpanLabel} from './ecology.js';
import {FEEDING_RADIUS,PELLET_SINK_SECONDS} from './feeding-pellet.js';
import {floraCatalogLabel, unityPlantName} from './plant-names.js';

export const activityNames = {Graze:'摄食', Groom:'清洁', Walk:'行走', Climb:'攀爬', RoutineSwim:'短游', EscapeSwim:'弹尾', Hide:'躲藏', Rest:'休息'};
const DAY = 86400;
export {FEEDING_RADIUS};
export const MATURITY_DAYS = 75;
export const BERRY_DAYS = 28;
export const REST_DAYS = 14;
export const ADULT_AGE = 120;
export const BERRY_HUNGER = 0.45;
export const BERRY_STRESS = 0.35;
export const CROWD_LIMIT = 36;
export const POP_CAP = 50;
export const NAME_LIMIT = 16;
export const TREAT_BONUS = 0.12;

export const observationNames={LatestBrood:'最近一窝的在缸后代',GoalHatchlings:'长出目标花色的幼虾',GoalAdults:'达到选育目标的成虾',...activityNames,Berried:'抱卵中',Juvenile:'成长中的幼虾',MealVisitors:'吃过最近一次加餐',RookieEntrants:'新秀赛代表'};
export function observationRoster(agents,colony,batches=[]){
  const counts=new Map();
  const entries=agents.map(({data:{CreatureId:id}})=>{
    const label=colony?.shrimp?.[id]?.name || id;
    counts.set(label,(counts.get(label)||0)+1);
    return {value:id,label};
  });
  const residents=new Map(entries.map(entry=>[entry.value,entry]));
  for(let i=batches.length-1;i>=0 && residents.size;i--){
    const batch=batches[i];
    if(batch.status!=='hatched' && batch.status!=='complete')continue;
    for(const [position,child] of batch.children.entries()){
      const entry=residents.get(child.id);
      if(!entry)continue;
      const order=counts.get(entry.label)>1?'第 '+(position+1)+' 只':'';
      entry.label+=' · 第 '+(i+1)+' 窝'+order;
      if(batch.rookieEntry?.entrantId===child.id)entry.label+=' · 新秀赛第 '+batch.rookieEntry.rank+' 名';
      residents.delete(child.id);
    }
  }
  const sameNameOrder=new Map();
  for(const entry of residents.values()){
    if(counts.get(entry.label)<2)continue;
    const position=(sameNameOrder.get(entry.label)||0)+1;
    sameNameOrder.set(entry.label,position);
    entry.label+=' · 同名第 '+position+' 只';
  }
  const favorites=[],others=[];
  for(const entry of entries){
    if(colony?.shrimp?.[entry.value]?.favorite){
      entry.label+=' · 已收藏';
      favorites.push(entry);
    }else others.push(entry);
  }
  return favorites.concat(others);
}
export function observationGroups(agents,colony,batches=[],individuals=[]){
  const groups=Object.fromEntries(Object.keys(observationNames).map(key=>[key,[]]));
  const mothers=new Set(), entrants=new Set();
  const residents=new Set(agents.map(agent=>agent.data.CreatureId));
  let latest,family;
  for(let i=batches.length-1;i>=0;i--){
    const batch=batches[i];
    if(batch.status==='hatched' && batch.goal){
      for(const kid of batch.children)if(residents.has(kid.id) && hasGoalColour(kid,batch.goal))groups.GoalHatchlings.push(kid.id);
    }
    if(batch.status==='complete' && (batch.goal || batch.qualityGoal)){
      const kids=batch.children.filter(kid=>residents.has(kid.id));
      if(kids.length){
        if(batch.qualityGoal)family??=new Map(individuals.map(r=>[r.id,r]));
        const target=broodQualityTarget(batch.qualityGoal,family?.get(batch.motherId),family?.get(batch.fatherId));
        for(const kid of kids)if((!batch.qualityGoal || target) && meetsBroodGoal(kid,batch.goal,target))groups.GoalAdults.push(kid.id);
      }
    }
    if(batch.status==='formed')mothers.add(batch.motherId);
    if(batch.rookieEntry)entrants.add(batch.rookieEntry.entrantId);
    if((batch.status==='hatched' || batch.status==='complete') && (!latest || batch.hatchAt>latest.hatchAt) &&
        batch.children?.some(child=>residents.has(child.id)))latest=batch;
  }
  if(latest)groups.LatestBrood=latest.children.map(child=>child.id).filter(id=>residents.has(id));
  const visitors=new Set(colony?.lastFeeding);
  for(const {data:{CreatureId:id,ExecutionState:state}} of agents){
    const record=colony?.shrimp?.[id];
    if(entrants.has(id))groups.RookieEntrants.push(id);
    if(visitors.has(id))groups.MealVisitors.push(id);
    if(Object.hasOwn(activityNames,state))groups[state].push(id);
    if(record?.hatchAt!=null || mothers.has(id))groups.Berried.push(id);
    if(record?.ageDays<MATURITY_DAYS)groups.Juvenile.push(id);
  }
  return groups;
}

export function isFemale(id) { return stableSeed(String(id)) % 2 === 0; }

export function parseShrimpName(value) {
  if (typeof value !== 'string') throw new Error('虾的名字无效');
  const name = value.trim();
  const length = [...name].length;
  if (!length || length > NAME_LIMIT) throw new Error('虾的名字需为 1–16 个字');
  if (/[\u0000-\u001f]/.test(name)) throw new Error('虾的名字无效');
  return name;
}

export function emptyColony() { return {shrimp:{}, journal:[], treat:0}; }

export function biofilmRichness({plants = 0, hardscape = 0, simSeconds = 0} = {}) {
  const leaf = Math.min(1, Math.max(0, plants) / 24);
  const stone = Math.min(1, Math.max(0, hardscape) / 4);
  const maturity = Math.min(1, Math.max(0, simSeconds) / DAY / 21);
  return Math.min(1, leaf * 0.62 + stone * 0.18 + maturity * 0.2);
}

function adultRecord(index) {
  return {name:`${index + 1}号`, favorite:false, ageDays:ADULT_AGE, hatchAt:null, restUntil:0};
}

export function syncRoster(colony, agents) {
  const book = colony?.shrimp ? colony : emptyColony();
  const ids = new Set(agents.map(agent => agent.data.CreatureId));
  for (const id of Object.keys(book.shrimp)) if (!ids.has(id)) delete book.shrimp[id];
  agents.forEach((agent, index) => {
    const id = agent.data.CreatureId;
    if (!book.shrimp[id]) book.shrimp[id] = adultRecord(index);
  });
  return book;
}

export function babyName(colony) {
  const used = new Set(Object.values(colony.shrimp).map(record => record.name));
  for (let n = 1; n < 80; n++) if (!used.has(`幼虾${n}`)) return `幼虾${n}`;
  return '幼虾';
}

function pushJournal(colony, simSeconds, text) {
  const day = Math.floor(simSeconds / DAY) + 1;
  const last = colony.journal.at(-1);
  if (last && last.day === day && last.text === text) return;
  colony.journal.push({day, text});
  if (colony.journal.length > 8) colony.journal.shift();
}

function readyToBerry(agent, record, simSeconds, richness, treat, room) {
  if (!room || !isFemale(agent.data.CreatureId) || record.ageDays < MATURITY_DAYS) return false;
  if (record.hatchAt != null || simSeconds < (record.restUntil || 0)) return false;
  const needs = agent.data.Needs;
  const fed = needs.Hunger < BERRY_HUNGER || (needs.Hunger < 0.55 && treat > 0.05);
  if (!fed || needs.Stress >= BERRY_STRESS) return false;
  return richness + Math.min(TREAT_BONUS, treat) >= 0.35;
}

export function colonyTick(colony, agents, seconds, simSeconds, {richness = 0, limit = POP_CAP} = {}) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 365 * DAY) throw new Error('生态时间无效');
  const next = {...colony,shrimp:{...colony.shrimp}, journal:[...(colony.journal || [])], treat:Math.max(0, Math.min(1, colony.treat || 0))};
  if(colony.lastFeeding)next.lastFeeding=[...colony.lastFeeding];
  for (const [id, record] of Object.entries(next.shrimp)) next.shrimp[id] = {...record};
  syncRoster(next, agents);
  let hatches = 0;
  let cursor = simSeconds - seconds;
  while (cursor < simSeconds - 1e-8) {
    const dt = Math.min(DAY, simSeconds - cursor);
    cursor += dt;
    const treatNow = next.treat;
    next.treat = Math.max(0, next.treat - dt / (2 * DAY));
    for (const agent of agents) {
      const record = next.shrimp[agent.data.CreatureId];
      record.ageDays = Math.min(20000, record.ageDays + dt / DAY);
      if (record.hatchAt == null) continue;
      if (cursor >= record.hatchAt) {
        record.hatchAt = null;
        record.restUntil = cursor + REST_DAYS * DAY;
        if (agents.length + hatches < limit) {
          hatches += 1;
          pushJournal(next, cursor, `${record.name}的卵孵出 1 只幼虾`);
        } else pushJournal(next, cursor, `缸已满，${record.name}的幼虾没有留下`);
      }
    }
    const room = agents.length + hatches < Math.min(limit, CROWD_LIMIT);
    for (const agent of agents) {
      const record = next.shrimp[agent.data.CreatureId];
      if (!readyToBerry(agent, record, cursor, richness, treatNow, room)) continue;
      record.hatchAt = cursor + BERRY_DAYS * DAY;
      pushJournal(next, cursor, `${record.name}抱卵，${countdown(BERRY_DAYS)}`);
    }
  }
  return {colony:next, hatches};
}

export function noteTreat(colony, pelletBusy) {
  const next = {...colony, treat:colony.treat || 0};
  if (pelletBusy || next.treat >= TREAT_BONUS) return {colony:next, stacked:false};
  next.treat = TREAT_BONUS;
  return {colony:next, stacked:true};
}

function countdown(ecologyDays, verb = '孵出') {
  return `约 ${ecologyDays} 天后${verb}（${realSpanLabel(ecologyDays)}）`;
}

function dayLabel(seconds) {
  const days = Math.max(0, seconds / DAY);
  return days < 1 ? '不到 1 天' : `${Math.floor(days)} 天`;
}

export function plantLine(plants, definitions, flora = []) {
  const unity = plants || [], extra = flora || [], total = unity.length + extra.length;
  if (!total) return '缸里还没有水草。';
  if (extra.length && !unity.length) {
    const names = [...new Set(extra.map(r => floraCatalogLabel(r.Species, r.Variant)))];
    return extra.length === 1 ? names[0] : `水草 ${extra.length} 株 · ${names.slice(0, 3).join('、')}`;
  }
  let youngest = unity[0];
  for (const plant of unity) if (plant.EcologicalAgeSeconds < youngest.EcologicalAgeSeconds) youngest = plant;
  const index = definitions.findIndex(item => item.TypeId === youngest.TypeId);
  const definition = definitions[index];
  const peak = definition?.PeakGrowth > 0 ? definition.PeakGrowth : 1;
  const pct = Math.round(Math.min(100, youngest.Growth / peak * 100));
  const name = unityPlantName(youngest.TypeId, definitions);
  const age = `${name}种下 ${dayLabel(youngest.EcologicalAgeSeconds)}，长到峰值的 ${pct}%`;
  return total === 1 ? age : `水草 ${total} 株 · 最年轻的${age}`;
}

export function shrimpDetail(agent, record, simSeconds) {
  if (!agent || !record) return '';
  const needs = agent.data.Needs;
  const daysLeft = record.hatchAt == null ? null : Math.max(0, Math.ceil((record.hatchAt - simSeconds) / DAY));
  const stage = record.ageDays < MATURITY_DAYS ? `幼体 ${Math.floor(record.ageDays)} 天` : `成体 ${Math.floor(record.ageDays)} 天`;
  const sex = isFemale(agent.data.CreatureId) ? '母' : '公';
  const berry = daysLeft == null ? '' : ` · 抱卵，${countdown(daysLeft)}`;
  return `${record.favorite ? '★ ' : ''}${record.name} · ${sex} · ${stage}${berry}\n饥饿 ${Math.round(needs.Hunger * 100)}% · 压力 ${Math.round(needs.Stress * 100)}% · 疲劳 ${Math.round(needs.Fatigue * 100)}%`;
}

export function careSummary(agents, colony, {simSeconds = 0, plants = [], definitions = [], richness = 0, flora = [], managedBreeding = false} = {}) {
  if (!agents.length) return '缸里还没有虾。注水之后，成熟的母虾会在条件合适时抱卵。';
  const book = colony?.shrimp || {};
  const grazing = agents.filter(agent => agent.data.ExecutionState === 'Graze').length;
  const berried = agents.map(agent => book[agent.data.CreatureId]).filter(record => record?.hatchAt != null);
  const hunger = agents.reduce((sum, agent) => sum + agent.data.Needs.Hunger, 0) / agents.length;
  const stress = agents.reduce((sum, agent) => sum + agent.data.Needs.Stress, 0) / agents.length;
  let headline = hunger < 0.5 && stress < 0.45 && richness >= 0.45 ? '状态良好' : richness < 0.35 ? '生物膜还不多' : '状态尚可';
  if (grazing) headline += ` · 觅食中 ${grazing}`;
  if (berried.length) {
    const soon = Math.min(...berried.map(record => Math.max(0, Math.ceil((record.hatchAt - simSeconds) / DAY))));
    headline += ` · 抱卵 ${berried.length} 只，${countdown(soon)}`;
  }
  if (agents.length >= POP_CAP) headline += ' · 虾群已满（50）';
  else if (!managedBreeding && !berried.length && richness >= 0.45) headline += ' · 成熟母虾会慢慢抱卵';
  const favorites = agents.map((agent, index) => ({agent, index, record:book[agent.data.CreatureId]})).filter(item => item.record?.favorite);
  favorites.sort((a, b) => a.index - b.index);
  const lines = [headline, `生态第 ${Math.floor(simSeconds / DAY) + 1} 天 · ${plantLine(plants, definitions, flora)}`];
  if (favorites.length) lines.push('收藏：' + favorites.map(item => `★${item.record.name}`).join('、'));
  const notes = (colony?.journal || []).slice(-3).map(item => `第 ${item.day} 天 · ${item.text}`);
  return [...lines, ...notes].join('\n');
}

export function careNeeds(agents, colony) {
  return agents.flatMap(({data:{CreatureId:id,Needs:{Hunger,Stress}}})=>{
    const signs=[];
    if(Hunger>=.7)signs.push('饥饿 '+Math.round(Hunger*100)+'%');
    if(Stress>=.7)signs.push('压力 '+Math.round(Stress*100)+'%');
    if(!signs.length)return [];
    const name=colony.shrimp[id]?.name||id;
    const sameName=agents.some(other=>other.data.CreatureId!==id&&colony.shrimp[other.data.CreatureId]?.name===name);
    return [{id,name,identity:sameName?name+' · '+id:name,signs:signs.join(' · ')}];
  });
}

export function favoriteRoster(agents, colony) {
  return agents.map((agent, index) => ({id:agent.data.CreatureId, index, record:colony?.shrimp?.[agent.data.CreatureId]}))
    .filter(item => item.record?.favorite)
    .sort((a, b) => a.index - b.index);
}

const BOX = {min:[-0.58, 0, -0.28], max:[0.58, 0.62, 0.28]};
const component = (value, index) => index === 0 ? value.x : index === 1 ? value.y : value.z;
export function tankEntry(origin, direction, maxDistance = 4) {
  if (!origin || !direction) return null;
  let near = 0, far = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const start = component(origin, axis), delta = component(direction, axis);
    if (Math.abs(delta) < 1e-8) { if (start < BOX.min[axis] || start > BOX.max[axis]) return null; continue; }
    let enter = (BOX.min[axis] - start) / delta, exit = (BOX.max[axis] - start) / delta;
    if (enter > exit) [enter, exit] = [exit, enter];
    near = Math.max(near, enter); far = Math.min(far, exit);
    if (near > far) return null;
  }
  if (far < 0) return null;
  const distance = near >= 0 ? near : far;
  return {x:origin.x + direction.x * distance, y:origin.y + direction.y * distance, z:origin.z + direction.z * distance};
}

function colonyRecord(value, id) {
  if (!value || typeof value !== 'object') throw new Error('虾群繁育记录无效');
  const name = value.name == null ? `${id.slice(0, 4)}` : parseShrimpName(value.name);
  if (typeof value.favorite !== 'boolean' && value.favorite != null) throw new Error('虾群繁育记录无效');
  const ageDays = value.ageDays == null ? ADULT_AGE : value.ageDays;
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > 20000) throw new Error('虾群繁育记录无效');
  if (value.hatchAt != null && (!Number.isFinite(value.hatchAt) || value.hatchAt < 0)) throw new Error('虾群繁育记录无效');
  const restUntil = value.restUntil || 0;
  if (!Number.isFinite(restUntil) || restUntil < 0) throw new Error('虾群繁育记录无效');
  if(value.sex!==undefined&&!['female','male'].includes(value.sex))throw new Error('虾性别记录无效');
  return {name, favorite:!!value.favorite, ageDays, hatchAt:value.hatchAt ?? null, restUntil,...(value.sex?{sex:value.sex}:{})};
}

export function feedingSummary(world, colony) {
  const pellet = world.pellet, center = pellet && world.anchors[pellet.anchor];
  if (!center) return null;
  const nearby = world.anchors.filter(anchor => anchor.position.distanceTo(center.position) < FEEDING_RADIUS);
  const food = nearby.reduce((sum, anchor) => sum + anchor.food, 0) / nearby.length;
  const identity = agent => ({id:agent.data.CreatureId, name:colony.shrimp[agent.data.CreatureId]?.name || '未命名的虾'});
  const sinking = pellet.age < PELLET_SINK_SECONDS;
  const eaters = sinking ? [] : world.agents.filter(agent => agent.data.ExecutionState === 'Graze'
    && !agent.manual && !agent.swim && !agent.route.length
    && world.anchors[agent.at]?.food > 0
    && world.anchors[agent.at].position.distanceTo(center.position) < FEEDING_RADIUS
  ).map(identity);
  const fed=new Set([...(colony.lastFeeding || []),...eaters.map(r=>r.id)]);
  const waiting=world.agents.filter(a=>a.noticed && !fed.has(a.data.CreatureId)).map(identity);
  return {sinking, food:food > .6 ? '较多' : food > .25 ? '适中' : '较少',
    empty:world.agents.length===0, discovered:world.agents.some(agent=>agent.noticed), visitors:colony.lastFeeding?.length ?? 0, eaters, waiting};
}

export function sanitizeColony(colony) {
  if (colony == null) return undefined;
  if (typeof colony !== 'object') throw new Error('虾群繁育记录无效');
  if (!colony.shrimp && Object.prototype.hasOwnProperty.call(colony, 'progress')) {
    if (!Number.isFinite(colony.progress) || colony.progress < 0 || colony.progress > 1) throw new Error('虾群繁育记录无效');
    return emptyColony();
  }
  if (!colony.shrimp || typeof colony.shrimp !== 'object' || Array.isArray(colony.shrimp)) throw new Error('虾群繁育记录无效');
  const shrimp = {};
  for (const [id, record] of Object.entries(colony.shrimp)) {
    if (typeof id !== 'string' || !id || id.length > 128) throw new Error('虾群繁育记录无效');
    shrimp[id] = colonyRecord(record, id);
  }
  const journal = [];
  if (colony.journal != null) {
    if (!Array.isArray(colony.journal) || colony.journal.length > 8) throw new Error('虾群繁育记录无效');
    for (const item of colony.journal) {
      if (!item || !Number.isInteger(item.day) || item.day < 1 || item.day > 1e6 || typeof item.text !== 'string' || !item.text || item.text.length > 80) throw new Error('虾群繁育记录无效');
      journal.push({day:item.day, text:item.text});
    }
  }
  const treat = colony.treat || 0;
  if (!Number.isFinite(treat) || treat < 0 || treat > 1) throw new Error('虾群繁育记录无效');
  if(colony.lastFeeding===undefined)return {shrimp,journal,treat};
  const ids=colony.lastFeeding;
  if(!Array.isArray(ids)||ids.length>50||new Set(ids).size!==ids.length||!ids.every(id=>typeof id==='string' && id.length>0 && id.length<=128))throw new Error('加餐个体记录无效');
  return {shrimp,journal,treat,lastFeeding:[...ids]};
}
