async page => {
  // Fresh browser context. All notes, transfers and the simulated write failure belong to this fixture.
  const control=id=>page.locator('#crystal-'+id);
  const check=(ok,why)=>{if(!ok)throw Error(why);};
  const ready=()=>page.waitForFunction(()=>window.aquarium?.ready);
  const action=value=>page.evaluate(value=>aquarium.game.crystalAction(value),value);
  const state=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const openBreeding=async()=>{
    if(await control('panel').isHidden())await control('open').click();
    await control('tab-breed').click();
  };
  const row=id=>control('roster').locator('[data-individual-id="'+id+'"]');
  const note='尾扇前的白带往后斜，我想看看下一窝。';
  await ready(); await page.locator('#welcome-dismiss').click();
  await control('open').click();await control('start').click();await control('panel').waitFor({state:'hidden'});
  await action({type:'plan',motherId:'I1',fatherId:'I2',tankId:'main',size:2});
  const batch=(await state()).batches[0];
  await page.clock.setFixedTime(new Date(batch.hatchAt+2000));await action({type:'advance'});
  const [other,child]=(await state()).batches[0].children.map(r=>r.id);
  for(const id of [other,child])await action({type:'rename',id,name:'小砂'});
  await page.setViewportSize({width:390,height:750});await openBreeding();
  const hatchling=control('batches').locator('[data-hatchling="'+child+'"]');
  await hatchling.locator('[data-brood-locate]').click();
  await control('panel').waitFor({state:'hidden'});
  check(await page.evaluate(()=>aquarium.selected)===child && !await control('tank-observation').isVisible(),'The untouched hatchling had a note or the wrong identity');
  const shape=id=>page.evaluate(id=>aquarium.aq.animals.find(a=>a.id===id).look.uniforms.aqMarkingShape.value.toArray(),id);
  const youngShape=await shape(child);
  check(String(youngShape)!==String(await shape(other)),'The same-pattern siblings share the same silhouette of pigment');
  await control('tank-name').click();
  const input=control('observation'), save=control('save-observation');
  const tankEditor=control('tank-editor'), status=tankEditor.getByRole('status',{includeHidden:true});
  check(await control('panel').isHidden() && await input.evaluate(el=>document.activeElement===el),'Writing an observation hid the tank or opened on another field');
  const fitsTank=()=>control('at-tank').evaluate(el=>{
    const r=el.getBoundingClientRect(),field=el.querySelector('#crystal-observation').getBoundingClientRect();
    return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && r.width*r.height<innerWidth*innerHeight*.36 && field.width>=110;
  });
  check(await fitsTank(),'The note card covered the game at phone width');
  await page.setViewportSize({width:1200,height:840});check(await fitsTank(),'The note card covered the desktop game');
  await page.setViewportSize({width:667,height:375});
  check(await fitsTank() && await control('hud').isHidden(),'The note card collided with other controls on a short screen');
  await page.setViewportSize({width:390,height:750});
  await input.fill('虾'.repeat(61));await save.click();
  await status.filter({hasText:'最多 60'}).waitFor();
  await input.fill(note);
  check(!(await status.textContent()),'A corrected entry still showed the previous error');
  await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});
  check(!(await state()).individuals.find(r=>r.id===child).observation,'Composing Chinese committed the note');
  await page.screenshot({path:'output/playwright/tank-note-after.png'});
  await input.press('Escape');
  check(await control('tank-name').evaluate(el=>document.activeElement===el) && await page.evaluate(()=>aquarium.selected)===child,'Escape lost the observed shrimp');
  await control('next-sibling').click();await control('tank-name').click();
  check(await input.inputValue()==='' && await page.evaluate(()=>aquarium.selected)===other,'A namesake picked up a draft');
  await tankEditor.getByRole('button',{name:'收起',exact:true}).click();
  await control('next-sibling').click();await control('tank-name').click();
  check(await input.inputValue()===note && await page.evaluate(()=>aquarium.selected)===child,'Draft lost when browsing a sibling');
  const before=await state();
  await page.evaluate(()=>{
    const write=Storage.prototype.setItem;
    window.restoreObservationWrite=()=>{Storage.prototype.setItem=write;delete window.restoreObservationWrite;};
    Storage.prototype.setItem=function(key,value){
      if(key==='aquarium.three.creatures.v1' && value.includes('尾扇前'))throw Error('测试存档写入失败');
      return write.call(this,key,value);
    };
  });
  try {
    await save.click();await status.filter({hasText:'测试存档写入失败'}).waitFor();
    check(JSON.stringify(await state())===JSON.stringify(before) && await input.inputValue()===note && await input.evaluate(el=>document.activeElement===el),'Write failure published the note or discarded the draft');
  } finally { await page.evaluate(()=>window.restoreObservationWrite()); }
  await input.press('Enter');
  await control('tank-observation').filter({hasText:note}).waitFor();
  await tankEditor.waitFor({state:'hidden'});
  check(await control('tank-name').evaluate(el=>document.activeElement===el),'Saving failed to return keyboard focus to the tank');
  const recorded=await state(),marked=recorded.individuals.find(r=>r.id===child);
  check(marked.observation===note,'Note was not saved on the chosen child');
  delete marked.observation;
  check(JSON.stringify(recorded)===JSON.stringify(before),'Saving a note also changed breeding');
  // Two unsaved fields can belong to one animal. Committing one leaves the other ready to edit.
  await control('tank-name').click();await input.fill('肩后的白带');
  const toggleName=tankEditor.getByRole('button',{name:'改名字',exact:true});
  await toggleName.click();await control('name').fill('小砂点');await control('name').press('Enter');
  await input.waitFor({state:'visible'});
  check(await input.inputValue()==='肩后的白带' && (await state()).individuals.find(r=>r.id===child).name==='小砂点','Renaming discarded a pending observation');
  await toggleName.click();await control('name').fill('小砂');
  await tankEditor.getByRole('button',{name:'写观察',exact:true}).click();
  await input.press('Enter');await control('name').waitFor({state:'visible'});
  check(await control('name').inputValue()==='小砂' && (await state()).individuals.find(r=>r.id===child).observation==='肩后的白带','Saving the observation discarded a pending name');
  await control('name').press('Enter');await tankEditor.waitFor({state:'hidden'});
  await control('tank-name').click();await input.fill(note);await input.press('Enter');await tankEditor.waitFor({state:'hidden'});
  await control('inspect').click();
  check(await hatchling.locator('[data-brood-locate]').evaluate(el=>document.activeElement===el),'Writing at the tank broke the return to the original brood');
  await control('tab-roster').click();await control('roster-filter').selectOption('observations');
  await row(child).getByText(note,{exact:true}).waitFor();
  check(await control('roster').locator('[data-individual-id]').count()===1 && !marked.protected,'A plain observation required favouriting or included unrelated siblings');
  await row(child).click();
  const records=control('records');
  if(!await records.evaluate(el=>el.open))await records.locator(':scope > summary').click();
  await control('search').fill('小砂 尾扇');
  check(await control('roster').locator('[data-individual-id]').count()===1 && await row(child).isVisible(),'Own words could not distinguish two namesakes');
  await input.fill('肩后的白带');await save.click();
  await control('record-observation').filter({hasText:'肩后的白带'}).waitFor();
  check(await control('search').inputValue()==='' && await row(child).getAttribute('aria-pressed')==='true','Editing the matching words selected a different shrimp');
  await input.fill(note);await save.click();await control('record-observation').filter({hasText:note}).waitFor();
  await input.fill('');await save.click();
  await page.waitForFunction(()=>document.querySelector('#crystal-roster-filter').value==='live');
  check(await row(child).getAttribute('aria-pressed')==='true','Removing the last observation selected an unrelated animal');
  await input.fill(note);await save.click();await control('record-observation').filter({hasText:note}).waitFor();
  await control('tab-breed').click();await hatchling.getByText('我的观察 · '+note,{exact:true}).waitFor();
  await action({type:'move',id:child,tankId:'breeding'});
  await page.clock.setFixedTime(new Date(batch.adultAt+3*86400000));await page.reload();await ready();
  await control('open').click();await control('roster-filter').selectOption('observations');
  await row(child).getByText(note,{exact:true}).waitFor();
  check(await row(child).getByText(/繁育缸/).isVisible(),'The observations list lost the new home of the grown animal');
  await row(child).locator('img').waitFor({state:'visible'});
  await control('roster').screenshot({path:'output/playwright/shrimp-with-my-notes.png'});
  await action({type:'rest',id:child});
  await row(child).getByText(/静养处/).waitFor(); await row(child).click();
  check(!await control('focus').isEnabled() && (await control('record-observation').textContent()).includes(note),'Resting shrimp lost its observation or could still be located in a tank');
  await action({type:'recall',id:child,tankId:'breeding'});
  await row(child).getByText(/繁育缸/).waitFor();
  await openBreeding();
  const review=page.locator('[data-batch-id="'+batch.id+'"] > .crystal-review');
  if(!await review.evaluate(el=>el.open))await review.locator(':scope > summary').press('Enter');
  const locate=review.locator('.crystal-brood-gallery [data-brood-locate="'+child+'"]');
  await review.locator('.crystal-brood-gallery .crystal-keeper-note').filter({hasText:note}).waitFor();
  await locate.click();await control('panel').waitFor({state:'hidden'});
  check(await page.evaluate(()=>aquarium.selected)===child && await page.evaluate(()=>aquarium.game.data.BreedingRooms.activeId)==='breeding','Tank visit selected another namesake or room');
  check((await control('tank-observation').innerText()).includes(note),'Tank omitted the note on the adult');
  check(String(await shape(child))===String(youngShape),'The pigment geometry changed after adulthood, room transfer and reload');
  await control('at-tank').screenshot({path:'output/playwright/found-shrimp-observation.png'});
  await control('inspect').click();
  check(await locate.evaluate(el=>document.activeElement===el),'Tank visit did not return to the original child');
  const sex=(await state()).individuals.find(r=>r.id===child).sex;
  const parent=control(sex==='female'?'mother':'father');await parent.selectOption(child);
  await parent.locator('xpath=ancestor::section[1]').getByText('我的观察 · '+note,{exact:true}).waitFor();
  await action({type:'sell',id:child});
  await control('tab-roster').click();await control('roster-filter').selectOption('observations');await row(child).click();
  check((await row(child).innerText()).includes('已售档案') && !await control('focus').isEnabled(),'A transferred shrimp was shown as a tank resident');
  check((await control('record-observation').innerText()).includes(note) && !await save.isVisible(),'Archived observation was lost or editable');

  // Render the actual game materials, then measure the markings at thumbnail scale.
  // A per-ID uniform alone would also pass if the shell shader stopped using it.
  const samples=await page.evaluate(async ids=>{
    const {createCrystalPortraits}=await import('/src/crystal-portraits.js');
    const renderer=createCrystalPortraits(aquarium.aq), canvas=document.createElement('canvas');
    canvas.width=144;canvas.height=84;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}), results=[];
    async function pigment(id,colour,pattern,coverage){
      const image=new Image();
      image.src=await renderer.get({id,sex:'female',colour,pattern,P:[6,coverage,6],adultAt:100},101);
      await image.decode();
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const {data}=ctx.getImageData(0,0,canvas.width,canvas.height), mask=[];
      for(let i=0;i<data.length;i+=4){
        const [r,g,b,alpha]=data.subarray(i,i+4);
        mask.push(alpha>180 && (colour==='red'?r-Math.max(g,b)>55:Math.max(r,g,b)<128));
      }
      return mask;
    }
    try{
      for(const colour of ['red','black'])for(const pattern of ['band','hinomaru','mosura']){
        const first=await pigment(ids[0],colour,pattern,5),second=await pigment(ids[1],colour,pattern,5);
        const count=mask=>mask.filter(Boolean).length;
        const low=count(await pigment(ids[0],colour,pattern,2)),high=count(await pigment(ids[0],colour,pattern,8));
        let changed=0,area=0;
        for(let i=0;i<first.length;i++){
          if(first[i]||second[i])area++;
          if(first[i]!==second[i])changed++;
        }
        results.push({colour,pattern,changed,area,low,mid:count(first),high});
      }
      return results;
    }finally{renderer.dispose();}
  },[other,child]);
  for(const sample of samples){
    check(sample.changed>sample.area*.06 && sample.low>sample.mid && sample.mid>sample.high,
      'Markings indistinguishable or coverage reversed at thumbnail scale: '+JSON.stringify(sample));
  }
}
