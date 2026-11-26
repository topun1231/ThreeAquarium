// World-space surface height in metres, shared by the water and the light it refracts.
export const waterRipplesGLSL = `
  const vec2 waveA=vec2(13.,-6.), waveB=vec2(8.,16.), waveC=vec2(53.,27.);
  const vec3 amplitudes=vec3(.0012,.00054,.00032);
  vec3 wavePhase(vec2 p,float t){return vec3(dot(p,waveA),dot(p,waveB),dot(p,waveC))+t*vec3(.73,-.54,1.1);}
`;
