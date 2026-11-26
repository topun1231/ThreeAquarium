import {canRest} from './crystal-breeding.js';
import {createResidentGallery} from './crystal-resident-gallery.js';

export function createRestExchange({getGameKey, tankName, namesFor, portrait, onAction, onDone, announce}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'crystal-rest-exchange';
  dialog.className = 'crystal-space-dialog';
  dialog.setAttribute('aria-labelledby', 'crystal-exchange-title');
  dialog.innerHTML = '<header><h2 id="crystal-exchange-title">换位接回</h2><button type="button" data-close>取消</button></header>'+
    '<p data-hint></p><div class="crystal-space-cards" role="radiogroup" aria-label="选择换位的虾"></div>'+
    '<footer><div data-summary><p data-picked aria-live="polite"></p><p data-status role="status"></p></div>'+
    '<button type="button" id="crystal-confirm-exchange" disabled>确认换位</button></footer>';
  document.body.append(dialog);
  const get = selector => dialog.querySelector(selector);
  const closeButton = get('[data-close]'), confirm = get('#crystal-confirm-exchange');
  const hint = get('[data-hint]'), preview = get('[data-picked]'), status = get('[data-status]');
  const gallery = get('.crystal-space-cards');
  const cards = createResidentGallery(gallery, {namesFor, tankName, portrait, radioGroup:'crystal-rest-partner'});
  let offer, binding, trigger, paintedState, pickedId, working = false;

  function dismiss(refocus = false) {
    if (!dialog.open) return;
    dialog.close();
    cards.clear();
    binding = paintedState = pickedId = null;
    if (refocus && trigger?.isConnected && !trigger.disabled) trigger.focus({preventScroll:true});
    trigger = null;
  }
  function sync() {
    if (!dialog.open || working) return;
    if (!offer || offer.key !== binding) {
      dismiss(true);
      announce('缸位或个体已有变化，请重新选择。');
      return;
    }
    const {state, anchor, tankId, recalling, candidates} = offer;
    const names = namesFor(state), tank = tankName(tankId);
    if (paintedState !== state) {
      cards.render(candidates, state);
      paintedState = state;
      if (pickedId && !cards.rows.has(pickedId)) {
        pickedId = null;
        status.textContent = '刚选的虾已换了位置或在参与繁育，请重新点一只。';
      }
      hint.textContent = recalling ? '接「'+names.get(anchor.id)+'」回'+tank+'。点选一只愿意送去静养的成虾。'
        : '把「'+names.get(anchor.id)+'」送去静养。点选想接回'+tank+'的那只虾。';
    }
    const partner = cards.rows.get(pickedId);
    for (const row of cards.rows.values()) row.box.checked = row === partner;
    const summary = partner ? '「'+names.get(recalling ? anchor.id : pickedId)+'」回'+tank+'，「'+
      names.get(recalling ? pickedId : anchor.id)+'」去静养。' : '';
    if (preview.textContent !== summary) preview.textContent = summary;
    confirm.disabled = !partner;
  }
  function update(state, anchor, tankId) {
    const recalling = anchor?.tank === 'rest';
    const key = anchor && JSON.stringify([getGameKey(), anchor.id, anchor.adultAt, tankId, recalling]);
    if (!key) offer = null;
    else if (offer?.key !== key || offer.state !== state) {
      const candidates = state.individuals.filter(record => recalling
        ? record.tank === tankId && canRest(state, record)
        : record.tank === 'rest' && record.soldAt === null);
      offer = candidates.length ? {state, anchor, tankId, recalling, key, candidates} : null;
    }
    sync();
    return !!offer;
  }
  gallery.onchange = event => {
    const row = cards.rows.get(event.target.value);
    if (working || row?.box !== event.target) return;
    pickedId = row.record.id;
    status.textContent = '';
    sync();
  };
  closeButton.onclick = () => { if (!working) dismiss(true); };
  dialog.oncancel = event => { event.preventDefault(); if (!working) dismiss(true); };
  dialog.onkeydown = event => event.stopPropagation();
  confirm.onclick = async () => {
    sync();
    if (working || !dialog.open || confirm.disabled) return;
    const {anchor, tankId, recalling, key} = offer;
    const notice = preview.textContent;
    const incomingId = recalling ? anchor.id : pickedId, restId = recalling ? pickedId : anchor.id;
    working = confirm.disabled = closeButton.disabled = true;
    for (const row of cards.rows.values()) row.box.disabled = true;
    status.textContent = '正在保存换位…';
    let saved = false;
    try {
      await onAction({type:'recall', id:incomingId, tankId, restId});
      saved = true;
    } catch (error) {
      status.textContent = error.message || '换位未保存，请重试。';
    } finally {
      working = closeButton.disabled = false;
      for (const row of cards.rows.values()) row.box.disabled = false;
    }
    if (!saved) { sync(); if (dialog.open && !confirm.disabled) confirm.focus(); return; }
    // Publishing the new state also refreshes the roster. Finish at the shrimp that opened the picker.
    if (binding === key && dialog.isConnected) {
      dismiss();
      onDone(anchor.id, recalling, notice);
    }
  };
  return {
    update,
    open(id, recalling, source) {
      if (!offer || offer.anchor.id !== id || offer.recalling !== recalling) return false;
      if (!dialog.open) {
        binding = offer.key;
        trigger = source;
        status.textContent = '';
        gallery.scrollTop = 0;
        dialog.showModal();
        sync();
        closeButton.focus();
      }
      return true;
    },
    reset() { offer = null; dismiss(); },
    dispose() { dismiss(); dialog.remove(); }
  };
}
