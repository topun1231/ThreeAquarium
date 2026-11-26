async page => {
  await page.waitForFunction(() => window.aquarium?.ready);
  return page.evaluate(async () => {
    const {createCrystalPortraits} = await import('/src/crystal-portraits.js');
    const portraits = createCrystalPortraits(aquarium.aq);
    const canvas = document.createElement('canvas');
    canvas.width = 384; canvas.height = 224;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    const cases = [[2, 2], [8, 2], [2, 8], [8, 8]]; // [colour, coverage], at the same age and edge quality

    async function pixels(colour, pattern, strength, coverage) {
      // Reuse one adult rig, rest pose and light for every sample. These records never enter the tank.
      const record = {id:'I1', sex:'female', adultAt:0, colour, pattern, P:[strength, coverage, 7]};
      const url = await portraits.get(record, 1);
      if (!url) throw Error('Missing ' + colour + ' ' + pattern + ' portrait');
      const image = new Image(); image.src = url; await image.decode();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    }

    async function measure(pattern) {
      const samples = [];
      for (const [strength, coverage] of cases) {
        const red = await pixels('red', pattern, strength, coverage);
        const black = await pixels('black', pattern, strength, coverage);
        samples.push({red, black, area:0, light:0});
      }
      let corePixels = 0, bodyPixels = 0;
      // Inside the plated body, red and black renders match where there is solid white pigment.
      // Measure brightness only where all four variants are white, away from moving borders.
      for (let y = 88; y < 137; y++) for (let x = 132; x < 273; x++) {
        const i = (y * canvas.width + x) * 4;
        if (samples[0].red[i + 3] < 250 || samples[0].black[i + 3] < 250) continue;
        bodyPixels++;
        let whiteCount = 0;
        for (const sample of samples) {
          const {red, black} = sample;
          if (red[i + 1] < 103 || Math.abs(red[i] - black[i]) > 1 ||
            Math.abs(red[i + 1] - black[i + 1]) > 1 || Math.abs(red[i + 2] - black[i + 2]) > 1) continue;
          sample.area++; whiteCount++;
        }
        if (whiteCount !== samples.length) continue;
        corePixels++;
        for (const sample of samples) {
          const p = sample.red;
          sample.light += .2126 * p[i] + .7152 * p[i + 1] + .0722 * p[i + 2];
        }
      }
      if (corePixels < 120) throw Error(pattern + ' has too few solid white body pixels to compare');
      const light = samples.map(s => s.light / corePixels), area = samples.map(s => s.area / bodyPixels);
      for (const [narrow, wide] of [[0, 2], [1, 3]]) {
        if (Math.abs(light[narrow] - light[wide]) > 1 || area[wide] - area[narrow] < .05)
          throw Error(pattern + ' coverage must change area while preserving white pigment');
      }
      for (const [soft, vivid] of [[0, 1], [2, 3]]) {
        if (light[vivid] - light[soft] < 5 || Math.abs(area[vivid] - area[soft]) > .02)
          throw Error(pattern + ' colour must change pigment while preserving the marking');
      }
      return {pattern, corePixels, whiteLuma:light.map(v => +v.toFixed(2)), whiteAreaPercent:area.map(v => +(v * 100).toFixed(1))};
    }

    try {
      const result = [];
      for (const pattern of ['band', 'hinomaru', 'mosura']) result.push(await measure(pattern));
      return result;
    } finally { portraits.dispose(); }
  });
}
