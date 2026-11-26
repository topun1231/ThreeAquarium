import test from 'node:test';
import assert from 'node:assert/strict';
import {tidyPlants,restoreTrim} from '../src/plant-care.js';

test('a single tidy trims only mature growth, repeats safely, and can be undone without rewinding the tank',()=>{
  const native={TypeId:'mvp001a-background-stem-prototype',Stage:3,EcologicalAgeSeconds:1200,Cuts:[]};
  const before={SimulationSeconds:150,Tank:{Environment:{Algae:.2},Flora:[
    {UniqueId:'fern',Species:'javafern',Nodes:15,Host:'log'},
    {UniqueId:'young',Species:'javafern',Nodes:8,Host:'log'},
    {UniqueId:'carpet',Species:'carpet',Nodes:132}],
    Plants:[{...native,UniqueId:'tall'},{...native,Cuts:[],UniqueId:'low'},{...native,Cuts:[],UniqueId:'new',Stage:0}]}};
  const session=structuredClone(before),height=p=>p.UniqueId==='low'?.1:.42;
  const ids=tidyPlants(session,height);
  assert.deepEqual([...ids],['fern','carpet','tall']);
  assert.equal(session.Tank.Flora[0].Nodes,12);
  assert.equal(session.Tank.Flora[1].Nodes,8);
  assert.equal(session.Tank.Plants[0].Cuts[0].HeightFraction,.78);
  assert.equal(tidyPlants(session,height).size,0);
  const trimmed=structuredClone(session);
  session.SimulationSeconds+=20;session.Tank.Environment.Algae=.3;
  restoreTrim(session,before,ids);
  assert.deepEqual(session.Tank.Plants,before.Tank.Plants);
  assert.deepEqual(session.Tank.Flora,before.Tank.Flora);
  assert.equal(session.Tank.Environment.Algae,.3);assert.equal(session.SimulationSeconds,170);
  restoreTrim(session,trimmed,ids);
  assert.deepEqual(session.Tank.Flora,trimmed.Tank.Flora);
});
