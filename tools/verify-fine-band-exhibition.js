async page => {
  const c = id => page.locator('#crystal-' + id);
  const check = (value, label) => { if (!value) throw Error(label); };
  const state = () => page.evaluate(() => aquarium.game.data.Breeding);
  const race = c('contest-card'), who = c('contest-entrant'), forecast = c('contest-forecast');
  const enter = c('contest-enter'), result = c('contest-result'), gallery = c('entrant-gallery');
  const publicId = 'exhibition:1', fineId = publicId + ':fine-band';
  const candidates = () => gallery.locator('[data-contest-candidate]').evaluateAll(items => items.map(el => el.dataset.contestCandidate));
  const pick = id => gallery.locator('[data-contest-candidate="'+id+'"]').click();
  const estimate = async id => {
    await pick(id);
    const caption = await page.locator('.crystal-contest-specimen').innerText();
    return Number(caption.match(/本场估分 ([\d.]+)/)[1]);
  };
  await page.locator('#welcome-dismiss').click();
  await c('open').click(); await c('start').click(); await c('panel').waitFor({state:'hidden'});
  await page.clock.setFixedTime(new Date(await page.evaluate(() => Date.now())));
  // Two contrasting adults in one isolated save; all later entries go through the signup page.
  await page.evaluate(async () => {
    const snapshot = aquarium.game.snapshot(), stock = snapshot.session.Breeding.individuals;
    for (const [id, width] of [['I1',4],['I2',8]]) {
      const record = stock.find(r => r.id === id);
      record.P = [6,width,6]; record.B = [...record.P];
    }
    await aquarium.game.restore(snapshot);
  });
  await c('open').click(); await c('tab-contest').click(); await c('exhibition-open').click();
  check(await race.inputValue() === publicId && !await who.inputValue(), 'Invitation assigned an entrant');
  await forecast.check();
  const publicScores = [await estimate('I1'), await estimate('I2')];
  await who.selectOption('I3'); await race.selectOption(fineId);
  check(!await who.inputValue() && !await forecast.isChecked() && await enter.isDisabled(), 'Ineligible selection or old forecast carried over');
  check(String(await candidates()) === 'I1,I2', 'The fine-band list must show two eligible adult banded shrimp in roster order');
  await gallery.locator('[data-contest-candidate="I1"]').click();
  await c('contest-compare').locator('summary').click(); await c('contest-other').selectOption('I2');
  check(await c('contest-difference').isHidden(), 'The comparison disclosed a prediction without being asked');
  await forecast.check();
  const fineScores = [await estimate('I1'), await estimate('I2')];
  await pick('I1'); await c('contest-other').selectOption('I2');
  const difference = await c('contest-difference').innerText();
  check(String(publicScores) === '5.5,6.5' && String(fineScores) === '6,4' && difference.includes('细带低 4'), 'Forecast and comparison disagree about the two widths');
  await forecast.uncheck();
  const before = await state();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreFineBandSave = () => { Storage.prototype.setItem = original; delete window.restoreFineBandSave; };
    Storage.prototype.setItem = function(key, value) {
      if (key === 'aquarium.three.creatures.v1') throw Error('测试细带展保存失败');
      return original.call(this,key,value);
    };
  });
  try {
    await enter.click(); await c('feedback').filter({hasText:'测试细带展保存失败'}).waitFor();
    check(JSON.stringify(await state()) === JSON.stringify(before) && await who.inputValue() === 'I1', 'Failed entry consumed the invitation or lost the choice');
  } finally { await page.evaluate(() => window.restoreFineBandSave()); }
  await enter.click(); await result.waitFor();
  const after = await state(), entry = after.contests.exhibitions[0];
  check(entry.score === fineScores[0] && entry.entrantId === 'I1' && entry.contestId === fineId && after.cash === before.cash, 'Receipt or reward disagrees with the chosen group');
  check(await race.locator('option[value="exhibition:1"]').count() === 0, 'Open class offered a second entry');
  const details = c('contest-scores'), sheet = details.locator('table');
  check(!await details.evaluate(el => el.open) && (await sheet.locator('thead').textContent()).includes('细带') && await sheet.locator('tbody tr').count() === 4, 'New receipt did not prepare its own judging sheet');
  await details.locator('summary').click();
  await sheet.locator('tbody tr').nth(3).waitFor({state:'visible'});
  const myValues = await sheet.locator('tbody tr').filter({hasText:'（你）'}).locator('td').allTextContents();
  check(myValues.map(Number).join() === '6,6,6,6', 'Score sheet displayed raw coverage as fine-band points');
  const rivals = [];
  for (const n of ['1','2','3']) {
    await c('contest-rival').selectOption(n);
    const rival = c('contest-lineup').locator('[data-exhibit="rival"]');
    await rival.locator('img').waitFor({state:'visible'});
    check((await rival.innerText()).includes('条带纹'), 'A rival exhibited a different pattern');
    rivals.push(await rival.getAttribute('data-individual'));
  }
  const historic = await result.innerText();
  await race.selectOption('exhibition:2:fine-band');
  check(await enter.isHidden() && await gallery.isHidden(), 'New class bypassed the interval');
  await page.reload(); await page.waitForFunction(() => window.aquarium?.ready);
  await c('open').click(); await c('tab-contest').click(); await race.selectOption(fineId);
  check(await result.innerText() === historic && JSON.stringify((await state()).contests.exhibitions[0]) === JSON.stringify(entry), 'Reload altered the original scorecard');
  await c('contest-breed').click();
  check((await c('page-roster').innerText()).includes('细白带组'), 'Choosing a mate lost the actual show');
  return {publicScores, fineScores, difference, entry, myValues, rivals, historyAfterReload:historic};
}
