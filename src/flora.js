import {stableSeed} from './state.js';
import {FLORA_TRADE, floraCatalogLabel, catalogVariantCount} from './plant-names.js';

// Additional plants share the editing/save flow. Float Nodes retains slow growth between ecology days.
export const SPECIES = {
  rotala: {label:FLORA_TRADE.rotala.label, kind:'stem', start:12, max:30, perDay:0.8, host:false},
  carpet: {label:FLORA_TRADE.carpet.label, kind:'carpet', start:60, max:150, perDay:3, host:false},
  moss: {label:FLORA_TRADE.moss.label, kind:'moss', start:12, max:40, perDay:0.7, host:true},
  pala: {label:FLORA_TRADE.pala.label, kind:'rosette', start:6, max:12, perDay:0.12, host:true},
  nullified: {label:FLORA_TRADE.nullified.label, kind:'rosette', start:6, max:12, perDay:0.12, host:true},
  javafern: {label:FLORA_TRADE.javafern.label, kind:'fern', start:8, max:15, perDay:0.22, host:true},
  vallisneria: {label:FLORA_TRADE.vallisneria.label, kind:'groundFan', start:8, max:14, perDay:0.45, host:false},
  browncrypt: {label:FLORA_TRADE.browncrypt.label, kind:'groundFan', start:7, max:11, perDay:0.22, host:false},
};
export const FLORA_VARIANTS = 4;
export const FLORA_LIMIT = 200;
export const FLORA_CATALOG = Object.entries(SPECIES).flatMap(([id, spec]) =>
  Array.from({length:catalogVariantCount(id)}, (_, variant) => ({
    id:`flora:${id}:${variant}`, species:id, variant, label:floraCatalogLabel(id, variant), host:!!spec.host,
  }))
);
const DAY = 86400;
const finite = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;
const triple = (v, limit) => Array.isArray(v) && v.length === 3 && v.every(n => finite(n, -limit, limit));
// Local coordinates use the imported host's native units, not tank metres.
const HOST_LOCAL_LIMIT = 1e6;
export const floraYaw = value => Math.abs(value) <= Math.PI ? value : Math.atan2(Math.sin(value), Math.cos(value));

export function visibleNodes(record) {
  const spec = SPECIES[record.Species];
  return spec ? Math.max(1, Math.min(spec.max, Math.floor(record.Nodes))) : 0;
}

// Discrete poses keep visible leaves and walkable surfaces together without rebuilding every tick.
export const visibleUpright = record => Math.floor((record.Upright ?? 1) * 12) / 12;

export function growFlora(list, seconds, multiplier = 1) {
  advanceFloraGrowth(list,seconds,multiplier);
  return list;
}

export function advanceFloraGrowth(list, seconds, multiplier = 1) {
  if (!Array.isArray(list) || !(seconds > 0)) return false;
  const days = seconds / DAY * Math.max(0, multiplier);
  let changed=false;
  for (const record of list) {
    const spec = SPECIES[record.Species];
    const nodes=visibleNodes(record), upright=visibleUpright(record);
    if (spec) record.Nodes = Math.min(spec.max, record.Nodes + spec.perDay * days);
    if (spec?.kind === 'rosette') record.Upright = Math.min(1, (record.Upright ?? 1) + days / 3);
    changed ||= visibleNodes(record)!==nodes || visibleUpright(record)!==upright;
  }
  return changed;
}

/** Removes nodes from the growing end. `keep` is the node index the cut landed on for stems. */
export function pruneFlora(record, keep = null, simulationSeconds = 0) {
  const spec = SPECIES[record.Species];
  if (!spec) throw new Error('未知水草品种');
  const now = visibleNodes(record);
  let next;
  if (spec.kind === 'stem') next = Math.max(2, Math.min(now - 1, Number.isInteger(keep) ? keep : now - 3));
  else if (spec.kind === 'rosette') next = Math.max(1, Math.min(now, spec.start) - 1);
  else next = Math.max(Math.ceil(spec.start * 0.5), Math.floor(now * 0.6));
  if (next >= now) throw new Error('这株已经很短，先等它长一长');
  record.Nodes = next;
  record.LastTrim = {At:simulationSeconds, Nodes:next};
  return record;
}

