import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,BoxGeometry,DirectionalLight,Group,Mesh,MeshStandardMaterial,PerspectiveCamera,Plane,Ray,Raycaster,Scene,SpotLight,Vector2,Vector3} from 'three';
import {frameWallpaper} from '../src/camera-motion.js';
import {createRoomRack} from '../src/room-rack.js';
import {roomStations} from '../src/room-stations.js';
import {Substrate} from '../src/substrate.js';
import {shapeTankLights} from '../src/tank-look.js';
import {AquariumWater} from '../src/water.js';

test('rack picking follows the active station and ignores empty and hidden bays',()=>{
 const root=new Group(), furniture=new Group(), tabletop=new Group();
 root.scale.z=-1;root.add(furniture);furniture.add(tabletop);
 const desk=new Mesh(new BoxGeometry(3.24,.08,1.8),[new MeshStandardMaterial()]);
 desk.name='Single solid walnut surface';desk.position.y=-.04;tabletop.add(desk);
 const view=createRoomRack({root,meshes:[desk],roomOrigin:{value:new Vector2()}});
 const x1=roomStations.breeding.x,x2=roomStations['breeding-2'].x;
 const ray=(x,y,z=3)=>new Ray(new Vector3(x,y,z),new Vector3(0,0,-1));
 const show=(activeId,ids)=>view.update({BreedingRooms:{activeId},Breeding:{tanks:ids.map(id=>({id}))}});
 show('main',['main','breeding']);
 for(const id of Object.keys(roomStations)){
  const plaque=root.getObjectByName('Tank nameplate '+id);
  const centre=plaque.getWorldPosition(new Vector3());
  const frontU=dx=>new Raycaster(new Vector3(centre.x+dx,centre.y,3),new Vector3(0,0,-1)).intersectObject(plaque)[0].uv.x;
  assert.ok(frontU(-.08)<frontU(.08),id+' nameplate reads left to right from the front');
 }
 assert.equal(view.pick(ray(x1,.3)),'breeding');
 assert.equal(view.pick(ray(x2,.3)),null);
 assert.equal(view.pick(ray(x1,-.0225)),'breeding');
 assert.equal(view.pick(ray(x2,-.0225)),null);
 show('breeding-2',['main','breeding','breeding-2']);
 assert.equal(view.pick(ray(x1-x2,.3)),'breeding');
 assert.equal(view.pick(ray(-x2,.3)),'main');
 assert.equal(view.pick(ray(-x2,-.04)),'main');
 assert.equal(view.pick(ray(0,.3)),null);
 assert.equal(view.pick(ray(0,-.0225)),null);
 const lower=roomStations['breeding-3'];
 show('breeding-3',['main','breeding','breeding-2','breeding-3']);
 assert.equal(view.pick(ray(0,.3-lower.y)),'breeding');
 assert.equal(view.pick(ray(0,-.0225-lower.y)),'breeding');
 assert.equal(view.pick(ray(0,.3)),null);
});

test('neighbour appearance updates from saved setup and keeps unchanged substrate geometry',()=>{
 const root=new Group(), furniture=new Group(), tabletop=new Group();
 root.add(furniture);furniture.add(tabletop);
 const material=new MeshStandardMaterial();
 const desk=new Mesh(new BoxGeometry(3.24,.08,1.8),[material]);
 desk.name='Single solid walnut surface';tabletop.add(desk);
 const deposit=new Mesh(new BoxGeometry(),Array(5).fill(material));deposit.name='Deposited substrate';
 const settings={Columns:3,Rows:3,Width:1.2,Depth:.6,MinHeight:0,MaxHeight:.18};
 const view=createRoomRack({root,meshes:[desk,deposit],roomOrigin:{value:new Vector2()}},settings);
 const soil=new Substrate(settings);
 soil.h[4]=.09;soil.put(4,2,.003);
 const state={Breeding:{tanks:[{id:'main'},{id:'breeding'}]},BreedingRooms:{activeId:'main',rooms:[]}};
 const restore=(filled,substrate)=>{
  state.BreedingRooms.rooms=[{id:'breeding',session:{Tank:{Setup:{Filled:filled},Substrate:substrate}}}];
  return view.update(state);
 };
 assert.equal(restore(false,soil.snapshot()),true);
 const shell=root.getObjectByName('Glass outline breeding'), ground=shell.getObjectByName('Neighbour substrate');
 const water=shell.getObjectByName('Neighbour water'), geometry=ground.geometry;
 assert.equal(water.visible,false);assert.equal(ground.visible,true);
 assert.ok(Math.abs(geometry.boundingBox.max.y-.09)<.00001);
 assert.equal(restore(true,soil.snapshot()),true);
 assert.equal(water.visible,true);assert.equal(ground.geometry,geometry);
 assert.equal(restore(true,soil.snapshot()),false);
 assert.equal(restore(false,new Substrate(settings).snapshot()),true);
 assert.equal(water.visible,false);assert.equal(ground.visible,false);
});

