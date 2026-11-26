import {generateOffspring, scoreShrimp} from './crystal-genetics.js';
import {stableSeed} from './state.js';
import {TANK_PHOTO_LIMIT, validateTankPhotos, writePhotoCaption} from './tank-photos.js';
import {validateLineBooks, editLineBook} from './crystal-line-books.js';
import {validateAppearance, validateShrimpName, validateObservation, appearanceOutcomes, offspringAppearance, breedingDirection, bandGoalProblem} from './crystal-traits.js';

const DAY = 86400000;
const DEFAULT_GROWTH = 45 * 60000;
export const albumTerms = Object.freeze({paidPages:5, coins:40});
export function albumReward(batches,batch) {
  return !batch.representativeId && batches.filter(b=>b.representativeId).length < albumTerms.paidPages ? albumTerms.coins : 0;
}
const TANKS = [{id:'main', capacity:20}, {id:'breeding', capacity:10}, {id:'breeding-2', capacity:10}, {id:'breeding-3', capacity:10}];
export const tankNames = {main:'我的造景缸', breeding:'繁育缸', 'breeding-2':'第二繁育缸', 'breeding-3':'第三繁育缸'};
// Developer candidates: paper script §11.1 uses basic adults 5/5/5 at 16;
// R6 full rehearsal B1 uses male 9/5/6 at 40. B=P is a fresh-founder
// diagnostic assumption, never a migration rule or real strain genetics.
const PRODUCTS = [
  {id:'basic-female', label:'基础母虾', name:'小红', colour:'red', pattern:'band', price:16, sex:'female', B:[5, 5, 5], P:[5, 5, 5]},
  {id:'basic-male', label:'基础公虾', name:'墨带', colour:'black', pattern:'band', price:16, sex:'male', B:[5, 5, 5], P:[5, 5, 5]},
  {id:'b1-colour-male', label:'朱砂', name:'朱砂', colour:'red', pattern:'hinomaru', price:40, sex:'male', B:[9, 5, 6], P:[9, 5, 6]},
  // Appearance-only collection candidates retain the existing basic quality/price.
  {id:'black-mosura-female', label:'墨冠母虾', name:'墨冠', colour:'black', pattern:'mosura', price:16, sex:'female', B:[5, 5, 5], P:[5, 5, 5]},
  {id:'red-mosura-male', label:'丹顶公虾', name:'丹顶', colour:'red', pattern:'mosura', price:16, sex:'male', B:[5, 5, 5], P:[5, 5, 5]},
];
export function shopCatalogue() {
  return PRODUCTS.map(({B, ...product}) => ({...structuredClone(product), developerCandidate:true}));
}
const live = record => record.soldAt === null;
export const REST_LIMIT=4;
export const TRANSFER_PRICE=8;
export const inTank=record=>live(record) && record.tank!=='rest';
// The group picker offers idle residents. A carrying mother's own move also moves her brood and uses the individual flow.
export function canRehouse(state,record,to) {
  return inTank(record) && record.tank!==to && !locked(state,record.id) && !(record.legacy && record.legacyHatchAt!==null) &&
    (to!=='rest' || record.adultAt<=state.now);
}
export function canRest(state,record) {
  return canRehouse(state,record,'rest');
}
export function saleRestriction(state,record) {
  if (!inTank(record)) return '请先从静养处接回鱼缸';
  if (locked(state,record.id)) return '活动亲虾不能转让，请等待配对形成或批次完成';
  if (record.protected || record.adultAt>state.now || record.legacy && record.legacyHatchAt!==null) return '收藏、抱卵或未成年个体不能转让';
  return '';
}
const active = batch => !['complete', 'cancelled'].includes(batch.status);
const reserves = batch => ['planned', 'formed'].includes(batch.status);
const check = (condition, message) => { if (!condition) throw new Error(message); };
const time = value => Number.isSafeInteger(value) && value >= 0;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function validateSiblingStudy(batch, study, now) {
  check(['hatched', 'complete'].includes(batch.status) && study && time(study.at) && study.at >= batch.hatchAt && study.at <= now,
    '同窝对照时间须在孵化后');
  check(Array.isArray(study.ids) && study.ids.length === 2 && study.ids[0] !== study.ids[1] &&
    study.ids.every(id => batch.children.some(kid => kid?.id === id && kid.colour && kid.pattern)), '请选择本窝两只有花色记录的虾');
  check(['whole', 'head', 'back'].includes(study.crop), '同窝对照部位无效');
}

function validateReservedChildIds(batch, assigned) {
  const ids = batch.reservedChildIds;
  check(batch.status === 'planned' && Array.isArray(ids) && ids.length === batch.size, '本窝预留身份与配对计划不符');
  let prefix, previous = 0;
  for (const childId of ids) {
    const parts = id(childId) && /^(crystal(?:-[a-z0-9]+)?)-([1-9]\d*)$/.exec(childId);
    const serial = parts && Number(parts[2]);
    check(parts && Number.isSafeInteger(serial) && serial > previous && (!prefix || parts[1] === prefix) && !assigned.has(childId), '本窝预留身份无效或重复');
    assigned.add(childId);
    prefix = parts[1];
    previous = serial;
  }
}

