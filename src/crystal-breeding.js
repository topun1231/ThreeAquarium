import {generateOffspring, scoreShrimp} from './crystal-genetics.js';
import {validateAppearance, validateShrimpName, predictAppearance, offspringAppearance} from './crystal-traits.js';

const DAY = 86400000;
const DEFAULT_GROWTH = 45 * 60000;
const TANKS = [{id:'main', capacity:20}, {id:'breeding', capacity:10}, {id:'breeding-2', capacity:10}, {id:'breeding-3', capacity:10}];
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
const active = batch => !['complete', 'cancelled'].includes(batch.status);
const reserves = batch => ['planned', 'formed'].includes(batch.status);
const check = (condition, message) => { if (!condition) throw new Error(message); };
const time = value => Number.isSafeInteger(value) && value >= 0;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function phase(batch, now) {
  return now < batch.formedAt ? 'planned' : now < batch.hatchAt ? 'formed' : now < batch.adultAt ? 'hatched' : 'complete';
}

export function batchTankId(batch) { return batch.relocations?.at(-1)?.to ?? batch.tankId; }
const birthTankId = batch => (batch.relocations ?? []).filter(move => move.at < batch.hatchAt).at(-1)?.to ?? batch.tankId;

function capacity(state) {
  const counts = Object.fromEntries(state.tanks.map(tank => [tank.id, 0]));
  for (const record of state.individuals) if (live(record)) counts[record.tank]++;
  for (const batch of state.batches) if (reserves(batch)) counts[batchTankId(batch)] += batch.size;
  for (const tank of state.tanks) check(counts[tank.id] <= tank.capacity, `${tank.id}空间不足，包含已预留的后代位置`);
  check(Object.values(counts).reduce((sum, count) => sum + count, 0) <= 50, '全局虾数量超过50');
}

function validateRecord(record, tankIds, embryo = false) {
  check(record && id(record.id) && ['female', 'male'].includes(record.sex), '个体身份或性别无效');
  if (record.legacy === true) {
    check(!embryo && valueLegacy(record), '原有虾的观赏档案无效');
    if (record.name !== undefined) validateShrimpName(record.name);
  } else { check(record.legacy === undefined, '个体类型无效'); scoreShrimp(record.B, 'colour'); scoreShrimp(record.P, 'colour'); validateAppearance(record); }
  check(time(record.adultAt) && typeof record.protected === 'boolean' && id(record.source), '个体成长或来源无效');
  check(record.parents === null || Array.isArray(record.parents) && record.parents.length === 2 && record.parents.every(id) && record.parents[0] !== record.parents[1], '个体亲代记录无效');
  check(record.soldAt === null || time(record.soldAt), '个体转让记录无效');
  check(live(record) ? tankIds.has(record.tank) : record.tank === null && record.soldAt >= record.adultAt, '个体所在缸或出售时间无效');
  if (embryo) check(live(record) && !record.protected && record.source === 'bred', '未孵化个体记录无效');
}
function valueLegacy(r) {
  return r.source === 'legacy-resident' && ['red-cherry-shrimp','crystal-shrimp'].includes(r.species) && r.B === null && r.P === null && r.parents === null && r.colour === undefined && r.pattern === undefined && r.traitGroup === undefined && Number.isFinite(r.legacyAgeDays) && r.legacyAgeDays >= 0 && r.legacyAgeDays <= 20000 && (r.legacyHatchAt === null || time(r.legacyHatchAt));
}

// Validation never invents missing lineage or repairs corrupt saves.
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
  const children = new Set(), locks = new Set(), positions = new Set(), intervals = new Map();
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
  capacity(value);
  return structuredClone(value);
}

