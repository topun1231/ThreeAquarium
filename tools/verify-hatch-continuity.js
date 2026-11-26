async page => {
  const c = name => page.locator('#crystal-'+name);
  const act = action => page.evaluate(a=>aquarium.game.crystalAction(a),action);
  await page.locator('#welcome-dismiss').click();
  await c('open').click();await c('start').click();await c('panel').waitFor({state:'hidden'});
  const base=await page.evaluate(()=>{
    aquarium.renderer.setAnimationLoop(null); // Sample immediately before and after the same committed frame.
    return Math.max(Date.now(),aquarium.game.data.Breeding.now)+1000;
  });
  await page.clock.setFixedTime(new Date(base));
  await act({type:'move',id:'I3',tankId:'breeding'});
  await c('open').click();await c('tab-breed').click();
  await page.locator('details.crystal-natural > summary').click();
  await c('natural-size').selectOption('4');await c('natural-plan').click();
  await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1);
  const batch=await page.evaluate(()=>aquarium.game.data.Breeding.batches[0]);
  await page.clock.setFixedTime(new Date(batch.formedAt+3));await act({type:'advance'});
  await c('tab-roster').click();await c('roster').locator('[data-individual-id="'+batch.motherId+'"]').click();
  await c('focus').click();await c('panel').waitFor({state:'hidden'});
  await page.evaluate(id=>{
    const w=aquarium.world,g=aquarium.game,mother=w.agentsById.get(id);
    g.setFollow(id);
    if(!g.feedAt(mother.position,true))throw Error('Could not start the meal in the sample tank');
    w.threaten(mother.position,.15,1);
    for(let i=0;i<22 && !w.agents.some(a=>a.swim?.t>.18);i++)w.step(.05,g.data.Colony.lastFeeding);
    if(!w.agents.some(a=>a.swim?.t>.18))throw Error('The controlled tap did not produce a shrimp in mid-water');
  },batch.motherId);
  await page.clock.setFixedTime(new Date(batch.hatchAt+3));
  const report=await page.evaluate(async()=>{
    const {game:g,world:w,aq}=aquarium;
    const {peerDepth}=await import('/src/habitat.js');
    const {GAME_SAVE_KEY,readLocalGame}=await import('/src/local-game-save.js');
    const {motherId,children}=g.data.Breeding.batches[0],ids=children.map(child=>child.id);
    const scene=g.runtime.current,pellet=w.pellet,food=w.anchors.map(a=>a.food);
    const residents=w.agents.map(a=>({a,id:a.data.CreatureId,at:a.at,flight:a.swim,route:a.route,noticed:a.noticed,
      discovery:a.discoveryAt,state:a.data.ExecutionState,position:a.position.clone(),rotation:a.rotation.clone()}));
    const unchanged=()=>aquarium.world===w && residents.every(r=>{
      const a=w.agentsById.get(r.id);
      return a===r.a && a.at===r.at && a.swim===r.flight && a.route===r.route && a.data.ExecutionState===r.state &&
        a.position.equals(r.position) && a.rotation.equals(r.rotation) && a.noticed===r.noticed && a.discoveryAt===r.discovery;
    });
    const before=localStorage.getItem(GAME_SAVE_KEY),meshCount=aq.meshes.length;
    for(const failure of ['seat','write']){
      const object=failure==='seat'?w.habitat:Storage.prototype,method=failure==='seat'?'support':'setItem',original=object[method];
      object[method]=failure==='seat'?()=>null:function(key,value){
        if(key===GAME_SAVE_KEY)throw Error('isolated hatch write');
        return original.call(this,key,value);
      };
      let error;
      try{await g.crystalAction({type:'advance'});}catch(e){error=e;}finally{object[method]=original;}
      const expected=failure==='seat'?'安全的入缸位置':'isolated hatch write';
      if(!error?.message.includes(expected) || !unchanged() || aq.meshes.length!==meshCount ||
        w.agents.length!==residents.length || g.data.Breeding.batches[0].status!=='formed' || localStorage.getItem(GAME_SAVE_KEY)!==before)
        throw Error('Partial hatch after '+failure+': '+error?.message);
    }
    await g.crystalAction({type:'advance'});
    if(!unchanged() || w.pellet!==pellet || w.anchors.some((a,i)=>a.food!==food[i]) ||
      g.runtime.current!==scene || aquarium.selected!==motherId || g.followedId!==motherId)
      throw Error('Hatching disturbed the tank, feeding, selection or ongoing movement');
    const saved=readLocalGame(localStorage,GAME_SAVE_KEY);
    if(w.agents.length!==20 || aq.animals.length!==20 || saved.creatures.length!==20 || saved.pellet.cues.length!==20)
      throw Error('The full active tank, rigs, or stored meal have different counts');
    const landings=ids.map(id=>{
      const a=w.agentsById.get(id);
      const solidDepth=w.habitat.depth(a.position,a.rotation,a.scale);
      const neighbourDepth=Math.max(...w.agents.filter(o=>o!==a).map(o=>peerDepth(a.position,a.rotation,o,a.scale)));
      if(solidDepth>.00031 || neighbourDepth>.00081 || !w.anchors[a.at].edges.length)throw Error('Obstructed birth perch: '+id);
      return {id,fromMotherCm:+(100*a.position.distanceTo(w.agentsById.get(motherId).position)).toFixed(2),solidDepth,neighbourDepth};
    });
    const swimmer=residents.find(r=>r.flight?.t>.01);
    for(let i=0;i<30;i++)w.step(.05,g.data.Colony.lastFeeding);
    const continuedCm=+(100*swimmer.a.position.distanceTo(swimmer.position)).toFixed(2);
    if(continuedCm<=0)throw Error('The interrupted flight never continued');
    await g.crystalAction({type:'move',id:ids[0],tankId:'breeding'});
    if(aquarium.world!==w || w.agents.length!==19 || w.agentsById.has(ids[0]) || w.agentsById.get(motherId)!==residents.find(r=>r.id===motherId).a)
      throw Error('A transfer re-seated the remaining residents');
    await g.switchCrystalRoom('breeding');
    if(aquarium.world===w || aquarium.world.agents.length!==2 || !aquarium.world.agentsById.has(ids[0]))throw Error('Switched to the wrong habitat');
    return {keptResidents:residents.length,fullCount:saved.creatures.length,followedMother:motherId,keptMeal:true,
      failuresRolledBack:['seat','write'],swimmer:swimmer.id,continuedCm,landings};
  });
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.aquarium?.ready);
  const restored=await page.evaluate(()=>({
    room:aquarium.game.data.BreedingRooms.activeId,ids:aquarium.world.agents.map(a=>a.data.CreatureId),
    brood:aquarium.game.data.Breeding.batches[0].status,count:aquarium.game.data.Breeding.batches[0].children.length
  }));
  if(restored.room!=='breeding'||!restored.ids.includes(report.landings[0].id)||restored.brood!=='hatched'||restored.count!==4)throw Error('Reload lost the hatch or the moved child');
  return {...report,restored};
}
