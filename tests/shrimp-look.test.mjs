import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {crystalLookLookup,installShrimpLook} from '../src/shrimp-look.js';
import {shrimpSizeFactor} from '../src/shrimp-scale.js';
import {crystalGrowthFraction} from '../src/crystal-breeding.js';
import {createCrystalPortraits,crystalPortraitFrame} from '../src/crystal-portraits.js';

function animal(id = 'display-shrimp') {
  const rig = new T.Group(), shell = new T.MeshStandardMaterial({name:'Shell'}), eye = new T.MeshStandardMaterial({name:'Eyes'});
  const mesh = new T.Mesh(new T.BoxGeometry(0.025, 0.005, 0.005), shell), eyes = new T.Mesh(new T.SphereGeometry(0.001), eye);
  mesh.castShadow = mesh.receiveShadow = true;
  const host = new T.Bone(); host.name = 'Abdomen_02'; rig.add(mesh, eyes, host);
  return {id, rig, shell, eye, mesh};
}
const individual = (extra = {}) => ({id:'display-shrimp', sex:'female', colour:'red', pattern:'band', P:[8, 7, 6], adultAt:100, ...extra});

test('同一只虾的背部照片单独取图，重复点背纹复用已有请求',async()=>{
  const record=individual(), frame=crystalPortraitFrame(record,1000,null);
  const photos=createCrystalPortraits({});
  try {
    const side=photos.get(record,1000,true,frame,true);
    const back=photos.get(record,1000,true,frame,true,'back');
    const small=photos.get(record,1000,false,frame,false,'back');
    assert.notEqual(side,back);
    assert.notEqual(small,back);
    assert.notEqual(small,photos.get(record,1000,false,frame));
    assert.equal(side,photos.get(record,1000,false,frame,true,'side'));
    assert.equal(back,photos.get(record,1000,false,frame,true,'back'));
    assert.notEqual(back,photos.get(record,1000,true,crystalPortraitFrame(record,1000,null,.5),true,'back'));
  } finally { photos.dispose(); }
});

test('render lookups reuse a published brood and refresh on restore at the same time', () => {
  const mother=individual({soldAt:null,tank:'main'}), brood={motherId:mother.id,status:'formed'};
  let reads=0, state={now:Date.now()+60000,batches:[brood],get individuals(){
    reads++;
    return [mother,{...mother,id:'archived',soldAt:1,tank:null},{...mother,id:'resting',tank:'rest'},{...mother,id:'original',legacy:true}];
  }};
  const lookup=crystalLookLookup(()=>state);
  assert.deepEqual(lookup(mother.id),{individual:mother,batch:brood,now:state.now,growth:1});
  for(const id of ['archived','resting','original','missing'])assert.equal(lookup(id),null);
  assert.equal(reads,1);
  const restored={...mother,pattern:'mosura'};
  state={now:state.now,individuals:[restored],batches:[{...brood,status:'hatched'}]};
  assert.deepEqual(lookup(mother.id),{individual:restored,now:state.now,growth:1});
  state=null;
  assert.equal(lookup(mother.id),null);
});

test('only the live mother’s portrait follows the committed clutch through hatch and reload', () => {
  const mother = individual({tank:'main', soldAt:null});
  const father = {...mother, id:'dad', sex:'male'}, aunt = {...mother, id:'aunt'};
  const brood = {motherId:mother.id, formedAt:1000, hatchAt:2000, status:'formed'};
  let state = {now:1500, individuals:[mother,father,aunt], batches:[brood]};
  const photos = createCrystalPortraits({}, () => state);
  const current = at => photos.currentFrame(mother, at);
  const historic = crystalPortraitFrame(mother, 1500, state);
  assert.equal(current(999).key, historic.key);
  assert.equal(current(1000).eggProgress, 0);
  assert.equal(current(1020).key, current(1000).key);
  assert.equal(current(1500).eggProgress, .5);
  assert.equal(current(9000).eggProgress, 1, 'the last committed clutch stays visible if publishing a hatch failed');
  assert.equal(new Set([historic.key, current(1000).key, current(1500).key, current(9000).key]).size, 4);
  for (const other of [father, aunt, {...mother, tank:'rest'}, {...mother, soldAt:1000}]) {
    assert.equal(photos.currentFrame(other, 1500).eggProgress, null);
  }
  state = {...state, batches:[{...brood, status:'hatched'}]};
  assert.equal(current(1500).key, historic.key);
  photos.dispose();
});

