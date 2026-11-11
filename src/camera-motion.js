import {Box3, Ray, Vector3} from 'three';

const tank = new Box3(new Vector3(-.6, 0, -.3), new Vector3(.6, .6, .3));

export function focusTank(position, target) {
  if (tank.containsPoint(target)) return;
  const direction = target.clone().sub(position).normalize();
  const ray = new Ray(position, direction), entry = ray.intersectBox(tank, new Vector3());
  if (!entry) return;
  // The exported look-at point is only one metre ahead, outside the tank.
  const exit = new Ray(position.clone().addScaledVector(direction, 20), direction.clone().negate()).intersectBox(tank, new Vector3());
  if (exit) target.copy(entry).lerp(exit, .5);
}

export function cameraPanSpeed(distance) {
  return .5 * Math.max(.15, Math.min(1.2, distance));
}

// The imported room is a front-view backdrop, not a room the camera can enter.
export function createRoomCutaway(meshes) {
  const backdrop = meshes.filter(m=>/^(Dim room wall|Night glass|Window recess|Window upright|Window sill|Soft curtain fold \d+)$/.test(m.name));
  const overhead = meshes.filter(m=>/^(Slim anodized plant light|Diffused LED underside|Light stand left|Light stand right)$/.test(m.name));
  const front = Math.max(...backdrop.map(m=>new Box3().setFromObject(m).max.z)) + .03;
  return (camera, draw) => {
    const p=camera.position,above=p.y>.79&&Math.hypot(p.x,p.z)<(p.y-.3)*.7;
    const visible = [...(p.z<front?backdrop:[]),...(above?overhead:[])].filter(m=>m.visible);
    visible.forEach(m=>{m.visible=false;});
    try { return draw(); } finally { visible.forEach(m=>{m.visible=true;}); }
  };
}
