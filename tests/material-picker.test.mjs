import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {hardscapeStock,PLANT_STOCK,materialForRecord} from '../src/material-picker.js';
import {FLORA_CATALOG} from '../src/flora.js';

test('same material samples stock without copying identity, growth or attachment',()=>{
  const entries=[{key:'rock-small',baseKey:'rock',name:'岩石 · 小号'},{key:'old-rock',baseKey:'rock',retired:true}];
  const definitions=[{TypeId:'native'}];
  const tank={Hardscape:[{UniqueId:'stone',TypeId:'rock-small'},{UniqueId:'old',TypeId:'old-rock'}],Plants:[{UniqueId:'plant',TypeId:'native',Stage:3,Cuts:[1]}],Flora:[{UniqueId:'attached',Species:'pala',Variant:1,Host:'stone',Nodes:12}]};
  const before=structuredClone(tank);
  assert.deepEqual(materialForRecord(tank,'stone',entries,definitions),{tool:'stone',value:'rock-small',label:'岩石 · 小号'});
  assert.deepEqual(materialForRecord(tank,'plant',entries,definitions),{tool:'plant',value:'0',label:PLANT_STOCK[0].label});
  assert.deepEqual(materialForRecord(tank,'attached',entries,definitions),{tool:'plant',value:'flora:pala:1',label:PLANT_STOCK.find(p=>p.id==='flora:pala:1').label});
  for(const id of ['old','missing',null])assert.equal(materialForRecord(tank,id,entries,definitions),null);
  assert.deepEqual(tank,before);
});

test('picture stock preserves all current sizes and excludes retired/legacy stock',()=>{
  const {entries}=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url)));
  const stocks=hardscapeStock(entries);
  assert.equal(stocks.length,6);
  assert.equal(stocks.filter(s=>s.wood).length,2);
  for(const stock of stocks){
    assert.equal(stock.sizes.length,3);
    assert.ok(existsSync(new URL(`../public/assets/thumbnails/${stock.key}.jpg`,import.meta.url)));
    for(const [i,size] of ['small','medium','large'].entries()) assert.ok(stock.sizes[i].key.includes(`__${size}__`));
    assert.ok(stock.sizes.every(e=>!e.retired&&!e.legacy));
  }
  for(let i=0;i<5;i++) assert.ok(existsSync(new URL(`../public/assets/thumbnails/soil-${i}.png`,import.meta.url)));
});

test('plant pictures cover every current choice with distinct files and correct planting surface',()=>{
  assert.deepEqual(PLANT_STOCK.map(p=>p.id),['0','1','2',...FLORA_CATALOG.map(p=>p.id)]);
  assert.equal(new Set(PLANT_STOCK.map(p=>p.image)).size,19);
  assert.equal(PLANT_STOCK.filter(p=>p.host).length,8);
  for(const plant of PLANT_STOCK){
    const bytes=readFileSync(new URL('../public'+plant.image,import.meta.url));
    assert.equal(bytes.readUInt16BE(),0xffd8);
    assert.ok(bytes.length>1000,plant.id+' must contain a rendered image');
    assert.equal(plant.host,!!FLORA_CATALOG.find(p=>p.id===plant.id)?.host);
  }
});
