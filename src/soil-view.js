import * as T from 'three';
export function soilGroundGeometry(s){
 const positions=[],uv=[],indices=[];
 for(let i=0;i<s.h.length;i++){const p=s.point(i);positions.push(p.x,s.h[i],p.z);uv.push((p.x+s.Width/2)/s.Width,(p.z+s.Depth/2)/s.Depth);}
 const kinds=Array.from({length:5},()=>[]);
 for(let z=0;z<s.Rows-1;z++)for(let x=0;x<s.Columns-1;x++){const a=z*s.Columns+x,c=a+s.Columns;kinds[Math.max(0,s.kind(a))].push(a,c,a+1,a+1,c,c+1);}
 const rim=[];for(let x=0;x<s.Columns;x++)rim.push(x);for(let z=1;z<s.Rows;z++)rim.push(z*s.Columns+s.Columns-1);for(let x=s.Columns-2;x>=0;x--)rim.push((s.Rows-1)*s.Columns+x);for(let z=s.Rows-2;z>0;z--)rim.push(z*s.Columns);
 for(let j=0;j<rim.length;j++){const a=rim[j],b=rim[(j+1)%rim.length],pa=s.point(a),pb=s.point(b),i=positions.length/3;positions.push(pa.x,s.h[a],pa.z,pb.x,s.h[b],pb.z,pa.x,s.MinHeight,pa.z,pb.x,s.MinHeight,pb.z);uv.push(0,1,1,1,0,0,1,0);kinds[Math.max(0,s.kind(a))].push(i,i+1,i+2,i+1,i+3,i+2);}
 const geo=new T.BufferGeometry();
 for(let k=0;k<5;k++){geo.addGroup(indices.length,kinds[k].length,k);for(const i of kinds[k])indices.push(i);}
 geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();
 return geo;
}
export class SoilView {
 constructor(aq,soil,reuse=null,baseline=soil){
  this.soil=soil;this.root=new T.Group();this.root.name='Editable substrate';this.tiles=[];
  if(reuse){for(const tile of reuse.tiles){const mesh=tile.mesh.clone();this.root.add(mesh);this.tiles.push({...tile,mesh});}this.ground=reuse.ground.clone();this.root.add(this.ground);return;}
  const original=aq.meshes.filter(m=>m.name.startsWith('Batched substrate surface'));
  for(const mesh of original){const geometry=mesh.geometry.clone(),copy=new T.Mesh(geometry,mesh.material);copy.castShadow=mesh.castShadow;copy.receiveShadow=true;this.root.add(copy);
   // Original approved grains contain 13 vertices: two six-sided rings and one crest.
   // Refresh edits the clone; the imported mesh already owns an immutable rest pose.
   const {position:p,normal,uv}=mesh.geometry.attributes,grains=[];
   if(p.count%13!==0)throw new Error('原底床颗粒结构不匹配');
   for(let i=0;i<p.count;i+=13){let x=0,z=0;for(let j=0;j<6;j++){x+=p.getX(i+j)/6;z+=p.getZ(i+j)/6;}grains.push({x,z,y:baseline.sample(x,z),kind:baseline.kind(baseline.cell(x,z))});}
   this.tiles.push({mesh:copy,rest:p.array,normals:normal.array,grains,index:mesh.geometry.index.array,uv:uv.array});
  }
  const under=aq.meshes.find(m=>m.name.startsWith('Deposited substrate'));this.ground=new T.Mesh(new T.BufferGeometry(),under.material);this.ground.name='Deposited substrate';this.ground.receiveShadow=true;this.root.add(this.ground);this.refresh();
 }
 refresh(){const s=this.soil,normal=new T.Vector3();
  const ground=soilGroundGeometry(s);
  this.ground.geometry.dispose();this.ground.geometry=ground;
  for(const tile of this.tiles){const g=tile.mesh.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,visible=[];tile.grains.forEach((grain,k)=>{const y=s.sample(grain.x,grain.z),kind=s.kind(s.cell(grain.x,grain.z)),sand=kind===2||kind===3,oldSand=grain.kind===2||grain.kind===3,sx=(sand?.35:1)/(oldSand?.35:1),sy=(sand?.25:1)/(oldSand?.25:1),amplitude=T.MathUtils.clamp((y-s.MinHeight)/.0015,0,1);for(let j=0;j<13;j++){const i=k*13+j;p.setXYZ(i,grain.x+(tile.rest[i*3]-grain.x)*sx,y+(tile.rest[i*3+1]-grain.y)*sy*amplitude,grain.z+(tile.rest[i*3+2]-grain.z)*sx);normal.set(tile.normals[i*3]/sx,tile.normals[i*3+1]/Math.max(.001,sy*amplitude),tile.normals[i*3+2]/sx).normalize();n.setXYZ(i,normal.x,normal.y,normal.z);uv.setX(i,tile.uv[i*2]+(Math.max(0,kind)-Math.max(0,grain.kind))*4/32);}if(y>s.MinHeight+.0002&&kind>=0){const start=k*54;for(let j=start;j<start+54;j++)visible.push(tile.index[j]);}});
   g.setIndex(visible);p.needsUpdate=true;uv.needsUpdate=true;n.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();
  }
 }
 dispose(keep=null){const retained=new Set();keep?.root.traverse(o=>{if(o.isMesh)retained.add(o.geometry);});this.root.traverse(o=>{if(o.isMesh&&!retained.has(o.geometry))o.geometry.dispose();});}
}
