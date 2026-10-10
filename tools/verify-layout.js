async page => {
 const result={date:new Date().toISOString(),checks:[],errors:[]},check=(ok,label)=>{if(!ok)throw new Error(label);result.checks.push(label);};
 page.on('pageerror',e=>result.errors.push(e.message));
 await page.reload();await page.bringToFront();await page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:60000});
 const original=await page.evaluate(()=>({game:localStorage.getItem('aquarium.three.creatures.v1'),view:localStorage.getItem('aquarium.three.migration.v1')}));
 const id='0c99a3418eb243ccafbe47f737b57daa';
 try{
  await page.locator('#pause').click();await page.locator('#save').click();
  const baseline=await page.evaluate(()=>({layout:aquarium.layout,game:aquarium.world.snapshot(),view:aquarium.progress()}));
  await page.locator('#plant-panel summary').click();await page.locator('#edit-plants').click();await page.locator('#plant-choice').selectOption(id);
  await page.locator('#pause').click();
  check(await page.locator('#plant-choice option').count()===89,'all 89 original plants selectable');
  check(await page.locator('#feed').isDisabled(),'feeding disabled while editing');
  const prior=await page.evaluate(()=>aquarium.world.elapsed);await page.waitForTimeout(150);check(await page.evaluate(t=>aquarium.world.elapsed===t,prior),'simulation frozen during editing');
  await page.locator('#plant-right').click();await page.waitForFunction(id=>aquarium.layout.some(p=>p.id===id&&p.yaw>0),id);
  const rotated=await page.evaluate(()=>aquarium.layout);check(rotated.some(p=>p.id===id),'rotation commits');
  check(await page.evaluate(()=>document.getElementById('feed').disabled),'edit mode stays paused after commit');
  await page.locator('#plant-undo').click();await page.waitForFunction(old=>JSON.stringify(aquarium.layout)===JSON.stringify(old),baseline.layout);check(true,'undo restores exact prior layout');
  await page.locator('#plant-redo').click();await page.waitForFunction(old=>JSON.stringify(aquarium.layout)===JSON.stringify(old),rotated);check(true,'redo restores rotation');
  await page.evaluate(()=>{const a=aquarium;a.controls.target.set(.15,.06,0);a.camera.position.set(.15,.8,.8);a.controls.update();});await page.waitForTimeout(300);
  await page.locator('#plant-move').click();await page.keyboard.press('Escape');check(await page.locator('#plant-move').textContent()==='移动到新位置','Escape cancels pending placement');
  await page.locator('#plant-move').click();
  const point=await page.evaluate(()=>{const a=aquarium,p=a.camera.position.clone().set(.42,.037,.18).project(a.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
  await page.mouse.click(point.x,point.y);await page.waitForFunction(id=>aquarium.layout.some(p=>p.id===id&&p.x>.40),id);
  const edited=await page.evaluate(id=>{const a=aquarium,node=a.aq.nodes.find(n=>n.userData.plantId===id);return {layout:a.layout,position:node.position.toArray(),scale:node.scale.toArray(),game:a.world.snapshot(),saved:JSON.parse(localStorage.getItem('aquarium.three.creatures.v1'))};},id);
  check(edited.position[0]>.4,'clicking ground moves the rendered plant');check(JSON.stringify(edited.layout)===JSON.stringify(edited.saved.layout),'layout and simulation saved atomically');
  check(edited.game.creatures.every(c=>baseline.game.creatures.some(b=>b.CreatureId===c.CreatureId&&JSON.stringify(b.Needs)===JSON.stringify(c.Needs)&&JSON.stringify(b.Personality)===JSON.stringify(c.Personality))),'edit preserves shrimp identities, needs and personalities');
  await page.locator('#plant-choice').selectOption({index:0});
  const leaf=await page.evaluate(id=>{const a=aquarium,m=a.aq.meshes.find(m=>m.userData.plantId===id),idx=m.geometry.index.array,v=m.geometry.attributes.position,p=a.camera.position.clone().set(0,0,0);for(let i=0;i<3;i++)p.add(a.camera.position.clone().fromBufferAttribute(v,idx[i]));p.divideScalar(3).applyMatrix4(m.matrixWorld).project(a.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},id);
  await page.mouse.click(leaf.x,leaf.y);check(await page.locator('#plant-choice').inputValue()===id,'clicking an actual leaf selects its plant');
  await page.screenshot({path:'evidence/layout-runtime.png'});
  const download=page.waitForEvent('download');await page.locator('#export').click();await (await download).saveAs('evidence/layout-roundtrip.json');
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:60000});await page.locator('#pause').click();
  check(await page.evaluate(layout=>JSON.stringify(aquarium.layout)===JSON.stringify(layout),edited.layout),'reload restores edited layout');
  check(await page.evaluate(p=>aquarium.aq.nodes.find(n=>n.userData.plantId===p.id).position.toArray().every((v,i)=>Math.abs(v-p.pos[i])<1e-10),{id,pos:edited.position}),'reload restores visible root exactly');
  const stored=await page.evaluate(()=>localStorage.getItem('aquarium.three.creatures.v1'));
  await page.locator('#import').setInputFiles({name:'bad-layout.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:3,view:baseline.view,game:{...edited.saved,layout:[{id,x:99,z:0,yaw:0}]}}))});
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('导入失败'));
  check(await page.evaluate(s=>localStorage.getItem('aquarium.three.creatures.v1')===s,stored),'invalid layout import leaves saved game untouched');
  await page.locator('#import').setInputFiles('evidence/layout-roundtrip.json');await page.waitForFunction(()=>document.getElementById('message').textContent.includes('已同步'));
  check(await page.evaluate(layout=>JSON.stringify(aquarium.layout)===JSON.stringify(layout),edited.layout),'version 3 export/import carries layout');
  await page.locator('#plant-panel summary').click();await page.locator('#edit-plants').click();await page.locator('#plant-choice').selectOption(id);
  await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='aquarium.three.creatures.v1')throw new DOMException('test quota','QuotaExceededError');return window.originalSetItem.call(this,k,v);};});
  await page.locator('#plant-right').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('test quota'));
  check(await page.evaluate(l=>JSON.stringify(aquarium.layout)===JSON.stringify(l),edited.layout),'storage failure rolls back visible and physical layout');
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;delete window.originalSetItem;});
  await page.locator('#import').setInputFiles({name:'legacy-v2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:2,view:baseline.view,game:baseline.game}))});
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('已同步'));
  check(await page.evaluate(()=>aquarium.layout.length===0),'legacy version 2 import uses original layout');
  await page.evaluate(()=>{aquarium.renderer.setAnimationLoop(null);localStorage.setItem('aquarium.three.creatures.v1',JSON.stringify({version:1,layout:null}));Storage.prototype.setItem=function(){};});
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:60000});
  check(await page.locator('#message').textContent().then(s=>s.includes('已保留')),'invalid stored layout opens fallback with recovery message');
  const invalid=await page.evaluate(()=>localStorage.getItem('aquarium.three.creatures.v1'));await page.locator('#save').click();
  check(await page.evaluate(s=>localStorage.getItem('aquarium.three.creatures.v1')===s,invalid),'fallback does not overwrite invalid stored progress');
  check(result.errors.length===0,'no browser runtime errors');return result;
 }finally{
  await page.evaluate(original=>{if(window.originalSetItem){Storage.prototype.setItem=window.originalSetItem;delete window.originalSetItem;}aquarium.renderer.setAnimationLoop(null);for(const [key,value] of [['aquarium.three.creatures.v1',original.game],['aquarium.three.migration.v1',original.view]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}Storage.prototype.setItem=function(){};},original);
  // The old page's pagehide save is suppressed; reload gets a fresh Storage prototype.
  await page.reload();await page.waitForFunction(()=>window.aquarium?.ready,null,{timeout:60000});
 }
}
