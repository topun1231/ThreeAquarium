import test from 'node:test';
import assert from 'node:assert/strict';
import {qualityPreset,installTankLook,prepareWallpaperLights,shapeTankLights} from '../src/tank-look.js';
import {illustrateHardscape} from '../src/illustrated-look.js';
import {addWindowShadow,crafted} from '../src/crafted.js';
import {loadAquarium} from '../src/assets.js';
import {AquariumWater} from '../src/water.js';
import {finishWindowWall,shadeFloorUnderFurniture} from '../src/room-finishes.js';
import {createRoomCutaway} from '../src/camera-motion.js';
import {readFileSync} from 'node:fs';
import * as T from 'three';

test('wallpaper PCF retains native depth comparison and delegates unsupported shadows to the renderer',()=>{
  const scene=new T.Scene(), sun=new T.DirectionalLight(), spot=new T.SpotLight(), point=new T.PointLight(), oversized=new T.DirectionalLight();
  scene.add(sun,spot,point,oversized);
  for(const light of scene.children)light.castShadow=true;
  sun.shadow.mapSize.set(4096,3072);oversized.shadow.mapSize.set(8192,8192);
  const renderer={shadowMap:{type:T.VSMShadowMap},capabilities:{maxTextureSize:4096,reversedDepthBuffer:false}};
  prepareWallpaperLights(scene,renderer);
  assert.ok(scene.children.every(l=>l.layers.isEnabled(0)&&l.layers.isEnabled(1)));
  assert.ok(scene.children.every(l=>!l.shadow.map));
  renderer.shadowMap.type=T.PCFShadowMap;
  prepareWallpaperLights(scene,renderer);
  const target=sun.shadow.map;
  assert.deepEqual([target.width,target.height,target.texture.format],[4096,3072,T.RedFormat]);
  assert.deepEqual([target.depthTexture.type,target.depthTexture.compareFunction,target.depthTexture.magFilter,target.depthTexture.minFilter],
    [T.UnsignedIntType,T.LessEqualCompare,T.LinearFilter,T.LinearFilter]);
  assert.ok(spot.shadow.needsUpdate);assert.equal(point.shadow.map,null);assert.equal(oversized.shadow.map,null);
  prepareWallpaperLights(scene,renderer);assert.equal(sun.shadow.map,target);
});

test('wallpaper shaders compile for each pass and restore draw state even on failure', () => {
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(), previous={};
  const visible=new T.Mesh(), glass=new T.Mesh(), hidden=new T.Group();
  glass.layers.set(1);hidden.visible=false;hidden.add(new T.Mesh());
  scene.add(visible,glass,hidden);
  let current=previous,fail=false;
  const compiled=[];
  const renderer={
    toneMapping:T.ACESFilmicToneMapping,capabilities:{maxSamples:0},getRenderTarget:()=>current,
    setRenderTarget:target=>{current=target;},
    compile(group,view,lights){
      const pass=group===water.blitScene?'copy':group===water.inkScene?'ink':view.layers.isEnabled(1)?'glass':'room';
      const target=pass==='room'?water.reflection:pass==='ink'?null:water.composite;
      assert.equal(current,target);
      assert.equal(this.toneMapping,pass==='copy'||pass==='glass'?T.NoToneMapping:T.ACESFilmicToneMapping);
      if(pass==='room'||pass==='glass'){
        assert.equal(view,camera);assert.equal(lights,scene);
        assert.deepEqual(group.children.map(mesh=>mesh.material),[pass==='room'?visible.material:glass.material]);
      }else assert.equal(view,water.blitCamera);
      compiled.push(pass);
      if(fail && pass==='glass')throw Error('compiler interrupted');
    },
  };
  const water=new AquariumWater(renderer,scene,camera,{meshes:[]});
  camera.layers.enable(4);
  water.preparePrograms();
  assert.deepEqual(compiled,['copy','glass','ink','room']);
  assert.equal(current,previous);assert.equal(camera.layers.mask,17);
  fail=true;
  assert.throws(()=>water.preparePrograms(),/compiler interrupted/);
  assert.equal(current,previous);assert.equal(camera.layers.mask,17);
  assert.equal(renderer.toneMapping,T.ACESFilmicToneMapping);
  assert.equal(visible.parent,scene);assert.equal(glass.parent,scene);
  assert.equal(water.reflectionDirty,true);
});

