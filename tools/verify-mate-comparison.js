async page => {
  const check = (value, message) => { if (!value) throw Error(message); };
  const c = id => page.locator('#crystal-'+id);
  const panel = c('panel'), roster = c('roster'), dialog = c('pair-photos');
  const pin = c('compare-candidate'), detail = c('individual'), search = c('search');
  const row = id => roster.locator('[data-individual-id="'+id+'"]');
  const browse = sex => panel.locator('[data-browse-parent="'+sex+'"]');
  const act = a => page.evaluate(action=>aquarium.game.crystalAction(action),a);
  const state = () => page.evaluate(()=>aquarium.game.data.Breeding);
  const selectedParents = async () => [await c('mother').inputValue(),await c('father').inputValue()];
  const chosen = async (mom,dad) => (await selectedParents()).join('/') === mom+'/'+dad;
  async function clickRow(id) { await row(id).click(); }
  async function pinRow(id) { await clickRow(id); await pin.click(); }
  async function prints(left,right,missing=false) {
    await dialog.waitFor();
    await page.waitForFunction(([a,b,missing])=>{
      const cards = [...document.querySelectorAll('#crystal-pair-photos[open] figure')];
      return cards.length===2 && cards.every((el,i)=>{
        const im=el.querySelector('img');
        return el.dataset.individual===[a,b][i] && (missing && i===0 ? im.hidden && el.innerText.includes('花色未记录') :
          !im.hidden && im.complete && im.naturalWidth===1152);
      });
    },[left,right,missing]);
  }
  async function fit(width,height) {
    await page.setViewportSize({width,height});
    const box=await dialog.boundingBox();
    check(box.x>=-1 && box.y>=-1 && box.x+box.width<=width+1 && box.y+box.height<=height+1,'Photos outside viewport');
    for (const b of await dialog.locator('[data-choose-photo]:visible').all()) {
      await b.scrollIntoViewIfNeeded();
      check((await b.boundingBox()).height>=36,'Too small to select on touch');
      check(await b.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}), 'Cannot touch the decision');
    }
  }
  await page.setViewportSize({width:390,height:800});
  await page.locator('#welcome-dismiss').click(); await c('open').click(); await c('start').click(); await panel.waitFor({state:'hidden'});
  await page.evaluate(async()=>{const g=aquarium.game, s=g.snapshot();s.session.Breeding.rngState=7;await g.restore(s);});
  await act({type:'plan',motherId:'I4',fatherId:'I2',tankId:'breeding',size:2});
  const batch=(await state()).batches[0];
  await page.clock.setFixedTime(new Date(batch.hatchAt+5));await act({type:'advance'});
  const kid=(await state()).batches[0].children.find(r=>r.sex==='female').id;
  await c('open').click(); await c('tab-roster').click(); await clickRow(kid); await c('focus').click(); await panel.waitFor({state:'hidden'});
  check(await c('tank-next-generation').isHidden(),'A juvenile could be used as a parent');
  await page.clock.setFixedTime(new Date(batch.adultAt+5));await act({type:'advance'});
  for (const [id,note] of [['I2','我记得它的白带宽'],['I3','我记得这只尾巴前的白边']]) {
    await act({type:'rename',id,name:'小墨团'});await act({type:'observation',id,value:note});
  }
  await c('tank-next-generation').click();
  if(await panel.isHidden()) await c('tank-pair').getByRole('button',{name:'从虾册挑',exact:true}).click();
  await panel.waitFor();
  check(await chosen(kid,'') && !await roster.locator('[aria-pressed="true"]').count(),'Picker filled in a mate');
  await clickRow('I2'); await clickRow('I3');
  check(await dialog.isHidden() && await chosen(kid,'') && (await detail.innerText()).includes('尾巴前的白边'),'Simple browsing opted into comparison');
  await pinRow('I2');
  await search.fill('尾巴前');check(await row('I2').count()===0,'Control test did not filter the held candidate');
  await row('I3').focus();await row('I3').press('Enter');await prints('I2','I3');
  const labels=await dialog.locator('figcaption').allTextContents();
  const notes=await dialog.locator('.crystal-keeper-note').allTextContents();
  check(labels.every(s=>s.includes('小墨团')) && labels[0]!==labels[1] && labels[0].includes('繁育缸') && labels[1].includes('造景缸'), 'Namesakes or current tanks are ambiguous');
  check(notes[0].includes('白带宽') && notes[1].includes('尾巴前的白边'), 'Keeper notes swapped');
  await dialog.locator('[data-crop="back"]').click();
  check(await dialog.getAttribute('data-crop')==='back' && await chosen(kid,'') && (await state()).batches.length===1, 'Inspecting a feature changed the planned pair');
  await fit(390,800); await fit(844,390);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  check(await row('I3').evaluate(e=>e===document.activeElement) && await chosen(kid,''),'Closing pictures picked a shrimp or lost keyboard focus');
  await search.fill('');await clickRow('I7');await prints('I2','I7');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.keyboard.press('Escape');
  check(await panel.isVisible() && await pin.getAttribute('aria-pressed')==='false' && await chosen(kid,''),'Escape committed a candidate or closed the entire picker');

  await pinRow('I2');await clickRow('I3');await prints('I2','I3');
  await act({type:'rest',id:'I3'});await dialog.waitFor({state:'hidden'});
  check(await chosen(kid,'') && await pin.getAttribute('aria-pressed')==='true','Losing the right candidate also discarded the left one');
  await clickRow('I7');await prints('I2','I7');
  await act({type:'rest',id:'I2'});await dialog.waitFor({state:'hidden'});
  check(await chosen(kid,'') && await pin.getAttribute('aria-pressed')!=='true','A resting shrimp remained pinned');
  await act({type:'recall',id:'I2',tankId:'breeding'});await act({type:'recall',id:'I3',tankId:'main'});
  await pinRow('I2');await clickRow('I3');await prints('I2','I3');
  await dialog.locator('[data-choose-photo]').nth(1).click();await dialog.waitFor({state:'hidden'});
  check(await panel.getAttribute('data-page')==='breed' && await chosen(kid,'I3') && (await state()).batches.length===1, 'Right photo chose the wrong parent or started a brood');
  await c('quality-goal').selectOption('coverage');
  await c('breeding-tank').selectOption('breeding');await c('brood-size').selectOption('2');
  const intro=page.locator('details').filter({has:c('pair-intent')}).last();
  if(!await c('pair-intent').isVisible())await intro.locator('summary').first().click();
  const intent='再看看它们尾巴前面的白带。'; await c('pair-intent').fill(intent);
  await browse('male').click();await pinRow('I2');await clickRow('I3');await prints('I2','I3');
  await dialog.locator('[data-choose-photo]').first().click();await dialog.waitFor({state:'hidden'});
  check(await chosen(kid,'I2') && await c('pair-intent').inputValue()===intent && await c('quality-goal').inputValue()==='coverage' &&
    await c('breeding-tank').inputValue()==='breeding' && await c('brood-size').inputValue()==='2','Changing the father rewrote the rest of the draft');

  await browse('female').click();await pinRow(kid);await clickRow('I4');await prints(kid,'I4');
  check((await dialog.locator('[data-choose-photo]').first().innerText()).includes('母虾') && await chosen(kid,'I2'),'Comparing mothers rewrote the draft');
  await dialog.locator('[data-choose-photo]').first().click();
  await c('plan').click();await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===2);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.aquarium?.ready);
  const second=(await state()).batches[1];
  check(second.motherId===kid && second.fatherId==='I2' && second.qualityGoal==='coverage' && second.intent===intent && second.size===2 && await dialog.isHidden(),'The confirmed pair changed on reload');
  await page.evaluate(async()=>{
    const g=aquarium.game,s=g.snapshot(),old=s.session.Breeding.individuals.find(r=>r.id==='I7');
    delete old.colour;delete old.pattern;delete old.traitGroup;await g.restore(s);
  });
  await c('open').click();await c('tab-breed').click();await browse('male').click();
  await pinRow('I7');await clickRow('I3');await prints('I7','I3',true);
  await page.evaluate(async()=>{const g=aquarium.game;await g.restore(g.snapshot());});
  await dialog.waitFor({state:'hidden'});
  check(await pin.getAttribute('aria-pressed')!=='true' && (await state()).batches.length===2, 'Restoring a save kept a comparison from the previous session');
  return {juvenile:kid, compared:['I2','I3','I7'], labels, notes, personalIntent:second.intent,
    parents:[second.motherId,second.fatherId], confirmedBroods:2, checkedRightAndLeft:true, missingCandidatesHandled:true, oldAppearanceHandled:true, layouts:['390x800','844x390']};
}
