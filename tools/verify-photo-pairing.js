async page => {
  const check=(value,message)=>{if(!value)throw Error(message);};
  const c=id=>page.locator('#crystal-'+id), panel=c('panel'), photos=c('pair-photos');
  const use=photos.locator('[data-draft-pair]'), picker=photos.locator('.crystal-brood-photo-picker');
  const state=()=>page.evaluate(()=>aquarium.game.data.Breeding);
  const act=value=>page.evaluate(a=>aquarium.game.crystalAction(a),value);
  const parents=async()=>[await c('mother').inputValue(),await c('father').inputValue()];
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  async function jump(at) {
    await page.clock.setFixedTime(new Date(at+300));
    await act({type:'advance'});
  }
  async function layoutTab(tab) {
    if (await panel.isHidden()) await c('open').click();
    await c('tab-'+tab).click();
  }
  async function family(id) {
    await layoutTab('roster'); await c('roster-filter').selectOption('live');
    await c('roster').locator('[data-individual-id="'+id+'"]').click();
    if (!await c('family').evaluate(el=>el.open)) await c('family').locator('summary').first().click();
    await c('individual-brood-photos').click(); await photos.waitFor();
  }
  async function other(batch,id) {
    await picker.locator('select').selectOption(batch);
    await picker.locator('[data-brood-photo="'+id+'"]').click();
    await photos.locator('figure').nth(1).locator('img:not([hidden])').waitFor();
  }
  async function refuseWrite(key) {
    await page.evaluate(key=>{
      const orig=Storage.prototype.setItem;
      window.pairWrites=0;
      window.restorePairWrites=()=>{Storage.prototype.setItem=orig;delete window.restorePairWrites;};
      Storage.prototype.setItem=function(k,v){if(k===key){window.pairWrites++;throw Error('测试写入受阻');}return orig.call(this,k,v);};
    },key);
  }
  const stored=key=>page.evaluate(k=>localStorage.getItem(k),key);
  const recover=()=>page.evaluate(()=>window.restorePairWrites());
  async function reload() {
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:120000});
  }
  await page.locator('#welcome-dismiss').click();
  await c('open').click(); await c('start').click(); await panel.waitFor({state:'hidden'});
  const oldSave=await page.evaluate(async()=>{
    const g=aquarium.game,save=g.snapshot();
    save.session.Breeding.rngState=7; await g.restore(save);
    return g.snapshot();
  });
  await act({type:'plan',motherId:'I4',fatherId:'I2',tankId:'breeding',size:2});
  await act({type:'plan',motherId:'I5',fatherId:'I3',tankId:'main',size:4});
  const [a,b]=(await state()).batches;
  await family('I1');
  check(await use.isHidden(),'A single photo offered a pair');
  await other('stock','I7'); check(await use.isHidden(),'A juvenile offered a pair');
  await other('stock','I2'); check(await use.isHidden(),'An occupied male offered a pair');
  await jump(Math.max(a.formedAt,b.formedAt));
  await use.waitFor(); // Fathers can be picked again once the plan forms.
  await page.keyboard.press('Escape');
  await jump(Math.max(a.adultAt,b.adultAt));
  const grown=await state(), first=grown.batches[0].children, second=grown.batches[1].children;
  const dam=first.find(r=>r.sex==='female'), sire=second.find(r=>r.sex==='male');
  for(const id of [dam.id,sire.id])await act({type:'rename',id,name:'花卷'});
  const expected=[dam.id,sire.id];
  await family(dam.id); await other('stock','I1'); check(await use.isHidden(),'Two females offered a pair');
  await other(b.id,sire.id);
  const labels=await photos.locator('figcaption').allTextContents();
  check(labels[0].includes('成年母虾') && labels[1].includes('成年公虾') && labels.every(line=>line.includes('花卷')),'The photos do not identify the two adults');
  await photos.locator('[data-crop="head"]').click();
  await use.click(); await c('plan-summary').waitFor();
  check(same(await parents(),expected) && await c('breeding-tank').inputValue()==='breeding','First use lost either identity or the first shrimp’s home');
  const confirmLabel=await c('plan').innerText();
  check(['第 1 窝第 1 只','第 2 窝第 2 只'].every(origin=>confirmLabel.includes(origin)) &&
    expected.every(id=>!confirmLabel.includes(id)),'Confirmation lost the same birth labels the keeper just saw');
  check(await c('plan-summary').evaluate(el=>el===document.activeElement),'A new draft lost keyboard focus');
  await c('pair-closeup').click();
  check(await photos.getAttribute('data-crop')==='head','The draft forgot the area the keeper just studied');
  await page.keyboard.press('Escape');

  const missing=['band','hinomaru','mosura'].find(pattern=>![dam.pattern,sire.pattern].includes(pattern));
  const previous=grown.individuals.find(r=>r.id.startsWith('I') && r.sex==='female' && r.pattern===missing);
  const goal=previous.colour+':'+missing, note='我想看看尾巴前面的白带';
  await c('mother').selectOption(previous.id); await c('father').selectOption('I3');
  await c('breeding-tank').selectOption('main'); await c('brood-size').selectOption('4');
  await c('brood-goal').selectOption(goal); await c('quality-goal').selectOption('coverage');
  const intent=c('pair-intent');
  await intent.locator('xpath=ancestor::details').locator('summary').click();
  await intent.fill(note); await intent.press('Enter');
  await act({type:'nameLineBook',founderId:'I5',previousTitle:null,title:'自家的两口缸'});
  const draftKey=await page.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('aquarium.three.pairing-draft.') && !k.endsWith('-intent')));
  const oldDraft=await stored(draftKey);
  await reload();
  await layoutTab('album');
  const journal=c('line-journal');
  if(!await journal.evaluate(el=>el.open))await journal.locator('summary').click();
  await journal.locator('[data-all]').click();
  await journal.locator('[data-line-member="'+sire.id+'"]').click();
  await c('line-brood-photos').click(); await other(a.id,dam.id);
  check((await photos.locator('#crystal-previous-parents').innerText()).includes(previous.name) &&
    (await use.innerText()).includes('换成') && await stored(draftKey)===oldDraft,'Comparing changed or hid the previous draft');
  await page.keyboard.press('Escape');
  check(await stored(draftKey)===oldDraft,'Closing the photos replaced the existing plan');
  await c('line-brood-photos').click(); await other(a.id,dam.id);
  await photos.locator('[data-crop="back"]').click();
  await page.setViewportSize({width:390,height:800});
  check(await use.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44 && r.right<=innerWidth+1 && r.left>=0;}),'Narrow-screen pairing control is clipped');

  await refuseWrite(draftKey);
  try {
    await use.click(); await c('retry-pairing').waitFor();
    check(same(await parents(),expected) && await stored(draftKey)===oldDraft,'Failed draft save overwrote the last good copy or discarded the new parents');
    await layoutTab('album'); await layoutTab('breed');
    check(await page.evaluate(()=>window.pairWrites)===1,'The full store is being retried without a user action');
    await c('retry-pairing').click();
    check(await c('retry-pairing').isVisible() && await page.evaluate(()=>window.pairWrites)===2,'A repeated failure lost the draft or blocked retry');
  } finally { await recover(); }
  await c('retry-pairing').click(); await c('retry-pairing').waitFor({state:'hidden'});
  const savedDraft=JSON.parse(await stored(draftKey));
  check(same([savedDraft.mother,savedDraft.father],expected),'Retry stored a different pair');
  check(savedDraft.tank==='main' && savedDraft.size==='4' && savedDraft.goal===goal && savedDraft.quality==='coverage' &&
    await intent.inputValue()===note,'Picking new parents replaced the keeper’s room, brood size, goal or note');
  await c('pair-closeup').click();
  check(await photos.getAttribute('data-crop')==='back' && await use.isHidden(),'The draft lost the back view or offered to send itself to breeding');
  await page.keyboard.press('Escape'); await reload(); await layoutTab('breed');
  check(same(await parents(),expected) && await intent.inputValue()===note && await c('plan').isDisabled() &&
    (await c('plan-summary').innerText()).includes('这对亲虾还缺'),'Reload lost the draft or silently changed an unreachable goal');
  const before=await state();
  check(before.batches.length===2 && before.individuals.find(r=>r.id===dam.id).tank==='breeding' &&
    before.individuals.find(r=>r.id===sire.id).tank==='main' && before.rngState===grown.rngState,'Studying or drafting moved a parent, spent randomness or reserved a brood');
  await c('brood-goal').selectOption(''); await c('plan').waitFor();
  const capacity=await c('plan-summary').innerText();
  check(await c('plan').isDisabled() && capacity.includes('还缺 4 位'),'The main tank should be four spaces short');
  await c('alternate-room').click();
  const room=await c('breeding-tank').inputValue();
  check(room==='breeding' && await c('brood-size').inputValue()==='4' && await c('plan').isEnabled(),
    'Changing rooms lost the planned size or left the confirmation disabled');
  const gameKey='aquarium.three.creatures.v1', previousSave=await stored(gameKey);
  await refuseWrite(gameKey);
  try {
    await c('plan').click(); await c('feedback').filter({hasText:'测试写入受阻'}).waitFor();
    const failed=await state();
    check(failed.batches.length===2 && expected.every(id=>failed.individuals.find(r=>r.id===id).tank===before.individuals.find(r=>r.id===id).tank) &&
      await stored(gameKey)===previousSave && await intent.inputValue()===note,'A failed confirmation moved the family or consumed its note');
  } finally { await recover(); }
  await c('plan').click();
  await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===3);
  const batch=(await state()).batches[2];
  check(same([batch.motherId,batch.fatherId],expected) && batch.status==='planned' && batch.size===4 &&
    batch.tankId===room && batch.intent===note && batch.qualityGoal==='coverage','Committed a different pairing or reservation');
  await jump(batch.hatchAt); await reload();
  const born=await state(), kids=born.individuals.filter(r=>r.parents?.includes(dam.id) && r.parents.includes(sire.id));
  check(born.batches.length===3 && kids.length===4 && kids.every(r=>r.tank===room),'The four children or their family did not survive reload');
  await layoutTab('roster'); await c('roster-filter').selectOption('live');
  await c('roster').locator('[data-individual-id="'+kids[0].id+'"]').click();
  if (!await c('family').evaluate(el=>el.open)) await c('family').locator('summary').first().click();
  const parentEntries=await c('relative').locator('option').evaluateAll(options=>options
    .filter(option=>/^(母亲|父亲) · /.test(option.text)).map(option=>({id:option.value,label:option.text})));
  check(same(parentEntries.map(entry=>entry.id),expected) && parentEntries.every(entry=>entry.label.includes('花卷')),
    'The child’s own family record did not lead back to both chosen parents');
  await family('I1'); await other('stock','I2');
  await act({type:'rest',id:'I2'}); await use.waitFor({state:'hidden'});
  await act({type:'recall',id:'I2',tankId:'breeding'}); await use.waitFor();
  await act({type:'sell',id:'I2'}); await use.waitFor({state:'hidden'});
  await page.evaluate(save=>aquarium.game.restore(save),oldSave);
  await photos.waitFor({state:'hidden'});
  return {labels,confirmLabel,mother:dam.id,father:sire.id,previousParents:[previous.id,'I3'],size:batch.size,
    originalRoom:savedDraft.tank,capacity,tank:batch.tankId,note,children:kids.map(r=>r.id),parentEntries,
    fromJournal:true,checkedAt390:true,savedOnRetry:true,checkedReload:true};
}
