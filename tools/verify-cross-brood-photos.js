async page => {
  const check = (value, message) => { if (!value) throw Error(message); };
  const c = id => page.locator('#crystal-'+id);
  const panel = c('panel'), dialog = c('pair-photos'), journal = c('line-journal');
  const picker = dialog.locator('.crystal-brood-photo-picker'), group = picker.locator('select');
  const thumbnail = id => picker.locator('[data-brood-photo="'+id+'"]');
  const figures = dialog.locator('figure');
  const firstFigure = figures.nth(0), secondFigure = figures.nth(1);
  const action = value => page.evaluate(a => aquarium.game.crystalAction(a), value);
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const dataIds = () => figures.evaluateAll(items => items.map(item => item.dataset.individual || null));
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const relevant = s => [s.individuals,s.batches,s.cash,s.rngState,s.lineBooks];
  const room = () => page.evaluate(() => aquarium.game.data.BreedingRooms.activeId);
  const savedKey = 'aquarium.three.creatures.v1';
  const saved = () => page.evaluate(key => localStorage.getItem(key),savedKey);
  async function jump(at) {
    await page.clock.setFixedTime(new Date(at+200));
    await action({type:'advance'});
  }
  async function plan(motherId,fatherId,tankId,size) {
    await action({type:'plan',motherId,fatherId,tankId,size});
    return (await state()).batches.at(-1);
  }
  async function selectPair(batchId,id) {
    await group.selectOption(batchId);
    await thumbnail(id).click();
    await secondFigure.locator('img:not([hidden])').waitFor();
  }
  async function openFamily(id) {
    if (await panel.isHidden()) await c('open').click();
    await c('tab-roster').click();
    await c('roster-filter').selectOption('live');
    await c('roster').locator('[data-individual-id="'+id+'"]').click();
    if (!await c('family').evaluate(el=>el.open)) await c('family').locator('summary').first().click();
    await c('individual-brood-photos').click();
    await dialog.waitFor();
  }
  await page.locator('#welcome-dismiss').click();
  await c('open').click(); await c('start').click(); await panel.waitFor({state:'hidden'});
  const original = await page.evaluate(async () => {
    const game=aquarium.game, save=game.snapshot();
    save.session.Breeding.rngState=7;
    await game.restore(save);
    return game.snapshot();
  });

  const first = await plan('I4','I2','breeding',2);
  await jump(first.adultAt);
  const siblings = (await state()).batches[0].children;
  const mother = siblings.find(r=>r.sex==='female').id, uncle = siblings.find(r=>r.id!==mother).id;
  const second = await plan(mother,'I3','breeding',4);
  await jump(second.formedAt);
  await openFamily(uncle);
  check(same(await dataIds(),[uncle,null]),'The roster preselected another shrimp');
  const available = () => group.locator('option').evaluateAll(options=>options.map(o=>o.value));
  check(same(await available(),['',first.id,'stock']),'The photographs exposed an unhatched brood');
  await jump(second.hatchAt);
  await page.waitForFunction(id=>!!document.querySelector('.crystal-brood-photo-picker option[value="'+id+'"]'),second.id);
  const left = (await state()).batches[1].children.at(-1).id;
  await selectPair(second.id,left);
  check((await secondFigure.innerText()).includes('幼虾'),'A newly hatched individual was labelled adult');
  await page.keyboard.press('Escape');
  check(await c('individual-brood-photos').evaluate(el=>el===document.activeElement),'Closing the roster pair lost keyboard focus');

  await jump(second.adultAt);
  const third = await plan('I5','I7','main',2);
  await jump(third.adultAt);
  const thirdKid = (await state()).batches[2].children[0].id;
  for (const id of [left,uncle,thirdKid]) await action({type:'rename',id,name:'米粒'});
  await action({type:'observation',id:left,value:'尾巴前面有一道白'});
  await action({type:'observation',id:thirdKid,value:'想留它的背纹'});
  await action({type:'nameLineBook',founderId:'I4',previousTitle:null,title:'我的白带'});
  await c('tab-album').click();
  if (!await journal.evaluate(el=>el.open)) await journal.locator('summary').click();
  await journal.locator('[data-all]').click();
  const member = journal.locator('[data-line-member="'+left+'"]');
  while (!await member.isVisible() && await journal.locator('[data-next]').isEnabled()) await journal.locator('[data-next]').click();
  await member.click();
  check(await journal.locator('[data-prev]').isEnabled(),'The test never reached the next journal page');
  const before = relevant(await state());
  await c('line-brood-photos').click();
  check(same(await dataIds(),[left,null]),'The notebook supplied a partner');
  await group.selectOption(second.id);
  check(!await thumbnail(left).count(),'The first shrimp offered to compare with itself');
  await selectPair(first.id,uncle);
  await dialog.locator('[data-crop="back"]').click();
  await group.selectOption(third.id);
  check(same(await dataIds(),[left,uncle]),'Turning to another brood silently chose a shrimp');
  await thumbnail(thirdKid).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('#crystal-pair-photos[open] figure img')].every(im=>im.complete && im.naturalWidth===1152 && !im.hidden));
  const names = await dialog.locator('figcaption').allTextContents();
  check(names[0].includes('米粒 · 第 2 窝第 4 只') && names[1].includes('米粒 · 第 3 窝第 1 只'),'Namesakes lost their origin');
  check((await firstFigure.innerText()).includes('尾巴前面有一道白') && (await secondFigure.innerText()).includes('想留它的背纹'),'Notes were attached to the wrong individual');
  const widths=[];
  for (const viewport of [{width:390,height:800},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    check(await picker.evaluate(el=>el.scrollWidth<=el.clientWidth+1 && el.getBoundingClientRect().right<=innerWidth+1),'The picker overflows at '+viewport.width);
    widths.push(viewport.width);
  }
  await page.setViewportSize({width:1200,height:840});
  const oldRoom = await room();
  const target = oldRoom==='main' ? left : thirdKid;
  const visit = (target===left ? firstFigure : secondFigure).locator('[data-choose-photo]');
  const beforeTrip = await saved();
  await page.evaluate(key=>{
    const write=Storage.prototype.setItem;
    window.restoreBroodStorage=()=>{Storage.prototype.setItem=write;delete window.restoreBroodStorage;};
    Storage.prototype.setItem=function(k,v){if(k===key)throw Error('跨缸写入测试');return write.call(this,k,v);};
  },savedKey);
  try {
    await visit.click();
    await picker.getByRole('status').filter({hasText:'跨缸写入测试'}).waitFor();
    check(await saved()===beforeTrip && await room()===oldRoom && same(await dataIds(),[left,thirdKid]),'A failed trip altered the room, file, or chosen photos');
  } finally { await page.evaluate(()=>window.restoreBroodStorage()); }
  await visit.click(); await panel.waitFor({state:'hidden'});
  check(await room()!==oldRoom && await page.evaluate(()=>aquarium.selected)===target,'The game visited the wrong resident or tank');
  await c('inspect').filter({hasText:'返回这两只的近照'}).click(); await dialog.waitFor();
  check(same(await dataIds(),[left,thirdKid]) && await dialog.getAttribute('data-crop')==='back','The return trip lost the pair or crop');
  await page.waitForFunction(()=>[...document.querySelectorAll('.crystal-brood-photo-picker [data-brood-photo] img')].every(im=>im.complete && im.naturalWidth>0 && !im.hidden));
  await picker.locator('[data-continue]').click();
  check(same(await dataIds(),[thirdKid,null]) && await secondFigure.locator('img').isHidden() && (await secondFigure.innerText()).includes('等你挑另一只'),'An old photo remained on the empty side');
  await selectPair(first.id,uncle);
  check(same(await dataIds(),[thirdKid,uncle]) && await dialog.getAttribute('data-crop')==='back','Continuing switched the chosen shrimp or crop');
  check(same(relevant(await state()),before),'Studying the photos changed a family, mark or game balance');
  await action({type:'rest',id:uncle});
  await secondFigure.locator('figcaption').filter({hasText:'静养处'}).waitFor();
  check(await secondFigure.locator('[data-choose-photo]').isHidden(),'A resting shrimp offered a trip to the tank');
  await action({type:'recall',id:uncle,tankId:'breeding'}); await action({type:'sell',id:uncle});
  await secondFigure.locator('figcaption').filter({hasText:'已售档案'}).waitFor();
  check(await secondFigure.locator('[data-choose-photo]').isHidden(),'A sold shrimp offered a trip to the tank');
  await page.keyboard.press('Escape');
  check(await c('line-brood-photos').evaluate(el=>el===document.activeElement) && await member.getAttribute('aria-pressed')==='true','The journal lost its original page, member or keyboard focus');
  await c('line-brood-photos').click();
  await page.evaluate(save=>aquarium.game.restore(save),original);
  await dialog.waitFor({state:'hidden'});
  await openFamily('I4');
  check(same(await available(),['','stock']) && same(await dataIds(),['I4',null]),'Restoring another save retained the old brood or comparison');
  return {names,left,uncle,thirdKid,actualVisit:target,widths,hiddenUntilHatch:true,waitsForKeeper:true,
    visitRetry:true,returnCrop:'back',restAndSale:true,olderSave:true,breedingUnchanged:true};
}
