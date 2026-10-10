import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {stableSeed} from './state.js';
import {SPECIES, FLORA_VARIANTS, floraSignature, planFlora, visibleNodes, visibleUpright} from './flora.js';

const UP = new T.Vector3(0, 1, 0);

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(geo, fn) {
  const p = geo.attributes.position, colors = new Float32Array(p.count * 3), c = new T.Color();
  for (let i = 0; i < p.count; i++) { fn(c, p.getX(i), p.getY(i), p.getZ(i), i); colors.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new T.BufferAttribute(colors, 3));
  return geo;
}

/** A leaf blade along +X from the origin, width along Z, cupped and curled. */
function blade({length, width, round = 1, cup = 0.2, curl = 0, rows = 6, cols = 2, midrib = 0.12, droop = 0, wave = 0, heart = 0}) {
  const positions = [], colors = [], index = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    let profile = Math.pow(Math.sin(Math.PI * Math.min(0.999, Math.pow(t, round) * 0.96 + 0.02)), 0.8);
    if (heart > 0 && t < 0.22) profile = Math.max(profile, heart * 0.5 * Math.pow(1 - t / 0.22, 1.25));
    const half = width * 0.5 * profile;
    for (let j = -cols; j <= cols; j++) {
      const u = j / cols;
      let x = t * length, z = u * half;
      let y = -cup * u * u * half + curl * t * t * length - droop * t * t * t * length;
      y += wave * Math.sin(t * Math.PI * 2.5 + u * 1.6) * Math.abs(u) * length;
      if (heart > 0 && t < 0.16 && Math.abs(u) < 0.3) x -= heart * (0.16 - t) * length * 0.32;
      positions.push(x, y, z);
      const shade = 0.78 + 0.22 * (1 - Math.abs(u)) + (Math.abs(u) < 0.08 ? midrib : 0) - 0.06 * (1 - t);
      colors.push(shade, shade, shade);
    }
  }
  const w = cols * 2 + 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j < w - 1; j++) {
    const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

function placed(geo, {x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, scale = 1}) {
  const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(roll, yaw, pitch, 'YZX')), new T.Vector3(scale, scale, scale));
  return geo.clone().applyMatrix4(m);
}

function stalk(radius, height, shade = 1, sides = 5) {
  const geo = new T.CylinderGeometry(radius * 0.8, radius, height, sides, 1, true).translate(0, height / 2, 0);
  geo.deleteAttribute('uv');
  return paint(geo, c => c.setScalar(shade));
}

/** Horizontal round leaflet for HC Cuba-style carpet plants. Circle sits in XZ, facing +Y. */
function coin(radius, cup = 0.18, segs = 10) {
  const geo = new T.CircleGeometry(radius, segs);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y) / Math.max(1e-6, radius);
    p.setZ(i, -cup * radius * r * r);
  }
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return paint(geo, (c, x, _y, z) => c.setScalar(0.82 + 0.18 * (1 - Math.hypot(x, z) / radius)));
}

function strip(geo) {
  for (const key of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(key)) geo.deleteAttribute(key);
  return geo.index ? geo : geo;
}

function merge(list) {
  return mergeGeometries(list.map(g => strip(g.index ? g : g)), false);
}

