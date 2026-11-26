async page => {
  // Use a fresh browser context. Both generations are born through regular breeding transactions.
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const control=id=>page.locator('#crystal-'+id);
  const action=value=>page.evaluate(value=>aquarium.game.crystalAction(value),value);
  const state=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const at=async time=>{await page.clock.setFixedTime(new Date(time));await action({type:'advance'});};
  const openBook=async()=>{if(await control('panel').isHidden())await control('open').click();await control('tab-roster').click();};
  const row=id=>control('roster').locator('[data-individual-id="'+id+'"]');
  const visit=async id=>{
    await openBook();await row(id).click();await control('focus').click();
    await control('panel').waitFor({state:'hidden'});
    await page.waitForFunction(id=>aquarium.selected===id,id);
  };
  const photo=(selector,options={})=>page.waitForFunction(({selector,want,old})=>{
    const im=document.querySelector(selector);
    return im?.complete && im.naturalWidth && !im.hidden && (!want || im.src===want) && im.src!==old ? im.src : null;
  },{selector,...options}).then(async handle=>{try{return await handle.jsonValue();}finally{await handle.dispose();}});
  const head='#crystal-tank-portrait img', childhood='#crystal-tank-growth figure:first-child img', today='#crystal-tank-growth figure:last-child img';
  const details=control('tank-growth'), toggle=details.locator('summary');
  const reference=who=>details.locator('[data-reference="'+who+'"]');
  const leftCaption=details.locator('figure').first().locator('figcaption');
  const openPair=async()=>{if(!await details.evaluate(el=>el.open))await toggle.click();};
  const isClosed=()=>details.evaluate(el=>!el.open);
  const ready=()=>page.waitForFunction(()=>window.aquarium?.ready);
  await ready();await page.locator('#welcome-dismiss').click();
  await control('open').click();await control('start').click();await control('panel').waitFor({state:'hidden'});
  // This seed gives two daughters and two sons in the first brood. No child is inserted by the test.
  await page.evaluate(async()=>{const g=aquarium.game,v=g.snapshot();v.session.Breeding.rngState=7;await g.restore(v);});
  await visit('I4');check(await details.isHidden(),'A founder was given a childhood photograph');
  const motherPhoto=await photo(head);
  await visit('I2');const fatherPhoto=await photo(head,{old:motherPhoto});
  const motherNote='我想记住她背上这段白色，临近尾巴的地方露出一线红，等小虾长大再回来看看。';
  await action({type:'observation',id:'I4',value:motherNote});
  await action({type:'plan',motherId:'I4',fatherId:'I2',tankId:'breeding',size:4,intent:'想看看孩子背上那段白带，会连到尾巴，还是会留下一道红缝？'});
  const birth=(await state()).batches[0];
  await at(birth.hatchAt+1000);
  const ledger=await state(), children=ledger.batches[0].children.map(c=>ledger.individuals.find(r=>r.id===c.id));
  const daughter=children.find(c=>c.sex==='female'), sibling=children.find(c=>c.id!==daughter.id);
  const partner=ledger.individuals.find(r=>r.sex==='male' && !r.legacy && !daughter.parents.includes(r.id) && !children.some(c=>c.id===r.id));
  await action({type:'rename',id:daughter.id,name:'小梅'});await action({type:'rename',id:sibling.id,name:'小梅'});
  await visit(daughter.id);
  const newborn=await photo(head);
  check(await details.isVisible() && await isClosed(),'The hatchling comparison was missing or opened without a choice');
  const beforeLooking=JSON.stringify(await state());
  await openPair();await photo(today,{want:newborn});
  check(await reference('hatch').isHidden() && !await details.locator('[aria-pressed="true"]').count(),'A newborn was compared to an identical photo or a presupposed parent');
  await reference('mother').click();await photo(childhood,{want:motherPhoto});
  check((await leftCaption.innerText()).includes('母虾') && (await details.innerText()).includes(motherNote),'The mother or her personal observation is missing');
  await reference('father').click();await photo(childhood,{want:fatherPhoto});await photo(today,{want:newborn});
  check(!(await details.innerText()).includes(motherNote) && JSON.stringify(await state())===beforeLooking,'Switching parents carried over the wrong observation or changed the save');
  await at(Math.floor((birth.hatchAt+birth.adultAt)/2));
  check(await reference('father').getAttribute('aria-pressed')==='true' && await reference('hatch').isVisible(),'Growth changed the chosen parent or hid the hatchling');
  await reference('hatch').click();
  await photo(childhood,{want:newborn});const half=await photo(today,{old:newborn});
  await at(birth.adultAt+1000);const adult=await photo(today,{old:half});
  check(adult!==newborn,'The mother and her own hatchling portrait are identical');
  await toggle.press('Escape');check(await isClosed(),'Escape left the childhood comparison open');
  await photo(head,{want:adult});
  await action({type:'plan',motherId:daughter.id,fatherId:partner.id,tankId:'breeding',size:2});
  const second=(await state()).batches.at(-1);await photo(head,{want:adult});
  await at(second.formedAt+1000);
  await page.waitForFunction(id=>aquarium.aq.animals.find(a=>a.id===id)?.look?.eggs?.visible===true,daughter.id);
  const berried=await photo(head,{old:adult});
  await control('inspect').click();await control('tab-roster').click();await row(daughter.id).click();
  await photo('#crystal-panel img.crystal-hero',{want:berried});
  await photo('#crystal-roster [data-individual-id="'+daughter.id+'"] img',{want:berried});
  await control('focus').click();await openPair();
  await photo(childhood,{want:newborn});await photo(today,{want:berried});
  const sizes=[];
  for(const [width,height] of [[1200,840],[390,750],[667,375]]){
    await page.setViewportSize({width,height});
    const fits=await control('at-tank').evaluate(el=>{
      const r=el.getBoundingClientRect(),[a,b]=[...el.querySelectorAll('figure .crystal-compare-photo')].map(i=>i.getBoundingClientRect());
      return r.left>=0 && r.top>=0 && r.right<=innerWidth+.5 && r.bottom<=innerHeight+.5 &&
        r.width*r.height<innerWidth*innerHeight*.38 && a.width>=90 && b.width>=90 && a.right<=b.left &&
        el.querySelector('summary').getBoundingClientRect().height>=32;
    });
    check(fits,'The shrimp photographs did not fit '+width+'x'+height);sizes.push(width+'x'+height);
  }
  await toggle.press('Escape');check(await isClosed() && await toggle.evaluate(el=>document.activeElement===el),'Collapse lost keyboard focus');
  await page.setViewportSize({width:1200,height:840});await openPair();
  await visit(sibling.id);check(await isClosed(),'Selecting a namesake left the previous comparison open');
  await openPair();await photo(childhood,{old:newborn});await visit(daughter.id);check(await isClosed(),'The old comparison reopened on its own');
  await at((second.hatchAt+second.formedAt)/2);const midway=await photo(head,{old:berried});
  check(midway!==adult,'A developing clutch disappeared');
  const saved=await page.context().storageState();
  const recovered=await page.context().browser().newContext({storageState:saved});
  try{
    const tab=await recovered.newPage();await tab.clock.setFixedTime(new Date(second.adultAt+2*86400000));await tab.goto(page.url());
    await tab.waitForFunction(id=>window.aquarium?.ready && aquarium.game.data.Breeding.batches.find(b=>b.id===id)?.status==='complete',second.id);
    await tab.locator('#crystal-open').click();await tab.locator('#crystal-tab-roster').click();
    await tab.locator('#crystal-roster [data-individual-id="'+daughter.id+'"]').click();await tab.locator('#crystal-focus').click();
    await tab.locator('#crystal-tank-growth summary').click();
    await tab.waitForFunction(({young,now})=>{
      const [a,b]=document.querySelectorAll('#crystal-tank-growth figure img');
      return a?.complete && b?.complete && a.src===young && b.src===now;
    },{young:newborn,now:adult});
    check(await tab.evaluate(id=>aquarium.selected===id && !aquarium.aq.animals.find(a=>a.id===id)?.look?.eggs?.visible,daughter.id),'A restored mother kept a finished clutch');
  }finally{await recovered.close();}
  await page.evaluate(()=>{
    aquarium.renderer.setAnimationLoop(null);
    const write=Storage.prototype.setItem;
    window.restoreClutchWrite=()=>{Storage.prototype.setItem=write;};
    Storage.prototype.setItem=function(key,value){if(key==='aquarium.three.creatures.v1')throw Error('模拟孵化存档失败');return write.call(this,key,value);};
  });
  try{
    await page.clock.setFixedTime(new Date(second.hatchAt+1));
    let error='';try{await action({type:'advance'});}catch(e){error=e.message;}
    check(error.includes('模拟孵化存档失败') && (await state()).batches.at(-1).status==='formed','Failed hatch changed the ledger');
    const carried=await photo(head);check(carried!==adult,'A rejected save cleared the maternal portrait');
  }finally{await page.evaluate(()=>window.restoreClutchWrite());}
  await action({type:'advance'});await photo(head,{want:adult});
  check((await state()).batches.at(-1).status==='hatched','Hatch retry did not commit');
  await action({type:'rename',id:'I2',name:'小梅'});await action({type:'rest',id:'I2'});
  await page.reload();await ready();await visit(daughter.id);await openPair();
  await reference('mother').press('Enter');await reference('father').press('Enter');
  await photo(childhood,{want:fatherPhoto});await photo(today,{want:adult});
  check((await leftCaption.innerText()).includes('小梅 · I2') && await page.evaluate(()=>aquarium.selected)===daughter.id,'The archived father was confused with his namesake daughter');
  await visit(sibling.id);check(await isClosed() && !await details.locator('figure img[src]').count(),'Another child retained the open comparison or the prior family’s pictures');
  await openPair();check(await reference('hatch').getAttribute('aria-pressed')==='true','A sibling inherited another child’s selected parent');
  if((await state()).individuals.find(r=>r.id==='I4').protected)await action({type:'protect',id:'I4',value:false});
  await action({type:'sell',id:'I4'});await reference('mother').click();await photo(childhood,{want:motherPhoto});
  check((await state()).individuals.find(r=>r.id==='I4').soldAt!==null && (await details.innerText()).includes(motherNote),'A transferred mother’s appearance or note was lost');
  await page.setViewportSize({width:667,height:375});
  const fitsNotes=await details.evaluate(el=>{
    const card=el.closest('#crystal-at-tank'), bounds=card.getBoundingClientRect();
    const parts=[el.querySelector('summary'),...el.querySelectorAll('button:not([hidden]),figure')];
    const visible=parts.every(part=>{const r=part.getBoundingClientRect();return r.top>=bounds.top && r.bottom<=bounds.bottom && r.left>=0 && r.right<=innerWidth;});
    card.scrollTop=card.scrollHeight;
    const end=el.lastElementChild.getBoundingClientRect();
    return visible && bounds.top>=0 && bounds.bottom<=innerHeight && end.top>=bounds.top && end.bottom<=bounds.bottom;
  });
  check(fitsNotes,'A parent observation or brood note pushed the comparison controls off screen');
  // Follow the daughter's branch without leaving the grandchild in its own tank.
  const older=control('tank-lineage-next'), back=control('tank-lineage-back');
  const grandchild=(await state()).batches.find(b=>b.id===second.id).children[0];
  await page.setViewportSize({width:1200,height:840});await visit(grandchild.id);await openPair();
  const newbornGrandchild=await photo(today), beforeFamily=JSON.stringify(await state());
  check(await older.isHidden(),'The game picked an ancestral branch before the player did');
  await reference('mother').press('Enter');await photo(childhood,{want:adult});
  await older.press('Enter');
  check(await back.isVisible() && await reference('hatch').isHidden() && await reference('mother').evaluate(el=>document.activeElement===el) &&
    !await details.locator('[aria-pressed="true"]').count(),'Entering an earlier brood picked an ancestor or stranded keyboard focus');
  await photo(childhood,{want:adult});await photo(today,{want:newbornGrandchild});
  await reference('mother').press('Enter');await photo(childhood,{want:motherPhoto});
  check((await leftCaption.innerText()).includes('雪团') && (await details.innerText()).includes(motherNote) &&
    (await details.innerText()).includes(birth.intent) && await older.isHidden(),'The transferred grandmother, original note or end of her branch is wrong');
  await reference('father').press('Enter');await photo(childhood,{want:fatherPhoto});
  check((await leftCaption.innerText()).includes('小梅 · I2') && !(await details.innerText()).includes(motherNote),'The resting grandfather was confused with his daughter');
  await back.press('Enter');await photo(childhood,{want:adult});
  check(await older.evaluate(el=>el===document.activeElement) && await reference('mother').getAttribute('aria-pressed')==='true','Going back lost the original parent or focus');
  await reference('father').click();
  check(await older.isHidden() && await back.isHidden() && await page.evaluate(()=>aquarium.selected)===grandchild.id &&
    beforeFamily===JSON.stringify(await state()),'Changing to a founder offered invented ancestors, changed selection or wrote breeding progress');
  await reference('mother').click();await older.click();await reference('father').click();
  await at(second.adultAt+1000);await photo(today,{old:newbornGrandchild});await photo(childhood,{want:fatherPhoto});
  // One more brood exercises both navigation directions beyond a single pair of grandparents.
  const partner3=(await state()).individuals.find(r=>r.tank==='main' && !r.legacy && !r.parents && r.sex!==grandchild.sex && !grandchild.parents.includes(r.id));
  check(partner3,'The isolated tank has no available founding mate');
  const branch=grandchild.sex==='female'?'mother':'father';
  const thirdParents=grandchild.sex==='female'?[grandchild,partner3]:[partner3,grandchild];
  await action({type:'plan',motherId:thirdParents[0].id,fatherId:thirdParents[1].id,tankId:'main',size:2});
  const third=(await state()).batches.at(-1);await at(third.hatchAt+1);
  const youngest=(await state()).batches.at(-1).children[0];
  await visit(youngest.id);check(await isClosed(),'A new brood retained the open ancestry of the previous shrimp');
  await openPair();const youngestPhoto=await photo(today), unchanged=JSON.stringify(await state());
  await reference(branch).click();await older.click();await reference('mother').click();await older.click();await reference('mother').click();
  await photo(childhood,{want:motherPhoto});await photo(today,{want:youngestPhoto});
  const ancestorLabels=await details.locator('figcaption').allTextContents();
  const framing=[];
  for(const [width,height] of [[1200,840],[390,750],[667,375],[320,568]]){
    await page.setViewportSize({width,height});
    const accessible=await details.evaluate(el=>{
      const card=el.closest('#crystal-at-tank'), left=el.querySelector('figure'), right=el.querySelector('figure:last-child');
      return card.scrollWidth<=card.clientWidth+1 && left.getBoundingClientRect().right<=right.getBoundingClientRect().left+1 &&
        [...el.querySelectorAll('button:not([hidden])')].every(b=>b.getBoundingClientRect().height>=32);
    });
    check(accessible,'Ancestor controls or photos broke at '+width+'x'+height);
    const pictures=await details.locator('figure img').evaluateAll(images=>images.map(img=>{
      const canvas=document.createElement('canvas'), w=canvas.width=img.naturalWidth, h=canvas.height=img.naturalHeight;
      const context=canvas.getContext('2d'); context.drawImage(img,0,0);
      const pixels=context.getImageData(0,0,w,h).data;
      let left=w, right=-1, top=h, bottom=-1;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        if(!pixels[4*(y*w+x)+3])continue;
        left=Math.min(left,x); right=Math.max(right,x); top=Math.min(top,y); bottom=Math.max(bottom,y);
      }
      const box=img.getBoundingClientRect(), oldScale=Math.min(box.width/w,box.height/h);
      const scale=getComputedStyle(img).objectFit==='cover'?Math.max(box.width/w,box.height/h):oldScale;
      const dx=(box.width-w*scale)/2, dy=(box.height-h*scale)/2;
      return {whole:left<=right && dx+left*scale>=-.5 && dy+top*scale>=-.5 && dx+(right+1)*scale<=box.width+.5 && dy+(bottom+1)*scale<=box.height+.5,
        before:Math.round((right-left+1)*oldScale), now:Math.round((right-left+1)*scale)};
    }));
    check(pictures.every(p=>p.whole),'An antenna or tail was cropped at '+width+'x'+height);
    framing.push({width,height,pictures});
  }
  check(framing.find(r=>r.width===390).pictures.every(p=>p.now>p.before),'The phone still shrank the shrimp into the empty portrait margins');
  await page.setViewportSize({width:390,height:750});
  await details.screenshot({path:'output/playwright/tank-ancestry-phone.png',animations:'disabled'});
  await reference('mother').press('Escape');await photo(childhood,{want:adult});
  check(await back.isVisible() && await reference('mother').getAttribute('aria-pressed')==='true','Escape skipped the middle generation');
  await back.press('Enter');check(await back.isHidden() && await reference(branch).getAttribute('aria-pressed')==='true','The original branch was not restored');
  await photo(today,{want:youngestPhoto});
  check(JSON.stringify(await state())===unchanged && await page.evaluate(()=>aquarium.selected)===youngest.id,'Looking at three generations changed their records or the live target');
  return {daughter:daughter.id,sibling:sibling.id,secondBatch:second.id,sizes,realHatchPhotoRecovered:true,stagesMatched:true,
    comparedBothParentsFromHatch:true,originalParentNote:true,sameNameRestedFather:true,transferredMother:true,
    cleanSiblingSwitch:true,readOnlyComparison:true,writeFailureAndRetry:true,offlineDays:2,
    grandchild:grandchild.id,youngest:youngest.id,ancestorLabels,framing,archivedAncestors:true,growthWhileComparing:true,returnedTwoLevels:true};
}
