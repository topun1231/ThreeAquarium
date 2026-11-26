async (page,{screenshotPath,chooseFromPhoto=false}={})=>{
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const c=id=>page.locator('#crystal-'+id);
  const panel=c('panel'), tray=c('tank-pair'), use=c('tank-mate-use');
  const roomButton=id=>tray.locator('[data-tank-id="'+id+'"]');
  const action=value=>page.evaluate(a=>aquarium.game.crystalAction(a),value);
  const state=()=>page.evaluate(()=>{
    const {Breeding:s,BreedingRooms:rooms}=aquarium.game.data;
    return {room:rooms.activeId,homes:Object.fromEntries(s.individuals.map(r=>[r.id,r.tank])),
      batches:s.batches.map(b=>({mother:b.motherId,father:b.fatherId,size:b.size})),
      draft:Object.keys(localStorage).filter(key=>key.startsWith('aquarium.three.pairing-draft.')).sort().map(key=>localStorage[key])};
  });
  async function openPlan(){await c('open').click();await c('tab-breed').click();}
  async function visit(room){
    await roomButton(room).click();
    await page.waitForFunction(id=>{
      const button=document.querySelector('#crystal-tank-pair [data-tank-id="'+id+'"]');
      return aquarium.game.data.BreedingRooms.activeId===id && button?.getAttribute('aria-pressed')==='true' && !button.disabled;
    },room);
  }
  async function selectAnchorFromBook(){
    await page.locator('[data-browse-parent="male"]').click();await c('pick-in-tank').click();await tray.waitFor();
    check((await c('tank-pair-anchor').innerText()).includes('小枫'),'The book lost the mother in the other tank');
  }
  async function clickResident(id){
    await page.waitForFunction(id=>aquarium.aq.animals.some(r=>r.id===id) && Math.abs(aquarium.camera.aspect-innerWidth/innerHeight)<.01,id);
    const point=await page.evaluate(async id=>{
      const {aq,camera,renderer}=aquarium;
      const rig=aq.animals.find(r=>r.id===id).rig, deadline=performance.now()+8000;
      let obstruction;
      do{
        await new Promise(requestAnimationFrame);
        camera.updateMatrixWorld();aq.root.updateWorldMatrix(true,true);
        const pos=rig.localToWorld(rig.position.clone().set(.009,.0045,0)).project(camera);
        const rect=renderer.domElement.getBoundingClientRect(),x=rect.left+(pos.x+1)*rect.width/2,y=rect.top+(1-pos.y)*rect.height/2;
        const target=document.elementFromPoint(x,y);
        if(target===renderer.domElement){renderer.setAnimationLoop(null);return {x,y};}
        obstruction=(target?.closest('[id]')?.id || 'outside viewport')+' at '+Math.round(x)+', '+Math.round(y);
      }while(performance.now()<deadline);
      throw Error('Cannot click '+id+' through '+obstruction);
    },id);
    await page.mouse.click(point.x,point.y);await page.waitForFunction(id=>aquarium.selected===id,id);
  }
  async function failWrite(button){
    await page.evaluate(()=>{
      const write=Storage.prototype.setItem;
      window.endCrossTankWriteTest=()=>{Storage.prototype.setItem=write;delete window.endCrossTankWriteTest;};
      Storage.prototype.setItem=function(key,value){
        if(key==='aquarium.three.creatures.v1')throw Error('跨缸写入测试');
        return write.call(this,key,value);
      };
    });
    try{
      await button.click();
      await page.waitForFunction(()=>document.querySelector('#crystal-feedback').textContent.includes('跨缸写入测试'));
    }finally{await page.evaluate(()=>window.endCrossTankWriteTest());}
  }
  await page.locator('#welcome-dismiss').click();await c('open').click();await c('start').click();await panel.waitFor({state:'hidden'});
  await action({type:'expand',tankId:'breeding-2'});
  await page.evaluate(async()=>{
    const saved=aquarium.game.snapshot(), empty=saved.session.BreedingRooms.rooms.find(r=>r.id==='breeding-2').session.Tank;
    empty.Setup.Filled=false;empty.Setup.PreparationStep=0;empty.Environment.WaterLevel=0;
    await aquarium.game.restore(saved);
  });
  await action({type:'move',id:'I2',tankId:'breeding'});
  await action({type:'rename',id:'I3',name:'墨点'});
  await openPlan();await c('mother').selectOption('I1');await c('father').selectOption('I3');
  await c('breeding-tank').selectOption('breeding');await c('quality-goal').selectOption('coverage');
  await panel.locator('.crystal-close').click();const original=await state();
  await c('open').click();await c('tab-roster').click();
  await c('roster').locator('[data-individual-id="I1"]').click();await c('focus').click();await c('tank-next-generation').click();
  await page.setViewportSize({width:390,height:790});
  await tray.locator('img').waitFor();const photo=await tray.locator('img').getAttribute('src');
  check(await roomButton('breeding').isVisible() && await roomButton('main').getAttribute('aria-pressed')==='true','Missing narrow-screen rooms');
  check(await roomButton('breeding-2').isHidden(),'A dry tank is offered as a place to find a shrimp');
  const dryVisit=await page.evaluate(async()=>{
    try{await aquarium.game.switchCrystalRoom('breeding-2',{keepSelectedParent:true});return '';}catch(error){return error.message;}
  });
  check(dryVisit.includes('还没注水') && (await state()).room==='main' && await tray.isVisible(),'Visiting a dry tank lost the held parent');
  await failWrite(roomButton('breeding'));
  check((await state()).room==='main' && await tray.isVisible() && await roomButton('main').getAttribute('aria-pressed')==='true','Failed visit lost the anchor or changed rooms');
  await visit('breeding');await visit('main');await visit('breeding');
  check(!/已切换鱼缸|正在切换/.test(await page.locator('#message').textContent()),'The room-change notice covers the shrimp portrait');
  check(await tray.locator('img').getAttribute('src')===photo && (await tray.innerText()).includes('住在我的造景缸') && await use.isHidden(),'Visiting rooms changed the held individual');
  await page.keyboard.press('Escape');await tray.waitFor({state:'hidden'});
  const cancelled=await state();
  check(cancelled.room==='breeding' && cancelled.homes.I1==='main' && cancelled.homes.I2==='breeding' && !cancelled.batches.length &&
    JSON.stringify(cancelled.draft)===JSON.stringify(original.draft),'Cancelling in the other room changed the previous draft or a resident');
  await openPlan();await selectAnchorFromBook();
  await page.setViewportSize({width:1200,height:840});await clickResident('I2');await use.waitFor();
  check((await use.innerText()).includes('I2'),'Two namesakes were confused');
  await c('held-closeup').click();const photos=c('pair-photos');await photos.waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#crystal-pair-photos figure'),f=>f.dataset.individual).join() === 'I1,I2');
  await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:790});
  check(await tray.locator('button:visible').evaluateAll(buttons=>buttons.every(button=>{
    const r=button.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;
  })),'A narrow-screen action is cut off');
  if(screenshotPath)await c('at-tank').screenshot({path:screenshotPath});
  if(chooseFromPhoto){
    await c('held-closeup').click();
    await photos.locator('[data-crop="head"]').click();
    await photos.locator('[data-draft-pair]').click();
    await c('pair-closeup').click();
    check(await photos.getAttribute('data-crop')==='head','Choosing a live pair lost the crop from its photographs');
    await page.keyboard.press('Escape');
  }else await use.click();
  check(await c('mother').inputValue()==='I1' && await c('father').inputValue()==='I2' && await c('breeding-tank').inputValue()==='breeding' &&
    await c('quality-goal').inputValue()==='coverage','The selected destination, parents or goal changed');
  const reviewing=await state();
  check(reviewing.homes.I1==='main' && reviewing.homes.I2==='breeding' && !reviewing.batches.length,'Looking at a candidate started a brood or moved a parent');
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready);await openPlan();
  check(await c('mother').inputValue()==='I1' && await c('father').inputValue()==='I2','The cross-tank draft was lost on reload');
  await failWrite(c('plan'));check(!(await state()).batches.length && (await state()).homes.I1==='main','Failed confirmation moved the mother or reserved space');
  await c('plan').click();await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1);
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready);
  const final=await state(),batch=final.batches[0];
  check(final.batches.length===1 && batch.mother==='I1' && batch.father==='I2' && batch.size===2 &&
    final.homes.I1==='breeding' && final.homes.I2==='breeding' && final.homes.I3==='main','The committed brood or either namesake was lost after reload');
  return {before:{mother:original.homes.I1,father:original.homes.I2},after:{mother:final.homes.I1,father:final.homes.I2},
    batch,narrowWidth:390,visits:3,chooseFromPhoto,dryVisitKeptParent:true,failedVisitRetried:true,remoteCancelPreservedDraft:true,failedPlanRetried:true,durableAfterReload:true};
}
