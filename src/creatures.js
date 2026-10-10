import * as T from 'three';
import {vec,up,head,face,peerDepth,paths,route,nearest} from './habitat.js';
import {stableSeed} from './state.js';
import {scheduleSwim,tickSwim,threaten,startSwim} from './swimming.js';
export const GAME_SAVE_KEY='aquarium.three.creatures.v1';
const clamp=x=>Math.max(0,Math.min(1,x));
const tags=['OpenSubstrate','Rock','Driftwood','Plant'];
const edge=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
export function scores(data,o,p){const n=data.Needs,b=data.Personality;return {
 Graze:n.Hunger*o.food*b.Activity*b.FoodDrive*p.GrazeWeight+(o.knows?o.food*p.FoodCueWeight:0),
 Rest:(p.RestBase+n.Fatigue)*p.RestWeight/b.Activity,
 Explore:(p.ExploreBase+n.Monotony)*b.ExploreBias*b.Activity*p.ExploreWeight,
 Hide:n.Stress*b.HideBias*o.cover*p.HideWeight/b.Boldness,
 Groom:n.GroomNeed*p.GroomWeight*(1-n.Stress*p.GroomStressSuppression)};}
export function validateGame(value,seed){
 if(!value||value.version!==1||value.tankId!==seed.tankId)throw new Error('游戏进度版本或鱼缸不匹配');
 const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
 if(!finite(value.elapsed,0,1e12)||!Array.isArray(value.creatures)||value.creatures.length!==seed.creatures.length||new Set(value.creatures.map(c=>c.CreatureId)).size!==value.creatures.length)throw new Error('虾身份数据无效');
 for(const c of value.creatures){const original=seed.creatures.find(o=>o.CreatureId===c.CreatureId);if(!original||c.SpeciesId!==original.SpeciesId)throw new Error('发现不属于本缸的虾');
  for(const key of ['Hunger','Stress','Fatigue','GroomNeed','Monotony'])if(!finite(c.Needs?.[key],0,1))throw new Error('需求数据无效');
  for(const key of ['Activity','Boldness','FoodDrive','HideBias','ExploreBias'])if(c.Personality?.[key]!==original.Personality[key])throw new Error('个体性格不匹配');
  for(const key of ['x','y','z'])if(!finite(c.Position?.[key],-1,1))throw new Error('位置数据无效');
  if(Math.abs(c.Position.x)>.6||Math.abs(c.Position.z)>.3||c.Position.y<0||c.Position.y>.59)throw new Error('虾位置超出鱼缸');
  const q=c.Rotation;if(!q||!['x','y','z','w'].every(k=>finite(q[k],-1,1))||Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>.01)throw new Error('姿态数据无效');
  if(!['Rest','Graze','Explore','Hide','Groom'].includes(c.CurrentIntent)||!['Rest','Walk','Climb','RoutineSwim','EscapeSwim','Graze','Hide','Groom'].includes(c.ExecutionState))throw new Error('行为数据无效');
  if(!c.Memory||!finite(c.Memory.FavouriteStrength,-1,1)||!finite(c.Memory.RecentThreatTime,-1,1e12)||!['FavouriteZone','LastFoodAnchor','LastHideAnchor','RecentBehaviour','PreferredHabitat'].every(k=>typeof c.Memory[k]==='string'&&c.Memory[k].length<300))throw new Error('记忆数据无效');
 }
 if(value.anchors!==undefined&&(!Array.isArray(value.anchors)||value.anchors.length!==value.creatures.length||!value.anchors.every(i=>Number.isInteger(i)&&i>=0&&i<seed.anchors.length&&seed.anchors[i].edges.length)))throw new Error('支撑位置数据无效');
 if(!Array.isArray(value.food)||value.food.length!==seed.anchors.length||!value.food.every(f=>finite(f,0,1)))throw new Error('食物数据无效');
 if(value.pellet!==null&&(!Number.isInteger(value.pellet?.anchor)||value.pellet.anchor<0||value.pellet.anchor>=seed.anchors.length||!finite(value.pellet.age,0,240)))throw new Error('饲料数据无效');
 return structuredClone(value);
}

