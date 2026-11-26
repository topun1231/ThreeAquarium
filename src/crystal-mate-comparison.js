import {canSelectParent} from './crystal-breeding.js';
import {hasSiblingPhoto} from './crystal-sibling-view.js';

// The left candidate belongs to this visit to a parent picker. Opening a photo never fills a draft slot.
export function createMateComparison({photos, getState, getPicker, familyIndex, tankName, choose, refresh}) {
  const root = document.createElement('div');
  root.className = 'crystal-mate-comparison';
  root.hidden = true;
  root.innerHTML = '<span role="status" hidden></span><button type="button" id="crystal-compare-candidate"></button>';
  const hint = root.querySelector('span'), pin = root.querySelector('button');
  let held = null;

  function reset() {
    if (!held && root.hidden) return;
    held = null;
    root.hidden = true;
    hint.hidden = true;
    pin.setAttribute('aria-pressed','false');
    open.hidden = true;
  }
  function eligible(record, state, sex) {
    return record?.sex === sex && canSelectParent(state,record);
  }
  function heldRecord(state, picker) {
    if (!held || !picker || held.sex !== picker.sex || held.partner !== picker.partner || held.game !== picker.game) return null;
    const record = familyIndex(state).byId.get(held.id);
    return eligible(record,state,picker.sex) ? record : null;
  }
  function read(state) {
    const picker = getPicker();
    const left = state && heldRecord(state,picker);
    if (!left || !picker.row) return null;
    const {byId,names} = familyIndex(state);
    const right = byId.get(picker.row.dataset.individualId);
    if (!eligible(right,state,picker.sex) || right.id === left.id) return null;
    const sides = [left,right].map(record => ({
      record, at:state.now, label:names.get(record.id)+' · '+tankName(record.tank), missingPhoto:!hasSiblingPhoto(record)
    }));
    return {
      owner:JSON.stringify([left.id,right.id,picker.partner,...sides.map(s=>s.missingPhoto)]),
      photos:sides, choiceLabel:'选它做'+picker.role, busy:picker.busy, choose,
      onUnavailable:() => {
        const current = getPicker();
        if (current?.sex === picker.sex && current.partner === picker.partner && current.game === picker.game) {
          (current.row || current.search).focus({preventScroll:true});
        }
      }
    };
  }
  const open = photos.trigger('crystal-candidate-closeup','再看这两只','比较两只备选亲虾',read);
  root.append(open);

  function update(state, hasAlternative) {
    const picker = getPicker();
    if (!picker) { reset(); return; }
    const left = heldRecord(state,picker);
    if (held && !left) reset();
    const id = picker.row?.dataset.individualId;
    root.hidden = !left && (!id || !hasAlternative);
    if (root.hidden) return;
    pin.disabled = picker.busy;
    pin.setAttribute('aria-pressed',String(!!left));
    const label = left ? '结束对照' : '和另一只对照';
    if (pin.textContent !== label) pin.textContent = label;
    hint.hidden = !left;
    if (left) {
      const message = '左边留着「'+familyIndex(state).names.get(left.id)+'」，点另一只'+picker.role+'对照。';
      if (hint.textContent !== message) hint.textContent = message;
    }
    open.hidden = !left || !id || left.id === id;
    open.disabled = picker.busy;
  }
  function cancel() {
    if (!held) return false;
    const picker = getPicker();
    reset(); refresh();
    (picker?.row || picker?.search)?.focus({preventScroll:true});
    return true;
  }
  pin.onclick = () => {
    const picker = getPicker(), state = getState();
    if (!picker || picker.busy || root.hidden) return;
    if (cancel()) return;
    const id = picker.row?.dataset.individualId;
    if (!eligible(familyIndex(state).byId.get(id),state,picker.sex)) return;
    held = {id,sex:picker.sex,partner:picker.partner,game:picker.game};
    refresh();
    picker.row?.focus({preventScroll:true});
  };
  return {root, reset, cancel, update, afterPick(row) {
    if (held && !open.hidden && !root.hidden) photos.openFrom(open,row);
  }};
}
