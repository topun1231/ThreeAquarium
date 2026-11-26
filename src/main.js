import './style.css';
import {createProgressExport,GAME_SAVE_CONFLICT,PROGRESS_FILE_LIMIT,readLocalGame,writeLocalGame} from './local-game-save.js';
import './crystal-panel.css';
import {TANK_PHOTO_CHARS} from './tank-photos.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadAquarium} from './assets.js';
import {createRoomRack} from './room-rack.js';
import {createNeighbourShrimp} from './neighbour-shrimp.js';
import {createNeighbourSeating} from './neighbour-seating.js';
import {createNeighbourHardscape} from './neighbour-hardscape.js';
import {createNeighbourPlants} from './neighbour-plants.js';
import {SAVE_KEY,validateProgress} from './state.js';
import {createHabitat} from './habitat.js';
import {CreatureWorld,GAME_SAVE_KEY,validateGame} from './creatures.js';
import {PELLET_SINK_SECONDS} from './feeding-pellet.js';
import {PlantLayout} from './layout.js';
import {plantEditor} from './editor.js';
import {fullGameplay} from './gameplay.js';
import {resizePopulation,reconcilePopulation,applyCreaturePose} from './population.js';
import {FootContacts} from './foot-contacts.js';
import {AquariumWater} from './water.js';
import {installTankLook,prepareWallpaperLights,shapeTankLights} from './tank-look.js';
import {wallpaperJournalBrood,wallpaperBroodTag,wallpaperLayoutTag,wallpaperMealTag,wallpaperNamesTag,wallpaperNeighbourTags,wallpaperRoomKey} from './wallpaper-layout.js';
import {PlantContacts} from './plant-contacts.js';
import {crystalLookLookup,installShrimpLook} from './shrimp-look.js';
import {createSelectionGlow} from './selection-glow.js';
import {createShrimpPicker,shrimpContactVisible} from './shrimp-picking.js';
import {applyAgentScales} from './shrimp-scale.js';
import {createPearling,importedPearlSites} from './pearling.js';
import {focusTank,cameraPanSpeed,frameWallpaper,shrimpPortraitPose,closestGameView,guardSurfaceZoom} from './camera-motion.js';
import {wallpaperMode,gameStorage as localStorage,installWallpaperSync,loadWallpaperCopy,followWallpaper,waitForWallpaperRestart,createWallpaperPlayback,wallpaperPreviewURL} from './live-wallpaper.js';
import {wallpaperStill} from './wallpaper-entry.js';
import {readAsset,setWallpaperAssetStatus} from './asset-read.js';
import wallpaperLauncher from '../wallpaper/index.html?raw';
import {installWallpaperRecording,wallpaperVideoSize,wallpaperCaptureName} from './wallpaper-recording.js';
import {tankNames} from './crystal-breeding.js';

