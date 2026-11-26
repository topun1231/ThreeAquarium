async page => {
  // Use an isolated 5174 context. The family is born through the regular breeding UI.
  const check = (value, message) => { if (!value) throw Error(message); };
  const book = page.locator('#crystal-panel'), view = page.locator('#crystal-sibling-view');
  const act = action => page.evaluate(action => aquarium.game.crystalAction(action), action);
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const at = async time => { await page.clock.setFixedTime(new Date(time)); await act({type:'advance'}); };
  const labels = () => view.locator('figcaption button').allTextContents();
  const pick = id => view.locator('[data-sibling-id="' + id + '"]');
  const selected = () => view.locator('.sibling-choices [aria-pressed="true"]').count();
  const inspect = page.locator('#crystal-inspect'), room = () => page.evaluate(() => aquarium.game.data.BreedingRooms.activeId);
  const next = page.locator('#crystal-next-sibling'), prev = page.locator('#crystal-prev-sibling');
  const quiet = page.locator('#crystal-tank-quiet'), quietNext = page.locator('#quiet-next-sibling');
  const visit = id => view.locator('[data-sibling-visit="' + id + '"]');
  const inTank = () => page.locator('#crystal-feed-nearby').getAttribute('data-id');
  const spread = () => view.evaluate(el => JSON.stringify({
    crop:el.dataset.crop,
    sides:[...el.querySelectorAll('figcaption button')].map(b => [b.textContent, b.getAttribute('aria-pressed')])
  }));
  async function goTo(id, tank, touch = false) {
    if (touch) await visit(id).tap(); else await visit(id).press('Enter');
    await book.waitFor({state:'hidden'}); await inspect.waitFor({state:'visible'});
    check(await room() === tank && await inTank() === id && await page.evaluate(() => aquarium.selected) === id && await inspect.getByText('返回同窝近照',{exact:true}).isVisible(), 'The live shrimp, tank card or return destination belongs to another individual');
  }
  async function returnToPhotos(was, id) {
    await inspect.click(); await view.waitFor({state:'visible'});
    check(await spread() === was && await focused(visit(id)), 'Returning lost the two sides, focus, active slot or crop');
  }
  const capture = async name => {
    await view.screenshot({path:'output/playwright/sibling-detail-' + name + '.png',animations:'disabled'});
  };
  const failNextTankSave = () => page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'aquarium.three.creatures.v1') {
        Storage.prototype.setItem = write;
        throw new Error('模拟切换繁育缸保存失败');
      }
      return write.call(this,key,value);
    };
  });
  const photos = async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('#crystal-sibling-view figure img')].filter(im => im.complete && im.naturalWidth === 1152 && !im.hidden).length === 2);
    return view.locator('figure img').evaluateAll(images => images.map(im => im.src));
  };
  const fits = () => view.evaluate(el => el.scrollWidth <= el.clientWidth + 1 &&
    [...el.querySelectorAll('figure')].every(item => item.getBoundingClientRect().width > 100));
  const focused = element => element.evaluate(el => document.activeElement === el);
  await page.locator('#welcome-dismiss').click();
  await page.locator('#crystal-open').click(); await page.locator('#crystal-start').click();
  await book.waitFor({state:'hidden'});
  await page.evaluate(async () => {
    const g = aquarium.game, save = g.snapshot(); save.session.Breeding.rngState = 7; await g.restore(save);
  });
  await page.locator('#crystal-open').click(); await page.locator('#crystal-tab-breed').click();
  await page.locator('#crystal-mother').selectOption('I4'); await page.locator('#crystal-father').selectOption('I2');
  await page.locator('#crystal-breeding-tank').selectOption('breeding'); await page.locator('#crystal-brood-size').selectOption('4');
  await page.locator('#crystal-plan').click(); await page.waitForFunction(() => aquarium.game.data.Breeding.batches.length === 1);
  const batch = (await state()).batches[0], row = book.locator('[data-batch-id="' + batch.id + '"]'), entry = row.locator('.crystal-sibling-open');
  check(await entry.isHidden(), 'Planned brood revealed siblings');
  await at(batch.formedAt + 1);
  check(await entry.isHidden() && !await row.locator('.crystal-sibling-photo').count(), 'Formed brood revealed unhatched offspring');
  await at(batch.hatchAt + 1);
  const kids = (await state()).batches[0].children.map(r => r.id), [one, two, three, four] = kids;
  const hatchSnapshot = await page.evaluate(() => aquarium.game.snapshot());
  await entry.click(); check(await selected() === 0, 'The brood entrance picked a shrimp for the player');
  check(await view.locator('.sibling-spread').isHidden() && await pick(one).isVisible(), 'Empty slots obscured the initial visual choice');
  check(JSON.stringify(kids) === JSON.stringify(await view.locator('.sibling-choices button').evaluateAll(els => els.map(el => el.dataset.siblingId))), 'Choices changed birth order');
  const newbornSave = JSON.stringify(await state());
  // Fail one large render, while ordinary thumbnails can still finish.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      if (this.width === 1152) { HTMLCanvasElement.prototype.toDataURL = original; throw Error('test portrait failure'); }
      return original.apply(this, args);
    };
  });
  await pick(three).click(); await view.getByText('近照暂不可用，重新点开可重试').waitFor();
  await view.locator('[data-close]').click(); await entry.click();
  await pick(three).press('Enter'); check(await selected() === 1 && await pick(three).getAttribute('aria-disabled') === 'true', 'First choice can occupy both slots');
  await pick(four).click(); const youngPhotos = await photos();
  const initialNames = await labels();
  await view.locator('[data-crop=head]').click();
  check(await view.getAttribute('data-crop') === 'head' && JSON.stringify(youngPhotos) === JSON.stringify(await photos()), 'Changing crop changed the source photographs');
  const youngSpread = await spread();
  // Fail only the next real room write. A retry must still use the same saved family and the same target.
  await failNextTankSave();
  await visit(four).click();
  await view.getByText(/模拟切换繁育缸保存失败/).waitFor();
  check(await room() === 'main' && await spread() === youngSpread && await focused(visit(four)) && JSON.stringify(await state()) === newbornSave, 'Failed switch changed the room, breeding save or photographs');
  await goTo(four,'breeding');
  check(await next.getAttribute('data-individual') === three && (await next.innerText()).includes('看另一只') && await prev.isHidden(), 'Tank visit did not keep the two chosen photographs');
  await next.click(); await page.waitForFunction(id => aquarium.selected === id,three);
  await quiet.click(); await quietNext.waitFor({state:'visible'});
  check(await quietNext.textContent() === '看另一只', 'Quiet watch did not identify the chosen pair');
  for (const id of [four,three]) {
    await quietNext.press('Enter'); await page.waitForFunction(id => aquarium.selected === id,id);
  }
  await page.locator('#quiet-exit').click();
  check(await inTank() === three && (await inspect.innerText()).includes('返回同窝近照'), 'Watching the pair lost the original photograph return');
  await returnToPhotos(youngSpread,four);
  await goTo(three,'breeding'); await returnToPhotos(youngSpread,three);
  await view.locator('figcaption button').first().click(); await pick(two).click(); await photos();
  check((await labels())[1] === initialNames[1], 'Changing the left shrimp lost the right shrimp');
  await pick(four).click(); await photos();
  check((await labels())[0].endsWith(initialNames[1].split(' · ')[1]), 'Swapping two selected shrimp failed');
  await view.locator('[data-close]').press('Escape');
  await view.waitFor({state:'hidden'}); check(await focused(entry) && await book.isVisible(), 'Escape lost the brood or focus');
  check(JSON.stringify(await state()) === newbornSave, 'Looking changed the hatchling save');

  const shortcut = row.locator('[data-hatchling="' + three + '"] .crystal-sibling-photo');
  await shortcut.click(); check(await selected() === 1 && (await labels())[0] === initialNames[0], 'The photo shortcut picked the wrong left shrimp');
  const single = await spread(); await goTo(three,'breeding');
  check(await prev.isVisible() && await next.getAttribute('data-individual') === four, 'One selected photograph restricted the whole brood');
  await quiet.click(); await quietNext.waitFor({state:'visible'});
  check(await quietNext.textContent() === '看同窝下一只', 'An independent visit inherited quiet pair controls');
  await page.locator('#quiet-exit').click(); await returnToPhotos(single,three);
  check(await selected() === 1, 'A tank visit filled the other photograph without a choice');
  await pick(one).click();
  const separated = await spread(); await goTo(one,'breeding');
  check(await next.getAttribute('data-individual') === three, 'The control picked a birth-order neighbour instead of the non-adjacent chosen sibling');
  await next.click(); await page.waitForFunction(id => aquarium.selected === id,three);
  check(await next.getAttribute('data-individual') === one, 'The second shrimp did not link back to the first');
  const markings = await page.evaluate(ids => ids.map(id => {
    const record = aquarium.game.data.Breeding.individuals.find(k => k.id === id);
    const animal = aquarium.aq.animals.find(k => k.id === id);
    return {id, pattern:record.pattern, colour:record.colour, shape:animal.look.uniforms.aqMarkingShape.value.toArray()};
  }), [one,three]);
  check(JSON.stringify(markings[0].shape) !== JSON.stringify(markings[1].shape), 'The live pair shared its individual markings');
  await returnToPhotos(separated,one);
  await pick(four).click(); await photos();
  await at(batch.adultAt + 1);
  await page.waitForFunction(old => {
    const images = [...document.querySelectorAll('#crystal-sibling-view figure img')];
    return images.length === 2 && images.every((im,i) => !im.hidden && im.complete && im.naturalWidth === 1152 && im.src !== old[i]);
  }, youngPhotos);
  check(JSON.stringify(await labels()) === JSON.stringify(initialNames), 'Growing up changed the chosen siblings');
  await capture('whole'); await view.locator('[data-crop=head]').click(); await capture('head');
  const adultPhotos = await photos();
  // Several choices can arrive before the offscreen portrait renderer finishes its next job.
  await view.locator('figcaption button').first().click();
  await view.evaluate((el, ids) => {
    for (const id of ids) el.querySelector('[data-sibling-id="' + id + '"]').click();
  }, [one,two,one]);
  const similar = await photos();
  check(similar[0] !== adultPhotos[0] && similar[1] === adultPhotos[1] && (await labels())[0].includes('幼虾2'), 'A late image replaced the last choice');
  await capture('similar');
  await view.locator('[data-close]').click();
  check(await focused(entry), 'The vanished hatchling photo left focus behind');
  await act({type:'rename', id:three, name:'白点'}); await act({type:'rename', id:four, name:'白点'});
  await act({type:'move', id:three, tankId:'main'}); await act({type:'rest', id:two});
  await act({type:'sellGroup', tankId:'breeding', ids:[four]});
  const reviewedSave = JSON.stringify(await state());
  const review = row.locator('.crystal-review'); await review.locator('summary').first().click();
  const adultShortcut = review.locator('.crystal-sibling-photo').nth(2);
  await adultShortcut.click(); await pick(four).click(); await photos();
  const duplicateNames = await labels();
  check(duplicateNames[0].includes('同窝第 3 只') && duplicateNames[1].includes('同窝第 4 只'), 'Namesakes or sold sibling lost their identities');
  check(!/最高|推荐|评分|品质分/.test(await view.innerText()), 'Unsolicited evaluation appeared in the photo spread');
  check(await view.locator('figure').last().getByText('已转让',{exact:true}).isVisible(), 'The archive image looked like a current resident');
  check(!await visit(four).count() && (await visit(three).getAttribute('aria-label')).includes('同窝第 3 只'), 'A namesake or archived shrimp was offered the wrong visit');
  await view.locator('[data-crop=whole]').click(); check(await fits(), 'Desktop spread overflowed');
  await view.locator('[data-crop=head]').click();
  await page.setViewportSize({width:390,height:750}); check(await fits(), 'Narrow spread overflowed');
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (touch) { await view.locator('[data-crop=back]').tap(); await view.locator('[data-crop=head]').tap(); }
  const phoneSpread = await spread();
  await goTo(three,'main',touch);
  check(await next.isHidden() && await prev.isHidden(), 'A sold namesake was replaced with another live sibling');
  await returnToPhotos(phoneSpread,three);
  await view.screenshot({path:'output/playwright/sibling-tank-return-phone.png',animations:'disabled'});
  await capture('phone');
  const firstBox = await view.locator('figure').first().boundingBox(), otherBox = await view.locator('figure').last().boundingBox();
  check(Math.abs(firstBox.width - otherBox.width) < 2 && firstBox.x < otherBox.x, 'Mobile crops are not side by side at equal sizes');
  await page.setViewportSize({width:667,height:375}); await view.locator('[data-crop=back]').click(); await pick(one).click(); await photos();
  check(await fits(), 'Landscape overflowed');
  await view.locator('[data-close]').press('Escape'); await view.waitFor({state:'hidden'});
  check(await focused(adultShortcut) && await review.evaluate(el => el.open), 'Adult journal did not retain focus and place');
  check(JSON.stringify(await state()) === reviewedSave, 'Inspecting adult or archived shrimp changed progress');
  const cardPhotos = await review.locator('.crystal-sibling-photo img').evaluateAll(images => images.map(im => im.naturalWidth));
  check(cardPhotos.every(w => w === 384), 'The ordinary journal retained close-up sized thumbnails');
  await entry.click(); await pick(two).click();
  check(!await visit(two).count() && await view.locator('figure').first().getByText('静养中',{exact:true}).isVisible(), 'A resting shrimp was shown as a tank resident');
  await pick(one).click(); await goTo(one,'breeding');
  check(await next.isHidden(), 'A resting sibling was replaced during a pair visit');
  await page.locator('#crystal-open').click(); await page.locator('#crystal-tab-breed').click(); await entry.click();
  check(await selected() === 0 && await view.getAttribute('data-crop') === 'whole', 'A separate journal visit inherited the previous photographs');
  await view.locator('[data-close]').click();
  await entry.click(); await pick(one).click(); await pick(three).click(); await photos();
  const splitSpread = await spread(); await goTo(one,'breeding');
  check(await next.getAttribute('data-individual') === three && (await next.innerText()).includes('我的造景缸'), 'Split pair did not show the chosen shrimp and its tank');
  await quiet.click(); check(await quietNext.isHidden(), 'Quiet watch offered an absent shrimp'); await page.locator('#quiet-exit').click();
  await failNextTankSave(); await next.click();
  await page.waitForFunction(() => !document.getElementById('crystal-next-sibling').disabled);
  check(await room() === 'breeding' && await inTank() === one && await next.getAttribute('data-individual') === three, 'Failed pair switch lost the current tank or the chosen target');
  await next.click(); await page.waitForFunction(id => aquarium.selected === id,three);
  check(await room() === 'main' && await next.getAttribute('data-individual') === one, 'The same pair could not switch tanks in both directions');
  await next.click(); await page.waitForFunction(id => aquarium.selected === id,one);
  await returnToPhotos(splitSpread,one);
  // Import an earlier-format save which genuinely has no colour or pattern records.
  await page.evaluate(async () => {
    const g = aquarium.game, saved = g.snapshot(), p = saved.session.Breeding;
    for (const r of [...p.individuals, ...p.batches.flatMap(b => b.children)]) {
      delete r.colour; delete r.pattern; delete r.traitGroup;
    }
    await g.restore(saved);
  });
  await view.waitFor({state:'hidden'});
  if (await book.isHidden()) await page.locator('#crystal-open').click();
  await page.locator('#crystal-tab-breed').click();
  if (!await review.evaluate(el => el.open)) await review.locator('summary').first().click();
  check(await entry.isHidden() && !await row.locator('.crystal-sibling-photo').count() && (await review.innerText()).includes('花色未记录'), 'Old save fabricated a comparable photograph');
  // The existing photo dialog shares the header styling. Its close button must also accept a pointer.
  await review.locator('[data-brood-locate="' + one + '"]').click(); await book.waitFor({state:'hidden'});
  check(await inspect.getByText('返回同窝近照',{exact:true}).isHidden() && (await inspect.innerText()).includes('返回这窝手记'), 'Opening a journal record offered a photo trip that was never started');
  await page.locator('#crystal-tank-shutter').click();
  await page.locator('#crystal-photo-viewer [data-close]').click();
  check(await page.locator('#crystal-photo-viewer').isHidden(), 'Tank photo header intercepted the close action');

  // Replay the hatchling save to let the source gallery change to the adult journal during a tank visit.
  await page.clock.setFixedTime(new Date(batch.hatchAt + 1));
  await page.evaluate(save => aquarium.game.restore(save), hatchSnapshot);
  if (await book.isHidden()) await page.locator('#crystal-open').click();
  await page.locator('#crystal-tab-breed').click(); await shortcut.click(); await pick(four).click();
  await view.locator('[data-crop=back]').click();
  const wasYoung = await spread(); await goTo(four,'breeding'); await at(batch.adultAt + 1);
  await returnToPhotos(wasYoung,four); await photos();
  await view.locator('[data-close]').click();
  check(await shortcut.isHidden() && await focused(entry), 'Coming back across adulthood lost the gallery entrance');
  await entry.click(); await pick(three).click(); await goTo(three,'breeding');
  await page.evaluate(() => {const g=aquarium.game;return g.restore(g.snapshot());});
  check(await view.isHidden() && await inspect.getByText('返回同窝近照',{exact:true}).isHidden(), 'Importing a save with the same individual IDs kept a trip from the previous session');
  return {batch:batch.id, children:kids, namesakes:duplicateNames, nonAdjacentPair:markings, normalWidth:cardPhotos[0], detailWidth:1152, mobileSlotWidths:[firstBox.width,otherBox.width], touch, recoveredFailedPhoto:true, archiveAndOldSave:true,
    tankTrips:{sameRoom:true, crossRoom:true, recoveredWriteFailure:true, chosenPair:true, quietPair:true, splitPair:true, oneSelected:true, namesakeAndArchive:true, resting:true, independentVisit:true, grewWhileAway:true, discardedOnImport:true}};
}
