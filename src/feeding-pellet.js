export const FEEDING_RADIUS = .11;
export const PELLET_SINK_SECONDS = 2.5;

// The running habitat uses vectors and saved navigation uses coordinate arrays.
export function foodAfterPelletLands(food, position, center) {
  const dx = (position.x ?? position[0]) - (center.x ?? center[0]);
  const dy = (position.y ?? position[1]) - (center.y ?? center[1]);
  const dz = (position.z ?? position[2]) - (center.z ?? center[2]);
  const distanceSq = dx*dx + dy*dy + dz*dz;
  if (distanceSq >= FEEDING_RADIUS*FEEDING_RADIUS) return food;
  return Math.max(food, 1 - .35*Math.sqrt(distanceSq)/FEEDING_RADIUS);
}

export function validatePellet(pellet, anchorCount) {
  if (pellet === null) return;
  if (!Number.isInteger(pellet?.anchor) || pellet.anchor < 0 || pellet.anchor >= anchorCount ||
      !Number.isFinite(pellet.age) || pellet.age < 0 || pellet.age > 240) throw Error('饲料数据无效');
  if (pellet.fedAt !== undefined && (!Number.isSafeInteger(pellet.fedAt) || pellet.fedAt < 0)) throw Error('投喂时间无效');
  if (pellet.pendingFood !== undefined && (pellet.pendingFood !== true || pellet.age >= PELLET_SINK_SECONDS)) throw Error('饲料下沉进度无效');
  const cues = pellet.cues;
  if (cues !== undefined && (!Array.isArray(cues) || cues.length > 50 ||
      cues.some(c => typeof c?.id !== 'string' || !c.id || c.id.length > 128 || !Number.isFinite(c.atAge) ||
        c.atAge < 0 || c.atAge > 241 || typeof c.noticed !== 'boolean') ||
      new Set(cues.map(c => c.id)).size !== cues.length)) throw Error('饲料发现记录无效');
}
