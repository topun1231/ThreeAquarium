async (page, direction = 'fine-band') => {
  const c=id=>page.locator('#crystal-'+id);
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const data=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const openBreeding=async()=>{
    if(await c('panel').isHidden())await c('open').click();
    await c('tab-breed').click();
  };
  const reload=async()=>{
    await page.reload();
    await page.waitForFunction(()=>window.aquarium?.ready);
    await openBreeding();
  };
  const goal=c('quality-goal'), appearance=c('brood-goal'), plan=c('plan');
  await page.locator('#welcome-dismiss').click();
  await c('open').click(); await c('start').click(); await c('panel').waitFor({state:'hidden'});
  await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())));
  await c('open').click(); await c('tab-contest').click();
  await c('contest-card').selectOption('exhibition:1:fine-band');
  await c('entrant-gallery').locator('[data-contest-candidate="I1"]').click();
  await c('contest-enter').click(); await c('contest-result').waitFor();
  await c('contest-breed').click();
  check(await goal.inputValue()==='' && await c('father').inputValue()==='', 'The judge assigned a goal or mate');
  // Replay the same documented family in each fresh browser context.
  await page.evaluate(async()=>{
    const snapshot=aquarium.game.snapshot();
    snapshot.session.Breeding.rngState=8;
    await aquarium.game.restore(snapshot);
  });
  await openBreeding();
  await c('breeding-tank').selectOption('breeding'); await c('brood-size').selectOption('4');
  await c('mother').selectOption('I4'); await c('father').selectOption('I2');
  await goal.selectOption(direction);
  if(direction){
    await appearance.selectOption('black:mosura');
    check(await plan.isDisabled() && (await c('plan-summary').innerText()).includes('只比较条带纹'), 'Conflicting appearance and width could be booked');
    await appearance.selectOption(''); await c('father').selectOption('I3');
    check(await plan.isDisabled() && (await c('plan-summary').innerText()).includes('都没有条带纹'), 'Two unbanded parents offered a width comparison');
  }
  await c('mother').selectOption('I1'); await c('father').selectOption('I2');
  await reload();
  check(await goal.inputValue()===direction && await c('mother').inputValue()==='I1' && await c('father').inputValue()==='I2', 'Pairing draft changed across reload');
  if(direction){
    const hint=await c('quality-target').innerText();
    check(hint.includes(direction==='fine-band'?'小枫':'墨点') && hint.includes(direction==='fine-band'?'低于 5':'高于 7'), 'Wrong parent or comparison threshold');
    const before=await data();
    await page.evaluate(()=>{
      const original=Storage.prototype.setItem;
      window.restoreWidthTest=()=>{Storage.prototype.setItem=original;delete window.restoreWidthTest;};
      Storage.prototype.setItem=function(key,value){
        if(key==='aquarium.three.creatures.v1')throw Error('测试写入失败');
        return original.call(this,key,value);
      };
    });
    try{
      await plan.click(); await c('feedback').filter({hasText:'测试写入失败'}).waitFor();
      check(JSON.stringify(await data())===JSON.stringify(before) && await goal.inputValue()===direction, 'A failed save changed the game or draft');
    }finally{await page.evaluate(()=>window.restoreWidthTest());}
  }
  await plan.click(); await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1);
  const batch=(await data()).batches[0];
  check((batch.qualityGoal || '')===direction,'Saved brood lost its observation goal');
  await page.clock.setFixedTime(new Date(batch.adultAt+1000));
  await page.evaluate(()=>aquarium.game.crystalAction({type:'advance'}));
  await reload();
  const grown=(await data()).batches[0], kids=grown.children, ids=kids.map(k=>k.id);
  check(kids.every(k=>k.colour==='black' && k.pattern==='band') && kids.map(k=>k.P[1]).join()==='7,4,7,8','The replayed family changed');
  const row=page.locator('[data-batch-id="'+batch.id+'"]'), review=row.locator(':scope > .crystal-review');
  if(!await review.evaluate(el=>el.open))await review.locator(':scope > summary').click();
  const mode=review.locator('select').first(), gallery=review.locator('.crystal-brood-gallery');
  const ordered=()=>gallery.locator('[data-brood-locate]').evaluateAll(nodes=>nodes.map(el=>el.dataset.broodLocate));
  await gallery.locator('[data-brood-locate]').last().waitFor({state:'visible'});
  const initialView={mode:await mode.inputValue(),order:await ordered(),hidden:await review.locator(':scope > .crystal-baseline').isHidden()};
  check(initialView.mode==='' && initialView.order.join()===ids.join() && initialView.hidden, 'Unexpected first view '+JSON.stringify(initialView));
  let matching=null;
  if(direction){
    await mode.selectOption(direction);
    const expected=direction==='fine-band'?[1,0,2,3]:[3,0,2,1];
    check((await ordered()).join()===expected.map(i=>ids[i]).join(),'White bands sorted in the wrong direction');
    const matches=review.locator('[data-goal-child]');
    check(await matches.count()===1 && await matches.getAttribute('data-goal-child')===ids[expected[0]],'Wrong shrimp counted toward the saved goal');
    matching=expected[0]+1;
    await gallery.locator('[data-brood-locate="'+ids[expected[0]]+'"]').click();
    await c('next-sibling').waitFor();
    check(await c('next-sibling').getAttribute('data-individual')===ids[expected[1]], 'Tank visit order drifted from the chosen comparison');
    await c('tank-next-generation').click();
    check(await goal.inputValue()===direction,'The explicitly chosen direction was lost in the next generation');
  }else{
    const pick=gallery.locator('[data-album-child="'+ids[1]+'"]');
    await pick.locator('xpath=ancestor::details[1]/summary').click(); await pick.click();
    await page.waitForFunction(()=>aquarium.game.data.Breeding.batches[0].representativeId===aquarium.game.data.Breeding.batches[0].children[1].id);
    await reload();
    check((await data()).batches[0].representativeId===ids[1],'The player’s own choice was lost');
  }
  return {direction:direction || '自由观察', rawCoverage:kids.map(k=>k.P[1]), matchedChild:matching, representative:direction?null:2};
}
