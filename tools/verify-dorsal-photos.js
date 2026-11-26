async function verifyDorsalPhotos(page) {
  const c = id => page.locator('#crystal-'+id);
  const pair = c('pair-photos'), siblings = c('sibling-view');
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const requireThat = (ok, reason) => { if (!ok) throw Error(reason); };
  const changeCrop = (view, crop) => view.locator('button[data-crop="'+crop+'"]').click();
  async function readPlates(view) {
    const id = await view.getAttribute('id');
    await page.waitForFunction(id => {
      const photos = [...document.querySelectorAll('#'+id+'[open] figure img')];
      return photos.length === 2 && photos.every(img => !img.hidden && img.complete && img.naturalWidth === 1152);
    }, id);
    return view.locator('figure img').evaluateAll(async images => Promise.all(images.map(async img => {
      const canvas = document.createElement('canvas');
      const width = canvas.width = 256, height = canvas.height = 150;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0,width,height);
      const data = ctx.getImageData(0,0,width,height).data;
      const digest = await crypto.subtle.digest('SHA-256',data);
      // Find the central marking, then count the pale shell still visible on both sides of it.
      const coloured = i => data[i+3]>220 && (Math.max(data[i],data[i+1],data[i+2])<112 ||
        data[i]>134 && data[i]-Math.max(data[i+1],data[i+2])>70);
      const pale = i => data[i+3]>220 && Math.min(data[i],data[i+1],data[i+2])>145;
      let whiteEdgedColumns=0, markHeight=0;
      for(let x=Math.floor(width*.34);x<width*.67;x++) {
        let length=0, longest=0, start=0;
        for(let y=Math.floor(height*.27);y<height*.73;y++) {
          length = coloured((y*width+x)*4) ? length+1 : 0;
          if(length>longest){longest=length;start=y-length+1;}
        }
        if(longest<7)continue;
        let above=0, below=0;
        for(let y=0;y<height;y++)if(pale((y*width+x)*4)){
          if(y<start)above++;
          else if(y>=start+longest)below++;
        }
        if(above>=2 && below>=2)whiteEdgedColumns++;
        markHeight=Math.max(markHeight,longest);
      }
      return {hash:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''),whiteEdgedColumns,markHeight};
    })));
  }
  const hashes = plates => plates.map(p=>p.hash).join();
  await page.locator('#welcome-dismiss').click();
  await c('open').click(); await c('start').click(); await c('panel').waitFor({state:'hidden'});
  await page.clock.setFixedTime(new Date((await state()).now+100));
  await c('open').click(); await c('tab-breed').click();
  await c('mother').selectOption('I5'); await c('father').selectOption('I3');
  await c('pair-closeup').click(); await pair.waitFor();
  const saved = JSON.stringify(await state()), whole = await readPlates(pair);
  await changeCrop(pair,'head'); const head = await readPlates(pair);
  await page.evaluate(()=>{
    const encode=HTMLCanvasElement.prototype.toDataURL; window.dorsalTestEncodes=0;
    HTMLCanvasElement.prototype.toDataURL=function(...args){
      if(this.width===1152 && this.height===672)window.dorsalTestEncodes++;
      return encode.apply(this,args);
    };
  });
  await changeCrop(pair,'back'); const backs = await readPlates(pair);
  requireThat(hashes(whole)===hashes(head) && backs.every((p,i)=>p.hash!==head[i].hash && p.whiteEdgedColumns>=13),
    'Red and black dorsal spots must show pale shell on both sides');
  await pair.locator('.sibling-spread').screenshot({path:'output/playwright/back-mark-after.png',animations:'disabled'});
  const count = await page.evaluate(()=>window.dorsalTestEncodes);
  requireThat(count===2,'Expected exactly one new image per named parent');
  await pair.evaluate(el=>{
    for(const crop of ['whole','back','head','back','head'])el.querySelector('button[data-crop="'+crop+'"]').click();
  });
  requireThat(hashes(await readPlates(pair))===hashes(head),'A late dorsal image replaced a selected side photo');
  await changeCrop(pair,'back');
  requireThat(hashes(await readPlates(pair))===hashes(backs) && await page.evaluate(()=>window.dorsalTestEncodes)===count,
    'Switching back repainted a cached shrimp or returned another view');
  requireThat(JSON.stringify(await state())===saved,'Looking at the two parents changed the breeding state');
  await pair.locator('[data-close]').click();

  await c('breeding-tank').selectOption('main'); await c('brood-size').selectOption('2'); await c('plan').click();
  await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1&&!aquarium.game.busy);
  const batch = (await state()).batches[0];
  await page.clock.setFixedTime(new Date(batch.adultAt+1500));
  await page.evaluate(()=>aquarium.game.crystalAction({type:'advance'}));
  const kids=(await state()).batches[0].children, ids=[kids[1].id,kids[0].id];
  requireThat(kids.every(k=>k.pattern==='hinomaru'),'Unexpected branch from two hinomaru parents');
  const row=c('batches').locator('[data-batch-id="'+batch.id+'"]');
  await row.locator('.crystal-sibling-open').click();
  for(const id of ids)await siblings.locator('[data-sibling-id="'+id+'"]').click();
  await changeCrop(siblings,'back');
  const offspring=await readPlates(siblings);
  requireThat(offspring[0].hash!==offspring[1].hash,'Two siblings lost their individual markings');
  await siblings.locator('[data-study-keep]').click();
  await page.waitForFunction(()=>!!aquarium.game.data.Breeding.batches[0].siblingStudy);
  await page.reload(); await page.waitForFunction(()=>window.aquarium?.ready);
  await c('open').click(); await c('tab-breed').click(); await row.locator('.crystal-sibling-study').click();
  const restored=(await state()).batches[0].siblingStudy;
  requireThat(restored.ids.join()===ids.join() && restored.crop==='back' && hashes(await readPlates(siblings))===hashes(offspring),
    'Reload changed the keeper’s chosen subjects or their dorsal pictures');
  await page.setViewportSize({width:390,height:844});
  requireThat(await siblings.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Mobile closeups overflow');
  return {parents:['I5','I3'],backs,extraEncodesForRevisits:0,children:ids,restoredWithSamePixels:true};
}
