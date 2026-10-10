import * as T from 'three';

const RAMP = 90, CLING = 2.4, RISE = 7.5, MAX = 48;

export function pearlRate({lightOn, litSeconds, quality = 1}) {
  if (!lightOn || !(quality > 0)) return 0;
  return Math.min(1, Math.max(0, litSeconds) / RAMP) * quality;
}

function pearlMaterial() {
  return new T.ShaderMaterial({
    name:'Pearling',
    transparent:true, depthWrite:false, uniforms:{aqAlpha:{value:0.7}},
    vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader:`varying vec3 vN;varying vec3 vV;uniform float aqAlpha;
      void main(){
        float fres=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.4);
        vec3 rim=vec3(0.82,0.93,0.90);
        vec3 core=vec3(0.22,0.38,0.36);
        gl_FragColor=vec4(mix(core,rim,fres),aqAlpha*(0.18+0.82*fres));
      }`,
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
    idle.userData = {life:0, cling:CLING * (0.7 + Math.random() * 0.6), site, phase:Math.random() * 6.28, vigor:site.vigor || 1};
    idle.position.set(site.x, site.y, site.z);
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
        const grown = 0.00042 + Math.min(0.00095, u.life * 0.00024) * u.vigor;
        if (clinging) {
          mesh.position.set(u.site.x, u.site.y, u.site.z);
          mesh.scale.setScalar(grown * (0.55 + 0.45 * u.life / u.cling));
        } else {
          const rise = u.life - u.cling;
          mesh.position.y = u.site.y + rise * 0.042;
          mesh.position.x = u.site.x + Math.sin(now * 2.1 + u.phase) * 0.0016;
          mesh.position.z = u.site.z + Math.cos(now * 1.6 + u.phase) * 0.0012;
          mesh.scale.setScalar(grown);
          if (mesh.position.y > level - 0.006 || rise > RISE) {
            const fade = Math.max(0, 1 - (mesh.position.y - (level - 0.01)) / 0.012);
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
