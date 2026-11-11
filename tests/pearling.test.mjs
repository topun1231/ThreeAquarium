import test from 'node:test';
import assert from 'node:assert/strict';
import {createPearling, pearlRate} from '../src/pearling.js';
import * as T from 'three';

test('pearling is off in the dark and on low quality, and ramps up while the light stays on', () => {
  assert.equal(pearlRate({lightOn:false, litSeconds:200, quality:1}), 0);
  assert.equal(pearlRate({lightOn:true, litSeconds:200, quality:0}), 0);
  assert.ok(pearlRate({lightOn:true, litSeconds:10, quality:1}) < pearlRate({lightOn:true, litSeconds:90, quality:1}));
  assert.equal(pearlRate({lightOn:true, litSeconds:200, quality:1}), 1);
  assert.ok(pearlRate({lightOn:true, litSeconds:90, quality:0.5}) < 0.6);
});

function fixture() {
  const root = new T.Group(), state = {light:true, wet:true, present:true, valid:true, revision:0, x:0.1};
  const pearls = createPearling({root, sites:() => state.present ? [{id:'leaf', resolve:() => state.valid ? {x:state.x,y:0.08,z:0.02} : null}] : [], lightOn:()=>state.light, wet:()=>state.wet, revision:()=>state.revision, waterLevel:()=>0.58});
  return {state, pearls, step:(seconds)=>{for(let i=0;i<Math.round(seconds*10);i++)pearls.update(0.1, i/10);}};
}

test('leaf bubbles warm up, cling and follow the leaf before detaching at a fixed small size', () => {
  const {state,pearls,step}=fixture();
  step(29);assert.equal(pearls.stats().alive,0);
  step(2);const bubble=pearls.group.children.find(m=>m.visible);assert.ok(bubble);
  assert.equal(bubble.userData.origin,undefined);
  state.x=0.12;step(5);assert.equal(bubble.position.x,0.12);assert.equal(bubble.position.y,0.08);
  assert.ok(!bubble.userData.origin,'not released in the first five seconds');
  step(12);assert.ok(bubble.userData.origin);assert.ok(bubble.position.y>0.08);
  const radius=bubble.scale.x;assert.ok(radius>=0.0003&&radius<=0.0008);
  step(2);assert.equal(bubble.scale.x,radius,'a rising pearl no longer grows');
  state.light=false;step(.1);assert.equal(pearls.stats().alive,0);
  state.light=true;step(20);assert.equal(pearls.stats().alive,0,'light restart warms up again');
});

test('a dry tank, an empty tank and removed leaf sites cannot emit pearls; pause cannot spawn',()=>{
  const {state,pearls,step}=fixture();state.wet=false;step(150);assert.equal(pearls.stats().alive,0);
  state.wet=true;step(31);assert.ok(pearls.stats().alive);
  state.valid=false;step(.1);assert.equal(pearls.stats().alive,0,'removed leaf clears a clinging pearl');
  state.valid=true;state.present=false;state.revision++;step(.1);assert.equal(pearls.stats().sites,0);
  step(150);assert.equal(pearls.stats().alive,0);
  state.present=true;state.revision++;step(20);
  for(let i=0;i<200;i++)pearls.update(0,100000+i);assert.equal(pearls.stats().alive,0);
});

test('stable leaf IDs enforce cooldown across site refreshes and the whole tank stays sparse',()=>{
  const {pearls}=fixture();const births=[];
  for(let t=0;t<3000;t++){pearls.update(.1,t/10);for(const mesh of pearls.group.children)if(mesh.visible&&mesh.userData.life===0)births.push(t/10);}
  assert.ok(births.length>=3);for(let i=1;i<births.length;i++)assert.ok(births[i]-births[i-1]>=39.9);
  const many=createPearling({root:new T.Group(),sites:()=>Array.from({length:60},(_,i)=>({id:'leaf'+i,x:i/1000,y:.02,z:0})),lightOn:()=>true,waterLevel:()=>.58});
  const times=[];
  for(let i=0;i<4000;i++){
    many.update(.1,i/10);const stats=many.stats();assert.ok(stats.alive<=10);assert.ok(stats.rising<=4);
    for(const m of many.group.children)if(m.visible&&m.userData.life===0)times.push(i/10);
  }
  assert.ok(times.length>10);for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=3.9);
});
