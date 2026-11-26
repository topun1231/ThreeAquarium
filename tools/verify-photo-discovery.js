async page => {
  const c = id => page.locator('#crystal-'+id), panel = c('panel'), viewer = c('photo-viewer');
  const control = key => viewer.locator('[data-'+key+']');
  const search = control('search-tank'), ref = c('photo-reference'), shutter = c('tank-shutter');
  const act = action => page.evaluate(a => aquarium.game.crystalAction(a), action);
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const selection = () => page.evaluate(() => aquarium.selected ?? null);
  const room = () => page.evaluate(() => aquarium.game.data.BreedingRooms.activeId);
  const check = (value, message) => { if (!value) throw Error(message); };
  const mark = '小时候右侧的白带较细';
  async function jump(at) {
    await page.clock.setFixedTime(new Date(at+100)); await act({type:'advance'});
  }
  async function openAlbum(id) {
    if (await panel.isHidden()) await c('open').click();
    await c('tab-album').click(); await c('tank-photos').locator('[data-photo="'+id+'"]').click();
    await viewer.waitFor();
  }
  async function hidePhoto() {
    if (await viewer.getAttribute('data-comparing')) await page.keyboard.press('Escape');
    await control('close').click(); await viewer.waitFor({state:'hidden'});
  }
  async function pickFromTank(id) {
    const coord = await page.evaluate(async id => {
      const {aq, camera, renderer} = aquarium, rig = aq.animals.find(a => a.id === id).rig;
      const deadline = performance.now()+7000;
      do {
        await new Promise(requestAnimationFrame);
        aq.root.updateWorldMatrix(true,true); camera.updateMatrixWorld();
        const p = rig.localToWorld(rig.position.clone().set(.009,.0045,0)).project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        const x=rect.left+(p.x+1)*rect.width/2, y=rect.top+(1-p.y)*rect.height/2;
        if (document.elementFromPoint(x,y)===renderer.domElement) return {x,y};
      } while (performance.now()<deadline);
      throw Error('The tank controls covered the chosen resident '+id);
    }, id);
    await page.mouse.click(coord.x,coord.y);
    await page.waitForFunction(id => aquarium.selected === id,id,{timeout:5000});
    check(await ref.isVisible() && await shutter.innerText()==='拍一张对照','Looking at a resident put away the original');
  }
  async function resetView(keyboard = false) {
    if (keyboard) await page.keyboard.press('r');
    else await page.locator('#reset').click();
    await page.waitForFunction(() => !aquarium.selected);
    check(await ref.isVisible(), 'The original disappeared in whole-tank observation');
    check(await shutter.isHidden(), 'The previous resident’s shutter stayed in whole-tank observation');
  }
  async function compare(id, relation) {
    await pickFromTank(id); await shutter.click();
    await viewer.locator('[data-peer]').waitFor();
    check(await viewer.locator('[data-related]').innerText()===relation,'Wrong relationship or display order for '+id);
    check(await viewer.locator('figure').first().getAttribute('data-peer')===original.id &&
      await viewer.locator('figure').first().locator('.tank-photo-words').innerText()===mark,'Wrong original or lost its note');
  }
  await page.locator('#welcome-dismiss').click(); await c('open').click(); await c('start').click(); await panel.waitFor({state:'hidden'});
  await act({type:'plan',motherId:'I1',fatherId:'I2',tankId:'main',size:2});
  const batch=(await state()).batches[0]; await jump(batch.hatchAt);
  const [subject,sibling]=(await state()).batches[0].children.map(child=>child.id);
  await c('open').click(); await c('tab-roster').click(); await c('roster').locator('[data-individual-id="'+subject+'"]').click();
  await c('focus').click(); await shutter.click(); check(await search.isHidden(),'Unkept frames offered a trip');
  await viewer.locator('.tank-photo-writing summary').click(); await control('caption').fill(mark); await control('keep').click();
  await viewer.waitFor({state:'hidden'}); const original=(await state()).tankPhotos[0];
  await jump(batch.adultAt); for(const id of [subject,sibling,'I1']) await act({type:'move',id,tankId:'breeding'});
  for(const id of [subject,sibling]) await act({type:'rename',id,name:'小落'});
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>window.aquarium?.ready);
  await openAlbum(original.id); await viewer.locator('.tank-photo-writing summary').click();
  await control('caption').fill('还在写'); await search.click(); await viewer.getByRole('status').filter({hasText:'留言草稿'}).waitFor();
  await control('cancel-caption').click();
  const saveKey='aquarium.three.creatures.v1';
  const saved = () => page.evaluate(key => localStorage.getItem(key),saveKey);
  const before = await saved();
  await page.evaluate(key=>{
    const write=Storage.prototype.setItem;
    window.restorePhotoTrip=()=>{Storage.prototype.setItem=write;delete window.restorePhotoTrip;};
    Storage.prototype.setItem=function(k,v){if(k===key)throw Error('找虾换缸写入失败');return write.call(this,k,v);};
  },saveKey);
  try {await search.click();await viewer.getByRole('status').filter({hasText:'找虾换缸写入失败'}).waitFor();
    check(await saved()===before && await room()==='main' && await ref.isHidden(),'Failed visit changed the save or attached a photo');
  } finally { await page.evaluate(()=>window.restorePhotoTrip()); }
  await search.press('Enter'); await viewer.waitFor({state:'hidden'}); await ref.waitFor();
  check(await room()==='breeding' && await selection()===null && await shutter.isHidden() && await ref.getAttribute('data-photo')===original.id,
    'Entering the new home revealed or selected the subject');
  check(await ref.locator('button').first().evaluate(el=>el===document.activeElement),'The carried photo did not receive keyboard focus');
  await page.setViewportSize({width:390,height:780}); await ref.locator('button').first().click();
  check((await viewer.locator('figcaption').innerText()).includes('幼虾') && (await viewer.locator('figcaption').innerText()).includes('我的造景缸'),
    'The old frame lost its original age or tank');
  await hidePhoto(); check(await selection()===null,'Enlarging the old frame selected a resident');
  await page.setViewportSize({width:1200,height:840});
  await compare(sibling,'这两只是同一窝的虾'); await hidePhoto(); await resetView();
  await compare('I1','第一张是孩子，第二张是它的母虾'); await hidePhoto(); await resetView(true);
  check((await state()).tankPhotos.length===1,'Trying two different shrimp wrote photos without confirmation');
  await compare(subject,'同一只虾的两次留影'); await control('keep').click(); await viewer.waitFor({state:'hidden'});
  const photos=(await state()).tankPhotos;
  check(photos.length===2 && photos[1].individualId===subject && photos[1].tankId==='breeding' && photos[0].jpeg===original.jpeg,'Saved the wrong resident or replaced the original');
  await resetView(); await ref.getByRole('button',{name:'收起旧照'}).click();
  check(await ref.isHidden() && await selection()===null,'Putting away the guide selected a shrimp');
  await openAlbum(original.id); await search.click(); await ref.waitFor();
  await act({type:'rest',id:subject}); await ref.waitFor({state:'hidden'});
  await openAlbum(original.id); check(await search.isHidden() && await control('retake').isHidden(),'An archived shrimp offered a visit to the tank');
  await hidePhoto(); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>window.aquarium?.ready);
  const restored=(await state()).tankPhotos;
  check(JSON.stringify(photos)===JSON.stringify(restored) && await ref.isHidden(),'Reload changed the photos or restored an old search');
  return {subject,sibling,firstTank:original.tankId,newTank:photos[1].tankId,manualPicks:[sibling,'I1',subject],imagesKept:restored.length,
    emptySelectionOnEntry:true,originalNote:original.caption.text,failedTripRetried:true,narrowScreen:true,restClearedReference:true};
}
