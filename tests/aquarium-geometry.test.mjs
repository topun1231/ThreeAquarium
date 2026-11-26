import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BufferGeometry,BufferAttribute,Mesh} from 'three';
import {SoilView} from '../src/soil-view.js';
import {Substrate} from '../src/substrate.js';
import {attributeArray} from '../src/state.js';
import {finishAquariumGeometry,finishShrimpShell,shrimpViewGeometry} from '../src/aquarium-geometry.js';
import {reducedGeometry} from '../src/neighbour-hardscape.js';

const asset=name=>new URL('../public/assets/'+name,import.meta.url);
const pack=JSON.parse(readFileSync(asset('scene.json')));
const bytes=readFileSync(asset('geometry.bin'));
const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
function mesh(name){
 const src=pack.geometries.find(g=>g.name===name), geo=new BufferGeometry();geo.name=name;
 for(const key of ['position','normal','uv','tangent']){
   const values=attributeArray(data,src[key]);if(values)geo.setAttribute(key,new BufferAttribute(values,src[key].size));
 }
 geo.setIndex(new BufferAttribute(attributeArray(data,src.index),1));
 for(const g of src.groups)geo.addGroup(g.start,g.count,g.material);
 return geo;
}

test('finishing imported foliage keeps grass roots, leaf attachments and pruning indices in place',()=>{
 for(const [name,unit] of [['Grass_0',24],['Curved leaves 1',8]]){
   const geo=mesh(name),original=geo.attributes.position,index=geo.index,uv=geo.attributes.uv;
   finishAquariumGeometry(geo);
   const next=geo.attributes.position;
   for(let i=0;i<next.count;i+=unit)assert.deepEqual(next.array.slice(i*3,i*3+3),original.array.slice(i*3,i*3+3));
   assert.notDeepEqual(next.array,original.array);assert.equal(geo.index,index);assert.equal(geo.attributes.uv,uv);
   assert.ok(geo.attributes.normal.array.every(Number.isFinite));
 }
});

test('coarse and fine sediment keep their centres while exposed crests vary in height',()=>{
 const geo=mesh('Volumetric substrate surface batch'),original=geo.attributes.position;
 finishAquariumGeometry(geo);const next=geo.attributes.position;let small=0,tall=0;
 for(let i=0;i<next.count;i+=13){
   for(const axis of ['getX','getZ']){
     let shift=0;for(let j=i;j<i+6;j++)shift+=original[axis](j)-next[axis](j);
     assert.ok(Math.abs(shift)<1e-6);
   }
   const ratio=(next.getY(i+12)-next.getY(i))/(original.getY(i+12)-original.getY(i));
   if(ratio<.49)small++;if(ratio>.76)tall++;
 }
 assert.ok(small>tall && tall>0);
});

test('editing and restoring a soil tile uses the unchanged imported grain data',()=>{
 const tile=new Mesh(mesh('Volumetric substrate surface batch')),ground=new Mesh();
 tile.name='Batched substrate surface';ground.name='Deposited substrate';
 const soil=new Substrate({Width:1.2,Depth:.6,Columns:3,Rows:3,MinHeight:0,MaxHeight:.3});
 const view=new SoilView({meshes:[tile,ground]},soil);
 const rest=view.tiles[0],edited=rest.mesh.geometry,original=tile.geometry;
 assert.equal(rest.rest,original.attributes.position.array);assert.equal(rest.normals,original.attributes.normal.array);
 assert.equal(rest.uv,original.attributes.uv.array);assert.equal(rest.index,original.index.array);
 assert.notEqual(edited.attributes.position.array,rest.rest);
 const initial=edited.attributes.position.array.slice();
 soil.h.fill(.05);soil.layers.forEach((_,i)=>soil.put(i,2,.001));view.refresh();
 assert.notDeepEqual(edited.attributes.position.array,initial);assert.ok(edited.index.count>0);
 soil.h.fill(0);soil.layers.forEach(layers=>layers.length=0);view.refresh();
 assert.deepEqual(edited.attributes.position.array,initial);assert.equal(edited.index.count,0);
});

test('portrait fan reuses the original triangles and the distant shrimp can still use the shipped reduced mesh',()=>{
 const geo=mesh('Neo_REAL002_GameSkin'),source=geo.index.array.slice(),original=geo.attributes.position;
 finishShrimpShell(geo);
 const near=shrimpViewGeometry(geo,true);
 assert.equal(shrimpViewGeometry(near,false),geo);assert.equal(near.attributes.position,geo.attributes.position);
 assert.equal(near.index,geo.index);assert.deepEqual(geo.index.array.slice().sort(),source.sort());
 assert.equal(geo.groups.length,3);assert.equal(near.groups.length,4);
 const fan=near.groups.find(g=>g.materialIndex===3);
 assert.ok(fan.count>0 && fan.count<geo.groups[1].count);
 assert.equal(near.groups.reduce((n,g)=>n+g.count,0),geo.index.count);
 assert.notEqual(geo.attributes.position,original);
 const packed=JSON.parse(readFileSync(asset('neighbour-shrimp.json')));
 assert.equal(reducedGeometry(geo,packed[0]).groups.length,3);
});
