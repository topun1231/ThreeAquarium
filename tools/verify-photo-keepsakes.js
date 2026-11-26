async page => {
  const check = (ok, why) => { if (!ok) throw Error(why); };
  const c = id => page.locator('#crystal-'+id), panel = c('panel'), viewer = c('photo-viewer');
  const photo = key => viewer.locator('[data-'+key+']'), words = viewer.locator('.tank-photo-words');
  const writer = viewer.locator('.tank-photo-writing'), input = photo('caption'), shelf = c('tank-photos');
  const chooser = viewer.locator('.tank-photo-chooser'), peer = viewer.locator('figure[data-peer]');
  const choice = id => chooser.locator('[data-photo="'+id+'"]');
  const act = action => page.evaluate(a => aquarium.game.crystalAction(a),action);
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const jump = async at => { await page.clock.setFixedTime(new Date(at+10)); await act({type:'advance'}); };
  const prints = async () => (await state()).tankPhotos || [];
  const card = id => shelf.locator('[data-photo="'+id+'"]');
  const row = id => c('roster').locator('[data-individual-id="'+id+'"]');
  async function visit(id) {
    if (await panel.isHidden()) await c('open').click();
    await c('tab-roster').click(); await row(id).click(); await c('focus').click();
    await panel.waitFor({state:'hidden'});
  }
  async function openAlbum() {
    if (await panel.isHidden()) await c('open').click();
    await c('tab-album').click();
  }
  async function openWriter() {
    if (!await writer.evaluate(el => el.open)) await writer.locator('summary').click();
  }
  async function keep() {
    await photo('keep').click(); await viewer.waitFor({state:'hidden'}); return (await prints()).at(-1);
  }
  const ready = () => page.waitForFunction(() => window.aquarium?.ready);
  await ready(); await page.locator('#welcome-dismiss').click(); await c('open').click(); await c('start').click();
  await panel.waitFor({state:'hidden'});
  await page.evaluate(async () => { const g=aquarium.game,s=g.snapshot(); s.session.Breeding.rngState=7; await g.restore(s); });
  await act({type:'plan',motherId:'I4',fatherId:'I2',tankId:'breeding',size:2});
  const firstBatch=(await state()).batches[0]; await jump(firstBatch.hatchAt);
  const mother=(await state()).batches[0].children.find(k => k.sex==='female').id;
  const firstLine='背上的白带有点像月牙', secondLine='小雪的孩子，先看看尾巴前面';
  await act({type:'rename',id:mother,name:'小雪'}); await act({type:'observation',id:mother,value:firstLine});
  await visit(mother); await c('tank-shutter').click(); await viewer.waitFor();
  check(await photo('compare').isHidden(), 'An empty album offered a second photo');
  check((await viewer.locator('figcaption').innerText()).includes('第 1 窝') && await input.isHidden(), 'Taking a photo did not show the true brood or required a caption');
  await openWriter(); check(await input.inputValue()==='', 'The observation was copied before choosing it');
  await photo('use-observation').click();
  check(await input.inputValue()===firstLine && !(await prints()).length,'Copying an observation saved without confirmation');
  const firstPrint=await keep();
  await jump(firstBatch.adultAt);
  await act({type:'plan',motherId:mother,fatherId:'I3',tankId:'breeding',size:2});
  const nextBatch=(await state()).batches[1]; await jump(nextBatch.hatchAt);
  const child=(await state()).batches[1].children[0].id;
  await act({type:'rename',id:child,name:'小雪'}); await act({type:'observation',id:mother,value:'今天带过一窝了'});
  await visit(child); await c('tank-shutter').click(); await viewer.waitFor(); await openWriter();
  check(await photo('use-observation').isHidden() && await input.inputValue()==='', 'A namesake inherited the other shrimp’s words');
  await input.fill(secondLine); await photo('compare').click();
  check(!await peer.count() && await choice(firstPrint.id).getAttribute('aria-pressed')==='false', 'The game chose a second photo on its own');
  await choice(firstPrint.id).press('Enter');
  check(await photo('related').innerText()==='第一张是孩子，第二张是它的母虾' &&
    await viewer.locator('.tank-photo-print canvas').isVisible() && await viewer.locator('.tank-photo-spread figure').first().locator('p').innerText()===secondLine &&
    await photo('written').innerText()==='留言草稿' && (await prints()).length===1, 'An unsaved print lost its frame, caption draft or mother');
  await page.keyboard.press('Escape');
  check(await viewer.isVisible() && await input.inputValue()===secondLine && await photo('compare').evaluate(el=>el===document.activeElement),
    'Returning from comparison lost the fresh print, caption or keyboard focus');
  const secondPrint=await keep();
  await visit(mother); await c('tank-shutter').click(); await viewer.waitFor(); const blank=await keep();
  check(!blank.caption,'Leaving a photo unsigned wrote a note');
  const sibling=(await state()).batches[1].children.find(record=>record.id!==child).id;
  await visit(sibling); await c('tank-shutter').click(); await viewer.waitFor(); const siblingPrint=await keep();

  await page.reload({waitUntil:'domcontentloaded'}); await ready(); await openAlbum();
  const covers = await shelf.locator('[data-photo]').allTextContents();
  check((await card(firstPrint.id).innerText()).includes('第 1 窝') && (await card(secondPrint.id).innerText()).includes('第 2 窝') &&
    covers.some(s=>s.includes(firstLine)) && covers.some(s=>s.includes(secondLine)),'Album covers did not distinguish the two families');
  await card(firstPrint.id).click(); await photo('compare').click(); await choice(secondPrint.id).click();
  check(await photo('related').innerText()==='第一张是母虾，第二张是它的孩子' &&
    await peer.locator('figcaption').evaluate(el=>el.textContent.includes('第 2 窝')) &&
    (await viewer.locator('.tank-photo-spread img').evaluateAll(images=>images.map(img=>img.src.split(',')[1]))).join() === [firstPrint.jpeg,secondPrint.jpeg].join() &&
    (await viewer.locator('.tank-photo-spread .tank-photo-words').allTextContents()).join() === [firstLine,secondLine].join(),
    'Comparing namesakes used a different print, brood or keeper note');
  const layouts=[];
  for(const [width,height] of [[1200,840],[390,750],[844,390]]){
    await page.setViewportSize({width,height});
    const layout=await viewer.evaluate(el=>{
      const frames=[...el.querySelectorAll('.tank-photo-spread .tank-photo-print img')].map(img=>img.getBoundingClientRect());
      return {fits:el.scrollWidth<=el.clientWidth+1 && frames.every(r=>r.width>100 && r.height>80),
        stacked:frames[1].top>=frames[0].bottom, sideBySide:frames[1].left>=frames[0].right-1};
    });
    check(layout.fits && (width<600?layout.stacked:layout.sideBySide),'A saved frame was clipped or misplaced at '+width+'x'+height);
    layouts.push({width,height,...layout});
  }
  await page.setViewportSize({width:1200,height:840});
  await choice(blank.id).click();
  check(await photo('related').innerText()==='同一只虾的两次留影' && !await peer.locator('.tank-photo-words').count(),
    'Changing partners kept the previous photo’s relationship or caption');
  await photo('close').click();
  check(await chooser.isHidden() && !await peer.count() && await words.innerText()===firstLine,'Back did not return to the original saved photo');
  await photo('close').click(); await viewer.waitFor({state:'hidden'});
  await card(secondPrint.id).click(); await photo('compare').click(); await choice(siblingPrint.id).click();
  check(await photo('related').innerText()==='这两只是同一窝的虾','The two siblings lost the record of their shared brood');
  await page.keyboard.press('Escape'); await photo('close').click(); await viewer.waitFor({state:'hidden'});
  await visit('I3'); await c('tank-shutter').click(); await photo('compare').click(); await choice(secondPrint.id).click();
  check(await photo('related').innerText()==='第一张是公虾，第二张是它的孩子','The recorded father was not identified');
  await choice(firstPrint.id).click();
  check(await photo('related').isHidden() && !(await photo('related').textContent()),'The comparison labelled two co-parents as siblings or parent and child');
  await page.keyboard.press('Escape'); await photo('close').click(); await viewer.waitFor({state:'hidden'}); await openAlbum();
  const ordered = [[firstPrint,firstBatch,mother],[secondPrint,nextBatch,child]];
  for (const [kept,brood,id] of ordered) {
    await card(kept.id).click(); await photo('birth').click(); await viewer.waitFor({state:'hidden'});
    await c('batches').locator('[data-batch-id="'+brood.id+'"] [data-brood-locate="'+id+'"]:focus').waitFor();
    await c('brood-return').click(); await viewer.waitFor();
    check(await words.textContent()===kept.caption.text, 'Returning from a brood opened its namesake’s photograph');
    await photo('close').click();
    await viewer.waitFor({state:'hidden'});
    await shelf.locator('[data-photo="'+kept.id+'"]:focus').waitFor();
  }
  await visit(mother); await c('tank-photo-history').click(); await viewer.waitFor(); await openWriter(); await input.fill('尚未保存的草稿');
  await photo('newer').click(); check(await words.isHidden(), 'Paging copied a caption onto an unsigned photo');
  await photo('older').click(); check(await input.inputValue()==='尚未保存的草稿' && await words.textContent()===firstLine,'Paging committed or lost a local edit');
  await input.press('Escape'); check(!await writer.evaluate(el=>el.open) && await words.textContent()===firstLine,'Cancelling modified the printed caption');
  await photo('close').click(); await jump(nextBatch.adultAt); await act({type:'sell',id:mother});
  await openAlbum(); await card(firstPrint.id).click();
  check(await photo('visit').innerText()==='看已转让档案','An archived subject was shown as a live resident');
  await photo('compare').click(); await choice(secondPrint.id).click();
  check(await photo('related').innerText()==='第一张是母虾，第二张是它的孩子','Transfer removed the recorded family relationship');
  await page.keyboard.press('Escape');
  await openWriter(); const after='后来它也当了妈妈 🦐'; await input.fill(after);
  await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});
  check((await prints()).find(p=>p.id===firstPrint.id).caption.text===firstLine,'Chinese composition committed a caption');
  const key='aquarium.three.creatures.v1', before=await page.evaluate(k=>localStorage.getItem(k),key);
  await page.evaluate(key=>{
    const write=Storage.prototype.setItem;
    window.restoreKeepsakeWrite=()=>{Storage.prototype.setItem=write;delete window.restoreKeepsakeWrite;};
    Storage.prototype.setItem=function(k,v){if(k===key && v.includes('后来它也当了妈妈'))throw Error('留言写入测试'); return write.call(this,k,v);};
  },key);
  try {
    await photo('save-caption').click(); await viewer.getByRole('status').filter({hasText:'留言写入测试'}).waitFor();
    check(await input.inputValue()===after && (await prints()).find(p=>p.id===firstPrint.id).caption.text===firstLine &&
      await page.evaluate(k=>localStorage.getItem(k),key)===before,'Failed edit changed the photo or discarded the draft');
  } finally { await page.evaluate(()=>window.restoreKeepsakeWrite()); }
  await input.press('Enter'); await words.filter({hasText:after}).waitFor();
  check(await photo('written').isVisible(),'Later writing was dated as if it had happened at the shutter');
  for (const [width,height] of [[390,750],[844,390]]) {
    await page.setViewportSize({width,height}); await openWriter();
    check(await viewer.evaluate(el=>el.scrollWidth<=el.clientWidth+1 && el.getBoundingClientRect().width<=innerWidth),'Caption editor overflowed its viewport');
    await input.click(); check(await input.evaluate(el=>el===document.activeElement),'Cannot touch the caption field');
  }
  await photo('close').click(); await page.reload({waitUntil:'domcontentloaded'}); await ready(); await openAlbum();
  const saved=(await prints()).find(p=>p.id===firstPrint.id);
  check(saved.caption.text===after && saved.jpeg===firstPrint.jpeg && saved.at===firstPrint.at && saved.name==='小雪','Editing a caption changed the old photograph');
  await card(secondPrint.id).click(); await photo('compare').click(); await choice(firstPrint.id).click();
  check((await peer.locator('small').innerText()).startsWith('留言写于') && await peer.locator('.tank-photo-words').innerText()===after,
    'The second photograph lost the date of the keeper’s later observation');
  await page.keyboard.press('Escape'); await photo('close').click(); await viewer.waitFor({state:'hidden'});
  await card(firstPrint.id).click(); await photo('visit').click(); await row(mother).and(page.locator('[aria-pressed="true"]')).waitFor();
  check(await panel.getAttribute('data-page')==='roster' && await row(mother).getAttribute('aria-pressed')==='true' && await c('focus').isDisabled(),'The mother’s photo visited another name or the wrong tank');
  return {generations:[mother,child], covers, laterCaption:saved.caption.text, matchedBroods:[firstBatch.id,nextBatch.id], layouts,
    pairedOriginalPrints:true, freshDraftRecovered:true, siblingAndParentsMatched:true, noFalseKinshipForCoParents:true,
    failedWriteRetried:true, oldPrintIntact:true, archived:true};
}