function phase(batch, now) {
  return now < batch.formedAt ? 'planned' : now < batch.hatchAt ? 'formed' : now < batch.adultAt ? 'hatched' : 'complete';
}

// Bred young hatch partway through their batch. Adopted juveniles start a full growth period on arrival.
export function crystalGrowthFraction(record, now, clock) {
  if (now >= record.adultAt) return 1;
  const duration = record.source === 'bred' ? clock?.growthMs - clock?.stageMs?.hatch : clock?.growthMs;
  return duration > 0 ? Math.max(0, 1 - (record.adultAt - now) / duration) : 0;
}

export function batchTankId(batch) { return batch.relocations?.at(-1)?.to ?? batch.tankId; }
export function tankOccupancy(state,tankId) {
  const animals=state.individuals.filter(r=>inTank(r) && (tankId===undefined || r.tank===tankId)).length;
  const reserved=state.batches.reduce((n,b)=>n+(reserves(b) && (tankId===undefined || batchTankId(b)===tankId) ? b.size : 0),0);
  return {animals,reserved};
}
export const birthTankId = batch => (batch.relocations ?? []).filter(move => move.at < batch.hatchAt).at(-1)?.to ?? batch.tankId;

function capacity(state) {
  const counts = Object.fromEntries(state.tanks.map(tank => [tank.id, 0]));
  for (const record of state.individuals) if (inTank(record)) counts[record.tank]++;
  check(state.individuals.filter(r=>r.tank==='rest').length<=REST_LIMIT,'静养位置已满');
  for (const batch of state.batches) if (reserves(batch)) counts[batchTankId(batch)] += batch.size;
  for (const tank of state.tanks) check(counts[tank.id] <= tank.capacity, `${tank.id}空间不足，包含已预留的后代位置`);
  check(Object.values(counts).reduce((sum, count) => sum + count, 0) <= 50, '全局虾数量超过50');
}

function validateRecord(record, tankIds, embryo = false) {
  check(record && id(record.id) && ['female', 'male'].includes(record.sex), '个体身份或性别无效');
  if (record.observation !== undefined) {
    check(!embryo, '观察只属于已经出生的个体');
    validateObservation(record.observation);
  }
  if (record.legacy === true) {
    check(!embryo && valueLegacy(record), '原有虾的观赏档案无效');
    if (record.name !== undefined) validateShrimpName(record.name);
  } else { check(record.legacy === undefined, '个体类型无效'); scoreShrimp(record.B, 'colour'); scoreShrimp(record.P, 'colour'); validateAppearance(record); }
  check(time(record.adultAt) && typeof record.protected === 'boolean' && id(record.source), '个体成长或来源无效');
  check(record.parents === null || Array.isArray(record.parents) && record.parents.length === 2 && record.parents.every(id) && record.parents[0] !== record.parents[1], '个体亲代记录无效');
  check(record.soldAt === null || time(record.soldAt), '个体转让记录无效');
  check(live(record) ? tankIds.has(record.tank) || !embryo && record.tank==='rest' : record.tank === null && record.soldAt >= record.adultAt, '个体所在缸或出售时间无效');
  if (embryo) check(live(record) && !record.protected && record.source === 'bred', '未孵化个体记录无效');
}
function valueLegacy(r) {
  return r.source === 'legacy-resident' && ['red-cherry-shrimp','crystal-shrimp'].includes(r.species) && r.B === null && r.P === null && r.parents === null && r.colour === undefined && r.pattern === undefined && r.traitGroup === undefined && Number.isFinite(r.legacyAgeDays) && r.legacyAgeDays >= 0 && r.legacyAgeDays <= 20000 && (r.legacyHatchAt === null || time(r.legacyHatchAt));
}

// Validation never invents missing lineage or repairs corrupt saves.
function checkQualityGoal(key, directed, appearanceGoal, mother, father) {
  if (key === undefined) return;
  check(directed && breedingDirection(key), '本窝品质目标无效');
  const problem = bandGoalProblem(key, appearanceGoal, mother, father);
  check(!problem, problem);
}

