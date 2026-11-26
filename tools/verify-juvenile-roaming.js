async page => {
  // Run in an isolated browser profile. Set the same terrain and breeding seed for each run.
  const c = id => page.locator('#crystal-'+id);
  const check = (value,reason) => { if(!value)throw Error(reason); };
  const at = async time => {
    await page.clock.setFixedTime(new Date(time));
    await page.evaluate(()=>aquarium.game.crystalAction({type:'advance'}));
  };
  const kit = await page.evaluate(()=>{
    const tank=aquarium.game.data.Tank, moss=tank.Flora.filter(p=>p.Species==='moss');
    return {substrate:tank.Substrate,rocks:tank.Hardscape.filter(r=>moss.some(m=>m.Host===r.UniqueId)),moss,plants:tank.Plants.slice(0,2)};
  });
  await page.locator('#welcome-empty').click();
  await page.waitForFunction(()=>!aquarium.game.data.Tank.Setup.Filled && !aquarium.game.busy);
  await page.evaluate(async kit=>{
    const g=aquarium.game,session=structuredClone(g.data);
    Object.assign(session.Tank,{Substrate:kit.substrate,Hardscape:kit.rocks,Plants:kit.plants,Flora:kit.moss});
    Object.assign(session.Tank.Setup,{PreparationStep:2,HardscapePlaced:true,PlantPlaced:true});
    session.Breeding.rngState=1126;
    await g.transact(session);
  },kit);
  await page.locator('#setup-next').click();
  await page.waitForFunction(()=>aquarium.game.data.Tank.Setup.Filled && !aquarium.game.busy);
  await c('open').click();await c('start').click();await c('panel').waitFor({state:'hidden'});
  await c('open').click();await c('tab-breed').click();
  await page.locator('details.crystal-natural > summary').click();
  await c('natural-size').selectOption('4');await c('natural-plan').click();
  await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1);
  const batch=await page.evaluate(()=>aquarium.game.data.Breeding.batches[0]);
  await page.evaluate(()=>aquarium.renderer.setAnimationLoop(null));
  await at(batch.formedAt+1);await at(batch.hatchAt+1);
  const readChoices=()=>page.evaluate(()=>{
    const w=aquarium.world, b=aquarium.game.data.Breeding.batches[0];
    return b.children.map(({id})=>{
      const a=w.agentsById.get(id),o=w.observe(a),p=w.anchors[a.at].position;
      return {id,age:w.colony.shrimp[id].ageDays,from:a.at,food:o.food,explore:o.explore,
        exploreCm:+(100*p.distanceTo(w.anchors[o.explore].position)).toFixed(1)};
    });
  });
  const newborn=await readChoices();
  check(newborn.length===4 && newborn.every(r=>r.age<.01),'The first measurements must be taken at hatch');
  check(await page.evaluate(()=>!aquarium.selected && aquarium.world.agents.length===11),'A hatch changed the selection or population');
  const birthSave=await page.evaluateHandle(()=>aquarium.game.snapshot());
  const movement=await page.evaluate(()=>{
    const w=aquarium.world,g=aquarium.game,b=g.data.Breeding.batches[0],mother=w.agentsById.get(b.motherId);
    const tracks=b.children.map(({id})=>{
      const a=w.agentsById.get(id);
      return {a,origin:a.position.clone(),fromMotherCm:+(100*a.position.distanceTo(mother.position)).toFixed(1),farthestCm:0,actions:new Set()};
    });
    let maxPenetration=0;
    for(let i=0;i<1200;i++){
      w.step(.05);
      if(i%10)continue;
      for(const t of tracks){
        t.actions.add(t.a.data.ExecutionState);
        t.farthestCm=Math.max(t.farthestCm,100*t.origin.distanceTo(t.a.position));
        maxPenetration=Math.max(maxPenetration,w.habitat.depth(t.a.position,t.a.rotation,t.a.scale));
      }
    }
    const shrimp=tracks[0].a;
    if(!g.feedAt(shrimp.position,true))throw Error('The meal was refused in the new tank');
    for(let i=0;i<1800 && !g.data.Colony.lastFeeding.some(id=>b.children.some(r=>r.id===id));i++)
      w.step(.05,g.data.Colony.lastFeeding);
    const youngVisitors=g.data.Colony.lastFeeding.filter(id=>b.children.some(r=>r.id===id));
    const affected=g.tapAt(shrimp.position);
    return {tracks:tracks.map(t=>({id:t.a.data.CreatureId,fromMotherCm:t.fromMotherCm,
      farthestCm:+t.farthestCm.toFixed(1),actions:[...t.actions]})),maxPenetration,youngVisitors,affected,
      tappedShrimpStress:shrimp.data.Needs.Stress,postTapBrood:g.data.Breeding.batches[0].status};
  });
  check(movement.tracks.some(t=>t.farthestCm>1) && movement.tracks.some(t=>t.actions.includes('Graze')),'The hatchlings stayed idle');
  check(movement.maxPenetration<=.00031 && movement.youngVisitors.length && movement.affected>0 &&
    movement.tappedShrimpStress>0 && movement.postTapBrood==='hatched','Unsafe motion, missed meal or wrong tap outcome');

  // Compare the same choices on the same saved perches, separate from the free movement above.
  try { await page.evaluate(snapshot=>aquarium.game.restore(snapshot),birthSave); }
  finally { await birthSave.dispose(); }
  const samePerches=await readChoices();
  await at(Math.floor((batch.hatchAt+batch.adultAt)/2));
  const halfway=await readChoices();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.aquarium?.ready);
  await page.evaluate(()=>aquarium.renderer.setAnimationLoop(null));
  const restored=await readChoices();
  check(halfway.every((r,i)=>r.id===restored[i].id && Math.abs(r.age-restored[i].age)<.01 &&
    r.from===restored[i].from && r.explore===restored[i].explore),'Reload changed the age or the observed neighbourhood');
  await at(batch.adultAt+1);
  const grown=await readChoices();
  check(grown.every((r,i)=>r.id===samePerches[i].id && r.from===samePerches[i].from &&
    r.exploreCm>halfway[i].exploreCm && halfway[i].exploreCm>samePerches[i].exploreCm),'Growth did not widen the exploration on this layout');
  const status=await page.evaluate(()=>aquarium.game.data.Breeding.batches[0].status);
  check(status==='complete','The four siblings did not reach adulthood');
  return {newborn,movement,samePerches,halfway,restored,grown,status};
}