test('each occupied tank stays on the same shelf and centreline when selected',()=>{
 const root=new Group(), furniture=new Group(), tabletop=new Group();
 root.add(furniture);furniture.add(tabletop);
 const desk=new Mesh(new BoxGeometry(3.24,.08,1.8),[new MeshStandardMaterial()]);
 desk.name='Single solid walnut surface';desk.position.y=-.04;tabletop.add(desk);
 const view=createRoomRack({root,meshes:[desk],roomOrigin:{value:new Vector2()}});
 const tanks=Object.keys(roomStations).map(id=>({id}));
 const show=activeId=>view.update({BreedingRooms:{activeId},Breeding:{tanks}});
 for(const [id,station] of Object.entries(roomStations)){
  show('main');
  const shell=root.getObjectByName('Glass outline '+id);
  const base=new Box3().setFromObject(shell.getObjectByName('Tank base'));
  const support=new Box3().setFromObject(id==='main'?desk:root.getObjectByName(station.y===0?'upper shelf':'lower shelf'));
  assert.ok(Math.abs(base.min.y-support.max.y)<1e-8);
  assert.ok(base.min.x>=support.min.x && base.max.x<=support.max.x);
  assert.ok(base.min.z>=support.min.z && base.max.z<=support.max.z);
  show(id);
  assert.ok(shell.getWorldPosition(new Vector3()).length()<1e-8,`${id} must share the active tank origin`);
 }
});

test('neighbour water surfaces follow their own fill status and share the scene water clock',()=>{
 const scene=new Scene(), root=new Group(), furniture=new Group(), tabletop=new Group();
 scene.add(root);root.add(furniture);furniture.add(tabletop);
 const desk=new Mesh(new BoxGeometry(3.24,.08,1.8),[new MeshStandardMaterial()]);
 desk.name='Single solid walnut surface';desk.position.y=-.04;tabletop.add(desk);
 const original=new Mesh(new BoxGeometry(),[new MeshStandardMaterial({name:'ClearWaterSurface'})]);
 const aq={root,meshes:[desk,original],roomOrigin:{value:new Vector2()}};
 const water=new AquariumWater({capabilities:{maxSamples:0}},scene,new PerspectiveCamera(),aq);
 const rack=createRoomRack(aq,undefined,undefined,undefined,undefined,undefined,undefined,water.neighbourSurface.bind(water));
 const tanks=Object.keys(roomStations).map(id=>({id}));
 const show=(activeId,filled)=>{
  const rooms=tanks.map(({id})=>({id,session:{Tank:{Setup:{Filled:filled.includes(id)}}}}));
  rack.update({Breeding:{tanks},BreedingRooms:{activeId,rooms}});
 };
 const shell=id=>root.getObjectByName('Glass outline '+id);
 const surface=id=>shell(id).getObjectByName('Neighbour water surface');
 show('main',['breeding','breeding-3']);
 const lower=surface('breeding-3'), upper=surface('breeding'), volume=shell('breeding').getObjectByName('Neighbour water');
 assert.ok(upper.visible && lower.visible && !surface('breeding-2').visible);
 assert.equal(upper.material,lower.material);
 assert.equal(upper.layers.mask,original.layers.mask);
 assert.equal(upper.material.uniforms.aqTime,water.time);
 water.wet.value=0;water.level.value=.12;
 assert.equal(upper.material.uniforms.aqWet.value,1);
 assert.equal(upper.material.uniforms.aqLevel.value,.58);
 assert.ok(Math.abs(lower.getWorldPosition(new Vector3()).y-roomStations['breeding-3'].y-.58)<1e-8);
 assert.ok(Math.abs(new Box3().setFromObject(volume).max.y-upper.getWorldPosition(new Vector3()).y)<1e-8);
 assert.ok(volume.geometry.index.array.every(i=>volume.geometry.attributes.normal.getY(i)<.5));
 show('breeding-3',['main','breeding']);
 assert.equal(shell('breeding-3').visible,false);
 assert.ok(Math.abs(upper.getWorldPosition(new Vector3()).y+roomStations['breeding-3'].y-.58)<1e-8);
 assert.ok(shell('main').visible && surface('main').visible);
});

