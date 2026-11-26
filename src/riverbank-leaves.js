import {BufferGeometry, Float32BufferAttribute, MathUtils} from 'three';

export function javaFernFrond(variant, random) {
  const positions=[], colors=[], indices=[], rows=30, cols=9;
  const phase=random()*Math.PI*2, length=.128+.016*variant, reach=.057+.014*variant;
  for(let i=0;i<=rows;i++){
    const t=i/rows, blade=Math.max(0,(t-.16)/.84), tip=Math.sin(Math.PI*blade);
    const half=.0008*(1-t)+(.012+.0017*variant)*tip**.78;
    for(let j=0;j<cols;j++){
      const u=j/4-1, edge=Math.abs(u), rib=Math.sin(blade*30-edge*5+phase);
      const across=u*half*(1+.072*Math.sin(blade*22+phase+u));
      const twist=.18+.62*t+.19*Math.sin(phase+t*6);
      positions.push(reach*t**1.7+across*Math.sin(twist),
        length*(1.6*t-.6*t*t)+half*(.21*(1-edge)+.16*edge*edge*rib),
        across*Math.cos(twist)+.009*t*t*Math.sin(phase+4*t));
      const green=.54+.27*t+.10*(1-edge)+.065*rib+.07*u;
      const vein=j===4 ? .25 : 0;
      colors.push(green*.90+vein,green+vein,green*.77+vein*.52);
      if(i<rows&&j<cols-1){const a=i*cols+j;indices.push(a,a+1,a+cols,a+1,a+cols+1,a+cols);}
    }
  }
  const mesh=new BufferGeometry();
  mesh.setAttribute('position',new Float32BufferAttribute(positions,3));
  mesh.setAttribute('color',new Float32BufferAttribute(colors,3));
  mesh.setIndex(indices);mesh.computeVertexNormals();
  return mesh;
}

// One leaf per growth node. Each cross-section has a midrib and two folded wings.
export function riverbankLeaf(ribbon, variant, random) {
  const positions = [], colors = [], indices = [];
  const rows = ribbon ? 24 : 30, cols = ribbon ? 5 : 7;
  const height = ribbon ? .24 + .024 * variant : .055 + .013 * variant;
  const reach = ribbon ? .19 + .026 * variant : .096 - .009 * variant;
  const width = ribbon ? .0105 + .001 * variant : .032 + .002 * variant;
  const phase = random() * 2 * Math.PI;
  // A supple ribbon starts upright and gradually lays over in the current.
  const sweep = 1.48 + .10 * variant + .12 * Math.sin(phase);
  const basalLean = [.066,-.098,.026,-.048][variant];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const lamina = MathUtils.clamp((t - .24) / .76, 0, 1);
    const profile = ribbon
      ? (.62 + .38 * Math.sin(Math.PI * t)) * Math.sqrt(1 - .98 * t ** 18)
      : .06 * (1 - lamina) + .94 * Math.sin(Math.PI * lamina) ** .8 + .012;
    const twist = ribbon ? .82 + .55 * Math.sin(t * 5.2 + phase) : .32 * t;
    const angle = sweep * t;
    const basalFan = Math.sin(Math.PI*t) * (1-t)**2;
    const x = ribbon ? reach * (1 - Math.cos(angle)) / (1 - Math.cos(sweep)) + basalLean * basalFan : reach * (.09 * t + .91 * t ** 1.8);
    const y = ribbon
      ? height * Math.sin(angle) / Math.sin(sweep) - (.012 + .005 * variant) * t ** 4
      : height * (1.88 * t - .88 * t ** 2) - .014 * t ** 4;
    const z = ribbon ? .048 * Math.cos(phase) * basalFan + .012 * t * Math.sin(t * 5.6 + phase) : 0;
    for (let col = 0; col < cols; col++) {
      const u = col * 2 / (cols - 1) - 1, edge = Math.abs(u);
      const ripple = ribbon ? 0 : Math.sin(lamina * Math.PI * 7 + .7 * u + phase) * lamina ** .3;
      const across = .5 * width * profile * u * (1 + .09 * ripple);
      const fold = width * profile * (.14 * (1 - edge) + .075 * ripple * edge ** 2);
      const turned = across * Math.sin(twist);
      positions.push(x + turned * (ribbon ? Math.cos(angle) : 1), y + fold - (ribbon ? turned * Math.sin(angle) : 0), z + across * Math.cos(twist));
      const shade = .58 + .26 * Math.sin(t * Math.PI / 2) + .10 * u + .08 * ripple * edge;
      const vein = u === 0 ? .19 : 0;
      colors.push(shade + vein, shade + vein, shade + vein * .45);
      if (row < rows && col < cols - 1) {
        const a = row * cols + col;
        indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