test('a failed reflection stays dirty and releases the shared shadow update setting', () => {
  const camera=new T.PerspectiveCamera(), shadowMap={enabled:true,autoUpdate:true,needsUpdate:false};
  const renderer={shadowMap,capabilities:{maxSamples:0},getDrawingBufferSize:size=>size.set(1,1),setRenderTarget:target=>assert.equal(target,null)};
  const shrimp=new T.Group(), pellet=new T.Group();
  pellet.visible=false;
  const live=[shrimp,pellet];
  const water=new AquariumWater(renderer,new T.Scene(),camera,{meshes:[]},()=>live);
  water.cube.update=()=>{
    assert.ok(live.every(object=>!object.visible));
    assert.equal(shadowMap.autoUpdate,false);
    assert.equal(shadowMap.needsUpdate,true);
    shadowMap.needsUpdate=false;
    water.reflection.texture.generateMipmaps=false;
    throw Error('interrupted reflection');
  };
  assert.throws(()=>water.render(0),/interrupted reflection/);
  assert.equal(water.reflectionDirty,true);
  assert.equal(water.reflection.texture.generateMipmaps,true);
  assert.equal(shadowMap.autoUpdate,true);
  assert.equal(shrimp.visible,true);assert.equal(pellet.visible,false);
  water.cube.update=()=>{assert.equal(shadowMap.needsUpdate,true);shadowMap.needsUpdate=false;};
  water.cutaway=()=>{assert.equal(shadowMap.autoUpdate,true);assert.equal(shrimp.visible,true);assert.equal(pellet.visible,false);};
  water.render(1);
  assert.equal(water.reflectionDirty,false);
  water.restoreContext();
  let captures=0;
  live.push(new T.Group());
  water.cube.update=()=>{assert.ok(live.every(object=>!object.visible));captures++;shadowMap.needsUpdate=false;};
  water.render(2);water.render(3);
  assert.equal(captures,2,'only the first draw after a GPU reset primes the restored cube');
  water.reflectionDirty=true;water.render(4);
  assert.equal(captures,3,'ordinary scene updates still use one capture');
});

test('interrupted glass pass releases scene and renderer state for the next wallpaper frame', () => {
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(),background=new T.Color(0x998877);
  scene.background=background;
  let target,interrupt=true;
  const passUpdates=[];
  const renderer={
    capabilities:{maxSamples:0},info:{autoReset:true,reset(){}},autoClear:true,toneMapping:T.ACESFilmicToneMapping,
    getDrawingBufferSize:size=>size.set(1,1),setRenderTarget:value=>{target=value;},
    render(world,view){
      if(world!==scene)return;
      passUpdates.push(scene.matrixWorldAutoUpdate);
      if(interrupt && view.layers.mask===2)throw Error('glass');
    }
  };
  const water=new AquariumWater(renderer,scene,camera,{meshes:[]});
  water.reflectionDirty=false;
  assert.throws(()=>water.render(0),/glass/);
  assert.equal(target,null);assert.equal(scene.background,background);assert.equal(camera.layers.mask,1);
  assert.equal(renderer.toneMapping,T.ACESFilmicToneMapping);assert.ok(renderer.autoClear && renderer.info.autoReset);
  assert.equal(scene.matrixWorldAutoUpdate,true);
  interrupt=false;water.render(1);
  scene.matrixWorldAutoUpdate=false;water.render(2);
  assert.equal(scene.matrixWorldAutoUpdate,false);
  assert.deepEqual(passUpdates,[true,false,true,false,false,false]);
});

test('only live wallpaper reuses recent shadows; scenery changes, retries and clock resets draw fresh maps',()=>{
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(), draws=[];
  const shadows={enabled:true,autoUpdate:true,needsUpdate:false};
  let fail=false;
  const renderer={shadowMap:shadows,capabilities:{maxSamples:0},info:{reset(){}},
    getDrawingBufferSize:size=>size.set(1,1),setRenderTarget(){},
    render(world,view){
      if(world===scene && view.layers.mask===2)assert.equal(shadows.autoUpdate,false);
      if(world===scene && view.layers.mask===1){
        draws.push(shadows.autoUpdate || shadows.needsUpdate);
        shadows.needsUpdate=false;
        if(fail)throw Error('interrupted');
      }
    }};
  const water=new AquariumWater(renderer,scene,camera,{meshes:[]});
  water.cube.update=()=>{};
  const live=t=>water.render(t,true,camera,true);
  live(0);live(.04);live(.08);
  water.reflectionDirty=true;live(.09);
  shadows.needsUpdate=true;live(.10);
  fail=true;assert.throws(()=>live(.11),/interrupted/);
  assert.equal(shadows.autoUpdate,true);
  fail=false;live(.12);live(.01);
  water.render(.02,true,camera);
  water.restoreContext();live(.03);
  assert.deepEqual(draws,[true,false,true,true,true,false,true,true,true,true]);
});

