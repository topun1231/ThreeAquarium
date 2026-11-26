async (page, {baseline = false, interruption} = {}) => {
  const check = (ok,reason) => { if (!ok) throw Error(reason); };
  const c = name => page.locator('#crystal-'+name);
  await page.locator('#welcome-dismiss').click(); await c('open').click(); await c('start').click();
  await c('panel').waitFor({state:'hidden'});
  await page.waitForFunction(()=>aquarium.aq.animals.some(a=>a.id==='I3'));
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));

  // Hold one pose long enough to reproduce the same crossing with mouse and touch input.
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map(e=>e.name).find(u=>/\/deps\/three\.js(?:\?|$)/.test(u));
    const T = await import(url), {createShrimpPicker} = await import('/src/shrimp-picking.js');
    const packed = await fetch('/assets/neighbour-shrimp.json').then(r=>r.json());
    const pick = createShrimpPicker(packed), {aq,camera,renderer,habitat} = aquarium;
    const canvas = renderer.domElement, rect = canvas.getBoundingClientRect(), ray = new T.Raycaster(), pointer = new T.Vector2();
    const first = aq.animals.find(a=>a.id==='I2').rig, second = aq.animals.find(a=>a.id==='I3').rig;
    const saved = aq.animals.map(a=>({rig:a.rig, position:a.rig.position.clone(), rotation:a.rig.quaternion.clone(), visible:a.rig.visible}));
    const centre = new T.Vector3(.009,.0045,0), eye = new T.Vector3(), direction = new T.Vector3();
    renderer.setAnimationLoop(null);
    let pressTarget=null;
    document.addEventListener('pointerdown',event=>{pressTarget=event.target;},true);
    function reset(){ aquarium.reset(); camera.updateMatrixWorld(); aq.root.updateWorldMatrix(true,true); }
    function restore(){
      for(const {rig,position,rotation,visible} of saved){rig.position.copy(position);rig.quaternion.copy(rotation);rig.visible=visible;}
      aq.root.updateWorldMatrix(true,true);
    }
    function aim(rig,where){
      const from = rig.parent.worldToLocal(rig.localToWorld(centre.clone()));
      rig.position.add(rig.parent.worldToLocal(where.clone()).sub(from));
      rig.updateWorldMatrix(true,true);
    }
    function blocked(o,d,limit){ return habitat.cast(eye.set(o.x,o.y,-o.z),direction.set(d.x,d.y,-d.z),Math.max(0,limit-.002),false,undefined,'obstruction'); }
    let start, otherLane, right, point, stone;
    function behindStone(){
      const cam=new T.Vector3(camera.position.x,camera.position.y,-camera.position.z);
      for(const s of habitat.surfaces.filter(s=>s.kind===1 && s.solid)){
        const toward=s.box.getCenter(new T.Vector3()).sub(cam).normalize();
        const hit=habitat.cast(cam,toward,5,false,[s]);
        if(!hit)continue;
        const inside=hit.point.clone().addScaledVector(toward,.035);inside.z*=-1;
        return {position:inside,owner:s.owner};
      }
      throw Error('Missing a rock for the obstruction check');
    }
    function hit(padding=4){
      aq.root.updateMatrixWorld(true);
      pointer.set((point.x-rect.left)*2/rect.width-1,1-(point.y-rect.top)*2/rect.height);
      ray.setFromCamera(pointer,camera);return pick([ ...shells(first), ...shells(second) ],camera,ray.ray,pointer,rect,padding,blocked);
    }
    function shells(rig){const parts=[];rig.traverse(n=>{if(n.isSkinnedMesh)parts.push(n);});return parts;}
    function pose(state){
      first.visible=state!=='hidden'; second.visible=state==='crossed' || state==='hidden' || state==='stone';
      const away=state==='away' || state==='crossed';
      let position=start;
      if(away)position=start.clone().add(right);
      if(state==='stone'){stone=behindStone();position=stone.position;}
      aim(first,position); aim(second,otherLane);
    }
    function prepare(){
      restore(); reset(); pressTarget=null; for(const record of saved)record.rig.visible=false;
      const attempts=[];
      for(const record of saved){
        first.position.copy(record.position);first.quaternion.copy(record.rotation);second.quaternion.copy(record.rotation);
        first.updateWorldMatrix(true,true);start=first.localToWorld(centre.clone()); start.y+=.025;
        const projected=start.clone().project(camera);
        point={x:Math.round(rect.left+(1+projected.x)*rect.width/2),y:Math.round(rect.top+(1-projected.y)*rect.height/2)};
        if(point.x<rect.left+rect.width*.24 || point.x>rect.left+rect.width*.79)continue;
        if([[0,0],[-28,0],[28,0],[0,-28],[0,28]].some(([x,y])=>document.elementFromPoint(point.x+x,point.y+y)!==canvas))continue;
        otherLane=start.clone().addScaledVector(camera.position.clone().sub(start).normalize(),.025);
        const depth=-start.clone().applyMatrix4(camera.matrixWorldInverse).z;
        right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(32*2*depth/(rect.height*camera.projectionMatrix.elements[5]));
        const hits=[];attempts.push(hits);
        pose('start');hits.push(hit());if(hits[0]!=='I2')continue;
        pose('away');hits.push(hit(9));if(hits[1]!==null)continue;
        pose('crossed');hits.push(hit());if(hits[2]!=='I3')continue;
        pose('start');return point;
      }
      throw Error('Could not stage a visible crossing outside the UI: '+JSON.stringify(attempts));
    }
    window.movingTap={prepare,pose,hit,restore,canvasPressed:()=>pressTarget===canvas,stoneOwner:()=>stone?.owner};
  });
  const selection = () => page.evaluate(()=>aquarium.selected??null);
  const client = await page.context().newCDPSession(page);
  async function tap(from,to,touch=false){
    const point=await page.evaluate(()=>movingTap.prepare());
    await page.evaluate(v=>movingTap.pose(v),from);
    const pressed=await page.evaluate(p=>movingTap.hit(p),touch?9:4);
    if(touch)await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    else {await page.mouse.move(point.x,point.y); await page.mouse.down();}
    check(await page.evaluate(()=>movingTap.canvasPressed()),'A HUD control intercepted the test gesture');
    await page.evaluate(v=>movingTap.pose(v),to);
    const released=await page.evaluate(p=>movingTap.hit(p),touch?9:4);
    if(touch)await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await page.mouse.up();
    return {pressed,released,selected:await selection()};
  }
  try {
    if(interruption){
      const point=await page.evaluate(()=>movingTap.prepare());
      await page.mouse.move(point.x,point.y);await page.mouse.down();
      check(await page.evaluate(()=>movingTap.canvasPressed() && movingTap.hit()==='I2'),'Interrupted press missed the resident');
      const state=await page.evaluate(async kind=>{
        const {game,world}=aquarium;
        if(kind==='room')await game.switchCrystalRoom('breeding');
        else if(kind==='restore')await game.restore(game.snapshot());
        else throw Error('Unknown test interruption');
        return {worldChanged:world!==aquarium.world,room:game.data.BreedingRooms.activeId,stillOwned:game.data.Breeding.individuals.some(r=>r.id==='I2')};
      },interruption);
      await page.mouse.up();const selected=await selection();
      check(state.worldChanged && state.stillOwned && selected===null,'The release selected a shrimp across a room or save change');
      return {...state,selected};
    }
    const crossing=await tap('start','crossed'), departing=await tap('start','away',true), arriving=await tap('away','start');
    const hidden=await tap('start','hidden',true);
    const occluded=await tap('start','stone'), stone=await page.evaluate(()=>movingTap.stoneOwner());
    const report={crossing,departing,arriving,hidden,occluded,stone};
    check(crossing.pressed==='I2' && crossing.released==='I3' && departing.released===null && arriving.pressed===null && hidden.released==='I3','Invalid body positions for the gestures');
    if(baseline)return report;
    check(crossing.selected==='I2' && departing.selected==='I2','The moving shrimp was lost or replaced by its neighbour');
    check(arriving.selected===null && hidden.selected===null && occluded.selected===null,'An empty press or a hidden shrimp selected a different resident: '+JSON.stringify(report));

    await page.evaluate(()=>{movingTap.restore();aquarium.reset();});
    await c('open').click();await c('tab-roster').click();await c('roster').locator('[data-individual-id="I1"]').click();
    await c('focus').click();await c('tank-next-generation').click();await c('tank-pair').waitFor();
    const mate=await tap('start','crossed',true);
    check(mate.selected==='I2' && await c('tank-mate-use').evaluate(el=>el.value)==='I2','A crossing replaced the chosen mate');
    await c('tank-mate-use').click();await c('panel').waitFor();
    check(await c('mother').inputValue()==='I1' && await c('father').inputValue()==='I2','Pairing draft shows a different resident');
    check(await page.evaluate(()=>aquarium.game.data.Breeding.batches.length)===0,'Observing the mate already started a brood');
    await c('plan').click();await page.waitForFunction(()=>aquarium.game.data.Breeding.batches.length===1);
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.aquarium?.ready && aquarium.game.data.Breeding?.batches.length===1);
    const batch=await page.evaluate(()=>{const b=aquarium.game.data.Breeding.batches[0];return [b.motherId,b.fatherId];});
    check(batch.join(',')==='I1,I2','Reload restored the wrong parents');
    return {...report,mate,confirmedParentsAfterReload:batch};
  } finally {await client.detach();}
}
