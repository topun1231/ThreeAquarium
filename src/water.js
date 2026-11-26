import * as T from 'three';
import {createRoomCutaway} from './camera-motion.js';
import {illustratedSceneFragment} from './illustrated-look.js';
import {FOG_GLSL,MAX_WATER_TRAVEL} from './water-fog.js';
import {waterRipplesGLSL} from './water-ripples.js';
import {windowGardenUV} from './crafted.js';
import {wallClockGLSL} from './wall-almanac.js';
// Port of GameWaterSurface/GameWaterGlass: one opaque capture shared by both surfaces.
export class AquariumWater {
 constructor(renderer,scene,camera,aq,liveObjects=()=>[]){
  this.liveObjects=liveObjects;
  const lampLights=renderer.shadowMap?.type===T.PCFShadowMap?scene.children.filter(l=>l.isSpotLight&&l.castShadow):[];
  this.lampScattering=true;
  this.lamps=lampLights.map(light=>({light,matrix:light.shadow.matrix,position:new T.Vector3(),color:new T.Color(0),shape:new T.Vector4()}));
  const lampDepths=lampLights.map(()=>null);
  this.lampDepths=lampDepths;
  this.renderer=renderer;this.scene=scene;this.camera=camera;this.surfaces=aq.meshes.filter(m=>m.material.some(v=>/WaterAwareGlass|ClearWaterSurface/.test(v.name)));this.target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});this.target.texture.colorSpace=T.LinearSRGBColorSpace;
  this.reflection=new T.WebGLCubeRenderTarget(128,{type:T.HalfFloatType,generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter});
  this.reflection.texture.colorSpace=T.LinearSRGBColorSpace;this.cube=new T.CubeCamera(.005,10,this.reflection);this.cube.position.set(0,.30,0);this.paper={value:0};this.time={value:0};this.wet={value:1};this.level={value:.58};this.size={value:new T.Vector2()};this.fog={value:.22};this.near={value:camera.near};this.far={value:camera.far};
  const vertex=`varying vec3 aqWorld;varying vec3 aqNormal;uniform float aqTime;uniform float aqSurface;
   #ifdef AQ_NEIGHBOUR_SURFACE
   varying vec3 aqTankOrigin;uniform float aqLevel;
   #endif
   ${waterRipplesGLSL}
   void main(){vec4 world=modelMatrix*vec4(position,1.);if(aqSurface>.5)world.y+=dot(amplitudes,sin(wavePhase(world.xz,aqTime)));aqWorld=world.xyz;aqNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*world;
   #ifdef AQ_NEIGHBOUR_SURFACE
     aqTankOrigin=modelMatrix[3].xyz-vec3(0.,aqLevel,0.);
   #endif
   }`;
  const fragment=`uniform sampler2D aqOpaque;uniform sampler2D aqDepth;uniform samplerCube aqEnvironment;uniform vec2 aqSize;uniform float aqTime,aqSurface,aqWet,aqLevel,aqFog,aqNear,aqFar,aqPaper;varying vec3 aqWorld;varying vec3 aqNormal;
   uniform sampler2D aqGarden;uniform float aqWallZ;uniform vec2 aqRoomOrigin;
   ${wallClockGLSL}
   #ifdef AQ_NEIGHBOUR_SURFACE
   varying vec3 aqTankOrigin;
   #endif
   ${FOG_GLSL}
   ${waterRipplesGLSL}
   float skylightCast(vec3 light){
     float luminance=dot(light,vec3(.2126,.7152,.0722));
     // A sky reflection can read cyan even when green is its strongest channel.
     float cool=(mix(light.g,light.b,.75)-light.r)/max(.02,luminance);
     // Measure blue above red: teal window light has both, leaf shadows mostly have green.
     float teal=(light.b-light.r)/max(.02,light.g-light.r);
     return smoothstep(.01,.14,cool)*max(smoothstep(.57,.86,light.b/max(.02,light.g)),smoothstep(.14,.47,teal));
   }
   vec3 windowReflection(vec3 light,float wet){
     // Let the window stay bright while the reflected lamp rolls off on the water.
     float peak=max(light.r,max(light.g,light.b));
     if(peak>.80){
       float excess=peak-.80;
       light*=(.80+excess/(1.+1.2*excess))/peak;
     }
     return mix(light,vec3(dot(light,vec3(.2126,.7152,.0722))),wet*skylightCast(light));
   }
   #ifdef AQ_WINDOW_SHADOW
   uniform highp sampler2DShadow aqSunDepth;
   uniform mat4 aqSunMatrix;
   uniform vec3 aqSunColor;
   float sunAt(vec3 p){
     vec4 projected=aqSunMatrix*vec4(p,1.);
     vec3 uvz=projected.xyz/projected.w;
     if(any(lessThan(uvz,vec3(0.)))||any(greaterThan(uvz,vec3(1.))))return 0.;
     return texture(aqSunDepth,uvz);
   }
   #endif
   #ifdef AQ_LAMPS
   struct TankLamp {mat4 matrix; vec3 position; vec3 color; vec4 shape;};
   uniform TankLamp aqLamps[AQ_LAMPS];
   uniform highp sampler2DShadow aqLampDepth[AQ_LAMPS];
   float lampAt(TankLamp lamp,highp sampler2DShadow depth,vec3 p){
     vec4 clip=lamp.matrix*vec4(p,1.);
     if(clip.w<=0.)return 0.;
     vec3 uvz=clip.xyz/clip.w;
     if(any(lessThan(uvz,vec3(0.)))||any(greaterThan(uvz,vec3(1.))))return 0.;
     float d=max(.001,distance(p,lamp.position));
     float cone=smoothstep(lamp.shape.x,max(lamp.shape.y,lamp.shape.x+.00001),clip.w/d);
     if(cone<=0.)return 0.;
     float cutoff=lamp.shape.z>0.?max(0.,1.-pow(d/lamp.shape.z,4.)):1.;
     return texture(depth,uvz)*cone*cutoff*cutoff/max(.01,pow(d,lamp.shape.w));
   }
   #endif
   vec3 daylightWater(vec3 through,float path,vec2 segment){
     // At aquarium scale the wall and shrimp keep their colour through the water.
     vec3 transmitted=through*exp(-.17*path);
     vec3 scattered=vec3(.009);
     #if defined(AQ_WINDOW_SHADOW) || defined(AQ_LAMPS)
     if(path>0.){
       vec3 ray=normalize(aqWorld-cameraPosition);
       vec3 mid=aqWorld+ray*(.5*(segment.x+segment.y));
       vec3 offset=ray*((segment.y-segment.x)/3.);
       #ifdef AQ_WINDOW_SHADOW
       float lit=(sunAt(mid-offset)+sunAt(mid)+sunAt(mid+offset))/3.;
       scattered+=aqSunColor*(.035*lit);
       #endif
       #ifdef AQ_LAMPS
       ${lampLights.map((_,i)=>`if(any(greaterThan(aqLamps[${i}].color,vec3(0.)))){
         float lit=(lampAt(aqLamps[${i}],aqLampDepth[${i}],mid-offset)+lampAt(aqLamps[${i}],aqLampDepth[${i}],mid)+lampAt(aqLamps[${i}],aqLampDepth[${i}],mid+offset))/3.;
         scattered+=aqLamps[${i}].color*(.006*lit);
       }`).join('\n')}
       #endif
     }
     #endif
     return transmitted+scattered*path;
   }
   void main(){vec3 w=vec3(aqWorld.x,aqWorld.y,-aqWorld.z),view=normalize(cameraPosition-aqWorld);vec2 uv=gl_FragCoord.xy/aqSize;vec3 result;float alpha;
    vec2 segment=aqTravel(gl_FragCoord.z,texture2D(aqDepth,uv).r);
    float travel=min(segment.y-segment.x,${MAX_WATER_TRAVEL.toFixed(2)});
    if(aqSurface>.5){
     // Reflect the room using the slope of the same shallow wave that moves the surface.
     vec3 tilt=amplitudes*cos(wavePhase(aqWorld.xz,aqTime));
     vec2 slope=tilt.x*waveA+tilt.y*waveB+tilt.z*waveC;
     vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
     float cosine=clamp(abs(dot(n,view)),0.,1.);
     float grazing=1.-cosine;
     // Viewed through the side pane, shallow rays reflect the tank underneath the surface.
     float eta=dot(n,view)<0. ? 1.333 : 1./1.333;
     float transmittedCos=sqrt(max(0.,1.-eta*eta*(1.-cosine*cosine)));
     vec2 a=vec2(eta*cosine,cosine), b=vec2(transmittedCos,eta*transmittedCos);
     vec2 fresnel=(a-b)/max(a+b,vec2(.0001));
     float f=transmittedCos==0. ? 1. : dot(fresnel,fresnel)*.5;
     vec2 offset=slope*.045*smoothstep(0.,.15,travel);
     // The filtered colour can pick up a foreground rim even for a subpixel shift.
     vec2 probe=uv+offset+sign(offset)*.5/aqSize;
     if(texture2D(aqDepth,probe).r<=gl_FragCoord.z)offset=vec2(0.);
     vec3 through=aqFogged(texture2D(aqOpaque,uv+offset).rgb,travel);
     through=daylightWater(through,clamp(travel/.58,0.,1.)*aqWet,segment);
     vec3 reflected=reflect(-view,n);
     // Downward rays in the room probe see furniture beyond the glass, not the view from
     // this point on the water. Fade that approximation across the rippled horizon.
     f*=mix(.14,1.,smoothstep(0.,.22,reflected.y));
     // At grazing angles one pixel spans more water. Soften the lamp where Fresnel makes it brightest.
     float reflectionLod=mix(.85,2.35,grazing);
     #ifdef AQ_NEIGHBOUR_SURFACE
     // The viewpoint of the cached room reflection belongs to the active tank.
     vec3 env=through;
     #else
     vec3 env=textureLod(aqEnvironment,reflected,reflectionLod).rgb;
     #endif
     if(aqWallZ<0. && reflected.z<-.18 && view.y>0.){
       vec2 wallXY=aqWorld.xy+reflected.xy*((aqWallZ-aqWorld.z)/reflected.z)+aqRoomOrigin;
       vec2 gardenUV=${windowGardenUV};
       vec2 margin=min(gardenUV,1.-gardenUV);
       // Soften fine painted leaf edges in their reflection on moving water.
       // Match the cube reflection's angular spread to the window's distance and size.
       float footprint=abs((aqWallZ-aqWorld.z)/reflected.z)*exp2(reflectionLod)/128.;
       vec2 feather=max(vec2(.025),footprint/vec2(3.61,1.84));
       vec2 edge=smoothstep(vec2(0.),feather,margin);
       float weight=edge.x*edge.y*smoothstep(.18,.30,-reflected.z);
       vec2 texels=vec2(textureSize(aqGarden,0))/vec2(3.61,1.84);
       float gardenLod=log2(max(1.,footprint*max(texels.x,texels.y)));
       vec3 paper=textureLod(aqGarden,clamp(gardenUV,0.,1.),gardenLod).rgb;
       env=mix(env,wallClock(gardenUV,paper,footprint/.18),weight);
     }
     // Ripples bend the room reflection. At steep viewing angles the floor shows through.
     // Calm water transmits the near-overhead view; the window reads along the far edge.
     result=mix(through,windowReflection(env,aqWet),f);
     alpha=mix(.62,1.,f);
    }
    else {
     vec3 n=normalize(aqNormal);
     float fres=pow(1.-abs(dot(n,view)),2.0);
     float wet=(1.-smoothstep(aqLevel-.004,aqLevel+.002,w.y))*aqWet;
     float surfaceY=aqLevel+dot(amplitudes,sin(wavePhase(aqWorld.xz,aqTime)));
     float meniscus=exp(-abs(w.y-surfaceY)/max(.0013,fwidth(w.y)))*aqWet;
     // Keep the backdrop registered with the wood and plants seen through the flat pane.
     vec3 through=aqFogged(texture2D(aqOpaque,uv).rgb,travel);
     result=through*(1.-.055*meniscus);
     alpha=min(1.,.05+fres*.42+wet*.22+meniscus*.46);
     // Water behind a nearby shrimp should colour the distant wall more than its shell.
     float path=clamp(travel/.58,0.,1.)*wet;
     float wash=path*mix(.68,1.,aqPaper);
     result=mix(result,daylightWater(through,path,segment),wash*(1.-meniscus));
     alpha=mix(alpha,mix(.85,.94,aqPaper),wash);}
    gl_FragColor=vec4(result,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`;
  for(const mesh of this.surfaces){const surface=mesh.material.some(m=>m.name.includes('ClearWaterSurface'));mesh.material=new T.ShaderMaterial({uniforms:{aqPaper:this.paper,aqOpaque:{value:this.target.texture},aqDepth:{value:this.target.depthTexture},aqEnvironment:{value:this.reflection.texture},aqSize:this.size,aqTime:this.time,aqWet:this.wet,aqLevel:this.level,aqFog:this.fog,aqNear:this.near,aqFar:this.far,aqSurface:{value:surface?1:0}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:T.DoubleSide});mesh.layers.set(1);mesh.renderOrder=surface?2:1;mesh.material.side=surface?T.DoubleSide:T.FrontSide;}
  const wall=aq.meshes.find(mesh=>mesh.name==='Dim room wall');
  const garden=wall?.material[0]?.name==='Sunlit window garden' ? wall.material[0].map : null;
  const wallZ=garden ? new T.Box3().setFromObject(wall).max.z : 0;
  this.sun=scene.children.find(light=>light.isDirectionalLight&&light.castShadow&&light.userData.windowLight);
  if(this.sun && renderer.shadowMap?.type===T.PCFShadowMap){
    this.sunDepth={value:null};
    this.sunColor={value:new T.Color(0)};
    for(const {material} of this.surfaces){
      material.defines.AQ_WINDOW_SHADOW=1;
      Object.assign(material.uniforms,{aqSunDepth:this.sunDepth,aqSunColor:this.sunColor,aqSunMatrix:{value:this.sun.shadow.matrix}});
    }
  }
  for(const mesh of this.surfaces){
    if(mesh.geometry.name==='Single optical water plane' && mesh.geometry.attributes.position.count===4){
      mesh.geometry=new T.PlaneGeometry(1,1,48,24).rotateX(-Math.PI/2);
    }
    if(this.lamps.length){
      mesh.material.defines.AQ_LAMPS=this.lamps.length;
      Object.assign(mesh.material.uniforms,{aqLamps:{value:this.lamps},aqLampDepth:{value:lampDepths}});
    }
    mesh.material.uniforms.aqGarden={value:garden};
    mesh.material.uniforms.aqClockAngles=aq.wallAlmanac?.angles ?? {value:new T.Vector2()};
    mesh.material.uniforms.aqWallZ={value:wallZ};
    mesh.material.uniforms.aqRoomOrigin=aq.roomOrigin ?? {value:new T.Vector2()};
  }
  this.target.samples=Math.min(4,renderer.capabilities.maxSamples);this.target.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  for(const mesh of this.surfaces)mesh.material.uniforms.aqDepth.value=this.target.depthTexture;
  this.blitScene=new T.Scene();this.blitCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);this.blitScene.add(new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({uniforms:{image:{value:this.target.texture},depth:{value:this.target.depthTexture}},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform sampler2D image;uniform sampler2D depth;varying vec2 v;void main(){gl_FragColor=texture2D(image,v);gl_FragDepth=texture2D(depth,v).r;
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`,depthTest:true,depthWrite:true,depthFunc:T.AlwaysDepth})));
  // Composite refraction and glass in linear light; apply the illustration once at output.
  this.composite=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});
  this.composite.texture.colorSpace=T.LinearSRGBColorSpace;
  this.inkScene=new T.Scene();
  const inkMaterial=new T.ShaderMaterial({
    uniforms:{aqPaper:this.paper,aqFocus:{value:0},image:{value:this.composite.texture},depth:{value:this.target.depthTexture},aqSize:this.size,aqNear:this.near,aqFar:this.far},
    vertexShader:this.blitScene.children[0].material.vertexShader,fragmentShader:illustratedSceneFragment,
    depthTest:false,depthWrite:false
  });
  this.focusDepth=inkMaterial.uniforms.aqFocus;
  this.inkScene.add(new T.Mesh(this.blitScene.children[0].geometry,inkMaterial));
  this.cutaway=createRoomCutaway(aq.meshes);this.reflectionDirty=true;this.primeReflection=false;
  this.lastShadowTime=-Infinity;
 }
 neighbourSurface(width,depth,level){
  const source=this.surfaces.find(mesh=>mesh.material.uniforms.aqSurface.value===1);
  if(!source)return null;
  const material=source.material.clone();
  material.defines.AQ_NEIGHBOUR_SURFACE=1;
  delete material.defines.AQ_LAMPS;
  material.uniforms={...source.material.uniforms,aqLevel:{value:level},aqWet:{value:1}};
  material.side=T.FrontSide;
  const mesh=new T.Mesh(new T.PlaneGeometry(width,depth,12,6).rotateX(-Math.PI/2),material);
  mesh.name='Neighbour water surface';mesh.layers.set(1);mesh.renderOrder=source.renderOrder;
  return mesh;
 }
 restoreContext(){this.reflectionDirty=true;this.primeReflection=true;}
 preparePrograms(camera=this.camera){
  const r=this.renderer,opaque=new T.Group(),water=new T.Group();
  this.scene.traverseVisible(object=>{
    if(!object.isMesh)return;
    if(object.layers.isEnabled(0))opaque.add(object.clone(false));
    if(object.layers.isEnabled(1))water.add(object.clone(false));
  });
  const previous=r.getRenderTarget(),mask=camera.layers.mask,mapping=r.toneMapping;
  try {
    // Queue the final passes early so their shaders can compile while the room is drawn.
    r.setRenderTarget(this.composite);
    r.toneMapping=T.NoToneMapping;
    r.compile(this.blitScene,this.blitCamera);
    camera.layers.set(1);
    r.compile(water,camera,this.scene);
    r.setRenderTarget(null);
    r.toneMapping=mapping;
    r.compile(this.inkScene,this.blitCamera);
    // The cube and opaque pass share the same linear colour space and room lights.
    camera.layers.set(0);
    r.setRenderTarget(this.reflection);
    r.compile(opaque,camera,this.scene);
  } finally {
    camera.layers.mask=mask;
    r.toneMapping=mapping;
    r.setRenderTarget(previous);
  }
 }
 render(time,wet=true,c=this.camera,liveWallpaper=false){this.paper.value=c.userData.wallpaperPrint?1:0;const r=this.renderer,scene=this.scene,size=r.getDrawingBufferSize(new T.Vector2());if(!this.size.value.equals(size)){this.size.value.copy(size);this.target.setSize(size.x,size.y);this.composite.setSize(size.x,size.y);}this.time.value=time;this.wet.value=wet?1:0;this.near.value=c.near;this.far.value=c.far;
  if(this.reflectionDirty){
    this.lastShadowTime=-Infinity;
    // All six cube faces see the same lights and casters at this instant.
    const background=scene.background, shadows=r.shadowMap, automatic=shadows.autoUpdate;
    const mipmaps=this.reflection.texture.generateMipmaps;
    // The cube is cached between scenery changes; moving objects belong in the live water pass.
    const hidden=this.liveObjects().filter(object=>object?.visible);
    try {
      for(const object of hidden)object.visible=false;
      if(automatic && shadows.enabled){shadows.autoUpdate=false;shadows.needsUpdate=true;}
      // On context recovery the host can leave patches black in the first populated cube.
      if(this.primeReflection)this.cube.update(r,scene);
      this.cube.update(r,scene);
      this.primeReflection=false;
      this.reflectionDirty=false;
    } catch(error) {
      this.reflection.texture.generateMipmaps=mipmaps;
      r.setRenderTarget(null);
      throw error;
    } finally {
      for(const object of hidden)object.visible=true;
      shadows.autoUpdate=automatic;scene.background=background;
    }
  }
  this.cutaway(c,()=>{
    const mapping=r.toneMapping,clear=r.autoClear,background=scene.background,autoReset=r.info.autoReset,mask=c.layers.mask;
    const updateWorld=scene.matrixWorldAutoUpdate;
    const shadows=r.shadowMap,automatic=shadows?.autoUpdate;
    // At desktop distance, reuse full-resolution shadows for at most 80 ms of motion.
    const age=time-this.lastShadowTime;
    const reuse=liveWallpaper && automatic && !shadows.needsUpdate && age>=0 && age<.08;
    try {
      r.info.autoReset=false;r.info.reset();
      if(reuse)shadows.autoUpdate=false;
      c.layers.set(0);r.toneMapping=T.NoToneMapping;r.setRenderTarget(this.target);r.autoClear=true;r.render(scene,c);
      if(automatic && !reuse)this.lastShadowTime=time;
      if(this.sunDepth){
        this.sunDepth.value=this.sun.shadow.map?.depthTexture??null;
        this.sunColor.value.copy(this.sun.color).multiplyScalar(this.sunDepth.value&&r.shadowMap.enabled&&this.sun.visible&&this.sun.castShadow?this.sun.intensity:0);
      }
      for(const [i,lamp] of this.lamps.entries()){
        const light=lamp.light;
        this.lampDepths[i]=light.shadow.map?.depthTexture??null;
        const on=this.lampScattering&&wet&&r.shadowMap.enabled&&this.lampDepths[i]&&light.visible&&light.castShadow;
        lamp.color.copy(light.color).multiplyScalar(on?light.intensity:0);
        lamp.position.setFromMatrixPosition(light.matrixWorld);
        lamp.shape.set(Math.cos(light.angle),Math.cos(light.angle*(1-light.penumbra)),light.distance,light.decay);
      }
      r.setRenderTarget(this.composite);r.render(this.blitScene,this.blitCamera);
      // The opaque pass updated the whole tank, including the glass on layer 1.
      scene.matrixWorldAutoUpdate=false;
      // Glass samples the opaque pass's depth maps, including moving shrimp shadows.
      if(shadows)shadows.autoUpdate=false;
      r.autoClear=false;scene.background=null;c.layers.set(1);r.render(scene,c);
      c.layers.set(0);scene.background=background;r.setRenderTarget(null);r.toneMapping=mapping;r.render(this.inkScene,this.blitCamera);
    } catch(error) {
      this.lastShadowTime=-Infinity;
      r.setRenderTarget(null);
      throw error;
    } finally {
      if(shadows)shadows.autoUpdate=automatic;
      scene.matrixWorldAutoUpdate=updateWorld;
      c.layers.mask=mask;scene.background=background;r.toneMapping=mapping;r.autoClear=clear;r.info.autoReset=autoReset;
    }
  });
 }
}
