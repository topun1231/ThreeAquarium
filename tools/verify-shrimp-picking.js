async page=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
  await page.locator('#welcome-dismiss').click();
  await page.locator('#crystal-open').click();await page.locator('#crystal-start').click();
  await page.locator('#crystal-panel').waitFor({state:'hidden'});
  await page.waitForFunction(()=>aquarium.aq.animals.some(a=>a.id==='I1'));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const report=await page.evaluate(async()=>{
    const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>/\/deps\/three\.js(?:\?|$)/.test(u));
    const T=await import(url), {createShrimpPicker}=await import('/src/shrimp-picking.js');
    const packed=await fetch('/assets/neighbour-shrimp.json').then(r=>r.json()), pick=createShrimpPicker(packed);
    const {aq,camera,renderer,habitat}=aquarium, canvas=renderer.domElement, rect=canvas.getBoundingClientRect();
    // Compare both algorithms on the very same frame, including wood and rock between the eye and the shrimp.
    renderer.setAnimationLoop(null);aquarium.reset();camera.updateMatrixWorld();aq.root.updateWorldMatrix(true,true);
    const ray=new T.Raycaster(), pointer=new T.Vector2(), tip=new T.Vector3(), o=new T.Vector3(), d=new T.Vector3();
    const meshes=aq.meshes.filter(m=>m.userData.creatureId && m.parent.visible), oldTimes=[], times=[], probes=[];
    const blocked=(eye,dir,dist)=>!!habitat.cast(o.set(eye.x,eye.y,-eye.z),d.set(dir.x,dir.y,-dir.z),Math.max(0,dist-.002),false,undefined,'obstruction');
    function aim(x,y){
      pointer.set((x-rect.left)*2/rect.width-1,1-(y-rect.top)*2/rect.height);
      ray.setFromCamera(pointer,camera);
    }
    function current(padding,occlusion=blocked){return pick(aq.meshes,camera,ray.ray,pointer,rect,padding,occlusion);}
    const interactable=(x,y)=>document.elementFromPoint(x,y)===canvas;
    let near=null, rock=null, touch=null;
    for(const animal of aq.animals.filter(a=>/^I[1-7]$/.test(a.id))){
      animal.rig.localToWorld(tip.set(.009,.0045,0)).project(camera);
      const cx=Math.round(rect.left+(tip.x+1)*rect.width/2), cy=Math.round(rect.top+(1-tip.y)*rect.height/2);
      for(const [dx,dy] of [[0,0],[0,3],[0,-3],[3,0],[-3,0]]){
        const x=cx+dx,y=cy+dy;aim(x,y);
        let start=performance.now();
        const hit=ray.intersectObjects(meshes,false)[0], raw=hit?.object.userData.creatureId??null;
        const old=hit && !blocked(ray.ray.origin,ray.ray.direction,hit.distance)?raw:null;
        oldTimes.push(performance.now()-start);
        start=performance.now();
        const chosen=current(4);times.push(performance.now()-start);
        const clear=current(4,null), probe={id:animal.id,x,y,dx,dy,raw,old,clear,chosen};
        probes.push(probe);
        if(!interactable(x,y))continue;
        if((dx||dy) && !old && chosen===animal.id)near??=probe;
        if(raw===animal.id && old===null && clear===animal.id && chosen===null)rock??=probe;
      }
      if(!touch)for(const dy of [-8,8,-10,10]){
        aim(cx,cy+dy);
        if(interactable(cx,cy+dy) && !current(4) && current(9)===animal.id){touch={x:cx,y:cy+dy,id:animal.id};break;}
      }
    }
    const empty=near && [24,-24,48,-48,80,-80].map(dx=>({x:near.x+dx,y:near.y})).find(p=>{
      aim(p.x,p.y);return interactable(p.x,p.y) && !current(9);
    });
    const offsets=probes.filter(p=>p.dx||p.dy);
    const median=values=>Math.round(values.sort((a,b)=>a-b)[Math.floor(values.length/2)]*10)/10;
    return {residents:aq.animals.length,triangles:packed[0].groups.reduce((sum,s)=>sum+atob(s).length/12,0),
      oldMs:median(oldTimes),newMs:median(times),oldOffsets:offsets.filter(p=>p.old===p.id).length,
      newOffsets:offsets.filter(p=>p.chosen===p.id).length,totalOffsets:offsets.length,near,rock,touch,empty,probes};
  });
  const selection=()=>page.evaluate(()=>aquarium.selected??null);
  const reset=()=>page.evaluate(()=>{aquarium.reset();aquarium.camera.updateMatrixWorld();});
  const canvas=page.locator('#tank');
  async function hover(p){
    await page.mouse.move(4,4);await page.waitForTimeout(200);await page.mouse.move(p.x,p.y);
    return canvas.evaluate(el=>el.style.cursor);
  }
  check(report.newOffsets>report.oldOffsets,'No improvement on a 3px near miss');
  check(report.near,'No visible near-miss specimen found');
  const p=report.near;
  check(report.empty,'No empty patch beside the test shrimp');
  report.quickHover=await canvas.evaluate(async(el,{hit,empty})=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    function send(type,point,extra={}){
      el.dispatchEvent(new PointerEvent(type,{pointerId:1,isPrimary:true,pointerType:'mouse',bubbles:true,
        clientX:point.x,clientY:point.y,...extra}));
    }
    async function burst(from,to,wanted,cancel){
      send('pointerleave',from);send('pointermove',from);send('pointermove',to);
      if(cancel==='drag')send('pointermove',to,{buttons:1});
      else if(cancel==='blur')window.dispatchEvent(new Event('blur'));
      else if(cancel)send(cancel,to);
      await wait(200);
      return el.style.cursor===wanted;
    }
    return {
      enter:await burst(empty,hit,'pointer'), leave:await burst(hit,empty,''),
      drag:await burst(empty,hit,'','drag'), outside:await burst(empty,hit,'','pointerleave'),
      cancel:await burst(empty,hit,'','pointercancel'), blur:await burst(empty,hit,'','blur')
    };
  },{hit:p,empty:report.empty});
  check(Object.values(report.quickHover).every(Boolean),'A rapid or cancelled hover left the wrong cursor');
  check(await hover(p)==='pointer','Visible shell did not show the pointer cursor');
  await page.mouse.click(p.x,p.y);
  check(await selection()===p.id,'Real click did not select the individual under the pointer');await reset();
  await page.mouse.click(p.x,p.y,{button:'right'});
  check(await selection()===null,'A right click selected a shrimp');await reset();
  await page.mouse.move(p.x,p.y);await page.mouse.down();
  await page.mouse.move(p.x+15,p.y,{steps:3});await page.mouse.move(p.x,p.y);await page.mouse.up();
  check(await selection()===null,'Dragging selected a shrimp');await reset();
  if(report.rock){
    const r=report.rock;
    check(await hover(r)!=='pointer','Hover selected through scenery');
    await page.mouse.click(r.x,r.y);check(await selection()===null,'Click selected through scenery');await reset();
  }
  check(report.touch,'No touch-only visible shell found');
  const finger=report.touch, client=await page.context().newCDPSession(page);
  try{
    await client.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:finger.x,y:finger.y}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(id=>aquarium.selected===id,finger.id);
  }finally{await client.detach();}
  const roster=()=>page.evaluate(()=>aquarium.game.data.Breeding.individuals.map(s=>[s.id,s.name,s.tank]));
  const before=await roster();await page.reload();
  await page.waitForFunction(()=>window.aquarium?.ready && aquarium.game.data.Breeding?.individuals.length>0,null,{timeout:90000});
  check(JSON.stringify(before)===JSON.stringify(await roster()),'The saved roster changed after reload');
  const moved=await page.evaluate(async()=>{
    const {game,aq,camera,renderer}=aquarium;
    await game.crystalAction({type:'move',id:'I7',tankId:'breeding'});
    await game.switchCrystalRoom('breeding');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    renderer.setAnimationLoop(null);aquarium.reset();camera.updateMatrixWorld();aq.root.updateWorldMatrix(true,true);
    const animal=aq.animals.find(a=>a.id==='I7'), pt=animal.rig.position.clone().set(.009,.0045,0);
    animal.rig.localToWorld(pt).project(camera);
    const rect=renderer.domElement.getBoundingClientRect();
    return {x:rect.left+(pt.x+1)*rect.width/2,y:rect.top+(1-pt.y)*rect.height/2,room:game.data.BreedingRooms.activeId};
  });
  await page.mouse.click(moved.x,moved.y);
  check(moved.room==='breeding' && await selection()==='I7','Transferred shrimp could not be selected in its new tank');
  report.transferred='I7';
  // Keep the mouse parked while the visible contents of the breeding tank change.
  await reset();
  check(await hover(moved)==='pointer','Parked pointer did not start on the transferred shrimp');
  await page.evaluate(()=>{
    aquarium.aq.animals.find(a=>a.id==='I7').rig.visible=false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  try{
    await page.waitForFunction(()=>document.querySelector('#tank').style.cursor==='',null,{timeout:5000});
  }finally{
    await page.evaluate(()=>{aquarium.aq.animals.find(a=>a.id==='I7').rig.visible=true;});
  }
  await page.waitForFunction(()=>document.querySelector('#tank').style.cursor==='pointer',null,{timeout:5000});
  report.parkedPointer=true;
  return report;
}
