import * as T from 'three';
import {loadAquarium} from './assets.js';
import {stableSeed} from './state.js';
import {Substrate} from './substrate.js';
import {SoilView} from './soil-view.js';
import {plantHeight} from './ecology.js';
import {pruneGeometry} from './pruning.js';
import {createHabitat,reconnectGraph,vec,nearest} from './habitat.js';
import {CreatureWorld} from './creatures.js';
import {floraCollisionItems} from './flora-view.js';
import {populationRecords} from './population.js';
import {validateSession} from './session.js';
const identity=new T.Matrix4(),mirror=new T.Matrix4().makeScale(1,1,-1);
const disposeSurface=s=>{s.geo.dispose();if(s.ownedSource)s.source.dispose();};
export const rotation=r=>new T.Quaternion().setFromEuler(new T.Euler(...['x','y','z'].map(k=>T.MathUtils.degToRad(r[k])),'YXZ'));
const copyTransform=(o,r)=>{o.position.copy(vec(r.Position));o.quaternion.copy(rotation(r.Rotation));o.scale.copy(vec(r.Scale));};
export const isMissingLegacyHardscape=(runtime,r)=>runtime.entries.get(r.TypeId)?.legacy&&!runtime.originals.has(r.UniqueId)&&['R04','R06'].includes(r.TypeId);
export function needsCatalogMeshes(runtime, save) {
  for (const r of save.Tank.Hardscape || []) {
    if (isMissingLegacyHardscape(runtime,r)) continue;
    if (!runtime.originals.has(r.UniqueId)) return true;
  }
  for (const r of save.Tank.Plants || []) {
    const before = runtime.originalRecords.get(r.UniqueId);
    if (!before || r.Stage !== before.Stage || r.Growth !== before.Growth || JSON.stringify(r.Cuts) !== JSON.stringify(before.Cuts)) return true;
  }
  return false;
}

export function needsCatalogFor(runtime, save) {
  if (needsCatalogMeshes(runtime, save)) return true;
  for (const r of save?.Tank?.Flora || []) {
    if (r.Host && !runtime.originals.has(r.Host)) return true;
  }
  return false;
}