test('live legacy portraits use their own egg clock and keep archive photographs free of a current clutch', () => {
  const old = {id:'legacy', legacy:true, sex:'female', soldAt:null, tank:'main', legacyHatchAt:9000};
  const state = {now:9000, individuals:[old], batches:[]};
  const photos = createCrystalPortraits({}, () => state);
  assert.equal(photos.currentFrame(old, 9000).eggProgress, 1);
  for (const other of [{...old, sex:'male'}, {...old, legacyHatchAt:null}, {...old, tank:'rest'}]) {
    assert.equal(photos.currentFrame(other, 9000).eggProgress, null);
  }
  assert.equal(crystalPortraitFrame(old, 9000, state).eggProgress, null);
  photos.dispose();
});

test('optional crystal callback preserves legacy material branch and shadows', () => {
  const a = animal(), look = installShrimpLook({record:() => ({ageDays:30}), simSeconds:() => 0});
  look.sync([a]);
  assert.equal(a.look.uniforms.aqCrystal.value, 0);
  assert.equal(a.sizeFactor, shrimpSizeFactor(a.id));
  assert.equal(a.mesh.castShadow, true); assert.equal(a.mesh.receiveShadow, true);
  const shader = {uniforms:{}, vertexShader:T.ShaderLib.standard.vertexShader, fragmentShader:T.ShaderLib.standard.fragmentShader};
  a.shell.onBeforeCompile(shader);
  assert.equal(shader.uniforms.aqCrystal, a.look.uniforms.aqCrystal);
  assert.ok(shader.vertexShader.includes('aqBody = position;'));
  assert.ok(shader.fragmentShader.includes('if (aqCrystal > 0.5)'));
  assert.ok(shader.fragmentShader.includes('#include <map_fragment>'));
  assert.ok(shader.fragmentShader.includes('#include <lights_physical_pars_fragment>'));
  assert.equal(shader.uniforms.aqShell.value, 1);
  assert.match(shader.fragmentShader, /dot\(nonPerturbedNormal, geometryViewDir\)/);
  assert.match(shader.fragmentShader, /mix\(outgoingLight, ink, rim\)/);
  assert.match(shader.fragmentShader, /aqPaleShell = aqShell \* \(1\. - aqColourMask\)/);
  assert.equal(a.shell.customProgramCacheKey(), 'shrimp-look-v8-shell');
  const eyeShader = {uniforms:{}, vertexShader:'eye-vertex', fragmentShader:'eye-fragment'};
  a.eye.onBeforeCompile(eyeShader);
  assert.equal(eyeShader.fragmentShader, 'eye-fragment');
});

test('explicit sex, colour, pattern and adult qualities update independent uniforms without recompilation', () => {
  const a = animal(); let current = individual(), now = 100;
  const look = installShrimpLook({record:() => ({ageDays:30}), simSeconds:() => 0, crystal:() => ({individual:current, now})});
  look.sync([a]);
  assert.equal(a.look.female, true); assert.equal(a.sizeFactor, shrimpSizeFactor(a.id, 'female'));
  assert.equal(a.look.uniforms.aqCrystal.value, 1); assert.equal(a.look.uniforms.aqCrystalPattern.value, 0);
  const red = a.look.uniforms.aqCrystalColour.value.clone(), materialVersion = a.shell.version;
  current = individual({sex:'male', colour:'black', pattern:'hinomaru', P:[9, 9, 9]}); look.sync([a]);
  assert.equal(a.look.female, false); assert.equal(a.look.uniforms.aqCrystalPattern.value, 1);
  assert.ok(a.look.uniforms.aqCrystalColour.value.x < red.x);
  assert.equal(a.look.uniforms.aqCrystalCoverage.value, 1); assert.equal(a.look.uniforms.aqCrystalEdge.value, 1);
  current = individual({pattern:'mosura'}); look.sync([a]);
  assert.equal(a.look.uniforms.aqCrystalPattern.value, 2); assert.equal(a.shell.version, materialVersion);
});

