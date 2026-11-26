// From an isolated new tank, raise a brood and compare a youngster with a recorded parent.
async page => {
  const c=id=>page.locator('#crystal-'+id);
  const state=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const act=a=>page.evaluate(a=>aquarium.game.crystalAction(a),a);
  const check=(ok,why)=>{if(!ok)throw Error(why);};
  const race=c('contest-card'), entrant=c('contest-entrant'), compare=c('contest-compare'), other=c('contest-other');
  const spread=c('pair-photos'), forecast=c('contest-forecast'), enter=c('contest-enter'), feedback=c('feedback');
  const fixed='colour-entry', mother='I1', father='I3';
  const register=()=>c('tab-contest').click();
  const openComparison=async()=>{
    if(!await compare.evaluate(el=>el.open))await compare.locator(':scope > summary').click();
    await other.locator('option:not([value=""])').first().waitFor({state:'attached'});
  };
  const option=(control,id)=>control.locator('option[value="'+id+'"]');
  const valueIds=control=>control.locator('option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean));
  const asCandidate=id=>spread.locator('[data-individual="'+id+'"] [data-choose-photo]');
  const where=()=>page.evaluate(()=>aquarium.game.data.BreedingRooms.activeId);
  const ledger=async()=>{
    const s=await state();
    return JSON.stringify([s.cash,s.rngState,s.contests,s.individuals.map(r=>[r.id,r.contestDebuts]),s.batches.map(b=>[b.id,b.rookieEntry])]);
  };
  const displayedScore=s=>Number(s.toFixed(2));
  await page.setViewportSize({width:390,height:780});
  await page.locator('#welcome-dismiss').click();await c('open').click();await c('start').click();await c('panel').waitFor({state:'hidden'});
  await page.clock.setFixedTime(new Date((await state()).now+100));
  await c('open').click();await c('tab-breed').click();
  check(!await c('mother').inputValue() && !await c('father').inputValue(),'The first parents were preselected');
  await c('mother').selectOption(mother);await c('father').selectOption(father);
  await c('breeding-tank').selectOption('breeding');await c('brood-size').selectOption('2');await c('plan').click();
  await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1);
  const b=(await state()).batches[0];await register();await race.selectOption(fixed);
  check(!await entrant.inputValue() && !await forecast.isChecked(),'The first entry showed a selection or prediction');
  await entrant.selectOption(mother);await enter.click();await c('contest-result').waitFor();
  const withParentResult=await state(), firstMark=withParentResult.contests.records.bestByContest[fixed];
  const parentDebut=withParentResult.individuals.find(r=>r.id===mother).contestDebuts[fixed];
  await page.clock.setFixedTime(new Date(b.adultAt+100));await act({type:'advance'});
  const [kid,sibling]=(await state()).batches[0].children.map(child=>child.id);
  await c('tab-breed').click();
  const review=c('batches').locator('[data-batch-id="'+b.id+'"] > .crystal-review');
  await review.locator(':scope > summary').click();
  check(await review.locator('select').first().inputValue()==='','The brood was ranked on first opening');
  for(const [id,value] of [[mother,'我认得它尾巴上的白边'],[kid,'背上这段红是我想留下的']]){
    await act({type:'rename',id,name:'小潮'});await act({type:'observation',id,value});
  }
  await register();await race.selectOption(fixed);await entrant.selectOption(kid);await openComparison();
  const beforeLooking=await ledger();
  check(!await other.inputValue() && await option(other,mother).count()===1,'Parent missing or automatically assigned');
  await other.selectOption(mother);
  const tag=await option(other,mother).innerText();
  check(tag.includes('它的母虾') && tag.includes('已有本卡成绩'),'The record did not identify the parent');
  check(await c('contest-difference').isHidden() && await c('contest-result').isHidden(),'Historical score revealed an unsolicited prediction');
  await c('contest-closeup').click();await spread.waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('#crystal-pair-photos[open] figure img')].every(i=>!i.hidden&&i.complete&&i.naturalWidth>0));
  await spread.locator('button[data-crop="back"]').click();
  check(await spread.locator('figure').first().getAttribute('data-individual')===kid && await spread.locator('figure').last().getAttribute('data-individual')===mother,'Wrong namesake in a photo');
  check((await spread.innerText()).includes('我认得它尾巴上的白边') && (await spread.innerText()).includes('背上这段红是我想留下的'),'Lost the two observations');
  check(await asCandidate(kid).isVisible() && await asCandidate(mother).isHidden(),'The historical photo offered repeat entry');
  check(await spread.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'The photo comparison overflows at phone width');
  await spread.screenshot({path:'output/playwright/contest-family-reference.png',animations:'disabled'});
  await page.keyboard.press('Escape');await spread.waitFor({state:'hidden'});
  await forecast.check();
  const mixed=await c('contest-difference').innerText();
  check(mixed.includes('赛前估分') && mixed.includes('已记录 '+displayedScore(firstMark.score)+' 分，第 '+firstMark.rank+' 名'),'A recorded result was presented as an estimate');
  await forecast.uncheck();await c('contest-other-visit').click();await c('panel').waitFor({state:'hidden'});
  const motherRoom=withParentResult.individuals.find(r=>r.id===mother).tank;
  check(await page.evaluate(id=>aquarium.selected===id && aquarium.world.agentsById.has(id),mother) && await where()===motherRoom,'The tank visit did not locate the chosen parent in her own tank');
  check(await c('tank-race').isHidden(),'The parent reference offered to replace the contestant');
  await c('inspect').click();check(await entrant.inputValue()===kid && await other.inputValue()===mother,'Returning from the home tank lost the comparison');
  await entrant.selectOption(mother);await openComparison();await other.selectOption(kid);
  check((await option(other,kid).innerText()).includes('它的子代'),'Reverse comparison lost the family relationship');
  await c('contest-closeup').click();await asCandidate(kid).click();await spread.waitFor({state:'hidden'});
  check(await entrant.inputValue()===kid && await other.inputValue()===mother && await enter.isEnabled() && await ledger()===beforeLooking,'Choosing the youngster from the parent’s record entered the contest');
  await c('contest-closeup').click();await act({type:'rest',id:mother});
  await spread.locator('figcaption').filter({hasText:'静养处'}).waitFor();
  check(await asCandidate(mother).isHidden(),'Resting parent offered as entrant');await page.keyboard.press('Escape');
  check(!await option(entrant,mother).count() && await other.inputValue()===mother,'Resting parent in wrong list');
  await c('contest-other-visit').click();
  check(await c('roster-filter').inputValue()==='rest' && await c('roster').locator('[data-individual-id="'+mother+'"]').getAttribute('aria-pressed')==='true','Wrong resting record');
  await c('family-back').click();check(await other.inputValue()===mother && await entrant.inputValue()===kid,'Reading the archive lost the newcomer');
  await race.selectOption('pattern-entry');await entrant.selectOption(kid);await openComparison();
  check(!await option(other,mother).count(),'An archive appeared on a fixed card it never entered');
  await race.selectOption('rookie:'+b.id);await c('entrant-gallery').locator('[data-contest-candidate="'+kid+'"]').click();
  await openComparison();check(String(await valueIds(other))===String([sibling]),'A past contestant intruded on the brood invitation');
  await race.selectOption('exhibition:1');await entrant.selectOption(kid);await openComparison();
  check(!await option(other,mother).count(),'A resting record appeared as an exhibition candidate');
  await act({type:'recall',id:mother,tankId:'main'});await act({type:'protect',id:mother,value:false});await act({type:'sell',id:mother});
  await race.selectOption(fixed);await entrant.selectOption(kid);await openComparison();await other.selectOption(mother);
  check((await option(other,mother).innerText()).includes('已售档案') && !await option(entrant,mother).count(),'Transferred parent missing from archive or present at registration');
  await c('contest-other-visit').click();check(await c('roster-filter').inputValue()==='sold','Sold parent opened the wrong archive');await c('family-back').click();
  const beforeEntry=await ledger();
  await page.evaluate(()=>{const write=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){
    if(k==='aquarium.three.creatures.v1'){Storage.prototype.setItem=write;throw Error('模拟亲子参赛保存失败');}return write.call(this,k,v);
  };});
  await enter.click();await feedback.filter({hasText:'模拟亲子参赛保存失败'}).waitFor();
  check(await ledger()===beforeEntry && await other.inputValue()===mother && await entrant.inputValue()===kid,'A failed save lost the pair or recorded a result');
  await enter.click();await c('contest-result').waitFor();
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready);await c('open').click();await register();
  await race.selectOption(fixed);await entrant.selectOption(kid);await openComparison();await other.selectOption(mother);
  await c('contest-closeup').click();
  check(!await spread.locator('[data-choose-photo]:visible').count() && await enter.isHidden(),'Settled results offered another entry');
  const final=await state(), parent=final.individuals.find(r=>r.id===mother), newcomer=final.individuals.find(r=>r.id===kid);
  check(parent.contestDebuts[fixed]===parentDebut && parent.soldAt!==null && Object.hasOwn(newcomer.contestDebuts,fixed) && final.cash===withParentResult.cash+8 &&
    !final.batches[0].rookieEntry && !final.contests.exhibitions?.length,'Incorrect receipts, rewards or invitation after reload');
  return {mother,kid,sibling,firstParentsEmpty:true,broodBirthOrder:true,firstEntrantEmpty:true,reference:tag,mixed,
    notesAndPhotos:true,reverseSelection:true,checkedHomes:[motherRoom,'rest','sold'],otherCardsScoped:true,saveRetried:true,cash:final.cash};
}