const UNITS = {
  rotalaLeaves(v, rand) {
    const pair = (scale, yaw, pitch, along) => {
      const length = (0.016 + v * 0.0015) * scale;
      const leaf = blade({
        length, width:length * (0.20 + rand() * 0.08), round:0.88 + rand() * 0.16, cup:0.05 + rand() * 0.05,
        curl:(rand() - 0.28) * 0.18, droop:0.05 + rand() * 0.09, wave:0.04, rows:7, cols:2, midrib:0.22,
      });
      return placed(leaf, {x:along, pitch, yaw, roll:(rand() - 0.5) * 0.4});
    };
    const jitter = (rand() - 0.5) * 0.28;
    return merge([
      pair(0.94 + rand() * 0.18, jitter, 0.16 + rand() * 0.22, 0),
      pair(0.76 + rand() * 0.16, Math.PI + jitter + (rand() - 0.5) * 0.24, 0.12 + rand() * 0.2, 0.00025 + rand() * 0.0007),
    ]);
  },
  rotalaStem() { return stalk(0.00022, 1, 0.9, 5); },
  carpet(v, rand) {
    const parts = [];
    for (let i = 0, shoots = 12 + (v % 3); i < shoots; i++) {
      const h = 0.001 + rand() * 0.002, ox = (rand() - 0.5) * 0.0055, oz = (rand() - 0.5) * 0.0055;
      parts.push(placed(stalk(0.00008, h, 0.86, 4), {x:ox, z:oz}));
      for (let k = 0, n = 4 + (rand() > 0.45 ? 1 : 0); k < n; k++) {
        const r = 0.00085 + rand() * 0.00055;
        const leaf = coin(r, 0.2 + rand() * 0.14, 10);
        parts.push(placed(leaf, {
          x:ox + (rand() - 0.5) * 0.0016, y:h * (0.4 + rand() * 0.75), z:oz + (rand() - 0.5) * 0.0016,
          yaw:i * 2.2 + k * 1.7 + rand(), pitch:(rand() - 0.5) * 0.55, roll:(rand() - 0.5) * 0.45,
        }));
      }
    }
    return merge(parts);
  },
  moss(v, rand) {
    const parts = [];
    for (let i = 0, n = 26 + v * 4; i < n; i++) {
      const len = 0.0022 + rand() * 0.0028, width = 0.001 + rand() * 0.0009;
      parts.push(placed(blade({length:len, width, round:1.55, cup:0.1, curl:-0.16, droop:0.4 + rand() * 0.35, rows:3, cols:1, midrib:0}), {
        x:(rand() - 0.5) * 0.015, y:rand() * 0.0014, z:(rand() - 0.5) * 0.015,
        yaw:rand() * 6.28, pitch:0.35 + rand() * 1.05, roll:(rand() - 0.5) * 0.5,
      }));
    }
    for (let i = 0, stems = 10 + v * 2; i < stems; i++) {
      const yaw = rand() * 6.28, pitch = 0.25 + rand() * 1.05, len = 0.007 + rand() * 0.008, width = 0.00055 + rand() * 0.0004;
      const ox = (rand() - 0.5) * 0.011, oz = (rand() - 0.5) * 0.011;
      parts.push(placed(blade({length:len, width, round:1.5, cup:0, curl:-0.24, droop:0.7 + rand() * 0.28, rows:5, cols:1, midrib:0}), {x:ox, y:rand() * 0.001, z:oz, yaw, pitch}));
      for (let k = 0, n = 6 + Math.floor(rand() * 4); k < n; k++) {
        const t = 0.14 + k * 0.11 + rand() * 0.04, ll = 0.002 + rand() * 0.0026;
        parts.push(placed(blade({length:ll, width:ll * 0.48, round:1.35, cup:0.04, curl:-0.14, droop:0.3, rows:3, cols:1, midrib:0}), {
          x:ox + Math.cos(yaw) * len * t * Math.cos(pitch), y:Math.sin(pitch) * len * t * 0.42, z:oz - Math.sin(yaw) * len * t * Math.cos(pitch),
          yaw:yaw + (k % 2 ? 1.15 : -1.15) + (rand() - 0.5) * 1.05, pitch:pitch * 0.18 + (rand() - 0.5) * 1.15,
        }));
      }
    }
    return merge(parts);
  },

};

const COLORS = {
  rotalaBase:new T.Color('#2f5c28'), rotalaMid:new T.Color('#7a6b28'), rotalaTip:new T.Color('#c45a3c'), rotalaStem:new T.Color('#3a4a28'),
  carpet:new T.Color('#3f8c38'), moss:new T.Color('#3a5c2c'), mossTip:new T.Color('#6a8a3c'),
};

