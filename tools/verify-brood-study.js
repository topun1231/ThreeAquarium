async page => {
  const check = (value, reason) => { if (!value) throw Error(reason); };
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const control = (p, id) => p.locator('#crystal-' + id);
  const read = p => p.evaluate(() => aquarium.game.data.Breeding);
  const act = (p, action) => p.evaluate(a => aquarium.game.crystalAction(a), action);
  const record = (p, id) => control(p,'batches').locator('[data-batch-id="' + id + '"]');
  const view = p => control(p,'sibling-view');
  const pick = (p, id) => view(p).locator('[data-sibling-id="' + id + '"]');
  const keep = p => view(p).locator('[data-study-keep]');
  const selectTime = (p, value) => view(p).locator('[data-study-time="' + value + '"]');
  const labels = p => view(p).locator('figcaption button').allTextContents();
  const selected = p => view(p).locator('.sibling-choices [aria-pressed="true"]').count();
  const failWrite = (p, reason) => p.evaluate(reason => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'aquarium.three.creatures.v1') {
        Storage.prototype.setItem = write;
        throw Error(reason);
      }
      return write.call(this,key,value);
    };
  }, reason);
  async function images(p) {
    await p.waitForFunction(() => {
      const spread = document.querySelector('#crystal-sibling-view[open] .sibling-spread');
      const images = [...spread?.querySelectorAll('figure img') || []];
      return spread?.getAttribute('aria-busy') === 'false' && images.length === 2 &&
        images.every(im => !im.hidden && im.complete && im.naturalWidth === 1152);
    });
    return view(p).locator('figure img').evaluateAll(images => Promise.all(images.map(async image => {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(image.src));
      return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
    })));
  }
  async function journal(p) {
    if (await control(p,'panel').isHidden()) await control(p,'open').click();
    await control(p,'tab-breed').click();
  }
  await page.locator('#welcome-dismiss').click(); await control(page,'open').click(); await control(page,'start').click();
  await control(page,'panel').waitFor({state:'hidden'});
  await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())));
  await page.evaluate(async () => {
    const game=aquarium.game, snapshot=game.snapshot();snapshot.session.Breeding.rngState=7;await game.restore(snapshot);
  });
  const notes=['这窝想看头上一点红','还想等白带变清楚'];
  await act(page,{type:'plan',motherId:'I4',fatherId:'I2',tankId:'breeding',size:4,intent:notes[0]});
  await act(page,{type:'plan',motherId:'I1',fatherId:'I3',tankId:'main',size:2,intent:notes[1]});
  const [batch,other]=(await read(page)).batches;
  const at=batch.hatchAt+1000;
  await page.clock.setFixedTime(new Date(at));await act(page,{type:'advance'});await journal(page);
  const ids=(await read(page)).batches[0].children.map(r=>r.id), pair=ids.slice(2);
  await record(page,batch.id).locator('.crystal-sibling-open').click();
  check(await selected(page)===0 && await keep(page).isHidden(),'Looking at a brood preselected siblings');
  await pick(page,pair[0]).click();check(await keep(page).isHidden(),'A single shrimp offered to save a pair');
  await pick(page,pair[1]).click();await view(page).locator('[data-crop=head]').click();
  const young=await images(page), names=await labels(page);
  const before=await read(page);
  await failWrite(page,'模拟手记保存失败');await keep(page).click();
  await view(page).getByText(/模拟手记保存失败/).waitFor();
  check(equal(await read(page),before) && equal(await labels(page),names),'Failed record write changed the selected siblings or breeding state');
  await keep(page).press('Enter');await page.waitForFunction(()=>!!aquarium.game.data.Breeding.batches[0].siblingStudy);
  const stored=(await read(page)).batches[0].siblingStudy;
  check(equal(stored,{ids:pair,at,crop:'head'}),'Stored time, crop or ids differ from the chosen photos');
  check((await read(page)).batches[1].siblingStudy===undefined,'Marking this pair changed its neighbour');
  const origin=(await page.context().storageState()).origins.find(o=>o.origin===new URL(page.url()).origin);
  const durable={...origin,localStorage:origin.localStorage.filter(item=>item.name==='aquarium.three.creatures.v1')};
  check(durable.localStorage.length===1,'Expected a standalone game save');
  await page.clock.setFixedTime(new Date(Math.floor((batch.hatchAt+batch.adultAt)/2)));
  await view(page).locator('[data-crop=head]').click();
  const middle=await images(page);
  check(middle.every((value,i)=>value!==young[i]),'Watching the open brood between stage events kept the hatchling appearance');
  await selectTime(page,'kept').click();check(equal(await images(page),young),'Mid-growth comparison lost the hatchling photos');
  check(equal((await read(page)).batches[0].siblingStudy,stored),'Reading changed the observation time');
  await view(page).locator('[data-close]').click();
  const context=await page.context().browser().newContext({hasTouch:true,viewport:{width:390,height:750},storageState:{cookies:[],origins:[durable]}});
  try {
    const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.clock.setFixedTime(new Date(at+3*86400000));await p.goto(page.url());
    await p.waitForFunction(()=>window.aquarium?.ready && aquarium.game.data?.Breeding?.batches.every(b=>b.status==='complete'));
    const welcome=p.locator('#welcome-dismiss');if(await welcome.isVisible())await welcome.click();
    await journal(p);
    const inbox=control(p,'growth-messages'), message=id=>inbox.locator('[data-growth-id="'+id+'"]');
    const firstMessage=await message(batch.id).innerText(), secondMessage=await message(other.id).innerText();
    check(firstMessage.includes(notes[0]) && !firstMessage.includes(notes[1]) && secondMessage.includes(notes[1]),'Overdue events lost or mixed the breeder’s notes');
    check(await inbox.locator('[data-growth-study="'+other.id+'"]').isHidden(),'A brood with no recorded comparison offered a pair');
    await failWrite(p,'模拟未读标记写入失败');await inbox.locator('[data-growth-study="'+batch.id+'"]').tap();
    await view(p).waitFor({state:'visible'});const adult=await images(p);
    check(!equal(adult,young) && adult.every((value,i)=>value!==young[i]) && await selectTime(p,'now').getAttribute('aria-pressed')==='true','Returning showed juvenile photos as current');
    check(equal(await labels(p),names) && await view(p).getAttribute('data-crop')==='head','Opening the event lost the order or crop');
    await view(p).locator('[data-close]').click();
    check(await message(batch.id).isVisible() && await message(other.id).isVisible(),'Failed to save read status but hid an unread event');
    await inbox.locator('[data-growth-study="'+batch.id+'"]').click();
    await selectTime(p,'kept').press('Enter');check(equal(await images(p),young),'Reconstructed juvenile photos differ from the original game view');
    const widthOfPrints=()=>view(p).locator('figure img').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().width));
    await view(p).locator('[data-crop="whole"]').click();
    const keptWidths=await widthOfPrints();
    await selectTime(p,'now').click();await images(p);
    const grownWidths=await widthOfPrints();
    check(keptWidths.every((width,i)=>Math.abs(width/grownWidths[i]-.45)<.01),'Returning to the two remembered siblings lost their original size');
    await selectTime(p,'kept').click();await view(p).locator('[data-crop="head"]').click();await images(p);
    const fits=await view(p).evaluate(el=>el.scrollWidth<=el.clientWidth+1 && [...el.querySelectorAll('.sibling-study button')].filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().height>=44));
    check(fits,'Mobile study buttons overflow or are too small');
    await view(p).screenshot({path:'output/playwright/brood-study-return.png',animations:'disabled'});
    await view(p).locator('[data-sibling-visit="'+pair[1]+'"]').tap();
    await control(p,'panel').waitFor({state:'hidden'});
    check(await p.evaluate(()=>aquarium.selected)===pair[1] && await p.evaluate(()=>aquarium.game.data.BreedingRooms.activeId)==='breeding','Tank visit found a different shrimp or room');
    await control(p,'inspect').click();await view(p).waitFor({state:'visible'});
    check(await selectTime(p,'kept').getAttribute('aria-pressed')==='true' && equal(await images(p),young) && await view(p).getAttribute('data-crop')==='head','Tank visit lost the historical view');
    await selectTime(p,'now').click();check(equal(await images(p),adult),'Switching back did not return the grown portraits');
    await view(p).locator('[data-close]').click();
    check(await message(batch.id).count()===0 && await message(other.id).isVisible(),'Reading one brood cleared a different event');
    const row=record(p,batch.id);
    await row.locator('.crystal-sibling-open').click();
    check(await selected(p)===0 && await view(p).getAttribute('data-crop')==='whole','Ordinary entry made an unsolicited choice');
    await pick(p,ids[1]).tap();await pick(p,ids[0]).tap();await view(p).locator('[data-crop=back]').tap();await images(p);
    await keep(p).tap();await view(p).locator('[data-cancel]').tap();
    check(equal((await read(p)).batches[0].siblingStudy,stored),'Cancelling replacement discarded the original');
    await keep(p).tap();await view(p).locator('[data-confirm]').tap();
    await p.waitForFunction(id=>aquarium.game.data.Breeding.batches[0].siblingStudy.ids[0]===id,ids[1]);
    const replacement=(await read(p)).batches[0].siblingStudy;
    await view(p).locator('[data-close]').click();await row.locator('.crystal-sibling-study').tap();
    check(replacement.ids[1]===ids[0] && replacement.crop==='back' && await view(p).getAttribute('data-crop')==='back' &&
      await selected(p)===2 && await view(p).locator('[data-study-times]').isHidden(),'Explicit adult replacement did not round-trip');
    check(!errors.length,errors.join('\n'));
    return {broods:2,returnAfterDays:3,original:stored,names,adultEvent:firstMessage,otherEvent:secondMessage,
      youngPhotos:young,middlePhotos:middle,adultPhotos:adult,exactJuvenileAfterDeviceChange:true,exactAdultAfterVisit:true,
      independentUnread:true,retryAfterFailure:true,mobile:fits,replaced:replacement};
  } finally {await context.close();}
}
