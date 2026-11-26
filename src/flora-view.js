import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {stableSeed} from './state.js';
import {javaFernFrond, riverbankLeaf} from './riverbank-leaves.js';
import {SPECIES, FLORA_VARIANTS, floraSignature, visibleNodes, visibleUpright} from './flora.js';

const UP = new T.Vector3(0, 1, 0);
const RIBBON_EXTRA_REACH = [0, .42, 0, .64];

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
  javafern:javaFernFrond,
  fernAxis:() => stalk(.0019,1,.86,6),
  vallisneria: (variant, rand) => riverbankLeaf(true, variant, rand),
  browncrypt: (variant, rand) => riverbankLeaf(false, variant, rand),
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
    for (let i = 0, n = 42 + v * 6; i < n; i++) {
      const len = 0.0011 + rand() * 0.0014, width = 0.00038 + rand() * 0.00032;
      parts.push(placed(blade({length:len, width, round:1.7, cup:0.08, curl:-0.12, droop:0.35 + rand() * 0.3, rows:3, cols:1, midrib:0}), {
        x:(rand() - 0.5) * 0.012, y:rand() * 0.001, z:(rand() - 0.5) * 0.012,
        yaw:rand() * 6.28, pitch:0.08 + rand() * 0.5, roll:(rand() - 0.5) * 0.7,
      }));
    }
    for (let i = 0, stems = 12 + v * 2; i < stems; i++) {
      const yaw = rand() * 6.28, pitch = 0.2 + rand() * 0.95, len = 0.0045 + rand() * 0.0055, width = 0.00028 + rand() * 0.0002;
      const ox = (rand() - 0.5) * 0.01, oz = (rand() - 0.5) * 0.01;
      parts.push(placed(blade({length:len, width, round:1.6, cup:0, curl:-0.2, droop:0.72 + rand() * 0.22, rows:4, cols:1, midrib:0}), {x:ox, y:rand() * 0.0008, z:oz, yaw, pitch:pitch * 0.55}));
      for (let k = 0, n = 8 + Math.floor(rand() * 5); k < n; k++) {
        const t = 0.12 + k * 0.09 + rand() * 0.03, ll = 0.0011 + rand() * 0.0014;
        parts.push(placed(blade({length:ll, width:ll * 0.4, round:1.5, cup:0.03, curl:-0.1, droop:0.28, rows:3, cols:1, midrib:0}), {
          x:ox + Math.cos(yaw) * len * t * Math.cos(pitch), y:Math.sin(pitch) * len * t * 0.4, z:oz - Math.sin(yaw) * len * t * Math.cos(pitch),
          yaw:yaw + (k % 2 ? 1.2 : -1.2) + (rand() - 0.5) * 1.1, pitch:pitch * 0.15 + (rand() - 0.5) * 1.2,
        }));
      }
    }
    return merge(parts);
  },

};

const COLORS = {
  javafern:new T.Color('#608d3c'), youngFern:new T.Color('#96a94b'),
  rhizome:new T.Color('#7b7336'), fernRoot:new T.Color('#574839'),
  vallisneria:new T.Color('#74983e'), browncrypt:new T.Color('#834930'), youngCrypt:new T.Color('#788347'),
  rotalaBase:new T.Color('#2f5c28'), rotalaMid:new T.Color('#7a6b28'), rotalaTip:new T.Color('#c45a3c'), rotalaStem:new T.Color('#3a4a28'),
  carpet:new T.Color('#3f8c38'), moss:new T.Color('#3a5c2c'), mossTip:new T.Color('#6a8a3c'),
};

