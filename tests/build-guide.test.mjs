import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequirement,objectEditActions} from '../src/build-guide.js';

test('construction explains prerequisites before advancing or filling, including after deletion',()=>{
  const tank={Setup:{PreparationStep:0},Hardscape:[],Plants:[],Flora:[]};
  const soil={MinHeight:0,h:new Float64Array([0,0,0])};
  assert.match(buildRequirement(tank,soil),/铺一层土/);
  soil.h[1]=.01;assert.equal(buildRequirement(tank,soil),'');
  tank.Setup.PreparationStep=1;tank.Hardscape.push({TypeId:'rock'});
  assert.equal(buildRequirement(tank,soil),'');
  tank.Hardscape=[];assert.equal(buildRequirement(tank,soil),'');
  tank.Hardscape.push({TypeId:'wood'});assert.equal(buildRequirement(tank,soil),'');
  tank.Setup.PreparationStep=2;assert.match(buildRequirement(tank,soil),/水草/);
  tank.Flora.push({Species:'pala'});assert.equal(buildRequirement(tank,soil),'');
  soil.h.fill(0);assert.match(buildRequirement(tank,soil),/铺一层土/);
});

test('object editing offers only transforms supported by each live object kind',()=>{
  const tank={Hardscape:[{UniqueId:'stone'}],Plants:[{UniqueId:'native'}],Flora:[{UniqueId:'attached',Host:'stone'},{UniqueId:'ground'}]};
  assert.deepEqual(objectEditActions(tank,'stone'),{rotate:true,tilt:true,burial:false});
  assert.deepEqual(objectEditActions(tank,'native'),{rotate:true,tilt:true,burial:false});
  for(const id of ['attached','ground']) assert.deepEqual(objectEditActions(tank,id),{rotate:true,tilt:false,burial:false});
  for(const id of [null,'deleted']) assert.deepEqual(objectEditActions(tank,id),{rotate:false,tilt:false,burial:false});
  delete tank.Flora;
  assert.deepEqual(objectEditActions(tank,'attached'),{rotate:false,tilt:false,burial:false});
});
