import {shopCatalogue, batchTankId, naturalPair} from './crystal-breeding.js';
import {commissionCatalogue} from './crystal-progress.js';
import {scoreShrimp} from './crystal-genetics.js';
import {createCrystalPortraits} from './crystal-portraits.js';

const ICONS = {
  roster:'M4 4h6c2 0 2 1 2 1s0-1 2-1h6v15h-6c-2 0-2 1-2 1s0-1-2-1H4z M12 5v15 M7 8h2 M15 8h2',
  breed:'M7 3v5m10-5v5M4 8h6v5a3 3 0 0 1-6 0zM14 8h6v5a3 3 0 0 1-6 0zM7 16v4h10v-4',
  contest:'M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v5m-4 1h8',
  feed:'m5 4 6-2 5 13-6 2zM16 18v1m4-3v1m-2 4v1',
  scene:'M3 20h18M5 19l4-10 5 10m-1-4 4-8 4 12M5 7V3m-2 2h4',
  keep:'M5 3h12l3 3v15H4V3zM8 3v6h8V3M8 21v-7h8v7',
  observe:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  home:'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',
};
function toolIcon(control, name) {
  control.classList.add('crystal-tool');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${ICONS[name]}" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  control.style.setProperty('--tool-icon', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
}

const TANK_LABELS = {main:'我的造景缸', breeding:'繁育缸', 'breeding-2':'第二繁育缸', 'breeding-3':'第三繁育缸'};
const RATINGS = {gold:'金级', silver:'银级', bronze:'铜级', participation:'成长级'};
const STAGES = {planned:'配对准备', formed:'已抱卵', hatched:'幼虾成长', complete:'已成年', cancelled:'已取消'};
const live = record => record.soldAt === null;
const tankName = id => TANK_LABELS[id] || id || '已售档案';
const nameOf = record => record?.name?.trim() || (record ? `水晶虾 · ${record.id.slice(-8)}` : '未选择');
const sexName = sex => sex === 'female' ? '母虾' : '公虾';
const appearance = record => record.legacy ? (record.species === 'red-cherry-shrimp' ? '原有樱花虾 · 观赏' : '原有虾 · 观赏') : [({red:'红晶', black:'黑晶'})[record.colour], ({band:'条带纹', hinomaru:'日之丸纹', mosura:'白头纹'})[record.pattern]].filter(Boolean).join(' · ');
const quality = value => Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, '') : '—';
const contestName = card => `${card.theme === 'colour' ? '颜色' : '纹样'} · ${card.tier === 'entry' ? '入门赛' : '进阶赛'}`;
function timeLeft(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (!seconds) return '正在结算';
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return hours ? `${hours}小时${minutes}分` : minutes ? `${minutes}分${seconds % 60}秒` : `${seconds}秒`;
}
function node(tag, className = '', text = '') {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}
function text(element, value) { if (element.textContent !== value) element.textContent = value; }
function button(label, action, className = '') {
  const result = node('button', className, label); result.type = 'button';
  if (action) result.addEventListener('click', action);
  return result;
}
function field(label, control) { const result = node('label', 'crystal-field'); result.append(node('span', '', label), control); return result; }
function select(id) { const result = node('select'); result.id = id; return result; }
function options(control, entries, placeholder) {
  const list = placeholder ? [{value:'', label:placeholder}, ...entries] : entries;
  const signature = JSON.stringify(list);
  if (control.dataset.options === signature) return;
  const previous = control.value;
  control.replaceChildren(...list.map(item => {
    const option = node('option', '', item.label); option.value = item.value; return option;
  }));
  if (list.some(item => item.value === previous)) control.value = previous;
  control.dataset.options = signature;
}
function locked(state, id) {
  return state.batches.some(batch => !['complete', 'cancelled'].includes(batch.status) && (batch.motherId === id || batch.status === 'planned' && batch.fatherId === id));
}
function globalFree(state) { return 50 - state.individuals.filter(live).length - state.batches.filter(b => ['planned','formed'].includes(b.status)).reduce((sum,b) => sum + b.size, 0); }
function counts(state, tankId) {
  const animals = state.individuals.filter(record => live(record) && record.tank === tankId).length;
  const reserved = state.batches.filter(batch => batchTankId(batch) === tankId && ['planned', 'formed'].includes(batch.status)).reduce((sum, batch) => sum + batch.size, 0);
  return {animals, reserved};
}

