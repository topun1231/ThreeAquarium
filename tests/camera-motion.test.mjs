import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Mesh,BoxGeometry,MeshBasicMaterial} from 'three';
import {focusTank,cameraPanSpeed,createRoomCutaway} from '../src/camera-motion.js';

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
