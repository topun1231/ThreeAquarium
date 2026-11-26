async page => {
  const c = id => page.locator('#crystal-' + id);
  const panel = c('panel'), tray = c('brood-watch'), detail = c('tank-growth');
  const dialog = c('pair-photos'), viewer = c('photo-viewer'), card = c('at-tank');
  const shutter = c('tank-shutter'), toggle = detail.locator('summary');
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const action = data => page.evaluate(a => aquarium.game.crystalAction(a), data);
  const room = () => page.evaluate(() => aquarium.game.data.BreedingRooms.activeId);
  const parentButton = role => detail.locator('[data-reference="' + role + '"]');
  const keepNotes = () => page.evaluate(() => (aquarium.game.data.Breeding.tankPhotos || []).map(p => ({
    id:p.id, shrimp:p.individualId, tank:p.tankId, caption:p.caption?.text, bytes:atob(p.jpeg).length
  })));
  const breeding = () => page.evaluate(() => {
    const {cash,rngState,batches,individuals} = aquarium.game.data.Breeding;
    return JSON.stringify([cash,rngState,batches,individuals]);
  });
  async function selectInGlass(ids) {
    const until = Date.now() + 15000, tried = new Set();
    let lastTarget, lastSelection;
    do {
      const points = await page.evaluate(async ids => {
        await new Promise(requestAnimationFrame);
        const {aq,camera,renderer} = aquarium, glass = renderer.domElement;
        aq.root.updateWorldMatrix(true,true); camera.updateMatrixWorld();
        const rect = glass.getBoundingClientRect(), points = [];
        for (const id of ids) {
          const rig = aq.animals.find(a => a.id === id)?.rig;
          if (!rig) continue;
          const p = rig.localToWorld(rig.position.clone().set(.009,.0045,0)).project(camera);
          const x = rect.left + (p.x+1)*rect.width/2, y = rect.top + (1-p.y)*rect.height/2;
          if (Math.abs(p.z) < 1 && document.elementFromPoint(x,y) === glass) points.push({id,x,y});
        }
        return points;
      }, ids);
      const target = points.find(p => !tried.has(p.id)) || points[0];
      if (!target) continue;
      lastTarget=target;
      tried.add(target.id);
      await page.mouse.click(target.x,target.y);
      const selected = await page.evaluate(() => aquarium.selected);
      lastSelection=selected;
      if (ids.includes(selected)) return selected;
      if (tried.size >= points.length) tried.clear();
    } while (Date.now() < until);
    throw Error('Could not point to ' + ids.join(', ') + ' in ' + await room() +
      '; last reachable point ' + JSON.stringify(lastTarget) + ', last selected ' + lastSelection);
  }
  async function compare(left, right, crop, chooseCrop = false) {
    await c('family-closeup').click();
    if (chooseCrop) await dialog.locator('[data-crop="' + crop + '"]').click();
    check(await dialog.getAttribute('data-crop') === crop, 'The pair lost the chosen ' + crop + ' crop');
    await page.waitForFunction(ids => {
      const photos = [...document.querySelectorAll('#crystal-pair-photos[open] figure')];
      return photos.length === 2 && photos.every((figure,i) => {
        const img = figure.querySelector('img');
        return figure.dataset.individual === ids[i] && !img.hidden && img.complete && img.naturalWidth === 1152;
      });
    }, [left,right]);
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
  }
  async function hitTest(button, scroll = true) {
    if (scroll) await button.scrollIntoViewIfNeeded();
    return button.evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width/2, r.y + r.height/2));
    });
  }
  const wish = '想看哪只孩子的背斑像雪团。', caption = '想再看看它背上这条白带。';
  await page.waitForFunction(() => window.aquarium?.ready);
  await page.locator('#welcome-dismiss').click();
  await c('open').click(); await c('start').click(); await panel.waitFor({state:'hidden'});
  await c('open').click(); await c('tab-breed').click();
  await c('mother').selectOption('I4'); await c('father').selectOption('I2');
  await c('breeding-tank').selectOption('breeding'); await c('brood-size').selectOption('4');
  const intent = c('pair-intent');
  await intent.locator('xpath=ancestor::details').locator('summary').click();
  await intent.fill(wish); await intent.press('Enter'); await c('plan').click();
  await page.waitForFunction(() => aquarium.game.data.Breeding.batches.length === 1 && !aquarium.game.busy);
  const batch = await page.evaluate(() => aquarium.game.data.Breeding.batches[0]);
  await panel.locator('.crystal-close').click();
  await page.clock.setFixedTime(new Date(batch.hatchAt + 400)); await action({type:'advance'});
  const kids = await page.evaluate(() => aquarium.game.data.Breeding.batches[0].children.map(k => k.id));
  for (const id of kids) await action({type:'rename',id,name:'米粒'});
  await c('activity').click(); await tray.waitFor();
  await page.waitForFunction(() => aquarium.game.data.BreedingRooms.activeId === 'breeding' && !aquarium.selected);
  check(await detail.isHidden() && await tray.locator('#crystal-watch-kids img').count() === 0, 'The tank picked a child on arrival');
  const initial = await breeding();
  const first = await selectInGlass(kids);
  check(!await detail.evaluate(el => el.open), 'Parent selected before the keeper opened the comparison');
  await toggle.click(); await parentButton('mother').click();
  await compare('I4',first,'back',true);
  const second = await selectInGlass(kids.filter(id => id !== first));
  check(await detail.evaluate(el => el.open) && await parentButton('mother').getAttribute('aria-pressed') === 'true',
    'The reference was lost when switching between same-named siblings');
  check((await tray.locator('[data-search] p').innerText()).includes('第 ' + (kids.indexOf(second)+1)), 'Wrong birth order');
  check((await detail.locator('.crystal-brood-intent').innerText()).includes(wish), 'Lost the original wish for this brood');
  await compare('I4',second,'back');
  check(await breeding() === initial && (await keepNotes()).length === 0, 'Observation changed the brood or created a photograph');
  const sizes = [];
  for (const size of [{width:1200,height:840},{width:844,height:390},{width:390,height:790}]) {
    await page.setViewportSize(size);
    const box = await card.boundingBox();
    check(size.width === 390 ? box.height <= size.height/2 : box.width < size.width/2, 'The comparison covers most of the tank');
    await card.evaluate(el => { el.scrollTop = 0; });
    check(await hitTest(shutter,false), 'The camera is out of reach next to the selected shrimp at ' + size.width);
    for (const button of [parentButton('mother'),c('family-closeup'),shutter]) {
      check(await hitTest(button), 'A control is behind another layer at ' + size.width);
    }
    sizes.push({...size,cardHeight:Math.round(box.height),cardWidth:Math.round(box.width)});
  }
  await shutter.click(); await viewer.locator('.tank-photo-writing summary').click();
  await viewer.locator('[data-caption]').fill(caption);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {
      if (key === 'aquarium.three.creatures.v1') {
        Storage.prototype.setItem = original;
        throw Error('同窝留影写入测试');
      }
      return original.call(this,key,value);
    };
  });
  await viewer.locator('[data-keep]').click();
  await viewer.locator('[role="status"]').filter({hasText:'同窝留影写入测试'}).waitFor();
  check((await keepNotes()).length === 0 && await viewer.locator('[data-caption]').inputValue() === caption, 'Failed save lost the draft or kept a partial photograph');
  await viewer.locator('[data-keep]').click(); await viewer.waitFor({state:'hidden'});
  const kept = await keepNotes();
  check(kept.length === 1 && kept[0].shrimp === second && kept[0].tank === 'breeding' &&
    kept[0].caption === caption && kept[0].bytes > 0, 'Wrong resident, tank, caption or photo after retry');
  await page.setViewportSize({width:1200,height:840});
  await page.locator('#reset').click();
  await page.waitForFunction(() => !aquarium.selected);
  check(await detail.isHidden() && await tray.isVisible(), 'Survey did not leave the tank clear');
  await selectInGlass(['I4','I2']);
  check(await detail.isHidden(), 'An unrelated resident borrowed the brood comparison');
  const third = await selectInGlass(kids.filter(id => id !== first && id !== second));
  await compare('I4',third,'back');
  await parentButton('father').click(); await compare('I2',third,'head',true);
  const last = kids.find(id => ![first,second,third].includes(id));
  await action({type:'expand',tankId:'breeding-2'}); await action({type:'move',id:last,tankId:'breeding-2'});
  await tray.locator('[data-room="breeding-2"]').click();
  await page.waitForFunction(() => aquarium.game.data.BreedingRooms.activeId === 'breeding-2' && !aquarium.selected);
  await selectInGlass([last]); await compare('I2',last,'head');
  await toggle.click();
  await tray.locator('[data-room="breeding"]').click(); await selectInGlass([first,second,third]);
  check(await room() === 'breeding' && !await detail.evaluate(el => el.open), 'A deliberately folded comparison reopened');
  await toggle.click(); await parentButton('father').click();
  await page.evaluate(() => aquarium.game.restore(aquarium.game.snapshot()));
  check(await tray.isHidden(), 'Replacing the save retained an in-progress search');
  await selectInGlass([first,second,third]);
  check(!await detail.evaluate(el => el.open), 'A replacement save inherited an old parent comparison');
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForFunction(() => window.aquarium?.ready);
  check(JSON.stringify(await keepNotes()) === JSON.stringify(kept), 'Reload changed the saved shot or its label');

  await page.clock.setFixedTime(new Date(batch.adultAt + 1000)); await action({type:'advance'});
  const adults = await page.evaluate(() => aquarium.game.data.Breeding.individuals);
  const anchor = adults.find(r => r.id === first);
  const mate = adults.find(r => r.tank === 'main' && !r.legacy && r.sex !== anchor.sex && !r.parents);
  check(mate, 'No unrelated founder to start the second generation');
  const role = anchor.sex === 'female' ? 'mother' : 'father';
  await action({type:'plan',motherId:role === 'mother' ? anchor.id : mate.id,
    fatherId:role === 'father' ? anchor.id : mate.id,tankId:'breeding',size:2});
  const next = await page.evaluate(() => aquarium.game.data.Breeding.batches.at(-1));
  await page.clock.setFixedTime(new Date(next.hatchAt + 500)); await action({type:'advance'});
  const young = await page.evaluate(() => aquarium.game.data.Breeding.batches.at(-1).children.map(k => k.id));
  await action({type:'move',id:young[1],tankId:'breeding-2'});
  await c('activity').click();
  const message = page.locator('[data-growth-id="' + next.id + '"]');
  if (await message.isVisible()) await message.click();
  await tray.waitFor(); await selectInGlass([young[0]]);
  check(!await detail.evaluate(el => el.open), 'The next brood inherited a reference from the earlier brood');
  await toggle.click(); await parentButton(role).click(); await c('tank-lineage-next').click();
  await parentButton('mother').click(); await compare('I4',young[0],'back',true);
  await tray.locator('[data-room="breeding-2"]').click();
  await selectInGlass([last]);
  check(await detail.isHidden(), 'A shrimp from another brood was presented as a member of the current family');
  await page.locator('#reset').click();
  await page.waitForFunction(() => !aquarium.selected && !document.querySelector('#crystal-brood-watch').hidden);
  await selectInGlass([young[1]]); await compare('I4',young[1],'back');
  check((await c('tank-lineage-caption').innerText()).includes('米粒'), 'The grandparents no longer belong to the chosen parent');
  return {first,second,third,last,mother:'I4',father:'I2',cropAcrossSiblings:'back',cropAcrossTanks:'head',
    grandparent:{anchor:anchor.id,role,grandmother:'I4',children:young},sizes,kept,broodUntouched:true,
    otherResident:true,otherBrood:true,folded:true,failedWriteRetried:true,restored:true};
}
