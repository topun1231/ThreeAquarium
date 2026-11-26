async page => {
  const c = id => page.locator('#crystal-'+id), panel = c('panel'), viewer = c('photo-viewer');
  const photo = key => viewer.locator('[data-'+key+']'), reference = c('photo-reference'), shutter = c('tank-shutter');
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const shots = async () => (await state()).tankPhotos ?? [];
  const action = command => page.evaluate(a => aquarium.game.crystalAction(a), command);
  const room = () => page.evaluate(() => aquarium.game.data.BreedingRooms.activeId);
  const selected = () => page.evaluate(() => aquarium.selected);
  const check = (condition, reason) => { if (!condition) throw Error(reason); };
  const note = '小时候在这块石头边拍的';
  const key = 'aquarium.three.creatures.v1';
  const savedProgress = () => page.evaluate(k=>localStorage.getItem(k),key);
  const blockSave = message => page.evaluate(({key,message})=>{
    const write = Storage.prototype.setItem;
    window.restoreRetakeStorage = () => { Storage.prototype.setItem=write; delete window.restoreRetakeStorage; };
    Storage.prototype.setItem = function(k,value){if(k===key)throw Error(message); return write.call(this,k,value);};
  },{key,message});
  async function jump(at) {
    await page.clock.setFixedTime(new Date(at+100)); await action({type:'advance'});
  }
  async function visit(id) {
    if (await panel.isHidden()) await c('open').click();
    await c('tab-roster').click();
    await c('roster').locator('[data-individual-id="'+id+'"]').click();
    await c('focus').click(); await shutter.waitFor();
  }
  async function openSaved(id) {
    if (await panel.isHidden()) await c('open').click();
    await c('tab-album').click();
    await c('tank-photos').locator('[data-photo="'+id+'"]').click(); await viewer.waitFor();
  }
  async function carry() {
    await photo('retake').click(); await viewer.waitFor({state:'hidden'}); await reference.waitFor();
  }
  async function keep() {
    await photo('keep').click(); await viewer.waitFor({state:'hidden'}); return (await shots()).at(-1);
  }
  async function compareWith(id) {
    await shutter.click();
    const peer = viewer.locator('figure[data-peer="'+id+'"]');
    await peer.waitFor();
    check(await viewer.locator('.tank-photo-print canvas').isVisible() &&
      await viewer.locator('.tank-photo-chooser').isHidden() && await photo('keep').isVisible() &&
      await viewer.locator('.tank-photo-spread figure').first().getAttribute('data-peer')===id,
    'The shutter did not open the current frame beside the chosen original');
    return peer;
  }

  await page.locator('#welcome-dismiss').click(); await c('open').click(); await c('start').click();
  await panel.waitFor({state:'hidden'});
  await action({type:'plan',motherId:'I1',fatherId:'I2',tankId:'breeding',size:2});
  const batch=(await state()).batches[0]; await jump(batch.hatchAt);
  const [sibling,subject]=(await state()).batches[0].children.map(r=>r.id);
  await visit(subject);
  const beforePhotos=await page.evaluate(()=>aquarium.game.snapshot());
  await shutter.click(); await viewer.locator('.tank-photo-writing summary').click();
  await photo('caption').fill(note); const original=await keep();
  await jump(batch.adultAt+86400000);
  await action({type:'move',id:subject,tankId:'main'});
  for (const id of [subject,sibling]) await action({type:'rename',id,name:'阿栗'});
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>window.aquarium?.ready);
  check(await room()==='breeding','Expected to revisit from a different tank');
  await openSaved(original.id);
  await viewer.locator('.tank-photo-writing summary').click(); await photo('caption').fill('还想补一句');
  await photo('retake').click(); await viewer.getByRole('status').filter({hasText:'留言草稿'}).waitFor();
  check(await room()==='breeding' && await photo('caption').inputValue()==='还想补一句','Framing discarded a draft or switched tanks first');
  await photo('cancel-caption').click();
  const savedGame=await savedProgress();
  await blockSave('取景换缸写入测试');
  try {
    await photo('retake').click(); await viewer.getByRole('status').filter({hasText:'取景换缸写入测试'}).waitFor();
    check(await reference.isHidden() && await room()==='breeding' && await savedProgress()===savedGame,
      'Failed cross-tank visit moved a resident, attached a reference or changed the save');
  } finally { await page.evaluate(()=>window.restoreRetakeStorage()); }
  await carry();
  check(await room()==='main' && await selected()===subject && (await shots()).length===1 &&
    await reference.getAttribute('data-photo')===original.id && (await reference.innerText()).includes(note),
    'Could not reunite a single old photo with the same renamed shrimp in its new home');
  await reference.locator('button').first().click(); await viewer.waitFor();
  check((await viewer.locator('figcaption').innerText()).includes('幼虾') && await viewer.locator('.tank-photo-words').innerText()===note,'Enlarging the guide changed the old photo');
  await page.keyboard.press('Escape'); await viewer.waitFor({state:'hidden'});
  await reference.getByRole('button',{name:'收起旧照'}).click();
  check(await shutter.innerText()==='拍照' && await shutter.evaluate(el=>el===document.activeElement),'Putting a photo away did not restore the normal shutter');

  await c('tank-photo-history').click(); await carry();
  await page.setViewportSize({width:390,height:780});
  const peer=await compareWith(original.id);
  const captions=await viewer.locator('figcaption').allTextContents();
  check(captions[0].includes(original.name+' · 幼虾') && captions[0].includes('繁育缸') &&
    captions[1].includes('阿栗 · 成虾') && captions[1].includes('我的造景缸') &&
    (await peer.locator('img').getAttribute('src')).endsWith(original.jpeg) && await peer.locator('.tank-photo-words').innerText()===note &&
    (await shots()).length===1,'The two pictures do not show their actual ages, tanks and original words');
  check(await viewer.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Photo comparison overflows a narrow screen');
  await viewer.locator('.tank-photo-spread').screenshot({path:'output/playwright/keeper-retake-pair.png'});
  const beforeKeep=await savedProgress();
  await blockSave('对照留影写入测试');
  try {
    await photo('keep').click(); await viewer.getByRole('status').filter({hasText:'对照留影写入测试'}).waitFor();
    check(await peer.isVisible() && await viewer.locator('.tank-photo-print canvas').isVisible() &&
      (await shots()).length===1 && await savedProgress()===beforeKeep,'Failed save lost a frame or touched the saved album');
  } finally { await page.evaluate(()=>window.restoreRetakeStorage()); }
  const adult=await keep();
  check(adult.individualId===subject && adult.tankId==='main' && adult.name==='阿栗' && adult.jpeg!==original.jpeg && !adult.caption,
    'Keeping the new frame copied the old image or caption');

  await page.setViewportSize({width:1200,height:840});
  await c('tank-photo-history').click(); await viewer.locator('.tank-photo-writing summary').click();
  await photo('caption').fill('这句还在改'); await photo('newer').click(); await photo('retake').click();
  await viewer.getByRole('status').filter({hasText:'第 1 张留影还有留言草稿'}).waitFor();
  await photo('older').click(); check(await photo('caption').inputValue()==='这句还在改','Retaking from another page discarded an earlier draft');
  await photo('cancel-caption').click(); await photo('close').click(); await viewer.waitFor({state:'hidden'});
  await openSaved(original.id); await carry(); await visit(sibling);
  check(await selected()===sibling && await reference.isHidden() && await shutter.innerText()==='拍照','A namesake kept the previous shrimp’s reference');
  for (let i=0;i<2;i++) {await shutter.click(); await keep();}
  const full=await shots(); await openSaved(original.id); await carry();
  await page.setViewportSize({width:844,height:390}); await compareWith(original.id);
  check(await photo('replacement').isVisible() && await photo('keep').isDisabled(),'Comparison hid the full album or enabled an unconfirmed replacement');
  await page.keyboard.press('Escape');
  check(await photo('replacement').locator('select').inputValue()==='' && await photo('keep').isDisabled(),'A full album automatically chose a photo to overwrite');
  await photo('close').click(); await viewer.waitFor({state:'hidden'});
  check(JSON.stringify(full)===JSON.stringify(await shots()),'Discarding the retake changed a full album');
  await action({type:'rest',id:subject}); await openSaved(original.id);
  check(await photo('retake').isHidden() && (await photo('visit').innerText()).includes('静养'),'Resting shrimp offered a live photo');
  await photo('close').click(); await viewer.waitFor({state:'hidden'});
  await action({type:'recall',id:subject,tankId:'main'}); await action({type:'sell',id:subject}); await openSaved(original.id);
  check(await photo('retake').isHidden() && (await photo('visit').innerText()).includes('已转让'),'An archived shrimp offered a live photo');
  await photo('close').click(); await viewer.waitFor({state:'hidden'});
  await openSaved(full.at(-1).id); await carry();
  await page.evaluate(snapshot=>aquarium.game.restore(snapshot),beforePhotos);
  await reference.waitFor({state:'hidden'});
  check(!(await shots()).length,'Restoring the older progress resurrected an unrelated photo');
  return {subject,sibling,oldTank:original.tankId,newTank:adult.tankId,captions,albumSizeBeforeDiscard:full.length,
    originalIntact:true,manuallyFramed:true,draftRecovered:true,failedCrossTankRetried:true,failedPhotoSaveRetried:true,namesakesSeparated:true,archived:true,restoreCleared:true};
}