// UI only: all persistence, time advancement and world mutations belong to the bridge.
export function createCrystalPanel({getState, getActiveTank, getSelected = () => null, aq, onSelect = () => {}, onAction, onSwitch, onStart, onFocus, isFilled = () => true}) {
  const dock = document.getElementById('dock-bar');
  if (!dock) throw new Error('养成面板缺少操作栏');
  let busy = false, disposed = false, selectedId = null, detailId = null, sellId = null, commissionChoice = null, activePage = 'roster';
  const drafts = new Map(), rosterRows = new Map(), batchRows = new Map(), tankButtons = new Map();
  const portraits = aq ? createCrystalPortraits(aq) : null;
  let returnFocus = null;
  const panel = node('section', 'crystal-panel'); panel.id = 'crystal-panel'; panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'crystal-panel-title'); panel.setAttribute('aria-label', '水晶虾养成');
  const dockButton = button('虾册', () => { showPage('roster'); setOpen(panel.hidden); }); dockButton.id = 'crystal-open'; toolIcon(dockButton, 'roster');
  dockButton.setAttribute('aria-controls', panel.id); dockButton.setAttribute('aria-expanded', 'false');
  const head = node('div', 'crystal-head'), title = node('h2', '', '水晶虾养成'); title.id = 'crystal-panel-title';
  const close = button('回到缸边', () => setOpen(false), 'crystal-close'); close.dataset.keepEnabled = 'true';
  head.append(title, close);
  const feedback = node('p', 'crystal-feedback'); feedback.id = 'crystal-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const intro = node('div', 'crystal-intro');
  intro.append(node('p', 'crystal-lead', '虾册尚未就绪'), node('p', 'crystal-muted', '如果旧档兼容没有完成，原存档仍然保留。请从存档面板恢复有效进度。'));
  const start = button('领养第一批水晶虾 · 7 只', () => run(onStart, '7 只水晶虾已经进入你搭的主缸。'), 'crystal-primary'); start.id = 'crystal-start';
  const starter = node('section', 'crystal-intro'), starterHint = node('p', 'crystal-muted'); starter.append(starterHint, start);
  const game = node('div', 'crystal-game'), summary = node('div', 'crystal-summary'), funds = node('strong'), total = node('span');
  funds.id = 'crystal-funds'; total.id = 'crystal-capacity'; summary.append(funds, total);
  const currentRoom = node('p', 'crystal-current-room'); currentRoom.id = 'crystal-current-room';
  const tanks = node('div', 'crystal-tanks'); tanks.setAttribute('aria-label', '当前观察的鱼缸');
  const nextStep = node('p', 'crystal-next');
  const tabs = node('div', 'crystal-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '养成内容');
  const pages = {}, tabButtons = {};
  for (const [id, label] of [['roster', '虾册'], ['breed', '选育'], ['market', '买虾 / 扩缸'], ['contest', '比赛']]) {
    const tab = button(label, () => showPage(id)); tab.id = `crystal-tab-${id}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `crystal-page-${id}`);
    const page = node('div', 'crystal-page'); page.id = `crystal-page-${id}`; page.setAttribute('role', 'tabpanel'); page.setAttribute('aria-labelledby', tab.id);
    tabs.append(tab); pages[id] = page; tabButtons[id] = tab;
  }
  const hud = node('section', 'crystal-hud'); hud.id = 'crystal-hud'; hud.hidden = true; hud.setAttribute('aria-label', '缸边状态');
  const hudTitle = node('h1', '', '我的虾缸'), care = button('查看虾群状态', () => document.getElementById('care-chip')?.click(), 'crystal-care');
  care.id = 'crystal-care';
  hud.append(hudTitle, currentRoom, summary, care, tanks);
  const activity = button('', () => { showPage(getState()?.starterPending ? 'roster' : 'breed'); setOpen(true); }, 'crystal-activity'); activity.id = 'crystal-activity'; activity.hidden = true;
  activity.append(nextStep);
  const shortcuts = [['breed', '选育'], ['contest', '比赛']].map(([id, label]) => {
    const control = button(label, () => { showPage(id); setOpen(true); }); control.id = `crystal-shortcut-${id}`; toolIcon(control, id); dock.append(control); return control;
  });
  for (const [selector, icon] of [['#feed','feed'], ['[data-dock="scene"]','scene'], ['[data-dock="keep"]','keep'], ['[data-dock="observe"]','observe'], ['#quiet-watch','observe'], ['#reset','home']]) {
    const control = dock.querySelector(selector); if (control) toolIcon(control, icon);
  }
  game.append(starter, tabs, ...Object.values(pages));
  panel.append(head, feedback, intro, game); dock.append(dockButton); document.body.append(panel);
  document.body.append(hud, activity);

  const filter = select('crystal-roster-filter'); options(filter, [{value:'live', label:'全部虾'}, {value:'current', label:'当前鱼缸'}, {value:'favorites', label:'我的收藏'}, {value:'juvenile', label:'成长中的幼虾'}, {value:'sold', label:'已售档案'}]);
  const search = node('input', 'crystal-search'); search.type = 'search'; search.id = 'crystal-search'; search.placeholder = '找名字、颜色或纹样'; search.setAttribute('aria-label', '搜索虾册');
  const rosterCount = node('span', 'crystal-roster-count'), rosterHeader = node('div', 'crystal-roster-header'); rosterHeader.append(field('查看', filter), search, rosterCount);
  const roster = node('div', 'crystal-roster'); roster.id = 'crystal-roster'; roster.setAttribute('aria-label', '按身份选择一只虾');
  const rosterEmpty = node('p', 'crystal-empty');
  const detail = node('section', 'crystal-detail'); detail.id = 'crystal-individual';
  const detailTitle = node('h3'), identity = node('p', 'crystal-id'), description = node('p', 'crystal-muted'), ancestry = node('p', 'crystal-muted');
  const hero = node('img', 'crystal-portrait crystal-hero'); hero.width = 384; hero.height = 224; hero.alt = ''; hero.hidden = true;
  const heroCaption = node('p', 'crystal-portrait-status', '正在准备个体影像…');
  const specimen = node('div', 'crystal-specimen'); specimen.append(hero, heroCaption);
  const selectionBadge = node('p', 'crystal-selected-label', '正在查看');
  const nameInput = node('input'); nameInput.id = 'crystal-name'; nameInput.type = 'text'; nameInput.maxLength = 32; nameInput.autocomplete = 'off'; nameInput.placeholder = '给它起一个名字';
  const rename = button('保存名字', async () => {
    const id = selectedId, name = nameInput.value.trim();
    if (!name || [...name].length > 16) { announce('名字请填写 1–16 个字。', true); nameInput.focus(); return; }
    await run(async () => { await onAction({type:'rename', id, name}); drafts.delete(id); }, '名字已保存。');
  }); rename.id = 'crystal-rename';
  nameInput.addEventListener('input', () => { if (selectedId) drafts.set(selectedId, nameInput.value); });
  nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); rename.click(); } });
  const naming = node('div', 'crystal-row'); naming.append(field('名字', nameInput), rename);
  const stats = node('div', 'crystal-quality'); const statFields = ['颜色', '覆盖', '边缘'].map(label => {
    const item = node('div'), meter = node('meter'), value = node('strong'); meter.min = 1; meter.max = 9; meter.setAttribute('aria-label', label);
    item.append(node('span', '', label), meter, value); stats.append(item); return {meter, value};
  });
  const juvenile = node('p', 'crystal-growing'), stateHint = node('p', 'crystal-muted');
  const focus = button('在缸中找到它', async () => {
    const record = getState()?.individuals.find(item => item.id === selectedId); if (!record) return;
    await run(async () => {
      if (getActiveTank() !== record.tank) await onSwitch(record.tank);
      const found = await onFocus(record.id); if (found === false) throw new Error('这只虾暂时不在当前画面，请稍后再试。');
      setOpen(false);
    }, `已找到${nameOf(record)}。`);
  }); focus.id = 'crystal-focus';
  const protect = button('收藏并保护', () => { const record = getState()?.individuals.find(item => item.id === selectedId); if (record) run(() => onAction({type:'protect', id:record.id, value:!record.protected}), record.protected ? '已取消收藏保护。' : '已收藏；出售前需要先解除保护。'); }); protect.id = 'crystal-protect';
  const detailActions = node('div', 'crystal-row'); detailActions.append(focus, protect);
  const moveTank = select('crystal-move-tank'), move = button('移入目标缸', () => run(() => onAction({type:'move', id:selectedId, tankId:moveTank.value}), '已移缸。')); move.id = 'crystal-move';
  const transfer = node('div', 'crystal-row'); transfer.append(field('移缸去向', moveTank), move);
  const moveHint = node('p', 'crystal-muted');
  const sell = button('出售这只 · +8', () => { sellId = selectedId; update(); sellCancel.focus(); }, 'crystal-danger'); sell.id = 'crystal-sell';
  const saleConfirm = node('div', 'crystal-confirm'); saleConfirm.hidden = true; saleConfirm.setAttribute('role', 'group'); saleConfirm.setAttribute('aria-label', '出售确认');
  const saleText = node('p'), sellCancel = button('留下它', () => { sellId = null; update(); sell.focus(); });
  const sellConfirm = button('确认出售这只', async () => {
    const id = sellId; if (!id || id !== selectedId) return;
    await run(async () => { await onAction({type:'sell', id}); sellId = null; filter.value = 'sold'; }, '已出售，个体和亲代记录保留在已售档案。');
  }, 'crystal-danger'); sellConfirm.id = 'crystal-sell-confirm';
  const saleButtons = node('div', 'crystal-row'); saleButtons.append(sellCancel, sellConfirm); saleConfirm.append(saleText, saleButtons);
  const records = node('details', 'crystal-records'); records.id = 'crystal-records';
  records.append(node('summary', '', '名字、家系与移缸'), naming, ancestry, identity, transfer, moveHint, sell, saleConfirm);
  detail.append(selectionBadge, detailTitle, description, specimen, detailActions, stats, juvenile, stateHint, records);
  const shelf = node('div', 'crystal-shelf'); shelf.append(rosterHeader, roster, rosterEmpty);
  pages.roster.append(shelf, detail);
  const inspect = button('', () => { showPage('roster'); filter.value = 'live'; search.value = ''; setOpen(true); }, 'crystal-inspect'); inspect.id = 'crystal-inspect'; inspect.hidden = true;
  const inspectImage = node('img', 'crystal-portrait'), inspectCopy = node('span'), inspectName = node('strong'), inspectHint = node('span'); inspectImage.alt = ''; inspectImage.width = 144; inspectImage.height = 84;
  inspectCopy.append(inspectName, inspectHint); inspect.append(inspectImage, inspectCopy); document.body.append(inspect);
  const filterChanged = () => { sellId = null; update(); };
  filter.addEventListener('change', filterChanged); search.addEventListener('input', filterChanged); moveTank.addEventListener('change', update);

  const mother = select('crystal-mother'), father = select('crystal-father'), breedingTank = select('crystal-breeding-tank'), broodSize = select('crystal-brood-size');
  options(broodSize, [{value:'2', label:'小窝 · 2 只'}, {value:'4', label:'标准窝 · 4 只'}]);
  const parents = node('div', 'crystal-row'); parents.append(field('母虾', mother), field('公虾', father));
  const parentQuality = node('p', 'crystal-parent-quality');
  const brood = node('div', 'crystal-row'); brood.append(field('繁育位置', breedingTank), field('这一窝', broodSize));
  const planSummary = node('p', 'crystal-plan-summary'); planSummary.id = 'crystal-plan-summary';
  const plan = button('确认配对并预留位置', () => run(() => onAction({type:'plan', motherId:mother.value, fatherId:father.value, tankId:breedingTank.value, size:Number(broodSize.value)}), '计划已保存。配对形成后，这一窝的后代结果就会固定。'), 'crystal-primary'); plan.id = 'crystal-plan';
  const batchList = node('div', 'crystal-batches'); batchList.id = 'crystal-batches';
  const batchEmpty = node('p', 'crystal-empty', '还没有安排后代。先选一对亲虾，试一窝小的。');
  const natural = node('details', 'crystal-natural'), naturalSize = select('crystal-natural-size'); options(naturalSize, [{value:'2', label:'小窝 · 2 只'}, {value:'4', label:'标准窝 · 4 只'}]);
  const naturalSummary = node('p', 'crystal-plan-summary'); naturalSummary.id = 'crystal-natural-summary';
  const naturalPlan = button('确认主缸繁殖这一窝', () => run(() => onAction({type:'natural', size:Number(naturalSize.value)}), '主缸已安排一窝，自然选择的亲虾和预留位置已保存。')); naturalPlan.id = 'crystal-natural-plan';
  natural.append(node('summary', '', '也可以让主缸自然繁殖一窝'), node('p', 'crystal-muted', '主缸会从成年且空闲的虾里选一对，不搬动亲虾。这次只安排一窝，之后不会自动续生。'), field('主缸这一窝', naturalSize), naturalSummary, naturalPlan); naturalSize.addEventListener('change', update);
  pages.breed.append(node('h3', '', '为下一窝选亲虾'), node('p', 'crystal-muted', '比较成年品质，试着让一方补足另一方。后代有变化，不保证每一只都更好。'), parents, parentQuality, brood, planSummary, plan, node('p', 'crystal-muted', '公虾在配对形成后可再安排；母虾等这窝成年后才能再配。形成前可取消，取消不会自动把亲虾搬回原缸。'), natural, node('h3', '', '这一窝的进展'), batchList, batchEmpty);
  for (const control of [mother, father, breedingTank, broodSize]) control.addEventListener('change', update);

  const buyTank = select('crystal-buy-tank'), shop = node('div', 'crystal-shop'), shopRows = new Map();
  pages.market.append(node('h3', '', '挑一只明确的亲虾'), node('p', 'crystal-muted', '以下都是成年个体，品质已经看得见。每只商品虾只有一只。'), field('买入后放到', buyTank), shop);
  for (const product of shopCatalogue()) {
    const item = node('section', 'crystal-shop-item'), heading = node('h4', '', `${product.label} · ${sexName(product.sex)}`), price = node('strong', '', `${product.price} 金币`);
    const p = node('p', 'crystal-muted', `颜色 ${quality(product.P[0])} / 覆盖 ${quality(product.P[1])} / 边缘 ${quality(product.P[2])}`);
    const purchase = button('买入这只', () => run(() => onAction({type:'buy', productId:product.id, tankId:buyTank.value}), '亲虾已买入。可在虾册找到它。'));
    purchase.dataset.productId = product.id; const row = node('div', 'crystal-row'); row.append(heading, price); item.append(row, p, purchase); shop.append(item); shopRows.set(product.id, {product, purchase});
  }
  const expansionText = node('p', 'crystal-muted'), expand = button('添置繁育缸 · 90 金币', () => {
    const state = getState(), tankId = state?.tanks.length === 2 ? 'breeding-2' : 'breeding-3';
    run(() => onAction({type:'expand', tankId}), '新繁育缸已启用，可在顶部切换或移入亲虾。');
  }); expand.id = 'crystal-expand';
  pages.market.append(node('h3', '', '给喜欢的虾留位置'), expansionText, expand); buyTank.addEventListener('change', update);
  const commissions = commissionCatalogue(), commissionSelect = select('crystal-commission'), deliverySelect = select('crystal-delivery');
  options(commissionSelect, commissions.map(card => ({value:card.id, label:card.title})));
  const commissionHint = node('p', 'crystal-muted'), commissionRecord = node('p', 'crystal-best');
  const delivery = button('查看这只的交付确认', () => {
    if (!deliverySelect.value) return;
    commissionChoice = {commissionId:commissionSelect.value, id:deliverySelect.value}; update(); deliveryCancel.focus();
  }); delivery.id = 'crystal-delivery-review';
  const deliveryBox = node('div', 'crystal-confirm'), deliveryText = node('p'), deliveryCancel = button('暂时留下它', () => { commissionChoice = null; update(); delivery.focus(); }); deliveryBox.hidden = true;
  const deliver = button('确认交付这只', async () => {
    const choice = commissionChoice; if (!choice) return;
    await run(async () => {
      const response = await onAction({type:'commission', ...choice});
      const result = response?.result ?? response;
      if (!result || result.kind !== 'commission') throw new Error('请查看委托收据确认交付结果。');
      commissionChoice = null;
    }, '委托已完成，交付价已到账，个体档案仍保留。');
  }, 'crystal-danger'); deliver.id = 'crystal-delivery-confirm';
  const deliveryButtons = node('div', 'crystal-row'); deliveryButtons.append(deliveryCancel, deliver); deliveryBox.append(deliveryText, deliveryButtons);
  const commissionDetails = node('details', 'crystal-commissions');
  commissionDetails.append(node('summary', '', '可选育种委托'), node('p', 'crystal-muted', '有人在找特定的虾。交付是自愿的，会把这一只交给对方；收藏和正在带后代的亲虾不会列入。'), field('委托', commissionSelect), commissionHint, commissionRecord, field('挑一只符合条件的虾', deliverySelect), delivery, deliveryBox);
  pages.market.append(commissionDetails);
  for (const control of [commissionSelect, deliverySelect]) control.addEventListener('change', () => { commissionChoice = null; update(); });

  const contestSelect = select('crystal-contest-card'), entrant = select('crystal-contest-entrant'), contestDescription = node('p', 'crystal-muted'), best = node('p', 'crystal-best'), npcList = node('div', 'crystal-opponents'), rewardHint = node('p', 'crystal-muted');
  const enter = button('选这只参赛', async () => {
    await run(async () => {
      const response = await onAction({type:'contest', contestId:contestSelect.value, id:entrant.value});
      const result = response?.result ?? response;
      if (!result || !Number.isFinite(result.score) || !Number.isInteger(result.rank)) throw new Error('未收到比赛结果，请先查看已保存的个人最好记录。');
      const reward = Number.isFinite(result.reward) ? result.reward : 0;
      text(contestResult, `本次 ${quality(result.score)} 分 · 品质${RATINGS[result.rating] || result.rating} · 第 ${result.rank} 名（共 4 只，可并列）\n${reward ? `获得 ${reward} 金币。` : '本次没有金币奖励；个人最好记录会保留。'}`);
      contestResult.hidden = false;
    }, '比赛已完成，结果和个人最好已更新。');
  }, 'crystal-primary'); enter.id = 'crystal-contest-enter';
  const contestResult = node('p', 'crystal-contest-result'); contestResult.id = 'crystal-contest-result'; contestResult.hidden = true; contestResult.setAttribute('role', 'status');
  pages.contest.append(node('h3', '', '带一只成年虾，看看养得怎样'), field('这次参加', contestSelect), contestDescription, npcList, field('参赛个体', entrant), best, rewardHint, enter, contestResult, node('p', 'crystal-muted', '金 / 银 / 铜是品质等级，名次是与本卡 3 只电脑虾的比较。对手固定；同一主题只在首次参赛时奖励金币，重复参赛用于比较与刷新个人最好。'));
  contestSelect.addEventListener('change', () => { contestResult.hidden = true; update(); }); entrant.addEventListener('change', update);

  function announce(message, error = false) {
    if (disposed) return; text(feedback, message); feedback.classList.toggle('is-error', error);
  }
  function disable(control, value) { control.dataset.unavailable = value ? 'true' : 'false'; control.disabled = busy || value; }
  function setOpen(open) {
    if (open && panel.hidden) returnFocus = document.activeElement;
    if (open && panel.hidden) for (const image of document.querySelectorAll('#crystal-panel img[data-portrait-failed], #crystal-inspect img[data-portrait-failed]')) delete image.dataset.portraitKey;
    if (open) { window.showDock?.(''); document.getElementById('care-pop').hidden = true; document.getElementById('care-chip')?.setAttribute('aria-expanded', 'false'); }
    panel.hidden = !open; dockButton.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('crystal-panel-open', open);
    if (open) {
      update();
      if (activePage === 'roster') { const record = getState()?.individuals.find(r => r.id === selectedId); onSelect(record && live(record) && record.tank === getActiveTank() ? record.id : null); }
      close.focus();
    } else if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus(); else dockButton.focus();
  }
  function showPage(page) {
    activePage = page; panel.dataset.page = page;
    text(title, ({roster:'我的虾册', breed:'下一窝的期待', market:'育种者集市', contest:'带它去参赛'})[page]);
    for (const [id, element] of Object.entries(pages)) {
      element.hidden = id !== page; tabButtons[id].setAttribute('aria-selected', String(id === page)); tabButtons[id].tabIndex = id === page ? 0 : -1;
    }
    update();
  }
  async function run(task, message) {
    if (busy || disposed) return;
    if (typeof task !== 'function') { announce('这项操作暂时不可用。', true); return; }
    busy = true; announce('正在保存这次操作…'); update();
    try { await task(); if (!disposed) announce(message); }
    catch (error) { announce(error?.message || '操作没有完成，请稍后再试。', true); }
    finally { busy = false; if (!disposed) update(); }
  }
  function portrait(image, record, now, caption) {
    const key = JSON.stringify([record.id, record.sex, record.colour, record.pattern, now >= record.adultAt ? record.P : 'juvenile']);
    if (image.dataset.portraitKey === key) return;
    image.dataset.portraitKey = key; delete image.dataset.portraitFailed; image.hidden = true; image.removeAttribute('src');
    if (caption) { caption.hidden = false; text(caption, '正在准备个体影像…'); }
    (portraits?.get(record, now, image === hero || image === inspectImage) ?? Promise.resolve(null)).then(url => {
      if (disposed || !image.isConnected || image.dataset.portraitKey !== key) return;
      if (url) { image.src = url; image.hidden = false; } else image.dataset.portraitFailed = 'true';
      if (caption) { caption.hidden = !!url; if (!url) text(caption, '影像暂不可用，重开虾册可重试'); }
    });
  }
  function updateRoster(state) {
    const query = search.value.trim().toLocaleLowerCase();
    const records = state.individuals.filter(record => {
      if (filter.value === 'sold' ? live(record) : !live(record)) return false;
      if (filter.value === 'current' && record.tank !== getActiveTank()) return false;
      if (filter.value === 'favorites' && !record.protected) return false;
      if (filter.value === 'juvenile' && record.adultAt <= state.now) return false;
      return !query || `${nameOf(record)} ${appearance(record)} ${sexName(record.sex)}`.toLocaleLowerCase().includes(query);
    }).sort((a, b) => Number(!!a.legacy) - Number(!!b.legacy));
    text(rosterCount, filter.value === 'sold' ? `${records.length} 条已售档案` : `${records.length} 只 · 选择一只查看`);
    const ids = new Set(records.map(record => record.id));
    for (const [id, row] of rosterRows) if (!ids.has(id)) { row.root.remove(); rosterRows.delete(id); }
    if (!ids.has(selectedId)) {
      const first = records[0]; selectedId = first?.id || null; sellId = null;
      if (!panel.hidden && activePage === 'roster') onSelect(first && live(first) && first.tank === getActiveTank() ? first.id : null);
    }
    for (const [index, record] of records.entries()) {
      let row = rosterRows.get(record.id);
      if (!row) {
        const root = button('', () => { selectedId = record.id; sellId = null; const current = getState()?.individuals.find(r => r.id === record.id); onSelect(current && live(current) && getActiveTank() === current.tank ? current.id : null); update(); }, 'crystal-roster-item'); root.dataset.individualId = record.id;
        const image = node('img', 'crystal-portrait'); image.alt = ''; image.width = 192; image.height = 112; image.hidden = true;
        const placeholder = node('span', 'crystal-portrait-status', '准备影像…'), label = node('strong'), subtitle = node('span'), traits = node('span', 'crystal-traits'), marker = node('span', 'crystal-choice');
        const art = node('span', 'crystal-card-art'); art.append(image, placeholder);
        root.append(art, label, traits, subtitle, marker); row = {root, image, placeholder, label, subtitle, traits, marker}; rosterRows.set(record.id, row); roster.append(root);
      }
      if (roster.children[index] !== row.root) roster.insertBefore(row.root, roster.children[index] || null);
      text(row.label, nameOf(record));
      text(row.traits, appearance(record) || '外观资料未记录');
      text(row.marker, record.id === selectedId ? '已选中' : record.protected ? '已收藏' : '');
      text(row.subtitle, `${sexName(record.sex)} · ${record.adultAt <= state.now ? '成年' : '幼虾'}${record.tank !== getActiveTank() ? ` · ${tankName(record.tank)}` : ''}`);
      if (!panel.hidden && activePage === 'roster') portrait(row.image, record, state.now, row.placeholder);
      row.root.setAttribute('aria-pressed', String(record.id === selectedId)); disable(row.root, false);
    }
    rosterEmpty.hidden = records.length > 0; text(rosterEmpty, query ? '没有找到这只虾，试试名字、红晶或纹样。' : filter.value === 'sold' ? '还没有出售记录。' : filter.value === 'favorites' ? '还没有收藏。挑一只喜欢的，收藏后也会保护它。' : filter.value === 'current' ? '这缸暂时没有虾。可以切换鱼缸，或查看全部虾。' : filter.value === 'juvenile' ? '暂时没有成长中的幼虾。' : '名册里暂时没有活体，可以去集市挑选亲虾。');
    const record = records.find(item => item.id === selectedId); detail.hidden = !record; if (!record) return;
    const isLive = live(record), adult = record.adultAt <= state.now, isLocked = locked(state, record.id);
    const carrying = state.batches.find(batch => !['planned', 'complete', 'cancelled'].includes(batch.status) && batch.motherId === record.id);
    const canMove = isLive && (!isLocked || !!carrying);
    if (detailId !== record.id) { detailId = record.id; nameInput.value = drafts.get(record.id) ?? record.name ?? ''; }
    else if (document.activeElement !== nameInput && !drafts.has(record.id)) nameInput.value = record.name ?? '';
    text(detailTitle, nameOf(record)); text(identity, `身份 ${record.id}`);
    text(selectionBadge, !isLive ? '留在虾册里的回忆' : record.protected ? '我的收藏 · 已保护' : '正在查看这一只');
    if (!panel.hidden && activePage === 'roster') portrait(hero, record, state.now, heroCaption);
    text(description, `${sexName(record.sex)} · ${tankName(record.tank)}${appearance(record) ? ` · ${appearance(record)}` : ''}${record.protected ? ' · 收藏保护中' : ''}`);
    naming.hidden = !isLive; stats.hidden = !adult || !!record.legacy; juvenile.hidden = adult;
    for (let i = 0; i < statFields.length; i++) {
      statFields[i].meter.value = adult && record.P ? record.P[i] : 1;
      text(statFields[i].value, adult && record.P ? quality(record.P[i]) : '未揭晓');
    }
    text(juvenile, `距离成年还有 ${timeLeft(record.adultAt - Math.max(Date.now(), state.now))}。${record.legacy ? '继续在缸里照料它。' : '成年后再看三项品质。'}`);
    text(ancestry, record.parents ? `母虾：${nameOf(state.individuals.find(item => item.id === record.parents[0]))}\n公虾：${nameOf(state.individuals.find(item => item.id === record.parents[1]))}` : record.legacy ? '从原缸保留的个体；没有补造水晶虾遗传资料。' : '初代亲虾 · 没有可追溯的亲代记录');
    text(stateHint, !isLive ? '已出售；名字、品质和后代关系仍保留。' : carrying ? '正在带这一窝，可以移缸，暂时不能再次配对或出售。' : isLocked ? '正在准备配对，暂时不能移缸和出售。' : record.protected ? '已收藏，不会被出售。想转让时先解除保护。' : record.legacy ? (record.legacyHatchAt !== null ? '原有抱卵保留，空间足够时孵化；暂不能出售。' : '保留原有身份，可以照料、收藏和移缸；水晶虾才能选育和参赛。') : adult ? '可以参赛、留种，或自愿转让给电脑买家。' : '幼虾可以继续观察和移缸，成年后才能参赛或出售。');
    detailActions.hidden = transfer.hidden = sell.hidden = !isLive;
    text(focus, getActiveTank() === record.tank ? '在缸中找到它' : `切到${tankName(record.tank)}并观察`);
    text(protect, record.protected ? '解除收藏保护' : '收藏并保护'); protect.setAttribute('aria-pressed', String(record.protected));
    options(moveTank, state.tanks.filter(tank => tank.id !== record.tank).map(tank => ({value:tank.id, label:tankName(tank.id)})));
    const moveTarget = state.tanks.find(tank => tank.id === moveTank.value), moveCount = moveTarget ? counts(state, moveTarget.id) : {animals:0, reserved:0};
    const movingBrood = carrying?.status === 'formed' ? carrying.size : 0;
    const moveFree = moveTarget ? moveTarget.capacity - moveCount.animals - moveCount.reserved - 1 - movingBrood : -1;
    const targetHasBrood = !!movingBrood && state.batches.some(batch => batch.id !== carrying.id && batchTankId(batch) === moveTank.value && ['planned', 'formed'].includes(batch.status));
    moveHint.hidden = !isLive;
    text(moveHint, !isFilled(moveTank.value) ? '目标缸还未注水，请先完成开缸。' : targetHasBrood ? '目标缸已有一窝未孵化，暂不能移入这只抱卵母虾。' : carrying?.status === 'formed' ? `抱卵母虾移缸时，${movingBrood} 只后代的预留位置一起转移；目标缸完成后剩 ${moveFree} 位。` : carrying?.status === 'hatched' ? '幼虾已经孵化；这次只移动母虾，幼虾仍留在原缸。' : moveFree < 0 ? '目标缸没有足够空位（包含已预留的位置）。' : '移缸保留身份、名字和亲代关系。');
    disable(nameInput, !isLive); disable(rename, !isLive); disable(focus, !isLive); disable(protect, !isLive);
    disable(moveTank, !canMove); disable(move, !canMove || !moveTank.value || moveFree < 0 || targetHasBrood || !isFilled(moveTank.value));
    const canSell = isLive && adult && !record.protected && !isLocked && !(record.legacy && record.legacyHatchAt !== null); disable(sell, !canSell); disable(sellConfirm, !canSell || sellId !== record.id);
    saleConfirm.hidden = sellId !== record.id || !isLive;
    text(saleText, `确定出售「${nameOf(record)}」吗？获得 8 金币，它会离开鱼缸，档案和后代关系保留。`);
  }
  function updateBreeding(state) {
    const adults = state.individuals.filter(record => live(record) && !record.legacy && record.adultAt <= state.now && !locked(state, record.id));
    const parentOption = record => ({value:record.id, label:`${nameOf(record)} · ${tankName(record.tank)}`});
    options(mother, adults.filter(record => record.sex === 'female').map(parentOption), '选择一只成年母虾');
    options(father, adults.filter(record => record.sex === 'male').map(parentOption), '选择一只成年公虾');
    options(breedingTank, state.tanks.map(tank => ({value:tank.id, label:tankName(tank.id)})));
    const target = state.tanks.find(tank => tank.id === breedingTank.value), selected = [mother.value, father.value].map(id => state.individuals.find(record => record.id === id));
    const size = Number(broodSize.value), moving = selected.filter(record => record && record.tank !== target?.id);
    const occupied = target ? counts(state, target.id) : {animals:0, reserved:0};
    const free = target ? Math.min(target.capacity - occupied.animals - occupied.reserved - moving.length - size, globalFree(state) - size) : 0;
    const targetBusy = state.batches.some(batch => batchTankId(batch) === target?.id && ['planned', 'formed'].includes(batch.status));
    const both = selected.every(Boolean);
    text(parentQuality, selected.map((record, index) => record ? `${index === 0 ? '母虾' : '公虾'}：颜色 ${quality(record.P?.[0])} / 覆盖 ${quality(record.P?.[1])} / 边缘 ${quality(record.P?.[2])}` : '').filter(Boolean).join('\n'));
    const copy = [`${tankName(target?.id)}：现有 ${occupied.animals} 只，已预留 ${occupied.reserved} 位。`, both ? moving.length ? `确认会把${moving.map(nameOf).join('、')}移入这里。` : '两只亲虾已经在这个缸，不需要搬动。' : '先选好一公一母，再确认搬动和余位。', `这窝预留 ${size} 位${both ? `，安排后还剩 ${free} 位。` : '。'}`];
    if (!isFilled(target?.id)) copy.push('目标缸还未注水，请先完成开缸。');
    if (targetBusy) copy.push('这个缸已有一窝未孵化，请等待孵化或选择另一缸。');
    else if (both && free < 0) copy.push('位置不够：可选小窝、换一个繁育缸，或先移走其他虾。');
    text(planSummary, copy.join('\n')); planSummary.classList.toggle('is-error', both && free < 0 || targetBusy || !isFilled(target?.id));
    disable(plan, !both || !target || free < 0 || targetBusy || !isFilled(target?.id)); disable(mother, false); disable(father, false); disable(breedingTank, false); disable(broodSize, false);
    const pair = naturalPair(state), naturalMother = state.individuals.find(record => record.id === pair?.motherId), naturalFather = state.individuals.find(record => record.id === pair?.fatherId);
    const main = state.tanks.find(tank => tank.id === 'main'), mainUsed = counts(state, 'main'), naturalCount = Number(naturalSize.value);
    const mainBusy = state.batches.some(batch => batchTankId(batch) === 'main' && ['planned', 'formed'].includes(batch.status)), mainFree = Math.min(main.capacity - mainUsed.animals - mainUsed.reserved, globalFree(state)) - naturalCount;
    text(naturalSummary, !naturalMother ? '主缸还需要一对成年、空闲且可以配对的亲虾。' : `${nameOf(naturalMother)}（母） × ${nameOf(naturalFather)}（公）\n这窝预留 ${naturalCount} 位，安排后主缸剩 ${mainFree} 位。${mainBusy ? '\n主缸已有一窝未孵化，请等这一窝孵化后再安排。' : mainFree < 0 ? '\n主缸位置不够，先选小窝或移走其他虾。' : ''}`);
    disable(naturalSize, false); disable(naturalPlan, !naturalMother || mainBusy || mainFree < 0 || !isFilled('main'));
    const ids = new Set(state.batches.map(batch => batch.id));
    for (const [id, row] of batchRows) if (!ids.has(id)) { row.root.remove(); batchRows.delete(id); }
    for (const batch of state.batches) {
      let row = batchRows.get(batch.id);
      if (!row) {
        const root = node('section', 'crystal-batch'), heading = node('strong'), parentsText = node('p', 'crystal-muted'), steps = node('p', 'crystal-stage-line'), progress = node('progress'), timing = node('p'), cancel = button('取消未形成的计划', () => run(() => onAction({type:'cancel', batchId:batch.id}), '计划已取消，后代预留位置已释放；亲虾仍留在当前缸。'));
        root.dataset.batchId = batch.id; progress.max = 1; progress.setAttribute('aria-label', '这一窝的成长进度'); root.append(heading, parentsText, steps, progress, timing, cancel); row = {root, heading, parentsText, steps, progress, timing, cancel}; batchRows.set(batch.id, row); batchList.prepend(root);
      }
      text(row.heading, `${tankName(batchTankId(batch))} · ${batch.source === 'natural' ? '自然繁殖 · ' : ''}${batch.size} 只 · ${STAGES[batch.status] || batch.status}`);
      text(row.parentsText, `${nameOf(state.individuals.find(record => record.id === batch.motherId))} × ${nameOf(state.individuals.find(record => record.id === batch.fatherId))}`);
      text(row.steps, '准备配对 → 抱卵 → 孵化 → 成年');
      row.progress.value = Math.max(0, Math.min(1, (Math.max(Date.now(), state.now) - batch.plannedAt) / (batch.adultAt - batch.plannedAt))); row.progress.hidden = batch.status === 'cancelled';
      const next = batch.status === 'planned' ? batch.formedAt : batch.status === 'formed' ? batch.hatchAt : batch.adultAt;
      text(row.timing, batch.status === 'complete' ? '这一窝已成年。去虾册比较，再由你决定要不要继续选育。' : batch.status === 'cancelled' ? '已取消，未产生后代。' : `${batch.status === 'planned' ? '距离配对形成' : batch.status === 'formed' ? '距离孵化' : '距离成年'}：${timeLeft(next - Math.max(Date.now(), state.now))}`);
      row.cancel.hidden = batch.status !== 'planned'; disable(row.cancel, batch.status !== 'planned');
    }
    batchEmpty.hidden = state.batches.length > 0;
  }
  function updateMarket(state) {
    const choices = state.tanks.map(tank => ({value:tank.id, label:tankName(tank.id)})); options(buyTank, choices);
    const target = state.tanks.find(tank => tank.id === buyTank.value), used = target ? counts(state, target.id) : {animals:0, reserved:0};
    for (const {product, purchase} of shopRows.values()) {
      const bought = state.purchases.some(receipt => receipt.productId === product.id), full = !target || used.animals + used.reserved >= target.capacity || globalFree(state) <= 0;
      text(purchase, bought ? '这只已购买' : !isFilled(target?.id) ? '请先给目标缸注水' : full ? '目标缸已满（含预留）' : state.cash < product.price ? `需要 ${product.price} 金币` : `买入这只 · ${product.price}`);
      disable(purchase, bought || full || state.cash < product.price || !isFilled(target?.id));
    }
    text(expansionText, state.tanks.length >= 4 ? '已拥有全部 4 个缸，共 50 位。满缸时可以先暂停新配对，继续观赏和参赛，不必出售收藏。' : `下一缸：${tankName(state.tanks.length === 2 ? 'breeding-2' : 'breeding-3')}，增加 10 位，90 金币。满缸时可以暂停新配对，不必急着整理。`);
    text(expand, state.tanks.length >= 4 ? '已达到 50 位' : state.cash < 90 ? '添置繁育缸 · 还需要更多金币' : '添置繁育缸 · 90 金币'); disable(expand, state.tanks.length >= 4 || state.cash < 90); disable(buyTank, false);
    const commission = commissions.find(card => card.id === commissionSelect.value);
    if (commission) {
      const receipt = state.commissions?.deliveries.find(item => item.commissionId === commission.id);
      const eligible = state.individuals.filter(record => live(record) && !record.legacy && record.adultAt <= state.now && !record.protected && !locked(state, record.id) && record.P?.[1] >= commission.minCoverage && (!commission.colour || record.colour === commission.colour) && (!commission.pattern || record.pattern === commission.pattern));
      options(deliverySelect, eligible.map(record => ({value:record.id, label:`${nameOf(record)} · ${tankName(record.tank)}`})), '明确选择要交付的一只');
      text(commissionHint, `${commission.colour === 'red' ? '红晶' : commission.pattern === 'hinomaru' ? '日之丸纹' : '指定外观'}，覆盖至少 ${commission.minCoverage}。交付总价 ${commission.price} 金币（已包含转让价），每张委托只能完成一次。`);
      text(commissionRecord, receipt ? `已完成：${nameOf(state.individuals.find(record => record.id === receipt.individualId))} · ${receipt.price} 金币` : eligible.length ? `${eligible.length} 只符合条件，你可以决定是否交付。` : '目前没有符合条件且未受保护的成年虾，可以继续选育，也可以先不做这张委托。');
      const candidate = eligible.find(record => record.id === commissionChoice?.id), same = commissionChoice?.commissionId === commission.id && deliverySelect.value === commissionChoice?.id;
      deliveryBox.hidden = !commissionChoice || !same || !!receipt;
      text(deliveryText, candidate ? `确定把「${nameOf(candidate)}」交付给这张委托吗？总共获得 ${commission.price} 金币。这只虾会离缸，档案和后代关系保留。` : '这只虾已不符合交付条件，请重新选择。');
      disable(commissionSelect, false); disable(deliverySelect, !!receipt); disable(delivery, !!receipt || !deliverySelect.value); disable(deliver, !!receipt || !candidate || !same);
    }
  }
  function updateContests(state) {
    options(contestSelect, state.contests.cards.map(card => ({value:card.id, label:contestName(card)})));
    options(entrant, state.individuals.filter(record => live(record) && !record.legacy && record.adultAt <= state.now).map(record => ({value:record.id, label:`${nameOf(record)} · ${tankName(record.tank)}`})), '选择一只成年虾');
    const card = state.contests.cards.find(item => item.id === contestSelect.value); if (!card) { disable(enter, true); return; }
    text(contestDescription, card.theme === 'colour' ? '颜色占 50%，覆盖和边缘各占 25%。' : '边缘占 50%，颜色和覆盖各占 25%。');
    const opponentText = card.npcs.map((npc, index) => `电脑对手 ${index + 1} · ${quality(scoreShrimp(npc.P, card.theme))} 分`).join('　'); text(npcList, opponentText);
    const record = state.contests.records.bestByContest[card.id];
    text(best, record ? `个人最好：${nameOf(state.individuals.find(individual => individual.id === record.entrantId))}\n${quality(record.score)} 分 · 品质${RATINGS[record.rating] || record.rating} · 第 ${record.rank} 名` : '这张赛卡还没有你的成绩。');
    text(rewardHint, state.contests.records.rewardedThemes.includes(card.theme) ? '本主题首次奖励已领过。再参赛不会重复获得金币。' : '本主题第一次参赛可获得 10 金币。');
    disable(contestSelect, false); disable(entrant, false); disable(enter, !entrant.value);
  }
  function update() {
    if (disposed) return;
    const state = getState(); intro.hidden = !!state; game.hidden = !state; panel.setAttribute('aria-busy', String(busy));
    document.body.classList.toggle('crystal-mode', !!state); hud.hidden = activity.hidden = !state;
    shortcuts.forEach(control => { control.hidden = !state; control.disabled = busy; });
    inspect.hidden = true;
    if (state) {
      starter.hidden = !state.starterPending;
      const main = state.tanks.find(t => t.id === 'main'), mainUsed = counts(state, 'main');
      const starterFull = Math.min(main.capacity - mainUsed.animals - mainUsed.reserved, globalFree(state)) < 7;
      text(starterHint, !isFilled('main') ? '先在自己的缸里铺土、摆木石、种草并注水，再领养第一批水晶虾。' : starterFull ? '第一批有 7 只，主缸和总容量都需要留足 7 个空位。原有虾会继续保留。' : '造景已准备好。把 7 只水晶虾放进自己的主缸，和原有虾一起生活。');
      disable(start, !isFilled('main') || starterFull);
      text(funds, `${state.cash} 金币`);
      const occupied = state.tanks.map(tank => counts(state, tank.id)), living = occupied.reduce((sum, count) => sum + count.animals, 0), reserved = occupied.reduce((sum, count) => sum + count.reserved, 0);
      text(total, `${living} 只 · 预留 ${reserved} 位 · 容量 ${Math.min(50, state.tanks.reduce((sum, tank) => sum + tank.capacity, 0))} / 50`);
      text(currentRoom, tankName(getActiveTank()));
      text(care, document.getElementById('care-chip')?.textContent || '查看虾群状态');
      const inspected = state.individuals.find(r => r.id === getSelected() && live(r) && r.tank === getActiveTank());
      if (inspected && panel.hidden) {
        inspect.hidden = false;
        text(inspectName, nameOf(inspected)); text(inspectHint, `${appearance(inspected)} · 打开个体档案`);
        portrait(inspectImage, inspected, state.now);
      }
      const tankIds = new Set(state.tanks.map(tank => tank.id)); for (const [id, control] of tankButtons) if (!tankIds.has(id)) { control.remove(); tankButtons.delete(id); }
      for (const tank of state.tanks) {
        let control = tankButtons.get(tank.id); if (!control) { control = button('', () => run(() => onSwitch(tank.id), `正在观察${tankName(tank.id)}。`)); control.dataset.tankId = tank.id; tankButtons.set(tank.id, control); tanks.append(control); }
        const count = counts(state, tank.id); text(control, `${tankName(tank.id)} ${count.animals}+${count.reserved}/${tank.capacity}`); control.title = `${count.animals}只活体，${count.reserved}位为未出生后代预留`; control.setAttribute('aria-pressed', String(getActiveTank() === tank.id)); disable(control, false);
      }
      const growing = state.batches.filter(batch => ['planned', 'formed', 'hatched'].includes(batch.status));
      const next = growing.map(batch => ({batch, at:batch.status === 'planned' ? batch.formedAt : batch.status === 'formed' ? batch.hatchAt : batch.adultAt})).sort((a, b) => a.at - b.at)[0];
      text(nextStep, !isFilled(getActiveTank()) ? '把这缸布置成你喜欢的样子\n造景完成后注水，再让虾入住' : state.starterPending ? '你的造景，也是虾的家\n打开虾册，领养第一批水晶虾' : next ? `${tankName(batchTankId(next.batch))} · ${STAGES[next.batch.status]}\n${next.batch.status === 'formed' ? '孵化' : next.batch.status === 'hatched' ? '成年' : '抱卵'}还有 ${timeLeft(next.at - Math.max(Date.now(), state.now))} · 查看这一窝` : '下一窝，会像谁？\n挑一对亲虾，开始新的期待');
      updateRoster(state); updateBreeding(state); updateMarket(state); updateContests(state);
    }
    for (const control of panel.querySelectorAll('button,input,select')) if (!control.dataset.keepEnabled) control.disabled = busy || control.dataset.unavailable === 'true';
    for (const control of hud.querySelectorAll('button')) control.disabled = busy;
    activity.disabled = inspect.disabled = busy;
  }
  const keydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (sellId) { sellId = null; update(); sell.focus(); } else setOpen(false); return; }
    if (event.target.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); const ids = Object.keys(pages), offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = ids[(ids.indexOf(activePage) + offset + ids.length) % ids.length]; showPage(next); tabButtons[next].focus();
    }
    event.stopPropagation();
  };
  panel.addEventListener('keydown', keydown);
  panel.addEventListener('keyup', event => event.stopPropagation());
  function selectedInTank(event) {
    const record = getState()?.individuals.find(r => r.id === event.detail && live(r));
    if (!record) { update(); return; }
    selectedId = record.id; sellId = null; filter.value = 'live'; search.value = ''; update();
  }
  function inspectSelected() {
    const id = getSelected(); if (id) selectedId = id;
  }
  inspect.addEventListener('click', () => { inspectSelected(); update(); });
  document.addEventListener('aquarium:shrimp-selected', selectedInTank);
  const dockInteraction = event => { if (event.target.closest('[data-dock],#feed,#quiet-watch,#reset')) setOpen(false); };
  dock.addEventListener('click', dockInteraction);
  showPage('roster'); const timer = setInterval(update, 1000);
  return {update, dispose() { disposed = true; clearInterval(timer); portraits?.dispose(); document.removeEventListener('aquarium:shrimp-selected', selectedInTank); dock.removeEventListener('click', dockInteraction); [panel, dockButton, hud, activity, inspect, ...shortcuts].forEach(element => element.remove()); document.body.classList.remove('crystal-panel-open', 'crystal-mode'); }};
}
