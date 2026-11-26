import * as T from 'three';
import {importedFlow} from './plant-contacts.js';
import {stableSeed} from './state.js';

const WARMUP = 30, RAMP = 90, MAX = 10, MAX_RISING = 4;

// The imported plants share the aquarium root's mirrored coordinates with the bubble pool.
export function importedPearlSites(runtime,plants){
  const entities=()=>runtime.current?.entities ?? runtime.originals;
  const sites=[], transform=new T.Matrix4(), vertices=[new T.Vector3(),new T.Vector3(),new T.Vector3()];
  for(const plant of plants){
    const id=plant.UniqueId, node=entities().get(id);
    if(!node?.visible)continue;
    let site;
    node.traverseVisible(mesh=>{
      if(site || !mesh.isMesh)return;
      const geo=mesh.geometry, {position,uv,branchData,plantWeights}=geo.attributes;
      for(const group of geo.groups){
        const material=mesh.material[group.materialIndex], source=material?.userData.source;
        if(!(source?.leaf>0) || !geo.index || (source.motion && (!branchData || !plantWeights)))continue;
        const faces=Math.floor(group.count/3), start=stableSeed(id)%faces;
        for(let n=0;n<faces;n++){
          const offset=group.start+3*((start+n)%faces);
          const indices=[geo.index.getX(offset),geo.index.getX(offset+1),geo.index.getX(offset+2)];
          const box=geo.boundingBox;
          if(box && indices.reduce((h,i)=>h+position.getY(i),0)/3 < T.MathUtils.lerp(box.min.y,box.max.y,.35))continue;
          if(material.alphaTest>0){
            // The middle of each tile in the imported 2×2 stem-leaf atlas is opaque.
            if(source.plantSurface!==0 || !uv)continue;
            const middle=axis=>T.MathUtils.euclideanModulo(indices.reduce((v,i)=>v+uv[axis](i),0)*2/3,1);
            if([middle('getX'),middle('getY')].some(v=>v<.3 || v>.7))continue;
          }
          const flow=source.motion && importedFlow(branchData.array,plantWeights.array,source);
          const resolve=()=>{
            if(node!==entities().get(id) || !node.visible)return null;
            mesh.updateWorldMatrix(true,false);
            transform.copy(runtime.aq.root.matrixWorld).invert().multiply(mesh.matrixWorld);
            for(let j=0;j<3;j++){
              const i=indices[j], p=vertices[j].fromBufferAttribute(position,i);
              if(flow)flow(p,i,material.userData.leafClock.value);
              p.applyMatrix4(transform);
            }
            const [a,b,c]=vertices, point=a.clone().add(b).add(c).multiplyScalar(1/3);
            point.normal=b.sub(a).cross(c.sub(a)).normalize();
            if(point.normal.y<0)point.normal.negate();
            return point.normal.lengthSq()>0 ? point : null;
          };
          if(resolve()){site={id:'plant:'+id,resolve};break;}
        }
        if(site)break;
      }
    });
    if(site)sites.push(site);
  }
  return sites;
}

export function pearlRate({lightOn, litSeconds, quality = 1}) {
  if (!lightOn || !(quality > 0)) return 0;
  return Math.min(1, Math.max(0, litSeconds - WARMUP) / RAMP) * quality;
}

function pearlMaterial() {
  return new T.ShaderMaterial({
    name:'Pearling',
    vertexShader:`
      varying vec3 surfaceNormal, toEye;
      void main(){
        vec4 p = modelViewMatrix * vec4(position, 1.);
        surfaceNormal = normalMatrix * normal;
        toEye = -p.xyz;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader:`
      varying vec3 surfaceNormal, toEye;
      void main(){
        vec3 n = normalize(surfaceNormal), eye = normalize(toEye);
        float facing = abs(dot(n, eye));
        float edgeWidth = clamp(fwidth(facing), .04, .22);
        float rim = 1. - smoothstep(.46-edgeWidth, .46+edgeWidth, facing);
        vec3 lightDir = mat3(viewMatrix) * normalize(vec3(-.4, .9, .35));
        float sheen = dot(n, normalize(eye + .8 * lightDir));
        float softness = clamp(fwidth(sheen), .008, .045);
        float glint = smoothstep(.94-softness, .94+softness, sheen);
        gl_FragColor = vec4(mix(vec3(.15,.34,.33), vec3(.88,.96,.83), glint),
                            .055 + .43*rim + .45*glint);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent:true,
    depthWrite:false,
  });
}

export function createPearling({root, sites, lightOn, waterLevel, wet = () => true, revision, tankId}) {
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
  let activeTank=tankId?.();
  const cooldown = new Map();
  function hide(mesh) { mesh.visible = false; mesh.userData = {life:-1}; }
  function clear() { pool.forEach(hide); lit = 0; next = clock + WARMUP; cooldown.clear(); }
  function pointOf(site, level) {
    const p = site.resolve ? site.resolve() : site;
    return p && [p.x,p.y,p.z].every(Number.isFinite) && p.y >= 0 && p.y < level - 0.002 ? p : null;
  }
  function keyOf(site) { return site.id ?? site; }
  function refresh(current) {
    catalog = (sites() || []).slice();
    const ids = new Set(catalog.map(keyOf));
    for (const id of cooldown.keys()) if (!ids.has(id)) cooldown.delete(id);
    refreshed = clock; version = current;
  }
  return {
    group,
    setQuality(preset) { quality = preset?.pearling ?? 0; if (!quality) clear(); },
    update(dt) {
      const currentTank=tankId?.(), inactive=!wet() || !lightOn() || !(quality > 0);
      // A paused room switch still draws the destination's first frame.
      if (currentTank!==activeTank || inactive) {
        activeTank=currentTank;
        if (refreshed!==-Infinity) { clear(); catalog=[]; refreshed=-Infinity; }
        if (inactive) return;
      }
      if (!(dt > 0)) return;
      clock += dt;
      const current = revision?.();
      if (refreshed === -Infinity || (revision ? current !== version : clock - refreshed >= 2)) refresh(current);
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
      // Sample without replacement until a submerged leaf is found.
      let site, point;
      for (let remaining = catalog.length; remaining > 0; remaining--) {
        const index = Math.floor(Math.random() * remaining);
        site = catalog[index];
        if ((cooldown.get(keyOf(site)) ?? 0) <= clock && (point = pointOf(site, level))) break;
        catalog[index] = catalog[remaining-1];
        catalog[remaining-1] = site;
      }
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
