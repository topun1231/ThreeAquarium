import {savedRoomCreatures} from './crystal-breeding.js';
import {crystalColony} from './crystal-rooms.js';
import {applyCreaturePose,reconcilePopulation} from './population.js';
import {reducedGeometry} from './neighbour-hardscape.js';
import {applyAgentScales,shrimpBodyScale} from './shrimp-scale.js';
import {tankGeometryKey} from './wallpaper-layout.js';
import {shrimpViewGeometry} from './aquarium-geometry.js';

export function createNeighbourShrimp(aq, packed, look, playback, wantsMotion) {
  if(!packed)return null;
  const geometry=new Map();
  const templates=aq.templates.filter(animal=>{
    let supported=true;
    animal.rig.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;
      const source=shrimpViewGeometry(mesh.geometry,false);
      if(!geometry.has(source)){
        try {geometry.set(source,reducedGeometry(source,packed[source.userData.neighbourId]));}
        catch {geometry.set(source,null);}
      }
      supported &&= !!geometry.get(source);
    });
    return supported;
  });
  if(!templates.length)return null;
  return root=>{
    const holder={root,templates,animals:[],meshes:[]};
    let signature, placementKey, request, placed, latest, seatedHabitat;
    let motionInput, motionTank, scenery, motionKey, movementRequest, moving, accumulator=0;
    function discardSeat(){seatedHabitat?.dispose();seatedHabitat=null;}
    function discardMotion(){
      movementRequest?.abort();movementRequest=null;
      moving?.dispose();moving=null;accumulator=0;
    }
    function restore(session,id){
      latest=session;
      const roster=savedRoomCreatures(session,id,!!playback);
      if(!roster.length && !holder.animals.length && placementKey==null)return false;
      const unseated=new Set(session?.BreedingRooms?.unseated);
      const arrivals=playback ? roster.filter(c=>unseated.has(c.CreatureId)).map(c=>c.CreatureId) : [];
      const hatchSites=arrivals.length ? (session.BreedingRooms.pendingHatches??[]).filter(site=>site.tankId===id) : [];
      const room=session?.BreedingRooms?.rooms.find(record=>record.id===id)?.session;
      if(playback && motionTank!==room?.Tank){motionTank=room?.Tank;scenery=motionTank?tankGeometryKey(motionTank):null;}
      const sim=room?.SimulationSeconds??0;
      const colony=roster.length ? crystalColony(session.Breeding,id,room.Colony,session.Breeding.now,sim) : null;
      const residents=colony?.shrimp??{};
      const scale=({CreatureId:id})=>shrimpBodyScale({id,...residents[id]});
      const poses=arrivals.length && roster.map(c=>[c.CreatureId,c.Position,c.Rotation,scale(c),hatchSites.find(site=>site.id===c.CreatureId)]);
      const key=poses ? JSON.stringify([scenery,arrivals,poses]) : null;
      if(key!==placementKey){
        request?.abort();
        discardSeat();
        // If a hatch only adds new records, the previously drawn shrimp can stay while the new ones are seated.
        if(key && placed){
          const oldIds=new Set(placed.map(c=>c.CreatureId));
          const prefix=JSON.stringify([scenery,arrivals.filter(id=>oldIds.has(id)),poses.slice(0,placed.length)]);
          if(prefix!==placementKey)placed=null;
        }else placed=null;
        placementKey=key;
        if(key){
          const controller=request=new AbortController();
          playback.seat(room,roster,arrivals,colony,controller.signal,wantsMotion(),hatchSites).then(({creatures,prepared})=>{
            if(controller.signal.aborted){prepared?.dispose();return;}
            if(wantsMotion())seatedHabitat=prepared;
            else prepared?.dispose();
            placed=creatures;restore(latest,id);
            if(movementRequest)discardSeat();
          }).catch(()=>{});
        }
      }
      const creatures=placed??(arrivals.length ? roster.filter(c=>!unseated.has(c.CreatureId)) : roster);
      let previousPoses, motionChanged=false;
      if(playback){
        const poses=new Map(creatures.map(c=>[c.CreatureId,JSON.stringify([c.Position,c.Rotation])]));
        const key=creatures.length ? JSON.stringify([scenery,[...poses]]) : null;
        if(key!==motionKey){
          if(moving && motionInput?.scenery===scenery){
            previousPoses=new Map(moving.world.agents.filter(a=>poses.get(a.data.CreatureId)===motionInput.poses.get(a.data.CreatureId))
              .map(a=>[a.data.CreatureId,structuredClone(a.data)]));
          }
          motionChanged=true;motionKey=key;discardMotion();
          const records=creatures.map(c=>previousPoses?.get(c.CreatureId)??c);
          motionInput=key?{room,records,poses,scenery,colony}:null;
        }else if(motionInput){
          motionInput.colony=colony;
        }
        if(moving)applyAgentScales(moving.world,colony);
      }
      if(!creatures.length && !holder.animals.length)return false;
      const scales=creatures.map(scale);
      const next=JSON.stringify(creatures.map((c,i)=>[c.CreatureId,c.Position,c.Rotation,scales[i],c.ExecutionState]));
      const changed=motionChanged || next!==signature;
      if(changed){
        const seed={tankId:room?.Tank.UniqueId??id};
        reconcilePopulation(holder,{seed,agents:creatures.map((data,i)=>({data,scale:scales[i]}))}).commit();
        holder.animals.forEach((animal,i)=>{
          if(!moving){
            const {Position:p,Rotation:q,ExecutionState:pose}=previousPoses?.get(animal.id)??creatures[i];
            animal.rig.position.set(p.x,p.y,p.z);
            animal.rig.quaternion.set(q.x,q.y,q.z,q.w);
            animal.play(pose==='Groom' || pose==='Graze' ? pose : 'Rest');
          }
          animal.rig.scale.setScalar(animal.baseScale*scales[i]);
          for(const mesh of animal.ownedMeshes){
            const source=shrimpViewGeometry(mesh.geometry,false);
            if(geometry.has(source))mesh.geometry=geometry.get(source);
          }
        });
        signature=next;
      }
      look.sync(holder.animals,id=>residents[id],sim);
      return changed;
    }
    return {
      restore,
      animate(dt,wholeRoom){
        if(!wholeRoom && seatedHabitat)discardSeat();
        if(!wholeRoom && movementRequest){
          if(moving)motionInput.records=moving.world.agents.map(a=>structuredClone(a.data));
          discardMotion();
          for(const animal of holder.animals)animal.play('Rest');
        }
        if(wholeRoom && motionInput && !movementRequest){
          const controller=movementRequest=new AbortController();
          const {room,records,colony}=motionInput;
          const prepared=seatedHabitat;
          seatedHabitat=null;
          playback.move(room,records,colony,controller.signal,prepared).then(result=>{
            if(controller.signal.aborted){result.dispose();return;}
            moving=result;
            applyAgentScales(result.world,motionInput.colony);
          }).catch(()=>{});
        }
        if(wholeRoom && moving){
          try {
            accumulator=Math.min(accumulator+dt,.1);
            while(accumulator>=.05){moving.world.step(.05);accumulator-=.05;}
            const blend=1-Math.exp(-dt*30);
            for(const animal of holder.animals)applyCreaturePose(animal,moving.world.agentsById.get(animal.id),blend);
          } catch {
            moving.dispose();moving=null;accumulator=0;
            for(const animal of holder.animals)animal.play('Rest');
          }
        }
        for(const animal of holder.animals)animal.mixer.update(dt);
      },
    };
  };
}
