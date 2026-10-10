import * as T from 'three';
import {FOG_GLSL} from './water-fog.js';
// Port of GameWaterSurface/GameWaterGlass: one opaque capture shared by both surfaces.
export class AquariumWater {
 constructor(renderer,scene,camera,aq){this.renderer=renderer;this.scene=scene;this.camera=camera;this.surfaces=aq.meshes.filter(m=>m.material.some(v=>/WaterAwareGlass|ClearWaterSurface/.test(v.name)));this.target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});this.target.texture.colorSpace=T.LinearSRGBColorSpace;this.reflection=new T.WebGLCubeRenderTarget(128,{type:T.HalfFloatType});this.reflection.texture.colorSpace=T.LinearSRGBColorSpace;this.cube=new T.CubeCamera(.005,10,this.reflection);this.cube.position.set(0,.30,0);this.time={value:0};this.wet={value:1};this.level={value:.58};this.size={value:new T.Vector2()};this.fog={value:.22};this.near={value:camera.near};this.far={value:camera.far};
  const vertex=`varying vec3 aqWorld;varying vec3 aqNormal;uniform float aqTime;uniform float aqSurface;void main(){vec4 world=modelMatrix*vec4(position,1.);if(aqSurface>.5)world.y+=sin(world.x*19.+aqTime*.55)*cos(-world.z*23.+aqTime*.37)*.00055;aqWorld=world.xyz;aqNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*world;}`;
  const fragment=`uniform sampler2D aqOpaque;uniform sampler2D aqDepth;uniform samplerCube aqEnvironment;uniform vec2 aqSize;uniform float aqTime,aqSurface,aqWet,aqLevel,aqFog,aqNear,aqFar;varying vec3 aqWorld;varying vec3 aqNormal;
   ${FOG_GLSL}
   void main(){vec3 w=vec3(aqWorld.x,aqWorld.y,-aqWorld.z),view=normalize(cameraPosition-aqWorld);vec2 uv=gl_FragCoord.xy/aqSize;vec3 result;float alpha;
    if(aqSurface>.5){vec2 wave=vec2(sin(w.x*21.+aqTime*.55)+sin(w.z*37.-aqTime*.31)*.35,cos(w.z*25.+aqTime*.37));vec3 n=normalize(vec3(wave.x*.04,1.,-wave.y*.03));float f=.02+.98*pow(1.-abs(dot(n,view)),5.);vec3 through=aqFogged(texture2D(aqOpaque,clamp(uv+wave*.0011,vec2(.001),vec2(.999))).rgb*vec3(.94,.985,.975),uv);vec3 env=textureCube(aqEnvironment,reflect(-view,n)).rgb;float shore=smoothstep(.05,0.,min(.56-abs(w.x),.27-abs(w.z)));result=mix(through,env,f*.42)+vec3(.50,.74,.68)*shore*.42;alpha=.28+f*.18+shore*.5;}
    else {vec3 n=normalize(aqNormal);float fres=pow(1.-abs(dot(n,view)),2.0);vec3 env=textureCube(aqEnvironment,reflect(-view,n)).rgb;float wet=(1.-smoothstep(aqLevel-.004,aqLevel+.002,w.y))*aqWet;float depth=clamp((aqLevel-w.y)/.55,0.,1.);vec2 ripple=vec2(sin(w.y*25.+aqTime*.45)*cos(w.x*17.),cos(w.x*23.-aqTime*.31));vec3 through=aqFogged(texture2D(aqOpaque,clamp(uv+ripple*.00016*wet,vec2(.001),vec2(.999))).rgb,uv);through*=1.-vec3(.02,.04,.035)*depth*wet*.35;float meniscus=exp(-abs(w.y-aqLevel)*420.)*aqWet;vec3 tint=vec3(.58,.84,.74);result=mix(through,tint,clamp(.04+fres*.36,0.,.48))+meniscus*vec3(.16,.24,.22);result=mix(env*vec3(.72,.86,.80)+tint*.15,result,clamp(.35+wet,0.,1.));alpha=.05+fres*.42+wet*.22+meniscus*.28;}
    gl_FragColor=vec4(result,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`;
  for(const mesh of this.surfaces){const surface=mesh.material.some(m=>m.name.includes('ClearWaterSurface'));mesh.material=new T.ShaderMaterial({uniforms:{aqOpaque:{value:this.target.texture},aqDepth:{value:this.target.depthTexture},aqEnvironment:{value:this.reflection.texture},aqSize:this.size,aqTime:this.time,aqWet:this.wet,aqLevel:this.level,aqFog:this.fog,aqNear:this.near,aqFar:this.far,aqSurface:{value:surface?1:0}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:T.DoubleSide});mesh.layers.set(1);mesh.renderOrder=surface?2:1;mesh.material.side=surface?T.DoubleSide:T.FrontSide;}
  this.target.samples=Math.min(4,renderer.capabilities.maxSamples);this.target.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  for(const mesh of this.surfaces)mesh.material.uniforms.aqDepth.value=this.target.depthTexture;
  this.blitScene=new T.Scene();this.blitCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);this.blitScene.add(new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({uniforms:{image:{value:this.target.texture},depth:{value:this.target.depthTexture}},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform sampler2D image;uniform sampler2D depth;varying vec2 v;void main(){gl_FragColor=texture2D(image,v);gl_FragDepth=texture2D(depth,v).r;
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`,depthTest:true,depthWrite:true,depthFunc:T.AlwaysDepth})));
  this.reflectionDirty=true;
 }
 render(time,wet=true){const r=this.renderer,c=this.camera,scene=this.scene,size=r.getDrawingBufferSize(new T.Vector2());if(!this.size.value.equals(size)){this.size.value.copy(size);this.target.setSize(size.x,size.y);}this.time.value=time;this.wet.value=wet?1:0;this.near.value=c.near;this.far.value=c.far;
  if(this.reflectionDirty){const background=scene.background;this.cube.update(r,scene);scene.background=background;this.reflectionDirty=false;}
  const mapping=r.toneMapping,clear=r.autoClear,background=scene.background,autoReset=r.info.autoReset;r.info.autoReset=false;r.info.reset();c.layers.set(0);r.toneMapping=T.NoToneMapping;r.setRenderTarget(this.target);r.autoClear=true;r.render(scene,c);r.setRenderTarget(null);r.toneMapping=mapping;r.render(this.blitScene,this.blitCamera);r.autoClear=false;scene.background=null;c.layers.set(1);r.render(scene,c);c.layers.set(0);scene.background=background;r.autoClear=clear;r.info.autoReset=autoReset;
 }
}
