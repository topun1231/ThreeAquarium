import {DoubleSide, Matrix4, Ray, Vector3} from 'three';
import {rotation} from './tank-runtime.js';
import {Substrate} from './substrate.js';
import {floraGap, makeFloraRecord} from './flora.js';

const bankStoneId='sample-creek-charcoal-stone';
const bankRockAngles=[-12,-43,0];

// Tank-space poses. Branches settle into the sloped bed at several contact patches.
const hardscape = [
  ['W01',[-.0091,.1808,.0049],[-34.2962,-149.3282,113.3286],.00084239],
  ['R01',[-.245,.044969,-.116],bankRockAngles,.164],
  ['R02',[-.007,.044920,-.085],[0,-56,0],.115],
  ['R03',[-.426,.057121,.057],[-12,-29,30],.107],
  ['R05',[.184,.027061,-.10],[0,92,0],1.6],
  ['R01',[-.307,.142,.101],bankRockAngles,.081,bankStoneId],
];
// Attachment points come from the actual host meshes, in host-local coordinates.
const epiphytes = [
  ['W01','javafern',0,[-132.0709,-128.6799,53.5188],[.1564,.0577,.986],.74],
  ['W01','javafern',0,[-183.8132,-173.8063,61.6911],[.5868,-.672,.4518],.52],
  ['R01','javafern',0,[-.3208,.4458,.52],[-.5079,.7894,.3447],.57],
  ['R02','pala',0,[.0412,.7348,-.0456],[.2501,.9606,-.1216],.60],
  ['W01','nullified',0,[-45.7762,-65.7742,16.1871],[.5469,-.5267,.6507],.57],
  ['R01','moss',2,[-.0095,.7511,.0579],[.3224,.9366,-.1375],.79],
  ['R05','moss',0,[.0045,.0209,-.0386],[-.0359,.9983,.0465],.65],
];
const xyz = ([x,y,z]) => ({x,y,z});
const matrix = r => new Matrix4().compose(new Vector3().copy(r.Position),rotation(r.Rotation),new Vector3().copy(r.Scale));

// Each saved rock has its own pose; both use the foreground boulder as the template.
export function registerSampleStone(runtime) {
  const source=runtime.source.Tank.Hardscape.find(r=>r.TypeId==='R01');
  const original=runtime.originals.get(source?.UniqueId);
  if(!original || runtime.originals.has(bankStoneId))return;
  runtime.originals.set(bankStoneId,original);
  runtime.originalRecords.set(bankStoneId,{...source,UniqueId:bankStoneId});
}

export function dressSample(session,settings,originalHabitat) {
  const tank=session.Tank, soil=new Substrate(settings);
  for(let i=0;i<soil.h.length;i++){
    const {x,z}=soil.point(i);
    const bank=Math.exp(-(((x+.20+.24*z)/.31)**2+((z-.07)/.19)**2));
    const depth=Math.min(soil.cap[i]-soil.MinHeight,.028+.123*bank);
    const sand=bank < .20+.032*Math.sin(x*37+z*16);
    soil.h[i]=soil.MinHeight+depth;
    soil.put(i,0,(depth-.005)*soil.area[i]);
    // The existing gravel bank tapers into the sand at the inner lip of the flat stone.
    const gravelToe=((x-.077)/.067)**2+((z+.115-.28*(x-.077))/.017)**2 < 1;
    soil.put(i,sand&&!gravelToe?2:4,.005*soil.area[i]);
  }
  tank.Substrate={...tank.Substrate,...soil.snapshot()};
  const originals=tank.Hardscape, colliders=[];
  tank.Hardscape=hardscape.map(([type,position,angles,size,id])=>{
    const original=originals.find(r=>r.TypeId===type);
    const piece={...original,UniqueId:id??original.UniqueId,Position:xyz(position),Rotation:xyz(angles),Scale:{x:size,y:size,z:size}};
    const toOriginal=matrix(original).multiply(matrix(piece).invert());
    for(const s of originalHabitat.surfaces.filter(s=>s.solid&&s.owner.endsWith(original.UniqueId)))colliders.push({bvh:s.bvh,toOriginal});
    return piece;
  });
  const up=new Vector3(0,1,0),ray=new Ray(),root=new Vector3(),tip=new Vector3();
  function blocked(x,y,z,height) {
    return colliders.some(({bvh,toOriginal})=>{
      root.set(x,y+.001,z);tip.copy(root).addScaledVector(up,height).applyMatrix4(toOriginal);
      ray.set(root,up).applyMatrix4(toOriginal);
      const hits=bvh.raycast(ray,DoubleSide);
      return hits.length%2===1 || hits.some(hit=>hit.distance<ray.origin.distanceTo(tip));
    });
  }
  const broadleaf=tank.Plants.filter(p=>p.TypeId.endsWith('midground-broadleaf'));
  tank.Plants=[];
  const midground=[[-.39,.085,.48],[-.35,.14,.56],[-.27,.16,.50],[-.18,.165,.40]];
  for(const [i,[x,z,height]] of midground.entries()){
    const y=soil.sample(x,z);
    if(blocked(x,y,z,.09))continue;
    tank.Plants.push({...broadleaf[i],Position:{x,y,z},Scale:{x:.70,y:height,z:.70}});
  }
  tank.Flora=epiphytes.map(([type,species,variant,local,normal,scale],i)=>{
    const host=tank.Hardscape.find(r=>r.TypeId===type).UniqueId;
    return {...makeFloraRecord({id:tank.UniqueId+'-bank-'+i,species,variant,host,local,normal,yaw:i*1.4}),
      Scale:scale,Nodes:species==='moss'?22:9, ...(['pala','nullified'].includes(species)?{Upright:1}:{})};
  });
  const roots=tank.Plants.map(p=>[p.Position.x,p.Position.z]);
  function plant(species,x,z,scale,nodes){
    const gap=floraGap(species),height=species==='carpet'?.012:species==='browncrypt'?.07:.20;
    if(roots.some(([px,pz])=>Math.hypot(px-x,pz-z)<gap) || blocked(x,soil.sample(x,z),z,height))return;
    const i=tank.Flora.length;
    const record=makeFloraRecord({id:tank.UniqueId+'-bank-'+i,species,variant:0,x,z,yaw:i*2.39996});
    record.Scale=scale;
    record.Nodes=nodes;
    tank.Flora.push(record);roots.push([x,z]);
  }
  for(const [x,z,size] of [[-.525,.165,1.10],[-.451,.250,1.42],[-.404,.143,.91],[-.345,.187,.72],[-.370,.230,1.45]])
    plant('vallisneria',x,z,size,12);
  for(const [x,z,size] of [[-.388,-.093,.63],[-.357,-.145,.55]])
    plant('browncrypt',x,z,size,9);
  for(const [x,z] of [[-.429,-.035],[-.342,-.034],[-.144,-.038],[-.115,-.074]])
    plant('carpet',x,z,.83,70);
  // Mirror the left bank: tall at the back pane, lower beside the wood.
  for(const [x,z,size,leaves] of [[-.249,.237,1.42,9],[-.177,.249,1.40,8],[-.138,.192,.98,8]])
    plant('vallisneria',x,z,size,leaves);
  plant('vallisneria',-.542,.252,1.44,12);
  // Follow the driftwood down to the sand with progressively smaller, sparser clumps.
  plant('vallisneria',-.018,.155,.93,7);
  plant('vallisneria',.087,.136,.70,5);
}
