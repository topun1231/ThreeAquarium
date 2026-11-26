// Run with a fresh 5174 Playwright page. Supply a prior Vite module with absolute
// imports to compare two pickers on identical poses and pointer coordinates.
async (page,referenceModule=null)=>{
  await page.locator('#welcome-dismiss').click();
  await page.locator('#crystal-open').click();
  await page.locator('#crystal-start').click();
  await page.locator('#crystal-panel').waitFor({state:'hidden'});
  await page.waitForFunction(()=>aquarium.aq.animals.some(a=>a.id==='I1'));
  return page.evaluate(async reference=>{
    const url=performance.getEntriesByType('resource').map(r=>r.name).find(s=>s.includes('/deps/three.js'));
    const T=await import(url), {createShrimpPicker}=await import('/src/shrimp-picking.js');
    const {resizePopulation}=await import('/src/population.js');
    const packed=await fetch('/assets/neighbour-shrimp.json').then(r=>r.json());
    const referenceURL=reference ? URL.createObjectURL(new Blob([reference],{type:'text/javascript'})) : null;
    let previous;
    try{if(referenceURL)previous=(await import(referenceURL)).createShrimpPicker;}
    finally{if(referenceURL)URL.revokeObjectURL(referenceURL);}
    const {aq,renderer,camera,habitat}=aquarium,rect=renderer.domElement.getBoundingClientRect();
    const ray=new T.Raycaster(),pointer=new T.Vector2(),tip=new T.Vector3(),eye=new T.Vector3(),dir=new T.Vector3();
    const blocked=(o,d,distance)=>habitat.cast(eye.set(o.x,o.y,-o.z),dir.set(d.x,d.y,-d.z),
      Math.max(0,distance-.002),false,undefined,'obstruction');
    renderer.setAnimationLoop(null);aquarium.reset();camera.updateMatrixWorld(true);
    const initial=aq.animals.length, reports=[];
    let world=aquarium.world;
    for(const [count,cluster] of [[initial,false],[20,false],[50,false],[50,true]]){
      if(aq.animals.length!==count){
        const grown=resizePopulation(aq,world,count);grown.commit();world=grown.world;
      }
      // A repeatable picker stress case. These posed rigs are never saved as a breeding room.
      if(cluster){
        const center=aq.animals.find(a=>a.id==='I1').rig.position.clone();
        aq.animals.forEach((a,i)=>a.rig.position.set(center.x+(i%5-2)*.032,center.y,center.z+(Math.floor(i/5)-4.5)*.032));
      }
      aq.root.updateMatrixWorld(true);
      const probes=[];
      for(const a of aq.animals.filter((_,i)=>i<10 || i%6===0)){
        a.rig.localToWorld(tip.set(.009,.0045,0)).project(camera);
        for(const [dx,dy,pad] of [[0,0,4],[3,0,4],[0,8,9],[0,16,4]]){
          probes.push([tip.x+2*dx/rect.width,tip.y+2*dy/rect.height,pad]);
        }
      }
      probes.push([-.95,.85,4],[.19,.75,4],[.02,-.25,4],[-.4,.3,4],[.8,-.7,4]);
      const current=createShrimpPicker(packed),before=previous?.(packed);
      const currentMs=[],beforeMs=[],differences=[];
      let hits=0;
      function sample(picker,times,pad){
        const start=performance.now(),id=picker(aq.meshes,camera,ray.ray,pointer,rect,pad,blocked);
        times.push(performance.now()-start);return id;
      }
      // Warm each picker, then alternate measurement order to avoid always favouring the second.
      for(let pass=0;pass<=2;pass++){
        for(const [i,[x,y,pad]] of probes.entries()){
          pointer.set(x,y);ray.setFromCamera(pointer,camera);
          let former;
          const first=(i+pass)%2===0;
          if(before && first)former=sample(before,beforeMs,pad);
          const chosen=sample(current,currentMs,pad);
          if(before && !first)former=sample(before,beforeMs,pad);
          if(pass===1){
            if(chosen!==null)hits++;
            if(before && former!==chosen)differences.push({x,y,pad,former,chosen});
          }
        }
        if(!pass){currentMs.length=0;beforeMs.length=0;}
      }
      function timings(values){
        values.sort((a,b)=>a-b);
        const percentile=p=>+values[Math.ceil(values.length*p)-1].toFixed(2);
        return {p50:percentile(.5),p95:percentile(.95)};
      }
      reports.push({count,cluster,probes:probes.length,measuredPerPicker:currentMs.length,hits,differences,
        currentMs:timings(currentMs),previousMs:before ? timings(beforeMs) : null});
    }
    return reports;
  },referenceModule);
}
