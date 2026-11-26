import {crystalPortraitFrame} from './crystal-portraits.js';
import {installPhotoCrops} from './crystal-pair-photos.js';

export function hasSiblingPhoto(record) {
  return !!(record?.colour && record.pattern && !record.legacy);
}

// Both photos share a pose and scale, including after a visit to the tank.
export function createSiblingView({getState, getGameKey, nameInBrood, portrait, tankOf, visitInTank, keepStudy}) {
  const viewer = document.createElement('dialog');
  viewer.id = 'crystal-sibling-view';
  viewer.className = 'crystal-photo-comparison';
  viewer.setAttribute('aria-labelledby', 'crystal-sibling-title');
  viewer.innerHTML = `<header><h2 id="crystal-sibling-title"></h2><button type="button" data-close>回到这窝</button></header>
    <div class="sibling-spread"></div>
    <div class="sibling-crops" role="group" aria-label="两只一起看"></div>
    <div class="sibling-study" hidden>
      <button type="button" data-study-keep>记下这两只</button>
      <span data-study-label></span>
      <span data-study-times role="group" aria-label="对照成长前后" hidden><button type="button" data-study-time="kept">记下时</button><button type="button" data-study-time="now">现在</button></span>
      <span data-study-replace hidden><button type="button" data-confirm>确认替换</button><button type="button" data-cancel>保留原记录</button></span>
    </div>
    <p class="sibling-prompt" aria-live="polite"></p><div class="sibling-choices" role="group" aria-label="按出生顺序挑选"></div>`;
  document.body.append(viewer);
  const spread = viewer.querySelector('.sibling-spread'), choices = viewer.querySelector('.sibling-choices');
  const heading = viewer.querySelector('h2'), prompt = viewer.querySelector('.sibling-prompt');
  const cropControls = viewer.querySelector('.sibling-crops');
  const studyBar = viewer.querySelector('.sibling-study'), keep = studyBar.querySelector('[data-study-keep]');
  const studyLabel = studyBar.querySelector('[data-study-label]'), times = studyBar.querySelector('[data-study-times]');
  const replacement = studyBar.querySelector('[data-study-replace]');
  const sides = ['左边', '右边'];
  const cards = new Map(), slots = [];
  let session = null;

  const crop = installPhotoCrops(viewer, cropControls, () => {
    session.notice = ''; session.replacing = null; update(getState());
  });

  const back = viewer.querySelector('[data-close]');
  function setPending(value) {
    viewer.setAttribute('aria-busy', String(value));
    for (const group of [spread, choices, cropControls, studyBar]) group.inert = value;
    back.disabled = value;
  }

  function close(restoreFocus = true) {
    if (!session) return;
    const {source, fallback} = session;
    session = null;
    viewer.close();
    setPending(false);
    spread.replaceChildren(); choices.replaceChildren(); slots.length = 0; cards.clear();
    if (restoreFocus) {
      const target = source?.getClientRects().length ? source : fallback;
      if (target?.getClientRects().length) target.focus({preventScroll:true});
    }
  }
  back.onclick = () => close();
  viewer.addEventListener('cancel', event => { event.preventDefault(); if (!back.disabled) close(); });
  for (const type of ['keydown', 'keyup']) viewer.addEventListener(type, event => event.stopPropagation());

  function pick(id) {
    if (!session) return;
    session.notice = '';
    const side = session.side;
    if (session.ids[side] === id) return;
    if (session.ids[1 - side] === id) {
      if (!session.ids[side]) return;
      session.ids[1 - side] = session.ids[side];
    }
    session.ids[side] = id;
    session.pastAt = null; session.replacing = null;
    if (!session.ids[1 - side]) session.side = 1 - side;
    update(getState());
  }
  async function visit(side) {
    const current = session, id = current?.ids[side];
    if (!id || back.disabled) return;
    const record = getState()?.individuals.find(r => r.id === id);
    const home = record && tankOf(record);
    if (!home) { update(getState()); return; }
    const saved = {batchId:current.batchId, key:current.key, ids:[...current.ids], side:current.side, crop:viewer.dataset.crop, visited:side, pastAt:current.pastAt};
    setPending(true);
    current.notice = '正在前往' + home + '…';
    prompt.textContent = current.notice;
    try {
      current.notice = await visitInTank(id, current.source, saved);
    } catch (error) {
      current.notice = error?.message || '暂时无法定位这只虾，可以再试一次。';
    } finally {
      // Successful navigation closes the spread. On failure the same two photos are still here.
      if (session === current) {
        setPending(false); update(getState());
        if (session === current) (slots[side].visit.hidden ? slots[side].control : slots[side].visit).focus({preventScroll:true});
      }
    }
  }
  function currentBatch() { return getState()?.batches.find(b => b.id === session?.batchId); }
  for (const control of times.querySelectorAll('button')) control.onclick = () => {
    session.pastAt = control.dataset.studyTime === 'kept' ? currentBatch()?.siblingStudy?.at : null;
    session.notice = ''; update(getState());
  };
  keep.onclick = () => {
    const previous = currentBatch()?.siblingStudy;
    if (!previous) { saveStudy(null); return; }
    session.replacing = previous; session.notice = ''; update(getState());
    replacement.querySelector('[data-cancel]').focus({preventScroll:true});
  };
  replacement.querySelector('[data-cancel]').onclick = () => {
    session.replacing = null; update(getState()); keep.focus({preventScroll:true});
  };
  replacement.querySelector('[data-confirm]').onclick = () => saveStudy(session.replacing);
  async function saveStudy(previous) {
    const current = session;
    if (!current || back.disabled || current.shownAt == null) return;
    const action = {batchId:current.batchId, ids:[...current.ids], crop:viewer.dataset.crop, at:current.shownAt, previous};
    current.notice = '正在记入这窝的手记…'; current.replacing = null; setPending(true); update(getState());
    try {
      await keepStudy(action);
      current.notice = '这两只已记入同窝手记。';
    } catch (error) { current.notice = error?.message || '这次没有保存成功，可以再试一次。'; }
    finally {
      if (session === current) {
        setPending(false); update(getState());
        (keep.hidden ? back : keep).focus({preventScroll:true});
      }
    }
  }
  function makeSlot(side) {
    const figure = document.createElement('figure');
    figure.innerHTML = '<div class="sibling-print"><img hidden alt=""><span></span><small hidden></small><button type="button" class="sibling-visit" hidden><b></b></button></div><figcaption><button type="button"></button></figcaption>';
    const jump = figure.querySelector('.sibling-visit'), control = figure.querySelector('figcaption button');
    const image = figure.querySelector('img');
    image.classList.add('crystal-size-photo');
    image.addEventListener('load', () => { if (session && image.isConnected) update(getState()); });
    jump.onclick = () => visit(side);
    control.onclick = () => {
      session.notice = '';
      session.side = side;
      update(getState());
      choices.querySelector('button:not([aria-disabled="true"])')?.focus({preventScroll:true});
    };
    spread.append(figure);
    return {control, visit:jump, image, status:figure.querySelector('span'), location:figure.querySelector('small')};
  }
  function makeChoice(id) {
    const control = document.createElement('button');
    control.type = 'button';
    control.dataset.siblingId = id;
    control.innerHTML = '<img hidden alt=""><span></span>';
    control.onclick = () => { if (control.getAttribute('aria-disabled') !== 'true') pick(id); };
    choices.append(control);
    return {control, image:control.firstElementChild, label:control.lastElementChild};
  }
  function batchKey(batch) {
    return JSON.stringify([getGameKey(), batch.id, batch.plannedAt, batch.motherId, batch.fatherId, batch.children.map(kid => kid.id)]);
  }
  function update(state) {
    if (!session) return;
    const batch = state?.batches.find(item => item.id === session.batchId);
    if (!batch || !['hatched', 'complete'].includes(batch.status) || batchKey(batch) !== session.key) { close(); return; }
    const family = new Map(state.individuals.map(r => [r.id, r]));
    const kids = batch.children.map(child => family.get(child.id));
    const known = kids.filter(hasSiblingPhoto);
    if (known.length < 2 || session.ids.some(id => id && !known.some(r => r.id === id))) { close(); return; }
    const empty = !session.ids.some(Boolean);
    const study = batch.siblingStudy, both = session.ids.every(Boolean);
    const samePair = both && study?.ids.every(id => session.ids.includes(id));
    // Leave adulthood to the durable stage transition, even if the wall clock is already past it.
    const wall = Math.max(state.now, Date.now());
    const now = batch.status === 'hatched' ? Math.min(batch.adultAt - 1, wall) : wall;
    if (!samePair || session.pastAt !== study.at) session.pastAt = null;
    const viewedAt = session.pastAt ?? now;
    let ready = both;
    viewer.classList.toggle('picking-first', empty);
    spread.hidden = empty;
    cropControls.hidden = empty;
    for (const r of kids) {
      if (!r) continue;
      if (!cards.has(r.id)) cards.set(r.id, makeChoice(r.id));
      const {control, image, label} = cards.get(r.id);
      const side = session.ids.indexOf(r.id), look = hasSiblingPhoto(r), name = nameInBrood(r, kids);
      const caption = side >= 0 ? sides[side] + ' · ' + name : name + (look ? '' : ' · 花色未记录');
      if (label.textContent !== caption) label.textContent = caption;
      control.setAttribute('aria-disabled', String(!look || side === session.side || side >= 0 && !session.ids[session.side]));
      control.setAttribute('aria-pressed', String(side >= 0));
      if (look) portrait(image, r, now);
    }
    for (const [side, slot] of slots.entries()) {
      const r = family.get(session.ids[side]);
      const label = sides[side] + ' · ' + (r ? nameInBrood(r, kids) : '待选');
      if (slot.control.textContent !== label) slot.control.textContent = label;
      slot.control.setAttribute('aria-label', '为' + sides[side] + '挑虾，' + (r ? nameInBrood(r, kids) : '尚未选择'));
      slot.control.setAttribute('aria-pressed', String(side === session.side));
      const location = r?.soldAt != null ? '已转让' : r?.tank === 'rest' ? '静养中' : '';
      slot.location.hidden = !location;
      if (slot.location.textContent !== location) slot.location.textContent = location;
      const home = r && tankOf(r);
      slot.visit.hidden = !home;
      if (home) {
        const action = '去' + home + '看它';
        if (slot.visit.firstElementChild.textContent !== action) slot.visit.firstElementChild.textContent = action;
        slot.visit.setAttribute('aria-label', '去' + home + '看' + nameInBrood(r, kids));
        slot.visit.dataset.siblingVisit = r.id;
      } else {
        delete slot.visit.dataset.siblingVisit;
      }
      if (r) {
        slot.image.alt = nameInBrood(r, kids) + '的近照';
        const painted = portrait(slot.image, r, viewedAt, slot.status, undefined, true, viewer.dataset.crop);
        if (!painted) ready = false;
      } else {
        slot.status.textContent = '等你挑一只';
      }
    }
    session.shownAt = ready && session.pastAt == null ? now : null;
    spread.setAttribute('aria-busy', String(both && !ready && !slots.some(slot => slot.image.dataset.portraitFailed)));
    studyBar.hidden = !both;
    keep.hidden = !!samePair || !!session.replacing;
    keep.disabled = !ready;
    keep.textContent = study ? '改记这两只' : '记下这两只';
    replacement.hidden = !session.replacing;
    const note = session.replacing ? '要替换这窝原先记下的两只吗？' : samePair ? (study.at < batch.adultAt ? '幼虾时记下' : '成年后记下') : '';
    if (studyLabel.textContent !== note) studyLabel.textContent = note;
    studyLabel.hidden = !note;
    const chosen = family.get(session.ids[0]);
    times.hidden = !samePair || crystalPortraitFrame(chosen,study.at,state).growth === crystalPortraitFrame(chosen,now,state).growth;
    viewer.classList.toggle('comparing-growth', !times.hidden);
    for (const control of times.children) control.setAttribute('aria-pressed', String(control.dataset.studyTime === (session.pastAt == null ? 'now' : 'kept')));
    const target = sides[session.side];
    const next = empty ? '先点一只想细看的虾' : session.ids.every(Boolean) ?
      '点下方的虾可更换' + target + '，也可以点上方名字切换左右。' : '点下方的虾，放在' + target;
    const message = session.notice || next;
    if (prompt.textContent !== message) prompt.textContent = message;
  }
  function open(batchId, firstId, source, fallback, saved) {
    const state = getState(), batch = state?.batches.find(item => item.id === batchId);
    if (session || !batch || !['hatched', 'complete'].includes(batch.status)) return false;
    const key = batchKey(batch);
    if (saved && saved.key !== key) return false;
    session = {batchId, key, source, fallback, ids:saved ? [...saved.ids] : [firstId || null, null], side:saved?.side ?? (firstId ? 1 : 0), pastAt:saved?.pastAt ?? null};
    heading.textContent = '第 ' + (state.batches.indexOf(batch) + 1) + ' 窝 · 同窝细看';
    slots.push(makeSlot(0), makeSlot(1));
    crop(saved?.crop || 'whole'); viewer.showModal(); update(state);
    if (!session) return false;
    const slot = saved && slots[saved.visited];
    const target = slot ? (slot.visit.hidden ? slot.control : slot.visit) : saved ? back : choices.querySelector('button:not([aria-disabled="true"])');
    target?.focus({preventScroll:true});
    return true;
  }
  function openRemembered(batchId, source, fallback) {
    const batch = getState()?.batches.find(b => b.id === batchId);
    if (!batch?.siblingStudy) return false;
    return open(batchId,null,source,fallback,{...batch.siblingStudy,key:batchKey(batch),side:1});
  }
  return {open, openRemembered, close, update, dispose() { close(false); viewer.remove(); }};
}
