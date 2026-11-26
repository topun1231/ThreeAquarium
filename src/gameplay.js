import {readAsset} from './asset-read.js';
import {readLocalGame,writeLocalGame} from './local-game-save.js';
import {wallpaperMode,wallpaperScenery,gameStorage as localStorage} from './live-wallpaper.js';
import {wallpaperRoomKey,tankGeometryKey} from './wallpaper-layout.js';
import {createGrowthDueCheck,inTank,tankNames} from './crystal-breeding.js';
import {readCrystalBackup,writeCrystalBackup} from './crystal-backup.js';
import {unifyAquarium,emptyUnifiedProgress,UNIFIED_BACKUP_KEY} from './unified-aquarium.js';
import {createPlacementPreview,soilTools,insideSoil} from './placement-preview.js';
import * as T from 'three';
import {createFeedingFeedback} from './feeding-feedback.js';
import {appearance} from './crystal-traits.js';
import {createObjectSelection} from './object-selection.js';
import {TankRuntime,rotation} from './tank-runtime.js';
import {Substrate} from './substrate.js';
import {dressSample, registerSampleStone} from './sample-aquascape.js';
import {SAVE_KEY} from './state.js';
import {advanceEcology,ecologySeconds,offlineSeconds,advanceCreatureEcology,plantStructureChanged} from './ecology.js';
import {parseSoilKind} from './substrate.js';
import {FEEDING_RADIUS,activityNames,observationGroups,observationNames,observationRoster,biofilmRichness,careNeeds,careSummary,colonyTick,emptyColony,noteTreat,parseShrimpName,shrimpDetail,syncRoster,tankEntry} from './care.js';
import {populationRecords,validateStock,seatNewIndividuals} from './population.js';
import {createCrystalPanel,maternalStage,updateSelectOptions} from './crystal-panel.js';
import {applyCrystalAction} from './crystal-progress.js';
import {CRYSTAL_BACKUP_KEY,CRYSTAL_RESUME_KEY,blankBreedingRoom,projectCrystalRooms,crystalColony,updateCrystalResidentClocks,validateCrystalRoster} from './crystal-rooms.js';
import {validateSession} from './session.js';
import {seatHardscape,substrateMask,clearHardscape} from './hardscape.js';
import {CreatureWorld,GAME_SAVE_KEY,validateGame} from './creatures.js';
import {vec,face,up} from './habitat.js';
import {FloraView} from './flora-view.js';
import {loadAnubias} from './anubias.js';
import {tidyPlants,restoreTrim} from './plant-care.js';
import {pruneFlora,SPECIES,FLORA_CATALOG,parsePlantKind,floraGap,checkFloraGround,checkFloraHost,makeFloraRecord,floraYaw,floraSignature} from './flora.js';
import {UNITY_PLANT_LABELS,plantRecordLabel,unityPlantName} from './plant-names.js';
import {creditsMarkup} from './credits.js';
import {createMaterialPicker} from './material-picker.js';
import {BUILD_STEPS,buildRequirement,createBuildGuide,objectEditActions} from './build-guide.js';
import {animateHardscapeDrop,releasePose} from './hardscape-drop.js';
const $=id=>document.getElementById(id),names=['铺设底床','摆放木石','种植水草','观察鱼缸'];
export const catalogErrorMarkup=()=>`<p id="catalog-error" hidden role="alert"><span id="catalog-error-text">木石与水草目录加载失败。</span><button type="button" id="catalog-retry">重试加载</button></p>`;
const newId=()=>crypto.randomUUID().replaceAll('-','');
export async function fullGameplay(ctx){
 const trimHistory=new WeakMap();
 const {aq,camera,controls,canvas,message}=ctx;aq.populationBase={tankId:ctx.seed().tankId,creatures:structuredClone(ctx.seed().creatures)};aq.templates=[...aq.animals];const runtime=await TankRuntime.load(aq,ctx.layoutSource,t=>$('status').textContent=t),flora=new FloraView(aq,()=>ctx.world()?.habitat);let data=structuredClone(runtime.source),busy=false,recoveryRequired=false,editing=false,tool='',selected=null,movingSelection=false,stroke=null,history=[],future=[],eco=0,follow=null,quietUntil=0,filling=0,occluded=0,nextAvoidance=0,escapeLag=0,wasEscaping=false,aim=null,pendingBirths=0,spawning=false,careClock=0,showStars=false;
 if(!wallpaperMode)flora.installAnubias(await loadAnubias());
 registerSampleStone(runtime);
 runtime.flora=flora;
 let navigationDirty=false,crystalPanel=null,crystalWorking=false,crystalClock=0;
 let wallpaperGeometry;
 let hiddenAt=null;
 function catalogFailure(err){return err?.code==='CATALOG_LOAD_FAILED';}
 function showCatalogError(err){const box=$('catalog-error'),text=$('catalog-error-text');if(text)text.textContent='木石与水草目录加载失败：'+err.message;if(box)box.hidden=false;message('目录加载失败，可点重试：'+err.message);}
 function hideCatalogError(){const box=$('catalog-error');if(box)box.hidden=true;}
 async function loadCatalog(){try{const cat=await runtime.ensureCatalog();hideCatalogError();return cat;}catch(e){showCatalogError(e);throw e;}}
 async function readySession(save,signal){try{const next=await runtime.readyForSession(save,signal);hideCatalogError();return next;}catch(e){if(catalogFailure(e))showCatalogError(e);throw e;}}
 let stored=null,catalogBootError=null,firstOpening=false,newSample=false;
 const welcomeKey='aquarium.three.welcome.v1';
 try {
  stored=readLocalGame(localStorage,GAME_SAVE_KEY);
  if(stored?.session)data=await readySession(stored.session);
  else if(wallpaperMode)throw Error('壁纸副本缺少鱼缸进度');
  else {
   data.Tank.Plants=ctx.records();data.LastSaveUtc=new Date().toISOString();
   const fresh=!stored&&!ctx.saveBlocked()&&![SAVE_KEY,CRYSTAL_BACKUP_KEY,CRYSTAL_RESUME_KEY,UNIFIED_BACKUP_KEY,'aquarium.three.previous'].some(key=>localStorage.getItem(key)!==null);
   if(fresh){dressSample(data,runtime.settings,ctx.sampleHabitat);newSample=true;firstOpening=localStorage.getItem(welcomeKey)!=='1';}
  }
 }catch(e){
  if(wallpaperMode)throw e;
  stored=null;catalogBootError=e;ctx.blockSave();message('原存档已保留，自动保存已停用：'+e.message);
 }
 const initialPopulation=await readAsset('/assets/initial-population.json');const panel=document.createElement('div');panel.id='tank-tools';panel.innerHTML=`<p id="setup-stage"></p><div class="pair"><button id="tank-edit">编辑造景</button><button id="tank-menu">主菜单</button></div><div id="tank-menu-panel" hidden><button id="tank-empty">从空缸开始</button><button id="tank-sample">恢复示例造景</button><p>新建前会保存上一缸，可用“上一缸”恢复。</p><button id="tank-previous">上一缸</button>${creditsMarkup()}</div>${catalogErrorMarkup()}<div class="pair" id="plant-care-tools" hidden><button type="button" id="plant-care-tidy">一键打理水草</button><button type="button" id="plant-care-undo" hidden>撤销这次打理</button></div><div id="setup-tools" hidden><label>工具<select id="setup-tool"><option value="select">选择物体</option><option value="pour">倒土</option><option value="return">收回土</option><option value="push">推土</option><option value="pull">拉土</option><option value="finish">细整</option><option value="level">整平</option><option value="stone">添加木石</option><option value="plant">种植水草</option><option value="prune">修剪水草</option></select></label><label>底床材料<select id="soil-kind"><option value="0">深棕水草土</option><option value="1">炭黑细砾</option><option value="2">米黄细砂</option><option value="3">浅灰河砂</option><option value="4">暖棕混合砾</option></select></label><label><input id="soil-heavy" type="checkbox">宽铲深推</label><label>木石规格<select id="stone-kind"></select></label><label>水草品种<select id="plant-kind" title="按水草店常用名选择">${[false,true].map(host=>`<optgroup label="${host?'附生 · 种在木石表面':'地栽 · 种在底床上'}">${host?'':UNITY_PLANT_LABELS.map((label,i)=>`<option value="${i}">${label}</option>`).join('')}${FLORA_CATALOG.filter(e=>!!e.host===host).map(e=>`<option value="${e.id}">${e.label}</option>`).join('')}</optgroup>`).join('')}</select></label><div class="pair"><button id="object-left">左转 10°</button><button id="object-right">右转 10°</button></div><div class="pair"><button id="object-tilt-left">倾斜 −7°</button><button id="object-tilt-right">倾斜 +7°</button></div><div class="pair"><button id="object-up">抬高埋深</button><button id="object-down">加深入土</button></div><button id="object-delete">移除选中</button><div class="pair"><button id="setup-undo" type="button" title="快捷键 Ctrl+Z">撤销</button><button id="setup-redo" type="button" title="把刚撤销的造景做回去">重做</button></div><div class="pair"><button id="setup-back">上一步</button><button id="setup-next">下一步</button></div></div><button id="follow-shrimp" type="button" title="先点一只虾，再让镜头跟着">跟随选中的虾</button><button id="top-view" type="button" title="快捷键 V，在俯视和正视之间切换">俯视 / 正视</button><button id="tank-light" type="button" title="开关缸灯">切换缸灯</button>`;
 $('plant-panel').hidden=true;$('plant-panel').before(panel);$('col-observe').append($('follow-shrimp'),$('top-view'),$('tank-light'));
 const tourButton=document.createElement('button');tourButton.id='favorite-tour';tourButton.type='button';
 tourButton.textContent='轮流观察本缸收藏';tourButton.setAttribute('aria-pressed','false');$('follow-shrimp').after(tourButton);
 let tourRemaining=null, quietResident=null;
 function favoritesHere(){return aq.animals.filter(a=>data.Colony?.shrimp?.[a.id]?.favorite);}
 tourButton.onclick=()=>{
  if(tourRemaining!==null){setFollow(null);ctx.reset();return;}
  if(editing||busy||filling>0||!data.Tank.Setup.Filled){message('完成注水和当前操作后即可观察');return;}
  const favorites=favoritesHere(), first=favorites.find(a=>a.id===ctx.selected()?.id)||favorites[0];
  if(!first){message('本缸还没有收藏虾。点一只虾，再点「收藏」。');return;}
  if(ctx.focusShrimp(first.id))setFollow(first.id,true);
 };
 const buildGuide=createBuildGuide(panel,step=>run(()=>goToBuildStep(step))());let guideStage=-1,placement=null;
 if(catalogBootError&&catalogFailure(catalogBootError))showCatalogError(catalogBootError);
 const tap=document.createElement('button');tap.id='tap-glass';tap.type='button';tap.textContent='轻敲玻璃';tap.title='先对准，再点玻璃上的位置';tap.setAttribute('aria-pressed','false');$('feed').after(tap);tap.onclick=()=>arm('tap');$('feed').onclick=()=>arm('feed');
 const originalImport=document.createElement('label');originalImport.className='import';originalImport.textContent='导入原 Unity 存档（可同时选鱼缸和虾文件）';const originalFiles=document.createElement('input');originalFiles.id='unity-import';originalFiles.type='file';originalFiles.accept='.json';originalFiles.multiple=true;originalImport.append(originalFiles);$('col-keep').append(originalImport);
 for(const e of runtime.data.entries.filter(e=>e.species===-1&&!e.legacy&&!e.retired&&e.baseKey)){const o=document.createElement('option');o.value=e.key;o.textContent=e.name;$('stone-kind').append(o);}
 const materialPicker=createMaterialPicker(runtime.data.entries,finishTool,{definitions:runtime.definitions,onMove:()=>{if(busy||filling>0||!editing||!selectedRecord(data))return;movingSelection=true;hover=null;placementWait=null;refresh();message('移动鼠标查看落点，左键确认；右键或 Esc 取消移动，原物体保留');},onPrune:()=>{
  if(busy||filling>0||!editing||!selectedRecord(data)||data.Tank.Hardscape.some(p=>p.UniqueId===selected))return;
  if(!data.Tank.Setup.Filled&&!BUILD_STEPS[data.Tank.Setup.PreparationStep].tools.includes('prune'))return;
  tool='prune-selected';$('setup-tool').value='prune';hover=null;placementWait=null;refresh();
  $('tool-finish').focus({preventScroll:true});message('只修剪'+selectionName()+'，点选要剪的位置');
 },onRepeat:sample=>{
  if(busy||filling>0||!editing)return;
  if(!data.Tank.Setup.Filled&&!BUILD_STEPS[data.Tank.Setup.PreparationStep].tools.includes(sample.tool))return;
  cancelStroke();clearPlacementSelection();tool=sample.tool;$('setup-tool').value=tool;
  refresh();materialPicker.choose(sample.tool,sample.value);
  message(`已选取 ${sample.label}，原物体保留；点击新位置后添加，右键或 Esc 取消`);
 }});
 const focusFeedingShrimp=id=>{if(ctx.focusShrimp(id))paintCare();};
 const feedingFeedback=createFeedingFeedback(camera,focusFeedingShrimp,(id,colony)=>{
  const record=data.Breeding?.individuals.find(r=>r.id===id);
  const local=Object.hasOwn(colony.shrimp,id)?colony.shrimp[id]:null;
  let where=local?'本缸':'已离缸';
  if(record)where=record.soldAt!==null?'已转让':record.tank==='rest'?'静养处':tankNames[record.tank];
  return {name:record?.name||local?.name||'虾',appearance:record && appearance(record),where,available:!!(record||local)};
 },id=>{
  if(crystalPanel && data.Breeding?.individuals.some(r=>r.id===id))return crystalPanel.openIndividual(id);
  focusFeedingShrimp(id);
 });
 const objectSelection=createObjectSelection(aq.root,runtime,flora,camera);
 let falling=null;
 const standby=ctx.world(); // Dry tanks retain stock against the stable source habitat until filling.
 const water=aq.nodes.find(n=>n.name==='Filled water state'),lights=ctx.scene.children.filter(n=>n.isLight&&n.type!=='HemisphereLight'&&!n.userData.windowLight);lights.forEach(l=>l.userData.originalIntensity=l.intensity);
 // Keep the light slots stable so switching the lamp can reuse the running shaders.
 function setLampPower(on){
  const control=$('tank-light'),label=on?'缸灯已开':'缸灯已关';
  if(control.textContent!==label){
   control.textContent=label;
   control.setAttribute('aria-label','缸灯');
   control.setAttribute('aria-pressed',String(on));
  }
  for(const light of lights){
   light.intensity=on?light.userData.originalIntensity:0;
   if(light.castShadow){
    light.shadow.autoUpdate=on;
    if(!light.shadow.map)light.shadow.needsUpdate=true;
   }
  }
 }
 function lock(v){v=!!v||recoveryRequired;busy=v;if(v){placement?.hide();objectSelection.clear();}ctx.freeze(v||editing||filling>0||!data.Tank.Setup.Filled);panel.querySelectorAll('button,input,select').forEach(e=>{if(e.id==='catalog-retry')return;e.disabled=v||filling>0||e.id.startsWith('object-')&&!selected;});for(const id of ['follow-shrimp','favorite-tour','quiet-watch','quiet-long','quiet-fullscreen','top-view','tank-light']){const node=$(id);if(node)node.disabled=v||filling>0;}controls.enabled=!wallpaperMode&&!stroke;}
 function snapshot({forWallpaper=false}={}){
  const rooms=data.BreedingRooms;
  // The desktop draws the neighbouring layouts and residents. Only its active tank runs the habitat.
  const source=forWallpaper && rooms ? {...data,BreedingRooms:{...rooms,rooms:rooms.rooms.map(({game,...room})=>room)}} : data;
  const session=structuredClone(source);
  if(eco>0)advanceEcology(session,runtime.definitions,eco);
  session.LastSaveUtc=new Date().toISOString();
  return {...ctx.snapshot(),layout:[],stock:structuredClone(aq.populationBase),navigation:ctx.world().anchors.map(a=>({owner:a.owner,kind:a.kind,position:a.position.toArray()})),session};
 }
 function save(){if(ctx.saveBlocked()||busy||stroke)return false;try{const next=snapshot();next.session=validateSession(next.session,runtime);if(next.session.Breeding)validateCrystalRoster(next.session.Breeding,next.creatures,next.session.BreedingRooms.activeId);writeLocalGame(localStorage,GAME_SAVE_KEY,next);return true;}catch(e){message('保存失败，原进度未覆盖：'+e.message);return false;}}
 function richness(session=data){return biofilmRichness({plants:session.Tank.Plants.length+(session.Tank.Flora||[]).length,hardscape:session.Tank.Hardscape.length,simSeconds:session.SimulationSeconds});}
 function rememberShrimp(){
  if(!data.Colony?.shrimp)data.Colony=emptyColony();
  if(data.Breeding){
   data.Colony=crystalColony(data.Breeding,data.BreedingRooms.activeId,data.Colony,data.Breeding.now,data.SimulationSeconds);
  }else syncRoster(data.Colony,ctx.world().agents);
  return data.Colony;
 }
 function paintCareButtons(box,rows,selectedId){
  const current=data.BreedingRooms?.activeId;
  const buttons=new Map([...box.children].map(b=>[b.dataset.id,b]));
  for(const [index,r] of rows.entries()){
   const name=r.name||r.id,room=tankNames[r.tank];
   const identity=r.identity || (rows.some(other=>other.id!==r.id&&other.tank===r.tank&&(other.name||other.id)===name)?name+' · '+r.id:name);
   const label=r.signs?identity+' · '+r.signs:'★ '+identity+(room?' · '+room:'');
   const button=buttons.get(r.id)||document.createElement('button');buttons.delete(r.id);
   if(!button.dataset.id){button.type='button';button.dataset.id=r.id;}
   if(button.textContent!==label)button.textContent=label;
   button.title=r.signs?'在缸里看看'+name:r.tank!==current&&room?'前往'+room+'跟随它':'在这口缸跟随它';
   if(r.id===selectedId)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
   if(box.children[index]!==button)box.insertBefore(button,box.children[index]||null);
  }
  for(const stale of buttons.values())stale.remove();
 }
 async function locateShrimp(id, startFollowing=false, keepFollowing=false){
  const track=startFollowing || (keepFollowing && !!followedAnimal());
  if(track && (busy||editing||aim||filling>0||recoveryRequired))throw Error('请先结束当前操作，再跟随这只虾。');
  if(data.Breeding){
   const record=data.Breeding.individuals.find(r=>r.id===id);
   if(!record||!inTank(record))return false;
   if(record.tank!==data.BreedingRooms.activeId)await switchCrystalRoom(record.tank);
  }
  const found=ctx.focusShrimp(id);
  if(found){if(track)setFollow(id);paintCare();}
  return found;
 }
 function followedAnimal(){
  if(!follow)return null;
  if(wallpaperMode)return aq.animals.find(animal=>animal.id===follow);
  const selected=ctx.selected();return selected?.id===follow?selected:null;
 }
 function setFollow(id,tour=false){
  follow=id||null;occluded=escapeLag=nextAvoidance=0;wasEscaping=false;
  tourRemaining=tour && follow ? 20 : null;
  tourButton.textContent=tourRemaining===null?'轮流观察本缸收藏':'结束轮流观察';
  tourButton.setAttribute('aria-pressed',String(tourRemaining!==null));
  const control=$('follow-shrimp');control.textContent=tourRemaining!==null?'只跟随当前这只':follow?'停止跟随':'跟随选中的虾';
  control.setAttribute('aria-pressed',String(!!follow));
 }
 function tickTour(dt){
  if(tourRemaining===null || busy || !followedAnimal())return;
  if(editing || !data.Tank.Setup.Filled){setFollow(null);return;}
  if(quietResident || document.body.classList.contains('crystal-panel-open') || $('wallpaper-framing').open)return;
  tourRemaining-=dt;
  if(tourRemaining>0 && data.Colony?.shrimp?.[follow]?.favorite)return;
  const favorites=favoritesHere();
  if(!favorites.length){setFollow(null);return;}
  const i=favorites.findIndex(a=>a.id===follow);
  const next=favorites[(i+1)%favorites.length];
  if(!wallpaperMode)ctx.markShrimp(next.id);
  setFollow(next.id,true);
 }
 function updateWallpaperLabel(){
  const room=tankNames[data.BreedingRooms?.activeId]||tankNames.main;
  const label=`同步到实时壁纸 · ${room}`;
  const button=$('wallpaper-sync');if(button.textContent!==label)button.textContent=label;
  const tank=data.Tank, current=$('wallpaper-current-tank');
  const description='游戏中：'+room+' · '+ctx.world().agents.length+' 只虾 · '+wallpaperScenery(tank.Environment.LightOn===false?'off':'on',tank.Hardscape.length,tank.Plants.length+(tank.Flora?.length || 0));
  if(current.textContent!==description)current.textContent=description;
 }
 function paintCare(){
  if(wallpaperMode)return;
  const preview=$('wallpaper-framing').open;
  if(!quietUntil || preview)updateWallpaperLabel();
  const breeding=data.Breeding;
  if(quietUntil || preview){
   if(breeding)updateCrystalResidentClocks(breeding,data.Colony,breeding.now,data.SimulationSeconds);
   if(quietResident && !preview)syncQuietSibling();
   return;
  }
  const colony=rememberShrimp(),agents=ctx.world().agents,selected=ctx.selected()?.id;
  paintActivities();
  const now=breeding?Math.max(Date.now(),breeding.now):0;
  const summary=careSummary(agents,colony,{simSeconds:data.SimulationSeconds,plants:data.Tank.Plants,definitions:runtime.definitions,richness:richness(),flora:data.Tank.Flora||[],managedBreeding:!!breeding});
  feedingFeedback.update(ctx.world(),colony,selected);
  const node=$('care');
  if(node){
   const brood=breeding?.batches.find(b=>b.status==='formed'&&colony.shrimp[b.motherId]);
   const care=brood?colony.shrimp[brood.motherId].name+' · '+maternalStage(brood,now)+'。':'下一窝可以在虾册安排。';
   const overall=summary.startsWith('状态')?'全缸整体'+summary:summary;
   const detail=breeding?(agents.length?overall+'\n'+care:'这缸暂时没有水晶虾，可以在虾册领养或移入个体。'):overall;
   if(node.textContent!==detail)node.textContent=detail;
  }
  const needs=data.Tank.Setup.Filled?careNeeds(agents,colony):[];
  const chip=$('care-chip');if(chip){const condition=needs.length?`${needs.length} 只饥饿或压力偏高`:summary.startsWith('状态')?summary.split(/[·\n]/,1)[0].trim():summary.startsWith('缸里还没有')?'尚未放虾':'虾群';chip.textContent=`${condition} · 生态第${Math.floor(data.SimulationSeconds/86400)+1}天`;}
  const card=$('shrimp-card'),record=selected?colony.shrimp[selected]:null,agent=ctx.world().agentsById.get(selected);
  if(card)card.hidden=!record;
  if(record){
   const input=$('shrimp-name');if(input&&document.activeElement!==input)input.value=record.name;
   $('shrimp-fav').textContent=record.favorite?'★ 已收藏':'☆ 收藏';$('shrimp-fav').setAttribute('aria-pressed',String(record.favorite));
   const crystal=breeding?.individuals.find(r=>r.id===selected&&!r.legacy);
   if(crystal){
    const brood=breeding.batches.find(b=>b.motherId===selected&&(b.status==='formed'||b.status==='hatched'));
    const quality=crystal.adultAt>now?'幼虾成长中，成年后显示品质':`颜色 ${crystal.P[0].toFixed(2)} · 覆盖 ${crystal.P[1].toFixed(2)} · 边界 ${crystal.P[2].toFixed(2)}`;
    $('shrimp-detail').textContent=[crystal.sex==='female'?'母虾':'公虾',maternalStage(brood,now),quality,`饥饿 ${Math.round(agent.data.Needs.Hunger*100)}% · 压力 ${Math.round(agent.data.Needs.Stress*100)}%`,'在「虾册」查看亲代与记录'].filter(Boolean).join(' · ');
   }else $('shrimp-detail').textContent=shrimpDetail(agent,record,data.SimulationSeconds);
   $('selection').textContent=record.name;
  }
  if(!$('care-pop').hidden){
   const current=breeding&&data.BreedingRooms?.activeId;
   const favorites=breeding
    ? breeding.individuals.filter(r=>r.protected&&inTank(r)).sort((a,b)=>Number(b.tank===current)-Number(a.tank===current))
    : agents.map(a=>({id:a.data.CreatureId,...colony.shrimp[a.data.CreatureId]})).filter(r=>r.favorite);
   paintCareButtons($('favorites'),favorites,selected);
   const details=$('care-needs');
   const previousFocus=details.contains(document.activeElement)?document.activeElement:null;
   details.hidden=!needs.length;
   const heading=`饥饿或压力偏高的虾 · ${needs.length} 只`;
   if(details.firstElementChild.textContent!==heading)details.firstElementChild.textContent=heading;
   paintCareButtons($('care-individuals'),needs,selected);
   if(previousFocus && (details.hidden||!previousFocus.isConnected)){
    (details.hidden?$('favorites').querySelector('button')||$('show-stars'):details.firstElementChild).focus({preventScroll:true});
   }
  }
  const journal=$('journal');if(journal)journal.textContent=(colony.journal||[]).slice(-3).map(item=>`第 ${item.day} 天 · ${item.text}`).join('\n');}
 function syncAim(){$('feed').setAttribute('aria-pressed',String(aim==='feed'));tap.setAttribute('aria-pressed',String(aim==='tap'));document.body.classList.toggle('aiming',!!aim);canvas.style.cursor=aim?'crosshair':'';}
 function cancelAim(){aim=null;syncAim();message('已取消，未投喂或敲击');}
 function recentMeal(){return ctx.world().pellet?.age<20;}
 function inspectMeal(id){
  const visitors=data.Colony?.lastFeeding;
  if(!ctx.world().pellet)return {pastVisitor:!!visitors?.includes(id)};
  return {active:true,recent:recentMeal(),status:feedingFeedback.individualStatus(id,visitors)};
 }
 function showRecentMeal(){
  if(!recentMeal())return false;
  aim=null;syncAim();paintCare();feedingFeedback.showMeal();message('刚投下的食物还在，可以看看哪只虾发现了。');return true;
 }
 function arm(kind){if(busy||editing||filling>0||!data.Tank.Setup.Filled){message(data.Tank.Setup.Filled?'请先完成当前操作':'注水之后才能投喂或敲玻璃');return;}if(kind==='feed' && showRecentMeal())return;aim=aim===kind?null:kind;syncAim();message(aim==='feed'?'点击缸内投喂；右键单击或 Esc 取消':aim==='tap'?'点击玻璃轻敲；右键单击或 Esc 取消':'已取消');}
 function asPoint(value){if(!value)return null;if(value.isVector3)return value;if([value.x,value.y,value.z].every(Number.isFinite))return new T.Vector3(value.x,value.y,value.z);return null;}
 function feedNearShrimp(id,reviewOnly){
  if(busy||crystalWorking||stroke||editing||filling>0||!data.Tank.Setup.Filled){message('请先完成当前鱼缸操作');return;}
  const agent=ctx.world().agentsById.get(id);
  if(!agent||ctx.selected()?.id!==id){message('请先在本缸选中要照料的虾');return;}
  if(reviewOnly){
   if(ctx.world().pellet){aim=null;syncAim();paintCare();feedingFeedback.showMeal();}
   else message('这次投喂已结束');
   return;
  }
  feedAt(agent.position,true);
 }
 function feedAt(value,nearShrimp=false){
  if(busy||editing||filling>0||!data.Tank.Setup.Filled)return false;
  const point=asPoint(value);if(!point)return false;aim=null;syncAim();
  if(ctx.saveBlocked()){message('存档保护已启用，未投喂；请先恢复有效存档');return false;}
  const world=ctx.world();if(showRecentMeal())return false;
  const colony=rememberShrimp(),before={pellet:world.pellet,discovery:world.agents.map(a=>[a.noticed,a.discoveryAt]),treat:colony.treat};
  if(!world.dropFood(point,nearShrimp?FEEDING_RADIUS:Infinity)){message(nearShrimp?'它附近暂时没有落料点，等它靠近底床、木石或水草再试':'这里没有虾能到达的位置');return false;}
  const previousVisitors=colony.lastFeeding;
  data.Colony.lastFeeding=[];data.Colony.treat=noteTreat(colony,false).colony.treat;
  if(!save()){
   if(previousVisitors===undefined)delete data.Colony.lastFeeding;else data.Colony.lastFeeding=previousVisitors;
   world.pellet=before.pellet;
   world.agents.forEach((a,i)=>{[a.noticed,a.discoveryAt]=before.discovery[i];});data.Colony.treat=before.treat;paintCare();return false;
  }
  ctx.releaseAction?.();paintCare();message(before.pellet?'已在新位置投喂，标记随之移动；原处食物仍保留':'加餐已投下，虾会按需求自行发现；点击投喂点查看进食情况');return true;
 }
 function tapAt(value){if(busy||editing||filling>0||!data.Tank.Setup.Filled)return 0;const point=asPoint(value);if(!point)return 0;aim=null;syncAim();const n=ctx.world().threaten(point,.37,1.3);save();paintCare();message(n?`${n} 只虾感受到这一下敲击，会按胆量躲避`:'这一下没有惊到附近的虾');return n;}
 let quietOrigin=null;
 function enterQuiet(continuous=false,button=null){
  if(!data.Tank.Setup.Filled||busy||filling>0){if(continuous)message('请先完成注水和当前操作');return;}
  const pop=$('dock-popover');
  const origin=button || (document.activeElement===document.body ? $('quiet-watch') : document.activeElement);
  const restoreDock=!pop.hidden && (!button || pop.contains(button));
  quietOrigin={
   button:origin,
   dock:restoreDock ? (pop.classList.contains('dock-unbounded')?'all':pop.querySelector('.dock-col:not([hidden])')?.dataset.dock) : null,
   careNeedsOpen:!button && !$('care-pop').hidden ? $('care-needs').open : null
  };
  cancelStroke();clearPlacementSelection();aim=null;syncAim();editing=false;tool='select';$('setup-tool').value=tool;controls.enabled=true;
  refresh();window.showDock?.('');if(!$('care-pop').hidden)$('care-chip').click();
  remainingQuietMs=null;quietUntil=continuous?Infinity:performance.now()+300000;syncQuietClock();
  document.body.classList.toggle('quiet-long',continuous);document.body.classList.add('quiet');
  $('quiet-exit').focus({preventScroll:true});message(continuous?'长时间静观中，按 Esc 或 H 返回':'静观中，点「结束静观」或按 H 返回',3200);
 }
 let remainingQuietMs=null;
 function syncQuietClock(){
  const hold=document.hidden || $('wallpaper-framing').open;
  if(hold && quietUntil && Number.isFinite(quietUntil)){
   remainingQuietMs=Math.max(0,quietUntil-performance.now());
   quietUntil=Infinity;
  }else if(!hold && remainingQuietMs!==null){
   quietUntil=performance.now()+remainingQuietMs;
   remainingQuietMs=null;
  }
 }
 let fullscreenQuiet=false;
 const quietNext=$('quiet-next-sibling');
 function syncQuietSibling(){
  const here=quietResident?.brood?.members.filter(k=>ctx.world().agentsById.has(k.id)) || [];
  const index=here.findIndex(k=>k.id===quietResident?.id);
  const next=here.length>1 && index>=0 && quietResident.id===ctx.selected()?.id ? here[(index+1)%here.length] : null;
  if(quietNext.hidden!==!next)quietNext.hidden=!next;
  if(next){
   const label=quietResident.brood.fromPhotos?'看另一只':'看同窝下一只';
   if(quietNext.textContent!==label)quietNext.textContent=label;
   const title=label+' · '+next.label;
   if(quietNext.title!==title){quietNext.title=title;quietNext.setAttribute('aria-label',title);}
  }
  return next;
 }
 quietNext.onclick=async()=>{
  const resident=quietResident,next=syncQuietSibling();
  if(!next || !quietUntil || !canObserveResidents() || crystalWorking || $('wallpaper-framing').open)return;
  const touring=tourRemaining!==null;
  await crystalPanel.focusSibling(next.id);
  if(quietResident!==resident || ctx.selected()?.id!==next.id)return;
  resident.id=next.id;
  if(touring)setFollow(next.id,true);
  syncQuietSibling();
  quietNext.focus({preventScroll:true});
  message('正在看「'+next.label+'」',2500);
 };
 function watchQuietly(id,button){
  if(id!==ctx.selected()?.id || !ctx.world().agentsById.has(id))return;
  if(!canObserveResidents()){message('请先结束当前操作，再静观这只虾。');return;}
  const alreadyFollowing=followedAnimal()?.id===id;
  if(!ctx.focusShrimp(id))return;
  quietResident={id,temporaryFollow:!alreadyFollowing,brood:crystalPanel?.quietBrood(id)};
  if(!alreadyFollowing)setFollow(id);
  enterQuiet(true,button);
  syncQuietSibling();
 }
 const fullscreenRoot=document.documentElement;
 if(!wallpaperMode)$('wallpaper-framing').addEventListener('close',()=>{
  if(quietUntil || $('wallpaper-framing').open)return;
  paintCare();
  crystalPanel?.update();
 });
 function releaseFullscreen(){
  if(document.fullscreenElement===fullscreenRoot)document.exitFullscreen().catch(()=>{});
 }
 function exitQuiet(){
  const returnToDock=document.body.classList.contains('quiet-long') || $('wallpaper-framing').open || $('quiet-controls').contains(document.activeElement);
  if($('wallpaper-framing').open)$('wallpaper-framing').close();
  quietUntil=0;remainingQuietMs=null;
  if(fullscreenQuiet){fullscreenQuiet=false;releaseFullscreen();}
  document.body.classList.remove('quiet','quiet-long');
  const origin=quietOrigin,button=origin?.button;
  quietOrigin=null;
  if(origin?.dock)window.showDock?.(origin.dock);
  if(origin?.careNeedsOpen!=null){
   if($('care-pop').hidden)$('care-chip').click();
   $('care-needs').open=origin.careNeedsOpen;
  }
  paintCare();
  crystalPanel?.update();
  const resident=quietResident;
  quietResident=null;
  quietNext.hidden=true;
  if(resident?.temporaryFollow && follow===resident.id)setFollow(null);
  if(button && (!resident || ctx.selected()?.id===resident.id) && button.getClientRects().length && !button.disabled)
   button.focus({preventScroll:true});
  else if(returnToDock)document.querySelector('#dock-bar [data-dock="observe"]').focus({preventScroll:true});
  else if(origin)$('quiet-watch').focus({preventScroll:true});
  message('已结束静观');
 }
 const fullscreenButton=$('quiet-fullscreen');
 fullscreenButton.hidden=wallpaperMode||!document.fullscreenEnabled;
 fullscreenButton.onclick=async()=>{
  enterQuiet(true,fullscreenButton);
  if(!quietUntil||document.fullscreenElement)return;
  fullscreenQuiet=true;
  try {
   await fullscreenRoot.requestFullscreen();
   if(!fullscreenQuiet)releaseFullscreen();
  } catch {
   if(fullscreenQuiet && quietUntil)message('浏览器未允许全屏，已进入窗口静观。按 H 或 Esc 返回。',4000);
   fullscreenQuiet=false;
  }
 };
 document.addEventListener('fullscreenchange',()=>{
  if(fullscreenQuiet && !document.fullscreenElement){fullscreenQuiet=false;exitQuiet();}
 });
 function canObserveResidents(){return data.Tank.Setup.Filled && !editing && !busy && !aim && filling<=0 && !recoveryRequired;}
 function watchResident(id){
  const tracking=!!followedAnimal();
  if(ctx.focusShrimp(id) && tracking)setFollow(id);
  paintCare();
 }
 function paintActivities(){
  const details=$('watch-activities');
  if(!details.open || !details.getClientRects().length)return;
  const agents=ctx.world().agents,available=canObserveResidents();
  const groups=observationGroups(agents,data.Colony,data.Breeding?.batches,data.Breeding?.individuals);
  const id=ctx.selected()?.id, roster=observationRoster(agents,data.Colony,data.Breeding?.batches), picker=$('observe-resident');
  updateSelectOptions(picker,roster,'选择一只虾');
  const identity=roster.find(option=>option.value===id)?.label;
  const selectedId=identity?id:'';
  if(picker.value!==selectedId)picker.value=selectedId;
  picker.disabled=!available || !roster.length;
  const quiet=$('observe-resident-quiet');
  quiet.hidden=!identity;
  quiet.disabled=!available || !identity;
  if(identity)quiet.setAttribute('aria-label','静观看'+identity);
  const stages=id && Object.keys(groups).filter(key=>key!=='RookieEntrants' && groups[key].includes(id)).map(key=>observationNames[key]);
  const caption=!data.Tank.Setup.Filled?'注水后就可以在这里观虾。':!agents.length?'这口缸还没有虾。':!available?'完成当前操作后可以观虾。':identity?['正在看「'+identity+'」',...stages].join(' · '):'点一组找到其中一只，再点看下一只。';
  if($('activity-caption').textContent!==caption)$('activity-caption').textContent=caption;
  for(const button of $('activity-choices').children){
   const state=button.dataset.state,count=groups[state].length;
   if(state==='MealVisitors')button.hidden=!data.Colony?.lastFeeding;
   if(state==='RookieEntrants' || state==='LatestBrood' || state==='GoalHatchlings' || state==='GoalAdults')button.hidden=!count;
   const label=observationNames[state]+' · '+count+' 只';
   if(button.textContent!==label)button.textContent=label;
   button.disabled=!available || !count;
  }
 }
 const choices=$('activity-choices');
 if(!wallpaperMode){
  for(const state of Object.keys(observationNames)){
   const button=document.createElement('button');button.type='button';button.dataset.state=state;choices.append(button);
  }
  $('watch-activities').ontoggle=paintActivities;
  $('observe-resident-quiet').onclick=event=>{
   const id=$('observe-resident').value;
   if(id)watchQuietly(id,event.currentTarget);
  };
  $('observe-resident').onchange=event=>{
   const id=event.target.value;
   if(id && canObserveResidents() && ctx.world().agentsById.has(id))watchResident(id);
   else paintActivities();
  };
  choices.onclick=event=>{
   const state=event.target.closest('button')?.dataset.state;
   if(!state || !canObserveResidents())return;
   const matches=observationGroups(ctx.world().agents,data.Colony,data.Breeding?.batches,data.Breeding?.individuals)[state];
   if(!matches?.length){paintActivities();message('这组虾的状态刚刚变了。');return;}
   const index=matches.indexOf(ctx.selected()?.id);
   const id=matches[(index+1)%matches.length];
   watchResident(id);
   message($('activity-caption').textContent);
  };
 }
 function selectionName(){const r=selectedRecord(data);if(!r)return '';const stones=data.Tank.Hardscape,i=stones.indexOf(r),entry=runtime.data.entries.find(e=>e.key===r.TypeId);return i>=0?`${entry?.legacy?(entry.wood?'沉木':'石头'):entry?.name||'木石'} · 第${i+1}件`:`${plantRecordLabel(r,runtime.definitions)} · 第${[...data.Tank.Plants,...(data.Tank.Flora||[])].indexOf(r)+1}株`;}
 function refresh(){
  $('plant-care-tools').hidden=!data.Tank.Setup.Filled||wallpaperMode;
  $('plant-care-undo').hidden=!trimHistory.has(history.at(-1));
  if(!wallpaperMode)updateWallpaperLabel();if(recoveryRequired){lock(true);for(const id of ['save','export','import','unity-import','tank-empty','tank-sample','tank-previous']){const node=$(id);if(node)node.disabled=true;}return;}feedingFeedback.update(ctx.world(),rememberShrimp(),ctx.selected()?.id);if(selected&&!selectedRecord(data))selected=null;if(tool==='prune-selected'&&(!selected||!editing)){tool='select';$('setup-tool').value=tool;}const dry=!data.Tank.Setup.Filled,stage=data.Tank.Setup.PreparationStep;if(dry){editing=true;const step=BUILD_STEPS[stage];if(guideStage!==stage||(tool!=='select'&&!step.tools.includes(tool==='prune-selected'?'prune':tool))){tool=step.tool;selected=null;$('setup-tool').value=tool;}guideStage=stage;}else guideStage=-1;if(!selected||tool!=='select'||!editing)movingSelection=false;document.body.classList.toggle('scene-editing',editing&&!dry);const stageText=`${names[stage]} · 生态第 ${Math.floor(data.SimulationSeconds/86400)+1} 天`;$('setup-stage').textContent=stageText;if($('setup-chip'))$('setup-chip').textContent=stageText;const hold=busy||editing||filling>0||dry;$('feed').disabled=hold;tap.disabled=hold;if(hold&&aim){aim=null;syncAim();}$('tank-edit').textContent=editing?'完成编辑，回到观赏':'编辑造景';$('setup-tools').hidden=!editing&&!dry;$('setup-actions').hidden=!editing&&!dry;$('setup-back').disabled=busy||!dry||stage===0;$('setup-next').textContent=stage<2?'下一步':dry?'注水并开始养虾':'完成编辑';$('soil-kind').value=String(data.Tank.Substrate.IncomingKind);if(water)water.visible=!dry;aq.animals.forEach(a=>a.rig.visible=!dry&&filling<=0);setLampPower(data.Tank.Environment.LightOn);ctx.status(`${data.Tank.Plants.length+(data.Tank.Flora||[]).length} 株水草 · ${data.Tank.Hardscape.length} 件木石${dry?' · 未注水':` · ${ctx.world().agents.length} 只虾`}`);lock(busy);$('setup-undo').disabled=busy||filling>0||!history.length;$('setup-redo').disabled=busy||filling>0||!future.length;$('setup-undo').title=history.length?'撤销上一次造景操作（Ctrl+Z）':'没有可撤销的操作；刷新后不保留撤销记录';$('setup-redo').title=future.length?'恢复刚撤销的造景操作（Ctrl+Shift+Z / Ctrl+Y）':'没有可重做的操作';$('setup-back').disabled=busy||filling>0||!dry||stage===0;if(placement && editing && tool==='stone' && !busy && !filling)placement.prepareStone($('stone-kind').value);buildGuide.update({tank:data.Tank,soil:runtime.current?.soil||runtime.sourceSoil,tool:tool==='prune-selected'?'prune':tool,selected,moving:movingSelection,busy,filling,attached:!!SPECIES[parsePlantKind($('plant-kind').value).species]?.host});materialPicker.update({editing:editing||dry,tool,busy:busy||filling>0,tank:data.Tank,selected,moving:movingSelection,selectionName:selectionName()});objectSelection.sync(!busy&&editing&&(tool==='select'||tool==='prune-selected')?selectedRecord(data):null,selectionName(),data.Tank.Hardscape.some(r=>r.UniqueId===selected));}
 async function transact(next,{placementId=null,placementIds=null,seat=false,newTank=false,recordHistory=true,game=ctx.world().snapshot(),restoring=false,arrivals=[],hatchSites=[],keepResidents=false,signal}={}){
  localStorage.assertGameSaveCurrent?.();
  if(recoveryRequired)throw new Error('进度已保存，请刷新页面完成恢复');if(busy||stroke)throw new Error('请先完成当前鱼缸操作');if(ctx.saveBlocked()&&!restoring)throw new Error('原浏览器存档未恢复，请先导入有效进度');lock(true);let candidate,population,persisted=false,reuseScene=false;
  try{next=await readySession(next,signal);
   if(wallpaperMode && !flora.models && [next,...(next.BreedingRooms?.rooms??[]).map(room=>room.session)]
       .some(session=>session.Tank.Flora?.some(r=>SPECIES[r.Species].kind==='rosette'))){
    const plants=await loadAnubias(signal);
    signal?.throwIfAborted();
    flora.installAnubias(plants);
   }
   const geometry=wallpaperMode && next.Tank.Setup.Filled ? tankGeometryKey(next.Tank) : null;
   const roomChanged=next.BreedingRooms?.activeId!==data.BreedingRooms?.activeId &&
    Array.isArray(game.navigation);
   const switchingRoom=!wallpaperMode && !restoring && !newTank && roomChanged;
   // Continuous growth can change the live plant shape after the last route build.
   reuseScene=keepResidents || !!(restoring && geometry && runtime.current && !navigationDirty && !seat && !newTank &&
    !placementId && !placementIds && next.BreedingRooms?.activeId===data.BreedingRooms?.activeId &&
    geometry===wallpaperGeometry && geometry===tankGeometryKey(data.Tank));
   await new Promise(r=>setTimeout(r,0));signal?.throwIfAborted();candidate=reuseScene?{...runtime.current,save:next}:await runtime.prepare(next,runtime.current,{
    navigation:next.Tank.Setup.Filled,mutableSolids:seat,backgroundNavigation:wallpaperMode&&!!runtime.current,
    wallpaperStartup:wallpaperMode&&!runtime.current,switchingRoom,
    cacheRoomRoutes:switchingRoom||wallpaperMode&&restoring&&roomChanged,signal
   });
   signal?.throwIfAborted();
   if(seat){seatHardscape(candidate,next.Tank.Hardscape,selected);candidate.dispose();candidate=await runtime.prepare(next,runtime.current,{navigation:next.Tank.Setup.Filled});}
   if(placementId)clearHardscape(candidate,new Set([candidate.entities.get(placementId).name]));
   if(placementIds){
    clearHardscape(candidate,new Set(placementIds.map(id=>candidate.entities.get(id).name)));
    for(const s of candidate.habitat.surfaces.filter(s=>s.solid&&placementIds.some(id=>s.owner.endsWith(id)))){
     if(s.box.min.x<-.599||s.box.max.x>.599||s.box.min.z<-.299||s.box.max.z>.299||s.box.max.y>.65)throw Error('下落后木石超出鱼缸，已还原');
     const p=s.geo.attributes.position,stride=Math.max(1,Math.floor(p.count/500));
     for(let i=0;i<p.count;i+=stride){const x=p.getX(i),z=p.getZ(i);if(p.getY(i)<candidate.soil.sample(x,z)-.006)throw Error('下落后木石穿入底床，已还原');}
    }
   }
   let nextSeed=ctx.seed(),world=ctx.world(),roster;const stock=game.stock?validateStock(game.stock):aq.populationBase;
   if(next.Breeding)validateCrystalRoster(next.Breeding,game.creatures,next.BreedingRooms.activeId);
   if(next.Tank.Setup.Filled){
    let seats;
    if(arrivals.length){
     game=structuredClone(game);
     seats=seatNewIndividuals(game.creatures,arrivals,keepResidents?world:candidate,next.Colony,0,hatchSites);
    }
    if(newTank){game=structuredClone(game);const available=candidate.anchors.filter(a=>a.kind===0&&a.edges.length);if(available.length<game.creatures.length)throw new Error('底床缺少足够的落脚位置');game.creatures.forEach((c,i)=>{const p=available[Math.floor((i+.5)*available.length/game.creatures.length)].position;c.Position={x:p.x,y:p.y+.003,z:p.z};c.Rotation={x:0,y:0,z:0,w:1};c.ExecutionState='Rest';c.CurrentIntent='Rest';});}
    const hardscapeChanged=!restoring && !newTank && data.Tank.UniqueId===next.Tank.UniqueId &&
      JSON.stringify(data.Tank.Hardscape)!==JSON.stringify(next.Tank.Hardscape);
    if(keepResidents){
     roster=world.prepareRoster(game.creatures,seats??new Map(),next.Colony);
     nextSeed=roster.seed;
    }else{
     const mapped=runtime.remapWorld(candidate,nextSeed,game,stock,{hardscapeChanged});nextSeed=mapped.seed;world=mapped.world;
    }
   }
   if(!next.Tank.Setup.Filled&&(newTank||restoring||game.session)){game=structuredClone(game);if(newTank)game.creatures.forEach((c,i)=>{const original=standby.agents[i%standby.agents.length].data;c.Position=structuredClone(original.Position);c.Rotation=structuredClone(original.Rotation);});const mapped=runtime.remapWorld({save:next,anchors:standby.anchors,habitat:standby.habitat},nextSeed,game,stock);nextSeed=mapped.seed;world=mapped.world;}
   if(switchingRoom){await new Promise(resolve=>setTimeout(resolve,0));signal?.throwIfAborted();}
   const savedWorld=roster?validateGame(world.snapshot(roster.agents),nextSeed):world.snapshot();
   population=ctx.preparePopulation(roster??world);next.LastSaveUtc=new Date().toISOString();writeLocalGame(localStorage,GAME_SAVE_KEY,{...savedWorld,layout:[],stock,navigation:world.anchors.map(a=>({owner:a.owner,kind:a.kind,position:a.position.toArray()})),session:next});persisted=true;
   if(!wallpaperMode && (restoring || newTank))hiddenAt=document.hidden ? Date.parse(next.LastSaveUtc) : null;
   if(recordHistory){history.push(structuredClone(data));if(history.length>20)history.shift();future=[];}
   data=next;
   if(reuseScene)runtime.current.save=data;
   else runtime.commit(candidate);
   if(newTank || restoring&&!wallpaperMode)runtime.previousRoomRoutes=null;
   flora.sync(data,runtime,!reuseScene);wallpaperGeometry=geometry;navigationDirty=false;
   candidate=null;aq.populationBase=stock;roster?.commit();population?.commit();ctx.replace(world,nextSeed,world.habitat);ctx.invalidateReflection();refresh();return true;
  }catch(e){
   if(persisted){
    // The saved candidate is authoritative; a partly published scene must never overwrite it.
    recoveryRequired=true;ctx.blockSave();ctx.freeze(true);
    const error=new Error('进度已保存，但场景更新失败。操作和自动保存已暂停，请刷新页面恢复。',{cause:e});error.code='SCENE_COMMIT_FAILED';message(error.message);throw error;
   }
   if(!reuseScene)candidate?.dispose();
   population?.dispose();throw e;
  }finally{lock(false);if(ctx.world())refresh();}
 }
 function historyLayout(value){if(trimHistory.has(value))return restoreTrim(structuredClone(data),value,trimHistory.get(value));if(!data.Breeding)return value;const next=structuredClone(data);next.Tank=structuredClone(value.Tank);return next;}
 function crystalIdle(){if(busy||stroke||spawning||filling>0||crystalWorking||recoveryRequired)throw new Error('请先结束当前操作');localStorage.assertGameSaveCurrent?.();if(ctx.saveBlocked())throw new Error('原存档保护中，请先恢复有效进度');}
 function readGrowth(kind,id,at){
  try{crystalIdle();}catch(error){message(error.message);return false;}
  const rooms=data.BreedingRooms, before=rooms.unreadGrowth;
  const pending=before?.find(event=>event.kind===kind && event.id===id);
  if(!pending || pending.at!==at)return false;
  rooms.unreadGrowth=before.filter(event=>event!==pending);
  if(save())return true;
  rooms.unreadGrowth=before;return false;
 }
 async function publishCrystal(projected,ecologyChanged=false){
  const {session:next,game,arrivals,hatchSites}=projected;
  // A record-only save can still cross a leaf or stage boundary in its residual ecology time.
  const sameHabitat=next.BreedingRooms.activeId===data.BreedingRooms?.activeId && !ecologyChanged && !navigationDirty &&
    !plantStructureChanged(data.Tank.Plants,next.Tank.Plants) && floraSignature(next.Tank.Flora)===flora.signature;
  const residents=ctx.world().agents;
  const sameResidents=!arrivals.length && residents.length===game.creatures.length &&
    game.creatures.every((c,i)=>c.CreatureId===residents[i].data.CreatureId);
  if(sameResidents && sameHabitat){lock(true);try{
   const checked=await readySession(next);validateCrystalRoster(checked.Breeding,game.creatures,checked.BreedingRooms.activeId);
   // A pure record change needs one durable write, not a complete terrain rebuild.
   writeLocalGame(localStorage,GAME_SAVE_KEY,{...game,session:checked});data=checked;
   if(runtime.current)runtime.current.save=data;ctx.world().colony=data.Colony;
  }finally{lock(false);}}else{
   const keepResidents=sameHabitat && !wallpaperMode && next.Tank.Setup.Filled && runtime.current?.habitat===ctx.world().habitat;
   await transact(next,{game,arrivals,hatchSites,keepResidents,recordHistory:false});
  }
  eco=0;paintCare();refresh();crystalPanel?.showGrowth(data.BreedingRooms.unreadGrowth || []);
 }
 function settleCrystalOffline(projected,since=projected.session.LastSaveUtc){
  const next=projected.session,now=Date.now(),real=offlineSeconds(since,now,runtime.config),seconds=ecologySeconds(real);
  const start=Date.parse(since),residentSeconds=new Map();
  for(const r of next.Breeding.individuals){
   if(r.tank!==next.BreedingRooms.activeId || r.soldAt!==null)continue;
   const legacyHatch=r.legacy && r.legacyAgeDays===0 && projected.arrivals.includes(r.id);
   if(r.source!=='bred' && !legacyHatch)continue;
   const hatchAt=r.adultAt-next.Breeding.growthMs+(legacyHatch?0:next.Breeding.stageMs.hatch);
   if(hatchAt<=start)continue;
   // Use the tank's offline curve on both sides of hatch, even in its slow or capped period.
   const beforeHatch=offlineSeconds(since,Math.min(hatchAt,now),runtime.config);
   residentSeconds.set(r.id,ecologySeconds(real-beforeHatch));
  }
  advanceEcology(next,runtime.definitions,seconds);
  advanceCreatureEcology(projected.game,seconds,ctx.seed().profile,projected.game.navigation||[],real,richness(next),residentSeconds);
  return projected;
 }
 function projectCrystalAction(session,game,action={type:'advance'},target=session.BreedingRooms.activeId){
  const {state,result,hatches}=applyCrystalAction(session.Breeding,action,Date.now());
  return {...projectCrystalRooms(session,game,state,runtime.source,initialPopulation[0],target,hatches),result};
 }
 async function crystalAction(action,offlineSince=null){
  crystalIdle();if(!data.Breeding)throw new Error('当前进度缺少虾册，请先恢复有效存档');
  const targetId=action.type==='stock'||action.type==='natural'?'main':action.tankId;
  const targetTank=targetId===data.BreedingRooms.activeId?data:data.BreedingRooms.rooms.find(r=>r.id===targetId)?.session;
  const entering=['stock','buy','plan','natural','move','recall'].includes(action.type) || (action.type==='rehouse' && targetId!=='rest');
  if(entering && !targetTank?.Tank.Setup.Filled)throw new Error('请先完成目标缸的造景并注水，再让虾入缸');
  crystalWorking=true;
  try{const current=snapshot(),projected=projectCrystalAction(current.session,current,action);
   if(offlineSince)settleCrystalOffline(projected,offlineSince);
   await publishCrystal(projected,!!offlineSince);
   if(action.type==='keepTankPhoto')message('留影已收进「虾册 → 相册」。');
   return projected.result;
  }finally{crystalWorking=false;}
 }
 async function switchCrystalRoom(id,{keepSelectedParent=false}={}){
  crystalIdle();if(!data.Breeding)throw new Error('鱼缸进度尚未就绪');if(id===data.BreedingRooms.activeId)return;
  const finishMateVisit=keepSelectedParent ? crystalPanel?.beginMateRoomVisit(id) : null;
  crystalWorking=true;
  message(finishMateVisit?'':`正在切换到「${tankNames[id]||'目标缸'}」…`);
  try{const current=snapshot(),projected=projectCrystalAction(current.session,current,{type:'advance'},id);
   settleCrystalOffline(projected);await publishCrystal(projected);history=[];future=[];selected=null;editing=!data.Tank.Setup.Filled;eco=0;pendingBirths=0;clearPlacementSelection();refresh();
   if(!finishMateVisit)message('已切换鱼缸，各缸造景和个体分别保留');
  }catch(error){if(!recoveryRequired)message('换缸未完成：'+error.message);throw error;
  }finally{crystalWorking=false;finishMateVisit?.();}
  crystalPanel?.enteredBroodRoom();
 }
 function stockSample(session,game){
  const creatures=populationRecords({tankId:session.Tank.UniqueId,creatures:ctx.sampleResidents},10);
  return unifyAquarium({...game,session,creatures},{source:runtime.source,template:initialPopulation[0],now:Date.now(),seed:crypto.getRandomValues(new Uint32Array(1))[0]});
 }
 async function prepareUnified(value,{useSaved=false,signal}={}){
  if(value.session.Breeding?.unified&&value.session.BreedingRooms?.unified===1)return null;
  const original=useSaved?await readCrystalBackup(localStorage,CRYSTAL_BACKUP_KEY):null;
  const resume=useSaved&&!value.session.Breeding?await readCrystalBackup(localStorage,CRYSTAL_RESUME_KEY):null;
  for(const saved of [value,original,resume])if(saved?.session)saved.session=await readySession(saved.session,signal);
  const projected=unifyAquarium(value,{original,resume,source:runtime.source,template:initialPopulation[0],now:Date.now(),seed:crypto.getRandomValues(new Uint32Array(1))[0]});
  if(projected&&!localStorage.getItem(UNIFIED_BACKUP_KEY))await writeCrystalBackup(localStorage,UNIFIED_BACKUP_KEY,{current:value,original,resume});
  return projected;
 }
 async function startCrystal(arrivalIndex=null){
  if(!data.Breeding)throw new Error('进度尚未完成兼容，请从存档恢复有效鱼缸');
  const arrivals=await crystalAction({type:'stock'});
  const chosenId=arrivals.individualIds[arrivalIndex];
  const chosen=chosenId && data.Breeding.individuals.find(r=>r.id===chosenId);
  setFollow(null);
  if(chosen && await locateShrimp(chosen.id,false))message('7 只水晶虾已入住。你正在看「'+chosen.name+'」。');
  else {ctx.reset();paintCare();message('7 只水晶虾已入住你的主缸。');}
 }
 async function restoreCrystalSnapshot(value,{reseat=false,signal}={}){
  if(busy||stroke||crystalWorking)throw new Error('请先完成当前操作');lock(true);try{
  let next=await readySession(value.session,signal);
  const migrated=await prepareUnified({...value,session:next},{signal});
  if(migrated){next=migrated.session;value=migrated.game;}
  signal?.throwIfAborted();
  if(next.Breeding){const p=projectCrystalAction(next,value);if(p.session.Tank.Setup.Filled)settleCrystalOffline(p);p.arrivals=reseat?p.game.creatures.map(c=>c.CreatureId):[...new Set([...p.arrivals,...(migrated?.arrivals||[])])];lock(false);await transact(p.session,{game:p.game,arrivals:p.arrivals,hatchSites:p.hatchSites,recordHistory:false,restoring:true,signal});}
  else {lock(false);await transact(next,{game:value,recordHistory:false,restoring:true,signal});}
  pendingBirths=0;eco=0;history=[];future=[];selected=null;editing=!data.Tank.Setup.Filled;ctx.unblockSave();refresh();paintCare();crystalPanel?.showGrowth(data.BreedingRooms?.unreadGrowth || [],true);
  }finally{lock(false);}
 }
 // Old API names remain explicit errors; they cannot resurrect divergent mode saves.
 async function exitCrystal(){throw new Error('现在就在当前鱼缸里养虾，不再切换原缸模式；备份可从存档恢复');}
 async function resumeCrystal(){return exitCrystal();}
 const run=fn=>async()=>{try{await fn();}catch(e){message(e.message);console.error(e);}finally{refresh();}};
 originalFiles.onchange=run(async()=>{try{const files=[...originalFiles.files];if(!files.length||files.length>2||files.some(f=>f.size>16*1024*1024))throw new Error('请选择原鱼缸存档及可选的虾存档，最多两份');const values=await Promise.all(files.map(async f=>JSON.parse(await f.text()))),tank=values.find(s=>s.Tank),creatures=values.find(s=>s.Creatures&&!s.Tank);if(!tank)throw new Error('缺少原鱼缸存档');await importUnity(tank,creatures);message('原存档已只读导入浏览器，原文件没有改动');}finally{originalFiles.value='';}});
 async function importUnity(tank,creatures=null){const next=await readySession(tank),now=Date.now(),seconds=ecologySeconds(offlineSeconds(next.LastSaveUtc,now,runtime.config));
  advanceEcology(next,runtime.definitions,seconds);next.LastSaveUtc=new Date(now).toISOString();let game=snapshot();
  if(creatures){if(creatures.SaveVersion!==1||creatures.TankId!==tank.Tank.UniqueId||!Array.isArray(creatures.Food)||creatures.Food.length>12000||!Number.isFinite(Date.parse(creatures.SavedUtc)))throw new Error('虾存档与鱼缸不匹配');game.stock=validateStock({tankId:creatures.TankId,creatures:creatures.Creatures});game.creatures=structuredClone(creatures.Creatures);game.navigation=creatures.Food.map(f=>({owner:'',kind:f.SurfaceType,position:[f.Position.x,f.Position.y,f.Position.z]}));game.food=creatures.Food.map(f=>f.Value);delete game.anchors;game.pellet=null;
   if(creatures.PelletActive){let at=-1,distance=Infinity;creatures.Food.forEach((f,i)=>{const d=vec(f.Position).distanceTo(vec(creatures.PelletPosition));if(d<distance){at=i;distance=d;}});if(at>=0)game.pellet={anchor:at,age:creatures.PelletAge};}
   if(next.Tank.Setup.Filled)advanceCreatureEcology(game,ecologySeconds(offlineSeconds(creatures.SavedUtc,now,runtime.config)),ctx.seed().profile,game.navigation,(now-Date.parse(creatures.SavedUtc))/1000,richness(next));
  }else if(data.Breeding){next.Breeding=structuredClone(data.Breeding);next.BreedingRooms=structuredClone(data.BreedingRooms);next.Colony=crystalColony(next.Breeding,next.BreedingRooms.activeId,next.Colony,next.Breeding.now,next.SimulationSeconds);game.stock={tankId:next.Tank.UniqueId,creatures:structuredClone(game.creatures)};}await restoreCrystalSnapshot({...game,session:next},{reseat:!creatures});ctx.unblockSave();history=[];future=[];editing=!next.Tank.Setup.Filled;selected=null;refresh();
 }
 async function ensure(){if(runtime.current)return;await transact(structuredClone(data),{recordHistory:false});}
 function selectedRecord(next){return [...next.Tank.Plants,...next.Tank.Hardscape,...(next.Tank.Flora||[])].find(p=>p.UniqueId===selected);}
 function floraList(next){if(!next.Tank.Flora)next.Tank.Flora=[];return next.Tank.Flora;}
 function attachFlora(next,kind,point,hit,ignore=null,id=newId()){
  const spec=SPECIES[kind.species];
  if(spec.host){
   const hostId=hit?.object.userData.entity;
   if(!hostId||!next.Tank.Hardscape.some(h=>h.UniqueId===hostId))throw new Error('请把鼠标移到木石表面，绿色时点击附着；不能种在土里');
   const node=runtime.current.entities.get(hostId);node.updateMatrixWorld(true);
   const display=hit?.point.clone()||new T.Vector3(point.x,point.y,-point.z);
   const unity=display.clone();unity.z*=-1;
   const matrix=new T.Matrix4().copy(ctx.aq.root.matrixWorld).invert().multiply(node.matrixWorld),inverse=matrix.clone().invert();
   const local=unity.clone().applyMatrix4(inverse);
   let normal=new T.Vector3(0,1,0);
   if(hit){normal=hit.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld));normal.z*=-1;}normal.applyNormalMatrix(new T.Matrix3().setFromMatrix4(matrix).transpose());
   checkFloraHost(floraList(next),{host:hostId,local:local.toArray(),species:kind.species,ignore,matrix});
   return makeFloraRecord({id,species:kind.species,variant:kind.variant,host:hostId,local:local.toArray(),normal:normal.toArray(),yaw:floraList(next).length*2.399});
  }
  const soil=runtime.current.soil,y=soil.sample(point.x,point.z);
  if(y<=soil.MinHeight+.0002)throw new Error('请在有底床的缸内区域种植');
  checkFloraGround(floraList(next),{x:point.x,z:point.z,species:kind.species,ignore,plants:next.Tank.Plants.map(p=>({id:p.UniqueId,x:p.Position.x,z:p.Position.z}))});
  for(const s of runtime.current.habitat.surfaces.filter(s=>s.solid)){const h=s.bvh.raycastFirst(new T.Ray(new T.Vector3(point.x,.7,point.z),new T.Vector3(0,-1,0)),T.DoubleSide);if(h&&h.point.y>y+.015)throw new Error('木石遮挡了种植点');}
  return makeFloraRecord({id,species:kind.species,variant:kind.variant,x:point.x,z:point.z,yaw:floraList(next).length*2.399});
 }
 function checkPlant(next,type,p,ignore=null){const soil=runtime.current.soil,y=soil.sample(p.x,p.z);if(Math.abs(p.x)>.56||Math.abs(p.z)>.26||y<=soil.MinHeight+.0002)throw new Error('请在有底床的缸内区域种植');const spacing=type.includes('finegrass')?.011:.024;if(next.Tank.Plants.some(o=>o.UniqueId!==ignore&&Math.hypot(o.Position.x-p.x,o.Position.z-p.z)<spacing))throw new Error('离其他水草太近');if((next.Tank.Flora||[]).some(o=>!SPECIES[o.Species]?.host&&Math.hypot(o.X-p.x,o.Z-p.z)<Math.max(.016,floraGap(o.Species)*.7)))throw new Error('离其他水草太近');for(const s of runtime.current.habitat.surfaces.filter(s=>s.solid)){const h=s.bvh.raycastFirst(new T.Ray(new T.Vector3(p.x,.7,p.z),new T.Vector3(0,-1,0)),T.DoubleSide);if(h&&h.point.y>y+.015)throw new Error('木石遮挡了种植点');}return {x:p.x,y,z:p.z};}
 $('tank-edit').onclick=run(async()=>{await ensure();editing=!editing;if(editing)loadCatalog().catch(()=>{});tool='select';$('setup-tool').value=tool;clearPlacementSelection();refresh();if(!editing)window.showDock?.('');message(editing?'点击选中木石或水草，再从操作条选择移动、旋转或同款。':'已回到观察模式');});
 $('catalog-retry').onclick=run(async()=>{await loadCatalog();placement?.reset();if(ctx.saveBlocked()){const value=readLocalGame(localStorage,GAME_SAVE_KEY);if(value?.session){await restoreCrystalSnapshot(value);message('目录已加载，存档已恢复');return;}}message('目录已重新加载');});
 $('tank-menu').onclick=()=>{$('tank-menu-panel').hidden=!$('tank-menu-panel').hidden;};
 async function newTank(sample,fromWelcome=false){if(!fromWelcome&&!confirm('新建鱼缸？当前鱼缸会保存为“上一缸”。'))return false;if(!save())return false;writeLocalGame(localStorage,'aquarium.three.previous',snapshot());const next=structuredClone(runtime.source);next.Tank.UniqueId=newId();next.CreatedUtc=next.LastSaveUtc=new Date().toISOString();next.SimulationSeconds=0;
  if(!sample){const soil=new Substrate(runtime.settings);next.Tank.Plants=[];next.Tank.Hardscape=[];next.Tank.Substrate={...next.Tank.Substrate,...soil.snapshot()};next.Tank.Setup={AllowsPlantGroups:true,PreparationStep:0,HardscapePlaced:false,PlantPlaced:false,Filled:false};next.Tank.Environment.WaterLevel=0;next.Tank.Flora=[];}
  else dressSample(next,runtime.settings,ctx.sampleHabitat);
  next.Colony=emptyColony();
  const game={...ctx.world().snapshot(),stock:{tankId:next.Tank.UniqueId,creatures:[]},creatures:[],food:[],navigation:[],elapsed:0,pellet:null};
  if(sample){
   const stocked=stockSample(next,game);
   await transact(stocked.session,{newTank:true,game:stocked.game});
  }else{
   next.Breeding=emptyUnifiedProgress(Date.now(),crypto.getRandomValues(new Uint32Array(1))[0]);next.BreedingRooms={version:1,unified:1,activeId:'main',rooms:[{id:'breeding',session:blankBreedingRoom(runtime.source,'breeding')}],creatures:[]};
   await transact(next,{newTank:true,game});
  }
  crystalPanel?.showGrowth([],true);history=[];future=[];editing=!sample;guideStage=-1;$('tank-menu-panel').hidden=true;ctx.reset();message(sample?'已恢复「溪湾」样板缸':'从铺底床开始：按住左键，在缸底拖动铺土。');refresh();return true;
 }
 $('tank-empty').onclick=run(()=>newTank(false));$('tank-sample').onclick=run(()=>newTank(true));$('tank-previous').onclick=run(async()=>{const previous=readLocalGame(localStorage,'aquarium.three.previous');if(!previous?.session)throw new Error('尚无上一缸');const current=snapshot();await restoreCrystalSnapshot(previous);editing=!data.Tank.Setup.Filled;selected=null;refresh();writeLocalGame(localStorage,'aquarium.three.previous',current);});
 function clearPlacementSelection(keepHover=false){if(tool==='prune-selected'){tool='select';$('setup-tool').value=tool;}movingSelection=false;objectSelection.clear();placement?.reset();if(!keepHover)hover=null;placementWait=null;press=null;selected=null;}
 async function dropHardscape(next,activeId=null,removedId=null){
  if(busy)throw Error('请等待当前操作完成');
  if(activeId){
   const at=next.Tank.Hardscape.findIndex(r=>r.UniqueId===activeId),record=next.Tank.Hardscape[at];
   const release=releasePose(runtime.hardscape(record),record,record.Position,runtime.current,true);
   if(!release.valid)throw Error(release.reason);next.Tank.Hardscape[at]=release.record;
  }
  const controller=new AbortController();falling=controller;clearPlacementSelection();lock(true);
  $('tool-finish').hidden=false;$('tool-finish').disabled=false;$('tool-finish').textContent='取消下落';
  message('正在准备物理碰撞，Esc 可取消');let view,committed=false;
  try{
   view=await animateHardscapeDrop({runtime,flora,aq,records:next.Tank.Hardscape,activeId,removedId,signal:controller.signal,onFrame:frame=>{ctx.invalidateReflection();if(frame.elapsed<.04)message('木石正在下落，落稳后保存；Esc 可取消');}});
   controller.signal.throwIfAborted();
   const changed=[];
   next.Tank.Hardscape=view.records.map(r=>{
    const old=data.Tank.Hardscape.find(o=>o.UniqueId===r.UniqueId);
    if(old&&['Position','Rotation'].every(key=>['x','y','z'].every(axis=>Math.abs(old[key][axis]-r[key][axis])<1e-6)))return structuredClone(old);
    changed.push(r.UniqueId);return r;
   });
   falling=null;lock(false);message('木石已落稳，正在检查碰撞和虾的落脚位置');
   await transact(next,{placementIds:changed});committed=true;
   message('木石已落稳，可以继续放置或撤销');return true;
  }catch(e){if(e.name==='AbortError'){message('已取消下落，原造景保留');return false;}throw e;}
  finally{view?.dispose(committed);falling=null;clearPlacementSelection();lock(false);refresh();ctx.invalidateReflection();}
 }
 function finishTool(){
  if(falling){falling.abort();return;}
  if(busy||filling>0){message('正在完成当前操作，请稍后取消');return;}
  if(tool==='prune-selected'){
   tool='select';$('setup-tool').value=tool;placement.reset();hover=null;placementWait=null;press=null;refresh();
   $('object-prune').focus({preventScroll:true});message('已结束修剪，仍选中'+selectionName());return;
  }
  if(movingSelection){movingSelection=false;placement.reset();hover=null;placementWait=null;press=null;refresh();message('已取消移动，原物体保留；可选择其他操作');return;}
  cancelStroke();clearPlacementSelection();tool='select';$('setup-tool').value=tool;controls.enabled=true;refresh();
  message('已结束当前操作，可选择物体；开缸步骤不变');
 }
 $('plant-kind').onchange=$('stone-kind').onchange=()=>{clearPlacementSelection();refresh();};
 $('setup-tool').onchange=run(async()=>{await ensure();tool=$('setup-tool').value;clearPlacementSelection();message(({pour:'按住底床倒土',return:'按住底床回收土',push:'按住底床拖动推土',pull:'按住底床拖动拉土',finish:'按住底床细整',level:'按住底床整平',stone:'点击底床摆放所选木石',plant:'移动鼠标查看水草预览，绿色时点击种植',prune:'点击植株要剪的位置',select:'单击只选中；点击「移动」才开始搬动，Esc 取消选择'})[tool]);});
 $('soil-kind').onchange=()=>{const previous=data.Tank.Substrate.IncomingKind;try{const kind=parseSoilKind($('soil-kind').value);data.Tank.Substrate.IncomingKind=kind;if(runtime.current)runtime.current.soil.incoming=kind;if(!save())throw new Error('保存失败，土壤类型已还原');}catch(e){data.Tank.Substrate.IncomingKind=previous;if(runtime.current)runtime.current.soil.incoming=previous;refresh();message(e.message);}};
 async function transform(kind,amount){if(!selected)throw new Error('请先选中植物或木石');const next=structuredClone(data),r=selectedRecord(next),actions=objectEditActions(next.Tank,selected);if(!actions[kind==='burial'?'burial':kind==='y'?'rotate':'tilt'])throw new Error('这个对象不支持这项调整');if(r.Species){if(kind==='y')r.Yaw=floraYaw(r.Yaw+amount*Math.PI/180);else throw new Error('这株水草用左右转调整朝向');await transact(next);return;}if(kind==='burial')r.Burial=T.MathUtils.clamp((r.Burial??.003)+amount,0,.02);else r.Rotation[kind]+=amount;if(next.Tank.Hardscape.includes(r))await dropHardscape(next,r.UniqueId);else await transact(next);}
 $('object-left').onclick=run(()=>transform('y',-10));$('object-right').onclick=run(()=>transform('y',10));$('object-tilt-left').onclick=run(()=>transform('z',-7));$('object-tilt-right').onclick=run(()=>transform('z',7));$('object-up').onclick=run(()=>transform('burial',-.004));$('object-down').onclick=run(()=>transform('burial',.004));
 $('object-delete').onclick=run(async()=>{if(!selected)throw new Error('请先选中一个对象');const attached=(data.Tank.Flora||[]).filter(r=>r.Host===selected).length;if(!confirm(attached?`移除这件木石及附着的 ${attached} 株水草？都可以用撤销恢复。`:'移除这一件？可以用撤销放回去。'))return;const next=structuredClone(data),wood=next.Tank.Hardscape.some(r=>r.UniqueId===selected);next.Tank.Plants=next.Tank.Plants.filter(r=>r.UniqueId!==selected);next.Tank.Hardscape=next.Tank.Hardscape.filter(r=>r.UniqueId!==selected);next.Tank.Flora=(next.Tank.Flora||[]).filter(r=>r.UniqueId!==selected&&r.Host!==selected);if(wood)await dropHardscape(next,null,selected);else await transact(next);selected=null;});
 $('plant-care-tidy').onclick=run(async()=>{
  crystalIdle();
  if(!data.Tank.Setup.Filled||falling)return;
  const next=structuredClone(data);
  const changed=tidyPlants(next,plant=>{
    const node=(runtime.current?.entities??runtime.originals).get(plant.UniqueId);
    return node ? new T.Box3().setFromObject(node).max.y-plant.Position.y : 0;
  });
  if(!changed.size){message('水草长势正好，这次不用剪');return;}
  await transact(next);trimHistory.set(history.at(-1),changed);
  message('已轻剪 '+changed.size+' 株水草，可撤销这次打理');
 });
 $('plant-care-undo').onclick=()=>{if(trimHistory.has(history.at(-1)))$('setup-undo').click();};
 $('setup-undo').onclick=run(async()=>{if(!history.length)return;const previous=history.at(-1),current=structuredClone(data);await transact(historyLayout(previous),{recordHistory:false});clearPlacementSelection(true);history.pop();if(trimHistory.has(previous))trimHistory.set(current,trimHistory.get(previous));future.push(current);message('已撤销最近一次操作');});$('setup-redo').onclick=run(async()=>{if(!future.length)return;const next=future.at(-1),current=structuredClone(data);await transact(historyLayout(next),{recordHistory:false});clearPlacementSelection(true);future.pop();if(trimHistory.has(next))trimHistory.set(current,trimHistory.get(next));history.push(current);message('已重做刚撤销的操作');});
 async function goToBuildStep(step){if(busy||filling>0||data.Tank.Setup.Filled||!Number.isInteger(step)||step<0||step>=data.Tank.Setup.PreparationStep)return;cancelStroke();clearPlacementSelection();const next=structuredClone(data);next.Tank.Setup.PreparationStep=step;await transact(next);}
 $('setup-back').onclick=run(()=>goToBuildStep(data.Tank.Setup.PreparationStep-1));
 $('setup-next').onclick=run(async()=>{const next=structuredClone(data),s=next.Tank.Setup;if(s.Filled){clearPlacementSelection();editing=false;refresh();window.showDock?.('');message('已完成编辑，回到观赏');return;}const requirement=buildRequirement(next.Tank,runtime.current?.soil||runtime.sourceSoil);if(requirement)throw new Error(requirement);s.PreparationStep++;s.HardscapePlaced=next.Tank.Hardscape.length>0;s.PlantPlaced=next.Tank.Plants.length>0;if(s.PreparationStep===3){s.Filled=true;next.Tank.Environment.WaterLevel=.92;}await transact(next,{newTank:s.Filled});if(s.Filled){editing=false;filling=4;if(water)water.scale.y=.055/.58;}refresh();});
 $('follow-shrimp').onclick=()=>{
  if(tourRemaining!==null){setFollow(followedAnimal()?.id);return;}
  if(!follow&&!ctx.selected()){message('先点击一只虾，再跟随');return;}
  setFollow(follow?null:ctx.selected().id);
 };
 $('shrimp-fav').onclick=()=>{if(data.Breeding){const r=data.Breeding.individuals.find(r=>r.id===ctx.selected()?.id);if(r)crystalAction({type:'protect',id:r.id,value:!r.protected}).catch(e=>message(e.message));return;}const record=rememberShrimp().shrimp[ctx.selected()?.id];if(!record){message('先点击一只虾');return;}record.favorite=!record.favorite;save();paintCare();message(record.favorite?`已把 ${record.name} 标成收藏`:`已取消收藏 ${record.name}`);};
 $('shrimp-name').addEventListener('change',()=>{if(data.Breeding){crystalAction({type:'rename',id:ctx.selected()?.id,name:$('shrimp-name').value}).catch(e=>{message(e.message);paintCare();});return;}const id=ctx.selected()?.id,record=id&&rememberShrimp().shrimp[id];if(!record)return;try{record.name=parseShrimpName($('shrimp-name').value);save();paintCare();message(`已经改名为 ${record.name}`);}catch(e){$('shrimp-name').value=record.name;message(e.message);}});
 $('shrimp-follow').onclick=()=>{const id=ctx.selected()?.id;if(!id||!ctx.focusShrimp(id)){message('先点击一只虾');return;}setFollow(id);};
 $('care-chip').addEventListener('click',()=>{
  if($('care-pop').hidden)return;
  paintCare();
  const needs=$('care-needs');
  needs.open=!needs.hidden&&$('care-individuals').childElementCount<=3;
  (needs.hidden?$('favorites').querySelector('button')||$('show-stars'):needs.firstElementChild).focus({preventScroll:true});
 });
 $('care-pop').addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  event.preventDefault();event.stopPropagation();$('care-chip').click();
  (data.Breeding?$('crystal-care'):$('care-chip'))?.focus();
 });
 $('care-individuals').onclick=$('favorites').onclick=async event=>{
  const id=event.target.closest('button')?.dataset.id;if(!id||busy||crystalWorking||editing||filling>0)return;
  try{
   const follow=event.currentTarget===$('favorites');
   if(!await locateShrimp(id)){message('这只虾目前不在缸中');return;}
   if(follow)setFollow(id);
   if(!$('care-pop').hidden)$('care-chip').click();
   const inspect=$('crystal-inspect');if(inspect&&!inspect.hidden)inspect.focus();else $('shrimp-follow').focus();
  }catch(error){message(error.message);}
 };
 $('show-stars').onclick=()=>{showStars=!showStars;$('show-stars').setAttribute('aria-pressed',String(showStars));$('show-stars').textContent=showStars?'隐藏收藏星标':'显示收藏星标';message(showStars?'收藏的星标会一直留在缸里':'星标只在指向或选中时出现');};$('quiet-watch').onclick=e=>{document.body.classList.contains('quiet')?exitQuiet():enterQuiet(false,e.currentTarget);};$('quiet-long').onclick=e=>enterQuiet(true,e.currentTarget);$('quiet-exit').onclick=exitQuiet;$('panel-toggle').onclick=()=>{const collapsed=document.body.classList.toggle('panel-collapsed');$('panel-toggle').textContent=collapsed?'打开面板':'收起';$('panel-toggle').setAttribute('aria-expanded',String(!collapsed));message(collapsed?'操作栏已收起':'操作栏已打开');};
 let top=false;$('top-view').onclick=()=>{top=!top;if(top){camera.position.set(0,1.35,.001);controls.target.set(0,.12,0);controls.update();}else ctx.reset();};$('tank-light').onclick=()=>{data.Tank.Environment.LightOn=!data.Tank.Environment.LightOn;refresh();if(!save()){data.Tank.Environment.LightOn=!data.Tank.Environment.LightOn;refresh();}ctx.invalidateReflection();};
 function cancelStroke(){if(!stroke)return;const before=stroke.before;stroke=null;runtime.current.soil=new Substrate(runtime.settings,before.Tank.Substrate);runtime.current.soilView.soil=runtime.current.soil;runtime.current.soilView.refresh();controls.enabled=true;press=null;}
 canvas.addEventListener('pointercancel',cancelStroke);canvas.addEventListener('lostpointercapture',cancelStroke);window.addEventListener('blur',cancelStroke);
 const ray=new T.Raycaster(),pointer=new T.Vector2(),groundPlane=new T.Plane(new T.Vector3(0,1,0),0);let press=null;
 function pick(e){pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);ray.setFromCamera(pointer,camera);if(tool==='stone'&&runtime.current){const origin=ray.ray.origin.clone(),direction=ray.ray.direction.clone();origin.z*=-1;direction.z*=-1;const surface=runtime.current.habitat.cast(origin,direction,20,true);if(surface)return {hit:null,point:surface.point.clone()};const point=ray.ray.intersectPlane(groundPlane,new T.Vector3());if(point)point.z*=-1;return {hit:null,point};}const hit=runtime.current?(soilTools.has(tool)?ray.intersectObject(runtime.current.soilView.ground,false)[0]:ray.intersectObjects(['prune','prune-selected','plant','select'].includes(tool)?[runtime.current.group,flora.root]:[runtime.current.group],true).find(h=>{if(tool!=='select'||!selected||!movingSelection)return true;const owner=flora.owner(h)?.id;return h.object.userData.entity!==selected&&owner!==selected&&(!owner||!data.Tank.Flora?.some(r=>r.UniqueId===owner&&r.Host===selected));})):null;let point=hit?.point.clone()||ray.ray.intersectPlane(groundPlane,new T.Vector3());if(point)point.z*=-1;return {hit,point};}
  let plantDraftId=newId();
 function plantAt(point,hit){
  const kind=parsePlantKind($('plant-kind').value);
  if(kind.species){if(floraList(data).length>=200)throw Error('每缸最多 200 株程序化水草');return attachFlora(data,kind,point,hit,null,plantDraftId);}
  if(data.Tank.Plants.length>=120)throw Error('每缸最多 120 株水草');
  const definition=runtime.definitions[kind.unity],position=checkPlant(data,definition.TypeId,point);
  return {UniqueId:plantDraftId,TypeId:definition.TypeId,Position:position,Rotation:{x:0,y:data.Tank.Plants.length*137.508%360,z:0},Scale:structuredClone(runtime.catalogSettings.Plants[kind.unity].PlantingScale),Growth:0,EcologicalAgeSeconds:0,Health:1,Stage:0,UseContinuousVisualGrowth:true,LastUpdatedSimulationSeconds:data.SimulationSeconds,Cuts:[]};
 }
 function movePlantAt(point,hit){
  const record=structuredClone(selectedRecord(data));if(!record)throw Error('要移动的水草已经不在了');
  if(record.Species){const pose=attachFlora(data,{species:record.Species,variant:record.Variant},point,hit,record.UniqueId,record.UniqueId);if(pose.Host){record.Host=pose.Host;record.Local=pose.Local;record.Normal=pose.Normal;if(pose.Upright!==undefined)record.Upright=pose.Upright;}else {record.X=pose.X;record.Z=pose.Z;}}
  else record.Position=checkPlant(data,record.TypeId,point,record.UniqueId);
  return record;
 }
 function prepareCut(hit,point){
  const owner=flora.owner(hit),list=owner?'Flora':'Plants',id=owner?.id??hit?.object.userData.entity;
  if(tool==='prune-selected'&&id!==selected)throw Error('当前只修剪'+selectionName()+'，请对准这株水草');
  const index=id?data.Tank[list]?.findIndex(p=>p.UniqueId===id):-1;
  if(index==null||index<0)throw Error('请对准要修剪的水草');
  const record={...data.Tank[list][index]},name=plantRecordLabel(record,runtime.definitions);
  let hint;
  if(owner){
   pruneFlora(record,owner.node,data.SimulationSeconds);
   hint=SPECIES[record.Species].kind==='stem'?`剪后留 ${record.Nodes} 节`:'剪短后会重新生长';
  }else{
   if(record.Cuts.length>=100)throw Error(name+'已达到修剪上限，请等它恢复');
   const height=point.y-record.Position.y;
   if(height<=.002)throw Error(name+' · 请对准根部以上的位置');
   const node=runtime.current.entities.get(id),local=node.worldToLocal(hit.point.clone());
   const full=new T.Box3().setFromObject(node).max.y-record.Position.y;
   record.Cuts=[...record.Cuts,{LocalCenter:{x:local.x,y:local.y,z:local.z},HeightFraction:T.MathUtils.clamp(height/full,0,1),HeightMeters:height,RadiusMeters:.028,EcologicalAgeAtCut:record.EcologicalAgeSeconds}];
   hint=`局部剪口距根部 ${(height*100).toFixed(1)} 厘米`;
  }
  return {list,index,record,name,hint:name+' · '+hint};
 }
 placement=createPlacementPreview(aq,runtime,{flora,plantAt,movePlantAt,prepareCut});let hover=null,placementWait=null;
 let pruneHover=null;
 controls.addEventListener('change',()=>{pruneHover=null;});
 window.addEventListener('resize',()=>{pruneHover=null;});
 if(!wallpaperMode)document.addEventListener('pointermove',e=>{hover=e.target===canvas?e:null;if(!hover)placement.hide();});
 canvas.addEventListener('pointerleave',()=>{hover=null;placement.hide();});
 canvas.addEventListener('pointerup',e=>{hover=e;});
 let rightPress=null;
 canvas.addEventListener('pointerdown',e=>{
  const cancellable=aim || (editing||!data.Tank.Setup.Filled)&&(tool==='stone'||tool==='plant'||tool==='prune-selected'||tool==='select'&&selected);
  rightPress=e.button===2&&!busy&&cancellable?{id:e.pointerId,x:e.clientX,y:e.clientY,aim}:null;
 },true);
 canvas.addEventListener('pointermove',e=>{
  if(rightPress&&e.pointerId===rightPress.id&&Math.hypot(e.clientX-rightPress.x,e.clientY-rightPress.y)>5)rightPress=null;
 },true);
 canvas.addEventListener('pointerup',e=>{
  const start=rightPress;rightPress=null;
  if(e.button===2&&start?.id===e.pointerId&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<=5){e.preventDefault();if(start.aim){if(aim===start.aim)cancelAim();}else finishTool();}
 },true);
 for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{rightPress=null;});
 window.addEventListener('blur',()=>{rightPress=null;});
 if(!wallpaperMode)window.addEventListener('blur',()=>{hover=null;placement.hide();});
 function updatePlacement(force=false,event=hover){
  if(!event||busy||tool==='select'&&!movingSelection||(!editing&&data.Tank.Setup.Filled)||filling>0||(event.buttons&6)||document.hidden){pruneHover=null;placement.hide();return null;}
  if(tool==='prune'||tool==='prune-selected'){
   if(!force&&pruneHover?.event===event&&pruneHover.scene===runtime.current)return null;
   pruneHover={event,scene:runtime.current};
  }else pruneHover=null;
  const {point,hit}=pick(event);if(placementWait&&point&&Math.hypot(point.x-placementWait.x,point.z-placementWait.z)<.001){placement.hide();return null;}placementWait=null;
  const moving=tool==='select'?selectedRecord(data):null,stone=moving&&data.Tank.Hardscape.includes(moving);
  return placement.update({point,hit,plantKey:$('plant-kind').value,tool:moving?(stone?'move-stone':'move-plant'):tool==='prune-selected'?'prune':tool,moving,key:stone?moving.TypeId:$('stone-kind').value,heavy:$('soil-heavy').checked,screen:event,force});
 }
 function soilStep(dt,e){if(!stroke)return;const {point}=pick(e);if(!point)return;const soil=runtime.current.soil;if(!insideSoil(soil,point))return;soil.incoming=parseSoilKind($('soil-kind').value);if(tool==='pour'||tool==='return')soil.dose(point,dt,tool==='return');else if(tool==='push'||tool==='pull')soil.stroke(stroke.previous,point,{heavy:$('soil-heavy').checked,pull:tool==='pull'});else if(tool==='level')soil.level(point,dt);else soil.relax(dt,point,true);stroke.previous=point;runtime.current.soilView.refresh();}
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0){press=null;return;}press={x:e.clientX,y:e.clientY,id:e.pointerId};if(!editing&&!(!data.Tank.Setup.Filled)||busy||!['pour','return','push','pull','finish','level'].includes(tool))return;const {point}=pick(e);if(!insideSoil(runtime.current.soil,point))return;e.stopImmediatePropagation();e.preventDefault();substrateMask(runtime.current.soil,runtime.current.habitat);stroke={pointerId:e.pointerId,before:structuredClone(data),previous:point,event:e,last:performance.now()};controls.enabled=false;canvas.setPointerCapture(e.pointerId);},true);
 canvas.addEventListener('pointermove',e=>{if(stroke&&e.pointerId===stroke.pointerId){stroke.event=e;e.preventDefault();}},true);
 function aimedPoint(e,kind){pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);ray.setFromCamera(pointer,camera);const origin=ray.ray.origin.clone(),direction=ray.ray.direction.clone();origin.z*=-1;direction.z*=-1;if(direction.lengthSq()<1e-10)return null;direction.normalize();const hit=ctx.world().habitat.cast(origin,direction,4),shell=tankEntry(origin,direction),shellPoint=shell?new T.Vector3(shell.x,shell.y,shell.z):null;return kind==='tap'?shellPoint||hit?.point||null:hit?.point||shellPoint;}
 canvas.addEventListener('pointerup',e=>{if(e.button!==0)return;if(stroke){e.stopImmediatePropagation();const before=stroke.before;stroke=null;controls.enabled=true;const next=structuredClone(data);next.Tank.Substrate={...next.Tank.Substrate,...runtime.current.soil.snapshot()};for(const p of next.Tank.Plants)p.Position.y=runtime.current.soil.sample(p.Position.x,p.Position.z);run(async()=>{try{await transact(next,{seat:true});}catch(err){runtime.current.soil=new Substrate(runtime.settings,before.Tank.Substrate);runtime.current.soilView.soil=runtime.current.soil;runtime.current.soilView.refresh();throw err;}})();return;}
  if(aim&&!busy&&!editing&&data.Tank.Setup.Filled&&press&&press.id===e.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)<=12){e.aquariumAimed=true;const kind=aim,point=aimedPoint(e,kind);if(!point){aim=null;syncAim();message('没有点中鱼缸');return;}if(kind==='feed')feedAt(point);else tapAt(point);return;}
  if((!editing&&data.Tank.Setup.Filled)||busy)return;if(!press||press.id!==e.pointerId||Math.hypot(e.clientX-press.x,e.clientY-press.y)>5)return;const {hit,point}=pick(e);if(!point&&(tool!=='select'||movingSelection))return;run(async()=>{
   if(tool==='prune'||tool==='prune-selected'){
    let cut;
    try{cut=prepareCut(hit,point);}catch(error){message(error.message);return;}
    const next=structuredClone(data);next.Tank[cut.list][cut.index]=cut.record;
    await transact(next);message('已修剪'+cut.name+'，可以撤销');return;
   }
   const next=structuredClone(data),id=hit?.object.userData.entity;
   if(tool==='plant'){const preview=updatePlacement(true,e);if(!preview?.valid){message(preview?.reason||'请等待水草预览');return;}const record=structuredClone(preview.record);if(record.Species)floraList(next).push(record);else next.Tank.Plants.push(record);await transact(next);selected=null;plantDraftId=newId();placement.reset();placementWait=point.clone();message('水草已按预览位置种植');}
   else if(tool==='stone'){const preview=updatePlacement(true,e);if(!preview?.valid){message(preview?.reason||'请等待木石预览，确认落点后再放置');return;}const record={...structuredClone(preview.record),UniqueId:newId()};next.Tank.Hardscape.push(record);await dropHardscape(next,record.UniqueId);}
   else if(tool==='select'&&selected&&movingSelection){
    const preview=updatePlacement(true,e);if(!preview?.valid){message(preview?.reason||'请等待移动预览，绿色时点击确认');return;}
    const movingId=selected;
    if(preview.drop){next.Tank.Hardscape[next.Tank.Hardscape.findIndex(r=>r.UniqueId===movingId)]=structuredClone(preview.record);await dropHardscape(next,movingId);return;}
    if(preview.records)next.Tank.Hardscape=structuredClone(preview.records);
    else {const list=preview.record.Species?floraList(next):next.Tank.Plants;const at=list.findIndex(r=>r.UniqueId===movingId);if(at<0)throw Error('要移动的对象已经不在了');list[at]=structuredClone(preview.record);}
    await transact(next,preview.records?{placementId:movingId}:{});clearPlacementSelection();message('已按预览位置移动，可点击选择下一个对象');
   }
   else if(tool==='select'){
    clearPlacementSelection();selected=flora.owner(hit)?.id||id||null;
    const record=selectedRecord(data);
    if(record){
     if(data.Tank.Hardscape.includes(record))placement.prepareStone(record.TypeId,record);
     if(data.Tank.Setup.Filled){if(document.body.classList.contains('panel-collapsed'))$('panel-toggle').click();if($('dock-popover').hidden||$('col-scene').hidden)window.showDock?.('scene');}
     message(`已选 ${selectionName()}；点击「移动」才开始搬动，也可直接点选其他物体`);
    }else{selected=null;message('已取消选择');}
   }
  })();},true);
 window.addEventListener('keydown',e=>{
  if(e.isComposing||e.target.isContentEditable||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  const key=e.key.toLowerCase(),plain=!e.ctrlKey&&!e.metaKey&&!e.altKey;
  if(plain&&!e.repeat&&key==='h'){document.body.classList.contains('quiet')?exitQuiet():enterQuiet();}
  if(plain&&!e.repeat&&key==='v')$('top-view').click();
  if(plain&&!e.repeat&&e.key==='Escape'){
   if(falling){falling.abort();e.preventDefault();return;}
   if(busy||filling>0){message('正在完成当前操作，请稍后取消');return;}
   if(editing)finishTool();else{cancelStroke();clearPlacementSelection();}
   controls.enabled=true;if(aim)cancelAim();
   if(document.body.classList.contains('quiet'))exitQuiet();
  }
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&editing&&['z','y'].includes(key)){e.preventDefault();if(!e.repeat&&!stroke)$(key==='y'||e.shiftKey?'setup-redo':'setup-undo').click();}
 });
 const growthDue=createGrowthDueCheck();
 function resumeForeground(){
  if(hiddenAt===null || document.hidden || busy || crystalWorking || spawning || stroke || filling>0)return;
  const at=hiddenAt, now=Date.now();
  hiddenAt=null;
  if(ctx.saveBlocked() || recoveryRequired || localStorage.gameSaveStale)return;
  const since=data.Tank.Setup.Filled && now-at>=30000 ? new Date(at).toISOString() : null;
  if(data.Breeding){
   if(since || growthDue(data.Breeding,now)){
    crystalAction({type:'advance'},since).catch(e=>message('回缸结算未写入：'+e.message));
   }
   return;
  }
  if(!since)return;
  const next=structuredClone(data),real=offlineSeconds(since,now,runtime.config),seconds=ecologySeconds(real);
  advanceEcology(next,runtime.definitions,seconds);
  const cover=richness(next);
  const game=advanceCreatureEcology(snapshot(),seconds,ctx.seed().profile,ctx.world().anchors,(now-at)/1000,cover);
  const bred=colonyTick(next.Colony?.shrimp?next.Colony:emptyColony(),ctx.world().agents,seconds,next.SimulationSeconds,{richness:cover});
  next.Colony=bred.colony;
  transact(next,{game,recordHistory:false}).then(()=>{pendingBirths+=bred.hatches;}).catch(e=>message('离线结算未写入：'+e.message));
 }
 if(!wallpaperMode)document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
   hiddenAt??=Date.now();
   cancelStroke();
   if(!busy && !crystalWorking && !localStorage.gameSaveStale)save();
  }else resumeForeground();
 });

 if(!catalogBootError)try{
  const current=stored?.session?structuredClone(stored):snapshot();
  const migrated=newSample ? stockSample(current.session,current) : await prepareUnified(current,{useSaved:true});
  const base=migrated?.session||data,game=migrated?.game||current;
  const projected=projectCrystalAction(base,game);
  projected.arrivals=[...new Set([...projected.arrivals,...(migrated?.arrivals||[])])];
  if(base.Tank.Setup.Filled)settleCrystalOffline(projected);
  await transact(projected.session,{game:projected.game,arrivals:projected.arrivals,hatchSites:projected.hatchSites,recordHistory:false,restoring:true,newTank:newSample});

  if(migrated && stored)message('旧版鱼缸已接入虾册，原进度已备份。',5500);
 }catch(e){if(wallpaperMode)throw e;ctx.blockSave();message('兼容未完成，原进度已保留，自动保存已停止：'+e.message);}
 if(!data.Colony?.shrimp)data.Colony=emptyColony();rememberShrimp();
 if(data.Tank.Flora==null)data.Tank.Flora=[];
 flora.sync(data,runtime);
