import {seatNewIndividuals} from './population.js';
import {CreatureWorld} from './creatures.js';
import {limitNavigationSamples} from './navigation-budget.js';
import {connectWallpaperRoutes} from './wallpaper-routes.js';
import {reconnectGraphInBackground} from './habitat.js';

// Prepare one room at a time without installing its scenery or touching the saved roster.
export function createNeighbourSeating(runtime, playback, profile) {
  let queue=Promise.resolve();
  function prepare(room,signal,use,retain=false,spare=null){
    const work=queue.then(async()=>{
      while(!signal.aborted){
        while(playback.suspended && !signal.aborted)await playback.waitForPoll(0,signal);
        signal.throwIfAborted();
        const attempt=new AbortController();
        const cancel=()=>attempt.abort();
        signal.addEventListener('abort',cancel,{once:true});
        const unsubscribe=playback.onSuspensionChange(paused=>{if(paused)cancel();});
        let candidate=spare;
        spare=null;
        try {
          if(!candidate)candidate=await runtime.prepare(room,null,{backgroundNavigation:true,seatOnly:true,signal:attempt.signal});
          attempt.signal.throwIfAborted();
          const result=await use(candidate,attempt.signal);
          attempt.signal.throwIfAborted();
          if(!retain)return result;
          result.prepared=candidate;
          candidate=null;
          return result;
        } catch(error) {
          signal.throwIfAborted();
          if(!attempt.signal.aborted)throw error;
        } finally {
          candidate?.dispose();unsubscribe();signal.removeEventListener('abort',cancel);
        }
      }
      signal.throwIfAborted();
    }).finally(()=>spare?.dispose());
    queue=work.catch(()=>{});
    return work;
  }
  return {
    seat(room,creatures,arrivals,colony,signal,retain=false,hatchSites=[]){
      return prepare(room,signal,candidate=>{
        const copy=structuredClone(creatures);
        // A parked juvenile can be hidden under a larger shrimp even when the body checks pass.
        seatNewIndividuals(copy,arrivals,candidate,colony,.008,hatchSites);
        return {creatures:copy};
      },retain);
    },
    move(room,creatures,colony,signal,prepared){
      return prepare(room,signal,async(candidate,attempt)=>{
        // Keep every floor point. Use fixed hardscape for distant movement because nearby leaves sway.
        const ground=candidate.anchors.filter(a=>a.kind===0);
        const fixed=candidate.anchors.filter(a=>a.kind===1 || a.kind===2);
        const anchors=limitNavigationSamples(ground.concat(fixed),ground.length,2400);
        try {await connectWallpaperRoutes(candidate.habitat,anchors,attempt,8000);}
        catch {
          attempt.throwIfAborted();
          await reconnectGraphInBackground(candidate.habitat,anchors,attempt);
        }
        const tankId=room.Tank.UniqueId, seed={tankId,profile,creatures,anchors};
        const saved={version:1,tankId,creatures,elapsed:0,pellet:null,food:anchors.map(a=>a.food)};
        candidate.anchors=[];candidate.canSeatAt=null;
        return {world:new CreatureWorld(seed,candidate.habitat,saved,colony)};
      },true,prepared).then(({world,prepared})=>({world,dispose:()=>prepared.dispose()}));
    },
  };
}
