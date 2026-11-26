import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {emptyColony,FEEDING_RADIUS,feedingSummary,sanitizeColony} from '../src/care.js';
import {CreatureWorld} from '../src/creatures.js';
import {PELLET_SINK_SECONDS} from '../src/feeding-pellet.js';
import {advanceCreatureEcology,ecologySeconds} from '../src/ecology.js';

const agent = (id, extra = {}) => ({data:{CreatureId:id, ExecutionState:'Graze'},at:0,route:[],manual:null,swim:null,...extra});
const fixture = () => ({pellet:{anchor:0,age:0},anchors:[{position:new Vector3(),food:1},{position:new Vector3(.2,0,0),food:1},{position:new Vector3(.02,0,0),food:0}],agents:[]});
const colony = {shrimp:{a:{name:'小红'}}};

test('targeted feeding needs a reachable spot inside the meal radius; a regular drop still picks the nearest reachable spot', () => {
  const world = fixture();
  world.anchors.forEach((a,i) => { a.edges=i===0?[]:[i===1?2:1]; });
  const target=new Vector3(-.1,0,0);
  const before=JSON.stringify(world);
  assert.equal(CreatureWorld.prototype.dropFood.call(world,target,FEEDING_RADIUS),false);
  assert.equal(JSON.stringify(world),before);
  assert.equal(CreatureWorld.prototype.dropFood.call(world,target),true);
  assert.equal(world.pellet.anchor,2);
  target.set(.18,0,0);
  assert.equal(CreatureWorld.prototype.dropFood.call(world,target,FEEDING_RADIUS),true);
  assert.equal(world.pellet.anchor,1);
});

test('meal history accepts older colonies and validates each saved visitor independently of current residents', () => {
  const old = emptyColony();
  assert.deepEqual(sanitizeColony(old),old);
  const meal = {...old,lastFeeding:['I1','I2']};
  assert.deepEqual(sanitizeColony(meal),meal);
  assert.notEqual(sanitizeColony(meal).lastFeeding,meal.lastFeeding);
  for (const ids of [null,'I1',['I1','I1'],[''],[42],['a'.repeat(129)],Array.from({length:51},(_,i)=>String(i))]) {
    assert.throws(()=>sanitizeColony({...old,lastFeeding:ids}),/加餐/);
  }
});

test('feeding feedback counts only actual local consumers, without mutating the world', () => {
  const world = fixture();
  world.agents = [agent('a'),agent('manual',{manual:'Graze'}),agent('swim',{swim:{}}),agent('route',{route:[1]}),agent('far',{at:1}),agent('empty',{at:2}),agent('rest',{data:{CreatureId:'rest',ExecutionState:'Rest'}})];
  assert.deepEqual(feedingSummary(world,colony).eaters,[]);
  world.pellet.age=PELLET_SINK_SECONDS;
  const before = JSON.stringify(world);
  assert.deepEqual(feedingSummary(world,colony).eaters,[{id:'a',name:'小红'}]);
  assert.equal(JSON.stringify(world),before);
  assert.equal(feedingSummary(world,{shrimp:{a:{name:'新名字'}}}).eaters[0].name,'新名字');
});

test('discovery, current grazers and previous visitors describe different stages of a meal', () => {
  const world=fixture(), remembered={...colony,lastFeeding:[]};
  const shrimp=agent('a',{noticed:true,route:[1]}); world.agents=[shrimp];
  const arrival=feedingSummary(world,remembered);
  assert.equal(arrival.discovered,true);
  assert.equal(arrival.visitors,0);
  assert.equal(arrival.eaters.length,0);
  assert.deepEqual(arrival.waiting,[{id:'a',name:'小红'}]);
  remembered.lastFeeding.push('a');
  const later=feedingSummary(world,remembered);
  assert.equal(later.visitors,1);
  assert.equal(later.eaters.length,0);
  assert.deepEqual(later.waiting,[]);
  assert.equal(feedingSummary(world,colony).visitors,0);
});

test('feeding status follows pellet lifetime and reports mixed food qualitatively', () => {
  const world = fixture();
  assert.equal(feedingSummary(world,colony).sinking,true);
  world.pellet.age = 2.5;
  assert.equal(feedingSummary(world,colony).sinking,false);
  for (const [food,label] of [[1,'较多'],[.5,'适中'],[.1,'较少']]) {
    world.anchors.forEach(a=>a.food=food);
    assert.equal(feedingSummary(world,colony).food,label);
  }
  world.pellet = null;
  assert.equal(feedingSummary(world,colony),null);
  world.pellet = {anchor:100,age:0};
  assert.equal(feedingSummary(world,colony),null);
});

test('a pellet lands once while the player is away and only nutrients near its landing site increase', () => {
  const anchors=[0,FEEDING_RADIUS/2,FEEDING_RADIUS,.2].map(x=>({kind:0,position:[x,0,0]}));
  const initial={creatures:[],food:anchors.map(()=>.2),pellet:{anchor:0,age:.5,pendingFood:true}};
  const advance=(game,t)=>advanceCreatureEcology(game,ecologySeconds(t),{},anchors,t);
  const split=structuredClone(initial);
  advance(split,1);
  assert.equal(split.pellet.pendingFood,true);
  assert.ok(split.food.every(v=>v<.21));
  const atLanding=structuredClone(split);
  advance(atLanding,1);
  assert.deepEqual(atLanding.pellet,{anchor:0,age:PELLET_SINK_SECONDS});
  assert.equal(atLanding.food[0],1);
  assert.equal(atLanding.food[1],.825);
  assert.ok(atLanding.food[2]<.21 && atLanding.food[3]<.21);
  const eaten=structuredClone(atLanding);
  eaten.food[0]=.1;
  advance(eaten,.5);
  assert.ok(eaten.food[0]<.11);

  // A single long absence and a visit shortly after landing give the same remainder.
  const uninterrupted=structuredClone(initial);
  advance(uninterrupted,300);
  advance(atLanding,298);
  assert.equal(uninterrupted.pellet,null);
  for(const [i,value] of atLanding.food.entries())assert.ok(Math.abs(uninterrupted.food[i]-value)<1e-12);
  const legacy=structuredClone(initial);
  delete legacy.pellet.pendingFood;
  advanceCreatureEcology(legacy,ecologySeconds(4),{},[],4);
  assert.ok(legacy.food.every(v=>v<.21),'Older saves have already deposited their food');
  const missing=structuredClone(initial);
  assert.throws(()=>advanceCreatureEcology(missing,ecologySeconds(4),{},[],4),/饲料落点/);
  assert.deepEqual(missing,initial);
  const invalid=structuredClone(initial);
  invalid.pellet.pendingFood='yes';
  assert.throws(()=>advance(invalid,300),/饲料/);
  assert.deepEqual(invalid.food,initial.food);
});
