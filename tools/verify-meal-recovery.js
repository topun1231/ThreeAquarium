async page => {
  const check = (value, message) => { if (!value) throw Error(message); };
  const crystal = id => page.locator('#crystal-' + id);
  await page.locator('#welcome-dismiss').click();
  await crystal('open').click();
  await crystal('start').click();
  await crystal('panel').waitFor({state:'hidden'});
  const start = await page.evaluate(() => aquarium.game.data.Breeding.now + 50);
  await page.clock.setFixedTime(new Date(start));

  const pending = await page.evaluate(async () => {
    const {GAME_SAVE_KEY, readLocalGame} = await import('/src/local-game-save.js');
    const game = aquarium.game, world = aquarium.world;
    if (!aquarium.paused) document.querySelector('#pause').click();
    const spot = world.anchors.find(a => a.kind === 0 && a.edges.length && a.food < .65);
    if (!spot || !game.save()) throw Error('缺少可投喂的底床或测试存档');
    const before = localStorage.getItem(GAME_SAVE_KEY);
    const mealState = () => JSON.stringify([
      world.pellet, world.anchors.map(a => a.food), world.agents.map(a => [a.discoveryAt, a.noticed]),
      game.data.Colony.treat, game.data.Colony.lastFeeding
    ]);
    const beforeMeal = mealState();
    const originalWrite = Storage.prototype.setItem;
    try {
      Storage.prototype.setItem = function(key, value) {
        if (key === GAME_SAVE_KEY) throw new DOMException('测试存储已满', 'QuotaExceededError');
        return originalWrite.call(this, key, value);
      };
      if (game.feedAt(spot.position)) throw Error('保存失败后仍投喂成功');
    } finally { Storage.prototype.setItem = originalWrite; }
    if (beforeMeal !== mealState() || before !== localStorage.getItem(GAME_SAVE_KEY)) throw Error('写入失败仍改变了投喂或存档');
    if (!game.feedAt(spot.position)) throw Error('恢复写入后仍不能投喂');
    for (let i = 0; i < 5; i++) world.step(.1, game.data.Colony.lastFeeding);
    if (!game.save()) throw Error('未能保存正在下沉的饲料');
    return readLocalGame(localStorage, GAME_SAVE_KEY);
  });
  check(pending.pellet?.pendingFood && pending.pellet.age === .5, '读出的存档缺少下沉进度');
  const initialFood = pending.food[pending.pellet.anchor];
  async function readMeal() {
    return page.evaluate(() => {
      if (!aquarium.paused) document.querySelector('#pause').click();
      const {world, game} = aquarium, pellet = world.pellet;
      return {
        room:game.data.BreedingRooms.activeId, age:pellet?.age ?? null, pending:!!pellet?.pendingFood,
        food:pellet ? world.anchors[pellet.anchor].food : null,
        visitors:game.data.Colony.lastFeeding || []
      };
    });
  }

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.aquarium?.ready || window.aquarium?.error, null, {timeout:120000});
  const reloaded = await readMeal();
  check(reloaded.pending && reloaded.age >= .5 && reloaded.age < 2.5, '刷新后未从下沉途中继续');
  check(Math.abs(reloaded.food - initialFood) < .02 && !reloaded.visitors.length, '刷新提前加入了饲料或来客');
  await page.evaluate(() => aquarium.game.switchCrystalRoom('breeding'));
  const away = await readMeal();
  check(away.room === 'breeding' && away.age === null && !away.visitors.length, '另一口缸继承了加餐');
  await page.clock.setFixedTime(new Date(start + 5000));
  await page.evaluate(() => aquarium.game.switchCrystalRoom('main'));
  const returned = await readMeal();
  check(returned.room === 'main' && returned.age >= 2.5 && !returned.pending && returned.food > .96, '回缸时饲料未在原缸落下');
  check(!returned.visitors.length, '离开的时间产生了未观察到的来客');

  // Reopen the original saved meal after the same absence through the normal import path.
  await page.evaluate(snapshot => aquarium.game.restore(snapshot), pending);
  const offline = await readMeal();
  check(!offline.pending && offline.food > .96 && !offline.visitors.length, '离线读档没有结算落料');
  delete pending.pellet.pendingFood;
  await page.evaluate(snapshot => aquarium.game.restore(snapshot), pending);
  const legacy = await readMeal();
  check(!legacy.pending && Math.abs(legacy.food - initialFood) < .02, '旧版存档的饲料被重复加入');
  return {failedSaveRolledBack:true, savedAge:.5, initialFood, reloaded, away, returned, offline, legacy};
}
