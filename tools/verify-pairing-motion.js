async page => {
  await page.locator('#welcome-dismiss').click();
  await page.locator('#crystal-open').click();
  await page.locator('#crystal-start').click();
  await page.locator('#crystal-panel').waitFor({state:'hidden'});
  return page.evaluate(async () => {
    const {game,world} = aquarium;
    const saved = game.snapshot();
    await game.crystalAction({type:'natural',size:2});
    const scheduled = game.data.Breeding, brood = scheduled.batches.at(-1);

    function observe(ledger) {
      const sim = new world.constructor(world.seed, world.habitat, structuredClone(saved));
      const male = sim.agentsById.get(brood.fatherId), female = sim.agentsById.get(brood.motherId);
      const samples = [], passes = [];
      let flight = null;
      const pose = shrimp => JSON.stringify([shrimp.position.toArray(),shrimp.rotation.toArray(),shrimp.data.ExecutionState]);
      for (let step = 0; step <= 480; step++) {
        sim.observeBreeding(ledger,'main',brood.plannedAt + step * 50);
        if (step) sim.step(.05);
        if (flight && male.swim !== flight) {
          const last = passes.at(-1);
          last.endMs = step * 50;
          last.landed = male.position.distanceTo(flight.landing.position) < .001;
          flight = null;
        }
        if (!flight && male.swim?.pairing) {
          flight = male.swim;
          passes.push({startMs:step * 50,travelCm:Math.round(flight.start.distanceTo(flight.landing.position)*1000)/10});
        }
        if (step % 10 === 0) samples.push([pose(male),pose(female)]);
      }
      return {samples,passes};
    }
    const control = observe(saved.session.Breeding), together = observe(scheduled);
    const different = column => together.samples.filter((row,i) => row[column] !== control.samples[i][column]).length;
    if (control.passes.length || !together.passes.some(pass => pass.landed) || !different(0)) throw Error('No distinct, safely completed swim in the brood observation');
    return {
      animals:saved.creatures.length, parents:[brood.motherId,brood.fatherId], samples:control.samples.length,
      maleDifferent:different(0), femaleDifferent:different(1), controlPasses:control.passes.length, passes:together.passes
    };
  });
}