export class CreatureWorld{
 constructor(seed,habitat,saved=null){
  this.seed=seed;this.habitat=habitat;this.profile=seed.profile;this.elapsed=0;this.pellet=null;this.agents=[];this.metrics={decisions:0,arrivals:0,blocked:0,peerWaits:0,consumed:0,backwardCorrections:0};
  this.anchors=seed.anchors.map(a=>({...a,position:vec(a.position),normal:vec(a.normal),edges:[...a.edges]}));
  if(saved){saved=validateGame(saved,seed);this.elapsed=saved.elapsed;this.pellet=saved.pellet;this.anchors.forEach((a,i)=>a.food=saved.food[i]);}
  for(const [i,original] of seed.creatures.entries()){
   const data=structuredClone(saved?saved.creatures.find(c=>c.CreatureId===original.CreatureId):original),position=vec(data.Position),rotation=new T.Quaternion(data.Rotation.x,data.Rotation.y,data.Rotation.z,data.Rotation.w).normalize();
   const phase=i<5?i:(stableSeed(data.CreatureId)%4001)/1000;
   const a={data,position,rotation,index:i,phase:i*1.73,schedule:phase,age:0,hold:8+phase*3,decisionAt:this.elapsed+2+phase*.73,route:[],blocked:new Map(),blockedTime:0,peerTime:0,at:nearest(this.anchors,position),target:-1,progress:0,speed:0,residence:0,feedingOwner:null,feedingCentre:position.clone(),discoveryAt:this.elapsed,noticed:false,manual:null,swim:null,nextRecovery:0};
   if(saved?.anchors)a.at=saved.anchors[saved.creatures.findIndex(c=>c.CreatureId===data.CreatureId)];
   if(saved&&!saved.anchors){const axis=up.clone().applyQuaternion(rotation),near=this.anchors.map((p,i)=>({p,i,d:p.position.distanceTo(position)})).filter(o=>o.d<.04&&o.p.edges.length&&o.p.normal.dot(axis)>.6).sort((a,b)=>a.d-b.d);if(near.length)a.at=near[0].i;}
   if(a.at<0)throw new Error('缺少可用栖息面');a.target=a.at;
   // Restore at a nearby supported pose; never change identity, needs, personality or memory.
   let pose=null,chosen=a.at;const savedUp=up.clone().applyQuaternion(rotation),contact=habitat.cast(position.clone().addScaledVector(savedUp,.01),savedUp.clone().negate(),.035),wasSwimming=['RoutineSwim','EscapeSwim'].includes(data.ExecutionState);if(saved&&contact&&!wasSwimming&&habitat.depth(position,rotation)<=.0003&&this.agents.every(o=>peerDepth(position,rotation,o)<=.0008))pose={position:position.clone(),rotation:rotation.clone()};const candidates=this.anchors.map((p,j)=>({p,j,d:p.position.distanceTo(position)})).filter(o=>o.d<.06&&o.p.edges.length).sort((a,b)=>a.d-b.d);
   for(const {p,j} of candidates){if(pose)break;const test=habitat.support(p.position,p.normal,rotation);if(test&&this.agents.every(o=>peerDepth(test.position,test.rotation,o)<=.0008)){pose=test;chosen=j;break;}}
   if(!pose)throw new Error(`虾 ${i+1} 没有合法恢复位置`);a.position.copy(pose.position);a.rotation.copy(pose.rotation);a.at=a.target=chosen;
   if(['Walk','Climb','RoutineSwim','EscapeSwim'].includes(data.ExecutionState)){data.ExecutionState='Rest';data.CurrentIntent='Rest';}
   this.agents.push(a);this.sync(a);
  }
 }
 setState(a,state,hold){if(a.data.ExecutionState!==state)a.data.Memory.RecentBehaviour=a.data.ExecutionState+' -> '+state;a.data.ExecutionState=state;a.age=0;a.hold=hold;}
 sync(a){a.data.Position={x:a.position.x,y:a.position.y,z:a.position.z};a.data.Rotation={x:a.rotation.x,y:a.rotation.y,z:a.rotation.z,w:a.rotation.w};a.data.CurrentZone=this.anchors[a.at].zone;}
 available(a,x,y){return (a.blocked.get(edge(x,y))||0)<=this.elapsed;}
 knows(a){return !!this.pellet&&this.elapsed>=a.discoveryAt&&a.data.ExecutionState!=='Hide';}
 preference(a,p){const m=a.data.Memory;return (tags[p.kind]===m.PreferredHabitat?this.profile.PreferredHabitatBonus:0)+(p.zone===m.FavouriteZone?this.profile.FavouriteZoneBonus*Math.max(0,m.FavouriteStrength):0);}
 crowd(a,p){let pressure=0;for(const other of this.agents){if(other===a)continue;let near=clamp(1-other.position.distanceTo(p.position)/.085);if(other.data.CurrentIntent==='Graze'&&other.route.length)near=Math.max(near,clamp(1-this.anchors[other.target].position.distanceTo(p.position)/.085));pressure+=near;}return pressure;}
 observe(a){const current=this.anchors[a.at],knows=this.knows(a),residence=clamp((a.residence-20)/90)*a.data.Personality.ExploreBias,pressure=Math.max(clamp(this.crowd(a,current)/1.5),current.food<.12?1:0,residence),range=knows?this.profile.FoodSearchRange:this.profile.LocalSearchRange*(1+clamp(pressure)*1.1);
  const graph=paths(this.anchors,a.at,range,(x,y)=>this.available(a,x,y));let food=a.at,cover=a.at,explore=a.at,bestFood=-Infinity,bestCover=-Infinity,bestExplore=-Infinity;
  for(const [i,distance] of graph.costs){const p=this.anchors[i],crowd=this.crowd(a,p),preference=this.preference(a,p),repeat=p.owner===a.feedingOwner?clamp(1-p.position.distanceTo(a.feedingCentre)/.18)*clamp((a.residence-20)/90)*Math.max(.75,Math.min(1.25,a.data.Personality.ExploreBias))*.5:0;
   const f=p.food*1.8+preference*(1-.45*clamp(crowd))-distance*(knows?.5:1.3)-crowd*.48/(.8+a.data.Personality.Boldness*.2)*(knows?.25:1)-(knows?0:repeat)+.025*Math.sin(i*1.37+a.phase);
   const cv=p.cover*2+preference-current.position.distanceTo(p.position)*1.1;
   const ex=current.position.distanceTo(p.position)*2+preference+.10*Math.sin(i*1.37+a.phase+this.elapsed*.03)-this.agents.filter(o=>o!==a&&o.position.distanceTo(p.position)<.04).length*.4;
   if(f>bestFood){bestFood=f;food=i;}if(cv>bestCover){bestCover=cv;cover=i;}if(ex>bestExplore){bestExplore=ex;explore=i;}
  }return {graph,food,cover,explore,knows};
 }
 decide(a){const o=this.observe(a),p=this.profile;a.scores=scores(a.data,{food:this.anchors[o.food].food,cover:this.anchors[o.cover].cover,knows:o.knows},p);let id=Object.keys(a.scores).sort((x,y)=>a.scores[y]-a.scores[x])[0];const maintenance=this.biofilm>=.45&&!o.knows&&id==='Rest'&&Math.floor(this.elapsed/25+a.phase)%2===0;if(maintenance)id='Graze';a.data.CurrentIntent=id;this.metrics.decisions++;
  const target=maintenance?a.at:id==='Graze'?o.food:id==='Hide'?o.cover:id==='Explore'?o.explore:a.at;a.route=maintenance?[]:route(o.graph.previous,a.at,target);a.target=target;a.progress=0;a.blockedTime=0;a.peerTime=0;
  if(a.route.length)this.setState(a,'Walk',0);else this.setState(a,id==='Explore'?'Rest':id,maintenance?6:id==='Graze'?p.GrazeHoldBase+p.GrazeHoldActivity/a.data.Personality.Activity:id==='Hide'?p.HideHoldBase+p.HideHoldBias*a.data.Personality.HideBias:id==='Groom'?p.GroomHold:p.RestHoldBase+p.RestHoldActivity/a.data.Personality.Activity);
  a.decisionAt=this.elapsed+p.DecisionInterval+a.schedule*p.DecisionStagger;
 }
 arrive(a){a.route=[];a.progress=0;a.speed=0;const id=a.data.CurrentIntent,p=this.profile;this.setState(a,id==='Explore'?'Rest':id,id==='Graze'?p.GrazeArrivalHold:id==='Hide'?p.HideArrivalHold:p.RestArrivalHold);this.metrics.arrivals++;}
 reject(a,destination,dt,peer=false){a.speed=0;if(peer){a.peerTime+=dt;this.metrics.peerWaits++;if(a.peerTime<2)return;}else{a.blockedTime+=dt;if(a.blockedTime<.75)return;}
  a.blocked.set(edge(a.at,destination),this.elapsed+(peer?10+5*Math.sin(a.phase):20+a.schedule*2));this.metrics.blocked++;
  const graph=paths(this.anchors,a.at,Infinity,(x,y)=>this.available(a,x,y));a.route=route(graph.previous,a.at,a.target);a.blockedTime=0;a.peerTime=0;
  if(!a.route.length){this.arrive(a);a.hold=3;if(!peer)this.recover(a);}a.progress=0;
 }
 recover(a){if(this.elapsed<a.nextRecovery)return false;a.nextRecovery=this.elapsed+30+a.schedule*3;
  const candidates=this.anchors.map((p,i)=>({p,i,d:p.position.distanceTo(a.position)})).filter(o=>o.d>.055&&o.d<.14&&o.p.edges.length).sort((u,v)=>(u.p.normal.y<.6?.4:0)-head(a.rotation).dot(u.p.position.clone().sub(a.position).normalize())+Math.abs(u.d-.09)*3-((v.p.normal.y<.6?.4:0)-head(a.rotation).dot(v.p.position.clone().sub(a.position).normalize())+Math.abs(v.d-.09)*3)).slice(0,24);
  return startSwim(this,a,candidates);
 }

