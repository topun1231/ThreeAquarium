import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {FloraView} from '../src/flora-view.js';
import {makeFloraRecord} from '../src/flora.js';
import {plantGhost,disposePlantGhost} from '../src/plant-preview.js';
test('plant preview uses the same stable instances and releases only owned geometry',()=>{
 const aq={root:new T.Group(),materials:[]},flora=new FloraView(aq),soil={sample:()=>.04},runtime={current:{soil,entities:new Map(),habitat:{surfaces:[]}}};
 const record=makeFloraRecord({id:'preview-plant',species:'rotala',variant:0,x:.1,z:.1}),material=new T.MeshBasicMaterial();
 const expected=[...flora.instances([record],runtime.current).values()],ghost=plantGhost(record,runtime,flora,material);
 let sharedDisposed=0,ownedDisposed=0;
 Object.values(flora.units).flat().forEach(g=>g.addEventListener('dispose',()=>sharedDisposed++));
 ghost.children.forEach((m,i)=>{m.geometry.addEventListener('dispose',()=>ownedDisposed++);assert.equal(m.count,expected[i].matrices.length);for(let n=0;n<m.count;n++){const actual=new T.Matrix4();m.getMatrixAt(n,actual);expected[i].matrices[n].elements.forEach((v,k)=>assert.ok(Math.abs(v-actual.elements[k])<1e-6));}});
 const count=ghost.children.length;disposePlantGhost(ghost);assert.equal(ownedDisposed,count);assert.equal(sharedDisposed,0);assert.equal(runtime.current.entities.size,0);
 Object.values(flora.units).flat().forEach(g=>g.dispose());aq.materials.forEach(m=>m.dispose());material.dispose();
});
test('authored preview clips unrevealed leaves and does not alter the source mesh',()=>{
 const unit=new T.BoxGeometry(.1,.1,.1),nodes=new Float32Array(unit.attributes.position.count);nodes.fill(9,12);unit.setAttribute('aqNode',new T.BufferAttribute(nodes,1));
 const material=new T.MeshBasicMaterial(),matrix=new T.Matrix4().makeTranslation(.1,.2,.3),record={Species:'pala'};
 const flora={units:{pala:[unit]},scene:r=>r.current,instances:()=>new Map([['pala',{key:'pala',variant:0,leaves:[6],matrices:[matrix]}]])};
 const ghost=plantGhost(record,{current:{}},flora,material);assert.ok(ghost.children[0].geometry.index.count<unit.index.count);assert.equal(unit.index.count,36);
 disposePlantGhost(ghost);unit.dispose();material.dispose();
});

test('leaf preview preserves alpha cutouts without disposing source textures',()=>{
 const map=new T.Texture(),source=new T.MeshBasicMaterial({map,alphaTest:.5}),geometry=new T.PlaneGeometry(),material=new T.MeshBasicMaterial({transparent:true,opacity:.38});let textureDisposed=false;map.addEventListener('dispose',()=>textureDisposed=true);
 const runtime={current:{soil:{}},plant:()=>new T.Mesh(geometry,[source])};
 const ghost=plantGhost({},runtime,null,material),m=ghost.children[0].material[0];assert.equal(m.map,map);assert.equal(m.alphaTest,.19);assert.notEqual(m,source);
 disposePlantGhost(ghost);assert.equal(textureDisposed,false);map.dispose();source.dispose();geometry.dispose();material.dispose();
});

test('moving a pruned plant releases its preview cuts without disposing shared source geometry',()=>{
 const source=new T.BoxGeometry(),cut=source.clone(),material=new T.MeshBasicMaterial();let cutDisposed=0,sourceDisposed=0;
 cut.addEventListener('dispose',()=>cutDisposed++);source.addEventListener('dispose',()=>sourceDisposed++);
 const runtime={current:{soil:{}},plant:()=>{const group=new T.Group(),mesh=new T.Mesh(cut,material);mesh.userData.ownedGeometry=true;group.add(mesh,new T.Mesh(source,material));return group;}};
 const ghost=plantGhost({},runtime,null,material);disposePlantGhost(ghost);assert.equal(cutDisposed,1);assert.equal(sourceDisposed,0);source.dispose();material.dispose();
});
