async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const c=id=>page.locator('#crystal-'+id);
  const tray=c('tank-pair'), use=c('tank-mate-use'), panel=c('panel');
  const button=name=>tray.getByRole('button',{name,exact:true});
  const ready=()=>page.waitForFunction(()=>window.aquarium?.ready);
  const action=value=>page.evaluate(a=>aquarium.game.crystalAction(a),value);
  const count=()=>page.evaluate(()=>aquarium.game.data.Breeding.batches.length);
  const savedDraft=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('aquarium.three.pairing-draft.')).map(k=>localStorage[k]).join(''));
  const openPlan=async()=>{await c('open').click();await c('tab-breed').click();};
  const close=()=>panel.locator('.crystal-close').click();
  async function prepareSurvey(){
    await page.waitForFunction(()=>aquarium.aq.animals.some(a=>a.id==='I1'));
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    await page.evaluate(()=>{aquarium.renderer.setAnimationLoop(null);aquarium.reset();});
  }
  // Project the body of the actual displayed shrimp, then use normal canvas input.
  async function clickBody(id){
    const point=await page.evaluate(id=>{
      const {camera,aq,renderer}=aquarium, a=aq.animals.find(animal=>animal.id===id);
      camera.updateMatrixWorld();aq.root.updateWorldMatrix(true,true);
      const pos=a.rig.localToWorld(a.rig.position.clone().set(.009,.0045,0)).project(camera);
      const rect=renderer.domElement.getBoundingClientRect();
      const x=Math.round(rect.left+(pos.x+1)*rect.width/2),y=Math.round(rect.top+(1-pos.y)*rect.height/2);
      const target=document.elementFromPoint(x,y);
      if(target!==renderer.domElement)throw Error('Another control covers '+id+' at '+x+', '+y+': '+(target?.id||target?.tagName));
      return {x,y};
    },id);
    await page.mouse.click(point.x,point.y);
    await page.waitForFunction(id=>aquarium.selected===id,id,{timeout:2500});
  }
  await ready();await page.locator('#welcome-dismiss').click();
  await c('open').click();await c('start').click();await panel.waitFor({state:'hidden'});
  await openPlan();await c('mother').selectOption('I4');await c('father').selectOption('I2');
  await c('quality-goal').selectOption('coverage');await close();
  const previous=await savedDraft();check(JSON.parse(previous).mother==='I4','Missing setup draft');
  await prepareSurvey();await clickBody('I1');await c('tank-next-generation').click();
  check(await panel.isHidden() && await tray.isVisible() && await use.isHidden(),'The first selection left the scene or chose a mate');
  const anchorPhoto=tray.locator('img');
  await anchorPhoto.waitFor({state:'visible'});const originalPhoto=await anchorPhoto.getAttribute('src');
  await clickBody('I4');
  check(await use.isHidden() && (await tray.innerText()).includes('也是母虾'),'A same-sex shrimp replaced a parent');
  await c('tank-portrait').locator('img').waitFor({state:'visible'});
  check(await anchorPhoto.getAttribute('src')===originalPhoto && await c('tank-portrait').locator('img').getAttribute('src')!==originalPhoto,'Looking at another shrimp replaced the first portrait');
  await button('再看整缸').click();await clickBody('I7');
  check(await use.isHidden() && (await tray.innerText()).includes('长大'),'A juvenile became a parent');
  await button('再看整缸').click();await page.keyboard.press('Escape');
  check(await tray.isHidden() && await count()===0 && await savedDraft()===previous && await page.evaluate(()=>aquarium.selected)==='I1','Escape affected the existing plan or lost the first shrimp');
  // A return from the roster keeps the target, room and the parent that was already chosen.
  await openPlan();await page.locator('[data-browse-parent="male"]').click();await c('pick-in-tank').click();
  check((await tray.innerText()).includes('雪团'),'The book lost the held mother');
  await button('从虾册挑').click();
  await c('roster').locator('[data-individual-id="I3"]').click();await c('pick-parent').click();
  check(await c('mother').inputValue()==='I4' && await c('father').inputValue()==='I3' && await c('quality-goal').inputValue()==='coverage','The two picking routes disagreed');
  await close();await action({type:'rename',id:'I3',name:'小枫'});
  await page.evaluate(()=>aquarium.reset());await clickBody('I3');await c('tank-next-generation').click();
  check((await c('tank-pair-anchor').innerText()).includes('I3'),'Two namesakes were indistinguishable');
  await clickBody('I1');
  check((await use.innerText()).includes('I1'),'A protected or same-name mother was lost');
  const compare=c('held-closeup'), photos=c('pair-photos');
  await compare.click();await photos.waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('#crystal-pair-photos figure')].map(f=>f.dataset.individual).join() === 'I1,I3' &&
    [...document.querySelectorAll('#crystal-pair-photos img')].every(im=>!im.hidden && im.complete && im.naturalWidth===1152));
  await photos.locator('button[data-crop="back"]').click();await page.keyboard.press('Escape');
  check(await photos.isHidden() && await tray.isVisible() && await compare.evaluate(el=>el===document.activeElement) &&
    await count()===0 && await page.evaluate(()=>aquarium.selected)==='I1','Close comparison chose a mate or lost the held parent');
  await page.setViewportSize({width:390,height:750});
  const fits=await tray.locator('button:visible').evaluateAll(els=>els.every(el=>{
    const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;
  }));
  check(fits,'The picking actions extend past the mobile viewport');
  await use.click();
  check(await c('plan-summary').evaluate(el=>el===document.activeElement),'The draft did not receive focus');
  check(await c('mother').inputValue()==='I1' && await c('father').inputValue()==='I3' && await c('breeding-tank').inputValue()==='main' && await c('quality-goal').inputValue()==='coverage','Wrong parents, existing goal or room');
  check(await count()===0 && await c('pair-rules').evaluate(el=>!el.open),'Looking at a pair started a brood or disclosed its odds');
  await page.reload();await ready();await openPlan();
  check(await c('mother').inputValue()==='I1' && await c('father').inputValue()==='I3' && await count()===0,'The exact pair did not survive reload as a draft');
  // Exercise a real write failure at the existing final confirmation and retry that same pair.
  await page.evaluate(()=>{
    const write=Storage.prototype.setItem;
    window.restorePairWrites=()=>{Storage.prototype.setItem=write;delete window.restorePairWrites;};
    Storage.prototype.setItem=function(k,v){if(k==='aquarium.three.creatures.v1')throw Error('配对写入测试');return write.call(this,k,v);};
  });
  try{
    await c('plan').click();await c('feedback').filter({hasText:'配对写入测试'}).waitFor();
    check(await count()===0 && await c('plan').isEnabled(),'A failed confirmation took a place or disabled retry');
  }finally{await page.evaluate(()=>window.restorePairWrites());}
  await c('plan').click();await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1);
  const batch=await page.evaluate(()=>aquarium.game.data.Breeding.batches[0]);
  check(batch.motherId==='I1' && batch.fatherId==='I3' && batch.size===2,'Retry committed a different pair');
  await page.clock.setFixedTime(new Date(batch.hatchAt+1500));await page.reload();await ready();await openPlan();
  const children=c('batches').locator('[data-hatchling]');await children.first().waitFor();
  check(await children.count()===2,'Wrong brood after offline hatch');
  const kid=await children.last().getAttribute('data-hatchling');
  await children.last().locator('[data-brood-locate]').click();await panel.waitFor({state:'hidden'});
  check(await page.evaluate(()=>aquarium.selected)===kid,'Returned to another shrimp');
  await page.setViewportSize({width:1200,height:840});await prepareSurvey();await openPlan();
  await c('mother').selectOption('I4');await page.locator('[data-browse-parent="male"]').click();await c('pick-in-tank').click();
  await clickBody('I3');await use.click();await c('brood-size').selectOption('4');
  const free=await page.evaluate(()=>{const s=aquarium.game.data.Breeding;return s.tanks.find(t=>t.id==='main').capacity-s.individuals.filter(r=>r.tank==='main').length;});
  check(free<4 && await c('plan').isDisabled() && /缺|不足/.test(await c('plan-summary').innerText()) && await count()===1,'In-tank pairing bypassed the room capacity');
  await page.locator('[data-browse-parent="female"]').click();await c('pick-in-tank').click();
  await page.evaluate(()=>aquarium.game.switchCrystalRoom('breeding'));
  await tray.waitFor({state:'hidden'});await page.evaluate(()=>aquarium.game.switchCrystalRoom('main'));
  check(await tray.isHidden() && await count()===1,'An unfinished choice leaked into another room');
  await openPlan();await c('father').selectOption('I3');await page.locator('[data-browse-parent="female"]').click();await c('pick-in-tank').click();
  await action({type:'rest',id:'I3'});await tray.waitFor({state:'hidden'});
  check(await count()===1,'An unavailable first parent created a second brood');
  return {parents:[batch.motherId,batch.fatherId],child:kid,heldPortraitStable:true,juvenileBlocked:true,sameSexBlocked:true,otherDraftPreserved:true,rosterRoundTrip:true,narrowActionsFit:fits,failedSaveRetried:true,freeSlots:free,roomChangeCleared:true,retiredParentCleared:true};
}
