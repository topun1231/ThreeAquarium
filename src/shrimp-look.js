import * as T from 'three';
import {stableSeed} from './state.js';
import {isFemale, MATURITY_DAYS, BERRY_DAYS} from './care.js';

const DAY = 86400;
const RIG_Y = new T.Vector3(0, 1, 0), RIG_Z = new T.Vector3(0, 0, 1);
const deg = T.MathUtils.degToRad;
const patched = new WeakSet();
const axes = new Map();
const MOTION = /^(AntennaLong_[LR]_0[123]|Antennule_[LR]|Pleopod_[LR]_0[1-5]|FeedingAppendage_[LR]_0[12]|Abdomen_0[3-6]|TailFan_[LR])$/;

const FRAGMENT_HEAD = `varying vec3 aqBody;
uniform float aqSkinGain, aqPigment, aqSeed, aqShell;
uniform vec3 aqTint;
float aqHash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float aqNoise3(vec3 p){vec3 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(aqHash3(a),aqHash3(a+vec3(1,0,0)),f.x),mix(aqHash3(a+vec3(0,1,0)),aqHash3(a+vec3(1,1,0)),f.x),f.y),mix(mix(aqHash3(a+vec3(0,0,1)),aqHash3(a+vec3(1,0,1)),f.x),mix(aqHash3(a+vec3(0,1,1)),aqHash3(a+vec3(1,1,1)),f.x),f.y),f.z);}
`;

const PIGMENT = `#include <map_fragment>
{
  vec3 aqBase = diffuseColor.rgb;
  float aqRed = clamp((aqBase.r - max(aqBase.g, aqBase.b)) * 3.5, 0.0, 1.0);
  vec3 aqP = aqBody * 360.0 + vec3(aqSeed);
  float aqN = aqNoise3(aqP) * 0.6 + aqNoise3(aqP * 2.3) * 0.3 + aqNoise3(aqP * 5.1) * 0.1;
  float aqMask = smoothstep(0.66 - aqPigment * 0.5, 0.8 - aqPigment * 0.45, aqN);
  float aqFar = smoothstep(0.35, 1.1, length(fwidth(aqP)));
  aqMask = mix(aqMask, 0.35 + aqPigment * 0.55, aqFar);
  float aqLum = dot(aqBase, vec3(0.3, 0.5, 0.2));
  vec3 aqClear = mix(vec3(aqLum), aqBase, 0.45) * vec3(1.04, 0.92, 0.9) + vec3(0.035, 0.03, 0.028);
  vec3 aqDeep = aqBase * aqTint;
  diffuseColor.rgb = mix(aqBase, mix(aqClear, aqDeep, aqMask), aqSkinGain * aqRed);
}`;

const LIGHT = `#include <lights_physical_pars_fragment>
void AQShrimpDirect(const in IncidentLight light, const in vec3 p, const in vec3 n, const in vec3 v, const in vec3 nc, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(light, p, n, v, nc, material, reflectedLight);
  float d = dot(n, light.direction);
  float wrap = max(0.0, (d + 0.5) / 1.5) - max(0.0, d);
  float back = pow(clamp(dot(v, -light.direction), 0.0, 1.0), 3.0) * 0.6 + max(0.0, -d) * 0.25;
  reflectedLight.directDiffuse += material.diffuseColor * vec3(1.0, 0.55, 0.45) * light.color * (wrap * 0.35 + back * 0.5) * aqSkinGain;
  vec3 h = normalize(light.direction + v);
  reflectedLight.directSpecular += light.color * pow(max(dot(n, h), 0.0), 150.0) * (0.35 + 0.5 * aqShell) * aqSkinGain;
}
#undef RE_Direct
#define RE_Direct AQShrimpDirect`;

function patchMaterial(material, uniforms) {
  if (patched.has(material) || /eye/i.test(material.name)) return;
  patched.add(material);
  const shell = /shell/i.test(material.name) ? 1 : 0;
  if (shell) material.roughness = Math.min(material.roughness, 0.3);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, {aqShell:{value:shell}});
    shader.vertexShader = 'varying vec3 aqBody;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\naqBody = position;');
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace('#include <map_fragment>', PIGMENT).replace('#include <lights_physical_pars_fragment>', LIGHT);
  };
  material.customProgramCacheKey = () => 'shrimp-look-v1';
  material.needsUpdate = true;
}

