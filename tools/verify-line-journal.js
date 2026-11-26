async page => {
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const c=id=>page.locator('#crystal-'+id), panel=c('panel'), journal=c('line-journal');
  const within=key=>journal.locator('[data-'+key+']');
  const card=id=>journal.locator('[data-line-member="'+id+'"]');
  const row=id=>c('roster').locator('[data-individual-id="'+id+'"]');
  const state=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const action=value=>page.evaluate(a=>aquarium.game.crystalAction(a),value);
  const ready=()=>page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:120000});
  const copy=()=>page.evaluate(()=>aquarium.game.snapshot());
  const pagesFor=async id=>{for(let p=0;p<4 && !await card(id).isVisible() && await within('next').isEnabled();p++)await within('next').click();};
  const titleInput=journal.getByRole('textbox',{name:'手记名字'});
  const dialog=c('pair-photos');
  async function openAlbum(){
    if(await panel.isHidden())await c('open').click();
    await c('tab-album').click();
    if(!await journal.evaluate(el=>el.open))await journal.locator('summary').click();
  }
  async function openFamily(id,filter='live'){
    if(await panel.isHidden())await c('open').click();
    await c('tab-roster').click();await c('roster-filter').selectOption(filter);await row(id).click();
    if(!await c('family').evaluate(el=>el.open))await c('family').locator('summary').first().click();
  }
  async function raise(motherId,fatherId,intent){
    await action({type:'plan',motherId,fatherId,intent,tankId:'breeding',size:2});
    const batch=(await state()).batches.at(-1);
    await page.clock.setFixedTime(new Date(batch.adultAt+500));
    await action({type:'advance'});return (await state()).batches.at(-1);
  }
  async function name(text){
    await c('line-start').click();await titleInput.fill(text);await titleInput.press('Enter');
    await journal.getByRole('heading',{name:text,exact:true}).waitFor();
  }
  await page.setViewportSize({width:390,height:800});await page.locator('#welcome-dismiss').click();
  await c('open').click();await c('start').click();await panel.waitFor({state:'hidden'});
  await page.evaluate(async()=>{const g=aquarium.game,s=g.snapshot();s.session.Breeding.rngState=7;await g.restore(s);});
  const first=await raise('I4','I2','想看尾巴前的白带');
  const mother=first.children.find(r=>r.sex==='female').id, other=first.children.find(r=>r.id!==mother).id;
  await action({type:'rename',id:mother,name:'小米'});await action({type:'rename',id:other,name:'小米'});
  const second=await raise(mother,'I3','再看看那段白'), grand=second.children[0].id;
  await action({type:'rename',id:grand,name:'月牙'});
  const note='我想看它尾巴前的白带。';
  await action({type:'observation',id:grand,value:note});
  await raise('I4','I2','这次也想看看');
  const baseline=await copy(), originals=await state();
  await openAlbum();check(await within('empty').isVisible() && !originals.lineBooks,'Legacy progress unexpectedly started a notebook');
  await within('start').click();await openFamily('I4');await name('尾白');
  check(await card('I4').isVisible() && await journal.locator('[data-line-member]').count()===1,'Starting silently preselected offspring');
  await within('all').click();
  const names=await Promise.all([card(mother).innerText(),card(other).innerText()]);
  check(names[0].includes('小米') && names[1].includes('小米') && names[0]!==names[1],'Namesakes are indistinguishable');
  await pagesFor(grand);await card(grand).click();
  const route=await within('route').innerText();
  check(route.includes('雪团') && route.includes('小米') && route.endsWith('月牙') && await within('note').innerText()===note,'Lost a real parent or the keeper note');
  check((await within('prev').isEnabled()),'A late descendant did not fall on a second page');
  await c('line-compare').click();await dialog.waitFor();await dialog.locator('[data-crop="back"]').click();
  await page.waitForFunction(([a,b])=>[...document.querySelectorAll('#crystal-pair-photos[open] figure')].map(e=>e.dataset.individual).join() === [a,b].join() &&
    [...document.querySelectorAll('#crystal-pair-photos[open] img')].every(im=>im.complete && im.naturalWidth===1152),['I4',grand]);
  const captions=await dialog.locator('figcaption').allTextContents();
  await page.keyboard.press('Escape');await within('visit').click();await panel.waitFor({state:'hidden'});
  check(await page.evaluate(()=>aquarium.selected)===grand,'Went to a different shrimp in the live tank');
  await c('inspect').click();
  check(await within('route').innerText()===route && !(await state()).lineBooks[0].members.length,'Viewing or comparing enrolled the relative');
  await openFamily(grand);await c('family').getByRole('button',{name:'在《尾白》里对照'}).click();
  check(await card(grand).getAttribute('aria-pressed')==='true' && await within('route').innerText()===route,'The descendant dossier lost our place');
  const profileKey='aquarium.three.creatures.v1', beforeWrite=await page.evaluate(key=>localStorage.getItem(key),profileKey);
  await page.evaluate(key=>{
    const write=Storage.prototype.setItem;
    window.restoreLineWrite=()=>{Storage.prototype.setItem=write;delete window.restoreLineWrite;};
    Storage.prototype.setItem=function(k,v){if(k===key && v.includes('"lineBooks"'))throw Error('手记写入测试');return write.call(this,k,v);};
  },profileKey);
  try{
    await within('mark').click();await c('feedback').filter({hasText:'手记写入测试'}).waitFor();
    check(!(await state()).lineBooks[0].members.length && await page.evaluate(key=>localStorage.getItem(key),profileKey)===beforeWrite,'A failed save partly committed a mark');
  }finally{await page.evaluate(()=>window.restoreLineWrite());}
  await within('mark').click();await page.waitForFunction(id=>aquarium.game.data.Breeding.lineBooks[0].members.includes(id),grand);
  await within('rename').click();await within('new').click();await row('I2').click();await name('尾白');
  await within('all').click();await pagesFor(grand);await card(grand).click();await within('mark').click();
  await page.waitForFunction(id=>aquarium.game.data.Breeding.lineBooks.every(b=>b.members.includes(id)),grand);
  await openFamily(grand);
  const sameTitles=await c('family').getByRole('button',{name:/在《尾白》里看它/}).allTextContents();
  check(sameTitles.length===2 && new Set(sameTitles).size===2,'The two books with the same title lost their respective ancestors');
  await c('family').getByRole('button',{name:/在《尾白》里看它.*雪团/}).click();
  check(await journal.locator('[data-books] select').inputValue()==='I4' && await card(grand).getAttribute('aria-pressed')==='true','Selected the other book with the same title');
  await within('rename').click();await titleInput.fill('另一页');await titleInput.press('Escape');
  check(await journal.getByRole('heading',{name:'尾白',exact:true}).isVisible(),'Escape committed an unfinished name');
  await within('rename').click();await titleInput.fill('尾端留白');await within('save').click();
  await journal.getByRole('heading',{name:'尾端留白',exact:true}).waitFor();
  const books=(await state()).lineBooks;
  const {lineBooks,...otherwise}=await state();
  check(JSON.stringify(otherwise)===JSON.stringify(originals),'Opening or editing a journal changed game progression');
  await page.reload({waitUntil:'domcontentloaded'});await ready();await openAlbum();
  check(JSON.stringify((await state()).lineBooks)===JSON.stringify(books),'Reload lost the chosen family');
  await card(grand).click();await action({type:'rest',id:grand});await within('visit').filter({hasText:'静养'}).click();
  check(await c('roster-filter').inputValue()==='rest' && await row(grand).getAttribute('aria-pressed')==='true','Resting relative opened the wrong dossier');
  await c('family-back').click();check(await within('route').innerText()===route,'Resting person lost the route back');
  await action({type:'recall',id:grand,tankId:'breeding'});await action({type:'sell',id:grand});await within('visit').filter({hasText:'已售'}).click();
  check(await c('roster-filter').inputValue()==='sold' && await row(grand).getAttribute('aria-pressed')==='true','Sold relative disappeared from the journal');
  await c('family-back').click();
  const widths=[];
  for(const viewport of [{width:390,height:800},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    const fits=await journal.evaluate(el=>el.scrollWidth<=el.clientWidth+1 && el.getBoundingClientRect().right<=innerWidth+1);
    check(fits,'The notebook overflows on '+viewport.width);widths.push(viewport.width);
  }
  await within('rename').click();await within('discard').click();await within('keep').click();await within('cancel').click();
  check((await state()).lineBooks.length===2,'Cancelling deletion changed the other notebook');
  const restOfGame=s=>JSON.stringify([s.individuals,s.batches,s.cash,s.rngState]), beforeDelete=restOfGame(await state());
  await within('rename').click();await within('discard').click();await within('delete').click();
  await page.waitForFunction(()=>aquarium.game.data.Breeding.lineBooks.length===1);
  check((await state()).lineBooks[0].founderId==='I2' && restOfGame(await state())===beforeDelete,'Discarding a notebook modified the wrong family or individual');
  await card(grand).click();await c('line-compare').click();await dialog.waitFor();
  await page.evaluate(data=>aquarium.game.restore(data),baseline);
  await dialog.waitFor({state:'hidden'});await openAlbum();
  check(!(await state()).lineBooks,'An old save inherited notebook data');
  await within('empty').waitFor();
  check(!await c('line-compare').isVisible() && await journal.locator('[data-line-member]').count()===0,'An old save retained unrelated relatives or a photo comparison');
  return {founder:'I4',mother,grand,route,independentBooks:books,names,sameTitles,captions,observed:note,checkedWidths:widths,
    savedWithBoth:true,writeFailureRecovered:true,restAndSaleReturned:true,olderSaveReopened:true};
}
