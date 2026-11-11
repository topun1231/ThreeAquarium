import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {installShrimpLook} from './shrimp-look.js';
import {stableSeed} from './state.js';
import {cloneCreatureMaterials, stripEggMeshes, releaseCreatureMesh} from './mesh-materials.js';

// One lazy renderer, one thumbnail per task. No world poses, cameras or saves are changed.
export function createCrystalPortraits(aq) {
  let renderer, current, stopped = false, scheduled = false;
  const cache = new Map(), queue = [];
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, .001, 10);
  scene.add(new T.HemisphereLight(0xe7f4ee, 0x42564c, 2.5));
  const key = new T.DirectionalLight(0xffecd2, 3.5); key.position.set(-1, 2, 3); scene.add(key);
  const fill = new T.DirectionalLight(0xb6d6e8, 1.5); fill.position.set(1, .5, -2); scene.add(fill);
  const look = installShrimpLook({record:() => null, simSeconds:() => 0, crystal:() => current});

  function render(record, now) {
    const templates = aq.templates?.length ? aq.templates : aq.animals;
    if (!templates.length) throw new Error('缺少虾的模型');
    if (!renderer) {
      renderer = new T.WebGLRenderer({alpha:true, antialias:true});
      renderer.setPixelRatio(1); renderer.setSize(384, 224, false);
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
    }
    const seed = stableSeed(record.id), template = templates[seed % templates.length];
    const rig = clone(template.rig), owned = [], skeletons = new Set();
    try {
      stripEggMeshes(rig);
      const sprites = []; rig.traverse(o => { if (o.isSprite) sprites.push(o); });
      sprites.forEach(o => o.removeFromParent());
      rig.traverse(o => {
        if (!o.isMesh) return;
        cloneCreatureMaterials(o, .90 + (seed % 101) / 500); owned.push(o);
        if (o.skeleton) skeletons.add(o.skeleton);
      });
      rig.position.set(0, 0, 0); rig.quaternion.identity();
      rig.scale.setScalar(template.baseScale ?? template.rig.scale.x); rig.visible = true;
      current = record.legacy ? null : {individual:record, now}; look.sync([{id:record.id, rig}]);
      scene.add(rig); scene.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(rig), size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
      const halfHeight = Math.max(size.y * .8, size.x / (384 / 224) * .62, size.z * .7, .005);
      camera.left = -halfHeight * 384 / 224; camera.right = -camera.left;
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.position.copy(center).add(new T.Vector3(0, .06, .3)); camera.lookAt(center); camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } finally {
      rig.removeFromParent(); owned.forEach(releaseCreatureMesh); skeletons.forEach(s => s.dispose());
      renderer?.renderLists.dispose(); current = null;
    }
  }
  function drain() {
    scheduled = false;
    const job = queue.shift(); if (!job) return;
    try { job.resolve(stopped ? null : render(job.record, job.now)); }
    catch (error) { cache.delete(job.key); job.resolve(null); console.warn('虾册头像暂不可用', error.message); }
    if (queue.length && !stopped) { scheduled = true; setTimeout(drain, 32); }
  }
  return {
    get(record, now, priority = false) {
      if (stopped) return Promise.resolve(null);
      const key = JSON.stringify([record.id, record.sex, record.colour, record.pattern, now >= record.adultAt ? record.P : 'juvenile']);
      if (cache.has(key)) {
        const index = priority ? queue.findIndex(job => job.key === key) : -1;
        if (index > 0) queue.unshift(queue.splice(index, 1)[0]);
        return cache.get(key);
      }
      const promise = new Promise(resolve => { const job = {record:structuredClone(record), now, resolve, key}; priority ? queue.unshift(job) : queue.push(job); });
      cache.set(key, promise); if (cache.size > 100) cache.delete(cache.keys().next().value);
      if (!scheduled) { scheduled = true; setTimeout(drain, 0); }
      return promise;
    },
    dispose() { stopped = true; queue.splice(0).forEach(job => job.resolve(null)); cache.clear(); look.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); },
  };
}