function eggCluster() {
  const sphere = new T.SphereGeometry(0.0005, 7, 5), geos = [], rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 28; i++) {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(rand());
    const x = 0.0108 + u * 0.0028, y = 0.00125 + Math.sin(a) * r * 0.0005, z = Math.cos(a) * r * 0.0012 * (1 - Math.abs(u) * 0.35);
    geos.push(sphere.clone().translate(x, y, z));
  }
  const merged = new T.BufferGeometry(), parts = geos.map(g => g.toNonIndexed());
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0), pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let at = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, at * 3); nor.set(g.attributes.normal.array, at * 3); at += g.attributes.position.count; }
  merged.setAttribute('position', new T.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new T.BufferAttribute(nor, 3));
  merged.computeBoundingSphere();
  return merged;
}

function boneAxes(animal, bone) {
  if (axes.has(bone.name)) return axes.get(bone.name);
  animal.rig.updateMatrixWorld(true);
  const q = animal.rig.getWorldQuaternion(new T.Quaternion()).invert().multiply(bone.getWorldQuaternion(new T.Quaternion())).invert();
  const value = {y:RIG_Y.clone().applyQuaternion(q).normalize(), z:RIG_Z.clone().applyQuaternion(q).normalize()};
  axes.set(bone.name, value);
  return value;
}