test('window shadow covers the room and stays aligned when selecting another tank',()=>{
 const scene=new Scene(), root=new Group(), furniture=new Group(), tabletop=new Group();
 root.scale.z=-1;scene.add(root);root.add(furniture);furniture.add(tabletop);
 const desk=new Mesh(new BoxGeometry(3.24,.08,1.8),[new MeshStandardMaterial()]);
 desk.name='Single solid walnut surface';desk.position.y=-.077;tabletop.add(desk);
 const windowFrame=new Group();windowFrame.name='Illustrated window shadow frame';furniture.add(windowFrame);
 const sun=new DirectionalLight();sun.castShadow=true;scene.add(sun,sun.target);
 shapeTankLights(scene);
 const view=createRoomRack({root,meshes:[desk],roomOrigin:{value:new Vector2()}},undefined,undefined,undefined,sun);
 const tanks=Object.keys(roomStations).map(id=>({id}));
 const points=[new Vector3(-2.34,1.55,-1.15),new Vector3(-1.62,-.037,.84),new Vector3(4.55,.83,.56)];
 const camera=new PerspectiveCamera(), ray=new Raycaster(), floor=new Plane(new Vector3(0,1,0),1.127);
 for(const aspect of [1,4/3,16/9,21/9,32/9]){
  frameWallpaper(camera,aspect,'main',true);
  for(const x of [-1,1])for(let y=-1;y<=0;y+=.02){
   ray.setFromCamera(new Vector2(x,y),camera);
   const hit=ray.ray.intersectPlane(floor,new Vector3());
   if(hit?.z>=-1.15)points.push(hit);
  }
 }
 let reference;
 for(const [id,{x,y}] of Object.entries(roomStations)){
  const state={BreedingRooms:{activeId:id},Breeding:{tanks}};
  view.update(state);view.update(state);scene.updateMatrixWorld(true);sun.shadow.updateMatrices(sun);
  const shift=new Vector3(x,y,0);
  const projected=points.map(point=>point.clone().sub(shift).project(sun.shadow.camera));
  assert.ok(projected.every(({x,y,z})=>Math.max(Math.abs(x),Math.abs(y),Math.abs(z))<1),`${id} has points outside the shadow camera`);
  if(!reference)reference=projected;
  else projected.forEach((point,index)=>assert.ok(point.distanceTo(reference[index])<1e-9));
 }
});

test('occupied bays retain independent fixtures, lamp power and cached shadows',()=>{
 const root=new Group(), furniture=new Group(), tabletop=new Group();
 root.scale.z=-1;root.add(furniture);furniture.add(tabletop);
 const material=new MeshStandardMaterial({name:'Soft LED emitter',emissive:0xffe5b0});
 const desk=new Mesh(new BoxGeometry(3.24,.08,1.8),[material]);
 desk.name='Single solid walnut surface';desk.position.y=-.04;tabletop.add(desk);
 const diffuser=new Mesh(new BoxGeometry(1,.008,.04),[material]);
 diffuser.name='Diffused LED underside';diffuser.position.y=.75;furniture.add(diffuser);
 const sourceLamp=new SpotLight(0xffffff,1,1.25);sourceLamp.position.set(-.3,.75,-.03);sourceLamp.castShadow=true;
 const view=createRoomRack({root,meshes:[desk],roomOrigin:{value:new Vector2()}},undefined,undefined,undefined,undefined,sourceLamp);
 const bays={tanks:[{id:'main'},{id:'breeding'},{id:'breeding-2'}]};
 const show=(activeId,saved)=>view.update({Breeding:bays,BreedingRooms:{activeId,rooms:Object.entries(saved).map(([id,LightOn])=>({id,session:{Tank:{Setup:{Filled:true},Environment:{LightOn}}}}))}});
 const fixture=id=>root.getObjectByName('Neighbour fixture '+id);
 const lamp=id=>fixture(id).getObjectByName('Neighbour tank light');
 const lens=id=>fixture(id).getObjectByName('Neighbour Diffused LED underside');
 show('main',{breeding:true,'breeding-2':false});
 assert.equal(fixture('main').visible,false);assert.equal(fixture('breeding-3').visible,false);
 assert.equal(fixture('breeding').visible,true);assert.equal(fixture('breeding-2').visible,true);
 assert.equal(lamp('breeding').visible,true);assert.equal(lamp('breeding-2').visible,false);
 assert.equal(lens('breeding').material[0].emissiveIntensity,1.6);assert.equal(lens('breeding-2').material[0].emissiveIntensity,0);
 assert.equal(lamp('breeding').shadow.autoUpdate,false);assert.equal(lamp('breeding').castShadow,true);
 lamp('breeding').shadow.needsUpdate=false;
 assert.equal(show('main',{breeding:true,'breeding-2':false}),false);
 assert.equal(lamp('breeding').shadow.needsUpdate,false);
 view.invalidateShadows();assert.equal(lamp('breeding').shadow.needsUpdate,true);
 show('breeding',{main:false,'breeding-2':true});
 assert.equal(fixture('main').visible,true);assert.equal(fixture('breeding').visible,false);
 assert.equal(lamp('main').visible,false);assert.equal(lamp('breeding-2').visible,true);
 const position=lens('breeding').getWorldPosition(new Vector3());
 assert.ok(position.distanceTo(diffuser.getWorldPosition(new Vector3()))<1e-8);
 assert.equal(lens('breeding-2').material[0].emissiveIntensity,1.6);
 assert.notEqual(lens('breeding-2').material[0],material);
});
