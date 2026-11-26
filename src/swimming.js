import * as T from 'three';
import {up,face,peerDepth,nearest} from './habitat.js';
const clamp=T.MathUtils.clamp;
const hash=(seed,value)=>{let h=(seed^Math.imul(value,747796405))>>>0;h^=h>>>16;h=Math.imul(h,2246822519)>>>0;h^=h>>>13;return (h&65535)/65535;};
const bezier=(s,t)=>s.start.clone().multiplyScalar((1-t)**2).addScaledVector(s.control,2*(1-t)*t).addScaledVector(s.landing.position,t*t);
function* reachableLandings(anchors,start,candidates){
 const visited=new Uint8Array(anchors.length),queue=[start];visited[start]=1;
 let cursor=0;
 for(const candidate of candidates){
  while(!visited[candidate.i] && cursor<queue.length){
   for(const next of anchors[queue[cursor++]].edges){
    if(visited[next])continue;
    visited[next]=1;queue.push(next);
   }
  }
  if(visited[candidate.i])yield candidate;
 }
}
export function startSwim(world,a,candidates,escape=false){
 const landings=escape?candidates:reachableLandings(world.anchors,a.at,candidates);
 for(const {p,i}of landings){const delta=p.position.clone().sub(a.position),pose=face(escape?delta.clone().negate():delta,p.normal),landing=world.habitat.support(p.position,p.normal,pose,a.scale);if(!landing||world.agents.some(o=>o!==a&&peerDepth(landing.position,landing.rotation,o,a.scale)>.0003))continue;
  const duration=escape?world.profile.EscapeDuration+world.profile.EscapeDurationStagger*a.schedule:clamp(delta.length()/.053,1.15,3.2),direction=face(escape?delta.clone().negate():delta,up);
  if(!world.habitat.traverse(a.position,a.rotation,a.position,direction,a.scale))continue;
  for(const lift of escape?[world.profile.EscapeLift]:[.028,.034,.042,.052,.064]){const control=a.position.clone().lerp(landing.position,.5).addScaledVector(up,lift);if(control.y>(escape?world.profile.EscapeCeiling:.55))continue;const s={kind:escape?'EscapeSwim':'RoutineSwim',start:a.position.clone(),rotation:a.rotation.clone(),direction,control,landing,target:i,origin:a.at,t:0,duration,wait:0,returning:false,turning:!escape,clock:0},steps=escape?16:32;let prev=s.start,q=direction,clear=true;
   for(let k=1;k<=steps;k++){const t=k/steps,next=bezier(s,t),rot=direction.clone().slerp(landing.rotation,clamp((t-.8)/.2,0,1));if(!world.habitat.traverse(prev,q,next,rot,a.scale)||world.agents.some(o=>o!==a&&peerDepth(next,rot,o,a.scale)>.0003)){clear=false;break;}prev=next;q=rot;}
   if(clear){a.swim=s;a.route=[];world.setState(a,s.kind,0);world.metrics[escape?'escapes':'routineSwims']=(world.metrics[escape?'escapes':'routineSwims']||0)+1;return true;}
  }
 }return false;
}
export function tryPairingSwim(world,male,female){
 const needs=male.data.Needs,threatAt=male.data.Memory.RecentThreatTime;
 if(male.manual || male.swim || male.data.CurrentIntent==='Hide' || male.data.ExecutionState==='Hide' ||
   needs.Stress>.42 || needs.Fatigue>.8 || needs.Hunger>.85 || world.knows(male) ||
   (threatAt>=0 && world.elapsed-threatAt<8))return false;
 // Approach her patch of the tank, leaving room for her to keep grazing or move away.
 const separation=male.position.distanceTo(female.position),candidates=[];
 const preferredGap=Math.max(.055,separation-.085);
 for(const [i,p] of world.anchors.entries()){
  if(!p.edges.length)continue;
  const travel=p.position.distanceTo(male.position);
  if(travel<.055 || travel>.14)continue;
  const gap=p.position.distanceTo(female.position);
  if(gap<.032 || (separation>.12 && gap>=separation))continue;
  const score=Math.abs(gap-preferredGap)+.45*Math.abs(travel-.09);
  candidates.push({i,p,score});
 }
 candidates.sort((a,b)=>a.score-b.score);
 if(!startSwim(world,male,candidates.slice(0,5)))return false;
 male.swim.pairing=true;
 return true;
}
export function scheduleSwim(world,a,seed){
 a.nextSwim??=world.elapsed+18+seed%27;a.swimAttempts??=0;if(world.elapsed<a.nextSwim)return;
 const n=++a.swimAttempts,activity=a.data.Personality.Activity*a.data.Personality.ExploreBias;a.nextSwim=world.elapsed+(45+35*hash(seed,n))/Math.max(.6,activity);
 const transit=a.data.ExecutionState==='Graze'&&!world.knows(a)&&a.residence>25&&(world.crowd(a,world.anchors[a.at])>.8||world.anchors[a.at].food<.06);
 if(a.route.length||a.swim||a.data.Needs.Stress>.42||(a.data.ExecutionState!=='Rest'&&!transit))return;
 const intention=(a.data.CurrentIntent==='Explore'||transit?1:.48)*(a.data.Memory.RecentBehaviour.includes('RoutineSwim')?.45:1),value=Math.min(.65,(transit?.56:.38)*activity*intention*(.55+a.data.Needs.Monotony*.55));if(hash(seed,n+97)>value)return;
 const candidates=[],reach=world.roamingDistance(a,.5,1);
 for(const [i,p] of world.anchors.entries()){
  const d=p.position.distanceTo(a.position);
  if(d<=.055*reach || d>=.14*reach || !p.edges.length)continue;
  const score=(transit?world.crowd(a,p)*.1:0)+Math.abs(d-.09*reach)+hash(seed,i)*.025*reach;
  candidates.push({p,i,score});
 }
 candidates.sort((u,v)=>u.score-v.score);
 startSwim(world,a,candidates.slice(0,transit?16:8));
}
function landBelow(world,a,dt){
 const hit=world.habitat.cast(a.position.clone().addScaledVector(up,.015),up.clone().negate(),.6),support=hit&&world.habitat.support(hit.point,hit.normal,a.rotation,a.scale);if(!support)return false;
 const delta=support.position.clone().sub(a.position).clampLength(0,.025*dt),next=a.position.clone().add(delta),q=a.rotation.clone().rotateTowards(support.rotation,115*Math.PI/180*dt);
 if(!world.habitat.traverse(a.position,a.rotation,next,q,a.scale)||world.agents.some(o=>o!==a&&peerDepth(next,q,o,a.scale)>.0003))return false;
 a.position.copy(next);a.rotation.copy(q);a.speed=delta.length()/dt;
 if(next.distanceTo(support.position)<.0001&&q.angleTo(support.rotation)<.01){a.at=nearest(world.anchors,next);a.swim=null;world.arrive(a);}return true;
}
export function tickSwim(world,a,dt){const s=a.swim;if(!s?.kind)return false;s.clock+=dt;
 const direction=s.returning?face(s.start.clone().sub(s.landing.position),up):s.direction;
 if(s.turning){const q=a.rotation.clone().rotateTowards(direction,115*Math.PI/180*dt);if(world.habitat.traverse(a.position,a.rotation,a.position,q,a.scale)&&world.agents.every(o=>o===a||peerDepth(a.position,q,o,a.scale)<=.0003))a.rotation.copy(q);else s.wait+=dt;if(a.rotation.angleTo(direction)<25*Math.PI/180){s.turning=false;s.wait=0;}if(s.wait>.4){if(s.returning)landBelow(world,a,dt);else {a.swim=null;world.arrive(a);}}world.sync(a);return true;}
 const escape=s.kind==='EscapeSwim',pulse=escape?1:1+.075*Math.sin(2*Math.PI*(3/1.6)*s.clock-1.1),advance=dt/s.duration*pulse*(s.t>.8&&!escape?.6:1),t=clamp(s.t+(s.returning?-advance:advance),0,1),u=escape?1-(1-t)**2:t,next=bezier(s,u),target=direction.clone().slerp(s.returning?s.rotation:s.landing.rotation,s.returning?clamp((.2-t)/.2,0,1):clamp((t-.8)/.2,0,1)),q=a.rotation.clone().rotateTowards(target,(escape?180:115)*Math.PI/180*dt);
 if(!world.habitat.traverse(a.position,a.rotation,next,q,a.scale)||world.agents.some(o=>o!==a&&peerDepth(next,q,o,a.scale)>.0003)){s.wait+=dt;if(!escape&&!s.returning&&s.wait>.4){s.returning=true;s.turning=true;s.wait=0;}if(escape||s.returning&&s.wait>1.5)landBelow(world,a,dt);world.sync(a);return true;}
 s.wait=0;s.t=t;a.position.copy(next);a.rotation.copy(q);a.speed=advance*s.start.distanceTo(s.landing.position)/dt;
 if(((!s.returning&&t>=1)||(s.returning&&t<=0))&&q.angleTo(target)<.01){a.at=s.returning?s.origin:s.target;a.swim=null;world.arrive(a);if(escape){a.hold=0;a.data.CurrentIntent='Hide';a.decisionAt=world.elapsed;}}world.sync(a);return true;
}
export function threaten(world,point,radius=.32,intensity=1){let affected=0;for(const a of world.agents){const d=a.position.distanceTo(point);if(d>radius||a.manual)continue;const stress=clamp((1-d/world.profile.ThreatFalloffRadius)*intensity/a.data.Personality.Boldness,0,1);a.data.Needs.Stress=clamp(a.data.Needs.Stress+stress,0,1);a.data.Memory.RecentThreatTime=world.elapsed;affected++;
  if(a.swim?.kind==='EscapeSwim')continue;
  const candidates=world.anchors.map((p,i)=>({p,i,d:p.position.distanceTo(a.position)})).filter(o=>o.d>world.profile.EscapeMinimum&&o.d<world.profile.EscapeMaximum&&o.p.edges.length).sort((a,b)=>(b.p.position.distanceTo(point)+b.p.cover*.05)-(a.p.position.distanceTo(point)+a.p.cover*.05));
  if(stress>world.profile.EscapeThreshold&&startSwim(world,a,candidates,true))continue;
  if(a.swim)continue;
  a.route=[];a.age=10;a.hold=0;world.decide(a);
 }return affected;}

