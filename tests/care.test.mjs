import test from 'node:test';
import assert from 'node:assert/strict';
import {BREED_SECONDS,careSummary,colonyTick,tankEntry} from '../src/care.js';

const agent=(hunger,stress,state='Rest',id='a')=>({data:{CreatureId:id,ExecutionState:state,Needs:{Hunger:hunger,Stress:stress,Fatigue:.1}}});

test('a hungry colony loses brood progress instead of breeding',()=>{const result=colonyTick({progress:.5},[agent(.9,0)],BREED_SECONDS);assert.equal(result.born,false);assert.ok(result.colony.progress<.5);assert.equal(result.ready,false);});
test('fed calm shrimp complete a brood after the care window',()=>{const result=colonyTick({progress:0},[agent(.2,0,'Rest','a'),agent(.2,0,'Graze','b')],BREED_SECONDS);assert.equal(result.born,true);assert.equal(result.colony.progress,1);assert.equal(result.ready,true);});
test('a full colony does not breed',()=>{const agents=Array.from({length:50},(_,i)=>agent(.2,0,'Rest','s'+i));const result=colonyTick({progress:.9},agents,BREED_SECONDS);assert.equal(result.born,false);assert.equal(result.full,true);assert.equal(result.colony.progress,.9);});
test('care text names hunger, eaters and the selected shrimp',()=>{const text=careSummary([agent(.8,.1,'Rest','a'),agent(.2,0,'Graze','b')],'b',{progress:.4});assert.match(text,/偏饿 1 只/);assert.match(text,/正在吃：2 号/);assert.match(text,/抱卵 40%/);assert.match(text,/选中 2 号/);assert.match(text,/饥饿 20%/);});
test('glass aim hits the near tank wall',()=>{const hit=tankEntry({x:0,y:.2,z:-2},{x:0,y:0,z:1});assert.ok(Math.abs(hit.x)<1e-9);assert.ok(Math.abs(hit.y-.2)<1e-9);assert.ok(Math.abs(hit.z+.28)<1e-9);});
