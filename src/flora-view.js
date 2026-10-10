import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {stableSeed} from './state.js';
import {SPECIES, FLORA_VARIANTS, floraSignature, planFlora, visibleNodes} from './flora.js';

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
function blade({length, width, round = 1, cup = 0.2, curl = 0, rows = 6, cols = 2, midrib = 0.12, droop = 0}) {
  const positions = [], colors = [], index = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, half = width * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(0.999, Math.pow(t, round) * 0.96 + 0.02)), 0.8);
    for (let j = -cols; j <= cols; j++) {
      const u = j / cols, x = t * length, z = u * half, y = -cup * u * u * half + curl * t * t * length - droop * t * t * t * length;
      positions.push(x, y, z);
      const shade = 0.82 + 0.18 * (1 - Math.abs(u)) + (Math.abs(u) < 0.01 ? midrib : 0) - 0.08 * (1 - t);
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

function strip(geo) {
  for (const key of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(key)) geo.deleteAttribute(key);
  return geo.index ? geo : geo;
}

function merge(list) {
  return mergeGeometries(list.map(g => strip(g.index ? g : g)), false);
}

const UNITS = {
  rotalaLeaves(v, rand) {
    const length = 0.011 + v * 0.0007, width = length * (0.26 + 0.04 * (v % 2));
    const leaf = blade({length, width, round:1.15, cup:0.18, curl:0.08 + v * 0.02, droop:0.08, rows:7, cols:2, midrib:0.16});
    const lift = 0.42 + 0.18 * rand();
    const yawJitter = (rand() - 0.5) * 0.22;
    return merge([placed(leaf, {pitch:lift, yaw:yawJitter}), placed(leaf, {pitch:lift + (rand() - 0.5) * 0.12, yaw:Math.PI + yawJitter * 0.4})]);
  },
  rotalaStem() { return stalk(0.00042, 1, 0.78, 5); },
  carpet(v, rand) {
    const parts = [stalk(0.00018, 0.0032 + v * 0.0005, 0.75, 4)];
    const count = 5 + (v % 3);
    for (let i = 0; i < count; i++) {
      const length = 0.0022 + rand() * 0.0014, width = length * (0.78 + rand() * 0.25);
      const leaf = blade({length, width, round:0.45, cup:0.22, curl:(rand() - 0.5) * 0.12, droop:0.04, rows:4, cols:2, midrib:0.08});
      parts.push(placed(leaf, {y:0.001 + rand() * 0.0028, yaw:i * 2.1 + rand() * 1.4, pitch:0.05 + rand() * 0.85, roll:(rand() - 0.5) * 0.4, scale:0.7 + rand() * 0.6}));
    }
    return merge(parts);
  },
  moss(v, rand) {
    const parts = [];
    const addStrand = (x, y, z, yaw, pitch, length, width) => {
      parts.push(placed(blade({length, width, round:1.4, cup:0, curl:-0.28, droop:0.55, rows:5, cols:1, midrib:0}), {x, y, z, yaw, pitch}));
      const n = 1 + (length > 0.005 ? 2 : 1);
      for (let k = 0; k < n; k++) {
        const t = 0.25 + k * 0.28 + rand() * 0.1;
        parts.push(placed(blade({length:length * (0.28 + rand() * 0.22), width:width * 0.7, round:1.3, curl:-0.2, droop:0.4, rows:3, cols:1, midrib:0}), {
          x:x + Math.cos(yaw) * length * t * Math.cos(pitch), y:y + Math.sin(pitch) * length * t, z:z - Math.sin(yaw) * length * t * Math.cos(pitch),
          yaw:yaw + (rand() - 0.5) * 1.8, pitch:pitch * 0.45 + (rand() - 0.5) * 0.8,
        }));
      }
    };
    for (let i = 0; i < 11 + v; i++) {
      addStrand((rand() - 0.5) * 0.004, rand() * 0.001, (rand() - 0.5) * 0.004, rand() * 6.28, 0.15 + rand() * 1.3, 0.0035 + rand() * 0.0065, 0.00038 + rand() * 0.00028);
    }
    return merge(parts);
  },
  anubiasLeaf(v, rand) {
    const petiole = 0.006 + v * 0.0011, lean = 0.55 + rand() * 0.35;
    const leaf = blade({length:0.016 + v * 0.002, width:0.011 + (v % 2) * 0.0018, round:0.62, cup:0.14, curl:-0.07 - rand() * 0.04, droop:0.12, rows:10, cols:4, midrib:0.22});
    const stem = stalk(0.00048, petiole, 0.62, 5);
    return merge([stem.applyMatrix4(new T.Matrix4().makeRotationZ(-lean)), placed(leaf, {x:Math.sin(lean) * petiole, y:Math.cos(lean) * petiole, pitch:0.18 + rand() * 0.22, roll:(rand() - 0.5) * 0.15})]);
  },
  rhizome() {
    const geo = new T.CapsuleGeometry(0.00095, 1, 3, 6).rotateZ(Math.PI / 2).translate(0.5, 0, 0);
    geo.deleteAttribute('uv');
    return paint(geo, (c, x, y) => c.setScalar(0.72 + y * 30));
  },
};

const COLORS = {
  rotalaBase:new T.Color('#4e7a38'), rotalaMid:new T.Color('#9a6a3c'), rotalaTip:new T.Color('#b85a48'), rotalaStem:new T.Color('#6a3d2c'),
  carpet:new T.Color('#4f8a32'), moss:new T.Color('#2f4a22'), anubias:new T.Color('#1e3f24'), anubiasYoung:new T.Color('#5a7a38'), rhizome:new T.Color('#3a3d28'),
};

function swayMaterial(name, {color = '#ffffff', roughness = 0.62, amplitude, height, time, thin = 0.18}) {
  const material = new T.MeshStandardMaterial({name, color, roughness, metalness:0, vertexColors:true, side:T.DoubleSide});
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
  material.customProgramCacheKey = () => 'flora-sway-v2';
  return material;
}

export class FloraView {
  constructor(aq, fallbackHabitat = () => null) {
    this.aq = aq;
    this.fallbackHabitat = fallbackHabitat;
    this.root = new T.Group();
    this.root.name = 'Procedural flora';
    aq.root.add(this.root);
    this.time = {value:0};
    this.density = 1;
    this.shadows = true;
    this.signature = '';
    const t = this.time;
    this.materials = {
      rotalaLeaves:swayMaterial('Flora rotala leaf', {amplitude:0.0045, height:0.22, time:t, roughness:0.52, thin:0.32}),
      rotalaStem:swayMaterial('Flora rotala stem', {amplitude:0.0045, height:0.22, time:t, roughness:0.74, thin:0.04}),
      carpet:swayMaterial('Flora carpet', {amplitude:0.0005, height:0.008, time:t, roughness:0.58, thin:0.22}),
      moss:swayMaterial('Flora moss', {amplitude:0.0007, height:0.008, time:t, roughness:0.88, thin:0.08}),
      anubiasLeaf:swayMaterial('Flora anubias leaf', {amplitude:0.0012, height:0.03, time:t, roughness:0.28, thin:0.12}),
      rhizome:swayMaterial('Flora rhizome', {amplitude:0.0002, height:0.03, time:t, roughness:0.82, thin:0}),
    };
    aq.materials.push(...Object.values(this.materials));
    this.units = {};
    for (const key of Object.keys(UNITS)) {
      const variants = ['rotalaStem', 'rhizome'].includes(key) ? 1 : FLORA_VARIANTS;
      this.units[key] = Array.from({length:variants}, (_, v) => UNITS[key](v, random(stableSeed(key + v))));
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

  scene(runtime) {
    if (runtime.current) return runtime.current;
    const habitat = this.fallbackHabitat();
    return habitat ? {soil:runtime.sourceSoil, habitat, entities:runtime.originals} : null;
  }

  host(scene, id) {
    const node = scene.entities.get(id);
    if (!node) return null;
    node.updateMatrixWorld(true);
    return new T.Matrix4().copy(this.aq.root.matrixWorld).invert().multiply(node.matrixWorld);
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
      const inverse = matrix.clone().invert(), local = new T.Vector3(...r.World).applyMatrix4(inverse), normal = new T.Vector3(...r.WorldNormal).transformDirection(inverse);
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

  build(list, scene) {
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
        const light = new T.Vector3((rand() - 0.5) * 0.15, 0.35, -0.55).normalize();
        const lean = light.clone().multiplyScalar(0.22 + rand() * 0.2).add(new T.Vector3(Math.cos(record.Yaw), 0, Math.sin(record.Yaw)).multiplyScalar(0.08));
        let p = base.clone();
        for (let k = 0; k < n; k++) {
          const t = n > 1 ? k / (n - 1) : 1, fromTip = n - 1 - k;
          const dir = UP.clone().addScaledVector(lean, 0.25 + 0.9 * t * t).add(new T.Vector3((rand() - 0.5) * 0.11, 0, (rand() - 0.5) * 0.08)).normalize();
          const L = (0.009 + rand() * 0.0045) * record.Scale * (fromTip < 2 ? 0.62 + fromTip * 0.12 : 1);
          tmp.q.setFromUnitVectors(UP, dir);
          add('rotalaStem', 0, new T.Matrix4().compose(p.clone(), tmp.q.clone(), new T.Vector3(1, L, 1)), COLORS.rotalaStem.clone().offsetHSL(hueShift, -0.05, (t - 0.4) * 0.06), stem, {id:record.UniqueId, node:k});
          p = p.clone().addScaledVector(dir, L);
          const skipLower = k < n * 0.28 && rand() < 0.45;
          if (skipLower) continue;
          const size = record.Scale * (0.38 + 0.62 * Math.min(1, fromTip / 5)) * (0.88 + rand() * 0.22);
          const leafColor = (t < 0.42 ? COLORS.rotalaBase.clone() : t < 0.72 ? COLORS.rotalaBase.clone().lerp(COLORS.rotalaMid, (t - 0.42) / 0.3) : COLORS.rotalaMid.clone().lerp(COLORS.rotalaTip, (t - 0.72) / 0.28)).offsetHSL(hueShift + (rand() - 0.5) * 0.03, (rand() - 0.55) * 0.12, (rand() - 0.5) * 0.06);
          if (k < 3) leafColor.offsetHSL(0, -0.12, -0.08);
          tmp.q2.setFromAxisAngle(UP, record.Yaw + k * Math.PI / 2 + (rand() - 0.5) * 0.45);
          add('rotalaLeaves', (record.Variant + k) % FLORA_VARIANTS, new T.Matrix4().compose(p.clone(), tmp.q.clone().multiply(tmp.q2), new T.Vector3(size, size, size)), leafColor, stem, {id:record.UniqueId, node:k});
        }
      } else if (spec.kind === 'carpet') {
        const clumps = 3 + (n > 80 ? 2 : 0);
        for (let i = 0; i < n; i++) {
          if (random(stableSeed(record.UniqueId + i))() > this.density) continue;
          const clump = i % clumps, cr = random(stableSeed(record.UniqueId + ':c' + clump));
          const mound = 0.006 + cr() * 0.01, edge = cr() * 6.28;
          const radius = mound * Math.pow(rand(), 0.55) * (0.7 + 0.5 * Math.sin(edge * 2 + record.Hue));
          const x = record.X + Math.cos(edge + rand()) * radius + (rand() - 0.5) * 0.003 + Math.cos(clump * 2.3 + record.Yaw) * 0.006;
          const z = record.Z + Math.sin(edge + rand() * 0.4) * radius * 0.85 + (rand() - 0.5) * 0.003 + Math.sin(clump * 1.7) * 0.005;
          if (Math.abs(x) > 0.57 || Math.abs(z) > 0.275) continue;
          const y = soil.sample(x, z) - 0.0006, size = (0.55 + rand() * 0.7) * record.Scale;
          tmp.q.setFromEuler(new T.Euler((rand() - 0.5) * 0.35, rand() * 6.28, (rand() - 0.5) * 0.25, 'YXZ'));
          add('carpet', (record.Variant + clump + i) % FLORA_VARIANTS, new T.Matrix4().compose(new T.Vector3(x, y, z), tmp.q.clone(), new T.Vector3(size, size * (0.75 + rand() * 0.4), size)), COLORS.carpet.clone().offsetHSL(hueShift + (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.18, (rand() - 0.5) * 0.14), [x, y, z, phase + i * 0.3], {id:record.UniqueId, node:i});
        }
      } else {
        const matrix = this.host(scene, record.Host);
        if (!matrix) continue;
        const anchor = new T.Vector3(...record.Local).applyMatrix4(matrix), normal = new T.Vector3(...record.Normal).transformDirection(matrix).normalize();
        const owner = scene.entities.get(record.Host)?.name;
        if (!hostSurfaces.has(owner)) hostSurfaces.set(owner, habitat.surfaces.filter(s => s.owner === owner));
        const surfaces = hostSurfaces.get(owner);
        const snap = point => {
          let best = null;
          for (const s of surfaces) {
            const h = s.bvh.closestPointToPoint(point, {}, 0, 0.012);
            if (h && (!best || h.distance < best.distance)) best = h;
          }
          return best ? best.point.clone() : point;
        };
        const tangent = new T.Vector3().crossVectors(normal, Math.abs(normal.y) > 0.9 ? new T.Vector3(1, 0, 0) : UP).normalize();
        const bitangent = new T.Vector3().crossVectors(normal, tangent);
        if (spec.kind === 'moss') {
          for (let i = 0; i < n; i++) {
            if (random(stableSeed(record.UniqueId + i))() > this.density) continue;
            const angle = i * 2.39996 + record.Yaw, radius = 0.0036 * Math.sqrt(i + 0.4) * record.Scale;
            const guess = anchor.clone().addScaledVector(tangent, Math.cos(angle) * radius).addScaledVector(bitangent, Math.sin(angle) * radius);
            const at = snap(guess).addScaledVector(normal, -0.0006);
            const drape = Math.max(0, 0.55 - normal.y);
            tmp.q.setFromUnitVectors(UP, normal.clone().lerp(new T.Vector3(0, -0.35, 0), 0.25 + drape).normalize()).multiply(tmp.q2.setFromAxisAngle(UP, rand() * 6.28));
            const size = (0.7 + rand() * 0.7) * record.Scale;
            add('moss', (record.Variant + i) % FLORA_VARIANTS, new T.Matrix4().compose(at, tmp.q.clone(), new T.Vector3(size, size * (0.9 + rand() * 0.6), size)), COLORS.moss.clone().offsetHSL(hueShift + (rand() - 0.5) * 0.015, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.06), [at.x, at.y, at.z, phase + i], {id:record.UniqueId, node:i});
          }
        } else {
          const along = new T.Vector3(Math.cos(record.Yaw), 0, Math.sin(record.Yaw)).projectOnPlane(normal).normalize();
          if (along.lengthSq() < 0.5) along.copy(tangent);
          const length = 0.008 + n * 0.0016;
          const start = snap(anchor.clone().addScaledVector(along, -length / 2));
          tmp.q.setFromUnitVectors(new T.Vector3(1, 0, 0), along);
          add('rhizome', 0, new T.Matrix4().compose(start.clone().addScaledVector(normal, 0.0012), tmp.q.clone(), new T.Vector3(length, 1, 1)), COLORS.rhizome.clone(), [start.x, start.y, start.z, phase], {id:record.UniqueId, node:0});
          for (let k = 0; k < n; k++) {
            const t = (k + 0.35 + rand() * 0.3) / n, at = start.clone().addScaledVector(along, length * t).addScaledVector(normal, 0.0016);
            const young = k === n - 1, size = record.Scale * (young ? 0.48 + rand() * 0.12 : 0.7 + rand() * 0.45);
            const side = k % 2 ? 1 : -1, yaw = Math.atan2(-along.z, along.x) + side * (0.55 + rand() * 1.1) + (rand() - 0.5) * 0.5;
            tmp.q.setFromUnitVectors(UP, UP.clone().lerp(normal, 0.2).normalize()).multiply(tmp.q2.setFromAxisAngle(UP, yaw));
            const color = (young ? COLORS.anubiasYoung : COLORS.anubias).clone().offsetHSL(hueShift, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.07 - (k === 0 ? 0.06 : 0));
            add('anubiasLeaf', (record.Variant + k) % FLORA_VARIANTS, new T.Matrix4().compose(at, tmp.q.clone(), new T.Vector3(size, size, size)), color, [start.x, start.y, start.z, phase], {id:record.UniqueId, node:k});
          }
        }
      }
    }
    const used = new Set();
    for (const [name, b] of buckets) {
      used.add(name);
      let entry = this.meshes.get(name);
      if (!entry || entry.capacity < b.matrices.length) {
        if (entry) { this.root.remove(entry.mesh); entry.mesh.dispose(); }
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
        this.root.add(mesh);
        entry = {mesh, capacity, stems};
        this.meshes.set(name, entry);
      }
      const {mesh, stems} = entry;
      mesh.castShadow = this.shadows && ['rotalaLeaves', 'rotalaStem', 'anubiasLeaf'].includes(b.key);
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

  pearlSites() {
    const sites = [], matrix = new T.Matrix4(), tip = new T.Vector3();
    for (const {mesh} of this.meshes.values()) {
      if (!mesh.visible || !mesh.count) continue;
      const name = mesh.name || '';
      if (!/rotalaLeaves|carpet|moss|anubiasLeaf/.test(name)) continue;
      const vigor = /rotala/.test(name) ? 1.35 : /anubias/.test(name) ? 0.55 : 0.7;
      const keep = /rotala/.test(name) ? 0.18 : 0.07;
      for (let i = 0; i < mesh.count; i++) {
        if (random(stableSeed(name + ':' + i))() > keep * this.density) continue;
        mesh.getMatrixAt(i, matrix);
        tip.set(0.007, 0.001, 0).applyMatrix4(matrix);
        sites.push({x:tip.x, y:tip.y, z:tip.z, vigor});
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

/** Kind-3 walkable hulls in Unity space so shrimp can graze the new plants. */
export function floraCollisionItems(list, {soil, hostMatrix}) {
  const items = [];
  if (!list?.length) return items;
  for (const record of list) {
    const spec = SPECIES[record.Species];
    if (!spec) continue;
    let transform, geo;
    if (spec.host) {
      const host = hostMatrix?.(record.Host);
      if (!host) continue;
      const local = new T.Vector3(...record.Local);
      const normal = new T.Vector3(...record.Normal).normalize();
      transform = host.clone().multiply(new T.Matrix4().compose(local, new T.Quaternion().setFromUnitVectors(UP, normal), new T.Vector3(1, 1, 1)));
      const radius = (spec.kind === 'moss' ? 0.012 : 0.018) * record.Scale;
      geo = new T.CircleGeometry(radius, 8);
      geo.rotateX(-Math.PI / 2);
    } else {
      const y = soil.sample(record.X, record.Z);
      const n = visibleNodes(record);
      transform = new T.Matrix4().compose(new T.Vector3(record.X, y, record.Z), new T.Quaternion(), new T.Vector3(1, 1, 1));
      if (spec.kind === 'stem') {
        const height = Math.max(0.04, n * 0.011 * record.Scale);
        geo = new T.CylinderGeometry(0.0035, 0.0035, height, 5, 1, true);
        geo.translate(0, height / 2, 0);
      } else {
        geo = new T.CircleGeometry(0.0043 * Math.sqrt(n) * record.Scale, 8);
        geo.rotateX(-Math.PI / 2);
      }
    }
    items.push({node:'flora/' + record.UniqueId, owner:'Plant ' + record.UniqueId, kind:3, solid:false, rebuild:false, geometry:geo, transform});
  }
  return items;
}