if(!wallpaperMode)crystalPanel=createCrystalPanel({captureTankPhoto:ctx.captureTankPhoto,aq,getState:()=>data.Breeding||null,getPairingKey:()=>wallpaperRoomKey(data,'main'),getActiveTank:()=>data.BreedingRooms?.activeId,isFilled:id=>(id===data.BreedingRooms?.activeId?data:data.BreedingRooms?.rooms.find(r=>r.id===id)?.session)?.Tank.Setup.Filled===true,getSelected:()=>ctx.selected()?.id,getMeal:inspectMeal,onReadMeal:feedingFeedback.showHistory,getActivity:id=>activityNames[ctx.world().agentsById.get(id)?.data.ExecutionState],onSelect:id=>ctx.markShrimp(id),onSurvey:()=>{setFollow(null);ctx.reset();},onAction:crystalAction,onReadGrowth:readGrowth,onSwitch:switchCrystalRoom,onStart:startCrystal,onFocus:locateShrimp,onQuiet:watchQuietly,onFeedNearby:feedNearShrimp,onTankError:message});
 if(data.BreedingRooms?.unreadGrowth?.length)crystalPanel?.showGrowth(data.BreedingRooms.unreadGrowth);
 refresh();paintCare();
 if(firstOpening&&!ctx.saveBlocked()&&!recoveryRequired){
  const welcome=$('welcome'), adopt=$('welcome-dismiss'), empty=$('welcome-empty');
  const dismiss=()=>{welcome.hidden=true;try{localStorage.setItem(welcomeKey,'1');}catch{}};
  welcome.hidden=false;adopt.onclick=dismiss;
  empty.onclick=run(async()=>{
   adopt.disabled=empty.disabled=true;
   try{if(await newTank(false,true))dismiss();}finally{adopt.disabled=empty.disabled=false;}
  });
 }
 return {runtime,flora,get data(){return data;},get editing(){return editing;},get aiming(){return !!aim;},get busy(){return busy||filling>0;},get recoveryRequired(){return recoveryRequired;},get showStars(){return showStars;},get followedId(){return followedAnimal()?.id??null;},get touringFavorites(){return tourRemaining!==null && !!data.Colony?.shrimp?.[follow]?.favorite;},setFollow,syncQuietClock,snapshot,save,transact,ensure,importUnity,crystalAction,switchCrystalRoom,startCrystal,exitCrystal,resumeCrystal,feedAt,tapAt,armFeed:()=>arm('feed'),armTap:()=>arm('tap'),
  openBrood(batch){
   if(document.body.classList.contains('quiet'))exitQuiet();
   else if($('wallpaper-framing').open)$('wallpaper-framing').close();
   crystalPanel?.showBrood(batch);
  },
  renderFeeding(mesh,paused){feedingFeedback.render(mesh,!busy&&!editing&&filling<=0&&data.Tank.Setup.Filled&&!document.body.classList.contains('quiet'),paused);},
  restore(value,options){return restoreCrystalSnapshot(value,options);},
  update(dt,now,realDt=dt){
   if(hiddenAt!==null)resumeForeground();
   if(filling>0){filling=Math.max(0,filling-realDt);if(water)water.scale.y=.055/.58+(1-.055/.58)*T.MathUtils.smoothstep(4-filling,0,4);ctx.waterLevel(water?.scale.y*.58);if(filling===0){refresh();message('开缸完成，已进入观察模式；可从「造景」继续编辑');}}if(!wallpaperMode){objectSelection.update();updatePlacement();}if(stroke){const elapsed=Math.min(.05,(performance.now()-stroke.last)/1000);stroke.last=performance.now();soilStep(elapsed,stroke.event);}if(quietUntil&&performance.now()>quietUntil)exitQuiet();tickTour(realDt);if(follow){const target=followedAnimal();if(!target)setFollow(null);else{const pos=target.rig.getWorldPosition(new T.Vector3()),agent=ctx.world().agentsById.get(target.id),escaping=agent?.swim?.kind==='EscapeSwim';if(escaping&&!wasEscaping)escapeLag=.33;wasEscaping=escaping;escapeLag=Math.max(0,escapeLag-realDt);if(!escapeLag){const shift=pos.clone().sub(controls.target).multiplyScalar(1-Math.exp(-realDt/.6));shift.clampLength(0,.12*realDt);camera.position.add(shift);controls.target.add(shift);}const visible=eye=>{const origin=eye.clone(),end=pos.clone();origin.z*=-1;end.z*=-1;const line=end.sub(origin);return !ctx.world().habitat.cast(origin,line.clone().normalize(),Math.max(0,line.length()-.008));};occluded=visible(camera.position)?0:occluded+realDt;if(occluded>1.6&&now>nextAvoidance){nextAvoidance=now+2;for(const degrees of [-5,5,-9,9]){const candidate=camera.position.clone().sub(controls.target).applyAxisAngle(new T.Vector3(0,1,0),degrees*Math.PI/180).add(controls.target);if(visible(candidate)){camera.position.copy(candidate);break;}}}}}
   if(data.Tank.Setup.Filled)ctx.world().biofilm=richness();
   const stale=localStorage.gameSaveStale;
   if(!stale&&dt>0&&!editing&&!busy&&filling<=0&&data.Tank.Setup.Filled){
    eco+=ecologySeconds(realDt);
    if(eco>=1){
     const seconds=Math.min(eco,86400);eco-=seconds;
     const shapeChanged=advanceEcology(data,runtime.definitions,seconds);
     navigationDirty ||= shapeChanged;
     if(!data.Breeding){const bred=colonyTick(rememberShrimp(),ctx.world().agents,seconds,data.SimulationSeconds,{richness:richness()});data.Colony=bred.colony;pendingBirths+=bred.hatches;}
     if(navigationDirty)transact(structuredClone(data),{recordHistory:false}).catch(e=>message('植物更新等待安全落脚位置：'+e.message));
     else runtime.rescalePlants(data.Tank.Plants);
     if(!wallpaperMode){const stageText=`${names[data.Tank.Setup.PreparationStep]} · 生态第 ${Math.floor(data.SimulationSeconds/86400)+1} 天`;$('setup-stage').textContent=stageText;if($('setup-chip'))$('setup-chip').textContent=stageText;}
    }
   }
   if(!stale&&!data.Breeding&&pendingBirths&&!spawning&&!busy&&!editing&&filling<=0){const add=pendingBirths;pendingBirths=0;const before=ctx.world().agents.length,count=Math.min(50,before+add);if(count>before){spawning=true;ctx.population(count,{newborn:true}).then(()=>{spawning=false;const colony=rememberShrimp(),arrived=ctx.world().agents.slice(before);message(`幼虾出生 ${arrived.length} 只，要过好几周才长成`);save();paintCare();refresh();}).catch(e=>{spawning=false;pendingBirths+=add;message(e.message);});}}
   crystalClock+=realDt;
   if(crystalClock>=1){
    crystalClock=0;
    if(!stale&&data.Breeding&&!crystalWorking&&!busy&&!stroke&&filling<=0){
     const now=Date.now(),p=data.Breeding;
     if(growthDue(p,now))crystalAction({type:'advance'}).catch(e=>message('成长暂未保存，将重试：'+e.message));
     else {
      // Between milestones, persist the time already observed when the tank is next saved.
      p.now=Math.max(p.now,now);
      if(wallpaperMode)updateCrystalResidentClocks(p,data.Colony,p.now,data.SimulationSeconds);
     }
    }
   }
   careClock+=realDt;if(careClock>=.5){careClock=0;paintCare();}
  }
 };
}

