import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Ray,Vector3,Quaternion,Mesh,BoxGeometry,MeshBasicMaterial,PerspectiveCamera,EventDispatcher} from 'three';
import {focusTank,cameraPanSpeed,createRoomCutaway,frameWallpaper,shrimpPortraitPose,closestGameView,guardSurfaceZoom} from '../src/camera-motion.js';
import {roomStations} from '../src/room-stations.js';

test('individual close-up uses a clear flank or returns control to the existing framing',()=>{
  const agent={scale:1,position:new Vector3(.3,.04,.2),rotation:new Quaternion()};
  const from=new Vector3(0,.1,1);
  const near=shrimpPortraitPose(agent,from,{cast:()=>null});
  assert.ok(near.eye.z>near.point.z && near.eye.y>near.point.y);
  const far=shrimpPortraitPose(agent,from,{cast:(_,ray)=>ray.z>0});
  assert.ok(far.eye.z<far.point.z);
  assert.equal(shrimpPortraitPose(agent,from,{cast:()=>true}),null);
});

test('a phone and a landscape tank keep room around the shrimp, including when checking for an obstruction',()=>{
  const agent={scale:.6,position:new Vector3(),rotation:new Quaternion()};
  for(const aspect of [1.6,1,390/740]){
    const limit=closestGameView(aspect);
    assert.ok(Math.abs(limit*Math.min(1,aspect)-.18)<1e-9);
    let cast=0;
    const pose=shrimpPortraitPose(agent,new Vector3(0,0,1),{cast:(p,d,reach)=>{cast=reach;return null;}},limit);
    assert.ok(Math.abs(pose.point.distanceTo(pose.eye)-limit)<1e-9 && cast>limit);
  }
});

test('foreground stops an inward zoom but leaves rotation, zoom out and restored poses alone',()=>{
  const c=new EventDispatcher();c.object=new PerspectiveCamera();c.object.position.z=.50;
  c.target=new Vector3();c.getDistance=()=>c.target.distanceTo(c.object.position);c.minDistance=.18;
  let queries=0;
  guardSurfaceZoom(c,()=>({cast(origin,dir,length){
    queries++;const distance=(-.25-origin.z)/dir.z;
    return distance>=0 && distance<=length?{distance}:null;
  }}));
  c.dispatchEvent({type:'start'});c.object.position.z=.18;c.dispatchEvent({type:'change'});
  assert.ok(Math.abs(c.object.position.z-.37)<1e-9);
  assert.ok(Math.abs(c.getDistance()-.18)<1e-9);
  c.object.position.z=.52;c.dispatchEvent({type:'change'});
  assert.equal(c.object.position.z,.52);assert.equal(queries,1);
  c.dispatchEvent({type:'end'});c.object.position.z=.2;c.dispatchEvent({type:'change'});assert.equal(queries,1);
});

test('wallpaper fits every tank corner even when the game was following a shrimp',()=>{
  const camera=new PerspectiveCamera();
  for(const aspect of [16/9,21/9,4/3,9/16]){
    camera.position.set(.04,.09,.12);camera.lookAt(.02,.04,.02);
    const target=frameWallpaper(camera,aspect);
    assert.ok(camera.position.distanceTo(target)>=2);
    const {x:centreX,y:centreY}=new Vector3(0,.30,0).project(camera);
    if(aspect<1) assert.ok(centreY<-.13 && centreY>-.45,'portrait tank sits below the middle with daylight above');
    if(aspect>=16/9) assert.ok(centreX>.05 && centreX<.18,'wide print leaves a little more space on the window side');
    for(const x of [-.6,.6])for(const y of [0,.6])for(const z of [-.3,.3]){
      const point=new Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(point.x)<.96 && Math.abs(point.y)<.96 && point.z<1);
    }
  }
});

test('each breeding wallpaper fits its bay and the tall lower bay keeps the lamp clear of the upper shelf',()=>{
  const camera=new PerspectiveCamera();
  const upperShelf=new Box3(new Vector3(-.69,.828,-.47),new Vector3(2.07,.873,.39));
  for(const room of ['breeding','breeding-2','breeding-3'])for(const aspect of [21/9,16/9,4/3,1,9/16,9/21]){
    const target=frameWallpaper(camera,aspect,room);
    assert.equal(Math.sign(target.x),room==='breeding-2'?-1:1);
    for(const x of [-.61,.61])for(const y of [-.06,.80])for(const z of [-.31,.395]){
      const p=new Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(p.x)<.94 && Math.abs(p.y)<.94,`${room} viewport ${aspect}`);
    }
    if(room==='breeding-3')for(const x of [-.54,.54])for(const z of [-.06,-.018]){
      const delta=new Vector3(x,.80,z).sub(camera.position);
      const hit=new Ray(camera.position,delta.clone().normalize()).intersectBox(upperShelf,new Vector3());
      assert.ok(!hit || hit.distanceTo(camera.position)>delta.length(), 'lamp is visible below the opening');
    }
  }
});

