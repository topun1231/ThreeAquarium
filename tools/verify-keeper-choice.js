async page=>{
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const c=id=>page.locator('#crystal-'+id), panel=c('panel');
  const breed=c('tank-next-generation'), race=c('tank-race'), entrant=c('contest-entrant');
  const state=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const act=value=>page.evaluate(a=>aquarium.game.crystalAction(a),value);
  const row=id=>c('roster').locator('[data-individual-id="'+id+'"]');
  const draft=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('aquarium.three.pairing-draft.')).sort().map(k=>[k,localStorage[k]]));
  async function visit(id){
    await row(id).click();await c('focus').click();await panel.waitFor({state:'hidden'});
    await page.waitForFunction(id=>aquarium.selected===id,id);
  }
  async function book(){
    if(await panel.isHidden())await c('open').click();
    await c('tab-roster').click();
  }
  await page.setViewportSize({width:390,height:800});
  await page.locator('#welcome-dismiss').click();await c('open').click();await c('start').click();await panel.waitFor({state:'hidden'});
  await page.evaluate(async()=>{
    const game=aquarium.game, save=game.snapshot();save.session.Breeding.rngState=7;await game.restore(save);
  });
  await page.clock.setFixedTime(new Date((await state()).now+100));
  await act({type:'plan',motherId:'I4',fatherId:'I2',tankId:'main',size:2});
  const batch=(await state()).batches[0], invitation='rookie:'+batch.id;
  await page.clock.setFixedTime(new Date(batch.adultAt+10));await act({type:'advance'});
  const [kid,sibling]=(await state()).batches[0].children.map(r=>r.id);
  for(const id of [kid,sibling]){
    await act({type:'rename',id,name:'小米'});await act({type:'protect',id,value:true});
  }
  await act({type:'move',id:sibling,tankId:'breeding'});
  await act({type:'move',id:'I7',tankId:'breeding'});
  await c('open').click();await c('tab-breed').click();
  await c('mother').selectOption('I1');await c('father').selectOption('I3');
  await c('breeding-tank').selectOption('main');await c('brood-size').selectOption('2');await c('quality-goal').selectOption('coverage');
  const note='想再看看小米背上那片白。';
  await page.locator('details.crystal-intent-editor').filter({has:c('pair-intent')}).locator('summary').click();
  await c('pair-intent').fill(note);
  const initialDraft=JSON.stringify(await draft());
  await book();await c('roster-filter').selectOption('favorites');await c('search').fill('小米');await visit(kid);
  check(await breed.isVisible() && await race.isVisible() && await race.getAttribute('data-card')===invitation,'A favorite lost its pairing or debut');
  await breed.click();await c('tank-pair').waitFor();
  check((await c('tank-pair-anchor').innerText()).includes('小米'),'Lost the watched parent');
  await page.keyboard.press('Escape');
  check(await page.evaluate(()=>aquarium.selected)===kid,'Cancellation returned to the other namesake');
  await c('inspect').click();
  check(await c('roster-filter').inputValue()==='favorites' && await c('search').inputValue()==='小米' &&
    await row(kid).getAttribute('aria-pressed')==='true' && JSON.stringify(await draft())===initialDraft,'Cancelling lost the original favorite, search or other draft');
  // Visit the namesake in the other tank and return before entering with the first one.
  await visit(sibling);await c('shortcut-contest').click();
  check(await c('contest-card').inputValue()===invitation && await entrant.inputValue()===sibling,'Wrong tank or wrong sibling at the invitation');
  check(!(await state()).batches[0].rookieEntry && !await c('contest-forecast').isChecked(),'Looking at a sibling entered or ranked the brood');
  await book();await visit(kid);await race.click();
  check(await entrant.inputValue()===kid && await c('contest-card').inputValue()===invitation,'Lost the original favorite on the return trip');
  await c('contest-enter').click();await c('contest-result').waitFor();
  check((await state()).batches[0].rookieEntry.entrantId===kid,'The wrong sibling used the invitation');
  const regular='colour-entry';await c('contest-card').selectOption(regular);await entrant.selectOption('I1');
  await c('contest-forecast').check();await c('contest-compare').locator('summary').click();
  await c('contest-other').selectOption('I3');await c('contest-other-visit').click();await panel.waitFor({state:'hidden'});
  check((await race.innerText()).includes('改选') && await breed.isHidden(),'The comparison offered an unrelated choice');
  const cash=(await state()).cash;await race.click();
  check(await c('contest-card').inputValue()===regular && await entrant.inputValue()==='I3' &&
    await c('contest-other').inputValue()==='I1' && (await state()).cash===cash &&
    !(regular in ((await state()).individuals.find(r=>r.id==='I3').contestDebuts||{})),'Swapping the candidate entered, changed the event or lost the first candidate');
  await c('contest-other-visit').click();await panel.waitFor({state:'hidden'});
  await act({type:'rest',id:'I3'});await race.waitFor({state:'hidden'});
  check(await page.evaluate(()=>aquarium.selected)==='I1','Another candidate leaving the tank displaced the watched individual');
  await c('inspect').click();await act({type:'recall',id:'I3',tankId:'main'});
  await c('tab-breed').click();await c('father').selectOption('I3');
  await page.locator('[data-browse-parent="female"]').click();await visit(kid);
  check(await breed.isVisible() && (await breed.innerText()).includes((await state()).individuals.find(r=>r.id==='I3').name) && await race.isHidden(),'Missing the chosen partner or offered an unrelated race');
  await breed.click();
  check(await c('mother').inputValue()===kid && await c('father').inputValue()==='I3' && await c('quality-goal').inputValue()==='coverage' &&
    await c('pair-intent').inputValue()===note && await c('breeding-tank').inputValue()==='main' && await c('brood-size').inputValue()==='2' &&
    (await state()).batches.length===1,'Selecting in the tank changed the original settings or created a brood');
  await c('plan').click();await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===2);
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready);
  const restored=await state(), second=restored.batches[1];
  check(restored.batches[0].rookieEntry.entrantId===kid && second.motherId===kid && second.fatherId==='I3' &&
    second.size===2 && second.qualityGoal==='coverage' && second.intent===note,'The two voluntary confirmations did not survive reload');
  return {favorite:kid,otherTank:sibling,invitation,regular,parents:[second.motherId,second.fatherId],intent:second.intent,
    searchRestored:true,priorDraftRestored:true,unavailableOpponentCleared:true};
}
