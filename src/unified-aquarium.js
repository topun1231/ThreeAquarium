import {createCrystalProgress, validateCrystalProgress} from './crystal-progress.js';
import {roomCore, blankBreedingRoom, projectCrystalRooms} from './crystal-rooms.js';
import {isFemale, MATURITY_DAYS} from './care.js';
import {ecologySeconds} from './ecology.js';

export const UNIFIED_BACKUP_KEY = 'aquarium.three.before-unified.v1';

export function emptyUnifiedProgress(now, seed) {
  const state = createCrystalProgress([], {now, seed});
  state.unified = true; state.starterPending = true;
  return state;
}

// Pure migration: the caller backs up inputs and persists the entire result before publishing.
export function unifyAquarium(current, {original = null, resume = null, source, template, now, seed} = {}) {
  if (current.session.Breeding?.unified && current.session.BreedingRooms?.unified === 1) return null;
  const breeding = current.session.Breeding ? current : resume?.session?.Breeding ? resume : null;
  const own = !current.session.Breeding ? current : original?.session && !original.session.Breeding ? original : null;
  const existing = breeding?.session.BreedingRooms;
  const oldMain = breeding && (existing.activeId === 'main' ? breeding.session : existing.rooms.find(r => r.id === 'main')?.session);
  const main = roomCore(own?.session || oldMain || current.session);
  const state = breeding ? structuredClone(breeding.session.Breeding) : emptyUnifiedProgress(now, seed);
  state.unified = true; now = Math.max(now, state.now);
  const allCreatures = new Map([...(existing?.creatures || []), ...(existing?.resting || []), ...(breeding?.creatures || [])].map(c => [c.CreatureId, structuredClone(c)]));
  for (const creature of own?.creatures || []) {
    const oldRecord = state.individuals.find(r => r.id === creature.CreatureId);
    if (oldRecord) throw new Error('两份进度的个体身份发生冲突，已保留原档，不能自动覆盖');
    const care = own.session.Colony?.shrimp?.[creature.CreatureId];
    const age = care?.ageDays ?? MATURITY_DAYS;
    const remaining = Math.max(0, MATURITY_DAYS - age) / MATURITY_DAYS * state.growthMs;
    state.individuals.push({id:creature.CreatureId, name:care?.name || '原有虾', sex:care?.sex || (isFemale(creature.CreatureId) ? 'female' : 'male'),
      B:null, P:null, legacy:true, species:creature.SpeciesId, legacyAgeDays:age,
      legacyHatchAt:care?.hatchAt == null ? null : now + Math.ceil(Math.max(0, care.hatchAt - own.session.SimulationSeconds) / ecologySeconds(1) * 1000),
      tank:'main', adultAt:now + Math.ceil(remaining), protected:!!care?.favorite, source:'legacy-resident', parents:null, soldAt:null});
    allCreatures.set(creature.CreatureId, structuredClone(creature));
  }
  const mainCount = state.individuals.filter(r => r.soldAt === null && r.tank === 'main').length;
  const reserved = state.batches.filter(b => ['planned','formed'].includes(b.status) && (b.relocations?.at(-1)?.to ?? b.tankId) === 'main').reduce((sum,b) => sum+b.size,0);
  state.tanks[0].capacity = Math.max(state.tanks[0].capacity, mainCount + reserved);
  validateCrystalProgress(state); // Includes the global 50 limit; never discard excess individuals.
  const rooms = state.tanks.filter(t => t.id !== 'main').map(t => {
    if (existing?.activeId === t.id) return {id:t.id,session:roomCore(breeding.session),game:{elapsed:breeding.elapsed,food:breeding.food,navigation:breeding.navigation,pellet:breeding.pellet}};
    return structuredClone(existing?.rooms.find(r => r.id === t.id) || {id:t.id,session:blankBreedingRoom(source,t.id)});
  });
  const recordById = new Map(state.individuals.map(r => [r.id,r]));
  const active = [...allCreatures.values()].filter(c => recordById.get(c.CreatureId)?.soldAt === null && recordById.get(c.CreatureId)?.tank === 'main');
  const inactive = [...allCreatures.values()].filter(c => recordById.get(c.CreatureId)?.soldAt === null && recordById.get(c.CreatureId)?.tank !== 'main');
  const originalIds = new Set(own?.creatures.map(c => c.CreatureId) || []);
  const unseated = [...new Set([...(existing?.unseated || []), ...active.filter(c => own && !originalIds.has(c.CreatureId)).map(c => c.CreatureId)])];
  const next = {...main, Breeding:state, BreedingRooms:{version:1, unified:1, activeId:'main', rooms, creatures:inactive, unseated}};
  const coreGame = own || (existing?.activeId === 'main' ? breeding : existing?.rooms.find(r => r.id === 'main')?.game) || current;
  const game = {...structuredClone(current), ...structuredClone(coreGame), creatures:active};
  const projected = projectCrystalRooms(next, game, state, source, template);
  return projected;
}
