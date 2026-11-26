async page => {
  const control = id => page.locator('#crystal-'+id);
  const viewer = control('photo-viewer'), shutter = control('tank-shutter'), shelf = control('tank-photos');
  const check = (pass, why) => { if (!pass) throw Error(why); };
  const action = cmd => page.evaluate(cmd => aquarium.game.crystalAction(cmd), cmd);
  const photos = () => page.evaluate(() => aquarium.game.data.Breeding.tankPhotos ?? []);
  async function openAlbum() {
    if (await control('panel').isHidden()) await control('open').click();
    await control('tab-album').click();
  }
  await page.locator('#welcome-dismiss').click();
  await control('open').click(); await control('start').click(); await control('panel').waitFor({state:'hidden'});
  await openAlbum(); check((await shelf.innerText()).includes('在缸里选中'),'An empty album supplied a fabricated photo');
  await page.locator('.crystal-close').click();
  await action({type:'plan',motherId:'I1',fatherId:'I2',tankId:'main',size:2});
  const batch = await page.evaluate(() => aquarium.game.data.Breeding.batches[0]);
  await page.clock.setFixedTime(new Date(batch.hatchAt+500)); await action({type:'advance'});
  const id = await page.evaluate(() => aquarium.game.data.Breeding.batches[0].children[1].id);
  await action({type:'rename',id,name:'小砂'});
  await control('open').click(); await control('tab-breed').click();
  await control('batches').locator('[data-hatchling="'+id+'"] [data-brood-locate]').click();
  await control('panel').waitFor({state:'hidden'}); await control('feed-nearby').click();
  await shutter.click(); await viewer.waitFor({state:'visible'});
  const frame = await viewer.locator('canvas').evaluate(canvas => {
    const ctx=canvas.getContext('2d'), pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const colours = new Set();
    for(let i=0;i<pixels.length;i+=4012) colours.add((pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2]);
    const gameCanvas=document.getElementById('tank');
    return {size:[canvas.width,canvas.height],display:[gameCanvas.width,gameCanvas.height],colours:colours.size,
      id:aquarium.selected, pellet:!!aquarium.world.pellet, marks:aquarium.glow.group.visible};
  });
  check(frame.id===id && frame.pellet && frame.marks && frame.size+''===frame.display+'' && frame.colours>32,'The shutter did not capture the current game buffer or restore normal observations');
  check((await viewer.locator('figcaption').innerText()).includes('小砂 · 幼虾'),'The print lost the identity at shutter time');
  check(!(await photos()).length,'Opening a photo changed the album');
  await page.setViewportSize({width:390,height:750});
  const compact=await viewer.evaluate(el=>el.scrollWidth<=el.clientWidth && el.getBoundingClientRect().width<=innerWidth);
  check(compact,'The photo could not fit a narrow screen');
  await page.setViewportSize({width:1200,height:840});
  await viewer.locator('[data-close]').press('Escape'); await viewer.waitFor({state:'hidden'});
  check(await shutter.evaluate(el=>document.activeElement===el && aquarium.selected===el.dataset.individual),'Escape lost focus or cleared the selected shrimp');
  await shutter.click();
  const savedKey='aquarium.three.creatures.v1';
  const beforeWrite=await page.evaluate(key=>localStorage.getItem(key),savedKey);
  await page.evaluate(key=>{
    const write=Storage.prototype.setItem;
    window.restorePhotoWrite=()=>{Storage.prototype.setItem=write;delete window.restorePhotoWrite;};
    Storage.prototype.setItem=function(k,v){
      if(k===key && v.includes('"tankPhotos"'))throw Error('测试：相册写入失败');
      return write.call(this,k,v);
    };
  },savedKey);
  try {
    await viewer.locator('[data-keep]').click();
    await viewer.getByRole('status').filter({hasText:'相册写入失败'}).waitFor();
    check(!(await photos()).length && beforeWrite===await page.evaluate(key=>localStorage.getItem(key),savedKey),'A failed photo write damaged progress');
  } finally { await page.evaluate(()=>window.restorePhotoWrite()); }
  const [download] = await Promise.all([page.waitForEvent('download'), viewer.locator('[data-download]').click()]);
  await download.saveAs('output/playwright/tank-photo-example.png');
  const png=fs.readFileSync('output/playwright/tank-photo-example.png');
  check(png.readUInt32BE(16)===frame.size[0] && png.readUInt32BE(20)===frame.size[1],'The original PNG lost resolution');
  await viewer.locator('[data-keep]').click(); await viewer.waitFor({state:'hidden'});
  const [first]=await photos();
  check(first.individualId===id && first.name==='小砂' && first.jpeg.length<=48*1024,'The printable album copy was not bounded or stored on the photographed identity');
  await page.clock.setFixedTime(new Date(batch.adultAt+1000)); await action({type:'advance'}); await action({type:'rename',id,name:'青石'});
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:120000});
  await openAlbum(); await shelf.locator('[data-photo="'+first.id+'"]').click();
  check((await viewer.locator('figcaption').innerText()).includes('小砂 · 幼虾'),'Growing up or renaming rewrote the old photo');
  const thumb=await viewer.locator('.tank-photo-print img').evaluate(async image=>{await image.decode();return [image.naturalWidth,image.naturalHeight];});
  check((await photos())[0].jpeg===first.jpeg && thumb.every(n=>n>0),'Reload changed or broke the stored scene');
  await viewer.locator('[data-visit]').click(); await control('panel').waitFor({state:'hidden'});
  check(await page.evaluate(()=>aquarium.selected)===id && (await control('inspect').innerText()).includes('青石'),'The album could not locate its renamed shrimp');
  for(let i=1;i<4;i++){
    await shutter.click();
    if(i===3) {
      await viewer.locator('.tank-photo-writing > summary').click();
      await viewer.locator('[data-caption]').fill('在沙地上重遇青石');
    }
    await viewer.locator('[data-keep]').click();await viewer.waitFor({state:'hidden'});
  }
  const full=await photos();
  await shutter.click();await viewer.waitFor({state:'visible'});
  check(await viewer.locator('[data-keep]').isDisabled() && (await photos()).length===4,'The fifth shot implicitly replaced another photo');
  await viewer.locator('[data-compare]').click();
  await viewer.locator('.tank-photo-chooser [data-photo="'+first.id+'"]').click();
  check(await viewer.locator('[data-related]').innerText()==='同一只虾的两次留影','A renamed shrimp lost its early photo');
  await viewer.locator('[data-close]').click();
  check(await viewer.locator('select').inputValue()==='' && await viewer.locator('[data-keep]').isDisabled() &&
    JSON.stringify(await photos())===JSON.stringify(full),'Comparing from a full album selected a replacement or saved early');
  await viewer.locator('select').selectOption(full[1].id);
  await viewer.locator('.tank-photo-replacement').waitFor({state:'visible'});
  await viewer.locator('[data-compare]').click();
  await viewer.locator('.tank-photo-chooser [data-photo="'+full[2].id+'"]').click();
  await page.keyboard.press('Escape');
  check(await viewer.locator('select').inputValue()===full[1].id,'Looking at a different photo changed the requested replacement');
  await viewer.locator('[data-keep]').click();await viewer.waitFor({state:'hidden'});
  const replaced=await photos();
  check(replaced.length===4 && replaced.every(p=>p.id!==full[1].id) && replaced.some(p=>p.id===first.id),'Replacement removed the wrong photo');
  await openAlbum();await shelf.locator('[data-photo="'+first.id+'"]').click();
  await viewer.locator('[data-remove]').click();check((await photos()).length===4,'First remove click erased the photo');
  await viewer.locator('[data-remove]').click();await viewer.waitFor({state:'hidden'});
  check((await photos()).length===3 && !(await photos()).some(p=>p.id===first.id),'Explicit removal failed');
  await page.locator('.crystal-close').click(); await page.evaluate(()=>window.showDock('keep'));
  const [backup] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const backupBytes=fs.readFileSync(await backup.path()), archived=JSON.parse(backupBytes).game.session.Breeding.tankPhotos;
  const reference=await photos();
  check(reference.some(p=>p.caption?.text==='在沙地上重遇青石') && JSON.stringify(archived)===JSON.stringify(reference),
    'Normal progress export dropped the pictures or the keeper’s caption');
  await action({type:'removeTankPhoto',id:reference[0].id});
  await openAlbum();
  await shelf.locator('[data-photo="'+reference[1].id+'"]').click();
  await viewer.locator('[data-compare]').click();
  await viewer.locator('.tank-photo-chooser [data-photo="'+reference[2].id+'"]').click();
  await page.locator('#import').setInputFiles({name:'aquarium-three-progress.json',mimeType:'application/json',buffer:backupBytes});
  await page.waitForFunction(()=>aquarium.game.data.Breeding.tankPhotos?.length===3 && !aquarium.game.busy);
  await viewer.waitFor({state:'hidden'});
  await page.waitForFunction(()=>!document.querySelector('#crystal-photo-viewer figure[data-peer]'));
  check(JSON.stringify(await photos())===JSON.stringify(reference),'Normal progress import changed the prints');
  if (await control('panel').isVisible()) await page.locator('.crystal-close').click();
  await page.evaluate(()=>window.showDock('observe'));
  await page.locator('#wallpaper-compare > summary').click();
  const wide=page.locator('#wallpaper-local-preview'); await wide.waitFor({state:'visible'});
  const wallpaperPixels=await wide.evaluate(async image=>{await image.decode();return [image.naturalWidth,image.naturalHeight];});
  check(wallpaperPixels.every(n=>n>0) && (await photos()).length===3,'Wallpaper comparison failed or filled a game album slot');
  return {frame,originalBytes:png.length,albumPixels:thumb,albumJPEGChars:first.jpeg.length,fullJPEGChars:replaced.reduce((sum,p)=>sum+p.jpeg.length,0),
    compact,noAutomaticPhotos:true,writeFailureRetried:true,reloadAndRenamedShrimp:true,explicitReplacement:true,explicitRemoval:true,
    exportImport:true,comparisonClosedOnImport:true,fullAlbumChoicePreserved:true,wallpaperPixels};
}
