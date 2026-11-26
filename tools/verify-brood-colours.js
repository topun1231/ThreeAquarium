async page => {
  const c = id => page.locator('#crystal-' + id);
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const ready = () => page.waitForFunction(() => window.aquarium?.ready);
  const row = id => page.locator('.crystal-batch[data-batch-id="' + id + '"]');
  const check = (value, message) => { if (!value) throw Error(message); };
  async function book() {
    if (await c('panel').isHidden()) await c('open').click();
    await c('tab-breed').click();
  }
  async function openDetails(details) {
    if (!await details.evaluate(el => el.open)) await details.locator(':scope > summary').click();
  }
  async function advance(time) {
    await page.clock.setFixedTime(new Date(time));
    await page.evaluate(() => aquarium.game.crystalAction({type:'advance'}));
  }
  async function portraits(batch) {
    await openDetails(row(batch.id).locator('.crystal-review'));
    const selector = '.crystal-batch[data-batch-id="' + batch.id + '"] .crystal-brood-gallery img';
    await page.waitForFunction(({selector, count}) => {
      const images = [...document.querySelectorAll(selector)];
      return images.length === count && images.every(img => img.complete && img.naturalWidth > 0);
    }, {selector, count:batch.size});
    return page.locator(selector).evaluateAll(images => Promise.all(images.map(async img => {
      const canvas = document.createElement('canvas');
      canvas.width = 192; canvas.height = 112;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const digest = await crypto.subtle.digest('SHA-256', pixels);
      return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    })));
  }

  await ready();
  await page.locator('#welcome-dismiss').click();
  await c('open').click();
  await c('start').click();
  await c('panel').waitFor({state:'hidden'});
  await page.clock.setFixedTime(new Date(await page.evaluate(() => Date.now())));
  await page.evaluate(async () => {
    const snapshot = aquarium.game.snapshot();
    snapshot.session.Breeding.rngState = 7;
    await aquarium.game.restore(snapshot);
  });
  await book();
  await c('mother').selectOption('I4');
  await c('father').selectOption('I2');
  await c('breeding-tank').selectOption('breeding');
  await c('brood-size').selectOption('4');
  await c('plan').click();
  await page.waitForFunction(() => aquarium.game.data.Breeding.batches.length === 1 && !aquarium.game.busy);
  const first = (await state()).batches[0];
  await page.evaluate(() => { window.testPlannedBrood = aquarium.game.snapshot(); });
  for (const time of [first.formedAt, first.hatchAt, first.adultAt]) await advance(time + 10);
  const byWaiting = (await state()).batches[0].children;
  const originalPortraits = await portraits(first);
  check(new Set(originalPortraits).size > 1, 'All four children have the same portrait');

  await page.clock.setFixedTime(new Date(first.plannedAt + 20));
  await page.evaluate(() => aquarium.game.restore(window.testPlannedBrood));
  await book();
  await c('tab-market').click();
  await c('buy-tank').selectOption('main');
  await page.locator('button[data-product-id="basic-male"]').click();
  await page.waitForFunction(() => aquarium.game.data.Breeding.purchases.length === 1 && !aquarium.game.busy);
  await page.clock.setFixedTime(new Date(first.adultAt + 10));
  await page.reload({waitUntil:'domcontentloaded'});
  await ready();
  await book();
  const grown = (await state()).batches[0];
  check(grown.status === 'complete' && grown.children.length === 4, 'Offline brood did not mature');
  const byShopping = grown.children;
  check(JSON.stringify(byWaiting) === JSON.stringify(byShopping), 'Shopping changed the birth records');
  const restoredPortraits = await portraits(grown);
  check(JSON.stringify(originalPortraits) === JSON.stringify(restoredPortraits), 'Shopping changed a brood portrait');

  const child = byShopping[0];
  const actions = row(first.id).locator('[data-lineage="actions:' + child.id + '"]');
  await openDetails(actions);
  await actions.getByRole('button', {name:'用它育下一代', exact:true}).click();
  const female = child.sex === 'female';
  const mate = female ? 'I3' : 'I5';
  check(await c(female ? 'mother' : 'father').inputValue() === child.id, 'Selection lost the chosen child');
  await c('roster').locator('[data-individual-id="' + mate + '"]').click();
  await c('pick-parent').click();
  await c('breeding-tank').selectOption('main');
  await c('brood-size').selectOption('2');
  await c('plan').click();
  await page.waitForFunction(() => aquarium.game.data.Breeding.batches.length === 2);
  const second = (await state()).batches[1];
  await advance(second.adultAt + 10);
  const grandkids = (await state()).batches[1].children;
  const parents = female ? [child.id, mate] : [mate, child.id];
  check(grandkids.length === 2 && grandkids.every(k => JSON.stringify(k.parents) === JSON.stringify(parents)), 'Second generation lost its parents');
  return {parents:[first.motherId, first.fatherId], children:byWaiting.map(k => ({id:k.id, name:k.name, colour:k.colour, pattern:k.pattern})),
    purchaseInOtherTank:true, sameBirthRecords:true, originalPortraits, restoredPortraits, secondGenerationParents:parents, secondGenerationCount:grandkids.length};
}