const $=id=>document.getElementById(id);
let wallpaperTag, refreshPublishedWallpaper, wallpaperJpeg, resolveWallpaperFrame;
let desktopOverview=false;
let wallpaperBroodIndex=-1, drawnBrood, drawnShrimpCount=0;
async function decodeWallpaperStill(jpeg, previous){
  const url=wallpaperPreviewURL(jpeg);
  if(!url)return null;
  const image=previous?.src===url ? previous : new Image();
  if(image!==previous){image.alt='上次同步的整缸留影';image.src=url;}
  try { await image.decode();return image; }
  catch { return null; }
}
function rememberWallpaperPreview(jpeg){
  wallpaperJpeg=jpeg;
  try {
    const state=history.state;
    if(state?.aquariumWallpaperJpeg!==jpeg || state?.aquariumWallpaperTag!==wallpaperTag)
      history.replaceState({...state,aquariumWallpaperJpeg:jpeg,aquariumWallpaperTag:wallpaperTag},'');
  } catch { /* History storage is optional in an embedded player. */ }
}
const wallpaperPlayback = wallpaperMode ? createWallpaperPlayback() : null;
const wallpaperCover=wallpaperMode ? $('loading') : null;
const wallpaperEntryMode=new URLSearchParams(location.search).get('wallpaper');
const desktopEntry=wallpaperEntryMode==='desktop';
const enginePlayer=(desktopEntry || wallpaperEntryMode==='preview') && typeof window.wallpaperRegisterAudioListener==='function' ? wallpaperEntryMode : null;
const desktopPlayback=enginePlayer==='desktop';
let renderer;
try {
  // The wallpaper canvas receives one full-screen colour pass; scene edges and depth resolve in AquariumWater.
  renderer=new THREE.WebGLRenderer({canvas:$('tank'),antialias:!wallpaperMode,depth:!wallpaperMode,powerPreference:'high-performance'});
} catch(error) {
  if(wallpaperMode)window.wallpaperPropertyListener.retryStartup('暂时无法绘制鱼缸，壁纸会自动重试。');
  else $('progress').textContent='无法启动 3D 画面。请检查硬件加速后重新打开鱼缸。';
  throw error;
}
if (wallpaperPlayback) {
  document.title=desktopPlayback?'我的桌面水草缸':'我的水草缸 · 壁纸预览';
  $('loading').querySelector('strong').textContent=desktopPlayback?'正在打开桌面鱼缸':desktopEntry?'浏览器预览 · 在 Wallpaper Engine 中打开此地址或下载的 HTML 即可在桌面播放':'正在预览已同步的鱼缸';
  wallpaperPlayback.setHidden(document.hidden);
  const host=window.wallpaperPropertyListener??{};
  host.startPlayback?.(wallpaperPlayback);
  window.wallpaperPropertyListener=Object.assign(host,{setPaused:wallpaperPlayback.setPaused,applyGeneralProperties:host.startPlayback ? host.applyGeneralProperties : wallpaperPlayback.applyGeneralProperties});
  document.body.classList.add('desktop-wallpaper');
  document.body.inert = true;
  window.addEventListener('keydown',event=>event.stopImmediatePropagation(),true);
}
const displayPixelRatio=()=>Math.min(devicePixelRatio,2);
renderer.setDrawingBufferSize(innerWidth,innerHeight,displayPixelRatio());
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
const scene=new THREE.Scene();scene.background=new THREE.Color('#202629');
const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.002,30);
const wallpaperCamera=wallpaperMode?camera:camera.clone();
wallpaperCamera.userData.wallpaperPrint=true;
let wallpaperTarget=frameWallpaper(wallpaperCamera,camera.aspect);
function useRoomOverview(){
  return wallpaperMode ? desktopOverview : framingDialog.open ? framingRoom.checked : publishedOverview;
}
function frameCurrentWallpaper(view,aspect,overview=useRoomOverview()){
  view.userData.wallpaperRoom=overview && aspect>=1;
  return frameWallpaper(view,aspect,full?.data.BreedingRooms?.activeId || 'main',view.userData.wallpaperRoom);
}
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=closestGameView(camera.aspect);controls.maxDistance=4;controls.maxPolarAngle=Math.PI*.98;controls.panSpeed=.5;controls.zoomSpeed=1.3;controls.zoomToCursor=true;controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN;
const keys=new Set();let paused=false,time=0,previous=0,selected=null,aq=null,world=null,seed=null,habitat=null,accumulator=0,lastSave=0,saveBlocked=false,layout=[],layoutModel=null,editor=null,editing=false,busy=false;
let full=null,waterRenderer=null,tankLook=null,shrimpLook=null,pearling=null;const feet=new FootContacts(),plantContacts=new PlantContacts();
if(!wallpaperMode)guardSurfaceZoom(controls,()=>full?.runtime.current?.habitat??world?.habitat);
const mirror=a=>new THREE.Vector3(a[0],a[1],-a[2]);
let messageTimer;
const message=(text,duration=0)=>{
  clearTimeout(messageTimer);
  const node=$('message');node.textContent=text||'';node.classList.remove('show');
  if(!text)return;
  void node.offsetWidth;node.classList.add('show');
  if(duration>0)messageTimer=setTimeout(()=>message(''),duration);
};
if(!wallpaperMode)window.addEventListener('storage',event=>{
  if((event.key===GAME_SAVE_KEY || event.key===null) && event.storageArea===globalThis.localStorage && localStorage.noteGameSaveChange())
    message(GAME_SAVE_CONFLICT);
});
const DOCKS=['observe','scene','keep'];
function showDock(name){if(name==='scene'&&document.body.classList.contains('building'))name='';const pop=$('dock-popover');if(!pop)return;const tabs=[...document.querySelectorAll('#dock-bar [data-dock]')];const hide=()=>{pop.hidden=true;pop.classList.remove('dock-unbounded');for(const id of DOCKS){const sec=$('col-'+id);if(sec)sec.hidden=true;}tabs.forEach(b=>b.setAttribute('aria-expanded','false'));};if(!name){hide();return;}if(name==='all'){pop.hidden=false;pop.classList.add('dock-unbounded');for(const id of DOCKS){const sec=$('col-'+id);if(sec)sec.hidden=false;}tabs.forEach(b=>b.setAttribute('aria-expanded','true'));refreshPublishedWallpaper?.();return;}const section=$('col-'+name);if(!section)return;const already=!pop.hidden&&!section.hidden&&!pop.classList.contains('dock-unbounded');if(already){hide();return;}closeCare();pop.classList.remove('dock-unbounded');pop.hidden=false;for(const id of DOCKS){const sec=$('col-'+id);if(sec)sec.hidden=id!==name;}tabs.forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.dock===name)));if(name==='observe')refreshPublishedWallpaper?.();}
function setCareOpen(open){
  const pop=$('care-pop');pop.hidden=!open;
  for(const id of ['care-chip','crystal-care'])$(id)?.setAttribute('aria-expanded',String(open));
  if(open){showDock('');placeCare();}
}
function placeCare(){
  const pop=$('care-pop');if(pop.hidden)return;
  const hud=$('crystal-hud');
  pop.style.top=hud&&!hud.hidden?Math.ceil(hud.getBoundingClientRect().bottom+6)+'px':'';
}
window.addEventListener('resize',placeCare);
function closeCare(){setCareOpen(false);}
function closeLayers(){showDock('');closeCare();}
window.showDock=showDock;
$('dock-bar')?.addEventListener('click',e=>{const tab=e.target.closest('[data-dock]');if(tab)showDock(tab.dataset.dock);});
$('care-chip')?.addEventListener('click',()=>setCareOpen($('care-pop').hidden));
if(!wallpaperMode)document.addEventListener('pointerdown',e=>{if(e.target===renderer.domElement&&full?.editing)return;if(e.target.closest('#wallpaper-framing,#build-guide,#dock-popover,#dock-bar,#care-pop,#shrimp-card,#care-chip,#crystal-care,#feeding-status,#feeding-marker,#panel-toggle,#quiet-controls,.welcome'))return;closeLayers();});
function reset(){
  if(!aq)return;
  const c=aq.pack.camera;
  camera.position.copy(mirror(c.position));controls.target.copy(mirror(c.target));focusTank(camera.position,controls.target);
  camera.fov=c.fov;camera.updateProjectionMatrix();controls.update();
  const hadSelection=!!selected;
  selected=null;$('selection').textContent='整缸观察';
  const card=$('shrimp-card');if(card)card.hidden=true;
  if(hadSelection)document.dispatchEvent(new CustomEvent('aquarium:shrimp-selected',{detail:null}));
}
function progress(){return {version:1,tankId:aq.pack.tankId,camera:camera.position.toArray(),target:controls.target.toArray(),action:$('action').value};}
function apply(value){const p=validateProgress(value,aq.pack.tankId);camera.position.fromArray(p.camera);controls.target.fromArray(p.target);focusTank(camera.position,controls.target);setAction(p.action);controls.update();}
function snapshot(){return full?full.snapshot():{...world.snapshot(),layout:structuredClone(layout)};}
function status(){const visible=aq.pack.nodes.filter(n=>/^[WR]0 /.test(n.name)).length;$('status').textContent=`${layout.length?'已调整布局':'原缸布局'} · ${aq.pack.plants} 株水草 · ${visible} 件木石 · ${aq.animals.length} 只虾`;}
function lock(value){value=!!value||!!full?.recoveryRequired;busy=value;for(const id of ['feed','pause','action','save','export','import','edit-plants','plant-choice','plant-move','plant-left','plant-right'])$(id).disabled=value;for(const id of ['feed','action'])$(id).disabled=value||editing;}
async function commitLayout(next){
 if(busy)throw new Error('正在更新，请稍候');if(saveBlocked)throw new Error('请先导入有效进度，原浏览器存档尚未恢复');
 layoutModel.ensureUnoccupied(layout,next,world);lock(true);message('正在更新水草与栖息路线…');
 try{await new Promise(r=>setTimeout(r,0));const candidate=await layoutModel.prepare(next,habitat),nextWorld=layoutModel.relocate(world.snapshot(),seed,candidate);
  writeLocalGame(localStorage,GAME_SAVE_KEY,{...nextWorld.snapshot(),layout:candidate.layout});
  world=nextWorld;seed=candidate.seed;habitat=candidate.habitat;layout=candidate.layout;layoutModel.apply(aq,layout);accumulator=0;lastSave=world.elapsed;setAction($('action').value);status();
 }finally{lock(false);}
}
function saveGame(){if(!full||busy||full.busy)return false;return full.save();}
function save(){if(!world)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(progress()));if(saveGame())message('底床、造景、生长、虾与食物进度及视角已保存到本浏览器');}catch(e){message('保存失败：'+e.message);}}
function setAction(name){if($('animation-inspection').hidden)name='Auto';$('action').value=name;if(!world)return;for(const a of world.agents){a.manual=name==='Auto'?null:name;}if(name!=='Auto')aq.animals.forEach(a=>a.play(name));}
let starMaterial=null,hovered=null;
function starMaterialOnce(){if(starMaterial)return starMaterial;const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const pen=canvas.getContext('2d');pen.fillStyle='#f4d56a';pen.font='52px serif';pen.textAlign='center';pen.textBaseline='middle';pen.fillText('★',32,36);starMaterial=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false});return starMaterial;}
const MARK_KEY='aquarium.three.mark.v1';let persistMark=false;try{persistMark=localStorage.getItem(MARK_KEY)==='1';}catch{}
const glow=createSelectionGlow(scene); glow.group.visible=!wallpaperMode;
let recordingWallpaper=false,recordingOverview=false,checkRecording,publishedOverview=false,draftOverview=null;
const framingDialog=$('wallpaper-framing'),framingFormat=$('wallpaper-framing-format');
const framingRoom=$('wallpaper-framing-room');
const wallpaperAspects={wide:16/9,ultrawide:21/9,portrait:9/16};
function wallpaperSize(){
  const width=screen.width||innerWidth,height=screen.height||innerHeight;
  const ratio=framingDialog.open && wallpaperAspects[framingFormat.value];
  if(!ratio)return [width,height];
  const edge=Math.max(width,height);
  return ratio>=1 ? [edge,edge/ratio] : [edge*ratio,edge];
}
let previewPaused=false, frozenPreviewWorld=null;
const viewPaused=()=>framingDialog.open ? previewPaused : paused;
function showShrimpMarks(){
  return !wallpaperMode && !recordingWallpaper && !framingDialog.open && !document.body.classList.contains('quiet');
}
function updateShrimpMarks(visible=showShrimpMarks()){
  glow.group.visible=visible;
  for(const animal of aq.animals){
    const show=visible && !!full?.data.Colony?.shrimp?.[animal.id]?.favorite &&
      (full.showStars || selected?.id===animal.id || hovered===animal.id);
    if(show && !animal.star){
      animal.star=new THREE.Sprite(starMaterialOnce());
      animal.star.scale.set(.016,.016,.016);
      animal.star.position.y=.03;
      animal.rig.add(animal.star);
    }
    if(animal.star)animal.star.visible=show;
  }
}
let waterTime=0, displayedWorld, roomRack;
function syncRoomRack(){
  if(roomRack?.update(full?.data) && waterRenderer){
    waterRenderer.reflectionDirty=true;
    renderer.shadowMap.needsUpdate=true;
  }
}
function prepareWallpaperPrograms(){
  if(wallpaperPlayback.suspended)return;
  try {
    if(!renderer.getContext().getExtension('KHR_parallel_shader_compile'))return;
    syncRoomRack();
    waterRenderer.preparePrograms(camera);
  } catch(error) {
    console.warn('壁纸材质预编译未完成，绘制时将重试',error);
  }
}
const shellFocusPoint=new THREE.Vector3();
function renderTank(wet,viewCamera){
  aq.wallAlmanac?.update();
  syncRoomRack();
  shrimpLook?.frameMembranes(aq.animals,viewCamera);
  tankLook?.update(waterTime,{wet,lightOn:full?.data.Tank.Environment.LightOn!==false,level:waterRenderer?.level.value??.58});
  if(waterRenderer){
    let focus=0;
    if(selected && !editing && !wallpaperMode && viewCamera===camera && camera.position.distanceToSquared(controls.target)<(controls.minDistance+.09)**2){
      selected.rig.localToWorld(shellFocusPoint.set(.009,.005,0));
      if(shellFocusPoint.distanceToSquared(controls.target)<.04**2)focus=Math.max(0,-camera.worldToLocal(shellFocusPoint).z);
    }
    waterRenderer.focusDepth.value=focus;
    waterRenderer.render(waterTime,wet,viewCamera,wallpaperMode);
  }
  else renderer.render(scene,viewCamera);
}
function drawCleanTankFrame(viewCamera){
  updateShrimpMarks(false);
  try { renderTank(true,viewCamera); }
  finally { updateShrimpMarks(); }
}
function captureWallpaperFrame(pixelBudget,read){
  const canvas=renderer.domElement;
  let {width,height}=canvas;
  if(!recordingWallpaper){
    const [screenWidth,screenHeight]=wallpaperSize();
    // Limit the multisampled targets before drawing the screen-shaped image.
    const scale=Math.min(devicePixelRatio,renderer.capabilities.maxTextureSize/Math.max(screenWidth,screenHeight),
      Math.sqrt(pixelBudget/(screenWidth*screenHeight)));
    width=Math.max(1,Math.floor(screenWidth*scale));
    height=Math.max(1,Math.floor(screenHeight*scale));
  }
  const resize=width!==canvas.width || height!==canvas.height;
  let view=wallpaperCamera;
  try {
    if(!recordingWallpaper || view.aspect!==width/height){
      view=wallpaperCamera.clone();
      frameCurrentWallpaper(view,width/height,recordingWallpaper ? recordingOverview : undefined);
    }
    if(resize)renderer.setDrawingBufferSize(width,height,1);
    drawCleanTankFrame(view);
    if(renderer.getContext().isContextLost())throw Error('显卡暂时中断，请稍后再试。');
    return read(canvas);
  } finally { if(resize)resizeView(); }
}
function encodeScenePreview(source,budget){
  const card=document.createElement('canvas');
  const scaleLimit=Math.min(1280/Math.max(source.width,source.height),720/Math.min(source.width,source.height));
  for(let scale=Math.min(1,scaleLimit);;scale*=.72){
    card.width=Math.max(1,Math.round(source.width*scale));card.height=Math.max(1,Math.round(source.height*scale));
    card.getContext('2d').drawImage(source,0,0,card.width,card.height);
    const jpeg=card.toDataURL('image/jpeg',.75);
    if(!jpeg.startsWith('data:image/jpeg;base64,'))return null;
    if(jpeg.length-23<=budget)return jpeg.slice(23);
    if(Math.max(card.width,card.height)<=384)return null;
  }
}
function captureWallpaperPreview(budget){
  return captureWallpaperFrame(1280*720,source=>encodeScenePreview(source,budget));
}
function captureTankPhoto(id){
  if(wallpaperMode || recordingWallpaper || framingDialog.open || !full?.data.Tank.Setup.Filled ||
    busy || editing || full.busy || full.editing || full.aiming)throw Error('回到缸边观察时可以拍照。');
  if(selected?.id!==id)throw Error('请先在缸里选中要拍的虾。');
  const eye=selected.rig.localToWorld(new THREE.Vector3(.009,.005,0)).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  if(Math.abs(eye.x)>1.02 || Math.abs(eye.y)>1.02 || Math.abs(eye.z)>1)throw Error('这只虾在画面外，把它移进取景范围再拍。');
  drawCleanTankFrame(camera);
  if(renderer.getContext().isContextLost())throw Error('显卡暂时中断，请稍后再试。');
  // Copy synchronously. The next frame may clear WebGL's default drawing buffer.
  const source=renderer.domElement, original=document.createElement('canvas');
  original.width=source.width;original.height=source.height;
  original.getContext('2d').drawImage(source,0,0);
  return {original,jpeg:encodeScenePreview(original,TANK_PHOTO_CHARS)};
}
function wallpaperUnavailable(){
  if (!full.data.Tank.Setup.Filled) return '请先完成注水，再取整缸远景。';
  if (full.busy || full.editing || full.aiming || busy || editing) return '请先完成当前操作，回到观察模式。';
  return '';
}
function frameShrimp(animal,portrait=true){
  selected=animal;
  // A room switch can request focus before its first frame applies the new shrimp poses.
  const center=displayedWorld===world ? animal.rig.getWorldPosition(new THREE.Vector3())
    : animal.rig.parent.localToWorld(world.agentsById.get(animal.id).position.clone());
  const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(controls.minDistance);
  const parent=animal.rig.parent, agent=world.agentsById.get(animal.id);
  const from=parent.worldToLocal(camera.position.clone()).sub(parent.worldToLocal(controls.target.clone()));
  const pose=portrait && agent && shrimpPortraitPose(agent,from,world.habitat,controls.minDistance);
  controls.target.copy(pose ? parent.localToWorld(pose.point) : center);
  camera.position.copy(pose ? parent.localToWorld(pose.eye) : center.add(offset));controls.update();
  const name=full?.data?.Colony?.shrimp?.[animal.id]?.name;
  $('selection').textContent=name||('樱花虾 · '+(aq.animals.indexOf(animal)+1));
  document.dispatchEvent(new CustomEvent('aquarium:shrimp-selected',{detail:animal.id}));
}
$('feed').onclick=()=>{if(!world||editing||busy)return;setAction('Auto');world.dropFood();saveGame();message('已在前景投喂，虾会按距离、饥饿与性格陆续发现食物');};
$('reset').onclick=()=>{reset();message('已回到整缸');};function paintMark(){const b=$('persist-mark');if(!b)return;b.setAttribute('aria-pressed',String(persistMark));b.textContent=persistMark?'选中后不留轮廓':'选中后一直留轮廓';}paintMark();$('persist-mark').onclick=()=>{persistMark=!persistMark;try{localStorage.setItem(MARK_KEY,persistMark?'1':'0');}catch{}paintMark();message(persistMark?'选中的虾会一直留一圈淡淡的轮廓光':'选中时轮廓光闪一下就淡掉');};$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'继续模拟':'暂停模拟';$('pause').setAttribute('aria-pressed',String(paused));message(paused?'模拟已暂停':'模拟继续');};
$('action').onchange=()=>{setAction($('action').value);message($('action').value==='Auto'?'已恢复自主行为':'动作检查中：暂停虾的行为和移动，选择自主行为可恢复');};
$('save').onclick=save;
$('export').onclick=()=>{
  const file=createProgressExport({version:full?4:3,view:progress(),game:snapshot()});
  const a=document.createElement('a'),url=URL.createObjectURL(file);
  a.href=url;a.download='aquarium-three-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  if(file.size>PROGRESS_FILE_LIMIT)message('已导出备份。文件超过本版导入上限（16 MiB）。');
};
async function restoreFullProgress(value) {
  const view=validateProgress(value.view,aq.pack.tankId);
  await full.restore(value.game);
  saveBlocked=false;apply(view);
  try {localStorage.setItem(SAVE_KEY,JSON.stringify(progress()));} catch {}
}
$('import').onchange=async e=>{const file=e.target.files[0];if(!file||!world||busy)return;lock(true);try{
 if(file.size>PROGRESS_FILE_LIMIT)throw new Error('文件过大，请选择本迁移版导出的进度');const value=JSON.parse(await file.text());if(value.version===4&&full){await restoreFullProgress(value);message('完整鱼缸进度已恢复');return;}if(value.SaveVersion===1&&value.Tank&&full){await full.importUnity(value);return;}const legacyFull=value.version===2||value.version===3,view=validateProgress(legacyFull?value.view:value,aq.pack.tankId);
 const candidate=legacyFull?await layoutModel.prepare(value.game?.layout===undefined?[]:value.game.layout,habitat):null;
 const game=legacyFull?validateGame(value.game,candidate.seed):null,nextWorld=game?new CreatureWorld(candidate.seed,candidate.habitat,game):world;
 if(game&&full){const session=structuredClone(full.runtime.source);session.Tank.Plants=layoutModel.records(candidate.layout);session.LastSaveUtc=new Date().toISOString();await full.restore({...game,session,navigation:candidate.seed.anchors.map(a=>({owner:a.owner,kind:a.kind,position:a.position}))});saveBlocked=false;apply(view);try{localStorage.setItem(SAVE_KEY,JSON.stringify(progress()));}catch{}message('旧浏览器进度已迁入完整鱼缸存档');return;}
 // Layout and simulation share one atomic storage entry; view is optional convenience state.
 if(game)writeLocalGame(localStorage,GAME_SAVE_KEY,{...nextWorld.snapshot(),layout:candidate.layout});
 if(game){world=nextWorld;seed=candidate.seed;habitat=candidate.habitat;layout=candidate.layout;layoutModel.apply(aq,layout);saveBlocked=false;editor?.clearHistory();status();}
 accumulator=0;lastSave=world.elapsed;apply(view);try{localStorage.setItem(SAVE_KEY,JSON.stringify(progress()));}catch{}editor?.refresh();message(game?'虾与食物进度已恢复，水草布局已同步':'旧视角进度已恢复');
 }catch(err){message('导入失败：'+err.message);}finally{e.target.value='';lock(false);}};
