import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone,BufferAttribute,Group,MeshBasicMaterial,PerspectiveCamera,PlaneGeometry,Raycaster,Skeleton,SkinnedMesh,Vector2,Vector3} from 'three';
import {createShrimpPicker,shrimpContactVisible} from '../src/shrimp-picking.js';

const camera=new PerspectiveCamera(90,1,.01,10);
camera.updateMatrixWorld();
function shrimp(id,x=0,z=-2,size=.12){
  const geometry=new PlaneGeometry(size,size), count=geometry.attributes.position.count;
  geometry.setAttribute('skinIndex',new BufferAttribute(new Uint16Array(count*4),4));
  const weights=new Float32Array(count*4);
  for(let i=0;i<count;i++)weights[i*4]=1;
  geometry.setAttribute('skinWeight',new BufferAttribute(weights,4));
  const mesh=new SkinnedMesh(geometry,new MeshBasicMaterial()), bone=new Bone();
  mesh.userData.creatureId=id;
  mesh.position.set(x,0,z);mesh.add(bone);mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton([bone]));mesh.updateMatrixWorld(true);
  return mesh;
}
const pick=createShrimpPicker();
function at(meshes,x,padding=4,blocked=null,contact){
  const pointer=new Vector2(x/100,0), ray=new Raycaster();
  ray.setFromCamera(pointer,camera);
  return pick(meshes,camera,ray.ray,pointer,{width:200,height:200},padding,blocked,contact);
}

test('a tap follows the touched part of a flexing shell and checks its new line of sight',()=>{
  const mesh=shrimp('moving'), contact={}, end=new Vector3();
  assert.equal(at([mesh],6,4,null,contact),'moving');
  const locate=(eye,direction,distance)=>{end.copy(eye).addScaledVector(direction,distance);return false;};
  assert.ok(shrimpContactVisible(contact,camera,locate));
  assert.ok(end.distanceTo(new Vector3(.06,0,-2))<1e-6);
  mesh.skeleton.bones[0].position.set(.15,.08,0);mesh.updateMatrixWorld(true);
  assert.equal(at([mesh],0),null);
  assert.ok(shrimpContactVisible(contact,camera,locate));
  assert.ok(end.distanceTo(new Vector3(.21,.08,-2))<1e-6);
  assert.equal(shrimpContactVisible(contact,camera,(_eye,d)=>d.x>.09),false);
});

test('a pressed shell must still belong to the visible resident inside the frame',()=>{
  const mesh=shrimp('initial'), contact={}, group=new Group();group.add(mesh);
  assert.equal(at([mesh],0,4,null,contact),'initial');
  group.visible=false;assert.equal(shrimpContactVisible(contact,camera),false);group.visible=true;
  mesh.userData.creatureId='other';assert.equal(shrimpContactVisible(contact,camera),false);mesh.userData.creatureId='initial';
  for(const [x,z] of [[5,-2],[0,-12],[0,1]]){
    mesh.position.set(x,0,z);mesh.updateMatrixWorld(true);
    assert.equal(shrimpContactVisible(contact,camera),false);
  }
  assert.equal(at([],0,4,null,contact),null);
  assert.equal(shrimpContactVisible(contact,camera),false);
});

test('a small moving shrimp can be tapped near its visible shell in CSS pixels',()=>{
  const small=shrimp('juvenile',0,-2,.04);
  assert.equal(at([small],0),'juvenile');
  assert.equal(at([small],4),'juvenile');
  assert.equal(at([small],8),null);
  assert.equal(at([small],8,9),'juvenile');
  assert.equal(at([small],11,9),null);
  small.skeleton.bones[0].position.x=.6;
  small.updateMatrixWorld(true);
  assert.equal(at([small],0,9),null);
  assert.equal(at([small],30),'juvenile');
});

test('a direct hit wins over a nearby shrimp, and overlapping shells resolve by depth',()=>{
  const front=shrimp('front',.12,-1), middle=shrimp('middle'), far=shrimp('far',0,-3);
  for(const list of [[far,middle,front],[front,middle,far]]){
    assert.equal(at(list,0,9),'middle');
    assert.equal(at(list,9,9),'front');
  }
  const closerEdge=shrimp('closer edge',-.12);
  assert.equal(at([middle,closerEdge],-6),'closer edge');
});

test('both the cursor and the chosen edge must have an unobstructed path',()=>{
  const mesh=shrimp('I1');
  assert.equal(at([mesh],6),'I1');
  assert.equal(at([mesh],6,4,(_eye,dir)=>dir.x>.045),null);
  assert.equal(at([mesh],6,4,(_eye,dir)=>dir.x<.045),null);
  const distances=[];
  assert.equal(at([mesh],0,4,(_eye,_dir,d)=>{distances.push(d);return d>1.9;}),null);
  assert.equal(distances.length,1);
});

test('hidden ancestors, replaced shrimp and surfaces beyond the camera are excluded',()=>{
  const old=shrimp('old'), current=shrimp('current'), group=new Group();
  group.add(old);group.visible=false;
  assert.equal(at([old,current],0),'current');
  assert.equal(at([],0),null);
  current.visible=false;
  assert.equal(at([old,current,shrimp('behind',0,2),shrimp('far',0,-12)],0),null);
});

test('picking a blended, morphed shell agrees with native skinning after each pose change',()=>{
  const mesh=shrimp('juvenile',0,0,.42), geometry=mesh.geometry, count=geometry.attributes.position.count;
  const tail=new Bone();
  mesh.add(tail);
  const root=new Group();
  root.position.set(.07,0,-2);root.scale.set(.85,1.1,1);
  root.add(mesh);root.updateMatrixWorld(true);
  mesh.bind(new Skeleton([mesh.skeleton.bones[0],tail]));
  const indices=new Uint16Array(count*4), weights=new Uint8Array(count*4), morph=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    indices[i*4+1]=1;weights[i*4]=102;weights[i*4+1]=153;
    morph[i*3+1]=i%2 ? .08 : -.02;
  }
  geometry.setAttribute('skinIndex',new BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new BufferAttribute(weights,4,true));
  geometry.morphTargetsRelative=true;
  geometry.morphAttributes.position=[new BufferAttribute(morph,3)];
  mesh.updateMorphTargets();
  const native=mesh.getVertexPosition, ray=new Raycaster(), pointer=new Vector2();
  function sample(){
    const ids=[];
    for(let y=-18;y<=18;y+=3)for(let x=-24;x<=32;x+=2){
      pointer.set(x/100,y/100);ray.setFromCamera(pointer,camera);
      ids.push(pick([mesh],camera,ray.ray,pointer,{width:200,height:200},4));
    }
    return ids;
  }
  const poses=[];
  for(const t of [0,.75]){
    tail.position.x=t*.31;tail.rotation.z=-t;
    mesh.rotation.z=t*.6;mesh.morphTargetInfluences[0]=t;
    root.updateMatrixWorld(true);
    const result=sample();
    // A custom vertex getter follows the native mesh path in the picker.
    mesh.getVertexPosition=function(i,p){return native.call(this,i,p);};
    assert.deepEqual(result,sample());
    delete mesh.getVertexPosition;
    assert.ok(result.includes(null) && result.includes('juvenile'));
    poses.push(result);
  }
  assert.notDeepEqual(poses[0],poses[1]);
});