export function installShrimpLook({record, simSeconds}) {
  const skin = {value:1};
  const eggGeometry = eggCluster();
  let detail = 'full';
  const qa = new T.Quaternion(), qb = new T.Quaternion(), camPos = new T.Vector3(), here = new T.Vector3();

  function prepare(animal) {
    if (animal.look) return animal.look;
    const seed = stableSeed(String(animal.id)), female = isFemale(animal.id), h1 = ((seed >>> 3) % 1000) / 1000, h2 = ((seed >>> 13) % 1000) / 1000;
    const tint = female ? new T.Vector3(1.1 + h1 * 0.06, 0.8 + h2 * 0.06, 0.78 + h2 * 0.05) : new T.Vector3(1.0 + h1 * 0.05, 0.92 + h2 * 0.06, 0.9 + h2 * 0.05);
    const uniforms = {aqSkinGain:skin, aqPigment:{value:female ? 0.85 + h1 * 0.15 : 0.45 + h2 * 0.2}, aqSeed:{value:(seed % 997) * 0.37}, aqTint:{value:tint}};
    const bones = {};
    animal.rig.traverse(o => {
      if (o.isMesh) [].concat(o.material).forEach(m => patchMaterial(m, uniforms));
      if (o.isBone && MOTION.test(o.name)) bones[o.name] = o;
      if (o.isBone && o.name === 'Abdomen_02') bones.eggHost = o;
    });
    animal.look = {female, uniforms, bones, deltas:[], escapeAt:-1, wasEscape:false, phase:(seed % 628) / 100, size:(female ? 1.08 : 0.97) + (h1 - 0.5) * 0.04, eggs:null, basePigment:uniforms.aqPigment.value};
    return animal.look;
  }

  function showEggs(animal, look, progress) {
    if (!look.eggs) {
      const material = new T.MeshStandardMaterial({name:'Shrimp eggs', color:'#d9a531', roughness:0.32, emissive:'#3a2208', emissiveIntensity:0.25});
      look.eggs = new T.Mesh(eggGeometry, material);
      look.eggs.name = 'Shrimp eggs';
      look.eggs.castShadow = false;
      look.eggs.userData.creatureId = animal.id;
      look.attached = false;
    }
    if (!look.attached && look.bones.eggHost) {
      animal.rig.updateMatrixWorld(true);
      const local = look.bones.eggHost.matrixWorld.clone().invert().multiply(animal.rig.matrixWorld);
      look.eggs.matrixAutoUpdate = false;
      look.eggs.matrix.copy(local);
      look.bones.eggHost.add(look.eggs);
      look.attached = true;
    }
    look.eggs.material.color.set('#e0b234').lerp(new T.Color('#7d7f2c'), Math.min(1, Math.max(0, progress)));
    look.eggs.visible = true;
  }

  return {
    get detail() { return detail; },
    setQuality(preset) { detail = preset?.shrimpDetail || 'full'; skin.value = detail === 'basic' ? 0 : 1; },
    /** Size, pigment by age, eggs. Runs every frame, also while paused. */
    sync(animals) {
      const sim = simSeconds();
      for (const animal of animals) {
        const look = prepare(animal), r = record(animal.id);
        animal.sizeFactor = look.size;
        const age = r?.ageDays;
        look.uniforms.aqPigment.value = look.basePigment * (age == null || age >= MATURITY_DAYS ? 1 : 0.45 + 0.55 * Math.max(0, age) / MATURITY_DAYS);
        if (look.female && r?.hatchAt != null) showEggs(animal, look, 1 - (r.hatchAt - sim) / (BERRY_DAYS * DAY));
        else if (look.eggs) look.eggs.visible = false;
      }
    },
    before(animals) {
      for (const animal of animals) {
        const look = animal.look;
        if (!look) continue;
        for (let i = look.deltas.length - 1; i >= 0; i--) { const [bone, q] = look.deltas[i]; bone.quaternion.multiply(q.invert()); }
        look.deltas.length = 0;
      }
    },
    after(animals, time, camera) {
      camera.getWorldPosition(camPos);
      for (const animal of animals) {
        const look = prepare(animal), b = look.bones, active = animal.active, swim = active === 'RoutineSwim' || active === 'EscapeSwim';
        const distance = animal.rig.getWorldPosition(here).distanceTo(camPos);
        const near = detail === 'full' ? 2.6 : 0.9, far = detail === 'basic' ? 0.9 : 2.6;
        if (distance > far) continue;
        const full = distance <= near && detail !== 'basic';
        const turn = (bone, yDeg, zDeg) => {
          if (!bone || (!yDeg && !zDeg)) return;
          const ax = boneAxes(animal, bone);
          qa.setFromAxisAngle(ax.y, deg(yDeg));
          qb.setFromAxisAngle(ax.z, deg(zDeg));
          const q = qa.clone().multiply(qb);
          bone.quaternion.multiply(q);
          look.deltas.push([bone, q]);
        };
        const t = time + look.phase;
        if (active !== 'Groom') for (const side of ['L', 'R']) {
          const s = side === 'L' ? 0 : 1.3;
          [1, 2, 3].forEach((k, i) => turn(b[`AntennaLong_${side}_0${k}`], (4 * Math.sin(t * 1.1 + s - i * 0.5) + 1.8 * Math.sin(t * 2.7 + s * 2 - i * 0.7)) * (1 - i * 0.25), 2.2 * Math.sin(t * 0.8 + s - i * 0.4)));
          turn(b[`Antennule_${side}`], 3 * Math.sin(t * 3.1 + s), 2 * Math.sin(t * 2.3 + s));
        }
        if (active === 'EscapeSwim' && !look.wasEscape) look.escapeAt = time;
        look.wasEscape = active === 'EscapeSwim';
        const flick = look.escapeAt >= 0 ? (time - look.escapeAt) / 0.32 : 2;
        if (flick < 1) {
          const env = Math.sin(Math.PI * flick);
          for (const name of ['Abdomen_03', 'Abdomen_04', 'Abdomen_05', 'Abdomen_06']) turn(b[name], 0, -9 * env);
          turn(b.TailFan_L, 14 * env, 0);
          turn(b.TailFan_R, -14 * env, 0);
        }
        if (!full) continue;
        const berried = look.eggs?.visible;
        const [hz, amp] = swim ? [7, 24] : active === 'Walk' ? [3, 12] : berried ? [2.6, 15] : [1.4, 7];
        for (let i = 1; i <= 5; i++) {
          const angle = amp * Math.sin(t * hz * Math.PI * 2 - (5 - i) * 0.9);
          turn(b[`Pleopod_L_0${i}`], 0, angle);
          turn(b[`Pleopod_R_0${i}`], 0, angle);
        }
        const graze = active === 'Graze';
        for (const [side, offset] of [['L', 0], ['R', Math.PI]]) {
          const pulse = graze ? Math.max(0, Math.sin(t * 2 * Math.PI * 2 + offset)) : 0.5 + 0.5 * Math.sin(t * 0.7 * Math.PI * 2 + offset);
          turn(b[`FeedingAppendage_${side}_01`], graze ? 4 * Math.sin(t * 5 + offset) : 0, graze ? 16 * pulse ** 1.5 : 3 * pulse);
          turn(b[`FeedingAppendage_${side}_02`], 0, graze ? 12 * pulse : 2 * pulse);
        }
      }
    },
  };
}
