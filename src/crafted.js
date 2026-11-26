import * as T from 'three';
import {wallClockGLSL} from './wall-almanac.js';
// Patterns are anchored to the room so the paint stays on the surface as the tank is explored.
const roomPaint = new Map([
 ['Natural linen curtain', `
   float fibre = aqNoise(p * vec3(115., 5., 18.));
   float wash = aqNoise(p * 9.);
   return vec2(.30 + .48 * wash + .14 * fibre, .18 * fibre);`],
 ['Woven flax coaster', `
   vec2 phase = p.xz * 190.;
   vec2 weave = cos(phase) * (1. - smoothstep(vec2(.6), vec2(2.8), fwidth(phase)));
   float crossing = weave.x * weave.y;
   return vec2(.48 + .14 * crossing + .12 * aqNoise(p * 16.), .12 * crossing);`],
 ['RealFrame refinement / Speckled oatmeal ceramic', `
   float fleck = smoothstep(.65, .81, aqNoise(p * 82.));
   return vec2(.58 + .20 * aqNoise(p * 11.) - .24 * fleck, -.08 * fleck);`],
 ['RealFrame refinement / Satin walnut desktop', `
   float plank = p.z / .21;
   float board = floor(plank), seed = aqHash(vec3(board,4.,7.));
   float drift = aqNoise(vec3(p.x*1.8,board,2.));
   float across = (fract(plank)-.5)*.21 + .010*(drift-.5);
   // Long arcs of growth and short broken pores stay locked to each board.
   float radius = length(vec2((p.x-1.4*(seed-.5))*.09, across+.04));
   float phase = radius*780. + drift*3.;
   float ring = smoothstep(.33,.96,cos(phase))*(1.-smoothstep(.6,2.5,fwidth(phase)));
   vec3 fibre = vec3(p.x*9., board, p.z*240.+drift*3.);
   float pore = (aqNoise(fibre)-.5)*(1.-smoothstep(.4,1.5,fwidth(fibre.z)));
   float gap = min(fract(plank),1.-fract(plank));
   float seam = 1.-smoothstep(0.,max(.005,fwidth(plank)),gap);
   return vec2(.58 + .13*(seed-.5) + .11*(drift-.5) - .062*ring + .11*pore - .085*seam, .025*pore);`],
 ['RealFrame refinement / Quiet plaster', `
   float wash = aqFbm(p * 4.);
   return vec2(.28 + .48 * wash, .055 * wash);`],
]);

const gardenOrigin=[-2.37,-.29], gardenSize=[3.61,1.84];
export const windowGardenUV=`(wallXY-vec2(${gardenOrigin}))/vec2(${gardenSize})`;
export const windowSunOffset=new T.Vector3(-1.03,1.43,-1.34);
const windowSunRay=`vec3(${windowSunOffset.toArray()})`;

