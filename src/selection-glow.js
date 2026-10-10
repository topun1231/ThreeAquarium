import * as T from 'three';

const HOVER = 0.16, PERSIST = 0.22, PEAK = 0.75, HOLD = 0.55, FADE = 1.5;

const vertexShader = `
#include <common>
#include <skinning_pars_vertex>
uniform float aqGrow;
varying vec3 vAqNormal;
varying vec3 vAqView;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * aqGrow;
  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  vAqNormal = normalize(normalMatrix * objectNormal);
  vAqView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = `
uniform vec3 aqColor;
uniform float aqStrength;
varying vec3 vAqNormal;
varying vec3 vAqView;
void main() {
  float facing = abs(dot(normalize(vAqNormal), normalize(vAqView)));
  float rim = pow(1.0 - facing, 2.2);
  gl_FragColor = vec4(aqColor * rim * aqStrength, 1.0);
}`;

/** Rim strength for one shrimp: a short flash on selection that fades by 1.5 s. */
export function glowStrength({selected, hovered, age, persistent}) {
  let s = hovered ? HOVER : 0;
  if (selected) {
    const flash = age < 0.15 ? Math.max(0, age) / 0.15 : age < HOLD ? 1 : 1 - T.MathUtils.smoothstep(age, HOLD, FADE);
    s = Math.max(s, flash * PEAK, persistent ? PERSIST : 0);
  }
  return s;
}

function glowMaterial(grow, gain) {
  return new T.ShaderMaterial({
    name:'Selection glow',
    uniforms:{aqColor:{value:new T.Color('#fff1d6')}, aqStrength:{value:0}, aqGrow:{value:grow}},
    vertexShader, fragmentShader,
    transparent:true, depthWrite:false, blending:T.AdditiveBlending,
    userData:{gain},
  });
}

/**
 * A soft additive rim on the selected shrimp that fades after about 1.5 s.
 * The overlay is a second skinned mesh bound to the same skeleton but kept
 * outside the rig, so population cloning never copies it.
 */
export function createSelectionGlow(scene) {
  const group = new T.Group();
  group.name = 'Selection glow';
  scene.add(group);
  const overlays = new Map();
  let selectedId = null, selectedAt = 0;

  function overlay(animal) {
    if (overlays.has(animal)) return overlays.get(animal);
    let skin = null;
    animal.rig.traverse(o => { if (!skin && o.isSkinnedMesh) skin = o; });
    if (!skin) return null;
    const materials = (Array.isArray(skin.material) ? skin.material : [skin.material]).map(m => {
      if (/eye/i.test(m.name)) { const hidden = glowMaterial(0, 0); hidden.visible = false; return hidden; }
      return /append/i.test(m.name) ? glowMaterial(0.00004, 0.45) : glowMaterial(0.00012, 1);
    });
    const mesh = new T.SkinnedMesh(skin.geometry, materials.length > 1 ? materials : materials[0]);
    mesh.bind(skin.skeleton, skin.bindMatrix);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.raycast = () => {};
    mesh.userData.glowOverlay = true;
    group.add(mesh);
    const entry = {mesh, materials};
    overlays.set(animal, entry);
    return entry;
  }

  function strength(id, hoveredId, now, persistent) {
    return glowStrength({selected:id === selectedId, hovered:id === hoveredId, age:now - selectedAt, persistent});
  }

  return {
    group,
    update(animals, selected, hoveredId, now, persistent = false) {
      const id = selected?.id ?? null;
      if (id !== selectedId) { selectedId = id; selectedAt = now; }
      for (const [animal, entry] of overlays) {
        if (!animals.includes(animal)) { group.remove(entry.mesh); entry.materials.forEach(m => m.dispose()); overlays.delete(animal); }
      }
      for (const animal of animals) {
        const s = animal.rig.visible ? strength(animal.id, hoveredId, now, persistent) : 0;
        const entry = s > 0.002 ? overlay(animal) : overlays.get(animal);
        if (!entry) continue;
        entry.mesh.visible = s > 0.002;
        for (const m of entry.materials) m.uniforms.aqStrength.value = s * m.userData.gain;
      }
    },
    stats() { return {overlays:overlays.size, visible:[...overlays.values()].filter(e => e.mesh.visible).length}; },
  };
}
