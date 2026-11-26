import {stableSeed} from './state.js';
import {batchTankId,birthTankId,savedRoomCreatures,tankNames} from './crystal-breeding.js';
import {addPlantCutHash} from './ecology.js';
import {visibleNodes,visibleUpright} from './flora.js';

export function wallpaperRoomKey(session,room=session.BreedingRooms?.activeId) {
  const rooms=session.BreedingRooms;
  if(!room || !Array.isArray(rooms?.rooms) || !Array.isArray(session.Breeding?.contests?.cards))return null;
  const tank=id=>id===rooms.activeId ? session.Tank : rooms.rooms?.find(r=>r.id===id)?.session?.Tank;
  const main=tank('main')?.UniqueId, target=tank(room)?.UniqueId;
  // Starter tanks can share an asset ID across saves. The first contest seed is fixed at game creation.
  const seed=session.Breeding.contests.cards.find(card=>card?.id==='colour-entry')?.seed;
  return [main,room,target].every(id=>typeof id==='string' && id.length>0 && id.length<=100) && Number.isInteger(seed)
    ? encodeURIComponent(JSON.stringify([main,room,target,seed])) : null;
}

export function wallpaperJournalBrood(session,occupants) {
  const room=session.BreedingRooms?.activeId ?? 'main';
  const batches=session.Breeding?.batches ?? [];
  const pending=batches.findIndex(b=>(b.status==='planned' || b.status==='formed') && batchTankId(b)===room);
  if(pending>=0)return pending;
  const together=b=>Array.isArray(b.children) && b.children.length>0 && b.children.length===b.size &&
    b.children.every(child=>occupants.includes(child.id));
  const juveniles=batches.findLastIndex(b=>b.status==='hatched' && together(b));
  return juveniles>=0 ? juveniles : batches.findLastIndex(b=>b.status==='complete' && together(b));
}

// Use the fixed birth records. Renaming or moving a live offspring leaves its journal reachable.
export function wallpaperFamilyKey(batch) {
  if(batch?.status!=='hatched' && batch?.status!=='complete')return null;
  const children=batch.children.map(c=>[c.id,c.sex,c.colour,c.pattern,c.B,c.P]);
  return batch.plannedAt+'.'+stableSeed(JSON.stringify([batch.id,batch.motherId,batch.fatherId,children]));
}

export function wallpaperMealTag(pellet) {
  if(Number.isSafeInteger(pellet?.fedAt) && pellet.fedAt>=0)return 't'+pellet.fedAt;
  return Number.isInteger(pellet?.anchor) && pellet.anchor>=0 ? 'a'+pellet.anchor : '';
}

// The desktop advances a published brood itself. Compare the player's pairing decisions, not the clock.
export function wallpaperBroodTag(session) {
  const room=session.BreedingRooms?.activeId ?? 'main';
  const plans=(session.Breeding?.batches ?? []).filter(b=>b.status!=='cancelled' && birthTankId(b)===room)
    .map(b=>[b.id,b.motherId,b.fatherId,b.size,b.formedAt,b.hatchAt,b.adultAt]);
  return String(stableSeed(JSON.stringify(plans)));
}

export function wallpaperNamesTag(session) {
  const shrimp=session.Colony?.shrimp ?? {};
  const names=Object.keys(shrimp).sort().filter(id=>shrimp[id]?.name && shrimp[id].name!==id)
    .map(id=>[id,shrimp[id].name]);
  return String(stableSeed(JSON.stringify(names)));
}

// Compare the player's setup. Swimming, feeding and elapsed growth time should not prompt a sync.
const hash=value=>stableSeed(JSON.stringify(value));

export function plantGeometryRows(plants,geometryGrowth=p=>p.Growth) {
  return plants.map(p=>[p.UniqueId,p.TypeId,p.Position,p.Rotation,p.Scale,
    p.Stage,geometryGrowth(p),p.UseContinuousVisualGrowth,p.Cuts,p.Cuts?.length?p.EcologicalAgeSeconds:null]);
}

export function tankGeometryKey(tank,geometryGrowth) {
  const plants=plantGeometryRows(tank.Plants,geometryGrowth);
  const flora=(tank.Flora??[]).map(p=>({...p,Nodes:visibleNodes(p),Upright:visibleUpright(p)}));
  return JSON.stringify([tank.UniqueId,tank.Setup.Filled,tank.Substrate,tank.Hardscape,plants,flora]);
}

export function wallpaperSceneryTag(tank) {
  const rows=(items,fields)=>Array.isArray(items) ? items.map(item=>fields.map(key=>item?.[key])) : [];
  const soil=tank.Substrate;
  const stones=Array.isArray(tank.Hardscape) ? tank.Hardscape.map(r=>
    [r?.UniqueId,r?.TypeId,r?.Position,r?.Rotation,r?.Scale,r?.Burial??.003]) : [];
  return ['v2',hash([tank.UniqueId,tank.Environment?.LightOn]),
    hash([soil?.TypeId,soil?.Depth,soil?.Heightfield,soil?.MaterialLayers]),hash(stones),
    hash([(tank.Plants??[]).map(p=>[p.UniqueId,p.TypeId,p.Position,p.Rotation,p.Scale,
      (p.Cuts??[]).reduce(addPlantCutHash,p.RecoveredCutsHash??0) || []]),
      rows(tank.Flora,['UniqueId','Species','Variant','Yaw','Scale','Hue','X','Z','Host','Local','Normal','LastTrim'])])
  ].join('.');
}

export function wallpaperLayoutTag(tank, occupants, scenery=wallpaperSceneryTag(tank)) {
  return scenery+'.'+hash(occupants.slice().sort());
}

export function wallpaperNeighbourTags(session) {
  const tags={};
  for(const room of session.BreedingRooms?.rooms ?? []){
    const tank=room.session?.Tank;
    if(!tank || !Object.hasOwn(tankNames,room.id) || room.id===session.BreedingRooms.activeId)continue;
    const incoming=tank.Substrate?.MaterialLayers ? null : tank.Substrate?.IncomingKind;
    const residents=savedRoomCreatures(session,room.id,true).map(creature=>creature.CreatureId).sort();
    tags[room.id]=hash([tank.Setup?.Filled===true,incoming,wallpaperSceneryTag({...tank,Environment:{LightOn:tank.Environment?.LightOn!==false}}),residents]);
  }
  return tags;
}

export function changedWallpaperNeighbours(before,after) {
  if(!before || !after)return '';
  const groups={'新增邻缸':[],'减少邻缸':[],'邻缸布置':[]};
  for(const [id,name] of Object.entries(tankNames)){
    if(before[id]===after[id])continue;
    groups[!Object.hasOwn(before,id)?'新增邻缸':!Object.hasOwn(after,id)?'减少邻缸':'邻缸布置'].push(name);
  }
  return Object.entries(groups).filter(([,names])=>names.length)
    .map(([label,names])=>`${label}（${names.join('、')}）`).join('、');
}

export function compareWallpaperLayouts(published,current) {
  const format=/^v2(?:\.\d+){5}$/;
  if(!format.test(published) || !format.test(current))return null;
  const before=published.split('.'), after=current.split('.');
  return {soil:before[2]!==after[2],hardscape:before[3]!==after[3],
    plants:before[4]!==after[4],occupants:before[5]!==after[5]};
}