 move(a,dt){const destination=a.route[0],p=this.anchors[a.at],q=this.anchors[destination],travel=q.position.clone().sub(p.position),distance=travel.length(),normal=p.normal.clone().lerp(q.normal,a.progress).normalize();const desired=face(travel,normal),angle=head(a.rotation).projectOnPlane(normal).angleTo(travel.clone().projectOnPlane(normal));
  if(angle>25*Math.PI/180){const rotation=a.rotation.clone().rotateTowards(desired,80*Math.PI/180*dt),pivot=new T.Vector3(.01,0,0).applyQuaternion(a.rotation).add(a.position),position=pivot.sub(new T.Vector3(.01,0,0).applyQuaternion(rotation));
   if(!this.habitat.traverse(a.position,a.rotation,position,rotation)){this.reject(a,destination,dt);return;}
   if(this.agents.some(o=>o!==a&&peerDepth(position,rotation,o)>.0003)){this.reject(a,destination,dt,true);return;}a.position.copy(position);a.rotation.copy(rotation);a.speed=0;a.blockedTime=0;return;
  }
  const ramp=clamp(a.age/1.5),gait=Math.pow(clamp((Math.sin(this.elapsed*1.2+a.phase)+.65)/1.65),.3),speed=this.profile.WalkSpeed*a.data.Personality.Activity*ramp*ramp*(3-2*ramp)*gait;
  const projected=clamp(a.position.clone().sub(p.position).dot(travel)/(distance*distance));const t=Math.min(1,Math.max(a.progress,projected)+dt*speed/Math.max(.001,distance));
  const point=p.position.clone().lerp(q.position,t),n=p.normal.clone().lerp(q.normal,t).normalize(),rotation=a.rotation.clone().rotateTowards(face(travel,n),80*Math.PI/180*dt),pose=this.habitat.support(point,n,rotation);
  if(!pose){this.reject(a,destination,dt);return;}
  const rot=a.rotation.clone().rotateTowards(pose.rotation,80*Math.PI/180*dt);const delta=pose.position.clone().sub(a.position),tangent=travel.clone().projectOnPlane(n).normalize();const forward=delta.dot(tangent);if(forward<0)delta.addScaledVector(tangent,-forward);
  const contactUp=up.clone().applyQuaternion(a.rotation).add(up.clone().applyQuaternion(rot)).normalize(),forwardHead=head(a.rotation).add(head(rot)).projectOnPlane(contactUp).normalize();const back=delta.clone().projectOnPlane(contactUp).dot(forwardHead);if(back<0){delta.addScaledVector(forwardHead,-back);this.metrics.backwardCorrections++;}
  if(delta.length()>dt*.05)delta.setLength(dt*.05);const next=a.position.clone().add(delta);
  if(!this.habitat.traverse(a.position,a.rotation,next,rot)){this.reject(a,destination,dt);return;}
  if(this.agents.some(o=>o!==a&&peerDepth(next,rot,o)>.0003)){this.reject(a,destination,dt,true);return;}
  a.position.copy(next);a.rotation.copy(rot);a.progress=t;a.speed=speed;a.blockedTime=0;a.peerTime=0;const needs=a.data.Needs;needs.Fatigue=clamp(needs.Fatigue+dt*this.profile.WalkFatigue);needs.Monotony=Math.max(0,needs.Monotony-dt*this.profile.WalkMonotonyRelief);
  if(t>=1&&next.distanceTo(pose.position)<.002){a.at=destination;a.route.shift();a.progress=0;if(!a.route.length)this.arrive(a);}
 }
 dropFood(point=new T.Vector3(.09,.035,-.20)){const at=nearest(this.anchors,point);if(at<0)return false;const position=this.anchors[at].position;this.pellet={anchor:at,age:0};
  for(const p of this.anchors){const d=p.position.distanceTo(position);if(d<.11)p.food=Math.max(p.food,1-.35*d/.11);}
  for(const a of this.agents){a.noticed=false;a.discoveryAt=this.elapsed+this.profile.FoodDiscoveryBase+a.position.distanceTo(position)*this.profile.FoodDiscoveryDistance/a.data.Personality.FoodDrive+(a.data.ExecutionState==='Hide'?this.profile.HiddenFoodDelay:0)+a.schedule*this.profile.FoodDiscoveryStagger;}return true;
 }
 threaten(point,radius=.32,intensity=1){return threaten(this,point,radius,intensity);}
 step(dt){if(!(dt>0&&dt<=.1))throw new Error('Simulation step must be <= 0.1 seconds');this.elapsed+=dt;const p=this.profile;const hours=dt/3600;for(const anchor of this.anchors){const target=[.32,.62,.85,.55][anchor.kind],amount=hours*.035;anchor.food=anchor.food<target?Math.min(target,anchor.food+amount):Math.max(target,anchor.food-amount);}for(const a of this.agents){a.data.Needs.Hunger=clamp(a.data.Needs.Hunger+hours*p.EcologicalHungerPerHour);a.data.Needs.Stress=Math.max(0,a.data.Needs.Stress-hours*p.EcologicalStressRecoveryPerHour);}
  if(this.pellet){this.pellet.age+=dt;const position=this.anchors[this.pellet.anchor].position;if(this.pellet.age>240||this.anchors.filter(a=>a.position.distanceTo(position)<.055).every(a=>a.food<.15))this.pellet=null;}
  for(const a of this.agents){if(a.manual)continue;a.age+=dt;const n=a.data.Needs,b=a.data.Personality;n.Hunger=clamp(n.Hunger+dt*p.HungerRate*b.Activity);if(this.biofilm>0)n.Hunger=Math.max(p.MinimumHunger,n.Hunger-dt*0.006*this.biofilm);n.Stress=Math.max(0,n.Stress-dt*p.StressRecoveryRate);n.GroomNeed=clamp(n.GroomNeed+dt*p.GroomNeedRate);n.Monotony=clamp(n.Monotony+dt*p.MonotonyRate*b.Activity);
   scheduleSwim(this,a,stableSeed(a.data.CreatureId));if(tickSwim(this,a,dt))continue;
   if(this.knows(a)&&!a.noticed&&a.data.ExecutionState!=='Groom'&&(a.route.length?a.progress===0:a.age>8)){a.noticed=true;a.route=[];this.decide(a);}
   if(a.route.length)this.move(a,dt);else{
    const at=this.anchors[a.at],state=a.data.ExecutionState;
    if(state==='Graze'){
     if(a.feedingOwner!==at.owner||a.feedingCentre.distanceTo(at.position)>.14){a.feedingOwner=at.owner;a.feedingCentre.copy(at.position);a.residence=0;}a.residence+=dt;
     const eaten=Math.min(at.food,dt*p.EatRate*b.FoodDrive);at.food-=eaten;this.metrics.consumed+=eaten;n.Hunger=Math.max(p.MinimumHunger,n.Hunger-eaten*p.Satiation);n.Fatigue=Math.max(0,n.Fatigue-dt*p.GrazeFatigueRecovery);a.data.Memory.LastFoodAnchor=at.owner+'@'+at.position.toArray().map(n=>n.toFixed(3)).join(',');if(at.food<.06&&a.age>8)a.hold=Math.min(a.hold,a.age);
    }else{a.residence=Math.max(0,a.residence-dt*.25);if(state==='Groom')n.GroomNeed=Math.max(0,n.GroomNeed-dt*p.GroomRecovery);else n.Fatigue=Math.max(0,n.Fatigue-dt*p.RestFatigueRecovery);if(state==='Hide'){n.Stress=Math.max(0,n.Stress-dt*p.HideStressRecovery);a.data.Memory.LastHideAnchor=at.owner;}}
    if(a.age>=a.hold&&this.elapsed>=a.decisionAt)this.decide(a);
   }
   const m=a.data.Memory;if(this.anchors[a.at].zone===m.FavouriteZone)m.FavouriteStrength=Math.min(1,m.FavouriteStrength+dt*.0009);else{m.FavouriteStrength-=dt*.0006;if(m.FavouriteStrength<-.1){m.FavouriteZone=this.anchors[a.at].zone;m.FavouriteStrength=.05;}}
   this.sync(a);
  }
 }
 snapshot(){return {version:1,tankId:this.seed.tankId,elapsed:this.elapsed,creatures:this.agents.map(a=>structuredClone(a.data)),anchors:this.agents.map(a=>a.at),food:this.anchors.map(a=>a.food),pellet:this.pellet?{...this.pellet}:null};}
}
