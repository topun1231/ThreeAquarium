import {inTank} from './crystal-breeding.js';
import {installPhotoCrops} from './crystal-pair-photos.js';

export function hasHatched(batch) {
  return batch?.status === 'hatched' || batch?.status === 'complete';
}

export function liveBroodTanks(batch, byId) {
  const rooms = new Set();
  for (const child of batch.children) {
    const resident = byId.get(child.id);
    if (resident && inTank(resident)) rooms.add(resident.tank);
  }
  return [...rooms];
}

// This is a temporary view of actual residents. Looking at a shrimp never edits the brood.
export function createBroodWatch({getState, getSelected, getActiveTank, familyIndex, tankName, broodName, portrait, updateBroodShelf, refresh, visit, visitRoom, survey, readBrood, readHistory, leave}) {
  const root = document.createElement('section');
  root.id = 'crystal-brood-watch';
  root.hidden = true;
  root.setAttribute('aria-labelledby', 'crystal-brood-watch-title');
  root.innerHTML = `<header><strong id="crystal-brood-watch-title" tabindex="-1"></strong>
      <div class="crystal-watch-crops" role="group" aria-label="整窝照片的取景"></div><button type="button" data-close>收起</button></header>
    <div data-search hidden><p role="status"></p><div data-rooms role="group" aria-label="去孩子现在住的缸" hidden></div></div>
    <div id="crystal-watch-kids" class="crystal-watch-kids" role="group" aria-label="这一窝的孩子"></div>
    <footer><button type="button" data-photos aria-controls="crystal-watch-kids" hidden></button><button type="button" data-parent></button><button type="button" data-read>翻这窝手记</button><button type="button" data-history hidden>其他窝的记录</button></footer>`;
  const heading = root.querySelector('strong'), gallery = root.querySelector('.crystal-watch-kids');
  const footer = root.querySelector('footer');
  const search = root.querySelector('[data-search]'), searchNote = search.querySelector('p'), roomLinks = search.querySelector('[data-rooms]');
  const photos = root.querySelector('[data-photos]');
  const cropControls = root.querySelector('.crystal-watch-crops');
  const setCrop = installPhotoCrops(root, cropControls, refresh);
  const parentButton = root.querySelector('[data-parent]'), history = root.querySelector('[data-history]');
  const rows = new Map();
  let view = null, visiting = false;

  function close(restoreFocus = false) {
    if (!view) return;
    const parentId = view.parentId;
    view = null;
    root.hidden = true;
    rows.clear();
    gallery.replaceChildren();
    updateBroodShelf(footer,null);
    if (restoreFocus) leave(parentId);
  }
  function currentBatch() {
    const batch = view && getState()?.batches.find(b => b.id === view.batchId);
    return hasHatched(batch) && (!view.parentId || batch.motherId === view.parentId || batch.fatherId === view.parentId) ? batch : null;
  }
  function includes(id, batch = currentBatch()) {
    return !!batch && !!id && (id === view.parentId || batch.children.some(k => k.id === id));
  }
  function markVisited() {
    const acknowledge = view?.onVisited;
    if (acknowledge) { view.onVisited=null; acknowledge(); }
  }
  function enteredRoom() {
    if (!view?.searching || !view.onVisited) return;
    const batch = currentBatch();
    if (batch && liveBroodTanks(batch, familyIndex(getState()).byId).includes(getActiveTank())) markVisited();
  }
  function observed(id) {
    if (!view?.searching) return includes(id);
    view.lookedAt=id;
    if (includes(id)) markVisited();
    return true;
  }
  async function watch(id, control) {
    if (visiting || !includes(id)) return;
    const record = familyIndex(getState()).byId.get(id);
    if (!record || !inTank(record) || id === getSelected()) return;
    const source = view;
    visiting = true;
    try {
      await visit(record, id === view.parentId ? view.origin : null);
    } finally {
      visiting = false;
      if (view === source) {
        update(getState(), getSelected());
        if (!root.hidden && !control.disabled) control.focus({preventScroll:true});
      }
    }
  }
  function childRow(id) {
    const control = document.createElement('button');
    control.type = 'button';
    control.dataset.watchChild = id;
    control.innerHTML = '<span class="sibling-print crystal-watch-photo"><img class="crystal-portrait crystal-size-photo" alt="" hidden><span data-photo-status></span></span>' +
      '<span class="crystal-watch-caption"><b data-name></b><small data-place></small></span>';
    control.addEventListener('click', () => watch(id, control));
    gallery.append(control);
    const row = {control, image:control.querySelector('img'), fallback:control.querySelector('[data-photo-status]'),
      name:control.querySelector('[data-name]'), place:control.querySelector('[data-place]')};
    rows.set(id, row);
    return row;
  }
  function write(node, value) { if (node.textContent !== value) node.textContent = value; }
  function updateSearch(batch, byId, selected, busy) {
    const room=getActiveTank(), homes=liveBroodTanks(batch,byId);
    const here=batch.children.filter(k=>{
      const resident=byId.get(k.id);
      return resident && inTank(resident) && resident.tank===room;
    });
    const ordinal=selected && selected===view.lookedAt && here.some(k=>k.id===selected) ? batch.children.findIndex(k=>k.id===selected)+1 : 0;
    let note='这窝的孩子已经离缸，可以翻手记看看。';
    if (ordinal) note='眼前这只在这一窝里排行第 '+ordinal+'。';
    else if (here.length) note=tankName(room)+'里有这窝的 '+here.length+' 只'+(batch.status==='hatched'?'幼虾':'孩子')+'。';
    else if (homes.length) note='选一口缸，去找这窝的孩子。';
    write(searchNote,note);
    roomLinks.hidden=!homes.length || homes.length===1 && homes[0]===room;
    if (roomLinks.hidden) return;
    const key=homes.join(' ');
    if (roomLinks.dataset.rooms!==key) {
      roomLinks.dataset.rooms=key;
      roomLinks.replaceChildren(...homes.map(id=>{
        const button=document.createElement('button');
        button.type='button'; button.dataset.room=id; button.textContent=tankName(id);
        return button;
      }));
    }
    for (const button of roomLinks.children) {
      button.setAttribute('aria-pressed',String(button.dataset.room===room));
      button.disabled=busy || visiting;
    }
  }
  function update(state, selected, busy = false) {
    if (!view) return;
    const batch = currentBatch();
    if (!batch || (view.parentId && !visiting && !includes(selected, batch))) {
      close();
      return;
    }
    const {byId, names} = familyIndex(state);
    cropControls.inert = busy;
    const parent = byId.get(view.parentId);
    const number = state.batches.indexOf(batch) + 1;
    const family = parent ? names.get(parent.id) + '的孩子' : names.get(batch.motherId) + ' × ' + names.get(batch.fatherId);
    write(heading, family + ' · 第 ' + number + ' 窝');
    root.toggleAttribute('data-searching',view.searching);
    photos.hidden=!view.canSearch; photos.disabled=busy || visiting;
    photos.setAttribute('aria-expanded',String(!view.searching));
    write(photos,view.searching?'看同窝照片':'收起照片，回缸里找');
    search.hidden=!view.searching;
    cropControls.hidden=gallery.hidden=view.searching;
    updateBroodShelf(footer,view.searching ? null : batch);
    parentButton.hidden = !parent;
    if (parent) {
      const lookingAtParent = selected === parent.id;
      write(parentButton, (lookingAtParent ? '正在看' : '回看') + (parent.sex === 'female' ? '母虾' : '公虾') + ' · ' + names.get(parent.id));
      parentButton.setAttribute('aria-pressed', String(lookingAtParent));
      parentButton.disabled = busy || !inTank(parent);
    }
    history.hidden = !parent || !state.batches.some(b => b.id !== batch.id && b.status !== 'cancelled' && (b.motherId === parent.id || b.fatherId === parent.id));
    if (view.searching) { updateSearch(batch,byId,selected,busy); return; }
    const siblings = batch.children.map(child => byId.get(child.id) ?? child);
    for (const child of siblings) {
      const record = byId.get(child.id), row = rows.get(child.id) || childRow(child.id);
      const present = !!record && inTank(record);
      write(row.name, broodName(child, siblings));
      write(row.place, present ? tankName(record.tank) : !record ? '仅有出生记录' : record.soldAt !== null ? '已转让' : '静养中');
      row.control.setAttribute('aria-pressed', String(selected === child.id));
      row.control.disabled = busy || !present;
      portrait(row.image, record, state.now, row.fallback, root.dataset.crop);
    }
  }
  photos.addEventListener('click',()=>{
    if(!view?.canSearch || photos.disabled)return;
    view.searching=!view.searching;
    view.familyStudy.reference=null;
    if(view.searching){
      view.lookedAt=null;
      if(getSelected())survey();
    } else markVisited();
    refresh();photos.focus({preventScroll:true});
  });
  roomLinks.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-room]'), room=button?.dataset.room;
    if(!view?.searching || !button || button.disabled || visiting)return;
    const batch=currentBatch(), source=view;
    if(!batch || !liveBroodTanks(batch,familyIndex(getState()).byId).includes(room))return;
    if(room===getActiveTank()){markVisited();return;}
    visiting=true;
    try {
      if(await visitRoom(room) && source===view && getActiveTank()===room)markVisited();
    } finally {
      visiting=false;
      if(source===view){refresh();(button.isConnected && !roomLinks.hidden ? button : heading).focus({preventScroll:true});}
    }
  });
  root.querySelector('[data-close]').addEventListener('click', () => close(true));
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(true);
    }
  });
  parentButton.addEventListener('click', () => { if (view) watch(view.parentId, parentButton); });
  root.querySelector('[data-read]').addEventListener('click', () => {
    const batch = currentBatch();
    if (batch && !visiting) {
      const acknowledge=view.onVisited;
      readBrood(batch, includes(getSelected(), batch) ? getSelected() : null);
      acknowledge?.();
    }
  });
  history.addEventListener('click', () => { if (view && !visiting) readHistory(view.parentId, view.batchId); });
  return {root, close, update, observed, enteredRoom,
    allowInspection(id) {return !view || view.parentId!==null || (view.searching ? view.lookedAt===id : includes(id));},
    get searching() {return view?.searching===true;},
    get familyStudy() {return view?.searching ? view.familyStudy : null;},
    get origin() { return view?.origin; }, get wholeBrood() { return view?.parentId === null; }, open(parentId, batchId, origin, {findFirst=false,onVisited=null}={}) {
    close();
    view = {parentId, batchId, origin, canSearch:findFirst, searching:findFirst, lookedAt:null, onVisited,
      familyStudy:findFirst ? {batchId,reference:null} : null};
    setCrop('whole');
    root.hidden = false;
    update(getState(), getSelected());
    if (!root.hidden) heading.focus({preventScroll:true});
  }};
}
