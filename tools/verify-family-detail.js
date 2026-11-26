async (page, screenshotPath) => {
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const control=id=>page.locator('#crystal-'+id);
  const dialog=control('pair-photos'), growth=control('tank-growth');
  const action=value=>page.evaluate(a=>aquarium.game.crystalAction(a),value);
  const state=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const advance=async t=>{await page.clock.setFixedTime(new Date(t));await action({type:'advance'});};
  const history=()=>page.evaluate(()=>{
    const {cash,rngState,batches,individuals}=aquarium.game.data.Breeding;
    return JSON.stringify([cash,rngState,batches,individuals]);
  });
  const largePhotos=ids=>page.waitForFunction(ids=>{
    const figures=[...document.querySelectorAll('#crystal-pair-photos[open] figure')];
    return figures.length===2 && figures.every((f,i)=>{
      const img=f.querySelector('img');
      return f.dataset.individual===ids[i] && !img.hidden && img.complete && img.naturalWidth===1152;
    });
  },ids);
  const dimensions=()=>dialog.locator('figure').evaluateAll(figs=>figs.map(figure=>{
    const img=figure.querySelector('img'), rect=figure.querySelector('.sibling-print').getBoundingClientRect();
    return {id:figure.dataset.individual,caption:figure.querySelector('figcaption').textContent,
      windowWidth:Math.round(rect.width),sourceWidth:img.naturalWidth,sourceHeight:img.naturalHeight,
      imageWidth:Math.round(img.getBoundingClientRect().width),transform:getComputedStyle(img).transform};
  }));
  const crop=key=>dialog.locator('button[data-crop="'+key+'"]');
  const familyChoice=(container,key)=>container.locator('button[data-reference="'+key+'"]');
  const visit=async id=>{
    if(await control('panel').isHidden())await control('open').click();
    await control('tab-roster').click();
    await control('roster').locator('[data-individual-id="'+id+'"]').click();
    await control('focus').click();await control('panel').waitFor({state:'hidden'});
    await page.waitForFunction(id=>aquarium.selected===id,id);
  };
  const openMother=async()=>{
    if(!await growth.evaluate(el=>el.open))await growth.locator('summary').click();
    await familyChoice(growth,'mother').click();
    await control('family-closeup').click();
  };
  await page.setViewportSize({width:390,height:800});
  await page.locator('#welcome-dismiss').click();await control('activity').click();await control('start').click();
  await control('panel').waitFor({state:'hidden'});
  await page.evaluate(async()=>{
    const game=aquarium.game, save=game.snapshot();
    save.session.Breeding.rngState=7;await game.restore(save);
  });
  await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())));
  const note='想看看孩子头上的红斑有多大。';
  await action({type:'observation',id:'I4',value:note});
  await control('open').click();await control('tab-breed').click();
  await control('mother').selectOption('I4');
  if(await control('father').locator('option[value=""]').count()){
    await control('father').selectOption('');
    check(await control('pair-closeup').isHidden(),'A pair was offered before both parents were chosen');
  }
  await control('father').selectOption('I2');await control('breeding-tank').selectOption('main');
  await control('brood-size').selectOption('2');
  const before=await history(), initial=await page.evaluate(()=>aquarium.game.snapshot());
  const parentThumb=page.getByRole('button',{name:'并排细看亲虾，母虾照片',exact:true});
  await parentThumb.click();await largePhotos(['I4','I2']);await crop('head').click();
  const parents=await dimensions();
  check((await dialog.locator('figure').first().innerText()).includes(note),'The keeper’s own note was missing');
  check(parents[0].transform===parents[1].transform && parents[0].imageWidth===parents[1].imageWidth,'Parent portraits use different crops');
  check(await parentThumb.locator('img').evaluate(img=>getComputedStyle(img).transform==='none'),'The mother thumbnail stayed mirrored');
  await page.evaluate(()=>{window.parentSidePrints=[...document.querySelectorAll('#crystal-pair-photos img')].map(im=>im.src);});
  await crop('back').click();await largePhotos(['I4','I2']);
  check(await page.evaluate(()=>{
    window.parentPrints=[...document.querySelectorAll('#crystal-pair-photos img')].map(im=>im.src);
    return window.parentPrints.every((p,i)=>p!==window.parentSidePrints[i]);
  }),'The pairing-time dorsal photographs still show the parents in profile');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  check(await parentThumb.evaluate(el=>el===document.activeElement),'Escape lost the originating photo');
  const natural=page.locator('details.crystal-natural');
  await natural.locator(':scope > summary').click();
  const expected=await page.evaluate(async()=>{const {naturalPair}=await import('/src/crystal-breeding.js');return naturalPair(aquarium.game.data.Breeding);});
  await control('natural-closeup').click();await largePhotos([expected.motherId,expected.fatherId]);
  await dialog.locator('[data-close]').click();await natural.locator(':scope > summary').click();
  check(before===await history() && await control('mother').inputValue()==='I4' && await control('father').inputValue()==='I2','Observation changed the planned pair or breeding ledger');
  await control('plan').click();await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1);
  const batch=(await state()).batches[0];
  await advance(batch.hatchAt+500);
  const kid=(await state()).batches[0].children[0].id;
  await action({type:'rename',id:kid,name:'小米'});
  await visit(kid);await openMother();await largePhotos(['I4',kid]);
  const newbornPair=await dimensions();
  const liveRatio=await page.evaluate(id=>{
    const scale=id=>{const a=aquarium.aq.animals.find(a=>a.id===id);return a.rig.scale.x/a.baseScale;};
    return scale(id)/scale('I4');
  },kid);
  check(Math.abs(newbornPair[1].imageWidth/newbornPair[0].imageWidth-liveRatio)<.015,'The hatchling and parent photos disagree with their in-tank sizes');
  await crop('back').click();await largePhotos(['I4',kid]);
  const hatchDetails=await dimensions();
  check(hatchDetails[0].imageWidth===hatchDetails[1].imageWidth,'Detail view shrank the newborn markings');
  await page.evaluate(()=>{window.firstBabyPrint=document.querySelectorAll('#crystal-pair-photos img')[1].src;});
  await advance(batch.adultAt+500);await largePhotos(['I4',kid]);
  await page.waitForFunction(()=>document.querySelectorAll('#crystal-pair-photos img')[1].src!==window.firstBabyPrint);
  const matureLedger=await history();
  check(await crop('back').getAttribute('aria-pressed')==='true','Growing up reset the selected crop');
  check(await page.evaluate(()=>document.querySelector('#crystal-pair-photos img').src===window.parentPrints[0]),'Mother no longer shows her pairing-time photograph');
  await familyChoice(dialog,'father').click();await largePhotos(['I2',kid]);
  check(await crop('back').getAttribute('aria-pressed')==='true' && await page.evaluate(()=>document.querySelector('#crystal-pair-photos img').src===window.parentPrints[1]),'Father reference or crop changed');
  await familyChoice(dialog,'hatch').click();await largePhotos([kid,kid]);
  check(await page.evaluate(()=>document.querySelector('#crystal-pair-photos img').src===window.firstBabyPrint),'Childhood and adult photos were mixed up');
  await crop('whole').click();await largePhotos([kid,kid]);
  const lifeStages=await dimensions();
  check(Math.abs(lifeStages[0].imageWidth/lifeStages[1].imageWidth-.45)<.01,'Childhood and adulthood were framed at the same apparent length');
  check((await dialog.locator('button[data-reference]').allTextContents()).join(',')==='小时候,母虾,公虾','References changed order as the child grew');
  await familyChoice(dialog,'mother').click();await largePhotos(['I4',kid]);await crop('head').click();
  await largePhotos(['I4',kid]);
  check(await page.evaluate(()=>document.querySelector('#crystal-pair-photos img').src===window.parentSidePrints[0]),'The historic side photograph changed');
  const familyMobile=await dimensions();
  check(familyMobile[0].imageWidth===familyMobile[1].imageWidth,'The parent and child magnifications differ');
  const seen=await page.evaluate(ids=>ids.map(id=>{
    const record=aquarium.game.data.Breeding.individuals.find(r=>r.id===id);
    const look=aquarium.aq.animals.find(a=>a.id===id).look.uniforms;
    return {id,colour:record.colour,pattern:record.pattern,livePattern:look.aqCrystalPattern.value,
      coverage:look.aqCrystalCoverage.value,expectedCoverage:Math.max(0,Math.min(1,(record.P[1]-1)/8))};
  }),['I4',kid]);
  check(seen.every(r=>r.livePattern==={band:0,hinomaru:1,mosura:2}[r.pattern] && Math.abs(r.coverage-r.expectedCoverage)<1e-6),'Visible tank individuals disagreed with family records');
  await page.setViewportSize({width:844,height:390});
  const fits=await dialog.evaluate(d=>{
    const bounds=d.getBoundingClientRect();
    return d.scrollWidth<=d.clientWidth && bounds.bottom<=innerHeight && [...d.querySelectorAll('button')].filter(b=>b.getClientRects().length).every(b=>{
      const r=b.getBoundingClientRect();return r.top>=bounds.top && r.bottom<=bounds.bottom && r.width>0 && r.height>=42;
    });
  });
  check(fits,'Comparison controls extended outside the landscape viewport');
  if(screenshotPath)await dialog.screenshot({path:screenshotPath});
  await dialog.locator('[data-close]').click();
  check(await history()===matureLedger && await page.evaluate(()=>aquarium.selected)===kid,'Comparing photos changed the family or tank selection');
  await action({type:'rename',id:'I4',name:'小枫'});await action({type:'rest',id:'I4'});
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready);
  await visit(kid);await openMother();await largePhotos(['I4',kid]);
  check((await dialog.locator('figcaption').first().innerText()).includes('小枫') && (await state()).individuals.find(r=>r.id==='I4').tank==='rest','Resting mother lost her record after reload');
  await page.evaluate(save=>aquarium.game.restore(save),initial);
  await dialog.waitFor({state:'hidden'});
  check((await state()).batches.length===0 && await dialog.locator('img').count()===0,'A replaced save kept the old family open');
  return {parents,natural:[expected.motherId,expected.fatherId],familyMobile,seen,landscapeFits:fits,
    observationPreservedDraft:true,childGrewWhileOpen:true,parentAndChildhoodPhotosStable:true,
    optionalAndReadOnly:true,restingParentOnReload:true,restoringEarlierSaveClosed:true};
}
