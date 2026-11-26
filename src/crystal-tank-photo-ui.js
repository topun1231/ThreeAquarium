import {TANK_PHOTO_LIMIT, tankPhotoURL} from './tank-photos.js';
import {OBSERVATION_LIMIT} from './crystal-traits.js';
import {inTank} from './crystal-breeding.js';

export function createTankPhotoAlbum({getState, getTankKey, getActiveTank, familyIndex, capture, onAction, onVisit, onReadBrood, frameRetake, surveyPhotoTank, updateTank, nameOf, tankName}) {
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false});
  const shelf = document.createElement('section');
  shelf.id = 'crystal-tank-photos';
  shelf.innerHTML = '<h3 tabindex="-1">缸边留影</h3><p></p><div class="tank-photo-strip"></div>';
  const heading = shelf.querySelector('h3'), hint = shelf.querySelector('p'), strip = shelf.lastElementChild;
  const viewer = document.createElement('dialog');
  viewer.id = 'crystal-photo-viewer';
  viewer.setAttribute('aria-labelledby', 'crystal-photo-title');
  viewer.innerHTML = '<header><h2 id="crystal-photo-title">缸边留影</h2><button type="button" data-close>关闭</button></header>' +
    '<fieldset class="tank-photo-chooser" hidden><legend>选另一张留影</legend><div></div></fieldset>' +
    '<div class="tank-photo-spread"><figure><div class="tank-photo-print"></div><figcaption aria-live="polite"></figcaption><p class="tank-photo-words" hidden></p><small data-written hidden></small></figure></div>' +
    '<p data-related aria-live="polite" hidden></p>' +
    '<div class="tank-photo-controls"><nav aria-label="翻看这只虾的留影" hidden><button type="button" data-older>上一张</button><span aria-live="polite"></span><button type="button" data-newer>下一张</button></nav>' +
    '<details class="tank-photo-writing"><summary>给照片写一句</summary><label>照片留言<input type="text" data-caption autocomplete="off"></label>' +
    '<div><button type="button" data-use-observation>用我记的观察</button><button type="button" data-save-caption>保存留言</button><button type="button" data-cancel-caption>取消修改</button></div></details>' +
    '<label data-replacement hidden>选一张旧照片替换<select><option value="">请选择</option></select><img class="tank-photo-replacement" alt="将被替换的旧照片" hidden></label>' +
    '<p role="status"></p><footer><button type="button" data-keep>收进相册</button><button type="button" data-search-tank hidden>拿着旧照自己找</button><button type="button" data-retake hidden>带旧照去拍近况</button><button type="button" data-compare hidden>和另一张留影对照</button><button type="button" data-download>下载原图</button>' +
    '<button type="button" data-visit>去看这只虾</button><button type="button" data-birth hidden></button><button type="button" data-remove>移出相册</button></footer></div>';
  document.body.append(viewer);
  const close = viewer.querySelector('[data-close]'), keep = viewer.querySelector('[data-keep]');
  const retake = viewer.querySelector('[data-retake]'), searchTank = viewer.querySelector('[data-search-tank]');
  const download = viewer.querySelector('[data-download]'), visit = viewer.querySelector('[data-visit]'), remove = viewer.querySelector('[data-remove]');
  const print = viewer.querySelector('.tank-photo-print'), caption = viewer.querySelector('figcaption'), status = viewer.querySelector('[role="status"]');
  const title = viewer.querySelector('h2'), sequence = viewer.querySelector('nav'), position = sequence.querySelector('span');
  const older = sequence.querySelector('[data-older]'), newer = sequence.querySelector('[data-newer]');
  const compare = viewer.querySelector('[data-compare]'), chooser = viewer.querySelector('.tank-photo-chooser'), choices = chooser.querySelector('div');
  const controls = viewer.querySelector('.tank-photo-controls'), spread = viewer.querySelector('.tank-photo-spread'), related = viewer.querySelector('[data-related]');
  const replacement = viewer.querySelector('[data-replacement]'), choice = replacement.querySelector('select');
  const oldImage = replacement.querySelector('img');
  const birth = viewer.querySelector('[data-birth]'), words = viewer.querySelector('.tank-photo-words'), written = viewer.querySelector('[data-written]');
  const writer = viewer.querySelector('.tank-photo-writing'), summary = writer.querySelector('summary'), input = writer.querySelector('input');
  const fromObservation = writer.querySelector('[data-use-observation]'), saveNote = writer.querySelector('[data-save-caption]'), cancelNote = writer.querySelector('[data-cancel-caption]');
  input.maxLength = OBSERVATION_LIMIT * 2;
  const drafts = new Map();
  const broodShelves = new Map();
  let current = null, original = null, origin = null, owner = null, working = false, confirmRemoval = false, previous = null;
  let individual = null, singleTitle = '';
  const reference = document.createElement('div');
  reference.id = 'crystal-photo-reference'; reference.hidden = true;
  reference.setAttribute('role','group');
  reference.setAttribute('aria-label','取景时对照的旧照片');
  const putAway = document.createElement('button');
  putAway.type = 'button'; putAway.textContent = '收起旧照';
  let carried = null;

  function clearReference() {
    if (!carried) return;
    carried = null; reference.hidden = true;
    reference.removeAttribute('data-searching');
    delete reference.dataset.photo;
    reference.replaceChildren();
  }
  function referenceFor(id) {
    if (!carried) return null;
    const state = getState();
    const photo = carried.key === getTankKey() && state?.tankPhotos?.find(p => p.id === reference.dataset.photo && p.individualId === carried.subject);
    const stillHere = carried.room ? carried.room === getActiveTank() && state?.individuals.some(r => r.id === carried.subject && r.tank === carried.room && inTank(r)) : id === carried.subject;
    if (!photo || !stillHere) { clearReference(); return null; }
    const card = reference.firstElementChild, line = card.querySelector('.tank-photo-excerpt');
    if (photo.caption && line?.textContent !== photo.caption.text) {
      const excerpt = line || document.createElement('span');
      excerpt.className = 'tank-photo-excerpt'; excerpt.textContent = photo.caption.text;
      if (!line) card.append(excerpt);
    } else if (!photo.caption && line) line.remove();
    return photo;
  }
  putAway.onclick = () => { clearReference(); updateTank().focus({preventScroll:true}); };

  function familyOf(photo) {
    const state = getState(), batch = state && familyIndex(state).births.get(photo.individualId);
    if (!batch) return null;
    const number = state.batches.indexOf(batch) + 1;
    const order = batch.children.findIndex(child => child.id === photo.individualId) + 1;
    return {number, label:'第 ' + number + ' 窝 · 第 ' + order + ' 只'};
  }
  function photoDetails(photo, family) {
    const record = familyIndex(getState()).byId.get(photo.individualId);
    const age = record && (record.adultAt > photo.at ? '幼虾' : '成虾');
    return [age, family?.label, tankName(photo.tankId), dateLabel.format(photo.at)].filter(Boolean).join(' · ');
  }
  function describe(photo, family = familyOf(photo)) {
    return photo.name + ' · ' + photoDetails(photo,family);
  }
  function snapshotImage(photo) {
    const img = document.createElement('img');
    img.alt = photo.name + '在拍照时的缸景';
    img.src = tankPhotoURL(photo.jpeg);
    return img;
  }
  function photoCard(photo, showDetails = false) {
    const button = document.createElement('button'), label = document.createElement('span'), detail = document.createElement('small');
    const family = familyOf(photo);
    button.type = 'button'; button.dataset.photo = photo.id;
    label.textContent = photo.name;
    detail.textContent = showDetails ? photoDetails(photo,family) : family?.label || tankName(photo.tankId);
    button.setAttribute('aria-label', [describe(photo,family),photo.caption?.text].filter(Boolean).join(' · '));
    button.append(snapshotImage(photo), label, detail);
    if (photo.caption) {
      const line = document.createElement('span'); line.className = 'tank-photo-excerpt';
      line.textContent = photo.caption.text; button.append(line);
    }
    return button;
  }
  function printCaption(photo, line, stamp) {
    const note = photo.caption;
    line.textContent = note?.text || ''; line.hidden = !note;
    stamp.hidden = !note || dateLabel.format(note.at) === dateLabel.format(photo.at);
    stamp.textContent = stamp.hidden ? '' : '留言写于 ' + dateLabel.format(note.at);
  }
  function kinship(first, second) {
    if (first === second) return '同一只虾的两次留影';
    const {births} = familyIndex(getState()), a = births.get(first), b = births.get(second);
    if (a && a === b) return '这两只是同一窝的虾';
    if (b?.motherId === first || b?.fatherId === first) return '第一张是' + (b.motherId === first ? '母虾' : '公虾') + '，第二张是它的孩子';
    if (a?.motherId === second || a?.fatherId === second) return '第一张是孩子，第二张是它的' + (a.motherId === second ? '母虾' : '公虾');
    return '';
  }
  function selectComparison(photo) {
    spread.querySelector('[data-peer]')?.remove();
    if (photo) {
      const figure = document.createElement('figure'), imageBox = document.createElement('div'), label = document.createElement('figcaption');
      figure.dataset.peer = photo.id; imageBox.className = 'tank-photo-print';
      const isOldFrame = viewer.dataset.comparing === 'retake';
      imageBox.append(snapshotImage(photo)); label.textContent = (isOldFrame ? '旧照 · ' : '') + describe(photo);
      figure.append(imageBox, label);
      if (photo.caption) {
        const line = document.createElement('p'), stamp = document.createElement('small');
        line.className = 'tank-photo-words';
        printCaption(photo, line, stamp); figure.append(line, stamp);
      }
      if (isOldFrame) spread.prepend(figure);
      else spread.append(figure);
    }
    const pair = viewer.dataset.comparing === 'retake' ? [photo,current] : [current,photo];
    const relation = photo ? kinship(pair[0].individualId,pair[1].individualId) : '';
    related.textContent = relation; related.hidden = !relation;
    for (const button of choices.children) button.setAttribute('aria-pressed', String(button.dataset.photo === photo?.id));
  }
  function endComparison(restoreFocus) {
    if (!viewer.hasAttribute('data-comparing')) return;
    const wasRetake = viewer.dataset.comparing === 'retake';
    chooser.hidden = true; controls.hidden = false; delete viewer.dataset.comparing;
    choices.replaceChildren(); selectComparison(null);
    printCaption(current, words, written);
    title.textContent = singleTitle;
    close.textContent = '关闭';
    compare.hidden = !getState()?.tankPhotos?.some(p => p.id !== current.id);
    if (restoreFocus) {
      let target = compare.hidden ? close : compare;
      if (wasRetake) {
        target = keep.disabled ? download : keep;
        if (!replacement.hidden) target = choice;
      }
      target.focus({preventScroll:true});
    }
  }
  function fillChoices(photos) {
    const peerId = spread.querySelector('[data-peer]')?.dataset.peer;
    const focused = choices.contains(document.activeElement) ? document.activeElement.dataset.photo : null;
    const cards = photos.filter(p => p.id !== current.id).reverse().map(photo => {
      const button = photoCard(photo, true);
      button.onclick = () => selectComparison(photo);
      return button;
    });
    choices.replaceChildren(...cards);
    selectComparison(photos.find(p => p.id === peerId));
    if (focused) (cards.find(b => b.dataset.photo === focused) || cards[0] || close).focus({preventScroll:true});
  }
  function startComparison(selectedPhoto) {
    if (!current || working || owner !== getTankKey()) return;
    const photos = getState()?.tankPhotos || [];
    if (!photos.some(p => p.id !== current.id)) return;
    singleTitle = title.textContent;
    if (selectedPhoto) {
      viewer.dataset.comparing = 'retake'; compare.hidden = true;
      title.textContent = selectedPhoto.individualId === current.individualId ? '旧照与近况' : '旧照与眼前这只虾'; close.textContent = '只看刚拍的照片';
      selectComparison(selectedPhoto); close.focus({preventScroll:true});
      return;
    }
    viewer.dataset.comparing = 'choose'; controls.hidden = true; chooser.hidden = false;
    const draft = input.value.trim();
    if (draft !== (current.caption?.text || '')) {
      words.textContent = draft; words.hidden = !draft;
      written.textContent = '留言草稿'; written.hidden = !draft;
    }
    title.textContent = '两张留影一起看'; close.textContent = original ? '返回刚拍的照片' : '返回原先的照片';
    fillChoices(photos); choices.firstElementChild.focus();
  }
  compare.onclick = () => startComparison();
  function samePhotos(previous, photos) {
    return previous && previous.length === photos.length && previous.every((p,i) =>
      p.id === photos[i].id && p.jpeg === photos[i].jpeg && p.name === photos[i].name && p.at === photos[i].at &&
      p.individualId === photos[i].individualId && p.tankId === photos[i].tankId && p.caption?.text === photos[i].caption?.text && p.caption?.at === photos[i].caption?.at);
  }
  function fillStrip(container, photos, fallback, fromBrood = false) {
    const cards = photos.map(photo => {
      const button = photoCard(photo,fromBrood);
      button.onclick = () => {
        const saved = getState()?.tankPhotos?.find(p => p.id === photo.id && p.individualId === photo.individualId);
        if (saved) show(saved, null, button, fromBrood ? orderedPhotos(saved.individualId) : null);
      };
      return button;
    });
    const oldOrigin = container.contains(origin) && origin?.dataset.photo;
    const focused = container.contains(document.activeElement) && document.activeElement.dataset.photo;
    container.replaceChildren(...cards);
    if (oldOrigin) origin = cards.find(b => b.dataset.photo === oldOrigin) || fallback;
    if (focused) (cards.find(b => b.dataset.photo === focused) || fallback).focus({preventScroll:true});
  }
  function updateBroodShelf(anchor, batch) {
    const photos = batch && (getState()?.tankPhotos || []).filter(p => batch.children.some(child => child.id === p.individualId));
    let book = broodShelves.get(anchor);
    if (book && (!photos?.length || book.id !== batch.id)) {
      book.root.remove();
      broodShelves.delete(anchor);
      book = null;
    }
    if (!photos?.length) return;
    if (!book) {
      const root = document.createElement('details'), summary = document.createElement('summary'), prints = document.createElement('div');
      root.className = 'tank-brood-keepsakes'; prints.className = 'tank-photo-strip';
      root.append(summary,prints); anchor.before(root);
      book = {root,summary,prints,id:batch.id,photos:[]};
      broodShelves.set(anchor,book);
      root.ontoggle = () => {
        if (root.open) fillStrip(prints,book.photos,summary,true);
        else prints.replaceChildren();
      };
    }
    photos.sort((a,b) => a.at - b.at);
    if (samePhotos(book.photos,photos)) return;
    book.photos = photos;
    book.summary.textContent = '我给这窝拍的照片 · '+photos.length+' 张';
    if (book.root.open) fillStrip(book.prints,photos,book.summary,true);
  }
  function refresh(photos = []) {
    if (samePhotos(previous,photos)) return;
    previous = [...photos];
    fillStrip(strip,photos.slice().reverse(),heading);
    hint.textContent = photos.length ? '已收藏 ' + photos.length + ' / ' + TANK_PHOTO_LIMIT + ' 张' : '在缸里选中一只虾，点「拍照」就能留下它和你的造景。';
    if (viewer.open && current) {
      if (owner !== getTankKey() || (!original && !photos.some(p => p.id === current.id && p.individualId === current.individualId))) {
        finish(); return;
      }
      if (viewer.dataset.comparing === 'retake') {
        const peerId = spread.querySelector('[data-peer]')?.dataset.peer;
        const peer = photos.find(p => p.id === peerId);
        if (peer) selectComparison(peer);
        else endComparison(true);
      } else {
        compare.hidden = !photos.some(p => p.id !== current.id);
        if (!chooser.hidden) {
          if (compare.hidden) endComparison(true);
          else fillChoices(photos);
        }
      }
    }
  }
  function orderedPhotos(id) {
    return (getState()?.tankPhotos ?? []).filter(photo => photo.individualId === id).sort((a,b) => a.at - b.at);
  }
  function updateWriting() {
    const note = current?.caption, changed = input.value.trim() !== (note?.text || '');
    saveNote.hidden = !!original;
    saveNote.disabled = working || !changed;
    cancelNote.hidden = !changed;
    cancelNote.disabled = input.disabled = working;
    fromObservation.disabled = working || !!input.value.trim();
  }
  function show(photo, frame, source, history = null) {
    const opening = !viewer.open;
    if (opening) drafts.clear();
    current = photo; original = frame; origin = source; owner = getTankKey(); confirmRemoval = false;
    individual = history ? photo.individualId : null;
    const fresh = !!frame, photos = getState()?.tankPhotos ?? [];
    compare.hidden = !photos.some(p => p.id !== photo.id);
    print.replaceChildren(frame || snapshotImage(photo));
    const family = familyOf(photo);
    caption.textContent = describe(photo,family);
    printCaption(photo, words, written);
    birth.hidden = fresh || !family;
    if (!birth.hidden) birth.textContent = '翻第 ' + family.number + ' 窝手记';
    const draft = drafts.get(photo.id);
    writer.hidden = fresh && !photo.jpeg;
    writer.open = draft !== undefined;
    input.value = draft ?? photo.caption?.text ?? '';
    summary.textContent = photo.caption ? '编辑照片留言' : '给照片写一句';
    const record = familyIndex(getState()).byId.get(photo.individualId);
    retake.hidden = fresh || !capture || !frameRetake || !record || !inTank(record);
    searchTank.hidden = fresh || !surveyPhotoTank || !record || !inTank(record);
    if (!searchTank.hidden) searchTank.textContent = '拿着旧照去'+tankName(record.tank)+'自己找';
    if (!retake.hidden) retake.textContent = '带旧照去'+tankName(record.tank)+'取景';
    fromObservation.hidden = !record?.observation;
    updateWriting();
    title.textContent = history ? nameOf(getState().individuals.find(r => r.id === individual)) + '的留影' : '缸边留影';
    sequence.hidden = !history || history.length < 2;
    if (!sequence.hidden) {
      const index = history.findIndex(item => item.id === photo.id);
      position.textContent = (index+1) + ' / ' + history.length;
      older.disabled = index === 0; newer.disabled = index === history.length-1;
    }
    replacement.hidden = !fresh || photos.length < TANK_PHOTO_LIMIT || !photo.jpeg;
    choice.length = 1; choice.value = ''; oldImage.hidden = true; oldImage.removeAttribute('src');
    if (!replacement.hidden) for (const item of photos) choice.add(new Option([describe(item),item.caption?.text].filter(Boolean).join(' · '), item.id));
    keep.hidden = !fresh;
    keep.textContent = replacement.hidden ? '收进相册' : '替换所选照片';
    keep.disabled = !photo.jpeg || !replacement.hidden;
    visit.hidden = remove.hidden = fresh || !!history; remove.textContent = '移出相册';
    if (!visit.hidden && record) visit.textContent = record.soldAt !== null ? '看已转让档案' : record.tank === 'rest' ? '看静养档案' : '去'+tankName(record.tank)+'看它';
    download.textContent = fresh ? '下载原图' : '下载相册照片';
    status.textContent = fresh && !photo.jpeg ? '这帧细节太多，请直接下载原图。' :
      !replacement.hidden ? '相册已满，可以下载原图，或亲自选一张旧照替换。' : '';
    if (opening) { viewer.showModal(); close.focus({preventScroll:true}); }
  }
  function openFor(id, source) {
    if (!id || viewer.open || working) return;
    const history = orderedPhotos(id);
    if (history.length) show(history[0], null, source, history);
  }
  function turnPage(direction) {
    if (!individual || working) return;
    if (owner !== getTankKey()) { finish(); return; }
    const history = orderedPhotos(individual), index = history.findIndex(photo => photo.id === current?.id);
    if (index < 0) { finish(); return; }
    const target = history[index+direction];
    if (!target) return;
    show(target, null, origin, history);
    const control = direction > 0 ? newer : older;
    if (control.disabled) (control === newer ? older : newer).focus({preventScroll:true});
  }
  older.onclick = () => turnPage(-1);
  newer.onclick = () => turnPage(1);
  input.oninput = () => {
    if (!current) return;
    if (input.value === (current.caption?.text || '')) drafts.delete(current.id);
    else drafts.set(current.id, input.value);
    status.textContent = ''; updateWriting();
  };
  fromObservation.onclick = () => {
    if (!current || working || input.value.trim()) return;
    input.value = familyIndex(getState()).byId.get(current.individualId)?.observation || '';
    input.oninput(); input.focus();
  };
  cancelNote.onclick = () => {
    input.value = current?.caption?.text || ''; input.oninput(); writer.open = false; summary.focus();
  };
  input.onkeydown = event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!original) saveNote.click();
    } else if (event.key === 'Escape') {
      event.preventDefault(); cancelNote.click();
    }
  };
  function take(record, source) {
    if (viewer.open || working) return;
    const oldPhoto = referenceFor(record.id);
    const at = Math.max(getState().now, Date.now());
    const {original:frame, jpeg} = capture(record.id);
    const photo = {id:crypto.randomUUID(), individualId:record.id, tankId:record.tank, name:nameOf(record), at, jpeg};
    show(photo, frame, source);
    if (oldPhoto) {
      caption.textContent = '刚拍 · ' + caption.textContent;
      startComparison(oldPhoto);
      if (!carried?.room) clearReference();
      updateTank();
    }
  }
  function finish() { if (viewer.open && !working) viewer.close(); }
  close.onclick = () => { if (viewer.hasAttribute('data-comparing')) endComparison(true); else finish(); };
  viewer.addEventListener('keydown', event => event.stopPropagation());
  viewer.addEventListener('cancel', event => {
    if (working) event.preventDefault();
    else if (viewer.hasAttribute('data-comparing')) { event.preventDefault(); endComparison(true); }
  });
  viewer.addEventListener('close', () => {
    endComparison(false);
    print.replaceChildren();
    oldImage.removeAttribute('src');
    if (original) original.width = original.height = 0;
    if (origin?.isConnected && !origin.closest('[hidden]')) origin.focus({preventScroll:true});
    else if (!shelf.closest('[hidden]')) heading.focus({preventScroll:true});
    current = original = origin = owner = individual = null; confirmRemoval = false;
    drafts.clear(); input.value = ''; words.textContent = written.textContent = '';
  });
  choice.onchange = () => {
    const item = getState()?.tankPhotos?.find(photo => photo.id === choice.value);
    keep.disabled = !item; oldImage.hidden = !item;
    if (item) oldImage.src = tankPhotoURL(item.jpeg);
    else oldImage.removeAttribute('src');
  };
  async function persist(action) {
    if (working) return;
    working = true;
    close.disabled = keep.disabled = remove.disabled = download.disabled = visit.disabled = birth.disabled = choice.disabled = compare.disabled = true;
    updateWriting();
    try {
      if (owner !== getTankKey()) throw Error('当前进度已经换缸，请重新打开留影。');
      await onAction(action);
      if (!shelf.closest('[hidden]')) refresh(getState()?.tankPhotos);
      working = false;
      if (action.type === 'captionTankPhoto') {
        const saved = getState()?.tankPhotos?.find(p => p.id === action.id);
        if (!saved || owner !== getTankKey()) { finish(); return; }
        drafts.delete(saved.id);
        show(saved, null, origin, individual ? orderedPhotos(individual) : null);
        status.textContent = saved.caption ? '照片留言已保存。' : '照片留言已清空。';
        summary.focus({preventScroll:true});
      } else viewer.close();
    } catch (error) { status.textContent = error.message; }
    finally {
      working = false;
      close.disabled = remove.disabled = download.disabled = visit.disabled = birth.disabled = choice.disabled = compare.disabled = false;
      updateWriting();
      keep.disabled = !current?.jpeg || (!replacement.hidden && !choice.value);
    }
  }
  keep.onclick = () => {
    if (original && current?.jpeg) void persist({type:'keepTankPhoto', photo:current, caption:input.value.trim(), ...(!replacement.hidden && choice.value ? {replaceId:choice.value} : {})});
  };
  saveNote.onclick = () => {
    if (!original && current) void persist({type:'captionTankPhoto', id:current.id, individualId:current.individualId, value:input.value.trim(),
      previousText:current.caption?.text || '', previousAt:current.caption?.at ?? null});
  };
  remove.onclick = () => {
    if (!confirmRemoval) { confirmRemoval = true; remove.textContent = '确认移出'; status.textContent = '这张留影将从存档中移除。'; return; }
    void persist({type:'removeTankPhoto', id:current.id});
  };
  function leaveFor(action) {
    if (!current || working || owner !== getTankKey()) return;
    const photo = getState()?.tankPhotos?.find(p => p.id === current.id && p.individualId === current.individualId);
    if (!photo) { status.textContent = '这张留影已不在相册里。'; return; }
    if (needsCaptionSave()) return;
    const source = origin, key = owner;
    viewer.addEventListener('close', () => { if (key === getTankKey()) action(photo, source); }, {once:true});
    viewer.close();
  }
  function needsCaptionSave() {
    if (input.value.trim() !== (current.caption?.text || '')) {
      writer.open = true; status.textContent = '这张照片还有留言草稿。保存或取消修改后就能继续。'; input.focus(); return true;
    }
    if (individual && drafts.size) {
      const history = orderedPhotos(individual);
      const pending = history.findIndex(p => drafts.has(p.id) && drafts.get(p.id).trim() !== (p.caption?.text || ''));
      if (pending >= 0) {
        status.textContent = '第 ' + (pending+1) + ' 张留影还有留言草稿，请先翻回去保存或取消。';
        const index = history.findIndex(p => p.id === current.id);
        (pending < index ? older : newer).focus(); return true;
      }
    }
    return false;
  }
  async function carryPhoto(searching) {
    if (working || !current || original || owner !== getTankKey() || needsCaptionSave()) return;
    const photo = current, key = owner;
    const saved = () => getState()?.tankPhotos?.find(p => p.id === photo.id && p.individualId === photo.individualId);
    const record = getState()?.individuals.find(r => r.id === photo.individualId);
    if (!saved() || !record || !inTank(record)) { searchTank.hidden = retake.hidden = true; status.textContent = '请重新查看这只虾的去向和留影。'; return; }
    working = true; controls.inert = true; close.disabled = true;
    status.textContent = '正在去'+tankName(record.tank)+'…';
    try {
      const target = searching ? await surveyPhotoTank(record) : await frameRetake(photo.individualId, origin);
      const old = saved();
      if (!viewer.open || !target || current !== photo || key !== getTankKey() || !old) throw Error('留影或缸中个体已变化，请重新取景。');
      carried = {key, subject:old.individualId, room:searching ? record.tank : null};
      reference.dataset.photo = old.id;
      reference.toggleAttribute('data-searching',searching);
      const card = photoCard(old,true);
      card.querySelector('span').textContent = '旧照 · '+old.name;
      card.setAttribute('aria-label','放大旧照，'+describe(old));
      card.onclick = () => { const p = referenceFor(old.individualId); if (p) show(p,null,card); };
      reference.replaceChildren(card, putAway); reference.hidden = false;
      updateTank();
      const landing = searching ? card : target;
      viewer.addEventListener('close', () => { if (referenceFor(photo.individualId) && landing.isConnected) landing.focus({preventScroll:true}); }, {once:true});
      viewer.close();
    } catch (error) {
      if (key !== getTankKey() || !saved()) viewer.close();
      else status.textContent = error.message;
    } finally {
      working = false; close.disabled = false; controls.inert = false;
      const control = searching ? searchTank : retake;
      if (viewer.open && !control.hidden) control.focus({preventScroll:true});
    }
  }
  searchTank.onclick = () => carryPhoto(true);
  retake.onclick = () => carryPhoto(false);
  visit.onclick = () => leaveFor((photo, source) => onVisit(photo.individualId, source));
  birth.onclick = () => leaveFor(onReadBrood);
  download.onclick = async () => {
    const photo = current, frame = original;
    if (!photo || working) return;
    const link = document.createElement('a');
    try {
      if (frame) {
        const blob = await new Promise(resolve => frame.toBlob(resolve, 'image/png'));
        if (!blob) throw Error('原图生成失败，请重试。');
        link.href = URL.createObjectURL(blob);
      } else link.href = tankPhotoURL(photo.jpeg);
      link.download = '缸边留影-' + photo.name.replace(/[<>:"/\\|?*]/g,'＿') + '-' + photo.at + (frame ? '.png' : '.jpg');
      link.click();
    } catch (error) { if (current === photo) status.textContent = error.message; }
    finally { if (link.href.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
  };
  function reopen(id) {
    const button = Array.from(strip.children).find(b => b.dataset.photo === id);
    if (!button) { heading.focus(); return; }
    button.focus({preventScroll:true});
    button.click();
  }
  function clearBroodShelves() {
    for (const {root} of broodShelves.values()) root.remove();
    broodShelves.clear();
  }
  return {shelf, reference, referenceFor, clearReference, take, refresh, updateBroodShelf, openFor, reopen,
    close() { previous = null; clearBroodShelves(); clearReference(); finish(); },
    dispose() { clearBroodShelves(); clearReference(); if (viewer.open) viewer.close(); viewer.remove(); }};
}
