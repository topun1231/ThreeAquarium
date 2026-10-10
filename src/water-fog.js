/** Distance through water between the glass/surface fragment and the opaque scene behind it. */
export const MAX_WATER_TRAVEL = 0.9;

export const FOG_GLSL = `
float aqViewZ(float depth){float z=depth*2.-1.;return (2.*aqNear*aqFar)/(aqFar+aqNear-z*(aqFar-aqNear));}
float aqTravel(float glassDepth,float sceneDepth){return clamp(aqViewZ(sceneDepth)-aqViewZ(glassDepth),0.,${MAX_WATER_TRAVEL.toFixed(2)});}
vec3 aqFogged(vec3 color,vec2 uv){float fog=clamp(aqTravel(gl_FragCoord.z,texture2D(aqDepth,uv).r)/.6,0.,1.)*aqFog*aqWet;vec3 absorbed=color*mix(vec3(1.),vec3(.70,.90,.85),min(1.,fog*1.6));return mix(absorbed,vec3(.050,.105,.095),fog);}
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
