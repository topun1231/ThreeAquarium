/** Distance through water between the glass/surface fragment and the opaque scene behind it. */
export const MAX_WATER_TRAVEL = 0.9;

export const FOG_GLSL = `
float aqViewZ(float depth){float z=depth*2.-1.;return (2.*aqNear*aqFar)/(aqFar+aqNear-z*(aqFar-aqNear));}
vec2 aqTravel(float glassDepth,float sceneDepth){
  vec3 ray=normalize(aqWorld-cameraPosition);
  float sceneDistance=(aqViewZ(sceneDepth)-aqViewZ(glassDepth))/max(.001,-(mat3(viewMatrix)*ray).z);
  // Clip the ray to the actual water volume, including the current fill height.
  vec3 safeRay=mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))*max(abs(ray),vec3(.00001));
  vec3 local=aqWorld;
  #ifdef AQ_NEIGHBOUR_SURFACE
    local-=aqTankOrigin;
  #endif
  vec3 a=(vec3(-.608,0.,-.308)-local)/safeRay;
  vec3 b=(vec3(.608,aqLevel,.308)-local)/safeRay;
  vec3 entry=min(a,b),leave=max(a,b);
  float start=max(0.,max(entry.x,max(entry.y,entry.z)));
  float end=min(sceneDistance,min(leave.x,min(leave.y,leave.z)));
  return vec2(start,max(start,end));
}
vec3 aqFogged(vec3 color,float travel){
  float fog=clamp(travel/.6,0.,1.)*aqFog*aqWet;
  return mix(color,vec3(.12,.12,.115),fog*.32);
}
`;

export function viewZ(depth, near, far) {
  const z = depth * 2 - 1;
  return (2 * near * far) / (far + near - z * (far - near));
}

export function waterTravel(glassDepth, sceneDepth, near, far) {
  return Math.min(MAX_WATER_TRAVEL, Math.max(0, viewZ(sceneDepth, near, far) - viewZ(glassDepth, near, far)));
}

export function fogAmount(travel, strength) {
  return Math.min(1, Math.max(0, travel / 0.6)) * strength;
}
