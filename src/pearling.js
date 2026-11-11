import * as T from 'three';

const WARMUP = 30, RAMP = 90, MAX = 10, MAX_RISING = 4;

export function pearlRate({lightOn, litSeconds, quality = 1}) {
  if (!lightOn || !(quality > 0)) return 0;
  return Math.min(1, Math.max(0, litSeconds - WARMUP) / RAMP) * quality;
}

function pearlMaterial() {
  return new T.MeshPhysicalMaterial({
    name:'Pearling',
    color:0xb7ddd6,
    roughness:0.08,
    metalness:0,
    transmission:0.72,
    thickness:0.0014,
    ior:1.33,
    transparent:true,
    opacity:0.88,
    depthWrite:false,
    attenuationColor:0x7fbfb4,
    attenuationDistance:0.01,
  });
}

export function createPearling({root, sites, lightOn, waterLevel, wet = () => true, revision = () => null}) {
  const group = new T.Group();
  group.name = 'Pearling';
  root.add(group);
  const geo = new T.SphereGeometry(1, 10, 8), material = pearlMaterial();
  const pool = Array.from({length:MAX}, () => {
    const mesh = new T.Mesh(geo, material);
    mesh.visible = false;
    mesh.userData = {life:-1};
    group.add(mesh);
    return mesh;
  });
  let lit = 0, quality = 1, clock = 0, next = WARMUP, catalog = [], refreshed = -Infinity, version;
  const cooldown = new Map();
  function hide(mesh) { mesh.visible = false; mesh.userData = {life:-1}; }
  function clear() { pool.forEach(hide); lit = 0; next = clock + WARMUP; cooldown.clear(); }
  function pointOf(site, level) {
    const p = site.resolve ? site.resolve() : site;
    return p && [p.x,p.y,p.z].every(Number.isFinite) && p.y >= 0 && p.y < level - 0.002 ? p : null;
  }
  function keyOf(site) { return site.id ?? site; }
  function refresh() {
    catalog = sites() || [];
    const ids = new Set(catalog.map(keyOf));
    for (const id of cooldown.keys()) if (!ids.has(id)) cooldown.delete(id);
    refreshed = clock; version = revision();
  }
  return {
    group,
    setQuality(preset) { quality = preset?.pearling ?? 0; if (!quality) clear(); },
    update(dt) {
      if (!wet() || !lightOn() || !(quality > 0)) { clear(); catalog = []; refreshed = -Infinity; return; }
      if (!(dt > 0)) return;
      clock += dt;
      if (revision() !== version || clock - refreshed >= 2) refresh();
      if (!catalog.length) { clear(); return; }
      lit += dt;
      const level = waterLevel?.() ?? 0.58;
      let rising = pool.filter(m => m.visible && m.userData.origin).length;
      for (const mesh of pool) {
        const u = mesh.userData;
        if (u.life < 0) continue;
        u.life += dt;
        if (!u.origin) {
          const point = pointOf(u.site, level);
          if (!point) { hide(mesh); continue; }
          const radius = u.radius * (0.15 + 0.85 * Math.min(1, u.life / u.cling));
          mesh.position.set(point.x, point.y, point.z);
          if (point.normal) mesh.position.addScaledVector(point.normal, radius * 0.7);
          mesh.scale.setScalar(radius);
          if (u.life >= u.cling && rising < MAX_RISING) {
            u.origin = mesh.position.clone(); u.rise = 0; rising++;
          }
        } else {
          u.rise += dt;
          mesh.position.set(u.origin.x + Math.sin(u.rise * 1.2 + u.phase) * 0.0006 - Math.sin(u.phase) * 0.0006,
            u.origin.y + u.rise * u.speed,
            u.origin.z + Math.sin(u.rise * 0.8) * 0.0004);
          const fade = Math.min(1, Math.max(0, (level - mesh.position.y) / 0.008));
          mesh.scale.setScalar(u.radius * fade);
          if (fade <= 0.05 || u.rise > 30) { hide(mesh); rising--; }
        }
      }
      const rate = pearlRate({lightOn:true, litSeconds:lit, quality});
      if (clock < next || rate <= 0) return;
      next = clock + 1;
      const idle = pool.find(m => m.userData.life < 0);
      if (!idle) return;
      const eligible = catalog.filter(s => (cooldown.get(keyOf(s)) ?? 0) <= clock && pointOf(s, level));
      if (!eligible.length) return;
      const site = eligible[Math.floor(Math.random() * eligible.length)], point = pointOf(site, level);
      if (!point) return;
      const radius = 0.0003 + Math.random() * 0.0005;
      idle.userData = {life:0, cling:8 + Math.random() * 8, site, radius, speed:0.02 + Math.random() * 0.01, phase:Math.random() * 6.28};
      idle.position.set(point.x, point.y, point.z);
      if (point.normal) idle.position.addScaledVector(point.normal, radius * 0.15 * 0.7);
      idle.scale.setScalar(radius * 0.15); idle.visible = true;
      cooldown.set(keyOf(site), clock + 40 + Math.random() * 40);
      next = clock + (4 + Math.random() * 5) / Math.max(0.25, rate);
    },
    stats() { return {alive:pool.filter(m => m.visible).length, rising:pool.filter(m => m.visible && m.userData.origin).length, sites:catalog.length, lit}; },
  };
}