test('landscape room wallpaper fits the window, cabinet and rack with any bay active',()=>{
  const camera=new PerspectiveCamera(32,1,.002,20);
  const landmarks=[[-2.34,1.55,-1.15],[-1.62,-1.12,1],[4.55,-1.12,.4],[4.55,.72,.4]];
  frameWallpaper(camera,16/9);
  assert.ok(new Vector3(...landmarks[3]).project(camera).x>1);
  for(const aspect of [1,4/3,16/9,21/9,32/9]){
    let first;
    for(const [id,station] of Object.entries(roomStations)){
      frameWallpaper(camera,aspect,id,true);
      const points=landmarks.map(([x,y,z])=>new Vector3(x-station.x,y-station.y,z).project(camera));
      assert.ok(points.every(p=>Math.abs(p.x)<.94 && Math.abs(p.y)<.98 && p.z<1));
      first??=points;
      assert.ok(points.every((p,i)=>p.distanceTo(first[i])<1e-8));
    }
  }
  frameWallpaper(camera,9/16,'breeding-3',true);
  const tall=camera.position.clone();
  frameWallpaper(camera,9/16,'breeding-3');
  assert.deepEqual(camera.position.toArray(),tall.toArray());
});

test('legacy camera target moves inside the tank without changing the view direction',()=>{
  const position=new Vector3(.1,.49,1.75),target=new Vector3(.043318,.376636,.758065);
  const before=target.clone().sub(position).normalize(),originalPosition=position.clone();
  focusTank(position,target);
  assert.ok(Math.abs(target.z)<.3 && target.y>0 && target.y<.6);
  assert.ok(before.distanceTo(target.clone().sub(position).normalize())<1e-12);
  assert.ok(position.equals(originalPosition));
  const close=target.clone().addScaledVector(before,-.02);
  assert.ok(close.z<.3,'minimum dolly distance now reaches inside the tank');
});

test('existing specimen focus and camera views pointing away are preserved',()=>{
  const position=new Vector3(0,.3,1),target=new Vector3(.2,.2,.1),saved=target.clone();
  focusTank(position,target);assert.ok(target.equals(saved));
  target.set(0,1,2);saved.copy(target);focusTank(position,target);assert.ok(target.equals(saved));
});

test('arrow movement is faster in whole-tank and close views and remains bounded',()=>{
  assert.ok(cameraPanSpeed(1)>=.5);
  assert.ok(cameraPanSpeed(.02)>=.075);
  assert.equal(cameraPanSpeed(4),.6);
});

test('rear camera cuts away room backdrop only during rendering and restores it on errors',()=>{
  const wall=new Mesh(new BoxGeometry(4,2,.1),new MeshBasicMaterial());wall.name='Dim room wall';wall.position.z=-1;
  const curtain=wall.clone();curtain.name='Soft curtain fold 0';curtain.visible=false;
  const tank=wall.clone();tank.name='Front clear pane';const wood=wall.clone();wood.name='branch_driftwood';
  const draw=createRoomCutaway([wall,curtain,tank,wood]);
  draw({position:new Vector3(0,.3,1)},()=>assert.equal(wall.visible,true));
  assert.throws(()=>draw({position:new Vector3(0,.3,-1.3)},()=>{
    assert.equal(wall.visible,false);assert.equal(tank.visible,true);assert.equal(wood.visible,true);throw Error('render failure');
  }),/render failure/);
  assert.equal(wall.visible,true);assert.equal(curtain.visible,false);
  let rendered=false;createRoomCutaway([])({position:new Vector3(0,0,-3)},()=>{rendered=true;});assert.ok(rendered);
  wall.geometry.dispose();wall.material.dispose();
});

test('top view cuts away the lamp housing without hiding tank contents',()=>{
 const lamp=new Mesh(new BoxGeometry(1,.01,.04),new MeshBasicMaterial());lamp.name='Slim anodized plant light';
 const led=lamp.clone();led.name='Diffused LED underside';
 const wood=lamp.clone();wood.name='branch_driftwood';const draw=createRoomCutaway([lamp,led,wood]);
 draw({position:new Vector3(0,1.35,.001)},()=>{assert.equal(lamp.visible,false);assert.equal(led.visible,false);assert.equal(wood.visible,true);});
 assert.equal(lamp.visible,true);draw({position:new Vector3(0,.5,1.2)},()=>assert.equal(lamp.visible,true));
 lamp.geometry.dispose();lamp.material.dispose();
});
