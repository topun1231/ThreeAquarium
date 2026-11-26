import {Box3,BoxGeometry,BufferGeometry,CanvasTexture,CylinderGeometry,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,SRGBColorSpace,Vector3} from 'three';
import {breedingRack,roomStations} from './room-stations.js';
import {tankNames} from './crystal-breeding.js';
import {Substrate} from './substrate.js';
import {soilGroundGeometry} from './soil-view.js';
import {finishWindowWall,oakFloorMaterial,shadeFloorUnderFurniture} from './room-finishes.js';

function nameplateMaterial(text){
 const canvas=globalThis.document?.createElement('canvas');
 if(!canvas)return new MeshStandardMaterial({color:0xba9a62,roughness:.72});
 canvas.width=512;canvas.height=96;
 const ink=canvas.getContext('2d');
 ink.fillStyle='#d9bc83';ink.fillRect(0,0,512,96);
 ink.strokeStyle='#806137';ink.lineWidth=3;ink.strokeRect(8,8,496,80);
 ink.font='600 48px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
 ink.fillStyle='#352719';ink.textAlign='center';ink.textBaseline='middle';ink.fillText(text,256,50,460);
 const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.anisotropy=4;
 return new MeshStandardMaterial({map,roughness:.72});
}

export function createRoomRack(aq,soilSettings,modelHardscape,createPlants,sun,sourceLamp,createShrimp,makeWaterSurface){
 const desk=aq.meshes.find(mesh=>mesh.name==='Single solid walnut surface');
 const furniture=desk?.parent?.parent;
 if(!furniture)return null;
 const decor=new Group();
 decor.name='Window-side room';
 aq.root.updateWorldMatrix(true,true);
 aq.root.add(decor);
 const fixtures=[];
 for(const node of [...furniture.children]){
  if(/^(Light stand|Slim anodized plant light|Diffused LED underside|Discreet power lead)/.test(node.name))fixtures.push(node);
  else decor.attach(node);
 }
 const rack=new Group();
 rack.name='Breeding rack';decor.add(rack);
 const {start,width,lower,depth}=breedingRack;
 if(!desk.geometry.boundingBox)desk.geometry.computeBoundingBox();
 const desktop=desk.geometry.boundingBox.clone().applyMatrix4(desk.matrixWorld);
 const centre=start+width/2, top=desktop.max.y, z=.04;
 const inverse=aq.root.matrixWorld.clone().invert();
 const parts=fixtures.map(node=>{
  const part=node.clone();
  inverse.clone().multiply(node.matrixWorld).decompose(part.position,part.quaternion,part.scale);
  part.position.y-=top;
  return part;
 });
 const walnut=desk.material[0], metal=new MeshStandardMaterial({color:0x716456,roughness:.7});
 const cube=new BoxGeometry();
 function box(parent,name,material,x,y,z,w,h,d){
  const mesh=new Mesh(cube,material);mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(w,h,d);
  mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
 }
 const thickness=.045, foot=top+lower-.18;
 const floor=box(decor,'Room floor',oakFloorMaterial(),0,foot-.05,3,40,.10,26);
 floor.castShadow=false;
 finishWindowWall(decor,cube,aq.meshes.find(mesh=>mesh.name==='Dim room wall'),aq,foot);
 const footprints=[{x:centre,z,w:width,d:depth,height:top+lower-thickness-foot}];
 const cabinet=desk.getObjectByName('Window-side cabinet');
 if(cabinet){
  const base=new Box3().setFromObject(cabinet),size=base.getSize(new Vector3()),centre=base.getCenter(new Vector3());
  const height=base.min.y-foot;
  if(height>0){
   box(decor,'Cabinet plinth',walnut,centre.x,foot+height/2,-centre.z,size.x*.91,height,size.z*.89);
   footprints.push({x:centre.x,z:-centre.z,w:size.x,d:size.z,height});
  }
 }
 shadeFloorUnderFurniture(floor,footprints);
 for(const [id,height] of [['upper',top],['lower',top+lower]])
  box(rack,id+' shelf',walnut,centre,height-thickness/2,z,width,thickness,depth);
 for(const x of [start+.026,centre,start+width-.026])for(const side of [-1,1])
  box(rack,'Rack upright',metal,x,(top+foot)/2,z+side*(depth/2-.03),.038,top-foot,.038);
 const supplyX=roomStations['breeding-2'].x;
 box(rack,'Maintenance crate',new MeshStandardMaterial({color:0xd6b997,roughness:.86}),supplyX,top+lower+.11,z,.49,.22,.31);
 box(rack,'Maintenance crate lid',walnut,supplyX,top+lower+.227,z,.51,.026,.33);
 box(rack,'Recessed crate pull',metal,supplyX,top+lower+.16,z-.157,.115,.021,.006);
 const jar=new Mesh(new CylinderGeometry(.077,.072,.175,18),
   new MeshStandardMaterial({color:0xc69367,roughness:.42}));
 jar.name='Feed canister';jar.position.set(supplyX-.36,top+lower+.088,z-.027);
 jar.castShadow=jar.receiveShadow=true;rack.add(jar);
 const lid=new Mesh(new CylinderGeometry(.081,.081,.022,18),metal);
 lid.name='Feed canister lid';lid.position.y=.094;lid.castShadow=lid.receiveShadow=true;jar.add(lid);

 // Only the selected bay runs the full habitat. Neighbouring glass and bases establish the room scale.
 const glass=new MeshBasicMaterial({color:0xb6b6b6,transparent:true,opacity:.09,depthWrite:false});
 const water=new MeshStandardMaterial({color:0xcecece,transparent:true,opacity:.08,roughness:.24,depthWrite:false});
 const waterWidth=1.186, waterDepth=.586, waterHeight=.58;
 const waterSurface=makeWaterSurface?.(waterWidth,waterDepth,waterHeight);
 const waterVolume=waterSurface ? cube.clone() : cube;
 if(waterSurface){
  waterVolume.clearGroups();
  waterVolume.setIndex(Array.from(cube.index.array).filter(i=>cube.attributes.normal.getY(i)<.5));
 }
 const substrateMaterials=aq.meshes.find(mesh=>mesh.name.startsWith('Deposited substrate'))?.material;
 const furnitureBounds=[desk,...rack.children].map(mesh=>({mesh,bounds:new Box3()}));
 const tankBounds=new Box3(new Vector3(-.61,top,-.312),new Vector3(.61,.64,.312));
 const hit=new Vector3();
 const neighbours=new Map();
 for(const [id,{x,y}] of Object.entries(roomStations)){
  const shell=new Group();shell.name='Glass outline '+id;shell.position.set(x,top+y,0);
  shell.visible=false;
  (id==='main'?decor:rack).add(shell);
  const main=id==='main';
  const plaque=box(main?decor:rack,'Tank nameplate '+id,nameplateMaterial(tankNames[id]),
   x,top+y-(main?(top-desktop.min.y)/2:thickness/2),main?-desktop.max.z-.002:z-depth/2-.002,
   .39,main?Math.min(.041,top-desktop.min.y):.041,.006);
  // Cancel the imported room's depth reflection so the lettering faces the viewer.
  if(aq.root.matrixWorld.determinant()<0)plaque.scale.z*=-1;
  plaque.visible=false;
  box(shell,'Tank base',metal,0,.016,0,1.21,.032,.62);
  for(const side of [-1,1]){
   box(shell,'Glass side',glass,side*.598,.34,0,.009,.62,.60).castShadow=false;
   box(shell,'Glass face',glass,0,.34,side*.30,1.20,.62,.009).castShadow=false;
  }
  const bottom=-top;
  const filled=box(shell,'Neighbour water',water,0,bottom+waterHeight/2,0,waterWidth,waterHeight,waterDepth);
  filled.geometry=waterVolume;
  filled.castShadow=filled.visible=false;
  const surface=waterSurface?.clone();
  if(surface){surface.visible=false;surface.position.y=bottom+waterHeight;shell.add(surface);}
  const ground=new Mesh(new BufferGeometry(),substrateMaterials);
  ground.name='Neighbour substrate';ground.position.y=bottom;ground.receiveShadow=true;ground.visible=false;
  const stones=new Group();stones.name='Neighbour hardscape';stones.position.y=bottom;
  const plants=new Group();plants.position.y=bottom;
  shell.add(ground,stones,plants);
  const fixture=new Group();fixture.name='Neighbour fixture '+id;fixture.position.copy(shell.position);
  fixture.visible=false;shell.parent.add(fixture);
  let diffuser, lamp;
  for(const template of parts){
   const part=template.clone();
   part.traverse(node=>{
    if(node.name==='Diffused LED underside' && node.isMesh){
     node.material=node.material.map(material=>{
      if(material.name!=='Soft LED emitter')return material;
      diffuser=material.clone();diffuser.emissiveIntensity=0;
      return diffuser;
     });
    }
    node.name='Neighbour '+node.name;
   });
   fixture.add(part);
  }
  if(diffuser && sourceLamp){
   // A distant strip uses one cached shadow map. The active tank keeps both emitters.
   lamp=sourceLamp.clone();lamp.name='Neighbour tank light';
   lamp.position.set(0,bottom+sourceLamp.position.y,-sourceLamp.position.z);
   lamp.target.position.set(0,bottom,0);
   lamp.intensity=(sourceLamp.userData.originalIntensity ?? sourceLamp.intensity)*1.6;
   lamp.distance=1;lamp.angle=Math.PI*42/180;
   lamp.shadow.mapSize.set(1024,1024);
   lamp.shadow.autoUpdate=false;lamp.visible=false;
   fixture.add(lamp,lamp.target);
  }
  let residents, animals;
  if(createShrimp){
   animals=new Group();animals.name='Neighbour shrimp '+id;animals.position.set(x,y,0);
   shell.parent.add(animals);residents=createShrimp(animals);
  }
  neighbours.set(id,{shell,fixture,bounds:new Box3(),plaque,plaqueBounds:new Box3(),filled,surface,ground,stones,diffuser,lamp,animals,residents,restorePlants:createPlants?.(plants)});
 }
 function restoreStones(view,records){
  if(!modelHardscape)return false;
  const signature=JSON.stringify(records||[]);
  if(view.stoneSignature===signature)return false;
  const models=(records||[]).map(modelHardscape).filter(Boolean);
  const changed=models.length>0 || view.stones.children.length>0;
  view.stones.clear();if(models.length)view.stones.add(...models);
  view.stoneModels=models;
  view.stoneSignature=signature;
  return changed;
 }
 function restoreNeighbour(view,tank){
  const filled=tank?.Setup.Filled===true;
  const lit=!!tank && tank.Environment?.LightOn!==false;
  const lampChanged=!!view.lamp && view.lamp.visible!==lit;
  if(view.lamp)view.lamp.visible=lit;
  if(view.diffuser)view.diffuser.emissiveIntensity=lit?1.6:0;
  const changed=restoreStones(view,tank?.Hardscape) || view.filled.visible!==filled || lampChanged;
  view.filled.visible=filled;
  if(view.surface)view.surface.visible=filled;
  const saved=tank?.Substrate;
  if(!saved || !soilSettings || !substrateMaterials)return changed;
  const heights=saved.Heightfield.QuantizedHeights, layers=saved.MaterialLayers, kind=layers?null:saved.IncomingKind;
  let groundChanged=false;
  if(view.heights!==heights || view.layers!==layers || view.kind!==kind){
   const soil=new Substrate(soilSettings,saved);
   const hadSoil=view.ground.visible, hasSoil=soil.h.some(height=>height>soil.MinHeight);
   const geometry=hasSoil ? soilGroundGeometry(soil) : new BufferGeometry();
   view.ground.geometry.dispose();view.ground.geometry=geometry;view.ground.visible=hasSoil;
   view.heights=heights;view.layers=layers;view.kind=kind;view.soil=soil;
   groundChanged=hasSoil || hadSoil;
  }
  const plantsChanged=view.restorePlants?.(tank,view.soil,view.stoneModels??[])??false;
  return changed || groundChanged || plantsChanged;
 }
 let shown,slots,roomSessions;
 return {
  animateShrimp(dt,wholeRoom){for(const view of neighbours.values())if(view.animals?.visible)view.residents.animate(dt,wholeRoom);},
  shrimpGroups(){return [...neighbours.values()].map(view=>view.animals).filter(group=>group?.visible && group.children.length);},
  invalidateShadows(){
   for(const {lamp} of neighbours.values())if(lamp)lamp.shadow.needsUpdate=true;
  },
  update(session){
   const rooms=session?.BreedingRooms, id=rooms?.activeId || 'main', tanks=session?.Breeding?.tanks;
   const moved=shown!==id || slots!==tanks?.length;
   if(!moved && roomSessions===rooms?.rooms)return false;
   shown=id;slots=tanks?.length;roomSessions=rooms?.rooms;
   if(moved){
    const station=roomStations[id] || roomStations.main;
    decor.position.set(-station.x,-station.y,0);
    if(sun){
     const shift=new Vector3(aq.roomOrigin.value.x-station.x,aq.roomOrigin.value.y-station.y,0);
     sun.position.add(shift);
     sun.target.position.add(shift);
    }
    aq.roomOrigin.value.set(station.x,station.y);
    decor.updateWorldMatrix(true,true);
    for(const {mesh,bounds} of furnitureBounds)bounds.setFromObject(mesh);
   }
   let changed=moved;
   for(const [key,view] of neighbours){
    view.plaque.visible=!!tanks?.some(tank=>tank.id===key);
    if(moved && view.plaque.visible)view.plaqueBounds.setFromObject(view.plaque);
    view.fixture.visible=view.shell.visible=key!==id && view.plaque.visible;
    if(view.animals){
     view.animals.visible=view.shell.visible;
     changed=view.residents.restore(view.animals.visible?session:null,key) || changed;
    }
    if(!view.shell.visible)continue;
    const updated=restoreNeighbour(view,roomSessions?.find(room=>room.id===key)?.session?.Tank);
    changed ||= updated;
    if(moved || updated){
     view.bounds.setFromObject(view.shell);
     if(view.lamp)view.lamp.shadow.needsUpdate=true;
    }
   }
   return changed;
  },
  pick(ray){
   const distance=bounds=>ray.intersectBox(bounds,hit)?ray.origin.distanceToSquared(hit):Infinity;
   let nearest=tankBounds.containsPoint(ray.origin)?0:distance(tankBounds), target=null;
   for(const {bounds} of furnitureBounds)nearest=Math.min(nearest,distance(bounds));
   for(const [id,{shell,bounds,plaque,plaqueBounds}] of neighbours){
    if(!plaque.visible)continue;
    const d=Math.min(distance(plaqueBounds),shell.visible?distance(bounds):Infinity);
    if(d<nearest){nearest=d;target=shell.visible?id:null;}
   }
   return target;
  },
 };
}
