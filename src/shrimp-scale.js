import {stableSeed} from './state.js';
import {MATURITY_DAYS} from './care.js';

export function juvenileFactor(ageDays) {
  if (ageDays == null || ageDays >= MATURITY_DAYS) return 1;
  return 0.45 + 0.55 * Math.max(0, ageDays) / MATURITY_DAYS;
}

/** Same per-animal size used by the mesh and by the body proxy. */
export function shrimpSizeFactor(id, sex, seed = stableSeed(String(id))) {
  const female = sex ? sex === 'female' : seed % 2 === 0, h1 = ((seed >>> 3) % 1000) / 1000;
  return (female ? 1.08 : 0.97) + (h1 - 0.5) * 0.04;
}

export function shrimpBodyScale({ageDays, sizeFactor, id, sex, seed} = {}) {
  const size = sizeFactor ?? (id != null ? shrimpSizeFactor(id, sex, seed) : 1);
  return juvenileFactor(ageDays) * (Number.isFinite(size) && size > 0 ? size : 1);
}

export function applyAgentScales(world, colony) {
  if (!world?.agents) return;
  world.colony = colony;
  for (const agent of world.agents) {
    const record = colony?.shrimp?.[agent.data.CreatureId];
    agent.scale = shrimpBodyScale({ageDays:record?.ageDays, id:agent.data.CreatureId, sex:record?.sex, seed:agent.idSeed});
  }
}
