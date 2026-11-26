import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {broodEggProgress, crystalLookLookup, installShrimpLook, legacyEggProgress} from './shrimp-look.js';
import {stableSeed} from './state.js';
import {cloneCreatureMaterials, stripEggMeshes, releaseCreatureMesh} from './mesh-materials.js';
import {illustratedColourGLSL} from './illustrated-look.js';
import {shrimpViewGeometry} from './aquarium-geometry.js';
import {crystalGrowthFraction, inTank} from './crystal-breeding.js';
import {ecologySeconds} from './ecology.js';
import {MATURITY_DAYS} from './care.js';
import {shrimpBodyScale} from './shrimp-scale.js';

// Render each age from a fixed point in its interval, so an offline reconstruction matches a live photo.
const juvenileFrames = 12;
export function crystalPortraitFrame(record, now, clock, eggs = null) {
  const patterned = !record.legacy && record.colour && record.pattern;
  const growth = patterned ? crystalGrowthFraction(record, now, clock) : 1;
  const stage = Math.floor(growth * juvenileFrames);
  // Three colour samples cover a clutch from freshly carried to just before hatch.
  const eggProgress = eggs == null ? null : Math.round(eggs * 2) / 2;
  const key = JSON.stringify([record.id, !!record.legacy, record.sex, record.colour, record.pattern, stage, stage ? record.P : null, eggProgress]);
  // A single cached photograph can show growth between two successive colour samples.
  const bodyScale = patterned ? shrimpBodyScale({id:record.id, sex:record.sex, ageDays:MATURITY_DAYS * growth}) : 1;
  return {key, growth:stage / juvenileFrames, eggProgress, bodyScale};
}

