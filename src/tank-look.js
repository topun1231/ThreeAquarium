import {gameStorage} from './live-wallpaper.js';
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {illustratedPlanesGLSL,isPaintedHardscape} from './illustrated-look.js';
import {waterRipplesGLSL} from './water-ripples.js';
import {shadeWindowSun,windowSunOffset} from './crafted.js';

const KEY = 'aquarium.three.quality.v1';
const PRESETS = {
  high: {fog:0.22, caustic:0.42, shafts:true, pearling:1, floraDensity:1, floraShadows:true, shrimpDetail:'full'},
};

export function qualityPreset() {
  return PRESETS.high;
}

export function initialQuality(storage = gameStorage) {
  try { storage?.setItem(KEY, 'high'); } catch {}
  return 'high';
}


function thicken(node, floor, target) {
  const scale = node.scale;
  for (const axis of ['x', 'y', 'z']) if (scale[axis] > 0 && scale[axis] < floor) scale[axis] = target;
}

export function shapeTankLights(scene) {
  scene.background = new T.Color('#c3c8bb');
  for (const light of scene.children) {
    if (!light.isLight) continue;
    if (light.isHemisphereLight) {
      light.color.set('#fff2dc');
      light.groundColor.set('#c5ae9b');
      light.intensity = .95;
    }
    else if (light.isSpotLight && light.castShadow) {
      light.penumbra = 0.78;
      // The lamp is only 0.17 above the water; include blockers close to the emitter.
      light.shadow.camera.near=.01;
      light.shadow.camera.updateProjectionMatrix();
    } else if (light.isPointLight) light.intensity *= 0.4;
    else if (light.isDirectionalLight && !light.castShadow) {
      // Diffuse window fill: keep white shells neutral on the side facing away from the sun.
      light.color.set('#eeeae3');
      light.userData.windowLight=true;
    }
    else if (light.isDirectionalLight && light.castShadow) {
      // Reuse the existing shadow map for the daylight entering from the left window.
      light.target.position.set(.18,.02,.26);
      const frame=scene.getObjectByName('Illustrated window shadow frame');
      light.position.copy(light.target.position).addScaledVector(windowSunOffset,frame?3:1);
      light.color.set('#ffe4b6');
      light.intensity=1.8;
      light.userData.windowLight=true;
      if(frame){
        light.target.position.set(.9,.24,-.18);
        light.position.copy(light.target.position).addScaledVector(windowSunOffset,3);
        // Cover the window, cabinet, rack and visible floor in the room overview.
        Object.assign(light.shadow.camera,{left:-7.1,right:6.72,top:4.35,bottom:-4.86,far:14.4});
        light.shadow.mapSize.set(4096,3072);
        light.shadow.camera.updateProjectionMatrix();
      }
    }
  }
}

export function prepareWallpaperLights(scene,renderer) {
  scene.traverse(light=>{
    if (!light.isLight || !light.layers.isEnabled(0)) return;
    // Both passes share the same light list so Three can reuse its program parameters.
    light.layers.enable(1);
    if (renderer.shadowMap.type!==T.PCFShadowMap || !light.castShadow || !(light.isDirectionalLight || light.isSpotLight)) return;
    const shadow=light.shadow;
    if (shadow.map) return;
    const {x:width,y:height}=shadow.mapSize;
    if (Math.max(width,height)>renderer.capabilities.maxTextureSize) return;
    // PCF and the water shader sample only depth. The colour attachment can be a single byte per texel.
    const depth=new T.DepthTexture(width,height,T.UnsignedIntType);
    depth.compareFunction=renderer.capabilities.reversedDepthBuffer ? T.GreaterEqualCompare : T.LessEqualCompare;
    depth.minFilter=depth.magFilter=T.LinearFilter;
    shadow.map=new T.WebGLRenderTarget(width,height,{format:T.RedFormat,depthTexture:depth});
    shadow.needsUpdate=true;
    shadow.camera.updateProjectionMatrix();
  });
}

function installCaustics(materials, time, gain, level) {
  const header = 'varying vec3 aqCausticPos;\nuniform float aqCTime;\nuniform float aqCGain;\nuniform float aqCLevel;\n';
  for (const material of materials) {
    if (!material?.isMeshStandardMaterial || material.userData.caustic) continue;
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey?.bind(material);
    material.userData.caustic = true;
    material.onBeforeCompile = (shader, renderer) => {
      previous?.(shader, renderer);
      shader.uniforms.aqCTime = time;
      shader.uniforms.aqCGain = gain;
      shader.uniforms.aqCLevel = level;
      shader.vertexShader = header + shader.vertexShader.replace('#include <project_vertex>', 'vec4 aqCP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\naqCP = instanceMatrix * aqCP;\n#endif\naqCausticPos = (modelMatrix * aqCP).xyz;\n#include <project_vertex>');
      shader.fragmentShader = header + waterRipplesGLSL + shadeWindowSun(shader.fragmentShader, `
        float aqBelow = 1.0 - smoothstep(aqCLevel - 0.06, aqCLevel + 0.005, aqCausticPos.y);
        float aqInside = step(abs(aqCausticPos.x), 0.6) * step(abs(aqCausticPos.z), 0.31) * step(-0.002, aqCausticPos.y);
        vec3 sunRay=refract(-inverseTransformDirection(directLight.direction,viewMatrix),vec3(0.,1.,0.),1./1.333);
        float aqFacing=max(0.,dot(nonPerturbedNormal,mat3(viewMatrix)*-sunRay));
        float depthBelow=max(0.,aqCLevel-aqCausticPos.y);
        vec2 surfaceXZ=aqCausticPos.xz+sunRay.xz/sunRay.y*depthBelow;
        vec2 opening=1.-smoothstep(vec2(.50,.22),vec2(.60,.31),abs(surfaceXZ));
        // Crests concentrate light and troughs spread it; both effects grow with travel.
        vec3 crest=amplitudes*sin(wavePhase(surfaceXZ,aqCTime));
        // Short waves spread over depth as light passes through a wide window.
        float focus=dot(crest,vec3(dot(waveA,waveA),dot(waveB,waveB),dot(waveC,waveC)*exp(-7.*depthBelow)))*depthBelow;
        directLight.color*=1.+focus*aqFacing*opening.x*opening.y*aqCGain*aqBelow*aqInside;
      `).replace('#include <opaque_fragment>',illustratedPlanesGLSL+'\n#include <opaque_fragment>');
    };
    material.customProgramCacheKey = () => `${previousKey ? previousKey() : material.uuid}:caustic2`;
    material.needsUpdate = true;
  }
}

