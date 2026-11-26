import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_SAVE_KEY,guardGameStorage,readLocalGame,writeLocalGame} from '../src/local-game-save.js';

const key='aquarium game';
function storage(limit=Infinity) {
  const entries=new Map();
  return {
    getItem:name=>entries.get(name)??null,
    setItem(name,value) {
      if(value.length>limit)throw new DOMException('quota','QuotaExceededError');
      entries.set(name,value);
    },
  };
}
function ecology() {
  const navigation=Array.from({length:12000},(_,i)=>({
    owner:i%3?'Aquarium living substrate':'Plant preserved-id',
    kind:i%3?0:3,
    position:[.011999999999999997+(i%120)*.000302,.0341520134003834,-.024284753444090938],
  }));
  return {navigation,food:navigation.map((_,i)=>(i+1)/12001),pellet:{anchor:11777,age:7.125},elapsed:96.9};
}

test('old saves stay readable, and four dense tanks fit without rounding positions or food',()=>{
  const disk=storage(5*1024*1024), small={session:{Tank:{UniqueId:'small'}},food:[.5]};
  writeLocalGame(disk,key,small);
  assert.equal(disk.getItem(key),JSON.stringify(small));
  assert.deepEqual(readLocalGame(disk,key),small);
  const dense={...ecology(),session:{Tank:{UniqueId:'active'},BreedingRooms:{rooms:['first','second','third'].map(id=>({id,game:ecology()}))}}};
  assert.ok(JSON.stringify(dense).length>5*1024*1024);
  writeLocalGame(disk,key,dense);
  const raw=disk.getItem(key), saved=JSON.parse(raw);
  assert.ok(raw.length<3*1024*1024);
  assert.equal(saved.packedNavigation.version,1);
  assert.ok(saved.session.BreedingRooms.rooms.every(room=>room.game.packedNavigation));
  assert.deepEqual(readLocalGame(disk,key),dense);
});

test('failed compact writes preserve the last save and broken payloads are rejected',()=>{
  const disk=storage(250), previous={food:[.5]};
  writeLocalGame(disk,key,previous);
  assert.throws(()=>writeLocalGame(disk,key,ecology()),{name:'QuotaExceededError'});
  assert.deepEqual(readLocalGame(disk,key),previous);
  disk.setItem(key,JSON.stringify({packedNavigation:{version:1,owners:['soil'],data:'abcd'}}));
  assert.throws(()=>readLocalGame(disk,key),/栖息面或食物记录无效/);
});

test('a stale game page cannot replace a newer save or silently adopt its revision',()=>{
  const disk=storage(200), old=guardGameStorage(disk);
  assert.equal(readLocalGame(old,GAME_SAVE_KEY),null);
  writeLocalGame(old,GAME_SAVE_KEY,{name:'original'});
  assert.throws(()=>writeLocalGame(old,GAME_SAVE_KEY,{name:'x'.repeat(210)}),{name:'QuotaExceededError'});
  const newer=guardGameStorage(disk);
  assert.deepEqual(readLocalGame(newer,GAME_SAVE_KEY),{name:'original'});
  writeLocalGame(newer,GAME_SAVE_KEY,{name:'new'});
  old.setItem('unrelated preference','1');
  assert.throws(()=>readLocalGame(old,GAME_SAVE_KEY),/请刷新/);
  assert.throws(()=>writeLocalGame(old,GAME_SAVE_KEY,{name:'stale'}),/请刷新/);
  assert.equal(disk.getItem(GAME_SAVE_KEY),'{"name":"new"}');
  const refreshed=guardGameStorage(disk);
  assert.deepEqual(readLocalGame(refreshed,GAME_SAVE_KEY),{name:'new'});
  writeLocalGame(refreshed,GAME_SAVE_KEY,{name:'kept'});
  assert.equal(disk.getItem(GAME_SAVE_KEY),'{"name":"kept"}');
});

test('a storage notification makes a loaded game stale only once',()=>{
  const disk=storage(), old=guardGameStorage(disk);
  assert.equal(old.noteGameSaveChange(),false);
  writeLocalGame(old,GAME_SAVE_KEY,{name:'original'});
  assert.equal(old.noteGameSaveChange(),false);
  disk.setItem(GAME_SAVE_KEY,'{"name":"new"}');
  assert.equal(old.noteGameSaveChange(),true);
  assert.equal(old.gameSaveStale,true);
  assert.equal(old.noteGameSaveChange(),false);
  disk.setItem(GAME_SAVE_KEY,'{"name":"original"}');
  assert.throws(()=>writeLocalGame(old,GAME_SAVE_KEY,{name:'stale'}),/请刷新/);
  assert.equal(disk.getItem(GAME_SAVE_KEY),'{"name":"original"}');
});
