async page => {
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const control = id => page.locator('#crystal-'+id);
  const viewer = control('photo-viewer'), panel = control('panel'), history = control('tank-photo-history');
  const action = cmd => page.evaluate(cmd => aquarium.game.crystalAction(cmd), cmd);
  const unread = () => page.evaluate(() => (aquarium.game.data.BreedingRooms.unreadGrowth || []).map(e => e.id));
  const selected = () => page.evaluate(() => aquarium.selected || null);
  const room = () => page.evaluate(() => aquarium.game.data.BreedingRooms.activeId);
  const notice = id => control('growth-messages').locator('[data-growth-id="'+id+'"]');
  const photoIds = () => page.evaluate(() => (aquarium.game.data.Breeding.tankPhotos || []).map(p => p.id));
  async function take() {
    await control('tank-shutter').click();
    await viewer.locator('[data-keep]').click();
    await viewer.waitFor({state:'hidden'});
    return (await photoIds()).at(-1);
  }
  async function displayedPhoto() {
    return viewer.locator('figure img').evaluate(async image => {
      await image.decode();
      return aquarium.game.data.Breeding.tankPhotos.find(p => image.src.endsWith(','+p.jpeg))?.id;
    });
  }
  async function failNextWrite(message) {
    await page.evaluate(message => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'aquarium.three.creatures.v1') {
          Storage.prototype.setItem = write;
          throw Error(message);
        }
        return write.call(this,key,value);
      };
    }, message);
  }
  await page.setViewportSize({width:390,height:750});
  await page.locator('#welcome-dismiss').click();
  await control('activity').click();
  await page.locator('.crystal-arrival input[value="5"]').check();
  await control('start').click(); await panel.waitFor({state:'hidden'});
  check(await selected()==='I6' && await history.isHidden(),'An unphotographed juvenile was given an old photo');
  await page.evaluate(()=>window.showDock('keep'));
  const [backup] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const withoutPhotos = fs.readFileSync(await backup.path());
  await page.evaluate(()=>window.showDock(''));
  const young = await take();
  const adultAt = await page.evaluate(() => aquarium.game.data.Breeding.individuals.find(r => r.id==='I6').adultAt);
  await action({type:'rename',id:'I6',name:'小墨'});
  await control('open').click(); await control('tab-roster').click();
  await control('roster').locator('[data-individual-id="I7"]').click(); await control('focus').click();
  check(await history.isHidden(),'The other shrimp inherited its namesake’s photo');
  const namesake = await take();
  await action({type:'move',id:'I6',tankId:'breeding'});
  await page.clock.setFixedTime(new Date(adultAt+2*86400000));
  await page.reload(); await page.waitForFunction(() => window.aquarium?.ready);
  check(await room()==='main' && !await selected() && await panel.isHidden() && (await unread()).length===2,
    'Offline growth interrupted the return or lost an individual event');
  await control('activity').click();
  const invitation = await notice('I6').innerText();
  check(invitation.includes('小墨') && invitation.includes('I6') && invitation.includes('繁育缸') && invitation.includes('去缸里看它'),
    'The event failed to distinguish the two namesakes or their destinations');
  await failNextWrite('模拟去繁育缸时保存失败');
  await notice('I6').click(); await control('feedback').filter({hasText:'模拟去繁育缸时保存失败'}).waitFor();
  check(await room()==='main' && (await unread()).length===2 && await notice('I6').isVisible(),'A failed trip consumed the invitation');
  await notice('I6').press('Enter'); await panel.waitFor({state:'hidden'});
  await page.waitForFunction(() => aquarium.selected==='I6' && !aquarium.game.data.BreedingRooms.unreadGrowth.some(e=>e.id==='I6'));
  check(await room()==='breeding' && (await unread()).join()==='I7','The successful trip cleared an unrelated event');
  check(await control('inspect').evaluate(el=>el===document.activeElement),'The keyboard did not arrive at the live animal');
  await history.click();
  const babyCaption = await viewer.locator('figcaption').innerText();
  check(await displayedPhoto()===young && babyCaption.includes('芽芽 · 幼虾 · 我的造景缸') && await viewer.locator('nav').isHidden(),
    'The earlier print lost its pixels, name, age or original room');
  await page.keyboard.press('Escape'); await viewer.waitFor({state:'hidden'});
  check(await history.evaluate(el=>el===document.activeElement) && await selected()==='I6','Closing the print lost the watched shrimp or keyboard focus');
  const grown = await take(), stored = await photoIds();
  await history.click(); await viewer.locator('[data-newer]').press('Enter');
  const adultCaption = await viewer.locator('figcaption').innerText();
  const fits = await viewer.evaluate(el => el.scrollWidth<=el.clientWidth && el.getBoundingClientRect().width<=innerWidth);
  check(await displayedPhoto()===grown && adultCaption.includes('小墨 · 成虾 · 繁育缸') && await viewer.locator('nav span').innerText()==='2 / 2' && fits,
    'Turning the page lost the adult or overflowed a phone');
  await viewer.locator('[data-older]').press('Enter');
  check(await displayedPhoto()===young && await viewer.locator('[data-remove]').isHidden() && await viewer.locator('[data-keep]').isHidden(),
    'Looking back changed the album or mixed in the namesake');
  await viewer.locator('[data-close]').click(); await viewer.waitFor({state:'hidden'});
  check((await photoIds()).join()===stored.join(),'Reading reordered or added prints');
  await action({type:'rest',id:'I7'});
  await control('open').click(); await control('growth-inbox').click();
  const restingNotice = await notice('I7').innerText();
  check(restingNotice.includes('静养处') && restingNotice.includes('看它的档案'),
    'The pending notice still offered to locate a resting shrimp in the main tank');
  await page.reload(); await page.waitForFunction(()=>window.aquarium?.ready);
  check((await control('activity').innerText()).includes('静养处 · 看它的档案'),'The single-event shortcut gave the wrong destination');
  await failNextWrite('模拟成长消息未读标记失败');
  await control('activity').click(); await control('record-photos').waitFor();
  check((await unread()).join()==='I7' && await control('roster-filter').inputValue()==='rest','A failed receipt lost the notification or the resting record');
  await control('record-photos').click();
  check(await displayedPhoto()===namesake,'The resting shrimp opened another individual’s print');
  await viewer.locator('[data-close]').click();
  await action({type:'recall',id:'I7',tankId:'main'});
  await action({type:'sell',id:'I7'});
  await panel.locator('.crystal-close').click(); await control('activity').click();
  check(!(await unread()).length && await control('roster-filter').inputValue()==='sold' && await room()==='breeding','The transferred shrimp did not open its own archive');
  await control('record-photos').click();
  check(await displayedPhoto()===namesake,'The transferred shrimp lost its genuine print');
  await page.reload(); await page.waitForFunction(()=>window.aquarium?.ready);
  check(!(await unread()).length && (await photoIds()).join()===stored.join(),'Read receipts or original photos failed to survive reload');
  await control('open').click(); await control('tab-roster').click();
  await control('roster').locator('[data-individual-id="I6"]').click(); await control('record-photos').click();
  await page.locator('#import').setInputFiles({name:'aquarium-three-progress.json',mimeType:'application/json',buffer:withoutPhotos});
  await page.waitForFunction(()=>!aquarium.game.data.Breeding.tankPhotos?.length && !aquarium.game.busy && !document.querySelector('#crystal-photo-viewer').open);
  check(await room()==='main' && await control('record-photos').isHidden(),'Restoring the same tank resurrected photos from its later progress');
  return {daysAfterMaturity:2, invitation, babyCaption, adultCaption, personalPrints:2, albumPrints:stored.length,
    crossRoomRetry:true, receiptRetry:true, sameName:true, restingAndTransferred:true, restoredWithoutPhotos:true, phoneFits:fits};
}
