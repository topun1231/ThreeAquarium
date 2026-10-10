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