test('glass reads the window shadow generated by the current opaque pass',()=>{
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(),sun=new T.DirectionalLight(0xffdfb5,1.8);
  sun.userData.windowLight=sun.castShadow=true;scene.add(sun);
  const pane=new T.Mesh(new T.PlaneGeometry(),[new T.MeshBasicMaterial({name:'WaterAwareGlass'})]);
  const outputs=[];
  const renderer={shadowMap:{type:T.PCFShadowMap,enabled:true},capabilities:{maxSamples:0},info:{reset(){}},
    getDrawingBufferSize:size=>size.set(1,1),setRenderTarget(){},render(world,view){
      if(world!==scene)return;
      if(view.layers.mask===1)sun.shadow.map={depthTexture:new T.DepthTexture()};
      else {
        const uniforms=pane.material.uniforms;
        assert.equal(uniforms.aqSunDepth.value,sun.shadow.map.depthTexture);
        assert.equal(uniforms.aqSunMatrix.value,sun.shadow.matrix);
        outputs.push(uniforms.aqSunColor.value.r);
      }
    }};
  const water=new AquariumWater(renderer,scene,camera,{meshes:[pane]});water.reflectionDirty=false;
  water.render(0);sun.visible=false;water.render(1);
  assert.deepEqual(outputs,[1.8,0]);
});

test('catalogue reuses matching scene textures and retries failed reads', async t => {
  const requests=[];
  let fail=false;
  t.mock.method(T.TextureLoader.prototype,'loadAsync',async url=>{
    requests.push(url);
    if(fail)throw Error('texture unavailable');
    return new T.Texture();
  });
  const material={name:'Rock',shader:'Lit',color:[1,1,1],leaf:-1,roughness:.6,metalness:0,opacity:1,cutoff:0,transparent:false,map:'surface.webp'};
  const pack={version:'unity-source-1',nodes:[],draws:[],geometries:[],animals:[]};
  const scene=await loadAquarium(undefined,{pack:{...pack,materials:[material]}});
  const read=materials=>loadAquarium(undefined,{pack:{...pack,materials},textureCache:scene.textureCache});
  const {materials:[shared,changed]}=await read([material,{...material,normal:'surface.webp',tiling:[2,1,.25,0]}]);
  assert.notEqual(shared,scene.materials[0]);
  assert.equal(shared.map,scene.materials[0].map);
  assert.notEqual(shared.map,changed.map);
  assert.notEqual(changed.map,changed.normalMap);
  assert.equal(changed.normalMap.colorSpace,T.NoColorSpace);
  assert.deepEqual(changed.map.repeat.toArray(),[2,1]);
  assert.deepEqual(shared.map.repeat.toArray(),[1,1]);
  assert.equal(requests.length,3);
  const missing={...material,map:'retry.webp'};
  fail=true;await assert.rejects(read([missing]),/texture unavailable/);
  fail=false;await read([missing]);await read([missing]);
  assert.equal(requests.filter(url=>url.endsWith('retry.webp')).length,2);
});

test('stationary leaves skip sway in both colour and shadow programs', async () => {
  const leaf = {name:'Leaf',shader:'LeafSurface',color:[1,1,1],leaf:1,plantVariation:.5,
    roughness:.6,metalness:0,opacity:1,cutoff:0,doubleSided:true,transparent:false};
  const pack = {version:'unity-source-1',nodes:[],draws:[],geometries:[],animals:[],
    materials:[{...leaf,motion:0},{...leaf,motion:1}]};
  const {materials:[still,moving]} = await loadAquarium(undefined,{pack});
  for (const [a,b,lib] of [[still,moving,T.ShaderLib.standard],
      [still.userData.depth,moving.userData.depth,T.ShaderLib.depth]]) {
    assert.notEqual(a.customProgramCacheKey(),b.customProgramCacheKey());
    const first={...lib,uniforms:{}}, second={...lib,uniforms:{}};
    a.onBeforeCompile(first); b.onBeforeCompile(second);
    assert.equal(first.vertexShader,lib.vertexShader);
    assert.match(second.vertexShader,/transformed=aqFlow\(position\)/);
  }
});