export function validateBreedingState(value) {
  check(value && value.version === 1, '育种存档版本无效');
  check(time(value.now) && Number.isSafeInteger(value.growthMs) && value.growthMs > 0 && value.growthMs <= 365 * DAY, '育种时钟无效');
  check(value.stageMs && time(value.stageMs.form) && time(value.stageMs.hatch) && value.stageMs.form > 0 && value.stageMs.form < value.stageMs.hatch && value.stageMs.hatch < value.growthMs, '育种阶段时间无效');
  check(uint(value.rngState) && Number.isSafeInteger(value.nextId) && value.nextId >= 1 && value.nextId < Number.MAX_SAFE_INTEGER, '育种随机状态或序号无效');
  check(Number.isSafeInteger(value.cash) && value.cash >= 0, '育种资金无效');
  check(value.unified === undefined || value.unified === true, '统一进度标记无效');
  check(value.starterPending === undefined || typeof value.starterPending === 'boolean', '首批入缸标记无效');
  check(Array.isArray(value.tanks) && value.tanks.length >= 2 && value.tanks.length <= 4 && value.tanks.every((tank,i)=>tank.id===TANKS[i].id && (i===0 && value.unified ? Number.isInteger(tank.capacity) && tank.capacity>=20 && tank.capacity<=50 : tank.capacity===TANKS[i].capacity)), '育种缸配置无效');
  const tankIds = new Set(value.tanks.map(tank => tank.id));
  check(Array.isArray(value.purchases), '商品购买记录无效');
  check(Array.isArray(value.individuals) && Array.isArray(value.batches), '育种名册或批次无效');
  const records = new Map(), identities = new Set();
  for (const record of value.individuals) {
    validateRecord(record, tankIds);
    check(!identities.has(record.id), '个体身份重复');
    check(record.soldAt === null || record.soldAt <= value.now, '出售发生在未来');
    if(record.tank==='rest')check(record.adultAt<=value.now && !(record.legacy && record.legacyHatchAt!==null),'幼虾或抱卵个体不能静养');
    identities.add(record.id); records.set(record.id, record);
  }
  const purchasedProducts = new Set(), purchasedIndividuals = new Set();
  for (const receipt of value.purchases) {
    const product = PRODUCTS.find(item => item.id === receipt?.productId), record = records.get(receipt?.individualId);
    check(product && record && !purchasedProducts.has(product.id) && !purchasedIndividuals.has(record.id), '商品购买身份缺失或重复');
    check(time(receipt.boughtAt) && receipt.boughtAt <= value.now && receipt.price === product.price, '商品购买时间或价格无效');
    check(record.source === `shop:${product.id}` && record.parents === null && record.adultAt === receipt.boughtAt && record.sex === product.sex && equal(record.B, product.B) && equal(record.P, product.P), '商品个体记录被改写');
    if (record.colour !== undefined) check(record.colour === product.colour && record.pattern === product.pattern, '商品外观记录被改写');
    purchasedProducts.add(product.id); purchasedIndividuals.add(record.id);
  }
  for (const record of records.values()) check(!record.source.startsWith('shop:') || purchasedIndividuals.has(record.id), '商品个体缺少购买记录');
  const children = new Set(), reservedChildIds = new Set(), locks = new Set(), positions = new Set(), intervals = new Map();
  const occupy = (key, start, end) => {
    if (!intervals.has(key)) intervals.set(key, []);
    intervals.get(key).push([start, end]);
  };
  for (const batch of value.batches) {
    check(batch && id(batch.id) && !identities.has(batch.id), '批次身份重复或无效');
    identities.add(batch.id);
    check(batch.source === undefined || ['directed', 'natural'].includes(batch.source), '批次来源无效');
    check(tankIds.has(batch.tankId) && (batch.source === 'natural' ? batch.tankId === 'main' : (value.unified || batch.tankId !== 'main')) && [2, 4].includes(batch.size), '批次缸或数量无效');
    check(time(batch.plannedAt) && batch.plannedAt <= value.now && time(batch.adultAt), '批次时间无效');
    check(batch.formedAt === batch.plannedAt + value.stageMs.form && batch.hatchAt === batch.plannedAt + value.stageMs.hatch && batch.adultAt === batch.plannedAt + value.growthMs, '批次阶段不一致');
    const mother = records.get(batch.motherId), father = records.get(batch.fatherId);
    check(mother?.sex === 'female' && father?.sex === 'male' && !mother.legacy && !father.legacy && mother.adultAt <= batch.plannedAt && father.adultAt <= batch.plannedAt, '批次亲代缺失或未成年');
    if (batch.goal !== undefined) check(batch.source === 'directed' && appearanceOutcomes(mother, father).some(option => option.key === batch.goal), '本窝目标与亲虾花色不符');
    checkQualityGoal(batch.qualityGoal, batch.source === 'directed', batch.goal, mother, father);
    if (batch.intent !== undefined) validateObservation(batch.intent);
    if (batch.status === 'cancelled') {
      check(time(batch.cancelledAt) && batch.cancelledAt >= batch.plannedAt && batch.cancelledAt < batch.formedAt && batch.cancelledAt <= value.now, '取消时间无效');
    } else check(batch.cancelledAt === null && batch.status === phase(batch, value.now), '批次阶段与时钟不一致');
    const motherRelease = batch.cancelledAt ?? batch.adultAt, fatherRelease = batch.cancelledAt ?? batch.formedAt;
    check(mother.soldAt === null || mother.soldAt >= motherRelease, '母虾在批次完成前被转让');
    check(father.soldAt === null || father.soldAt >= fatherRelease, '公虾在配对形成前被转让');
    occupy(`shrimp:${mother.id}`, batch.plannedAt, motherRelease);
    occupy(`shrimp:${father.id}`, batch.plannedAt, fatherRelease);
    check(batch.relocations === undefined || Array.isArray(batch.relocations), '批次转缸记录无效');
    let currentTank = batch.tankId, segmentStart = batch.plannedAt, previousMove = batch.formedAt;
    for (const move of batch.relocations ?? []) {
      check(move && time(move.at) && move.at >= previousMove && move.at <= value.now && move.at < batch.adultAt && tankIds.has(move.to) && move.from === currentTank && move.to !== currentTank && batch.cancelledAt === null, '批次转缸记录无效');
      if (move.at < batch.hatchAt) { occupy(`tank:${currentTank}`, segmentStart, move.at); segmentStart = move.at; }
      currentTank = move.to; previousMove = move.at;
    }
    occupy(`tank:${birthTankId(batch)}`, segmentStart, batch.cancelledAt ?? batch.hatchAt);
    check(Array.isArray(batch.children) && batch.children.length === (['planned', 'cancelled'].includes(batch.status) ? 0 : batch.size), '批次后代数量不一致');
    if (batch.reservedChildIds !== undefined) validateReservedChildIds(batch, reservedChildIds);
    if (batch.siblingStudy !== undefined) validateSiblingStudy(batch, batch.siblingStudy, value.now);
    if (batch.representativeId !== undefined) check(batch.status === 'complete' && typeof batch.representativeId === 'string' &&
      batch.children.some(child=>child?.id === batch.representativeId), '相册代表必须来自这一窝成年后代');
    if (batch.rookieEntry !== undefined) {
      const entry=batch.rookieEntry, kid=records.get(entry?.entrantId);
      check(batch.status==='complete' && kid && batch.children.some(c=>c?.id===kid.id) &&
        time(entry.enteredAt) && entry.enteredAt>=batch.adultAt && entry.enteredAt<=value.now &&
        (live(kid)||entry.enteredAt<=kid.soldAt),'新秀赛记录与本窝个体或参赛时间不一致');
    }
    if (active(batch)) {
      check(live(mother) && mother.tank === batchTankId(batch) && !locks.has(mother.id), '活动母虾位置或占用无效');
      locks.add(mother.id);
    }
    if (batch.status === 'planned') {
      check(live(father) && father.tank === batch.tankId && !locks.has(father.id), '待配对公虾位置或占用无效');
      locks.add(father.id);
    }
    if (reserves(batch)) {
      check(!positions.has(batchTankId(batch)), '繁育缸已有未孵化批次');
      positions.add(batchTankId(batch));
    }
    for (const child of batch.children) {
      validateRecord(child, tankIds, true);
      const appearance = offspringAppearance(mother, father, child.id);
      for (const key of ['colour', 'pattern', 'traitGroup']) check(equal(child[key], appearance[key]), '后代外观与固定亲代分支不一致');
      check(!children.has(child.id) && (!identities.has(child.id) || records.has(child.id)), '后代身份重复');
      children.add(child.id);
      check(child.tank === birthTankId(batch) && child.adultAt === batch.adultAt && equal(child.parents, [mother.id, father.id]), '后代与批次不一致');
      const born = records.get(child.id);
      if (batch.status === 'formed') check(!born, '未孵化后代已出现在活体名册');
      else {
        check(born, '已孵化后代丢失');
        for (const key of ['sex', 'B', 'P', 'adultAt', 'source', 'parents', 'colour', 'pattern', 'traitGroup']) check(equal(child[key], born[key]), '出生记录被改写');
      }
    }
  }
  for (const childId of reservedChildIds) check(!identities.has(childId) && !children.has(childId), '预留身份与已有档案冲突');
  for (const slots of intervals.values()) {
    slots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 1; i < slots.length; i++) check(slots[i][0] >= slots[i - 1][1], '历史批次占用重叠');
  }
  // A born child's ID is expected in the archive; batch IDs and unborn children are separate.
  const pendingIds = new Set(value.batches.filter(batch => batch.status === 'formed').flatMap(batch => batch.children.map(child => child.id)));
  for (const record of value.individuals) check(record.source !== 'bred' || children.has(record.id), '自育个体缺少出生批次');
  for (const batch of value.batches) for (const child of batch.children) check(!value.batches.some(other => other.id === child.id), '后代与批次身份冲突');
  const done = new Set();
  for (const record of records.values()) {
    const path = new Set(), stack = [[record, false]];
    while (stack.length) {
      const [current, exiting] = stack.pop();
      if (exiting) { path.delete(current.id); done.add(current.id); continue; }
      if (done.has(current.id)) continue;
      check(!path.has(current.id), '亲代记录存在循环'); path.add(current.id); stack.push([current, true]);
      if (current.parents !== null) for (let i = 0; i < 2; i++) {
        const parent = records.get(current.parents[i]);
        check(parent && parent.sex === (i === 0 ? 'female' : 'male') && parent.adultAt <= current.adultAt, '亲代引用未知或无效');
        stack.push([parent, false]);
      }
    }
  }
  check([...pendingIds].every(childId => !records.has(childId)), '未孵化个体与档案冲突');
  check(!value.individuals.some(r => r.legacy) || value.unified === true, '原有虾需要统一鱼缸进度');
  validateTankPhotos(value.tankPhotos, records, tankIds, value);
  validateLineBooks(value.lineBooks, records);
  capacity(value);
  return structuredClone(value);
}

