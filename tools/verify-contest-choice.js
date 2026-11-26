async page => {
  // Use a fresh trial context. Clock changes and transfers only prepare this save.
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const control=id=>page.locator('#crystal-'+id);
  const action=value=>page.evaluate(value=>aquarium.game.crystalAction(value),value);
  const state=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const panel=control('page-contest'), entrant=control('contest-entrant'), race=control('contest-card');
  const gallery=control('entrant-gallery'), forecast=control('contest-forecast'), enter=control('contest-enter');
  const comparison=control('contest-compare'), other=control('contest-other'), enlarge=control('contest-closeup'), spread=control('pair-photos');
  const pick=id=>gallery.locator('[data-contest-candidate="'+id+'"]');
  const cards=gallery.locator('[data-contest-candidate]');
  const identities=()=>cards.evaluateAll(items=>items.map(item=>item.dataset.contestCandidate));
  const hasNumbers=async()=>/按本场估分|本场估分\s*[\d.]|最高估分|电脑对手\s*\d\s*·\s*[\d.]+\s*分/.test(await panel.innerText());
  const displayed=section=>section.locator('figure').evaluateAll(items=>items.map(el=>el.dataset.individual));
  const note='我喜欢它背上这块白。';
  await page.locator('#welcome-dismiss').click();
  await control('open').click();await control('start').click();await control('panel').waitFor({state:'hidden'});
  await page.clock.setFixedTime(new Date((await state()).now+100));
  await action({type:'observation',id:'I3',value:note});
  await control('open').click();await control('tab-contest').click();
  const before=await state();
  const adults=before.individuals.filter(r=>r.tank && r.tank!=='rest' && !r.legacy && r.adultAt<=before.now);
  check(String(await identities())===String(adults.slice(0,4).map(r=>r.id)),'Roster did not open in stable order');
  check(String(await entrant.locator('option').evaluateAll(items=>items.map(item=>item.value).filter(Boolean)))===String(adults.map(r=>r.id)),'Ineligible juveniles or original residents were offered a place');
  check(!await entrant.inputValue() && await enter.isDisabled() && !await hasNumbers(),'Registry chose an entrant or displayed an estimate');
  await gallery.getByRole('button',{name:'下一页候选虾'}).press('Enter');
  check(!await entrant.inputValue() && await cards.first().evaluate(el=>el===document.activeElement),'Turning the page picked a shrimp or lost keyboard focus');
  await cards.last().press('Space');
  check(await entrant.inputValue()===adults.at(-1).id && (await cards.last().getAttribute('aria-pressed'))==='true','Keyboard pick failed');
  await entrant.selectOption('I3');
  check(await pick('I3').getAttribute('aria-pressed')==='true' && (await pick('I3').innerText()).includes(note),'Dropdown did not bring the personally marked candidate into view');
  await comparison.locator('summary').press('Enter');
  check(!await other.inputValue() && await enlarge.isHidden(),'Comparison assigned a second shrimp');
  await other.selectOption('I1');
  check(String(await displayed(comparison))==='I3,I1' && (await comparison.innerText()).includes(note) && !await hasNumbers(),'Unaided comparison lost the notes or revealed estimates');
  await enlarge.press('Enter');await spread.waitFor();
  await spread.locator('[data-crop="back"]').click();
  check(String(await displayed(spread))==='I3,I1' && await spread.getAttribute('data-crop')==='back','The two closeups did not show the chosen features');
  await spread.locator('[data-close]').press('Escape');
  check(await enlarge.evaluate(el=>el===document.activeElement) && await entrant.inputValue()==='I3','Canceling comparison changed the entrant or lost keyboard focus');
  await forecast.check();
  check(await hasNumbers() && await other.inputValue()==='I1' && (await page.locator('.crystal-contest-specimen').innerText()).includes('本场估分'),'Voluntary estimates lost the comparison');
  await control('contest-swap').click();
  check(await entrant.inputValue()==='I1' && await pick('I1').getAttribute('aria-pressed')==='true','Study comparison lost the entrant');
  await forecast.uncheck();
  check(await other.inputValue()==='I3' && await enlarge.isVisible() && await control('contest-difference').isHidden(),'Hiding estimates discarded the two candidates');
  await enlarge.click();await spread.locator('[data-individual="I3"] [data-choose-photo]').click();
  check(await entrant.inputValue()==='I3' && await other.inputValue()==='I1' && await enter.evaluate(el=>el===document.activeElement),'Choosing from the photo failed to stage the named entrant');
  check(!await hasNumbers() && JSON.stringify(await state())===JSON.stringify(before),'Reviewing candidates revealed a score or changed the save');
  const regular=await race.inputValue();
  await enter.press('Enter');await control('contest-result').waitFor();
  check(await control('contest-result').getAttribute('data-entrant')==='I3' && (await state()).cash===before.cash+10,'Regular result and reward did not go to the named entrant');
  await control('contest-visit').click();await control('panel').waitFor({state:'hidden'});
  check(await page.evaluate(()=>aquarium.selected)==='I3' && (await control('tank-observation').innerText()).includes(note),'Wrong shrimp or observation at the tank');
  await control('inspect').click();
  check(await race.inputValue()===regular && await entrant.inputValue()==='I3','Returning from the tank lost the scorecard');

  await race.selectOption('exhibition:1');
  check(!await entrant.inputValue() && !await forecast.isChecked() && !await hasNumbers(),'A new event inherited the previous result or forecast');
  await entrant.selectOption('I5');await comparison.locator('summary').click();
  check(!await other.inputValue(),'The exhibition inherited another event’s shortlist');
  await other.selectOption('I1');await enlarge.click();await spread.waitFor();
  await action({type:'rest',id:'I1'});await spread.waitFor({state:'hidden'});
  check(await entrant.inputValue()==='I5' && !await other.inputValue() && await enlarge.isHidden(),'A resting comparison candidate remained selectable');
  await action({type:'recall',id:'I1',tankId:'main'});
  await control('contest-visit').click();await control('panel').waitFor({state:'hidden'});
  await control('shortcut-contest').click();
  check(await race.inputValue()==='exhibition:1' && await entrant.inputValue()==='I5','Tank shortcut silently sent the exhibitor to a different event');
  await enter.click();await control('contest-result').waitFor();
  check((await state()).contests.exhibitions[0].entrantId==='I5' && await gallery.isHidden(),'Exhibition failed to record its entrant');
  await race.selectOption('exhibition:2');
  check(await gallery.isHidden() && await enter.isHidden() && !await hasNumbers(),'Closed exhibition allowed entry or showed scores');
  await race.selectOption(regular);
  check(!await entrant.inputValue() && await enter.isDisabled(),'A past delegate was silently assigned to a fresh entry');
  await action({type:'move',id:'I7',tankId:'breeding'});
  const broodIntent='想看看背上那条细白纹。';
  await action({type:'plan',motherId:'I1',fatherId:'I2',tankId:'main',size:4,intent:broodIntent});
  const brood=(await state()).batches[0];
  await page.clock.setFixedTime(new Date(brood.adultAt+500));await action({type:'advance'});
  const kids=(await state()).batches[0].children.map(k=>k.id), [favorite,sibling,resting,sold]=kids;
  for(const id of [favorite,sibling])await action({type:'rename',id,name:'小砂'});
  await action({type:'protect',id:favorite,value:true});
  await action({type:'observation',id:favorite,value:note});
  const invitation='rookie:'+brood.id, photos=control('sibling-view'), review=control('contest-review');
  await control('tab-breed').click();
  await control('batches').locator('[data-batch-id="'+brood.id+'"] .crystal-sibling-open').click();
  for(const id of [favorite,resting])await photos.locator('[data-sibling-id="'+id+'"]').click();
  await photos.locator('[data-crop="head"]').click();
  await photos.locator('[data-sibling-visit="'+favorite+'"]').click();
  await control('panel').waitFor({state:'hidden'});
  await control('next-sibling').click();await page.waitForFunction(id=>aquarium.selected===id,resting);
  await control('tank-race').click();
  check(await race.inputValue()===invitation && await entrant.inputValue()===resting && !await hasNumbers(),'Tank visit lost the chosen sibling or opened the wrong race');
  check((await control('contest-intent').innerText()).includes(broodIntent) && !(await state()).batches[0].rookieEntry,'Preview lost the original intent or spent the invitation');
  await review.click();await photos.waitFor();
  const spreadIds=await photos.locator('[data-sibling-visit]').evaluateAll(items=>items.map(el=>el.dataset.siblingVisit));
  check(String(spreadIds)===String([favorite,resting]) && await photos.getAttribute('data-crop')==='head' &&
    await page.evaluate(()=>document.activeElement.dataset.siblingVisit)===resting,'Returning from the invitation lost the original photos, framing or focus');
  await photos.locator('[data-sibling-visit="'+favorite+'"]').click();await control('panel').waitFor({state:'hidden'});
  await control('shortcut-contest').click();
  check(await race.inputValue()===invitation && await entrant.inputValue()===favorite && !(await state()).batches[0].rookieEntry,'Dock ignored the changed choice or registered it without confirmation');
  await race.selectOption(regular);await entrant.selectOption('I5');
  check(await control('contest-intent').isHidden() && await control('contest-result-intent').isHidden(),'Another shrimp inherited the litter note');
  await action({type:'rest',id:resting});await action({type:'sell',id:sold});
  await race.selectOption(invitation);await page.setViewportSize({width:390,height:750});
  check(String(await identities())===String(kids) && !await entrant.inputValue(),'Rookie card did not show the whole litter in birth order');
  check(!await hasNumbers() && !await control('contest-siblings').isVisible(),'The rookie invitation disclosed a top choice');
  await pick(sold).click();await control('family-back').click();
  check(await race.inputValue()===invitation && !await entrant.inputValue(),'Reading a sold sibling selected it for entry');
  await pick(resting).click();await control('family-back').click();
  check(await race.inputValue()===invitation && !await entrant.inputValue(),'Looking up a resting sibling selected it');
  await pick(resting).click();await control('move-tank').selectOption('breeding');await control('move').click();
  await panel.waitFor();
  check(await race.inputValue()===invitation && await entrant.inputValue()===resting && !(await state()).batches[0].rookieEntry,'Recalling a sibling lost the invitation or entered it prematurely');
  await pick(favorite).press('Enter');
  check(await pick(favorite).getAttribute('aria-pressed')==='true' && (await pick(favorite).innerText()).includes('已收藏') &&
    (await pick(favorite).innerText()).includes(note) && !(await pick(sibling).innerText()).includes(note),'Namesake lost identity or acquired another shrimp’s note');
  await comparison.locator('summary').click();
  check(String(await other.locator('option').evaluateAll(items=>items.map(o=>o.value).filter(Boolean)))===String([sibling,resting]),'Rookie comparison offered an ineligible shrimp');
  await other.selectOption(sibling);await enlarge.click();await spread.waitFor();
  const printIds=await displayed(spread);
  check(String(printIds)===String([favorite,sibling]) && (await spread.locator('figcaption').first().innerText())!==(await spread.locator('figcaption').last().innerText()),'Same-name siblings lost their identity in the spread');
  for(const viewport of [{width:390,height:750},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    await spread.locator('[data-crop="head"]').click();
    check(await spread.locator('figure').evaluateAll(items=>items.every(el=>el.getBoundingClientRect().left>=0 && el.getBoundingClientRect().right<=innerWidth)),'The paired prints did not fit the signup panel');
  }
  await page.setViewportSize({width:390,height:750});
  await spread.locator('[data-close]').click();
  await control('contest-other-visit').click();await control('panel').waitFor({state:'hidden'});
  await control('tank-race').click();
  check(await race.inputValue()===invitation && await entrant.inputValue()===sibling && await other.inputValue()===favorite && !await hasNumbers() && !(await state()).batches[0].rookieEntry,'Choosing at the sibling’s tank changed the invitation or entered it early');
  await control('contest-swap').click();
  check(await cards.evaluateAll(items=>items.every(el=>el.getBoundingClientRect().right<=innerWidth)),'Cards overflow the narrow screen');
  await gallery.locator('img').last().waitFor({state:'visible'});
  const intact=await gallery.locator('img').evaluateAll(async images=>{
    for(const image of images){
      await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const {data}=ctx.getImageData(0,0,canvas.width,canvas.height),box=image.getBoundingClientRect();
      const scale=Math.max(box.width/canvas.width,box.height/canvas.height);
      const cropX=(canvas.width-box.width/scale)/2,cropY=(canvas.height-box.height/scale)/2;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
        if(data[4*(y*canvas.width+x)+3]>200 && (x<cropX || x>=canvas.width-cropX || y<cropY || y>=canvas.height-cropY))return false;
      }
    }
    return true;
  });
  check(intact,'Contest framing cut through an opaque part of a shrimp');
  await gallery.screenshot({path:'output/playwright/picking-rookie-by-appearance.png'});
  await forecast.check();await control('contest-siblings').locator('tbody tr').first().waitFor();
  check(await control('contest-siblings').locator('tbody tr').count()===4 && await hasNumbers(),'Rookie comparison unavailable on request');
  await forecast.uncheck();
  const preEntry=await state();
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    window.restoreContestSave=()=>{Storage.prototype.setItem=original;delete window.restoreContestSave;};
    Storage.prototype.setItem=function(key,value){
      if(key==='aquarium.three.creatures.v1')throw Error('测试比赛写入失败');
      return original.call(this,key,value);
    };
  });
  try{
    await enter.click();await control('feedback').filter({hasText:'测试比赛写入失败'}).waitFor();
    check(JSON.stringify(await state())===JSON.stringify(preEntry) && await entrant.inputValue()===favorite && await control('contest-result').isHidden(),'Failed save consumed the invitation or lost the choice');
  }finally{await page.evaluate(()=>window.restoreContestSave());}
  await enter.click();await control('contest-result').waitFor();
  const result=(await state()).batches[0].rookieEntry;
  check(result.entrantId===favorite && await enter.isHidden() && await comparison.isHidden() && (await state()).cash===preEntry.cash,'Rookie entry or settlement changed');
  check((await control('contest-result-intent').innerText()).includes(broodIntent) && await control('contest-intent').isHidden(),'Judging discarded the original breeding note');
  await control('contest-visit').click();await control('panel').waitFor({state:'hidden'});
  check(await page.evaluate(()=>aquarium.selected)===favorite,'Rookie visit focused its namesake');
  await control('inspect').click();await control('contest-brood').click();
  check(await control('contest-siblings').locator('[data-rookie-representative]').getAttribute('data-rookie-representative')===favorite,'Archived sibling comparison lost the delegate');
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready);
  await control('open').click();await control('tab-contest').click();await race.selectOption(invitation);
  check((await control('contest-result-intent').innerText()).includes(broodIntent),'Saved result lost the player’s original breeding note');
  check(await entrant.inputValue()===favorite && await control('contest-result').getAttribute('data-entrant')===favorite &&
    JSON.stringify((await state()).batches[0].rookieEntry)===JSON.stringify(result),'Reload altered the confirmed result');

  // Fill the purchased tanks using confirmed broods and earned album income.
  // The original decorative residents count toward capacity but cannot compete.
  await action({type:'featureBrood',batchId:brood.id,id:favorite});
  await action({type:'expand',tankId:'breeding-2'});
  const residents=(s,tank)=>s.individuals.filter(r=>r.tank===tank);
  let s=await state();
  while(s.individuals.filter(r=>r.soldAt===null).length<50){
    if(s.tanks.length===3 && s.cash>=90){
      await action({type:'expand',tankId:'breeding-3'});
      s=await state();
    }
    const size=Math.min(4,50-s.individuals.filter(r=>r.soldAt===null).length);
    const parents=['I1','I2'], outside=parents.filter(id=>s.individuals.find(r=>r.id===id).tank!=='breeding').length;
    while(residents(s,'breeding').length+outside+size>10){
      const destination=s.tanks.find(t=>t.id!=='breeding' && residents(s,t.id).length<t.capacity);
      const adult=residents(s,'breeding').find(r=>!parents.includes(r.id));
      check(destination && adult,'No space to raise the full-capacity test litter');
      await action({type:'move',id:adult.id,tankId:destination.id});
      s=await state();
    }
    await action({type:'plan',motherId:parents[0],fatherId:parents[1],tankId:'breeding',size});
    const next=(await state()).batches.at(-1);
    await page.clock.setFixedTime(new Date(next.adultAt+500));await action({type:'advance'});
    s=await state();
    if(s.tanks.length===3){
      const last=s.batches.at(-1);
      await action({type:'featureBrood',batchId:last.id,id:last.children[0].id});s=await state();
    }
  }
  const fullRoster=s.individuals.filter(r=>r.tank && r.tank!=='rest' && !r.legacy && r.adultAt<=s.now).map(r=>r.id);
  check(s.tanks.length===4 && s.tanks.every(t=>residents(s,t.id).length===t.capacity) && fullRoster.length===40,'Fixture did not reach 50 in-tank shrimp');
  await race.selectOption('pattern-entry');
  const seen=[...await identities()], nextPage=gallery.getByRole('button',{name:'下一页候选虾'});
  while(await nextPage.isEnabled()){
    await nextPage.click();const ids=await identities();
    check(ids.length<=4 && !seen.includes(ids[0]),'Pagination duplicated candidates or did not advance');
    seen.push(...ids);
  }
  check(String(seen)===String(fullRoster) && !await entrant.inputValue() && await enter.isDisabled(),'Full roster lost an entrant or picked one while browsing');
  const last=fullRoster.at(-1);
  await pick(last).press('Enter');await enter.press('Enter');await control('contest-result').waitFor();
  check(await control('contest-result').getAttribute('data-entrant')===last && (await state()).contests.records.bestByContest['pattern-entry'].entrantId===last,'The last eligible shrimp could not represent a full tank');

  // Use an actual non-tied scorecard so its optional trait suggestion exists.
  const candidate=await page.evaluate(async()=>{
    const {rivalComparison}=await import('/src/crystal-contests.js'), s=aquarium.game.data.Breeding;
    const card=s.contests.cards.find(c=>c.id==='pattern-advanced');
    for(const r of s.individuals.filter(r=>!r.legacy && r.tank && r.tank!=='rest' && r.adultAt<=s.now)){
      const {trait}=rivalComparison(card,r);
      if(trait!==null)return {id:r.id,sex:r.sex,goal:['colour','coverage','edge'][trait]};
    }
  });
  await race.selectOption('pattern-advanced');await entrant.selectOption(candidate.id);await enter.click();
  await control('contest-result').waitFor();
  const judgedState=await state(), traitChoice=control('quality-goal');
  await control('contest-breed').click();
  check(await control(candidate.sex==='female'?'mother':'father').inputValue()===candidate.id && !await traitChoice.inputValue() &&
    !await control('pick-analysis').isChecked(),'The judge set the next breeding goal or ranked the mates');
  await control('tab-breed').click();
  const ownGoal=candidate.goal==='edge'?'colour':'edge';await traitChoice.selectOption(ownGoal);
  await control('tab-contest').click();await control('contest-breed').click();
  check(await traitChoice.inputValue()===ownGoal,'The neutral action erased the player’s existing goal for this parent');
  await control('tab-contest').click();
  const sheet=control('contest-scores');
  if(!await sheet.evaluate(el=>el.open))await sheet.locator('summary').press('Enter');
  await control('contest-use-trait').click();
  check(await traitChoice.inputValue()===candidate.goal && JSON.stringify(await state())===JSON.stringify(judgedState),'Explicit judge goal was ignored or opened a second brood or contest');
}
