async page => {
  const c = id => page.locator('#crystal-' + id);
  const panel = c('panel'), tray = c('brood-watch'), viewer = c('photo-viewer');
  const shutter = c('tank-shutter'), reference = c('photo-reference');
  const noteField = viewer.locator('[data-caption]'), write = viewer.locator('.tank-photo-writing summary');
  const act = data => page.evaluate(action => aquarium.game.crystalAction(action),data);
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const selected = () => page.evaluate(() => aquarium.selected ?? null);
  const check = (value,message) => { if (!value) throw Error(message); };
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  async function reload() {
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.aquarium?.ready,null,{timeout:120000});
  }
  async function tab(name) {
    if (await panel.isHidden()) await c('open').click();
    await c('tab-' + name).click();
  }
  async function photo(id,note) {
    await tab('roster');
    await c('roster-filter').selectOption('live');
    await c('roster').locator('[data-individual-id="'+id+'"]').click();
    await c('focus').click(); await shutter.click();
    await write.click(); await noteField.fill(note);
    await viewer.locator('[data-keep]').click(); await viewer.waitFor({state:'hidden'});
    return (await state()).tankPhotos.at(-1);
  }
  async function turnPages(container,photos) {
    const shelf = container.locator('.tank-brood-keepsakes');
    await shelf.waitFor();
    if (!await shelf.evaluate(el => el.open)) await shelf.locator('summary').click();
    await shelf.locator('[data-photo]').first().waitFor();
    const ids = await shelf.locator('[data-photo]').evaluateAll(cards => cards.map(card => card.dataset.photo));
    check(same(ids,photos.map(p => p.id)), 'Wrong photographs or dates under this brood: '+ids);
    return shelf;
  }
  async function openPhoto(shelf,photo) {
    await shelf.locator('[data-photo="'+photo.id+'"]').click(); await viewer.waitFor();
    check(await viewer.locator('.tank-photo-print img').first().evaluate(img => img.src.split(',')[1]) === photo.jpeg,
      'The opened photograph differs from the one the keeper took');
  }
  async function failOnce(message) {
    await page.evaluate(note => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key,value) {
        if (key === 'aquarium.three.creatures.v1') { Storage.prototype.setItem=original; throw Error(note); }
        return original.call(this,key,value);
      };
    },message);
  }
  async function pickAtGlass(id) {
    await page.waitForFunction(id => aquarium.aq.animals.some(a => a.id === id),id);
    const until = Date.now()+14000;
    do {
      const point = await page.evaluate(async id => {
        await new Promise(requestAnimationFrame);
        const {camera,aq,renderer} = aquarium, glass = renderer.domElement;
        aq.root.updateWorldMatrix(true,true); camera.updateMatrixWorld();
        const rig = aq.animals.find(a => a.id === id).rig, rect = glass.getBoundingClientRect();
        const p = rig.localToWorld(rig.position.clone().set(.009,.0045,0)).project(camera);
        const x = rect.left+(p.x+1)*rect.width/2, y = rect.top+(1-p.y)*rect.height/2;
        return Math.abs(p.z)<1 && document.elementFromPoint(x,y)===glass ? {x,y} : null;
      },id);
      if (point) { await page.mouse.click(point.x,point.y); if (await selected()===id) return; }
    } while (Date.now()<until);
    throw Error('Could not select the resident at the glass: '+id);
  }
  await page.locator('#welcome-dismiss').click();
  await c('open').click(); await c('start').click(); await panel.waitFor({state:'hidden'});
  await act({type:'plan',motherId:'I4',fatherId:'I2',tankId:'breeding',size:4});
  await act({type:'plan',motherId:'I1',fatherId:'I3',tankId:'main',size:2});
  const [a,b] = (await state()).batches;
  const hatch = Math.max(a.hatchAt,b.hatchAt);
  await page.clock.setFixedTime(new Date(hatch+100)); await act({type:'advance'});
  const [first,second] = (await state()).batches;
  const subject = first.children[2].id, sibling = first.children[0].id, other = second.children[0].id;
  const journal = id => c('batches').locator('[data-batch-id="'+id+'"]');
  await tab('breed');
  check(await panel.locator('.tank-brood-keepsakes').count()===0,'An empty album advertised photographs');
  for (const id of [subject,sibling,other]) await act({type:'rename',id,name:'豆豆'});
  const original = await photo(subject,'下次想看头顶这点红');
  await page.clock.setFixedTime(new Date(hatch+60000));
  const neighbor = await photo(other,'来自另一窝');
  const brother = await photo(sibling,'我喜欢尾巴那条白带');
  await page.clock.setFixedTime(new Date(hatch+120000));
  const again = await photo(subject,'这张拍到它在木头边');
  const ours = [original,brother,again];
  await act({type:'expand',tankId:'breeding-2'}); await act({type:'move',id:subject,tankId:'breeding-2'});
  for (const id of [subject,sibling]) await act({type:'rename',id,name:'小石'});
  await page.clock.setFixedTime(new Date(Math.max(a.adultAt,b.adultAt)+2*86400000)); await reload();
  await c('activity').click();
  const message = page.locator('[data-growth-id="'+a.id+'"]');
  if (await message.isVisible()) await message.click();
  await tray.waitFor();
  check(same(await tray.locator('[data-watch-child]').evaluateAll(rows => rows.map(row => row.dataset.watchChild)),
    first.children.map(k => k.id)),'Having an old photograph changed the display order');
  const beforeSelection = await selected(), atReturn = await state();
  const closed = tray.locator('.tank-brood-keepsakes');
  check(!await closed.evaluate(el => el.open) && !await closed.locator('img').count(),'Old photographs opened or decoded without a choice');
  const held = await turnPages(tray,ours);
  await page.setViewportSize({width:390,height:790});
  const small = await held.evaluate(el => ({width:el.clientWidth,content:el.scrollWidth}));
  check(small.content<=small.width+1,'Old photographs overflowed the narrow card');
  await openPhoto(held,again);
  check((await viewer.locator('figcaption').first().innerText()).includes('第 3 只') &&
    (await viewer.locator('figcaption').first().innerText()).includes('豆豆') &&
    (await viewer.locator('[data-search-tank]').innerText()).includes('繁育缸'), 'The old name, birth order or current home was lost');
  check(await viewer.locator('nav span').innerText()==='2 / 2','Opened the other photo of the same shrimp');
  await viewer.locator('[data-older]').click(); await write.click(); await noteField.fill('下一窝还想看看这个红点');
  await viewer.locator('[data-newer]').click(); await viewer.locator('[data-birth]').click();
  check(await viewer.isVisible() && (await viewer.getByRole('status').innerText()).includes('第 1 张'),'Going to the journal discarded another photo’s pending note');
  await viewer.locator('[data-older]').click();
  check(await noteField.inputValue()==='下一窝还想看看这个红点','Turning back lost the wording');
  await failOnce('这次留言写入失败'); await viewer.locator('[data-save-caption]').click();
  await viewer.getByRole('status').filter({hasText:'这次留言写入失败'}).waitFor();
  check((await state()).tankPhotos[0].caption.text===original.caption.text,'The failed caption overwrote the good copy');
  await viewer.locator('[data-save-caption]').click(); await viewer.getByRole('status').filter({hasText:'已保存'}).waitFor();
  await viewer.locator('[data-close]').click(); await viewer.waitFor({state:'hidden'});
  check((await held.locator('[data-photo="'+original.id+'"]').innerText()).includes('下一窝还想看看这个红点') &&
    await selected()===beforeSelection,'Reading changed the selected resident or left stale handwriting');
  await page.setViewportSize({width:1200,height:840});
  await openPhoto(held,brother); await viewer.locator('[data-retake]').click(); await viewer.waitFor({state:'hidden'});
  check(await selected()===sibling && await reference.isVisible() && await shutter.isVisible() && await tray.isHidden(),
    'Going to take a new picture from the brood hid the shutter');
  await tab('breed');
  const inBook = await turnPages(journal(a.id),ours); await turnPages(journal(b.id),[neighbor]);
  await openPhoto(inBook,original); await failOnce('跨缸找虾写入失败'); await viewer.locator('[data-search-tank]').click();
  await viewer.getByRole('status').filter({hasText:'跨缸找虾写入失败'}).waitFor();
  await viewer.locator('[data-search-tank]').click(); await viewer.waitFor({state:'hidden'});
  check(await selected()===null && await reference.getAttribute('data-photo')===original.id,'The old picture identified a shrimp before the keeper did');
  await pickAtGlass(subject); await shutter.click();
  check(await viewer.locator('[data-related]').innerText()==='同一只虾的两次留影' &&
    (await viewer.locator('figure').first().innerText()).includes('下一窝还想看看这个红点'),'Examined the wrong adult or lost the old note');
  await viewer.locator('[data-close]').click(); await viewer.locator('[data-close]').click(); await viewer.waitFor({state:'hidden'});
  const afterReading=await state();
  check(afterReading.cash===atReturn.cash && afterReading.rngState===atReturn.rngState && same(afterReading.batches,atReturn.batches) &&
    afterReading.tankPhotos.length===4,'Review or the unsaved photograph changed the brood, funds or album');
  await c('tank-next-generation').click(); await c('tank-pair').getByRole('button',{name:'从虾册挑'}).click();
  const animal=afterReading.individuals.find(r=>r.id===subject), mate=animal.sex==='female'?'I3':'I1';
  await c('roster').locator('[data-individual-id="'+mate+'"]').click(); await c('pick-parent').click();
  await c('brood-size').selectOption('2'); await c('plan').click();
  await page.waitForFunction(() => aquarium.game.data.Breeding.batches.length===3);
  const next=(await state()).batches[2];
  check(same([next.motherId,next.fatherId],animal.sex==='female'?[subject,mate]:[mate,subject]),'A namesake or the wrong mate was used');
  await page.clock.setFixedTime(new Date(next.hatchAt+1000)); await reload(); await tab('breed');
  const retraced=(await state()).batches[2];
  check(retraced.children.length===2 && (await state()).tankPhotos.find(p=>p.id===original.id)?.caption.text==='下一窝还想看看这个红点',
    'Reload lost the chosen parent or handwriting');
  check(!await journal(next.id).locator('.tank-brood-keepsakes').count(),'Pictures of a parent appeared as pictures of its babies');
  await act({type:'rest',id:sibling}); await openPhoto(await turnPages(journal(a.id),ours),brother);
  check(await viewer.locator('[data-retake]').isHidden() && await viewer.locator('[data-search-tank]').isHidden(),'A resting shrimp still offered a live visit');
  const save=await page.evaluate(()=>aquarium.game.snapshot());
  delete save.session.Breeding.tankPhotos;
  await page.evaluate(s=>aquarium.game.restore(s),save); await viewer.waitFor({state:'hidden'}); await tab('breed');
  check(!await panel.locator('.tank-brood-keepsakes').count(),'A save without photos inherited the last album');
  return {subject,sibling,other,broods:[a.id,b.id,next.id],photos:ours.map(p=>p.id),outside:neighbor.id,
    oldName:original.name,currentName:animal.name,position:3,offlineDays:2,mate,grandchildren:retraced.children.length,
    narrow:small,failedNoteAndMoveRetried:true,archivedPhoto:true,olderSave:true};
}