test('narrow and wide markings share the white pigment of the visible colour trait', () => {
  const a = animal(), record = individual();
  const look = installShrimpLook({record:() => null, simSeconds:() => 0, crystal:() => ({individual:record, growth:1})});
  function sample(colour, strength, coverage) {
    record.colour = colour; record.P = [strength, coverage, 7];
    look.sync([a]);
    const {aqCrystalColour, aqCrystalWhite, aqCrystalCoverage} = a.look.uniforms;
    return {pigment:aqCrystalColour.value.toArray(), white:aqCrystalWhite.value, coverage:aqCrystalCoverage.value};
  }
  for (const colour of ['red', 'black']) {
    const narrow = sample(colour, 8, 2), wide = sample(colour, 8, 8), pale = sample(colour, 2, 2);
    assert.equal(narrow.white, wide.white);
    assert.deepEqual(narrow.pigment, wide.pigment);
    assert.ok(narrow.coverage < wide.coverage);
    assert.equal(narrow.coverage, pale.coverage);
    assert.ok(narrow.white > pale.white);
  }
  look.dispose();
});

test('individual marking geometry follows permanent identity through maturity and a rebuilt rig',()=>{
  let now=0, record=individual({id:'crystal-2', adultAt:100});
  const look=installShrimpLook({record:()=>null,simSeconds:()=>0,crystal:()=>({individual:record,now})});
  const a=animal(record.id), checkShape=obj=>obj.look.uniforms.aqMarkingShape.value.toArray();
  look.sync([a]); const young=checkShape(a);
  now=100; record={...record,name:'砂糖',P:[2,9,1],tank:'breeding'}; look.sync([a]);
  assert.deepEqual(checkShape(a),young);
  const restored=animal(record.id); look.sync([restored]);assert.deepEqual(checkShape(restored),young);
  record={...record,id:'crystal-3'};
  const sibling=animal(record.id);look.sync([sibling]);
  assert.notDeepEqual(checkShape(sibling),young);
  assert.equal(sibling.shell.customProgramCacheKey(),a.shell.customProgramCacheKey());
});

test('bred and adopted juveniles use their own growth duration, including custom and restored clocks',()=>{
  for(const [growthMs,hatch] of [[2700000,600000],[5400000,900000],[120,4]]){
    const clock={growthMs,stageMs:{hatch},now:10000000+growthMs};
    const adultAt=clock.now, pairedAt=adultAt-growthMs;
    for(const [source,start] of [['bred',pairedAt+hatch],['development-founder',pairedAt]]){
      const r=individual({source,adultAt});
      assert.equal(crystalGrowthFraction(r,start-1000,clock),0);
      for(const phase of [0,.25,.5,.75,1]){
        const now=start+(adultAt-start)*phase;
        assert.equal(crystalGrowthFraction(r,now,clock),phase);
        const frame=crystalPortraitFrame(r,now,clock);
        assert.equal(frame.growth,phase);
        assert.ok(Math.abs(frame.bodyScale/shrimpSizeFactor(r.id,r.sex)-(.45+.55*phase))<1e-8);
      }
      assert.equal(crystalGrowthFraction(r,adultAt+86400000,clock),1);
      const key=at=>crystalPortraitFrame(r,at,clock).key;
      assert.equal(key(start),key(start+(adultAt-start)*.05));
      assert.ok(crystalPortraitFrame(r,start+(adultAt-start)*.05,clock).bodyScale>crystalPortraitFrame(r,start,clock).bodyScale);
      assert.notEqual(key(start),key((start+adultAt)/2));
      assert.notEqual(crystalPortraitFrame({...r,P:[3,4,5]},(start+adultAt)/2,clock).key,key((start+adultAt)/2));
    }
  }
});

