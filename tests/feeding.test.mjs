import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {feedingSummary} from '../src/care.js';

const agent = (id, extra = {}) => ({data:{CreatureId:id, ExecutionState:'Graze'},at:0,route:[],manual:null,swim:null,...extra});
const fixture = () => ({pellet:{anchor:0,age:0},anchors:[{position:new Vector3(),food:1},{position:new Vector3(.2,0,0),food:1},{position:new Vector3(.02,0,0),food:0}],agents:[]});
const colony = {shrimp:{a:{name:'小红'}}};

test('feeding feedback counts only actual local consumers, without mutating the world', () => {
  const world = fixture();
  world.agents = [agent('a'),agent('manual',{manual:'Graze'}),agent('swim',{swim:{}}),agent('route',{route:[1]}),agent('far',{at:1}),agent('empty',{at:2}),agent('rest',{data:{CreatureId:'rest',ExecutionState:'Rest'}})];
  const before = JSON.stringify(world);
  assert.deepEqual(feedingSummary(world,colony).eaters,[{id:'a',name:'小红'}]);
  assert.equal(JSON.stringify(world),before);
  assert.equal(feedingSummary(world,{shrimp:{a:{name:'新名字'}}}).eaters[0].name,'新名字');
});

test('feeding status follows pellet lifetime and reports mixed food qualitatively', () => {
  const world = fixture();
  assert.equal(feedingSummary(world,colony).sinking,true);
  world.pellet.age = 2.5;
  assert.equal(feedingSummary(world,colony).sinking,false);
  for (const [food,label] of [[1,'较多'],[.5,'有所减少'],[.1,'较少']]) {
    world.anchors.forEach(a=>a.food=food);
    assert.equal(feedingSummary(world,colony).food,label);
  }
  world.pellet = null;
  assert.equal(feedingSummary(world,colony),null);
  world.pellet = {anchor:100,age:0};
  assert.equal(feedingSummary(world,colony),null);
});