export function createBreedingState(initialIndividuals, {now, growthMs = DEFAULT_GROWTH, seed, stageMs} = {}) {
  check(Array.isArray(initialIndividuals), '初始个体必须是数组');
  check(stageMs || growthMs === DEFAULT_GROWTH, '非45分钟时长必须明确提供阶段时间');
  return validateBreedingState({version:1, now, growthMs, stageMs:stageMs ?? {form:120000, hatch:600000}, rngState:seed, nextId:1, cash:100,
    tanks:structuredClone(TANKS.slice(0, 2)), purchases:[], individuals:initialIndividuals.map(record => ({...structuredClone(record), soldAt:record.soldAt ?? null})), batches:[]});
}

function allocateIds(state, count, prefix = 'crystal') {
  const used = new Set([...state.individuals.map(record => record.id), ...state.batches.flatMap(batch => [batch.id, ...batch.children.map(child => child.id), ...(batch.reservedChildIds ?? [])])]);
  const ids = [];
  while (ids.length < count) {
    check(state.nextId < Number.MAX_SAFE_INTEGER, '育种身份序号已用尽');
    const id = `${prefix}-${state.nextId++}`;
    if (!used.has(id)) ids.push(id);
  }
  return ids;
}

export function legacyHatchReady(state, mother, now) {
  if (!live(mother) || !mother.legacy || mother.legacyHatchAt === null || mother.legacyHatchAt > now) return false;
  const reserved = state.batches.filter(reserves).reduce((n,b)=>n+b.size,0);
  const roomReserved = state.batches.filter(b=>reserves(b)&&batchTankId(b)===mother.tank).reduce((n,b)=>n+b.size,0);
  return state.individuals.filter(inTank).length+reserved<50 && state.individuals.filter(r=>live(r)&&r.tank===mother.tank).length+roomReserved<state.tanks.find(t=>t.id===mother.tank).capacity;
}

