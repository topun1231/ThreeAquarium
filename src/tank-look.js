import * as T from 'three';

const KEY = 'aquarium.three.quality.v1';
const PRESETS = {
  high: {fog:0.22, caustic:0.42, particles:36, bubbles:true, shafts:true, bubbleEvery:8, floraDensity:1, floraShadows:true, shrimpDetail:'full'},
  medium: {fog:0.12, caustic:0.26, particles:16, bubbles:true, shafts:false, bubbleEvery:16, floraDensity:0.7, floraShadows:true, shrimpDetail:'near'},
  low: {fog:0, caustic:0, particles:0, bubbles:false, shafts:false, bubbleEvery:0, floraDensity:0.45, floraShadows:false, shrimpDetail:'basic'},
};

export function qualityPreset(level) {
  return PRESETS[level] || PRESETS.high;
}

export function initialQuality() {
  try {
    const saved = localStorage.getItem(KEY);
    if (PRESETS[saved]) return saved;
  } catch {}
  return matchMedia('(max-width: 700px)').matches ? 'low' : 'high';
}

function remember(level) {
  try { localStorage.setItem(KEY, level); } catch {}
}

function thicken(node, floor, target) {
  const scale = node.scale;
  for (const axis of ['x', 'y', 'z']) if (scale[axis] > 0 && scale[axis] < floor) scale[axis] = target;
}

export function shapeTankLights(scene) {
  for (const light of scene.children) {
    if (!light.isLight) continue;
    if (light.isHemisphereLight) light.intensity = 0.52;
    else if (light.isSpotLight && light.castShadow) {
      light.angle = 0.52;
      light.penumbra = 0.78;
      light.intensity *= 0.82;
    } else if (light.isPointLight) light.intensity *= 0.4;
    else if (light.isDirectionalLight && light.castShadow) light.intensity *= 0.88;
  }
  const key = new T.SpotLight('#fff3e2', 3.2, 2.6, 0.46, 0.86, 1.5);
  key.name = 'tank-key';
  key.position.set(0, 1.02, 0.26);
  key.target.position.set(0, 0.03, 0.04);
  key.castShadow = false;
  scene.add(key, key.target);
}