function swayMaterial(name, {color = '#ffffff', roughness = 0.62, amplitude, height, time, thin = 0.18, clearcoat = 0}) {
  const material = clearcoat > 0
    ? new T.MeshPhysicalMaterial({name, color, roughness, metalness:0, vertexColors:true, side:T.DoubleSide, clearcoat, clearcoatRoughness:0.32})
    : new T.MeshStandardMaterial({name, color, roughness, metalness:0, vertexColors:true, side:T.DoubleSide});
  material.userData.sway = {amplitude, height};
  material.onBeforeCompile = shader => {
    shader.uniforms.aqFloraTime = time;
    shader.uniforms.aqFloraSway = {value:new T.Vector2(amplitude, height)};
    shader.uniforms.aqFloraThin = {value:thin};
    shader.vertexShader = 'attribute vec4 aqStem;\nuniform float aqFloraTime;\nuniform vec2 aqFloraSway;\n' + shader.vertexShader.replace('#include <project_vertex>', `
      #ifdef USE_INSTANCING
      {
        vec3 aqIp = (instanceMatrix * vec4(transformed, 1.0)).xyz;
        float aqH = clamp(max(0.0, aqIp.y - aqStem.y) / aqFloraSway.y, 0.0, 1.6);
        float aqPh = aqStem.w;
        vec2 aqFlow = vec2(sin(aqFloraTime * 0.62 + aqStem.x * 9.0 + aqPh) + 0.45 * sin(aqFloraTime * 1.37 + aqStem.z * 13.0 + aqPh * 1.7),
                           0.6 * sin(aqFloraTime * 0.47 + aqStem.z * 7.0 + aqPh * 0.6) + 0.3 * sin(aqFloraTime * 1.11 + aqStem.x * 5.0));
        vec3 aqD = vec3(aqFlow.x, 0.0, aqFlow.y) * aqFloraSway.x * aqH * aqH;
        transformed += inverse(mat3(instanceMatrix)) * aqD;
      }
      #endif
      #include <project_vertex>`);
    shader.fragmentShader = 'uniform float aqFloraThin;\n' + shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
      void AQFloraDirect(const in IncidentLight light, const in vec3 p, const in vec3 n, const in vec3 v, const in vec3 nc, const in PhysicalMaterial material, inout ReflectedLight reflectedLight){
        RE_Direct_Physical(light,p,n,v,nc,material,reflectedLight);
        float d=dot(n,light.direction);
        float wrap=max(0.,(d+.45)/1.45)-max(0.,d);
        float back=max(0.,-d);
        reflectedLight.directDiffuse+=material.diffuseColor*light.color*(wrap*.28+back*aqFloraThin);
      }
      #undef RE_Direct
      #define RE_Direct AQFloraDirect`);
  };
  material.customProgramCacheKey = () => `flora-sway-v3-${clearcoat > 0 ? 'coat' : 'std'}`;
  return material;
}

function tipOf(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const p = geo.attributes.position, target = new T.Vector3(b.max.x * 0.9, b.max.y, (b.min.z + b.max.z) * 0.5);
  let best = 0, distance = Infinity;
  for (let i = 0; i < p.count; i++) { const d = new T.Vector3().fromBufferAttribute(p, i).distanceToSquared(target); if (d < distance) { best = i; distance = d; } }
  return new T.Vector3().fromBufferAttribute(p, best).toArray();
}

export function swayFloraPoint(point, stem, {amplitude, height}, time) {
  const h = T.MathUtils.clamp(Math.max(0, point.y - stem[1]) / height, 0, 1.6), gain = amplitude * h * h, phase = stem[3];
  point.x += (Math.sin(time * .62 + stem[0] * 9 + phase) + .45 * Math.sin(time * 1.37 + stem[2] * 13 + phase * 1.7)) * gain;
  point.z += (.6 * Math.sin(time * .47 + stem[2] * 7 + phase * .6) + .3 * Math.sin(time * 1.11 + stem[0] * 5)) * gain;
  return point;
}

export function floraUnitMetrics() {
  const out = {};
  for (const [key, fn] of Object.entries(UNITS)) {
    const geo = fn(1, random(7));
    geo.computeBoundingBox();
    const b = geo.boundingBox, s = b.max.clone().sub(b.min);
    out[key] = {x:s.x, y:s.y, z:s.z, verts:geo.attributes.position.count};
  }
  return out;
}

