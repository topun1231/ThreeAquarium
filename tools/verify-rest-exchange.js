// The full case uses the collector save from verify-brood-space (globalOnly). The local case starts fresh.
async (page, {local=false}={}) => {
  const c = id => page.locator('#crystal-'+id);
  const dialog = c('rest-exchange'), confirm = c('confirm-exchange');
  const row = id => dialog.locator('[data-resident="'+id+'"]');
  const pick = id => row(id).getByRole('radio').check();
  const check = (ok,message) => { if (!ok) throw new Error(message); };
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const act = action => page.evaluate(action => aquarium.game.crystalAction(action), action);
  const saveKey = 'aquarium.three.creatures.v1';
  const stored = () => page.evaluate(key => localStorage.getItem(key),saveKey);
  const location = (s,id) => s.individuals.find(r => r.id === id).tank;
  const details = async control => {
    const group = control.locator('xpath=ancestor::details[1]');
    if (!await group.evaluate(el => el.open)) await group.locator(':scope > summary').click();
  };
  const roster = async (filter,id) => {
    if (await c('panel').isHidden()) await c('open').click();
    await c('tab-roster').click();
    await c('roster-filter').selectOption(filter);
    await c('roster').locator('[data-individual-id="'+id+'"]').click();
  };
  const expectedMove = (before,after,incoming,outgoing) => {
    const expected=structuredClone(before);
    expected.individuals.find(r=>r.id===incoming).tank='main';
    expected.individuals.find(r=>r.id===outgoing).tank='rest';
    expected.now=after.now;
    check(JSON.stringify(after)===JSON.stringify(expected),'Exchange changed more than the two designated residents');
  };
  const physical = () => page.evaluate(() => aquarium.world.agents.map(a=>a.data.CreatureId));
  const openReturn = async () => {
    await c('move-tank').selectOption('main');
    await c('move').click();
    await dialog.waitFor();
    check(await confirm.isDisabled() && await dialog.locator('input:checked').count()===0,'Choice was filled in for the player');
  };
  if (local) {
    await page.locator('#welcome-dismiss').click();await c('activity').click();await c('start').click();
    await c('panel').waitFor({state:'hidden'});
    await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())));
    await act({type:'rest',id:'I1'});await roster('rest','I1');await details(c('move-tank'));
    await c('move-tank').selectOption('main');
    check(!await c('move').getAttribute('aria-haspopup'),'Free seat offered a redundant exchange');
    await c('move').click();await page.waitForFunction(()=>aquarium.game.data.Breeding.individuals.find(r=>r.id==='I1').tank==='main');
    await act({type:'buy',productId:'basic-male',tankId:'main'});
    await act({type:'buy',productId:'basic-female',tankId:'main'});
    await act({type:'rest',id:'I1'});await act({type:'plan',motherId:'I4',fatherId:'I2',tankId:'main',size:2});
    await roster('rest','I1');await details(c('move-tank'));await openReturn();
    for(const id of ['I2','I4','I6','I7'])check(!await row(id).count(),'Offered a parent or juvenile');
    await pick('I3');await act({type:'move',id:'I3',tankId:'breeding'});
    await dialog.waitFor({state:'hidden'});
    const changed=await state();
    check(location(changed,'I1')==='rest' && location(changed,'I3')==='breeding' && !await c('move').getAttribute('aria-haspopup'),'Stale selection survived a newly open seat');
    await c('move').click();await page.waitForFunction(()=>aquarium.game.data.Breeding.individuals.find(r=>r.id==='I1').tank==='main');
    const loaded=await state();
    check(loaded.batches[0].size===2 && loaded.batches[0].status==='planned','Recall consumed a reservation');
    return {directRecall:true,localReservations:2,excludedParentsAndYoung:true,staleChoiceDismissed:true};
  }
  const snapshot=await state();
  const old=snapshot.individuals.find(r=>r.tank==='rest' && !r.legacy).id;
  const brood=snapshot.batches.find(b=>b.status==='complete' && !b.rookieEntry &&
    b.children.filter(k=>location(snapshot,k.id)==='main').length>=2);
  const [next,other]=brood.children.filter(k=>location(snapshot,k.id)==='main').slice(0,2).map(k=>k.id);
  const note='我喜欢它背上细细的那一道';
  for(const [id,value] of [[next,note],[other,'尾巴的花纹很清楚']]){
    await act({type:'rename',id,name:'小潮'});await act({type:'observation',id,value});
  }
  await act({type:'protect',id:next,value:true});
  await page.setViewportSize({width:390,height:750});
  await roster('rest',old);await details(c('move-tank'));
  const before=await state();
  const destinations=await c('move-tank').locator('option').evaluateAll(nodes=>nodes.map(o=>o.value));
  for(const tankId of destinations) {
    await c('move-tank').selectOption(tankId);
    check(await c('move').isEnabled() && await c('move').getAttribute('aria-haspopup')==='dialog','No working full-tank return to '+tankId);
  }
  const beforeCancel=await stored();
  await openReturn();
  check((await row(next).innerText()).includes(note) && (await row(next).innerText()).includes('已收藏'),'Lost observation or protection');
  check(await row(next).locator('strong').innerText()!==await row(other).locator('strong').innerText(),'Same-name cards indistinguishable');
  await row(next).scrollIntoViewIfNeeded();
  await page.waitForFunction(id=>{const img=document.querySelector('#crystal-rest-exchange [data-resident="'+id+'"] img');return img&&!img.hidden&&img.naturalWidth>0;},next);
  check(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Horizontal overflow at phone width');
  await pick(next);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  check(await stored()===beforeCancel && location(await state(),old)==='rest' && await c('move').evaluate(el=>el===document.activeElement),'Cancel wrote a save or lost focus');
  await openReturn();await pick(other);await pick(next);
  check(await dialog.locator('input:checked').count()===1,'More than one partner selected');
  const receipt=await dialog.locator('[data-picked]').innerText();
  const sameNameLabel=await row(next).locator('strong').innerText();
  check(sameNameLabel.includes('窝第') && receipt.includes(sameNameLabel),'Different identities shown on the card and receipt');
  const beforeFailure=await stored();
  await page.evaluate(key=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){
    if(k===key){Storage.prototype.setItem=set;throw Error('模拟换位写入失败');}return set.call(this,k,v);
  };},saveKey);
  await confirm.click();
  await dialog.locator('[data-status]').filter({hasText:'模拟换位写入失败'}).waitFor();
  check(await stored()===beforeFailure && location(await state(),next)==='main' && location(await state(),old)==='rest','Failed write partially moved shrimp');
  check(await row(next).getByRole('radio').isChecked() && await confirm.isEnabled(),'Failed write lost the choice or blocked retry');
  await confirm.evaluate(button=>{button.click();button.click();});
  await dialog.waitFor({state:'hidden'});
  const first=await state();
  expectedMove(before,first,old,next);
  check(await c('roster-filter').inputValue()==='live','Successful recall lost the selected individual');
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready);
  const afterLoad=await state(), agents=await physical();
  expectedMove(before,afterLoad,old,next);
  check(agents.includes(old) && !agents.includes(next),'3D home tank did not match the saved roster');
  // Open the same swap from a resident, then return by the resting youngster's own contest invitation.
  await roster('live',old);await details(c('rest'));await c('rest').click();await dialog.waitFor();
  check(await dialog.getByRole('radio').count()===4 && await confirm.isDisabled(),'Resident entry did not offer four explicit picks');
  await pick(next);await confirm.click();await dialog.waitFor({state:'hidden'});
  expectedMove(afterLoad,await state(),next,old);
  check(await c('roster-filter').inputValue()==='rest','Resident entry should follow the outgoing shrimp');
  await roster('live',next);await details(c('rest'));await c('rest').click();await pick(old);await confirm.click();
  await dialog.waitFor({state:'hidden'});
  await c('tab-contest').click();await c('contest-card').selectOption('rookie:'+brood.id);
  await c('entrant-gallery').locator('[data-contest-candidate="'+next+'"]').click();
  await details(c('move-tank'));await openReturn();await pick(old);await confirm.click();await dialog.waitFor({state:'hidden'});
  check(await c('contest-entrant').inputValue()===next && await c('contest-card').inputValue()==='rookie:'+brood.id,'Lost the original rookie and invitation');
  await c('contest-enter').click();await c('contest-result').waitFor();
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready);
  const final=await state(), entrant=final.batches.find(b=>b.id===brood.id).rookieEntry.entrantId;
  check(entrant===next && location(final,old)==='rest' && location(final,next)==='main','Rookie or return missing after reload');
  const sizes=final.tanks.map(t=>final.individuals.filter(r=>r.tank===t.id&&r.soldAt===null).length);
  const resting=final.individuals.filter(r=>r.tank==='rest'&&r.soldAt===null).length;
  check(sizes.join(',')==='20,10,10,10' && resting===4,'Seats changed');
  return {destinations,sizes,resting,broods:final.batches.length,old,entrant,receipt,
    sameNamePhotos:true,cancelKeptSave:true,failedSaveRetried:true,doubleClickSafe:true,rookieReturn:true};
}
