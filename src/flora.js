import {stableSeed} from './state.js';

// Procedural species live beside the authored Unity plants. Nodes is a float so slow growers accrue between days.
export const SPECIES = {
  rotala: {label:'红宫廷', kind:'stem', start:12, max:30, perDay:0.8, host:false},
  carpet: {label:'矮珍珠', kind:'carpet', start:60, max:150, perDay:3, host:false},
  moss: {label:'莫丝', kind:'moss', start:12, max:40, perDay:0.7, host:true},
  anubias: {label:'小榕', kind:'rosette', start:6, max:12, perDay:0.12, host:true},
};
export const FLORA_VARIANTS = 4;
export const FLORA_LIMIT = 200;
const VARIANT_MARK = ['甲', '乙', '丙', '丁'];
export const FLORA_CATALOG = Object.entries(SPECIES).flatMap(([id, spec]) =>
  Array.from({length:FLORA_VARIANTS}, (_, variant) => ({
    id:`flora:${id}:${variant}`, species:id, variant, label:`${spec.label} · ${VARIANT_MARK[variant]}`, host:!!spec.host,
  }))
);
const DAY = 86400;
const finite = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;
const triple = (v, limit) => Array.isArray(v) && v.length === 3 && v.every(n => finite(n, -limit, limit));

export function visibleNodes(record) {
  const spec = SPECIES[record.Species];
  return spec ? Math.max(1, Math.min(spec.max, Math.floor(record.Nodes))) : 0;
}

export function growFlora(list, seconds, multiplier = 1) {
  if (!Array.isArray(list) || !(seconds > 0)) return list;
  const days = seconds / DAY * Math.max(0, multiplier);
  for (const record of list) {
    const spec = SPECIES[record.Species];
    if (spec) record.Nodes = Math.min(spec.max, record.Nodes + spec.perDay * days);
  }
  return list;
}

/** Removes nodes from the growing end. `keep` is the node index the cut landed on for stems. */
export function pruneFlora(record, keep = null) {
  const spec = SPECIES[record.Species];
  if (!spec) throw new Error('未知水草品种');
  const now = visibleNodes(record);
  let next;
  if (spec.kind === 'stem') next = Math.max(2, Math.min(now - 1, Number.isInteger(keep) ? keep : now - 3));
  else if (spec.kind === 'rosette') next = Math.max(1, now - 1);
  else next = Math.max(Math.ceil(spec.start * 0.5), Math.floor(now * 0.6));
  if (next >= now) throw new Error('这株已经很短，先等它长一长');
  record.Nodes = next;
  return record;
}

export function sanitizeFlora(list) {
  if (!Array.isArray(list) || list.length > FLORA_LIMIT) throw new Error('程序化水草记录无效');
  const ids = new Set();
  return list.map(r => {
    const spec = SPECIES[r?.Species];
    if (!spec || typeof r.UniqueId !== 'string' || !r.UniqueId || r.UniqueId.length > 100 || ids.has(r.UniqueId)) throw new Error('程序化水草身份无效');
    ids.add(r.UniqueId);
    if (!Number.isInteger(r.Variant) || r.Variant < 0 || r.Variant >= FLORA_VARIANTS || !finite(r.Yaw, -7, 7) || !finite(r.Scale, 0.5, 1.6) || !finite(r.Hue, -1, 1) || !finite(r.Nodes, 0, spec.max)) throw new Error('程序化水草生长记录无效');
    const out = {UniqueId:r.UniqueId, Species:r.Species, Variant:r.Variant, Yaw:r.Yaw, Scale:r.Scale, Hue:r.Hue, Nodes:r.Nodes};
    if (spec.host) {
      if (typeof r.Host !== 'string' || !r.Host || r.Host.length > 100 || !triple(r.Local, 2) || !triple(r.Normal, 1.01)) throw new Error('附生水草的附着记录无效');
      Object.assign(out, {Host:r.Host, Local:[...r.Local], Normal:[...r.Normal]});
    } else {
      if (!finite(r.X, -0.6, 0.6) || !finite(r.Z, -0.3, 0.3)) throw new Error('程序化水草超出鱼缸');
      Object.assign(out, {X:r.X, Z:r.Z});
    }
    return out;
  });
}

export function floraSignature(list) {
  return (list || []).map(r => `${r.UniqueId}:${visibleNodes(r)}:${r.X ?? r.Host}:${r.Z ?? ''}`).join('|');
}

export function parsePlantKind(value) {
  if (value == null || value === '') throw new Error('未知水草品种');
  if (/^\d+$/.test(String(value))) return {unity:Number(value)};
  const match = /^flora:([a-z]+):(\d+)$/.exec(String(value));
  if (!match || !SPECIES[match[1]] || Number(match[2]) >= FLORA_VARIANTS) throw new Error('未知水草品种');
  return {species:match[1], variant:Number(match[2])};
}

export function floraGap(species) {
  const spec = SPECIES[species];
  if (!spec) return 0.02;
  return spec.kind === 'carpet' ? 0.038 : spec.kind === 'moss' ? 0.028 : spec.kind === 'rosette' ? 0.055 : 0.014;
}