export class FloraView {
  constructor(aq, fallbackHabitat = () => null) {
    this.aq = aq;
    this.fallbackHabitat = fallbackHabitat;
    this.root = new T.Group();
    this.root.name = 'Tank flora';
    aq.root.add(this.root);
    this.time = {value:0};
    this.density = 1;
    this.shadows = true;
    this.signature = '';
    const t = this.time;
    this.materials = {
      rotalaLeaves:swayMaterial('Flora rotala leaf', {amplitude:0.0045, height:0.22, time:t, roughness:0.48, thin:0.48}),
      rotalaStem:swayMaterial('Flora rotala stem', {amplitude:0.0045, height:0.22, time:t, roughness:0.74, thin:0.04}),
      carpet:swayMaterial('Flora carpet', {amplitude:0.0005, height:0.008, time:t, roughness:0.55, thin:0.28}),
      moss:swayMaterial('Flora moss', {amplitude:0.0009, height:0.012, time:t, roughness:0.88, thin:0.38}),

    };
    aq.materials.push(...Object.values(this.materials));
    this.units = {};
    this.tips = {};
    for (const key of Object.keys(UNITS)) {
      const variants = key === 'rotalaStem' ? 1 : FLORA_VARIANTS;
      this.units[key] = Array.from({length:variants}, (_, v) => UNITS[key](v, random(stableSeed(key + v))));
      this.tips[key] = this.units[key].map(tipOf);
    }
    this.meshes = new Map();
  }

  setQuality(preset) {
    const density = preset?.floraDensity ?? 1, shadows = preset?.floraShadows ?? true;
    if (density === this.density && shadows === this.shadows) return;
    this.density = density;
    this.shadows = shadows;
    this.signature = '';
    if (this.last) this.sync(this.last.save, this.last.runtime, true);
  }

  installAnubias({models, materials, maps = new Map()}) {
    this.models = models;
    this.leafKeys = new Set();
    const shared = materials.map((m, i) => {
      const material = swayMaterial('Authored anubias ' + i, {amplitude:0.0008, height:0.085, time:this.time, roughness:m.roughness, thin:0.12, clearcoat:m.clearcoat});
      material.vertexColors = false;
      material.color.fromArray(m.color);
      material.map = maps.get(m.map) || null;
      material.alphaTest = m.alphaTest;
      this.aq.materials.push(material);
      return material;
    });
    for (const [species, variants] of Object.entries(models)) for (const [v, model] of variants.entries()) for (const [i, part] of model.parts.entries()) {
      part.key = species + v + 'part' + i;
      this.units[part.key] = [part.geometry];
      this.tips[part.key] = [tipOf(part.geometry)];
      this.materials[part.key] = shared[part.material];
      if (part.leaf) this.leafKeys.add(part.key);
    }
  }

  scene(runtime) {
    if (runtime.current) return runtime.current;
    const habitat = this.fallbackHabitat();
    return habitat ? {soil:runtime.sourceSoil, habitat, entities:runtime.originals} : null;
  }

  host(scene, id) {
    const node = scene.entities.get(id);
    if (!node) return null;
    node.updateMatrixWorld(true);
    return scene.unity ? node.matrixWorld.clone() : new T.Matrix4().copy(this.aq.root.matrixWorld).invert().multiply(node.matrixWorld);
  }

  plan(save, scene) {
    const habitat = scene.habitat;
    const probe = (x, z) => {
      const hit = habitat.cast(new T.Vector3(x, 0.62, z), new T.Vector3(0, -1, 0), 0.7);
      if (!hit) return null;
      const n = hit.normal.clone();
      if (n.y < 0) n.negate();
      return {y:hit.point.y, kind:hit.surface.kind, owner:hit.surface.owner, normal:n.toArray()};
    };
    const plants = save.Tank.Plants.map(p => ({x:p.Position.x, z:p.Position.z}));
    const out = [];
    for (const r of planFlora(save.Tank.UniqueId, probe, plants)) {
      if (!r.World) { out.push(r); continue; }
      const id = [...scene.entities].find(([, node]) => node.name === r.Host)?.[0] ?? r.Host.replace(/^[WR]0 /, ''), matrix = this.host(scene, id);
      if (!matrix) continue;
      const inverse = matrix.clone().invert(), local = new T.Vector3(...r.World).applyMatrix4(inverse), normal = new T.Vector3(...r.WorldNormal).applyNormalMatrix(new T.Matrix3().setFromMatrix4(matrix).transpose());
      const {World, WorldNormal, ...rest} = r;
      out.push({...rest, Host:id, Local:local.toArray(), Normal:normal.toArray()});
    }
    return out;
  }

  sync(save, runtime, force = false) {
    const scene = runtime && this.scene(runtime);
    if (!scene) return;
    const kind = runtime.current ? 'runtime' : 'source';
    if (this.last?.kind !== kind) force = true;
    this.last = {save, runtime, kind};
    if (save.Tank.Flora == null) { save.Tank.Flora = []; force = true; }
    const signature = floraSignature(save.Tank.Flora);
    if (!force && signature === this.signature) return;
    this.signature = signature;
    this.build(save.Tank.Flora, scene);
  }