export function installTankLook({scene, aq, water, runtime}) {
  const skip = new Set();
  for (const mesh of aq.meshes) {
    const list = [].concat(mesh.material);
    if (mesh.name==='Diffused LED underside' && mesh.parent) {
      // Keep the lens seated against the housing while exposing its frosted lower edge.
      const mount=mesh.parent;
      const thickness=Math.max(mount.scale.y,.008);
      mount.position.y-=(thickness-mount.scale.y)/2;
      mount.scale.y=thickness;
      mount.scale.z=Math.max(mount.scale.z,.044);
    }
    if (mesh.name==='Slim anodized plant light' && mesh.parent) {
      const mount=mesh.parent, extra=Math.max(0,.023-mount.scale.y);
      mount.scale.y+=extra;mount.position.y+=extra/2;
      mount.scale.z=Math.max(mount.scale.z,.069);
    }
    if (/^(Slim anodized plant light|Diffused LED underside)$/.test(mesh.name) && mesh.parent && mesh.geometry.name==='Cube') {
      const {x,y,z}=mesh.parent.scale;
      const profile=new RoundedBoxGeometry(x,y,z,2,y*.43).scale(1/x,1/y,1/z);
      profile.clearGroups();profile.addGroup(0,profile.attributes.position.count,0);
      mesh.geometry=profile;
    }
    if (mesh.userData.creatureId || /pane|Water|glass|rim|Waterline|Edge/i.test(mesh.name)) list.forEach(m => skip.add(m));
    if (/clear pane/i.test(mesh.name) && mesh.parent) thicken(mesh.parent, 0.02, 0.008);
    // The pane shader draws the meniscus at the water level.
    if (/^Waterline/.test(mesh.name)) mesh.visible=false;
    if (mesh.name==='Fixed tank rim') {
      // Match the edge of the glass to the pane thickness so it survives the room view.
      if(mesh.parent)thicken(mesh.parent,.004,.006);
    }
  }
  for (const material of aq.materials) {
    if (material.name!=='GlassEdge') continue;
    material.color.set('#83a99a');
    material.roughness=.24;
    material.transparent = true;
    material.opacity = .78;
  }
  const time = {value:0};
  const gain = {value:0};
  const waterHeight = {value:0.58};
  const diffuser=aq.materials.find(m=>m?.name==='Soft LED emitter');
  if(diffuser)diffuser.emissive.set('#ffe5b0');
  const deskWater=aq.materials.find(m=>m?.userData.deskWater)?.userData.deskWater;
  if (runtime) {
    runtime.onCatalogReady = catalog => installCaustics(catalog.materials.filter(m => isPaintedHardscape(m) || m.userData.source?.leaf >= 0), time, gain, waterHeight);
    if (runtime.catalog) runtime.onCatalogReady(runtime.catalog);
  }
  // The walnut already shades the window and transmitted light; underwater shading flattens its sunlit grain.
  const receivers = aq.materials.filter(material => material?.isMeshStandardMaterial && !material.userData.deskWater && !skip.has(material) && !/Glass|Water|Shrimp|shrimp/i.test(material.name || ''));
  let causticsOn = false;
  let level = 'high';
  const listeners = [];
  function apply() {
    level = initialQuality();
    const preset = PRESETS[level];
    if (water?.fog) water.fog.value = preset.fog;
    gain.value = preset.caustic;
    if (preset.caustic > 0 && !causticsOn) { installCaustics(receivers, time, gain, waterHeight); causticsOn = true; }
    for (const fn of listeners) fn(PRESETS[level], level);
  }
  apply();
  return {
    get level(){ return level; },
    setQuality: apply,
    get preset(){ return PRESETS[level]; },
    onChange(fn){ listeners.push(fn); fn(PRESETS[level], level); },
    update(now, {wet = true, lightOn = true, level:height = 0.58} = {}) {
      time.value = now;
      const preset = PRESETS[level];
      waterHeight.value = height;
      if(diffuser)diffuser.emissiveIntensity=lightOn?1.6:0;
      if(deskWater)deskWater.value=wet?height:0;
      const underwater = wet && height > 0.035;
      gain.value = underwater ? preset.caustic : 0;
      if(water)water.lampScattering=underwater && lightOn && preset.shafts;
    },
  };
}
