import * as T from 'three';
import {illustratedPlanesGLSL} from './illustrated-look.js';
import {stableSeed} from './state.js';
import {MATURITY_DAYS, BERRY_DAYS} from './care.js';
import {shrimpSizeFactor} from './shrimp-scale.js';
import {crystalGrowthFraction, inTank} from './crystal-breeding.js';
import {shrimpViewGeometry} from './aquarium-geometry.js';

const DAY = 86400;
const RIG_Y = new T.Vector3(0, 1, 0), RIG_Z = new T.Vector3(0, 0, 1);
const deg = T.MathUtils.degToRad;
const hatchQuality = [4, 3, 3];
const patched = new WeakSet();
const axes = new Map();
const MOTION = /^(AntennaLong_[LR]_0[123]|Antennule_[LR]|Pleopod_[LR]_0[1-5]|FeedingAppendage_[LR]_0[12]|Abdomen_0[3-6]|TailFan_[LR])$/;

const FRAGMENT_HEAD = `varying vec3 aqBody;
varying float aqDorsal;
uniform float aqSkinGain, aqPigment, aqSeed, aqShell;
uniform vec3 aqTint;
uniform float aqCrystal, aqCrystalPattern, aqCrystalCoverage, aqCrystalEdge, aqCrystalWhite;
uniform vec3 aqCrystalColour, aqMarkingShape;
float aqHash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float aqNoise3(vec3 p){vec3 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(aqHash3(a),aqHash3(a+vec3(1,0,0)),f.x),mix(aqHash3(a+vec3(0,1,0)),aqHash3(a+vec3(1,1,0)),f.x),f.y),mix(mix(aqHash3(a+vec3(0,0,1)),aqHash3(a+vec3(1,0,1)),f.x),mix(aqHash3(a+vec3(0,1,1)),aqHash3(a+vec3(1,1,1)),f.x),f.y),f.z);}
`;