  instances(list, scene) {
    const buckets = new Map();
    const add = (key, variant, matrix, color, stem, owner) => {
      const name = key + ':' + variant;
      if (!buckets.has(name)) buckets.set(name, {key, variant, matrices:[], colors:[], stems:[], owners:[]});
      const b = buckets.get(name);
      b.matrices.push(matrix); b.colors.push(color); b.stems.push(stem); b.owners.push(owner);
    };
    const soil = scene.soil, habitat = scene.habitat;
    const tmp = {q:new T.Quaternion(), q2:new T.Quaternion(), v:new T.Vector3(), s:new T.Vector3()};
    const hostSurfaces = new Map();
    for (const record of list) {
      const spec = SPECIES[record.Species], rand = random(stableSeed(record.UniqueId)), n = visibleNodes(record), phase = rand() * 6.28;
      const hueShift = record.Hue * 0.035;
      if (spec.kind === 'stem') {
        const baseY = soil.sample(record.X, record.Z) - 0.004, base = new T.Vector3(record.X, baseY, record.Z), stem = [base.x, base.y, base.z, phase];
        const light = new T.Vector3((rand() - 0.5) * 0.22, 0.28, -0.62).normalize();
        const lean = light.clone().multiplyScalar(0.32 + rand() * 0.24).add(new T.Vector3(Math.cos(record.Yaw), 0, Math.sin(record.Yaw)).multiplyScalar(0.1));
        let p = base.clone();
        const wander = new T.Vector3();
        for (let k = 0; k < n; k++) {
          const t = n > 1 ? k / (n - 1) : 1, fromTip = n - 1 - k;
          wander.add(new T.Vector3((rand() - 0.5) * 0.045, 0, (rand() - 0.5) * 0.04));
          const dir = UP.clone().addScaledVector(lean, 0.2 + 1.15 * t * t).add(wander).add(new T.Vector3((rand() - 0.5) * 0.08, 0, (rand() - 0.5) * 0.06)).normalize();
          const L = (0.009 + rand() * 0.006) * record.Scale * (fromTip < 2 ? 0.48 + fromTip * 0.16 : 1);
          tmp.q.setFromUnitVectors(UP, dir);
          add('rotalaStem', 0, new T.Matrix4().compose(p.clone(), tmp.q.clone(), new T.Vector3(1, L, 1)), COLORS.rotalaStem.clone().offsetHSL(hueShift, -0.04, (t - 0.35) * 0.05), stem, {id:record.UniqueId, node:k});
          p = p.clone().addScaledVector(dir, L);
          if (k < n * 0.12 && rand() < 0.35) continue;
          const size = record.Scale * (0.28 + 0.85 * Math.min(1, fromTip / 5)) * (0.88 + rand() * 0.2);
          const leafColor = (t < 0.48 ? COLORS.rotalaBase.clone() : t < 0.74 ? COLORS.rotalaBase.clone().lerp(COLORS.rotalaMid, (t - 0.48) / 0.26) : COLORS.rotalaMid.clone().lerp(COLORS.rotalaTip, (t - 0.74) / 0.26)).offsetHSL(hueShift + (rand() - 0.5) * 0.025, (rand() - 0.45) * 0.08, (rand() - 0.5) * 0.04);
          if (k < 3) leafColor.offsetHSL(0.02, -0.04, -0.03);
          tmp.q2.setFromAxisAngle(UP, record.Yaw + k * (Math.PI / 2 + (rand() - 0.5) * 0.22) + (rand() - 0.5) * 0.45);
          add('rotalaLeaves', (record.Variant + k) % FLORA_VARIANTS, new T.Matrix4().compose(p.clone(), tmp.q.clone().multiply(tmp.q2), new T.Vector3(size, size, size)), leafColor, stem, {id:record.UniqueId, node:k});
        }
      } else if (spec.kind === 'carpet') {
        const clumps = 6 + (n > 80 ? 3 : 1);
        for (let i = 0; i < n; i++) {
          if (random(stableSeed(record.UniqueId + i))() > this.density) continue;
          const clump = i % clumps, cr = random(stableSeed(record.UniqueId + ':c' + clump));
          const mound = 0.014 + cr() * 0.016, edge = i * 2.39996 + cr() * 0.55;
          const radius = mound * Math.pow(rand(), 0.55) * (0.7 + 0.4 * Math.sin(edge * 1.4 + record.Hue));
          const x = record.X + Math.cos(edge) * radius + (rand() - 0.5) * 0.003 + Math.cos(clump * 2.15 + record.Yaw) * (0.01 + cr() * 0.008);
          const z = record.Z + Math.sin(edge) * radius * 0.82 + (rand() - 0.5) * 0.003 + Math.sin(clump * 1.6) * (0.008 + cr() * 0.007);
          if (Math.abs(x) > 0.57 || Math.abs(z) > 0.275) continue;
          const y = soil.sample(x, z) - 0.0004, size = (0.85 + rand() * 0.45) * record.Scale;
          tmp.q.setFromEuler(new T.Euler((rand() - 0.5) * 0.22, rand() * 6.28, (rand() - 0.5) * 0.18, 'YXZ'));
          add('carpet', (record.Variant + clump + i) % FLORA_VARIANTS, new T.Matrix4().compose(new T.Vector3(x, y, z), tmp.q.clone(), new T.Vector3(size, size * (0.55 + rand() * 0.35), size)), COLORS.carpet.clone().offsetHSL(hueShift + (rand() - 0.5) * 0.03, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.1), [x, y, z, phase + i * 0.3], {id:record.UniqueId, node:i});
        }
      } else {
        const matrix = this.host(scene, record.Host);
        if (!matrix) continue;
        const anchor = new T.Vector3(...record.Local).applyMatrix4(matrix), normal = new T.Vector3(...record.Normal).applyNormalMatrix(new T.Matrix3().getNormalMatrix(matrix));
        const owner = scene.entities.get(record.Host)?.name;
        if (!hostSurfaces.has(owner)) hostSurfaces.set(owner, habitat.surfaces.filter(s => s.owner === owner));
        const surfaces = hostSurfaces.get(owner);
        const snap = point => {
          let best = null;
          for (const s of surfaces) {
            const h = s.bvh.closestPointToPoint(point, {}, 0, 0.022);
            if (h && (!best || h.distance < best.distance)) best = h;
          }
          return best ? best.point.clone() : point;
        };
        const tangent = new T.Vector3().crossVectors(normal, Math.abs(normal.y) > 0.9 ? new T.Vector3(1, 0, 0) : UP).normalize();
        const bitangent = new T.Vector3().crossVectors(normal, tangent);
        if (spec.kind === 'moss') {
        const count = Math.max(n, 28);
        for (let i = 0; i < count; i++) {
            if (random(stableSeed(record.UniqueId + i))() > this.density) continue;
            const angle = i * 2.39996 + record.Yaw, radius = 0.015 * Math.sqrt(i + 0.15) * record.Scale;
            const hang = Math.max(0, 0.62 - normal.y) * (0.01 + rand() * 0.016);
            const guess = anchor.clone().addScaledVector(tangent, Math.cos(angle) * radius).addScaledVector(bitangent, Math.sin(angle) * radius * (0.65 + rand() * 0.55)).addScaledVector(UP, -hang);
            const at = snap(guess).addScaledVector(normal, -0.0005);
            const drape = Math.max(0, 0.82 - normal.y);
            tmp.q.setFromUnitVectors(UP, normal.clone().lerp(new T.Vector3(0, -0.85, 0), 0.45 + drape * 0.7).normalize()).multiply(tmp.q2.setFromAxisAngle(UP, rand() * 6.28));
            const size = (2.05 + rand() * 1.05) * record.Scale;
            const color = COLORS.moss.clone().lerp(COLORS.mossTip, rand() * 0.75).offsetHSL(hueShift + (rand() - 0.5) * 0.035, (rand() - 0.35) * 0.12, (rand() - 0.4) * 0.1);
            add('moss', (record.Variant + i) % FLORA_VARIANTS, new T.Matrix4().compose(at, tmp.q.clone(), new T.Vector3(size, size * (0.65 + rand() * 0.6), size)), color, [at.x, at.y, at.z, phase + i], {id:record.UniqueId, node:i});
          }
        } else {
          const models = this.models?.[record.Species];
          if (!models) throw new Error('水榕模型尚未加载');
          const model = models[record.Variant % models.length];
          // shortcut: growth beyond the authored leaf groups only changes uniform size; extend the source when new leaf shapes are approved.
          const growth = 1 + Math.max(0, n - spec.start) * 0.018;
          // The attachment follows its host; gravity, not the rock normal, sets the growth axis.
          const heading = new T.Vector3(Math.sin(record.Yaw),0,Math.cos(record.Yaw)).transformDirection(matrix);
          const yaw = Math.hypot(heading.x,heading.z) > .001 ? Math.atan2(heading.x,heading.z) : record.Yaw;
          tmp.q2.setFromUnitVectors(UP, normal);
          const lean = Math.min(1, T.MathUtils.degToRad(25) / Math.max(.0001, UP.angleTo(normal))) * (1 - visibleUpright(record));
          tmp.q.identity().slerp(tmp.q2, lean).multiply(tmp.q2.setFromAxisAngle(UP,yaw));
          const size = record.Scale * growth * (0.94 + rand() * 0.12);
          const pose = new T.Matrix4().compose(anchor, tmp.q.clone(), new T.Vector3(size,size,size));
          const leaves = Math.max(1, Math.ceil(model.leaves * Math.min(1,n/spec.start)));
          for (const part of model.parts) {
            if (part.node >= leaves) continue;
            const color = new T.Color().setScalar(.94 + rand()*.12).offsetHSL(hueShift,0,0);
            add(part.key, 0, pose.clone(), color, [anchor.x,anchor.y,anchor.z,phase], {id:record.UniqueId,node:part.node});
          }
        }
      }
    }
    return buckets;
  }