export function createBreedingState(initialIndividuals, {now, growthMs = DEFAULT_GROWTH, seed, stageMs} = {}) {
  check(Array.isArray(initialIndividuals), '初始个体必须是数组');
  check(stageMs || growthMs === DEFAULT_GROWTH, '非45分钟时长必须明确提供阶段时间');
  return validateBreedingState({version:1, now, growthMs, stageMs:stageMs ?? {form:120000, hatch:600000}, rngState:seed, nextId:1, cash:100,
    tanks:structuredClone(TANKS.slice(0, 2)), purchases:[], individuals:initialIndividuals.map(record => ({...structuredClone(record), soldAt:record.soldAt ?? null})), batches:[]});
}

function nextId(state) {
  const used = new Set([...state.individuals.map(record => record.id), ...state.batches.flatMap(batch => [batch.id, ...batch.children.map(child => child.id)])]);
  let result;
  do {
    check(state.nextId < Number.MAX_SAFE_INTEGER, '育种身份序号已用尽');
    result = `crystal-${state.nextId++}`;
  } while (used.has(result));
  return result;
}

export function legacyHatchReady(state, mother, now) {
  if (!live(mother) || !mother.legacy || mother.legacyHatchAt === null || mother.legacyHatchAt > now) return false;
  const reserved = state.batches.filter(reserves).reduce((n,b)=>n+b.size,0);
  const roomReserved = state.batches.filter(b=>reserves(b)&&batchTankId(b)===mother.tank).reduce((n,b)=>n+b.size,0);
  return state.individuals.filter(live).length+reserved<50 && state.individuals.filter(r=>live(r)&&r.tank===mother.tank).length+roomReserved<state.tanks.find(t=>t.id===mother.tank).capacity;
}

function advance(state, now) {
  const rng = () => { state.rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0; return state.rngState / 4294967296; };
  for (const batch of [...state.batches].sort((a, b) => a.formedAt - b.formedAt || a.id.localeCompare(b.id))) {
    if (!active(batch)) continue;
    if (batch.status === 'planned' && now >= batch.formedAt) {
      const mother = state.individuals.find(record => record.id === batch.motherId), father = state.individuals.find(record => record.id === batch.fatherId);
      batch.children = Array.from({length:batch.size}, () => {
        const id = nextId(state);
        return {id, ...generateOffspring(mother.B, father.B, rng), ...offspringAppearance(mother, father, id), tank:batchTankId(batch), adultAt:batch.adultAt, protected:false, source:'bred', parents:[mother.id, father.id], soldAt:null};
      });
      batch.status = 'formed';
    }
    if (batch.status === 'formed' && now >= batch.hatchAt) { state.individuals.push(...structuredClone(batch.children)); batch.status = 'hatched'; }
    if (batch.status === 'hatched' && now >= batch.adultAt) batch.status = 'complete';
  }
  // Preserve eggs already carried by old residents; never invent crystal genes for them.
  for (const mother of [...state.individuals]) if (legacyHatchReady(state, mother, now)) {
    const childId=nextId(state);
    state.individuals.push({...structuredClone(mother), id:childId, name:[...(mother.name||'原有虾')+'的幼虾'].slice(0,16).join(''), sex:state.nextId%2?'female':'male', protected:false, adultAt:now+state.growthMs, legacyAgeDays:0, legacyHatchAt:null});
    mother.legacyHatchAt=null;
  }
  state.now = now;
}