if(!wallpaperMode)window.addEventListener('pagehide',()=>{if(world&&!localStorage.gameSaveStale)saveGame();});
const panKeys=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD']);
window.addEventListener('keydown',e=>{
 if(e.isComposing||e.target.isContentEditable||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
 if(!e.repeat&&editor?.key(e)){e.preventDefault();return;}
 if(panKeys.has(e.code)){e.preventDefault();keys.add(e.code);}
 if(e.repeat)return;
 if(e.key.toLowerCase()==='r'||e.key==='Escape'&&!full?.editing&&!full?.aiming&&!full?.busy&&!document.body.classList.contains('quiet'))reset();
 if(e.key==='Escape')closeLayers();
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());document.addEventListener('focusin',()=>keys.clear());
let resizePending=false;
function framingAspect(){
  if(!framingDialog.open)return 0;
  const [width,height]=wallpaperSize();
  return width/height;
}
function resizeView(pixelRatio=displayPixelRatio()){
  let width=innerWidth,height=innerHeight;
  if(width<=0||height<=0)return;
  camera.aspect=width/height;camera.updateProjectionMatrix();
  controls.minDistance=closestGameView(camera.aspect);
  const aspect=framingAspect() || camera.aspect;
  if(!wallpaperMode)framingRoom.disabled=recordingWallpaper || aspect<1;
  wallpaperTarget=frameCurrentWallpaper(wallpaperCamera,aspect);
  if(aspect>camera.aspect)height=Math.max(1,Math.round(width/aspect));
  else if(aspect<camera.aspect)width=Math.max(1,Math.round(height*aspect));
  if(wallpaperMode)controls.target.copy(wallpaperTarget);
  renderer.setDrawingBufferSize(width,height,pixelRatio);
  frozenPreviewWorld=null;
}
function requestViewResize(){
  // Preserve the paused wallpaper frame and the encoder's capture dimensions.
  if(wallpaperMode || recordingWallpaper)resizePending=true;
  else resizeView();
}
window.addEventListener('resize',requestViewResize);
let down=null, switchingRoom=false, pickShrimp=null, pointerViewport;
let hoverPoint=null, hoverTimer=0, hoverAt=-Infinity;
const hoverMoveInterval=32, hoverRestInterval=180;
const interactionRay=new THREE.Raycaster(), interactionPointer=new THREE.Vector2();
function castPointer(event){
  pointerViewport=renderer.domElement.getBoundingClientRect();
  interactionPointer.set((event.clientX-pointerViewport.left)/pointerViewport.width*2-1,1-(event.clientY-pointerViewport.top)/pointerViewport.height*2);
  interactionRay.setFromCamera(interactionPointer,camera);
  return interactionRay;
}
function pointAtRoom(ray){
  if(!full?.data.Breeding || !showShrimpMarks() || editing || busy || full.busy || full.aiming || switchingRoom)return null;
  return roomRack?.pick(ray.ray);
}
const habitatEye=new THREE.Vector3(), habitatDirection=new THREE.Vector3();
function shrimpObstructed(eye,direction,distance){
  habitatEye.set(eye.x,eye.y,-eye.z);
  habitatDirection.set(direction.x,direction.y,-direction.z);
  return habitat?.cast(habitatEye,habitatDirection,Math.max(0,distance-.002),false,undefined,'obstruction');
}
function shrimpHit(ray,pointerType,contact){
  return pickShrimp?.(aq.meshes,camera,ray.ray,interactionPointer,pointerViewport,pointerType==='touch'?9:4,shrimpObstructed,contact);
}
function canHoverTank(){
  return aq && showShrimpMarks() && !document.hidden && !editing && !busy && !full?.busy && !full?.aiming && !switchingRoom;
}
function clearHover(){
  if(hoverTimer)clearTimeout(hoverTimer);
  hoverTimer=0;hoverAt=-Infinity;
  if(!hoverPoint)return;
  hoverPoint=null;hovered=null;
  if(renderer.domElement.style.cursor==='pointer')renderer.domElement.style.cursor='';
  renderer.domElement.title='';
}
function sampleHover(){
  if(hoverTimer)clearTimeout(hoverTimer);
  hoverTimer=0;
  if(!hoverPoint)return;
  const {clientX,clientY,pointerType}=hoverPoint;
  if(!canHoverTank() || document.elementFromPoint(clientX,clientY)!==renderer.domElement){
    clearHover();return;
  }
  hoverAt=performance.now();
  const ray=castPointer(hoverPoint),room=pointAtRoom(ray);
  hovered=room ? null : shrimpHit(ray,pointerType) || null;
  renderer.domElement.style.cursor=room || hovered ? 'pointer' : '';
  renderer.domElement.title=room ? '前往'+tankNames[room] : '';
}
function queueHover(){
  if(!hoverPoint)return;
  const remaining=hoverMoveInterval-(performance.now()-hoverAt);
  if(remaining<=0)sampleHover();
  else if(!hoverTimer)hoverTimer=setTimeout(sampleHover,Math.ceil(remaining));
}
controls.addEventListener('change',queueHover);
renderer.domElement.addEventListener('pointerdown',e=>{
  clearHover();
  if(!e.isPrimary || e.button!==0){down=null;return;}
  const ray=castPointer(e), room=pointAtRoom(ray), contact={};
  if(aq && !room && !editing && !full?.editing && !busy && !full?.busy && !full?.aiming && !switchingRoom){
    shrimpHit(ray,e.pointerType,contact);
  }
  const resident=contact.mesh ? aq.animals.find(a=>a.id===contact.id) : null;
  down={x:e.clientX,y:e.clientY,id:e.pointerId,room,world,contact,resident};
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(down && e.pointerId===down.id && Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)down=null;
  if(!e.isPrimary)return;
  if(e.buttons || e.pointerType==='touch' || !canHoverTank()){clearHover();return;}
  hoverPoint={clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType};
  queueHover();
});
function clearPointer(){
  down=null;clearHover();
}
for(const name of ['pointerleave','pointercancel'])renderer.domElement.addEventListener(name,clearPointer);
renderer.domElement.addEventListener('lostpointercapture',e=>{if(down?.id===e.pointerId)down=null;});
renderer.domElement.addEventListener('wheel',()=>{down=null;},{passive:true});
window.addEventListener('blur',clearPointer);
renderer.domElement.addEventListener('pointerup',async e=>{
  const press=down;down=null;
  if(e.button!==0 || e.aquariumAimed || full?.aiming || !aq || editing || busy || full?.busy || switchingRoom || !press || e.pointerId!==press.id || Math.hypot(e.clientX-press.x,e.clientY-press.y)>5)return;
  if(editor?.click(e))return;
  const ray=castPointer(e), room=pointAtRoom(ray);
  if(press.room || room){
    if(!room || press.room!==room)return;
    clearPointer();switchingRoom=true;
    try {await full.switchCrystalRoom(room,{keepSelectedParent:true});reset();}
    catch(error){message('换缸未完成：'+error.message);}
    finally {switchingRoom=false;}
    return;
  }
  if(press.world!==world || full?.editing || !press.resident || !aq.animals.includes(press.resident))return;
  if(shrimpContactVisible(press.contact,camera,shrimpObstructed))frameShrimp(press.resident,false);
});
// Resume the frame clock without discarding visible time owed to the next shrimp step.
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPointer();wallpaperPlayback?.setHidden(document.hidden);full?.syncQuietClock();previous=0;});
function showWallpaperCover(){
  if(!wallpaperCover)return;
  if(!wallpaperCover.isConnected){
    const preview=wallpaperPreviewURL(wallpaperJpeg);
    let image=wallpaperCover.querySelector('img');
    if(preview){
      if(!image){image=new Image();image.alt='上次同步的整缸留影';wallpaperCover.prepend(image);}
      image.onerror=()=>image.remove();
      if(image.src!==preview)image.src=preview;
    }else image?.remove();
    document.body.append(wallpaperCover);
  }
  wallpaperCover.querySelector('p').textContent='正在恢复鱼缸画面…';
}
renderer.domElement.addEventListener('webglcontextlost',()=>{
  wallpaperPlayback?.setContextLost(true);
  showWallpaperCover();
  checkRecording?.('显卡画面中断');
});
renderer.domElement.addEventListener('webglcontextrestored',()=>{
  // Three recreates render targets, but their cached glass reflection has to be drawn again.
  waterRenderer?.restoreContext();
  roomRack?.invalidateShadows();
  wallpaperPlayback?.setContextLost(false);
});
let fpsStart=0,frames=0,renderedFrames=0;
function frame(now){
  if(recordingWallpaper)checkRecording?.();
  if(full?.recoveryRequired)return false;
  const raw=wallpaperPlayback ? wallpaperPlayback.frameDelta(now) : previous ? (now-previous)/1000 : 0;
  if(raw===null)return;
  const pixelRatio=displayPixelRatio();
  const previewAspect=framingAspect();
  if(!recordingWallpaper && (resizePending || renderer.getPixelRatio()!==pixelRatio || (previewAspect && previewAspect!==wallpaperCamera.aspect))){
    resizePending=false;
    resizeView(pixelRatio);
  }
  const viewCamera=recordingWallpaper || framingDialog.open ? wallpaperCamera : camera;
  const held=viewPaused(),dt=wallpaperPlayback ? raw : Math.min(.05,raw), motionDt=held||document.hidden?0:dt;
  const frozen=framingDialog.open && previewPaused && !recordingWallpaper && !busy && !full?.busy;
  if(frozen && frozenPreviewWorld===world && !waterRenderer?.reflectionDirty){
    previous=now;
    full?.update(0,time,0);
    return;
  }
  previous=now;feet.before(aq.animals);full?.update(motionDt,time,held||document.hidden?0:raw);applyAgentScales(world,full?.data?.Colony);
  const playingPreviousTank=wallpaperMode&&editing&&full?.busy&&full.data.Tank.Setup.Filled;
  const advancing=!held&&(!editing||playingPreviousTank)&&!busy;
  if(advancing)time+=dt;
  full?.runtime.update(motionDt,time);
  full?.flora.update(time);
  if(advancing){
   // The pending graph can share leaf collision surfaces with the visible tank.
   if(!playingPreviousTank)plantContacts.update(world,aq,time);
   accumulator+=dt;
   if(accumulator>=.05 && full && !wallpaperMode && !document.hidden){
    world.observeBreeding(full.data.Breeding,full.data.BreedingRooms?.activeId,Date.now());
   }
   while(accumulator>=.05){world.step(.05,full?.data.Colony?.lastFeeding);accumulator-=.05;}
  }
  shrimpLook?.sync(aq.animals);
  // The previous world's display poses have no bearing on a restored population.
  const blend=displayedWorld!==world ? 1 : 1-Math.exp(-motionDt*30);
  displayedWorld=world;
  for(const a of aq.animals)applyCreaturePose(a,world.agentsById.get(a.id),blend);
  if(advancing){
    shrimpLook?.before(aq.animals);
    aq.update(dt,time);
    roomRack?.animateShrimp(dt,wallpaperMode && viewCamera.userData.wallpaperRoom===true);
    shrimpLook?.after(aq.animals,time,viewCamera);
  }
  if(!wallpaperMode){updateShrimpMarks();glow.update(aq.animals,selected,hovered,now/1000,persistMark);}
  if(!editing)feet.after(aq.animals,world,viewCamera,selected,held?0:dt);
  pellet.visible=!!world.pellet&&(!full||full.data.Tank.Setup.Filled);if(world.pellet){const p=world.anchors[world.pellet.anchor];pellet.position.copy(p.position).addScaledVector(p.normal,.003);pellet.position.y+=Math.max(0,.575-p.position.y)*Math.max(0,1-world.pellet.age/PELLET_SINK_SECONDS);}if(!wallpaperMode)full?.renderFeeding(pellet,held);
  if(!wallpaperMode&&!localStorage.gameSaveStale&&!busy&&world.elapsed-lastSave>=15){saveGame();lastSave=world.elapsed;}

  if(keys.size){const v=new THREE.Vector3((keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),(keys.has('ArrowUp')||keys.has('KeyW')?1:0)-(keys.has('ArrowDown')||keys.has('KeyS')?1:0),0);v.normalize().applyQuaternion(camera.quaternion).multiplyScalar(dt*cameraPanSpeed(camera.position.distanceTo(controls.target)));camera.position.add(v);controls.target.add(v);}
  if(!wallpaperMode)controls.update();
  waterTime=wallpaperPlayback ? time : waterTime+motionDt;
  pearling?.update(motionDt);
  renderTank(full?.data.Tank.Setup.Filled??true,viewCamera);
  // A shrimp can swim under or out from a parked pointer. Sample the pose just drawn.
  if(hoverPoint && !hoverTimer && now-hoverAt>=hoverRestInterval && (motionDt>0 || !canHoverTank()))sampleHover();
  frozenPreviewWorld=frozen ? world : null;
  // Context loss can interrupt this draw before the browser dispatches its loss event.
  if(wallpaperMode && renderer.getContext().isContextLost())return;
  renderedFrames++;
  if(wallpaperMode){
    drawnShrimpCount=aq.animals.length;
    if(wallpaperCover.isConnected)wallpaperCover.remove();
    if(desktopPlayback && wallpaperBroodIndex>=0 && !drawnBrood?.adult){
      const batch=full?.data.Breeding?.batches[wallpaperBroodIndex];
      if((batch?.status==='complete' || (!drawnBrood && batch?.status==='hatched')) &&
         batch.children.every(child=>aq.animals.some(animal=>animal.id===child.id))){
        drawnBrood={id:(wallpaperBroodIndex+1)+'/'+batch.size,adult:batch.status==='complete'};
      }
    }
    if(renderedFrames===1 || resolveWallpaperFrame){
      // Older or size-limited copies can play without including a still.
      if(!wallpaperJpeg){
        try { wallpaperJpeg=encodeScenePreview(renderer.domElement,90000); }
        catch { /* A capture failure must not interrupt the live tank. */ }
      }
      rememberWallpaperPreview(wallpaperJpeg);
    }
    if(resolveWallpaperFrame){
      resolveWallpaperFrame();
      resolveWallpaperFrame=null;
    }
    if(renderedFrames===1){
      followWallpaper(wallpaperTag,wallpaperPlayback,applyDesktopCopy,enginePlayer,()=>drawnShrimpCount,()=>drawnBrood);
    }
    return;
  }
  frames++;
  if(!fpsStart)fpsStart=now;else if(now-fpsStart>=1000){$('stats').textContent=`${Math.round(frames*1000/(now-fpsStart))} FPS · 阴影开启`;fpsStart=now;frames=0;}
}
const pellet=new THREE.Mesh(new THREE.SphereGeometry(.0025,12,8),new THREE.MeshStandardMaterial({color:'#7f5427',roughness:.95}));pellet.castShadow=true;pellet.visible=false;
try{
  if (wallpaperMode) {
    setWallpaperAssetStatus($('progress'),wallpaperPlayback);
    const {copy,tag}=await loadWallpaperCopy($('progress'),wallpaperPlayback,desktopPlayback);
    wallpaperTag=tag;
    desktopOverview=copy.framing==='whole-room';
    wallpaperBroodIndex=wallpaperJournalBrood(copy.game.session,copy.game.creatures.map(c=>c.CreatureId));
    const saved=history.state;
    const previousImage=$('loading').querySelector('img');
    let jpeg=wallpaperStill(copy);
    let image=await decodeWallpaperStill(jpeg,previousImage);
    if(!image && tag && saved?.aquariumWallpaperTag===tag && saved.aquariumWallpaperJpeg!==jpeg){
      jpeg=saved.aquariumWallpaperJpeg;
      image=await decodeWallpaperStill(jpeg,previousImage);
    }
    rememberWallpaperPreview(image ? jpeg : null);
    if(image!==previousImage){
      previousImage?.remove();
      if(image)$('loading').prepend(image);
    }
    writeLocalGame(localStorage,GAME_SAVE_KEY,copy.game);
  }
  const [imported,neighbourMeshes,neighbourPlants,neighbourShrimp,initialSeed,layoutSource]=await Promise.all([
    loadAquarium(text=>$('progress').textContent=text),
    readAsset('/assets/neighbour-hardscape.json').catch(()=>null),
    readAsset('/assets/neighbour-flora.json').catch(()=>null),
    readAsset('/assets/neighbour-shrimp.json').catch(()=>null),
    readAsset('/assets/behavior.json'),
    readAsset('/assets/layout.json'),
  ]);
  aq=imported;scene.add(aq.root);aq.root.add(pellet);
  if(!wallpaperMode)pickShrimp=createShrimpPicker(neighbourShrimp);
  $('progress').textContent='恢复虾的需求、性格与栖息表面…';await new Promise(r=>setTimeout(r,0));
  seed=initialSeed;
  if(seed.tankId!==aq.pack.tankId)throw new Error('行为数据与场景不匹配');
  // A wallpaper can only display its published, filled tank. Its world is created when that layout is restored.
  if(!wallpaperMode)habitat=await createHabitat(aq.pack,aq.buffer);
  layoutModel=new PlantLayout(aq.pack,aq.buffer,seed,layoutSource,habitat);
  if(!wallpaperMode){
    try{const value=readLocalGame(localStorage,GAME_SAVE_KEY);if(value&&!value.session){const candidate=await layoutModel.prepare(value.layout===undefined?[]:value.layout,habitat),game=validateGame(value,candidate.seed);world=new CreatureWorld(candidate.seed,candidate.habitat,game);seed=candidate.seed;habitat=candidate.habitat;layout=candidate.layout;layoutModel.apply(aq,layout);}}
    catch(e){saveBlocked=true;message('旧游戏进度未载入，原存储已保留并停用自动覆盖：'+e.message);}
    if(!world)world=new CreatureWorld(seed,habitat);
    lastSave=world.elapsed;
  }

  const p=aq.pack;camera.near=.002;camera.far=p.camera.far;reset();
  const hemi=new THREE.HemisphereLight(new THREE.Color().fromArray(p.ambientSky),new THREE.Color().fromArray(p.ambientGround),1);scene.add(hemi);
  for(const l of p.lights){let light;const color=new THREE.Color().fromArray(l.color).convertSRGBToLinear();
    if(l.type==='Directional')light=new THREE.DirectionalLight(color,l.intensity*Math.PI);
    else if(l.type==='Spot')light=new THREE.SpotLight(color,l.intensity*.75,l.range,THREE.MathUtils.degToRad(l.angle/2),.3,2);
    // The imported unshadowed side fill sits outside the tank, away from the LED fixture.
    else if(l.type==='Point' && l.shadows)light=new THREE.PointLight(color,l.intensity*.75,l.range,2);else continue;
    light.position.copy(mirror(l.position));if(light.target){light.target.position.copy(light.position).add(mirror(l.forward));scene.add(light.target);}light.castShadow=l.shadows;
    if(light.shadow){light.shadow.mapSize.set(2048,2048);light.shadow.bias=-.00002;light.shadow.normalBias=.001;if(l.type==='Directional')Object.assign(light.shadow.camera,{left:-1,right:1,top:1,bottom:-1,near:.01,far:10});light.shadow.camera.updateProjectionMatrix();}scene.add(light);
  }
  shapeTankLights(scene);
  let stored;try{stored=localStorage.getItem(SAVE_KEY);if(stored)apply(JSON.parse(stored));}catch(e){if(wallpaperMode)throw e;message('旧浏览器进度未载入：'+e.message);}
  setAction('Auto');
  status();
  if(!wallpaperMode)editor=plantEditor({aq,model:layoutModel,camera,canvas:renderer.domElement,getLayout:()=>layout,commit:commitLayout,mode:value=>{editing=value;accumulator=0;$('feed').disabled=value;$('action').disabled=value;},message});
  full=await fullGameplay({captureTankPhoto,sampleResidents:initialSeed.creatures,layoutSource:layoutModel.source,sampleHabitat:layoutModel.baseHabitat,aq,camera,controls,canvas:renderer.domElement,scene,message,reset,world:()=>world,seed:()=>seed,selected:()=>selected,records:()=>layoutModel.records(layout),snapshot:()=>({...world.snapshot(),layout:structuredClone(layout)}),saveBlocked:()=>saveBlocked,blockSave:()=>{saveBlocked=true;},unblockSave:()=>{saveBlocked=false;},freeze:value=>{editing=value;accumulator=0;},releaseAction:()=>{setAction('Auto');},markShrimp(id){selected=aq.animals.find(a=>a.id===id)||null;},focusShrimp(id){const animal=aq.animals.find(a=>a.id===id);if(!animal)return false;frameShrimp(animal);return true;},status:text=>$('status').textContent=text,invalidateReflection:()=>{if(waterRenderer)waterRenderer.reflectionDirty=true;},waterLevel:level=>{if(waterRenderer&&Number.isFinite(level))waterRenderer.level.value=level;},preparePopulation:w=>reconcilePopulation(aq,w),replace:(w,s,h)=>{world=w;seed=s;habitat=h;layout=[];accumulator=0;lastSave=world.elapsed;if(selected&&!aq.animals.includes(selected))reset();setAction($('action').value);},population:async (count,options)=>{const p=resizePopulation(aq,world,count,{...options,colony:full.data.Colony});try{const next=full.snapshot();if(p.world.colony)next.session.Colony=p.world.colony;writeLocalGame(localStorage,GAME_SAVE_KEY,{...next,...p.world.snapshot()});}catch(e){p.dispose();throw e;}p.commit();if(p.world.colony)full.data.Colony=p.world.colony;world=p.world;seed=p.seed;if(selected&&!aq.animals.includes(selected))reset();setAction($('action').value);}});
  waterRenderer=new AquariumWater(renderer,scene,camera,aq,()=>[...aq.animals.map(animal=>animal.rig),...(roomRack?.shrimpGroups()??[]),glow.group,pellet,pearling?.group]);
  tankLook=installTankLook({scene,aq,water:waterRenderer,runtime:full.runtime});
  shrimpLook=installShrimpLook({crystal:crystalLookLookup(()=>full.data.Breeding),record:id=>full?.data?.Colony?.shrimp?.[id],simSeconds:()=>full?.data?.SimulationSeconds||0});
  roomRack=createRoomRack(aq,full.runtime.settings,createNeighbourHardscape(full.runtime,neighbourMeshes),
    createNeighbourPlants(full.runtime,full.flora,neighbourPlants),waterRenderer.sun,waterRenderer.lamps[0]?.light,
    createNeighbourShrimp(aq,neighbourShrimp,shrimpLook,wallpaperPlayback && createNeighbourSeating(full.runtime,wallpaperPlayback,seed.profile),
      ()=>camera.userData.wallpaperRoom===true),
    (width,depth,level)=>waterRenderer.neighbourSurface(width,depth,level));
  pearling=createPearling({root:aq.root,tankId:()=>full.data.Tank.UniqueId,sites:()=>full.flora.pearlSites().concat(importedPearlSites(full.runtime,full.data.Tank.Plants)),lightOn:()=>full?.data?.Tank?.Environment?.LightOn!==false,wet:()=>full?.data?.Tank?.Setup?.Filled??true,revision:()=>full?.flora?.pearlRevision,waterLevel:()=>waterRenderer?.level.value??0.58});tankLook.onChange(p=>{shrimpLook.setQuality(p);full?.flora?.setQuality(p);pearling.setQuality(p);});
  if (wallpaperMode && saveBlocked) throw Error('壁纸副本未能恢复');
  setWallpaperAssetStatus(null);
  if (wallpaperMode) {
    prepareWallpaperLights(scene,renderer);
    controls.enabled=false;wallpaperTarget=frameCurrentWallpaper(camera,camera.aspect);controls.target.copy(wallpaperTarget);
  } else {
    const refreshPublished=installWallpaperSync({button:$('wallpaper-sync'),hint:$('wallpaper-live-hint'),receipt:$('wallpaper-live-receipt'),link:$('wallpaper-live-open'),download:$('wallpaper-live-file'),setup:$('wallpaper-desktop-setup'),applyDesktop:$('wallpaper-apply'),screenNumber:$('wallpaper-screen'),previewWindow:$('wallpaper-preview-window'),thumbnail:$('wallpaper-preview'),publishedCaption:$('wallpaper-synced-caption'),launcher:wallpaperLauncher,currentLayout:()=>{
      if(wallpaperUnavailable())return null;
      const tank=full.data.Tank;
      return {room:full.data.BreedingRooms?.activeId || 'main',roomKey:wallpaperRoomKey(full.data),tag:wallpaperLayoutTag(tank,world.agents.map(a=>a.data.CreatureId)),
        light:tank.Environment.LightOn?'on':'off',shrimp:world.agents.length,hardscape:tank.Hardscape.length,plants:tank.Plants.length+(tank.Flora?.length || 0),
        now:full.data.Breeding?.now,broods:wallpaperBroodTag(full.data),names:wallpaperNamesTag(full.data),neighbours:wallpaperNeighbourTags(full.data),meal:wallpaperMealTag(world.pellet)};
    },visitButton:$('wallpaper-visit-room'),updateRoomButton:$('wallpaper-update-room'),roomStatus:$('wallpaper-current-tank'),
    canVisitRoom:(room,key)=>!recordingWallpaper && !saveBlocked && !full.recoveryRequired && !wallpaperUnavailable() &&
      full.data.BreedingRooms?.activeId!==room && wallpaperRoomKey(full.data,room)===key,
    visitRoom:async (room,keepObserve)=>{
      await full.switchCrystalRoom(room);
      if(document.body.classList.contains('quiet'))$('quiet-exit').click();
      else if(framingDialog.open)framingDialog.close();
      showDock('');
      if(keepObserve)showDock('observe');
      else document.querySelector('#dock-bar [data-dock="observe"]').focus({preventScroll:true});
      message('已回到「'+tankNames[room]+'」');
    },broodJournal:$('wallpaper-brood-journal'),getBatch:index=>!recordingWallpaper && !wallpaperUnavailable() && full.data.Breeding?.batches[index],
    openBrood:batch=>full.openBrood(batch),lamp:$('tank-light'),capture:captureWallpaperPreview,onPublishedFraming:overview=>{
      publishedOverview=overview;
      if(draftOverview===overview)draftOverview=null;
      if(framingDialog.open && draftOverview===null && !recordingWallpaper && framingRoom.checked!==overview){
        framingRoom.checked=overview;requestViewResize();
      }
    },snapshot:()=>{
      localStorage.assertGameSaveCurrent();
      if (saveBlocked||full.recoveryRequired) throw Error('请先恢复有效进度，再同步壁纸。');
      const reason=wallpaperUnavailable();
      if (reason) throw Error(reason);
      const view=wallpaperCamera.clone();
      const [width,height]=wallpaperSize();
      const overview=recordingWallpaper ? recordingOverview : useRoomOverview();
      const target=frameCurrentWallpaper(view,recordingWallpaper ? view.aspect : width/height,overview);
      return {version:4,framing:overview?'whole-room':'whole-tank',view:{version:1,tankId:aq.pack.tankId,camera:view.position.toArray(),target:target.toArray(),action:'Auto'},game:full.snapshot({forWallpaper:true})};
    }});
    const open=$('wallpaper-framing-open'), actions=$('wallpaper-actions'), shortcuts=$('wallpaper-shortcuts');
    const compare=$('wallpaper-compare'), localPhoto=$('wallpaper-local-preview'), localCaption=$('wallpaper-local-caption');
    function takeComparisonPhoto(){
      localPhoto.hidden=true; localPhoto.removeAttribute('src');
      if(!compare.open || !compare.getClientRects().length)return;
      const reason=wallpaperUnavailable() || (recordingWallpaper && '录制结束后可以重拍对照图。');
      if(reason){localCaption.textContent=reason;return;}
      try {
        const src=captureWallpaperFrame(512*320,canvas=>wallpaperPreviewURL(encodeScenePreview(canvas,90000)));
        if(!src)throw Error();
        localPhoto.src=src;localPhoto.hidden=false;
        const room=tankNames[full.data.BreedingRooms?.activeId] || tankNames.main;
        localCaption.textContent='本次取景 · '+room+' · '+new Date().toLocaleTimeString('zh-CN',{hour12:false});
      } catch {localCaption.textContent='本次取景未成功，可以重拍。';}
    }
    // A receipt poll must not retake the player's comparison photograph.
    refreshPublishedWallpaper=()=>{
      if(compare.open)takeComparisonPhoto();
      return refreshPublished();
    };
    compare.ontoggle=takeComparisonPhoto;
    framingFormat.onchange=()=>{requestViewResize();if(compare.open)takeComparisonPhoto();};
    framingRoom.onchange=()=>{
      draftOverview=framingRoom.checked===publishedOverview ? null : framingRoom.checked;
      framingFormat.onchange();
    };
    new MutationObserver(()=>{
      if(compare.open && compare.getClientRects().length)takeComparisonPhoto();
    }).observe($('wallpaper-current-tank'),{childList:true});
    $('wallpaper-compare-retake').onclick=takeComparisonPhoto;
    const sync=$('wallpaper-sync');
    if(!sync.hidden){
      const mealSync=document.createElement('button');
      mealSync.type='button';mealSync.id='feeding-wallpaper-sync';mealSync.textContent='把这次加餐同步到壁纸';
      $('feeding-details').append(mealSync);
      mealSync.onclick=()=>{
        if(!world.pellet){message('这次投喂点已结束。');return;}
        if(document.body.classList.contains('panel-collapsed'))$('panel-toggle').click();
        if($('dock-popover').hidden || $('col-observe').hidden)showDock('observe');
        sync.focus();sync.click();
      };
    }
    const address=$('wallpaper-address'), copied=$('wallpaper-address-status');
    address.value=new URL('/?wallpaper=desktop',location.origin).href;
    $('wallpaper-address-copy').onclick=async()=>{
      try { await navigator.clipboard.writeText(address.value); copied.textContent='已复制，可以粘贴到 Wallpaper Engine。'; }
      catch { address.focus();address.select();copied.textContent='已选中地址，请手动复制。'; }
    };
    const hideTools=$('wallpaper-hide-tools'), revealTools=$('wallpaper-reveal-tools');
    hideTools.onclick=()=>{revealTools.hidden=false;revealTools.focus({preventScroll:true});};
    revealTools.onclick=()=>{
      revealTools.hidden=true;hideTools.focus({preventScroll:true});refreshPublishedWallpaper?.();
    };
    const fullscreen=$('wallpaper-framing-fullscreen');
    let previewOwnsFullscreen=false;
    function releasePreviewFullscreen(){
      if(!previewOwnsFullscreen)return;
      previewOwnsFullscreen=false;
      if(document.fullscreenElement===document.body)document.exitFullscreen().catch(()=>{});
    }
    function updateFullscreenButton(){
      const active=previewOwnsFullscreen && document.fullscreenElement===document.body;
      fullscreen.hidden=!document.fullscreenEnabled || (!!document.fullscreenElement && !active);
      fullscreen.textContent=active?'退出全屏':'全屏看缸';
    }
    fullscreen.onclick=async()=>{
      if(fullscreen.disabled || fullscreen.hidden || !framingDialog.open)return;
      fullscreen.disabled=true;
      try {
        if(document.fullscreenElement===document.body)await document.exitFullscreen();
        else {
          previewOwnsFullscreen=true;
          await document.body.requestFullscreen();
          if(previewOwnsFullscreen && framingDialog.open)hideTools.click();
          else if(document.fullscreenElement===document.body)await document.exitFullscreen();
        }
      } catch {
        if(previewOwnsFullscreen && framingDialog.open)$('wallpaper-framing-note').textContent=document.fullscreenElement?'可按 Esc 退出全屏。':'浏览器未允许全屏，可以继续在窗口里看缸。';
      } finally {
        previewOwnsFullscreen=previewOwnsFullscreen && document.fullscreenElement===document.body;
        fullscreen.disabled=false;updateFullscreenButton();
      }
    };
    document.addEventListener('fullscreenchange',()=>{
      if(previewOwnsFullscreen && !document.fullscreenElement){
        previewOwnsFullscreen=false;
        if(framingDialog.open && !revealTools.hidden)revealTools.click();
      }
      updateFullscreenButton();
    });
    open.hidden=false;
    const hold=$('wallpaper-framing-pause');
    function setPreviewPaused(value){
      previewPaused=value;
      frozenPreviewWorld=null;
      hold.textContent=value?'继续预看':'定格画面';
      hold.setAttribute('aria-pressed',String(value));
    }
    hold.onclick=()=>{
      setPreviewPaused(!previewPaused);
      if(previewPaused && recordingWallpaper)checkRecording?.('预看已定格');
    };
    function openFraming(fromQuiet){
      if(framingDialog.open)return;
      const reason=wallpaperUnavailable();
      if(reason){message(reason);return;}
      // A new visit can start before the previous dialog's queued close event.
      releasePreviewFullscreen();
      revealTools.hidden=true;
      framingRoom.checked=recordingWallpaper ? recordingOverview : draftOverview ?? publishedOverview;
      setPreviewPaused(paused);
      updateFullscreenButton();
      $('wallpaper-framing-title').textContent=(tankNames[full.data.BreedingRooms?.activeId] || tankNames.main)+' · 壁纸预看';
      $('wallpaper-framing-note').textContent=recordingWallpaper?'预看沿用本次录制比例。':sync.hidden?'预看和导出使用所选比例。':'预看和导出使用所选比例。实时壁纸会按目标屏幕自动取景。';
      $('wallpaper-framing-return').textContent=fromQuiet?'回到静观':'返回观察';
      $('wallpaper-framing-controls').append(shortcuts,actions);
      framingDialog.showModal();
      full.syncQuietClock();
      requestViewResize();
      if(fromQuiet)hideTools.click();
      refreshPublishedWallpaper?.();
    }
    open.onclick=()=>openFraming(false);
    $('wallpaper-framing-return').onclick=()=>framingDialog.close();
    $('quiet-wallpaper').onclick=()=>openFraming(true);
    framingDialog.addEventListener('keydown',event=>{
      if(event.key.toLowerCase()!=='h' || !document.body.classList.contains('quiet'))event.stopPropagation();
    });
    framingDialog.addEventListener('close',()=>{
      if(framingDialog.open)return;
      releasePreviewFullscreen();
      full.syncQuietClock();revealTools.hidden=true;
      $('col-observe').prepend(shortcuts);$('observe-hint').before(actions);requestViewResize();
    });
  }
  if (!wallpaperMode) $('wallpaper-still').onclick=async event=>{
    const room=full?.data.BreedingRooms?.activeId;
    const notify=text=>{
      if(framingDialog.open && room===full?.data.BreedingRooms?.activeId)$('wallpaper-framing-note').textContent=text;
      else message(text);
    };
    const reason=wallpaperUnavailable();
    if (reason) {notify(reason);return;}
    const button=event.currentTarget;
    button.disabled=true;
    try {
      const name=tankNames[room] || tankNames.main;
      const filename=wallpaperCaptureName(name,'png');
      const {width,height,blob}=captureWallpaperFrame(3840*2160,canvas=>({
        width:canvas.width,height:canvas.height,blob:new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
      }));
      const png=await blob;
      if (!png) throw Error('画面尚未生成，请再试一次。');
      const link=$('wallpaper-still-download'),previousUrl=link.href;
      link.href=URL.createObjectURL(png);
      link.download=filename;
      link.textContent='下载上次留影 · '+name;
      link.hidden=false;
      if(previousUrl)URL.revokeObjectURL(previousUrl);
      link.click();
      notify(`已生成「${name}」的整缸图片（${width}×${height} PNG），可用作桌面背景。`);
    } catch (error) { notify('留影失败：'+error.message); }
    finally { button.disabled=false; }
  };
  checkRecording=installWallpaperRecording({canvas:renderer.domElement,button:$('wallpaper-record'),discard:$('wallpaper-discard'),download:$('wallpaper-download'),hint:$('wallpaper-hint'),roomId:()=>full.data.BreedingRooms?.activeId || 'main',setRecording(value,smallEncoder){
    recordingWallpaper=value;
    framingFormat.disabled=value;
    framingRoom.disabled=value;
    renderer.domElement.style.objectFit=value?'contain':'';
    if(value){
      recordingOverview=useRoomOverview();
      const [sourceWidth,sourceHeight]=wallpaperSize();
      const [width,height]=wallpaperVideoSize(sourceWidth,sourceHeight,devicePixelRatio,renderer.capabilities.maxTextureSize,smallEncoder);
      renderer.setDrawingBufferSize(width,height,1);
      wallpaperTarget=frameCurrentWallpaper(wallpaperCamera,width/height);
      drawCleanTankFrame(wallpaperCamera);
    }else{
      resizePending=false;
      if(framingDialog.open)framingRoom.checked=draftOverview ?? publishedOverview;
      resizeView();
      updateShrimpMarks();
    }
  },unavailable:()=>{
    if(renderer.getContext().isContextLost())return '显卡画面尚未恢复，请稍后再录制。';
    const reason=wallpaperUnavailable();
    if (reason) return reason;
    if (viewPaused()) return framingDialog.open?'点「继续预看」后就可以录制。':'请先继续模拟，让虾群恢复活动。';
    return '';
  }});
  const supported=new Set(p.clips.map(c=>c.name));for(const option of $('action').options)option.disabled=option.value!=='Auto'&&!supported.has(option.value);
  window.aquarium={ready:true,renderer,scene,camera,controls,aq,progress,reset,get game(){return full;},get world(){return world;},get habitat(){return habitat;},get layout(){return structuredClone(layout);},get editor(){return editor;},get paused(){return paused;},get selected(){return selected?.id;},feet,waterRenderer,get look(){return tankLook;},get shrimpLook(){return shrimpLook;},get flora(){return full?.flora;},get time(){return time;},glow,get pearling(){return pearling;},get renderedFrames(){return renderedFrames;},get catalogLoaded(){return !!full?.runtime?.catalog;}};
  if (wallpaperPlayback) {
    prepareWallpaperPrograms();
    let drawFailures=0, restartCheck;
    wallpaperPlayback.startFrames(now=>{
      const before=renderedFrames;
      try {
        const result=frame(now);
        if(drawFailures && renderedFrames>before){
          drawFailures=0;
          restartCheck?.abort();
          restartCheck=null;
        }
        return result;
      }
      catch(error){
        console.warn('壁纸播放中断，将重试',error);
        showWallpaperCover();
        // Give an already playing scene more in-place retries before rebuilding it.
        const awaitingFirstFrame=!renderedFrames || !!resolveWallpaperFrame;
        if(++drawFailures>=(awaitingFirstFrame?2:4) && !restartCheck){
          const check=restartCheck=new AbortController();
          waitForWallpaperRestart(wallpaperTag,wallpaperPlayback,desktopPlayback && awaitingFirstFrame,check.signal).then(ready=>{
            if(restartCheck!==check)return;
            restartCheck=null;
            if(ready && !wallpaperPlayback.suspended)location.reload();
          });
        }
        return false;
      }
    });
  } else {
    $('loading').remove();
    const syncLoop=()=>renderer.setAnimationLoop(document.hidden ? null : frame);
    document.addEventListener('visibilitychange',syncLoop);
    syncLoop();
  }
}catch(error){setWallpaperAssetStatus(null);console.error(error);$('progress').textContent='加载失败：'+error.message;$('status').textContent='迁移资产尚未就绪';window.aquarium={ready:false,error:error.message};
  if (wallpaperMode && wallpaperTag) {
    const requiresNewCopy=error.code==='INVALID_AQUARIUM_SESSION';
    $('progress').textContent+=requiresNewCopy ? ' · 等待从游戏重新同步鱼缸。' : ' · 服务可用时会自动重试，也可以从游戏重新同步。';
    waitForWallpaperRestart(wallpaperTag,wallpaperPlayback,desktopPlayback,undefined,requiresNewCopy).then(()=>location.reload());
  }
}

async function applyDesktopCopy(copy,signal,tag){
  try {
    const previousScenery=full.runtime.current.group;
    const jpeg=wallpaperStill(copy);
    const still=await decodeWallpaperStill(jpeg);
    signal.throwIfAborted();
    await full.restore(copy.game,{signal});
    desktopOverview=copy.framing==='whole-room';
    wallpaperTarget=frameCurrentWallpaper(camera,camera.aspect);controls.target.copy(wallpaperTarget);
    wallpaperBroodIndex=wallpaperJournalBrood(copy.game.session,copy.game.creatures.map(c=>c.CreatureId));
    drawnBrood=null;
    wallpaperTag=tag;
    wallpaperJpeg=still ? jpeg : null;
    if(previousScenery!==full.runtime.current.group)prepareWallpaperPrograms();
    // A committed copy can wait here across a host pause until its first draw.
    await new Promise(resolve=>{resolveWallpaperFrame=resolve;});
  }
  catch (error) {
    // Only a failure after a scene commit requires rebuilding the renderer from the saved copy.
    if (full.recoveryRequired) {
      showWallpaperCover();
      await waitForWallpaperRestart(tag,wallpaperPlayback,desktopPlayback);
      location.reload();
    }
    throw error;
  }
}