test('daylight uses the original directional shadow and stays on when the aquarium lamp is off',()=>{
  const scene=new T.Scene(), sun=new T.DirectionalLight(), lamp=new T.SpotLight();
  const fixtureAngle=46*Math.PI/180;
  lamp.angle=fixtureAngle;
  sun.castShadow=lamp.castShadow=true;
  const fill=new T.DirectionalLight('#dee8ff',.75);
  scene.add(sun,lamp,fill);
  shapeTankLights(scene);
  assert.deepEqual(scene.children.filter(l=>l.isSpotLight),[lamp]);
  assert.equal(lamp.angle,fixtureAngle);
  assert.deepEqual(scene.children.filter(l=>l.userData.windowLight),[sun,fill]);
  assert.ok(sun.position.x<sun.target.position.x && sun.position.z<sun.target.position.z);
  assert.deepEqual(scene.children.filter(l=>l.isLight && l.castShadow),[sun,lamp]);
  lamp.position.set(0,.75,0);scene.add(lamp.target);
  scene.updateMatrixWorld(true);lamp.shadow.updateMatrices(lamp);
  const nearBlocker=new T.Vector3(0,.67,0).applyMatrix4(lamp.shadow.matrix);
  assert.ok(nearBlocker.z>0 && nearBlocker.z<1,'a blocker between the lamp and water must be in shadow range');
  assert.ok(sun.color.r>sun.color.b);
  assert.ok(fill.color.b<=fill.color.g && fill.color.g<=fill.color.r);
  assert.equal(fill.intensity,.75);
});

test('window glass admits sunlight while the sill, frame and plaster cast shadows across the desk',()=>{
  const scene=new T.Scene(), room=new T.Group();
  room.scale.set(.81,.81,-.81); scene.add(room);
  const wall=new T.Mesh(new T.BoxGeometry(16,5,.1));
  wall.position.set(0,1.3,1.42); room.add(wall); wall.castShadow=true;
  const frame=addWindowShadow(wall);
  const sun=new T.DirectionalLight(); sun.castShadow=true; scene.add(sun,sun.target);
  shapeTankLights(scene); scene.updateMatrixWorld(true); sun.shadow.updateMatrices(sun);
  const direction=sun.position.clone().sub(sun.target.position).normalize();
  const planeZ=new T.Box3().setFromObject(wall).max.z;
  assert.ok(sun.position.z<planeZ && !wall.castShadow && frame.castShadow);
  for(const [u,v,blocked] of [[.16,.55,false],[.36,.55,false],[.16,.88,false],[.36,.88,false],
                              [.257,.55,true],[.36,.76,true],[.36,.30,true],[.49,.55,true],[.36,1.02,true]]){
    const p=new T.Vector3(-2.37+3.61*u,-.29+1.84*v,planeZ);
    const origin=p.clone().addScaledVector(direction,-1);
    assert.equal(new T.Raycaster(origin,direction).intersectObject(frame,false).length>0,blocked);
  }
  for(const x of [-1.62,1.62])for(const z of [-1.03,.84]){
    const point=new T.Vector3(x,-.037,z).project(sun.shadow.camera);
    assert.ok(Math.max(Math.abs(point.x),Math.abs(point.y),Math.abs(point.z))<1);
  }
});

test('floor boards lose diffuse skylight directly below the shelf and remain lit on the open side',()=>{
  const floor=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());
  floor.position.set(0,-1.15,3);floor.scale.set(40,.10,26);
  shadeFloorUnderFurniture(floor,[{x:2.7,z:.04,w:2.76,d:.86,height:.14}]);
  const {aoMap}=floor.material, {width,height,data}=aoMap.image;
  function occlusionAt(x,z){
    const u=(.5+x/40)*aoMap.repeat.x+aoMap.offset.x;
    const v=(.5-(z-3)/26)*aoMap.repeat.y+aoMap.offset.y;
    return data[Math.floor(v*height)*width+Math.floor(u*width)];
  }
  assert.ok(occlusionAt(2.7,.04)<28);
  assert.ok(occlusionAt(2.7,.8)>occlusionAt(2.7,.52));
  assert.ok(occlusionAt(-2.5,1.8)>245);
});

