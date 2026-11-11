import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createObjectSelection} from '../src/object-selection.js';

test('selected object stays marked without rebuilding and releases only owned resources',()=>{
 const previous=globalThis.document,label={dataset:{},style:{}};
 globalThis.document={createElement:()=>label,body:{append(){}}};
 const root=new T.Group(),geometry=new T.BoxGeometry(),sourceMaterial=new T.MeshBasicMaterial(),source=new T.Mesh(geometry,sourceMaterial);
 source.userData.ownedGeometry=true;source.position.set(.2,.3,.4);
 const runtime={current:{entities:new Map([['rock',source]]),soil:{}},plant:()=>new T.Mesh(geometry,sourceMaterial)};
 let sharedDisposed=0;geometry.addEventListener('dispose',()=>sharedDisposed++);
 try{
  const selection=createObjectSelection(root,runtime,null,new T.PerspectiveCamera()),rock={UniqueId:'rock'};
  selection.sync(rock,'石头 · 第1件',true);const ghost=root.children[0];
  assert.equal(label.textContent,'已选：石头 · 第1件');assert.equal(label.dataset.entity,'rock');
  assert.deepEqual(ghost.position,source.position);assert.notEqual(ghost.material,source.material);
  assert.equal(ghost.material.depthWrite,false);assert.equal(ghost.castShadow,false);
  selection.sync(rock,'石头 · 第1件',true);assert.equal(root.children[0],ghost);
  selection.clear();assert.equal(sharedDisposed,0);assert.equal(root.children.length,0);assert.equal(label.hidden,true);
  const owned=geometry.clone();let ownedDisposed=0;owned.addEventListener('dispose',()=>ownedDisposed++);
  runtime.plant=()=>{const mesh=new T.Mesh(owned,sourceMaterial);mesh.userData.ownedGeometry=true;return mesh;};
  selection.sync({UniqueId:'plant'},'水草 · 第1株',false);selection.clear();selection.clear();
  assert.equal(ownedDisposed,1);assert.equal(sharedDisposed,0);assert.equal(label.dataset.entity,undefined);
  assert.equal(source.material,sourceMaterial);assert.equal(source.geometry,geometry);
 }finally{globalThis.document=previous;geometry.dispose();sourceMaterial.dispose();}
});
