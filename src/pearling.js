import * as T from 'three';

const RAMP = 90, CLING = 2.4, RISE = 7.5, MAX = 48;

export function pearlRate({lightOn, litSeconds, quality = 1}) {
  if (!lightOn || !(quality > 0)) return 0;
  return Math.min(1, Math.max(0, litSeconds) / RAMP) * quality;
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

export function createPearling({root, sites, lightOn, waterLevel}) {
  const group = new T.Group();
  group.name = 'Pearling';
  root.add(group);
  const geo = new T.SphereGeometry(1, 10, 8);
  const material = pearlMaterial();
  const pool = Array.from({length:MAX}, () => {
    const mesh = new T.Mesh(geo, material);
    mesh.visible = false;
    mesh.userData = {life:-1};
    group.add(mesh);
    return mesh;
  });
  let lit = 0, quality = 1, next = 0, catalog = [];

  function refresh() {
    catalog = sites() || [];
  }

  function spawn(now) {
    const rate = pearlRate({lightOn:lightOn(), litSeconds:lit, quality});
    if (!(rate > 0) || !catalog.length) return;
    const idle = pool.find(mesh => mesh.userData.life < 0);
    if (!idle) return;
    const site = catalog[Math.floor(Math.random() * catalog.length)];
    const point = site.resolve ? site.resolve() : site;
    if (!point) { refresh(); return; }
    idle.userData = {life:0, cling:CLING * (0.7 + Math.random() * 0.6), site, phase:Math.random() * 6.28, vigor:site.vigor || 1};
    idle.position.set(point.x, point.y, point.z);
    idle.scale.setScalar(0.00048);
    idle.visible = true;
    next = now + (0.18 + Math.random() * 0.55) / Math.max(0.15, rate * (site.vigor || 1));
  }

  return {
    group,
    setQuality(preset) { quality = preset?.pearling ?? 0; if (!quality) pool.forEach(mesh => { mesh.visible = false; mesh.userData.life = -1; }); },
    update(dt, now) {
      const on = !!lightOn();
      lit = on ? lit + dt : 0;
      if (on && now > next) {
        if (!catalog.length || Math.random() < 0.15) refresh();
        spawn(now);
      }
      const level = waterLevel?.() ?? 0.58;
      for (const mesh of pool) {
        const u = mesh.userData;
        if (u.life < 0) continue;
        u.life += dt;
        const clinging = u.life < u.cling;
        const grown = 0.00055 + Math.min(0.0012, u.life * 0.0003) * u.vigor;
        if (clinging) {
          const point = u.site.resolve ? u.site.resolve() : u.site;
          if (!point) { mesh.visible = false; u.life = -1; continue; }
          mesh.position.set(point.x, point.y, point.z);
          mesh.scale.setScalar(grown * (0.55 + 0.45 * u.life / u.cling));
        } else {
          u.origin ??= mesh.position.clone();
          const rise = u.life - u.cling;
          mesh.position.y = u.origin.y + rise * 0.042;
          mesh.position.x = u.origin.x + Math.sin(now * 2.1 + u.phase) * 0.0016;
          mesh.position.z = u.origin.z + Math.cos(now * 1.6 + u.phase) * 0.0012;
          mesh.scale.setScalar(grown);
          if (rise > RISE) { mesh.visible = false; u.life = -1; continue; }
          if (mesh.position.y > level - 0.006) {
            const fade = Math.max(0, Math.min(1, 1 - (mesh.position.y - (level - 0.01)) / 0.012));
            mesh.scale.setScalar(grown * fade);
            if (fade <= 0.05) { mesh.visible = false; u.life = -1; }
          }
        }
      }
      if (!on) pool.forEach(mesh => { mesh.visible = false; mesh.userData.life = -1; });
    },
    stats() { return {alive:pool.filter(m => m.visible).length, sites:catalog.length, lit}; },
  };
}
