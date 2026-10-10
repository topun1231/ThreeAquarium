async page=>{
 const report={checks:[],errors:[]},check=(v,label)=>{if(!v)throw new Error(label);report.checks.push(label);};
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 const before=await page.evaluate(()=>Object.fromEntries(['aquarium.three.creatures.v1','aquarium.three.migration.v1','aquarium.three.previous'].map(k=>[k,localStorage.getItem(k)])));

 try{
  await page.reload();await page.bringToFront();await page.waitForFunction(()=>window.aquarium?.ready||window.aquarium?.error,null,{timeout:90000});check(await page.evaluate(()=>aquarium.ready),'full game reload succeeds');
  await page.locator('#pause').click();await page.evaluate(()=>aquarium.game.ensure());check(await page.evaluate(()=>aquarium.game.runtime.current.entities.size>=95),'editable scene retains original plants and visible wood');
  report.baseline=await page.evaluate(()=>({anchors:aquarium.world.anchors.length,surfaces:aquarium.habitat.surfaces.length,depth:aquarium.world.agents.map(a=>aquarium.habitat.depth(a.position,a.rotation))}));check(report.baseline.depth.every(n=>n<=.000301),'editable graph retains legal shrimp contacts');
  const roundtrip=await page.evaluate(()=>aquarium.game.snapshot());await page.evaluate(async saved=>{await aquarium.game.restore(saved);},roundtrip);check(await page.evaluate(saved=>aquarium.world.agents.every(a=>saved.creatures.some(c=>c.CreatureId===a.data.CreatureId&&JSON.stringify(c.Personality)===JSON.stringify(a.data.Personality))),roundtrip),'full restore retains creature identity and personality');
  await page.locator('#population-tools').evaluate(el=>{el.open=true;});await page.locator('#shrimp-count').fill('50');await page.locator('#shrimp-apply').click();await page.waitForFunction(()=>!aquarium.game.busy);check(await page.evaluate(()=>aquarium.world.agents.length===50&&aquarium.aq.animals.length===50),'50 independent shrimp spawned');
  report.capacity=await page.evaluate(()=>({count:aquarium.world.agents.length,geometries:aquarium.renderer.info.memory.geometries,textures:aquarium.renderer.info.memory.textures,triangles:aquarium.renderer.info.render.triangles,drawCalls:aquarium.renderer.info.render.calls}));
  await page.locator('#save').click();await page.reload();await page.waitForFunction(()=>window.aquarium?.ready||window.aquarium?.error,null,{timeout:90000});check(await page.evaluate(()=>aquarium.ready&&aquarium.world.agents.length===50),'50 shrimp survive reload');
  await page.locator('#pause').click();await page.locator('#population-tools').evaluate(el=>{el.open=true;});await page.locator('#shrimp-count').fill('5');await page.locator('#shrimp-apply').click();check(await page.evaluate(()=>aquarium.world.agents.length===5),'population reduction frees extra rigs');
  await page.evaluate(async()=>{const next=structuredClone(aquarium.game.data);next.Tank.Plants=[];next.Tank.Hardscape=[];next.Tank.Setup.Filled=false;next.Tank.Setup.PreparationStep=0;next.Tank.Substrate.MaterialLayers='';next.Tank.Substrate.Heightfield.QuantizedHeights=btoa(String.fromCharCode(...new Uint8Array(96*64*2)));await aquarium.game.transact(next);});
  check(await page.evaluate(()=>aquarium.game.runtime.current.entities.size===0&&aquarium.aq.animals.every(a=>!a.rig.visible)),'empty dry tank hides creatures and setup objects');
  await page.screenshot({path:'evidence/full-empty.png'});
  await page.evaluate(async saved=>{await aquarium.game.restore(saved);},roundtrip);check(await page.evaluate(()=>aquarium.game.data.Tank.Plants.length===89),'full tank restored after empty setup');
  await page.screenshot({path:'evidence/full-runtime.png'});
 }catch(e){report.failure=e.stack;throw e;}finally{await page.evaluate(before=>{for(const [key,value]of Object.entries(before)){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}Storage.prototype.setItem=function(){};},before);await page.reload();}
 return report;
}

