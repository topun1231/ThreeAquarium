import * as THREE from 'three';
import {readAsset,readTexture} from './asset-read.js';
import {attributeArray, stableSeed} from './state.js';
import {addWindowShadow,crafted,windowGardenMaterial} from './crafted.js';
import {createWallAlmanac} from './wall-almanac.js';
import {illustrateHardscape,isPaintedHardscape} from './illustrated-look.js';
import {highestDetailDraws} from './asset-lod.js';
import {finishAquariumGeometry,finishShrimpShell,shrimpViewGeometry} from './aquarium-geometry.js';

const ROOT='/assets/';
const vector=a=>new THREE.Vector3(...a);
export async function loadAquarium(onProgress=()=>{},source=null) {
  const [pack,buffer]=source?[source.pack,source.buffer]:await Promise.all([readAsset(ROOT+'scene.json'),readAsset(ROOT+'geometry.bin','arrayBuffer')]);
  if(pack.version!=='unity-source-1')throw new Error('场景版本不支持');
  const clock={value:0};const loader=new THREE.TextureLoader();
  const textureCache=source?.textureCache??new Map(),pendingTextures=new Map();
  function texture(file,srgb=false,tiling=[1,1,0,0]) {
    if(!file)return null;
    const key=file+':'+srgb+':'+tiling.join(',');
    if(textureCache.has(key))return textureCache.get(key);
    if(!pendingTextures.has(key))pendingTextures.set(key,readTexture(loader,ROOT+file,source?.signal,!source).then(t=>{
      source?.signal?.throwIfAborted();
      t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
      t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(tiling[0],tiling[1]);t.offset.set(tiling[2],tiling[3]);t.anisotropy=4;
      // A canceled catalogue read must not leave a rejected promise in the scene cache.
      textureCache.set(key,t);
      return t;
    }));
    return pendingTextures.get(key);
  }
  let loaded=0;
  const materials=await Promise.all(pack.materials.map(async m=>{
    const [map,normalMap,roughnessMap,aoMap,metalMap,thicknessMap]=await Promise.all([texture(m.map,true,m.tiling),texture(m.normal,false,m.tiling),texture(m.roughnessMap,false,m.tiling),texture(m.aoMap,false,m.tiling),texture(m.metalMap,false,m.tiling),texture(m.thicknessMap,false,m.tiling)]);
    const material=new THREE.MeshStandardMaterial({name:m.name,color:new THREE.Color().fromArray(m.color).convertSRGBToLinear(),map,normalMap,roughnessMap,aoMap,roughness:m.leaf>=0?.65:Math.max(.12,m.roughness),metalness:m.metalness,opacity:m.opacity,transparent:m.transparent,alphaTest:m.cutoff,side:m.doubleSided?THREE.DoubleSide:THREE.FrontSide});
    if(m.shader.includes('WaterAwareGlass')||m.shader.includes('ClearWaterSurface')){material.transparent=true;material.opacity=m.shader.includes('Glass')?.045:.12;material.depthWrite=false;material.roughness=.12;material.color.set('#96b5a5');material.side=THREE.DoubleSide;}
    if(normalMap)material.normalScale.setScalar(m.leaf>=0?.45:1);
    if(metalMap){
      material.roughnessMap=metalMap;material.metalnessMap=metalMap;material.metalness=1;
      material.onBeforeCompile=shader=>{shader.uniforms.aqSmoothness={value:1-m.roughness};shader.fragmentShader='uniform float aqSmoothness;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`float roughnessFactor=roughness;
          #ifdef USE_ROUGHNESSMAP
          roughnessFactor=1.-texture2D(roughnessMap,vRoughnessMapUv).a*aqSmoothness;
          #endif`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`float metalnessFactor=metalness;
          #ifdef USE_METALNESSMAP
          metalnessFactor*=texture2D(metalnessMap,vMetalnessMapUv).r;
          #endif`);
      };material.customProgramCacheKey=()=> 'unity-metal-smooth-v1';
    }
    if(m.leaf>=0){
      material.userData.leafClock=clock;
      const stemLeaf=m.plantSurface===0 && m.leaf>0 && !!map;
      // Preserve the existing leaf bend and pigment parameters; shadows use the same deformation.
      const patch=(shader,pigment)=>{
        shader.uniforms.aqTime=clock;shader.uniforms.aqThickness={value:thicknessMap};shader.uniforms.aqSoftNormal={value:m.softNormal||0};shader.uniforms.aqTransmission={value:m.transmission??.1};
        for(const [key,value] of Object.entries({aqPhase:m.phase,aqMotion:m.motion,aqLowGrass:m.lowGrass,aqLeaf:m.leaf,aqVariation:m.plantVariation-.5}))shader.uniforms[key]={value};
        const uniforms='uniform float aqPhase,aqMotion,aqLowGrass,aqLeaf,aqVariation;\n';
        shader.fragmentShader='uniform sampler2D aqThickness;uniform float aqSoftNormal,aqTransmission;\n'+uniforms+shader.fragmentShader;
        if(m.motion!==0) {
          shader.vertexShader=uniforms+'uniform float aqTime;\nattribute vec4 branchData;\nattribute vec4 plantWeights;\n'+shader.vertexShader;
          const bend=`float t=aqTime;float phase=aqPhase;float motion=aqMotion;float h=clamp((position.y-.025)/.40,0.,1.);float w=h*h;float local=clamp((position.y-branchData.x)/.23,0.,1.);local=local*local*branchData.y;
          if(aqLowGrass>.5){w=plantWeights.r;phase+=branchData.z;transformed.x+=motion*w*(sin(t*.58+phase)*.0016+sin(t*.31+phase*.7)*.00045);transformed.z+=motion*w*sin(t*.46+phase+.8)*.0011;}
          else {transformed.x+=motion*(w*(sin(t*.64+phase)*.0038+sin(t*.39+phase)*.0012)+local*sin(t*.55+branchData.z+phase)*.0025);transformed.z+=motion*(w*sin(t*.48+.9+phase)*.002+local*sin(t*.42+branchData.z+phase)*.0014);transformed.y+=motion*aqLeaf*plantWeights.b*plantWeights.b*h*sin(t*.81+branchData.w+phase)*.0008;}`;
          const flow='vec3 aqFlow(vec3 position){vec3 transformed=position;'+bend+'return transformed;}\n';
          shader.vertexShader=shader.vertexShader.replace('void main() {',flow+'void main() {');
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=aqFlow(position);');
          shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
            vec3 aqT;float aqSign=1.;
            #ifdef USE_TANGENT
            aqT=normalize(tangent.xyz);aqSign=tangent.w;
            #else
            aqT=normalize(cross(abs(objectNormal.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.),objectNormal));
            #endif
            vec3 aqB=cross(objectNormal,aqT)*aqSign;vec3 aqP=aqFlow(position);
            vec3 aqDt=aqFlow(position+aqT*.0003)-aqP,aqDb=aqFlow(position+aqB*.0003)-aqP;
            objectNormal=normalize(cross(aqDt,aqDb))*aqSign;
            #ifdef USE_TANGENT
            objectTangent=normalize(aqDt);
            #endif`);
        }
        if(pigment){
          // Lift brightness at constant pigment ratios; repeated per-channel lifts bleach the leaf atlas.
          shader.fragmentShader=`vec3 aqLiftPigment(vec3 rgb){
            return rgb*inversesqrt(max(.001,max(rgb.r,max(rgb.g,rgb.b))));
          }\n`+shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal+mat3(viewMatrix)*vec3(0.,.70*aqSoftNormal,0.));');
        }
        if(pigment)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',`#include <lights_physical_pars_fragment>
          void AQLeafDirect(const in IncidentLight light,const in vec3 p,const in vec3 n,const in vec3 v,const in vec3 nc,const in PhysicalMaterial material,inout ReflectedLight reflectedLight){
            RE_Direct_Physical(light,p,n,v,nc,material,reflectedLight);
            float d=dot(n,light.direction);
            float wrap=max(0.,clamp((d+.4)/1.4,0.,1.)-clamp(d,0.,1.))*.30;
            float thin=max(0.,-d)*aqTransmission*(.55+${thicknessMap&&m.map?'(1.-texture2D(aqThickness,vMapUv).r)':'0.'}*.45);
            ${stemLeaf?'thin += .12*max(0.,-d);':''}
            vec3 leaf=material.diffuseColor;
            vec3 transmitted=mix(leaf,aqLiftPigment(leaf),.25)*vec3(.85,1.04,.62);
            reflectedLight.directDiffuse+=light.color*aqLeaf*(leaf*wrap+transmitted*thin);
          }
          #undef RE_Direct
          #define RE_Direct AQLeafDirect`);
        if(pigment && stemLeaf)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          // Thin leaves also transmit the room's diffuse daylight inside the wood's shadow.
          reflectedLight.indirectDiffuse += irradiance * diffuseColor.rgb * vec3(.10,.16,.06);`);
        if(pigment&&m.map){
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
            #ifdef USE_MAP
            // Keep the original leaf hue, including red cultivars, in the shaded halves.
            diffuseColor.rgb = mix(diffuseColor.rgb, aqLiftPigment(diffuseColor.rgb), ${stemLeaf?'.08':'.33'}*aqLeaf);
            ${m.plantSurface>.5&&m.plantSurface<1.5?`
              // Three blades share this atlas. Paint along each blade's own midrib.
              float blade = fract(vMapUv.x*3.)-.5;
              float lengthwise = smoothstep(.10,.91,vMapUv.y);
              float footprint = max(.003,fwidth(vMapUv.x)*3.);
              float rib = 1.-smoothstep(.012,.024+footprint,abs(blade));
              rib *= (1.-smoothstep(.06,.24,footprint))*lengthwise;
              vec3 base = mix(vec3(.48,.86,.52),vec3(.94,1.09,.53),lengthwise);
              diffuseColor.rgb *= base*vec3(1.+aqVariation*.12,1.+aqVariation*.065,1.-aqVariation*.10);
              diffuseColor.rgb *= 1.+.24*rib;
            `:m.plantSurface>1.5?`float age=aqVariation+(floor(vMapUv.x*3.)-1.)*.18;diffuseColor.rgb*=vec3(1.+age*.16,1.+age*.055,1.-age*.10)*mix(.92,1.035,clamp(vMapUv.y,0.,1.));`:stemLeaf?`
              // Each tile in the 2-by-2 stem atlas holds one whole leaf.
              vec2 blade=fract(vMapUv*2.);
              float face=smoothstep(.16,.84,blade.x)*.48+smoothstep(.08,.92,blade.y)*.52;
              diffuseColor.rgb*=mix(vec3(.65,.83,.72),vec3(.94,1.04,.72),face);
            `:''}
            #endif`);
        }
      };
      material.onBeforeCompile=s=>patch(s,true);material.customProgramCacheKey=()=> 'leaf-'+(m.motion!==0)+'-'+(m.map?1:0)+'-'+(thicknessMap?1:0)+'-'+(stemLeaf?'round':m.plantSurface>1.5?2:m.plantSurface>.5?1:0);
      material.userData.depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map,alphaTest:m.cutoff,side:THREE.DoubleSide});material.userData.depth.onBeforeCompile=s=>patch(s,false);material.userData.depth.customProgramCacheKey=()=> 'leaf-depth-'+(m.motion!==0);
    }
    crafted(material,m,clock);
    if(isPaintedHardscape(material))illustrateHardscape(material);
    material.userData.source=m;onProgress(`材质 ${++loaded}/${pack.materials.length}`);return material;
  }));
  const geometries=pack.geometries.map((g,id)=>{
    const geo=new THREE.BufferGeometry();geo.name=g.name;
    geo.userData.neighbourId=id;
    geo.userData.neighbourPack=source?'catalog':'scene';
    for(const [key,field] of [['position','position'],['normal','normal'],['uv','uv'],['uv1','uv'],['tangent','tangent'],['branchData','uv1'],['plantWeights','color'],['skinIndex','skinIndex'],['skinWeight','skinWeight']]){
      const a=attributeArray(buffer,g[field]);if(a)geo.setAttribute(key,new THREE.BufferAttribute(key==='skinIndex'?new Uint16Array(a):a,g[field].size));
    }
    const idx=attributeArray(buffer,g.index);geo.setIndex(new THREE.BufferAttribute(idx.slice(),1));
    // Exported Unity winding is left-handed. Check against actual authored normals before conversion.
    if(geo.attributes.normal){let agreement=0;const p=geo.attributes.position,n=geo.attributes.normal,a=new THREE.Vector3(),b=a.clone(),c=a.clone(),normal=a.clone();
      for(let i=0;i<idx.length;i+=Math.max(3,Math.floor(idx.length/300)*3)){a.fromBufferAttribute(p,idx[i]);b.fromBufferAttribute(p,idx[i+1]);c.fromBufferAttribute(p,idx[i+2]);normal.fromBufferAttribute(n,idx[i]);agreement+=b.sub(a).cross(c.sub(a)).dot(normal);}
      if(agreement<0){geo.userData.neighbourFlipped=true;const a=geo.index.array;for(let i=0;i<a.length;i+=3){const t=a[i+1];a[i+1]=a[i+2];a[i+2]=t;}}
    }
    for(const group of g.groups)geo.addGroup(group.start,group.count,group.material);
    finishAquariumGeometry(geo);
    finishShrimpShell(geo);
    if(!geo.attributes.normal)geo.computeVertexNormals();
    geo.computeBoundingBox();geo.computeBoundingSphere();return geo;
  });
  const root=new THREE.Group();root.name='Imported aquarium';root.scale.z=-1;
  const nodes=pack.nodes.map(n=>{const o=n.bone?new THREE.Bone():new THREE.Group();o.name=n.name;o.position.fromArray(n.p);o.quaternion.fromArray(n.q);o.scale.fromArray(n.s);return o;});
  pack.nodes.forEach((n,i)=>(n.parent<0?root:nodes[n.parent]).add(nodes[i]));root.updateMatrixWorld(true);
  const meshes=[];
  highestDetailDraws(pack).forEach(d=>{
    const geo=geometries[d.geo],mat=d.materials.map(i=>materials[i]);
    if(shrimpViewGeometry(geo,true)!==geo){
      const membrane=mat[1].clone();
      membrane.name='Shell tail membrane';membrane.transparent=true;membrane.depthWrite=false;
      mat.push(membrane);
    }
    const mesh=d.bones?.length?new THREE.SkinnedMesh(geo,mat):new THREE.Mesh(geo,mat);
    mesh.name=nodes[d.node].name;mesh.castShadow=d.castShadow;mesh.receiveShadow=d.receiveShadow;
    nodes[d.node].add(mesh);mesh.updateMatrixWorld(true);
    if(mesh.name==='Single solid walnut surface') {
      // The original front view cropped the furniture below this unit-cube tabletop.
      const doors=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({
        color:0xd5bd99,roughness:.91
      }),24);
      doors.name='Window-side cabinet';doors.castShadow=doors.receiveShadow=true;
      const transform=new THREE.Matrix4(),pullColour=new THREE.Color('#6c5847');
      for(let i=0;i<4;i++){
        const x=(i-1.5)*.24;
        doors.setMatrixAt(i,transform.makeScale(.238,10,.92).setPosition(x,-5.5,0));
        doors.setColorAt(i,new THREE.Color(0xffffff));
        doors.setMatrixAt(i+4,transform.makeScale(.065,.15,.020).setPosition(x,-1.35,-.477));
        doors.setColorAt(i+4,pullColour);
        // The rails stand proud of the central door panel and catch real window light.
        for(let j=0;j<4;j++){
          const stile=j<2,sign=j%2===0?-1:1;
          const part=8+i*4+j;
          doors.setMatrixAt(part,transform.makeScale(stile?.016:.203,stile?9.87:.66,.018)
            .setPosition(x+(stile?sign*.110:0),-5.5+(stile?0:sign*4.6),-.460));
          doors.setColorAt(part,new THREE.Color('#fff6e8'));
        }
      }
      mesh.add(doors);
    }
    if(d.bones?.length){const raw=pack.geometries[d.geo].bindposes;const inverses=d.bones.map((_,i)=>new THREE.Matrix4().fromArray(raw,i*16));const skeleton=new THREE.Skeleton(d.bones.map(i=>nodes[i]),inverses);mesh.bind(skeleton,new THREE.Matrix4());mesh.frustumCulled=false;}
    if(mat[0]?.userData.depth)mesh.customDepthMaterial=mat[0].userData.depth;
    meshes.push(mesh);
  });
  root.updateMatrixWorld(true);
  const roomOrigin={value:new THREE.Vector2()};
  const wall=meshes.find(m=>m.name==='Dim room wall');
  let wallAlmanac;
  const notebook=materials.find(m=>m.userData.coverPrint);
  if(notebook){
    try {notebook.userData.coverPrint.value=await texture('thumbnails/crystal-study.png',true);}
    catch(error){console.warn('虾册封面图未载入，沿用布面。',error);}
  }
  if(wall){
    try {
      const garden=await readTexture(loader,ROOT+'window-garden.webp');
      garden.colorSpace=THREE.SRGBColorSpace;garden.anisotropy=4;
      wallAlmanac=createWallAlmanac(garden);
      wall.material=[windowGardenMaterial(garden,clock,roomOrigin,wallAlmanac.angles)];
      addWindowShadow(wall);
      for(const part of meshes){
        if(/^(Night glass|Window recess|Window upright|Window sill|Soft curtain fold \d+)$/.test(part.name))part.visible=false;
        // In room coordinates the tabletop is at -.0015, the coaster starts at .003 and the book at .004.
        if(/^(Handmade cup|Cup handle|Quiet dark tea|Linen coaster)$/.test(part.name))part.parent.position.add(new THREE.Vector3(-2.04,part.name==='Linen coaster'?-.0045:-.0055,-.42));
        if(/^(Small closed reading book|Thin paper block|Plain brass bookmark)$/.test(part.name))part.parent.position.add(new THREE.Vector3(-2.52,-.0055,-.17));
      }
      root.updateMatrixWorld(true);
    } catch(error){console.warn('窗景插画未载入，沿用原有房间。',error);}
  }
  const desktop=meshes.find(m=>m.name==='Single solid walnut surface');
  if(desktop){
    const edges=new THREE.Box3();
    for(const mesh of meshes)if(mesh.name==='Bare glass bottom edge')edges.expandByObject(mesh);
    const deskTop=new THREE.Box3().setFromObject(desktop).max.y;
    if(!edges.isEmpty() && edges.min.y>deskTop){
      const size=edges.getSize(new THREE.Vector3()), centre=edges.getCenter(new THREE.Vector3());
      const base=new THREE.Mesh(desktop.geometry,new THREE.MeshStandardMaterial({name:'Tank support',color:0x5d6260,roughness:.85}));
      base.name='Tank support';base.position.set(centre.x,(edges.min.y+deskTop)/2,-centre.z);
      base.scale.set(size.x+.008,edges.min.y-deskTop,size.z+.008);
      base.castShadow=base.receiveShadow=true;root.add(base);
    }
  }
  const animals=pack.animals.map(animal=>{
    const animationRoot=nodes[animal.animationRoot],rig=nodes[animal.root],mixer=new THREE.AnimationMixer(animationRoot);
    function find(path){let node=animationRoot;for(const part of path.split('/').filter(Boolean)){node=node.children.find(c=>c.name===part);if(!node)return null;}return node;}
    const actions=new Map();
    for(const c of pack.clips){const tracks=[];for(const t of c.tracks){const node=find(t.path);if(!node)continue;tracks.push(new THREE.VectorKeyframeTrack(node.uuid+'.position',t.times,t.positions),new THREE.QuaternionKeyframeTrack(node.uuid+'.quaternion',t.times,t.rotations),new THREE.VectorKeyframeTrack(node.uuid+'.scale',t.times,t.scales));}actions.set(c.name,mixer.clipAction(new THREE.AnimationClip(c.name,c.duration,tracks)));}
    const a={...animal,rig,mixer,actions,seed:stableSeed(animal.id),active:null,antennae:animal.bones.map(i=>nodes[i]).filter(n=>/^(Antennule_[LR]|AntennaLong_[LR]_0[123])$/.test(n.name)),deltas:[]};
    rig.traverse(o=>{if(o.isMesh)o.userData.creatureId=animal.id;});
    a.play=name=>{if(a.active===name||!actions.has(name))return;const old=actions.get(a.active);if(old)old.fadeOut(.16);const next=actions.get(name).reset().fadeIn(.16);if(name==='EscapeSwim'){next.setLoop(THREE.LoopOnce,1);next.clampWhenFinished=true;}next.play();a.active=name;};
    a.play('Rest');mixer.setTime((a.seed%1000)/1000*(pack.clips.find(c=>c.name==='Rest')?.duration||1));return a;
  });
  const antennaAxis=new THREE.Vector3(0,1,0);
  function update(dt,time){
    clock.value=time;
    for(const a of animals){
      for(let i=0;i<a.deltas.length;i++){
        const delta=a.deltas[i];
        if(delta?.y){a.antennae[i].quaternion.multiply(delta.invert());delta.identity();}
      }
      a.mixer.update(dt);
      if(a.active==='Groom'||a.active==='RoutineSwim'||a.active==='EscapeSwim')continue;
      for(let i=0;i<a.antennae.length;i++){
        const bone=a.antennae[i],side=bone.name.includes('_L')?0:1;
        const u=((time+(a.seed%997)/137-side*.27)%3.4)/1.05;
        if(u>=1)continue;
        const envelope=Math.sin(Math.PI*u)**2*Math.sin(Math.PI*2*u);
        const gain=bone.name.startsWith('Antennule')?.75:bone.name.endsWith('02')?.13:bone.name.endsWith('03')?.07:1;
        const delta=a.deltas[i] ??= new THREE.Quaternion();
        bone.quaternion.multiply(delta.setFromAxisAngle(antennaAxis,THREE.MathUtils.degToRad(envelope*5.2*gain)));
      }
    }
  }
  return {root,pack,buffer,nodes,meshes,animals,materials,geometries,update,roomOrigin,wallAlmanac,textureCache};
}
