import * as T from 'three';
// Always clip the uncut stage mesh. Regrowth therefore cannot compound earlier cuts.
export function pruneGeometry(source,matrix,record,definition,fullHeight){
 if(!record.Cuts?.length)return source;
 const pos=source.attributes.position,idx=source.index.array,n=pos.count,parent=Array.from({length:n},(_,i)=>i),weld=new Map(),world=Array.from({length:n},(_,i)=>new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(matrix));
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>{parent[root(a)]=root(b);};
 for(let i=0;i<n;i++){const p=world[i],key=[p.x,p.y,p.z].map(v=>Math.round(v*1e6)).join(':');if(weld.has(key))join(i,weld.get(key));else weld.set(key,i);}
 for(let i=0;i<idx.length;i+=3){join(idx[i],idx[i+1]);join(idx[i],idx[i+2]);}
 const anchors=new Map();for(let i=0;i<n;i++){const r=root(i);if(!anchors.has(r)||world[i].y<anchors.get(r).y)anchors.set(r,world[i]);}
 const cuts=record.Cuts.map(c=>{const age=Math.max(0,(record.EcologicalAgeSeconds-c.EcologicalAgeAtCut)/86400),recovery=Math.min(1,age/Math.max(.1,definition.TrimRecoveryDays)),initial=c.HeightMeters>0?c.HeightMeters:fullHeight*c.HeightFraction;return {center:new T.Vector3(c.LocalCenter.x,c.LocalCenter.y,c.LocalCenter.z).applyMatrix4(matrix),radius:Math.max(.004,c.RadiusMeters),initial,recovered:T.MathUtils.lerp(initial,fullHeight*Math.max(c.HeightFraction,.90+.08*c.HeightFraction),recovery)};});
 // Bent stems use their crossing of the snip plane, not a displaced tip, as the footprint anchor.
 const crossings=cuts.map(c=>{const map=new Map(),y=record.Position.y+c.initial;for(let i=0;i<idx.length;i+=3)for(let j=0;j<3;j++){const a=idx[i+j],b=idx[i+(j+1)%3],pa=world[a],pb=world[b];if((pa.y-y)*(pb.y-y)>=0)continue;const p=pa.clone().lerp(pb,(y-pa.y)/(pb.y-pa.y)),d=Math.hypot(p.x-c.center.x,p.z-c.center.z),r=root(a);if(!map.has(r)||d<map.get(r).d)map.set(r,{p,d});}return map;});
 const limits=world.map((p,i)=>Math.min(...cuts.map((c,j)=>{const anchor=crossings[j].get(root(i))?.p||anchors.get(root(i)),distance=Math.hypot(anchor.x-c.center.x,anchor.z-c.center.z),u=T.MathUtils.clamp((distance-c.radius*.72)/(c.radius*.28),0,1),edge=u*u*(3-2*u);return record.Position.y+T.MathUtils.lerp(c.recovered,fullHeight,edge);})));
 const names=Object.keys(source.attributes),out=Object.fromEntries(names.map(k=>[k,[]])),result=new T.BufferGeometry();let cursor=0;
 const vertex=i=>({distance:world[i].y-limits[i],attributes:Object.fromEntries(names.map(k=>{const a=source.attributes[k];return [k,Array.from({length:a.itemSize},(_,j)=>a.array[i*a.itemSize+j])];}))});
 const blend=(a,b,t)=>({distance:0,attributes:Object.fromEntries(names.map(k=>[k,a.attributes[k].map((v,j)=>T.MathUtils.lerp(v,b.attributes[k][j],t))]))});
 for(const group of source.groups.length?source.groups:[{start:0,count:idx.length,materialIndex:0}]){const start=cursor;for(let i=group.start;i<group.start+group.count;i+=3){const input=[vertex(idx[i]),vertex(idx[i+1]),vertex(idx[i+2])],polygon=[];for(let j=0;j<3;j++){const a=input[j],b=input[(j+1)%3];if(a.distance<=0)polygon.push(a);if((a.distance<=0)!==(b.distance<=0))polygon.push(blend(a,b,a.distance/(a.distance-b.distance)));}for(let j=1;j<polygon.length-1;j++)for(const v of [polygon[0],polygon[j],polygon[j+1]]){for(const k of names)out[k].push(...v.attributes[k]);cursor++;}}
  result.addGroup(start,cursor-start,group.materialIndex);
 }
 for(const k of names)result.setAttribute(k,new T.Float32BufferAttribute(out[k],source.attributes[k].itemSize));result.setIndex(Array.from({length:cursor},(_,i)=>i));result.normalizeNormals();result.computeBoundingBox();result.computeBoundingSphere();return result;
}
