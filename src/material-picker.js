import {FLORA_CATALOG} from './flora.js';
import {UNITY_PLANT_LABELS} from './plant-names.js';

export const PLANT_STOCK = [
  ...UNITY_PLANT_LABELS.map((label,i)=>({id:String(i),label,host:false})),
  ...FLORA_CATALOG,
].map(e=>({...e,image:`/assets/thumbnails/plant-${e.id.replaceAll(':','-')}.jpg`}));

export function hardscapeStock(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (e.species !== -1 || e.legacy || e.retired || !e.baseKey) continue;
    if (!groups.has(e.baseKey)) groups.set(e.baseKey, {key:e.baseKey, name:e.name.split('·')[0].trim(), wood:e.wood, sizes:[]});
    groups.get(e.baseKey).sizes.push(e);
  }
  return [...groups.values()];
}

// Sampling only chooses catalogue stock; it never clones IDs, growth or host links.
export function materialForRecord(tank, id, entries, definitions) {
  const stone = tank.Hardscape.find(r=>r.UniqueId===id);
  if (stone) {
    const entry = entries.find(e=>e.key===stone.TypeId && e.baseKey && !e.legacy && !e.retired);
    return entry ? {tool:'stone',value:entry.key,label:entry.name} : null;
  }
  const native = tank.Plants.find(r=>r.UniqueId===id);
  const flora = tank.Flora?.find(r=>r.UniqueId===id);
  const value = native ? String(definitions.findIndex(d=>d.TypeId===native.TypeId)) : flora ? `flora:${flora.Species}:${flora.Variant}` : null;
  const entry = PLANT_STOCK.find(p=>p.id===value);
  return entry ? {tool:'plant',value:entry.id,label:entry.label} : null;
}

