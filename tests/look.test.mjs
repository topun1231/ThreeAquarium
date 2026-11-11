import test from 'node:test';
import assert from 'node:assert/strict';
import {qualityPreset,installTankLook} from '../src/tank-look.js';
import * as T from 'three';

test('fixed high quality keeps shadows, all plants, water lighting and pearling', () => {
  const p = qualityPreset();
  assert.equal(p.floraDensity, 1);
  assert.equal(p.floraShadows, true);
  assert.equal(p.shrimpDetail, 'full');
  assert.equal(p.shafts, true);
  assert.equal(p.pearling, 1);
  assert.ok(p.caustic > 0 && p.fog > 0 && p.fog <= .25);
  assert.equal(p.particles, undefined);
  assert.equal(p.bubbles, undefined);
});

test('suspended particles are absent and underwater lighting follows filling and the lamp',()=>{
  const scene=new T.Scene(),material=new T.MeshStandardMaterial({name:'soil'});
  const look=installTankLook({scene,aq:{meshes:[],materials:[material]},water:{fog:{value:0}}});
  const shader={uniforms:{},vertexShader:'',fragmentShader:''};material.onBeforeCompile(shader);
  assert.equal(scene.getObjectByName('tank-drift'),undefined);
  assert.equal(scene.children.some(o=>o.isPoints),false);
  const shafts=scene.getObjectByName('tank-shafts');
  look.update(1,{wet:false});assert.equal(shafts.visible,false);assert.equal(shader.uniforms.aqCGain.value,0);
  look.update(2,{wet:true,lightOn:true,level:.2});assert.equal(shafts.visible,true);assert.ok(shader.uniforms.aqCGain.value>0);assert.equal(shader.uniforms.aqCLevel.value,.2);
  look.update(3,{wet:true,lightOn:false});assert.equal(shafts.visible,false);assert.equal(shader.uniforms.aqCGain.value,0);
});
