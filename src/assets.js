import * as THREE from 'three';
import {attributeArray, stableSeed} from './state.js';
import {crafted} from './crafted.js';
import {highestDetailDraws} from './asset-lod.js';

const ROOT='/assets/';
const vector=a=>new THREE.Vector3(...a);
export async function loadAquarium(onProgress=()=>{},source=null) {
  const checked=async response=>{if(!response.ok)throw new Error(`资产读取失败 ${response.url}: ${response.status}`);return response;};
  const [pack,buffer]=source?[source.pack,source.buffer]:await Promise.all([fetch(ROOT+'scene.json').then(checked).then(r=>r.json()),fetch(ROOT+'geometry.bin').then(checked).then(r=>r.arrayBuffer())]);
  if(pack.version!=='unity-source-1')throw new Error('场景版本不支持');
  const clock={value:0};const loader=new THREE.TextureLoader();const textureCache=new Map();
  function texture(file,srgb=false,tiling=[1,1,0,0]) {
    if(!file)return null;
    const key=file+':'+srgb+':'+tiling.join(',');
    if(!textureCache.has(key))textureCache.set(key,loader.loadAsync(ROOT+file).then(t=>{t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(tiling[0],tiling[1]);t.offset.set(tiling[2],tiling[3]);t.anisotropy=4;return t;}));
    return textureCache.get(key);
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
      // Preserve the existing leaf bend and pigment parameters; shadows use the same deformation.
      const patch=(shader,pigment)=>{
        shader.uniforms.aqTime=clock;shader.uniforms.aqThickness={value:thicknessMap};shader.uniforms.aqSoftNormal={value:m.softNormal||0};shader.uniforms.aqTransmission={value:m.transmission??.1};
        for(const [key,value] of Object.entries({aqPhase:m.phase,aqMotion:m.motion,aqLowGrass:m.lowGrass,aqLeaf:m.leaf,aqVariation:m.plantVariation-.5}))shader.uniforms[key]={value};
        const uniforms='uniform float aqPhase,aqMotion,aqLowGrass,aqLeaf,aqVariation;\n';
        shader.fragmentShader='uniform sampler2D aqThickness;uniform float aqSoftNormal,aqTransmission;\n'+uniforms+shader.fragmentShader;
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
        if(pigment){shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal+mat3(viewMatrix)*vec3(0.,.70*aqSoftNormal,0.));');}
        if(pigment)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',`#include <lights_physical_pars_fragment>
          void AQLeafDirect(const in IncidentLight light,const in vec3 p,const in vec3 n,const in vec3 v,const in vec3 nc,const in PhysicalMaterial material,inout ReflectedLight reflectedLight){RE_Direct_Physical(light,p,n,v,nc,material,reflectedLight);float d=dot(n,light.direction);float wrap=max(0.,clamp((d+.4)/1.4,0.,1.)-clamp(d,0.,1.))*.30;float thin=max(0.,-d)*aqTransmission*(.55+${thicknessMap&&m.map?'(1.-texture2D(aqThickness,vMapUv).r)':'0.'}*.45);reflectedLight.directDiffuse+=material.diffuseColor*light.color*(wrap+thin)*aqLeaf;}
          #undef RE_Direct
          #define RE_Direct AQLeafDirect`);
        if(pigment&&m.map){
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
            #ifdef USE_MAP
            ${m.plantSurface>.5&&m.plantSurface<1.5?`float x=fract(vMapUv.x*3.)-.5;float y=vMapUv.y;float mid=1.-smoothstep(.012,.022+max(fwidth(x),.003),abs(x));float v=abs(fract((y-abs(x)*.47)*6.+.13)-.5);float secondary=(1.-smoothstep(.019,.032+fwidth(v),v))*smoothstep(.02,.12,abs(x));float vein=max(mid,secondary*.55)*smoothstep(.06,.20,y)*(1.-smoothstep(.88,.98,y));float mottled=sin(vMapUv.x*49.+sin(vMapUv.y*22.)*2.)*sin(vMapUv.y*37.)*.023;diffuseColor.rgb*=vec3(1.+aqVariation*.12,1.+aqVariation*.065,1.-aqVariation*.10)*(1.+mottled)*(1.+vein*.20);`:m.plantSurface>1.5?`float age=aqVariation+(floor(vMapUv.x*3.)-1.)*.18;diffuseColor.rgb*=vec3(1.+age*.16,1.+age*.055,1.-age*.10)*mix(.92,1.035,clamp(vMapUv.y,0.,1.));`:''}
            #endif`);
        }
      };
      material.onBeforeCompile=s=>patch(s,true);material.customProgramCacheKey=()=> 'leaf-'+(m.map?1:0)+'-'+(thicknessMap?1:0)+'-'+(m.plantSurface>1.5?2:m.plantSurface>.5?1:0);
      material.userData.depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map,alphaTest:m.cutoff,side:THREE.DoubleSide});material.userData.depth.onBeforeCompile=s=>patch(s,false);material.userData.depth.customProgramCacheKey=()=> 'leaf-depth-v1';
    }
    crafted(material,m);material.userData.source=m;onProgress(`材质 ${++loaded}/${pack.materials.length}`);return material;
  }));
  const geometries=pack.geometries.map(g=>{
    const geo=new THREE.BufferGeometry();geo.name=g.name;
    for(const [key,field] of [['position','position'],['normal','normal'],['uv','uv'],['uv1','uv'],['tangent','tangent'],['branchData','uv1'],['plantWeights','color'],['skinIndex','skinIndex'],['skinWeight','skinWeight']]){
      const a=attributeArray(buffer,g[field]);if(a)geo.setAttribute(key,new THREE.BufferAttribute(key==='skinIndex'?new Uint16Array(a):a,g[field].size));
    }
    const idx=attributeArray(buffer,g.index);geo.setIndex(new THREE.BufferAttribute(idx.slice(),1));
    // Exported Unity winding is left-handed. Check against actual authored normals before conversion.
    if(geo.attributes.normal){let agreement=0;const p=geo.attributes.position,n=geo.attributes.normal,a=new THREE.Vector3(),b=a.clone(),c=a.clone(),normal=a.clone();
      for(let i=0;i<idx.length;i+=Math.max(3,Math.floor(idx.length/300)*3)){a.fromBufferAttribute(p,idx[i]);b.fromBufferAttribute(p,idx[i+1]);c.fromBufferAttribute(p,idx[i+2]);normal.fromBufferAttribute(n,idx[i]);agreement+=b.sub(a).cross(c.sub(a)).dot(normal);}
      if(agreement<0){const a=geo.index.array;for(let i=0;i<a.length;i+=3){const t=a[i+1];a[i+1]=a[i+2];a[i+2]=t;}}
    }
    for(const group of g.groups)geo.addGroup(group.start,group.count,group.material);
    if(!geo.attributes.normal)geo.computeVertexNormals();
    geo.computeBoundingBox();geo.computeBoundingSphere();return geo;
  });
  const root=new THREE.Group();root.name='Imported aquarium';root.scale.z=-1;
  const nodes=pack.nodes.map(n=>{const o=n.bone?new THREE.Bone():new THREE.Group();o.name=n.name;o.position.fromArray(n.p);o.quaternion.fromArray(n.q);o.scale.fromArray(n.s);return o;});
  pack.nodes.forEach((n,i)=>(n.parent<0?root:nodes[n.parent]).add(nodes[i]));root.updateMatrixWorld(true);
  const meshes=[];
  highestDetailDraws(pack).forEach(d=>{
    const geo=geometries[d.geo],mat=d.materials.map(i=>materials[i]);
    const mesh=d.bones?.length?new THREE.SkinnedMesh(geo,mat):new THREE.Mesh(geo,mat);
    mesh.name=nodes[d.node].name;mesh.castShadow=d.castShadow;mesh.receiveShadow=d.receiveShadow;
    nodes[d.node].add(mesh);mesh.updateMatrixWorld(true);
    if(d.bones?.length){const raw=pack.geometries[d.geo].bindposes;const inverses=d.bones.map((_,i)=>new THREE.Matrix4().fromArray(raw,i*16));const skeleton=new THREE.Skeleton(d.bones.map(i=>nodes[i]),inverses);mesh.bind(skeleton,new THREE.Matrix4());mesh.frustumCulled=false;}
    if(mat[0]?.userData.depth)mesh.customDepthMaterial=mat[0].userData.depth;
    meshes.push(mesh);
  });
  root.updateMatrixWorld(true);
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
  function update(dt,time){clock.value=time;for(const a of animals){a.antennae.forEach((bone,i)=>{if(a.deltas[i])bone.quaternion.multiply(a.deltas[i].invert());});a.mixer.update(dt);a.deltas=[];
    if(!['Groom','RoutineSwim','EscapeSwim'].includes(a.active))a.antennae.forEach((bone,i)=>{const side=bone.name.includes('_L')?0:1;const phase=(time+(a.seed%997)/137-side*.27)%3.4;const u=phase/1.05;const envelope=u<1?Math.sin(Math.PI*u)**2*Math.sin(Math.PI*2*u):0;const gain=bone.name.startsWith('Antennule')?.75:bone.name.endsWith('02')?.13:bone.name.endsWith('03')?.07:1;const delta=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(envelope*5.2*gain));bone.quaternion.multiply(delta);a.deltas[i]=delta;});
  }}
  return {root,pack,buffer,nodes,meshes,animals,materials,geometries,update};
}
