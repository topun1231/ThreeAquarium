async page => {
  // Run against the live wallpaper player in an isolated browser context.
  await page.waitForFunction(()=>window.aquarium?.ready && aquarium.renderedFrames>1);
  const state=()=>page.evaluate(()=>{
    const {aq,renderedFrames}=aquarium;
    const map=aq.meshes.find(m=>m.name==='Dim room wall').material[0].map;
    const paper=map.image.getContext('2d').getImageData(1380,258,130,126);
    let hash=2166136261;
    for(const channel of paper.data)hash=Math.imul(hash^channel,16777619);
    return {hash,version:map.version,angles:aq.wallAlmanac.angles.value.toArray(),frames:renderedFrames};
  });
  const beforeMidnight='2028-02-28T23:59:58',leapDay='2028-02-29T00:00:00';
  const at=async date=>{
    const frames=await page.evaluate(()=>aquarium.renderedFrames);
    await page.clock.setFixedTime(new Date(await page.evaluate(d=>new Date(d).getTime(),date)));
    await page.waitForFunction(n=>aquarium.renderedFrames>n+1,frames);
    return state();
  };
  const prior=await at('2028-02-28T23:58:59'),first=await at(beforeMidnight),tick=await at('2028-02-28T23:59:59');
  if(first.angles.length!==2 || first.angles.some((angle,i)=>angle!==tick.angles[i] || angle===prior.angles[i]))throw Error('Expected two hands moving only on a new minute');
  if(prior.version!==tick.version || first.hash!==tick.hash)throw Error('Calendar changed within the day');
  await page.evaluate(()=>window.wallpaperPropertyListener.setPaused(true));
  try{
    const paused=await state();
    await page.clock.setFixedTime(new Date(await page.evaluate(d=>new Date(d).getTime(),leapDay)));
    await page.waitForTimeout(250);
    if((await state()).frames!==paused.frames)throw Error('Wallpaper drew while paused');
  }finally{await page.evaluate(()=>window.wallpaperPropertyListener.setPaused(false));}
  await page.waitForFunction(()=>aquarium.aq.wallAlmanac.angles.value.lengthSq()===0);
  const leap=await state(),march=await at('2028-03-01T12:00:00'),again=await at(beforeMidnight);
  if(leap.version!==tick.version+1 || leap.hash===tick.hash || march.hash===leap.hash || again.hash!==first.hash)throw Error('Page did not follow the local date');
  return 'Two hands, minute ticks, local midnight, leap day, pause/resume, month change and clock reversal passed';
}
