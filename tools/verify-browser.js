async page => {
 const result={date:new Date().toISOString(),checks:[],errors:[]};
 page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/GL_INVALID|Shader Error|PropertyBinding/.test(m.text()))result.errors.push(m.text());});
 const check=(ok,label)=>{if(!ok)throw new Error(label);result.checks.push(label);};
 await page.reload();await page.bringToFront();await page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:60000});
 const preserved=await page.evaluate(()=>[localStorage.getItem('aquarium.three.creatures.v1'),localStorage.getItem('aquarium.three.migration.v1')]);
 try{
 check(await page.locator('#action').inputValue()==='Auto','opens in autonomous mode');
 await page.locator('#feed').click();check(await page.evaluate(()=>!!aquarium.world.pellet),'feeding publishes real food');
 const before=await page.evaluate(()=>aquarium.world.agents.map(a=>({id:a.data.CreatureId,p:a.position.toArray(),needs:{...a.data.Needs}})));
 await page.waitForFunction(before=>aquarium.world.agents.some((a,i)=>a.position.toArray().some((v,j)=>Math.abs(v-before[i].p[j])>.001)),before,{timeout:60000});
 await page.waitForTimeout(1000);
 result.behavior=await page.evaluate(()=>({elapsed:aquarium.world.elapsed,metrics:{...aquarium.world.metrics},agents:aquarium.world.agents.map(a=>({id:a.data.CreatureId,p:a.position.toArray(),state:a.data.ExecutionState,depth:aquarium.habitat.depth(a.position,a.rotation),needs:{...a.data.Needs}}))}));
 check(result.behavior.agents.some((a,i)=>a.p.some((v,j)=>Math.abs(v-before[i].p[j])>.001)),'autonomous movement updates creature roots');
 check(result.behavior.agents.every(a=>a.depth<=.000301),'all visible bodies remain within original contact tolerance');
 await page.locator('#pause').click();const paused=await page.evaluate(()=>aquarium.world.snapshot());await page.waitForTimeout(350);check(await page.evaluate(s=>JSON.stringify(aquarium.world.snapshot())===JSON.stringify(s),paused),'pause freezes needs, food and movement');
 await page.locator('#save').click();const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('aquarium.three.creatures.v1')));
 const download=page.waitForEvent('download');await page.locator('#export').click();const file=await download;await file.saveAs('evidence/browser-roundtrip.json');
 await page.reload();await page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:60000});await page.locator('#pause').click();
 const restored=await page.evaluate(()=>aquarium.world.snapshot());check(restored.creatures.every(c=>stored.creatures.some(s=>s.CreatureId===c.CreatureId&&JSON.stringify(s.Personality)===JSON.stringify(c.Personality))),'reload preserves all identities and personalities');
 check(restored.creatures.every(c=>Math.abs(c.Needs.Hunger-stored.creatures.find(s=>s.CreatureId===c.CreatureId).Needs.Hunger)<.01),'reload retains needs');
 const validSaved=await page.evaluate(()=>localStorage.getItem('aquarium.three.creatures.v1'));
 await page.locator('#import').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:2,view:await page.evaluate(()=>aquarium.progress()),game:{...stored,tankId:'wrong'}}))});
 await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('导入失败'));check(await page.evaluate(s=>localStorage.getItem('aquarium.three.creatures.v1')===s,validSaved),'invalid import leaves prior game save intact');
 await page.locator('#import').setInputFiles('evidence/browser-roundtrip.json');await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('虾与食物进度已恢复'));check(true,'full browser export/import round trip');
 await page.locator('#pause').click();await page.locator('#action').selectOption('Groom');const manual=await page.evaluate(()=>aquarium.world.agents.map(a=>a.position.toArray()));await page.waitForTimeout(500);check(await page.evaluate(p=>aquarium.world.agents.every((a,i)=>a.position.toArray().every((v,j)=>v===p[i][j])),manual),'manual action inspection suspends locomotion');
 for(const name of ['Rest','Walk','Graze','Groom','RoutineSwim','EscapeSwim']){await page.locator('#action').selectOption(name);await page.waitForTimeout(150);check(await page.evaluate(name=>aquarium.aq.animals.every(a=>a.active===name&&a.bones.every(i=>aquarium.aq.nodes[i].matrixWorld.elements.every(Number.isFinite))),name),'manual clip '+name+' remains valid');}
 await page.locator('#action').selectOption('Auto');await page.locator('#reset').click();await page.waitForTimeout(1000);
 result.runtime=await page.evaluate(async()=>{const a=aquarium,times=[];let last=performance.now();await new Promise(resolve=>{function frame(now){times.push(now-last);last=now;if(times.length>=180)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});times.shift();times.sort((x,y)=>x-y);return {fps:1000/(times.reduce((s,t)=>s+t,0)/times.length),p95ms:times[Math.floor(times.length*.95)],shadows:a.renderer.shadowMap.enabled,drawCalls:a.renderer.info.render.calls,programs:a.renderer.info.programs.length,viewport:[innerWidth,innerHeight],animals:a.world.agents.length};});
 check(result.runtime.shadows,'real shadows remain enabled');check(result.errors.length===0,'no browser, shader or WebGL errors');
 await page.screenshot({path:'evidence/behavior-runtime.png'});
 await page.locator('#action').selectOption('Rest');
 await page.evaluate(()=>{const a=aquarium.aq.animals[0],p=a.rig.localToWorld(a.rig.position.clone().set(.01,.004,0));aquarium.controls.target.copy(p);aquarium.camera.position.copy(p).add(p.clone().set(0,.045,.10));aquarium.controls.update();});
 await page.waitForTimeout(500);await page.screenshot({path:'evidence/behavior-near.png'});
 await page.locator('#action').selectOption('Auto');await page.locator('#reset').click();
 return result;
 }finally{
  await page.evaluate(values=>{aquarium.renderer.setAnimationLoop(null);['aquarium.three.creatures.v1','aquarium.three.migration.v1'].forEach((key,i)=>{if(values[i]===null)localStorage.removeItem(key);else localStorage.setItem(key,values[i]);});Storage.prototype.setItem=function(){};},preserved);
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:60000});
 }
}