// Transactions and restores replace the breeding state, including changes to reserved space.
export function createGrowthDueCheck() {
  let previous, next;
  return (state, now) => {
    if (state !== previous) {
      next = Infinity;
      for (const batch of state.batches) {
        if (batch.status === 'planned') next = Math.min(next, batch.formedAt);
        if (batch.status === 'formed') next = Math.min(next, batch.hatchAt);
        if (batch.status === 'hatched') next = Math.min(next, batch.adultAt);
      }
      for (const shrimp of state.individuals) {
        if (shrimp.adultAt > state.now) next = Math.min(next, shrimp.adultAt);
        if (shrimp.legacyHatchAt != null && legacyHatchReady(state, shrimp, shrimp.legacyHatchAt))
          next = Math.min(next, shrimp.legacyHatchAt);
      }
      previous = state;
    }
    return now >= next;
  };
}

function advanceBatches(state, batches, now, rng, hatches) {
  for (const batch of batches) {
    if (batch.status === 'planned' && now >= batch.formedAt) {
      const mother = state.individuals.find(record => record.id === batch.motherId), father = state.individuals.find(record => record.id === batch.fatherId);
      const ids = batch.reservedChildIds ?? allocateIds(state, batch.size);
      batch.children = ids.map(id => ({id, ...generateOffspring(mother.B, father.B, rng), ...offspringAppearance(mother, father, id),
        tank:batchTankId(batch), adultAt:batch.adultAt, protected:false, source:'bred', parents:[mother.id, father.id], soldAt:null}));
      delete batch.reservedChildIds;
      batch.status = 'formed';
    }
    if (batch.status === 'formed' && now >= batch.hatchAt) {
      state.individuals.push(...structuredClone(batch.children));
      batch.status = 'hatched';
      if (hatches) for (const child of batch.children)
        hatches.push({id:child.id, motherId:batch.motherId, tankId:child.tank, at:batch.hatchAt});
    }
    if (batch.status === 'hatched' && now >= batch.adultAt) batch.status = 'complete';
  }
}

function formationOrder(a, b) {
  if (a.formedAt !== b.formedAt) return a.formedAt - b.formedAt;
  // Older saves settled ties by ID text. New plans settle in confirmation order.
  const hasFamilyIds = batch => /^crystal-[a-z0-9]+-[1-9]\d*$/.test(batch.reservedChildIds?.[0] ?? batch.children[0]?.id);
  const familyA = hasFamilyIds(a), familyB = hasFamilyIds(b);
  if (!familyA && !familyB) return a.id.localeCompare(b.id);
  if (familyA === familyB) return 0;
  return familyA ? 1 : -1;
}

