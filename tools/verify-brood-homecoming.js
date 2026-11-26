async page => {
  const c = id => page.locator('#crystal-' + id);
  const panel = c('panel'), inbox = c('growth-dialog'), tray = c('brood-watch'), activity = c('activity');
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const act = a => page.evaluate(a => aquarium.game.crystalAction(a), a);
  const snapshot = () => page.evaluate(() => aquarium.game.snapshot());
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const room = () => page.evaluate(() => aquarium.game.data.BreedingRooms.activeId);
  const unread = () => page.evaluate(() => (aquarium.game.data.BreedingRooms.unreadGrowth || []).map(e => e.id));
  const restore = save => page.evaluate(s => aquarium.game.restore(s), save);
  const child = id => tray.locator('[data-watch-child="' + id + '"]');
  const ready = () => page.waitForFunction(() => window.aquarium?.ready);
  async function advance(at) {
    await page.clock.setFixedTime(new Date(at));
    await act({type:'advance'});
  }
  async function failWrite(reason) {
    await page.evaluate(reason => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'aquarium.three.creatures.v1') {
          Storage.prototype.setItem = write;
          throw Error(reason);
        }
        return write.call(this, key, value);
      };
    }, reason);
  }
  const atAnimal = (id, tank) => page.waitForFunction(([id,tank]) => aquarium.selected === id &&
    aquarium.game.data.BreedingRooms.activeId === tank && aquarium.world.agentsById.has(id), [id,tank]);
  async function fits(locator, width, height) {
    await page.setViewportSize({width,height});
    const ok = await locator.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return !!bounds.width && bounds.left >= -1 && bounds.right <= innerWidth+1 &&
        bounds.top >= -1 && bounds.bottom <= innerHeight+1 && el.scrollWidth <= el.clientWidth+1;
    });
    check(ok, 'Control not reachable at '+width+'x'+height);
  }

  await ready();
  await page.locator('#welcome-dismiss').click();
  await c('open').click(); await c('start').click(); await panel.waitFor({state:'hidden'});
  await c('open').click(); await c('tab-breed').click();
  await c('mother').selectOption('I4'); await c('father').selectOption('I2');
  await c('breeding-tank').selectOption('breeding'); await c('brood-size').selectOption('4');
  await c('plan').click();
  await page.waitForFunction(() => aquarium.game.data.Breeding.batches.length === 1 && !aquarium.game.busy);
  const planned = await snapshot(), batch = (await state()).batches[0];
  const message = c('growth-messages').locator('[data-growth-id="' + batch.id + '"]');
  const journal = c('growth-messages').locator('[data-growth-journal="' + batch.id + '"]');
  await panel.locator('.crystal-close').click();
  await advance(batch.formedAt+5);
  check((await activity.innerText()).includes('雪团抱卵了'), 'Berried mother missing from the single notice');
  await activity.click(); await atAnimal('I4','breeding');
  check(await panel.isHidden() && await tray.isHidden() && !(await unread()).includes(batch.id), 'Mother notice showed unborn children');
  await advance(batch.hatchAt+5);
  const kids = (await state()).batches[0].children.map(k => k.id);
  await activity.click(); await tray.waitFor();
  check(await tray.locator('[data-watch-child]').count()===0 && await tray.locator('[data-photos]').getAttribute('aria-expanded')==='false',
    'The hatch notice showed every portrait before the player chose to look');
  await tray.locator('[data-photos]').press('Enter');
  check(await tray.locator('[data-watch-child][aria-pressed="true"]').count() === 0, 'Hatching chose a favourite for the player');
  await child(kids[2]).press('Enter'); await atAnimal(kids[2],'breeding');
  await child(kids[2]).press('Escape'); await tray.waitFor({state:'hidden'});

  await page.clock.setFixedTime(new Date(batch.plannedAt)); await restore(planned);
  await page.clock.setFixedTime(new Date(batch.adultAt + 2*86400000));
  await page.reload({waitUntil:'domcontentloaded'}); await ready();
  const grown = await snapshot(), allNotices = await unread();
  check(await room() === 'main' && allNotices.length === 3 && await tray.isHidden() && await inbox.isHidden(), 'Returning forced a visit or lost a message');
  await activity.press('Enter'); await inbox.waitFor();
  const invitation = await message.innerText();
  check(await panel.isHidden() && invitation.includes('雪团的 4 只孩子长大了') && invitation.includes('去繁育缸看这一窝'), 'Inbox lost its destination or opened pairing');
  await fits(inbox,390,780); await fits(inbox,844,390);
  await page.keyboard.press('Escape'); await inbox.waitFor({state:'hidden'});
  check(same(await unread(),allNotices) && await activity.evaluate(el => document.activeElement===el), 'Closing the inbox consumed mail or lost focus');
  await activity.click(); await failWrite('测试：这次切缸保存失败');
  await message.click(); await c('feedback').filter({hasText:'这次切缸保存失败'}).waitFor();
  check(await room()==='main' && await inbox.isVisible() && same(await unread(),allNotices), 'Failed room switch consumed mail');
  await message.press('Enter'); await tray.waitFor(); await inbox.waitFor({state:'hidden'});
  check(await room()==='breeding' && await panel.isHidden() && await page.evaluate(()=>!aquarium.selected), 'Whole-brood visit picked an individual');
  check(await c('brood-watch-title').evaluate(el=>el===document.activeElement), 'Keyboard focus missed this brood');
  check(same(await tray.locator('[data-watch-child]').evaluateAll(els=>els.map(e=>e.dataset.watchChild)),kids), 'The brood was reordered');
  await page.waitForFunction(()=>[...document.querySelectorAll('#crystal-brood-watch [data-watch-child] img')].every(img=>img.naturalWidth>0));
  await fits(tray.locator('..'),390,780); await fits(tray.locator('..'),844,390);
  await child(kids[3]).click(); await atAnimal(kids[3],'breeding');
  check(same(await unread(),allNotices.filter(id=>id!==batch.id)), 'An unrelated growth event was marked read');
  await tray.locator('[data-read]').click(); await panel.waitFor();
  check(await page.evaluate(()=>document.activeElement?.dataset.broodLocate)===kids[3], 'The journal lost the child picked in the tank');
  await panel.locator('.crystal-close').click();

  await restore(grown);
  for (const id of kids.slice(0,2)) await act({type:'rename',id,name:'小河'});
  await act({type:'move',id:kids[0],tankId:'main'});
  await act({type:'rest',id:kids[2]}); await act({type:'sell',id:kids[3]});
  const split = await snapshot();
  await activity.click(); await inbox.waitFor();
  const splitInvitation = await message.innerText();
  await failWrite('测试：已读写入失败'); await message.click(); await tray.waitFor();
  check(await room()==='main' && (await unread()).includes(batch.id) && splitInvitation.includes('挑一只去缸里看'), 'Split brood forced a room choice or lost an unread receipt');
  const names = await tray.locator('[data-name]').allTextContents();
  check(names[0].includes('同窝第 1 只') && names[1].includes('同窝第 2 只'), 'Namesakes missing birth order');
  check(await child(kids[2]).isDisabled() && (await child(kids[2]).innerText()).includes('静养') &&
    await child(kids[3]).isDisabled() && (await child(kids[3]).innerText()).includes('转让'), 'Archived siblings were presented as live residents');
  await child(kids[1]).click(); await atAnimal(kids[1],'breeding');
  await child(kids[0]).click(); await atAnimal(kids[0],'main');
  await tray.locator('[data-close]').press('Enter');
  await c('open').click(); await c('growth-inbox').click(); await journal.click();
  await panel.locator('.crystal-review[open]').waitFor();
  check(!(await unread()).includes(batch.id), 'Reading the journal failed to retry the receipt');
  await panel.locator('.crystal-close').click();

  await restore(split); await act({type:'move',id:kids[1],tankId:'main'});
  await activity.click(); const movedInvitation=await message.innerText(); await message.click(); await tray.waitFor();
  check(movedInvitation.includes('去我的造景缸看这一窝') && await room()==='main', 'Routed the brood back to its birthplace after all current residents moved');
  await restore(split);
  check(await tray.isHidden(), 'Restoring another progress kept the previous family open');
  await act({type:'rest',id:kids[0]}); await act({type:'rest',id:kids[1]});
  await activity.click(); await inbox.waitFor();
  check(await journal.isHidden() && (await message.innerText()).includes('翻这窝手记'), 'A fully archived brood offered a live destination');
  await message.click(); await panel.locator('.crystal-review[open]').waitFor();
  check(await tray.isHidden() && await room()==='main', 'Archive opened an empty tank');
  await page.reload({waitUntil:'domcontentloaded'}); await ready();
  check(!(await unread()).includes(batch.id) && (await state()).batches[0].children.length===4, 'Reload lost the family or its receipt');
  return {invitation, splitInvitation, movedInvitation, selectedAtHatch:kids[2], selectedAsAdult:kids[3], birthOrder:kids, names,
    offlineDays:2, crossTankRetry:true, receiptRetry:true, archiveFallback:true, narrowAndLandscape:true};
}
