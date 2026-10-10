import './style.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadAquarium} from './assets.js';
import {SAVE_KEY,validateProgress} from './state.js';
import {createHabitat} from './habitat.js';
import {CreatureWorld,GAME_SAVE_KEY,validateGame} from './creatures.js';
import {PlantLayout} from './layout.js';
import {plantEditor} from './editor.js';
import {fullGameplay} from './gameplay.js';
import {resizePopulation} from './population.js';
import {FootContacts} from './foot-contacts.js';
import {AquariumWater} from './water.js';
import {PlantContacts} from './plant-contacts.js';

const $=id=>document.getElementById(id);
const renderer=new THREE.WebGLRenderer({canvas:$('tank'),antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
const scene=new THREE.Scene();scene.background=new THREE.Color('#202629');
const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.002,30);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.045;controls.maxDistance=4;controls.maxPolarAngle=Math.PI*.98;controls.panSpeed=.5;
const keys=new Set();let paused=false,time=0,previous=0,selected=null,aq=null,world=null,seed=null,habitat=null,accumulator=0,lastSave=0,saveBlocked=false,layout=[],layoutModel=null,editor=null,editing=false,busy=false;
let full=null,waterRenderer=null;const feet=new FootContacts(),plantContacts=new PlantContacts();
const mirror=a=>new THREE.Vector3(a[0],a[1],-a[2]);
const message=text=>{$('message').textContent=text;};
function reset(){if(!aq)return;const c=aq.pack.camera;camera.position.copy(mirror(c.position));controls.target.copy(mirror(c.target));camera.fov=c.fov;camera.updateProjectionMatrix();controls.update();selected=null;$('selection').textContent='整缸观察';}
function progress(){return {version:1,tankId:aq.pack.tankId,camera:camera.position.toArray(),target:controls.target.toArray(),action:$('action').value};}
function apply(value){const p=validateProgress(value,aq.pack.tankId);camera.position.fromArray(p.camera);controls.target.fromArray(p.target);$('action').value=p.action;setAction(p.action);controls.update();}
function snapshot(){return full?full.snapshot():{...world.snapshot(),layout:structuredClone(layout)};}
function status(){const visible=aq.pack.nodes.filter(n=>/^[WR]0 /.test(n.name)).length;$('status').textContent=`${layout.length?'已调整布局':'原缸布局'} · ${aq.pack.plants} 株水草 · ${visible} 件木石 · ${aq.animals.length} 只虾`;}
function lock(value){busy=value;for(const id of ['feed','pause','action','save','export','import','edit-plants','plant-choice','plant-move','plant-left','plant-right'])$(id).disabled=value;for(const id of ['feed','action'])$(id).disabled=value||editing;}
async function commitLayout(next){
 if(busy)throw new Error('正在更新，请稍候');if(saveBlocked)throw new Error('请先导入有效进度，原浏览器存档尚未恢复');
 layoutModel.ensureUnoccupied(layout,next,world);lock(true);message('正在更新水草与栖息路线…');
 try{await new Promise(r=>setTimeout(r,0));const candidate=await layoutModel.prepare(next,habitat),nextWorld=layoutModel.relocate(world.snapshot(),seed,candidate);
  localStorage.setItem(GAME_SAVE_KEY,JSON.stringify({...nextWorld.snapshot(),layout:candidate.layout}));
  world=nextWorld;seed=candidate.seed;habitat=candidate.habitat;layout=candidate.layout;layoutModel.apply(aq,layout);accumulator=0;lastSave=world.elapsed;setAction($('action').value);status();
 }finally{lock(false);}
}
function saveGame(){if(busy||full?.busy)return false;if(full)return full.save();if(saveBlocked){message("原浏览器进度未覆盖，请导入有效进度后继续保存");return false;}try{localStorage.setItem(GAME_SAVE_KEY,JSON.stringify(snapshot()));return true;}catch(e){message('游戏保存失败：'+e.message);return false;}}
function save(){if(!world)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(progress()));if(saveGame())message('底床、造景、生长、虾与食物进度及视角已保存到本浏览器');}catch(e){message('保存失败：'+e.message);}}
function setAction(name){if(!world)return;for(const a of world.agents){a.manual=name==='Auto'?null:name;}if(name!=='Auto')aq.animals.forEach(a=>a.play(name));}
$('feed').onclick=()=>{if(!world||editing||busy)return;setAction('Auto');$('action').value='Auto';world.dropFood();saveGame();message('已在前景投喂，虾会按距离、饥饿与性格陆续发现食物');};
$('reset').onclick=()=>reset();$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'继续模拟':'暂停模拟';$('pause').setAttribute('aria-pressed',String(paused));};
$('action').onchange=()=>{setAction($('action').value);message($('action').value==='Auto'?'已恢复自主行为':'动作检查中：暂停虾的行为和移动，选择自主行为可恢复');};
$('save').onclick=save;
$('export').onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({version:full?4:3,view:progress(),game:snapshot()},null,2)],{type:'application/json'}));a.href=url;a.download='aquarium-three-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onchange=async e=>{const file=e.target.files[0];if(!file||!world||busy)return;lock(true);try{
 if(file.size>16*1024*1024)throw new Error('文件过大，请选择本迁移版导出的进度');const value=JSON.parse(await file.text());if(value.version===4&&full){const view=validateProgress(value.view,aq.pack.tankId);await full.restore(value.game);saveBlocked=false;apply(view);try{localStorage.setItem(SAVE_KEY,JSON.stringify(view));}catch{}message('完整鱼缸进度已恢复');return;}if(value.SaveVersion===1&&value.Tank&&full){await full.importUnity(value);return;}const legacyFull=value.version===2||value.version===3,view=validateProgress(legacyFull?value.view:value,aq.pack.tankId);
 const candidate=legacyFull?await layoutModel.prepare(value.game?.layout===undefined?[]:value.game.layout,habitat):null;
 const game=legacyFull?validateGame(value.game,candidate.seed):null,nextWorld=game?new CreatureWorld(candidate.seed,candidate.habitat,game):world;
 if(game&&full){const session=structuredClone(full.runtime.source);session.Tank.Plants=layoutModel.records(candidate.layout);session.LastSaveUtc=new Date().toISOString();await full.restore({...game,session,navigation:candidate.seed.anchors.map(a=>({owner:a.owner,kind:a.kind,position:a.position}))});saveBlocked=false;apply(view);try{localStorage.setItem(SAVE_KEY,JSON.stringify(view));}catch{}message('旧浏览器进度已迁入完整鱼缸存档');return;}
 // Layout and simulation share one atomic storage entry; view is optional convenience state.
 if(game)localStorage.setItem(GAME_SAVE_KEY,JSON.stringify({...nextWorld.snapshot(),layout:candidate.layout}));
 if(game){world=nextWorld;seed=candidate.seed;habitat=candidate.habitat;layout=candidate.layout;layoutModel.apply(aq,layout);saveBlocked=false;editor?.clearHistory();status();}
 accumulator=0;lastSave=world.elapsed;apply(view);try{localStorage.setItem(SAVE_KEY,JSON.stringify(view));}catch{}editor?.refresh();message(game?'虾与食物进度已恢复，水草布局已同步':'旧视角进度已恢复');
 }catch(err){message('导入失败：'+err.message);}finally{e.target.value='';lock(false);}};
