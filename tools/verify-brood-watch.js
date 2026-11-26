async page => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const c = id => page.locator('#crystal-' + id);
  const panel = c('panel'), tray = c('brood-watch'), clutch = c('tank-clutch');
  const child = id => tray.locator('[data-watch-child="' + id + '"]');
  const parent = tray.locator('[data-parent]');
  const crop = key => tray.locator('button[data-crop="' + key + '"]');
  const photos = tray.locator('[data-watch-child] img');
  async function waitPhotos(width) {
    await page.waitForFunction(width => {
      const images = [...document.querySelectorAll('#crystal-brood-watch [data-watch-child] img')];
      return images.length === 4 && images.every(im => !im.hidden && im.complete && im.naturalWidth === width);
    }, width);
  }
  async function bodyWidths() {
    await waitPhotos(384);
    return photos.evaluateAll(images => images.map(im => {
      const canvas = document.createElement('canvas');
      canvas.width = im.naturalWidth; canvas.height = im.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(im,0,0);
      const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let first = canvas.width, last = -1;
      for (let x=0; x<canvas.width; x++) {
        let solid = 0;
        for (let y=0; y<canvas.height; y++) if (pixels[(y*canvas.width+x)*4+3] >= 160) solid++;
        if (solid > canvas.height*.045) { first = Math.min(x,first); last = x; }
      }
      const box = im.getBoundingClientRect(), plate = im.parentElement.getBoundingClientRect();
      const scale = box.width/canvas.width;
      return Math.round(Math.min(plate.right,box.left+(last+1)*scale) - Math.max(plate.left,box.left+first*scale));
    }));
  }
  const act = action => page.evaluate(a => aquarium.game.crystalAction(a), action);
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const selected = () => page.evaluate(() => aquarium.selected);
  async function goTo(id, query = '') {
    if (await panel.isHidden()) await c('open').click();
    await c('tab-roster').click();
    await c('search').fill(query);
    await c('roster').locator('[data-individual-id="' + id + '"]').click();
    await c('focus').click();
    await panel.waitFor({state:'hidden'});
    await page.waitForFunction(value => aquarium.selected === value, id);
  }
  async function inView(id, room = 'main') {
    await page.waitForFunction(([id, room]) => aquarium.selected === id &&
      aquarium.game.data.BreedingRooms.activeId === room && aquarium.world.agentsById.has(id), [id, room]);
    check(await panel.isHidden() && await tray.isVisible(), 'Left the tank while visiting ' + id);
  }
  async function stage(at) {
    await page.clock.setFixedTime(new Date(at + 5));
    await act({type:'advance'});
  }
  async function fit(width, height) {
    await page.setViewportSize({width,height});
    const box = await tray.locator('..').boundingBox();
    check(box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, 'Family tray left the viewport');
    const rect = await tray.locator('button[data-watch-child]').first().boundingBox();
    check(rect.width >= 36 && rect.height >= 36, 'Child button too small');
  }
  const mother = 'I4', father = 'I2';
  await page.setViewportSize({width:390,height:800});
  await page.locator('#welcome-dismiss').click();
  await c('open').click(); await c('start').click(); await panel.waitFor({state:'hidden'});
  await act({type:'move',id:'I3',tankId:'breeding'});
  await act({type:'plan',motherId:mother,fatherId:father,tankId:'main',size:4});
  const batch = (await state()).batches[0];
  await stage(batch.formedAt); await goTo(mother, '雪团');
  await page.waitForFunction(id => aquarium.aq.animals.find(a => a.id === id)?.look.eggs.visible, mother);
  check((await clutch.innerText()).includes('孵化进度'), 'Could see children before they hatched');
  await stage(batch.hatchAt);
  const ids = (await state()).batches[0].children.map(k => k.id);
  await page.waitForFunction(id => !aquarium.aq.animals.find(a => a.id === id)?.look.eggs.visible, mother);
  check(ids.length === 4 && await selected() === mother && await tray.isHidden(), 'Hatching took over the view');
  await clutch.click(); await inView(mother);
  const order = await tray.locator('[data-watch-child]').evaluateAll(items => items.map(x => x.dataset.watchChild));
  check(JSON.stringify(order) === JSON.stringify(ids), 'Reordered children or recommended one');
  check(!await tray.locator('[data-watch-child][aria-pressed="true"]').count(), 'Chose a child for the player');
  const youngWidths = await bodyWidths();
  check(youngWidths.every(w => w >= 40), 'Cards fit but the newborn bodies are too small to inspect');
  const initialState = JSON.stringify(await state());
  const sources = () => photos.evaluateAll(images => images.map(im => im.src));
  const prints = () => photos.evaluateAll(images => images.map(im=>{
    const canvas=document.createElement('canvas');canvas.width=36;canvas.height=21;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#c8b9a0';ctx.fillRect(0,0,36,21);ctx.drawImage(im,0,0,36,21);
    return Array.from(ctx.getImageData(0,0,36,21).data);
  }));
  const distance=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0);
  const small = await sources();
  const sidePrints = await prints();
  let fallbackPrints;
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    window.finishBroodPhotoFailure = () => { HTMLCanvasElement.prototype.toDataURL = original; delete window.finishBroodPhotoFailure; };
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      if (this.width === 1152 && this.height === 672) throw Error('隔离测试：近照编码失败');
      return original.apply(this,args);
    };
  });
  try {
    await crop('back').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-watch-child] img')].every(im => im.dataset.portraitFailed === 'true'));
    await waitPhotos(384);
    fallbackPrints=await prints();
    check(fallbackPrints.every((sample,i)=>distance(sample,sidePrints[i])>0),'Dorsal fallback reused a side photograph');
    await tray.locator('[data-close]').click();
    await clutch.evaluate(control => {
      control.click();
      document.querySelector('#crystal-brood-watch button[data-crop="head"]').click();
    });
    await waitPhotos(384);
    check(await tray.getAttribute('data-crop') === 'head' && JSON.stringify(small) === JSON.stringify(await sources()), 'An immediate zoom dropped the pending photos');
  } finally { await page.evaluate(() => window.finishBroodPhotoFailure()); }
  await crop('whole').click(); await waitPhotos(384);
  await crop('head').press('Enter'); await waitPhotos(1152);
  const large = await sources();
  await crop('back').click(); await waitPhotos(1152);
  const back=await sources(), backPrints=await prints();
  check(back.every((url,i)=>url!==large[i] && distance(backPrints[i],fallbackPrints[i])<distance(backPrints[i],sidePrints[i])) &&
    await crop('back').getAttribute('aria-pressed')==='true','A full resolution dorsal portrait disagrees with its fallback or showed the flank');
  check(JSON.stringify(await state()) === initialState && await selected() === mother, 'Inspecting photographs selected a child or changed the brood');
  await fit(390,800); await fit(844,390);
  await child(ids[2]).focus(); await child(ids[2]).press('Enter'); await inView(ids[2]);
  check(await tray.getAttribute('data-crop') === 'back', 'Visiting a child lost the crop');
  await child(ids[0]).click(); await inView(ids[0]);
  await parent.click(); await inView(mother);
  await parent.press('Escape'); await tray.waitFor({state:'hidden'});
  check(await clutch.evaluate(b=>b === document.activeElement), 'Escape did not return to the mother’s control');
  await c('inspect').click(); await panel.waitFor();
  check(await c('focus').evaluate(b=>b === document.activeElement) && await c('search').inputValue() === '雪团' &&
    await c('roster').locator('[aria-pressed="true"]').getAttribute('data-individual-id') === mother, 'Lost the original album search or selected record');
  await goTo(mother); await clutch.click();
  await tray.locator('[data-read]').click(); await panel.waitFor();
  check(await panel.getAttribute('data-page') === 'breed' && await tray.isHidden() && await panel.locator('[data-hatchling]').count() === 4, 'Lost the full brood journal');

  await stage(batch.adultAt);
  for (const id of ids.slice(0,2)) await act({type:'rename',id,name:'小米'});
  await act({type:'move',id:ids[1],tankId:'breeding'});
  await act({type:'rest',id:ids[2]}); await act({type:'sell',id:ids[3]});
  await goTo(mother); await clutch.click(); await inView(mother);
  check(await tray.getAttribute('data-crop') === 'whole', 'A new visit opened mid-crop');
  const adultWidths = await bodyWidths();
  check(adultWidths.every((w,i) => w > 1.65 * youngWidths[i]), 'The same offspring lost the visible difference in length as it grew');
  const names = await tray.locator('[data-name]').allTextContents();
  check(names[0] !== names[1] && names[0].includes('小米') && names[1].includes('小米'), 'Namesakes cannot be told apart');
  check((await child(ids[1]).innerText()).includes('繁育缸'), 'Moved child still listed in birth room');
  check(await child(ids[2]).isDisabled() && (await child(ids[2]).innerText()).includes('静养') &&
    await child(ids[3]).isDisabled() && (await child(ids[3]).innerText()).includes('转让'), 'Off-tank records passed for live siblings');
  await page.evaluate(async () => {
    const {GAME_SAVE_KEY} = await import('/src/local-game-save.js');
    const original = Storage.prototype.setItem, before = localStorage.getItem(GAME_SAVE_KEY);
    window.finishWatchFailure = () => {
      Storage.prototype.setItem = original;
      delete window.finishWatchFailure;
      return localStorage.getItem(GAME_SAVE_KEY) === before;
    };
    Storage.prototype.setItem = function(key, value) {
      if (key === GAME_SAVE_KEY) throw Error('隔离测试：换缸保存失败');
      return original.call(this,key,value);
    };
  });
  let saveIntact;
  try {
    await child(ids[1]).click();
    await page.waitForFunction(() => document.getElementById('crystal-feedback').textContent.includes('换缸保存失败'));
    await inView(mother);
  } finally { saveIntact = await page.evaluate(() => window.finishWatchFailure()); }
  check(saveIntact, 'Failed visit changed the save');
  await child(ids[1]).click(); await inView(ids[1],'breeding');
  await parent.click(); await inView(mother);
  await tray.locator('[data-close]').click();
  await act({type:'plan',motherId:mother,fatherId:father,tankId:'main',size:2});
  const second = (await state()).batches[1];
  await stage(second.hatchAt); await goTo(father); await clutch.click();
  check((await tray.locator('strong').innerText()).includes('第 2 窝') && await tray.locator('[data-watch-child]').count() === 2, 'Returned to wrong brood');
  await tray.locator('[data-history]').click(); await panel.waitFor();
  check(await c('parent-broods').inputValue() === second.id && await c('parent-broods').locator('option').count() >= 2, 'Other family records inaccessible');
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForFunction(() => window.aquarium?.ready);
  const saved = await state();
  check(await tray.isHidden() && saved.batches.length === 2 && saved.individuals.find(r=>r.id===ids[1]).tank === 'breeding', 'Reload changed family or kept a stale viewer');
  return {birthOrder:order, foundAllPhotos:true, observed:[ids[2],ids[0],mother], names:names.slice(0,2),
    youngWidths, adultWidths, sameBroodAfterCrops:true, zoomFailureRecovered:true,
    originalAlbumSearch:'雪团', crossTankRoundTrip:true, saveFailureRecovered:saveIntact, restingAndTransferred:true, secondBrood:second.id,
    reloadBroods:saved.batches.length, layouts:['390x800','844x390']};
}
