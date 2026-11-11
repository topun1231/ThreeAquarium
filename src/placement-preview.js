import * as T from 'three';
import {releasePose,queueHardscapeDrop} from './hardscape-drop.js';
import {plantGhost,disposePlantGhost} from './plant-preview.js';
export {createHardscapeProbe} from './hardscape-probe.js';



export const soilTools=new Set(['pour','return','push','pull','finish','level']);
export function insideSoil(soil,p) { return !!p && Math.abs(p.x)<=soil.Width/2-.002 && Math.abs(p.z)<=soil.Depth/2-.002; }

export function soilFootprint(soil,p,tool,heavy=false,direction={x:1,z:0}) {
  const points=[], radius=tool==='pour'||tool==='return'?.12:.13;
  const at=(x,z)=>{
    x=T.MathUtils.clamp(x,-soil.Width/2+.002,soil.Width/2-.002);z=T.MathUtils.clamp(z,-soil.Depth/2+.002,soil.Depth/2-.002);
    return [x,soil.sample(x,z)+soil.crest(x,z)+.002,z];
  };
  const segment=(a,b)=>points.push(...at(...a),...at(...b));
  if(tool==='push'||tool==='pull') {
    const width=heavy?.16:.10,reach=heavy?.12:.068,sign=tool==='pull'?-1:1;
    const x=direction.x*sign,z=direction.z*sign;
    const local=(across,along)=>[p.x+along*x-across*z,p.z+along*z+across*x];
    const corners=[[-width*.58,-.027],[width*.58,-.027],[width*.58,reach],[-width*.58,reach]];
    for(let i=0;i<4;i++)for(let j=0;j<12;j++){
      const a=corners[i],b=corners[(i+1)%4];segment(local(a[0]+(b[0]-a[0])*j/12,a[1]+(b[1]-a[1])*j/12),local(a[0]+(b[0]-a[0])*(j+1)/12,a[1]+(b[1]-a[1])*(j+1)/12));
    }
    segment(local(0,0),local(0,reach));segment(local(0,reach),local(-.01,reach-.018));segment(local(0,reach),local(.01,reach-.018));
  } else for(let i=0;i<64;i++) if(i%8<5) {
    const a=i*Math.PI/32,b=(i+1)*Math.PI/32;
    segment([p.x+Math.cos(a)*radius,p.z+Math.sin(a)*radius],[p.x+Math.cos(b)*radius,p.z+Math.sin(b)*radius]);
  }
  segment([p.x-.005,p.z],[p.x+.005,p.z]);segment([p.x,p.z-.005],[p.x,p.z+.005]);
  return points;
}