// One lazy renderer, one thumbnail per task. No world poses, cameras or saves are changed.
export function createCrystalPortraits(aq, readClock = () => null) {
  let renderer, current, stopped = false, scheduled = false;
  const thumbnails = new Map(), closeups = new Map(), queue = [];
  const liveLook = crystalLookLookup(readClock);
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, .001, 10);
  scene.add(new T.HemisphereLight(0xf8f1df, 0x756454, 1.25));
  const key = new T.DirectionalLight(0xffedda, 2.4); key.position.set(-1.5, 2, 1.3); scene.add(key);
  const fill = new T.DirectionalLight(0xc6d9dc, .78); fill.position.set(1, .8, -2); scene.add(fill);
  const look = installShrimpLook({record:() => null, simSeconds:() => 0, crystal:() => current});
  const rest = aq.pack?.clips?.find(clip => clip.name === 'Rest');
  const pose = (rest?.tracks ?? []).map(track => ({
    path:track.path ? track.path.split('/') : [],
    position:track.positions.slice(0, 3), rotation:track.rotations.slice(0, 4), scale:track.scales.slice(0, 3),
  }));

  function render(record, frame, closeup, view) {
    const templates = aq.templates?.length ? aq.templates : aq.animals;
    if (!templates.length) throw new Error('缺少虾的模型');
    if (!renderer) {
      renderer = new T.WebGLRenderer({alpha:true, antialias:true});
      renderer.setPixelRatio(1);
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .98;
    }
    const scale = closeup ? 3 : 1;
    if (renderer.domElement.width !== 384 * scale) renderer.setSize(384 * scale, 224 * scale, false);
    const seed = stableSeed(record.id), template = templates[seed % templates.length];
    const rig = clone(template.rig), owned = [], skeletons = new Set();
    const animal = {id:record.id, rig};
    try {
      stripEggMeshes(rig);
      const sprites = []; rig.traverse(o => { if (o.isSprite) sprites.push(o); });
      sprites.forEach(o => o.removeFromParent());
      // The template can be walking when cloned. Use the same authored rest frame for every sitting.
      const model = aq.pack?.nodes?.[template.animationRoot];
      const modelRoot = model && rig.getObjectByName(model.name);
      if (modelRoot) {
        for (const joint of pose) {
          let part = modelRoot;
          for (const name of joint.path) part = part?.children.find(child => child.name === name);
          if (!part) continue;
          part.position.fromArray(joint.position);
          part.quaternion.fromArray(joint.rotation);
          part.scale.fromArray(joint.scale);
        }
      }
      rig.traverse(o => {
        if (!o.isMesh) return;
        o.geometry=shrimpViewGeometry(o.geometry,true);
        cloneCreatureMaterials(o, .90 + (seed % 101) / 500); owned.push(o);
        if (o.skeleton) skeletons.add(o.skeleton);
      });
      rig.position.set(0, 0, 0); rig.quaternion.identity();
      rig.scale.setScalar(template.baseScale ?? template.rig.scale.x); rig.visible = true;
      current = {individual:record.legacy ? null : record, growth:frame.growth, eggProgress:frame.eggProgress};
      look.sync([animal], () => ({sex:record.sex}));
      for (const mesh of owned) {
        for (const material of [].concat(mesh.material)) {
          if (!material.userData.populationOwned) continue; // Eyes share their material with the live tank.
          const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
          material.onBeforeCompile = function(shader, renderer) {
            previous.call(this, shader, renderer);
            shader.fragmentShader = illustratedColourGLSL + shader.fragmentShader.replace('#include <tonemapping_fragment>',
              '#include <tonemapping_fragment>\n gl_FragColor.rgb = aqIllustratedColour(gl_FragColor.rgb, .27);');
          };
          material.customProgramCacheKey = () => key + ':illustrated-portrait';
        }
      }
      scene.add(rig); scene.updateMatrixWorld(true);
      for (const mesh of owned) if (mesh.isSkinnedMesh) mesh.computeBoundingBox();
      const bounds = new T.Box3().setFromObject(rig), size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
      const aspect = 384 / 224;
      let halfHeight = Math.max(size.y * .72, size.x / aspect * .50, size.z * .66, .005);
      if (view === 'back') {
        camera.up.set(0, 0, -1);
        const head = rig.getObjectByName('Cephalothorax'), tail = rig.getObjectByName('Telson');
        if (head && tail) {
          const first = head.getWorldPosition(new T.Vector3()), last = tail.getWorldPosition(new T.Vector3());
          const dx = last.x - first.x, dz = last.z - first.z, length = Math.hypot(dx, dz);
          if (length > 0) {
            // Keep the head on the left and frame the coloured shell independently of its antennae.
            center.lerpVectors(first, last, .52);
            camera.up.set(dz / length, 0, -dx / length);
            halfHeight = length * .64 / aspect;
          }
        }
        camera.position.copy(center); camera.position.y += .4;
      } else {
        camera.up.set(0, 1, 0);
        camera.position.copy(center).add(new T.Vector3(-.046, .19, .3));
      }
      camera.left = -halfHeight * aspect; camera.right = -camera.left;
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.lookAt(center); camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } finally {
      rig.removeFromParent(); owned.forEach(releaseCreatureMesh); skeletons.forEach(s => s.dispose());
      if (animal.look?.eggs) releaseCreatureMesh(animal.look.eggs);
      renderer?.renderLists.dispose(); current = null;
    }
  }
  function drain() {
    scheduled = false;
    const job = queue.shift(); if (!job) return;
    try { job.resolve(stopped ? null : render(job.record, job.frame, job.closeup, job.view)); }
    catch (error) {
      if (job.cache.get(job.key) === job.promise) job.cache.delete(job.key);
      job.resolve(null); console.warn('虾册头像暂不可用', error.message);
    }
    if (queue.length && !stopped) { scheduled = true; setTimeout(drain, 32); }
    else if (job.closeup && renderer) renderer.setSize(384, 224, false);
  }
  return {
    currentFrame(record, now) {
      let eggs = null;
      if (record.sex === 'female' && inTank(record)) {
        if (!record.legacy) eggs = broodEggProgress(liveLook(record.id)?.batch, record.id, now);
        else if (record.legacyHatchAt != null) eggs = legacyEggProgress(ecologySeconds((record.legacyHatchAt - now) / 1000));
      }
      return crystalPortraitFrame(record, now, readClock(), eggs);
    },
    get(record, now, priority = false, frame = crystalPortraitFrame(record, now, readClock()), closeup = false, view = 'side') {
      if (stopped) return Promise.resolve(null);
      const cache = closeup ? closeups : thumbnails;
      const key = view === 'back' ? 'back:' + frame.key : frame.key;
      if (cache.has(key)) {
        const index = priority ? queue.findIndex(job => job.cache === cache && job.key === key) : -1;
        if (index > 0) queue.unshift(queue.splice(index, 1)[0]);
        return cache.get(key);
      }
      const job = {record:structuredClone(record), frame, key, cache, closeup, view};
      const promise = new Promise(resolve => { job.resolve = resolve; });
      job.promise = promise;
      if (priority) queue.unshift(job); else queue.push(job);
      cache.set(key, promise); if (cache.size > (closeup ? 8 : 100)) cache.delete(cache.keys().next().value);
      if (!scheduled) { scheduled = true; setTimeout(drain, 0); }
      return promise;
    },
    dispose() { stopped = true; queue.splice(0).forEach(job => job.resolve(null)); thumbnails.clear(); closeups.clear(); look.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); },
  };
}
