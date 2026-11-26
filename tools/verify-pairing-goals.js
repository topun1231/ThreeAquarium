async page => {
  // Start with a fresh, isolated 5174 browser context. Its clock advances to adulthood.
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const control=id=>page.locator('#crystal-'+id);
  const ready=()=>page.waitForFunction(()=>window.aquarium?.ready);
  const openBreeding=async()=>{
    await control('open').click();
    await control('tab-breed').click();
  };
  await ready();
  await page.locator('#welcome-dismiss').click();
  await control('open').click();
  await control('start').click();
  await control('panel').waitFor({state:'hidden'});
  await openBreeding();
  const chips=control('offspring-choices').locator('button:visible');
  check(await chips.count()===0,'Choices appeared before both parents were selected');
  const appearance=control('brood-goal'), quality=control('quality-goal');
  await control('mother').selectOption('I4');
  await appearance.selectOption('black:mosura');
  await quality.selectOption('coverage');
  await page.locator('[data-browse-parent="male"]').click();
  const candidates=control('roster').locator('[data-individual-id]');
  const candidateIds=()=>candidates.evaluateAll(els=>els.map(e=>e.dataset.individualId));
  const originalOrder=await candidateIds();
  check(originalOrder.length>=2 && !await control('pick-parent').isVisible(),'A mate was selected by the journal');
  check((await candidates.allTextContents()).every(t=>!t.includes('%') && !t.includes('选这对')),'Mate suggestions leaked before comparison');
  await control('pick-analysis').check();
  check((await candidates.allTextContents()).some(t=>t.includes('%')),'Opt-in comparison did not show chances');
  await control('pick-analysis').uncheck();
  check(String(originalOrder)===String(await candidateIds()),'Closing comparison did not restore the neutral order');
  await control('roster').locator('[data-individual-id="I2"]').click();
  await control('pick-parent').click();
  check(await control('father').inputValue()==='I2' && await chips.count()===0,'Selecting a mate revealed the outcome');
  await page.locator('.crystal-natural > summary').click();
  // The native details toggle fills this paragraph in its queued event.
  await control('natural-summary').filter({hasText:/\S/}).waitFor();
  check((await control('natural-summary').innerText()).includes('45 分钟'),'Missing natural brood schedule');
  check(await page.locator('.crystal-natural .crystal-pick-actions button:visible').count()===0,'Natural brood revealed probabilities by default');
  await page.getByText('查看自然配对的花色概率',{exact:true}).click();
  await page.locator('.crystal-natural .crystal-pick-actions button:visible').first().click();
  check(await control('brood-goal').inputValue(),'Natural pair did not carry its goal into the draft');
  await control('mother').selectOption('I4');
  await control('father').selectOption('I2');
  await quality.selectOption('coverage');
  await appearance.selectOption('black:hinomaru');
  check(await control('plan').isDisabled() && (await control('plan-summary').innerText()).includes('还缺'),'An unreachable goal did not explain the restriction');
  await control('pair-rules').locator('summary').press('Enter');
  check(await chips.count()===4 && (await chips.allTextContents()).every(t=>t.includes('25%')),'Incorrect cross-product branches');
  await page.setViewportSize({width:390,height:750});
  const chip=chips.filter({hasText:'黑晶白头纹'});
  await chip.click();
  check(await appearance.inputValue()==='black:mosura' && await chip.getAttribute('aria-pressed')==='true','Choice did not select the matching goal');
  check(await chip.evaluate(el=>el===document.activeElement),'Choosing a goal lost keyboard focus');
  check(await chips.evaluateAll(els=>els.every(e=>e.getBoundingClientRect().right<=innerWidth)),'Choices overflow on narrow screens');
  await chip.press('Space');
  check(await appearance.inputValue()==='' && await chip.getAttribute('aria-pressed')==='false','Toggling the choice did not clear the goal');
  await chip.press('Enter');
  check(await quality.inputValue()==='coverage','Appearance choice discarded the quality goal');
  check(await page.evaluate(()=>aquarium.game.data.Breeding.batches.length===0),'Clicking a goal started a brood');
  await page.reload();
  await ready();
  await openBreeding();
  check(await appearance.inputValue()==='black:mosura' && await chips.count()===0 && await quality.inputValue()==='coverage','Draft or default observation view was not restored');
  check((await control('plan-summary').innerText()).includes('约 10 分钟后孵化，约 45 分钟后可比较成年品质'),'Wrong planned brood timing');
  await control('plan').click();
  await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1);
  const batch=await page.evaluate(()=>aquarium.game.data.Breeding.batches[0]);
  check(batch.goal==='black:mosura' && batch.qualityGoal==='coverage' && batch.motherId==='I4' && batch.fatherId==='I2','Confirmed brood differs from draft');
  await page.clock.setFixedTime(new Date(batch.hatchAt+5000));
  await page.reload();
  await ready();
  const hatchDistances=await page.evaluate(()=>{
    const {world,game}=aquarium, brood=game.data.Breeding.batches[0];
    const mother=world.agentsById.get(brood.motherId);
    return brood.children.map(child=>world.agentsById.get(child.id).position.distanceTo(mother.position));
  });
  check(hatchDistances.length===2 && hatchDistances.every(d=>d>.005 && d<.12),'New hatchlings appeared away from the mother on a fresh reload');
  await openBreeding();
  const hatchlings=control('batches').locator('[data-hatchling]');
  await hatchlings.first().waitFor();
  check(await hatchlings.count()===2 && !(await control('growth-messages').innerText()).includes('符合目标'),'Hatching message revealed target offspring');
  check((await hatchlings.allTextContents()).every(t=>!t.includes('符合目标') && !t.includes('分')),'Juveniles leaked a result');
  const picked=await hatchlings.last().getAttribute('data-hatchling');
  const hatchPicture=hatchlings.last().locator('img');
  await hatchPicture.waitFor({state:'visible'});
  const juvenileSrc=await hatchPicture.getAttribute('src');
  await control('tab-roster').click();
  await control('roster-filter').selectOption('juvenile');
  await control('roster').locator('[data-individual-id="'+picked+'"]').click();
  await control('focus').click();
  await control('panel').waitFor({state:'hidden'});
  check(await control('tank-favorite').getAttribute('data-individual')===picked,'The tank opened another hatchling');
  await control('tank-favorite').click();
  await page.waitForFunction(id=>aquarium.game.data.Breeding.individuals.find(r=>r.id===id).protected,picked);
  await control('tank-name').click();
  await control('tank-editor').getByRole('button',{name:'改名字',exact:true}).click();
  await control('name').fill('小砂'); await control('rename').click();
  await page.waitForFunction(id=>aquarium.game.data.Breeding.individuals.find(r=>r.id===id).name==='小砂',picked);
  const hatchSave=await page.context().storageState();
  await openBreeding();
  const middleAt=(batch.hatchAt+batch.adultAt)/2;
  const middleSrc=await page.evaluate(async({id,at})=>{
    const {createCrystalPortraits}=await import('/src/crystal-portraits.js');
    const state=aquarium.game.data.Breeding, kid=state.individuals.find(r=>r.id===id);
    const photos=createCrystalPortraits(aquarium.aq,()=>state);
    try{return await photos.get(kid,at,true);}finally{photos.dispose();}
  },{id:picked,at:middleAt});
  check(middleSrc,'Could not render the growing shrimp');
  await hatchlings.last().locator('[data-brood-locate]').focus();
  await page.clock.setFixedTime(new Date(middleAt));
  await page.waitForFunction(({id,src,at})=>aquarium.game.data.Breeding.now>=at &&
    document.querySelector('[data-hatchling="'+id+'"] img')?.src===src,{id:picked,src:middleSrc,at:middleAt});
  check(await page.evaluate(()=>document.activeElement?.dataset.broodLocate)===picked,'Updating the hatchling photo moved keyboard focus');
  await control('tab-roster').click();
  await control('roster-filter').selectOption('juvenile');
  await control('roster').locator('[data-individual-id="'+picked+'"]').click();
  await page.waitForFunction(src=>document.querySelector('.crystal-hero')?.src===src,middleSrc);
  const grades=page.locator('summary').filter({hasText:'查看成年品质'});
  check(await grades.count()===1 && !await grades.isVisible(),'A growing shrimp exposed its adult grades');
  await page.clock.setFixedTime(new Date(batch.adultAt+5000));
  await page.reload();
  await ready();
  await openBreeding();
  await page.waitForFunction(()=>aquarium.game.data.Breeding.batches[0]?.status==='complete');
  const review=page.locator('#crystal-batches .crystal-review');
  check(!(await control('growth-messages').innerText()).includes('达标'),'Adult inbox announced the result before opening the family');
  await control('growth-messages').locator('[data-growth-journal="'+batch.id+'"]').click();
  const cards=review.locator('.crystal-brood-gallery .crystal-child');
  const ids=await page.evaluate(()=>aquarium.game.data.Breeding.batches[0].children.map(r=>r.id));
  check(await page.evaluate(()=>document.activeElement?.dataset.broodLocate)===picked,'The growth message did not return to the shrimp chosen beside the tank');
  check((await cards.last().innerText()).includes('小砂') && await cards.last().getByRole('button',{name:/^收藏/}).getAttribute('aria-pressed')==='true','Child identity, name or protection changed at adulthood');
  check(ids.length===2 && String(ids)===String(await cards.locator('[data-brood-locate]').evaluateAll(els=>els.map(e=>e.dataset.broodLocate))),'Opening the family changed birth order');
  check(await review.locator('.crystal-observation:visible,[data-alternative-child]:visible,[data-goal-child]:visible').count()===0,'Family ranked the shrimp before the player compared them');
  check(await cards.evaluateAll(els=>els.every(e=>e.getBoundingClientRect().right<=innerWidth)),'Family gallery overflows on a narrow screen');
  await page.waitForFunction(()=>[...document.querySelectorAll('.crystal-brood-gallery img')].every(img=>img.naturalWidth>0));
  const adultSrc=await cards.last().locator('img').getAttribute('src');
  const reviewMode=review.locator('select').first();
  await reviewMode.selectOption('coverage');
  check((await review.innerText()).includes('黑晶白头纹') && (await review.innerText()).includes('本窝最高'),'Opt-in comparison missing the original goal or visible scores');
  const familyBefore=await page.evaluate(()=>JSON.stringify(aquarium.game.data.Breeding));
  await reviewMode.selectOption('growth');
  const plate=cards.last().locator('.crystal-age-pair');
  await plate.locator('img').first().waitFor({state:'visible'});
  await plate.locator('img').last().waitFor({state:'visible'});
  check(await plate.locator('img').first().getAttribute('src')===juvenileSrc,'The historical portrait differs from this shrimp at hatching');
  check(await plate.locator('img').last().getAttribute('src')===adultSrc,'The adult portrait differs from the live record');
  const earlierSizeRatio=()=>plate.locator('img').evaluateAll(([young,adult])=>young.getBoundingClientRect().width/adult.getBoundingClientRect().width);
  check(Math.abs(await earlierSizeRatio()-.45)<.01,'The newborn and adult records do not reflect the change in body length');
  check(String(ids)===String(await cards.locator('[data-brood-locate]').evaluateAll(els=>els.map(e=>e.dataset.broodLocate))) && !(await review.innerText()).includes('本窝最高'),'Growth view ranked siblings');
  check(await plate.locator('figure').evaluateAll(els=>{const [a,b]=els.map(e=>e.getBoundingClientRect());return a.right<=b.left+1 && b.right<=innerWidth && Math.abs(a.width-b.width)<2 && Math.abs(a.top-b.top)<2;}),'The two stages are not comparable at phone width');
  const whenYoung=review.getByRole('combobox',{name:'和成年时对照'});
  await whenYoung.selectOption('middle');
  await plate.locator('img').first().waitFor({state:'visible'});
  await plate.locator('img').last().waitFor({state:'visible'});
  check(await plate.locator('img').first().getAttribute('src')===middleSrc && await plate.locator('img').last().getAttribute('src')===adultSrc,'Reconstructed middle and adult appearances differ from this shrimp in the roster');
  check(Math.abs(await earlierSizeRatio()-.725)<.01,'The half-grown shrimp is not shown at its in-tank size relative to adulthood');
  const fullyVisible=await review.locator('.crystal-growth-photo img').evaluateAll(async images=>{
    for(const image of images){
      await image.decode();
      const art=image.getBoundingClientRect(), clip=image.parentElement.getBoundingClientRect();
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
        if(data[(y*canvas.width+x)*4+3]<128)continue;
        const px=art.left+(x+.5)*art.width/canvas.width, py=art.top+(y+.5)*art.height/canvas.height;
        if(px<clip.left || px>clip.right || py<clip.top || py>clip.bottom)return false;
      }
    }
    return true;
  });
  check(fullyVisible,'The mobile growth photo cropped a shrimp');
  check(await page.evaluate(()=>JSON.stringify(aquarium.game.data.Breeding))===familyBefore,'Looking at portraits modified the breeding save');
  await page.reload();await ready();await openBreeding();
  await control('resume-comparison').click();
  check(await reviewMode.inputValue()==='growth' && await page.evaluate(()=>document.activeElement?.dataset.broodLocate)===picked,'Resuming lost the individual or the chosen comparison');
  check(await whenYoung.inputValue()==='middle','Resuming the journal lost the selected age');
  const last=cards.last();
  check(await last.getByRole('button',{name:/^收藏/}).getAttribute('aria-pressed')==='true','The chosen sibling lost its protection after reload');
  await last.locator('[data-brood-locate]').click();
  await control('panel').waitFor({state:'hidden'});
  check(await control('tank-favorite').getAttribute('data-individual')===picked && (await control('inspect').innerText()).includes('小砂'),'Adult tank visit lost the chosen individual');
  await control('inspect').click();
  check(await reviewMode.inputValue()==='growth' && await page.evaluate(()=>document.activeElement?.dataset.broodLocate)===picked,'Returning from the tank lost the growth comparison');
  await last.locator('.crystal-child-actions > summary').click();
  await last.getByRole('button',{name:'用它育下一代',exact:true}).click();
  check((await control('panel').getAttribute('data-page'))==='roster' && !await control('pick-parent').isVisible(),'Continuing with a child preselected a mate');
  check(await quality.inputValue()==='coverage','The growth view replaced the original breeding goal');
  const childSex=await page.evaluate(id=>aquarium.game.data.Breeding.individuals.find(r=>r.id===id).sex,ids[1]);
  check(await control(childSex==='female'?'mother':'father').inputValue()===ids[1],'The next draft lost the player’s chosen child');

  // A game save can travel without its local UI bookmark. Exercise both favourite counts.
  const url=page.url(), origin=hatchSave.origins.find(entry=>entry.origin===new URL(url).origin);
  const bookmarkKey='aquarium.three.last-brood-comparison';
  const gameOnly={...origin,localStorage:origin.localStorage.filter(entry=>entry.name!==bookmarkKey)};
  for(const multiple of [false,true]){
    const context=await page.context().browser().newContext({storageState:{cookies:[],origins:[gameOnly]}});
    try {
      const fresh=await context.newPage();
      const openAt=async(at)=>{
        await fresh.clock.setFixedTime(new Date(at));
        await fresh.goto(url); await fresh.waitForFunction(()=>window.aquarium?.ready);
        await fresh.locator('#crystal-open').click();await fresh.locator('#crystal-tab-breed').click();
      };
      if(multiple){
        await openAt(batch.hatchAt+5000);
        await fresh.locator('[data-hatchling]').first().getByRole('button',{name:/^收藏/}).click();
        await fresh.waitForFunction(id=>aquarium.game.data.Breeding.individuals.find(r=>r.id===id).protected,ids[0]);
      }
      await openAt(batch.adultAt+5000);
      await fresh.locator('[data-growth-journal="'+batch.id+'"]').click();
      const opened=fresh.locator('.crystal-review[open]');
      const focused=await fresh.evaluate(()=>document.activeElement?.dataset.broodLocate);
      if(multiple){
        check(!focused && await opened.locator(':scope > summary').evaluate(el=>el===document.activeElement),'A multi-favourite litter picked an individual on behalf of the player');
        check(await opened.locator('.crystal-child-tools button[aria-pressed="true"]').count()===2,'A favourite was lost from the brood');
      }else{
        check(focused===picked,'A transferred save lost its only favourite on the adult event');
        await fresh.evaluate(({key,id})=>{
          const bookmark=JSON.parse(localStorage.getItem(key)); delete bookmark.view;
          bookmark.trait='coverage'; bookmark.child=id;
          for(const storage of [localStorage,sessionStorage])storage.setItem(key,JSON.stringify(bookmark));
        },{key:bookmarkKey,id:picked});
        await openAt(batch.adultAt+5000);
        await fresh.locator('#crystal-resume-comparison').click();
        check(await opened.locator('select').first().inputValue()==='coverage','A previous-version comparison bookmark lost its quality selection');
      }
    }finally{await context.close();}
  }
}
