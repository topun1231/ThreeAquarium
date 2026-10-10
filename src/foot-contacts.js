import * as T from 'three';
const names=['WalkingLeg_L_2','WalkingLeg_R_2','WalkingLeg_L_3','WalkingLeg_R_3'];
export class FootContacts {
 constructor(){this.entries=new WeakMap();this.probes=0;this.maxSlip=0;}
 before(animals){for(const a of animals){const entry=this.entries.get(a);if(entry)for(const leg of entry.legs){leg.upper.quaternion.copy(leg.beforeUpper);leg.lower.quaternion.copy(leg.beforeLower);}}}
 calibrate(a){a.rig.updateWorldMatrix(true,true);let skin;a.rig.traverse(o=>{if(o.isSkinnedMesh&&!skin)skin=o;});if(!skin)return null;skin.skeleton.update();const position=skin.geometry.attributes.position,weights=skin.geometry.attributes.skinWeight,indices=skin.geometry.attributes.skinIndex,bones=skin.skeleton.bones,legs=[];
  for(const name of names){const upper=bones.find(b=>b.name===name+'_01'),lower=bones.find(b=>b.name===name+'_02');if(!upper||!lower)return null;let lowest=Infinity,tip=null;
   for(let i=0;i<position.count;i++){let influence=0;for(let j=0;j<4;j++){const at=indices.array[i*4+j];if(bones[at]?.name.startsWith(name))influence+=weights.array[i*4+j];}if(influence<.35)continue;const world=skin.getVertexPosition(i,new T.Vector3()).applyMatrix4(skin.matrixWorld),local=a.rig.worldToLocal(world.clone());if(local.y<lowest){lowest=local.y;tip=world;}}
   if(!tip)return null;legs.push({upper,lower,tip:lower.worldToLocal(tip.clone()),rest:a.rig.worldToLocal(tip.clone()),reach:Math.max(.006,upper.getWorldPosition(new T.Vector3()).distanceTo(tip)*1.3),locked:null,beforeUpper:upper.quaternion.clone(),beforeLower:lower.quaternion.clone()});
  }const entry={legs,clock:0};this.entries.set(a,entry);return entry;
 }
 after(animals,world,camera,selected,dt){for(const a of animals){const agent=world.agents.find(c=>c.data.CreatureId===a.id);if(!agent)continue;const walking=['Walk','Climb'].includes(agent.data.ExecutionState),walk=a.actions.get('Walk');if(walk&&walking)walk.timeScale=T.MathUtils.clamp(walk.getClip().duration*agent.speed/.005,.08,8);
   const near=a.rig.getWorldPosition(new T.Vector3()).distanceTo(camera.position)<.22||selected===a;if(!near||agent.swim||!['Rest','Graze','Groom','Walk'].includes(a.active)){const old=this.entries.get(a);if(old)for(const leg of old.legs){leg.locked=null;leg.beforeUpper.copy(leg.upper.quaternion);leg.beforeLower.copy(leg.lower.quaternion);}continue;}
   const entry=this.entries.get(a)||this.calibrate(a);if(!entry)continue;entry.clock+=agent.speed/.005*dt;const normal=new T.Vector3(0,1,0).applyQuaternion(agent.rotation),idle=!walking||agent.speed<.0005;
   for(let i=0;i<entry.legs.length;i++){const leg=entry.legs[i];leg.beforeUpper.copy(leg.upper.quaternion);leg.beforeLower.copy(leg.lower.quaternion);const phase=(entry.clock+([0,3].includes(i)?0:.5))%1,stance=idle||phase<.53;let target;
    if(stance&&(idle||!leg.locked)){const point=a.rig.localToWorld(leg.rest.clone());point.z*=-1;if(!idle)point.add(new T.Vector3(.0014,0,0).applyQuaternion(agent.rotation));const h=world.habitat.cast(point.clone().addScaledVector(normal,.008),normal.clone().negate(),.019);this.probes++;leg.locked=h?h.point.clone().addScaledVector(h.normal,.00015):null;}
    if(stance&&leg.locked)target=leg.locked.clone();else {leg.locked=null;const swing=T.MathUtils.clamp((phase-.53)/.47,0,1);target=a.rig.localToWorld(leg.rest.clone());target.z*=-1;target.add(new T.Vector3(T.MathUtils.lerp(-.0013,.0014,swing),0,0).applyQuaternion(agent.rotation)).addScaledVector(normal,.0012*Math.sin(Math.PI*swing));}
    target.z*=-1;if(target.distanceTo(leg.upper.getWorldPosition(new T.Vector3()))>leg.reach){leg.locked=null;continue;}
    for(let pass=0;pass<2;pass++)for(const joint of [leg.lower,leg.upper]){a.rig.updateWorldMatrix(true,true);const inverse=joint.parent.matrixWorld.clone().invert(),tip=leg.lower.localToWorld(leg.tip.clone()).applyMatrix4(inverse).sub(joint.position),to=target.clone().applyMatrix4(inverse).sub(joint.position);if(tip.lengthSq()<1e-10||to.lengthSq()<1e-10)continue;const delta=new T.Quaternion().setFromUnitVectors(tip.normalize(),to.normalize()),limited=new T.Quaternion().rotateTowards(delta,T.MathUtils.degToRad(18)).slerp(new T.Quaternion(),.25);joint.quaternion.premultiply(limited);}
    a.rig.updateWorldMatrix(true,true);if(leg.locked)this.maxSlip=Math.max(this.maxSlip,leg.lower.localToWorld(leg.tip.clone()).distanceTo(target));
   }
  }}
}