const PIGMENT = `#include <map_fragment>
float aqPaleShell = 0.;
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
  if (aqCrystal > 0.5) {
    // Rest-pose X runs from the head (0) to the tail (-0.025m) in the existing mesh.
    // The varying is captured before skinning, so the markings bend with the animal.
    float aqAlong = clamp(-aqBody.x / 0.025, 0.0, 1.0);
    float aqEdge = mix(0.027, 0.0035, aqCrystalEdge);
    // The white saddle follows the curve of the shell, even on a sharply edged specimen.
    float aqWobble = (aqNoise3(aqBody * 620.0 + aqSeed) - 0.5) * (1.0 - aqCrystalEdge) * 0.025
      + .020 * (1. - aqDorsal * aqDorsal);
    // Work across the shell in its rest pose. Both flanks share the same marking over the back.
    float flank = clamp(aqBody.y / .0024, -1., 1.);
    float saddleBend = (flank * flank - .4) * aqMarkingShape.z;
    float aqColourMask;
    if (aqCrystalPattern < 0.5) {
      vec3 centres = vec3(.30, .57, .81) + vec3(-.014, .038, .016) * aqMarkingShape.x;
      // Widen one saddle by the amount taken from its neighbour. Coverage still sets their total.
      float balance = .28 * aqMarkingShape.y;
      vec3 widths = mix(.022, .082, aqCrystalCoverage) * vec3(1.+balance, 1.-balance, 1.);
      vec3 borders = abs(vec3(aqAlong - .058 * saddleBend) - centres) - widths;
      // A narrow white band must still cross the flank, even where the shell rounds away.
      float contour = min(aqWobble, .45 * min(min(widths.x, widths.y), widths.z));
      aqColourMask = smoothstep(-aqEdge, aqEdge, min(min(borders.x, borders.y), borders.z) + contour);
    } else if (aqCrystalPattern < 1.5) {
      float headPatch = mix(0.25, 0.13, aqCrystalCoverage);
      float spotScale = mix(1.36, 0.64, aqCrystalCoverage);
      float oval = 1. + .22 * aqMarkingShape.y;
      float centre = .52 + .057 * aqMarkingShape.z;
      vec2 spot = vec2((aqAlong - centre) / (.105 * oval), (aqBody.y - .00032 * aqMarkingShape.x) * oval / .0019);
      float aqSpot = length(spot) / spotScale;
      float spotEdge = mix(0.26, 0.055, aqCrystalEdge);
      aqColourMask = max(1.0 - smoothstep(headPatch - aqEdge, headPatch + aqEdge, aqAlong), 1.0 - smoothstep(1.0 - spotEdge, 1.0 + spotEdge, aqSpot + aqWobble));
    } else {
      float headPatch = mix(0.25, 0.07, aqCrystalCoverage);
      float sweep = .060 * saddleBend + .018 * flank * aqMarkingShape.y;
      headPatch += min(1., headPatch / .12) * (sweep + .022 * aqMarkingShape.x);
      aqColourMask = 1.0 - smoothstep(headPatch - aqEdge, headPatch + aqEdge, aqAlong + aqWobble);
    }
    aqPaleShell = aqShell * (1. - aqColourMask);
    vec3 aqWhite = aqCrystalWhite * vec3(1.0, 0.99, 0.96);
    vec3 aqMarkings = mix(aqWhite, aqCrystalColour, aqColourMask);
    // Keep the original shell's fine relief visible through both white and coloured pigment.
    float shellGrain = mix(aqNoise3(aqBody * 1150.0 + aqSeed), .5, aqFar);
    aqMarkings *= .82 + .18 * shellGrain + .14 * clamp(aqLum, 0., 1.);
    if (aqShell > .5) {
      // Keep the atlas's fine pigment texture without transferring its old red patches to new markings.
      #ifdef USE_MAP
        vec3 broadPigment=texture2D(map,vMapUv,2.6).rgb;
        vec3 luma=vec3(.30,.51,.19);
        float fine=dot(sampledDiffuseColor.rgb-broadPigment,luma)/(.055+dot(broadPigment,luma));
        aqMarkings*=1.+.37*clamp(fine,-.85,.6)*(1.-aqFar);
      #endif
      // Plate overlaps follow the actual abdominal joints, in millimetres of the bind pose.
      float mm=-aqBody.x*1000.;
      // Each plate sweeps towards the tail below the midline.
      float overlap=(1.-smoothstep(.0025,.0068,aqBody.z))*.88;
      float joint=mm-overlap,aa=max(.035,fwidth(joint));
      float groove=min(min(abs(joint-8.85),abs(joint-11.56)),min(abs(joint-14.30),min(abs(joint-16.85),abs(joint-19.05))));
      float seam=(1.-smoothstep(.025,.28+aa,groove))*(1.-smoothstep(.18,.60,aa));
      aqMarkings*=1.-seam*vec3(.14,.20,.23);
      if(mm>21.){
        float angle=atan(abs(aqBody.y)*1000.,max(.20,mm-20.8));
        float rays=angle*36., detail=1.-smoothstep(.6,2.5,fwidth(rays));
        float membrane=smoothstep(21.,22.3,mm);
        aqMarkings*=mix(vec3(1.),vec3(.84,.79,.70)*(.90+.10*cos(rays)*detail),membrane);
      }
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, aqMarkings, mix(0.28, 1.0, aqShell));
  }
}`;