export function createPlacementPreview(aq,runtime,{flora,plantAt,movePlantAt}={}) {
  const root=new T.Group();root.name='Placement preview';root.visible=false;aq.root.add(root);
  const material=new T.MeshBasicMaterial({color:'#9ddbaa',transparent:true,opacity:.38,depthWrite:false,side:T.DoubleSide});
  const line=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#eacb72',depthWrite:false}));line.renderOrder=5;line.frustumCulled=false;root.add(line);
  const label=document.createElement('div');label.id='placement-hint';label.hidden=true;document.body.append(label);
  let model=null,modelKey='',ghost=null,error=null,version=0,last=null,world=null;

  let direction={x:1,z:0};
  let plant=null,plantStamp='',plantResult=null,plantLoading=null,plantError=null;
  function clearPlant(){disposePlantGhost(plant);plant=null;plantStamp='';plantResult=null;}
  function clearGhost(){ghost?.removeFromParent();ghost=null;}
  function release(){model=null;modelKey='';clearGhost();last=null;}
  function tint(node){node.traverse(o=>{if(o.isMesh){o.material=material;o.castShadow=false;o.receiveShadow=false;o.renderOrder=4;}});return node;}
  function request(key,moving){
    const stamp=key+':'+JSON.stringify(moving||null);if(stamp===modelKey)return;
    release();modelKey=stamp;error=null;const token=++version;
    const record=moving?structuredClone(moving):{UniqueId:'placement-preview',TypeId:key,Position:{x:0,y:0,z:0},Rotation:{x:0,y:0,z:0},Scale:{x:1,y:1,z:1},Burial:.003};
    runtime.ensureCatalog().then(()=>{if(token!==version)return;const node=runtime.hardscape(record);node.updateMatrixWorld(true);model={node,record};ghost=tint(node.clone(true));root.add(ghost);queueHardscapeDrop(runtime,record,!!moving);}).catch(e=>{if(token===version)error=e.message;});
  }
  function hide(){root.visible=false;label.hidden=true;}
  return {root,hide,
    update({point,hit,tool,key,plantKey,moving=null,heavy=false,screen,force=false}) {
      const current=runtime.current;if(!current||!point){hide();return null;}
      root.visible=true;label.hidden=false;label.style.left=Math.min(innerWidth-240,Math.max(8,screen.clientX+18))+'px';label.style.top=Math.max(8,Math.min(innerHeight-65,screen.clientY-40))+'px';
      const movingPlant=tool==='move-plant',movingStone=tool==='move-stone';
      if(tool!=='plant'&&!movingPlant&&plantStamp)clearPlant();
      if(tool==='plant'||movingPlant){
        if(modelKey){version++;release();}line.visible=false;
        if(!runtime.catalog){
          if(!plantLoading&&!plantError)plantLoading=runtime.ensureCatalog().catch(e=>{plantError=e.message;}).finally(()=>{plantLoading=null;});
          label.textContent=plantError||'正在准备水草预览…';root.userData={tool,valid:false};return null;
        }
        const stamp=(movingPlant?JSON.stringify(moving):plantKey)+':'+[point.x,point.y,point.z].map(v=>v.toFixed(5)).join(':')+':'+(hit?.object.userData.entity||'');
        if(force||stamp!==plantStamp||world!==current){
          clearPlant();plantStamp=stamp;world=current;
          try{const record=movingPlant?movePlantAt(point,hit):plantAt(point,hit);plant=plantGhost(record,runtime,flora,material);root.add(plant);plantResult={valid:true,record};}
          catch(e){plantResult={valid:false,reason:e.message};}
        }
        const valid=plantResult?.valid;material.color.set(valid?'#9ddbaa':'#ff6555');
        if(!valid){const x=point.x,y=point.y+.002,z=point.z,r=.012;line.geometry.setAttribute('position',new T.Float32BufferAttribute([x-r,y,z-r,x+r,y,z+r,x-r,y,z+r,x+r,y,z-r],3));line.material.color.set('#ff6555');line.visible=true;}
        label.textContent=valid?(movingPlant?'移动落点 · 左键确认 · Esc 取消':plantResult.record.Host?'附着位置 · 左键种植':'种植位置 · 左键种植'):plantResult?.reason||'请选择种植位置';
        root.userData={tool,valid:!!valid,reason:label.textContent,record:plantResult?.record};return plantResult;
      }
      if(soilTools.has(tool)) {
        if(modelKey){version++;release();}line.visible=true;
        const valid=insideSoil(current.soil,point),previous=last;last={...point};
        if(previous){const x=point.x-previous.x,z=point.z-previous.z,d=Math.hypot(x,z);if(d>.001)direction={x:x/d,z:z/d};}
        const data=soilFootprint(current.soil,point,tool,heavy,direction),a=line.geometry.attributes.position;
        if(a?.array.length===data.length){a.array.set(data);a.needsUpdate=true;}else line.geometry.setAttribute('position',new T.Float32BufferAttribute(data,3));
        line.material.color.set(valid?'#eacb72':'#ed705d');
        label.textContent=valid?({pour:'铺土落点 · 虚线内落土',return:'回收范围',level:'整平范围',finish:'细整范围',push:'推土范围 · 箭头为推向',pull:'拉土范围 · 箭头为拉向'})[tool]:'超出缸底，不能铺土';
        root.userData={tool,valid,point:{...point}};return {valid};
      }
      line.visible=false;
      if(tool!=='stone'&&!movingStone){if(modelKey){version++;release();}hide();return null;}
      request(key,moving);
      if(!model){label.textContent=error||'正在准备木石模型…';root.userData={tool,valid:false};return null;}
      const result=!movingStone&&current.save.Tank.Hardscape.length>=24?{valid:false,reason:'每缸最多 24 件木石'}:releasePose(model.node,model.record,point,current,movingStone);
      if(result.record){const p=result.record.Position,b=model.record.Position;ghost.position.copy(model.node.position).add(new T.Vector3(p.x-b.x,p.y-b.y,p.z-b.z));}
      ghost.visible=!!result.record;material.color.set(result.valid?'#9ddbaa':'#ff6555');label.textContent=result.reason;
      root.userData={tool,valid:result.valid,pending:false,reason:result.reason,point:{...point},record:result.record,drop:true};
      return {...result,drop:true};
    },
    reset(){version++;error=null;release();clearPlant();plantError=null;hide();},
    dispose(){version++;release();clearPlant();line.geometry.dispose();line.material.dispose();material.dispose();aq.root.remove(root);label.remove();},
  };
}