export function sanitizeFlora(list) {
  if (!Array.isArray(list) || list.length > FLORA_LIMIT) throw new Error('程序化水草记录无效');
  const ids = new Set();
  return list.map(r => {
    // Retired procedural plants keep their identity and attachment in existing saves.
    if(r?.Species === 'anubias') r={...r,Species:stableSeed(r.UniqueId)%2 ? 'pala' : 'nullified'};
    const spec = SPECIES[r?.Species];
    if (!spec || typeof r.UniqueId !== 'string' || !r.UniqueId || r.UniqueId.length > 100 || ids.has(r.UniqueId)) throw new Error('程序化水草身份无效');
    ids.add(r.UniqueId);
    if (!Number.isInteger(r.Variant) || r.Variant < 0 || r.Variant >= FLORA_VARIANTS || !finite(r.Yaw, -1e6, 1e6) || !finite(r.Scale, 0.5, 1.6) || !finite(r.Hue, -1, 1) || !finite(r.Nodes, 0, spec.max)) throw new Error('程序化水草生长记录无效');
    const out = {UniqueId:r.UniqueId, Species:r.Species, Variant:r.Variant, Yaw:floraYaw(r.Yaw), Scale:r.Scale, Hue:r.Hue, Nodes:r.Nodes};
    if (r.LastTrim !== undefined) {
      const cut=r.LastTrim;
      if (!finite(cut?.At,0,1e12) || !Number.isInteger(cut.Nodes) || !finite(cut.Nodes,1,spec.max)) throw new Error('水草修剪记录无效');
      out.LastTrim={At:cut.At, Nodes:cut.Nodes};
    }
    if (spec.kind === 'rosette') {
      const upright = r.Upright === undefined ? 1 : r.Upright;
      if (!finite(upright, 0, 1)) throw new Error('水榕向上生长记录无效');
      out.Upright = upright;
    }
    if (spec.host) {
      if (typeof r.Host !== 'string' || !r.Host || r.Host.length > 100 || !triple(r.Local, HOST_LOCAL_LIMIT) || !triple(r.Normal, 1.01) || Math.hypot(...r.Normal) < 0.01) throw new Error('附生水草的附着记录无效');
      Object.assign(out, {Host:r.Host, Local:[...r.Local], Normal:[...r.Normal]});
    } else {
      if (!finite(r.X, -0.6, 0.6) || !finite(r.Z, -0.3, 0.3)) throw new Error('程序化水草超出鱼缸');
      Object.assign(out, {X:r.X, Z:r.Z});
    }
    return out;
  });
}

export function floraSignature(list) {
  return (list || []).map(r => `${r.UniqueId}:${r.Species}:${r.Variant}:${visibleNodes(r)}:${r.X ?? r.Host}:${r.Z ?? ''}:${r.Yaw}:${r.Scale}:${r.Hue}:${r.Local}:${r.Normal}:${visibleUpright(r)}`).join('|');
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
  if (spec.kind === 'fern') return .048;
  if (spec.kind === 'groundFan') return 0.035;
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

export function checkFloraHost(list, {host, local, species, ignore, matrix}) {
  const spec = SPECIES[species];
  if (!spec?.host) throw new Error('这种水草种在底床上');
  if (typeof host !== 'string' || !host) throw new Error('请把鼠标移到木石表面，绿色时点击附着');
  if (!triple(local, HOST_LOCAL_LIMIT)) throw new Error('附着位置无效');
  const gap = floraGap(species);
  if ((list || []).some(r => {
    if (r.UniqueId === ignore || r.Host !== host || !SPECIES[r.Species]?.host) return false;
    const d = r.Local.map((n, i) => n - local[i]);
    if (matrix) { const e = matrix.elements, [x,y,z] = d; return Math.hypot(e[0]*x+e[4]*y+e[8]*z,e[1]*x+e[5]*y+e[9]*z,e[2]*x+e[6]*y+e[10]*z) < gap; }
    return Math.hypot(...d) < gap;
  })) throw new Error('离其他水草太近');
  return true;
}

export function makeFloraRecord({id, species, variant, x, z, host, local, normal, yaw = 0}) {
  const spec = SPECIES[species];
  if (!spec) throw new Error('未知水草品种');
  const record = {UniqueId:id, Species:species, Variant:variant, Yaw:yaw, Scale:1, Hue:0, Nodes:spec.start};
  if (spec.kind === 'rosette') record.Upright = 0;
  if (spec.host) Object.assign(record, {Host:host, Local:local, Normal:normal});
  else Object.assign(record, {X:x, Z:z});
  return sanitizeFlora([record])[0];
}
