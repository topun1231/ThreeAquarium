async (page, screenshotPath) => {
  const c = id => page.locator('#crystal-' + id);
  const modal = c('pair-photos'), roster = c('roster'), panel = c('panel');
  const bookPhoto = c('roster-portrait'), tankPhoto = c('tank-portrait');
  const close = modal.locator('[data-close]'), visit = modal.locator('[data-choose-photo]');
  const check = (pass, message) => { if (!pass) throw Error(message); };
  const action = value => page.evaluate(value => aquarium.game.crystalAction(value), value);
  const ledger = () => page.evaluate(() => JSON.stringify(aquarium.game.data.Breeding));
  const pick = id => roster.locator('[data-individual-id="' + id + '"]').click();
  const crop = view => modal.locator('button[data-crop="' + view + '"]').click();
  async function plate(id, view, width = 1152) {
    await page.waitForFunction(([id, view, width]) => {
      const dialog = document.querySelector('#crystal-pair-photos[open][data-single]');
      const figures = dialog?.querySelectorAll('figure'), img = figures?.[0]?.querySelector('img');
      return dialog?.dataset.crop === view && figures.length === 1 && figures[0].dataset.individual === id &&
        !img.hidden && img.complete && img.naturalWidth === width;
    }, [id, view, width]);
    return modal.locator('figure img').evaluate(async img => {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(img.src));
      return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,'0')).join('');
    });
  }
  await page.locator('#welcome-dismiss').click(); await c('open').click(); await c('start').click();
  await panel.waitFor({state:'hidden'});
  await page.clock.setFixedTime(new Date(await page.evaluate(() => aquarium.game.data.Breeding.now + 100)));
  await action({type:'observation', id:'I5', value:'想看它背上这块黑斑。'});
  await c('open').click(); await c('tab-roster').click(); await pick('I5');
  const before = await ledger();
  await bookPhoto.focus(); await page.keyboard.press('Enter'); const side = await plate('I5','whole');
  await crop('back'); const blackBack = await plate('I5','back');
  check(side !== blackBack && (await modal.innerText()).includes('想看它背上这块黑斑。'), 'The single portrait lost the back marking or personal note');
  check(await modal.locator('h2').innerText() === '乌梅的近照', 'The founder is not identified');
  if (screenshotPath) await modal.screenshot({path:screenshotPath,animations:'disabled'});
  await visit.click(); await panel.waitFor({state:'hidden'});
  await tankPhoto.click(); check(await plate('I5','back') === blackBack, 'The tank opened a different photo from the book');
  check(await visit.isHidden() && await page.evaluate(() => aquarium.selected) === 'I5', 'Looking at a resident changed the selected shrimp');
  await crop('head'); await plate('I5','head'); await page.keyboard.press('Escape');
  check(await tankPhoto.evaluate(el => document.activeElement === el) && await panel.isHidden(), 'Escape lost the tank or photo focus');
  await page.waitForFunction(() => document.querySelector('#crystal-tank-portrait').dataset.crop === 'head');
  check(await ledger() === before, 'Browsing the founder changed the breeding ledger');

  // Two identically named founders live in different tanks. A failed trip keeps the chosen record available.
  await action({type:'move',id:'I3',tankId:'breeding'}); await action({type:'rename',id:'I3',name:'乌梅'});
  await c('inspect').click(); await pick('I3'); await bookPhoto.click(); await plate('I3','whole');
  check((await modal.locator('h2').innerText()).includes('I3') && !(await modal.innerText()).includes('这块黑斑'), 'Namesakes shared their note or name tag');
  await crop('back'); const redBack = await plate('I3','back'); check(redBack !== blackBack, 'Two namesakes shared a picture');
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    window.restorePortraitWrite = () => { Storage.prototype.setItem = write; delete window.restorePortraitWrite; };
    Storage.prototype.setItem = function(key, value) {
      if (key === 'aquarium.three.creatures.v1') throw Error('模拟近照换缸保存失败');
      return write.call(this,key,value);
    };
  });
  try {
    await visit.click(); await page.waitForFunction(() => document.querySelector('#crystal-feedback').textContent.includes('模拟近照换缸保存失败'));
    check(await page.evaluate(() => aquarium.game.data.BreedingRooms.activeId) === 'main', 'A failed trip changed rooms');
  } finally { await page.evaluate(() => window.restorePortraitWrite()); }
  await bookPhoto.click(); check(await plate('I3','back') === redBack, 'Retry lost the chosen shrimp or crop');
  await visit.click(); await panel.waitFor({state:'hidden'}); await tankPhoto.click();
  check(await plate('I3','back') === redBack && await page.evaluate(() => aquarium.selected === 'I3' && aquarium.game.data.BreedingRooms.activeId === 'breeding'), 'Wrong resident after the room change');
  await page.setViewportSize({width:390,height:800});
  check(await modal.evaluate(el => {
    const r=el.getBoundingClientRect(), plate=el.querySelector('.sibling-print').getBoundingClientRect();
    return r.left>=0 && r.right<=innerWidth && el.scrollWidth<=el.clientWidth+1 && plate.width>=300;
  }), 'The single photo failed to use the width of a narrow screen');
  await close.click();

  await action({type:'rest',id:'I5'}); await page.reload(); await page.waitForFunction(() => window.aquarium?.ready);
  await c('open').click(); await c('tab-roster').click(); await c('roster-filter').selectOption('rest'); await pick('I5');
  await bookPhoto.click(); await crop('back');
  check(await plate('I5','back') === blackBack && (await modal.locator('figcaption').innerText()).includes('静养') && await visit.isHidden(), 'A resting shrimp lost its photo or offered a trip to an empty spot');
  await page.keyboard.press('Escape'); check(await bookPhoto.evaluate(el => document.activeElement === el), 'The book lost keyboard focus');
  await action({type:'protect',id:'I3',value:false}); await action({type:'sell',id:'I3'});
  await c('roster-filter').selectOption('sold'); await pick('I3'); await bookPhoto.click(); await crop('back');
  check(await plate('I3','back') === redBack && (await modal.locator('figcaption').innerText()).includes('已转让') && await visit.isHidden(), 'The transferred namesake lost its own photograph or offered a trip to the tank');
  return {founder:'I5', namesake:'I3', samePhotoAtTank:true, differentDorsalPhotos:true, failedTripRetried:true,
    narrowScreen:390, restPhotoAfterReload:true, transferredNamesakePhoto:true, observationChangedLedger:false};
}