export function checkFloraGround(list, {x, z, species, ignore, plants = []}) {
  const spec = SPECIES[species];
  if (!spec || spec.host) throw new Error('这种水草要附在木石上');
  if (!finite(x, -0.56, 0.56) || !finite(z, -0.26, 0.26)) throw new Error('请在有底床的缸内区域种植');
  const gap = floraGap(species);
  if ((list || []).some(r => r.UniqueId !== ignore && !SPECIES[r.Species]?.host && Math.hypot(r.X - x, r.Z - z) < gap)) throw new Error('离其他水草太近');
  if (plants.some(p => p.id !== ignore && Math.hypot(p.x - x, p.z - z) < Math.max(0.016, gap * 0.7))) throw new Error('离其他水草太近');
  return true;
}

export function checkFloraHost(list, {host, local, species, ignore}) {
  const spec = SPECIES[species];
  if (!spec?.host) throw new Error('这种水草种在底床上');
  if (typeof host !== 'string' || !host) throw new Error('请先选中木石，再点它的表面附着');
  if (!triple(local, 2)) throw new Error('附着位置无效');
  const gap = floraGap(species);
  if ((list || []).some(r => r.UniqueId !== ignore && r.Host === host && SPECIES[r.Species]?.host && Math.hypot(r.Local[0] - local[0], r.Local[1] - local[1], r.Local[2] - local[2]) < gap)) throw new Error('离其他水草太近');
  return true;
}

export function makeFloraRecord({id, species, variant, x, z, host, local, normal, yaw = 0}) {
  const spec = SPECIES[species];
  if (!spec) throw new Error('未知水草品种');
  const record = {UniqueId:id, Species:species, Variant:variant, Yaw:yaw, Scale:1, Hue:0, Nodes:spec.start};
  if (spec.host) Object.assign(record, {Host:host, Local:local, Normal:normal});
  else Object.assign(record, {X:x, Z:z});
  return sanitizeFlora([record])[0];
}

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function base(rand, tankId, species, index) {
  return {UniqueId:`${tankId}-${species}-${index}`, Species:species, Variant:Math.floor(rand() * FLORA_VARIANTS), Yaw:(rand() * 2 - 1) * Math.PI, Scale:0.85 + rand() * 0.3, Hue:rand() * 2 - 1};
}

/**
 * Plans the default procedural plants for a tank.
 * probe(x, z) casts straight down in Unity space and returns {y, kind, owner, normal:[x,y,z]} or null.
 * Epiphytes come back with World/WorldNormal; the caller converts them into host-local coordinates.
 */
export function planFlora(tankId, probe, plants = []) {
  const rand = random(stableSeed(String(tankId) + ':flora'));
  const clear = (x, z, gap) => plants.every(p => Math.hypot(p.x - x, p.z - z) >= gap);
  const ground = (x, z, gap) => {
    const hit = probe(x, z);
    return hit && hit.kind === 0 && hit.normal[1] > 0.6 && clear(x, z, gap) ? hit : null;
  };
  const out = [];
  let bunches = 0;
  for (const [cx, cz] of [[0.44, 0.17], [-0.08, 0.21], [0.24, 0.2], [-0.44, 0.18]]) {
    if (bunches >= 2 || !ground(cx, cz, 0.02)) continue;
    bunches++;
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.39996, radius = 0.0095 * Math.sqrt(i + 0.6), x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius;
      if (!ground(x, z, 0.012)) continue;
      out.push({...base(rand, tankId, 'rotala', out.length), X:x, Z:z, Nodes:SPECIES.rotala.start + Math.floor(rand() * 6)});
    }
  }
  let patches = 0;
  for (let x = -0.46; x <= 0.47 && patches < 8; x += 0.095) {
    const z = -0.205 + (rand() - 0.5) * 0.06;
    if (!ground(x, z, 0.03)) continue;
    patches++;
    out.push({...base(rand, tankId, 'carpet', out.length), X:x, Z:z, Nodes:SPECIES.carpet.start + Math.floor(rand() * 30)});
  }
  const perches = [];
  for (let x = -0.55; x <= 0.55; x += 0.02) for (let z = -0.26; z <= 0.26; z += 0.02) {
    const hit = probe(x, z);
    if (hit && (hit.kind === 1 || hit.kind === 2) && hit.normal[1] > 0.35 && hit.y < 0.5) perches.push({x, z, ...hit});
  }
  const taken = [];
  const pick = (filter, count, gap, make) => {
    const pool = perches.filter(filter);
    for (let tries = 0; tries < pool.length * 2 && count > 0; tries++) {
      const p = pool[Math.floor(rand() * pool.length)];
      if (!p || taken.some(t => Math.hypot(t.x - p.x, t.z - p.z, t.y - p.y) < gap)) continue;
      taken.push(p);
      out.push(make(p));
      count--;
    }
  };
  perches.sort((a, b) => a.z - b.z);
  pick(p => (p.kind === 2 || p.kind === 1) && p.normal[1] > 0.6 && p.z < perches[Math.floor(perches.length * 0.45)]?.z, 2, 0.12, p => ({...base(rand, tankId, 'anubias', out.length), Nodes:SPECIES.anubias.start + Math.floor(rand() * 3), Host:p.owner, World:[p.x, p.y, p.z], WorldNormal:p.normal}));
  pick(p => p.kind === 2, 7, 0.05, p => ({...base(rand, tankId, 'moss', out.length), Nodes:SPECIES.moss.start + Math.floor(rand() * 12), Host:p.owner, World:[p.x, p.y, p.z], WorldNormal:p.normal}));
  return out;
}