export function addWindowShadow(wall) {
  wall.updateWorldMatrix(true,false);
  const bounds=new T.Box3().setFromObject(wall);
  const shape=new T.Shape();
  shape.moveTo(bounds.min.x,bounds.min.y);
  shape.lineTo(bounds.min.x,bounds.max.y);
  shape.lineTo(bounds.max.x,bounds.max.y);
  shape.lineTo(bounds.max.x,bounds.min.y);
  shape.closePath();
  // Pane edges follow the illustrated sill and mullions, including the upper panes beyond the crop.
  for(const [left,right] of [[.035,.248],[.267,.451]]){
    for(const [bottom,top] of [[.331,.746],[.775,.995]]){
      const hole=new T.Path();
      const x0=gardenOrigin[0]+left*gardenSize[0], x1=gardenOrigin[0]+right*gardenSize[0];
      const y0=gardenOrigin[1]+bottom*gardenSize[1], y1=gardenOrigin[1]+top*gardenSize[1];
      hole.moveTo(x0,y0); hole.lineTo(x1,y0); hole.lineTo(x1,y1); hole.lineTo(x0,y1);
      hole.closePath();
      shape.holes.push(hole);
    }
  }
  const geometry=new T.ShapeGeometry(shape).translate(0,0,bounds.max.z);
  geometry.applyMatrix4(wall.parent.matrixWorld.clone().invert());
  const frame=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide,colorWrite:false,depthWrite:false}));
  frame.name='Illustrated window shadow frame';
  frame.castShadow=true;
  wall.parent.add(frame);
  wall.castShadow=false;
  return frame;
}
// Apply the window projection before Three.js accumulates this sun with the tank lamps and fill.
export function shadeWindowSun(fragment, adjustment){
  return fragment.replace('#include <lights_fragment_begin>',T.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',`$&
      if(dot(directLight.direction,mat3(viewMatrix)*normalize(${windowSunRay}))>.999){
        ${adjustment}
      }`));
}

export function windowGardenMaterial(map,clock,roomOrigin,clockAngles) {
  const material = new T.MeshBasicMaterial({name:'Sunlit window garden',map});
  material.onBeforeCompile=shader=>{
    shader.uniforms.aqRoomTime=clock;
    shader.uniforms.aqRoomOrigin=roomOrigin;
    shader.uniforms.aqClockAngles=clockAngles;
    shader.vertexShader='uniform vec2 aqRoomOrigin;\n'+shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vec2 wallXY=(modelMatrix*vec4(position,1.)).xy+aqRoomOrigin;
      vMapUv=${windowGardenUV};`);
    shader.fragmentShader=wallClockGLSL+'\nuniform float aqRoomTime;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 uv=vMapUv;
      float pane=smoothstep(.14,.18,uv.x)*(1.-smoothstep(.44,.45,uv.x))
        *smoothstep(.009,.018,abs(uv.x-.254))*smoothstep(.026,.044,abs(uv.y-.76))
        *smoothstep(.33,.46,uv.y);
      uv.x+=.0017*pane*sin(7.*uv.y+aqRoomTime*.36)*sin(13.*uv.x+5.*uv.y);
      vec3 pigment=wallClock(uv,texture2D(map,clamp(uv,0.,1.)).rgb,0.);
      // Carry the painted plaster across the room using a bare patch below the window.
      vec2 plasterUV=vec2(.68,.095)+.055*sin(uv*vec2(7.,9.)+sin(uv.yx*11.));
      vec3 plaster=texture2D(map,plasterUV).rgb;
      float daylight=exp(-.72*max(0.,uv.x-.40));
      plaster*=mix(vec3(.68,.72,.80),vec3(.96,.95,.93),daylight);
      vec2 margin=min(uv,1.-uv);
      float upperEdge=mix(.10,.012,smoothstep(.58,.73,uv.x)*smoothstep(.70,.92,uv.y));
      float paper=smoothstep(0.,.019,margin.x)*smoothstep(0.,upperEdge,margin.y);
      // Keep the sash and sheer curtain intact where they meet the real top and left jambs.
      float sash=(1.-smoothstep(.45,.53,uv.x))*smoothstep(.215,.33,uv.y);
      paper=mix(paper,step(0.,min(margin.x,margin.y)),sash);
      pigment=mix(plaster,pigment,paper);
      float wallY=uv.y*1.84-.29;
      if(wallY<-.16){
        float board=uv.x*3.61/.16;
        float groove=min(fract(board),1.-fract(board));
        float edge=1.-smoothstep(0.,max(.025,fwidth(board)),groove);
        vec3 panel=mix(vec3(.33,.30,.245),vec3(.56,.48,.35),daylight);
        float grain=.012*sin(board*17.+.6*sin(wallY*5.))+.018*sin(floor(board)*67.);
        pigment=panel*(1.+grain-.14*edge);
      }
      diffuseColor.rgb*=pigment;`);
  };
  return material;
}

let soilRelief;
function fineSoilRelief(){
 if(soilRelief)return soilRelief;
 const size=256, heights=new Uint8Array(size*size);
 let state=9317;
 const random=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296);
 for(let grain=0;grain<4700;grain++){
   const x=random()*size,z=random()*size,r=.9+2.7*random()**2;
   const aspect=.64+.34*random(), angle=random()*Math.PI, c=Math.cos(angle),s=Math.sin(angle);
   const top=55+random()*150;
   for(let iz=Math.floor(z-r);iz<=z+r;iz++)for(let ix=Math.floor(x-r);ix<=x+r;ix++){
     const dx=(ix-x)/r,dz=(iz-z)/r, u=dx*c+dz*s,v=(dz*c-dx*s)/aspect;
     const height=1.-u*u-v*v;
     if(height<=0)continue;
     const at=(iz+size)%size*size+(ix+size)%size;
     heights[at]=Math.max(heights[at],top*Math.sqrt(height));
   }
 }
 soilRelief=new T.DataTexture(heights,size,size,T.RedFormat);
 soilRelief.wrapS=soilRelief.wrapT=T.RepeatWrapping;
 soilRelief.magFilter=T.LinearFilter;soilRelief.minFilter=T.LinearMipmapLinearFilter;
 soilRelief.generateMipmaps=true;soilRelief.repeat.set(30,15);soilRelief.anisotropy=4;soilRelief.needsUpdate=true;
 return soilRelief;
}

export function crafted(material,descriptor,clock){
 const grainSurface=descriptor.name==='GrainSurface';
 if(grainSurface || descriptor.name.startsWith('Substrate grain underlay ')){
   if(!grainSurface){material.bumpMap=fineSoilRelief();material.bumpScale=.00020;}
   const previous=material.onBeforeCompile;
   material.onBeforeCompile=function(shader,renderer){
     previous.call(this,shader,renderer);
     // The original grain mesh has thirteen vertices per pellet, including in edited soil tiles.
     const varying='varying float aqGrain; varying vec2 aqSediment;\n';
     shader.vertexShader=varying+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
       aqGrain=${grainSurface?'fract(float(gl_VertexID/13)*.618034)':'.32'};
       aqSediment=position.xz+position.y*vec2(.37,.83);`);
     shader.fragmentShader=varying+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
       ${grainSurface?`vec2 cell=aqSediment*1250., tile=floor(cell);
       float hash=fract(sin(dot(tile,vec2(19.39,87.23)))*13758.54);
       vec2 center=.5+.33*(fract(vec2(hash*13.1,hash*19.7))-.5);
       float radius=length((fract(cell)-center)*vec2(1.,.85));
       float footprint=max(fwidth(cell.x),fwidth(cell.y));
       float resolved=1.-smoothstep(.25,.9,footprint);
       float fleck=(1.-smoothstep(.14,.44,radius))*(hash-.33)*resolved;`:`
       float fines=texture2D(bumpMap,vBumpMapUv).r;
       float fleck=fines-.34;`}
       vec3 grain=diffuseColor.rgb;
       float dark=1.-smoothstep(.04,.22,max(grain.r,max(grain.g,grain.b)));
       diffuseColor.rgb=mix(grain,sqrt(grain),dark*(.08+.18*aqGrain+.12*fleck))
          *mix(vec3(.82,.83,.84),vec3(1.12,1.04,.95),aqGrain)*(1.+.55*fleck);
       ${grainSurface?'':`diffuseColor.rgb=mix(diffuseColor.rgb,sqrt(diffuseColor.rgb),dark*.10*fines);`}`)
       .replace('#include <normal_fragment_begin>','roughnessFactor=max(.74,roughnessFactor);\n#include <normal_fragment_begin>');
   };
   material.customProgramCacheKey=()=>grainSurface?'matte-substrate-grains':'matte-substrate-fines';
   return;
 }
 if (descriptor.name==='Brushed dark bronze') {
   material.color.set('#bcab95'); material.metalness=.32; material.roughness=.56;
   return;
 }
 if (descriptor.name==='Worn book linen') {
   material.color.set('#914d45');
   material.userData.coverPrint={value:null};
   material.onBeforeCompile=shader=>{
     shader.uniforms.aqSpecimen=material.userData.coverPrint;
     shader.vertexShader='varying vec3 aqCover;\n'+shader.vertexShader.replace('#include <begin_vertex>',
       '#include <begin_vertex>\naqCover=position;');
     shader.fragmentShader='varying vec3 aqCover; uniform sampler2D aqSpecimen;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
       float pages=(1.-smoothstep(.31,.39,abs(aqCover.y)))*smoothstep(-.48,-.44,aqCover.x);
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.65,.45),pages);
       if(aqCover.y>.495){
         vec2 uv=aqCover.xz, edge=vec2(.43,.445)-abs(uv);
         float inset=min(edge.x,edge.y);
         float aa=max(.002,fwidth(inset));
         float foil=1.-smoothstep(.003,.003+aa,abs(inset));
         vec2 printUV=(uv-vec2(.035,.02))*vec2(1.68,2.48)+.5;
         vec4 shrimp=texture2D(aqSpecimen,clamp(printUV,0.,1.));
         if(all(greaterThanEqual(printUV,vec2(0.))) && all(lessThanEqual(printUV,vec2(1.))))
           foil=max(foil,shrimp.a*mix(.44,1.,sqrt(shrimp.g)));
         diffuseColor.rgb*=1.-.25*(1.-smoothstep(-.39,-.35,uv.x));
         diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.82,.58,.31),foil);
       }`);
   };
   material.customProgramCacheKey=()=>'linen-specimen-book';
   return;
 }
 if (descriptor.name==='Dark oak window trim') {
   material.color.set('#a08b71');
   return;
 }
 if (descriptor.name==='Game quiet blue night') {
   // Keep the original window and its distant forms, painted in daylight.
   material.onBeforeCompile=shader=>{
     shader.uniforms.aqRoomTime=clock;
     // The imported box has separate UV islands per face; place the view across the actual opening.
     shader.vertexShader='varying vec2 aqWindow;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
       vec2 windowWorld=(modelMatrix*vec4(position,1.)).xy;
       aqWindow=(windowWorld-vec2(-1.555,.30))/vec2(1.65,1.55);`);
     shader.fragmentShader=`varying vec2 aqWindow;
       uniform float aqRoomTime;
       float canopy(float x) {
         return .50*sin(x*6.3)+.24*sin(x*17.8+.9)+.14*cos(x*43.)+.08*sin(x*107.);
       }
       float gardenWash(vec2 p) {
         vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
         vec4 h=fract(sin(dot(i,vec2(17.13,39.71))+vec4(0.,17.13,39.71,56.84))*4375.31);
         return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
       }
       // Drooping sprays in front of the hills. Leaf pairs share a twig and sway together.
       float willow(vec2 uv) {
         float y=uv.y;
         float top=.65-.21*sin(3.8*uv.x+.12);
         float stemX=uv.x-.055*(top-y)-.009*sin(7.*y+.24*aqRoomTime);
         float shoot=floor(stemX*27.);
         float seed=fract(sin(shoot*57.43)*453.73);
         float lengthY=.075+.22*seed;
         float down=top-y;
         float twig=fract(stemX*27.)-.5;
         float leafRow=down*43.;
         float side=mod(floor(leafRow),2.)*2.-1.;
         float along=fract(leafRow);
         float taper=sin(along*3.14159);
         float contour=abs(twig-side*(.035+.30*along));
         float leaf=1.-smoothstep(.085*taper,.085*taper+.035,contour);
         float stem=1.-smoothstep(.009,.044,abs(twig));
         return max(leaf,stem)*smoothstep(0.,.012,down)*(1.-smoothstep(lengthY-.012,lengthY,down))
           *(1.-smoothstep(.24,.42,stemX))*smoothstep(.01,.04,stemX);
       }\n`+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
       #ifdef USE_MAP
         vec2 uv = aqWindow;
         vec3 outside = mix(vec3(1.08,.72,.43),vec3(.25,.55,.74),smoothstep(.13,.74,uv.y));
         float sunDistance=length((uv-vec2(.40,.42))*vec2(1.65/1.55,1.));
         outside=mix(outside,vec3(1.32,.96,.59),.54*(1.-smoothstep(.025,.31,sunDistance)));
         outside=mix(outside,vec3(1.8,1.53,1.05),1.-smoothstep(.034,.037,sunDistance));
         vec2 cloudUV=uv*vec2(4.,23.);
         float clouds=gardenWash(cloudUV)+.32*gardenWash(cloudUV*2.3);
         outside=mix(outside,vec3(1.22,1.17,1.02),.54*smoothstep(.68,1.,clouds)*smoothstep(.21,.49,uv.y));
         float farRidge=.25+.065*cos(5.1*uv.x+.15)+.012*canopy(uv.x+.7);
         outside=mix(outside,vec3(.49,.56,.66),.83*(1.-smoothstep(farRidge-.006,farRidge+.009,uv.y)));
         float ridge=.17+.058*sin(6.4*uv.x-.61)+.021*canopy(uv.x-.42);
         outside=mix(outside,vec3(.29,.46,.48),.85*(1.-smoothstep(ridge-.005,ridge+.006,uv.y)));
         vec2 grove=uv*vec2(21.,24.);
         grove.x+=.12*sin(.20*aqRoomTime+uv.x*8.)+.045*sin(.33*aqRoomTime-uv.x*13.);
         float clusters=gardenWash(grove)+.38*gardenWash(grove*2.4);
         float crown=.105+.075*canopy(uv.x+.38)+.063*(clusters-.62);
         float brush=gardenWash(grove*vec2(4.8,3.1));
         float sunlight=clusters+.3*brush+.65*smoothstep(crown-.065,crown,uv.y);
         vec3 leaves=mix(vec3(.17,.31,.28),vec3(.44,.53,.32),smoothstep(.63,1.22,sunlight));
         outside=mix(outside,leaves,1.-smoothstep(crown-.003,crown+.005,uv.y));
         float branchY=.65-.21*sin(3.8*uv.x+.12);
         float branch=(1.-smoothstep(.001,.005,abs(uv.y-branchY)))*(1.-smoothstep(.20,.42,uv.x));
         outside=mix(outside,vec3(.26,.35,.19),.78*max(willow(uv),branch));
         diffuseColor.rgb *= .18;
         totalEmissiveRadiance = outside*(.92+.35*sqrt(diffuseColor.g));
       #endif`);
   };
   material.customProgramCacheKey=()=>'daylight-window';
   return;
 }
 const c=descriptor.crafted;if(!c)return;material.side=T.DoubleSide;
 const paint = roomPaint.get(descriptor.name);
 const desktop=descriptor.name==='RealFrame refinement / Satin walnut desktop';
 if(desktop) {
   // The tabletop is a closed slab. Cast from its far face so its lit face cannot shadow itself.
   material.shadowSide=T.BackSide;
   material.userData.deskWater={value:0};
   material.color.set('#cf955f');
 }
 const ceramic=descriptor.name==='RealFrame refinement / Speckled oatmeal ceramic';
 if(ceramic){material.color.set('#fff3da');material.roughness=.35;}
 material.onBeforeCompile=shader=>{shader.uniforms.aqDark={value:new T.Color().fromArray(c.dark).convertSRGBToLinear()};shader.uniforms.aqLight={value:material.color};shader.uniforms.aqBump={value:c.bump};shader.uniforms.aqKind={value:c.kind};shader.uniforms.aqScale={value:c.scale};
  shader.vertexShader='varying vec3 aqWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\naqWorld=(modelMatrix*vec4(position,1.)).xyz;aqWorld.z=-aqWorld.z;');
  shader.fragmentShader=`varying vec3 aqWorld;uniform vec3 aqDark,aqLight;uniform float aqBump,aqKind,aqScale;
   float aqHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
   float aqNoise(vec3 p){vec3 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(aqHash(a),aqHash(a+vec3(1,0,0)),f.x),mix(aqHash(a+vec3(0,1,0)),aqHash(a+vec3(1,1,0)),f.x),f.y),mix(mix(aqHash(a+vec3(0,0,1)),aqHash(a+vec3(1,0,1)),f.x),mix(aqHash(a+vec3(0,1,1)),aqHash(a+vec3(1,1,1)),f.x),f.y),f.z);}
   float aqFbm(vec3 p){return aqNoise(p)*.58+aqNoise(p*2.1)*.27+aqNoise(p*4.3)*.15;}
   vec2 aqSurface(vec3 p){float v=aqFbm(p*aqScale),d=v;if(aqKind<.5){float vein=pow(clamp(1.-abs(aqNoise(p*36.)-.52)*38.,0.,1.),4.);v=clamp(aqFbm(p*56.)*.85+aqNoise(p*210.)*.15+vein*.1,0.,1.);d=aqFbm(p*110.)*.4;}else if(aqKind<1.5){float grain=aqFbm(vec3(p.x*9.,p.y*175.,p.z*190.));float fissure=pow(clamp(sin(p.z*680.+p.y*260.+aqNoise(p*25.)*5.),0.,1.),7.);v=clamp(.12+grain*.94-fissure*.23,0.,1.);d=grain-fissure*.5;}else if(aqKind<2.5){v=aqNoise(p*280.)*.55+aqNoise(p*90.)*.45;d=v;}else if(aqKind<3.5){float rings=sin(p.z*110.+aqFbm(vec3(p.x*.8,0.,p.z*8.))*7.);v=.45+aqNoise(vec3(p.x*2.,0.,p.z*95.))*.3+rings*.055;d=v;}else if(aqKind<4.5){v=.5+aqNoise(p*450.)*.24;d=aqNoise(p*380.);}return vec2(v,d);}
  ` + (paint ? `vec2 aqRoomPaint(vec3 p){${paint}}` : '') + '\n' + shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nvec2 aqDetail=${paint ? 'aqRoomPaint' : 'aqSurface'}(aqWorld);diffuseColor.rgb=mix(aqDark,aqLight,clamp(aqDetail.x,0.,1.));`);
  if(descriptor.name==='RealFrame refinement / Quiet plaster' || descriptor.name==='Natural linen curtain'){
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.90,.78,.61),.57+.23*aqDetail.x);`);
  } else if (ceramic) {
    shader.vertexShader='varying float aqPotY;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\naqPotY=position.y;');
    shader.fragmentShader='varying float aqPotY;\n'+shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
      float glazeHeight=aqPotY+.0014*(aqDetail.x-.5);
      float aa=max(.0004,fwidth(glazeHeight));
      float glaze=smoothstep(.048-aa,.048+aa,glazeHeight);
      float brush=1.-smoothstep(.0012,.0012+aa,abs(glazeHeight-.149));
      diffuseColor.rgb=mix(vec3(.40,.18,.092),mix(diffuseColor.rgb,vec3(.09,.26,.24),brush*.85),glaze);`);
  } else if (descriptor.name==='Woven flax coaster') {
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
      diffuseColor.rgb=mix(diffuseColor.rgb,sqrt(diffuseColor.rgb),.55);`);
  } else if (desktop) {
    shader.uniforms.aqDeskWater=material.userData.deskWater;
    shader.fragmentShader='uniform float aqDeskWater;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
      vec3 windowRay=normalize(${windowSunRay})*vec3(1.,1.,-1.);
      diffuseColor.rgb=mix(diffuseColor.rgb,sqrt(diffuseColor.rgb)*vec3(.92,.80,.60),.28);
      // Follow the window ray back through the water box. The projected patch grows as the tank fills.
      vec2 ray=windowRay.xz/windowRay.y;
      vec2 sideA=(vec2(-.58,-.29)-aqWorld.xz)/ray, sideB=(vec2(.58,.29)-aqWorld.xz)/ray;
      vec2 entry=min(sideA,sideB), exitAt=max(sideA,sideB);
      float enter=max(max(entry.x,entry.y),max(0.,-aqWorld.y));
      float leave=min(min(exitAt.x,exitAt.y),aqDeskWater-aqWorld.y);
      // Entry and exit are heights; attenuation uses distance along the slanted ray.
      float waterDistance=max(0.,leave-enter)/windowRay.y;`);
    shader.fragmentShader=shadeWindowSun(shader.fragmentShader,'directLight.color*=exp(-.12*waterDistance);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      reflectedLight.indirectDiffuse *= vec3(1.24,1.16,1.08);`);
  }
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 aqDx=dFdx(-vViewPosition),aqDy=dFdy(-vViewPosition),aqR1=cross(aqDy,normal),aqR2=cross(normal,aqDx);float aqDet=dot(aqDx,aqR1);vec3 aqGradient=sign(aqDet)*(dFdx(aqDetail.y)*aqR1+dFdy(aqDetail.y)*aqR2);normal=normalize(max(abs(aqDet),1e-12)*normal-aqBump*.00015*aqGradient);`);
 };material.customProgramCacheKey=()=> paint ? 'room-paint:' + descriptor.name : 'original-crafted-v1';
}