test('the wall ledge stays put when switching bays and cuts away with the window',()=>{
  const decor=new T.Group(),cube=new T.BoxGeometry(),wall=new T.Mesh(cube,[new T.MeshBasicMaterial({name:'Sunlit window garden'})]);
  wall.name='Dim room wall';decor.scale.z=-1;wall.position.set(0,1.3,1.4);wall.scale.set(16,5,.1);decor.add(wall);
  const cutaway=createRoomCutaway([wall]);
  finishWindowWall(decor,cube,wall,{materials:[]},-1.1);
  const pot=wall.getObjectByName('Terracotta on the window ledge'),point=pot.getWorldPosition(new T.Vector3());
  assert.ok(point.distanceTo(new T.Vector3(.78,1.666,-1.24))<1e-6);
  decor.position.x=-2.48;
  assert.ok(pot.getWorldPosition(new T.Vector3()).distanceTo(point.add(decor.position))<1e-6);
  const camera=new T.PerspectiveCamera();camera.position.z=-2;
  cutaway(camera,()=>{let found=false;decor.traverseVisible(o=>{if(o===pot)found=true;});assert.equal(found,false);});
  assert.ok(wall.visible);
});

test('the diffuser stays against its housing and switches independently of the water level',()=>{
  const pack=JSON.parse(readFileSync(new URL('../public/assets/scene.json',import.meta.url),'utf8'));
  const node=pack.nodes.find(n=>n.name==='Diffused LED underside');
  const draw=pack.draws.find(d=>pack.nodes[d.node]===node);
  const material=new T.MeshStandardMaterial({name:pack.materials[draw.materials[0]].name});
  const mesh=new T.Mesh(new T.BoxGeometry(),material), mount=new T.Group();
  mesh.name=node.name;mesh.geometry.name='Cube';mount.add(mesh);mount.scale.fromArray(node.s);mount.position.fromArray(node.p);
  const housingNode=pack.nodes.find(n=>n.name==='Slim anodized plant light'),housing=mesh.clone(),housingMount=new T.Group();
  housing.name=housingNode.name;housingMount.add(housing);housingMount.scale.fromArray(housingNode.s);housingMount.position.fromArray(housingNode.p);
  const housingBottom=housingMount.position.y-housingMount.scale.y/2;
  const top=mount.position.y+mount.scale.y/2;
  const look=installTankLook({scene:new T.Scene(),aq:{meshes:[mesh,housing],materials:[material]}});
  assert.ok(Math.abs(housingMount.position.y-housingMount.scale.y/2-housingBottom)<1e-8);
  for(const part of [mesh,housing]){
    assert.equal(part.geometry.type,'RoundedBoxGeometry');
    assert.deepEqual(part.geometry.groups,[{start:0,count:part.geometry.attributes.position.count,materialIndex:0}]);
  }
  assert.ok(mount.scale.y>node.s[1]);
  assert.ok(Math.abs(mount.position.y+mount.scale.y/2-top)<1e-8);
  assert.ok(material.emissive.r>material.emissive.b && material.emissive.b>0);
  for(const wet of [true,false]) {
    look.update(0,{wet,lightOn:false});assert.equal(material.emissiveIntensity,0);
    look.update(0,{wet,lightOn:true});assert.ok(material.emissiveIntensity>0);
  }
});

