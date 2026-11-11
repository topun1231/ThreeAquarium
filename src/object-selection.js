import * as T from 'three';
import {plantGhost,disposePlantGhost} from './plant-preview.js';

export function createObjectSelection(root,runtime,flora,camera) {
 const material=new T.MeshBasicMaterial({color:0xffcf58,transparent:true,opacity:.32,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:T.DoubleSide});
 const label=document.createElement('div');label.id='object-selection-label';label.hidden=true;document.body.append(label);
 const anchor=new T.Vector3(),screen=new T.Vector3();let ghost=null,record=null,world=null,stone=false;
 function clear(){if(ghost){if(stone)ghost.removeFromParent();else disposePlantGhost(ghost);}ghost=null;record=null;world=null;label.hidden=true;delete label.dataset.entity;}
 return {
  clear,
  sync(next,name,isStone){
   if(!next){clear();return;}
   if(record!==next||world!==runtime.current){
    clear();stone=isStone;
    ghost=stone?runtime.current.entities.get(next.UniqueId)?.clone(true):plantGhost(next,runtime,flora,material);
    if(!ghost)return;
    ghost.name='Selected object';ghost.userData.entity=next.UniqueId;
    ghost.traverse(o=>{if(o.isMesh){if(stone)o.material=material;o.castShadow=false;o.receiveShadow=false;o.raycast=()=>{};if(o.isInstancedMesh)o.computeBoundingBox();}});
    root.add(ghost);ghost.updateWorldMatrix(true,true);
    const box=new T.Box3().setFromObject(ghost);box.getCenter(anchor);anchor.y=box.max.y;
    record=next;world=runtime.current;
   }
   label.textContent=`已选：${name}`;label.dataset.entity=next.UniqueId;
  },
  update(){
   if(!ghost)return;
   screen.copy(anchor).project(camera);
   label.hidden=document.hidden||screen.z< -1||screen.z>1||Math.abs(screen.x)>1||Math.abs(screen.y)>1;
   if(!label.hidden){label.style.left=`${(screen.x+1)*innerWidth/2}px`;label.style.top=`${Math.max(145,(1-screen.y)*innerHeight/2)}px`;}
  },
 };
}
