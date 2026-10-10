import * as T from 'three';
export function crafted(material,descriptor){const c=descriptor.crafted;if(!c)return;material.side=T.DoubleSide;
 material.onBeforeCompile=shader=>{shader.uniforms.aqDark={value:new T.Color().fromArray(c.dark).convertSRGBToLinear()};shader.uniforms.aqLight={value:material.color};shader.uniforms.aqBump={value:c.bump};shader.uniforms.aqKind={value:c.kind};shader.uniforms.aqScale={value:c.scale};
  shader.vertexShader='varying vec3 aqWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\naqWorld=(modelMatrix*vec4(position,1.)).xyz;aqWorld.z=-aqWorld.z;');
  shader.fragmentShader=`varying vec3 aqWorld;uniform vec3 aqDark,aqLight;uniform float aqBump,aqKind,aqScale;
   float aqHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
   float aqNoise(vec3 p){vec3 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(aqHash(a),aqHash(a+vec3(1,0,0)),f.x),mix(aqHash(a+vec3(0,1,0)),aqHash(a+vec3(1,1,0)),f.x),f.y),mix(mix(aqHash(a+vec3(0,0,1)),aqHash(a+vec3(1,0,1)),f.x),mix(aqHash(a+vec3(0,1,1)),aqHash(a+vec3(1,1,1)),f.x),f.y),f.z);}
   float aqFbm(vec3 p){return aqNoise(p)*.58+aqNoise(p*2.1)*.27+aqNoise(p*4.3)*.15;}
   vec2 aqSurface(vec3 p){float v=aqFbm(p*aqScale),d=v;if(aqKind<.5){float vein=pow(clamp(1.-abs(aqNoise(p*36.)-.52)*38.,0.,1.),4.);v=clamp(aqFbm(p*56.)*.85+aqNoise(p*210.)*.15+vein*.1,0.,1.);d=aqFbm(p*110.)*.4;}else if(aqKind<1.5){float grain=aqFbm(vec3(p.x*9.,p.y*175.,p.z*190.));float fissure=pow(clamp(sin(p.z*680.+p.y*260.+aqNoise(p*25.)*5.),0.,1.),7.);v=clamp(.12+grain*.94-fissure*.23,0.,1.);d=grain-fissure*.5;}else if(aqKind<2.5){v=aqNoise(p*280.)*.55+aqNoise(p*90.)*.45;d=v;}else if(aqKind<3.5){float rings=sin(p.z*110.+aqFbm(vec3(p.x*.8,0.,p.z*8.))*7.);v=.45+aqNoise(vec3(p.x*2.,0.,p.z*95.))*.3+rings*.055;d=v;}else if(aqKind<4.5){v=.5+aqNoise(p*450.)*.24;d=aqNoise(p*380.);}return vec2(v,d);}
  `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nvec2 aqDetail=aqSurface(aqWorld);diffuseColor.rgb=mix(aqDark,aqLight,clamp(aqDetail.x,0.,1.));');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 aqDx=dFdx(-vViewPosition),aqDy=dFdy(-vViewPosition),aqR1=cross(aqDy,normal),aqR2=cross(normal,aqDx);float aqDet=dot(aqDx,aqR1);vec3 aqGradient=sign(aqDet)*(dFdx(aqDetail.y)*aqR1+dFdy(aqDetail.y)*aqR2);normal=normalize(max(abs(aqDet),1e-12)*normal-aqBump*.00015*aqGradient);`);
 };material.customProgramCacheKey=()=> 'original-crafted-v1';
}
