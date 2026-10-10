async page=>{
 const report={errors:[],samples:[]};page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.reload();await page.bringToFront();await page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:90000});await page.evaluate(()=>window.showDock?.('all'));const before=await page.evaluate(()=>localStorage.getItem('aquarium.three.creatures.v1'));
 try{
  await page.locator('#population-tools').evaluate(el=>{el.open=true;});await page.locator('#shrimp-count').fill('50');const begin=Date.now();await page.locator('#shrimp-apply').click();await page.waitForFunction(()=>aquarium.world.agents.length===50,null,{timeout:30000});report.add50ms=Date.now()-begin;
  if(!await page.evaluate(()=>aquarium.game.data.Tank.Environment.LightOn))await page.locator('#tank-light').click();await page.locator('#reset').click();await page.evaluate(()=>aquarium.game.feedAt({x:.09,y:.035,z:-.2}));
  await page.evaluate(()=>{window.auditFrames=[];window.auditLast=performance.now();window.auditOn=true;function sample(t){if(!window.auditOn)return;window.auditFrames.push(t-window.auditLast);window.auditLast=t;requestAnimationFrame(sample);}requestAnimationFrame(sample);});
  for(let i=0;i<9;i++){
   if(i===4)await page.evaluate(()=>{const p=aquarium.aq.animals[0].rig.getWorldPosition(aquarium.controls.target.clone());aquarium.controls.target.copy(p);aquarium.camera.position.copy(p).add({x:.12,y:.04,z:.1});aquarium.controls.update();});
   if(i===6)await page.locator('#reset').click();
   await page.waitForTimeout(10000);
   report.samples.push(await page.evaluate(i=>{const f=window.auditFrames.splice(0).filter(v=>v>0);f.sort((a,b)=>a-b);return {interval:i,view:i>=4&&i<6?'near':'tank',frames:f.length,fps:1000/(f.reduce((a,b)=>a+b,0)/f.length),p95ms:f[Math.floor(f.length*.95)],over50ms:f.filter(x=>x>50).length,elapsed:aquarium.world.elapsed,maxBodyDepth:Math.max(...aquarium.world.agents.map(a=>aquarium.habitat.depth(a.position,a.rotation))),finite:aquarium.world.agents.every(a=>a.position.toArray().every(Number.isFinite)&&a.rotation.toArray().every(Number.isFinite)),swimming:aquarium.world.agents.filter(a=>a.swim).length,memory:{...aquarium.renderer.info.memory},heapMB:performance.memory?.usedJSHeapSize/1048576};},i));
   if(i===5)await page.screenshot({path:'evidence/audit-near.png'});
  }
  report.summary=await page.evaluate(()=>{window.auditOn=false;const gl=aquarium.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {agents:aquarium.world.agents.length,shadows:aquarium.renderer.shadowMap.enabled,viewport:[innerWidth,innerHeight],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,metrics:aquarium.world.metrics,feet:{probes:aquarium.feet.probes,maxSlip:aquarium.feet.maxSlip},drawCalls:aquarium.renderer.info.render.calls,triangles:aquarium.renderer.info.render.triangles};});
  await page.screenshot({path:'evidence/audit-50.png'});await page.locator('#pause').click();const saved=await page.evaluate(()=>aquarium.game.snapshot());await page.evaluate(s=>aquarium.game.restore(s),saved);report.restoreAfterSoak=await page.evaluate(()=>aquarium.world.agents.length===50);
 }catch(e){report.failure=e.message;}
 finally{await page.evaluate(value=>{window.auditOn=false;aquarium.renderer.setAnimationLoop(null);if(value===null)localStorage.removeItem('aquarium.three.creatures.v1');else localStorage.setItem('aquarium.three.creatures.v1',value);Storage.prototype.setItem=function(){};},before);await page.reload();}
 return report;
}