test('juvenile markings develop steadily in both directions, with fine quality differences appearing late',()=>{
  let clock={growthMs:6000,stageMs:{hatch:1000},now:2000};
  const r=individual({source:'bred',adultAt:7000,P:[8,7.5,1.25],B:[9,1,9]});
  const a=animal(r.id), look=installShrimpLook({record:()=>null,simSeconds:()=>0,
    crystal:()=>({individual:r,growth:crystalGrowthFraction(r,clock.now,clock)})});
  function sample(at){
    clock.now=at;look.sync([a]);
    const u=a.look.uniforms;
    return [u.aqCrystalCoverage.value,u.aqCrystalEdge.value,u.aqCrystalColour.value.x];
  }
  const birth=sample(2000),middle=sample(4500),late=sample(6000),end=sample(7000);
  assert.deepEqual(birth,[.25,.25,.32+.3*3/8]);
  assert.ok(birth[0]<middle[0] && middle[0]<late[0] && late[0]<end[0]);
  assert.ok(birth[2]<middle[2] && middle[2]<late[2] && late[2]<end[2]);
  assert.ok(birth[1]===middle[1] && middle[1]>late[1] && late[1]>end[1]);
  assert.deepEqual(end.slice(0,2),[(7.5-1)/8,(1.25-1)/8]);
  r.B=[1,9,1];r.P=[8,8,1.75];
  assert.deepEqual(sample(4500),middle);
  assert.notDeepEqual(sample(7000),end);
  assert.deepEqual(sample(2000),birth);
});

test('restoring a legacy female on a reused rig updates size, pigment and clutch together',()=>{
  const a=animal('id-0'), record={ageDays:120,hatchAt:999999};
  const look=installShrimpLook({record:()=>record,simSeconds:()=>0});
  look.sync([a]);
  const malePigment=a.look.basePigment, tint=a.look.uniforms.aqTint.value, maleTint=tint.clone();
  assert.equal(a.look.female,false);
  record.sex='female';
  look.sync([a]);
  assert.equal(a.sizeFactor,shrimpSizeFactor(a.id,'female'));
  assert.equal(a.look.eggs.visible,true);
  assert.ok(a.look.basePigment>malePigment && !tint.equals(maleTint));
  delete record.sex;
  look.sync([a]);
  assert.equal(a.look.eggs.visible,false);
  assert.equal(a.look.basePigment,malePigment);
  assert.ok(tint.equals(maleTint));
});

test('juvenile visual quality cannot reveal locked adult P and eggs use real brood milliseconds', () => {
  const a = animal(); let current = individual({adultAt:1000, P:[9, 9, 9]}), now = 100;
  let batch = {motherId:a.id, status:'formed', formedAt:0, hatchAt:900};
  const look = installShrimpLook({record:() => ({ageDays:0, hatchAt:999999}), simSeconds:() => 0, crystal:() => ({individual:current, now, batch})});
  look.sync([a]);
  const before = [a.look.uniforms.aqCrystalCoverage.value, a.look.uniforms.aqCrystalEdge.value, a.look.uniforms.aqCrystalWhite.value, a.look.uniforms.aqCrystalColour.value.toArray()];
  current = individual({adultAt:1000, P:[1, 1, 1]}); look.sync([a]);
  assert.deepEqual([a.look.uniforms.aqCrystalCoverage.value, a.look.uniforms.aqCrystalEdge.value, a.look.uniforms.aqCrystalWhite.value, a.look.uniforms.aqCrystalColour.value.toArray()], before);
  assert.equal(a.look.eggs.visible, true);
  now = 950; look.sync([a]);
  assert.equal(a.look.eggs.visible, true, 'a delayed or failed hatch save must leave the clutch visible');
  batch = {...batch, status:'hatched'}; look.sync([a]);
  assert.equal(a.look.eggs.visible, false, 'old colony egg timestamps cannot keep crystal eggs after hatch');
  current = individual({sex:'male'}); batch = {...batch, status:'formed', hatchAt:2000}; look.sync([a]);
  assert.equal(a.look.eggs.visible, false);
});
