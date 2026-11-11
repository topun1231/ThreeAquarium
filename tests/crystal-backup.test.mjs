import test from 'node:test';
import assert from 'node:assert/strict';
import {readCrystalBackup,writeCrystalBackup} from '../src/crystal-backup.js';
test('compressed backups roundtrip Chinese names and exact numeric records; failed writes retain original',async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const value={name:'小枫与虾宝宝',values:Array.from({length:15000},(_,i)=>i/17)};
 await writeCrystalBackup(storage,'old',value);assert.deepEqual(await readCrystalBackup(storage,'old'),value);assert.ok(map.get('old').length<JSON.stringify(value).length);
 const before=map.get('old');storage.setItem=()=>{throw Error('quota');};await assert.rejects(writeCrystalBackup(storage,'old',{lost:true}));assert.equal(map.get('old'),before);
 map.set('legacy',JSON.stringify(value));assert.deepEqual(await readCrystalBackup(storage,'legacy'),value);
 map.set('bad','gzip:broken');await assert.rejects(readCrystalBackup(storage,'bad'));
});
