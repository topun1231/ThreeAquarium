import {SPECIES, visibleNodes} from './flora.js';

// Apply only to a draft session. The caller saves every affected plant in one edit.
export function tidyPlants(session, heightOf) {
  const changed=new Set();
  for(const plant of session.Tank.Flora??[]){
    const spec=SPECIES[plant.Species], nodes=visibleNodes(plant);
    if(nodes<Math.ceil(spec.start+(spec.max-spec.start)*.7))continue;
    plant.Nodes=Math.max(spec.start,Math.round(nodes*.77));
    plant.LastTrim={At:session.SimulationSeconds,Nodes:plant.Nodes};
    changed.add(plant.UniqueId);
  }
  for(const plant of session.Tank.Plants){
    if(plant.Stage<3 || plant.Cuts.length)continue;
    const limit=nativeTrimHeight[plant.TypeId], height=heightOf(plant);
    if(!(height>limit))continue;
    const cutHeight=Math.min(1,height*.78);
    plant.Cuts.push({LocalCenter:{x:0,y:0,z:0},HeightFraction:Math.min(.78,1/height),HeightMeters:cutHeight,
      RadiusMeters:.30,EcologicalAgeAtCut:plant.EcologicalAgeSeconds});
    changed.add(plant.UniqueId);
  }
  return changed;
}

const nativeTrimHeight={
  'mvp001a-background-stem-prototype':.32,
  'plantset001-midground-broadleaf':.18,
  'plantset001-foreground-finegrass':.085,
};

export function restoreTrim(session,snapshot,ids){
  for(const field of ['Flora','Plants']){
    const before=new Map((snapshot.Tank[field]??[]).map(p=>[p.UniqueId,p]));
    for(const p of session.Tank[field]??[]){
      if(!ids.has(p.UniqueId)||!before.has(p.UniqueId))continue;
      const prior=before.get(p.UniqueId);
      if(field==='Plants'){p.Cuts=structuredClone(prior.Cuts);continue;}
      p.Nodes=prior.Nodes;
      if(prior.LastTrim)p.LastTrim={...prior.LastTrim};else delete p.LastTrim;
    }
  }
  return session;
}
