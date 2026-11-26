import {shopCatalogue, batchTankId, birthTankId, naturalPair,tankOccupancy as counts,albumTerms,albumReward,inTank,canRest,locked,activeParentBatch,canSelectParent,saleRestriction,TRANSFER_PRICE,REST_LIMIT,tankNames} from './crystal-breeding.js';
import {commissionAppearance,commissionCatalogue,commissionFitsGoal,meetsCommission,starterIndividuals} from './crystal-progress.js';
import {contestWeights,scoreShrimp,judgedTrait,FINE_BAND} from './crystal-genetics.js';
import {contestLineup,contestStanding,parentContestMarks,rivalComparison,rookieCard,exhibitionCard,exhibitionRound,nextExhibition,acceptsContestPattern} from './crystal-contests.js';
import {createCrystalPortraits, crystalPortraitFrame} from './crystal-portraits.js';
import {saveAlbumCard} from './crystal-album-card.js';
import {createLineJournal} from './crystal-line-journal.js';
import {openBroodPhotos} from './crystal-brood-photos.js';
import {booksForDescendant} from './crystal-line-books.js';
import {createTankPhotoAlbum} from './crystal-tank-photo-ui.js';
import {createBroodSpacePicker} from './crystal-space-picker.js';
import {createRestExchange} from './crystal-rest-exchange.js';
import {createBroodWatch, hasHatched, liveBroodTanks} from './crystal-brood-watch.js';
import {createSiblingView, hasSiblingPhoto} from './crystal-sibling-view.js';
import {createPairPhotoView} from './crystal-pair-photos.js';
import {createMateComparison} from './crystal-mate-comparison.js';
import {roomStations} from './room-stations.js';
import {appearance, appearanceOutcomes, bandGoalProblem, breedingDirection, breedingDirections, broodAlternatives, broodQualityTarget, directionRank, goalPartners, hasGoalColour, matchesShrimpSearch, meetsBroodGoal, OBSERVATION_LIMIT, orderParentCandidates, pastGoalResults, qualityTraits, validateObservation} from './crystal-traits.js';

const ICONS = {
  roster:'M4 4h6c2 0 2 1 2 1s0-1 2-1h6v15h-6c-2 0-2 1-2 1s0-1-2-1H4z M12 5v15 M7 8h2 M15 8h2',
  breed:'M7 3v5m10-5v5M4 8h6v5a3 3 0 0 1-6 0zM14 8h6v5a3 3 0 0 1-6 0zM7 16v4h10v-4',
  contest:'M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v5m-4 1h8',
  feed:'m5 4 6-2 5 13-6 2zM16 18v1m4-3v1m-2 4v1',
  scene:'M3 20h18M5 19l4-10 5 10m-1-4 4-8 4 12M5 7V3m-2 2h4',
  keep:'M5 3h12l3 3v15H4V3zM8 3v6h8V3M8 21v-7h8v7',
  observe:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  home:'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',
  wallpaper:'M3 4h18v13H3z M8 21h8 M12 17v4 M5 14l4-4 3 3 3-5 4 6',
};
function toolIcon(control, name) {
  control.classList.add('crystal-tool');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${ICONS[name]}" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  control.style.setProperty('--tool-icon', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
}

const RATINGS = {gold:'金级', silver:'银级', bronze:'铜级', participation:'成长级'};
function contestMark(result) {
  return `第 ${result.rank} 名 · ${RATINGS[result.rating]} · ${points(result.score)} 分`;
}
function rookieMark(entry) {
  return '本窝新秀赛 · '+contestMark(entry);
}
const STAGES = {planned:'配对准备', formed:'已抱卵', hatched:'幼虾成长', complete:'已成年', cancelled:'已取消'};
const live = record => record.soldAt === null;
const canCompete = (record,now) => inTank(record) && !record.legacy && record.adultAt <= now;
const points = value => Number(value.toFixed(2)).toString();
const pointGap = value => value < .01 ? '不足 0.01 分' : points(value) + ' 分';
const tankName = id => id==='rest'?'静养处':tankNames[id] || id || '已售档案';
const tankPlaces=Object.fromEntries(Object.entries(roomStations).map(([id,station])=>[id,station.place]));
const broodLocation = batch => batch.status==='hatched' || batch.status==='complete' ? '出生在'+tankName(birthTankId(batch)) : tankName(batchTankId(batch));
function broodHomes(batch, individuals) {
  if(batch.status!=='hatched' && batch.status!=='complete')return '';
  const born=birthTankId(batch), counts=new Map();
  for(const child of batch.children){
    const resident=individuals.get(child.id);
    if(!resident)continue;
    const place=resident.tank;
    counts.set(place,(counts.get(place)||0)+1);
  }
  if(!counts.size || counts.size===1 && counts.has(born))return '';
  return '现在：'+[...counts].map(([place,n])=>(place===null?'已转让':tankName(place))+' '+n+' 只').join('、');
}
const nameOf = record => record?.name?.trim() || (record ? `水晶虾 · ${record.id.slice(-8)}` : '未选择');
function tankIdentity(state,record){
  const name=nameOf(record);
  const namesake=state.individuals.some(r=>r.id!==record.id && inTank(r) && nameOf(r)===name);
  return namesake?name+' · '+record.id:name;
}
const siblingName=(kid,siblings)=>siblings.some(other=>other.id!==kid.id && nameOf(other)===nameOf(kid)) ? nameOf(kid)+' · '+kid.id : nameOf(kid);
function broodName(kid, birthOrder, fallback=nameOf(kid)) {
  if (!birthOrder.some(other=>other && other.id!==kid.id && nameOf(other)===nameOf(kid))) return fallback;
  return nameOf(kid)+' · 同窝第 '+(birthOrder.findIndex(other=>other?.id===kid.id)+1)+' 只';
}
function broodPhotoKey(record) {
  return [record.id,record.name,record.colour,record.pattern,record.sex,record.P,record.tank,record.protected,record.observation,record.soldAt];
}
function individualNames(state) {
  const names=new Map(), seen=new Set(), duplicates=new Set();
  for(const shrimp of state.individuals){
    const name=nameOf(shrimp);
    names.set(shrimp.id,name);
    if(seen.has(name))duplicates.add(name);
    seen.add(name);
  }
  if(!duplicates.size)return names;
  const origins=new Map();
  state.batches.forEach((batch,index)=>{
    if(batch.status!=='complete' && batch.status!=='hatched')return;
    batch.children.forEach((child,position)=>{
      const label=names.get(child.id);
      if(duplicates.has(label))origins.set(child.id,`第 ${index+1} 窝第 ${position+1} 只`);
    });
  });
  for(const [id,name] of names)if(duplicates.has(name))names.set(id,name+' · '+(origins.get(id) || id));
  return names;
}
const sexName = sex => sex === 'female' ? '母虾' : '公虾';
function matchesSearch(record,query) {
  return !query || matchesShrimpSearch(query,nameOf(record),appearance(record),sexName(record.sex),tankName(record.tank),record.id,record.observation || '');
}
function parentageClue(a,b) {
  if (!a || !b) return '';
  const parent=a.parents?.includes(b.id)?b:b.parents?.includes(a.id)?a:null;
  if (parent) return parent.sex==='female'?'两只是母子':'两只是父女';
  if (!a.parents || !b.parents) return '';
  const [mother,father]=a.parents;
  if (mother===b.parents[0]) return father===b.parents[1]?'两只的父母相同':'两只同母异父';
  return father===b.parents[1]?'两只同父异母':'';
}
function pairHistoryClue(batches, goal, target) {
  if (!batches?.length) return '';
  if (!goal && !target) return `这对亲虾已有 ${batches.length} 窝成年，共 ${batches.reduce((sum,b)=>sum+b.children.length,0)} 只。`;
  const {evaluated,matched,unknown}=pastGoalResults(batches,goal,target);
  const aim=goal && target?'同时符合两项目标':'符合这次目标';
  const sample=evaluated ? `${evaluated} 只${target?.pattern?'花色有记录的':'可对照的'}成年后代中，${matched} 只${aim}` : '';
  return `这对过去育成 ${batches.length} 窝。`+[sample,unknown && `${unknown} 只缺少花色记录`].filter(Boolean).join('；')+'。';
}
const quality = value => Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, '') : '—';
function orderBrood(kids, direction) {
  if (!direction) return kids;
  return [...kids].sort((a,b) => directionRank(direction,b)-directionRank(direction,a));
}
const traitNames = ['颜色','覆盖','边缘'];
const fineBandTraits = ['颜色','细带','边缘'];
const judgingLabels = theme => theme === FINE_BAND ? fineBandTraits : traitNames;
const directionLabel = direction => direction.pattern ? direction.label : traitNames[direction.index];
const orderLabel = direction => direction.pattern ? '白带从'+(direction.lower?'细到宽':'宽到细') : traitNames[direction.index]+'从高到低';
const bestLabel = direction => direction.pattern ? (direction.lower?'最细':'最宽')+'白带的覆盖' : traitNames[direction.index]+'最高';
function targetText(target) {
  if (target.pattern) {
    if(target.atLimit)return (target.lower?'保持最细白带':'保持最宽白带')+'（覆盖 '+quality(target.best)+' 分）';
    const threshold=target.lower?'低于':'高于';
    return target.label+'（覆盖'+threshold+' '+quality(target.best)+' 分）';
  }
  return traitNames[target.index]+(target.atLimit?'保持 9 分':'超过 '+quality(target.best)+' 分');
}
const qualities = record => traitNames.map((label, i) => label + ' ' + quality(record.P?.[i])).join('　');
function compareWithParents(kid,target) {
  const diff=target.difference(kid);
  if (target.pattern) {
    if(diff===null)return kid.pattern?'其他纹样，不比较白带宽窄':'纹样未记录';
    if(diff===0)return '白带与参照亲虾一样宽';
    const finer=target.lower ? diff>0 : diff<0;
    return '白带比参照亲虾'+(finer?'更细，覆盖少 ':'更宽，覆盖多 ')+quality(Math.abs(diff))+' 分';
  }
  if (diff===0) return target.atLimit?'保持满分':'与较高的亲虾持平';
  return '比双亲最高分'+(diff>0?'高':'低')+' '+quality(Math.abs(diff))+' 分';
}
function goalLabel(key) {
  const [colour, pattern] = key.split(':');
  return appearance({colour, pattern}).replace(' · ', '');
}
function broodColourNote(kid,goal) {
  if(!goal)return '';
  const label='本窝目标「'+goalLabel(goal)+'」';
  if(!kid.colour || !kid.pattern)return label+'，花色记录不全';
  return hasGoalColour(kid,goal)?'符合'+label:'与'+label+'不同';
}
const contestName = card => `${card.theme === FINE_BAND ? '细白带组' : card.theme === 'colour' ? '颜色' : '纹样'} · ${card.tier === 'entry' ? '入门赛' : '进阶赛'}`;
const exhibitionName = round => `第 ${round} 届专题赛`;
const exhibitionClassName = id => exhibitionName(exhibitionRound(id)) + (id.endsWith(':'+FINE_BAND) ? ' · 细白带组' : ' · 公开组');
function compareContestTraits(individual,holder,theme) {
  const weights=contestWeights(theme), labels=judgingLabels(theme);
  const main=weights.indexOf(Math.max(...weights));
  const comparison=i=>{
    const diff=Number(quality(judgedTrait(individual.P,theme,i)))-Number(quality(judgedTrait(holder.P,theme,i)));
    return labels[i]+(diff===0?'持平':(diff>0?'高 ':'低 ')+points(Math.abs(diff))+' 分');
  };
  return [comparison(main)+'（本场占 '+weights[main]*100+'%）',
    ...labels.flatMap((_,i)=>i===main?[]:[comparison(i)])].join('、');
}
function familyContestNote(card, individual, archive) {
  return parentContestMarks(card,individual,archive).map(({parent,score,gap})=>{
    let line=`${sexName(parent.sex)}「${nameOf(parent)}」在本卡得过 ${points(score)} 分`;
    if (gap!==null) line+=gap===0?'，这只与它持平':`，这只比它${gap>0?'高':'低'} ${pointGap(Math.abs(gap))}`;
    return line+'。';
  }).join('\n');
}
function contestNotes(card, individual) {
  const {rival,gap,trait}=rivalComparison(card,individual), rivalName=`${rival.index+1} 号对手`;
  if (trait===null) return {standing:`和${rivalName}并列第一。`,goal:'',action:'为它挑搭档'};
  const margin=gap>0 ? `领先第二名 ${pointGap(gap)}。` : `距前一名还差 ${pointGap(-gap)}。`;
  const label=judgingLabels(card.theme)[trait];
  const goal=card.theme===FINE_BAND && trait===1 ? FINE_BAND : qualityTraits[trait];
  return {
    standing:`${margin}分差主要来自${label}这一项。你的虾得 ${points(judgedTrait(individual.P,card.theme,trait))} 分，${rivalName}得 ${points(judgedTrait(rival.npc.P,card.theme,trait))} 分。`,
    goal, action:goal ? (gap>0 ? `为它挑搭档 · 延续${label}优势` : `为它挑搭档 · 改善${label}`) : '为它挑搭档',
  };
}
function timeLeft(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (!seconds) return '正在结算';
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return hours ? `${hours}小时${minutes}分` : minutes ? `${minutes}分${seconds % 60}秒` : `${seconds}秒`;
}
function maturityHint(adultAt,now) {
  const minutes=Math.ceil((adultAt-now)/60000);
  if(minutes<=0)return '正在结算成年';
  if(minutes===1)return '1 分钟内成年';
  const remaining=minutes>=60?timeLeft(minutes*60000):minutes+' 分钟';
  return '约 '+remaining+'后成年';
}
export function maternalStage(batch, now) {
  if (batch?.status === 'hatched') return `这一窝的 ${batch.size} 只幼虾已孵化`;
  if (batch?.status !== 'formed') return '';
  return now >= batch.hatchAt ? '已抱卵，正在结算孵化' : `已抱卵，约 ${timeLeft(batch.hatchAt-now)}后孵化`;
}
function currentMaternalBrood(state, id) {
  return state.batches.find(b=>b.motherId===id && (b.status==='formed' || b.status==='hatched'));
}
function isRecordedParent(batch,id) {
  return batch.status!=='cancelled' && (batch.motherId===id || batch.fatherId===id);
}
function node(tag, className = '', text = '') {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}
function text(element, value) { if (element.textContent !== value) element.textContent = value; }
function showObservation(element, record) {
  element.hidden = !record?.observation;
  text(element, record?.observation ? '我的观察 · '+record.observation : '');
}
function showBroodIntent(element, batch, label='当时想看') {
  element.hidden = !batch?.intent;
  text(element, batch?.intent ? label+' · '+batch.intent : '');
}
function appendObservation(container,record,tag='p') {
  if (!record.observation) return;
  const note=node(tag,'crystal-keeper-note');
  showObservation(note,record);
  container.append(note);
}
function button(label, action, className = '') {
  const result = node('button', className, label); result.type = 'button';
  if (action) result.addEventListener('click', action);
  return result;
}
function field(label, control) { const result = node('label', 'crystal-field'); result.append(node('span', '', label), control); return result; }
function select(id) { const result = node('select'); result.id = id; return result; }
export {options as updateSelectOptions};
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
function globalFree(state) { const {animals,reserved}=counts(state); return 50-animals-reserved; }
function roomFree(state,tank) { const {animals,reserved}=counts(state,tank.id); return tank.capacity-animals-reserved; }

