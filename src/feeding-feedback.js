import {Vector3} from 'three';
import {feedingSummary} from './care.js';

export function createFeedingFeedback(camera, focusShrimp) {
  const chip = document.createElement('button'), marker = document.createElement('button');
  chip.id = 'feeding-status'; marker.id = 'feeding-marker';
  for (const button of [chip, marker]) {
    button.type = 'button'; button.hidden = true;
    button.setAttribute('aria-controls', 'care-pop');
    button.onclick = () => {
      if (document.getElementById('care-pop').hidden) document.getElementById('care-chip').click();
      details.scrollIntoView({block:'nearest'});
    };
  }
  document.getElementById('care-chip').after(chip);
  document.body.append(marker);
  const details = document.createElement('section'); details.id = 'feeding-details'; details.hidden = true;
  const title = document.createElement('strong'), status = document.createElement('p'), list = document.createElement('div'), help = document.createElement('p');
  title.textContent = '这次加餐'; list.id = 'feeding-shrimp';
  help.textContent = '附近食物包含饲料和生物膜。虾会按需求自行发现；点名字可找到它。';
  details.append(title, status, list, help); document.getElementById('care').after(details);
  const screen = new Vector3(), header = document.querySelector('header'); let model = null, signature = '', paused = false;
  function paint() {
    const next = JSON.stringify([model, paused]); if (next === signature) return; signature = next;
    if (!model) return;
    const state = paused ? '已暂停' : model.sinking ? '饲料下沉中' : model.eaters.length ? `${model.eaters.length} 只在附近摄食` : '等待虾自行发现';
    chip.textContent = `投喂点 · ${state}`; marker.textContent = model.sinking ? '投喂点 · 下沉中' : '投喂点';
    if (paused) marker.textContent = '投喂点 · 已暂停';
    status.textContent = `${state} · 附近食物${model.food}${paused ? '（暂停前状态）' : ''}`;
    list.replaceChildren();
    for (const eater of model.eaters) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = eater.name;
      button.dataset.id = eater.id; button.title = `找到 ${eater.name}`;
      button.onclick = () => focusShrimp(eater.id); list.append(button);
    }
  }
  return {
    update(world, colony) { model = feedingSummary(world, colony); paint(); },
    render(mesh, visible, isPaused) {
      if (paused !== isPaused) { paused = isPaused; paint(); }
      const show = !!model && visible && mesh.visible && !document.hidden;
      chip.hidden = details.hidden = marker.hidden = !show;
      if (!show) return;
      mesh.getWorldPosition(screen).project(camera);
      const x = (screen.x + 1) * innerWidth / 2, y = (1 - screen.y) * innerHeight / 2;
      marker.hidden = screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > .95 || Math.abs(screen.y) > .9
        || y < header.getBoundingClientRect().bottom + 48 || y > innerHeight - 90;
      if (!marker.hidden) {
        marker.style.left = `${x}px`;
        marker.style.top = `${y}px`;
      }
    },
  };
}
