// Both sides use the same pose and crop. Growth comparisons show relative body length in the whole-body view.
export function installPhotoCrops(dialog, controls, onPick) {
  const buttons = new Map();
  function set(mode) {
    dialog.dataset.crop = mode;
    for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === mode));
  }
  for (const [key, label] of [['whole','全身'], ['head','头部'], ['back','背纹']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.crop = key;
    button.textContent = label;
    button.onclick = () => { set(key); onPick?.(); };
    buttons.set(key, button);
    controls.append(button);
  }
  return set;
}

export function createPairPhotoView({getState, getGameKey, portrait}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'crystal-pair-photos';
  dialog.className = 'crystal-photo-comparison';
  dialog.setAttribute('aria-labelledby','crystal-pair-photo-title');
  dialog.innerHTML = '<header><h2 id="crystal-pair-photo-title"></h2><button type="button" data-close>返回</button></header>'+
    '<div class="crystal-photo-references" role="group" aria-label="左边想看谁" hidden></div>'+
    '<div class="sibling-spread"></div><div class="sibling-crops" role="group" aria-label="两张近照一起看"></div>'+
    '<div class="crystal-photo-pair-action" hidden><p id="crystal-previous-parents" hidden></p><button type="button" data-draft-pair></button></div>';
  document.body.append(dialog);
  const heading = dialog.querySelector('h2'), back = dialog.querySelector('[data-close]');
  const refs = dialog.querySelector('.crystal-photo-references'), spread = dialog.querySelector('.sibling-spread');
  const cropControls = dialog.querySelector('.sibling-crops');
  const pairAction = dialog.querySelector('.crystal-photo-pair-action');
  const previousParents = pairAction.querySelector('p'), usePair = pairAction.querySelector('button');
  usePair.onclick = () => {
    const data = currentData(), choice = data?.draftPair;
    if (!choice || data.busy || choice.key !== usePair.dataset.pair) { sync(); return; }
    const crop = dialog.dataset.crop;
    close(false);
    choice.use(crop);
  };
  const setCrop = installPhotoCrops(dialog, cropControls, () => {
    currentData()?.rememberCrop?.(dialog.dataset.crop);
    sync();
  });
  const thumbnails = [];
  let session = null, slots = [], choices = new Map(), picker = null;

  function close(restoreFocus = true) {
    if (!session) return;
    const {trigger,origin} = session;
    session = null;
    dialog.close();
    picker?.remove(); picker = null;
    pairAction.hidden = true; delete usePair.dataset.pair;
    spread.replaceChildren(); refs.replaceChildren();
    slots = []; choices.clear();
    const target = origin?.isConnected && origin.getClientRects().length ? origin : trigger;
    if (restoreFocus && target.isConnected && target.getClientRects().length) target.focus({preventScroll:true});
  }

  function photoSlot(index) {
    const figure = document.createElement('figure');
    figure.innerHTML = '<div class="sibling-print"><img alt="" hidden><span></span></div><figcaption></figcaption><p class="crystal-keeper-note" hidden></p><button type="button" data-choose-photo hidden></button>';
    spread.append(figure);
    const choice = figure.querySelector('[data-choose-photo]');
    choice.onclick = () => {
      const data = currentData();
      const side = data?.photos[index];
      if (!side || !data.choose || data.busy || side.selectable === false) return;
      const id = side.record.id;
      const crop = dialog.dataset.crop;
      close(false);
      data.choose(id,crop);
    };
    return {figure, image:figure.querySelector('img'), status:figure.querySelector('span'), caption:figure.querySelector('figcaption'), note:figure.querySelector('p'), choice};
  }

  function currentData() {
    if (!session) return null;
    const {trigger, read, owner, game} = session;
    const data = trigger.isConnected && trigger.getClientRects().length && game === getGameKey() && read(getState());
    return data && data.owner === owner ? data : null;
  }

  function sync() {
    for (const {photo,trigger} of thumbnails) {
      const disabled = trigger.hidden || trigger.disabled;
      if (photo.disabled !== disabled) photo.disabled = disabled;
    }
    if (!session) return;
    const data = currentData();
    if (!data) {
      const recover = session.onUnavailable;
      close(false); recover?.();
      return;
    }
    const title = data.title ?? session.title;
    if (heading.textContent !== title) heading.textContent = title;
    const draftPair = data.draftPair;
    pairAction.hidden = !draftPair;
    if (draftPair) {
      usePair.dataset.pair = draftPair.key;
      usePair.disabled = !!data.busy;
      if (usePair.textContent !== draftPair.label) usePair.textContent = draftPair.label;
      previousParents.hidden = !draftPair.previous;
      if (previousParents.textContent !== draftPair.previous) previousParents.textContent = draftPair.previous;
      if (draftPair.previous) usePair.setAttribute('aria-describedby',previousParents.id);
      else usePair.removeAttribute('aria-describedby');
    }
    if (picker !== (data.picker ?? null)) {
      picker?.remove(); picker = data.picker ?? null;
      if (picker) pairAction.after(picker);
    }
    for (const [i, side] of data.photos.entries()) {
      if (!side) {
        if (slots[i].figure.hasAttribute('data-individual')) {
          // A pending portrait can finish later. Give the empty side its own image and status.
          const fresh = photoSlot(i);
          slots[i].figure.replaceWith(fresh.figure); slots[i] = fresh;
        }
        if (slots[i].status.textContent !== '等你挑另一只') slots[i].status.textContent = '等你挑另一只';
        continue;
      }
      const {figure,image,status,caption,note,choice} = slots[i];
      figure.dataset.individual = side.record.id;
      image.classList.toggle('crystal-size-photo',!!data.showBodySize);
      if (caption.textContent !== side.label) {
        caption.textContent = side.label;
        image.alt = side.label+'的近照';
      }
      const observation = side.showObservation !== false && side.record.observation ? '我的观察 · '+side.record.observation : '';
      note.hidden = !observation;
      if (note.textContent !== observation) note.textContent = observation;
      if (side.missingPhoto) {
        image.hidden = true; status.hidden = false; status.textContent = '花色未记录';
      } else portrait(image,side.record,side.at,status,side.frame,true,dialog.dataset.crop);
      choice.hidden = !data.choose || side.selectable === false;
      if (!choice.hidden) {
        if (choice.textContent !== data.choiceLabel) choice.textContent = data.choiceLabel;
        choice.setAttribute('aria-label',side.label+'，'+data.choiceLabel);
        choice.disabled = !!data.busy;
      }
    }
    refs.hidden = !data.references?.length;
    const visible = new Set();
    for (const [index,option] of (data.references || []).entries()) {
      const {key, button} = option;
      visible.add(key);
      let choice = choices.get(key);
      if (!choice) {
        choice = document.createElement('button');
        choice.type = 'button'; choice.dataset.reference = key;
        choice.onclick = () => button.click();
        choices.set(key, choice);
      }
      if (refs.children[index] !== choice) refs.insertBefore(choice,refs.children[index] || null);
      choice.hidden = false;
      if (choice.textContent !== button.textContent) choice.textContent = button.textContent;
      const pressed = button.getAttribute('aria-pressed');
      if (choice.getAttribute('aria-pressed') !== pressed) choice.setAttribute('aria-pressed',pressed);
    }
    for (const [key,choice] of choices) if (!visible.has(key)) choice.hidden = true;
  }
  function thumbnail(trigger, image, label) {
    const photo = document.createElement('button');
    photo.type = 'button'; photo.className = 'crystal-compare-photo'; photo.disabled = true;
    photo.dataset.keepEnabled = 'true';
    photo.setAttribute('aria-haspopup','dialog'); photo.setAttribute('aria-controls',dialog.id);
    photo.setAttribute('aria-label',label); photo.append(image);
    photo.onclick = () => openFrom(trigger, photo);
    thumbnails.push({photo,trigger});
    return photo;
  }

  function openFrom(trigger, origin) {
    if (trigger.hidden || trigger.disabled) return;
    trigger.click();
    if (session?.trigger === trigger) session.origin = origin;
  }

  function open(button, title, read) {
    if (session || !button.getClientRects().length || button.disabled) return false;
    const data = read(getState());
    if (!data) return false;
    session = {trigger:button, read, title, owner:data.owner, game:getGameKey(), onUnavailable:data.onUnavailable};
    const single = data.photos.length === 1;
    dialog.toggleAttribute('data-single',single);
    cropControls.setAttribute('aria-label',single ? '看这只虾的部位' : '两张近照一起看');
    dialog.querySelector('button[data-crop="whole"]').textContent = data.showBodySize ? '全身大小' : '全身';
    slots = data.photos.map((_,index) => photoSlot(index));
    setCrop(data.initialCrop ?? 'whole');
    dialog.showModal(); sync(); (data.initialFocus ?? back).focus({preventScroll:true});
    return true;
  }
  function trigger(id, label, title, read) {
    const button = document.createElement('button');
    button.id = id; button.type = 'button'; button.textContent = label;
    button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-controls',dialog.id);
    button.hidden = true;
    button.onclick = () => open(button,title,read);
    return button;
  }
  back.onclick = () => close();
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  for (const event of ['keydown','keyup']) dialog.addEventListener(event,e=>e.stopPropagation());
  return {trigger,thumbnail,openFrom,open,sync,close,dispose(){close(false);dialog.remove();}};
}