function installCaustics(materials, time, gain) {
  const header = 'varying vec3 aqCausticPos;\nuniform float aqCTime;\nuniform float aqCGain;\n';
  for (const material of materials) {
    if (!material?.isMeshStandardMaterial || material.userData.caustic) continue;
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey?.bind(material);
    material.userData.caustic = true;
    material.onBeforeCompile = (shader, renderer) => {
      previous?.(shader, renderer);
      shader.uniforms.aqCTime = time;
      shader.uniforms.aqCGain = gain;
      shader.vertexShader = header + shader.vertexShader.replace('#include <project_vertex>', 'vec4 aqCP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\naqCP = instanceMatrix * aqCP;\n#endif\naqCausticPos = (modelMatrix * aqCP).xyz;\n#include <project_vertex>');
      shader.fragmentShader = header + shader.fragmentShader.replace('#include <opaque_fragment>', `
        float aqBelow = 1.0 - smoothstep(0.52, 0.585, aqCausticPos.y);
        float aqInside = step(abs(aqCausticPos.x), 0.6) * step(abs(aqCausticPos.z), 0.31) * step(-0.002, aqCausticPos.y);
        vec2 aqRel = vec2(aqCausticPos.x / 0.58, (aqCausticPos.z - 0.06) / 0.36);
        float aqPool = smoothstep(1.25, 0.15, length(aqRel));
        vec2 aqP = aqCausticPos.xz * 34.0 + vec2(aqCausticPos.y * 9.0);
        float aqS1 = sin(aqP.x + aqCTime * 0.7) + sin(aqP.y * 1.31 - aqCTime * 0.55) + sin((aqP.x + aqP.y) * 0.71 + aqCTime * 0.43);
        float aqS2 = sin(aqP.x * 1.63 - aqCTime * 0.38) + sin(aqP.y * 0.87 + aqCTime * 0.61) + sin((aqP.x - aqP.y) * 1.17 - aqCTime * 0.29);
        float aqBand = pow(0.3 / (abs(aqS1) + 0.3), 2.5) + pow(0.3 / (abs(aqS2) + 0.3), 2.5) * 0.7;
        outgoingLight *= 1.0 + aqBand * aqCGain * 2.2 * aqBelow * aqPool * aqInside;
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => `${previousKey ? previousKey() : material.uuid}:caustic2`;
    material.needsUpdate = true;
  }
}

function makeDrift(count) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 1.0;
    positions[i * 3 + 1] = 0.04 + Math.random() * 0.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.48;
    seeds[i] = Math.random() * 10;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(positions, 3));
  const points = new T.Points(geo, new T.PointsMaterial({
    color:'#d7ece4', size:0.0045, transparent:true, opacity:0.45, depthWrite:false, sizeAttenuation:true,
  }));
  points.frustumCulled = false;
  points.name = 'tank-drift';
  points.userData.seeds = seeds;
  return points;
}

function makeShafts() {
  const material = new T.ShaderMaterial({
    transparent:true, depthWrite:false, blending:T.AdditiveBlending,
    uniforms:{aqTime:{value:0}, aqGain:{value:1}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 vUv; uniform float aqTime; uniform float aqGain;
      void main(){
        float side = pow(sin(vUv.x * 3.14159), 3.0);
        float fade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float drift = 0.75 + 0.25 * sin(aqTime * 0.3 + vUv.y * 3.0);
        gl_FragColor = vec4(vec3(0.80, 0.88, 0.78), side * fade * drift * 0.028 * aqGain);
      }`,
  });
  const group = new T.Group();
  group.name = 'tank-shafts';
  for (const x of [-0.16, 0.02, 0.18]) {
    const plane = new T.Mesh(new T.PlaneGeometry(0.16, 0.46), material);
    plane.position.set(x, 0.30, 0.1);
    plane.rotation.y = x * 0.4;
    plane.castShadow = false;
    plane.receiveShadow = false;
    group.add(plane);
  }
  group.userData.material = material;
  return group;
}

function makeBubbles() {
  const geo = new T.SphereGeometry(0.0042, 8, 6);
  const group = new T.Group();
  group.name = 'tank-bubbles';
  for (let i = 0; i < 10; i++) {
    const mesh = new T.Mesh(geo, new T.MeshBasicMaterial({color:'#e9f7f2', transparent:true, opacity:0, depthWrite:false}));
    mesh.visible = false;
    mesh.userData.life = 0;
    group.add(mesh);
  }
  return group;
}

export function installTankLook({scene, aq, water}) {
  const skip = new Set();
  for (const mesh of aq.meshes) {
    const list = [].concat(mesh.material);
    if (mesh.userData.creatureId || /pane|Water|glass|rim|Waterline|Edge/i.test(mesh.name)) list.forEach(m => skip.add(m));
    if (/clear pane/i.test(mesh.name) && mesh.parent) thicken(mesh.parent, 0.02, 0.008);
    if (/^Waterline/.test(mesh.name) && mesh.parent) thicken(mesh.parent, 0.01, 0.006);
  }
  for (const material of aq.materials) {
    if (skip.has(material) || !/GlassEdge/.test(material.name)) continue;
    material.color.lerp(new T.Color('#8fcebc'), 0.45);
    material.emissive = new T.Color('#16362e');
    material.emissiveIntensity = 0.35;
    material.transparent = true;
    material.opacity = Math.max(material.opacity, 0.72);
  }
  const time = {value:0};
  const gain = {value:0};
  const receivers = aq.materials.filter(material => material?.isMeshStandardMaterial && !skip.has(material) && !/Glass|Water|Shrimp|shrimp/i.test(material.name || ''));
  let causticsOn = false;
  const drift = makeDrift(36);
  const shafts = makeShafts();
  const bubbles = makeBubbles();
  scene.add(drift, shafts, bubbles);
  let level = 'high';
  const listeners = [];
  let nextStream = 4;
  function apply(next) {
    level = PRESETS[next] ? next : 'high';
    const preset = PRESETS[level];
    if (water?.fog) water.fog.value = preset.fog;
    gain.value = preset.caustic;
    if (preset.caustic > 0 && !causticsOn) { installCaustics(receivers, time, gain); causticsOn = true; }
    drift.visible = preset.particles > 0;
    drift.geometry.setDrawRange(0, preset.particles);
    shafts.visible = preset.shafts;
    if (!preset.bubbles) bubbles.children.forEach(mesh => { mesh.visible = false; mesh.userData.life = 0; });
    remember(level);
    for (const fn of listeners) fn(PRESETS[level], level);
    const select = document.getElementById('view-quality');
    if (select && select.value !== level) select.value = level;
  }
  function stream() {
    const x = (Math.random() - 0.5) * 0.7;
    const z = (Math.random() - 0.5) * 0.32;
    bubbles.children.forEach((mesh, index) => {
      mesh.visible = true;
      mesh.position.set(x + (Math.random() - 0.5) * 0.012, 0.03 + index * 0.012, z);
      mesh.userData.life = 1;
      mesh.userData.speed = 0.045 + Math.random() * 0.03;
      mesh.material.opacity = 0.6;
    });
  }
  const select = document.getElementById('view-quality');
  apply(select?.value && PRESETS[select.value] ? select.value : initialQuality());
  select?.addEventListener('change', () => apply(select.value));
  return {
    get level(){ return level; },
    setQuality: apply,
    get preset(){ return PRESETS[level]; },
    onChange(fn){ listeners.push(fn); fn(PRESETS[level], level); },
    update(now) {
      time.value = now;
      const preset = PRESETS[level];
      if (shafts.visible) shafts.userData.material.uniforms.aqTime.value = now;
      if (drift.visible) {
        const positions = drift.geometry.attributes.position;
        const seeds = drift.userData.seeds;
        const count = preset.particles;
        for (let i = 0; i < count; i++) {
          let y = positions.getY(i) + 0.004 + seeds[i] * 0.0004;
          let x = positions.getX(i) + Math.sin(now * 0.2 + seeds[i]) * 0.00035;
          if (y > 0.56) { y = 0.03; x = (Math.random() - 0.5) * 1.0; positions.setZ(i, (Math.random() - 0.5) * 0.48); }
          positions.setX(i, Math.max(-0.54, Math.min(0.54, x)));
          positions.setY(i, y);
        }
        positions.needsUpdate = true;
      }
      if (preset.bubbles) {
        let alive = false;
        for (const mesh of bubbles.children) {
          if (mesh.userData.life <= 0) continue;
          alive = true;
          mesh.userData.life -= 0.004;
          mesh.position.y += mesh.userData.speed * 0.016;
          mesh.position.x += Math.sin(now * 2 + mesh.position.y * 20) * 0.0002;
          mesh.material.opacity = Math.max(0, mesh.userData.life) * 0.65;
          if (mesh.position.y > 0.56 || mesh.userData.life <= 0) { mesh.visible = false; mesh.userData.life = 0; }
        }
        if (!alive && now > nextStream) { stream(); nextStream = now + preset.bubbleEvery; }
      }
    },
  };
}