function advance(state, now, hatches) {
  const rng = () => { state.rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0; return state.rngState / 4294967296; };
  const batches=state.batches.filter(active).sort(formationOrder);
  const due=state.individuals.filter(r=>live(r) && r.legacy && r.legacyHatchAt!==null && r.legacyHatchAt<=now)
    .sort((a,b)=>a.legacyHatchAt-b.legacyHatchAt);
  for (const mother of due) {
    // Settle earlier crystal events first so legacy IDs and available spaces match online play.
    const birthAt=Math.max(state.now,mother.legacyHatchAt);
    advanceBatches(state,batches,birthAt,rng,hatches);
    if (!legacyHatchReady(state,mother,birthAt)) continue;
    const [childId]=allocateIds(state, 1);
    const child={...structuredClone(mother), id:childId, name:[...(mother.name||'原有虾')+'的幼虾'].slice(0,16).join(''), sex:state.nextId%2?'female':'male', protected:false, adultAt:birthAt+state.growthMs, legacyAgeDays:0, legacyHatchAt:null};
    delete child.observation;
    state.individuals.push(child);
    hatches?.push({id:child.id, motherId:mother.id, tankId:mother.tank, at:birthAt});
    mother.legacyHatchAt=null;
  }
  advanceBatches(state,batches,now,rng,hatches);
  state.now = now;
}

// Older plans shared their future numeric IDs with shop arrivals and legacy hatches.
// Before a new allocation, reserve exactly the IDs those plans would have received by waiting.
function reserveOldPlannedIds(state) {
  const pending = state.batches.filter(batch => batch.status === 'planned' && !batch.reservedChildIds);
  if (!pending.length) return;
  const forecast = {...state, individuals:structuredClone(state.individuals), batches:structuredClone(state.batches)};
  advance(forecast, Math.max(...pending.map(batch => batch.formedAt)));
  for (const batch of pending) {
    const future = forecast.batches.find(item => item.id === batch.id);
    batch.reservedChildIds = future.children.map(child => child.id);
  }
}

export function activeParentBatch(state, recordId) {
  return state.batches.find(batch => active(batch) && (batch.motherId === recordId || batch.status === 'planned' && batch.fatherId === recordId));
}
export const locked=(state,recordId)=>!!activeParentBatch(state,recordId);

export function canSelectParent(state,record) {
  return inTank(record) && !record.legacy && record.adultAt<=state.now && !locked(state,record.id);
}

export function savedRoomCreatures(session,id,includePending=false) {
  const rooms=session?.BreedingRooms;
  if(!rooms || rooms.activeId===id || rooms.rooms?.find(room=>room.id===id)?.session?.Tank?.Setup?.Filled!==true)return [];
  const unseated=new Set(rooms.unseated);
  const living=new Set(session.Breeding?.individuals.filter(record=>record.tank===id && record.soldAt===null).map(record=>record.id));
  return (rooms.creatures??[]).filter(c=>living.has(c.CreatureId) && (includePending || !unseated.has(c.CreatureId)));
}

function selectNaturalPair(state, now) {
  const lockedAt = id => state.batches.some(batch => active(batch) && (batch.motherId === id && now < batch.adultAt || batch.fatherId === id && now < batch.formedAt));
  const dueChildren = state.batches.filter(batch => batch.status === 'formed' && now >= batch.hatchAt).flatMap(batch => batch.children);
  const available = [...state.individuals, ...dueChildren].filter(record => live(record) && !record.legacy && record.tank === 'main' && record.adultAt <= now && !lockedAt(record.id));
  for (const mother of available.filter(record => record.sex === 'female')) {
    const father = available.find(record => record.sex === 'male' && validateAppearance(mother) === validateAppearance(record));
    if (father) return {motherId:mother.id, fatherId:father.id};
  }
  return null;
}

// Read the committed snapshot; this preview never advances clocks or draws offspring.
// Callers should advance their progress before rendering a fresh preview.
export function naturalPair(value, now = value.now) {
  const state = validateBreedingState(value);
  check(time(now), '育种时间无效');
  return selectNaturalPair(state, Math.max(now, state.now));
}