function locked(state, recordId) {
  return state.batches.some(batch => active(batch) && (batch.motherId === recordId || batch.status === 'planned' && batch.fatherId === recordId));
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

export function applyBreedingAction(value, action, now) {
  const state = validateBreedingState(value);
  check(time(now) && now >= state.now, '育种时间不能倒退');
  check(action && typeof action.type === 'string', '育种操作无效');
  advance(state, now);
  const findLive = recordId => { const record = state.individuals.find(item => item.id === recordId); check(record && live(record), '个体不存在或已转让'); return record; };
  if (action.type === 'plan' || action.type === 'natural') {
    const natural = action.type === 'natural', tankId = natural ? 'main' : action.tankId;
    let mother, father;
    if (natural) {
      const pair = selectNaturalPair(state, now);
      check(pair, '主缸需要一对成年、空闲且外观资料兼容的亲虾');
      mother = findLive(pair.motherId); father = findLive(pair.fatherId);
    } else { mother = findLive(action.motherId); father = findLive(action.fatherId); }
    check(mother.sex === 'female' && father.sex === 'male', '需要一只母虾和一只公虾');
    check(!mother.legacy && !father.legacy, '原有虾保留观赏，不补造水晶虾遗传资料；请选择水晶虾亲虾');
    check(mother.adultAt <= now && father.adultAt <= now, '亲虾尚未成年');
    predictAppearance(mother, father);
    check(natural || state.tanks.some(tank => tank.id === tankId && (state.unified || tank.id !== 'main')), '请选择已有的繁育缸');
    check(!locked(state, mother.id) && !locked(state, father.id), '亲虾正在配对或恢复');
    check(!state.batches.some(batch => reserves(batch) && batchTankId(batch) === tankId), '目标缸已有未孵化批次');
    check([2, 4].includes(action.size), '每窝数量只能为2或4');
    // Confirming a plan moves both named parents and reserves the brood in one candidate.
    mother.tank = father.tank = tankId;
    state.batches.push({id:nextId(state), motherId:mother.id, fatherId:father.id, tankId, source:natural ? 'natural' : 'directed', size:action.size, plannedAt:now,
      formedAt:now + state.stageMs.form, hatchAt:now + state.stageMs.hatch, adultAt:now + state.growthMs, cancelledAt:null, status:'planned', children:[]});
  } else if (action.type === 'cancel') {
    const batch = state.batches.find(item => item.id === action.batchId);
    check(batch?.status === 'planned', '配对已经形成，不能取消后代');
    batch.status = 'cancelled'; batch.cancelledAt = now;
  } else if (['move', 'protect', 'sell', 'rename'].includes(action.type)) {
    const record = findLive(action.id);
    if (action.type === 'rename') record.name = validateShrimpName(action.name);
    else if (action.type === 'protect') { check(typeof action.value === 'boolean', '保护状态无效'); record.protected = action.value; }
    else {
      const carrying = state.batches.find(batch => active(batch) && batch.motherId === record.id && batch.status !== 'planned');
      check(!locked(state, record.id) || action.type === 'move' && carrying, '活动亲虾不能移动或转让，请等待配对形成或批次完成');
      if (action.type === 'move') {
        check(state.tanks.some(tank => tank.id === action.tankId), '目标缸不存在');
        if (carrying && record.tank !== action.tankId) {
          if (reserves(carrying)) check(!state.batches.some(batch => batch !== carrying && reserves(batch) && batchTankId(batch) === action.tankId), '目标缸已有未孵化批次');
          (carrying.relocations ??= []).push({at:now, from:record.tank, to:action.tankId});
          if (reserves(carrying)) for (const child of carrying.children) child.tank = action.tankId;
        }
        record.tank = action.tankId;
      }
      else {
        check(!record.protected && record.adultAt <= now && !(record.legacy && record.legacyHatchAt !== null), '收藏、抱卵或未成年个体不能转让');
        record.tank = null; record.soldAt = now; state.cash += 8;
      }
    }
  } else if (action.type === 'buy') {
    const product = PRODUCTS.find(item => item.id === action.productId);
    check(product, '商品不存在');
    check(!state.purchases.some(receipt => receipt.productId === product.id), '这只商品虾已经购买');
    check(state.tanks.some(tank => tank.id === action.tankId), '目标缸不存在');
    check(state.cash >= product.price, '资金不足');
    const record = {id:nextId(state), name:product.name, colour:product.colour, pattern:product.pattern, traitGroup:'crystal-game-v1', sex:product.sex, B:[...product.B], P:[...product.P], tank:action.tankId, adultAt:now, protected:false, source:`shop:${product.id}`, parents:null, soldAt:null};
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
    individuals:state.individuals.map(({B, P, ...record}) => ({...record, ...(record.adultAt <= state.now ? {P} : {})})),
    batches:state.batches.map(({children, ...batch}) => ({...batch, currentTankId:batchTankId(batch)}))};
}