// UI only: all persistence, time advancement and world mutations belong to the bridge.
export function createCrystalPanel({getState, getActiveTank, getPairingKey = () => null, getSelected = () => null, getActivity = () => null, getMeal, captureTankPhoto, aq, onSelect = () => {}, onSurvey, onAction, onReadGrowth, onSwitch, onStart, onFocus, onQuiet, onFeedNearby, onReadMeal, onTankError, isFilled = () => true}) {
  const dock = document.getElementById('dock-bar');
  if (!dock) throw new Error('养成面板缺少操作栏');
  let busy = false, disposed = false, selectedId = null, sellId = null, commissionChoice = null, activePage = 'roster';
  const drafts = new Map(), rosterRows = new Map(), batchRows = new Map(), tankButtons = new Map();
  const growthLinks = new Map();
  let familyOrigin = null;
  let tankWriter = null;
  let broodReturn = null;
  const broodTrail=[];
  const lineageBack=button('',()=>{
    const last=broodTrail.pop(),row=batchRows.get(last?.from);
    if(!row?.review){clearBroodTrail();return;}
    openBroodReview(last.from);
    const history=last.pairWith && row.pairHistory;
    if(history){
      history.root.open=true;
      history.pick.value=last.pairWith;
      if(last.fromResults)history.results.open=true;
      update();
    }
    placeLineageBack(row);
    const link=(history?.root || row.review).querySelector('[data-brood-link="'+CSS.escape(last.link)+'"]');
    const section=link?.closest('details[data-lineage]');
    if(section)section.open=true;
    (link || row.review.firstElementChild).focus();
    if(history)rememberComparison(last.from);
  });
  lineageBack.id='crystal-lineage-back';
  function clearBroodTrail(){broodTrail.length=0;lineageBack.remove();}
  function placeLineageBack(row){
    lineageBack.remove();
    const previous=broodTrail.at(-1);
    if(!previous)return;
    const index=getState().batches.findIndex(b=>b.id===previous.from);
    if(index<0){clearBroodTrail();return;}
    text(lineageBack,previous.pairWith?'返回两窝对照':'返回第 '+(index+1)+' 窝手记');
    row.review.firstElementChild.after(lineageBack);
  }
  function linkedBrood(label,from,to,individualId){
    const link=button(label,()=>{
      const row=batchRows.get(to);
      if(!row?.review)return;
      if(broodTrail.at(-1)?.to!==from)clearBroodTrail();
      const history=link.closest('.crystal-pair-history');
      broodTrail.push({from,to,link:link.dataset.broodLink,pairWith:history?.querySelector('select').value,
        fromResults:!!link.closest('.crystal-pair-results')});
      openBroodReview(to,individualId);
      placeLineageBack(row);
    });
    link.dataset.broodLink=JSON.stringify([to,individualId]);
    return link;
  }
  let parentBrowseOrigin = null;
  let tankPair = null;
  let shopBrowseOrigin = null;
  let tankReturn = null;
  let rookiePhotoOrigin = null;
  const comparisonKey='aquarium.three.last-brood-comparison';
  let lastComparison=null;
  try { lastComparison=JSON.parse(sessionStorage.getItem(comparisonKey)); } catch {}
  if(!lastComparison)try { lastComparison=JSON.parse(localStorage.getItem(comparisonKey)); } catch {}
  if(lastComparison?.child==='')lastComparison.child=null;
  let upcomingBatchId = null;
  let recentBroodId = null;
  const portraits = aq ? createCrystalPortraits(aq,getState) : null;
  const portraitRequests = new WeakMap();
  let returnFocus = null;
  const panel = node('section', 'crystal-panel'); panel.id = 'crystal-panel'; panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'crystal-panel-title'); panel.setAttribute('aria-label', '水晶虾养成');
  const dockButton = button('虾册', () => { showPage('roster'); setOpen(panel.hidden); }); dockButton.id = 'crystal-open'; toolIcon(dockButton, 'roster');
  dockButton.setAttribute('aria-controls', panel.id); dockButton.setAttribute('aria-expanded', 'false');
  const head = node('div', 'crystal-head'), title = node('h2', '', '水晶虾养成'); title.id = 'crystal-panel-title';
  const heading = node('div'), growthInbox = button('',()=>openGrowthList(false),'crystal-growth-inbox');
  growthInbox.id = 'crystal-growth-inbox'; growthInbox.hidden = true;
  growthInbox.setAttribute('aria-controls','crystal-growth-messages');
  const close = button('回到缸边', () => setOpen(false), 'crystal-close'); close.dataset.keepEnabled = 'true';
  heading.append(title,growthInbox); head.append(heading, close);
  const feedback = node('p', 'crystal-feedback'); feedback.id = 'crystal-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const intro = node('div', 'crystal-intro');
  intro.append(node('p', 'crystal-lead', '虾册尚未就绪'), node('p', 'crystal-muted', '如果旧档兼容没有完成，原存档仍然保留。请从存档面板恢复有效进度。'));
  const founders=starterIndividuals(0);
  const arrivalField=node('details','crystal-arrival'), arrivalSummary=node('summary','','看看这 7 只水晶虾');
  const arrivalGrid=node('fieldset'); arrivalGrid.append(node('legend','','入住后先看'));
  const arrivalImages=[], arrivalInputs=[null,...founders].map((r,index)=>{
    const card=node('label'), radio=node('input');
    radio.type='radio'; radio.name='crystal-arrival-choice'; radio.value=String(index-1); radio.checked=!r;
    card.append(radio,node('strong','',r?nameOf(r):'整缸一起看'));
    if(r){
      const image=node('img','crystal-portrait'); image.alt=''; image.hidden=true;
      card.append(image,node('small','',(r.adultAt>0?'幼虾':sexName(r.sex))+' · '+appearance(r)));
      arrivalImages.push(image);
    }
    radio.onchange=update;
    arrivalGrid.append(card); return radio;
  });
  arrivalField.append(arrivalSummary,arrivalGrid);
  function showArrivalPortraits(){
    const state=getState();
    if(!state?.starterPending || panel.hidden || arrivalField.hidden || !arrivalField.open)return;
    starterIndividuals(0,state.growthMs,state.individuals).forEach((r,i)=>portrait(arrivalImages[i],r,0));
  }
  arrivalField.ontoggle=()=>{
    if(arrivalField.open && activePage!=='roster')showPage('roster');
    else update();
  };
  function openArrivals(){
    showPage('roster');
    arrivalField.open=!arrivalField.hidden;
    setOpen(true);
    const target=arrivalField.open ? arrivalInputs.find(input=>input.checked) : start.disabled ? filter : start;
    target.focus({preventScroll:true});
  }
  const start = button('领养第一批水晶虾 · 7 只', () => {
    const building=!isFilled('main');
    const choice=Number(arrivalInputs.find(input=>input.checked).value);
    return run(async()=>{
      if (getActiveTank()!=='main') await onSwitch('main');
      if (!building) {
        await onStart(choice<0 ? null : choice);
        selectedId=getSelected() || null;
        arrivalInputs[0].checked=true;
      }
      setOpen(false);
      if (building) document.getElementById('build-instruction')?.focus();
    },building?'已回到主缸造景。':'7 只水晶虾已经进入你搭的主缸。');
  }, 'crystal-primary'); start.id = 'crystal-start';
  const starter = node('section', 'crystal-intro'), starterHint = node('p', 'crystal-muted');
  const arrivalActions=node('div','crystal-arrival-actions'), seeResidents=button('先看缸里的虾',()=>{
    arrivalField.open=false; update(); filter.focus();
  });
  arrivalActions.append(start,seeResidents); starter.append(starterHint,arrivalField,arrivalActions);
  const game = node('div', 'crystal-game'), summary = node('div', 'crystal-summary'), funds = node('strong'), total = node('span');
  funds.id = 'crystal-funds'; total.id = 'crystal-capacity'; summary.append(funds, total);
  const currentRoom = node('p', 'crystal-current-room'); currentRoom.id = 'crystal-current-room';
  const tanks = node('div', 'crystal-tanks'); tanks.setAttribute('role','group'); tanks.setAttribute('aria-label', '当前观察的鱼缸');
  const nextStep = node('p', 'crystal-next');
  const tabs = node('div', 'crystal-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '养成内容');
  const pages = {}, tabButtons = {};
  for (const [id, label] of [['roster', '虾册'], ['breed', '选育'], ['market', '买虾 / 扩缸'], ['contest', '比赛'], ['album','相册']]) {
    const tab = button(label, () => showPage(id)); tab.id = `crystal-tab-${id}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `crystal-page-${id}`);
    const page = node('div', 'crystal-page'); page.id = `crystal-page-${id}`; page.setAttribute('role', 'tabpanel'); page.setAttribute('aria-labelledby', tab.id);
    tabs.append(tab); pages[id] = page; tabButtons[id] = tab;
  }
  const hud = node('section', 'crystal-hud'); hud.id = 'crystal-hud'; hud.hidden = true; hud.setAttribute('aria-label', '缸边状态');
  const hudTitle = node('h1', '', '我的虾缸'), care = button('查看虾群状态', () => document.getElementById('care-chip')?.click(), 'crystal-care');
  care.id = 'crystal-care'; care.setAttribute('aria-controls','care-pop'); care.setAttribute('aria-expanded','false');
  const tankMapLink=button('缸位图',()=>{
    showPage('market');setOpen(true);
    roomMapTitle.focus({preventScroll:true});roomMapTitle.scrollIntoView({block:'nearest'});
  });
  tankMapLink.id='crystal-tank-map-open';
  hud.append(hudTitle, currentRoom, summary, care, tanks, tankMapLink);
  const activity = button('', () => {
    if (growthLinks.size === 1) {
      const entry=growthLinks.values().next().value;
      if (entry.study.hidden) { entry.link.click(); return; }
    }
    if (growthLinks.size) { openGrowthList(true); return; }
    if (getState()?.starterPending) { openArrivals(); return; }
    const resume=activity.dataset.action==='resume-pair';
    const upcoming=getState()?.batches.find(b=>b.id===upcomingBatchId);
    if(!resume && upcoming?.status==='hatched'){
      const gameKey=getPairingKey();
      void visitGrowthBatch(upcoming,()=>getPairingKey()===gameKey && getState()?.batches.some(b=>b.id===upcoming.id && b.status==='hatched'));
      return;
    }
    if(resume && !pendingDraftWrite)pairingKey=null;
    showPage('breed'); setOpen(true);
    if(resume)(!mother.value ? mother : !father.value ? father : planSummary).focus();
    else if (upcomingBatchId || recentBroodId) {
      const batch=getState().batches.find(b=>b.id===(upcomingBatchId || recentBroodId));
      if(batch)openGrowthBatch(batch);
    }
  }, 'crystal-activity'); activity.id = 'crystal-activity'; activity.hidden = true;
  activity.append(nextStep);
  const shortcuts = [['breed', '选育'], ['contest', '比赛']].map(([id, label]) => {
    const control = button(label, () => {
      const state=getState(), shrimp=panel.hidden && state && inspectedInTank(state);
      const visit=tankReturn;
      showPage(id); setOpen(true);
      if(!shrimp)return;
      if(id==='contest')selectTankEntrant(state,shrimp,visit);
      else if(!state.starterPending)selectTankParent(state,shrimp);
    }); control.id = `crystal-shortcut-${id}`; toolIcon(control, id); dock.append(control); return control;
  });
  for (const [selector, icon] of [['#feed','feed'], ['[data-dock="scene"]','scene'], ['[data-dock="keep"]','keep'], ['[data-dock="observe"]','observe'], ['#wallpaper-framing-open','wallpaper'], ['#quiet-watch','observe'], ['#reset','home']]) {
    const control = dock.querySelector(selector); if (control) toolIcon(control, icon);
  }
  game.append(starter, tabs, ...Object.values(pages));
  panel.append(head, feedback, intro, game); dock.append(dockButton); document.body.append(panel);
  document.body.append(hud, activity);

  const filter = select('crystal-roster-filter'); options(filter, [{value:'live', label:'全部虾'}, {value:'current', label:'当前鱼缸'}, {value:'favorites', label:'我的收藏'}, {value:'observations', label:'写过观察的虾'}, {value:'female', label:'可选母虾'}, {value:'male', label:'可选公虾'}, {value:'juvenile', label:'成长中的幼虾'}, {value:'rest', label:'静养处'}, {value:'sold', label:'已售档案'}]);
  const search = node('input', 'crystal-search'); search.type = 'search'; search.id = 'crystal-search'; search.placeholder = '搜名字、花色、缸名或我的观察'; search.setAttribute('aria-label', '搜索虾册');
  const rosterCount = node('span', 'crystal-roster-count'), rosterHeader = node('div', 'crystal-roster-header'); rosterHeader.append(field('查看', filter), search, rosterCount);
  const pickRoomNote=node('span','crystal-roster-count');
  pickRoomNote.id='crystal-pick-room-note'; pickRoomNote.hidden=true; pickRoomNote.setAttribute('role','status');
  rosterHeader.append(pickRoomNote);
  const pickActions=node('div','crystal-pick-actions');
  const pickAnalysis=node('input'); pickAnalysis.type='checkbox'; pickAnalysis.id='crystal-pick-analysis';
  const pickAnalysisLabel=node('label','crystal-pick-analysis');
  pickAnalysisLabel.append(pickAnalysis,'按目标排序并比较品质');
  pickAnalysis.addEventListener('change',update);
  const pickThis=button('',()=>chooseParent(selectedId),'crystal-primary'); pickThis.id='crystal-pick-parent';
  const pickInTank=button('到缸里挑',()=>{
    const state=getState();
    const anchor=state?.individuals.find(r=>r.id===pickInTank.value);
    if(busy || pickInTank.hidden || !anchor || !isFilled(getActiveTank()) || !canSelectParent(state,anchor))return;
    setOpen(false);
    beginTankPair(anchor);
  });
  pickInTank.id='crystal-pick-in-tank';pickInTank.hidden=true;
  const pickHomeRoom=button('',()=>{
    if(busy || pickHomeRoom.hidden)return;
    breedingTank.value=pickHomeRoom.value;
    rememberPairing();update();
    (rosterRows.get(selectedId)?.root || filter).focus({preventScroll:true});
  });
  pickHomeRoom.id='crystal-pick-home-room'; pickHomeRoom.hidden=true;
  const backToPair=button('返回选育',()=>{
    const control=filter.value==='female' ? mother : father;
    const origin=parentBrowseOrigin;
    if(origin?.fromTank){setOpen(false);return;}
    showPage('breed');
    if(origin?.reviewId && batchRows.has(origin.reviewId))openBroodReview(origin.reviewId,origin.partnerId);
    else control.focus();
  });
  const mateGoal=select('crystal-mate-goal');
  mateGoal.setAttribute('aria-label','按哪种花色挑搭档');
  mateGoal.addEventListener('change',()=>{
    if(busy || mateGoal.hidden || activePage!=='roster')return;
    goal.value=mateGoal.value;
    rememberPairing();
    update();
  });
  const shopForMate=button('去集市看搭档',()=>{
    if(shopForMate.hidden || busy)return;
    const partner=shopForMate.dataset.partner;
    const origin={browse:parentBrowseOrigin,id:selectedId,filter:filter.value,query:search.value};
    showPage('market');
    shopBrowseOrigin=origin;
    shopMate.value=partner; shopTrait.value=qualityGoal.value;
    update(); shopMate.focus();
  });
  shopForMate.id='crystal-pick-shop'; shopForMate.hidden=true;
  pickActions.append(mateGoal,pickThis,pickInTank,pickHomeRoom,shopForMate,backToPair,pickAnalysisLabel); rosterHeader.append(pickActions);
  const roster = node('div', 'crystal-roster'); roster.id = 'crystal-roster'; roster.setAttribute('aria-label', '按身份选择一只虾');
  const rosterEmpty = node('p', 'crystal-empty');
  const detail = node('section', 'crystal-detail'); detail.id = 'crystal-individual';
  const detailTitle = node('h3'), identity = node('p', 'crystal-id'), description = node('p', 'crystal-muted'), ancestry = node('p', 'crystal-muted');
  const hero = node('img', 'crystal-portrait crystal-hero'); hero.width = 384; hero.height = 224; hero.alt = ''; hero.hidden = true;
  const heroCaption = node('p', 'crystal-portrait-status', '正在准备个体影像…');
  const pairPhotoView=createPairPhotoView({getState,getGameKey:getPairingKey,portrait});
  function broodPhotoButton(id, selected) {
    const source=button('挑另一只并排看', () => {
      if (busy) return;
      openBroodPhotos({source,firstId:selected(),photos:pairPhotoView,getState,getGameKey:getPairingKey,indexOf:familyIndex,
        portrait,tankName,sexName,pairDraftFor, isBusy:()=>busy,
        visit:async (individualId,opener,crop,returnToPhotos)=>{
          if (await focusIndividual(individualId,{source:opener,individualCrop:crop,returnToPhotos})) return null;
          return feedback.classList.contains('is-error') ? feedback.textContent : '暂时找不到这只虾，可以再试。';
        }});
    });
    source.id=id; source.setAttribute('aria-haspopup','dialog'); source.setAttribute('aria-controls','crystal-pair-photos');
    return source;
  }
  let lastIndividualPhoto=null;
  function individualPhotoCrop(record,atTank) {
    const visit=atTank && tankReturn?.id===record.id ? tankReturn : null;
    if(visit?.individualCrop || visit?.photoSpread) return visit.individualCrop ?? visit.photoSpread.crop;
    return lastIndividualPhoto?.id===record.id && lastIndividualPhoto.game===getPairingKey() ? lastIndividualPhoto.crop : 'whole';
  }
  function individualPhoto(id,image,recordFor,atTank=false) {
    const opener=pairPhotoView.trigger(id,'','个体近照',state=>{
      const record=state && recordFor(state);
      if(!record)return null;
      const name=familyIndex(state).names.get(record.id), game=getPairingKey();
      const rememberCrop=crop=>{
        lastIndividualPhoto={id:record.id,game,crop};
        if(atTank && tankReturn?.id===record.id)tankReturn.individualCrop=crop;
      };
      const where=record.soldAt!=null?'已转让':tankName(record.tank);
      const label=[sexName(record.sex),appearance(record),record.adultAt>state.now?'幼虾':'成年',where].filter(Boolean).join(' · ');
      return {owner:record.id,title:name+'的近照',initialCrop:individualPhotoCrop(record,atTank),rememberCrop,busy,
        photos:[{record,at:state.now,frame:portraits?.currentFrame(record,state.now),label,missingPhoto:!record.legacy && !hasSiblingPhoto(record)}],
        choiceLabel:'去'+where+'看它',choose:atTank || !inTank(record) ? null : async (id,crop)=>{
          rememberCrop(crop);
          const found=await focusIndividual(id,{source:focus,individualCrop:crop});
          if(!found && getPairingKey()===game && selectedId===id && opener.getClientRects().length)opener.focus();
        }};
    });
    opener.className='crystal-individual-photo'; opener.hidden=false;
    opener.append(image,node('small','crystal-enlarge','细看'));
    return opener;
  }
  const rosterPhoto=individualPhoto('crystal-roster-portrait',hero,state=>familyIndex(state).byId.get(selectedId));
  const specimen = node('div', 'crystal-specimen'); specimen.append(rosterPhoto, heroCaption);
  const selectionBadge = node('p', 'crystal-selected-label', '正在查看');
  const nameInput = node('input'); nameInput.id = 'crystal-name'; nameInput.type = 'text'; nameInput.maxLength = 32; nameInput.autocomplete = 'off'; nameInput.placeholder = '给它起一个名字';
  // Keep each draft with the animal and saved value it was written against, including after import.
  const draftKey = (r, saved) => JSON.stringify([getPairingKey(), r.id, r.adultAt, saved || '']);
  function editingRecord() {
    const state=getState();
    if (!state) return;
    if (!panel.hidden && activePage==='roster') return state.individuals.find(r=>r.id===selectedId && live(r));
    const record=tankWriter && inspectedInTank(state);
    if (record && matchesTankWriter(record)) return record;
  }
  const rename = button('保存名字', async () => {
    const record=editingRecord();
    if (!record) return;
    const id = record.id, name = nameInput.value.trim(), writer=tankWriter, key=draftKey(record,record.name);
    if (!name || [...name].length > 16) { announce('名字请填写 1–16 个字。', true); nameInput.focus(); return; }
    const previousQuery=search.value, previousFilter=filter.value;
    const saved=await run(async () => {
      await onAction({type:'rename',id,name});
      drafts.delete(key);
      if(panel.hidden || activePage!=='roster' || search.value!==previousQuery || filter.value!==previousFilter)return;
      const record=getState().individuals.find(r=>r.id===id);
      if(record && !matchesSearch(record,previousQuery.trim().toLocaleLowerCase()))search.value=record.name;
      selectedId=id;markRosterSelection();
    }, '名字已保存。');
    finishTankEdit(writer,saved,nameInput);
  }); rename.id = 'crystal-rename';
  nameInput.addEventListener('input', () => {
    const record=editingRecord();
    if (!record) return;
    const key=draftKey(record,record.name);
    if (nameInput.value===(record.name || '')) drafts.delete(key);
    else drafts.set(key,nameInput.value);
    disable(rename,nameInput.value.trim()===(record.name || ''));
  });
  nameInput.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing && event.keyCode!==229) { event.preventDefault(); rename.click(); } });
  const naming = node('div', 'crystal-row crystal-edit-name'); naming.append(field('名字', nameInput), rename);
  const observationText = node('p', 'crystal-keeper-note'); observationText.id='crystal-record-observation';
  const observationInput = node('input'); observationInput.id='crystal-observation';
  observationInput.type='text'; observationInput.autocomplete='off'; observationInput.maxLength=OBSERVATION_LIMIT*2;
  const observationDrafts = new Map();
  const saveObservation = button('保存观察', async () => {
    const record=editingRecord();
    if (!record) return;
    const key=draftKey(record,record.observation), value=observationInput.value.trim(), query=search.value, previousFilter=filter.value, writer=tankWriter;
    const committed=await run(async()=>{
      await onAction({type:'observation',id:record.id,value});
      observationDrafts.delete(key);
      if (search.value===query && filter.value===previousFilter && activePage==='roster' && !panel.hidden) {
        const saved=getState().individuals.find(r=>r.id===record.id);
        const leavesFilter=previousFilter==='observations' && !value;
        if (saved && (leavesFilter || !matchesSearch(saved,query))) {
          if (leavesFilter) filter.value='live';
          if (!matchesSearch(saved,query)) search.value='';
          selectedId=record.id; markRosterSelection();
        }
      }
    },value?'已记下你的观察。':'已清空这只虾的观察。');
    finishTankEdit(writer,committed,observationInput);
  });
  saveObservation.id='crystal-save-observation';
  observationInput.addEventListener('input',()=>{
    const record=editingRecord();
    if (!record) return;
    const saved=record.observation || '', key=draftKey(record,saved);
    if (observationInput.value===saved) observationDrafts.delete(key);
    else observationDrafts.set(key,observationInput.value);
    disable(saveObservation, observationInput.value.trim()===saved);
  });
  observationInput.addEventListener('keydown',e=>{
    if (e.key==='Enter' && !e.isComposing && e.keyCode!==229) { e.preventDefault(); saveObservation.click(); }
  });
  const observationEditor=node('div','crystal-row crystal-edit-observation');
  observationEditor.append(field('我的观察（最多 '+OBSERVATION_LIMIT+' 字）',observationInput),saveObservation);
  const identityFields=node('div','crystal-identity-fields'), identityHome=node('div');
  identityFields.append(naming,observationEditor); identityHome.append(identityFields);
  function syncIdentityFields(record) {
    const editable=live(record);
    identityFields.hidden=!editable;
    const savedName=record.name || '';
    const nameValue=(drafts.size ? drafts.get(draftKey(record,savedName)) : undefined) ?? savedName;
    if (nameInput.value!==nameValue) nameInput.value=nameValue;
    const saved=record.observation || '';
    const value=observationDrafts.size ? observationDrafts.get(draftKey(record,saved)) ?? saved : saved;
    if (observationInput.value!==value) observationInput.value=value;
    disable(nameInput,!editable); disable(rename,!editable || nameValue.trim()===savedName);
    disable(observationInput,!editable); disable(saveObservation,!editable || value.trim()===saved);
  }
  const stats = node('div', 'crystal-quality'); const statFields = ['颜色', '覆盖', '边缘'].map(label => {
    const item = node('div'), meter = node('meter'), value = node('strong'); meter.min = 1; meter.max = 9; meter.setAttribute('aria-label', label);
    item.append(node('span', '', label), meter, value); stats.append(item); return {meter, value};
  });
  const qualitySheet=node('details','crystal-parent-history');
  qualitySheet.append(node('summary','','查看成年品质'),stats);
  const juvenile = node('p', 'crystal-growing'), stateHint = node('p', 'crystal-muted');
  async function locateIndividual(id, follow, keepFollowing) {
    if (await onFocus(id,follow,keepFollowing) === false) throw new Error('这只虾暂时不在当前画面，请稍后再试。');
  }
  async function focusIndividual(id, {follow=false, keepFollowing=false, source=null, contestMark='', photoSpread=null, contestChoice=null, individualCrop=null, returnToPhotos=null}={}) {
    const record = getState()?.individuals.find(item => item.id === id); if (!record || !inTank(record)) return false;
    const found = await run(async () => {
      const previous = tankReturn, batchId = photoSpread?.batchId || source?.closest('[data-batch-id]')?.dataset.batchId;
      tankReturn = source ? {id, source, contestMark, familyOrigin, batchId, photoSpread, contestChoice, individualCrop, returnToPhotos} : null;
      try {
        await locateIndividual(record.id,follow,keepFollowing);
      } catch (error) {
        tankReturn=photoSpread && previous?.id===getSelected() ? previous : null;
        if (!tankReturn && panel.hidden && batchId) { setOpen(true); openBroodReview(batchId,id); }
        throw error;
      }
      if (!photoSpread) rememberComparison(tankReturn?.batchId,id);
      setOpen(false);
      if (follow) {
        window.showDock?.('observe');
        document.getElementById('follow-shrimp')?.focus({preventScroll:true});
      }
    }, follow ? `正在跟随${nameOf(record)}。` : `已找到${nameOf(record)}。`,
      record.tank!==getActiveTank()?`正在切换到「${tankName(record.tank)}」…`:'正在定位这只虾…');
    if (!follow && tankReturn?.id===id && !inspect.hidden) inspect.focus({preventScroll:true});
    return found === true;
  }
  const focus = button('在缸中找到它', e => focusIndividual(selectedId,{source:e.currentTarget})); focus.id = 'crystal-focus';
  const follow = button('跟随它观察', e => focusIndividual(selectedId,{follow:true,source:e.currentTarget})); follow.id = 'crystal-follow';
  function visitIndividual(id, source, contestMark = '', contestChoice = null) {
    const kid=getState().individuals.find(r=>r.id===id);
    if (!kid) return;
    if (inTank(kid)) return focusIndividual(id,{source,contestMark,contestChoice});
    const batchId=source?.closest('[data-batch-id]')?.dataset.batchId;
    rememberComparison(batchId,id);
    sellId=null; selectedId=id; filter.value=live(kid)?'rest':'sold'; search.value='';
    const fromContest=pages.contest.contains(source);
    let origin=batchId ? {batchId,id} : null;
    const lineOrigin=lineJournal.origin(source);
    if(lineOrigin)origin={lineBook:lineOrigin};
    else if(fromContest)origin={contestSource:source,recallBrood:source.dataset.recallBrood,id,contestOrigin:familyOrigin?.lineBook?familyOrigin:null};
    else if(source===visitRepresentative)origin={albumId:albumPage.value};
    showPage('roster',origin,!!origin?.batchId);
    if(origin?.recallBrood){
      records.open=true;
      moveTank.focus();
      return;
    }
    if(fromContest && !contestChoice){
      const review=[...honours.children].find(entry=>entry.dataset.card===contestSelect.value);
      if(review)review.open=true;
    }
    detailTitle.tabIndex=-1; detailTitle.focus();
  }
  function broodParentLink(parent){
    const where=inTank(parent)?'去'+tankName(parent.tank)+'看':live(parent)?'查看静养档案':'查看已售档案';
    const locate=button(sexName(parent.sex)+'「'+nameOf(parent)+'」 · '+where,e=>visitIndividual(parent.id,e.currentTarget));
    locate.dataset.broodLocate=parent.id;
    return locate;
  }
  function toggleProtection(id,batchId) {
    const record=getState()?.individuals.find(item=>item.id===id);
    if(!record)return;
    const value=!record.protected;
    return run(async()=>{
      await onAction({type:'protect',id,value});
      if(value)rememberComparison(batchId ?? birthBatchOf(id)?.id,id);
    },value?'已收藏；出售前需要先解除保护。':'已取消收藏保护。');
  }
  function broodFavorite(row,record,label,mark){
    const star=button('收藏',async()=>{
      await toggleProtection(record.id,row.root.dataset.batchId);
      if(document.activeElement===document.body && star.getClientRects().length)star.focus({preventScroll:true});
    });
    star.setAttribute('aria-label','收藏'+label);
    row.favorites.push({id:record.id,star,mark});
    return star;
  }
  const protect = button('收藏并保护', () => toggleProtection(selectedId)); protect.id = 'crystal-protect';
  const detailEntry = button('带它去常规赛', () => chooseEntrant(selectedId)); detailEntry.id = 'crystal-individual-contest';
  const detailParent = button('', () => chooseParent(selectedId)); detailParent.id = 'crystal-individual-parent';
  const honours = node('div','crystal-best'); honours.id='crystal-honours';
  const detailRookie=button('',()=>openRookie(detailRookie.dataset.batch,selectedId));
  detailRookie.id='crystal-individual-rookie';
  const detailActions = node('div', 'crystal-row'); detailActions.append(focus, follow, protect);
  const recordPhotos = button('翻看留影', e => photoAlbum.openFor(selectedId,e.currentTarget));
  recordPhotos.id='crystal-record-photos';
  const residentNames = state => familyIndex(state).names;
  const residentPortrait = (image,record,now,fallback) => portrait(image,record,now,fallback,portraits?.currentFrame(record,now));
  const restExchange = createRestExchange({
    getGameKey:getPairingKey, tankName, namesFor:residentNames, portrait:residentPortrait, onAction, announce,
    onDone(id, recalled, notice) {
      if (disposed || panel.hidden || activePage !== 'roster' || selectedId !== id) return;
      const invitation = recalled && familyOrigin?.id === id && familyOrigin.recallBrood;
      filter.value = recalled ? 'live' : 'rest';
      sellId = null;
      update();
      announce(notice);
      if (invitation) openRookie(invitation, id);
      else { detailTitle.tabIndex = -1; detailTitle.focus({preventScroll:true}); }
    }
  });
  const moveTank = select('crystal-move-tank'), move = button('移入目标缸', async () => {
    if (restExchange.open(selectedId, true, move)) return;
    const id=selectedId, recall=getState().individuals.find(r=>r.id===id)?.tank==='rest';
    const invitation=recall && familyOrigin?.id===id && familyOrigin.recallBrood;
    const origin=familyOrigin;
    let recalled=false;
    await run(async()=>{
      await onAction({type:recall?'recall':'move',id,tankId:moveTank.value});
      if(recall){filter.value='live';selectedId=id;recalled=true;}
    },recall?'已接回鱼缸。':'已移缸。');
    if(recalled && invitation && familyOrigin===origin && !disposed)openRookie(invitation,id);
  }); move.id = 'crystal-move';
  const rest = button('送去静养',()=>{
    const id=selectedId;
    if (restExchange.open(id, false, rest)) return;
    run(async()=>{await onAction({type:'rest',id});filter.value='rest';selectedId=id;sellId=null;},'已安置。随时可以选一口有空位的缸接回来。');
  }); rest.id='crystal-rest';
  const transfer = node('div', 'crystal-row'); transfer.append(field('移缸去向', moveTank), move);
  const moveHint = node('p', 'crystal-muted');
  const sell = button('出售这只 · +'+TRANSFER_PRICE, () => { sellId = selectedId; update(); sellCancel.focus(); }, 'crystal-danger'); sell.id = 'crystal-sell';
  const saleConfirm = node('div', 'crystal-confirm'); saleConfirm.hidden = true; saleConfirm.setAttribute('role', 'group'); saleConfirm.setAttribute('aria-label', '出售确认');
  const saleText = node('p'), sellCancel = button('留下它', () => { sellId = null; update(); sell.focus(); });
  const sellConfirm = button('确认出售这只', async () => {
    const id = sellId; if (!id || id !== selectedId) return;
    await run(async () => { await onAction({type:'sell', id}); sellId = null; filter.value = 'sold'; }, '已出售，个体和亲代记录保留在已售档案。');
  }, 'crystal-danger'); sellConfirm.id = 'crystal-sell-confirm';
  const saleButtons = node('div', 'crystal-row'); saleButtons.append(sellCancel, sellConfirm); saleConfirm.append(saleText, saleButtons);
  const records = node('details', 'crystal-records'); records.id = 'crystal-records';
  const family = node('details', 'crystal-records'); family.id = 'crystal-family';
  const relative = select('crystal-relative');
  const familyBack = button('', () => {
    if(familyOrigin?.lineBook){
      const {founderId,member,mode,showId}=familyOrigin.lineBook;
      showPage('album');lineJournal.openAt(founderId,member,mode,showId);
    }else if(familyOrigin?.contestSource){
      const source=familyOrigin.contestSource;
      showPage('contest',familyOrigin.contestOrigin);
      (source.getClientRects().length && !source.disabled ? source : contestSelect).focus();
    }else if(familyOrigin?.albumId){
      openAlbumPage(familyOrigin.albumId);
      if(!visitRepresentative.hidden)visitRepresentative.focus();
    }else if(familyOrigin?.batchId)showBrood(getState().batches.find(b=>b.id===familyOrigin.batchId),familyOrigin.id,true);
    else browseFamily(familyOrigin?.id, true);
  });
  const visitRelative = button('打开档案', () => browseFamily(relative.value));
  familyBack.id = 'crystal-family-back'; visitRelative.id = 'crystal-relative-open';
  const relatives = node('div','crystal-row'); relatives.append(field('亲虾、同窝与子代', relative), visitRelative);
  family.addEventListener('toggle', () => { if (family.open) update(); else familySpread.open=false; });
  function browseFamily(id, returning = false) {
    const record = getState()?.individuals.find(r => r.id === id);
    if (!record) return;
    const defaultFilter = inTank(record) ? 'live' : live(record) ? 'rest' : 'sold';
    if (!familyOrigin) familyOrigin = {id:selectedId, filter:filter.value, query:search.value, relative:id};
    const returnRelative=returning && familyOrigin.relative;
    filter.value = returning ? familyOrigin.filter : defaultFilter;
    search.value = returning ? familyOrigin.query : '';
    if (returning) familyOrigin = null;
    selectedId = id; sellId = null; update();
    // The original picker can change eligibility while the player reads a relative's record.
    if (!rosterRows.has(id)) {
      filter.value = defaultFilter; search.value = ''; selectedId = id; update();
    }
    if(returnRelative && [...relative.options].some(option=>option.value===returnRelative))relative.value=returnRelative;
    onSelect(inTank(record) && record.tank === getActiveTank() ? id : null);
    detailTitle.tabIndex = -1; detailTitle.focus();
  }
  function showBrood(batch,id,keepBroodPath=false){
    if(!batch)return;
    showPage('breed',null,keepBroodPath);
    if(panel.hidden)setOpen(true);
    if(id==null && matchesComparison(batch))reopenComparison(batch);
    else openBroodReview(batch.id,id);
  }
  function showRecordBrood(batch,source,individualId){
    if(!batch)return;
    const id=selectedId, previousFilter=filter.value, query=search.value;
    const picker=parentBrowseOrigin, origin=familyOrigin;
    const fromPhoto=familySpread.contains(source) && {base:parentBroods.value,other:familyPeer.value,child:individualId};
    showBrood(batch,individualId);
    const row=batchRows.get(batch.id);
    if(!row)return;
    const shrimp=getState().individuals.find(r=>r.id===id);
    broodReturn=button('返回「'+nameOf(shrimp)+'」'+(['female','male'].includes(previousFilter)?'继续挑亲虾':'的档案'),()=>{
      filter.value=previousFilter;search.value=query;selectedId=id;parentBrowseOrigin=picker;
      showPage('roster',origin);
      markRosterSelection();
      if(fromPhoto && selectedId===id){
        family.open=true; update();
        if(!familySpread.hidden){
          parentBroods.value=fromPhoto.base; familySpread.open=true; update();
          familyPeer.value=fromPhoto.other; update();
          const card=familyPhotos.querySelector('[data-pair-child="'+CSS.escape(fromPhoto.child)+'"]');
          (card || familySpread.firstElementChild).focus();return;
        }
      }
      if(selectedId!==id || !source.getClientRects().length){
        search.focus();announce('原来的选项已变化，可以在当前名单里继续挑。');return;
      }
      if(source===openParentBrood)parentBroods.value=batch.id;
      source.focus();
    });
    broodReturn.id='crystal-brood-return';
    row.heading.after(broodReturn);
  }
  const birthBatchOf=id=>getState()?.batches.find(b=>b.children.some(child=>child.id===id));
  const birthBrood=button('查看它出生的这一窝',()=>showRecordBrood(birthBatchOf(selectedId),birthBrood,selectedId));
  birthBrood.id='crystal-birth-brood';
  const parentBroods=select('crystal-parent-broods');
  const openParentBrood=button('打开这窝手记',()=>showRecordBrood(getState().batches.find(b=>b.id===parentBroods.value),openParentBrood,selectedId));
  openParentBrood.id='crystal-parent-brood-open';
  const broodHistory=node('div','crystal-row');
  broodHistory.append(field('它作为亲虾的窝次',parentBroods),openParentBrood);
  const familySpread=node('details','crystal-records crystal-family-spread');
  familySpread.id='crystal-family-spread'; familySpread.hidden=true;
  const familyPeer=select('crystal-family-peer'), familyPeerField=field('与哪一窝并排看',familyPeer);
  const familyCommon=node('div'), familyPhotos=node('div','crystal-pair-spread');
  familySpread.append(node('summary','','并排看不同搭档的孩子'),familyCommon,familyPeerField,familyPhotos);
  let familyPhotoKey=null;
  function clearFamilyPhotos(){
    if(familyPhotoKey===null)return;
    familyPhotoKey=null; familyCommon.replaceChildren(); familyPhotos.replaceChildren();
  }
  familySpread.addEventListener('toggle',()=>{ if(familySpread.open)update();else clearFamilyPhotos(); });
  familyPeer.addEventListener('change',update);
  parentBroods.addEventListener('change',()=>{
    if(!familySpread.open)return;
    if(getState().batches.find(b=>b.id===parentBroods.value)?.status!=='complete')familySpread.open=false;
    update();
  });
  const maternalBrood=button('查看它带的这一窝',()=>showRecordBrood(currentMaternalBrood(getState(),selectedId),maternalBrood,selectedId));
  maternalBrood.id='crystal-maternal-brood';
  function openLineBook(founderId,member=founderId,mode='kept'){
    showPage('album');lineJournal.openAt(founderId,member,mode);
  }
  const startLine=button('从它开始写选育手记',()=>openLineBook(selectedId));
  startLine.id='crystal-line-start';
  const familyBroodPhotos=broodPhotoButton('crystal-individual-brood-photos',()=>selectedId);
  const memberBooks=node('div','crystal-row');
  family.append(node('summary', '', '查看家系'), ancestry, relatives, familyBroodPhotos, startLine, memberBooks, birthBrood, broodHistory,familySpread);
  records.append(node('summary', '', '名字、观察、移缸与静养'), identityHome, identity, transfer, moveHint, rest, sell, saleConfirm);
  const activities=node('div','crystal-repeat'); activities.append(detailParent,detailRookie,detailEntry);
  detail.append(selectionBadge, detailTitle, familyBack, description, specimen, observationText, recordPhotos, detailActions, qualitySheet, juvenile, activities, family, honours, stateHint, maternalBrood, records);
  const shelf = node('div', 'crystal-shelf'); shelf.append(rosterHeader, roster, rosterEmpty);
  pages.roster.append(shelf, detail);
  function inspectedInTank(state){
    const id=getSelected(), tank=getActiveTank();
    return state?.individuals.find(r=>r.id===id && r.tank===tank && inTank(r));
  }
  function canChooseFromObservation(visit){
    return !visit || visit.source===focus || visit.source===follow || pages.album.contains(visit.source);
  }
  function viewingParentCandidate(visit){
    return !!parentBrowseOrigin && (visit?.source===focus || visit?.source===follow) &&
      (filter.value==='female' || filter.value==='male');
  }
  function canUseViewedParent(state,kid){
    if(!kid || kid.sex!==filter.value || !canSelectParent(state,kid))return false;
    const partnerId=parentBrowseOrigin?.partnerId;
    if((filter.value==='female'?father:mother).value!==partnerId)return false;
    return !partnerId || state.individuals.some(r=>r.id===partnerId && canSelectParent(state,r));
  }
  function openInspectedRecord(id=getSelected(),origin=null){
    selectedId=id; filter.value='live'; search.value=''; sellId=null;parentBrowseOrigin=null;
    showPage('roster',origin); setOpen(true);
  }
  const inspect = button('', () => {
    if (tankReturn && tankReturn.id===getSelected()) {
      const {source,id,batchId,photoSpread,familyOrigin:origin,returnToPhotos}=tankReturn;
      familyOrigin=origin;
      setOpen(true);
      if (returnToPhotos?.()) return;
      if (photoSpread) {
        const row=batchRows.get(batchId);
        if (row && activePage==='breed' && siblingView.open(batchId,null,source,row.detail,photoSpread)) return;
        tabButtons[activePage].focus(); return;
      }
      if(source.isConnected && source.getClientRects().length && !source.disabled){source.focus();return;}
      if(batchId && activePage==='breed'){
        const row=batchRows.get(batchId);
        if(row){
          openBroodReview(batchId,id);
          row.root.querySelector(`[data-brood-locate="${CSS.escape(id)}"]`)?.focus();
          return;
        }
      }
      tabButtons[activePage].focus();
      return;
    }
    openInspectedRecord(); detailTitle.tabIndex=-1; detailTitle.focus();
  }, 'crystal-inspect'); inspect.id = 'crystal-inspect'; inspect.hidden = true;
  const inspectImage = node('img', 'crystal-portrait'), inspectCopy = node('span'), inspectName = node('strong'), inspectHint = node('span'); inspectImage.alt = ''; inspectImage.width = 144; inspectImage.height = 84;
  const tankPhoto=individualPhoto('crystal-tank-portrait',inspectImage,inspectedInTank,true);
  const subjectRow=node('div','crystal-tank-subject'); subjectRow.append(tankPhoto,inspect);
  const photoReturn = node('small','crystal-photo-return','返回同窝近照'); photoReturn.hidden=true;
  const tankObservation=node('small','crystal-keeper-note'); tankObservation.id='crystal-tank-observation';
  const inspectCard=node('div');inspectCard.id='crystal-at-tank';
  const tankGrowth=node('details','crystal-tank-growth'), growthToggle=node('summary','','对照小时候和双亲');
  tankGrowth.id='crystal-tank-growth'; tankGrowth.hidden=true;
  const referenceTools=node('div','crystal-family-references');
  referenceTools.setAttribute('role','group'); referenceTools.setAttribute('aria-label','左边想看谁');
  const lineageCaption=node('p','crystal-lineage-caption');
  lineageCaption.id='crystal-tank-lineage-caption'; lineageCaption.hidden=true;
  lineageCaption.setAttribute('aria-live','polite');
  const familyTrail=[];
  let tankReference=null, nextAncestor=null;
  let familyRoom='', familyCrop='whole';
  function chosenParentPhoto() {
    if (!familyTrail.length && (!tankReference || tankReference==='hatch')) return null;
    return {role:tankReference, trail:familyTrail.slice(), crop:familyCrop};
  }
  function rememberFieldReference(keep=true) {
    const study=broodWatch.familyStudy;
    if (study && study.batchId===tankGrowth.dataset.brood) study.reference=keep ? chosenParentPhoto() : null;
  }
  const referenceButtons=new Map();
  const tankFamilyBack=button('返回上一步',previousFamily);
  tankFamilyBack.id='crystal-tank-lineage-back'; tankFamilyBack.hidden=true; referenceTools.append(tankFamilyBack);
  for(const [key,label] of [['hatch','小时候'],['mother','母虾'],['father','公虾']]){
    const choice=button(label,()=>{tankReference=key;rememberFieldReference();update();});
    choice.dataset.reference=key; referenceButtons.set(key,choice); referenceTools.append(choice);
  }
  function showFamilyChoices(selected,showHatch){
    for(const [key,choice] of referenceButtons){
      choice.hidden=key==='hatch' && !showHatch;
      const pressed=String(key===selected);
      if(choice.getAttribute('aria-pressed')!==pressed)choice.setAttribute('aria-pressed',pressed);
    }
  }
  const lineageNext=button('',()=>{
    if(!tankGrowth.open || !nextAncestor)return;
    familyTrail.push(nextAncestor); tankReference=null;
    rememberFieldReference();
    update();
    referenceButtons.get('mother').focus({preventScroll:true});
  },'crystal-lineage-link');
  lineageNext.id='crystal-tank-lineage-next'; lineageNext.hidden=true;
  function previousFamily(){
    const step=familyTrail.pop();
    if(!step)return;
    tankReference=step.role; rememberFieldReference(); update();
    (lineageNext.hidden?referenceButtons.get(step.role):lineageNext).focus({preventScroll:true});
  }
  // Look up only recorded births. Discard the index along with its immutable breeding snapshot.
  const familyIndexes=new WeakMap();
  function familyIndex(state){
    let index=familyIndexes.get(state);
    if(!index){
      const births=new Map();
      for(const batch of state.batches){
        if(batch.status!=='hatched' && batch.status!=='complete')continue;
        for(const kid of batch.children)births.set(kid.id,batch);
      }
      index={births,byId:new Map(state.individuals.map(r=>[r.id,r])),names:individualNames(state)};
      familyIndexes.set(state,index);
    }
    return index;
  }
  const growthPhotos=node('div','crystal-tank-photos');
  let growthPairPhotos=null;
  const familyCloseup=pairPhotoView.trigger('crystal-family-closeup','并排细看','亲子与成长近照',()=>growthPairPhotos);
  const growthPictures=['刚孵化','现在'].map(label=>{
    const plate=node('figure'), image=node('img','crystal-portrait crystal-size-photo'), status=node('small'), caption=node('figcaption','',label);
    image.width=144; image.height=84; image.hidden=true; image.alt=label+'的样子';
    const photo=pairPhotoView.thumbnail(familyCloseup,image,'并排细看'+(label==='现在'?'眼前这只虾':'对照照片'));
    plate.append(photo,status,caption); growthPhotos.append(plate);
    return {image,status,caption};
  });
  const growthIntent=node('p','crystal-keeper-note crystal-brood-intent');
  const parentObservation=node('p','crystal-keeper-note');
  parentObservation.hidden=true;
  tankGrowth.append(growthToggle,lineageCaption,referenceTools,growthPhotos,familyCloseup,lineageNext,parentObservation,growthIntent);
  growthToggle.addEventListener('click',()=>{if(tankGrowth.open)rememberFieldReference(false);});
  tankGrowth.addEventListener('toggle',()=>{
    if(tankGrowth.open){
      rememberFieldReference();
      for(const {image} of growthPictures)if(image.dataset.portraitFailed)portraitRequests.delete(image);
    }
    update();
  });
  tankGrowth.addEventListener('keydown',event=>{
    if(event.key==='Escape' && tankGrowth.open){
      event.preventDefault();event.stopPropagation();
      if(familyTrail.length)previousFamily();
      else {rememberFieldReference(false);tankGrowth.open=false;growthToggle.focus({preventScroll:true});}
    }
  });
  function updateTankGrowth(record,birth,state,current){
    const study=broodWatch.familyStudy;
    const available=birth && birth.hatchAt<birth.adultAt && record.colour && record.pattern &&
      (broodWatch.root.hidden || study?.batchId===birth.id);
    const room=available ? JSON.stringify([getPairingKey(),record.tank,birth.id,birth.plannedAt,birth.motherId,birth.fatherId,!!study]) : '';
    const owner=available ? JSON.stringify([room,record.id]) : '';
    if(tankGrowth.dataset.owner!==owner){
      // Only a parent deliberately picked for this brood can follow the keeper to another child.
      const previous=room===familyRoom && tankGrowth.open ? chosenParentPhoto() : null;
      const held=available && (study ? study.reference : previous);
      familyRoom=room; familyCrop=held?.crop ?? 'whole';
      tankGrowth.dataset.owner=owner; tankGrowth.dataset.brood=available ? birth.id : '';
      tankReference=held?.role ?? null; familyTrail.length=0; nextAncestor=null;
      if(held)familyTrail.push(...held.trail);
      tankGrowth.open=!!held;
      lineageCaption.hidden=true; tankFamilyBack.hidden=true; lineageNext.hidden=true;
      // A native disclosure can repopulate a frame after it opens. Clear the previous family immediately.
      for(const {image,status,caption} of growthPictures){
        portraitRequests.delete(image); image.removeAttribute('src'); image.hidden=true; image.alt='';
        status.hidden=true; text(caption,'');
      }
      parentObservation.hidden=true; growthIntent.hidden=true;
    }
    tankGrowth.hidden=!available;
    if(!available || !tankGrowth.open){growthPairPhotos=null;familyCloseup.hidden=true;}
    if(!available)return;
    const hasChildhood=current.growth>0;
    text(growthToggle,tankGrowth.open?'收起对照':hasChildhood?'对照小时候和双亲':'和双亲比一比');
    if(!tankGrowth.open){
      if(!familyTrail.length)showFamilyChoices(tankReference || (hasChildhood?'hatch':null),hasChildhood);
      return;
    }
    const {byId,births,names}=familyIndex(state);
    let anchor=record, brood=birth, anchorAt=birth.plannedAt;
    for(let i=0;i<familyTrail.length;i++){
      const step=familyTrail[i], parentId=brood[step.role+'Id'];
      const parent=byId.get(parentId), origin=births.get(parentId);
      if(parentId!==step.id || !parent || !origin || origin.id!==step.birthId){
        familyTrail.length=i; tankReference=null; break;
      }
      anchorAt=brood.plannedAt; anchor=parent; brood=origin;
    }
    const upstream=familyTrail.length>0, anchorName=names.get(anchor.id);
    tankFamilyBack.hidden=lineageCaption.hidden=!upstream;
    if(upstream){
      text(lineageCaption,'往上 '+(familyTrail.length+1)+' 代 · 「'+anchorName+'」的双亲');
      referenceTools.setAttribute('aria-labelledby',lineageCaption.id);
    }else referenceTools.removeAttribute('aria-labelledby');
    const selected=tankReference || (!upstream && hasChildhood?'hatch':null);
    showFamilyChoices(selected,!upstream && hasChildhood);
    showBroodIntent(growthIntent,brood,upstream?'育出「'+anchorName+'」时想看':undefined);
    const [reference,today]=growthPictures;
    const isHatch=selected==='hatch';
    const parent=selected && !isHatch ? byId.get(brood[selected+'Id']) : null;
    const subject=isHatch?record:parent || (upstream?anchor:null);
    const label=parent?sexName(parent.sex)+' · '+names.get(parent.id):isHatch?'刚孵化':upstream?anchorName:'亲虾';
    const pairedAt=parent?brood.plannedAt:anchorAt;
    text(reference.caption,subject && !isHatch?label+' · 配对时':label);
    reference.image.alt=subject?label+'的样子':'';
    if(subject?.colour && subject.pattern){
      portrait(reference.image,subject,isHatch?birth.hatchAt:pairedAt,reference.status);
    }else{
      portraitRequests.delete(reference.image); reference.image.hidden=true; reference.image.removeAttribute('src');
      reference.status.hidden=false; text(reference.status,selected?'花色未记录':'点选一只亲虾');
    }
    const origin=parent && births.get(parent.id);
    nextAncestor=origin?{role:selected,id:parent.id,birthId:origin.id}:null;
    lineageNext.hidden=!nextAncestor;
    if(nextAncestor)text(lineageNext,'看「'+names.get(parent.id)+'」的双亲');
    const noted=isHatch?null:subject;
    parentObservation.hidden=!noted?.observation;
    if(!parentObservation.hidden)text(parentObservation,'我给「'+names.get(noted.id)+'」记的 · '+noted.observation);
    const name=inspectName.textContent;
    text(today.caption,'现在 · '+name); today.image.alt='眼前的'+name;
    portrait(today.image,record,state.now,today.status,current);
    familyCloseup.hidden=!hasSiblingPhoto(subject) || !hasSiblingPhoto(record);
    growthPairPhotos=familyCloseup.hidden?null:{
      owner:JSON.stringify([owner,anchor.id,brood.id]), showBodySize:true, initialCrop:familyCrop,
      rememberCrop:crop=>{familyCrop=crop;rememberFieldReference();},
      photos:[
        {record:subject,at:isHatch?birth.hatchAt:pairedAt,label:isHatch?'刚孵化 · '+name:reference.caption.textContent,showObservation:!isHatch},
        {record,at:state.now,label:today.caption.textContent,frame:current}
      ],
      references:[...referenceButtons].filter(([,button])=>!button.hidden).map(([key,button])=>({key,button}))
    };
  }
  const tankFavorite=button('收藏',async()=>{
    const id=tankFavorite.dataset.individual;
    if(inspect.hidden || id!==getSelected()){update();return;}
    await toggleProtection(id);
    if(document.activeElement===document.body && !inspect.hidden && getSelected()===id) tankFavorite.focus({preventScroll:true});
  });
  tankFavorite.id='crystal-tank-favorite';
  const tankNameButton=button('名字与观察',()=>{
    const state=getState(), record=state && inspectedInTank(state);
    if(busy || inspect.hidden || !record || tankNameButton.dataset.individual!==record.id)return;
    tankWriter={id:record.id,adultAt:record.adultAt,room:record.tank,game:getPairingKey()};
    tankEditor.prepend(identityFields); tankEditor.hidden=false; tankActions.hidden=true;
    tankNameButton.setAttribute('aria-expanded','true');
    syncIdentityFields(record); showTankInput(false);
  });
  tankNameButton.id='crystal-tank-name';
  const tankEditor=node('div','crystal-tank-editor');
  tankEditor.id='crystal-tank-editor'; tankEditor.hidden=true; tankEditor.setAttribute('role','group');
  tankEditor.setAttribute('aria-label','在缸边记录'); tankNameButton.setAttribute('aria-controls',tankEditor.id);
  tankNameButton.setAttribute('aria-expanded','false');
  const tankEditStatus=node('p'); tankEditStatus.setAttribute('role','status');
  const switchTankInput=button('改名字',()=>showTankInput(tankEditor.dataset.field!=='name'));
  const closeTankInput=button('收起',()=>closeTankEditor(true));
  const tankEditFooter=node('div','crystal-tank-edit-footer');
  tankEditFooter.append(switchTankInput,closeTankInput); tankEditor.append(tankEditStatus,tankEditFooter);
  function matchesTankWriter(record) {
    return tankWriter && record?.id===tankWriter.id && record.tank===tankWriter.room &&
      record.adultAt===tankWriter.adultAt && getPairingKey()===tankWriter.game;
  }
  function showTankInput(editName) {
    tankEditor.dataset.field=editName?'name':'observation';
    text(switchTankInput,editName?'写观察':'改名字'); announce('');
    const input=editName?nameInput:observationInput;
    input.focus({preventScroll:true}); if(editName)input.select();
  }
  function closeTankEditor(restoreFocus=false) {
    if(!tankWriter)return;
    tankWriter=null; identityHome.append(identityFields); tankEditor.hidden=true; tankActions.hidden=false;
    tankNameButton.setAttribute('aria-expanded','false');
    if(restoreFocus && panel.hidden && !inspect.hidden)tankNameButton.focus({preventScroll:true});
  }
  function finishTankEdit(writer,saved,input) {
    if(!writer || writer!==tankWriter)return;
    if(!saved){input.focus({preventScroll:true});return;}
    const record=editingRecord();
    if(record && input===nameInput && observationDrafts.has(draftKey(record,record.observation)))showTankInput(false);
    else if(record && input===observationInput && drafts.has(draftKey(record,record.name)))showTankInput(true);
    else closeTankEditor(true);
  }
  tankEditor.addEventListener('input',()=>{ if(tankEditStatus.classList.contains('is-error'))announce(''); });
  tankEditor.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape' && !event.isComposing && event.keyCode!==229){event.preventDefault();if(!busy)closeTankEditor(true);}
  });
  tankEditor.addEventListener('keyup',event=>event.stopPropagation());
  const feedNearby=button('在它附近加餐',()=>onFeedNearby(feedNearby.dataset.id,feedNearby.dataset.action==='review'));feedNearby.id='crystal-feed-nearby';
  const feedAgain=button('重新在它附近投喂',()=>{
    const id=feedAgain.dataset.id, meal=getMeal?.(id);
    if(!busy && !inspect.hidden && meal?.active && !meal.recent)onFeedNearby(id,false);
  });
  feedAgain.id='crystal-feed-again';
  feedAgain.title='换一次加餐，重新记录来吃的虾';
  const mealHistory=button('上次来吃过 · 看名单',()=>{
    const id=getSelected();
    if(!busy && !inspect.hidden && getMeal?.(id)?.pastVisitor)onReadMeal(id);
  });
  mealHistory.id='crystal-meal-history';mealHistory.hidden=true;
  function focusSibling(id) {
    const row=tankReturn?.batchId && birthBatchOf(id)?.id===tankReturn.batchId ? batchRows.get(tankReturn.batchId) : null;
    const photoSpread=row && tankReturn.photoSpread;
    const source=photoSpread ? tankReturn.source : row?.root.querySelector(`[data-brood-locate="${CSS.escape(id)}"]`) || row?.heading;
    return focusIndividual(id,{source,keepFollowing:true,photoSpread});
  }
  function siblingVisitOrder(batch, id, residents, direction) {
    const spread=tankReturn?.photoSpread;
    if (spread?.batchId===batch.id && spread.ids.every(Boolean) && spread.ids.includes(id)) {
      const members=spread.ids.map(chosen=>residents.find(kid=>kid.id===chosen)).filter(Boolean);
      return {fromPhotos:true, members};
    }
    return {fromPhotos:false, members:orderBrood(residents,direction)};
  }
  function quietBrood(id) {
    const batch=birthBatchOf(id);
    if(!batch)return null;
    const order=batch.children.map(k=>getState().individuals.find(r=>r.id===k.id)).filter(Boolean);
    const trait=batch.status==='complete' && batch.id===tankReturn?.batchId && batchRows.get(batch.id)?.reviewMode?.value;
    const {fromPhotos,members}=siblingVisitOrder(batch,id,order.filter(inTank),breedingDirection(trait));
    return {fromPhotos, members:members.map(k=>({id:k.id,label:broodName(k,order)}))};
  }
  async function visitSibling(event) {
    const control=event.currentTarget, id=control.dataset.individual;
    update();
    if(inspect.hidden || control.hidden || busy || control.dataset.individual!==id)return;
    await focusSibling(id);
    if(!control.hidden && !inspect.hidden)control.focus({preventScroll:true});
  }
  const prevSibling=button('看同窝上一只',visitSibling), nextSibling=button('看同窝下一只',visitSibling);
  prevSibling.id='crystal-prev-sibling';prevSibling.hidden=true;
  nextSibling.id='crystal-next-sibling';nextSibling.hidden=true;
  const tankActions=node('div','crystal-tank-actions');
  const pairTray=node('section','crystal-tank-pair'), pairAnchor=node('strong'), pairHint=node('p');
  const anchorPhoto=node('img','crystal-portrait'), anchorLook=node('small');
  anchorPhoto.alt='';anchorPhoto.width=100;anchorPhoto.height=58;anchorPhoto.hidden=true;
  const anchorCard=node('div','crystal-held-parent'), anchorCopy=node('div');
  anchorCopy.append(pairAnchor,anchorLook);anchorCard.append(anchorPhoto,anchorCopy);
  pairTray.id='crystal-tank-pair';pairTray.hidden=true;
  pairAnchor.id='crystal-tank-pair-anchor';pairAnchor.tabIndex=-1;
  pairTray.setAttribute('aria-labelledby',pairAnchor.id);pairHint.setAttribute('role','status');
  const useMate=button('',()=>finishTankPick(true),'crystal-primary');
  const heldCloseup=pairPhotoView.trigger('crystal-held-closeup','并排细看','缸边挑的两只虾',state=>{
    const anchor=currentAnchor(state), mate=state && inspectedInTank(state);
    if(!anchor || !mate || mate.sex===anchor.sex || !canSelectParent(state,mate))return null;
    const data=anchor.sex==='female' ? parentPhotos(state,anchor.id,mate.id) : parentPhotos(state,mate.id,anchor.id);
    return data && {...data,busy,draftPair:pairDraftFor(state,anchor,mate,()=>finishTankPick(true))};
  });
  useMate.id='crystal-tank-mate-use';
  const survey=button('再看整缸',()=>{onSurvey();update();pairAnchor.focus({preventScroll:true});});
  const listMates=button('从虾册挑',()=>finishTankPick(false));
  const cancelPick=button('取消',cancelTankPick);
  cancelPick.setAttribute('aria-label','取消挑搭档');
  const pickTools=node('div','crystal-tank-pair-tools');
  pickTools.append(heldCloseup,survey,listMates,cancelPick);pairTray.append(anchorCard,pairHint,useMate,pickTools);
  function beginTankPair(anchor,goals,visit){
    const returnTo=visit && {visit,filter:filter.value,query:search.value};
    tankPair={id:anchor.id,home:anchor.tank,viewRoom:getActiveTank(),nextRoom:null,adultAt:anchor.adultAt,game:getPairingKey(),goals,returnTo};
    tankReturn=null;tankGrowth.open=false;
    if(anchorPhoto.dataset.portraitFailed)portraitRequests.delete(anchorPhoto);
    onSurvey();update();pairAnchor.focus({preventScroll:true});
  }
  function currentAnchor(state){
    if(!tankPair || !state || tankPair.game!==getPairingKey())return null;
    const room=getActiveTank();
    if(room!==tankPair.viewRoom && room!==tankPair.nextRoom)return null;
    return state.individuals.find(r=>r.id===tankPair.id && r.tank===tankPair.home &&
      r.adultAt===tankPair.adultAt && canSelectParent(state,r));
  }
  function beginMateRoomVisit(room){
    const held=tankPair;
    if(!held || !currentAnchor(getState()))return;
    if(!isFilled(room))throw Error('这口缸还没注水，挑搭档可以去已经注水的缸。');
    // A room change can repaint both before and after the save is written.
    held.nextRoom=room;
    text(pairHint,'正在去'+tankName(room)+'…');
    return ()=>{
      if(tankPair!==held)return;
      if(getActiveTank()===room)held.viewRoom=room;
      held.nextRoom=null;
      update();
    };
  }
  function cancelTankPick(){
    const state=getState(), anchor=currentAnchor(state), returnTo=tankPair?.returnTo;
    const atHome=anchor && getActiveTank()===anchor.tank;
    tankPair=null;
    if(atHome && returnTo){
      filter.value=returnTo.filter;search.value=returnTo.query;selectedId=anchor.id;
      tankReturn=returnTo.visit;onSelect(anchor.id);
    }else if(atHome && !inspectedInTank(state))onSelect(anchor.id);
    update();(inspect.hidden?dockButton:inspect).focus({preventScroll:true});
  }
  function finishTankPick(useViewed){
    if(busy || !tankPair || !panel.hidden)return;
    const state=getState(), anchor=currentAnchor(state);
    if(!anchor){update();return;}
    const mate=useViewed && inspectedInTank(state);
    if(useViewed && (!mate || useMate.value!==mate.id || mate.sex===anchor.sex || !canSelectParent(state,mate))){update();return;}
    const goals=tankPair.goals;tankPair=null;
    selectedId=anchor.id;
    chooseParent(anchor.id,{...goals,fromTank:true,mateId:mate?.id});
  }
  function updateTankPick(state,viewed){
    const anchor=currentAnchor(state);
    if(tankPair && !anchor){
      tankPair=null;
      onTankError?.('本次挑选已结束，可从虾册查看亲虾的近况。');
    }
    pairTray.hidden=!anchor;inspectCard.toggleAttribute('data-picking',!!anchor);
    if(anchor && tanks.parentNode!==pairTray)pairTray.insertBefore(tanks,pairHint);
    else if(!anchor && tanks.parentNode!==hud)hud.insertBefore(tanks,tankMapLink);
    tanks.hidden=!!anchor && !state.tanks.some(t=>t.id!==getActiveTank() && isFilled(t.id));
    if(!anchor)return;
    const room=getActiveTank(), roomName=tankName(room);
    const wanted=anchor.sex==='female'?'male':'female', sex=sexName(wanted);
    text(pairAnchor,'已选'+sexName(anchor.sex)+'「'+tankIdentity(state,anchor)+'」');
    text(anchorLook,appearance(anchor)+' · 住在'+tankName(anchor.tank));
    portrait(anchorPhoto,anchor,state.now,null);
    const eligible=viewed && viewed.sex===wanted && canSelectParent(state,viewed);
    heldCloseup.hidden=!(eligible && hasSiblingPhoto(anchor) && hasSiblingPhoto(viewed));
    useMate.hidden=!eligible;useMate.value=eligible?viewed.id:'';useMate.disabled=busy;
    survey.hidden=!viewed;listMates.disabled=busy;
    let hint='在'+roomName+'里点一只'+sex+'看看。';
    if(eligible){
      text(useMate,'选「'+tankIdentity(state,viewed)+'」作搭档');
      hint='看中它就选为搭档，也可以继续看别的。';
    }else if(!state.individuals.some(r=>r.tank===room && r.sex===wanted && canSelectParent(state,r))){
      hint=roomName+'暂时没有能配对的'+sex+(tanks.hidden?'。':'，可以换一缸看看。');
    }else if(viewed && viewed.id!==anchor.id){
      if(viewed.legacy)hint='这是原有观赏虾，请再看看缸里的水晶虾。';
      else if(viewed.adultAt>state.now)hint='它还在长大，成年后才能配对。';
      else if(locked(state,viewed.id))hint='它已有一窝在进行，可以再看看别的虾。';
      else hint='眼前这只也是'+sexName(anchor.sex)+'，再看看'+sex+'。';
    }
    text(pairHint,tankPair.nextRoom && room!==tankPair.nextRoom ? '正在去'+tankName(tankPair.nextRoom)+'…' : hint);
  }
  function readPhotoBrood({id, individualId}) {
    const batch = familyIndex(getState()).births.get(individualId);
    if (!batch) return;
    showBrood(batch,individualId);
    const row = batchRows.get(batch.id);
    if (!row) return;
    broodReturn = button('回相册看这张留影', () => {
      showPage('album'); photoAlbum.reopen(id);
    });
    broodReturn.id = 'crystal-brood-return';
    row.heading.after(broodReturn);
  }
  async function frameRetake(id,source){
    if(busy)throw Error('请等当前操作完成后再取景。');
    const fromChildren=broodWatch.root.contains(source);
    const alreadyHere=panel.hidden && !inspect.hidden && inspectedInTank(getState())?.id===id;
    if(!alreadyHere && !await focusIndividual(id,{source:fromChildren ? null : source})){
      throw Error(feedback.textContent || '暂时找不到这只虾，请稍后再试。');
    }
    if(fromChildren){broodWatch.close();update();}
    if(inspect.hidden || inspectedInTank(getState())?.id!==id)throw Error('眼前的虾已变化，请重新取景。');
    return shutter;
  }
  async function surveyPhotoTank(record) {
    if (busy) throw Error('请等当前操作完成后再回缸。');
    const room = record.tank, key = getPairingKey();
    if (getActiveTank() !== room && !await run(() => onSwitch(room), '已到'+tankName(room)+'。', '正在换缸…')) {
      throw Error(feedback.textContent || '换缸未完成，可以再试一次。');
    }
    const resident = getState()?.individuals.find(r => r.id === record.id);
    if (key !== getPairingKey() || getActiveTank() !== room || !resident || resident.tank !== room || !inTank(resident)) {
      throw Error('这只虾的住处已变，请重新打开照片。');
    }
    tankReturn = tankPair = null;
    broodWatch.close();
    setOpen(false);
    onSurvey();
    return dockButton;
  }
  const photoAlbum=createTankPhotoAlbum({getState,getActiveTank,getTankKey:getPairingKey,familyIndex,capture:captureTankPhoto,onAction,onVisit:visitIndividual,onReadBrood:readPhotoBrood,frameRetake,surveyPhotoTank,updateTank:()=>{update();return inspect.hidden ? dockButton : shutter;},nameOf,tankName});
  const siblingView=createSiblingView({
    getState,getGameKey:getPairingKey,nameInBrood:broodName,portrait,
    keepStudy:action=>onAction({type:'keepSiblingStudy',...action}),
    tankOf:record=>inTank(record) ? tankName(record.tank) : '',
    async visitInTank(id,source,photoSpread){
      const anchor=source?.isConnected ? source : batchRows.get(photoSpread.batchId)?.detail;
      if (!anchor || busy) return '请稍后再试。';
      const found=await focusIndividual(id,{source:anchor,photoSpread});
      return found ? '' : feedback.textContent || '暂时无法定位这只虾。';
    }
  });
  const shutter=button('拍照',()=>{
    const state=getState(), record=state && inspectedInTank(state);
    if(busy || inspect.hidden || !record || shutter.dataset.individual!==record.id)return;
    try { photoAlbum.take(record,shutter); } catch(error) { onTankError?.(error.message); }
  });
  shutter.id='crystal-tank-shutter';
  shutter.hidden=typeof captureTankPhoto!=='function';
  const tankPhotos=button('翻看留影',e=>photoAlbum.openFor(getSelected(),e.currentTarget));
  tankPhotos.id='crystal-tank-photo-history';
  function updatePhotoLink(control,record,state) {
    const count=state.tankPhotos?.filter(photo=>photo.individualId===record.id).length || 0;
    control.hidden=count===0;
    if(count) {
      control.disabled=busy;
      control.setAttribute('aria-label','翻看留影，'+nameOf(record)+'，共'+count+'张');
    }
  }
  const tankQuiet=button('静观看它',()=>{
    if(!busy && !inspect.hidden && tankQuiet.dataset.individual===getSelected())onQuiet(getSelected(),tankQuiet);
  });
  tankQuiet.id='crystal-tank-quiet';
  const tankBrood=button('看出生手记',()=>{
    const child=tankBrood.dataset.child, selected=getSelected();
    update();
    if(!busy && !inspect.hidden && !tankBrood.hidden && selected===tankBrood.dataset.individual && child===tankBrood.dataset.child)
      showBrood(birthBatchOf(selected),child);
  });
  tankBrood.id='crystal-tank-brood';
  const tankBreed=button('用它育下一代',()=>{
    const state=getState();
    if(!state || busy || inspect.hidden || tankBreed.hidden)return;
    const kid=inspectedInTank(state);
    if(!kid || kid.id!==tankBreed.dataset.individual || !canSelectParent(state,kid))return;
    const birth=state.batches.find(b=>b.status==='complete' && b.children.some(k=>k.id===kid.id));
    const visit=tankReturn?.id===kid.id ? tankReturn : null;
    if(viewingParentCandidate(visit)){
      if(!canUseViewedParent(state,kid)){update();return;}
      setOpen(true);chooseParent(kid.id);
      if(mother.value && father.value)planSummary.focus();
    }else if(birth && visit?.batchId===birth.id){
      breedChild(birth,kid);
    }else if(canChooseFromObservation(visit)){
      beginTankPair(kid,{goal:birth?.goal,qualityGoal:birth?.qualityGoal},visit);
    }
  });
  tankBreed.id='crystal-tank-next-generation';tankBreed.hidden=true;
  const tankRace=button('',()=>{
    const id=getSelected();
    if(busy || inspect.hidden || tankRace.hidden || id!==tankRace.dataset.individual)return;
    const card=tankRace.dataset.card, visit=tankReturn;
    if(visit?.contestChoice){
      if(!canSwapViewedEntrant(getState(),id,visit)){update();return;}
      setOpen(true);
      if(!contestCompare.hidden && !swapEntrant.hidden && canSwapViewedEntrant(getState(),id,visit))swapEntrant.click();
      return;
    }
    setOpen(true);
    const invitation=card.startsWith('rookie:') && getState().batches.find(b=>'rookie:'+b.id===card);
    if(invitation && (!invitation.rookieEntry || invitation.rookieEntry.entrantId===id))openRookie(invitation.id,id,visit);
    else chooseEntrant(id,card.startsWith('rookie:')?'':card);
    if(!contestResult.hidden){resultHeading.tabIndex=-1;resultHeading.focus();}
  });
  tankRace.id='crystal-tank-race';tankRace.hidden=true;
  function openParentHistory(id,batchId){
    family.open=true;
    openInspectedRecord(id);
    parentBroods.value=batchId;
    parentBroods.focus();
  }
  const broodWatch=createBroodWatch({
    getState,getSelected,getActiveTank,familyIndex,tankName,broodName,refresh:update,survey:onSurvey,readBrood:showBrood,readHistory:openParentHistory,
    updateBroodShelf:photoAlbum.updateBroodShelf,
    visitRoom:id=>run(()=>onSwitch(id),'已到'+tankName(id)+'。','正在去'+tankName(id)+'…'),
    portrait:(image,record,at,caption,crop)=>{
      if(record?.colour && record.pattern) return portrait(image,record,at,caption,portraits?.currentFrame(record,at),crop!=='whole',crop);
      portraitRequests.delete(image); image.removeAttribute('src'); image.hidden=true;
      caption.hidden=false; text(caption,'花色未记录');
    },
    leave:parentId=>{
      update();
      const back = parentId && parentId===getSelected() && !tankClutch.hidden ? tankClutch : !inspect.hidden ? inspect : activity;
      back.focus({preventScroll:true});
    },
    visit:(record,origin)=>run(async()=>{
      const previous=tankReturn;
      tankReturn=origin;
      try { await locateIndividual(record.id,false,true); }
      catch(error){tankReturn=previous?.id===getSelected()?previous:null;throw error;}
    },'已找到'+nameOf(record)+'。',record.tank===getActiveTank()?'正在定位这只虾…':'正在切换到「'+tankName(record.tank)+'」…')
  });
  const tankClutch=button('查看繁育手记',()=>{
    const id=getSelected();
    if(busy || inspect.hidden || tankClutch.hidden || tankClutch.dataset.individual!==id)return;
    const broods=getState().batches.filter(batch=>isRecordedParent(batch,id));
    const target=broods.find(batch=>batch.id===tankClutch.dataset.batch);
    if(hasHatched(target)){broodWatch.open(id,target.id,tankReturn);update();return;}
    if(target){showBrood(target,id);return;}
    if(!broods.length)return;
    openParentHistory(id,broods.at(-1).id);
  });
  tankClutch.id='crystal-tank-clutch';
  tankActions.append(tankQuiet,shutter,tankPhotos,tankFavorite,tankNameButton,feedNearby,feedAgain,mealHistory,prevSibling,nextSibling,tankBrood,tankBreed,tankClutch,tankRace);
  inspectCopy.append(inspectName, photoReturn, inspectHint, tankObservation); inspect.append(inspectCopy);inspectCard.append(subjectRow,pairTray,broodWatch.root,photoAlbum.reference,tankGrowth,tankActions,tankEditor);document.body.append(inspectCard);
  const filterChanged = event => {
    if(event.target===filter){
      mateComparison.reset();
      pickAnalysis.checked=false;
      if(['female','male'].includes(filter.value))qualitySheet.open=false;
    }
    if (!['female','male'].includes(filter.value)) parentBrowseOrigin=null;
    familyOrigin=null; sellId=null; update();
  };
  filter.addEventListener('change', filterChanged); search.addEventListener('input', filterChanged); moveTank.addEventListener('change', update);

  const mother = select('crystal-mother'), father = select('crystal-father'), breedingTank = select('crystal-breeding-tank'), broodSize = select('crystal-brood-size');
  options(broodSize, [{value:'2', label:'小窝 · 2 只'}, {value:'4', label:'标准窝 · 4 只'}]);
  const parents = node('div', 'crystal-parents');
  function parentPhotos(state,motherId,fatherId) {
    if(!state || !motherId || !fatherId)return null;
    const {byId,names}=familyIndex(state);
    const pair=[byId.get(motherId),byId.get(fatherId)];
    if(!pair.every(hasSiblingPhoto))return null;
    return {owner:JSON.stringify([motherId,fatherId]),photos:pair.map(record=>({
      record,at:state.now,label:sexName(record.sex)+' · '+names.get(record.id)
    }))};
  }
  let draftPhotoCrop=null;
  const pairCloseup=pairPhotoView.trigger('crystal-pair-closeup','并排细看亲虾','亲虾近照',state=>{
    const data=parentPhotos(state,mother.value,father.value);
    if (data && draftPhotoCrop?.owner===data.owner) {
      data.initialCrop=draftPhotoCrop.crop;
      data.rememberCrop=crop=>{draftPhotoCrop.crop=crop;};
    }
    return data;
  });
  function pairDraftFor(state, first, second, useTankPick) {
    if (!first || !second || first.sex===second.sex || !canSelectParent(state,first) || !canSelectParent(state,second)) return null;
    const [dam,sire]=first.sex==='female' ? [first,second] : [second,first];
    const storageKey=pairingStorageKey();
    const draft=pairingKey===storageKey || !storageKey ? {mother:mother.value,father:father.value} : readPairing(storageKey);
    const priorMother=draft?.mother || '', priorFather=draft?.father || '';
    const replacing=(priorMother && priorMother!==dam.id) || (priorFather && priorFather!==sire.id);
    let previous='';
    if (replacing) {
      const names=familyIndex(state).names;
      const existing=[[priorMother,'母虾'],[priorFather,'公虾']].filter(([id])=>names.has(id));
      if (existing.length) previous='草稿里原先选了'+existing.map(([id,role])=>role+'「'+names.get(id)+'」').join('和')+'。';
    }
    return {
      key:JSON.stringify([dam.id,sire.id,priorMother,priorFather]),previous,
      label:replacing ? '换成这两只去选育' : priorMother===dam.id && priorFather===sire.id ? '查看这对的选育草稿' : '带这两只去选育',
      use(crop) {
        if (useTankPick) useTankPick();
        else {
          showPage('breed');
          const started=mother.value || father.value || goal.value || qualityGoal.value || draftOrder || pairIntent.input.value.trim()
            || breedingTank.selectedIndex>0 || broodSize.selectedIndex>0;
          if (!started) restoreChoice(breedingTank,first.tank);
          mother.value=dam.id; father.value=sire.id;
          update(); planSummary.focus();
        }
        if (activePage==='breed' && mother.value===dam.id && father.value===sire.id)
          draftPhotoCrop={owner:JSON.stringify([dam.id,sire.id]),crop};
      }
    };
  }
  const mateComparison=createMateComparison({
    photos:pairPhotoView,getState,familyIndex,tankName,refresh:update,
    getPicker:()=>{
      const sex=filter.value;
      if(panel.hidden || pages.roster.hidden || (sex!=='female' && sex!=='male'))return null;
      return {sex,role:sexName(sex),partner:(sex==='female'?father:mother).value,
        game:getPairingKey(),row:rosterRows.get(selectedId)?.root,search,busy};
    },
    choose:id=>{
      if(busy)return;
      const record=getState()?.individuals.find(r=>r.id===id);
      if(!record || record.sex!==filter.value || !canSelectParent(getState(),record))return;
      selectedId=id;
      markRosterSelection();
      chooseParent(id);
    }
  });
  pickThis.after(mateComparison.root);
  function browseParents(sex,id,{contest,reviewId,fromTank=false}={}) {
    mateComparison.reset();
    pickAnalysis.checked=false;
    qualitySheet.open=false;
    parentBrowseOrigin={id:selectedId,filter:filter.value,query:search.value,contest,reviewId,fromTank,partnerId:sex==='female'?father.value:mother.value,initialGoal:goal.value};
    filter.value=sex; search.value=''; sellId=null;
    selectedId=id || null;
    showPage('roster');if(id)markRosterSelection();
    (rosterRows.get(selectedId)?.root || roster.firstElementChild || filter).focus();
  }
  function finishParentBrowse() {
    const origin=parentBrowseOrigin;
    parentBrowseOrigin=null;
    if(!origin || !['female','male'].includes(familyOrigin?.filter || filter.value))return false;
    filter.value=origin.filter;search.value=origin.query;selectedId=origin.id;sellId=null;
    return true;
  }
  function markRosterSelection() {
    const record=getState()?.individuals.find(r=>r.id===selectedId);
    onSelect(record && inTank(record) && record.tank===getActiveTank()?record.id:null);
  }
  const parentCards = [mother, father].map((control, index) => {
    const card = node('section'), image = node('img', 'crystal-portrait'), info = node('p'), traits = node('small');
    image.alt = ''; image.hidden = true;
    const history = node('details','crystal-parent-history'), historyTitle = node('summary'), entries = node('div');
    history.append(historyTitle,entries);
    history.addEventListener('toggle', () => { if (history.open) update(); });
    const sex=index ? 'male' : 'female';
    const browse=button('看图挑'+sexName(sex),()=>browseParents(sex,control.value));
    browse.dataset.browseParent=sex;
    const scores=node('details','crystal-parent-history');
    scores.append(node('summary','','查看品质'),traits);
    const observation=node('p','crystal-keeper-note');
    const photo=pairPhotoView.thumbnail(pairCloseup,image,'并排细看亲虾，'+sexName(sex)+'照片');
    card.append(field(sexName(sex), control), browse, photo, info, observation, scores, history); parents.append(card);
    return {image, info, observation, traits, scores, history, historyTitle, entries};
  });
  const pastOffspring=button('',()=>{
    const row=batchRows.get(pastOffspring.value);
    if(!row?.review)return;
    clearBroodTrail();
    broodReturn?.remove();
    openBroodReview(pastOffspring.value);
    const history=row.pairHistory;
    if(history){
      history.root.open=true;
      update();
      rememberComparison(pastOffspring.value);
    }
    const heading=history?.heading || row.review.firstElementChild;
    broodReturn=button('返回选亲',()=>{
      broodReturn.remove();broodReturn=null;
      clearBroodTrail();
      (pastOffspring.hidden?mother:pastOffspring).focus();
    });
    broodReturn.id='crystal-brood-return';
    heading.after(broodReturn);
    heading.focus();
  });
  pastOffspring.id='crystal-past-offspring';
  const chance = node('p', 'crystal-odds'), goal = select('crystal-brood-goal');
  const goalChoices = ['red','black'].flatMap(colour => ['mosura','band','hinomaru'].map(pattern => {
    const value = colour + ':' + pattern; return {value, label:goalLabel(value)};
  }));
  options(goal, goalChoices, '随缘，先看看这一窝');
  function branchButtons(container, pick) {
    const buttons=goalChoices.map(({value,label})=>{
      const choice=button('',()=>pick(value));
      container.append(choice);
      return {value,label,choice};
    });
    return (outcomes, selected)=>{
      for(const {value,label,choice} of buttons){
        const branch=outcomes.find(o=>o.key===value);
        choice.hidden=!branch;
        if(branch)text(choice,label+' · '+branch.probability*100+'%');
        if(selected!==undefined)choice.setAttribute('aria-pressed',String(!!branch && selected===value));
      }
    };
  }
  const possibleTargets=node('details','crystal-parent-history'), targetButtons=node('div','crystal-pick-actions');
  possibleTargets.id='crystal-pair-rules';
  targetButtons.id='crystal-offspring-choices';
  targetButtons.setAttribute('role','group');
  const targetLabel=node('p','crystal-muted','每只幼虾可能的花色 · 点一下设为这窝的目标，再点取消');
  targetLabel.id='crystal-offspring-label'; targetButtons.setAttribute('aria-labelledby',targetLabel.id);
  possibleTargets.append(node('summary','','查看这对的花色概率'),targetLabel,targetButtons,chance,
    node('p','crystal-muted','体色影响红黑的浓淡和白纹的明亮程度。覆盖看白色占多少，边缘看花纹交界有多清楚。斑块的细微位置和弧度因虾而异。'));
  const showTargetBranches=branchButtons(targetButtons,value=>{
    if(busy)return;
    goal.value=goal.value===value?'':value;
    update();
  });
  const qualityGoal = select('crystal-quality-goal'), goals = node('div','crystal-row'), targetHint = node('p','crystal-muted');
  targetHint.id = 'crystal-quality-target'; qualityGoal.setAttribute('aria-describedby',targetHint.id);
  const qualityChoices=breedingDirections.map(({value,label,pattern})=>({value,label:pattern?label+'（条带纹）':label}));
  options(qualityGoal, qualityChoices, '暂不指定');
  goals.append(field('想育出的花色',goal),field('这窝想观察什么',qualityGoal));
  let draftOrder=null;
  let pairingKey,lastPairing=null,pendingDraftWrite=null;
  const draftWriteMessage='浏览器暂时存不下这份选亲草稿，当前页面保留了你的选择。';
  const retryPairing=button('重试保存草稿',()=>{
    if (!pendingDraftWrite || pendingDraftWrite.key!==pairingStorageKey() || busy) return;
    if (rememberPairing(true)) { announce('选亲草稿已保存。'); planSummary.focus(); }
  });
  retryPairing.id='crystal-retry-pairing'; retryPairing.hidden=true;
  function clearDraftWriteFailure() {
    if (!pendingDraftWrite) return;
    pendingDraftWrite=null; retryPairing.hidden=true;
    if (feedback.textContent===draftWriteMessage) announce('');
  }
  function pairingStorageKey(){
    const gameKey=getPairingKey();
    return gameKey && 'aquarium.three.pairing-draft.'+gameKey;
  }
  function broodIntentEditor(mode) {
    const root=node('details','crystal-parent-history crystal-intent-editor'), summary=node('summary'), input=node('input');
    input.id='crystal-'+mode+'-intent'; input.type='text'; input.autocomplete='off'; input.maxLength=OBSERVATION_LIMIT*2;
    root.append(summary,field('配对时的想法（最多 '+OBSERVATION_LIMIT+' 字）',input));
    let storageKey;
    function caption(){
      const value=input.value.trim();
      text(summary,value && !root.open ? '这窝想看 · '+value : '给这窝留句话');
    }
    function remember(){
      caption();
      input.removeAttribute('aria-invalid');
      if(!storageKey)return;
      try {
        if(input.value)localStorage.setItem(storageKey,input.value);
        else localStorage.removeItem(storageKey);
      } catch { announce('这句话暂时只能留在当前页面。',true); }
    }
    input.addEventListener('input',event=>{if(!event.isComposing)remember();});
    input.addEventListener('compositionend',remember);
    input.addEventListener('keydown',event=>{
      if(event.isComposing || event.keyCode===229 || !['Escape','Enter'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();root.open=false;summary.focus();
    });
    root.addEventListener('toggle',caption);caption();
    return {root,input,remember,
      restore(gameKey){
        storageKey=gameKey ? gameKey+'.'+mode+'-intent' : null;
        input.value=''; root.open=false; input.removeAttribute('aria-invalid');
        try { if(storageKey)input.value=(localStorage.getItem(storageKey) || '').slice(0,input.maxLength); } catch {}
        caption();
      },
      committed(raw){
        if(input.value!==raw)return;
        try { if(storageKey && localStorage.getItem(storageKey)===raw)localStorage.removeItem(storageKey); } catch {}
        input.value='';root.open=false;input.removeAttribute('aria-invalid');caption();
      },
    };
  }
  const pairIntent=broodIntentEditor('pair'), naturalIntent=broodIntentEditor('natural');
  const reuseIntent=button('',()=>{
    if(!reuseIntent.value || pairIntent.input.value.trim())return;
    pairIntent.input.value=reuseIntent.value;pairIntent.remember();pairIntent.input.focus();update();
  });
  reuseIntent.id='crystal-reuse-intent';reuseIntent.hidden=true;pairIntent.root.append(reuseIntent);
  function readPairing(key){
    try { return key && JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function pendingPairHint(state){
    const key=pairingStorageKey();
    const draft=pendingDraftWrite && pendingDraftWrite.key===key ? pendingDraftWrite.draft : readPairing(key);
    if(!draft || typeof draft!=='object' || Array.isArray(draft))return '';
    const parent=(id,sex)=>state.individuals.find(r=>r.id===id && r.sex===sex && canSelectParent(state,r));
    const dam=parent(draft.mother,'female'), sire=parent(draft.father,'male');
    if(dam && sire)return `选亲草稿 · ${nameOf(dam)}和${nameOf(sire)}\n查看配对与空位`;
    if(dam || sire)return `选亲草稿 · 已选${nameOf(dam || sire)}\n继续挑${dam?'公':'母'}虾`;
    return '选亲草稿 · 双亲待选\n继续挑母虾';
  }
  function rememberPairing(retry=false){
    if(!pairingKey || busy)return false;
    const draft={mother:mother.value,father:father.value,tank:breedingTank.value,size:broodSize.value,
      goal:goal.value,quality:qualityGoal.value,order:draftOrder?.id};
    const value=JSON.stringify(draft);
    if(lastPairing!==null && value!==lastPairing){
      if (!retry && pendingDraftWrite?.value===value && pendingDraftWrite.key===pairingKey) return false;
      try {
        if(mother.value || father.value || goal.value || qualityGoal.value || draftOrder || broodSize.selectedIndex>0 || breedingTank.selectedIndex>0)
          localStorage.setItem(pairingKey,value);
        else if(localStorage.getItem(pairingKey)===lastPairing)localStorage.removeItem(pairingKey);
      } catch {
        pendingDraftWrite={key:pairingKey,value,draft}; retryPairing.hidden=false;
        announce(draftWriteMessage,true); return false;
      }
    }
    lastPairing=value; clearDraftWriteFailure(); return true;
  }
  function restoreChoice(control,value){
    control.value=value ?? '';
    if(control.selectedIndex<0)control.selectedIndex=0;
  }
  const orderNote=node('div','crystal-row'), orderText=node('span','crystal-muted');
  orderNote.hidden=true;
  orderNote.append(orderText,button('移除求购目标',()=>{draftOrder=null;update();goal.focus();}));
  const brood = node('div', 'crystal-row'); brood.append(field('繁育位置', breedingTank), field('这一窝', broodSize));
  const planSummary = node('p', 'crystal-plan-summary'); planSummary.id = 'crystal-plan-summary'; planSummary.tabIndex=-1;
  const spaceContexts={direct:null,natural:null};
  const spacePicker=createBroodSpacePicker({getState,contextFor:mode=>spaceContexts[mode],isFilled,namesFor:residentNames,tankName,options,onAction,announce,
    portrait:residentPortrait});
  const roomHelp=button('为这一窝腾位置',e=>spacePicker.open('direct',e.currentTarget,plan));
  const naturalHelp=button('为主缸这一窝腾位置',e=>spacePicker.open('natural',e.currentTarget,naturalPlan));
  roomHelp.id='crystal-room-help'; naturalHelp.id='crystal-natural-room-help';
  for(const trigger of [roomHelp,naturalHelp]){
    trigger.setAttribute('aria-haspopup','dialog'); trigger.setAttribute('aria-controls','crystal-space-picker'); trigger.hidden=true;
  }
  function spaceContext(tank,size,mother,father,roomShort,globalShort){
    return {tank,size,mother,father,roomShort:Math.max(0,roomShort),globalShort:Math.max(0,globalShort),
      key:JSON.stringify([getPairingKey(),tank,size,mother,father])};
  }
  function arrangeBrood(action){
    const editor=action.type==='natural'?naturalIntent:pairIntent, raw=editor.input.value;
    let intent;
    try { intent=validateObservation(raw.trim()); }
    catch(error){
      editor.root.open=true;editor.input.setAttribute('aria-invalid','true');editor.input.focus();announce(error.message,true);return;
    }
    return run(async()=>{
      const {batchId}=await onAction(intent ? {...action,intent} : action);
      editor.committed(raw);
      if(action.type==='plan' && pairingKey){
        try { if(localStorage.getItem(pairingKey)===lastPairing)localStorage.removeItem(pairingKey); } catch {}
        lastPairing=null; clearDraftWriteFailure();
      }
      if(!disposed && !panel.hidden && activePage==='breed'){
        update();
        batchRows.get(batchId)?.heading.focus();
      }
    },'这一窝已记入同窝手记。');
  }
  const plan = button('安排这一窝', () => arrangeBrood({type:'plan', motherId:mother.value, fatherId:father.value, tankId:breedingTank.value, size:Number(broodSize.value), ...(goal.value ? {goal:goal.value} : {}), ...(qualityGoal.value ? {qualityGoal:qualityGoal.value} : {}), ...(draftOrder ? {commissionGoal:draftOrder.id} : {})}), 'crystal-primary'); plan.id = 'crystal-plan';
  function smallBroodChoice(size,confirm){
    const choice=button('改为 2 只小窝',()=>{
      size.value='2';
      update();
      confirm.focus();
    });
    choice.hidden=true;
    return choice;
  }
  const smallPlan=smallBroodChoice(broodSize,plan);
  const alternateRoom=button('',()=>{
    breedingTank.value=alternateRoom.value;
    update(); (plan.disabled?planSummary:plan).focus();
  });
  alternateRoom.id='crystal-alternate-room'; alternateRoom.hidden=true;
  const batchList = node('div', 'crystal-batches'); batchList.id = 'crystal-batches';
  const batchEmpty = node('p', 'crystal-empty', '还没有安排后代。先选一对亲虾，试一窝小的。');
  const natural = node('details', 'crystal-natural'), naturalSize = select('crystal-natural-size'); options(naturalSize, [{value:'2', label:'小窝 · 2 只'}, {value:'4', label:'标准窝 · 4 只'}]);
  const naturalSummary = node('p', 'crystal-plan-summary'); naturalSummary.id = 'crystal-natural-summary';
  let naturalPreview=null;
  const naturalCloseup=pairPhotoView.trigger('crystal-natural-closeup','并排细看这对','主缸这对亲虾',state=>parentPhotos(state,naturalPreview?.motherId,naturalPreview?.fatherId));
  const naturalPlan = button('确认主缸繁殖这一窝', () => arrangeBrood({type:'natural',size:Number(naturalSize.value),expectedPair:naturalPreview})); naturalPlan.id = 'crystal-natural-plan';
  const smallNatural=smallBroodChoice(naturalSize,naturalPlan);
  const naturalTargets=node('details','crystal-parent-history'), choices=node('div','crystal-pick-actions');
  naturalTargets.append(node('summary','','查看自然配对的花色概率'),node('p','crystal-muted','点选花色可用这对亲虾定向选育。'),choices);
  const showNaturalBranches=branchButtons(choices,value=>{
    if(!naturalPreview || busy)return;
    mother.value=naturalPreview.motherId; father.value=naturalPreview.fatherId;
    goal.value=value; broodSize.value=naturalSize.value; draftOrder=null;
    breedingTank.value=getState().unified?'main':'breeding';
    natural.open=false; update(); goal.focus();
  });
  natural.append(node('summary', '', '也可以让主缸自然繁殖一窝'), node('p', 'crystal-muted', '主缸会从成年且空闲的虾里选一对，不搬动亲虾。这次只安排一窝，之后不会自动续生。'), field('主缸这一窝', naturalSize), naturalIntent.root, naturalSummary, naturalCloseup,smallNatural,naturalHelp,naturalPlan,naturalTargets);
  naturalSize.addEventListener('change', update); natural.addEventListener('toggle',()=>{if(natural.open)update();});
  const pairing = node('section','crystal-leaf'), journal = node('section','crystal-leaf');
  pairing.append(node('h3', '', '选亲'), parents, pairCloseup, pastOffspring, goals, targetHint, orderNote, pairIntent.root, possibleTargets, brood, planSummary,retryPairing,alternateRoom,smallPlan,roomHelp, plan, node('p', 'crystal-muted', '公虾在配对形成后可再安排；母虾等这窝成年后才能再配。形成前可取消，亲虾仍留在当前缸。'), natural);
  function matchesComparison(batch){
    return (batch.status==='hatched' || batch.status==='complete') && batch.id===lastComparison?.batch && batch.plannedAt===lastComparison.at &&
      batch.motherId===lastComparison.mother && batch.fatherId===lastComparison.father &&
      (!lastComparison.gameKey || lastComparison.gameKey===getPairingKey()) &&
      (!lastComparison.parent || isRecordedParent(batch,lastComparison.parent)) && (lastComparison.child===null || batch.children.some(c=>c.id===lastComparison.child));
  }
  function comparisonSubject(batch,find){
    const parent=find(lastComparison.parent),kid=find(lastComparison.child);
    if(parent)return sexName(parent.sex)+'「'+nameOf(parent)+'」';
    return kid?broodName(kid,batch.children.map(c=>find(c.id))):'';
  }
  function rememberComparison(batchId,individualId){
    if(!batchId)return;
    const batches=getState().batches, batch=batches.find(b=>b.id===batchId);
    if(!batch || (batch.status!=='hatched' && batch.status!=='complete'))return;
    individualId ||= matchesComparison(batch)?lastComparison.parent || lastComparison.child:null;
    const parent=isRecordedParent(batch,individualId)?individualId:null;
    const child=parent?null:individualId;
    if(child && !batch.children.some(c=>c.id===child))return;
    const view=batchRows.get(batchId)?.reviewMode?.value || '';
    lastComparison={batch:batch.id,at:batch.plannedAt,mother:batch.motherId,father:batch.fatherId,gameKey:getPairingKey(),child,parent,view};
    if(view==='growth' && batchRows.get(batchId).growthAge.value==='middle')lastComparison.growthAge='middle';
    const history=batchRows.get(batchId)?.pairHistory;
    const peer=history?.root.open && batches.find(b=>b.id===history.pick.value);
    if(peer){
      lastComparison.pairWith=peer.id;
      lastComparison.pairAt=peer.plannedAt;
      if(history.spread.contains(document.activeElement))lastComparison.pairChild=document.activeElement.dataset.pairChild;
    }
    const bookmark=JSON.stringify(lastComparison);
    try { sessionStorage.setItem(comparisonKey,bookmark); } catch {}
    try { localStorage.setItem(comparisonKey,bookmark); } catch {}
  }
  function reopenComparison(batch,individualId){
    const row=batchRows.get(batch.id), mode=row?.reviewMode;
    const {pairWith,pairAt,pairChild,child,parent}=lastComparison;
    if(mode) {
      const saved=lastComparison.view ?? lastComparison.trait;
      mode.value=Array.from(mode.options).some(option=>option.value===saved) ? saved : '';
      if(mode.value==='growth')row.growthAge.value=lastComparison.growthAge==='middle'?'middle':'hatch';
    }
    const subject=individualId || parent || child;
    openBroodReview(batch.id,subject);
    const history=row?.pairHistory;
    if(pairWith && history && Array.from(history.pick.options).some(option=>option.value===pairWith) &&
      getState().batches.some(b=>b.id===pairWith && b.plannedAt===pairAt)){
      history.pick.value=pairWith;
      history.root.open=true;
      update();
      const photo=pairChild && history.spread.querySelector('[data-pair-child="'+CSS.escape(pairChild)+'"]');
      if(!individualId && photo)photo.focus();
      else if(!subject)history.heading.focus();
      rememberComparison(batch.id,subject);
    }
  }
  function openGrowthBatch(batch){
    const resume=matchesComparison(batch);
    let individual=resume ? lastComparison.child || lastComparison.parent : null;
    if(batch.status==='complete'){
      const children=new Set(batch.children.map(child=>child.id));
      const saved=getState().individuals.filter(record=>record.protected && children.has(record.id));
      if(saved.length===1)individual=saved[0].id;
      else if(saved.length>1){openBroodReview(batch.id);return;}
    }
    if(resume)reopenComparison(batch,individual);
    else openBroodReview(batch.id,batch.status==='formed'?batch.motherId:individual);
  }
  const resumeComparison=button('',()=>{
    const batch=getState()?.batches.find(matchesComparison);
    if(batch && !busy)reopenComparison(batch);
  });
  resumeComparison.id='crystal-resume-comparison';resumeComparison.hidden=true;
  pairing.firstElementChild.after(resumeComparison);
  const growthList = node('div','crystal-growth-messages');
  growthList.id = 'crystal-growth-messages';
  journal.append(node('h3', '', '同窝手记'), growthList, batchList, batchEmpty);
  growthList.hidden = true;
  const growthDialog=node('dialog','crystal-growth-dialog');
  growthDialog.id='crystal-growth-dialog';
  growthDialog.setAttribute('aria-labelledby','crystal-growth-title');
  const growthHead=node('header'), growthTitle=node('h2','','成长消息');
  growthTitle.id='crystal-growth-title';
  growthHead.append(growthTitle,button('回到缸边',()=>closeGrowthList(true)));
  growthDialog.append(growthHead);
  document.body.append(growthDialog);
  growthDialog.addEventListener('cancel',e=>{e.preventDefault();closeGrowthList(true);});
  growthDialog.addEventListener('keydown',e=>e.stopPropagation());
  growthDialog.addEventListener('keyup',e=>e.stopPropagation());
  pages.breed.append(pairing, journal);
  for (const control of [mother, father, breedingTank, broodSize, goal, qualityGoal]) control.addEventListener('change', update);

  const buyTank = select('crystal-buy-tank'), shop = node('div', 'crystal-shop'), shopRows = new Map();
  let chosenBuyTank=null;
  const purchaseSpace=node('p','crystal-muted');
  const shopMate=select('crystal-shop-mate'), mateTraits=node('p','crystal-muted');
  const returnToPicker=button('返回挑搭档',()=>{
    if(!shopBrowseOrigin || busy)return;
    const origin=shopBrowseOrigin;
    filter.value=origin.filter; search.value=origin.query; selectedId=origin.id; parentBrowseOrigin=origin.browse;
    showPage('roster');
    (shopForMate.hidden?filter:shopForMate).focus();
  });
  returnToPicker.id='crystal-shop-return-picker'; returnToPicker.hidden=true;
  const shopTrait=select('crystal-shop-trait'), traitField=field('试配时想观察什么',shopTrait);
  options(shopTrait,qualityChoices,'只看后代花色');
  shopTrait.addEventListener('change',update);
  shopMate.addEventListener('change',update);
  pages.market.append(node('h3', '', '挑一只亲虾'),returnToPicker,node('p', 'crystal-muted', '每只虾只出售一次。'), field('买入后放到', buyTank),purchaseSpace,field('拿自家的虾试配',shopMate),mateTraits,traitField,shop);
  for (const product of shopCatalogue()) {
    const item=node('section','crystal-shop-item'), info=node('div'), heading=node('h4');
    heading.tabIndex=-1;
    const image=node('img','crystal-portrait'); image.alt=''; image.width=144; image.height=84;
    const art=node('span','crystal-shop-art'); art.append(image);
    const preview={...product,adultAt:0};
    const traits=node('p','crystal-muted');
    const forecast=node('p','crystal-baseline');
    const visit=button('',e=>visitIndividual(visit.dataset.individual,e.currentTarget)); visit.hidden=true;
    const draftPair=button('带这对去选育',()=>{
      update();
      if(draftPair.hidden || busy)return;
      const mateId=shopMate.value, boughtId=visit.dataset.individual;
      showPage('breed');
      mother.value=product.sex==='female'?boughtId:mateId;
      father.value=product.sex==='male'?boughtId:mateId;
      qualityGoal.value=shopTrait.value;
      update();planSummary.focus();
    });
    const purchase=button('买入这只',async()=>{
      const tankId=buyTank.value;
      await run(()=>onAction({type:'buy',productId:product.id,tankId}),`「${product.name}」已住进${tankName(tankId)}。`);
      if (!visit.hidden && activePage==='market' && !panel.hidden) (draftPair.hidden?visit:draftPair).focus({preventScroll:true});
    });
    purchase.dataset.productId=product.id;
    info.append(heading,traits,forecast,purchase,visit,draftPair); item.append(art,info); shop.append(item);
    shopRows.set(product.id,{product,preview,image,heading,traits,forecast,purchase,visit,draftPair});
  }
  const expansionText = node('p', 'crystal-muted'), expand = button('添置繁育缸', async () => {
    const state = getState(), tankId = state?.tanks.length === 2 ? 'breeding-2' : 'breeding-3';
    await run(()=>onAction({type:'expand', tankId}), tankName(tankId)+'已安放在'+tankPlaces[tankId]+'。');
    const destination=roomSlots.get(tankId).control;
    if(!panel.hidden && activePage==='market')(destination.disabled?expand:destination).focus();
  }); expand.id = 'crystal-expand';
  const roomMap=node('section','crystal-room-map'), roomMapTitle=node('h3','','窗边缸位图（从走道看）');
  roomMapTitle.id='crystal-tank-map-title';roomMapTitle.tabIndex=-1;
  roomMap.setAttribute('aria-labelledby',roomMapTitle.id);
  const roomSlots=new Map();
  function roomSlot(id){
    const slot=node('div','crystal-room-slot'), control=button(tankName(id),()=>run(async()=>{
      if(getActiveTank()!==id)await onSwitch(id);
      setOpen(false);
    },'正在观察'+tankName(id)+'。',`正在切换到「${tankName(id)}」…`));
    const status=node('span','crystal-muted');
    control.dataset.roomSlot=id;control.setAttribute('aria-describedby','crystal-slot-status-'+id);
    status.id='crystal-slot-status-'+id;
    slot.append(control,status);roomSlots.set(id,{slot,control,status});return slot;
  }
  const arrangement=node('div','crystal-room-arrangement');
  const cabinet=node('section','crystal-room-cabinet'), rack=node('section','crystal-room-rack');
  cabinet.append(node('h4','','窗边木柜'),roomSlot('main'));
  const shelves=node('div','crystal-room-shelves');
  shelves.append(roomSlot('breeding'),roomSlot('breeding-2'),roomSlot('breeding-3'),node('div','crystal-room-supplies','养护用品'));
  rack.append(node('h4','','右侧繁育架'),shelves);
  arrangement.append(cabinet,rack);
  expansionText.id='crystal-expand-location';
  expand.setAttribute('aria-describedby',expansionText.id);
  roomMap.append(roomMapTitle,arrangement,expansionText,expand);
  pages.market.prepend(roomMap);
  buyTank.addEventListener('change',()=>{chosenBuyTank=buyTank.value; update();});
  const sales=node('details','crystal-room-help'), saleTitle=node('summary','','自愿转让成虾'), saleTank=select('crystal-sale-tank');
  const candidates=node('div','crystal-sale-candidates'), saleTotal=node('p'), reviewSale=button('核对转让名单',()=>{
    reviewingSale=true; update(); backSale.focus();
  });
  const backSale=button('返回挑选',()=>{reviewingSale=false; update(); reviewSale.focus();});
  const commitSale=button('确认转让',()=>{
    if (!reviewingSale || !chosenSales.size) return;
    const ids=[...chosenSales], tankId=saleTank.value;
    run(async()=>{await onAction({type:'sellGroup',tankId,ids}); clearSale(); saleTitle.focus();},
      `已转让 ${ids.length} 只，${tankName(tankId)}腾出 ${ids.length} 位，收到 ${ids.length*TRANSFER_PRICE} 金币。`);
  },'crystal-danger');
  const saleActions=node('div','crystal-row'), chosenSales=new Set();
  let reviewingSale=false, excludedParents=[];
  function clearSale(){chosenSales.clear(); reviewingSale=false;}
  saleActions.append(reviewSale,backSale,commitSale);
  saleTotal.setAttribute('aria-live','polite');
  sales.append(saleTitle,field('从哪口缸挑选',saleTank),candidates,saleTotal,saleActions);
  pages.market.append(sales);
  saleTank.addEventListener('change',()=>{clearSale(); update();});
  sales.addEventListener('toggle',()=>{if (!sales.open) clearSale(); update();});
  const spaceSale=button('去集市挑选可转让的成虾',()=>{
    clearSale(); excludedParents=[mother.value,father.value];
    showPage('market'); saleTank.value=spaceSale.dataset.tank; sales.open=true; update(); saleTitle.focus();
  });
  roomHelp.after(spaceSale);
  const albumStatus=node('p','crystal-muted'), albumPage=select('crystal-album-page');
  const albumPlate=node('figure','crystal-album-plate'), albumImage=node('img','crystal-portrait'), albumCaption=node('figcaption');
  const albumName=node('strong'), albumTraits=node('p'), albumGoal=node('p','crystal-observation'), albumIntent=node('p','crystal-keeper-note crystal-brood-intent');
  const albumPlaceholder=node('span','crystal-portrait-status'), albumArt=node('div','crystal-specimen');
  albumArt.append(albumImage,albumPlaceholder);
  const albumRace=node('p','crystal-observation');
  albumCaption.append(albumName,albumTraits,albumIntent,albumGoal,albumRace);
  albumImage.alt=''; albumPlate.append(albumArt,albumCaption); albumPage.addEventListener('change',update);
  const visitRepresentative=button('',e=>visitIndividual(visitRepresentative.dataset.individual,e.currentTarget));
  visitRepresentative.id='crystal-album-visit';
  const watchRepresentative=button('静观看它',async()=>{
    const id=watchRepresentative.dataset.individual;
    if(busy || watchRepresentative.hidden)return;
    await focusIndividual(id,{source:watchRepresentative});
    if(panel.hidden && tankReturn?.source===watchRepresentative && getSelected()===id)onQuiet(id,tankQuiet);
  });
  watchRepresentative.id='crystal-album-watch';
  const albumRookie=button('',()=>openRookie(albumPage.value,albumRookie.dataset.entrant));
  albumRookie.id='crystal-album-rookie';
  const openAlbum=button('翻开这窝',()=>{
    const id=albumPage.value || upcomingBatchId;
    const representative=getState().batches.find(b=>b.id===id)?.representativeId;
    if (!id && getState().starterPending) { openArrivals(); return; }
    showPage('breed');
    if (id) openBroodReview(id,representative);
    else mother.focus();
  });
  openAlbum.id='crystal-album-open';
  const saveAlbum=button('保存纪念图',()=>run(async()=>{
    const state=getState(), batch=state.batches.find(b=>b.id===albumPage.value);
    const byId=new Map(state.individuals.map(r=>[r.id,r])), chosen=byId.get(batch?.representativeId);
    if(!chosen)throw Error('先给这一窝挑一只相册代表。');
    const dam=byId.get(batch.motherId), sire=byId.get(batch.fatherId);
    const card={
      number:state.batches.indexOf(batch)+1, name:broodName(chosen,batch.children.map(k=>byId.get(k.id))),
      appearance:[sexName(chosen.sex),appearance(chosen)||'花色未记录'].join(' · '),
      traits:traitNames.map((label,i)=>[label,chosen.P?.[i]]),
      mother:nameOf(dam), father:nameOf(sire), intent:batch.intent, result:albumResult(batch,chosen,dam,sire),
      race:batch.rookieEntry?.entrantId===chosen.id ? rookieMark(batch.rookieEntry) : '',
    };
    await saveAlbumCard(card,await portraits?.get(chosen,state.now,true));
  },'纪念图已生成，可在下载中查看。'));
  saveAlbum.id='crystal-album-save';
  const albumActions=node('div','crystal-row'); albumActions.append(visitRepresentative,watchRepresentative,albumRookie,saveAlbum,openAlbum);
  const albumPicker=field('挑一窝看',albumPage);
  const lineJournal=createLineJournal({getState,indexOf:familyIndex,tankName,portrait,pairPhotos:pairPhotoView,broodPhotoButton,
    save:(action,label)=>run(()=>onAction(action),label),visit:visitIndividual,
    canCompete, formatResult:contestMark,
    contestTitle:show=>show.card?contestName(show.card):show.broodNumber?`第 ${show.broodNumber} 窝新秀赛`:exhibitionClassName(show.id),
    visitContest:(id,cardId,origin)=>chooseEntrant(id,cardId,{lineBook:origin}),
    chooseFounder(){
      filter.value='live';search.value='';showPage('roster');family.open=true;
      (rosterRows.get(selectedId)?.root || roster.firstElementChild || filter).focus();
    }
  });
  pages.album.append(lineJournal.shelf,photoAlbum.shelf,albumPicker,albumPlate,albumActions,albumStatus);
  function openAlbumPage(id) {
    showPage('album');
    if (id) { albumPage.value=id; update(); }
    (albumPicker.hidden ? openAlbum : albumPage).focus();
  }
  pages.market.append(button('翻看家族相册',()=>openAlbumPage()));
  const commissions = commissionCatalogue(), commissionSelect = select('crystal-commission'), deliverySelect = select('crystal-delivery');
  options(commissionSelect, commissions.map(card => ({value:card.id, label:card.title})));
  const commissionHint = node('p', 'crystal-muted'), commissionRecord = node('p', 'crystal-best');
  const deliveryCard=node('section','crystal-shop-item'), deliveryArt=node('div','crystal-shop-art');
  const deliveryImage=node('img','crystal-portrait'), deliveryInfo=node('div'), deliveryName=node('strong'), deliveryTraits=node('p');
  const visitDelivery=button('去缸里看看它',e=>visitIndividual(deliverySelect.value,e.currentTarget)); visitDelivery.id='crystal-delivery-visit';
  deliveryImage.alt=''; deliveryArt.append(deliveryImage); deliveryInfo.append(deliveryName,deliveryTraits,visitDelivery);
  deliveryCard.append(deliveryArt,deliveryInfo); deliveryCard.hidden=true;
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
  const commissionBreeding=node('details'), commissionLooks=node('div','crystal-pick-actions');
  commissionBreeding.append(node('summary','','为这张委托育一窝'),node('p','crystal-muted','挑一个喜欢的目标花色，再选双亲。可以对照亲虾的覆盖分，后代能否达到求购分数要等成年。'),commissionLooks);
  const commissionBranches=goalChoices.map(({value,label})=>{
    const [colour,pattern]=value.split(':');
    const choice=button(label,()=>{
      const card=commissions.find(c=>c.id===commissionSelect.value);
      if(busy || !commissionFitsGoal(card,value) || getState()?.commissions?.deliveries.some(r=>r.commissionId===card.id))return;
      commissionChoice=null;
      showPage('breed');
      mother.value=''; father.value=''; goal.value=value; qualityGoal.value='coverage';
      draftOrder=card;
      update(); browseParents('female');
      announce(`「${card.title}」求购覆盖至少 ${card.minCoverage} 分的成虾。这窝想育出${label}，先挑母虾。`);
    });
    commissionLooks.append(choice);
    return {colour,pattern,choice};
  });
  commissionDetails.append(node('summary', '', '可选育种委托'), node('p', 'crystal-muted', '有人在找特定的虾。交付是自愿的，会把这一只交给对方；收藏和正在带后代的亲虾不会列入。'), field('委托', commissionSelect), commissionHint, commissionRecord, field('挑一只符合条件的虾', deliverySelect), deliveryCard, delivery, deliveryBox);
  pages.market.append(commissionDetails);
  commissionDetails.append(commissionBreeding);
  commissionDetails.addEventListener('toggle',()=>{if(!commissionDetails.open)commissionChoice=null;update();});
  for (const control of [commissionSelect, deliverySelect]) control.addEventListener('change', () => { commissionChoice = null; update(); });

  const contestSelect = select('crystal-contest-card'), entrant = select('crystal-contest-entrant'), contestDescription = node('p', 'crystal-muted'), best = node('p', 'crystal-best'), npcList = node('div', 'crystal-opponents'), rewardHint = node('p', 'crystal-muted');
  const backToLine=button('',()=>{
    const at=familyOrigin?.lineBook;
    if(!at || !getState()?.lineBooks?.some(book=>book.founderId===at.founderId))return;
    showPage('album');lineJournal.openAt(at.founderId,at.member,at.mode,at.showId);
  });
  backToLine.id='crystal-contest-line-back';backToLine.hidden=true;
  const exhibition = button('',()=>{
    contestSelect.value='exhibition:'+nextExhibition(getState()).round;
    update();contestSelect.focus();
  });
  exhibition.id='crystal-exhibition-open';
  const entrantField=field('按名字找参赛虾',entrant);
  const entrantIntent=node('p','crystal-keeper-note');
  entrantIntent.id='crystal-contest-intent';
  const entrantGallery=node('section','crystal-entrant-gallery'), entrantGrid=node('div','crystal-entrant-grid');
  entrantGallery.id='crystal-entrant-gallery';
  const galleryTitle=node('h3'), pageCounter=node('span');
  galleryTitle.id='crystal-entrant-gallery-title';entrantGallery.setAttribute('aria-labelledby',galleryTitle.id);
  pageCounter.setAttribute('aria-live','polite');
  let candidatePage=0, gallerySelection='', galleryContest='', galleryGame;
  const entrantsPerPage=4;
  const changeCandidatePage=step=>{
    candidatePage+=step;update();
    entrantGrid.querySelector('button')?.focus();
  };
  const previousCandidates=button('上一页',()=>changeCandidatePage(-1)), nextCandidates=button('下一页',()=>changeCandidatePage(1));
  previousCandidates.setAttribute('aria-label','上一页候选虾');nextCandidates.setAttribute('aria-label','下一页候选虾');
  const candidatePages=node('div','crystal-entrant-pages');
  candidatePages.append(previousCandidates,pageCounter,nextCandidates);
  entrantGallery.append(galleryTitle,entrantGrid,candidatePages);
  const forecast=node('input');forecast.type='checkbox';forecast.id='crystal-contest-forecast';
  const forecastToggle=node('label','crystal-forecast-toggle');
  forecastToggle.append(forecast,node('span','','查看赛前估分'));
  forecast.addEventListener('change',()=>{
    siblingCompare.open=forecast.checked && !!selectedInvitation(getState());
    update();
  });
  const entrantCard = node('div','crystal-child crystal-contest-specimen'), entrantImage = node('img','crystal-portrait'), entrantSummary = node('p','crystal-baseline');
  const entrantNote=node('p','crystal-keeper-note'),entrantCaption=node('div'),entrantStatus=node('span','crystal-portrait-status');
  entrantImage.alt=''; entrantCaption.append(entrantSummary,entrantNote);entrantCard.append(entrantImage,entrantStatus,entrantCaption);
  const contestCompare=node('details','crystal-records');contestCompare.id='crystal-contest-compare';
  const otherEntrant=select('crystal-contest-other'), difference=node('p','crystal-baseline');
  const compareCloseup=pairPhotoView.trigger('crystal-contest-closeup','放大看这两只','两只虾的赛场对照',state=>{
    const comparison=contestPhotoPair(state);
    if(!comparison)return null;
    const photos=comparison.records.map((record,index)=>({
      record, at:state.now, label:[familyIndex(state).names.get(record.id),index===1 && contestKinship(record,comparison.records[0]),
        tankName(record.tank),comparison.roles[index]==='record' && '已有本卡成绩'].filter(Boolean).join(' · '),
      missingPhoto:!hasSiblingPhoto(record), selectable:comparison.roles[index]==='candidate'
    }));
    return {
      owner:JSON.stringify([contestSelect.value,comparison.card.seed,...photos.map(p=>[p.record.id,p.record.adultAt,p.missingPhoto])]),
      photos, busy, choiceLabel:'选这只待报名', choose:pickComparedEntrant,
      onUnavailable:()=>{if(!panel.hidden && activePage==='contest')focusEntrantPicker();}
    };
  });
  const comparePrints=node('div','crystal-lineup-pair');
  const candidateViews=['current','other'].map(side=>exhibitFigure(side,compareCloseup));
  comparePrints.append(...candidateViews.map(view=>view.figure));
  const visitOther=button('',e=>visitContestant(otherEntrant.value,e.currentTarget));
  visitOther.id='crystal-contest-other-visit';
  difference.id='crystal-contest-difference';
  const swapEntrant=button('',()=>pickComparedEntrant(otherEntrant.value));
  swapEntrant.id='crystal-contest-swap';
  contestCompare.append(node('summary','','挑另一只来对照'),field('和谁比较',otherEntrant),comparePrints,compareCloseup,difference,visitOther,swapEntrant);
  contestCompare.addEventListener('toggle',update);otherEntrant.addEventListener('change',update);
  const siblingCompare=node('details','crystal-records'); siblingCompare.id='crystal-contest-siblings';
  const siblingTitle=node('summary'), siblingGoals=node('p','crystal-muted'), siblingTable=node('table','crystal-siblings');
  const revisitBrood=button('回到同窝手记',()=>{
    const batch=getState().batches.find(b=>b.id===revisitBrood.dataset.batch), id=entrant.value || undefined;
    if(!batch)return;
    const visit=rookiePhotoOrigin;
    showPage('breed');
    if(matchesComparison(batch))reopenComparison(batch,id);
    else openBroodReview(batch.id,id);
    if(visit){
      const spread=visit.photoSpread, index=spread.ids.indexOf(id);
      const row=batchRows.get(batch.id);
      if(row)siblingView.open(batch.id,null,visit.source,row.detail,{...spread,visited:index<0?spread.visited:index});
    }
  });
  revisitBrood.id='crystal-contest-review';
  siblingCompare.append(siblingTitle,siblingGoals,siblingTable);
  siblingCompare.addEventListener('toggle',update);
  function chooseParent(id, nextGoals) {
    const state=getState(), record=state.individuals.find(r=>r.id===id);
    if (!record || !canSelectParent(state,record)) { announce('这只虾现在不能选作亲虾。',true); return; }
    showPage('breed');
    if(nextGoals?.fromTank)setOpen(true);
    const [chosen,partner]=record.sex==='female' ? [mother,father] : [father,mother];
    const keepDraft=nextGoals?.fromTank && chosen.value===record.id;
    if(nextGoals?.fromTank && !keepDraft)breedingTank.value=!state.unified && record.tank==='main'?'breeding':record.tank;
    chosen.value=record.id;
    if (nextGoals) {
      if(!keepDraft){
        draftOrder=null;
        goal.value=nextGoals.goal || '';
        qualityGoal.value=nextGoals.qualityGoal || '';
      }
      partner.value=nextGoals.mateId || '';
      if(nextGoals.mateId){update();planSummary.focus();return;}
      browseParents(record.sex==='female'?'male':'female',null,{contest:nextGoals.contest,fromTank:nextGoals.fromTank});
      return;
    }
    update(); (partner.value ? goal : partner).focus();
  }
  function selectTankParent(state,shrimp){
    const batch=activeParentBatch(state,shrimp.id);
    if(batch){
      openBroodReview(batch.id);
      announce(`已打开「${nameOf(shrimp)}」正在带的这一窝。`);
      return;
    }
    if(!canSelectParent(state,shrimp)){
      openInspectedRecord(shrimp.id);
      detailTitle.tabIndex=-1;detailTitle.focus();
      announce(shrimp.legacy?'这只是原有观赏虾。定向选育可以另挑成年水晶虾。':`「${nameOf(shrimp)}」成年后就能挑搭档。`);
      return;
    }
    const [chosen,partner]=shrimp.sex==='female'?[mother,father]:[father,mother];
    if(chosen.value && chosen.value!==shrimp.id)partner.value='';
    chosen.value=shrimp.id;
    announce('');
    if(!partner.value)browseParents(shrimp.sex==='female'?'male':'female');
    else {update();planSummary.focus();}
  }
  function breedChild(batch,kid){
    const view=batchRows.get(batch.id)?.reviewMode?.value;
    const trait=breedingDirection(view) ? view : batch.qualityGoal;
    rememberComparison(batch.id,kid.id);
    if(panel.hidden)setOpen(true);
    continueBrood(batch,kid.sex==='female'?kid.id:'',kid.sex==='male'?kid.id:'',trait);
  }
  function continueBrood(batch, motherId, fatherId, nextQuality=batch.qualityGoal) {
    const state=getState();
    if ([motherId,fatherId].some(id=>id && !state.individuals.some(r=>r.id===id && canSelectParent(state,r)))) {
      update(); announce('所选亲虾现在无法配对，请重新挑选。',true); return;
    }
    mother.value=motherId; father.value=fatherId;
    const origin=birthTankId(batch);
    breedingTank.value=!state.unified && origin==='main'?'breeding':origin; broodSize.value=String(batch.size);
    goal.value=batch.goal || ''; qualityGoal.value=nextQuality || '';
    draftOrder=commissions.find(c=>c.id===batch.commissionGoal);
    update();
    if([motherId,fatherId].filter(Boolean).length===1){
      const sex=motherId?'male':'female';
      browseParents(sex,null,{reviewId:batch.id});
    }else mother.focus();
  }
  let reviewedContest;
  function breedFromContest(id,card,trait) {
    const record=getState().individuals.find(r=>r.id===id);
    const sameDraft=record && (record.sex==='female' ? mother : father).value===id;
    chooseParent(id,{contest:card,goal:sameDraft ? goal.value : '',qualityGoal:trait ?? (sameDraft ? qualityGoal.value : '')});
  }
  const breedEntrant = button('为它挑搭档', () => breedFromContest(entrant.value,reviewedContest));
  breedEntrant.id='crystal-contest-breed';
  const adoptJudgeGoal=button('',()=>breedFromContest(entrant.value,reviewedContest,adoptJudgeGoal.dataset.goal));
  adoptJudgeGoal.id='crystal-contest-use-trait';
  function visitContestant(id,source){
    const state=getState(),kid=state.individuals.find(r=>r.id===id);
    if(!kid)return;
    const {batch,round,entry,card}=selectedContest(state);
    const result=source===visitOther ? null : entry?.entrantId===id ? entry :
      !round && !batch && card && hasCardResult(kid,card) ? contestStanding(card,kid) : null;
    const mark=result ? (batch?'本窝新秀赛':round?exhibitionClassName(card.id):contestName(card))+' · 第 '+result.rank+' 名 · '+points(result.score)+' 分' : '';
    const choice=source===visitOther ? {card:contestSelect.value,previous:entrant.value,game:getPairingKey()} : null;
    return visitIndividual(id,source,mark,choice);
  }
  function hasCardResult(record,card) {
    return !!card && Object.hasOwn(record.contestDebuts??{},card.id);
  }
  function contestKinship(record,first) {
    if(first.parents?.includes(record.id))return record.sex==='female'?'它的母虾':'它的公虾';
    return record.parents?.includes(first.id)?'它的子代':'';
  }
  function contestComparisonRole(record,state,{card,batch,round}) {
    if(!record)return '';
    // A past appearance on this fixed card remains available in the family archive.
    if(!batch && !round && hasCardResult(record,card))return 'record';
    return canCompete(record,state.now) && acceptsContestPattern(card,record) &&
      (!batch || batch.children.some(child=>child.id===record.id)) ? 'candidate' : '';
  }
  function contestPhotoPair(state) {
    if(!state || activePage!=='contest' || !contestCompare.open || !entrant.value || !otherEntrant.value || entrant.value===otherEntrant.value)return null;
    const contest=selectedContest(state), {round,card,entry}=contest;
    if(!card || entry)return null;
    if(round){
      const next=nextExhibition(state);
      if(round!==next.round || next.opensAt>Math.max(state.now,Date.now()))return null;
    }
    const {byId}=familyIndex(state), records=[byId.get(entrant.value),byId.get(otherEntrant.value)];
    const roles=records.map(record=>contestComparisonRole(record,state,contest));
    return roles.every(Boolean) && canCompete(records[0],state.now) ? {card,records,roles} : null;
  }
  function pickComparedEntrant(id) {
    const comparison=contestPhotoPair(getState());
    if(busy || !comparison?.records.some((r,index)=>r.id===id && comparison.roles[index]==='candidate'))return;
    if(id!==entrant.value){
      entrant.value=id;update();
      otherEntrant.value=comparison.records[0].id;update();
    }
    enter.focus();
  }
  function canSwapViewedEntrant(state,id,visit){
    const choice=visit?.contestChoice;
    return !!choice && visit.id===id && choice.game===getPairingKey() && choice.card===contestSelect.value &&
      choice.previous===entrant.value && otherEntrant.value===id && contestPhotoPair(state)?.roles[1]==='candidate';
  }
  const visitEntrant=button('回缸看它',e=>visitContestant(entrant.value,e.currentTarget));
  visitEntrant.id='crystal-contest-visit';
  const visitBest=button('',e=>visitContestant(visitBest.dataset.individual,e.currentTarget));
  visitBest.id='crystal-contest-best-visit';
  const resultBrood=button('回看它和同窝兄妹',()=>{
    siblingCompare.open=true;update();
    siblingTable.querySelector('[data-rookie-representative], [aria-pressed="true"]')?.focus();
  });
  resultBrood.id='crystal-contest-brood';
  function chooseEntrant(id,cardId,origin=null) {
    if(origin?.lineBook){forecast.checked=false;contestCompare.open=false;}
    showPage('contest',origin);
    const cards=getState().contests.cards;
    if(cardId || !cards.some(c=>c.id===contestSelect.value)){contestSelect.value=cardId || cards[0].id;update();}
    entrant.value=id; contestResult.hidden=true; update(); contestSelect.focus();
  }
  function selectedInvitation(state) {
    return contestSelect.value.startsWith('rookie:') && state.batches.find(b=>'rookie:'+b.id===contestSelect.value && b.status==='complete');
  }
  function selectedContest(state) {
    const batch=selectedInvitation(state), selection=contestSelect.value;
    const round=exhibitionRound(selection);
    const card=batch?rookieCard(state,batch):round?exhibitionCard(state,round,selection):state.contests.cards.find(c=>c.id===selection);
    const entry=batch?.rookieEntry || (round && state.contests.exhibitions?.[round-1]);
    return {batch,round,card,entry};
  }
  function isBroodVisit(visit,batch,id) {
    return visit?.id===id && batch?.status==='complete' && visit.batchId===batch.id &&
      (!batch.rookieEntry || batch.rookieEntry.entrantId===id);
  }
  function openRookie(id, candidateId='', visit=null) {
    showPage('contest'); contestSelect.value='rookie:'+id;
    rookiePhotoOrigin=visit?.photoSpread?.batchId===id ? visit : null;
    update();
    if(!entrant.disabled){
      entrant.value=candidateId;
      update();
    }
    focusEntrantPicker();
  }
  function focusEntrantPicker(){
    if(entrant.disabled)return contestSelect.focus();
    const card=entrantGrid.querySelector('[aria-pressed="true"]') || entrantGrid.querySelector('[aria-pressed="false"]');
    (card || (!entrantField.hidden ? entrant : contestSelect)).focus();
  }
  function selectTankEntrant(state,shrimp,visit){
    const selected=shrimp.id;
    announce('');
    if(!canCompete(shrimp,state.now)){
      chooseEntrant('');
      announce(shrimp.legacy?'这只是原有观赏虾，参赛可以另选成年水晶虾。':`「${nameOf(shrimp)}」成年后才能参赛。也可以另选一只成虾。`);
      focusEntrantPicker();
      return;
    }
    const birth=visit?.id===selected && birthBatchOf(selected);
    const ownInvitation=visit && canChooseFromObservation(visit) && birth?.status==='complete' && !birth.rookieEntry;
    if(isBroodVisit(visit,birth,selected) || ownInvitation){
      openRookie(birth.id,selected,visit);
      return;
    }
    const batch=selectedInvitation(state);
    if(batch && (batch.rookieEntry ? batch.rookieEntry.entrantId===selected : batch.children.some(k=>k.id===selected))){
      openRookie(batch.id,selected);
    }else{
      const {round,entry,card}=selectedContest(state), next=nextExhibition(state);
      const openRound=round===next.round && next.opensAt<=Math.max(state.now,Date.now());
      if(openRound && !acceptsContestPattern(card,shrimp)){
        chooseEntrant('',card.id);
        announce('「'+nameOf(shrimp)+'」是'+appearance(shrimp)+'。这组只评条带纹，可在「这次参加」选择同届公开组。');
        contestSelect.focus();return;
      }
      chooseEntrant(selected,round && (openRound || entry?.entrantId===selected) ? contestSelect.value : undefined);
    }
  }
  const enter = button('选这只参赛', async () => {
    await run(async () => {
      contestResult.hidden=true;
      const state=getState(), {batch,round,card}=selectedContest(state), individual=state.individuals.find(r=>r.id===entrant.value);
      const selection=contestSelect.value, previous=!batch && !round && state.contests.records.bestByContest[card.id];
      const id=individual.id;
      const response = await onAction(batch?{type:'rookieContest',batchId:batch.id,id}:round?{type:'exhibition',round,contestId:card.id,id}:{type:'contest',contestId:card.id,id});
      const result = response?.result ?? response;
      if (!result || !Number.isFinite(result.score) || !Number.isInteger(result.rank)) throw new Error('未收到比赛结果，请先查看已保存的个人最好记录。');
      const reward = Number.isFinite(result.reward) ? result.reward : 0;
      const mark=!previous ? '本卡首次成绩。' : result.score>previous.score ? `本卡最佳提高了 ${pointGap(result.score-previous.score)}。` : result.score===previous.score ? '与本卡最佳持平。' : `距本卡最佳还差 ${pointGap(previous.score-result.score)}。`;
      showContestResult(card,selection,individual,result,individualNames(state).get(individual.id));
      if(!batch && !round)text(resultBest,mark+(reward ? ` 首赛奖励 +${reward} 金币。` : ''));
      resultHeading.tabIndex=-1;resultHeading.focus();
    }, '评审完成。');
  }, 'crystal-primary'); enter.id = 'crystal-contest-enter';
  const contestResult = node('section', 'crystal-contest-result'); contestResult.id = 'crystal-contest-result'; contestResult.hidden = true; contestResult.setAttribute('role', 'status');
  const resultHeading=node('h3'), resultScore=node('strong'), resultNote=node('p'), resultBest=node('p','crystal-muted');
  const resultIntent=node('p','crystal-keeper-note');
  resultIntent.id='crystal-contest-result-intent';
  const lineup=node('section','crystal-contest-lineup'), rivalSelect=select('crystal-contest-rival');
  lineup.id='crystal-contest-lineup'; lineup.hidden=true; lineup.setAttribute('aria-label','同场参赛虾');
  const lineHeader=node('div','crystal-lineup-header'), rivalLabel=node('label','','同场对照');
  rivalLabel.htmlFor=rivalSelect.id; lineHeader.append(rivalLabel,rivalSelect);
  const showPair=node('div','crystal-lineup-pair'), myExhibit=exhibitFigure('player'), rivalExhibit=exhibitFigure('rival');
  const exhibitNote=node('p','crystal-keeper-note');
  showPair.append(myExhibit.figure,rivalExhibit.figure);
  lineup.append(lineHeader,showPair,exhibitNote);
  let lineupKey='';
  rivalSelect.addEventListener('change',update);

  function exhibitFigure(side,closeup) {
    const figure=node('figure'), art=node('div','crystal-exhibit-art'), image=node('img','crystal-portrait');
    image.alt=''; image.hidden=true; figure.dataset.exhibit=side;
    const status=node('span','crystal-portrait-status'), caption=node('figcaption');
    const name=node('strong'), place=node('small'), look=node('small');
    if(side==='rival'){caption.setAttribute('aria-live','polite'); caption.setAttribute('aria-atomic','true');}
    const photo=closeup ? pairPhotoView.thumbnail(closeup,image,side==='current'?'放大当前候选与另一只的近照':'放大另一只与当前候选的近照') : image;
    art.append(photo,status); caption.append(name,place,look); figure.append(art,caption);
    return {figure,image,status,name,place,look};
  }
  function updateExhibit(view,entry,label,now) {
    const {record,rank,tied,number}=entry;
    view.figure.dataset.individual=record.id;
    text(view.name,label);
    text(view.place,(number?'':'我的参赛虾 · ')+(tied?'并列':'')+'第 '+rank+' 名');
    text(view.look,appearance(record));
    contestPortrait(view.image,view.status,record,now);
  }
  function contestPortrait(image,status,record,now) {
    if(record.colour && record.pattern) {
      portrait(image,record,now,status);
    } else {
      portraitRequests.delete(image); image.hidden=true; image.removeAttribute('src');
      delete image.dataset.portraitFailed;
      status.hidden=false; text(status,'花色未记录');
    }
  }
  function updateLineup(card,individual,label,now) {
    lineup.hidden=contestResult.hidden;
    if(lineup.hidden) {lineupKey=''; return [];}
    const key=JSON.stringify([contestResult.dataset.card,card.seed,individual.id]);
    const entries=contestLineup(card,individual);
    if(key!==lineupKey) {
      const judgedRival=rivalComparison(card,individual).rival.index+1;
      options(rivalSelect,entries.slice(1).map(({number})=>({value:String(number),
        label:number+' 号对手'+(number===judgedRival?' · 评语提到':'')})));
      rivalSelect.value=String(judgedRival);
      lineupKey=key;
    }
    const other=entries[Number(rivalSelect.value)];
    updateExhibit(myExhibit,entries[0],label,now);
    updateExhibit(rivalExhibit,other,other.number+' 号对手',now);
    showObservation(exhibitNote,individual);
    return entries;
  }
  const contestFamily=node('p','crystal-baseline'); contestFamily.id='crystal-contest-family'; contestFamily.hidden=true;
  const scoreSheet=node('details','crystal-records'), scoreTable=node('table','crystal-siblings');
  scoreSheet.id='crystal-contest-scores';
  scoreSheet.append(node('summary','','看全场成绩'),scoreTable,adoptJudgeGoal);
  scoreTable.setAttribute('aria-label','全场名次与三项品质');
  const scoreHead=scoreTable.createTHead().insertRow();
  for(const label of ['名次与选手',...traitNames,'总分']){
    const cell=node('th','',label); cell.scope='col'; scoreHead.append(cell);
  }
  const scoreBody=scoreTable.createTBody();
  function updateScoreSheet(card,individual,label,entries){
    scoreSheet.hidden=contestResult.hidden;
    if(scoreSheet.hidden)return;
    const signature=JSON.stringify([card.id,card.seed,individual.id,label,individual.P]);
    if(scoreTable.dataset.signature===signature)return;
    scoreTable.dataset.signature=signature;
    judgingLabels(card.theme).forEach((name,i)=>text(scoreHead.cells[i+1],name));
    scoreBody.replaceChildren();
    for(const entry of [...entries].sort((a,b)=>b.score-a.score)){
      const name=entry.number ? entry.number+' 号对手' : label+'（你）';
      const row=scoreBody.insertRow(), who=node('th','',(entry.tied?'并列':'')+`第 ${entry.rank} 名 · ${name}`);
      who.scope='row';row.append(who);
      for(let i=0;i<3;i++)text(row.insertCell(),quality(judgedTrait(entry.record.P,card.theme,i)));
      text(row.insertCell(),points(entry.score));
    }
  }
  function showContestResult(card,selection,individual,result,label) {
    const notes=contestNotes(card,individual),rookie=selection.startsWith('rookie:');
    const round=exhibitionRound(selection);
    reviewedContest=card;
    text(resultHeading,`${label} · 全场第 ${result.rank} 名`);
    const event=rookie?'自育新秀赛':round?exhibitionClassName(card.id):contestName(card);
    text(resultScore,`${event} · ${card.theme===FINE_BAND?'本场评分':'品质评分'} ${points(result.score)} 分（${RATINGS[result.rating]}）`);
    text(resultNote,notes.standing);
    if(rookie)text(resultBest,'本窝的新秀赛成绩已记入它的档案。');
    if(round)text(resultBest,'本届赛绩已保存。');
    adoptJudgeGoal.dataset.goal=notes.goal;
    text(adoptJudgeGoal,notes.goal ? '以'+directionLabel(breedingDirection(notes.goal))+'为目标挑搭档' : '');
    contestResult.dataset.entrant=individual.id; contestResult.dataset.card=selection;
    contestResult.dataset.place=String(result.rank);contestResult.hidden=false;
  }
  contestResult.append(resultHeading,resultScore,resultNote,resultBest,resultIntent);
  pages.contest.append(backToLine,exhibition,field('这次参加',contestSelect),contestDescription,entrantIntent,entrantField,entrantGallery,contestCompare,forecastToggle,entrantCard,
    siblingCompare,contestFamily,npcList,contestResult,lineup,scoreSheet,enter,visitEntrant,revisitBrood,resultBrood,breedEntrant,best,visitBest,rewardHint);
  for(const control of [contestSelect,entrant])control.addEventListener('change',()=>{announce('');update();});

  function announce(message, error = false) {
    if (disposed) return; text(feedback, message); feedback.classList.toggle('is-error', error);
    if(tankWriter){ text(tankEditStatus,message); tankEditStatus.classList.toggle('is-error',error); }
    else if(error && panel.hidden)onTankError?.(message);
  }
  function disable(control, value) { control.dataset.unavailable = value ? 'true' : 'false'; control.disabled = busy || value; }
  function setOpen(open) {
    closeGrowthList(false);
    if (!open) restExchange.reset();
    if(!open && !tankReturn)mateComparison.reset();
    if(!open){siblingView.close(false);arrivalField.open=false;}
    if(open){tankPair=null;broodWatch.close();}
    if(!open && !tankReturn){broodReturn?.remove();broodReturn=null;clearBroodTrail();rookiePhotoOrigin=null;}
    const backToAnimal=!open && !tankReturn && parentBrowseOrigin?.fromTank && parentBrowseOrigin.partnerId;
    const restored=!open && !tankReturn && finishParentBrowse();
    if (open) tankReturn=null;
    if (!open) {clearSale(); commissionChoice=null; sales.open=false; excludedParents=[];}
    if (!open) {familyOrigin=null; shopBrowseOrigin=null;}
    if (open && panel.hidden) returnFocus = tankWriter && tankEditor.contains(document.activeElement) ? tankNameButton : document.activeElement;
    closeTankEditor();
    if (open && panel.hidden) for (const image of document.querySelectorAll('#crystal-panel img[data-portrait-failed], #crystal-tank-portrait img[data-portrait-failed]')) {
      portraitRequests.delete(image);
      if(entrantGrid.contains(image))delete entrantGrid.dataset.signature;
    }
    if (open) { window.showDock?.(''); if (!document.getElementById('care-pop').hidden) document.getElementById('care-chip').click(); }
    panel.hidden = !open; dockButton.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('crystal-panel-open', open);
    if (open) {
      update();
      close.focus();
    } else {
      if(restored){update();markRosterSelection();}
      if(backToAnimal){
        onSelect(backToAnimal);update();
        if(!inspect.hidden){(tankBreed.hidden?inspect:tankBreed).focus({preventScroll:true});return;}
      }
      if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus(); else dockButton.focus();
    }
  }
  function showPage(page, origin = null, keepBroodPath = false) {
    if (page !== 'roster') restExchange.reset();
    if(page!=='roster')mateComparison.reset();
    if(page!=='roster')arrivalField.open=false;
    if(page!=='contest')rookiePhotoOrigin=null;
    if(page!=='breed')siblingView.close(false);
    shopBrowseOrigin=null;
    if(activePage==='breed' && page!=='breed' && !panel.hidden)rememberPairing();
    if(!keepBroodPath){
      clearBroodTrail();
      broodReturn?.remove();broodReturn=null;
    }
    if(page==='market' && activePage==='breed')shopTrait.value=qualityGoal.value;
    const restored=activePage==='roster' && page!=='roster' && finishParentBrowse();
    if (activePage==='market' && page!=='market') {clearSale(); commissionChoice=null; sales.open=false; excludedParents=[];}
    familyOrigin = origin;
    if (page!==activePage && !busy && !feedback.classList.contains('is-error')) announce('');
    activePage = page; panel.dataset.page = page;
    text(title, ({roster:'我的虾册', breed:'下一窝的期待', market:'育种者集市', contest:'带它去参赛', album:'我的家族相册'})[page]);
    for (const [id, element] of Object.entries(pages)) {
      element.hidden = id !== page; tabButtons[id].setAttribute('aria-selected', String(id === page)); tabButtons[id].tabIndex = id === page ? 0 : -1;
    }
    update();
    if(restored)markRosterSelection();
  }
  async function run(task, message, pending = '正在保存这次操作…') {
    if (busy || disposed) return;
    if (typeof task !== 'function') { announce('这项操作暂时不可用。', true); return; }
    busy = true; announce(pending); update();
    try { await task(); if (!disposed) announce(message); return true; }
    catch (error) { announce(error?.message || '操作没有完成，请稍后再试。', true); return false; }
    finally { busy = false; if (!disposed) update(); }
  }
  function portrait(image, record, now, caption, frame = crystalPortraitFrame(record, now, getState()), closeup = false, crop = 'whole') {
    const previous = portraitRequests.get(image);
    const view = crop === 'back' ? 'back' : 'side';
    const bodySize=image.classList.contains('crystal-size-photo') ? frame.bodyScale.toFixed(4) : '';
    if (previous?.key === frame.key && previous.closeup === closeup && previous.view === view) {
      if (previous.bodySize !== bodySize) {
        previous.bodySize = bodySize;
        if (previous.ready && bodySize) image.style.setProperty('--crystal-body-size',bodySize);
      }
      return previous.ready === true && image.complete && image.naturalWidth > 0;
    }
    const request = {key:frame.key, id:record.id, closeup, view, bodySize, shownKey:previous?.shownKey};
    portraitRequests.set(image,request); delete image.dataset.portraitFailed;
    // Keep this same shrimp on screen while its next age is being painted.
    if (previous?.id !== record.id || previous.view !== view || image.hidden) {
      request.shownKey = null;
      image.hidden = true; image.removeAttribute('src');
      if (caption) { caption.hidden = false; text(caption, '正在准备个体影像…'); }
    }
    const current = () => !disposed && image.isConnected && portraitRequests.get(image) === request;
    (portraits?.get(record, now, closeup || image === hero || image === inspectImage, frame, closeup, view) ?? Promise.resolve(null)).then(async url => {
      if (!current()) return;
      if (!url) {
        image.dataset.portraitFailed = 'true';
        if (request.shownKey === frame.key && !image.hidden && image.naturalWidth) {
          request.ready = true;
          return;
        }
        // A player can zoom the brood before its ordinary thumbnails have finished loading.
        if (closeup && (view === 'back' || broodWatch.root.contains(image) || image.closest('#crystal-pair-photos[data-single]'))) {
          url = await portraits?.get(record, now, true, frame, false, view);
          if (!current()) return;
        }
      }
      if (url) {
        request.ready = true; request.shownKey = frame.key;
        if (request.bodySize) image.style.setProperty('--crystal-body-size',request.bodySize);
        image.src = url; image.hidden = false;
      } else { image.hidden = true; request.shownKey = null; }
      if (caption) {
        caption.hidden = !!url;
        if (!url) text(caption, closeup ? '近照暂不可用，重新点开可重试' : tankGrowth.contains(image) || broodWatch.root.contains(image) ? '影像暂不可用，收起再展开可重试' : '影像暂不可用，重开虾册可重试');
      }
    });
    return false;
  }
  function updateRoster(state) {
    if(panel.hidden || pages.roster.hidden)return;
    const query = search.value.trim().toLocaleLowerCase();
    const picking=filter.value==='female' || filter.value==='male';
    pickActions.hidden=!picking;
    text(backToPair,parentBrowseOrigin?.fromTank?'回缸看这只虾':parentBrowseOrigin?.reviewId?'回到这窝手记':'返回选育');
    const comparing=picking && pickAnalysis.checked;
    const partnerId=picking && (filter.value==='female' ? father : mother).value;
    const partner=partnerId && state.individuals.find(r=>r.id===partnerId && canSelectParent(state,r));
    pickInTank.hidden=!partner || !isFilled(getActiveTank());
    pickInTank.value=partner?.id || '';
    const destination=breedingTank.value;
    pickRoomNote.hidden=!partner || !destination;
    if(!pickRoomNote.hidden){
      const home=tankName(partner.tank), target=tankName(destination);
      text(pickRoomNote,`繁育位置 · ${target}。已留下的亲虾目前在${home}，${partner.tank===destination?'可以留在这里。':'确认安排后会搬入'+target+'。'}`);
    }
    pickHomeRoom.hidden=pickRoomNote.hidden || partner.tank===destination || !Array.from(breedingTank.options).some(option=>option.value===partner.tank);
    if(!pickHomeRoom.hidden){
      pickHomeRoom.value=partner.tank;
      text(pickHomeRoom,'改在'+tankName(partner.tank)+'育这一窝');
    }
    disable(pickHomeRoom,pickHomeRoom.hidden);
    shopForMate.hidden=!partner?.colour || ![...shopRows.values()].some(({product})=>
      product.sex!==partner.sex && !state.purchases.some(receipt=>receipt.productId===product.id));
    shopForMate.dataset.partner=partner?.id ?? '';
    const parentLook=partner?.source==='bred' && partner.colour && partner.pattern && partner.colour+':'+partner.pattern;
    mateGoal.hidden=!parentLook || parentBrowseOrigin?.partnerId!==partnerId || parentLook===parentBrowseOrigin.initialGoal;
    if(!mateGoal.hidden){
      const previous=parentBrowseOrigin.initialGoal;
      const leavesOrder=draftOrder && !commissionFitsGoal(draftOrder,parentLook);
      options(mateGoal,[
        {value:previous,label:previous?'原目标 · '+goalLabel(previous):'花色随缘'},
        {value:parentLook,label:'延续亲虾花色 · '+goalLabel(parentLook)+(leavesOrder?'（移除求购目标）':'')},
      ]);
      mateGoal.value=goal.value;
      disable(mateGoal,false);
    }
    const contest=partner && parentBrowseOrigin?.partnerId===partner.id && parentBrowseOrigin.contest;
    const matching=comparing && goal.value
      ? goalPartners(state.individuals.filter(r=>canSelectParent(state,r)),goal.value) : null;
    const withPartner=new Map();
    if (partner) {
      for (const batch of state.batches) {
        if (batch.status!=='complete') continue;
        const mate=batch.motherId===partner.id ? batch.fatherId : batch.fatherId===partner.id ? batch.motherId : null;
        if (!mate) continue;
        if (!withPartner.has(mate)) withPartner.set(mate,[]);
        withPartner.get(mate).push(batch);
      }
    }
    text(title, picking ? (partner ? '为'+siblingName(partner,state.individuals)+'挑' : '挑一只')+sexName(filter.value) : '我的虾册');
    const records = state.individuals.filter(record => {
      if (filter.value === 'observations') return !!record.observation && matchesSearch(record,query);
      if (filter.value === 'sold' ? live(record) : !live(record)) return false;
      if (filter.value === 'current' && record.tank !== getActiveTank()) return false;
      if (filter.value === 'rest' && record.tank!=='rest') return false;
      if (filter.value === 'favorites' && !record.protected) return false;
      if (picking && (record.sex!==filter.value || !canSelectParent(state,record))) return false;
      if (filter.value === 'juvenile' && record.adultAt <= state.now) return false;
      return matchesSearch(record,query);
    }).sort((a, b) => Number(!!a.legacy) - Number(!!b.legacy));
    if (comparing) orderParentCandidates(records,matching,partnerId,qualityGoal.value);
    const aims=[];
    if(matching){
      const look=goalLabel(goal.value);
      if(!partner)aims.push('能配出'+look+'的优先');
      else if(matching.has(partner.id))aims.push(look+'机会优先');
      else aims.push(partner.colour?'按已知花色，当前没有搭档能和'+nameOf(partner)+'配出'+look:nameOf(partner)+'缺少花色记录，无法预测');
    }
    const chosenDirection=breedingDirection(qualityGoal.value);
    if(comparing && chosenDirection)aims.push(chosenDirection.pattern?'按'+orderLabel(chosenDirection)+'看条带亲虾':'看亲虾的'+directionLabel(chosenDirection)+'表现');
    let guidance=aims.join('，再') || '选择一只查看';
    if(contest){
      const regular=state.contests.cards.some(card=>card.id===contest.id);
      const round=exhibitionRound(contest.id);
      const race=round?exhibitionClassName(contest.id):regular?contestName(contest):'本窝新秀赛';
      const mark=contestStanding(contest,partner);
      guidance=`「${nameOf(partner)}」在「${race}」得 ${points(mark.score)} 分，第 ${mark.rank} 名`;
      if(chosenDirection?.pattern){
        guidance+='。这次想看'+chosenDirection.label+(partner.pattern==='band'?'，它的白色覆盖是 '+quality(partner.P[1])+' 分':'');
      }else if(chosenDirection)guidance+=`。这次想育好${directionLabel(chosenDirection)}，它自己是 ${quality(partner.P[chosenDirection.index])} 分`;
    }
    text(rosterCount, filter.value === 'sold' ? `${records.length} 条已售档案` : `${records.length} 只 · ${guidance}`);
    const ids = new Set(records.map(record => record.id));
    for (const [id, row] of rosterRows) if (!ids.has(id)) { row.root.remove(); rosterRows.delete(id); }
    if (selectedId && !ids.has(selectedId) && !state.individuals.some(record=>record.id===selectedId)) {
      if(getSelected()===selectedId)onSelect(null);
      selectedId=null; sellId=null;
    }
    const names=new Set(), duplicateNames=new Set();
    for(const record of records){
      const name=nameOf(record);
      if(names.has(name))duplicateNames.add(name);
      names.add(name);
    }
    for (const [index, record] of records.entries()) {
      let row = rosterRows.get(record.id);
      if (!row) {
        const root = button('', () => {
          familyOrigin = null; selectedId = record.id; sellId = null;
          const current = getState()?.individuals.find(r => r.id === record.id);
          onSelect(current && live(current) && getActiveTank() === current.tank ? current.id : null);
          update();
          mateComparison.afterPick(root);
        }, 'crystal-roster-item'); root.dataset.individualId = record.id;
        const image = node('img', 'crystal-portrait'); image.alt = ''; image.width = 192; image.height = 112; image.hidden = true;
        const placeholder = node('span', 'crystal-portrait-status', '准备影像…'), label = node('strong'), subtitle = node('span'), traits = node('span', 'crystal-traits'), marker = node('span', 'crystal-choice');
        const art = node('span', 'crystal-card-art'); art.append(image, placeholder);
        const chance=node('span','crystal-pair-chance');
        root.append(art, label, traits, subtitle, chance, marker); row = {root, image, placeholder, label, subtitle, traits, chance, marker}; rosterRows.set(record.id, row); roster.append(root);
      }
      if (roster.children[index] !== row.root) roster.insertBefore(row.root, roster.children[index] || null);
      text(row.label, nameOf(record)+(duplicateNames.has(nameOf(record))?' · '+record.id:''));
      text(row.traits, appearance(record) || '外观资料未记录');
      text(row.marker, record.id === selectedId ? '已选中' : record.protected ? '已收藏' : '');
      text(row.subtitle, comparing ? qualities(record) : `${sexName(record.sex)} · ${record.adultAt <= state.now ? '成年' : '幼虾'}${!picking && record.tank !== getActiveTank() ? ` · ${tankName(record.tank)}` : ''}`);
      const clues=[];
      if(filter.value==='observations')clues.push(record.observation);
      if(picking){
        clues.push(tankName(record.tank)+(destination && destination!==record.tank?' · 安排这窝时移入'+tankName(destination):''));
      }
      const family=parentageClue(record,partner);
      if(family)clues.push(family);
      if(contest && Object.hasOwn(record.contestDebuts??{},contest.id)){
        const mark=contestStanding(contest,record);
        clues.push(`同一赛卡得过 ${points(mark.score)} 分，第 ${mark.rank} 名`);
      }
      if (matching) {
        const mates=matching.get(record.id), probability=mates?.get(partnerId);
        const other=record.sex==='female'?'公虾':'母虾';
        let clue=mates?`可配搭档：${mates.size} 只${other}能配出目标花色`:'当前没有能配出目标花色的搭档';
        if(partner)clue=probability?`与${nameOf(partner)}配对，每只后代有 ${100*probability}% 机会符合花色`:`与${nameOf(partner)}配不出目标花色`;
        clues.push(!record.colour || (partner && !partner.colour)?'花色资料不足':clue);
      }
      const problem=comparing && partner && bandGoalProblem(qualityGoal.value,goal.value,record,partner);
      if(problem)clues.push(problem);
      const target=comparing && partner && !problem && broodQualityTarget(qualityGoal.value,record,partner);
      if(target)clues.push('选这对，下一窝看'+targetText(target));
      if (withPartner.has(record.id)) clues.push(pairHistoryClue(withPartner.get(record.id),comparing && goal.value,target));
      row.chance.hidden=!clues.length;
      text(row.chance,clues.join('\n'));
      portrait(row.image, record, state.now, row.placeholder, portraits?.currentFrame(record,state.now));
      row.root.setAttribute('aria-pressed', String(record.id === selectedId)); disable(row.root, false);
    }
    rosterEmpty.hidden = records.length > 0; text(rosterEmpty, query ? '没有找到这只虾，试试名字、花色或你记过的词。' : picking ? '当前没有空闲的成年水晶'+sexName(filter.value)+'，可以稍后再来挑。' : filter.value === 'observations' ? '还没有写过观察。在缸里选一只虾，点「名字与观察」就能记下它的特点。' : filter.value === 'rest' ? '静养处还是空的。在个体档案里可以安置空闲的成虾。' : filter.value === 'sold' ? '还没有出售记录。' : filter.value === 'favorites' ? '还没有收藏。挑一只喜欢的，收藏后也会保护它。' : filter.value === 'current' ? '这缸暂时没有虾。可以切换鱼缸，或查看全部虾。' : filter.value === 'juvenile' ? '暂时没有成长中的幼虾。' : '名册里暂时没有活体，可以去集市挑选亲虾。');
    const record = records.find(item => item.id === selectedId); detail.hidden = !record; pickThis.hidden=!record;
    const another=picking && record && (records.length>1 || (query && state.individuals.some(r=>r.id!==record.id && r.sex===record.sex && canSelectParent(state,r))));
    mateComparison.update(state,another);
    if (!record) { restExchange.update(state, null); return; }
    updatePhotoLink(recordPhotos,record,state);
    if (picking) text(pickThis,'选「'+rosterRows.get(record.id).label.textContent+'」做'+sexName(record.sex));
    const birthBatch=record.source==='bred' && state.batches.find(b=>b.children.some(k=>k.id===record.id));
    birthBrood.hidden=!birthBatch;
    const isLive = live(record), adult = record.adultAt <= state.now, isLocked = locked(state, record.id);
    const carrying = currentMaternalBrood(state,record.id);
    maternalBrood.hidden=!carrying;
    const canMove = isLive && (!isLocked || !!carrying);
    syncIdentityFields(record);
    showObservation(observationText,record);
    text(detailTitle, rosterRows.get(record.id).label.textContent); text(identity, `身份 ${record.id}`);
    detailEntry.hidden=!canCompete(record,state.now);
    detailParent.hidden=picking || !canSelectParent(state,record); text(detailParent,'选它做'+sexName(record.sex));
    const brood=birthBatch?.status==='complete' && birthBatch;
    const represented=brood?.rookieEntry?.entrantId===record.id;
    detailRookie.hidden=!brood || (brood.rookieEntry ? !represented : detailEntry.hidden);
    if(!detailRookie.hidden){
      detailRookie.dataset.batch=brood.id;
      text(detailRookie,represented?'回看'+rookieMark(brood.rookieEntry):'选它参加本窝新秀赛');
    }
    activities.hidden=detailParent.hidden && detailEntry.hidden && detailRookie.hidden;
    const played=state.contests.cards.filter(c=>Object.hasOwn(record.contestDebuts??{},c.id));
    const exhibitions=(state.contests.exhibitions??[]).filter(result=>result.entrantId===record.id).reverse();
    honours.hidden=!played.length && !exhibitions.length;
    const isBest=c=>state.contests.records.bestByContest[c.id]?.entrantId===record.id;
    const familyNotes=played.map(card=>familyContestNote(card,record,state.individuals));
    const signature=honours.hidden ? '' : JSON.stringify([record.id,record.P,played.map(c=>[c.id,c.seed,isBest(c)]),familyNotes,exhibitions]);
    if (honours.dataset.records!==signature) {
      honours.dataset.records=signature;
      honours.replaceChildren(...exhibitions.map(result=>{
        const round=exhibitionRound(result.contestId), entry=node('details');
        entry.dataset.card=result.contestId;
        const review=button('看本届比赛',()=>{
          chooseEntrant(record.id,result.contestId);
          if(!contestResult.hidden){resultHeading.tabIndex=-1;resultHeading.focus();}
        });
        review.dataset.exhibitionReview='';
        entry.append(node('summary','',`回看赛绩 · ${exhibitionClassName(result.contestId)} · 第 ${result.rank} 名 · ${RATINGS[result.rating]} · ${points(result.score)} 分`),
          node('p','',contestName(exhibitionCard(state,round))),review);
        return entry;
      }), ...played.map((card,index)=>{
        const r=contestStanding(card,record);
        const notes=contestNotes(card,record), entry=node('details');
        entry.dataset.card=card.id;
        entry.append(node('summary','',`回看赛绩 · ${contestName(card)} · 第 ${r.rank} 名 · ${points(r.score)} 分${isBest(card) ? ' · 本卡最佳' : ''}`),
          node('p','',notes.standing));
        if (familyNotes[index]) entry.append(node('p','crystal-baseline',familyNotes[index]));
        entry.append(button(notes.action,()=>breedFromContest(record.id,card,notes.goal || undefined)));
        return entry;
      }));
    }
    for (const action of honours.querySelectorAll('button')) action.hidden=picking || (!Object.hasOwn(action.dataset,'exhibitionReview') && !canSelectParent(state,record));
    text(selectionBadge, !isLive ? '留在虾册里的回忆' : record.protected ? '我的收藏 · 已保护' : '正在查看这一只');
    rosterPhoto.setAttribute('aria-label','细看'+detailTitle.textContent+'的近照');
    portrait(hero, record, state.now, heroCaption, portraits?.currentFrame(record,state.now));
    text(description, `${sexName(record.sex)} · ${tankName(record.tank)}${appearance(record) ? ` · ${appearance(record)}` : ''}${record.protected ? ' · 收藏保护中' : ''}`);
    qualitySheet.hidden = !adult || !!record.legacy; juvenile.hidden = adult;
    for (let i = 0; i < statFields.length; i++) {
      statFields[i].meter.value = adult && record.P ? record.P[i] : 1;
      text(statFields[i].value, adult && record.P ? quality(record.P[i]) : '未揭晓');
    }
    if(!adult)text(juvenile, maturityHint(record.adultAt,Math.max(Date.now(),state.now))+'。'+(record.legacy ? '继续在缸里照料它。' : '成年后再看三项品质。'));
    familyBack.hidden = !familyOrigin;
    if (familyOrigin?.lineBook)text(familyBack,'返回选育手记');
    else if (familyOrigin?.contestSource)text(familyBack,'返回这场比赛');
    else if (familyOrigin?.albumId)text(familyBack,'返回这窝的相册页');
    else if (familyOrigin?.batchId)text(familyBack,'返回这窝手记');
    else if (familyOrigin) {
      const origin=state.individuals.find(r=>r.id===familyOrigin.id);
      if(origin)text(familyBack,'返回「'+siblingName(origin,state.individuals)+'」的原档案');
    }
    if (family.open) {
      const books=state.lineBooks || [], own=books.find(b=>b.founderId===record.id);
      familyBroodPhotos.hidden=picking || !hasSiblingPhoto(record);
      startLine.hidden=picking || !!record.legacy;
      text(startLine,own?'翻开《'+own.title+'》':'从它开始写选育手记');
      const {byId,names}=familyIndex(state), related=booksForDescendant(record,byId,books);
      memberBooks.hidden=picking || !related.length;
      const signature=JSON.stringify([record.id,...related.map(b=>[b.founderId,names.get(b.founderId),b.title,b.members.includes(record.id)])]);
      if(signature!==memberBooks.dataset.books){
        memberBooks.dataset.books=signature;
        memberBooks.replaceChildren(...related.map(b=>{
          const kept=b.members.includes(record.id);
          const label='在《'+b.title+'》里'+(kept?'看它':'对照');
          const origin=related.length>1?' · 从'+names.get(b.founderId)+'开始':'';
          return button(label+origin,()=>openLineBook(b.founderId,record.id,kept?'kept':'all'));
        }));
      }
      const entries = [];
      let children = 0;
      function addRelative(r, role) {
        entries.push({value:r.id, label:`${role} · ${nameOf(r)} · ${tankName(r.tank)}（${r.id}）`});
      }
      for (const id of record.parents ?? []) {
        const parent = byId.get(id);
        if (parent) addRelative(parent, parent.sex==='female'?'母亲':'父亲');
      }
      for(const child of birthBatch?.children || []){
        if(child.id===record.id)continue;
        const sibling=byId.get(child.id);
        if(sibling)addRelative(sibling,'同窝');
      }
      for (const r of state.individuals) if (r.parents?.includes(record.id)) {
        addRelative(r, '子代'); children++;
      }
      text(ancestry, (record.parents ? '' : record.legacy ? '原缸个体，没有亲代记录。' : '初代亲虾。') +
        (children ? '已孵化的子代共 ' + children + ' 只。' : '尚无已记录的子代。'));
      options(relative, entries); relatives.hidden = !entries.length;
      const broods=[];
      const grown=[];
      for(let i=state.batches.length-1;i>=0;i--){
        const batch=state.batches[i];
        if(!isRecordedParent(batch,record.id))continue;
        const mateId=batch.motherId===record.id ? batch.fatherId : batch.motherId, mate=names.get(mateId);
        broods.push({value:batch.id,label:`第 ${i+1} 窝 · ${mate?'与'+mate:'搭档未记录'} · ${STAGES[batch.status]}`});
        if(batch.status==='complete')grown.push({batch,number:i+1,mateId});
      }
      options(parentBroods,broods);broodHistory.hidden=!broods.length;
      updateFamilySpread(record,grown,byId,names,state.now);
    }
    const resting=record.tank==='rest', usedRest=state.individuals.filter(r=>r.tank==='rest').length;
    text(stateHint, resting ? '正在静养。选好要回的鱼缸，就能查看接回方式。' : !isLive ? '已出售；名字、品质和后代关系仍保留。' : carrying ? `${maternalStage(carrying,Math.max(Date.now(),state.now))}。可以移缸，暂时不能再次配对或出售。` : isLocked ? '正在准备配对，暂时不能移缸和出售。' : record.protected ? '已收藏，不会被出售。想转让时先解除保护。' : record.legacy ? (record.legacyHatchAt !== null ? '原有抱卵保留，空间足够时孵化；暂不能出售。' : '保留原有身份，可以照料、收藏和移缸；水晶虾才能选育和参赛。') : adult ? '可以参赛、留种，或自愿转让给电脑买家。' : '幼虾可以继续观察和移缸，成年后才能参赛或出售。');
    detailActions.hidden = transfer.hidden = sell.hidden = !isLive;
    focus.hidden=follow.hidden=resting; sell.hidden=!isLive||resting; rest.hidden=!isLive||resting;
    const localTank = getActiveTank() === record.tank;
    text(focus, localTank ? '在缸中找到它' : `去${tankName(record.tank)}找它`);
    text(follow, localTank ? '跟随它观察' : `去${tankName(record.tank)}跟随`);
    text(protect, record.protected ? '解除收藏保护' : '收藏并保护'); protect.setAttribute('aria-pressed', String(record.protected));
    options(moveTank, state.tanks.filter(tank => tank.id !== record.tank).map(tank => ({value:tank.id, label:tankName(tank.id)})));
    const moveTarget = state.tanks.find(tank => tank.id === moveTank.value), moveCount = moveTarget ? counts(state, moveTarget.id) : {animals:0, reserved:0};
    const movingBrood = carrying?.status === 'formed' ? carrying.size : 0;
    const moveFree = moveTarget ? moveTarget.capacity - moveCount.animals - moveCount.reserved - 1 - movingBrood : -1;
    const targetHasBrood = !!movingBrood && state.batches.some(batch => batch.id !== carrying.id && batchTankId(batch) === moveTank.value && ['planned', 'formed'].includes(batch.status));
    const targetWet = !!moveTarget && isFilled(moveTarget.id);
    const recallFull = resting && targetWet && (moveFree < 0 || globalFree(state) < 1);
    const mayRest = canRest(state,record);
    const restFull = mayRest && usedRest >= REST_LIMIT && isFilled(record.tank);
    const canExchange = restExchange.update(state, recallFull || restFull ? record : null, resting ? moveTank.value : record.tank);
    const exchangeIn = recallFull && canExchange, exchangeOut = restFull && canExchange;
    text(rest, exchangeOut ? '静养处已满 · 挑一只换回' : `送去静养（${usedRest}/${REST_LIMIT}）`);
    disable(rest, !exchangeOut && (!mayRest || usedRest >= REST_LIMIT));
    text(move, exchangeIn ? '挑一只换位接回' : resting && familyOrigin?.recallBrood && familyOrigin.id===record.id?'接回并返回报名':resting?'接回所选鱼缸':'移入目标缸');
    for (const [control, available] of [[move, exchangeIn], [rest, exchangeOut]]) {
      if (available) { control.setAttribute('aria-haspopup','dialog'); control.setAttribute('aria-controls','crystal-rest-exchange'); }
      else { control.removeAttribute('aria-haspopup'); control.removeAttribute('aria-controls'); }
    }
    moveHint.hidden = !isLive;
    text(moveHint, !isFilled(moveTank.value) ? '目标缸还未注水，请先完成开缸。' : targetHasBrood ? '目标缸已有一窝未孵化，暂不能移入这只抱卵母虾。' : carrying?.status === 'formed' ? `抱卵母虾移缸时，${movingBrood} 只后代的预留位置一起转移；目标缸完成后剩 ${moveFree} 位。` : carrying?.status === 'hatched' ? '幼虾已经孵化；这次只移动母虾，幼虾仍留在原缸。' : moveFree < 0 ? '目标缸没有足够空位（包含已预留的位置）。' : '移缸保留身份、名字和亲代关系。');
    if(recallFull)text(moveHint,(globalFree(state)<1?'全局 50 位已占满，含未孵化预留。':'这口缸的位置已用完，含未孵化预留。')+
      (exchangeIn?'可以和这口缸里的一只空闲成虾免费换位。':'这里暂时没有可换位的空闲成虾。'));
    disable(focus, !inTank(record)); disable(protect, !isLive);
    disable(moveTank, !canMove); disable(move, !canMove || !targetWet || targetHasBrood || !exchangeIn && (moveFree < 0 || resting && globalFree(state)<1));
    const canSell = !saleRestriction(state,record); disable(sell, !canSell); disable(sellConfirm, !canSell || sellId !== record.id);
    saleConfirm.hidden = sellId !== record.id || !inTank(record);
    text(saleText, `确定出售「${nameOf(record)}」吗？获得 ${TRANSFER_PRICE} 金币，它会离开鱼缸，档案和后代关系保留。`);
  }
  function updateParentHistory(card, record, batchIndices, state) {
    card.history.hidden = !record || !batchIndices.length;
    if (card.history.hidden) { card.history.open=false; return; }
    text(card.historyTitle, `过往配对 · ${batchIndices.length} 窝`);
    if (!card.history.open) return;
    const partner=record.sex==='female'?father:mother;
    const choices=new Map(Array.from(partner.options,option=>[option.value,option.textContent]));
    const seen=new Set();
    const rows = [...batchIndices].reverse().map(index => {
      const batch=state.batches[index];
      const mateId = batch.motherId === record.id ? batch.fatherId : batch.motherId;
      const mate = state.individuals.find(r => r.id === mateId);
      const kids = batch.children;
      const mean = traitNames.map((label,i) => label + ' ' + quality(kids.reduce((sum,kid) => sum+kid.P[i],0)/kids.length));
      const known = kids.filter(kid => kid.colour && kid.pattern);
      const hits = known.filter(kid => hasGoalColour(kid,goal.value)).length;
      let observed = '';
      if (goal.value) observed = known.length ? `\n记录到${goalLabel(goal.value)} ${hits}/${known.length} 只` : '\n这窝没有花色记录';
      const target = broodQualityTarget(qualityGoal.value,record,mate);
      if (target) observed += `\n按当时双亲比较，${targetText(target)}的有 ${kids.filter(target.matches).length}/${kids.length} 只`;
      const name=choices.get(mateId) || (mate ? siblingName(mate,state.individuals)+' · '+tankName(mate.tank) : nameOf(mate));
      const pick=choices.has(mateId) && mateId!==partner.value && !seen.has(mateId);
      seen.add(mateId);
      return {id:batch.id, pick:pick?mateId:null, name, label:`第 ${index+1} 窝 · 与${name} · ${kids.length} 只成年后代`,
        result:'这窝平均：' + mean.join('　') + observed};
    });
    const signature = JSON.stringify(rows);
    if (card.historySignature === signature) return;
    card.historySignature=signature;
    card.entries.replaceChildren(...rows.map(row => {
      const item=node('div'), see=button(row.label, () => {
        openBroodReview(row.id);
      });
      item.append(see,node('p','crystal-muted',row.result));
      if(row.pick){
        const pick=button('选回这位搭档',()=>chooseParent(row.pick));
        pick.setAttribute('aria-label','选回搭档：'+row.name);
        item.append(pick);
      }
      return item;
    }));
  }
  function updateBreeding(state) {
    if (panel.hidden || activePage !== 'breed') return;
    const key=pairingStorageKey();
    const restore=key!==pairingKey;
    let draft;
    if(restore){
      clearDraftWriteFailure();
      pairingKey=key;lastPairing=null;
      pairIntent.restore(key);naturalIntent.restore(key);
      draft=readPairing(key);
      if(draft)lastPairing=JSON.stringify(draft);
      restoreChoice(goal,draft?.goal);restoreChoice(qualityGoal,draft?.quality);restoreChoice(broodSize,draft?.size);
      draftOrder=commissions.find(card=>card.id===draft?.order);
    }
    if(draftOrder && (!commissionFitsGoal(draftOrder,goal.value) || state.commissions?.deliveries.some(r=>r.commissionId===draftOrder.id)))draftOrder=null;
    orderNote.hidden=!draftOrder;
    if(draftOrder)text(orderText,`这窝记入「${draftOrder.title}」求购 · 成年覆盖至少 ${draftOrder.minCoverage} 分`);
    const adults = state.individuals.filter(record => canSelectParent(state,record));
    const parentNames = familyIndex(state).names;
    const parentOption = record => ({value:record.id, label:parentNames.get(record.id)+' · '+tankName(record.tank)});
    options(mother, adults.filter(record => record.sex === 'female').map(parentOption), '选择一只成年母虾');
    options(father, adults.filter(record => record.sex === 'male').map(parentOption), '选择一只成年公虾');
    if(restore){restoreChoice(mother,draft?.mother);restoreChoice(father,draft?.father);}
    const selected = [mother.value, father.value].map(id => state.individuals.find(record => record.id === id));
    const both = selected.every(Boolean), size = Number(broodSize.value);
    pairCloseup.hidden=!selected.every(hasSiblingPhoto);
    const all=counts(state), globallyFree=50-all.animals-all.reserved;
    const rooms=state.tanks.filter(tank=>state.unified || tank.id!=='main').map(tank=>{
      const occupied=counts(state,tank.id), moving=selected.filter(record=>record && record.tank!==tank.id);
      const space=tank.capacity-occupied.animals-occupied.reserved;
      const roomAvailable=space-moving.length, filled=isFilled(tank.id), busy=occupied.reserved>0;
      const after=Math.min(roomAvailable,globallyFree)-size;
      const status=!filled?'未注水':busy?'已有一窝未孵化':!both?'余 '+space+' 位':after<0?'这窝还缺 '+(-after)+' 位':'安排后余 '+after+' 位';
      return {tank,occupied,moving,roomAvailable,filled,busy,after,value:tank.id,label:tankName(tank.id)+' · '+status};
    });
    options(breedingTank,rooms.map(({value,label})=>({value,label})));
    if(restore){
      restoreChoice(breedingTank,draft?.tank);
      if(draft){
        const missing=!!draft.mother && !mother.value || !!draft.father && !father.value;
        announce(missing?'上次挑的亲虾已有不能配对的，请补选空位。':draft.tank!==breedingTank.value?'已恢复选亲，请重新核对繁育缸。':'已恢复上次的选亲草稿，确认后才会安排这一窝。');
      }
    }
    rememberPairing();
    const {tank:target,occupied,moving,roomAvailable,busy:targetBusy,filled:targetFilled}=rooms.find(room=>room.value===breedingTank.value);
    const available = Math.min(roomAvailable,globallyFree);
    const roomAfter = roomAvailable-size, free = available-size;
    text(plan,both?`安排「${parentNames.get(mother.value)}」和「${parentNames.get(father.value)}」这一窝`:'安排这一窝');
    const bornIn=new Map(), raised=new Map();
    state.batches.forEach((batch,index)=>{
      if(batch.status!=='complete')return;
      for(const child of batch.children)bornIn.set(child.id,index);
      for(const id of [batch.motherId,batch.fatherId]){
        if(!raised.has(id))raised.set(id,[]);
        raised.get(id).push(index);
      }
    });
    selected.forEach((record, index) => {
      const card = parentCards[index];
      showObservation(card.observation,record);
      if (record) portrait(card.image, record, state.now);
      else { portraitRequests.delete(card.image); card.image.hidden = true; }
      const previous=raised.get(record?.id) || [];
      text(card.info, record ? [appearance(record),!previous.length && '暂无成年后代记录'].filter(Boolean).join(' · ') : '');
      card.scores.hidden=!record;
      text(card.traits, record ? qualities(record) : '');
      updateParentHistory(card, record, previous, state);
    });
    const compatible = !both || Boolean(selected[0].colour) === Boolean(selected[1].colour);
    const outcomes = both && compatible ? appearanceOutcomes(...selected) : [];
    possibleTargets.hidden=!outcomes.length;
    showTargetBranches(outcomes,goal.value);
    const focus = broodQualityTarget(qualityGoal.value,...selected);
    const widthProblem=bandGoalProblem(qualityGoal.value,goal.value,...selected);
    targetHint.hidden = !focus && !widthProblem;
    if(widthProblem)text(targetHint,widthProblem);
    else if(focus?.pattern){
      const references=selected.filter(r=>focus.accepts(r) && focus.difference(r)===0);
      text(targetHint,'条带纹后代可以和'+references.map(nameOf).join('、')+'比较。'+targetText(focus)+'。');
    }else if (focus) text(targetHint,focus.atLimit
      ? `亲虾的${traitNames[focus.index]}已经满分。看看这窝有几只成年后也能拿 9 分。`
      : `这一窝期待至少一只成年后${targetText(focus)}，高过表现最好的亲虾。`);
    const desired=goal.value && outcomes.find(o=>o.key===goal.value);
    const unreachable = both && !!goal.value && !desired;
    const history = both ? state.batches.filter(b => b.motherId === mother.value && b.fatherId === father.value && b.status === 'complete') : [];
    const previousIntent=history.findLast(b=>b.intent);
    reuseIntent.hidden=!previousIntent || !!pairIntent.input.value.trim();
    reuseIntent.value=previousIntent?.intent || '';
    if(!reuseIntent.hidden)text(reuseIntent,'沿用第 '+(state.batches.indexOf(previousIntent)+1)+' 窝的留话');
    pastOffspring.hidden=!history.length;
    pastOffspring.value=history.at(-1)?.id || '';
    text(pastOffspring,history.length>1?'并排看这对以前的孩子':'看这对上次育出的孩子');
    const sourceOf=trait=>{
      const carriers=selected.filter(r=>r[trait]===desired[trait]);
      return carriers.length===2?'双亲':sexName(carriers[0].sex)+nameOf(carriers[0]);
    };
    text(chance, !both ? '选好两只亲虾后，这里会列出可能的花色。' : [
      parentageClue(...selected),
      desired && `${appearance({colour:desired.colour})}体色来自${sourceOf('colour')}，${appearance({pattern:desired.pattern})}来自${sourceOf('pattern')}。`+
        (desired.probability===1 ? `这窝 ${size} 只都会是这个花色。` : `每只出现这个花色的机会是 ${desired.probability*100}%。这 ${size} 只里可能有多只符合，也可能一只都没有。`),
      !outcomes.length && '亲虾缺少可比较的花色记录。',
      history.length ? pairHistoryClue(history,goal.value,focus) : '这对亲虾还没有成年后代记录。',
    ].filter(Boolean).join('\n'));
    const copy = [`${tankName(target?.id)}：现有 ${occupied.animals} 只，已预留 ${occupied.reserved} 位。`, both ? moving.length ? `确认会把${moving.map(record=>parentNames.get(record.id)).join('、')}移入这里。` : '两只亲虾已经在这个缸，不需要搬动。' : '先选好一公一母，再确认搬动和余位。', `这窝预留 ${size} 位${both && free >= 0 ? `，安排后还可用 ${free} 位。` : '。'}`];
    if (!compatible) copy.push('这两只的花色资料不兼容，请重新选亲。');
    else if (unreachable && outcomes.length) {
      const [colour,pattern]=goal.value.split(':');
      const missing=[!outcomes.some(o=>o.colour===colour) && appearance({colour}),!outcomes.some(o=>o.pattern===pattern) && appearance({pattern})].filter(Boolean);
      copy.push('想育出'+goalLabel(goal.value)+'，这对亲虾还缺'+missing.join('和')+'。');
    }else if(unreachable)copy.push('这对亲虾没有可预测的花色记录。');
    if (!targetFilled) copy.push('目标缸还未注水，请先完成开缸。');
    if (targetBusy) copy.push('这个缸已有一窝未孵化，请等待孵化或选择另一缸。');
    if(widthProblem)copy.push(widthProblem);
    const canPair=both && compatible && !unreachable && !widthProblem;
    const canMakeSpace=canPair && free<0 && !targetBusy && targetFilled;
    spaceContexts.direct=canMakeSpace?spaceContext(target.id,size,mother.value,father.value,-roomAfter,size-globallyFree):null;
    roomHelp.hidden=!canMakeSpace;
    const alternate=canPair && (free<0 || targetBusy || !targetFilled) && rooms.filter(room=>room.filled && !room.busy && room.after>=0)
      .sort((a,b)=>a.moving.length-b.moving.length)[0];
    alternateRoom.hidden=!alternate;
    if(alternate){
      alternateRoom.value=alternate.value;
      text(alternateRoom,'改在'+tankName(alternate.value)+'安排 · 保留这窝 '+size+' 只');
    }
    disable(alternateRoom,!alternate);
    smallPlan.hidden=!(canMakeSpace && size===4 && available>=2);
    disable(smallPlan,smallPlan.hidden);
    const transferable=canMakeSpace?state.individuals.filter(r=>!selected.includes(r) && !saleRestriction(state,r)):[];
    const saleSource=transferable.find(r=>r.tank===target?.id) || (roomAfter>=0 && transferable[0]);
    spaceSale.hidden=!saleSource;
    if(saleSource)spaceSale.dataset.tank=saleSource.tank;
    if (both && free < 0) {
      if (roomAfter<0) copy.push(`这口缸还缺 ${-roomAfter} 位。`);
      if (globallyFree<size) {
        copy.push(`全局 ${all.animals} 只活虾＋${all.reserved} 位预留，上限 50。这窝还缺 ${size-globallyFree} 位，移缸无法腾出总名额。`);
      }
    }
    const duration=ms=>ms%60000===0 ? ms/60000+' 分钟' : timeLeft(ms);
    const timing='从确认这窝算起，约 '+duration(state.stageMs.hatch)+'后孵化，约 '+duration(state.growthMs)+'后可比较成年品质。';
    if(canPair && free>=0 && !targetBusy && targetFilled)copy.push(timing);
    text(planSummary, copy.join('\n')); planSummary.classList.toggle('is-error', !!widthProblem || both && free < 0 || targetBusy || !targetFilled);
    disable(plan, !canPair || free < 0 || targetBusy || !targetFilled); disable(mother, false); disable(father, false); disable(breedingTank, false); disable(broodSize, false);
    if(natural.open){
      naturalPreview=naturalPair(state);
      const dam=adults.find(r=>r.id===naturalPreview?.motherId), sire=adults.find(r=>r.id===naturalPreview?.fatherId);
      naturalCloseup.hidden=!hasSiblingPhoto(dam) || !hasSiblingPhoto(sire);
      const outcomes=dam && sire ? appearanceOutcomes(dam,sire) : [];
      naturalTargets.hidden=!outcomes.length;
      showNaturalBranches(outcomes);
      const main=state.tanks.find(tank=>tank.id==='main'), naturalCount=Number(naturalSize.value);
      const relationship=parentageClue(dam,sire);
      const mainBusy=state.batches.some(batch=>batchTankId(batch)==='main' && ['planned','formed'].includes(batch.status));
      const mainAvailable=Math.min(roomFree(state,main),globallyFree), mainFree=mainAvailable-naturalCount;
      spaceContexts.natural=dam && sire && !mainBusy && isFilled('main') && mainFree<0?
        spaceContext('main',naturalCount,dam.id,sire.id,naturalCount-roomFree(state,main),naturalCount-globallyFree):null;
      naturalHelp.hidden=!spaceContexts.natural;
      smallNatural.hidden=!(dam && sire && !mainBusy && isFilled('main') && naturalCount===4 && mainFree<0 && mainAvailable>=2);
      disable(smallNatural,smallNatural.hidden);
      text(naturalSummary,!dam || !sire ? '主缸还需要一对成年、空闲且可以配对的亲虾。' : `${siblingName(dam,adults)}（母） × ${siblingName(sire,adults)}（公）${relationship ? ' · '+relationship : ''}\n这窝需要 ${naturalCount} 位。${!isFilled('main') ? '主缸还未注水。' : mainBusy ? '主缸已有一窝未孵化，请等待孵化。' : globallyFree<naturalCount ? '全局还缺 '+(naturalCount-globallyFree)+' 位，移缸无法腾出总名额。' : mainFree<0 ? '主缸还缺 '+(-mainFree)+' 位。' : '安排后还有 '+mainFree+' 位可用。\n'+timing}`);
      disable(naturalSize,false); disable(naturalPlan,!dam || !sire || mainBusy || mainFree<0 || !isFilled('main'));
    }else{spaceContexts.natural=null;naturalHelp.hidden=true;naturalCloseup.hidden=true;}
    spacePicker.sync();
    const ids = new Set(state.batches.map(batch => batch.id));
    const family=new Map(state.individuals.map(r=>[r.id,r]));
    let canResume=false;
    for (const [id, row] of batchRows) if (!ids.has(id)) { photoAlbum.updateBroodShelf(row.detail,null); row.root.remove(); batchRows.delete(id); }
    for (const [index,batch] of state.batches.entries()) {
      if(matchesComparison(batch)){
        const subject=comparisonSubject(batch,id=>family.get(id));
        text(resumeComparison,(batch.status==='hatched'?'继续看幼虾':'继续上次对照')+' · 第 '+(index+1)+' 窝'+(subject?' · '+subject:''));
        canResume=true;
      }
      let row = batchRows.get(batch.id);
      if (!row) {
        const root = node('section', 'crystal-batch'), heading = node('strong'), parentsText = node('p', 'crystal-muted'), steps = node('p', 'crystal-stage-line'), progress = node('progress'), timing = node('p'), cancel = button('取消未形成的计划', () => run(() => onAction({type:'cancel', batchId:batch.id}), '计划已取消，后代预留位置已释放；亲虾仍留在当前缸。'));
        const intent=node('p','crystal-keeper-note crystal-brood-intent');
        const detail = button('挑两只细看', event => siblingView.open(batch.id,null,event.currentTarget,heading), 'crystal-sibling-open');
        const study = button('再看记下的两只', event => siblingView.openRemembered(batch.id,event.currentTarget,detail),'crystal-sibling-study');
        for(const control of [detail,study]){control.setAttribute('aria-haspopup','dialog');control.setAttribute('aria-controls','crystal-sibling-view');}
        heading.tabIndex = -1; root.dataset.batchId = batch.id; progress.max = 1; progress.setAttribute('aria-label', '这一窝的成长进度'); root.append(heading, parentsText, intent, steps, progress, timing, cancel, detail, study); row = {root, heading, parentsText, intent, steps, progress, timing, cancel, detail, study}; batchRows.set(batch.id, row); batchList.prepend(root);
      }
      row.detail.hidden = !['hatched','complete'].includes(batch.status) ||
        batch.children.filter(kid => hasSiblingPhoto(family.get(kid.id))).length < 2;
      row.study.hidden = row.detail.hidden || !batch.siblingStudy;
      photoAlbum.updateBroodShelf(row.detail,hasHatched(batch) ? batch : null);
      const homes=broodHomes(batch,family);
      text(row.heading, `第 ${index+1} 窝 · ${broodLocation(batch)} · ${batch.source === 'natural' ? '自然繁殖 · ' : ''}${batch.size} 只 · ${STAGES[batch.status] || batch.status}`+(homes?' · '+homes:''));
      const parents = [family.get(batch.motherId),family.get(batch.fatherId)];
      const target = broodQualityTarget(batch.qualityGoal,...parents);
      const order=batch.commissionGoal && commissions.find(c=>c.id===batch.commissionGoal);
      let orderLine='';
      if(order){
        orderLine=`求购「${order.title}」：成年覆盖至少 ${order.minCoverage} 分`;
        if(state.commissions.deliveries.some(r=>r.commissionId===order.id))orderLine+='（委托已完成）';
      }
      const active=!['complete','cancelled'].includes(batch.status);
      const parentKey=active ? JSON.stringify(parents.map(r=>[r.id,r.name,r.tank,r.soldAt])) : '';
      if(row.parentKey!==parentKey){
        row.parentKey=parentKey; row.parentLinks?.remove();
        if(active){
          row.parentLinks=node('div','crystal-repeat');
          row.parentLinks.append(...parents.map(broodParentLink));
          row.heading.after(row.parentLinks);
        }
      }
      text(row.parentsText, [!active && parents.map(nameOf).join(' × '),batch.goal && '想育出' + goalLabel(batch.goal),target && targetText(target),orderLine].filter(Boolean).join(' · '));
      row.parentsText.hidden=!row.parentsText.textContent;
      showBroodIntent(row.intent,batch);
      text(row.steps, '准备配对 → 抱卵 → 孵化 → 成年');
      row.steps.hidden = row.progress.hidden = ['complete','cancelled'].includes(batch.status);
      if(!row.progress.hidden)row.progress.value = Math.max(0, Math.min(1, (Math.max(Date.now(), state.now) - batch.plannedAt) / (batch.adultAt - batch.plannedAt)));
      const next = batch.status === 'planned' ? batch.formedAt : batch.status === 'formed' ? batch.hatchAt : batch.adultAt;
      row.timing.hidden=batch.status==='complete';
      if (!row.timing.hidden) {
        row.resultKey=null;
        text(row.timing,batch.status === 'cancelled' ? '已取消，未产生后代。' : `${batch.status === 'planned' ? '距离配对形成' : batch.status === 'formed' ? '距离孵化' : '距离成年'}：${timeLeft(next - Math.max(Date.now(), state.now))}`);
        if (row.review) { row.review.remove(); delete row.review; }
      }
      const subjects = batch.status === 'hatched' ? batch.children.map(child => child.id) : [];
      const birthOrder = subjects.map(id => family.get(id));
      const residents = birthOrder.filter(r => r && inTank(r));
      const subjectKey = JSON.stringify([batch.status,batch.goal,birthOrder.map(r => r && [r.id,r.name,r.colour,r.pattern,r.tank,r.observation])]);
      if (subjectKey !== row.subjectKey) {
        row.subjectKey = subjectKey; row.locators?.remove(); row.favorites=[]; row.hatchlingImages=[];
        if (residents.length) {
          row.locators = node('div','crystal-hatchlings');
          row.root.append(row.locators);
          row.locators.append(node('p','crystal-muted','幼虾已经有了花纹。长大时，白色覆盖和纹样的边缘会慢慢显出来。'));
          for (const r of residents) {
            const label=broodName(r,birthOrder);
            const locate=button('在缸中找'+label,e=>focusIndividual(r.id,{source:e.currentTarget}));
            locate.dataset.broodLocate=r.id;
            locate.setAttribute('aria-label',locate.textContent);text(locate,'去缸里看它');
            const card=node('section','crystal-child'), image=node('img','crystal-portrait'), info=node('div');
            image.alt=''; card.dataset.hatchling=r.id;
            info.append(node('strong','',label),node('p','crystal-muted',[appearance(r)||'花色未记录',tankName(r.tank)].join(' · ')));
            appendObservation(info,r);
            info.append(locate,broodFavorite(row,r,label));
            card.append(siblingPhoto(row,batch.id,r,label,image),info); row.locators.append(card);
            if(appearance(r))row.hatchlingImages.push({id:r.id,image});else image.hidden=true;
          }
        }
      }
      for(const {id,image} of row.hatchlingImages)portrait(image,family.get(id),state.now);
      if (batch.status === 'complete') updateReview(row, batch, state, adults, target, family, order, bornIn, raised);
      if(batch.status==='complete' && row.review.open){
        for(const {link,id,card} of row.commissionOffers){
          link.hidden=!!saleRestriction(state,family.get(id)) || !!state.commissions?.deliveries.some(r=>r.commissionId===card.id);
          disable(link,link.hidden);
        }
      }
      if(batch.status==='hatched' || row.review?.open) {
        for(const {id,star,mark} of row.favorites) {
          const saved=family.get(id).protected, pressed=String(saved);
          text(star,saved?'已收藏':'收藏');
          if(star.getAttribute('aria-pressed')!==pressed)star.setAttribute('aria-pressed',pressed);
          if(mark)text(mark,saved?' · 已收藏':'');
        }
      }
      row.cancel.hidden = batch.status !== 'planned'; disable(row.cancel, batch.status !== 'planned');
    }
    resumeComparison.hidden=!canResume;
    batchEmpty.hidden = state.batches.length > 0;
  }
  function siblingPhoto(row,batchId,record,label,image) {
    if(row.detail.hidden || !hasSiblingPhoto(record))return image;
    const trigger=button('',event=>siblingView.open(batchId,record.id,event.currentTarget,row.detail),'crystal-sibling-photo');
    trigger.setAttribute('aria-label','细看'+label+'，和同窝比较');
    trigger.setAttribute('aria-haspopup','dialog');
    trigger.title='放大细看';
    trigger.append(image);
    return trigger;
  }
  function openBroodReview(id, individualId) {
    const row=batchRows.get(id), review=row?.review;
    if(row)rememberComparison(id,individualId);
    if (review) {
      review.open=true; update();
      const child=individualId && review.querySelector(`[data-brood-locate="${CSS.escape(individualId)}"]`);
      (child || review.firstElementChild).focus();
    }
    else {
      const child=individualId && row?.root.querySelector(`[data-brood-locate="${CSS.escape(individualId)}"]`);
      (child || row?.heading)?.focus();
    }
  }
  function closeGrowthList(restoreFocus) {
    if (!growthDialog.open) return;
    growthDialog.close();
    journal.insertBefore(growthList, batchList);
    head.after(feedback);
    if (restoreFocus) activity.focus({preventScroll:true});
  }
  function openGrowthList(atTank){
    if(!growthLinks.size)return;
    if(atTank){
      growthDialog.append(growthList,feedback);
      announce('');
      if(!growthDialog.open)growthDialog.showModal();
    }else{
      showPage('breed');
      if(panel.hidden)setOpen(true);
    }
    growthList.querySelector('[data-growth-id]')?.focus();
  }
  function openGrowthJournal(batch) {
    showPage('breed'); setOpen(true);
    openGrowthBatch(batch);
  }
  async function visitGrowthBatch(batch, stillCurrent, onVisited) {
    if (batch.status === 'formed') {
      const found = await focusIndividual(batch.motherId);
      if (found) inspect.focus({preventScroll:true});
      return found;
    }
    const rooms = liveBroodTanks(batch, familyIndex(getState()).byId);
    if (!rooms.length) { openGrowthJournal(batch); return true; }
    if (rooms.length === 1 && rooms[0] !== getActiveTank()) {
      const home = tankName(rooms[0]);
      if (!await run(() => onSwitch(rooms[0]), '已回到'+home+'。', '正在前往'+home+'…')) return false;
    }
    if (!stillCurrent()) return false;
    tankPair=null;
    setOpen(false);
    const findFirst=batch.status==='hatched';
    if(findFirst && getSelected())onSurvey();
    const waitingForRoom=findFirst && !rooms.includes(getActiveTank());
    broodWatch.open(null, batch.id, null, {findFirst,onVisited:waitingForRoom?onVisited:null});
    update();
    return !waitingForRoom && !broodWatch.root.hidden;
  }
  function showGrowth(events, replace = false) {
    if (replace) {
      closeGrowthList(false);
      spacePicker.reset();
      mateComparison.reset();
      broodWatch.close();
      pairPhotoView.close(false);
      tankGrowth.open=false;
      tankGrowth.dataset.owner='';
      familyRoom='';
      draftPhotoCrop=null;
      if (pendingDraftWrite) { clearDraftWriteFailure(); pairingKey=null; }
      photoAlbum.close();
      lineJournal.reset();
      if(familyOrigin?.lineBook)familyOrigin=null;
      tankPair=null;
      rookiePhotoOrigin=null;
      tankReturn=null;
      growthLinks.clear(); growthList.replaceChildren();
    }
    const state = getState();
    const individuals=new Map(events.length ? state.individuals.map(r=>[r.id,r]) : []);
    for (const event of events) {
      const batch = event.kind === 'batch' && state.batches.find(b => b.id === event.id);
      const individual = !batch && individuals.get(event.id);
      if (!batch && !individual) continue;
      const key = event.kind + ':' + event.id;
      let entry = growthLinks.get(key);
      if (!entry) {
        const group=node('div','crystal-growth-entry');
        const read=at=>{
          if (growthLinks.get(key)===entry && Number(group.dataset.growthAt)===at && onReadGrowth(event.kind,event.id,at)) {
            growthLinks.delete(key); group.remove(); growthList.hidden = !growthLinks.size;
            update();
          }
        };
        const link = button('', async () => {
          if(busy)return;
          const at=Number(group.dataset.growthAt);
          if (batch) {
            const fromInbox=growthDialog.open;
            const current=getState().batches.find(b=>b.id===event.id);
            if(!current)return;
            if(!await visitGrowthBatch(current,()=>growthLinks.get(key)===entry && (!fromInbox || growthDialog.open),()=>read(at)))return;
          }
          else {
            const resident = getState().individuals.find(r => r.id === event.id);
            if(!resident)return;
            if(inTank(resident)){
              if(!await focusIndividual(resident.id))return;
              if(!inspect.hidden)inspect.focus({preventScroll:true});
            }else{
              setOpen(true); visitIndividual(resident.id,null);
            }
          }
          read(at);
        });
        const journalLink=button('翻这窝手记',()=>{
          if(busy)return;
          const at=Number(group.dataset.growthAt), current=getState().batches.find(b=>b.id===event.id);
          if(!current)return;
          openGrowthJournal(current); read(at);
        });
        if(batch)journalLink.dataset.growthJournal=event.id;
        const study=button('再看记下的两只',()=>{
          if(busy)return;
          const at=Number(group.dataset.growthAt);
          showPage('breed');setOpen(true);
          const row=batchRows.get(event.id);
          if (row && siblingView.openRemembered(event.id,row.study,row.detail)) read(at);
        });
        study.setAttribute('aria-haspopup','dialog');study.setAttribute('aria-controls','crystal-sibling-view');
        if(batch)study.dataset.growthStudy=event.id;
        link.dataset.growthId = event.id;
        link.dataset.growthKind = event.kind;
        group.append(link,journalLink,study);entry={group,link,journalLink,study};growthLinks.set(key,entry);
      }
      const {group,link,journalLink,study}=entry;
      study.hidden=!batch?.siblingStudy;
      journalLink.hidden=true;
      const details=[];
      if(batch){
        const mother=nameOf(individuals.get(batch.motherId));
        const father=nameOf(individuals.get(batch.fatherId));
        const rooms=liveBroodTanks(batch,individuals);
        const carrying=event.stage==='formed';
        link.dataset.brief = carrying ? mother+'抱卵了' : mother+'的 '+batch.size+' 只孩子'+(event.stage==='hatched'?'孵化了':'长大了');
        if(carrying) {
          link.dataset.place=tankName(batchTankId(batch));
          link.dataset.action='去缸里看母虾';
        }else if(rooms.length===1){
          link.dataset.place=tankName(rooms[0]);
          link.dataset.action='去'+link.dataset.place+(event.stage==='hatched'?'找小虾':'看这一窝');
        }else{
          link.dataset.place=rooms.length ? '分住 '+rooms.length+' 口缸' : '这窝已离缸';
          link.dataset.action=rooms.length ? (event.stage==='hatched'?'选一口缸找小虾':'挑一只去缸里看') : '翻这窝手记';
        }
        details.push('第 '+(state.batches.indexOf(batch)+1)+' 窝','公虾 '+father);
        if(rooms.length>1 || carrying)details.push(link.dataset.place);
        link.title=[broodLocation(batch),broodHomes(batch,individuals)].filter(Boolean).join(' · ');
        journalLink.hidden = !rooms.length && !carrying;
      }else{
        link.dataset.brief=siblingName(individual,state.individuals)+' · 已成年';
        link.dataset.place=tankName(individual.tank);
        link.dataset.action=inTank(individual)?'去缸里看它':'看它的档案';
        details.push(link.dataset.place);
      }
      details.push(link.dataset.action);
      text(link,[link.dataset.brief,details.join(' · '),batch?.intent && '当时想看 · '+batch.intent].filter(Boolean).join('\n'));
      if(group.dataset.growthAt!==String(event.at)){
        group.dataset.growthAt = event.at;
        const older = Array.from(growthList.children).find(other => other !== group && Number(other.dataset.growthAt) < event.at) || null;
        if (!group.parentNode || group.nextElementSibling !== older) growthList.insertBefore(group,older);
      }
    }
    growthList.hidden = !growthLinks.size; update();
  }
  function broodArt(record,now) {
    const art=node('span','crystal-pair-art'), status=node('span','crystal-portrait-status');
    if(record.colour && record.pattern){
      const image=node('img','crystal-portrait'); image.alt='';
      art.append(image,status); portrait(image,record,now,status);
    }else{ text(status,'花色未记录'); art.append(status); }
    return art;
  }
  function familyAdult(record,role,name,now) {
    const card=node('div','crystal-family-adult'), caption=node('div');
    card.dataset.familyAdult=record.id;
    caption.append(node('small','',role),node('strong','',name));
    const look=appearance(record);
    if(look)caption.append(node('small','',look));
    appendObservation(caption,record,'small'); card.append(broodArt(record,now),caption);
    return card;
  }
  function broodPortraitPage(brood, number, kids, now, childLink, {current=false,partnerCard}={}) {
    const page=node('section','crystal-pair-page');
    page.dataset.portraitBrood=brood.id;
    page.style.setProperty('--brood-rows',String(kids.length+(partnerCard?2:1)));
    const header=node('div'), title=node('h4','','第 '+number+' 窝'+(current?' · 本窝':partnerCard?' · '+kids.length+' 只':''));
    header.append(title);
    if(brood.intent)header.append(node('p','crystal-keeper-note crystal-brood-intent','当时想看 · '+brood.intent));
    page.append(header);
    if(partnerCard)page.append(partnerCard);
    for(const kid of kids){
      const name=broodName(kid,kids), look=appearance(kid);
      const card=childLink(kid);
      card.className='crystal-pair-shrimp';
      card.dataset.pairChild=kid.id;
      const place=kid.soldAt!==null?'已转让':kid.tank==='rest'?'静养中':'';
      const note=[look, kid.protected && '已收藏', place].filter(Boolean).join(' · ');
      card.setAttribute('aria-label','查看第 '+number+' 窝的'+name+(look?'':' · 花色未记录')+(note?' · '+note:'')+(kid.observation?' · 我的观察 · '+kid.observation:''));
      card.append(broodArt(kid,now),node('strong','',name));
      if(note)card.append(node('small','',note));
      appendObservation(card,kid,'small');
      page.append(card);
    }
    return page;
  }
  function updateFamilySpread(parent,grown,byId,names,now){
    const owner=JSON.stringify([getPairingKey(),parent.id,parent.adultAt]);
    familySpread.hidden=!grown.some(b=>b.mateId!==grown[0].mateId);
    if(familySpread.dataset.owner!==owner || familySpread.hidden){
      familySpread.dataset.owner=owner; familySpread.open=false; familyPeer.value='';
    }
    if(!familySpread.open){clearFamilyPhotos();return;}
    // The family list also includes unhatched broods. Only grown offspring belong on these pages.
    const base=grown.find(b=>b.batch.id===parentBroods.value) || grown[0];
    parentBroods.value=base.batch.id;
    const others=grown.filter(b=>b.mateId!==base.mateId), previous=familyPeer.value;
    options(familyPeer,others.map(b=>({value:b.batch.id,label:'第 '+b.number+' 窝 · 与'+names.get(b.mateId)})));
    const other=others.find(b=>b.batch.id===previous) || others.find(b=>b.number<base.number) || others.at(-1);
    familyPeer.value=other.batch.id; familyPeerField.hidden=others.length<2;
    const pages=[base,other].map(({batch,number,mateId})=>({batch,number,mate:byId.get(mateId),kids:batch.children.map(k=>byId.get(k.id))}));
    const key=JSON.stringify([owner,names.get(parent.id),broodPhotoKey(parent),pages.map(({batch,number,mate,kids})=>[batch.id,batch.intent,number,names.get(mate.id),broodPhotoKey(mate),kids.map(broodPhotoKey)])]);
    if(key===familyPhotoKey)return;
    const focused=familyPhotos.contains(document.activeElement) && document.activeElement.dataset.pairChild;
    familyPhotoKey=key;
    familyCommon.replaceChildren(familyAdult(parent,'两窝的'+sexName(parent.sex),names.get(parent.id),now));
    familyPhotos.replaceChildren(...pages.map(({batch,number,mate,kids})=>broodPortraitPage(batch,number,kids,now,
      kid=>button('',event=>showRecordBrood(batch,event.currentTarget,kid.id)),
      {partnerCard:familyAdult(mate,sexName(mate.sex)+'搭档',names.get(mate.id),now)})));
    if(focused)familyPhotos.querySelector('[data-pair-child="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
  }
  function updatePairHistory(row, batch, state, family, indices, target, aim) {
    if(indices.length<2){
      row.pairHistory?.root.remove();row.pairHistory=null;
      return;
    }
    if(!row.pairHistory){
      const root=node('details','crystal-records crystal-pair-history'), heading=node('summary');
      const pick=node('select'), picker=field('与哪一窝并排看',pick);
      const spread=node('div','crystal-pair-spread');
      const results=node('details','crystal-pair-results'), lines=node('div');
      root.dataset.lineage='pair';
      results.dataset.lineage='pair-results';
      results.append(node('summary','','查看历次育成记录'),lines);
      root.append(heading,picker,node('p','crystal-muted','成年后代按出生顺序排列。点一只虾可以翻到它的手记。'),spread,results);
      row.review.insertBefore(root,row.review.lastElementChild);
      const history={root,heading,picker,pick,spread,results,lines};
      row.pairHistory=history;
      root.addEventListener('toggle',()=>{
        if(!root.isConnected)return;
        if(root.open)update();
        else{spread.replaceChildren();history.photoKey=null;}
        if(root.contains(document.activeElement))rememberComparison(batch.id);
      });
      results.addEventListener('toggle',()=>{if(results.open)update();});
      pick.addEventListener('change',()=>{update();rememberComparison(batch.id);});
    }
    const history=row.pairHistory;
    text(history.heading,'并排看这对亲虾的后代 · '+indices.length+' 窝');
    const current=indices.find(i=>state.batches[i].id===batch.id);
    const others=indices.filter(i=>i!==current);
    const previous=history.pick.value;
    options(history.pick,others.map(i=>({value:state.batches[i].id,label:'第 '+(i+1)+' 窝'})).reverse());
    if(!others.some(i=>state.batches[i].id===previous)){
      const nearest=indices[indices.indexOf(current)-1] ?? others[0];
      history.pick.value=state.batches[nearest].id;
    }
    history.picker.hidden=others.length===1;
    if(!history.root.open)return;
    const other=others.find(i=>state.batches[i].id===history.pick.value);
    const pages=[current,other].map(i=>({i,brood:state.batches[i],kids:state.batches[i].children.map(k=>family.get(k.id))}));
    const photoKey=JSON.stringify(pages.map(({i,brood,kids})=>[i,brood.id,brood.intent,kids.map(broodPhotoKey)]));
    if(photoKey!==history.photoKey){
      const focused=history.spread.contains(document.activeElement) && document.activeElement.dataset.pairChild;
      history.photoKey=photoKey;
      history.spread.replaceChildren(...pages.map(({i,brood,kids})=>broodPortraitPage(brood,i+1,kids,state.now,
        kid=>linkedBrood('',batch.id,brood.id,kid.id),{current:brood.id===batch.id})));
      if(focused)history.spread.querySelector('[data-pair-child="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
    }
    if(!history.results.open)return;
    const criteria=[batch.goal && goalLabel(batch.goal),target && targetText(target)].filter(Boolean);
    const records=indices.map(i=>{
      const brood=state.batches[i], kids=brood.children;
      const {matched,evaluated,unknown}=pastGoalResults([brood],batch.goal,target);
      const parts=['第 '+(i+1)+' 窝'+(brood.id===batch.id?'（本窝）':'')];
      if(criteria.length && evaluated)parts.push(matched+'/'+evaluated+' 只'+aim);
      if(!criteria.length)parts.push(kids.length+' 只成年');
      if(unknown)parts.push(unknown+' 只花色未记录');
      if(target){
        const candidates=kids.filter(k=>target.accepts(k) && (!batch.goal || hasGoalColour(k,batch.goal)));
        if(candidates.length){
          const first=orderBrood(candidates,target)[0];
          parts.push((batch.goal?'目标花色中':'')+bestLabel(target)+' '+quality(first.P[target.index])+' 分');
        }else if(!unknown)parts.push(target.pattern && !batch.goal?'这窝没有可比较的条带纹后代':'这窝没有目标花色');
      }
      return [brood.id,parts.join(' · ')];
    }).reverse();
    const resultKey=JSON.stringify([criteria,records]);
    if(history.resultKey===resultKey)return;
    history.resultKey=resultKey;
    history.lines.replaceChildren();
    if(criteria.length)history.lines.append(node('p','crystal-muted','各窝都按本窝目标比较：'+criteria.join('、')));
    for(const [id,label] of records)history.lines.append(id===batch.id?node('p','',label):linkedBrood(label,batch.id,id));
  }
  function updateReview(row, batch, state, adults, target, family, order, bornIn, raised) {
    if (!row.review) {
      row.review = node('details','crystal-review');
      row.pairHistory=null;
      row.hasBirthLook=null;
      row.reviewMode=node('select');
      row.reviewMode.addEventListener('change',()=>{
        rememberComparison(batch.id);
        update();
      });
      row.growthAge=node('select');
      options(row.growthAge,[{value:'hatch',label:'刚孵化'},{value:'middle',label:'长到一半'}]);
      row.growthAge.onchange=()=>{rememberComparison(batch.id);update();};
      row.growthField=field('和成年时对照',row.growthAge);
      row.growthField.hidden=true;
      row.analysisResult=node('div','crystal-baseline');
      row.review.append(node('summary','','看看这一家'),field('看这一窝',row.reviewMode),row.growthField,row.analysisResult,node('div'));
      row.review.firstElementChild.addEventListener('click',()=>{if(!row.review.open)rememberComparison(batch.id);});
      row.review.addEventListener('toggle', () => { if (row.review?.open) update(); });
      row.root.append(row.review);
      row.signature = '';
    }
    const hasBirthLook=batch.hatchAt<batch.adultAt && batch.children.some(child=>child.colour && child.pattern);
    const hasBand=batch.children.some(k=>k.pattern==='band') || !!target?.pattern;
    if(row.hasBirthLook!==hasBirthLook || row.hasBand!==hasBand){
      const views=breedingDirections.filter(d=>!d.pattern || hasBand).map(d=>({
        value:d.value,label:d.pattern?'看'+orderLabel(d):'对照'+traitNames[d.index]+' · 从高到低',
      }));
      if(hasBirthLook)views.unshift({value:'growth',label:'并排看幼时与成年'});
      options(row.reviewMode,views,'看外观 · 按出生顺序');
      row.hasBirthLook=hasBirthLook;
      row.hasBand=hasBand;
    }
    const representative = family.get(batch.representativeId);
    const kids = batch.children.map(child => family.get(child.id));
    text(row.review.firstElementChild,representative ? '看看这一家 · 相册代表：'+broodName(representative,kids) : '看看这一家');
    if (!row.review.open) return;
    const mode=row.reviewMode.value;
    row.growthField.hidden=mode!=='growth';
    const middleAge=mode==='growth' && row.growthAge.value==='middle';
    const viewDirection=breedingDirection(mode);
    const compare=!!viewDirection;
    const colourHit = kid => hasGoalColour(kid,batch.goal);
    const matched=kids.filter(kid=>meetsBroodGoal(kid,batch.goal,target));
    const aim=batch.goal && target?'花色和品质都达标':batch.goal?'达到花色目标':'达到品质目标';
    const hasGoal=batch.goal || target;
    const known=batch.goal || target?.pattern ? kids.filter(k=>k.colour && k.pattern).length : kids.length;
    const missing=kids.length-known;
    const summary=hasGoal ? [known && `${known} 只${missing?'可对照的':''}后代中，${matched.length} 只${aim}。`,missing && `${missing} 只缺少花色记录。`].filter(Boolean).join('') : '这窝没有设定目标，可以对照后代与双亲。';
    const picks=compare && hasGoal ? matched.map(k=>[k.id,'查看「'+broodName(k,kids)+'」']) : [];
    if(compare && !picks.length && batch.goal && target){
      for(const {kid,byLook} of broodAlternatives(kids,batch.goal,target)){
        const score=quality(kid.P[target.index])+' 分', trait=traitNames[target.index];
        const clue=byLook?'符合目标花色，'+trait+' '+score:'本窝'+bestLabel(target)+' '+score+'，'+(appearance(kid)||'花色未记录');
        picks.push([kid.id,[broodName(kid,kids),clue,!inTank(kid) && tankName(kid.tank)].filter(Boolean).join(' · ')]);
      }
    }
    row.analysisResult.hidden=!compare;
    const resultKey=JSON.stringify([summary,picks]);
    if(compare && row.resultKey!==resultKey){
      row.resultKey=resultKey;
      row.analysisResult.replaceChildren(summary);
      if(picks.length){
        const links=node('span','crystal-repeat');
        for(const [id,label] of picks){
          const link=button(label,()=>openBroodReview(batch.id,id));
          if(matched.length)link.dataset.goalChild=id;
          else link.dataset.alternativeChild=id;
          links.append(link);
        }
        row.analysisResult.append(links);
      }
    }
    const dam = family.get(batch.motherId), sire = family.get(batch.fatherId);
    const canUse = [dam,sire].map(parent => adults.some(r => r.id === parent.id));
    const reward=albumReward(state.batches,batch);
    const repeatIndices=raised.get(dam.id).filter(index=>state.batches[index].fatherId===sire.id);
    updatePairHistory(row,batch,state,family,repeatIndices,target,aim);
    const descendants=new Map(kids.map(kid=>[kid.id,(raised.get(kid.id)||[]).map(index=>{
      const brood=state.batches[index], mate=family.get(brood.motherId===kid.id?brood.fatherId:brood.motherId);
      const look=kid.colour && kid.pattern && kid.colour+':'+kid.pattern;
      const {matched,evaluated,unknown}=pastGoalResults([brood],look,null);
      const sample=look && evaluated ? `${matched}/${evaluated} 只和它同花色` : `${brood.children.length} 只成年`;
      return [brood.id,`第 ${index+1} 窝 · 与「${nameOf(mate)}」 · ${sample}`+(unknown?`（${unknown} 只花色未记录）`:'')];
    })]));
    const signature = JSON.stringify([mode,middleAge,batch.goal,batch.qualityGoal,batch.commissionGoal,batch.representativeId,batch.rookieEntry,reward,dam.contestDebuts,sire.contestDebuts, ...[dam,sire,...kids].map(r => [r.id,r.name,r.P,r.colour,r.pattern,r.tank,r.soldAt,r.observation]), ...canUse,...kids.map(r=>canSelectParent(state,r)),bornIn.get(dam.id),bornIn.get(sire.id),...descendants.values()]);
    if (row.signature === signature) return;
    row.signature = signature;
    row.favorites=[];
    row.commissionOffers=[];
    const body = row.review.lastElementChild;
    const expanded=new Set(Array.from(body.querySelectorAll('details[data-lineage][open]'),entry=>entry.dataset.lineage));
    const result = [];
    if (batch.goal && known) result.push(`${goalLabel(batch.goal)}：${kids.filter(colourHit).length}/${known} 只`);
    if (missing) result.push(missing+' 只缺少花色记录');
    if (target) result.push(`${targetText(target)}：${kids.filter(target.matches).length}/${kids.length} 只`);
    if (target && batch.goal && known) result.push(`两项目标都达到：${matched.length} 只`);
    body.replaceChildren();
    if(compare && result.length)body.append(node('p','crystal-baseline',result.join('\n')));
    const parents = node('div','crystal-parents');
    body.append(parents);
    for (const parent of [dam,sire]) {
      const card=node('section'), image=node('img','crystal-portrait');
      image.alt=''; card.dataset.broodParent=parent.id;
      const look=appearance(parent);
      card.append(node('strong','',sexName(parent.sex)+' · '+nameOf(parent)),image,node('p','',look || '花色未记录'));
      appendObservation(card,parent);
      if(compare)card.append(node('p','',qualities(parent)));
      card.append(broodParentLink(parent));
      const origin=bornIn.get(parent.id);
      if(origin!==undefined)card.append(linkedBrood(`看它出生的第 ${origin+1} 窝`,batch.id,state.batches[origin].id,parent.id));
      parents.append(card);
      if (look) portrait(image,parent,state.now); else image.hidden=true;
    }
    const gallery=node('div','crystal-brood-gallery');
    if(mode==='growth'){
      gallery.classList.add('crystal-growth-gallery');
      body.append(node('p','crystal-muted','两张影像按这只虾的成长记录还原，用同样的大小看花纹。'));
    }
    body.append(gallery,button(batch.rookieEntry?'回看本窝新秀赛':'为本窝新秀赛挑一只虾',()=>openRookie(batch.id)));
    const familyCards=state.contests.cards.flatMap(card=>{
      const marks=parentContestMarks(card,kids[0],[dam,sire]);
      return marks.length ? [{value:card.id,label:contestName(card)+' · '+marks.map(({parent,score})=>sexName(parent.sex)+'「'+nameOf(parent)+'」'+points(score)+' 分').join('、')}] : [];
    });
    if(familyCards.length>1 && kids.some(k=>canCompete(k,state.now))){
      row.familyCard??=node('select');
      options(row.familyCard,familyCards);
      body.append(field('和亲虾比同一场',row.familyCard));
    }else if(familyCards.length===1)body.append(node('p','crystal-muted','亲虾赛绩 · '+familyCards[0].label));
    body.append(node('p','crystal-muted','舍不得卖的虾可以点「收藏」。'+(reward ? `选一只代表入相册，这窝可领 ${reward} 金币。虾留在原处。` : '每窝可以选一只相册代表，也可以换一只。')));
    const ranked=orderBrood(kids,viewDirection);
    for (const kid of ranked) {
      const item = node('section','crystal-child'), info = node('div');
      const label=broodName(kid,kids), heading=node('strong','',label), mark=node('span');
      heading.append(mark);
      gallery.append(item);
      if(mode==='growth'){
        item.append(heading);
        if(kid.colour && kid.pattern){
          const pair=node('div','crystal-age-pair');
          item.append(pair);
          const young=middleAge ? ['长到一半',batch.hatchAt+(batch.adultAt-batch.hatchAt)/2] : ['刚孵化',batch.hatchAt];
          for(const [stage,at] of [young,['成年',batch.adultAt]]){
            const figure=node('figure'), art=node('span','crystal-growth-photo'), image=node('img','crystal-portrait crystal-size-photo'), status=node('span','crystal-portrait-status');
            image.alt=label+' · '+stage;
            art.append(image,status); figure.append(art,node('figcaption','',stage)); pair.append(figure);
            portrait(image,kid,at,status);
          }
        }
      }else{
        const image=node('img','crystal-portrait');
        image.alt=''; item.append(siblingPhoto(row,batch.id,kid,label,image));
        if(appearance(kid))portrait(image,kid,state.now); else image.hidden=true;
        info.append(heading);
      }
      item.append(info);
      info.append(node('p','crystal-muted',[sexName(kid.sex),appearance(kid)||'花色未记录'].join(' · ')));
      appendObservation(info,kid);
      if(compare)info.append(node('p','',qualities(kid)));
      const higher = traitNames.filter((label,i) => i !== target?.index && !(viewDirection?.pattern && i===1) && Number(quality(kid.P[i])) > Number(quality(Math.max(dam.P[i],sire.P[i]))));
      const notes = [];
      if(compare && (!viewDirection.pattern || kid.pattern===viewDirection.pattern)) {
        const score=directionRank(viewDirection,kid);
        if(score===directionRank(viewDirection,ranked[0])){
          const tied=ranked.length>1 && directionRank(viewDirection,ranked[1])===score;
          const best=viewDirection.pattern?(viewDirection.lower?'白带最细':'白带最宽'):'最高';
          notes.push(traitNames[viewDirection.index]+' '+quality(kid.P[viewDirection.index])+' 分，'+(tied?'并列':'')+'本窝'+best);
        }
      }else if(viewDirection?.pattern && !target?.pattern){
        notes.push('其他纹样');
      }
      if (batch.goal) notes.push(broodColourNote(kid,batch.goal));
      if (order && meetsCommission(kid,order)) notes.push('符合原求购「'+order.title+'」');
      if (target) notes.push((target.pattern?'':traitNames[target.index])+compareWithParents(kid,target));
      if (higher.length) notes.push(higher.join('、') + '高过双亲');
      if (compare && notes.length) info.append(node('p','crystal-observation',notes.join(' · ')));
      const locate = button(inTank(kid) ? '去'+tankName(kid.tank)+'看它' : live(kid) ? '查看静养中的它' : '查看已售档案', e => visitIndividual(kid.id,e.currentTarget));
      locate.dataset.broodLocate=kid.id;
      locate.setAttribute('aria-label',locate.textContent+' · '+label);
      const tools=node('div','crystal-child-tools');
      tools.append(locate);
      if(live(kid))tools.append(broodFavorite(row,kid,label,mark));
      info.append(tools);
      const broods=descendants.get(kid.id);
      if(broods.length){
        const history=node('details','crystal-records');
        history.dataset.lineage=kid.id;
        history.open=expanded.has(kid.id);
        history.append(node('summary','',`它育成的后代 · ${broods.length} 窝`));
        for(const [id,title] of broods)history.append(linkedBrood(title,batch.id,id,kid.id));
        info.append(history);
      }
      const actions=node('details','crystal-child-actions');
      actions.dataset.lineage='actions:'+kid.id; actions.open=expanded.has(actions.dataset.lineage);
      actions.append(node('summary','','选育、相册与参赛'));info.append(actions);
      for(const card of commissions.filter(c=>meetsCommission(kid,c))){
        const link=button('查看求购 · '+card.title,()=>{
          commissionChoice=null;
          commissionSelect.value=card.id; commissionDetails.open=true;
          showPage('market'); deliverySelect.value=kid.id; update();
          (deliverySelect.value?delivery:commissionSelect).focus();
        });
        row.commissionOffers.push({link,id:kid.id,card}); actions.append(link);
      }
      const featured=kid.id===batch.representativeId;
      const feature=button(featured?'本窝相册代表':representative?'换它作代表':'选它入相册',async()=>{
        const hadFocus=document.activeElement===feature;
        await run(async()=>{
          await onAction({type:'featureBrood',batchId:batch.id,id:kid.id});
          rememberComparison(batch.id,kid.id);
        },`已将${label}记入相册。`+(reward?`获得 ${reward} 金币。`:''));
        if(hadFocus && document.activeElement===document.body && !panel.hidden && row.review.open){
          const next=feature.isConnected ? feature : row.review.querySelector(`[data-album-open="${CSS.escape(kid.id)}"]`);
          next?.focus({preventScroll:true});
        }
      });
      feature.dataset.albumChild=kid.id; disable(feature,featured); actions.append(feature);
      if (featured) {
        const albumLink=button('看它的相册页',()=>openAlbumPage(batch.id));
        albumLink.dataset.albumOpen=kid.id;actions.append(albumLink);
      }
      if (canSelectParent(state,kid)) actions.append(button(compare?'用它育下一代 · 选'+directionLabel(viewDirection)+'为目标':'用它育下一代',()=>breedChild(batch,kid)));
      if (canCompete(kid,state.now)) {
        if(!batch.rookieEntry)actions.append(button('选它参加本窝新秀赛',()=>openRookie(batch.id,kid.id)));
        if(familyCards.length)actions.append(button('去和亲虾比同一场',()=>chooseEntrant(kid.id,familyCards.length===1?familyCards[0].value:row.familyCard.value)));
        else if(batch.rookieEntry)actions.append(button('带它去常规赛',()=>chooseEntrant(kid.id)));
      }
    }
    const again = node('div','crystal-repeat');
    const choices=[['沿用这对',true,true],['保留母虾换伴侣',true,false],['保留公虾换伴侣',false,true]];
    for (const [i,parent] of [dam,sire].entries()) {
      if(canUse[i])continue;
      const reason=!live(parent)?'已转让。':parent.tank==='rest'?'正在静养，回缸后可再选。':
        i===0?'正在繁育另一窝，等后代成年后可再选。':'正在配对，配对形成后可再选。';
      body.append(node('p','crystal-muted',sexName(parent.sex)+'「'+nameOf(parent)+'」'+reason));
    }
    if(!canUse.some(Boolean))choices.push([batch.goal || batch.qualityGoal?'沿用目标，重选双亲':'重新挑选双亲',false,false]);
    for (const [label, keepDam, keepSire] of choices) {
      if(keepDam && !canUse[0] || keepSire && !canUse[1])continue;
      const control = button(label, () => continueBrood(batch,keepDam?dam.id:'',keepSire?sire.id:''));
      disable(control,false); again.append(control);
    }
    body.append(again);
  }
  function albumResult(batch,chosen,dam,sire) {
    const target=broodQualityTarget(batch.qualityGoal,dam,sire);
    const result=hit=>hit?'（已达成）':'（未达成）';
    const qualityResult=target && targetText(target)+(target.accepts(chosen)?result(target.matches(chosen)):'（'+(chosen.pattern?'其他纹样':'纹样未记录')+'）');
    return [batch.goal && goalLabel(batch.goal)+result(batch.goal===chosen.colour+':'+chosen.pattern),qualityResult].filter(Boolean).join(' · ');
  }
  function updateAlbum(state) {
    if(panel.hidden || activePage!=='album')return;
    lineJournal.refresh(state);
    photoAlbum.refresh(state.tankPhotos);
    const grown=state.batches.filter(b=>b.status==='complete'), paid=Math.min(albumTerms.paidPages,grown.filter(b=>b.representativeId).length);
    text(albumStatus,`从每窝成年后代里挑一只留作纪念。前 ${albumTerms.paidPages} 窝每窝可领 ${albumTerms.coins} 金币，已领 ${paid}/${albumTerms.paidPages}。`+(grown.length?'':'第一窝成年后就能翻开。'));
    const byId=new Map(state.individuals.map(r=>[r.id,r]));
    const entries=[];
    state.batches.forEach((b,i)=>{
      if (b.status==='complete') entries.push({value:b.id,label:`第 ${i+1} 窝 · ${nameOf(byId.get(b.motherId))} × ${nameOf(byId.get(b.fatherId))} · ${b.representativeId?broodName(byId.get(b.representativeId),b.children.map(k=>byId.get(k.id))):'待选代表'}`});
    });
    options(albumPage,entries.reverse());
    const batch=grown.find(b=>b.id===albumPage.value),chosen=byId.get(batch?.representativeId);
    albumPlate.hidden=visitRepresentative.hidden=saveAlbum.hidden=!chosen;
    watchRepresentative.hidden=!chosen || !inTank(chosen);
    albumRookie.hidden=!chosen || (!batch.rookieEntry && !canCompete(chosen,state.now));
    disable(saveAlbum,!chosen);
    if(chosen){
      portrait(albumImage,chosen,state.now,albumPlaceholder);
      const siblings=batch.children.map(k=>byId.get(k.id)), entry=batch.rookieEntry;
      text(albumName,broodName(chosen,siblings));
      text(albumTraits,[appearance(chosen)||'花色未记录',qualities(chosen),tankName(chosen.tank)].join(' · '));
      albumRace.hidden=!entry;
      if(entry)text(albumRace,(entry.entrantId===chosen.id?'这只虾的成绩':'同窝「'+broodName(byId.get(entry.entrantId),siblings)+'」的成绩')+' · '+rookieMark(entry));
      albumRookie.dataset.entrant=entry?.entrantId ?? chosen.id;
      text(albumRookie,entry?'回看本窝赛绩':'带它去本窝新秀赛');
      const note=albumResult(batch,chosen,byId.get(batch.motherId),byId.get(batch.fatherId));
      showBroodIntent(albumIntent,batch);
      albumGoal.hidden=!note; text(albumGoal,note?'这窝的期待：'+note:'');
      visitRepresentative.dataset.individual=chosen.id;
      text(visitRepresentative,inTank(chosen) ? '去'+tankName(chosen.tank)+'找它' : live(chosen) ? '查看静养中的它' : '查看已售档案');
      watchRepresentative.dataset.individual=chosen.id;
      watchRepresentative.setAttribute('aria-label','静观看'+broodName(chosen,siblings));
    }
    albumPicker.hidden=!grown.length;
    text(openAlbum,batch ? chosen ? '查看同窝对照' : '从这一窝挑代表' : upcomingBatchId ? '查看这窝的进度' : state.starterPending ? '去看第一批虾' : '去挑亲虾');
  }
  function updateMarket(state) {
    if(panel.hidden || activePage!=='market')return;
    returnToPicker.hidden=!shopBrowseOrigin;
    const choices = state.tanks.map(tank => ({value:tank.id, label:tankName(tank.id)})); options(buyTank, choices);
    if (!state.tanks.some(tank=>tank.id===chosenBuyTank)) chosenBuyTank=null;
    buyTank.value=chosenBuyTank || getActiveTank();
    options(saleTank,choices);
    if (sales.open) {
      const eligible=state.individuals.filter(r=>r.tank===saleTank.value && !excludedParents.includes(r.id) && !saleRestriction(state,r));
      const labels=eligible.map(r=>[r.id,`${nameOf(r)} · ${r.id} · ${appearance(r)} · ${qualities(r)}`]);
      const signature=JSON.stringify(labels);
      if (signature!==candidates.dataset.signature) {
        if (reviewingSale || [...chosenSales].some(id=>!eligible.some(r=>r.id===id))) {
          clearSale(); announce('可转让名单有变化，请重新挑选。');
        }
        candidates.dataset.signature=signature;
        candidates.replaceChildren(...labels.map(([id,label])=>{
          const row=node('label'), box=node('input'); box.type='checkbox'; box.value=id;
          box.addEventListener('change',()=>{if(box.checked) chosenSales.add(id); else chosenSales.delete(id); update();});
          row.append(box,node('span','',label)); return row;
        }));
      }
      for(const box of candidates.querySelectorAll('input')) box.checked=chosenSales.has(box.value);
      const selected=labels.filter(([id])=>chosenSales.has(id));
      const total=`${selected.length} 只 · 腾出 ${selected.length} 位 · 共 ${selected.length*TRANSFER_PRICE} 金币`;
      text(saleTotal,reviewingSale ? `${tankName(saleTank.value)}：${selected.map(([,label])=>label).join('；')}。\n${total}。确认后永久离缸，家系与成绩可在已售档案回看。` : eligible.length ? total : '这口缸没有可转让的空闲成虾。');
      candidates.hidden=reviewingSale; disable(saleTank,reviewingSale);
      reviewSale.hidden=reviewingSale; disable(reviewSale,!selected.length);
      backSale.hidden=commitSale.hidden=!reviewingSale;
    }
    const target = state.tanks.find(tank => tank.id === buyTank.value), used = target ? counts(state, target.id) : {animals:0, reserved:0};
    const globalSlots=globalFree(state),localSlots=target ? target.capacity-used.animals-used.reserved : 0;
    text(purchaseSpace,`本缸 ${used.animals} 只活虾，${used.reserved} 位预留，余 ${localSlots} 位。全局 50 位中尚余 ${globalSlots} 位，买入需 1 位。`);
    const mates=state.individuals.filter(r=>r.colour && canSelectParent(state,r));
    options(shopMate,mates.map(r=>({value:r.id,label:[siblingName(r,mates),sexName(r.sex),appearance(r),tankName(r.tank)].join(' · ')})),mates.length?'选择一只，看可能的后代花色':'暂无可试配的成年虾');
    disable(shopMate,!mates.length);
    const mate=mates.find(r=>r.id===shopMate.value);
    mateTraits.hidden=traitField.hidden=!mate;
    if(mate)text(mateTraits,nameOf(mate)+' · '+qualities(mate));
    for (const {product,preview,image,heading,traits,forecast,purchase,visit,draftPair} of shopRows.values()) {
      const receipt=state.purchases.find(r=>r.productId===product.id);
      const resident=receipt && state.individuals.find(r=>r.id===receipt.individualId);
      portrait(image,resident || preview,state.now);
      text(heading,`${resident ? nameOf(resident) : product.name} · ${sexName(product.sex)}`);
      text(traits,(appearance(resident || product) || '花色未记录')+'　'+qualities(resident || product));
      const available=!resident || canSelectParent(state,resident);
      forecast.hidden=!mate;
      draftPair.hidden=!mate || !resident?.colour || !available || mate.sex===product.sex;
      if(mate){
        if(!available)text(forecast,'这只虾目前无法参与选育。');
        else if(mate.sex===product.sex)text(forecast,'同为'+sexName(mate.sex)+'，无法组成一对。');
        else if(resident && !resident.colour)text(forecast,'这只虾的花色未记录，无法预估后代花色。');
        else{
          const candidate=resident || product;
          const pair=mate.sex==='female'?[mate,candidate]:[candidate,mate];
          const outcomes=appearanceOutcomes(...pair);
          const branches=outcomes.map(o=>goalLabel(o.key)+' '+o.probability*100+'%'+(o.key===goal.value?'（选育目标）':''));
          const unavailable=goal.value && !outcomes.some(o=>o.key===goal.value);
          const target=broodQualityTarget(shopTrait.value,...pair);
          let comparison=bandGoalProblem(shopTrait.value,goal.value,...pair);
          if(!comparison && target?.pattern){
            const refs=pair.filter(target.accepts).map(r=>sexName(r.sex)+'覆盖 '+quality(r.P[1])+' 分');
            comparison=refs.join('，')+'。等条带纹后代成年，看看有没有'+targetText(target)+'的。';
          }else if(!comparison && target){
            comparison=traitNames[target.index]+'表现 · 母虾 '+quality(pair[0].P[target.index])+' 分，公虾 '+quality(pair[1].P[target.index])+' 分。成年后，看看有没有一只后代的'+targetText(target)+'。';
          }
          text(forecast,['可能的后代花色 · '+branches.join('、')+(unavailable?'。这对配不出目标花色「'+goalLabel(goal.value)+'」。':''),comparison].filter(Boolean).join('\n'));
        }
      }
      purchase.hidden=!!receipt;
      visit.hidden=!resident;
      if (resident) {
        visit.dataset.individual=resident.id;
        text(visit,inTank(resident) ? '去'+tankName(resident.tank)+'看它' : live(resident) ? '查看静养档案' : '查看已转让档案');
        disable(visit,false);
        disable(purchase,true);
        continue;
      }
      const reason=!target || !isFilled(target.id) ? '请先给目标缸注水' : globalSlots<=0 ? '全局 50 位已用完' : localSlots<=0 ? '目标缸已满（含预留）' : state.cash < product.price ? '余额不足' : '';
      text(purchase,`${reason || '买入到'+tankName(target.id)} · ${product.price} 金币`);
      disable(purchase,!!reason);
    }
    const nextTankId=state.tanks.length===2?'breeding-2':state.tanks.length===3?'breeding-3':null;
    for(const [id,{slot,control,status}] of roomSlots){
      const tank=state.tanks.find(r=>r.id===id), active=tank && getActiveTank()===id;
      slot.classList.toggle('is-empty',!tank);
      slot.classList.toggle('is-next',id===nextTankId);
      control.setAttribute('aria-current',String(!!active));
      control.title=tankPlaces[id];
      disable(control,!tank);
      const occupancy=!tank?(id===nextTankId?'下一个缸位':'预留缸位'):active?'当前所在':isFilled(id)?'点击前往':'前往布置';
      text(status,id==='main'?occupancy:`${tankPlaces[id]} · ${occupancy}`);
    }
    text(expansionText, nextTankId ? `将安放在${tankPlaces[nextTankId]}，增加 10 位。` : '全部 4 口缸已安放，共 50 位。');
    text(expand, nextTankId ? `添置${tankName(nextTankId)} · ${state.cash < 90 ? '还差 '+(90-state.cash) : 90} 金币` : '已达到 50 位');
    disable(expand, !nextTankId || state.cash < 90); disable(buyTank, false);
    const commission = commissions.find(card => card.id === commissionSelect.value);
    if (commission) {
      const receipt = state.commissions?.deliveries.find(item => item.commissionId === commission.id);
      const eligible = state.individuals.filter(record => !saleRestriction(state,record) && meetsCommission(record,commission));
      options(deliverySelect, eligible.map(record => ({value:record.id, label:`${siblingName(record,state.individuals)} · ${tankName(record.tank)} · 覆盖 ${quality(record.P[1])}`})), '明确选择要交付的一只');
      commissionBreeding.hidden=!!receipt;
      for(const branch of commissionBranches)branch.choice.hidden=!commissionAppearance(branch,commission);
      text(commissionHint, `${commission.colour === 'red' ? '红晶' : commission.pattern === 'hinomaru' ? '日之丸纹' : '指定外观'}，覆盖至少 ${commission.minCoverage}。交付总价 ${commission.price} 金币（已包含转让价），每张委托只能完成一次。`);
      text(commissionRecord, receipt ? `已完成：${siblingName(state.individuals.find(record => record.id === receipt.individualId),state.individuals)} · ${receipt.price} 金币` : eligible.length ? `${eligible.length} 只符合条件，你可以决定是否交付。` : '眼下没有可交付的成虾。想自己育一窝，可以在下面挑目标花色。');
      const candidate = !receipt && eligible.find(record => record.id === deliverySelect.value);
      deliveryCard.hidden=!candidate;
      if(candidate && commissionDetails.open){
        portrait(deliveryImage,candidate,state.now);
        text(deliveryName,siblingName(candidate,state.individuals)+' · '+tankName(candidate.tank));
        text(deliveryTraits,appearance(candidate)+' · 覆盖 '+quality(candidate.P[1])+' 分');
      }
      const same=!!candidate && commissionChoice?.commissionId===commission.id && commissionChoice.id===candidate.id;
      if(!same)commissionChoice=null;
      deliveryBox.hidden=!same;
      text(deliveryText, candidate ? `确定把「${siblingName(candidate,state.individuals)}」交付给这张委托吗？${appearance(candidate)} · 覆盖 ${quality(candidate.P[1])}。总共获得 ${commission.price} 金币。这只虾会离缸，档案和后代关系保留。` : '这只虾已不符合交付条件，请重新选择。');
      disable(commissionSelect, false); disable(deliverySelect, !!receipt); disable(delivery, !!receipt || !deliverySelect.value); disable(deliver, !!receipt || !candidate || !same);
    }
  }
  function updateSiblingChoices(state, individual, card, invitation, names,entry,studying,settled) {
    const brood=invitation || (individual?.source==='bred' && state.batches.find(b=>b.status==='complete' && b.children.some(c=>c.id===individual.id)));
    showBroodIntent(entrantIntent,settled?null:brood,'配对时的手记');
    showBroodIntent(resultIntent,settled?brood:null,'配对时的手记');
    revisitBrood.hidden=!brood;
    siblingCompare.hidden=!brood || !(studying || settled);
    disable(revisitBrood,!brood);
    if (!brood) { siblingCompare.open=false; return; }
    revisitBrood.dataset.batch=brood.id;
    text(revisitBrood,rookiePhotoOrigin?'返回同窝近照':'回到同窝手记');
    text(siblingTitle,entry?'回看参赛虾和同窝兄妹':`比较这一窝的 ${brood.children.length} 只虾`);
    if (siblingCompare.hidden || !siblingCompare.open) return;
    const byId=id=>state.individuals.find(r=>r.id===id);
    const kids=brood.children.map(c=>byId(c.id));
    const target=broodQualityTarget(brood.qualityGoal,byId(brood.motherId),byId(brood.fatherId));
    const signature=JSON.stringify([brood.id,brood.goal,brood.qualityGoal,target?.best,entry?.entrantId,card.id,card.seed,card.theme,kids.map(r=>[r.id,names.get(r.id),r.P,r.colour,r.pattern,r.tank,r.soldAt,r.contestDebuts?.[card.id]])]);
    if (siblingTable.dataset.signature===signature) {
      for(const pick of siblingTable.querySelectorAll('[data-candidate]')){
        const pressed=String(pick.dataset.candidate===individual?.id);
        if(pick.getAttribute('aria-pressed')!==pressed)pick.setAttribute('aria-pressed',pressed);
      }
      return;
    }
    siblingTable.dataset.signature=signature;
    const goals=[brood.goal && goalLabel(brood.goal),target && targetText(target)].filter(Boolean);
    const weights=contestWeights(card.theme);
    const mainTrait=weights.indexOf(Math.max(...weights));
    const labels=judgingLabels(card.theme);
    const allowed=kids.filter(kid=>acceptsContestPattern(card,kid));
    const scores=allowed.map(kid=>Number(quality(judgedTrait(kid.P,card.theme,mainTrait))));
    const highest=Math.max(...scores), leaders=scores.filter(score=>score===highest).length;
    const totals=kids.map(kid=>acceptsContestPattern(card,kid)?Number(points(scoreShrimp(kid.P,card.theme))):null);
    const contenders=invitation && !entry ? totals.filter((_,i)=>canCompete(kids[i],state.now)) : [];
    const topTotal=new Set(contenders).size>1 ? Math.max(...contenders) : null;
    const guide=labels[mainTrait]+'占本场总分的 '+(weights[mainTrait]*100)+'%。'+(scores.length>1 && leaders===scores.length?'同组兄妹这项同分，可以再比较另外两项。':'');
    text(siblingGoals,(goals.length?'这窝原本想培育「'+goals.join('，')+'」。':'')+guide);
    siblingTable.replaceChildren();
    const header=siblingTable.createTHead().insertRow();
    for (const label of ['同窝个体',...labels.map((name,i)=>name+' '+weights[i]*100+'%')]) {
      const th=node('th','',label); th.scope='col'; header.append(th);
    }
    const body=siblingTable.createTBody();
    for (const [index,kid] of kids.entries()) {
      const row=body.insertRow(), identity=node('th'); identity.scope='row'; row.append(identity);
      const isSelected=kid.id===individual?.id;
      const pick=button(names.get(kid.id),e=>{
        if(entry)return visitContestant(kid.id,e.currentTarget);
        entrant.value=kid.id; update();
      });
      const image=node('img','crystal-portrait'); image.alt=''; pick.prepend(image);
      if(entry){
        if(kid.id===entry.entrantId)pick.dataset.rookieRepresentative=kid.id;
        pick.setAttribute('aria-label',(inTank(kid)?'在缸中找':'查看档案 · ')+names.get(kid.id));
      }else{
        pick.dataset.candidate=kid.id; pick.setAttribute('aria-pressed',String(isSelected));
        pick.setAttribute('aria-label',`选择${names.get(kid.id)}参赛`);
        disable(pick,!canCompete(kid,state.now) || totals[index]===null);
      }
      const matches=[];
      if (brood.goal) matches.push(kid.colour+':'+kid.pattern===brood.goal?'花色达成':'花色未达');
      if (target) matches.push(target.accepts(kid)?directionLabel(target)+(target.matches(kid)?'达成':'未达'):'白带宽窄 · 其他纹样');
      identity.append(pick,node('small','',appearance(kid)),node('small','',`${tankName(kid.tank)} · ${kid.id}`));
      if(totals[index]===null)identity.append(node('small','','其他纹样 · 本组只评条带纹'));
      else if(entry){
        const label=invitation?'本窝代表':'本届参赛';
        identity.append(node('small','',kid.id===entry.entrantId ? `${label} · 第 ${entry.rank} 名 · ${points(entry.score)} 分` : `本次未参赛 · 估分 ${totals[index]} 分`));
      }
      if(invitation && !entry && kid.tank==='rest' && live(kid)){
        const recall=button('选择回缸去向',e=>visitIndividual(kid.id,e.currentTarget));
        recall.dataset.recallBrood=brood.id;
        recall.setAttribute('aria-label','为「'+names.get(kid.id)+'」选择回缸去向');
        identity.append(recall);
      }
      const result=!invitation && Object.hasOwn(kid.contestDebuts??{},card.id) && contestStanding(card,kid);
      if(result)identity.append(node('small','',`本卡第 ${result.rank} 名 · ${points(result.score)} 分`));
      else if(!entry && totals[index]!==null){
        identity.append(node('small','','本场估分 '+totals[index]+' 分'));
        if(totals[index]===topTotal && canCompete(kid,state.now))identity.append(node('small','','在缸候选最高估分'));
      }
      portrait(image,kid,state.now);
      if(matches.length) identity.append(node('small','',matches.join(' · ')));
      labels.forEach((_,i)=>{
        const cell=row.insertCell(), value=totals[index]===null?'—':quality(judgedTrait(kid.P,card.theme,i));
        cell.append(node(i===mainTrait?'strong':'span','',value));
        if(i===mainTrait && Number(value)===highest && leaders<scores.length)cell.append(node('small','',leaders===1?'同窝最高':'并列最高'));
      });
    }
  }
  function updateEntrantGallery(state,records,names,invitation) {
    entrantGallery.hidden=!records.length;
    entrantField.hidden=records.length<=entrantsPerPage;
    if(!records.length)return;
    text(galleryTitle,invitation?'挑一只代表这一窝':'这次想带哪只虾');
    const pages=Math.ceil(records.length/entrantsPerPage);
    if(gallerySelection!==entrant.value){
      gallerySelection=entrant.value;
      const index=records.findIndex(r=>r.id===gallerySelection);
      if(index>=0)candidatePage=Math.floor(index/entrantsPerPage);
    }
    candidatePage=Math.max(0,Math.min(candidatePage,pages-1));
    candidatePages.hidden=pages===1;
    text(pageCounter,(candidatePage+1)+' / '+pages);
    disable(previousCandidates,candidatePage===0);
    disable(nextCandidates,candidatePage===pages-1);
    const start=candidatePage*entrantsPerPage, visible=records.slice(start,start+entrantsPerPage);
    const signature=JSON.stringify([galleryContest,start,visible.map(r=>[r.id,names.get(r.id),r.sex,r.colour,r.pattern,r.P,r.tank,r.protected,r.observation,r.contestDebuts?.[galleryContest]])]);
    if(entrantGrid.dataset.signature!==signature){
      entrantGrid.dataset.signature=signature;
      const cards=visible.map((r,i)=>{
        const available=canCompete(r,state.now), label=names.get(r.id);
        const pick=button('',e=>{
          if(!available)return visitContestant(r.id,e.currentTarget);
          entrant.value=r.id;announce('');update();
        });
        pick.dataset.contestCandidate=r.id;
        if(available){
          pick.setAttribute('aria-pressed','false');
        }else if(r.tank==='rest'){
          pick.dataset.recallBrood=invitation.id;
        }
        const plate=node('span','crystal-entrant-photo'), image=node('img','crystal-portrait'), imageStatus=node('span','crystal-portrait-status');
        image.alt='';plate.append(image,imageStatus);
        const home=invitation?'同窝第 '+(start+i+1)+' 只':tankName(r.tank);
        const status=r.tank==='rest'?'静养中 · 可接回':!inTank(r)?'查看已售档案':Object.hasOwn(r.contestDebuts??{},galleryContest)?'已有赛绩':'';
        const caption=node('span','crystal-entrant-caption');
        caption.append(node('strong','',invitation ? nameOf(r) : label),node('small','',appearance(r)),node('small','',[home,r.protected?'已收藏':'',status].filter(Boolean).join(' · ')));
        appendObservation(caption,r,'small');pick.append(plate,caption);contestPortrait(image,imageStatus,r,state.now);
        return pick;
      });
      entrantGrid.replaceChildren(...cards);
    }
    for(const pick of entrantGrid.querySelectorAll('[aria-pressed]')){
      const selected=String(pick.dataset.contestCandidate===entrant.value);
      if(pick.getAttribute('aria-pressed')!==selected)pick.setAttribute('aria-pressed',selected);
    }
  }
  function updateContests(state) {
    if(panel.hidden || activePage!=='contest')return;
    const from=familyOrigin?.lineBook;
    const book=from && state.lineBooks?.find(item=>item.founderId===from.founderId);
    backToLine.hidden=!book;
    if(book){text(backToLine,'回《'+book.title+'》手记');disable(backToLine,busy);}
    const invitations=state.batches.flatMap((b,i)=>b.status==='complete'?[{value:'rookie:'+b.id,label:`第 ${i+1} 窝新秀赛 · ${b.rookieEntry?'已参赛':'待报名'}`}]:[]).reverse();
    const next=nextExhibition(state), now=Math.max(state.now,Date.now()), wait=next.opensAt-now;
    const upcoming='exhibition:'+next.round, status=wait>0?' · 未开放':' · 待报名';
    const exhibitions=state.starterPending ? [] : [
      ...[upcoming,upcoming+':'+FINE_BAND].map(id=>({value:id,label:exhibitionClassName(id)+status})),
      ...(state.contests.exhibitions??[]).map(entry=>({value:entry.contestId,label:exhibitionClassName(entry.contestId)+' · 已参赛'})).reverse()
    ];
    options(contestSelect,[...state.contests.cards.map(card => ({value:card.id, label:contestName(card)})),...exhibitions,...invitations]);
    const contest=selectedContest(state), {batch,round,card,entry}=contest;
    const regular=!batch && !round, waiting=round && !entry && wait>0;
    if(rookiePhotoOrigin && rookiePhotoOrigin.photoSpread.batchId!==batch?.id)rookiePhotoOrigin=null;
    exhibition.hidden=state.starterPending || round===next.round;
    text(exhibition,exhibitionName(next.round)+(wait>0?' · '+timeLeft(wait)+'后开放':' · 公开组 / 细白带组'));
    disable(exhibition, false);
    const candidates=batch?batch.children.map(k=>state.individuals.find(r=>r.id===k.id)):state.individuals;
    const eligible=waiting?[]:candidates.filter(r=>entry?r.id===entry.entrantId:canCompete(r,state.now) && acceptsContestPattern(card,r));
    const names=individualNames(state);
    const latest=regular ? state.individuals.reduce((at,r)=>Math.max(at,r.contestDebuts?.[contestSelect.value]??-1),-1) : -1;
    const gameKey=getPairingKey();
    if(galleryContest!==contestSelect.value || galleryGame!==gameKey){
      if(galleryGame!==gameKey || batch || entrant.dataset.receipt==='true')entrant.value='';
      galleryContest=contestSelect.value;galleryGame=gameKey;gallerySelection='';candidatePage=0;
      options(otherEntrant,[],'挑一只来比较');
      comparePrints.hidden=compareCloseup.hidden=visitOther.hidden=swapEntrant.hidden=difference.hidden=true;
      forecast.checked=false;contestCompare.open=false;siblingCompare.open=false;scoreSheet.open=false;
    }
    options(entrant,eligible.map(r=>{
      const judged=regular && hasCardResult(r,card);
      const played=judged && (r.contestDebuts[contestSelect.value]===latest?'最近参赛':'已有成绩');
      return {value:r.id,label:[names.get(r.id),tankName(r.tank),played].filter(Boolean).join(' · ')};
    }),entry?null:waiting?'本届尚未开放':'选择一只成年虾');
    if(entry)entrant.value=entry.entrantId;
    if (!card) { disable(enter, true); return; }
    const weights=contestWeights(card.theme), labels=judgingLabels(card.theme);
    const criteria=weights.map((w,i)=>labels[i]+' '+w*100+'%').join('　');
    const classHint=card.theme===FINE_BAND?'红晶、黑晶的条带纹成虾都可报名。白带越窄，细带这一项得分越高。':'';
    text(contestDescription,[batch?'新秀赛 · '+(card.theme==='colour'?'颜色':'纹样')+'评审':round?contestName(card):'',classHint,criteria,'三位电脑对手'].filter(Boolean).join('　'));
    const individual=state.individuals.find(r=>r.id===entrant.value);
    const record=regular && state.contests.records.bestByContest[card.id];
    const holder=record && state.individuals.find(r=>r.id===record.entrantId);
    const judged=regular && individual && hasCardResult(individual,card);
    const label=names.get(entrant.value);
    const settled=!!(entry || judged);
    entrant.dataset.receipt=String(settled);
    forecastToggle.hidden=!!(waiting || settled) || !eligible.length;
    const studying=!forecastToggle.hidden && forecast.checked;
    updateEntrantGallery(state,entry || waiting ? [] : batch ? candidates : eligible,names,batch);
    const isAlternative=r=>r.id!==individual.id && !!contestComparisonRole(r,state,contest);
    contestCompare.hidden=!individual || !!entry || !!waiting || !candidates.some(isAlternative);
    if(contestCompare.hidden){contestCompare.open=false;otherEntrant.value='';}
    if(!contestCompare.hidden && contestCompare.open){
      const alternatives=candidates.filter(isAlternative);
      const main=weights.indexOf(Math.max(...weights));
      options(otherEntrant,alternatives.map(r=>({value:r.id,label:[names.get(r.id),contestKinship(r,individual),tankName(r.tank),
        hasCardResult(r,card) && '已有本卡成绩',studying?labels[main]+' '+quality(judgedTrait(r.P,card.theme,main)):appearance(r)].filter(Boolean).join(' · ')})),'挑一只来比较');
      const other=alternatives.find(r=>r.id===otherEntrant.value);
      comparePrints.hidden=compareCloseup.hidden=visitOther.hidden=!other;
      swapEntrant.hidden=!other || contestComparisonRole(other,state,contest)!=='candidate';
      difference.hidden=!other || !studying;
      if(other){
        const otherName=names.get(other.id);
        for(const [index,record] of [individual,other].entries()){
          const view=candidateViews[index];
          view.figure.dataset.individual=record.id;
          text(view.name,names.get(record.id));
          const role=hasCardResult(record,card)?'已有本卡成绩':index?'备选':'当前候选';
          text(view.place,[role,index===1 && contestKinship(record,individual),tankName(record.tank),appearance(record)].filter(Boolean).join(' · '));
          showObservation(view.look,record);
          contestPortrait(view.image,view.status,record,state.now);
        }
        if(studying){
          const total=points(scoreShrimp(individual.P,card.theme)), otherTotal=points(scoreShrimp(other.P,card.theme));
          const mark=hasCardResult(other,card)?contestStanding(card,other):null;
          const pairScores=mark
            ? `${label} · 赛前估分 ${total} 分 / ${otherName} · 已记录 ${points(mark.score)} 分，第 ${mark.rank} 名`
            : `按本场估分 · ${label} ${total} 分 / ${otherName} ${otherTotal} 分`;
          text(difference,pairScores+`\n「${otherName}」和「${label}」比：${compareContestTraits(other,individual,card.theme)}。`);
        }
        text(visitOther,inTank(other)?`去${tankName(other.tank)}看${otherName}`:`查看「${otherName}」的${live(other)?'静养':'已售'}档案`);
        text(swapEntrant,`改选「${otherName}」`);
      }
    }
    const familyNote=regular && individual ? familyContestNote(card,individual,state.individuals) : '';
    text(contestFamily,familyNote); contestFamily.hidden=!familyNote || !(studying || settled);
    updateSiblingChoices(state,individual,card,batch,names,entry,studying,settled);
    entrantCard.hidden=!individual || !studying;
    if(individual && !entrantCard.hidden) {
      contestPortrait(entrantImage,entrantStatus,individual,state.now);
      showObservation(entrantNote,individual);
      const estimate='\n本场估分 '+points(scoreShrimp(individual.P,card.theme))+' 分';
      const comparison=holder && holder.id!==individual.id && !judged
        ? `\n和本卡最佳「${names.get(holder.id)}」比，${compareContestTraits(individual,holder,card.theme)}。` : '';
      const judgedQualities=labels.map((name,i)=>name+' '+quality(judgedTrait(individual.P,card.theme,i))).join('　');
      text(entrantSummary,`${label} · ${appearance(individual)}\n${judgedQualities}${estimate}${comparison}`);
    }
    if(entry && individual)showContestResult(card,contestSelect.value,individual,entry,label);
    else if(judged) {
      const reopening=contestResult.hidden || contestResult.dataset.entrant!==entrant.value || contestResult.dataset.card!==card.id;
      showContestResult(card,card.id,individual,contestStanding(card,individual),label);
      if(reopening)text(resultBest,'这只虾在本卡的成绩已记入档案。');
    }else contestResult.hidden=true;
    const entries=updateLineup(card,individual,label,state.now);
    updateScoreSheet(card,individual,label,entries);
    npcList.hidden=!studying;
    visitEntrant.hidden=!individual;
    if(individual)text(visitEntrant,inTank(individual)?`去${tankName(individual.tank)}看${label}`:'查看它的虾册档案');
    resultBrood.hidden=contestResult.hidden || siblingCompare.hidden;
    if(!resultBrood.hidden)text(resultBrood,entry?'回看它和同窝兄妹':'比较同窝兄妹的本场成绩');
    breedEntrant.hidden=contestResult.hidden || !individual || !canSelectParent(state,individual);
    adoptJudgeGoal.hidden=breedEntrant.hidden || !adoptJudgeGoal.dataset.goal;
    if(studying)text(npcList,card.npcs.map((npc,index)=>`电脑对手 ${index+1} · ${points(scoreShrimp(npc.P,card.theme))} 分`).join('　'));
    best.hidden=!!entry;
    visitBest.hidden=true;
    if(batch){
      const invitation=eligible.length?'这份邀请可以留到下次。每窝只有一个名额，选好后再报名。':candidates.some(r=>r.tank==='rest')?'这窝还有静养中的虾。接回任意一只，就能代表本窝报名。':'这窝的后代已经全部转让，本窝无人可以报名。';
      text(best,entry?`${label} · ${RATINGS[entry.rating]} · 第 ${entry.rank} 名 · ${points(entry.score)} 分`:invitation);
      text(rewardHint,'每窝成年后会收到一份邀请。新秀赛留存成绩，不发金币。');
    }else if(round){
      text(best,waiting?'约 '+timeLeft(wait)+'后开放。':eligible.length?'本届已开放，邀请会等你报名。':card.theme===FINE_BAND?'缸里还没有可参赛的成年条带虾。也可以报名同届公开组。':'有成年水晶虾入缸后就能报名。');
      text(rewardHint,entry?'下一届的邀请会等你报名。':'本届公开组和细白带组共用一个名额。任选一组，带一只虾参赛。');
    }else{
      text(best,record?`本卡最佳 · ${names.get(record.entrantId)}\n${points(record.score)} 分 · ${RATINGS[record.rating]} · 第 ${record.rank} 名`:'这张赛卡还没有你的成绩。');
      if(record && !settled && !studying)best.hidden=true;
      if(holder && holder.id!==individual?.id && (settled || studying)){
        visitBest.hidden=false; visitBest.dataset.individual=holder.id;
        text(visitBest,inTank(holder)?`去${tankName(holder.tank)}看纪录保持者${names.get(holder.id)}`:`查看纪录保持者${names.get(holder.id)}的档案`);
      }
      const reward=state.contests.records.rewardedThemes.includes(card.theme)?'本主题首次奖励已领过。再参赛不会重复获得金币。':'本主题第一次参赛可获得 10 金币。';
      text(rewardHint,reward+(invitations.length?'':' 第一窝自育虾成年后会收到新秀赛邀请。'));
    }
    let confirmation=batch?'选一只代表本窝参赛':round?'选一只参加本届':'选这只参赛';
    if(individual){
      confirmation=`确认由「${label}」${batch?'代表本窝参赛':'参赛'}`;
    }
    text(enter,confirmation); enter.hidden=!!(entry||judged||waiting);
    disable(contestSelect, false); disable(entrant, !!entry||!!waiting); disable(enter, !entrant.value||enter.hidden);
  }
  function update() {
    if (disposed) return;
    const state = getState(); intro.hidden = !!state; game.hidden = !state; panel.setAttribute('aria-busy', String(busy));
    siblingView.update(state);
    if(tankPair || !panel.hidden || !state)broodWatch.close();
    else broodWatch.update(state,getSelected(),busy);
    if(!state || !panel.hidden || tankPair || (!broodWatch.root.hidden && photoAlbum.reference.hasAttribute('data-searching')))photoAlbum.clearReference();
    document.body.classList.toggle('crystal-mode', !!state); hud.hidden = activity.hidden = !state;
    shortcuts.forEach(control => { control.hidden = !state; control.disabled = busy; });
    if (!state) { inspect.hidden = true; closeTankEditor(); tankGrowth.open=false; updateTankPick(null,null); }
    if (state) {
      starter.hidden = !state.starterPending;
      const main = state.tanks.find(t => t.id === 'main'), mainUsed = counts(state, 'main');
      const mainReady=isFilled('main'), mainFree=main.capacity-mainUsed.animals-mainUsed.reserved, allFree=globalFree(state);
      const starterFull = Math.min(mainFree,allFree)<7;
      arrivalField.hidden=!mainReady || starterFull;
      const welcoming=activePage==='roster' && !starter.hidden && !arrivalField.hidden && arrivalField.open;
      panel.toggleAttribute('data-arrivals',welcoming);
      tabs.hidden=welcoming;
      seeResidents.hidden=!welcoming;
      pages.roster.hidden=activePage!=='roster' || welcoming;
      if(welcoming){text(title,'迎接第一批水晶虾');showArrivalPortraits();}
      text(starterHint, !mainReady ? '先铺底床、种下水草，再给主缸注水。木石可以按喜好添加。' : starterFull ? ['第一批有 7 只。',mainFree<7 && `主缸还缺 ${7-mainFree} 个空位。`,allFree<7 && `全缸合计还缺 ${7-allFree} 个空位。`].filter(Boolean).join('') : welcoming ? '这 7 只会一起入住你的主缸。想先看看谁，可以点它的照片。' : '主缸已注水，可以领养第一批水晶虾了。');
      const arrival=founders[Number(arrivalInputs.find(input=>input.checked).value)];
      const stockHere=getActiveTank()==='main'?'领养 7 只':'回主缸领养 7 只';
      text(start,!mainReady?'继续布置主缸':stockHere+(arrival?'，去看「'+nameOf(arrival)+'」':'，回缸看看'));
      disable(start, mainReady && starterFull);
      text(funds, `${state.cash} 金币`);
      const occupied = state.tanks.map(tank => counts(state, tank.id)), living = occupied.reduce((sum, count) => sum + count.animals, 0), reserved = occupied.reduce((sum, count) => sum + count.reserved, 0);
      const resting=state.individuals.filter(r=>r.tank==='rest').length;
      text(total, `${living} 只 · 预留 ${reserved} 位 · 容量 ${Math.min(50, state.tanks.reduce((sum, tank) => sum + tank.capacity, 0))} / 50`+(resting?` · 静养 ${resting}/${REST_LIMIT}`:''));
      text(currentRoom, [tankName(getActiveTank()),tankPlaces[getActiveTank()]].filter(Boolean).join(' · '));
      tankMapLink.disabled=busy;
      const favorites = state.individuals.filter(r=>r.protected && inTank(r)).length;
      text(care, (document.getElementById('care-chip')?.textContent || '查看虾群状态') + (favorites ? ' · 收藏 ' + favorites : ''));
      const inspected = inspectedInTank(state);
      updateTankPick(state,inspected);
      inspect.hidden = !inspected || !panel.hidden || tankPair?.id===inspected.id || !broodWatch.allowInspection(inspected.id);
      const shutterRow=broodWatch.searching ? subjectRow : tankActions;
      if(shutter.parentElement!==shutterRow)shutterRow.insertBefore(shutter,broodWatch.searching ? null : tankPhotos);
      const oldPhoto=photoAlbum.referenceFor(inspect.hidden || tankPair ? null : inspected.id);
      if(inspect.hidden) { tankGrowth.open=false; tankGrowth.hidden=true; tankGrowth.dataset.owner=''; }
      if(tankWriter){
        if(inspect.hidden || !matchesTankWriter(inspected))closeTankEditor();
        else { syncIdentityFields(inspected); switchTankInput.disabled=busy; closeTankInput.disabled=busy; }
      }
      if (!inspect.hidden) {
        const identity=tankIdentity(state,inspected);
        tankPhoto.setAttribute('aria-label','细看'+identity+'的近照'); tankPhoto.disabled=busy;
        shutter.dataset.individual=inspected.id;
        shutter.disabled=busy;
        text(shutter,oldPhoto?'拍一张对照':'拍照');
        shutter.setAttribute('aria-label',oldPhoto?'拍下'+identity+'和旧照对照':'给'+identity+'拍照');
        updatePhotoLink(tankPhotos,inspected,state);
        tankQuiet.dataset.individual=inspected.id;
        tankQuiet.disabled=busy;
        tankQuiet.setAttribute('aria-label','静观看'+identity);
        tankFavorite.dataset.individual=inspected.id;
        tankNameButton.dataset.individual=inspected.id;
        tankNameButton.disabled=busy;
        tankNameButton.setAttribute('aria-label','给'+identity+'起名字或记观察');
        tankFavorite.setAttribute('aria-pressed',String(inspected.protected));
        tankFavorite.title=inspected.protected?'解除收藏保护':'收藏并保护，防止误售';
        text(tankFavorite,inspected.protected?'★ 已收藏':'☆ 收藏');
        tankFavorite.disabled=busy;
        const meal=getMeal?.(inspected.id);
        mealHistory.hidden=!meal?.pastVisitor;
        mealHistory.disabled=busy;
        feedNearby.dataset.id=inspected.id;
        feedNearby.dataset.action=meal?.active?'review':'feed';
        text(feedNearby,meal?.active?'查看这次加餐':'在它附近加餐');
        feedNearby.disabled=busy;
        feedNearby.setAttribute('aria-label',meal?.active?'查看'+identity+'的进食情况':'在'+identity+'附近加餐');
        feedAgain.dataset.id=inspected.id;
        feedAgain.hidden=!meal?.active || meal.recent;
        feedAgain.disabled=busy;
        const back = tankReturn?.id===inspected.id;
        const visit=back ? tankReturn : null;
        const picking=viewingParentCandidate(visit);
        const freeChoice=canChooseFromObservation(visit) && !picking;
        photoReturn.hidden = !(back && (visit.photoSpread || visit.returnToPhotos) && !tankPair);
        text(photoReturn,visit?.returnToPhotos?'返回这两只的近照':'返回同窝近照');
        const returnLabel = tankReturn?.batchId ? '返回这窝手记' : picking ? '继续挑'+sexName(filter.value) : '返回'+tabButtons[activePage].textContent;
        const action = tankPair || !photoReturn.hidden ? '' : back ? returnLabel : '打开个体档案';
        const activity=getActivity(inspected.id);
        const birthIndex=inspected.source==='bred' ? state.batches.findIndex(b=>(b.status==='hatched'||b.status==='complete') && b.children.some(k=>k.id===inspected.id)) : -1;
        const birth=state.batches[birthIndex];
        const visitRookie=isBroodVisit(tankReturn,birth,inspected.id);
        tankRace.hidden=true;
        if(visit?.contestChoice && canSwapViewedEntrant(state,inspected.id,visit)){
          tankRace.dataset.individual=inspected.id;
          tankRace.dataset.card=visit.contestChoice.card;
          text(tankRace,'改选它参加这场');
          tankRace.setAttribute('aria-label',tankRace.textContent+'：'+identity);
          tankRace.hidden=false;tankRace.disabled=busy;
        }else if((freeChoice || visitRookie) && canCompete(inspected,state.now)){
          const rookie=birth?.rookieEntry;
          const represented=rookie?.entrantId===inspected.id;
          let latest=represented ? rookie.enteredAt : -1;
          let card=null, latestExhibition=null;
          if(!visitRookie){
            for(const race of state.contests.cards){
              const at=inspected.contestDebuts?.[race.id];
              if(at>latest){latest=at;card=race;}
            }
            const exhibition=state.contests.exhibitions?.findLast(result=>result.entrantId===inspected.id);
            if(exhibition?.enteredAt>latest)latestExhibition=exhibition;
          }
          const invited=birth?.status==='complete' && !rookie;
          tankRace.dataset.individual=inspected.id;
          tankRace.dataset.card=latestExhibition?.contestId || (card ? card.id : represented || invited ? 'rookie:'+birth.id : '');
          if(latestExhibition){
            text(tankRace,`看赛绩 · ${exhibitionClassName(latestExhibition.contestId)} · 第 ${latestExhibition.rank} 名`);
          }else if(card || represented){
            const rank=card ? contestStanding(card,inspected).rank : rookie.rank;
            text(tankRace,'看赛绩 · '+(card?contestName(card):'本窝新秀赛')+'第 '+rank+' 名');
          }else text(tankRace,invited?'带它去本窝新秀赛':'带它去常规赛');
          tankRace.setAttribute('aria-label',tankRace.textContent+'：'+identity);
          tankRace.hidden=false;tankRace.disabled=busy;
        }
        const brood=(!back || tankReturn.batchId) && birth;
        const fromBrood=brood && back && tankReturn.batchId===brood.id;
        tankBrood.hidden=!birth || !!fromBrood;
        const sortTrait=fromBrood && brood.status==='complete' ? batchRows.get(brood.id)?.reviewMode?.value : '';
        const sortDirection=breedingDirection(sortTrait);
        const pickForDraft=picking && canUseViewedParent(state,inspected);
        tankBreed.hidden=!(canSelectParent(state,inspected) && (freeChoice || pickForDraft || fromBrood && brood.status==='complete'));
        if(!tankBreed.hidden){
          tankBreed.dataset.individual=inspected.id;
          tankBreed.disabled=busy;
          let label='为它挑搭档';
          if(pickForDraft){
            const partnerName=familyIndex(state).names.get(parentBrowseOrigin.partnerId);
            label=partnerName?'选它作「'+partnerName+'」的搭档':'选它作这窝的'+sexName(inspected.sex);
          }else if(fromBrood)label=sortDirection?'育下一代 · 看'+directionLabel(sortDirection):'用它育下一代';
          text(tankBreed,label);
          tankBreed.setAttribute('aria-label',tankBreed.textContent+'：'+identity);
        }
        const birthOrder=birth && birth.children.map(k=>state.individuals.find(r=>r.id===k.id));
        const eligible=brood && birthOrder.filter(r=>r && inTank(r) && (fromBrood || r.tank===inspected.tank));
        if(!tankBrood.hidden){
          const away=!back && eligible?.length===1 && birthOrder.find(r=>r && inTank(r) && r.tank!==inspected.tank);
          tankBrood.dataset.individual=inspected.id;
          tankBrood.dataset.child=away ? away.id : inspected.id;
          text(tankBrood,`看第 ${birthIndex+1} 窝手记`+(away ? ` · 找${tankName(away.tank)}的「${broodName(away,birthOrder)}」` : ''));
        }
        const visitOrder=eligible && siblingVisitOrder(brood,inspected.id,eligible,sortDirection);
        const siblings=visitOrder?.members;
        nextSibling.hidden=!siblings || siblings.length<2 || (back && tankReturn.batchId!==brood.id);
        prevSibling.hidden=nextSibling.hidden || siblings.length<3;
        let position='';
        if(!nextSibling.hidden){
          const index=siblings.findIndex(r=>r.id===inspected.id);
          for(const [control,step,label] of [[prevSibling,-1,'上一只'],[nextSibling,1,'下一只']]){
            if(control.hidden)continue;
            const kid=siblings[(index+step+siblings.length)%siblings.length];
            control.dataset.individual=kid.id; control.disabled=busy;
            const actionLabel=visitOrder.fromPhotos ? '看另一只' : label;
            text(control,actionLabel+' · '+broodName(kid,birthOrder)+(kid.tank===inspected.tank?'':'（'+tankName(kid.tank)+'）'));
          }
          if (!visitOrder.fromPhotos) position=(sortDirection?'按'+orderLabel(sortDirection):fromBrood?'同窝在缸':'同缸同窝')+` ${index+1}/${siblings.length}`;
        }
        const broods=state.batches.filter(batch=>isRecordedParent(batch,inspected.id));
        const clutch=inspected.sex==='female' && broods.find(b=>b.status==='formed' || b.status==='hatched');
        const target=clutch || broods.findLast(hasHatched) || (broods.length===1 && broods[0]);
        tankClutch.hidden=!broods.length || !!(target && !hasHatched(target) && back && tankReturn.batchId===target.id);
        if(!tankClutch.hidden){
          tankClutch.dataset.individual=inspected.id;
          tankClutch.dataset.batch=target ? target.id : '';
          tankClutch.disabled=busy;
          if(hasHatched(target)){
            tankClutch.setAttribute('aria-controls',broodWatch.root.id);
            tankClutch.setAttribute('aria-expanded',String(!broodWatch.root.hidden));
          }else{
            tankClutch.removeAttribute('aria-controls');
            tankClutch.removeAttribute('aria-expanded');
          }
          text(tankClutch,clutch ? (clutch.status==='hatched'?'看它的 '+clutch.size+' 只幼虾':'看这窝的孵化进度')
            : hasHatched(target) ? (broods.length>1?'看最近一窝的孩子':'在缸里看它的孩子') : target ? '看它的繁育手记' : '查看它的 '+broods.length+' 窝繁育记录');
        }
        const now=Math.max(Date.now(),state.now);
        let stage=clutch ? maternalStage(clutch,now) : inspected.legacyHatchAt!=null?'抱卵中':
          inspected.adultAt>state.now?maturityHint(inspected.adultAt,now):birth?.status==='complete'?`第 ${birthIndex+1} 窝 · 已成年`:'';
        const look=appearance(inspected);
        let comparison='';
        if(birth?.status==='hatched')stage=`第 ${birthIndex+1} 窝 · ${stage}`;
        if(sortDirection && birth){
          const parent=id=>state.individuals.find(r=>r.id===id);
          const target=broodQualityTarget(sortTrait,parent(birth.motherId),parent(birth.fatherId));
          if(target && birth.status==='hatched')comparison='成年目标是'+targetText(target);
          else if(target && birth.status==='complete')comparison=(target.accepts(inspected)?traitNames[target.index]+' '+quality(inspected.P[target.index])+' 分，':'')+compareWithParents(inspected,target);
        }
        text(inspectName,birthOrder ? broodName(inspected,birthOrder,identity) : identity); text(inspectHint,[back && tankReturn.contestMark,position,stage,look,comparison,meal?.status || (activity && '正在'+activity),action].filter(Boolean).join(' · '));
        tankFavorite.setAttribute('aria-label','收藏保护：'+inspectName.textContent);
        showObservation(tankObservation,inspected);
        const current=portraits?.currentFrame(inspected,state.now) ?? crystalPortraitFrame(inspected,state.now,state);
        const crop=individualPhotoCrop(inspected,true);
        if(tankPhoto.dataset.crop!==crop)tankPhoto.dataset.crop=crop;
        portrait(inspectImage,inspected,state.now,null,current,false,crop);
        updateTankGrowth(inspected,birth,state,current);
      }
      const tankIds = new Set(state.tanks.map(tank => tank.id)); for (const [id, control] of tankButtons) if (!tankIds.has(id)) { control.remove(); tankButtons.delete(id); }
      for (const tank of state.tanks) {
        let control = tankButtons.get(tank.id);
        if (!control) {
          control = button('', () => run(() => onSwitch(tank.id,{keepSelectedParent:true}), `正在观察${tankName(tank.id)}。`,`正在切换到「${tankName(tank.id)}」…`));
          control.dataset.tankId = tank.id; tankButtons.set(tank.id, control); tanks.append(control);
        }
        const count = counts(state, tank.id), label = tankName(tank.id);
        control.hidden = !!tankPair && !isFilled(tank.id);
        text(control, tankPair ? label : `${label} ${count.animals}+${count.reserved}/${tank.capacity}`);
        control.title = `${tankPlaces[tank.id]} · ${count.animals}只活体，${count.reserved}位为未出生后代预留`;
        control.setAttribute('aria-pressed', String(getActiveTank() === tank.id)); disable(control, false);
      }
      const growing = state.batches.filter(batch => ['planned', 'formed', 'hatched'].includes(batch.status));
      const next = growing.map(batch => ({batch, at:batch.status === 'planned' ? batch.formedAt : batch.status === 'formed' ? batch.hatchAt : batch.adultAt})).sort((a, b) => a.at - b.at)[0];
      upcomingBatchId = next?.batch.id;
      const canReview=!next && !state.starterPending && isFilled(getActiveTank());
      const bookmarked=canReview && state.batches.find(matchesComparison);
      const recent=bookmarked || canReview && state.batches.reduce((last,b)=>b.status==='complete' && (!last || b.adultAt>=last.adultAt) ? b : last,null);
      recentBroodId=recent?.id;
      updateBreeding(state);
      growthInbox.hidden = !growthLinks.size;
      text(growthInbox, '成长消息 · ' + growthLinks.size + ' 条未读');
      const draftHint=!growthLinks.size && !next && !state.starterPending && isFilled(getActiveTank()) && pendingPairHint(state);
      activity.dataset.action=draftHint?'resume-pair':'';
      if (growthLinks.size) {
        const latest = growthList.firstElementChild.firstElementChild.dataset;
        const destination=latest.growthKind==='batch' ? latest.action : latest.place+' · '+latest.action;
        text(nextStep, growthLinks.size === 1 ? latest.brief + '\n' + destination : growthLinks.size + ' 条成长消息\n最新：' + latest.brief + ' · ' + latest.place);
      }
      else if(draftHint)text(nextStep,draftHint);
      else if(bookmarked){
        const subject=comparisonSubject(bookmarked,id=>state.individuals.find(r=>r.id===id));
        text(nextStep,`继续上次对照 · 第 ${state.batches.indexOf(bookmarked)+1} 窝\n${subject || '回看这一窝与双亲'}`);
      }
      else if (recent) text(nextStep,`第 ${state.batches.indexOf(recent)+1} 窝已成年 · ${recent.size} 只后代\n回看这一窝与双亲`);
      else if(state.starterPending)text(nextStep,!mainReady?'主缸还在造景\n继续铺底床、种水草和注水':'第一批水晶虾 · 7 只\n'+(starterFull?'查看主缸领养所需的空位':'看看将入住主缸的虾'));
      else if(next?.batch.status==='hatched')text(nextStep,`${broodLocation(next.batch)} · ${STAGES.hatched}\n成年还有 ${timeLeft(next.at - Math.max(Date.now(),state.now))} · 去缸里找小虾`);
      else text(nextStep, !isFilled(getActiveTank()) ? '把这缸布置成你喜欢的样子\n造景完成后注水，再让虾入住' : next ? `${broodLocation(next.batch)} · ${STAGES[next.batch.status]}\n${next.batch.status === 'formed' ? '孵化' : '抱卵'}还有 ${timeLeft(next.at - Math.max(Date.now(), state.now))} · 查看这一窝` : '下一窝，会像谁？\n挑一对亲虾，开始新的期待');
      updateRoster(state); updateMarket(state); updateContests(state); updateAlbum(state);
    }
    for (const control of panel.querySelectorAll('button,input,select')) {
      const disabled=busy || control.dataset.unavailable==='true';
      if(!control.dataset.keepEnabled && control.disabled!==disabled)control.disabled=disabled;
    }
    for (const control of hud.querySelectorAll('button')) control.disabled = busy;
    if(growthDialog.open)for(const control of growthList.querySelectorAll('button'))control.disabled=busy;
    activity.disabled = busy; inspect.disabled = busy || !!tankPair;
    pairPhotoView.sync();
  }
  const keydown = event => {
    if(event.isComposing || event.keyCode===229){event.stopPropagation();return;}
    if(event.key==='Escape' && mateComparison.cancel()){event.preventDefault();event.stopPropagation();return;}
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
    if (event.detail == null) { update(); return; }
    // Watching a relative in the tank should not replace the parent's selected row or search in the album.
    if(broodWatch.observed(event.detail)){
      const origin=broodWatch.origin;
      tankReturn=origin?.id===event.detail?origin:null;
      update();
      return;
    }
    if(broodWatch.wholeBrood)broodWatch.close();
    if (tankReturn && tankReturn.id===event.detail) return;
    tankReturn=null;
    const record = getState()?.individuals.find(r => r.id === event.detail && live(r));
    if (!record) { update(); return; }
    parentBrowseOrigin=null;
    selectedId = record.id; sellId = null; filter.value = 'live'; search.value = ''; update();
  }
  document.addEventListener('aquarium:shrimp-selected', selectedInTank);
  function escapeTankPick(event){
    if(tankPair && event.key==='Escape' && !event.isComposing){
      event.preventDefault();event.stopPropagation();cancelTankPick();
    }
  }
  document.addEventListener('keydown',escapeTankPick);
  const dockInteraction = event => {
    if((tankPair || broodWatch.searching || photoAlbum.reference.hasAttribute('data-searching')) && event.target.closest('#reset')){update();return;}
    if(event.target.closest('[data-dock],#feed,#quiet-watch,#reset,#wallpaper-framing-open')){
      broodWatch.close();
      if(tankPair){tankPair=null;update();}
      setOpen(false);
    }
  };
  dock.addEventListener('click', dockInteraction);
  showPage('roster');
  const framing=document.getElementById('wallpaper-framing');
  const refreshVisible=()=>{if(!framing.open && !document.body.classList.contains('quiet'))update();};
  let timer=document.hidden ? null : setInterval(refreshVisible,1000);
  function visibilityChanged(){
    clearInterval(timer);
    if(!document.hidden){refreshVisible();timer=setInterval(refreshVisible,1000);}
  }
  document.addEventListener('visibilitychange',visibilityChanged);
  return {update, enteredBroodRoom:broodWatch.enteredRoom, showGrowth, showBrood, quietBrood, focusSibling, beginMateRoomVisit, openIndividual(id) { setOpen(true); return visitIndividual(id); }, dispose() { disposed = true; clearInterval(timer); pairPhotoView.dispose(); siblingView.dispose(); photoAlbum.dispose(); spacePicker.dispose(); restExchange.dispose(); document.removeEventListener('visibilitychange',visibilityChanged); portraits?.dispose(); document.removeEventListener('keydown',escapeTankPick); document.removeEventListener('aquarium:shrimp-selected', selectedInTank); dock.removeEventListener('click', dockInteraction); [growthDialog, panel, dockButton, hud, activity, inspectCard, ...shortcuts].forEach(element => element.remove()); document.body.classList.remove('crystal-panel-open', 'crystal-mode'); }};
}
