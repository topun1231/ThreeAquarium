import * as T from 'three';
import {unityPlantName} from './plant-names.js';

export function plantEditor({aq,model,camera,canvas,getLayout,commit,mode,message}){
 const $=id=>document.getElementById(id),select=$('plant-choice'),undo=[],redo=[];
 let enabled=false,moving=false,chosen=null,busy=false;
 for(const p of model.source.plants){const name=unityPlantName(p.record.TypeId);select.add(new Option(`${select.length+1} · ${name}`,p.record.UniqueId));aq.nodes[p.node].traverse(o=>{o.userData.plantId=p.record.UniqueId;});}
 const marker=new T.Mesh(new T.RingGeometry(.010,.012,40),new T.MeshBasicMaterial({color:0xc7d894,side:T.DoubleSide,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.visible=false;aq.root.add(marker);
 function refresh(){chosen=select.value;const plant=model.byId.get(chosen);marker.visible=enabled;if(plant)marker.position.copy(aq.nodes[plant.node].position).add(new T.Vector3(0,.004,0));$('edit-plants').textContent=enabled?'完成调整':'调整水草';$('edit-plants').setAttribute('aria-pressed',String(enabled));$('plant-controls').hidden=!enabled;$('plant-move').textContent=moving?'点击底床落点 · Esc 取消':'移动到新位置';$('plant-undo').disabled=!undo.length||busy;$('plant-redo').disabled=!redo.length||busy;}
 async function change(next,kind='edit'){
  if(busy)return false;busy=true;refresh();const before=structuredClone(getLayout());
  try{await commit(next);if(kind==='undo'){undo.pop();redo.push(before);}else if(kind==='redo'){redo.pop();undo.push(before);}else{undo.push(before);if(undo.length>30)undo.shift();redo.length=0;}moving=false;message('水草位置已保存，虾的接触面与路线已更新');return true;}catch(e){message(e.message);return false;}finally{busy=false;refresh();}
 }
 function rotate(degrees){if(!enabled||busy)return;try{const p=model.byId.get(chosen),n=model.pack.nodes[p.node],e=getLayout().find(e=>e.id===chosen)||{x:n.p[0],z:n.p[2],yaw:0};void change(model.edit(getLayout(),chosen,e.x,e.z,e.yaw+degrees*Math.PI/180));}catch(e){message(e.message);}}
 $('edit-plants').onclick=()=>{if(busy)return;enabled=!enabled;moving=false;mode(enabled);refresh();message(enabled?'模拟暂时停下。点击水草或从列表选择，再移动或旋转。':'已恢复调整前的模拟状态');};
 select.onchange=()=>{moving=false;refresh();};$('plant-left').onclick=()=>rotate(-15);$('plant-right').onclick=()=>rotate(15);
 $('plant-move').onclick=()=>{moving=!moving;refresh();message('点击裸露底床放置，Esc 取消；拖动仍可转动镜头');};
 $('plant-undo').onclick=()=>{if(undo.length)void change(undo.at(-1),'undo');};$('plant-redo').onclick=()=>{if(redo.length)void change(redo.at(-1),'redo');};
 function click(e){
  if(!enabled)return false;if(busy)return true;
  const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(e.clientX/canvas.clientWidth*2-1,1-e.clientY/canvas.clientHeight*2),camera);
  if(moving){try{const r=ray.ray.clone();r.origin.z*=-1;r.direction.z*=-1;let hit=null;
    for(const s of model.baseHabitat.surfaces.filter(s=>s.kind!==3)){const h=s.bvh.raycastFirst(r,T.DoubleSide);if(h&&(!hit||h.distance<hit.distance))hit={...h,kind:s.kind};}
    if(!hit||hit.kind!==0)throw new Error('请选择裸露的底床，不要点在木石上');
    const yaw=getLayout().find(p=>p.id===chosen)?.yaw||0;void change(model.edit(getLayout(),chosen,hit.point.x,hit.point.z,yaw));
   }catch(err){message(err.message);}return true;
  }
  const hit=ray.intersectObjects(aq.meshes.filter(m=>m.userData.plantId),false)[0];if(hit){select.value=hit.object.userData.plantId;refresh();}return true;
 }
 function key(e){if(!enabled)return false;if(e.key==='Escape'){moving=false;refresh();return true;}if(e.key.toLowerCase()==='q'){rotate(-15);return true;}if(e.key.toLowerCase()==='e'){rotate(15);return true;}return false;}
 refresh();return {click,key,refresh,clearHistory(){undo.length=redo.length=0;moving=false;refresh();},get enabled(){return enabled;},get selected(){return chosen;}};
}