export function applyBreedingAction(value, action, now, hatches) {
  const state = validateBreedingState(value);
  check(time(now) && now >= state.now, '育种时间不能倒退');
  check(action && typeof action.type === 'string', '育种操作无效');
  advance(state, now, hatches);
  const findLive = recordId => { const record = state.individuals.find(item => item.id === recordId); check(record && live(record), '个体不存在或已转让'); return record; };
  if (action.type === 'plan' || action.type === 'natural') {
    const natural = action.type === 'natural', tankId = natural ? 'main' : action.tankId;
    let mother, father;
    if (natural) {
      const pair = selectNaturalPair(state, now);
      check(pair, '主缸需要一对成年、空闲且外观资料兼容的亲虾');
      if(action.expectedPair!==undefined)check(pair.motherId===action.expectedPair?.motherId && pair.fatherId===action.expectedPair?.fatherId,'主缸可配对的亲虾已变动，请重新查看这对亲虾。');
      mother = findLive(pair.motherId); father = findLive(pair.fatherId);
    } else { mother = findLive(action.motherId); father = findLive(action.fatherId); }
    check(mother.sex === 'female' && father.sex === 'male', '需要一只母虾和一只公虾');
    check(inTank(mother)&&inTank(father),'静养的虾需接回鱼缸后再选亲');
    check(!mother.legacy && !father.legacy, '原有虾保留观赏，不补造水晶虾遗传资料；请选择水晶虾亲虾');
    check(mother.adultAt <= now && father.adultAt <= now, '亲虾尚未成年');
    const outcomes = appearanceOutcomes(mother, father);
    if (action.goal !== undefined) check(!natural && outcomes.some(option => option.key === action.goal), '当前双亲无法育出目标花色');
    checkQualityGoal(action.qualityGoal, !natural, action.goal, mother, father);
    check(natural || state.tanks.some(tank => tank.id === tankId && (state.unified || tank.id !== 'main')), '请选择已有的繁育缸');
    check(!locked(state, mother.id) && !locked(state, father.id), '亲虾正在配对或恢复');
    check(!state.batches.some(batch => reserves(batch) && batchTankId(batch) === tankId), '目标缸已有未孵化批次');
    check([2, 4].includes(action.size), '每窝数量只能为2或4');
    const intent=action.intent===undefined ? '' : validateObservation(action.intent);
    // Confirming a plan moves both named parents and reserves the brood in one candidate.
    reserveOldPlannedIds(state);
    const [batchId] = allocateIds(state, 1);
    const family = stableSeed(JSON.stringify([state.rngState, batchId, mother.id, father.id])).toString(36);
    mother.tank = father.tank = tankId;
    state.batches.push({id:batchId, motherId:mother.id, fatherId:father.id, tankId, source:natural ? 'natural' : 'directed', ...(action.goal === undefined ? {} : {goal:action.goal}), size:action.size, plannedAt:now,
      reservedChildIds:allocateIds(state, action.size, `crystal-${family}`),
      ...(action.qualityGoal === undefined ? {} : {qualityGoal:action.qualityGoal}),
      ...(intent ? {intent} : {}),
      formedAt:now + state.stageMs.form, hatchAt:now + state.stageMs.hatch, adultAt:now + state.growthMs, cancelledAt:null, status:'planned', children:[]});
  } else if (action.type === 'rehouse') {
    const {residents, tankId, motherId, fatherId} = action;
    check(tankId==='rest' || state.tanks.some(tank=>tank.id===tankId),'请选择已有的鱼缸或静养处');
    check(Array.isArray(residents) && residents.length>0 && residents.length<=50 &&
      new Set(residents.map(item=>item?.id)).size===residents.length,'请点选不同的虾');
    if(action.natural){
      const pair=selectNaturalPair(state,now);
      check(pair && pair.motherId===motherId && pair.fatherId===fatherId,'主缸的亲虾已有变化，请重新核对这窝');
    }
    const group=residents.map(item=>{
      const record=findLive(item?.id);
      check(record.id!==motherId && record.id!==fatherId,'请为这窝的两只亲虾保留原位');
      check(record.tank===item.from && canRehouse(state,record,tankId),'所选的虾已换缸或暂时不能去这个位置，请重新核对');
      return record;
    });
    for(const record of group)record.tank=tankId;
  } else if (action.type === 'rest') {
    const record=findLive(action.id);
    check(canRest(state,record),'只能安置在缸且空闲的成虾');
    record.tank='rest';
  } else if (action.type === 'recall') {
    const record=findLive(action.id);
    check(record.tank==='rest' && state.tanks.some(t=>t.id===action.tankId),'请选择静养个体与接收缸');
    if (action.restId !== undefined) {
      const outgoing = findLive(action.restId);
      check(outgoing.tank === action.tankId && canRest(state, outgoing), '换位的虾须是目标缸里可以静养的空闲成虾，请重新选择');
      outgoing.tank = 'rest';
    }
    record.tank=action.tankId;
  } else if (action.type === 'keepSiblingStudy') {
    const batch = state.batches.find(item => item.id === action.batchId);
    check(batch, '找不到这窝虾');
    const study = {ids:action.ids, at:action.at, crop:action.crop};
    validateSiblingStudy(batch, study, now);
    const previous = batch.siblingStudy;
    if (!equal(previous, study)) {
      check(equal(previous ?? null, action.previous ?? null), '这窝记下的对照已有变化，请重新查看后再选');
      batch.siblingStudy = study;
    }
  } else if (['nameLineBook','markLineMember','discardLineBook'].includes(action.type)) {
    editLineBook(state,action);
  } else if (action.type === 'featureBrood') {
    const batch = state.batches.find(item=>item.id===action.batchId);
    check(batch?.status==='complete' && batch.children.some(child=>child.id===action.id), '请选择这一窝已经成年的后代');
    state.cash += albumReward(state.batches,batch);
    batch.representativeId=action.id;
  } else if (action.type === 'cancel') {
    const batch = state.batches.find(item => item.id === action.batchId);
    check(batch?.status === 'planned', '配对已经形成，不能取消后代');
    delete batch.reservedChildIds;
    batch.status = 'cancelled'; batch.cancelledAt = now;
  } else if (action.type==='sell' || action.type==='sellGroup') {
    const group=action.type==='sellGroup', ids=group ? action.ids : [action.id];
    check(Array.isArray(ids) && ids.length>0 && ids.length<=50 && new Set(ids).size===ids.length,'请选择不同的在缸个体');
    const records=ids.map(findLive);
    for (const record of records) {
      const reason=saleRestriction(state,record);
      check(!reason,reason);
      if (group) check(record.tank===action.tankId,'个体所在缸已改变，请重新核对转让名单');
    }
    for (const record of records) { record.tank=null; record.soldAt=now; }
    state.cash+=TRANSFER_PRICE*records.length;
  } else if (action.type === 'keepTankPhoto') {
    const photo = action.photo, record = findLive(photo?.individualId);
    check(inTank(record) && record.tank === photo.tankId, '拍照的虾已离开这口缸，请重新取景');
    const photos = state.tankPhotos ??= [];
    if (action.replaceId !== undefined) {
      const index = photos.findIndex(item => item.id === action.replaceId);
      check(index >= 0 && action.replaceId !== photo.id, '要替换的留影已变动，请重新选择');
      photos.splice(index, 1);
    }
    check(photos.length < TANK_PHOTO_LIMIT, '相册已满，请选一张替换或下载原图');
    const {id, individualId, tankId, name, at, jpeg} = photo;
    const print = {id, individualId, tankId, name, at, jpeg};
    if (action.caption !== undefined) writePhotoCaption(print, action.caption, now);
    photos.push(print);
  } else if (action.type === 'captionTankPhoto') {
    const photo = state.tankPhotos?.find(p => p.id === action.id);
    check(photo && photo.individualId === action.individualId, '这张留影已变动，请重新翻开照片');
    check((photo.caption?.text ?? '') === action.previousText && (photo.caption?.at ?? null) === action.previousAt,
      '这张照片的留言已变动，请重新翻开再写');
    writePhotoCaption(photo, action.value, now);
  } else if (action.type === 'removeTankPhoto') {
    const index = state.tankPhotos?.findIndex(photo => photo.id === action.id) ?? -1;
    check(index >= 0, '这张留影已不在相册中');
    state.tankPhotos.splice(index, 1);
    if (!state.tankPhotos.length) delete state.tankPhotos;
  } else if (action.type === 'observation') {
    const record = findLive(action.id), note = validateObservation(action.value);
    if (note) record.observation = note;
    else delete record.observation;
  } else if (['move', 'protect', 'rename'].includes(action.type)) {
    const record = findLive(action.id);
    if (action.type === 'rename') record.name = validateShrimpName(action.name);
    else if (action.type === 'protect') { check(typeof action.value === 'boolean', '保护状态无效'); record.protected = action.value; }
    else {
      const carrying = state.batches.find(batch => active(batch) && batch.motherId === record.id && batch.status !== 'planned');
      check(inTank(record),'请先从静养处接回鱼缸');
      check(!locked(state, record.id) || carrying, '活动亲虾不能移动或转让，请等待配对形成或批次完成');
      check(state.tanks.some(tank => tank.id === action.tankId), '目标缸不存在');
      if (carrying && record.tank !== action.tankId) {
        if (reserves(carrying)) check(!state.batches.some(batch => batch !== carrying && reserves(batch) && batchTankId(batch) === action.tankId), '目标缸已有未孵化批次');
        (carrying.relocations ??= []).push({at:now, from:record.tank, to:action.tankId});
        if (reserves(carrying)) for (const child of carrying.children) child.tank = action.tankId;
      }
      record.tank = action.tankId;
    }
  } else if (action.type === 'buy') {
    const product = PRODUCTS.find(item => item.id === action.productId);
    check(product, '商品不存在');
    check(!state.purchases.some(receipt => receipt.productId === product.id), '这只商品虾已经购买');
    check(state.tanks.some(tank => tank.id === action.tankId), '目标缸不存在');
    check(state.cash >= product.price, '资金不足');
    reserveOldPlannedIds(state);
    const [id] = allocateIds(state, 1);
    const record = {id, name:product.name, colour:product.colour, pattern:product.pattern, traitGroup:'crystal-game-v1', sex:product.sex, B:[...product.B], P:[...product.P], tank:action.tankId, adultAt:now, protected:false, source:`shop:${product.id}`, parents:null, soldAt:null};
    state.individuals.push(record);
    state.purchases.push({productId:product.id, individualId:record.id, boughtAt:now, price:product.price});
    state.cash -= product.price;
  } else if (action.type === 'expand') {
    check(state.tanks.length < TANKS.length, '扩缸已达50位上限');
    const tank = TANKS[state.tanks.length];
    check(action.tankId === tank.id, '扩缸目标无效或已经购买');
    check(state.cash >= 90, '资金不足');
    state.tanks.push({...tank}); state.cash -= 90;
  } else check(action.type === 'advance', '未知育种操作');
  return validateBreedingState(state);
}

export function publicBreedingState(value) {
  const state = validateBreedingState(value);
  return {version:state.version, now:state.now, cash:state.cash, tanks:state.tanks, purchases:state.purchases,
    ...(state.lineBooks?.length ? {lineBooks:state.lineBooks} : {}),
    individuals:state.individuals.map(({B, P, ...record}) => ({...record, ...(record.adultAt <= state.now ? {P} : {})})),
    batches:state.batches.map(({children, reservedChildIds, ...batch}) => ({...batch, currentTankId:batchTankId(batch)}))};
}
