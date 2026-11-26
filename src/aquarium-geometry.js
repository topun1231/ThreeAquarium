// Measurements are in the exported meshes' local metres, before placement and rigging.
import {BufferAttribute, MathUtils} from 'three';

function dressGrass(p) {
  for(let i=0;i<p.count;i+=24){
    const x=p.getX(i+1), y=p.getY(i+1), z=p.getZ(i+1);
    const radius=Math.hypot(x,z), edge=MathUtils.smoothstep(radius,.003,.018);
    const seed=MathUtils.euclideanModulo(Math.sin(x*5719+z*3253)*4358.5,1);
    const height=1.04-.42*edge+(seed-.5)*.38;
    const arc=(.0015+.0055*edge)*(.7+seed);
    for(let j=3;j<24;j++){
      const k=i+j, t=Math.floor(j/3)/7, sweep=arc*t*t/Math.max(radius,.001);
      p.setXYZ(k,p.getX(k)+x*sweep,y+(p.getY(k)-y)*height,p.getZ(k)+z*sweep);
    }
  }
}

function dressRoundLeaves(p) {
  for(let i=0;i<p.count;i+=8){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const bud=MathUtils.smoothstep(y,.29,.49);
    const turn=.32*Math.sin(i/8*2.39996+y*47), c=Math.cos(turn), s=Math.sin(turn);
    const ribs=[2,5,7].map(j=>[p.getX(i+j),p.getZ(i+j)]);
    for(let j=1;j<8;j++){
      const k=i+j, [mx,mz]=ribs[Math.floor((j-1)/3)];
      const widen=.52-.30*bud, wing=j===1||j===3||j===4||j===6;
      const dx=p.getX(k)-x+widen*(p.getX(k)-mx);
      const dz=p.getZ(k)-z+widen*(p.getZ(k)-mz);
      const lift=(p.getY(k)-y)*(.77+.24*bud)+(wing?.0018:0);
      p.setXYZ(k,x+(c*dx-s*dz)*(1.-.18*bud),y+lift,z+(s*dx+c*dz)*(1.-.18*bud));
    }
  }
}

function dressGrains(p,n) {
  for(let i=0;i<p.count;i+=13){
    let x=0,y=0,z=0;
    for(let j=i;j<i+6;j++){x+=p.getX(j);y+=p.getY(j);z+=p.getZ(j);}
    x/=6;y/=6;z/=6;
    const seed=MathUtils.euclideanModulo(Math.sin(x*4177+z*7817)*13457.27,1);
    const width=.46+.55*seed*seed, height=.28+.66*seed*seed;
    const buried=(p.getY(i+12)-y)*(.19-.13*seed);
    for(let j=i;j<i+13;j++){
      p.setXYZ(j,x+(p.getX(j)-x)*width,y+(p.getY(j)-y)*height-buried,z+(p.getZ(j)-z)*width);
      const nx=n.getX(j)/width, ny=n.getY(j)/height, nz=n.getZ(j)/width, length=Math.hypot(nx,ny,nz)||1;
      n.setXYZ(j,nx/length,ny/length,nz/length);
    }
  }
}

export function finishAquariumGeometry(geo){
  const grass=/^Grass_[012](?:_stage_[0-3])?$/.test(geo.name);
  const leaves=/^Curved leaves [012](?: \/ growth prefix)?$/.test(geo.name);
  const grains=geo.name==='Volumetric substrate surface batch';
  if(!grass&&!leaves&&!grains)return;
  const p=geo.attributes.position.clone(), unit=grass?24:leaves?8:13;
  if(p.count%unit || !geo.attributes.normal)return;
  geo.setAttribute('position',p);
  geo.setAttribute('normal',geo.attributes.normal.clone());
  if(grains){dressGrains(p,geo.attributes.normal);return;}
  if(grass)dressGrass(p);else dressRoundLeaves(p);
  geo.computeVertexNormals();
  if(geo.attributes.tangent){geo.deleteAttribute('tangent');geo.computeTangents();}
}

const shellViews=new WeakMap();
export function shrimpViewGeometry(geometry,close){
  const views=shellViews.get(geometry);
  return views?(close?views.near:views.far):geometry;
}

export function finishShrimpShell(geo){
  if(geo.name!=='Neo_REAL002_GameSkin')return;
  const shell=geo.groups.find(g=>g.materialIndex===1);
  if(!shell || geo.groups.length!==3)return;
  const p=geo.attributes.position.clone(), indices=geo.index.array;
  const end=shell.start+shell.count, fan=[], body=[], shaped=new Set();
  for(let i=shell.start;i<end;i+=3){
    const a=indices[i], b=indices[i+1], c=indices[i+2];
    const tail=(p.getX(a)+p.getX(b)+p.getX(c))/3<-.02115;
    (tail?fan:body).push(a,b,c);
    if(!tail){shaped.add(a);shaped.add(b);shaped.add(c);}
  }
  if(!fan.length)return;
  for(const i of shaped){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),mm=-x*1000;
    const skirt=(1.-MathUtils.smoothstep(z,.0026,.0056))*MathUtils.smoothstep(mm,7.7,10.2)*(1.-MathUtils.smoothstep(mm,16.8,20.4));
    p.setXYZ(i,x-.00040*skirt,y,z+.00006*skirt);
  }
  geo.setAttribute('position',p);
  const ordered=indices.slice();
  ordered.set(body,shell.start);ordered.set(fan,shell.start+body.length);
  geo.setIndex(new BufferAttribute(ordered,1));
  // Only close views need a transparent draw. Both layouts share the skin and index buffers.
  const near=new geo.constructor();
  for(const [name,attr] of Object.entries(geo.attributes))near.setAttribute(name,attr);
  near.setIndex(geo.index);near.name=geo.name;
  for(const g of geo.groups)near.addGroup(g.start,g===shell?body.length:g.count,g.materialIndex);
  near.addGroup(shell.start+body.length,fan.length,3);
  const views={far:geo,near};shellViews.set(geo,views);shellViews.set(near,views);
}
