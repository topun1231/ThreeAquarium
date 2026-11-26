import {LEGACY_NAVIGATION_LIMIT} from './navigation-budget.js';

export const GAME_SAVE_KEY='aquarium.three.creatures.v1';
export const GAME_SAVE_CONFLICT='另一游戏页面已更新存档。请刷新本页再继续。';
export const PROGRESS_FILE_LIMIT=16*1024*1024;
export function guardGameStorage(storage){
  let expected, stale=false;
  function assertGameSaveCurrent(){
    if(stale)throw new Error(GAME_SAVE_CONFLICT);
    const current=storage.getItem(GAME_SAVE_KEY);
    if(expected===undefined)expected=current;
    else if(current!==expected){
      stale=true;
      throw new Error(GAME_SAVE_CONFLICT);
    }
    return current;
  }
  return {
    assertGameSaveCurrent,
    get gameSaveStale(){return stale;},
    noteGameSaveChange(){
      if(stale || expected===undefined || storage.getItem(GAME_SAVE_KEY)===expected)return false;
      stale=true;
      return true;
    },
    getItem(key){return key===GAME_SAVE_KEY?assertGameSaveCurrent():storage.getItem(key);},
    setItem(key,value){
      if(key===GAME_SAVE_KEY)assertGameSaveCurrent();
      storage.setItem(key,value);
      if(key===GAME_SAVE_KEY)expected=String(value);
    },
  };
}

export function createProgressExport(value) {
  const type={type:'application/json'};
  const pretty=new Blob([JSON.stringify(value,null,2)],type);
  return pretty.size<=PROGRESS_FILE_LIMIT?pretty:new Blob([JSON.stringify(value)],type);
}

// One row stores an owner index, surface kind, XYZ position and food, with no rounding.
const rowBytes=35;
const maxEncodedBytes=4*Math.ceil(LEGACY_NAVIGATION_LIMIT*rowBytes/3);
const valid=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
function invalid(){throw new Error('压缩的栖息面或食物记录无效');}
function pack(game){
  if(!game?.navigation?.length)return game;
  const {navigation,food,...rest}=game;
  if(!Array.isArray(navigation)||!Array.isArray(food)||food.length!==navigation.length||navigation.length>LEGACY_NAVIGATION_LIMIT)invalid();
  const bytes=new Uint8Array(navigation.length*rowBytes),view=new DataView(bytes.buffer),owners=new Map();
  for(const [i,point] of navigation.entries()){
    if(typeof point?.owner!=='string'||!Number.isInteger(point.kind)||!valid(point.kind,0,3)||
       !Array.isArray(point.position)||point.position.length!==3||![...point.position].every(n=>valid(n,-1,1))||
       !valid(food[i],0,1))invalid();
    if(!owners.has(point.owner))owners.set(point.owner,owners.size);
    const at=i*rowBytes;
    view.setUint16(at,owners.get(point.owner),true);
    view.setUint8(at+2,point.kind);
    for(let k=0;k<3;k++)view.setFloat64(at+3+k*8,point.position[k],true);
    view.setFloat64(at+27,food[i],true);
  }
  let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {...rest,packedNavigation:{version:1,owners:[...owners.keys()],data:btoa(binary)}};
}
function unpack(game){
  if(!game||!Object.hasOwn(game,'packedNavigation'))return game;
  const {packedNavigation:packed,...rest}=game;
  if(packed?.version!==1||!Array.isArray(packed.owners)||packed.owners.length>LEGACY_NAVIGATION_LIMIT||
     !packed.owners.every(owner=>typeof owner==='string')||typeof packed.data!=='string'||
     packed.data.length>maxEncodedBytes||Object.hasOwn(game,'navigation')||Object.hasOwn(game,'food'))invalid();
  let binary;
  try {binary=atob(packed.data);} catch {invalid();}
  const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0)),view=new DataView(bytes.buffer);
  if(!bytes.length||bytes.length%rowBytes||bytes.length/rowBytes>LEGACY_NAVIGATION_LIMIT)invalid();
  const navigation=[],food=[];
  for(let at=0;at<bytes.length;at+=rowBytes){
    const owner=packed.owners[view.getUint16(at,true)],kind=view.getUint8(at+2);
    const position=[view.getFloat64(at+3,true),view.getFloat64(at+11,true),view.getFloat64(at+19,true)];
    const value=view.getFloat64(at+27,true);
    if(owner===undefined||kind>3||!position.every(n=>valid(n,-1,1))||!valid(value,0,1))invalid();
    navigation.push({owner,kind,position});food.push(value);
  }
  return {...rest,navigation,food};
}
function roomNavigation(game,convert) {
  const converted=convert(game), rooms=converted?.session?.BreedingRooms;
  if(!Array.isArray(rooms?.rooms))return converted;
  const members=rooms.rooms.map(room=>room?.game?{...room,game:convert(room.game)}:room);
  return {...converted,session:{...converted.session,BreedingRooms:{...rooms,rooms:members}}};
}

export function readLocalGame(storage,key) {
  return roomNavigation(JSON.parse(storage.getItem(key)||'null'),unpack);
}

export function writeLocalGame(storage,key,game) {
  const json=JSON.stringify(game);
  try { storage.setItem(key,json); }
  catch(error) {
    if(error?.name!=='QuotaExceededError')throw error;
    const packed=JSON.stringify(roomNavigation(game,pack));
    if(packed.length>=json.length)throw error;
    storage.setItem(key,packed);
  }
}