const LIGHT = `#include <lights_physical_pars_fragment>
void AQShrimpDirect(const in IncidentLight light, const in vec3 p, const in vec3 n, const in vec3 v, const in vec3 nc, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(light, p, n, v, nc, material, reflectedLight);
  float d = dot(n, light.direction);
  float wrap = max(0.0, (d + 0.5) / 1.5) - max(0.0, d);
  float back = pow(clamp(dot(v, -light.direction), 0.0, 1.0), 3.0) * 0.6 + max(0.0, -d) * 0.25;
  reflectedLight.directDiffuse += material.diffuseColor * mix(vec3(1.0, 0.55, 0.45), vec3(0.88, 0.92, 1.0), aqCrystal) * light.color * (wrap * 0.35 + back * 0.5) * aqSkinGain;
  vec3 h = normalize(light.direction + v);
  reflectedLight.directSpecular += light.color * pow(max(dot(n, h), 0.0), 110.0) * (0.14 + 0.20 * aqShell) * aqSkinGain;
}
#undef RE_Direct
#define RE_Direct AQShrimpDirect`;

function patchMaterial(material, uniforms) {
  if (patched.has(material) || /eye/i.test(material.name)) return;
  patched.add(material);
  const shell = /shell/i.test(material.name) ? 1 : 0;
  if (shell) material.roughness = .38;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, {aqShell:{value:shell}});
    shader.vertexShader = 'varying vec3 aqBody;\nvarying float aqDorsal;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\naqBody = position; aqDorsal = normal.z;');
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace('#include <map_fragment>', PIGMENT)
      .replace('#include <lights_physical_pars_fragment>', LIGHT)
      .replace('#include <opaque_fragment>', illustratedPlanesGLSL + `
        if (aqShell > .5) {
          float facing = abs(dot(nonPerturbedNormal, geometryViewDir));
          float aa = clamp(fwidth(facing), .025, .18);
          // In the authored rest pose +Z faces the back. The wash follows the shell when it turns.
          float underside = 1. - smoothstep(-.65, .35, aqDorsal);
          float fan = smoothstep(.0205, .022, -aqBody.x);
          float wash = aqPaleShell * max(underside, fan * (1. - .76 * abs(aqDorsal)));
          float luminance = dot(outgoingLight, vec3(.2126, .7152, .0722));
          outgoingLight /= 1. + aqPaleShell*.23*max(0.,luminance-.65);
          outgoingLight *= mix(vec3(1.), vec3(.91,.82,.73), wash) / (1. + wash * (.35 + .72*luminance));
          float width = .26 + .17 * wash;
          float rim = 1. - smoothstep(width-aa, width+aa, facing);
          vec3 ink = outgoingLight * mix(vec3(.36,.40,.43), vec3(.48,.41,.35), wash);
          // Roll off bright shell reflections at grazing angles so the pale bands keep an edge.
          float inkLight = dot(ink, vec3(.2126, .7152, .0722));
          ink /= 1. + 1.8 * max(inkLight - .20, 0.);
          outgoingLight = mix(outgoingLight, ink, rim);
          ${material.name==='Shell tail membrane'?`
          float rayAngle=atan(abs(aqBody.y),max(.0003,-aqBody.x-.0208));
          float ribs=.5+.5*cos(rayAngle*36.);
          float thin=smoothstep(.0208,.0231,-aqBody.x);
          diffuseColor.a*=1.-thin*(.47-.18*ribs-.15*rim);
          outgoingLight*=mix(vec3(1.),vec3(.83,.77,.70),thin*(.42+.58*rim));
          `:''}
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => material.name==='Shell tail membrane'?'shrimp-look-v8-fan':'shrimp-look-v8-shell';
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

export function broodEggProgress(brood, id, now) {
  if (brood?.status !== 'formed' || brood.motherId !== id || now < brood.formedAt) return null;
  return T.MathUtils.clamp((now - brood.formedAt) / (brood.hatchAt - brood.formedAt), 0, 1);
}

export function legacyEggProgress(secondsLeft) {
  return T.MathUtils.clamp(1 - secondsLeft / (BERRY_DAYS * DAY), 0, 1);
}

export function crystalLookLookup(readState) {
  let previous;
  const residents = new Map();
  return id => {
    const state = readState();
    // Transactions and restores publish a new breeding state, even at the same timestamp.
    if (state !== previous) {
      residents.clear();
      for (const individual of state?.individuals ?? []) {
        if (!individual.legacy && inTank(individual)) residents.set(individual.id, {individual});
      }
      for (const batch of state?.batches ?? []) {
        if (batch.status !== 'formed') continue;
        const mother = residents.get(batch.motherId);
        if (mother) mother.batch = batch;
      }
      previous = state;
    }
    const resident = residents.get(id);
    return resident ? {...resident, now:Math.max(Date.now(),state.now), growth:crystalGrowthFraction(resident.individual,state.now,state)} : null;
  };
}

// crystal(id) optionally returns {individual, now, growth, batch}; timestamps are real ms.
// individual owns sex/colour/pattern/P/adultAt; batch is this mother's current brood.
export function installShrimpLook({record, simSeconds, crystal = () => null}) {
  const skin = {value:1};
  const eggGeometry = eggCluster();
  let detail = 'full';
  const qb = new T.Quaternion(), camPos = new T.Vector3(), here = new T.Vector3();

  function prepare(animal) {
    if (animal.look) return animal.look;
    const seed = animal.seed ??= stableSeed(String(animal.id));
    const markingSeed = stableSeed(animal.id + ':markings');
    const signedPart = shift => ((markingSeed >>> shift) & 1023) / 511.5 - 1;
    const uniforms = {aqSkinGain:skin, aqPigment:{value:1}, aqSeed:{value:(seed % 997) * 0.37}, aqTint:{value:new T.Vector3()},
      aqMarkingShape:{value:new T.Vector3(signedPart(0), signedPart(10), signedPart(20))},
      aqCrystal:{value:0}, aqCrystalPattern:{value:0}, aqCrystalCoverage:{value:0.5}, aqCrystalEdge:{value:0.5},
      aqCrystalWhite:{value:0.75}, aqCrystalColour:{value:new T.Vector3(0.55, 0.018, 0.025)}};
    const bones = {}, shells=[];
    animal.rig.traverse(o => {
      if (o.isMesh) [].concat(o.material).forEach(m => patchMaterial(m, uniforms));
      if(o.isSkinnedMesh)shells.push(o);
      if (o.isBone && MOTION.test(o.name)) bones[o.name] = o;
      if (o.isBone && o.name === 'Abdomen_02') bones.eggHost = o;
    });
    animal.look = {uniforms, bones, shells, deltas:[], applied:0, escapeAt:-1, wasEscape:false, phase:(seed % 628) / 100, eggs:null};
    return animal.look;
  }

  function showEggs(animal, look, progress) {
    if (!look.eggs) {
      const material = new T.MeshStandardMaterial({name:'Shrimp eggs', color:'#d9a531', roughness:0.32, emissive:'#3a2208', emissiveIntensity:0.25});
      look.eggs = new T.Mesh(eggGeometry.clone(), material);
      look.eggs.name = 'Shrimp eggs';
      look.eggs.castShadow = false;
      look.eggs.userData.creatureId = animal.id;
      look.eggs.userData.eggs = true;
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
    frameMembranes(animals,camera){
      camera.getWorldPosition(camPos);
      for(const a of animals){
        const close=a.rig.getWorldPosition(here).distanceToSquared(camPos)<.44**2;
        for(const mesh of a.look?.shells??[])mesh.geometry=shrimpViewGeometry(mesh.geometry,close);
      }
    },
    dispose() { eggGeometry.dispose(); },
    get detail() { return detail; },
    setQuality(preset) { detail = preset?.shrimpDetail || 'full'; skin.value = detail === 'basic' ? 0 : 1; },
    /** Size, pigment by age, eggs. Runs every frame, also while paused. */
    sync(animals, readRecord = record, sim = simSeconds()) {
      for (const animal of animals) {
        const look = prepare(animal), r = readRecord(animal.id), context = crystal(animal.id), individual = context?.individual;
        const sex=individual?.sex ?? r?.sex, seed=animal.seed;
        const female=sex ? sex==='female' : seed%2===0;
        if(look.female!==female){
          const h1=((seed>>>3)%1000)/1000, h2=((seed>>>13)%1000)/1000;
          look.female=female;
          look.size=animal.sizeFactor=shrimpSizeFactor(animal.id,sex,seed);
          look.basePigment=female ? .85+h1*.15 : .45+h2*.2;
          const tint=look.uniforms.aqTint.value;
          if(female)tint.set(1.1+h1*.06,.8+h2*.06,.78+h2*.05);
          else tint.set(1+h1*.05,.92+h2*.06,.9+h2*.05);
        }
        const age = r?.ageDays;
        look.uniforms.aqPigment.value = look.basePigment * (age == null || age >= MATURITY_DAYS ? 1 : 0.45 + 0.55 * Math.max(0, age) / MATURITY_DAYS);
        const visibleCrystal = individual && ['red', 'black'].includes(individual.colour) && ['band', 'hinomaru', 'mosura'].includes(individual.pattern);
        look.uniforms.aqCrystal.value = visibleCrystal ? 1 : 0;
        if (visibleCrystal) {
          const growth = context.growth ?? (context.now >= individual.adultAt ? 1 : 0);
          const broad = T.MathUtils.smoothstep(growth, 0, 1), fine = T.MathUtils.smoothstep(growth, .5, 1);
          // Broad differences appear first. Finer differences within the same range develop near maturity.
          const normal = i => {
            const adult = individual.P?.[i] ?? 5;
            if (growth === 1) return T.MathUtils.clamp((adult - 1) / 8, 0, 1);
            const change = adult - hatchQuality[i];
            const broadChange = Math.trunc(change / 2) * 2;
            const visible = hatchQuality[i] + broadChange * broad + (change - broadChange) * fine;
            return T.MathUtils.clamp((visible - 1) / 8, 0, 1);
          };
          look.uniforms.aqCrystalPattern.value = {band:0, hinomaru:1, mosura:2}[individual.pattern];
          look.uniforms.aqCrystalCoverage.value = normal(1); look.uniforms.aqCrystalEdge.value = normal(2);
          const colour = normal(0);
          // The visible colour trait sets pigment strength on both sides of a marking.
          look.uniforms.aqCrystalWhite.value = T.MathUtils.lerp(0.58, 0.92, colour);
          if (individual.colour === 'black') look.uniforms.aqCrystalColour.value.setScalar(T.MathUtils.lerp(0.085, 0.012, colour));
          else look.uniforms.aqCrystalColour.value.set(T.MathUtils.lerp(0.32, 0.62, colour), T.MathUtils.lerp(0.055, 0.009, colour), T.MathUtils.lerp(0.055, 0.018, colour));
        }
        // Keep the clutch visible until the hatch transaction actually places the young.
        const eggs = context?.eggProgress ?? (individual ? broodEggProgress(context.batch, individual.id, context.now)
          : r?.hatchAt != null ? legacyEggProgress(r.hatchAt - sim) : null);
        if (look.female && eggs != null) showEggs(animal, look, eggs);
        else if (look.eggs) look.eggs.visible = false;
      }
    },
    before(animals) {
      for (const animal of animals) {
        const look = animal.look;
        if (!look) continue;
        for (let i = look.applied - 1; i >= 0; i--) { const [bone, q] = look.deltas[i]; bone.quaternion.multiply(q.invert()); }
        look.applied = 0;
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
          const slot=look.applied++;
          const delta=look.deltas[slot] ??= [bone,new T.Quaternion()];
          delta[0]=bone;
          qb.setFromAxisAngle(ax.z, deg(zDeg));
          bone.quaternion.multiply(delta[1].setFromAxisAngle(ax.y,deg(yDeg)).multiply(qb));
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
