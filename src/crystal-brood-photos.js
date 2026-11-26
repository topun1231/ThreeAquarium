import {inTank} from './crystal-breeding.js';
import {hasSiblingPhoto} from './crystal-sibling-view.js';

// A reading session belongs to the opener. Only a trip to the tank needs to keep it alive.
export function openBroodPhotos({source, firstId, photos, getState, getGameKey, indexOf, portrait, tankName, sexName, pairDraftFor, visit, isBusy}) {
  const game = getGameKey();
  const picker = document.createElement('section');
  picker.className = 'crystal-brood-photo-picker';
  picker.innerHTML = '<label>右边从哪一窝挑<select></select></label>'+
    '<div class="sibling-choices" role="group" aria-label="挑右边的虾"></div>'+
    '<button type="button" data-continue hidden>留下右边这只，接着比</button><p role="status" hidden></p>';
  const select = picker.querySelector('select'), cards = picker.querySelector('.sibling-choices');
  const next = picker.querySelector('[data-continue]'), notice = picker.querySelector('[role="status"]');
  let leftId = firstId, rightId = null, group = '', crop = 'whole';
  let indexed = null, indexedLeft = null, groups, origins;

  function updateGroups(state, index) {
    if (indexed === state && indexedLeft === leftId) return;
    indexed = state; indexedLeft = leftId;
    groups = new Map(); origins = new Map();
    const options = [];
    function add(key, label, records) {
      const others = records.filter(r => hasSiblingPhoto(r) && r.id !== leftId);
      if (!others.length) return;
      groups.set(key,others); options.push([key,label]);
    }
    state.batches.forEach((batch, i) => {
      if (batch.status !== 'hatched' && batch.status !== 'complete') return;
      const brood = '第 '+(i+1)+' 窝';
      batch.children.forEach((kid, j) => origins.set(kid.id,brood+'第 '+(j+1)+' 只'));
      const parents = [batch.motherId,batch.fatherId].map(id => index.names.get(id)).join(' × ');
      add(batch.id,brood+' · '+parents,batch.children.map(kid => index.byId.get(kid.id)));
    });
    add('stock','初代与引进的虾',state.individuals.filter(r => !index.births.has(r.id)));
    if (!groups.has(group)) group = '';
    const signature = JSON.stringify(options);
    if (select.dataset.options !== signature) {
      const prompt = options.length ? '选一窝看近照' : '还没有另一只可对照的虾';
      select.replaceChildren(new Option(prompt,''), ...options.map(([id,label]) => new Option(label,id)));
      select.dataset.options = signature;
    }
    select.disabled = !options.length;
    select.value = group;
  }

  function identity(record, index) {
    const origin = origins.get(record.id);
    return origin ? (record.name?.trim() || index.names.get(record.id))+' · '+origin : index.names.get(record.id);
  }
  function updateCards(state, index) {
    const records = groups.get(group) || [];
    const signature = JSON.stringify(records.map(r => r.id));
    if (cards.dataset.members !== signature) {
      cards.dataset.members = signature;
      cards.replaceChildren(...records.map(record => {
        const card = document.createElement('button');
        card.type = 'button'; card.dataset.broodPhoto = record.id;
        card.innerHTML = '<img alt="" hidden><span></span>';
        card.onclick = () => { rightId = record.id; photos.sync(); };
        return card;
      }));
    }
    records.forEach((record, i) => {
      const card = cards.children[i], label = card.lastElementChild;
      const name = index.names.get(record.id);
      if (label.textContent !== name) label.textContent = name;
      const pressed = String(record.id === rightId);
      if (card.getAttribute('aria-pressed') !== pressed) card.setAttribute('aria-pressed',pressed);
      if (picker.isConnected) portrait(card.firstElementChild,record,state.now);
    });
  }
  function read(state) {
    if (!state || game !== getGameKey()) return null;
    const index = indexOf(state), left = index.byId.get(leftId), right = index.byId.get(rightId);
    if (!hasSiblingPhoto(left) || (rightId !== null && !hasSiblingPhoto(right))) return null;
    updateGroups(state,index); updateCards(state,index);
    next.hidden = !right;
    const side = record => ({
      record, at:state.now, selectable:inTank(record),
      label:[identity(record,index), record.adultAt > state.now ? '幼虾' : '成年'+sexName(record.sex), tankName(record.tank)].join(' · ')
    });
    return {
      owner:picker, picker, initialFocus:right || select.disabled ? null : select, initialCrop:crop, rememberCrop:value => { crop=value; },
      photos:[side(left),right ? side(right) : null], draftPair:pairDraftFor(state,left,right), busy:isBusy(),
      choiceLabel:'去缸里看它', choose:async id => {
        notice.hidden=true;
        const error = await visit(id,source,crop,reopen);
        if (error) { notice.textContent=error; notice.hidden=false; reopen(); }
      }
    };
  }
  function reopen() {
    if (game !== getGameKey()) return false;
    delete cards.dataset.members;
    const opened = photos.open(source,'我挑的两只虾',read);
    if (opened && group) photos.sync();
    return opened;
  }
  select.onchange = () => { group=select.value; notice.hidden=true; photos.sync(); };
  next.onclick = () => {
    if (!rightId) return;
    leftId=rightId; rightId=null; group='';
    photos.sync(); select.focus({preventScroll:true});
  };
  return reopen();
}
