import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone,Group,Quaternion,Vector3} from 'three';
import {FootContacts} from '../src/foot-contacts.js';

test('落脚跟随转动的骨链，不更新无关骨骼',()=>{
  const rig=new Group(), shoulder=new Bone(), upper=new Bone(), lower=new Bone(), tail=new Bone();
  rig.add(shoulder,tail);shoulder.add(upper);upper.add(lower);
  lower.position.y=-.002;
  const animal={id:'A',rig,active:'Rest'}, solver=new FootContacts();
  const leg={upper,lower,tip:new Vector3(0,-.002,0),rest:new Vector3(0,-.004,0),
    reach:.01,beforeUpper:new Quaternion(),beforeLower:new Quaternion(),locked:null};
  solver.entries.set(animal,{legs:[leg],clock:0});
  const agent={data:{ExecutionState:'Rest'},speed:0,rotation:new Quaternion()};
  const world={agentsById:new Map([['A',agent]]),habitat:{cast:()=>({point:new Vector3(0,-.00415,0),normal:new Vector3(0,1,0)})}};
  rig.updateWorldMatrix(true,true);
  tail.updateWorldMatrix=()=>assert.fail('落脚不需要刷新尾扇');
  shoulder.rotation.z=.32;
  const target=leg.rest, before=lower.localToWorld(leg.tip.clone()).distanceTo(target);
  solver.after([animal],world,{position:new Vector3()},null,1/30);
  const after=lower.localToWorld(leg.tip.clone()).distanceTo(target);
  assert.ok(after<before);
  assert.ok(Math.abs(after-solver.maxSlip)<1e-12);
  solver.before([animal]);
  assert.ok(Math.abs(lower.localToWorld(leg.tip.clone()).distanceTo(target)-before)<1e-12);
});
