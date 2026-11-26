export const BUILD_STEPS = [
  {title:'铺底床', tool:'pour', tools:['pour','level','push','return'], next:'已铺好，摆放木石 →'},
  {title:'摆木石', tool:'stone', tools:['stone','select'], next:'木石就位，种植水草 →'},
  {title:'种水草', tool:'plant', tools:['plant','select','prune'], next:'造景完成，注水养虾 →'},
  {title:'注水养虾', tool:'select', tools:[], next:'正在注水…'},
];
const LABELS = {pour:'铺土', level:'整平', push:'推土', return:'回收', stone:'添加木石', select:'选择物体', plant:'种植水草', prune:'修剪'};
const HINTS = {pour:'虚线显示落土范围，按住左键拖动铺土。', level:'按住左键，把圈内底床整平。', push:'按住左键拖动，沿箭头方向推土。', return:'按住左键，回收圈内的土。', stone:'移动鼠标选择释放位置；左键放手，木石会下落、倾倒并停住。Esc 取消。', select:'单击只选中物体，再选择移动、旋转或同款；点击空处取消选择。', plant:'选择水草，移动鼠标查看株形与落点；绿色时左键种植。', prune:'点击水草要剪的位置；操作后可以撤销。'};

export function objectEditActions(tank,id) {
  const stone=tank.Hardscape.some(r=>r.UniqueId===id),native=tank.Plants.some(r=>r.UniqueId===id);
  return {rotate:stone||native||!!tank.Flora?.some(r=>r.UniqueId===id),tilt:stone||native,burial:false};
}

export function buildRequirement(tank, soil) {
  if (!soil?.h.some(h => h > soil.MinHeight + 0.0002)) return '先在缸底铺一层土';
  if (tank.Setup.PreparationStep >= 2 && !tank.Plants.length && !tank.Flora?.length) return '先种下一株水草';
  return '';
}

export function createBuildGuide(panel, onStep) {
  const $ = id => document.getElementById(id), home = panel.parentElement;
  const guide = document.createElement('section');
  guide.id = 'build-guide'; guide.hidden = true; guide.setAttribute('aria-label','建造鱼缸');
  guide.innerHTML = `<h2>建造你的鱼缸</h2><ol>${BUILD_STEPS.map((s,i)=>`<li><button type="button" data-step="${i}">${i+1}　${s.title}</button></li>`).join('')}</ol><p id="build-instruction" role="status"></p>`;
  guide.querySelector('#build-instruction').tabIndex=-1;
  guide.onclick = e => {const b=e.target.closest('button[data-step]');if(b&&!b.disabled)onStep(Number(b.dataset.step));};
  document.body.append(guide);
  const actions = document.createElement('div'); actions.id = 'setup-actions';
  $('setup-tools').after(actions);
  actions.append($('setup-undo').parentElement, $('setup-next').parentElement);
  const shortcuts = document.createElement('div'); shortcuts.id = 'build-tools';
  shortcuts.innerHTML = Object.entries(LABELS).map(([key,label])=>`<button type="button" data-tool="${key}">${label}</button>`).join('');
  $('setup-tools').prepend(shortcuts);
  shortcuts.onclick = e => {
    const button = e.target.closest('button[data-tool]'); if (!button) return;
    $('setup-tool').value = button.dataset.tool; $('setup-tool').dispatchEvent(new Event('change'));
  };
  const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '右键单击取消放置 · 右键拖动旋转 · 中键 / WASD 平移 · 滚轮缩放 · V 俯视 · R 复位 · Esc 取消'; guide.append(hint);
  return {
    update({tank, soil, tool, selected, moving, busy, filling, attached}) {
      const building = !tank.Setup.Filled || filling > 0, step = filling > 0 ? 3 : tank.Setup.PreparationStep;
      guide.dataset.step = String(step);
      document.body.classList.toggle('building',building); guide.hidden = !building; shortcuts.hidden = !building;
      if (building && panel.parentElement !== guide) { guide.insertBefore(panel,hint); document.body.classList.remove('quiet','panel-collapsed'); window.showDock?.(''); }
      if (!building && panel.parentElement !== home) home.prepend(panel);
      guide.querySelectorAll('li').forEach((li,i)=>{li.toggleAttribute('data-done',i<step);if(i===step)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
      guide.querySelectorAll('button[data-step]').forEach((b,i)=>{b.disabled=busy||filling>0||tank.Setup.Filled||i>=step;b.title=i<step?`返回${BUILD_STEPS[i].title}，保留现有造景`:BUILD_STEPS[i].title;});
      const config = BUILD_STEPS[step];
      if (building && step===0 && $('soil-cards')?.nextElementSibling!==shortcuts) $('soil-cards').after(shortcuts);
      else if (step!==0 && $('setup-tools').firstElementChild!==shortcuts) $('setup-tools').prepend(shortcuts);
      $('build-instruction').textContent = filling > 0 ? '正在注水，完成后进入观察模式。' : tool === 'plant' ? `已选：${$('plant-kind').selectedOptions[0].textContent}。${attached?'移到木石表面，不能种在土里':'移到有底床的位置'}；绿色时点击种植。` : tool==='select'&&moving?'正在移动：左键确认新位置，右键 / Esc 退回选中状态。':HINTS[tool] || '';
      for (const b of shortcuts.children) { b.hidden = !config.tools.includes(b.dataset.tool); b.disabled = busy || filling > 0; b.setAttribute('aria-pressed',String(b.dataset.tool===tool)); }
      $('setup-tool').parentElement.hidden = building;
      for (const [id,show] of [['soil-kind',step===0],['soil-heavy',step===0&&tool==='push'],['stone-kind',tool==='stone'],['plant-kind',tool==='plant']]) $(id).parentElement.hidden = building && !show;
      const actions=objectEditActions(tank,selected);
      for (const [id,show] of [['object-left',actions.rotate],['object-tilt-left',actions.tilt],['object-up',actions.burial]]) $(id).parentElement.hidden = !show;
      $('object-delete').hidden = !actions.rotate;
      $('tank-edit').hidden = building;
      $('setup-back').hidden = building && step===0;
      if (building) {
        const reason = filling > 0 ? '' : buildRequirement(tank,soil);
        $('setup-next').disabled = busy || filling > 0 || !!reason;
        const next=step===1 && !tank.Hardscape.length?'跳过木石，直接种草 →':config.next;
        $('setup-next').textContent = reason || (step===2?`${tank.Hardscape.length} 件木石 · ${tank.Plants.length+(tank.Flora?.length||0)} 株水草，注水 →`:next);
        $('setup-next').title = reason || (step===2?`本缸 ${tank.Hardscape.length} 件木石、${tank.Plants.length+(tank.Flora?.length||0)} 株水草；点击后注水`:next);
      } else $('setup-next').title = '';
    },
  };
}