export class TankRuntime {
 static async load(aq,layoutSource,progress){const checked=async r=>{if(!r.ok)throw new Error('资源读取失败 '+r.url);return r;};
  // Catalog meshes/textures stay on disk until a clone actually needs them (new stone, grown/pruned Unity plant).
  const [data,source]=await Promise.all([fetch('/assets/catalog.json').then(checked).then(r=>r.json()),fetch('/assets/setup.json').then(checked).then(r=>r.json())]);
  return new TankRuntime(aq,layoutSource,data,null,source);
 }
 constructor(aq,layoutSource,data,catalog,source){this.aq=aq;this.data=data;this.catalog=catalog;this.source=source;this.definitions=data.definitions.map(JSON.parse);this.config=JSON.parse(data.simulationConfig);this.settings=JSON.parse(data.ground);this.sourceSoil=new Substrate(this.settings,source.Tank.Substrate);this.catalogSettings=JSON.parse(data.catalog);this.entries=new Map(data.entries.map(e=>[e.key,e]));this.originals=new Map();this.originalRecords=new Map();this.originalHidden=[];this._catalogPending=null;
  aq.root.updateMatrixWorld(true);
  for(const p of layoutSource.plants){this.originals.set(p.record.UniqueId,aq.nodes[p.node]);this.originalRecords.set(p.record.UniqueId,p.record);this.originalHidden.push(aq.nodes[p.node]);}
  for(const r of source.Tank.Hardscape){const node=aq.nodes.find(n=>/^[WR]0 /.test(n.name)&&n.name.includes(r.UniqueId));if(node){this.originals.set(r.UniqueId,node);this.originalRecords.set(r.UniqueId,r);this.originalHidden.push(node);}}
  this.originalHidden.push(...aq.nodes.filter(n=>n.name.startsWith('Batched substrate surface')||n.name.startsWith('Deposited substrate')));
 }
 async ensureCatalog(progress=()=>{}){
  if(this.catalog)return this.catalog;
  if(!this._catalogPending){
   this._catalogPending=(async()=>{
    try{
     const checked=async r=>{if(!r.ok)throw new Error('资源读取失败 '+r.url);return r;};
     const buffer=await fetch('/assets/catalog-geometry.bin').then(checked).then(r=>r.arrayBuffer());
     this.catalog=await loadAquarium(progress,{pack:this.data.assets,buffer});
     return this.catalog;
    }catch(e){
     this._catalogPending=null;
     throw Object.assign(new Error(e?.message||'资源下载或解析失败',{cause:e}),{code:'CATALOG_LOAD_FAILED'});
    }
   })();
  }
  return this._catalogPending;
 }
 // Catalog leaf-sway clock. The sample tank uses scene meshes, so this is a no-op until a clone is loaded.
 update(dt,now){this.catalog?.update?.(dt,now);}
 needsCatalogFor(save){return needsCatalogFor(this,save);}
 async readyForSession(save){if(this.needsCatalogFor(save)||(save.BreedingRooms?.rooms||[]).some(r=>this.needsCatalogFor(r.session)))await this.ensureCatalog();return validateSession(save,this);}
 cloneOriginal(record){const original=this.originals.get(record.UniqueId);if(!original)return null;const node=original.clone(true);node.visible=true;const world=mirror.clone().multiply(original.matrixWorld);world.decompose(node.position,node.quaternion,node.scale);
  const before=this.originalRecords.get(record.UniqueId),delta=new T.Matrix4().compose(vec(record.Position),rotation(record.Rotation),vec(record.Scale)).multiply(new T.Matrix4().compose(vec(before.Position),rotation(before.Rotation),vec(before.Scale)).invert());node.applyMatrix4(delta);return node;
 }
 plant(record,soil){const species=this.definitions.findIndex(d=>d.TypeId===record.TypeId),definition=this.definitions[species];if(species<0)throw new Error('未知水草品种');const before=this.originalRecords.get(record.UniqueId),original=this.originals.get(record.UniqueId);let node,formula=0;
  if(original&&record.Stage===before.Stage&&record.Growth===before.Growth&&JSON.stringify(record.Cuts)===JSON.stringify(before.Cuts))node=this.cloneOriginal(record);
  else {const variant=stableSeed(record.UniqueId)%3,key=`plant-${species}-${variant}-${record.Stage}`,entry=this.entries.get(key);if(!entry)throw new Error('植物阶段资产缺失 '+key);if(!this.catalog)throw new Error('水草目录尚未加载');node=this.catalog.nodes[entry.root].clone(true);copyTransform(node,record);const width=species===2?(record.Stage===0?1.85:record.Stage===1?1.2:1):1;
   let height=1;if(record.UseContinuousVisualGrowth){const heights=[0,1,2,3].map(stage=>this.entries.get(`plant-${species}-${variant}-${stage}`).height),desired=plantHeight(record,heights,definition,species);formula=desired/entry.height;height=formula;
    const q=rotation(record.Rotation),up=vec([0,1,0]).applyQuaternion(q).y,right=vec([1,0,0]).applyQuaternion(q).y,forward=vec([0,0,1]).applyQuaternion(q).y,target=desired*record.Scale.y*up;let fit=Infinity;
    if(up>.1)node.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const coef=p.getY(i)*record.Scale.y*up;if(coef>1e-6)fit=Math.min(fit,(target-p.getX(i)*record.Scale.x*width*right-p.getZ(i)*record.Scale.z*width*forward)/coef);}});if(Number.isFinite(fit)&&fit>0)height=fit;
   }else if(species===2)height=record.Stage===0?2.8125:record.Stage===1?1.2:1;
   node.scale.multiply(new T.Vector3(width,height,width));node.position.y-=Math.min(soil.crest(record.Position.x,record.Position.z)*.72,Math.max(0,record.Position.y-soil.MinHeight));
   node.updateMatrixWorld(true);if(record.Cuts.length){const full=new T.Box3().setFromObject(node).max.y-record.Position.y;node.traverse(o=>{if(o.isMesh){const geometry=pruneGeometry(o.geometry,o.matrixWorld,record,definition,full);if(geometry!==o.geometry){o.geometry=geometry;o.userData.ownedGeometry=true;}}});}
  }
  node.name='Plant '+record.UniqueId;node.userData={entity:record.UniqueId,kind:3,...(formula?{plantFormula:formula}:{})};node.traverse(o=>{if(o.isMesh)o.userData={...o.userData,entity:record.UniqueId,kind:3};});return node;
 }
 rescalePlants(plants){if(!this.current)return;for(const record of plants){const node=this.current.entities.get(record.UniqueId);if(!(node?.userData.plantFormula>0))continue;const species=this.definitions.findIndex(d=>d.TypeId===record.TypeId);if(species<0)continue;const variant=stableSeed(record.UniqueId)%3,entry=this.entries.get(`plant-${species}-${variant}-${record.Stage}`);if(!entry?.height)continue;const heights=[0,1,2,3].map(stage=>this.entries.get(`plant-${species}-${variant}-${stage}`)?.height||entry.height),desired=plantHeight(record,heights,this.definitions[species],species),formula=desired/entry.height,prev=node.userData.plantFormula;if(!(formula>0)||Math.abs(formula-prev)<0.002)continue;node.scale.y*=formula/prev;node.userData.plantFormula=formula;}}
 hardscape(record){const entry=this.entries.get(record.TypeId);if(!entry)throw new Error('木石资产缺失 '+record.TypeId);let node=this.cloneOriginal(record);
  if(!node){if(!this.catalog)throw new Error('木石目录尚未加载');node=this.catalog.nodes[entry.root].clone(true);copyTransform(node,record);if(entry.baseKey){const content=new T.Group();for(const child of [...node.children])content.add(child);content.scale.setScalar(entry.fixedScale);node.add(content);}}
  node.name=(entry.wood?'W0 ':'R0 ')+record.UniqueId;node.userData={entity:record.UniqueId,kind:entry.wood?2:1};node.traverse(o=>{if(o.isMesh)o.userData={...o.userData,entity:record.UniqueId,kind:entry.wood?2:1};});return node;
 }
 validateFloraHosts(tank){const hosts=new Map();for(const r of tank.Flora||[]){if(!r.Host)continue;if(!hosts.has(r.Host)){const host=this.hardscape(tank.Hardscape.find(h=>h.UniqueId===r.Host));host.updateMatrixWorld(true);hosts.set(r.Host,{matrix:host.matrixWorld,box:new T.Box3().setFromObject(host)});}const {matrix,box}=hosts.get(r.Host),p=new T.Vector3(...r.Local).applyMatrix4(matrix);if(Math.abs(p.x)>.65||Math.abs(p.z)>.35||p.y<-.1||p.y>.65||box.distanceToPoint(p)>.03)throw new Error('附生水草的附着位置超出木石');}}
 async prepare(save,reuse=null,{navigation=true,mutableSolids=false}={}){if(needsCatalogMeshes(this,save))await this.ensureCatalog();const soil=new Substrate(this.settings,save.Tank.Substrate),group=new T.Group(),entities=new Map(),sameSoil=reuse&&JSON.stringify(save.Tank.Substrate)===JSON.stringify(reuse.save.Tank.Substrate),soilView=new SoilView(this.aq,soil,sameSoil?reuse.soilView:null,this.sourceSoil);group.add(soilView.root);
  let habitat,floraItems=[];
  try{for(const record of save.Tank.Hardscape){if(isMissingLegacyHardscape(this,record))continue;const node=this.hardscape(record);entities.set(record.UniqueId,node);group.add(node);}
   for(const record of save.Tank.Plants){const node=this.plant(record,soil);entities.set(record.UniqueId,node);group.add(node);}group.updateMatrixWorld(true);
   const surfaces=[{node:'ground',owner:'Aquarium living substrate',kind:0,solid:false,geometry:soilView.ground.geometry,transform:identity.clone()}];
   for(const [id,node]of entities)node.traverse(o=>{if(o.isMesh&&o.geometry.index?.count)surfaces.push({node:id+'/'+o.name+'/'+surfaces.filter(s=>s.owner===node.name).length,owner:node.name,kind:node.userData.kind,solid:node.userData.kind!==3,rebuild:mutableSolids&&node.userData.kind!==3,geometry:o.geometry,material:o.material[0].userData.source,transform:o.matrixWorld.clone()});});
   habitat=await createHabitat(null,null,()=>{},reuse?.habitat,surfaces);
   const baseHabitat=habitat;
   if(save.Tank.Flora?.length){
    const retained=new Map(),before=new Map((reuse?.save.Tank.Flora||[]).map(r=>[r.UniqueId,r]));
    // Reuse only dry ground plants; attached and underwater plants still rebuild their contact geometry.
    if(sameSoil&&!navigation&&!save.Tank.Setup.Filled&&!reuse.save.Tank.Setup.Filled){
     const oldSurfaces=new Map(reuse.habitat.surfaces.filter(s=>s.flora).map(s=>[s.node,s]));
     for(const r of save.Tank.Flora){const s=oldSurfaces.get('flora/'+r.UniqueId);if(!r.Host&&s&&s.flowTime===undefined&&JSON.stringify(r)===JSON.stringify(before.get(r.UniqueId)))retained.set(r.UniqueId,s);}
    }
    const changed=save.Tank.Flora.filter(r=>!retained.has(r.UniqueId));
    floraItems=this.flora?this.flora.collisionItems(changed,{soil,entities,habitat,unity:true}):floraCollisionItems(changed,{soil,habitat,hostMatrix:id=>entities.get(id)?.matrixWorld});
    const generated=new Map(floraItems.map(s=>[s.node,s]));
    for(const r of save.Tank.Flora){const s=retained.get(r.UniqueId),item=s?{...s,geometry:s.source}:generated.get('flora/'+r.UniqueId);if(item)surfaces.push(item);}
    habitat=await createHabitat(null,null,()=>{},{surfaces:[...habitat.surfaces,...retained.values()]},surfaces);
   }let anchors=[];
   if(navigation){const prior=reuse?.anchors||[],push=h=>{if(h?.surface.flora&&h.normal.y<0)h.normal.negate();if(!h||h.normal.y<-.25||Math.abs(h.point.x)>.575||Math.abs(h.point.z)>.277||h.point.y>.56)return;const key=h.surface.owner+':'+[h.point.x,h.point.y,h.point.z].map(v=>Math.round(v/.012)).join(':');if(occupied.has(key))return;occupied.add(key);const old=prior.find(a=>a.owner===h.surface.owner&&vec(a.position).distanceTo(h.point)<.012);anchors.push({position:h.point.clone(),normal:h.normal.clone(),kind:h.surface.kind,owner:h.surface.owner,flora:!!h.surface.flora,food:old?.food??(h.surface.kind===3?.60:.4),edges:[]});},occupied=new Set();
    for(let x=-.565;x<=.566;x+=.032)for(let z=-.266;z<=.267;z+=.032)push(habitat.cast(new T.Vector3(x,.59,z),new T.Vector3(0,-1,0),.6));
    // Leaves can hide the floor/host from the coarse top grid; retain an entry point at each root.
    for(const r of save.Tank.Flora||[]){if(r.Host){const node=entities.get(r.Host);if(node){const point=new T.Vector3(...r.Local).applyMatrix4(node.matrixWorld),hit=baseHabitat.closest(point,.015);if(hit?.surface.owner===node.name)push(hit);}}else {const hit=baseHabitat.cast(new T.Vector3(r.X,soil.sample(r.X,r.Z)+.012,r.Z),new T.Vector3(0,-1,0),.025);if(hit?.surface.kind===0)push(hit);}}
    for(const surface of habitat.surfaces){if(surface.kind===0)continue;if(surface.samples){for(const point of surface.samples)push(habitat.closest(point,.001));continue;}const p=surface.geo.attributes.position,stride=Math.max(1,Math.floor(p.count/(surface.kind===3?24:220)));for(let i=0;i<p.count;i+=stride){const point=new T.Vector3().fromBufferAttribute(p,i),h=habitat.closest(point,.001);push(h);}}
    reconnectGraph(habitat,anchors);
   }
   return {save,soil,group,entities,soilView,habitat,anchors,dispose(){soilView.dispose(reuse?.soilView);group.traverse(o=>{if(o.userData.ownedGeometry)o.geometry.dispose();});for(const s of habitat.surfaces)if(!reuse?.habitat.surfaces.includes(s))disposeSurface(s);}};
  }catch(e){soilView.dispose(reuse?.soilView);group.traverse(o=>{if(o.userData.ownedGeometry)o.geometry.dispose();});if(habitat)for(const s of habitat.surfaces)if(!reuse?.habitat.surfaces.includes(s))disposeSurface(s);for(const item of floraItems)if(!habitat?.surfaces.some(s=>s.source===item.geometry))item.geometry.dispose();throw e;}
 }
 commit(candidate){this.originalHidden.forEach(n=>n.visible=false);if(this.current){this.aq.root.remove(this.current.group);this.current.soilView.dispose(candidate.soilView);this.current.group.traverse(o=>{if(o.userData.ownedGeometry)o.geometry.dispose();});for(const s of this.current.habitat.surfaces)if(!candidate.habitat.surfaces.includes(s))disposeSurface(s);}this.current=candidate;this.aq.root.add(candidate.group);this.aq.root.updateMatrixWorld(true);}
 remapWorld(candidate,seed,game,stock=this.aq.populationBase||seed){const nextSeed={...seed,creatures:populationRecords(stock,game.creatures.length),tankId:candidate.save.Tank.UniqueId,anchors:candidate.anchors.map(a=>({...a,position:a.position.toArray(),normal:a.normal.toArray()}))};
  const saved=structuredClone(game);saved.tankId=nextSeed.tankId;saved.anchors=saved.creatures.map(c=>nearest(candidate.anchors,vec(c.Position)));saved.food=candidate.anchors.map(a=>a.food);saved.pellet=null;
  if(!Array.isArray(game.food)||game.food.length>12000||game.food.some(n=>!Number.isFinite(n)||n<0||n>1))throw new Error('食物记录无效');
  const previous=game.navigation||(this.current?.anchors.length===game.food.length?this.current.anchors.map(a=>({...a,position:a.position.toArray()})):null);
  if(previous){if(!Array.isArray(previous)||previous.length!==game.food.length||previous.length>12000||previous.some(a=>!Array.isArray(a.position)||a.position.length!==3||a.position.some(n=>!Number.isFinite(n)||Math.abs(n)>1)||typeof a.owner!=='string')||game.food.some(n=>!Number.isFinite(n)||n<0||n>1))throw new Error('栖息面与食物记录无效');
   const cells=new Map();previous.forEach((a,i)=>{const key=a.owner+':'+a.position.map(n=>Math.round(n/.012)).join(':');cells.set(key,game.food[i]);});candidate.anchors.forEach((a,i)=>{const cell=a.position.toArray().map(n=>Math.round(n/.012)).join(':');saved.food[i]=cells.get(a.owner+':'+cell)??cells.get(':'+cell)??a.food;});
   if(game.pellet){if(!previous[game.pellet.anchor]||!Number.isFinite(game.pellet.age)||game.pellet.age<0||game.pellet.age>240)throw new Error('饲料记录无效');const at=nearest(candidate.anchors,vec(previous[game.pellet.anchor].position));if(at>=0)saved.pellet={anchor:at,age:game.pellet.age};}
  }
  return {seed:nextSeed,world:new CreatureWorld(nextSeed,candidate.habitat,saved,candidate.save.Colony)};
 }
}
