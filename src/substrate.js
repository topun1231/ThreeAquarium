const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>(t=clamp(t,0,1),t*t*(3-2*t));
export class Substrate {
 constructor(settings,saved=null){
  Object.assign(this,settings);const n=this.Columns*this.Rows;
  if(!Number.isInteger(this.Columns)||this.Columns<3||this.Columns>256||!Number.isInteger(this.Rows)||this.Rows<3||this.Rows>256)throw new Error('底床网格尺寸无效');
  this.dx=this.Width/(this.Columns-1);this.dz=this.Depth/(this.Rows-1);this.h=new Float64Array(n).fill(this.MinHeight);this.area=new Float64Array(n);this.layers=Array.from({length:n},()=>[]);this.incoming=0;
  for(let z=0;z<this.Rows-1;z++)for(let x=0;x<this.Columns-1;x++){const a=z*this.Columns+x,w=this.dx*this.dz/6;this.area[a]+=w;this.area[a+1]+=2*w;this.area[a+this.Columns]+=2*w;this.area[a+this.Columns+1]+=w;}
  if(saved){const f=saved.Heightfield;if(!f||f.Version!==1||f.Columns!==this.Columns||f.Rows!==this.Rows||f.MinHeight!==this.MinHeight||!Number.isFinite(f.MaxHeight)||Math.abs(f.MaxHeight-this.MaxHeight)>1e-6)throw new Error('底床存档尺寸或范围不匹配');
   const binary=atob(f.QuantizedHeights);if(binary.length!==n*2)throw new Error('底床高度数据长度错误');
   for(let i=0;i<n;i++)this.h[i]=f.MinHeight+(binary.charCodeAt(i*2)|(binary.charCodeAt(i*2+1)<<8))/65535*(f.MaxHeight-f.MinHeight);
   this.incoming=saved.IncomingKind;
   if(!Number.isInteger(this.incoming)||this.incoming<0||this.incoming>4)throw new Error('土壤类型无效');
   if(saved.MaterialLayers){const cells=JSON.parse(saved.MaterialLayers).Cells;if(!Array.isArray(cells)||cells.length!==n)throw new Error('土壤混料数据长度错误');
    this.layers=cells.map(c=>{if(!Array.isArray(c.Layers)||c.Layers.length>256)throw new Error('土壤层数据无效');return c.Layers.map(l=>{if(!Number.isInteger(l.Kind)||l.Kind<0||l.Kind>4||!Number.isFinite(l.Volume)||l.Volume<0||l.Volume>1)throw new Error('土壤层数据无效');return {...l};});});
   }else this.layers=this.layers.map((_,i)=>[{Kind:this.incoming,Volume:(this.h[i]-this.MinHeight)*this.area[i]}]);
  }
  this.floor=new Float64Array(n).fill(this.MinHeight);this.cap=new Float64Array(n).fill(this.MaxHeight);
 }
 point(i){return {x:(i%this.Columns)*this.dx-this.Width/2,z:Math.floor(i/this.Columns)*this.dz-this.Depth/2};}
 sample(x,z){const fx=clamp((x+this.Width/2)/this.dx,0,this.Columns-1),fz=clamp((z+this.Depth/2)/this.dz,0,this.Rows-1),ix=Math.min(this.Columns-2,Math.floor(fx)),iz=Math.min(this.Rows-2,Math.floor(fz)),u=fx-ix,v=fz-iz,a=iz*this.Columns+ix,h=this.h,c=this.Columns;return u+v<=1?h[a]*(1-u-v)+h[a+1]*u+h[a+c]*v:h[a+c+1]*(u+v-1)+h[a+1]*(1-v)+h[a+c]*(1-u);}
 cell(x,z){return Math.round(clamp((z+this.Depth/2)/this.dz,0,this.Rows-1))*this.Columns+Math.round(clamp((x+this.Width/2)/this.dx,0,this.Columns-1));}
 kind(i){const layers=this.layers[i];return layers.findLast(l=>l.Volume/this.area[i]>.000025)?.Kind??layers.at(-1)?.Kind??-1;}
 crest(x,z){const k=this.kind(this.cell(x,z));return .0021*(k===2||k===3?.25:1)*clamp((this.sample(x,z)-this.MinHeight)/.0015,0,1);}
 volume(){return this.h.reduce((v,h,i)=>v+(h-this.MinHeight)*this.area[i],0);}
 put(i,kind,v){if(v<=0)return;if(!Number.isInteger(kind)||kind<0||kind>4)throw new Error('土壤类型无效');const a=this.layers[i],last=a.at(-1);if(last?.Kind===kind)last.Volume+=v;else a.push({Kind:kind,Volume:v});}
 take(i,v){const mix=new Float64Array(5),a=this.layers[i];while(v>1e-14&&a.length){const l=a.at(-1),amount=Math.min(v,l.Volume);mix[l.Kind]+=amount;l.Volume-=amount;v-=amount;if(l.Volume<1e-14)a.pop();}return mix;}
 transfer(remove,add){const nr=remove.reduce((s,p)=>s+p[1],0),na=add.reduce((s,p)=>s+p[1],0),v=Math.min(nr,na);if(v<1e-14)return;const mix=new Float64Array(5);
  for(const [i,capacity]of remove){const amount=v*capacity/nr;this.h[i]-=amount/this.area[i];this.take(i,amount).forEach((x,k)=>mix[k]+=x);}
  const order=[0,1,2,3,4].sort((a,b)=>mix[a]-mix[b]);for(const [i,capacity]of add){const amount=v*capacity/na;this.h[i]+=amount/this.area[i];for(const k of order)this.put(i,k,mix[k]*amount/v);}
 }
 dose(p,dt,remove=false){const cells=[];let sum=0;for(let i=0;i<this.h.length;i++){const q=this.point(i),r=Math.hypot(q.x-p.x,q.z-p.z)/.12;if(r>=1)continue;const w=(1-r*r)**2*this.area[i];cells.push([i,w]);sum+=w;}if(!sum)return;
  for(const [i,w]of cells){let v=.002*clamp(dt,0,.1)*w/sum;v=Math.min(v,(remove?this.h[i]-this.floor[i]:this.cap[i]-this.h[i])*this.area[i]);if(v<=0)continue;if(remove)this.take(i,v);else this.put(i,this.incoming,v);this.h[i]+=(remove?-1:1)*v/this.area[i];}this.relax(.08,p);
 }
 stroke(from,to,{heavy=false,pull=false}={}){if(pull)[from,to]=[to,from];const distance=Math.hypot(to.x-from.x,to.z-from.z);if(distance<.00005||distance>.35)return;const dir={x:(to.x-from.x)/distance,z:(to.z-from.z)/distance},steps=Math.ceil(distance/.005),width=heavy?.16:.10,depth=heavy?.055:.012,reach=heavy?.12:.068,rise=heavy?.075:.028;
  for(let s=1;s<=steps;s++){const p={x:from.x+dir.x*distance*s/steps,z:from.z+dir.z*distance*s/steps},cut=Math.max(this.MinHeight,this.sample(p.x,p.z)-depth),coverage=clamp(distance/steps/(Math.abs(dir.x)*this.dx+Math.abs(dir.z)*this.dz),0,1),remove=[],add=[];
   for(let i=0;i<this.h.length;i++){const q=this.point(i),x=q.x-p.x,z=q.z-p.z,along=x*dir.x+z*dir.z,across=Math.abs(x*dir.z-z*dir.x),lateral=1-smooth((across-width*.38)/(width*.20));if(!lateral)continue;
    if(along>=-.027&&along<=.006){const v=Math.max(0,this.h[i]-Math.max(cut,this.floor[i]))*this.area[i]*coverage*lateral;if(v)remove.push([i,v]);}
    if(along>.012&&along<reach){const front=1-(along-.012)/(reach-.012),limit=Math.min(this.cap[i],cut+depth+rise*front*lateral),v=Math.max(0,limit-this.h[i])*this.area[i]*front*lateral;if(v)add.push([i,v]);}
   }this.transfer(remove,add);
  }
 }
 level(p,dt){const cells=[];let total=0,weight=0;for(let i=0;i<this.h.length;i++){const q=this.point(i),w=1-smooth((Math.hypot(q.x-p.x,q.z-p.z)-.08)/.05);if(!w)continue;cells.push([i,w]);total+=this.h[i]*this.area[i]*w;weight+=this.area[i]*w;}if(!weight)return;const target=total/weight,strength=1-Math.exp(-dt*20),r=[],a=[];
  for(const [i,w]of cells){const change=(clamp(target,this.floor[i],this.cap[i])-this.h[i])*this.area[i]*w*strength;(change<0?r:a).push([i,Math.abs(change)]);}this.transfer(r,a);
 }
 relax(dt,p=null,finish=false){const rate=1-Math.exp(-dt*(finish?9:12)),slope=finish?0:Math.tan(35*Math.PI/180);
  for(let pass=0;pass<2;pass++)for(let z=0;z<this.Rows;z++)for(let x=0;x<this.Columns;x++){const a=z*this.Columns+x;for(const [b,d]of [[x+1<this.Columns?a+1:-1,this.dx],[z+1<this.Rows?a+this.Columns:-1,this.dz]]){if(b<0)continue;const q=this.point(a),fall=p?Math.max(0,1-Math.hypot(q.x-p.x,q.z-p.z)/.13):1;if(!fall)continue;const hi=this.h[a]>this.h[b]?a:b,lo=hi===a?b:a,diff=this.h[hi]-this.h[lo]-d*slope;if(diff<=.000002)continue;
    const v=Math.min(diff/(1/this.area[hi]+1/this.area[lo])*rate*fall*(finish?.22:1),(this.h[hi]-this.floor[hi])*this.area[hi],(this.cap[lo]-this.h[lo])*this.area[lo]);if(v>0)this.transfer([[hi,v]],[[lo,v]]);
  }}
 }
 snapshot(){let bytes='';for(const h of this.h){const n=Math.round(clamp((h-this.MinHeight)/(this.MaxHeight-this.MinHeight),0,1)*65535);bytes+=String.fromCharCode(n&255,n>>8);}return {IncomingKind:this.incoming,HasHeightfield:true,Heightfield:{Version:1,Columns:this.Columns,Rows:this.Rows,MinHeight:this.MinHeight,MaxHeight:this.MaxHeight,QuantizedHeights:btoa(bytes)},MaterialLayers:JSON.stringify({Cells:this.layers.map(Layers=>({Layers}))})};}
}
export function parseSoilKind(value){
 if(typeof value==='string'&&value.trim()==='')throw new Error('土壤类型无效');
 const kind=typeof value==='number'?value:Number(value);
 if(!Number.isInteger(kind)||kind<0||kind>4)throw new Error('土壤类型无效');
 return kind;
}
export function sanitizeSubstrateKind(substrate){
 if(!substrate||typeof substrate!=='object')return false;
 const ok=Number.isInteger(substrate.IncomingKind)&&substrate.IncomingKind>=0&&substrate.IncomingKind<=4;
 if(!ok)substrate.IncomingKind=0;
 return ok;
}
