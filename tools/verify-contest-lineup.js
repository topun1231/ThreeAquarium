async page => {
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const control=id=>page.locator('#crystal-'+id);
  const action=cmd=>page.evaluate(cmd=>aquarium.game.crystalAction(cmd),cmd);
  const ledger=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const lineup=control('contest-lineup'), race=control('contest-card'), rival=control('contest-rival');
  const player=lineup.locator('[data-exhibit="player"]'), opponent=lineup.locator('[data-exhibit="rival"]');
  async function imageInfo(figure) {
    const img=figure.locator('img');
    await img.waitFor({state:'visible'});
    return img.evaluate(async el=>{
      await el.decode();
      const canvas=document.createElement('canvas'); canvas.width=el.naturalWidth; canvas.height=el.naturalHeight;
      const ctx=canvas.getContext('2d'); ctx.drawImage(el,0,0);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const img=el.getBoundingClientRect(),box=el.parentElement.getBoundingClientRect();
      let visible=0, clipped=0;
      for(let i=0;i<pixels.length;i+=4){
        if(pixels[i+3]<=32)continue;
        visible++;
        const pos=i/4, x=img.left+(pos%canvas.width+.5)*img.width/canvas.width;
        const y=img.top+(Math.floor(pos/canvas.width)+.5)*img.height/canvas.height;
        if(x<box.left || x>box.right || y<box.top || y>box.bottom)clipped++;
      }
      const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',pixels));
      return {width:canvas.width,height:canvas.height,visible,clipped,hash:Array.from(hash.slice(0,8),v=>v.toString(16).padStart(2,'0')).join('')};
    });
  }
  await page.locator('#welcome-dismiss').click(); await control('open').click(); await control('start').click();
  await control('panel').waitFor({state:'hidden'});
  await control('open').click(); await control('tab-breed').click();
  await control('mother').selectOption('I1'); await control('father').selectOption('I2');
  await control('breeding-tank').selectOption('breeding'); await control('brood-size').selectOption('2'); await control('plan').click();
  await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length>0);
  const brood=(await ledger()).batches[0], invitation='rookie:'+brood.id;
  await page.clock.setFixedTime(new Date(brood.adultAt+500)); await action({type:'advance'});
  const entrant=(await ledger()).batches[0].children[1].id;
  await action({type:'observation',id:entrant,value:'喜欢背上那一小块白。'});
  await control('tab-contest').click(); await race.selectOption(invitation);
  await control('entrant-gallery').locator('[data-contest-candidate="'+entrant+'"]').click();
  await control('contest-forecast').check();
  check(await lineup.isHidden() && await lineup.locator('img[src]').count()===0,'Rivals were rendered before judging');
  await control('contest-forecast').uncheck();
  const before=await ledger();
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    window.restoreEntryWrite=()=>{Storage.prototype.setItem=original;delete window.restoreEntryWrite;};
    Storage.prototype.setItem=function(key,value){
      if(key==='aquarium.three.creatures.v1')throw Error('赛后对照测试写入失败');
      return original.call(this,key,value);
    };
  });
  try{
    await control('contest-enter').click(); await control('feedback').filter({hasText:'赛后对照测试写入失败'}).waitFor();
    check(await lineup.isHidden() && JSON.stringify(await ledger())===JSON.stringify(before),'Result or ledger leaked after failed write');
  }finally{await page.evaluate(()=>window.restoreEntryWrite());}
  await control('contest-enter').press('Enter'); await lineup.waitFor();
  const expected=await page.evaluate(async id=>{
    const {rookieCard,contestLineup,rivalComparison}=await import('/src/crystal-contests.js');
    const s=aquarium.game.data.Breeding,card=rookieCard(s,s.batches[0]),entry=s.individuals.find(r=>r.id===id);
    return {judge:rivalComparison(card,entry).rival.index+1,entries:contestLineup(card,entry).map(e=>({id:e.record.id,rank:e.rank,score:e.score,tied:e.tied}))};
  },entrant);
  const receipt=await control('contest-result').innerText(), settled=await ledger();
  check(await rival.inputValue()===String(expected.judge) && receipt.includes(expected.judge+' 号对手'),'Default specimen disagrees with the judge');
  check(await player.getAttribute('data-individual')===entrant && (await lineup.innerText()).includes('喜欢背上那一小块白'),'Wrong entrant or missing personal note');
  const playerPhoto=await imageInfo(player);
  check(playerPhoto.visible>300 && !playerPhoto.clipped,'The entrant is blank or extends beyond the photo');
  const photos={};
  for(const n of [1,2,3]){
    await rival.selectOption(String(n));
    const entry=expected.entries[n];
    check(await opponent.getAttribute('data-individual')===entry.id &&
      (await opponent.innerText()).includes((entry.tied?'并列':'')+'第 '+entry.rank+' 名'),'Wrong numbered opponent or ranking');
    photos[n]=await imageInfo(opponent);
    check(photos[n].width===384 && photos[n].height===224 && photos[n].visible>300 && !photos[n].clipped,'Blank or clipped opponent portrait '+n+' '+JSON.stringify(photos[n]));
  }
  check(new Set(Object.values(photos).map(p=>p.hash)).size===3,'Different opponents all need individualized model shots');
  // Move away from the judge's rival, allow a normal UI refresh, then switch rapidly.
  const away=expected.judge===1?2:1;
  await rival.selectOption(String(away)); await page.waitForTimeout(1150);
  check(await rival.inputValue()===String(away),'Periodic refresh overrode the viewer');
  await rival.selectOption('2'); await rival.selectOption('1'); await rival.selectOption('3');
  check((await imageInfo(opponent)).hash===photos[3].hash && (await imageInfo(player)).hash===playerPhoto.hash,'Stale paint after a rapid change');
  check(await control('contest-result').innerText()===receipt && JSON.stringify(await ledger())===JSON.stringify(settled),'Looking at rivals changed the receipt or save');
  const scores=control('contest-scores');
  await scores.locator('summary').click();
  const rows=scores.locator('tbody tr'); await rows.nth(3).waitFor();
  check(await rows.count()===4,'Missing scored participant');
  await rival.selectOption(String(expected.judge)); await imageInfo(opponent);
  const sizes=[];
  for(const width of [1200,390,320]){
    await page.setViewportSize({width,height:820});
    const dimensions=await lineup.evaluate(el=>{
      const [p,r]=[...el.querySelectorAll('.crystal-exhibit-art')].map(e=>e.getBoundingClientRect());
      return {player:p.width,rival:r.width,aligned:Math.abs(p.top-r.top)<1,
        fits:p.left>=0 && r.right<=innerWidth && el.scrollWidth<=el.clientWidth+1};
    });
    check(dimensions.fits && dimensions.aligned && dimensions.player>100 && Math.abs(dimensions.player-dimensions.rival)<1,'Portraits do not fit at '+width+'px');
    check(!(await imageInfo(player)).clipped && !(await imageInfo(opponent)).clipped,'Cropped model at '+width+'px');
    sizes.push({width,...dimensions});
    if(width===390)await lineup.screenshot({path:'output/playwright/contest-show-after.png'});
  }
  await page.setViewportSize({width:1200,height:840});
  await race.selectOption('exhibition:1'); check(await lineup.isHidden(),'Prior portraits leaked into pending exhibition');
  await control('contest-entrant').selectOption('I5'); await control('contest-enter').click(); await lineup.waitFor();
  const exhibitId=await opponent.getAttribute('data-individual');
  check(!expected.entries.some(e=>e.id===exhibitId),'Rookie and exhibition borrowed each other’s rivals');
  await race.selectOption('colour-entry'); check(await lineup.isHidden(),'Prior result leaked into a fresh regular event');
  await control('contest-entrant').selectOption('I3');
  await page.evaluate(()=>{
    const original=HTMLCanvasElement.prototype.toDataURL;
    window.restoreShowPhoto=()=>{HTMLCanvasElement.prototype.toDataURL=original;delete window.restoreShowPhoto;};
    HTMLCanvasElement.prototype.toDataURL=function(...args){
      if(this.width===384 && this.height===224)throw Error('模拟个体近照暂不可用');
      return original.apply(this,args);
    };
  });
  try{
    await control('contest-enter').click(); await lineup.waitFor();
    await opponent.locator('img[data-portrait-failed]').waitFor({state:'attached'});
    check((await opponent.innerText()).includes('影像暂不可用'),'Picture failure has no readable fallback');
  }finally{await page.evaluate(()=>window.restoreShowPhoto());}
  await control('panel').locator('.crystal-close').click(); await control('open').click(); await control('tab-contest').click();
  await race.selectOption('colour-entry'); await control('contest-entrant').selectOption('I3');
  check((await imageInfo(opponent)).visible>300,'Opponent picture did not recover when the book reopened');
  check(await player.getAttribute('data-individual')==='I3' && await opponent.getAttribute('data-individual')!==exhibitId,'Regular event compared the wrong shrimp');
  await page.reload(); await page.waitForFunction(()=>window.aquarium?.ready);
  await control('open').click(); await control('tab-contest').click(); await race.selectOption(invitation); await lineup.waitFor();
  check(await rival.inputValue()===String(expected.judge) && (await imageInfo(opponent)).hash===photos[expected.judge].hash &&
    JSON.stringify((await ledger()).batches[0].rookieEntry)===JSON.stringify(settled.batches[0].rookieEntry),'Restored result changed the specimen, its portrait or the receipt');
  // An older valid crystal record can have all its appearance fields absent.
  await page.evaluate(async()=>{
    const game=aquarium.game, saved=game.snapshot(), founder=saved.session.Breeding.individuals.find(r=>r.id==='I3');
    delete founder.colour; delete founder.pattern; delete founder.traitGroup;
    await game.restore(saved);
  });
  if(await control('panel').isHidden())await control('open').click();
  await control('tab-contest').click(); await race.selectOption('colour-entry'); await control('contest-entrant').selectOption('I3');
  await lineup.waitFor();
  check(!(await player.locator('img').getAttribute('src')) && (await player.innerText()).includes('花色未记录') &&
    (await imageInfo(opponent)).visible>300,'Old entrant received an invented coat or lost its opponent');
  await race.selectOption('pattern-entry'); await control('contest-entrant').selectOption('I3');
  const comparison=control('contest-compare'), closeups=control('pair-photos');
  await comparison.locator('summary').click();await control('contest-other').selectOption('I2');
  await control('contest-closeup').click();await closeups.waitFor();
  const unknown=closeups.locator('[data-individual="I3"]'), known=closeups.locator('[data-individual="I2"]');
  await known.locator('img').waitFor({state:'visible'});
  check(await unknown.locator('img').isHidden() && (await unknown.innerText()).includes('花色未记录') &&
    !await control('contest-forecast').isChecked(),'Comparing an older archive leaked a guessed appearance or opened estimates');
  await closeups.locator('[data-close]').click();await control('contest-forecast').check();
  check((await control('entrant-gallery').locator('[data-contest-candidate="I3"]').innerText()).includes('花色未记录') &&
    (await page.locator('.crystal-contest-specimen').innerText()).includes('花色未记录'),'Old entrant shows a fake coat before judging');
  return {entrant,judgedRival:expected.judge,receipt:settled.batches[0].rookieEntry,playerPhoto,photos,sizes,verified:['failed write and retry','selection refresh','three event types','portrait failure and recovery','restored result','older unrecorded coats']};
}
