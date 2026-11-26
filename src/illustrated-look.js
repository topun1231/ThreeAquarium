const stoneFinish = /^(?:boulder_01_PBR_Copy|rock_0[79]_PBR_Copy|ground_rock)$/;
const woodFinish = /^(?:branch_driftwood|driftwood_scan)_PBR_Copy$/;
export const isPaintedHardscape = material => stoneFinish.test(material.name) || woodFinish.test(material.name);

export function illustrateHardscape(material) {
  const wood = woodFinish.test(material.name);
  material.normalScale.setScalar(wood ? .47 : .35);
  material.aoMapIntensity = wood ? .91 : .83;
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this,shader,renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        // Keep long wood fibres legible; merge more of the fine grain on stone.
        vec3 grain = texture2D(map, vMapUv, ${wood ? '1.05' : '3.0'}).rgb;
        ${wood ? '' : `// Retain the finer seams in a close-up without speckling the distant rock face.
        vec2 footprint=fwidth(vMapUv)*vec2(textureSize(map,0));
        float closeDetail=1.-smoothstep(1.,6.,max(footprint.x,footprint.y));
        grain=mix(grain,texture2D(map,vMapUv,.8).rgb,.29*closeDetail);
        grain = mix(grain, sqrt(grain), .39) * vec3(1.01, 1.035, 1.045);
        // Compress bright mineral flecks in the albedo; light still models each rock face.
        float value=dot(grain,vec3(.22,.64,.14));
        grain*=1.-.30*smoothstep(.18,.56,value);`}
        diffuseColor.rgb *= grain;
      #endif`).replace('#include <normal_fragment_begin>', `
        roughnessFactor = max(.78, roughnessFactor);
        metalnessFactor *= .12;
        #include <normal_fragment_begin>`);
  };
  material.customProgramCacheKey = () => key + (wood ? ':painted-wood' : ':painted-stone');
}

// Input and output are tone-mapped linear RGB. Quantize perceived brightness so the
// same light bands work on a white shell, a dark stone and a saturated red marking.
export const illustratedColourGLSL = `
vec3 aqIllustratedColour(vec3 colour, float smoothBandMix) {
  vec3 pigment = sqrt(clamp(colour, 0.0, 1.0));
  float value = dot(pigment, vec3(.24, .63, .13));
  const float levels = 5.0;
  float steps = value * levels;
  float softness = clamp(fwidth(steps), .07, .24);
  float band = (floor(steps) + smoothstep(.5-softness, .5+softness, fract(steps))) / levels;
  // Broad washes of window light stay continuous; keep the painted steps on textured edges.
  float pigmentMix = mix(smoothBandMix, .78, smoothstep(.005, .055, fwidth(value)));
  float paint = .045 + .96 * mix(value, band, pigmentMix);
  vec3 chroma = pigment - value;
  vec3 shade = mix(vec3(.001, .004, .004), vec3(.025, .012, -.018), value);
  pigment = clamp(vec3(paint) + chroma * 1.15 + shade, 0.0, 1.0);
  return pigment * pigment;
}
`;

// Shape broad planes from the mesh normal, without turning normal-map grain into ink.
export const illustratedPlanesGLSL = `
  float aqPlane = dot(nonPerturbedNormal, mat3(viewMatrix) * normalize(vec3(-.32, .85, .42)));
  float aqAA = clamp(fwidth(aqPlane), .035, .16);
  float aqMid = smoothstep(.03-aqAA, .03+aqAA, aqPlane);
  float aqLit = smoothstep(.61-aqAA, .61+aqAA, aqPlane);
  outgoingLight *= mix(vec3(.80,.81,.81), vec3(1.08,1.055,1.0), aqMid)
                 + aqLit * vec3(.28,.23,.15);
`;