window.addEventListener('pagehide',()=>{if(world)saveGame();});
window.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(editor?.key(e)){e.preventDefault();return;}if(e.key.startsWith('Arrow')){e.preventDefault();keys.add(e.key);}if(e.key.toLowerCase()==='r'||e.key==='Escape')reset();});
window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>keys.clear());
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
let down=null;renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
renderer.domElement.addEventListener('pointerup',e=>{if(!aq||editing||busy||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;if(editor?.click(e))return;const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),camera);const hit=ray.intersectObjects(aq.meshes.filter(m=>m.userData.creatureId&&m.parent.visible),false)[0];if(!hit)return;const origin=ray.ray.origin.clone(),direction=ray.ray.direction.clone();origin.z*=-1;direction.z*=-1;if(habitat.cast(origin,direction,Math.max(0,hit.distance-.002)))return;selected=aq.animals.find(a=>a.id===hit.object.userData.creatureId);const box=new THREE.Box3().setFromObject(selected.rig),center=box.getCenter(new THREE.Vector3());const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(.18);controls.target.copy(center);camera.position.copy(center).add(offset);$('selection').textContent='樱花虾 · '+(aq.animals.indexOf(selected)+1);});
let fpsStart=0,frames=0;
function frame(now){const raw=previous?(now-previous)/1000:0,dt=Math.min(.05,raw);previous=now;feet.before(aq.animals);full?.update(paused?0:dt,time,paused?0:raw);if(!paused&&!editing&&!busy){time+=dt;plantContacts.update(world,aq,time);accumulator+=dt;while(accumulator>=.05){world.step(.05);accumulator-=.05;}aq.update(dt,time);}
  for(const a of aq.animals){const c=world.agents.find(c=>c.data.CreatureId===a.id);a.rig.position.lerp(c.position,1-Math.exp(-dt*30));a.rig.quaternion.slerp(c.rotation,1-Math.exp(-dt*30));a.play(c.manual||(['Walk','Climb'].includes(c.data.ExecutionState)?'Walk':c.data.ExecutionState==='Hide'?'Rest':c.data.ExecutionState));}
  if(!editing)feet.after(aq.animals,world,camera,selected,paused?0:dt);
  pellet.visible=!!world.pellet&&(!full||full.data.Tank.Setup.Filled);if(world.pellet){const p=world.anchors[world.pellet.anchor];pellet.position.copy(p.position).addScaledVector(p.normal,.003);pellet.position.y+=Math.max(0,.575-p.position.y)*Math.max(0,1-world.pellet.age/2.5);}
  if(!busy&&world.elapsed-lastSave>=15){saveGame();lastSave=world.elapsed;}

  if(keys.size){const v=new THREE.Vector3((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0),(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0),0);v.normalize().applyQuaternion(camera.quaternion).multiplyScalar(dt*.18*Math.min(1,camera.position.distanceTo(controls.target)));camera.position.add(v);controls.target.add(v);}
  controls.update();if(waterRenderer)waterRenderer.render(time,full?.data.Tank.Setup.Filled??true);else renderer.render(scene,camera);frames++;
  if(!fpsStart)fpsStart=now;else if(now-fpsStart>=1000){$('stats').textContent=`${Math.round(frames*1000/(now-fpsStart))} FPS · 阴影开启`;fpsStart=now;frames=0;}
}
const pellet=new THREE.Mesh(new THREE.SphereGeometry(.0025,12,8),new THREE.MeshStandardMaterial({color:'#7f5427',roughness:.95}));pellet.castShadow=true;pellet.visible=false;
try{
  aq=await loadAquarium(text=>$('progress').textContent=text);scene.add(aq.root);aq.root.add(pellet);
  $('progress').textContent='恢复虾的需求、性格与栖息表面…';await new Promise(r=>setTimeout(r,0));
  const response=await fetch('/assets/behavior.json');if(!response.ok)throw new Error('行为数据读取失败');seed=await response.json();
  if(seed.tankId!==aq.pack.tankId)throw new Error('行为数据与场景不匹配');habitat=await createHabitat(aq.pack,aq.buffer);
  const layoutResponse=await fetch('/assets/layout.json');if(!layoutResponse.ok)throw new Error('水草记录读取失败');layoutModel=new PlantLayout(aq.pack,aq.buffer,seed,await layoutResponse.json(),habitat);
  try{const raw=localStorage.getItem(GAME_SAVE_KEY);if(raw){const value=JSON.parse(raw);if(!value.session){const candidate=await layoutModel.prepare(value.layout===undefined?[]:value.layout,habitat),game=validateGame(value,candidate.seed);world=new CreatureWorld(candidate.seed,candidate.habitat,game);seed=candidate.seed;habitat=candidate.habitat;layout=candidate.layout;layoutModel.apply(aq,layout);}}}
  catch(e){saveBlocked=true;message('旧游戏进度未载入，原存储已保留并停用自动覆盖：'+e.message);}
  if(!world)world=new CreatureWorld(seed,habitat);
  lastSave=world.elapsed;

  const p=aq.pack;camera.near=Math.max(.001,p.camera.near);camera.far=p.camera.far;reset();
  const hemi=new THREE.HemisphereLight(new THREE.Color().fromArray(p.ambientSky),new THREE.Color().fromArray(p.ambientGround),1);scene.add(hemi);
  for(const l of p.lights){let light;const color=new THREE.Color().fromArray(l.color).convertSRGBToLinear();
    if(l.type==='Directional')light=new THREE.DirectionalLight(color,l.intensity*Math.PI);
    else if(l.type==='Spot')light=new THREE.SpotLight(color,l.intensity*.75,l.range,THREE.MathUtils.degToRad(l.angle/2),.3,2);
    else if(l.type==='Point')light=new THREE.PointLight(color,l.intensity*.75,l.range,2);else continue;
    light.position.copy(mirror(l.position));if(light.target){light.target.position.copy(light.position).add(mirror(l.forward));scene.add(light.target);}light.castShadow=l.shadows;
    if(light.shadow){light.shadow.mapSize.set(2048,2048);light.shadow.bias=-.00002;light.shadow.normalBias=.001;if(l.type==='Directional')Object.assign(light.shadow.camera,{left:-1,right:1,top:1,bottom:-1,near:.01,far:10});light.shadow.camera.updateProjectionMatrix();}scene.add(light);
  }
  let stored;try{stored=localStorage.getItem(SAVE_KEY);if(stored)apply(JSON.parse(stored));}catch(e){message('旧浏览器进度未载入：'+e.message);}
  setAction('Auto');$('action').value='Auto';
  status();
  editor=plantEditor({aq,model:layoutModel,camera,canvas:renderer.domElement,getLayout:()=>layout,commit:commitLayout,mode:value=>{editing=value;accumulator=0;$('feed').disabled=value;$('action').disabled=value;},message});
  full=await fullGameplay({aq,camera,controls,canvas:renderer.domElement,scene,message,reset,world:()=>world,seed:()=>seed,selected:()=>selected,records:()=>layoutModel.records(layout),snapshot:()=>({...world.snapshot(),layout:structuredClone(layout)}),saveBlocked:()=>saveBlocked,blockSave:()=>{saveBlocked=true;},unblockSave:()=>{saveBlocked=false;},freeze:value=>{editing=value;accumulator=0;},releaseAction:()=>{setAction('Auto');$('action').value='Auto';},status:text=>$('status').textContent=text,invalidateReflection:()=>{if(waterRenderer)waterRenderer.reflectionDirty=true;},waterLevel:level=>{if(waterRenderer&&Number.isFinite(level))waterRenderer.level.value=level;},preparePopulation:w=>aq.animals.length!==w.agents.length?resizePopulation(aq,w,w.agents.length):null,replace:(w,s,h)=>{world=w;seed=s;habitat=h;aq.animals.forEach((a,i)=>{a.id=w.agents[i].data.CreatureId;a.rig.traverse(o=>{if(o.isMesh)o.userData.creatureId=a.id;});});layout=[];accumulator=0;lastSave=world.elapsed;if(selected&&!aq.animals.includes(selected))reset();setAction($('action').value);},population:async count=>{const p=resizePopulation(aq,world,count);try{localStorage.setItem(GAME_SAVE_KEY,JSON.stringify({...full.snapshot(),...p.world.snapshot()}));}catch(e){p.dispose();throw e;}p.commit();world=p.world;seed=p.seed;if(selected&&!aq.animals.includes(selected))reset();setAction($('action').value);}});
  waterRenderer=new AquariumWater(renderer,scene,camera,aq);
  $('loading').remove();
  const supported=new Set(p.clips.map(c=>c.name));for(const option of $('action').options)option.disabled=option.value!=='Auto'&&!supported.has(option.value);
  window.aquarium={ready:true,renderer,scene,camera,controls,aq,progress,reset,get game(){return full;},get world(){return world;},get habitat(){return habitat;},get layout(){return structuredClone(layout);},get editor(){return editor;},get paused(){return paused;},get selected(){return selected?.id;},feet,waterRenderer,get time(){return time;}};
  renderer.setAnimationLoop(frame);
}catch(error){console.error(error);$('progress').textContent='加载失败：'+error.message;$('status').textContent='迁移资产尚未就绪';window.aquarium={ready:false,error:error.message};}



