import * as T from 'three';

export function oakFloorMaterial(){
  const material=new T.MeshStandardMaterial({color:'#c8a57c',roughness:.83});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 aqBoards;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\naqBoards=position.xz*vec2(40.,26.);');
    shader.fragmentShader='varying vec2 aqBoards;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 p=aqBoards/vec2(1.62,.155);
      float row=floor(p.y);
      p.x+=fract(row*.618)*.94;
      vec2 board=floor(p),uv=fract(p),edge=min(uv,1.-uv);
      float seed=fract(sin(dot(board,vec2(53.7,11.2)))*7919.);
      vec2 seam=1.-smoothstep(vec2(0.),max(vec2(.001,.008),fwidth(p)),edge);
      float arc=length(vec2((uv.x-.6*seed)*.37,uv.y+seed)) * 48.;
      float fibre=cos(arc+sin(p.x*12.+seed))*(1.-smoothstep(.8,2.8,fwidth(arc)));
      diffuseColor.rgb*=vec3(.97+.13*seed,.94+.14*seed,.90+.17*seed)
        *(.96+.048*fibre-.16*max(seam.x,seam.y));`);
  };
  return material;
}

// Fraction of diffuse skylight blocked by a horizontal rectangle, integrated over the hemisphere.
function skyBlocked(x,z,box){
  const h=Math.max(.015,box.height);
  const corner=(u,v)=>{
    const a=Math.hypot(u,h),b=Math.hypot(v,h);
    return u/a*Math.atan(v/a)+v/b*Math.atan(u/b);
  };
  const left=box.x-box.w/2-x,right=left+box.w,near=box.z-box.d/2-z,far=near+box.d;
  return (corner(right,far)-corner(left,far)-corner(right,near)+corner(left,near))/(2*Math.PI);
}

export function shadeFloorUnderFurniture(floor,footprints){
  const size=192, depth=96, data=new Uint8Array(size*depth);
  // The AO patch spans 12 x 6 metres around the cabinet and rack, fixed in room coordinates.
  for(let j=0;j<depth;j++)for(let i=0;i<size;i++){
    const x=-4+(i+.5)*12/size,z=3-(j+.5)*6/depth;
    let cover=0;
    for(const box of footprints)cover=Math.max(cover,skyBlocked(x,z,box));
    data[j*size+i]=Math.round(255*(1.-Math.min(1,cover)));
  }
  const ao=new T.DataTexture(data,size,depth,T.RedFormat);
  ao.minFilter=ao.magFilter=T.LinearFilter;ao.needsUpdate=true;
  // The box top maps +X to U and -Z to V.
  ao.repeat.set(floor.scale.x/12,floor.scale.z/6);
  ao.offset.set((floor.position.x-floor.scale.x/2+4)/12,(3-floor.position.z-floor.scale.z/2)/6);
  floor.material.aoMap=ao;floor.material.aoMapIntensity=.82;
}

// Extend the painted window into the furnished room. Coordinates share the window's wall plane.
export function finishWindowWall(decor,cube,wall,aq,foot){
  if(!wall || wall.material[0]?.name!=='Sunlit window garden')return;
  wall.updateWorldMatrix(true,false);
  const z=decor.worldToLocal(new T.Vector3(0,0,new T.Box3().setFromObject(wall).max.z)).z;
  const dressing=new T.Group();
  decor.add(dressing);wall.attach(dressing);
  const trim=[
    [-1.49,1.568,z-.045,1.86,.07,.086,'#b18152'],
    [-2.364,.983,z-.037,.065,1.13,.075,'#bc9164'],
    [.57,1.56,z-.095,1.25,.045,.21,'#a47850'],
    [.16,1.487,z-.068,.052,.12,.135,'#a67d58'],
    [.98,1.487,z-.068,.052,.12,.135,'#a67d58'],
    [0,-.155,z-.025,13,.038,.05,'#bdab8e'],
    [0,foot+.053,z-.028,13,.106,.056,'#bba387'],
  ];
  const moulding=new T.InstancedMesh(cube,new T.MeshStandardMaterial({roughness:.79}),trim.length);
  const matrix=new T.Matrix4();
  for(const [i,[x,y,depth,width,height,thickness,colour]] of trim.entries()){
    moulding.setMatrixAt(i,matrix.makeScale(width,height,thickness).setPosition(x,y,depth));
    moulding.setColorAt(i,new T.Color(colour));
  }
  moulding.name='Window casing, oak ledge and room moulding';
  moulding.castShadow=moulding.receiveShadow=true;dressing.add(moulding);
  const pot=new T.Mesh(new T.CylinderGeometry(.105,.079,.168,20),new T.MeshStandardMaterial({color:'#b97752',roughness:.9}));
  pot.name='Terracotta on the window ledge';pot.position.set(.78,1.666,z-.11);
  pot.castShadow=pot.receiveShadow=true;dressing.add(pot);
  const atlas=aq.materials.find(m=>m.userData.source?.plantSurface===0 && m.userData.source?.leaf===1)?.map;
  if(atlas){
    const blade=new T.PlaneGeometry(.16,.18,2,2),uv=blade.attributes.uv,vertices=blade.attributes.position;
    for(let i=0;i<uv.count;i++){
      const u=uv.getX(i),v=uv.getY(i);
      uv.setXY(i,u*.5,v*.5);
      vertices.setXYZ(i,vertices.getX(i),v*.18,.026*Math.sin(v*Math.PI)-.018*Math.abs(2.*u-1.));
    }
    blade.computeVertexNormals();
    const foliage=new T.InstancedMesh(blade,new T.MeshStandardMaterial({map:atlas,alphaTest:.45,side:T.DoubleSide,roughness:.83}),9);
    const pose=new T.Object3D();
    for(let i=0;i<foliage.count;i++){
      const angle=i*2.4;
      pose.position.set(.78+.047*Math.cos(angle),1.73,z-.11+.047*Math.sin(angle));
      pose.rotation.set(.32+.64*(i%3)/2,angle,.28*Math.sin(angle),'YXZ');pose.updateMatrix();
      foliage.setMatrixAt(i,pose.matrix);
    }
    foliage.name='Leaves above the painted trailing vine';foliage.castShadow=foliage.receiveShadow=true;dressing.add(foliage);
  }
  const print=aq.materials.find(m=>m.userData.coverPrint)?.userData.coverPrint.value?.image;
  const canvas=print && globalThis.document?.createElement('canvas');
  if(!canvas)return;
  canvas.width=640;canvas.height=480;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#e9dcc1';ctx.fillRect(0,0,640,480);
  ctx.strokeStyle='#b9a383';ctx.lineWidth=2;ctx.strokeRect(24,24,592,432);
  ctx.fillStyle='#7b4033';ctx.font='600 38px "Songti SC", SimSun, serif';ctx.fillText('水晶虾',52,87);
  ctx.drawImage(print,56,75,525,306);
  ctx.beginPath();ctx.moveTo(281,254);ctx.lineTo(235,351);ctx.lineTo(104,351);ctx.stroke();
  ctx.fillStyle='#6d5a43';ctx.font='23px "Microsoft YaHei", sans-serif';ctx.fillText('体色与条带',102,386);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  const frame=new T.Mesh(cube,new T.MeshStandardMaterial({color:'#73573d',roughness:.76}));
  frame.name='Breeding bench study frame';frame.position.set(2.9,1.12,z-.043);frame.scale.set(1.04,.78,.055);
  frame.castShadow=frame.receiveShadow=true;dressing.add(frame);
  const plate=new T.Mesh(new T.PlaneGeometry(.985,.73),new T.MeshStandardMaterial({map,roughness:.96}));
  plate.name='Crystal shrimp field plate';plate.position.set(2.9,1.12,z-.073);plate.scale.z=-1;
  plate.receiveShadow=true;dressing.add(plate);
}
