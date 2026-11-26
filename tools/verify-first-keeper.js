async page => {
  const check=(condition,reason)=>{if(!condition)throw Error(reason);};
  const control=id=>page.locator('#crystal-'+id);
  const state=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const watching=()=>page.evaluate(()=>aquarium.selected || null);
  const panel=control('panel'), field=panel.locator('.crystal-arrival');
  const card=id=>control('roster').locator('[data-individual-id="'+id+'"]');
  const picked=control('roster').locator('[aria-pressed="true"]');
  const close=()=>panel.locator('.crystal-close').click();
  const ready=()=>page.waitForFunction(()=>window.aquarium?.ready);
  await page.setViewportSize({width:390,height:750});
  await page.locator('#welcome-dismiss').click();
  const original=await state(), residents=original.individuals.map(r=>r.id);
  check(original.starterPending && residents.length===10,'A fresh sample must start with its own ten residents');
  await control('activity').click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.crystal-arrival img')).filter(img=>!img.hidden && img.complete && img.naturalWidth).length===7);
  check(await panel.getByRole('heading',{name:'迎接第一批水晶虾'}).isVisible(),'Arrival prompt opened the wrong page');
  check(await control('page-roster').isHidden() && await field.getByRole('radio').count()===8,'Residents obscured the arrival portraits');
  check(await field.locator('input[value="-1"]').isChecked() && !await watching(),'A shrimp was picked just by opening the gallery');
  const fits=await control('start').evaluate(el=>{
    const box=el.getBoundingClientRect();
    return box.left>=0 && box.right<=innerWidth && box.bottom<=innerHeight && box.top>=0;
  });
  check(fits,'The adoption button fell outside the phone screen');
  await panel.getByRole('button',{name:'先看缸里的虾'}).click();
  check(await control('roster').getByRole('button').count()===10 && !await picked.count() && !await watching(),'Browsing residents chose or adopted an animal');
  await close(); await control('activity').click();
  const choice=field.locator('input[value="3"]');
  await choice.check();
  check((await control('start').innerText()).includes('雪团'),'The adoption action omitted the chosen name');
  const raw=()=>page.evaluate(()=>localStorage.getItem('aquarium.three.creatures.v1'));
  const beforeSave=await raw();
  await page.evaluate(()=>{
    const write=Storage.prototype.setItem;
    window.releaseKeeperSave=()=>{Storage.prototype.setItem=write;delete window.releaseKeeperSave;};
    Storage.prototype.setItem=function(key,value){
      if(key==='aquarium.three.creatures.v1')throw Error('模拟首批入住保存失败');
      return write.call(this,key,value);
    };
  });
  try{
    await control('start').click();
    await panel.locator('#crystal-feedback.is-error').waitFor();
    const failed=await state();
    check(failed.individuals.length===10 && failed.starterPending && await choice.isChecked() && await raw()===beforeSave,'Failed save changed residents or lost the chosen shrimp');
  }finally{await page.evaluate(()=>window.releaseKeeperSave());}
  await control('start').click(); await panel.waitFor({state:'hidden'});
  const stocked=await state();
  check(!stocked.starterPending && stocked.individuals.length===17 && stocked.cash===original.cash && residents.every(id=>stocked.individuals.some(r=>r.id===id)),'Successful adoption duplicated the gift or lost original residents');
  check(await watching()==='I4','The chosen founder is not the animal at the tank');
  await control('open').click(); await card('I4').waitFor();
  check(await card('I4').getAttribute('aria-pressed')==='true','The book forgot the chosen founder');
  await control('search').fill('墨点');
  check(await card('I2').isVisible() && !await picked.count() && await control('individual').isHidden() && await watching()==='I4','A search result replaced the watched animal');
  await control('search').fill('查无此虾');
  check(!await control('roster').getByRole('button').count() && await watching()==='I4','An empty search lost the watched animal');
  await control('search').fill('');
  check(await card('I4').getAttribute('aria-pressed')==='true','Clearing search lost the original selection');
  await control('search').fill('墨点'); await card('I2').focus(); await page.keyboard.press('Enter');
  check(await watching()==='I2','Keyboard confirmation did not select the chosen result');
  await control('search').fill(''); await card('I4').click(); await close();
  await control('shortcut-breed').click();
  check(await control('mother').inputValue()==='I4','Starting a brood with the inspected female lost her identity');
  await card('I2').click(); await control('pick-parent').click();
  await control('breeding-tank').selectOption('main'); await control('brood-size').selectOption('2');
  await control('plan').click(); await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1);
  const batch=(await state()).batches[0];
  check(batch.motherId==='I4' && batch.fatherId==='I2','The first brood used different parents');
  const advance=async time=>{
    await page.clock.setFixedTime(new Date(time));
    await page.evaluate(()=>aquarium.game.crystalAction({type:'advance'}));
    return state();
  };
  const hatched=await advance(batch.hatchAt+1);
  check(hatched.batches[0].status==='hatched' && hatched.individuals.length===19,'The first two children did not arrive in the main tank');
  const grown=await advance(batch.adultAt+1), kids=grown.batches[0].children.map(r=>r.id);
  await page.reload(); await ready();
  const recovered=await state();
  check(recovered.batches[0].status==='complete' && kids.length===2 && kids.every(id=>recovered.individuals.some(r=>r.id===id && r.tank==='main')) && recovered.individuals.length===19 && recovered.starterPending!==true,'Reload lost the first brood or offered the gift twice');
  return {original:residents.length,portraits:7,afterAdoption:stocked.individuals.length,chosen:'I4',afterActivelyChoosing:'I2',afterHatching:hatched.individuals.length,children:kids,saveRetry:true,restored:recovered.batches[0].status,phoneActionFits:fits};
}
