import {Box3, Ray, Vector3} from 'three';
import {breedingRack,roomStations} from './room-stations.js';

const tank = new Box3(new Vector3(-.6, 0, -.3), new Vector3(.6, .6, .3));

// Keep some habitat around the subject on the narrow axis, including upright screens.
export function closestGameView(aspect) {
  return .18 / Math.max(.25,Math.min(1,aspect));
}

// A foreground rock can be much closer than the orbit target when zooming to the cursor.
export function guardSurfaceZoom(controls,readHabitat){
  let active=false,radius=0;
  const previous=new Vector3(),origin=new Vector3(),direction=new Vector3();
  const remember=()=>{previous.copy(controls.object.position);radius=controls.getDistance();};
  controls.addEventListener('start',()=>{remember();active=true;});
  controls.addEventListener('end',()=>{active=false;});
  controls.addEventListener('change',()=>{
    if(!active)return;
    const eye=controls.object.position, distance=controls.getDistance();
    if(distance<radius-1e-6){
      direction.subVectors(eye,previous);
      const travel=direction.length(), clearance=controls.minDistance*2/3;
      if(travel>1e-6){
        direction.divideScalar(travel);origin.copy(previous);
        origin.z*=-1;direction.z*=-1; // Habitat queries use the imported tank's handedness.
        const hit=readHabitat()?.cast(origin,direction,travel+clearance);
        if(hit){
          const allowed=Math.max(0,hit.distance-clearance);
          direction.z*=-1;direction.multiplyScalar(Math.min(0,allowed-travel));
          eye.add(direction);controls.target.add(direction);controls.object.updateMatrixWorld();
        }
      }
    }
    remember();
  });
}

// Compose the first close-up only. Orbit and follow remain under the player's control.
export function shrimpPortraitPose(agent, from, habitat, minimum=closestGameView(1)) {
  const point=new Vector3(.009,.005,0).multiplyScalar(agent.scale).applyQuaternion(agent.rotation).add(agent.position);
  const side=new Vector3(0,0,1).applyQuaternion(agent.rotation);
  const first=side.dot(from)<0 ? -1 : 1;
  const reach=Math.max(minimum,.18*agent.scale);
  for(const sign of [first,-first,0]){
    const direction=new Vector3(-.20,sign===0 ? 1 : .58,sign).normalize().applyQuaternion(agent.rotation);
    if(!habitat.cast(point,direction,reach+.003))return {point,eye:point.clone().addScaledVector(direction,reach)};
  }
  return null;
}

// Leave some of the sunlit desk in view, and fit the tank horizontally on tall displays.
export function frameWallpaper(camera, aspect, room='main', overview=false) {
  const station=roomStations[room];
  camera.aspect=aspect; camera.fov=32;
  const halfHeight=Math.tan(Math.PI*camera.fov/360);
  if(overview && aspect>=1){
    const left=-2.34,right=breedingRack.start+breedingRack.width;
    const target=new Vector3((left+right)/2-(station?.x??0),.17-(station?.y??0),0);
    const distance=Math.max(6.35,(right-left)/(1.8*halfHeight*aspect)+1);
    camera.position.copy(target).add(new Vector3(distance*.075,distance*.15,distance));
    camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    return target;
  }
  // On an upright screen use the extra height for the sunlit window above the tank.
  const portrait=Math.max(0,1-aspect);
  const sideRoom=Math.min(1,Math.max(0,(aspect-.9)/.45));
  const target=new Vector3(-.025-.19*sideRoom,.46+.46*portrait,0);
  const lower=station?.y<0;
  if(station && room!=='main'){
    const upright=Math.min(1,portrait/.45);
    const side=room==='breeding-2'?-1:1;
    target.set(side*(.025+.16*sideRoom),.33+(lower ? .41 : -.35)*upright,0);
  }
  const minDistance=station && room!=='main' ? 2.8 : 2.62;
  const distance=Math.max(minDistance,.78/(halfHeight*aspect)+.33);
  camera.position.set(.19,lower ? .045 : .115,1).normalize().multiplyScalar(distance).add(target);
  camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  return target;
}

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
