import {Vector3} from 'three';
import {feedingSummary} from './care.js';
import {matchesShrimpSearch} from './crystal-traits.js';

function mealNumber(id, ids) {
  const prefix = id.match(/^[0-9a-f]{8}(?=-[0-9a-f]{4}-)/i)?.[0];
  return prefix && !ids.some(other=>other!==id && other.startsWith(prefix)) ? prefix : id;
}

export function createFeedingFeedback(camera, focusShrimp, describeVisitor, visitShrimp) {
  const chip = document.createElement('button'), marker = document.createElement('button');
  chip.id = 'feeding-status'; marker.id = 'feeding-marker';
  for (const button of [chip, marker]) {
    button.type = 'button'; button.hidden = true;
    button.setAttribute('aria-controls', 'care-pop');
    button.onclick = showMeal;
  }
  document.getElementById('care-chip').after(chip);
  document.body.append(marker);
  const details = document.createElement('section'); details.id = 'feeding-details'; details.hidden = true;
  const title = document.createElement('strong'), status = document.createElement('p'), list = document.createElement('div'), help = document.createElement('p');
  title.textContent = '这次加餐'; title.tabIndex=-1; list.id = 'feeding-shrimp';
  function showMeal() {
    if (document.getElementById('care-pop').hidden) document.getElementById('care-chip').click();
    title.focus({preventScroll:true});details.scrollIntoView({block:'nearest'});
  }
  help.textContent = '附近食物包含饲料和生物膜。虾会按需求自行发现；点名字可找到它。';
  const noticed=document.createElement('details'), noticedHeading=document.createElement('summary'), waiting=document.createElement('div');
  waiting.id='feeding-noticed';noticed.hidden=true;noticed.append(noticedHeading,waiting);
  const selectedNote=document.createElement('p');
  selectedNote.id='feeding-selected';selectedNote.hidden=true;
  details.append(title, selectedNote, status, list, noticed, help); document.getElementById('care').after(details);
  const history = document.createElement('details'), heading = document.createElement('summary');
  const visitors = document.createElement('div'), note = document.createElement('p');
  const search = document.createElement('input'), noMatch = document.createElement('p');
  search.type='search'; search.id='feeding-visitor-search'; search.placeholder='找名字、花色或去向';
  search.setAttribute('aria-label','搜索最近加餐的虾'); search.setAttribute('aria-controls','feeding-visitors');
  noMatch.textContent='没有匹配的虾，清除或更换搜索词再试。'; noMatch.hidden=true; noMatch.setAttribute('role','status');
  history.id = 'feeding-history'; history.hidden = true; visitors.id = 'feeding-visitors';
  history.append(heading, note, search, visitors, noMatch); details.after(history);
  function filterVisitors() {
    let count=0;
    for (const button of visitors.children) {
      button.hidden=!matchesShrimpSearch(search.value,button.textContent,button.dataset.id);
      if (!button.hidden) count++;
    }
    noMatch.hidden=count>0 || !search.value.trim();
  }
  search.oninput=filterVisitors;
  function updateHistory(colony) {
    if (document.getElementById('care-pop').hidden) return;
    const ids = colony?.lastFeeding;
    history.hidden = !ids;
    search.hidden=!ids || ids.length<2;
    if (search.hidden) search.value='';
    if (!ids) { visitors.replaceChildren(); noMatch.hidden=true; return; }
    const label = `本缸最近一次加餐 · ${ids.length === 50 ? '已记录 50 只' : ids.length + ' 只来过'}`;
    if (heading.textContent !== label) heading.textContent = label;
    const explanation = ids.length ? '这些虾曾在投喂点附近吃过饲料或生物膜。点名字可以查看它。' : '还没有观察到在投喂点附近摄食的虾。';
    if (note.textContent !== explanation) note.textContent = explanation;
    const entries=ids.map(id=>describeVisitor(id,colony)), names=new Set(), duplicates=new Set();
    for (const {name} of entries) {
      if (names.has(name)) duplicates.add(name);
      names.add(name);
    }
    const buttons=new Map([...visitors.children].map(b=>[b.dataset.id,b]));
    const focused=document.activeElement;
    for (const [id,button] of buttons) if (!ids.includes(id)) button.remove();
    for (const [index, id] of ids.entries()) {
      const entry = entries[index];
      let button = buttons.get(id);
      if (!button) {
        button = document.createElement('button'); button.type = 'button';
        button.dataset.id = id;
        button.onclick = () => visitShrimp(id);
      }
      if (visitors.children[index]!==button) visitors.insertBefore(button,visitors.children[index] || null);
      const label = [entry.name,entry.appearance,entry.where,duplicates.has(entry.name) && mealNumber(id,ids)].filter(Boolean).join(' · ');
      if (button.textContent !== label) button.textContent = label;
      button.disabled = !entry.available;
    }
    filterVisitors();
    if (buttons.get(focused?.dataset.id)===focused && document.activeElement!==focused)
      (focused.isConnected && !focused.hidden && !focused.disabled ? focused : heading).focus({preventScroll:true});
  }
  const screen = new Vector3(), header = document.querySelector('header'); let model = null, signature = '', paused = false;
  let selectedId, selectedName='', lastVisitors;
  function individualStatus(id, visitors) {
    if (!model) return '';
    if (model.sinking) return paused?'饲料暂停在水中':'饲料还在下沉';
    if (model.eaters.some(person=>person.id===id)) return paused?'暂停前在投喂点附近摄食':'正在投喂点附近摄食';
    if (visitors?.includes(id)) return '这次在投喂点附近吃过';
    if (model.waiting.some(person=>person.id===id)) return '已发现这次加餐，还没见它吃';
    return '还没见它发现这次加餐';
  }
  function paint() {
    const observation=model && selectedName ? selectedName+' · '+individualStatus(selectedId,lastVisitors) : '';
    if(selectedNote.textContent!==observation)selectedNote.textContent=observation;
    selectedNote.hidden=!observation;
    const next = JSON.stringify([model, paused]); if (next === signature) return; signature = next;
    if (!model) return;
    let state = '等待虾自行发现';
    if (paused) state = '已暂停';
    else if (model.sinking) state = '饲料下沉中';
    else if (model.eaters.length) state = `${model.eaters.length} 只在附近摄食`;
    else if (model.visitors) state = `已有 ${model.visitors} 只来过`;
    else if (model.discovered) state = '已有虾发现 · 还没观察到摄食';
    else if (model.empty) state = '本缸暂无虾';
    chip.textContent = `投喂点 · ${state}`; marker.textContent = model.sinking ? '投喂点 · 下沉中' : '投喂点';
    if (paused) marker.textContent = '投喂点 · 已暂停';
    status.textContent = `${state} · 附近食物${model.food}${paused ? '（暂停前状态）' : ''}`;
    const focused=document.activeElement, focusedId=focused?.dataset.id;
    noticed.hidden=!model.waiting.length;
    noticedHeading.textContent=`已发现投喂点，尚未记录到摄食 · ${model.waiting.length} 只`;
    const all=[...model.eaters,...model.waiting], ids=all.map(e=>e.id), names=new Set(), duplicates=new Set();
    for (const {name} of all) {
      if (names.has(name)) duplicates.add(name);
      names.add(name);
    }
    const buttons=new Map([...list.children,...waiting.children].map(b=>[b.dataset.id,b]));
    for (const [id,button] of buttons) if (!ids.includes(id)) button.remove();
    function place(person,index,container) {
      let button = buttons.get(person.id);
      if (!button) {
        button = document.createElement('button'); button.type = 'button';
        button.dataset.id = person.id;
        button.onclick = () => focusShrimp(person.id);
      }
      const label = duplicates.has(person.name) ? person.name+' · '+mealNumber(person.id,ids) : person.name;
      if (button.textContent !== label) { button.textContent = label; button.title = '找到 '+label; }
      if (container.children[index] !== button) container.insertBefore(button,container.children[index] || null);
    }
    model.eaters.forEach((r,i)=>place(r,i,list));
    model.waiting.forEach((r,i)=>place(r,i,waiting));
    if(focusedId && buttons.get(focusedId)===focused && document.activeElement!==focused){
      (focused.getClientRects().length ? focused : title).focus({preventScroll:true});
    }
  }
  return {
    showMeal,
    showHistory(id) {
      if (document.getElementById('care-pop').hidden) document.getElementById('care-chip').click();
      if (history.hidden) return;
      history.open = true;
      search.value=''; filterVisitors();
      const visitor = [...visitors.children].find(button=>button.dataset.id===id);
      (visitor || heading).focus();
    },
    individualStatus,
    update(world, colony, id) {
      model=feedingSummary(world,colony);
      selectedId=id;
      selectedName='';
      if(model && world.agentsById.has(id)){
        selectedName=colony.shrimp[id]?.name || '未命名的虾';
        const ids=[...world.agentsById.keys()];
        if(ids.some(other=>other!==id && (colony.shrimp[other]?.name || '未命名的虾')===selectedName))
          selectedName+=' · '+mealNumber(id,ids);
      }
      lastVisitors=colony.lastFeeding;
      paint();updateHistory(colony);
    },
    render(mesh, visible, isPaused) {
      if (paused !== isPaused) { paused = isPaused; paint(); }
      const hidden = !model || !visible || !mesh.visible || document.hidden;
      if(chip.hidden!==hidden)chip.hidden=hidden;
      if(details.hidden!==hidden)details.hidden=hidden;
      if (hidden) { if(!marker.hidden)marker.hidden=true; return; }
      mesh.getWorldPosition(screen).project(camera);
      const x = (screen.x + 1) * innerWidth / 2, y = (1 - screen.y) * innerHeight / 2;
      const outside = screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > .95 || Math.abs(screen.y) > .9
        || y < header.getBoundingClientRect().bottom + 48 || y > innerHeight - 90;
      if(marker.hidden!==outside)marker.hidden=outside;
      if (!marker.hidden) {
        marker.style.left = `${x}px`;
        marker.style.top = `${y}px`;
      }
    },
  };
}
