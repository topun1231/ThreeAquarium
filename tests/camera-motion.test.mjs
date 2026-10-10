import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {focusTank,cameraPanSpeed} from '../src/camera-motion.js';

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