function swayMaterial(name, {color = '#ffffff', roughness = 0.62, amplitude, height, time, thin = 0.18, clearcoat = 0, clipNodes = false}) {
  const material = clearcoat > 0
    ? new T.MeshPhysicalMaterial({name, color, roughness, metalness:0, vertexColors:true, side:T.DoubleSide, clearcoat, clearcoatRoughness:0.32})
    : new T.MeshStandardMaterial({name, color, roughness, metalness:0, vertexColors:true, side:T.DoubleSide});
  material.userData.sway = {amplitude, height};
  material.onBeforeCompile = shader => {
    shader.uniforms.aqFloraTime = time;
    shader.uniforms.aqFloraSway = {value:new T.Vector2(amplitude, height)};
    shader.uniforms.aqFloraThin = {value:thin};
    shader.vertexShader = (clipNodes ? 'attribute float aqNode;\nattribute float aqLeaves;\n' : '') + 'attribute vec4 aqStem;\nuniform float aqFloraTime;\nuniform vec2 aqFloraSway;\n' + shader.vertexShader.replace('#include <project_vertex>', `
      #ifdef USE_INSTANCING
      {
        ${clipNodes ? 'if (aqNode >= 0.0 && aqNode >= aqLeaves) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }' : ''}
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
  material.customProgramCacheKey = () => `flora-sway-v3-${clearcoat > 0 ? 'coat' : 'std'}${clipNodes ? '-clip' : ''}`;
  if (clipNodes) {
    const depth = new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});
    depth.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float aqNode;\nattribute float aqLeaves;\n' + shader.vertexShader.replace('#include <project_vertex>', `
        #ifdef USE_INSTANCING
        if (aqNode >= 0.0 && aqNode >= aqLeaves) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        #endif
        #include <project_vertex>`);
    };
    depth.customProgramCacheKey = () => 'flora-depth-clip-v1';
    material.customDepthMaterial = depth;
  }
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

function normalAtTip(geo, tip) {
  const p = geo.attributes.position, normal = geo.attributes.normal;
  if (!normal) return [0, 1, 0];
  let at = 0, best = Infinity;
  for (let i = 0; i < p.count; i++) {
    const d = (p.getX(i)-tip[0])**2 + (p.getY(i)-tip[1])**2 + (p.getZ(i)-tip[2])**2;
    if (d < best) { at = i; best = d; }
  }
  return new T.Vector3().fromBufferAttribute(normal, at).normalize().toArray();
}

export function swayFloraPoint(point, stem, {amplitude, height}, time) {
  const h = T.MathUtils.clamp(Math.max(0, point.y - stem[1]) / height, 0, 1.6), gain = amplitude * h * h, phase = stem[3];
  point.x += (Math.sin(time * .62 + stem[0] * 9 + phase) + .45 * Math.sin(time * 1.37 + stem[2] * 13 + phase * 1.7)) * gain;
  point.z += (.6 * Math.sin(time * .47 + stem[2] * 7 + phase * .6) + .3 * Math.sin(time * 1.11 + stem[0] * 5)) * gain;
  return point;
}

/** Drop triangles whose authored node is at or past the visible leaf count. */
export function keepVisibleLeaves(unit, leaves) {
  const nodes = unit.attributes.aqNode;
  if (!nodes || !(leaves < 90)) return unit.clone();
  const keep = [];
  const src = unit.index;
  if (src) {
    for (let i = 0; i < src.count; i += 3) {
      const a = src.getX(i);
      if (nodes.getX(a) >= 0 && nodes.getX(a) >= leaves) continue;
      keep.push(a, src.getX(i + 1), src.getX(i + 2));
    }
  } else {
    for (let i = 0; i < nodes.count; i += 3) {
      if (nodes.getX(i) >= 0 && nodes.getX(i) >= leaves) continue;
      keep.push(i, i + 1, i + 2);
    }
  }
  const geo = unit.clone();
  geo.setIndex(keep);
  return geo;
}

function floraLeafRaycast(raycaster, intersects) {
  const nodeAttr = this.geometry.attributes.aqNode, leafAttr = this.geometry.attributes.aqLeaves;
  const before = intersects.length;
  T.InstancedMesh.prototype.raycast.call(this, raycaster, intersects);
  if (!nodeAttr || !leafAttr) return;
  for (let i = intersects.length - 1; i >= before; i--) {
    const hit = intersects[i];
    if (hit.object !== this || !hit.face || hit.instanceId == null) continue;
    const node = nodeAttr.getX(hit.face.a), leaves = leafAttr.getX(hit.instanceId);
    if (node >= 0 && node >= leaves) intersects.splice(i, 1);
  }
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
    this.pearlRevision = 0;
    const t = this.time;
    this.materials = {
      javafern:swayMaterial('Flora java fern blade', {amplitude:.0018,height:.19,time:t,roughness:.75,thin:.29}),
      fernAxis:swayMaterial('Flora fern rhizome and roots', {amplitude:0,height:.1,time:t,roughness:.9,thin:.05}),
      vallisneria:swayMaterial('Flora ribbon leaf', {amplitude:.005, height:.30, time:t, roughness:.61, thin:.42}),
      browncrypt:swayMaterial('Flora bronze leaf', {amplitude:.0011, height:.08, time:t, roughness:.69, thin:.26}),
      rotalaLeaves:swayMaterial('Flora rotala leaf', {amplitude:0.0045, height:0.22, time:t, roughness:0.48, thin:0.48}),
      rotalaStem:swayMaterial('Flora rotala stem', {amplitude:0.0045, height:0.22, time:t, roughness:0.74, thin:0.04}),
      carpet:swayMaterial('Flora carpet', {amplitude:0.0005, height:0.008, time:t, roughness:0.55, thin:0.28}),
      moss:swayMaterial('Flora moss', {amplitude:0.0009, height:0.012, time:t, roughness:0.88, thin:0.38}),

    };
    aq.materials.push(...Object.values(this.materials));
    this.units = {};
    this.tips = {};
    for (const key of Object.keys(UNITS)) {
      const variants = key === 'rotalaStem' || key === 'fernAxis' ? 1 : FLORA_VARIANTS;
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
    this.models = {};
    this.leafKeys = new Set();
    this.tipNodes = {};
    const shared = materials.map((m, i) => {
      const material = swayMaterial('Authored anubias ' + i, {amplitude:0.0008, height:0.085, time:this.time, roughness:m.roughness, thin:0.12, clearcoat:m.clearcoat, clipNodes:true});
      material.vertexColors = false;
      material.color.fromArray(m.color);
      material.map = maps.get(m.map) || null;
      material.alphaTest = m.alphaTest;
      this.aq.materials.push(material);
      return material;
    });
    for (const [species, variants] of Object.entries(models)) {
      this.models[species] = variants.map((model, v) => {
        const groups = new Map();
        for (const part of model.parts) {
          if (!groups.has(part.material)) groups.set(part.material, []);
          groups.get(part.material).push(part);
        }
        const parts = [];
        for (const [material, list] of groups) {
          const geos = list.map(part => {
            const g = part.geometry.clone();
            g.setAttribute('aqNode', new T.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part.node), 1));
            return g;
          });
          const geometry = mergeGeometries(geos, false);
          geos.forEach(g => g.dispose());
          const key = species + v + 'mat' + material;
          const leafParts = list.filter(p => p.leaf);
          this.units[key] = [geometry];
          this.tips[key] = leafParts.length ? leafParts.map(p => tipOf(p.geometry)) : [tipOf(geometry)];
          this.tipNodes[key] = leafParts.map(p => p.node);
          this.materials[key] = shared[material];
          if (leafParts.length) this.leafKeys.add(key);
          parts.push({
            key, material, geometry, leaf:leafParts.length > 0,
            node:Math.min(...list.map(p => p.node)),
            nodes:list.map(p => p.node),
          });
        }
        return {...model, parts};
      });
    }
  }

  scene(runtime) {
    if (runtime.current) return runtime.current;
    const habitat = this.fallbackHabitat();
    return habitat ? {soil:runtime.sourceSoil, habitat, entities:runtime.originals} : null;
  }

  host(scene, id) {
    if(scene.hostMatrix)return scene.hostMatrix(id);
    const node = scene.entities.get(id);
    if (!node) return null;
    node.updateMatrixWorld(true);
    return scene.unity ? node.matrixWorld.clone() : new T.Matrix4().copy(this.aq.root.matrixWorld).invert().multiply(node.matrixWorld);
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

  instances(list, scene, distant = false) {
    return this.instanceSteps(list, scene, distant).next().value;
  }

  *instanceSteps(list, scene, distant, checkpoint) {
    const buckets = new Map();
    const add = (key, variant, matrix, color, stem, owner) => {
      const name = key + ':' + variant;
      if (!buckets.has(name)) buckets.set(name, {key, variant, matrices:[], colors:[], stems:[], owners:[], leaves:[]});
      const b = buckets.get(name);
      b.matrices.push(matrix); b.colors.push(color); b.stems.push(stem); b.owners.push(owner); b.leaves.push(owner.leaves ?? 99);
    };
    const soil = scene.soil, habitat = scene.habitat;
    const tmp = {q:new T.Quaternion(), q2:new T.Quaternion(), v:new T.Vector3(), s:new T.Vector3(), box:new T.Box3()};
    const hostSurfaces = new Map();
    for (const record of list) {
      const pause = checkpoint?.(); if (pause) yield pause;
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
          if(!distant || k % 3 === 0 || fromTip === 0)
            add('rotalaLeaves', (record.Variant + k) % FLORA_VARIANTS, new T.Matrix4().compose(p.clone(), tmp.q.clone().multiply(tmp.q2), new T.Vector3(size, size, size)), leafColor, stem, {id:record.UniqueId, node:k});
        }
      } else if (spec.kind === 'groundFan') {
        const key = record.Species, ribbon = key === 'vallisneria';
        const tallness = ribbon ? T.MathUtils.smoothstep(record.Scale, 1.10, 1.58) : 0;
        const minHeight = T.MathUtils.lerp(.68, 1.04, tallness);
        const maxHeight = T.MathUtils.lerp(1.06, 1.21, tallness);
        const base = new T.Vector3(record.X, soil.sample(record.X, record.Z) - .001, record.Z);
        for (let i = 0; i < n; i++) {
          const variant = (record.Variant + i) % FLORA_VARIANTS;
          const fan = record.Yaw + phase + i * 2.39996 + (rand() - .5) * .36;
          let yaw = fan, swayPhase = phase;
          if (ribbon) {
            const radius=.008*record.Scale;
            base.x=record.X+radius*Math.cos(fan);
            base.z=record.Z+radius*Math.sin(fan);
            base.y=soil.sample(base.x,base.z)-.001;
            yaw=.48*Math.sin(fan);
            swayPhase=.32*Math.sin(fan)+.18*Math.sin(phase);
          }
          let spread = (.55 + rand() * .65) * record.Scale;
          let height = T.MathUtils.lerp(minHeight, maxHeight, rand()) * record.Scale;
          const color = COLORS[key].clone();
          if (key === 'browncrypt') color.lerp(COLORS.youngCrypt, rand() ** 2 * .68);
          color.offsetHSL(hueShift + (rand() - .5) * .018, 0, (rand() - .5) * .032);
          // Shorten outward leaves at the glass, leaving inward-facing leaves free to arch.
          const unit = this.units[key][variant].boundingBox;
          const margin = Math.max(unit.max.z,-unit.min.z) * record.Scale + this.materials[key].userData.sway.amplitude * 4;
          // At the downstream pane the current turns along the glass.
          if(ribbon){
            // Longer blades trail beyond their neighbours at the same water depth.
            spread *= 1 + RIBBON_EXTRA_REACH[variant] * tallness;
            // Ease the last few centimetres so the tallest leaves keep different crests below the ripples.
            const ceiling = .58 - .008 - base.y;
            const excess = height * unit.max.y - (ceiling - .04);
            if (excess > 0) height = (ceiling - .04 * Math.exp(-excess / .04)) / unit.max.y;
            const room = T.MathUtils.clamp((.6-margin-base.x)/(unit.max.x*spread),0,1);
            const alongGlass = 1.51 * T.MathUtils.clamp(base.z/.07 + .5*Math.sin(fan),-1,1);
            yaw = T.MathUtils.lerp(yaw,alongGlass,1-room*room);
          }
          tmp.q.setFromAxisAngle(UP, yaw);
          const pose=new T.Matrix4().compose(base,tmp.q,tmp.s.set(spread,height,record.Scale));
          if(ribbon){
            // The lower blade can bow upstream even when its tip clears the pane.
            const b=tmp.box.copy(unit).applyMatrix4(pose),guard=this.materials[key].userData.sway.amplitude*4;
            const fit=Math.max(.01,Math.min(1,
              (.6-base.x-guard)/Math.max(.001,b.max.x-base.x),(.6+base.x-guard)/Math.max(.001,base.x-b.min.x),
              (.3-base.z-guard)/Math.max(.001,b.max.z-base.z),(.3+base.z-guard)/Math.max(.001,base.z-b.min.z)));
            if(fit<1)pose.scale(tmp.v.set(fit,1,fit));
          }else{
            const dx=Math.cos(yaw),dz=-Math.sin(yaw);
            const roomX=.6-Math.sign(dx)*base.x-margin,roomZ=.3-Math.sign(dz)*base.z-margin;
            const reach=Math.max(.025,Math.min(spread,roomX/Math.max(.001,Math.abs(dx)*unit.max.x),roomZ/Math.max(.001,Math.abs(dz)*unit.max.x)));
            pose.scale(tmp.v.set(reach/spread,1,1));
          }
          add(key, variant, pose, color, [base.x,base.y,base.z,swayPhase], {id:record.UniqueId,node:i});
        }
      } else if (spec.kind === 'carpet') {
        const clumps = 6 + (n > 80 ? 3 : 1);
        for (let i = 0; i < n; i++) {
          if ((!distant || i>0) && random(stableSeed(record.UniqueId + i))() > (distant ? .24 : this.density)) continue;
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
        const snap = (point, fallback=point) => {
          let best = null;
          for (const s of surfaces) {
            const h = s.bvh.closestPointToPoint(point, {}, 0, 0.022);
            if (h && (!best || h.distance < best.distance)) best = h;
          }
          return best ? best.point.clone() : fallback;
        };
        const tangent = new T.Vector3().crossVectors(normal, Math.abs(normal.y) > 0.9 ? new T.Vector3(1, 0, 0) : UP).normalize();
        const bitangent = new T.Vector3().crossVectors(normal, tangent);
        if (spec.kind === 'fern') {
          const heading=new T.Vector3(Math.cos(record.Yaw),0,Math.sin(record.Yaw)).transformDirection(matrix);
          heading.addScaledVector(normal,-normal.dot(heading));
          if(heading.lengthSq()<.001)heading.copy(tangent);
          heading.normalize();
          const scale=record.Scale, stem=[anchor.x,anchor.y,anchor.z,phase];
          const previous=[anchor.clone(),anchor.clone()];
          const segment=(from,to,radius,color,node)=>{
            const axis=to.clone().sub(from),length=axis.length();
            if(length<.0001)return;
            tmp.q.setFromUnitVectors(UP,axis.divideScalar(length));
            add('fernAxis',0,new T.Matrix4().compose(from,tmp.q,tmp.s.set(radius,length,radius)),color,stem,{id:record.UniqueId,node});
          };
          for(let i=0;i<n;i++){
            const side=i%2, along=(side?1:-1)*Math.ceil(i/2)*.0055*scale;
            const guess=anchor.clone().addScaledVector(heading,along);
            const knot=snap(guess,surfaces.length?anchor:guess).addScaledVector(normal,.0017*scale);
            segment(previous[side],knot,scale,COLORS.rhizome,i);
            previous[side]=knot;
            const bend=knot.clone().addScaledVector(normal,.003*scale).addScaledVector(heading,(rand()-.5)*.012*scale);
            bend.y-=.007*scale;
            const end=bend.clone().addScaledVector(heading,(rand()-.5)*.012*scale);
            end.y-=(.008+rand()*.012)*scale;
            segment(knot,bend,.27*scale,COLORS.fernRoot,i);segment(bend,end,.15*scale,COLORS.fernRoot,i);
            const variant=(record.Variant+i)%FLORA_VARIANTS,angle=phase+i*2.39996+(rand()-.5)*.40;
            const dir=new T.Vector3(Math.cos(angle),0,-Math.sin(angle));
            if(dir.dot(normal)<0)dir.reflect(normal).setY(0).normalize();
            const yaw=Math.atan2(-dir.z,dir.x),unit=this.units.javafern[variant].boundingBox;
            const reach=(.66+rand()*.63)*scale, height=(.70+rand()*.45)*scale;
            const roomX=.59-Math.sign(dir.x)*knot.x, roomZ=.29-Math.sign(dir.z)*knot.z;
            const spread=Math.max(.025,Math.min(reach,(roomX-.024*scale)/Math.max(.001,Math.abs(dir.x)*unit.max.x),
              (roomZ-.024*scale)/Math.max(.001,Math.abs(dir.z)*unit.max.x)));
            tmp.q.setFromAxisAngle(UP,yaw);
            const color=COLORS.javafern.clone().lerp(COLORS.youngFern,rand()**2*.7);
            add('javafern',variant,new T.Matrix4().compose(knot,tmp.q,tmp.s.set(spread,height,scale)),color,stem,{id:record.UniqueId,node:i});
          }
        } else if (spec.kind === 'moss') {
        const count = Math.max(n, 36);
        for (let i = 0; i < count; i++) {
            if ((!distant || i>0) && random(stableSeed(record.UniqueId + i))() > (distant ? .24 : this.density)) continue;
            const angle = i * 2.39996 + record.Yaw, radius = 0.012 * Math.sqrt(i + 0.12) * record.Scale;
            const hang = Math.max(0, 0.62 - normal.y) * (0.008 + rand() * 0.014);
            const guess = anchor.clone().addScaledVector(tangent, Math.cos(angle) * radius).addScaledVector(bitangent, Math.sin(angle) * radius * (0.65 + rand() * 0.55)).addScaledVector(UP, -hang);
            const at = snap(guess).addScaledVector(normal, -0.0005);
            const drape = Math.max(0, 0.82 - normal.y);
            tmp.q.setFromUnitVectors(UP, normal.clone().lerp(new T.Vector3(0, -0.85, 0), 0.45 + drape * 0.7).normalize()).multiply(tmp.q2.setFromAxisAngle(UP, rand() * 6.28));
            const size = (1.35 + rand() * 0.55) * record.Scale;
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
            const nodes = part.nodes || [part.node];
            if (nodes.every(node => node >= 0 && node >= leaves)) continue;
            const color = new T.Color().setScalar(.94 + rand()*.12).offsetHSL(hueShift,0,0);
            add(part.key, 0, pose.clone(), color, [anchor.x,anchor.y,anchor.z,phase], {id:record.UniqueId,node:part.node,leaves});
          }
        }
      }
    }
    return buckets;
  }

  build(list, scene, {root=this.root, meshes=this.meshes, distant=false, pickIndices}={}) {
    const buckets = this.instances(list, scene, distant), used = new Set();
    for (const [name, b] of buckets) {
      used.add(name);
      let entry = meshes.get(name);
      if (!entry || entry.capacity < b.matrices.length) {
        if (entry) { root.remove(entry.mesh); entry.mesh.geometry.dispose(); entry.mesh.dispose(); }
        const capacity = Math.ceil(b.matrices.length * 1.5) + 8;
        const unit=this.units[b.key][b.variant];
        const geometry=unit.clone();
        const indices=pickIndices?.(unit,b.key);
        if(indices)geometry.setIndex(new T.BufferAttribute(indices.slice(),1));
        const stems = new T.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
        geometry.setAttribute('aqStem', stems);
        const leafAttr = geometry.attributes.aqNode ? new T.InstancedBufferAttribute(new Float32Array(capacity), 1) : null;
        if (leafAttr) geometry.setAttribute('aqLeaves', leafAttr);
        const mesh = new T.InstancedMesh(geometry, this.materials[b.key === 'rotalaLeaves' ? 'rotalaLeaves' : b.key], capacity);
        mesh.name = 'Flora ' + name;
        mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.receiveShadow = true;
        mesh.frustumCulled = distant;
        mesh.userData.flora = true;
        if (leafAttr) mesh.raycast = floraLeafRaycast;
        if (mesh.material.customDepthMaterial) mesh.customDepthMaterial = mesh.material.customDepthMaterial;
        root.add(mesh);
        entry = {mesh, capacity, stems, leafAttr};
        meshes.set(name, entry);
      }
      const {mesh, stems, leafAttr} = entry;
      if(!distant){
        const authoredTips = this.tipNodes?.[b.key];
        mesh.userData.tip = authoredTips?.length ? this.tips[b.key][0] : this.tips[b.key][b.variant];
        mesh.userData.tips = authoredTips?.length ? this.tips[b.key] : [this.tips[b.key][b.variant]];
        mesh.userData.tipNormals = mesh.userData.tips.map(tip => normalAtTip(mesh.geometry, tip));
        mesh.userData.tipNodes = authoredTips || [];
      }
      mesh.castShadow = this.shadows && b.key !== 'carpet' && b.key !== 'moss';
      b.matrices.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, b.colors[i]); stems.setXYZW(i, ...b.stems[i]); leafAttr?.setX(i, b.leaves[i]); });
      mesh.count = b.matrices.length;
      mesh.userData.owners = b.owners;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      stems.needsUpdate = true;
      if (leafAttr) leafAttr.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.visible = true;
    }
    for (const [name, entry] of meshes) if (!used.has(name)) { entry.mesh.count = 0; entry.mesh.visible = false; entry.mesh.userData.owners = []; }
    if(!distant)this.pearlRevision++;
  }

  hiddenFloraFace(hit) {
    const nodeAttr = hit?.object?.geometry?.attributes?.aqNode, leafAttr = hit?.object?.geometry?.attributes?.aqLeaves;
    if (!nodeAttr || !leafAttr || !hit.face || hit.instanceId == null) return false;
    const node = nodeAttr.getX(hit.face.a), leaves = leafAttr.getX(hit.instanceId);
    return node >= 0 && node >= leaves;
  }

  owner(hit) {
    if (!hit?.object?.userData.flora || hit.instanceId == null || this.hiddenFloraFace(hit)) return null;
    return hit.object.userData.owners?.[hit.instanceId] || null;
  }

  update(time) { this.time.value = time; }

  collisionItems(list, scene, checkpoint) {
    const steps = this.collisionSteps(list, scene, checkpoint);
    if (!checkpoint) return steps.next().value;
    return (async () => {
      try {
        for (let step = steps.next(); ; step = steps.next()) {
          if (step.done) return step.value;
          await step.value;
        }
      } finally { steps.return(); }
    })();
  }

  *collisionSteps(list, scene, checkpoint) {
    const buckets = yield* this.instanceSteps(list, scene, false, checkpoint);
    const plants = new Map(), items = [];
    let disc, complete = false;
    try {
      for (const b of buckets.values()) {
        if(b.key==='fernAxis')continue; // Shrimp perch on fronds; the fine root filaments only dress the rhizome.
        const unit = this.units[b.key][b.variant];
        unit.computeBoundingBox();
        // shortcut: tiny moss/carpet leaflets share a shoot support disc; use triangles if shrimp become smaller than a shoot.
        const tiny = b.key === 'moss' || b.key === 'carpet';
        if (tiny) disc = new T.CircleGeometry(b.key === 'moss' ? .003 : .0025, 8).rotateX(-Math.PI/2).translate(0, unit.boundingBox.max.y, 0);
        for (let i = 0; i < b.matrices.length; i++) {
          if (i % 16 === 0) { const pause = checkpoint?.(); if (pause) yield pause; }
          const id = b.owners[i].id;
          if (!plants.has(id)) plants.set(id, {parts:[], samples:[]});
          const plant = plants.get(id), leaves = b.leaves[i];
          const geo = (disc ? disc.clone() : keepVisibleLeaves(unit, leaves)).applyMatrix4(b.matrices[i]);
          if (!tiny && geo.index && geo.index.count === 0) { geo.dispose(); continue; }
          plant.parts.push(geo);
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
            const tipNodes = this.tipNodes?.[b.key] || [];
            const tips = this.tips[b.key] || [];
            if (tipNodes.length) {
              for (let t = 0; t < tips.length; t++) {
                if ((tipNodes[t] ?? 0) >= leaves) continue;
                plant.samples.push(new T.Vector3(...tips[t]).applyMatrix4(b.matrices[i]));
              }
            } else if (tips[b.variant]) {
              plant.samples.push(new T.Vector3(...tips[b.variant]).applyMatrix4(b.matrices[i]));
            }
            for (const j of [0, Math.floor(p.count*.25), Math.floor(p.count*.5)]) if (j < p.count) plant.samples.push(new T.Vector3().fromBufferAttribute(p,j));
          }
        }
        disc?.dispose(); disc = null;
      }
      for (const [id, plant] of plants) {
        if (!plant.parts.length) continue;
        const pause = checkpoint?.(); if (pause) yield pause;
        const geometry = mergeGeometries(plant.parts, false); plant.parts.forEach(g => g.dispose());
        plant.parts.length = 0;
        items.push({node:'flora/'+id, owner:'Plant '+id, kind:3, solid:false, flora:true, ownedSource:true, material:{motion:1, leaf:1}, geometry, transform:new T.Matrix4(), samples:plant.samples});
      }
      complete = true;
      return items;
    } finally {
      disc?.dispose();
      if (!complete) {
        for (const plant of plants.values()) for (const geo of plant.parts) geo.dispose();
        for (const item of items) item.geometry.dispose();
      }
    }
  }

  pearlSites() {
    const sites = [], matrix = new T.Matrix4(), tip = new T.Vector3();
    for (const [key, {mesh}] of this.meshes) {
      if (!mesh.visible || !mesh.count) continue;
      const name = mesh.name || '';
      if (!/rotalaLeaves|carpet|moss|vallisneria|browncrypt|javafern/.test(name) && !this.leafKeys?.has(key.split(':')[0])) continue;
      const vigor = /rotala/.test(name) ? 1.4 : /pala|nullified/.test(name) ? 0.55 : 0.7;
      const keep = /rotala/.test(name) ? 0.3 : /pala|nullified/.test(name) ? 0.16 : 0.08;
      const locals = Array.isArray(mesh.userData.tips) && mesh.userData.tips.length ? mesh.userData.tips : [mesh.userData.tip || [0.008, 0.001, 0]];
      const tipNodes = mesh.userData.tipNodes || [];
      const leafAttr = mesh.geometry.getAttribute('aqLeaves');
      for (let i = 0; i < mesh.count; i++) {
        const shown = leafAttr ? leafAttr.getX(i) : 99;
        for (let t = 0; t < locals.length; t++) {
          if (tipNodes[t] >= shown) continue;
          if (random(stableSeed(name + ':' + i + ':' + t))() > keep * this.density) continue;
          mesh.getMatrixAt(i, matrix);
          const local = locals[t];
          tip.set(local[0], local[1], local[2]).applyMatrix4(matrix);
          const owner = mesh.userData.owners[i];
          const tipIndex = t;
          const resolve = () => {
            const current = this.meshes.get(key)?.mesh;
            if (!current?.visible) return null;
            const at = current.userData.owners.findIndex(o => o.id === owner.id && o.node === owner.node);
            if (at < 0) return null;
            const shownNow = current.geometry.getAttribute('aqLeaves')?.getX(at) ?? 99;
            if ((current.userData.tipNodes?.[tipIndex] ?? 0) >= shownNow) return null;
            const m = new T.Matrix4(); current.getMatrixAt(at, m);
            const localNow = current.userData.tips?.[tipIndex] || current.userData.tip;
            const point = new T.Vector3(...localNow).applyMatrix4(m), stem = current.geometry.attributes.aqStem;
            swayFloraPoint(point, Array.from(stem.array.subarray(at*4,at*4+4)), current.material.userData.sway, this.time.value);
            point.normal = new T.Vector3(...current.userData.tipNormals[tipIndex]).applyMatrix3(new T.Matrix3().getNormalMatrix(m)).normalize();
            return point;
          };
          sites.push({id:`${key}:${owner.id}:${owner.node}:${t}`, x:tip.x, y:tip.y, z:tip.z, vigor, resolve});
        }
      }
    }
    return sites;
  }

  stats() {
    let instances = 0, draws = 0, visibleLeaves = 0;
    for (const {mesh} of this.meshes.values()) if (mesh.visible && mesh.count) {
      instances += mesh.count; draws++;
      const attr = mesh.geometry.getAttribute('aqLeaves');
      if (attr) for (let i = 0; i < mesh.count; i++) visibleLeaves += attr.getX(i);
    }
    return {instances, draws, visibleLeaves};
  }
}

/** Collision-only fallback for callers without a rendered FloraView. */
let collisionView;
export function floraCollisionItems(list, {soil, hostMatrix, habitat = {surfaces:[]}}, checkpoint) {
  collisionView ??= new FloraView({root:new T.Group(), materials:[]});
  const entities = new Map(habitat.surfaces.filter(s=>s.solid && s.owner).map(s=>[s.owner.slice(3),{name:s.owner}]));
  return collisionView.collisionItems(list, {soil, habitat, entities, hostMatrix:hostMatrix ?? (() => null)}, checkpoint);
}