  build(list, scene) {
    const buckets = this.instances(list, scene), used = new Set();
    for (const [name, b] of buckets) {
      used.add(name);
      let entry = this.meshes.get(name);
      if (!entry || entry.capacity < b.matrices.length) {
        if (entry) { this.root.remove(entry.mesh); entry.mesh.geometry.dispose(); entry.mesh.dispose(); }
        const capacity = Math.ceil(b.matrices.length * 1.5) + 8;
        const geometry = this.units[b.key][b.variant].clone();
        const stems = new T.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
        geometry.setAttribute('aqStem', stems);
        const mesh = new T.InstancedMesh(geometry, this.materials[b.key === 'rotalaLeaves' ? 'rotalaLeaves' : b.key], capacity);
        mesh.name = 'Flora ' + name;
        mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.userData.flora = true;
        mesh.userData.tip = this.tips[b.key][b.variant];
        this.root.add(mesh);
        entry = {mesh, capacity, stems};
        this.meshes.set(name, entry);
      }
      const {mesh, stems} = entry;
      mesh.userData.tip = this.tips[b.key][b.variant];
      mesh.castShadow = this.shadows && (['rotalaLeaves', 'rotalaStem'].includes(b.key) || /^(pala|nullified)/.test(b.key));
      b.matrices.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, b.colors[i]); stems.setXYZW(i, ...b.stems[i]); });
      mesh.count = b.matrices.length;
      mesh.userData.owners = b.owners;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      stems.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.visible = true;
    }
    for (const [name, entry] of this.meshes) if (!used.has(name)) { entry.mesh.count = 0; entry.mesh.visible = false; entry.mesh.userData.owners = []; }
  }

  owner(hit) {
    if (!hit?.object?.userData.flora || hit.instanceId == null) return null;
    return hit.object.userData.owners?.[hit.instanceId] || null;
  }

  update(time) { this.time.value = time; }

  collisionItems(list, scene) {
    const plants = new Map();
    for (const b of this.instances(list, scene).values()) {
      const unit = this.units[b.key][b.variant];
      unit.computeBoundingBox();
      // shortcut: tiny moss/carpet leaflets share a shoot support disc; use triangles if shrimp become smaller than a shoot.
      const tiny = b.key === 'moss' || b.key === 'carpet';
      const base = tiny ? new T.CircleGeometry(b.key === 'moss' ? .003 : .0025, 8).rotateX(-Math.PI/2).translate(0, unit.boundingBox.max.y, 0) : unit;
      for (let i = 0; i < b.matrices.length; i++) {
        const id = b.owners[i].id;
        if (!plants.has(id)) plants.set(id, {parts:[], samples:[]});
        const plant = plants.get(id), geo = base.clone().applyMatrix4(b.matrices[i]);
        for (const attr of Object.keys(geo.attributes)) if (attr !== 'position') geo.deleteAttribute(attr);
        const p = geo.attributes.position, stems = new Float32Array(p.count * 4), sways = new Float32Array(p.count * 2), sway = this.materials[b.key].userData.sway;
        for (let j = 0; j < p.count; j++) { stems.set(b.stems[i], j*4); sways.set([sway.amplitude, sway.height], j*2); }
        geo.setAttribute('floraStem', new T.BufferAttribute(stems, 4));
        geo.setAttribute('floraSway', new T.BufferAttribute(sways, 2));
        if (tiny) plant.samples.push(new T.Vector3(0, unit.boundingBox.max.y, 0).applyMatrix4(b.matrices[i]));
        else if (b.key === 'rotalaStem') {
          const tip = this.tips[b.key][b.variant];
          for (const y of [.1,.5,1]) plant.samples.push(new T.Vector3(tip[0],y,tip[2]).applyMatrix4(b.matrices[i]));
        } else {
          plant.samples.push(new T.Vector3(...this.tips[b.key][b.variant]).applyMatrix4(b.matrices[i]));
          for (const j of [0, Math.floor(p.count*.25), Math.floor(p.count*.5)]) plant.samples.push(new T.Vector3().fromBufferAttribute(p,j));
        }
        plant.parts.push(geo);
      }
      if (tiny) base.dispose();
    }
    return [...plants].map(([id, plant]) => {
      const geometry = mergeGeometries(plant.parts, false); plant.parts.forEach(g => g.dispose());
      return {node:'flora/'+id, owner:'Plant '+id, kind:3, solid:false, flora:true, ownedSource:true, material:{motion:1, leaf:1}, geometry, transform:new T.Matrix4(), samples:plant.samples};
    });
  }

  pearlSites() {
    const sites = [], matrix = new T.Matrix4(), tip = new T.Vector3();
    for (const [key, {mesh}] of this.meshes) {
      if (!mesh.visible || !mesh.count) continue;
      const name = mesh.name || '';
      if (!/rotalaLeaves|carpet|moss/.test(name) && !this.leafKeys?.has(key.split(':')[0])) continue;
      const vigor = /rotala/.test(name) ? 1.4 : /pala|nullified/.test(name) ? 0.55 : 0.7;
      const keep = /rotala/.test(name) ? 0.3 : /pala|nullified/.test(name) ? 0.16 : 0.08;
      const local = mesh.userData.tip || [0.008, 0.001, 0];
      for (let i = 0; i < mesh.count; i++) {
        if (random(stableSeed(name + ':' + i))() > keep * this.density) continue;
        mesh.getMatrixAt(i, matrix);
        tip.set(local[0], local[1], local[2]).applyMatrix4(matrix);
        const owner = mesh.userData.owners[i];
        const resolve = () => {
          const current = this.meshes.get(key)?.mesh;
          if (!current?.visible) return null;
          const at = current.userData.owners.findIndex(o => o.id === owner.id && o.node === owner.node);
          if (at < 0) return null;
          const m = new T.Matrix4(); current.getMatrixAt(at, m);
          const point = new T.Vector3(...current.userData.tip).applyMatrix4(m), stem = current.geometry.attributes.aqStem;
          return swayFloraPoint(point, Array.from(stem.array.subarray(at*4,at*4+4)), current.material.userData.sway, this.time.value);
        };
        sites.push({x:tip.x, y:tip.y, z:tip.z, vigor, resolve});
      }
    }
    return sites;
  }

  stats() {
    let instances = 0, draws = 0;
    for (const {mesh} of this.meshes.values()) if (mesh.visible && mesh.count) { instances += mesh.count; draws++; }
    return {instances, draws};
  }
}

/** Collision-only fallback for callers without a rendered FloraView. */
let collisionView;
export function floraCollisionItems(list, {soil, hostMatrix, habitat = {surfaces:[]}}) {
  collisionView ??= new FloraView({root:new T.Group(), materials:[]});
  collisionView.host = (_scene, id) => hostMatrix?.(id) || null;
  const entities = new Map(list.filter(r => r.Host).map(r => [r.Host, {name:'W0 '+r.Host}]));
  return collisionView.collisionItems(list, {soil, habitat, entities});
}