export const illustratedSceneFragment = `
uniform sampler2D image, depth;
uniform vec2 aqSize;
uniform float aqNear, aqFar, aqPaper, aqFocus;
varying vec2 v;
${illustratedColourGLSL}
float distanceAt(vec2 uv) {
  float z = texture2D(depth, uv).r;
  return aqNear * aqFar / (aqFar - z * (aqFar - aqNear));
}
float backgroundAt(vec2 uv, float here) {
  return smoothstep(.012,.075,(distanceAt(uv)-here)/max(.025,here));
}
void main() {
  vec2 px = 1.0 / aqSize;
  vec2 dx = vec2(px.x, 0.), dy = vec2(0., px.y);
  vec3 centre = texture2D(image, v).rgb;
  vec3 paint = centre * 2.;
  float weight = 2., distanceHere = distanceAt(v);
  vec4 edges = vec4(0.);
  for (int i = 0; i < 4; i++) {
    vec2 uv = v + (i == 0 ? dx : i == 1 ? -dx : i == 2 ? dy : -dy);
    float jump = (distanceAt(uv) - distanceHere) / max(.025, distanceHere);
    vec3 neighbour = texture2D(image, uv).rgb;
    float local = (1. - smoothstep(.004,.025,abs(jump))) /
      (1. + 7. * length(neighbour-centre));
    paint += local * neighbour;
    weight += local;
    edges[i] = smoothstep(.012,.075,jump);
  }
  vec3 resolved=paint/weight;
  float blur=0.;
  if(aqFocus>0.){
    float focalPower=1./aqFocus;
    blur=min(4.5,abs(1./distanceHere-focalPower)*.00085*aqSize.y)*(1.-smoothstep(.17,.23,aqFocus));
    if(blur>.55){
      vec3 soft=resolved;
      float count=1.;
      vec2 tap=vec2(.34,.13);
      for(int i=0;i<8;i++){
        vec2 uv=v+tap*px*blur;
        float distanceTap=distanceAt(uv);
        // A sharp white shell should not bleed into the defocused soil beside it.
        float accept=smoothstep(.2,1.,abs(1./distanceTap-focalPower)*.00085*aqSize.y);
        soft+=texture2D(image,uv).rgb*accept;
        count+=accept;
        tap=mat2(-.737,.675,-.675,-.737)*tap*1.14;
      }
      resolved=mix(resolved,soft/count,smoothstep(.55,1.3,blur));
    }
  }
  gl_FragColor = vec4(resolved, 1.);
  #include <tonemapping_fragment>
  vec3 pigment = aqIllustratedColour(gl_FragColor.rgb, 0.);
  float silhouette = max(max(edges.x, edges.y), max(edges.z, edges.w));
  // A blade with background on both sides has no interior pixel left for its colour.
  float thin = max(min(edges.x, edges.y), min(edges.z, edges.w));
  if (aqPaper>.5 && silhouette>.0 && thin<1.) {
    // Look across the stroke. The far edge of a narrow blade can be diagonal.
    vec2 inward=vec2(edges.y-edges.x,edges.w-edges.z);
    vec2 across=4.*px*inward/max(.001,length(inward));
    thin=max(thin,backgroundAt(v+across,distanceHere));
  }
  gl_FragColor.rgb = mix(pigment, min(pigment, vec3(.12,.09,.075)), silhouette*mix(.57,.09,thin)*(1.-smoothstep(.6,3.,blur)));
  if (aqPaper>.5) {
    vec3 ink=sqrt(max(gl_FragColor.rgb,vec3(0.)));
    float value=dot(ink,vec3(.24,.63,.13));
    vec2 fibre=floor(v*aqSize/min(2.,max(1.,aqSize.y/900.)));
    float tooth=fract(52.9829189*fract(dot(fibre,vec2(.06711056,.00583715))))-.5;
    ink=ink*.965+mix(vec3(.043,.050,.058),vec3(.044,.035,.017),smoothstep(.16,.82,value));
    ink+=tooth*.012;
    gl_FragColor.rgb=ink*ink;
  }
  #include <colorspace_fragment>
}`;