export function createMaterialPicker(entries, onFinish, {onRepeat,onMove,onPrune,definitions=[]} = {}) {
  const $ = id => document.getElementById(id), soil = $('soil-kind'), stone = $('stone-kind'), plant = $('plant-kind');
  const stocks = hardscapeStock(entries), remembered = new Map();
  let state = null, collapsed = false;
  const recent = new Map();
  const bar = document.createElement('section'); bar.id = 'current-tool'; bar.setAttribute('aria-label','当前造景工具');
  bar.innerHTML = '<p id="current-tool-name" role="status"></p><p id="current-tool-count"></p><div class="pair"><button id="material-toggle" type="button">收起目录</button><button id="tool-finish" type="button">结束操作</button></div>';
  $('setup-tools').prepend(bar);
  const repeat = document.createElement('button'); repeat.id='material-repeat'; repeat.type='button'; repeat.hidden=true;
  repeat.onclick=()=>{if(state?.repeat && !state.busy)onRepeat?.(state.repeat);}; const actions=document.createElement('div');actions.id='object-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label','选中物体操作');actions.hidden=true;
  const move=document.createElement('button');move.id='object-move';move.type='button';move.textContent='移动';move.onclick=onMove;
  const prune=document.createElement('button');prune.id='object-prune';prune.type='button';prune.textContent='修剪这株';prune.onclick=onPrune;
  actions.append(move,prune,repeat,$('object-delete'),$('object-left').parentElement,$('object-tilt-left').parentElement);$('current-tool-count').after(actions);
  const instructions=document.createElement('p'); instructions.id='current-tool-help'; instructions.className='hint'; bar.append(instructions);
  const recentShelf=document.createElement('div'); recentShelf.id='recent-materials'; recentShelf.setAttribute('aria-label','最近选用'); bar.append(recentShelf);
  const toggle = $('material-toggle'), finish = $('tool-finish');
  toggle.onclick = () => { collapsed = !collapsed; paintVisibility(); };
  finish.onclick = onFinish;
  function section(select, title) {
    const node = document.createElement('section'); node.className = 'material-picker';
    const heading = document.createElement('h3'); heading.textContent = title; node.append(heading);
    select.parentElement.after(node); return node;
  }
  function button(parent, text, action, image) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed','false');
    if (image) { const img = document.createElement('img'); img.src = image; img.alt = ''; img.onerror = ()=>{img.hidden=true;}; b.append(img); }
    const label = document.createElement('span'); label.textContent = text; b.append(label);
    b.onclick = action; parent.append(b); return b;
  }
  function choose(select, value, close = true) {
    select.value = value; select.dispatchEvent(new Event('change')); paint();
    if (select.value!==value) {
      collapsed=false; paintVisibility();
      return;
    }
    if (close) {
      recent.set(select.id,[value,...(recent.get(select.id)||[]).filter(v=>v!==value)].slice(0,4));
      collapsed = true; paintVisibility(); toggle.focus(); $('setup-tools').scrollTop=0;
    }
  }
  const soils = section(soil,'底床材料'); soils.id = 'soil-cards';
  for (const option of soil.options) {
    const b = button(soils,option.text,()=>choose(soil,option.value),`/assets/thumbnails/soil-${option.value}.png`);
    b.dataset.value = option.value;
  }
  const shelf = section(stone,'挑选木石'); shelf.id = 'hardscape-cards';
  const tabs = document.createElement('div'); tabs.className = 'pair'; shelf.append(tabs);
  const grid = document.createElement('div'); grid.className = 'material-grid'; shelf.append(grid);
  const sizes = document.createElement('div'); sizes.className = 'material-sizes'; shelf.append(sizes);
  const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '固定规格 · 左键释放后下落、倾倒，落稳后保存'; shelf.append(hint);
  function current() { return stocks.find(s=>s.sizes.some(e=>e.key===stone.value)) || stocks[0]; }
  function pickStock(stock, close = true) {
    const index = current().sizes.findIndex(e=>e.key===stone.value);
    choose(stone,stock.sizes[Math.max(0,Math.min(index,stock.sizes.length-1))].key,close);
  }
  for (const [wood,label] of [[true,'沉木'],[false,'岩石']]) {
    const b = button(tabs,label,()=>pickStock(remembered.get(wood)||stocks.find(s=>s.wood===wood),false)); b.dataset.wood = String(wood);
  }
  for (const stock of stocks) {
    const b = button(grid,stock.name,()=>pickStock(stock),`/assets/thumbnails/${stock.key}.jpg`); b.dataset.key = stock.key;
  }
  for (const [index,label] of ['小号','中号','大号'].entries()) button(sizes,label,()=>choose(stone,current().sizes[index].key));
  const plants = section(plant,'挑选水草'); plants.id = 'plant-cards';
  const plantTabs = document.createElement('div'); plantTabs.className = 'pair'; plants.append(plantTabs);
  const plantHint = document.createElement('p'); plantHint.className = 'hint'; plantHint.setAttribute('role','status'); plants.append(plantHint);
  const plantGrid = document.createElement('div'); plantGrid.className = 'material-grid'; plants.append(plantGrid);
  const plantRemembered = new Map();
  for (const [host,label] of [[false,'地栽 · 底床'],[true,'附生 · 木石']]) {
    const b = button(plantTabs,label,()=>{choose(plant,plantRemembered.get(host)||PLANT_STOCK.find(p=>p.host===host).id,false);plantGrid.querySelector('[aria-pressed="true"]').scrollIntoView({block:'nearest'});}); b.dataset.host = String(host);
  }
  for (const item of PLANT_STOCK) {
    const b = button(plantGrid,item.label,()=>choose(plant,item.id),item.image); b.dataset.value = item.id; b.dataset.host = String(item.host);
    b.title = `${item.label} · ${item.host?'附在木石表面':'种在底床上'}`;
  }
  function paint() {
    const stock = current(); remembered.set(stock.wood,stock);
    for (const b of soils.querySelectorAll('button')) b.setAttribute('aria-pressed',String(b.dataset.value===soil.value));
    for (const b of tabs.children) b.setAttribute('aria-pressed',String(b.dataset.wood===String(stock.wood)));
    for (const b of grid.children) { b.hidden = stocks.find(s=>s.key===b.dataset.key).wood!==stock.wood; b.setAttribute('aria-pressed',String(b.dataset.key===stock.key)); }
    [...sizes.children].forEach((b,i)=>{b.setAttribute('aria-pressed',String(stock.sizes[i]?.key===stone.value));});
    const chosen = PLANT_STOCK.find(p=>p.id===plant.value);
    plantRemembered.set(chosen.host,chosen.id);
    for (const b of plantTabs.children) b.setAttribute('aria-pressed',String(b.dataset.host===String(chosen.host)));
    for (const b of plantGrid.children) { b.hidden = b.dataset.host!==String(chosen.host); b.setAttribute('aria-pressed',String(b.dataset.value===chosen.id)); }
    plantHint.textContent = `已选：${chosen.label} · ${chosen.host?'附在木石上':'种在底床上'}`;
    plants.title = '图片为株形示意，非等比例；实际大小看缸内预览。';
  }
  stone.addEventListener('change',paint); soil.addEventListener('change',paint); plant.addEventListener('change',paint);
  function paintVisibility() {
    if (!state) return;
    const {editing,tool,busy,tank,selected,moving} = state;
    const soilTool = ['pour','return','push','pull','finish','level'].includes(tool);
    const catalog = soilTool ? soils : tool === 'stone' ? shelf : tool === 'plant' ? plants : null;
    bar.hidden = !editing;
    for (const node of [soils,shelf,plants]) node.hidden = !editing || node !== catalog || collapsed;
    toggle.hidden = !catalog; toggle.disabled = finish.disabled = busy;
    toggle.textContent = collapsed ? '更换材料' : '收起目录';
    toggle.setAttribute('aria-expanded',String(!!catalog && !collapsed));
    if (catalog) toggle.setAttribute('aria-controls',catalog.id); else toggle.removeAttribute('aria-controls');
    finish.hidden = tool === 'select' && !selected;
    actions.hidden=!editing||tool!=='select'||!selected||moving;move.disabled=busy;
    const pruning=tool==='prune-selected';
    prune.hidden=!onPrune||!selected||tank.Hardscape.some(p=>p.UniqueId===selected)||(!tank.Setup.Filled&&tank.Setup.PreparationStep!==2);
    prune.disabled=busy;
    finish.textContent = pruning ? '结束修剪' : tool === 'plant' ? '结束种植' : tool === 'stone' ? '结束放置' : selected ? moving?'取消移动':'取消选择' : '结束操作';
    const label = {pour:'正在铺土',return:'正在回收',push:'正在推土',pull:'正在拉土',finish:'正在细整',level:'正在整平',stone:'正在放置',plant:'正在种植',prune:'正在修剪',select:selected?moving?'正在移动':'已选中':'选择物体'}[tool];
    const select = soilTool ? soil : tool === 'stone' ? stone : tool === 'plant' ? plant : null;
    const sampled = selected ? materialForRecord(tank,selected,entries,definitions) : null;
    state.repeat=sampled;
    repeat.hidden=!editing || !sampled || !onRepeat;
    repeat.disabled=busy || (!!sampled && !tank.Setup.Filled && tank.Setup.PreparationStep!==(sampled.tool==='stone'?1:2));
    repeat.textContent=sampled ? '再放同款' : '';
    repeat.title=repeat.disabled&&!busy?`请先切换到「${sampled?.tool==='stone'?'摆木石':'种水草'}」，再选择同款`:'只选取同款材料，点击新位置后才添加';
    instructions.textContent=pruning ? '点击这株水草要剪的位置。右键单击或 Esc 结束修剪。' : tool==='stone' ? '左键释放，落稳后保存；右键单击 / Esc 结束放置。' : tool==='plant' ? '绿色时左键种植，可连续放置；右键单击 / Esc 结束。' : selected ? moving?'左键确认新位置；右键 / Esc 取消移动，保留原物体。':'选择下方操作；单击其他物体可切换，点击空处取消选择。' : tool==='select' ? '单击木石或水草只选中，点击「移动」才开始搬动。' : soilTool ? '按住左键拖动；松开保存这一笔，Esc 取消当前笔划。' : '点击需要修剪的位置；可撤销。';
    recentShelf.replaceChildren();
    const values=select ? recent.get(select.id)||[] : [];
    recentShelf.hidden=!editing || values.length<2;
    if(values.length>=2){
      const caption=document.createElement('p');caption.className='hint';caption.textContent='最近选用';recentShelf.append(caption);
      const row=document.createElement('div');row.className='recent-material-grid';recentShelf.append(row);
      for(const value of values){
        const option=[...select.options].find(o=>o.value===value);if(!option)continue;
        const stock=select===stone?stocks.find(s=>s.sizes.some(e=>e.key===value)):null;
        const picture=select===soil?`/assets/thumbnails/soil-${value}.png`:select===plant?PLANT_STOCK.find(p=>p.id===value)?.image:`/assets/thumbnails/${stock?.key}.jpg`;
        const b=button(row,option.textContent,()=>choose(select,value),picture);b.disabled=busy;b.title=option.textContent;b.dataset.value=value;b.setAttribute('aria-pressed',String(select.value===value));
      }
    }
    const surface = tool === 'plant' ? (PLANT_STOCK.find(p=>p.id===plant.value).host ? ' · 附在木石上' : ' · 种在底床上') : '';
    $('current-tool-name').textContent = pruning ? '正在修剪 · '+state.selectionName : tool==='select'&&selected ? `${moving?'正在移动':'已选'}：${state.selectionName||sampled?.label||'物体'}` : label + (select ? ` · ${select.selectedOptions[0].textContent}` : sampled ? ` · ${sampled.label}` : '') + surface;
    $('current-tool-count').textContent = `${tank.Hardscape.length} 件木石 · ${tank.Plants.length+(tank.Flora?.length||0)} 株水草`;
    $('build-guide').classList.toggle('catalog-compact',!catalog || collapsed);
  }
  return {choose(tool,value){choose(tool==='stone'?stone:plant,value);},update(next) {
    if (!state || state.tool !== next.tool || state.editing !== next.editing || state.step !== next.tank.Setup.PreparationStep) collapsed = false;
    state = {...next,step:next.tank.Setup.PreparationStep};
    soil.parentElement.hidden = stone.parentElement.hidden = plant.parentElement.hidden = true;
    for (const node of [soils,shelf,plants]) for (const b of node.querySelectorAll('button')) b.disabled = next.busy;
    paint(); paintVisibility();
  }};
}