test('room finishes retain authored pigments and distinct programs after tank lighting is installed', () => {
  const pack = JSON.parse(readFileSync(new URL('../public/assets/scene.json', import.meta.url), 'utf8'));
  const descriptors = pack.materials.filter(m => m.crafted);
  const clock = {value: 0};
  const materials = descriptors.map(m => {
    const material = new T.MeshStandardMaterial({name:m.name});
    crafted(material,m,clock);
    return material;
  });
  installTankLook({scene:new T.Scene(),aq:{meshes:[],materials}});
  const keys = new Set();
  for (const [index,material] of materials.entries()) {
    const shader = {...T.ShaderLib.standard,uniforms:{}};
    material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader,/aqDetail=aqRoomPaint\(aqWorld\)/);
    assert.ok(shader.uniforms.aqDark.value.equals(new T.Color().fromArray(descriptors[index].crafted.dark).convertSRGBToLinear()));
    assert.equal(shader.uniforms.aqLight.value,material.color);
    if (material.name.includes('Satin walnut')) {
      assert.equal(material.shadowSide,T.BackSide,'the closed tabletop must not shadow its sunlit face');
      assert.equal(shader.uniforms.aqDeskWater,material.userData.deskWater);
      assert.ok(!('aqRoomTime' in shader.uniforms),'stationary blockers cast stationary shadows on the desk');
    }
    keys.add(material.customProgramCacheKey());
  }
  assert.equal(keys.size,5);
});

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
  const desk=new T.MeshStandardMaterial();desk.userData.deskWater={value:0};
  const water={fog:{value:0}};
  const look=installTankLook({scene,aq:{meshes:[],materials:[material,desk]},water});
  const shader={uniforms:{},vertexShader:'',fragmentShader:''};material.onBeforeCompile(shader);
  assert.equal(scene.getObjectByName('tank-drift'),undefined);
  assert.equal(scene.children.some(o=>o.isPoints),false);
  assert.equal(scene.getObjectByName('tank-shafts'),undefined);
  look.update(1,{wet:false});assert.equal(water.lampScattering,false);assert.equal(shader.uniforms.aqCGain.value,0);
  assert.equal(desk.userData.deskWater.value,0);
  assert.equal(desk.userData.caustic,undefined,'the desktop uses its own window-light shader');
  look.update(2,{wet:true,lightOn:true,level:.2});assert.equal(water.lampScattering,true);assert.ok(shader.uniforms.aqCGain.value>0);assert.equal(shader.uniforms.aqCLevel.value,.2);
  assert.equal(desk.userData.deskWater.value,.2,'desk sunlight follows the actual filling height');
  const sunlight=shader.uniforms.aqCGain.value;
  look.update(3,{wet:true,lightOn:false});assert.equal(water.lampScattering,false);assert.equal(shader.uniforms.aqCGain.value,sunlight);
  assert.equal(desk.userData.deskWater.value,.58,'window light still passes through a full tank with the lamp off');
  look.update(4,{wet:true,level:0,lightOn:true});assert.equal(water.lampScattering,false);assert.equal(shader.uniforms.aqCGain.value,0);
});

test('fresh and restored hardscape and catalog foliage share tank lighting and keep their own shaders', () => {
  const stone = () => {
    const m = new T.MeshStandardMaterial({name:'rock_09_PBR_Copy'});
    m.onBeforeCompile = shader => { shader.uniforms.imported = {value:true}; };
    illustrateHardscape(m); return m;
  };
  const original = stone(), restored = stone(), fresh = stone(), wood = new T.MeshStandardMaterial({name:'driftwood_scan_PBR_Copy'});
  illustrateHardscape(wood);
  const foliage = new T.MeshStandardMaterial(), other = new T.MeshStandardMaterial({name:'Lit'});
  foliage.userData.source = {leaf:0};
  foliage.onBeforeCompile = shader => { shader.uniforms.sway = {value:true}; };
  const runtime = {catalog:{materials:[restored,wood,other]}};
  const look = installTankLook({aq:{meshes:[],materials:[original]},scene:new T.Scene(),runtime});
  runtime.onCatalogReady({materials:[fresh,foliage]});
  const shaders = [original,restored,fresh].map(m => {
    const shader={...T.ShaderLib.standard,uniforms:{}};
    m.onBeforeCompile(shader);
    assert.ok(shader.uniforms.imported.value);
    assert.match(shader.fragmentShader,/texture2D\(map, vMapUv, /);
    assert.match(shader.fragmentShader,/sqrt\(grain\)/);
    return shader;
  });
  const compile = m => {
    const shader = {...T.ShaderLib.standard,uniforms:{}};
    m.onBeforeCompile(shader); return shader;
  };
  const woodShader = compile(wood), leafShader = compile(foliage);
  assert.match(woodShader.fragmentShader,/texture2D\(map, vMapUv, 1\.05\)/);
  assert.doesNotMatch(woodShader.fragmentShader,/sqrt\(grain\)/);
  assert.ok(leafShader.uniforms.sway.value);
  assert.equal(other.userData.caustic,undefined);
  look.update(7,{wet:true,level:.43});
  for (const shader of [...shaders,woodShader,leafShader]) {
    assert.equal(shader.uniforms.aqCTime,shaders[0].uniforms.aqCTime);
    assert.equal(shader.uniforms.aqCTime.value,7);
    assert.equal(shader.uniforms.aqCLevel.value,.43);
  }
});
