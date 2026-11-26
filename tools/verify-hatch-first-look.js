async (page, {screenshotPath} = {}) => {
  const c = id => page.locator('#crystal-' + id);
  const panel = c('panel'), notice = c('activity'), tray = c('brood-watch');
  const photos = tray.locator('[data-photos]'), roomButton = id => tray.locator('[data-room="' + id + '"]');
  const gallery = tray.locator('#crystal-watch-kids'), shutter = c('tank-shutter');
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const action = a => page.evaluate(a => aquarium.game.crystalAction(a), a);
  const snapshot = () => page.evaluate(() => aquarium.game.snapshot());
  const restore = s => page.evaluate(s => aquarium.game.restore(s), s);
  const room = () => page.evaluate(() => aquarium.game.data.BreedingRooms.activeId);
  const unread = id => page.evaluate(id => aquarium.game.data.BreedingRooms.unreadGrowth?.some(e => e.kind === 'batch' && e.id === id) || false, id);
  const savedPhotos = () => page.evaluate(() => (aquarium.game.data.Breeding.tankPhotos || []).map(p => [p.individualId, p.tankId]));
  const ready = () => page.waitForFunction(() => window.aquarium?.ready);
  async function failNextWrite(message) {
    await page.evaluate(message => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'aquarium.three.creatures.v1') {
          Storage.prototype.setItem = original;
          throw Error(message);
        }
        return original.call(this, key, value);
      };
    }, message);
  }
  async function enter() {
    await notice.press('Enter');
    await tray.waitFor();
    await page.waitForFunction(() => document.querySelector('#crystal-brood-watch [data-photos]')?.getAttribute('aria-expanded') === 'false');
    check(await gallery.isHidden() && await gallery.locator('img').count() === 0, 'Opening the tank created sibling portraits');
    check(await c('inspect').isHidden() && await shutter.isHidden(), 'An individual was selected before the player looked');
    check(await notice.isHidden(), 'The hatch invitation still covers the tank after it has been opened');
  }
  async function clickOnlyResident(id) {
    await page.setViewportSize({width:1200,height:840});
    await page.waitForFunction(id => aquarium.aq.animals.length === 1 && aquarium.aq.animals[0].id === id &&
      Math.abs(aquarium.camera.aspect - innerWidth/innerHeight) < .01, id);
    check(await notice.evaluate(el => {
      const r = el.getBoundingClientRect();
      const left = r.left + r.width/2, y = r.top + r.height/2;
      return [left, innerWidth-left].every(x => document.elementFromPoint(x,y) === aquarium.renderer.domElement);
    }), 'The invitation or the search controls still intercept clicks on the substrate');
    const point = await page.evaluate(async () => {
      const {aq, camera, renderer} = aquarium, rig = aq.animals[0].rig;
      const until = performance.now() + 8000;
      let obstruction;
      do {
        await new Promise(requestAnimationFrame);
        aq.root.updateWorldMatrix(true,true); camera.updateMatrixWorld();
        const p = rig.localToWorld(rig.position.clone().set(.009,.0045,0)).project(camera);
        const r = renderer.domElement.getBoundingClientRect();
        const x = r.left + (p.x+1)*r.width/2, y = r.top + (1-p.y)*r.height/2;
        const el = document.elementFromPoint(x,y);
        if (el === renderer.domElement) return {x,y};
        obstruction = (el?.closest('[id]')?.id || 'outside viewport') + ' at ' + Math.round(x) + ', ' + Math.round(y);
      } while (performance.now() < until);
      throw Error('Could not reach the live juvenile behind ' + obstruction);
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(id => aquarium.selected === id, id);
  }

  await ready(); await page.locator('#welcome-dismiss').click();
  await c('open').click(); await c('start').click(); await panel.waitFor({state:'hidden'});
  await c('open').click(); await c('tab-breed').click();
  await c('mother').selectOption('I4'); await c('father').selectOption('I2');
  await c('breeding-tank').selectOption('breeding'); await c('brood-size').selectOption('4');
  await c('plan').click();
  await page.waitForFunction(() => aquarium.game.data.Breeding.batches.length === 1 && !aquarium.game.busy);
  const batch = await page.evaluate(() => aquarium.game.data.Breeding.batches[0]);
  await panel.locator('.crystal-close').click();
  await page.clock.setFixedTime(new Date(batch.hatchAt + 1000)); await action({type:'advance'});
  const born = await snapshot(), kids = born.session.Breeding.batches[0].children.map(k => k.id);
  await page.setViewportSize({width:390,height:790});
  const invitation = await notice.innerText();
  check(kids.length === 4 && invitation.includes('去繁育缸找小虾'), 'Hatch invitation missed the actual destination');
  await failNextWrite('找小虾换缸写入测试'); await notice.click();
  await page.locator('#message').filter({hasText:'找小虾换缸写入测试'}).waitFor();
  check(await room() === 'main' && await unread(batch.id) && await tray.isHidden(), 'Failed trip consumed the message');
  await enter();
  const searchText = await tray.innerText();
  check(searchText.includes('繁育缸里有这窝的 4 只幼虾') && await room() === 'breeding', 'The player did not arrive beside the actual brood');
  check(await page.evaluate(ids => ids.every(id => aquarium.world.agentsById.has(id)) && !aquarium.selected, kids),
    'The neutral invitation did not lead to four physical juveniles');
  check(!(await unread(batch.id)) && !(await savedPhotos()).length, 'Looking in the tank made an unsolicited photo');
  if (screenshotPath) await c('at-tank').screenshot({path:screenshotPath});
  for (const size of [{width:390,height:790},{width:844,height:390}]) {
    await page.setViewportSize(size);
    check(await photos.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= -1 && r.right <= innerWidth+1 && r.top >= -1 && r.bottom <= innerHeight+1;
    }), 'Optional photos out of reach at ' + size.width);
  }
  await photos.press('Enter');
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('#crystal-watch-kids img')];
    return images.length === 4 && images.every(image => image.naturalWidth > 0);
  });
  const order = await gallery.locator('button').evaluateAll(els => els.map(el => el.dataset.watchChild));
  check(JSON.stringify(order) === JSON.stringify(kids), 'Optional photos lost the birth order');
  await gallery.locator('[data-watch-child="' + kids[1] + '"]').press('Enter');
  await page.waitForFunction(id => aquarium.selected === id && !document.querySelector('#crystal-brood-watch [data-photos]').disabled, kids[1]);
  await photos.press('Enter');
  check(await gallery.isHidden() && await page.evaluate(() => !aquarium.selected), 'Putting away photos left the tank following the previously selected photo');
  await photos.press('Escape'); await tray.waitFor({state:'hidden'});
  await page.reload({waitUntil:'domcontentloaded'}); await ready();
  check((await notice.innerText()).includes('去缸里找小虾'), 'Reload lost the route back to a hatched brood');
  await enter(); await photos.press('Escape');

  await restore(born); await action({type:'expand',tankId:'breeding-2'});
  await action({type:'move',id:kids[2],tankId:'breeding-2'});
  const split = await snapshot();
  await enter();
  check(await room() === 'main' && await unread(batch.id) && await roomButton('breeding').isVisible() &&
    await roomButton('breeding-2').isVisible(), 'Split litter picked a room or cleared the notification too early');
  await photos.press('Escape'); check(await unread(batch.id), 'Leaving before visiting marked a split brood read');
  await enter(); await failNextWrite('分缸重试测试'); await roomButton('breeding-2').click();
  await page.locator('#message').filter({hasText:'分缸重试测试'}).waitFor();
  check(await room() === 'main' && await unread(batch.id), 'Failed split-tank visit changed the receipt');
  await roomButton('breeding-2').press('Enter');
  await page.waitForFunction(id => aquarium.game.data.BreedingRooms.activeId === 'breeding-2' &&
    !aquarium.game.data.BreedingRooms.unreadGrowth?.some(e => e.id === id), batch.id);
  await clickOnlyResident(kids[2]);
  const observed = await tray.locator('[data-search] p').innerText();
  check(observed.includes('第 3') && await shutter.isVisible() && await gallery.isHidden(), 'The child physically tapped was not the one inspected');
  await shutter.click(); await c('photo-viewer').locator('[data-keep]').click(); await c('photo-viewer').waitFor({state:'hidden'});
  const photo = await savedPhotos();
  check(photo.length === 1 && photo[0][0] === kids[2] && photo[0][1] === 'breeding-2', 'Shutter saved the wrong resident or tank');
  await page.locator('#reset').click();
  await page.waitForFunction(() => !aquarium.selected && !document.querySelector('#crystal-brood-watch').hidden);
  check(await shutter.isHidden() && await gallery.isHidden() && (await tray.locator('[data-search] p').innerText()).includes('1 只幼虾'),
    'Returning to the whole tank lost the search or kept the last shrimp on screen');
  await page.reload({waitUntil:'domcontentloaded'}); await ready();
  check(JSON.stringify(await savedPhotos()) === JSON.stringify(photo) && !(await unread(batch.id)), 'Reload lost the photograph or reopened read mail');
  await restore(split); await enter();
  await c('hud').locator('[data-tank-id="breeding"]').click();
  await page.waitForFunction(id => aquarium.game.data.BreedingRooms.activeId === 'breeding' &&
    !aquarium.game.data.BreedingRooms.unreadGrowth?.some(e => e.id === id), batch.id);
  check(await tray.isVisible() && await gallery.isHidden(), 'Using the tank shelf abandoned the search');
  await restore(split); await enter(); await photos.press('Enter');
  check(!(await unread(batch.id)) && await room() === 'main' && await gallery.isVisible(), 'Voluntary photo viewing made a forced trip or lost the receipt');
  await restore(split); await enter(); await tray.locator('[data-read]').click(); await panel.waitFor();
  check(!(await unread(batch.id)) && await room() === 'main' && await tray.isHidden(), 'Reading the journal moved the player or left unread mail');
  return {invitation, searchText, visiblePortraitsOnArrival:0, rooms:['breeding','breeding-2'], birthOrder:order,
    observed, savedPhoto:photo, wholeTankReturn:true, reload:true, failedVisitRetried:true, splitReceipt:true, portableControls:true};
}
