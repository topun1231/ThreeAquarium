import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial} from 'three';
import {createNeighbourHardscape} from '../src/neighbour-hardscape.js';

test('the low detail mesh keeps the material group and uses the same winding as the active tank',()=>{
 const source=new BoxGeometry();
 const index=new Uint32Array(3603).map((_,i)=>i%source.attributes.position.count);
 source.setIndex(Array.from(index));
 source.clearGroups();source.addGroup(0,index.length,2);
 source.userData={neighbourPack:'scene',neighbourId:5,neighbourFlipped:true};
 const model=new Group();model.add(new Mesh(source,Array(3).fill(new MeshBasicMaterial())));
 const runtime={entries:new Map(),hardscape:()=>model.clone(true)};
 const packed={scene:{5:{vertices:source.attributes.position.count,indices:index.length,
  groups:[Buffer.from(new Uint32Array([0,1,2]).buffer).toString('base64')]}}};
 const neighbour=createNeighbourHardscape(runtime,packed),record={TypeId:'stone'};
 const low=neighbour(record).children[0].geometry;
 assert.deepEqual([...low.index.array],[0,2,1]);
 assert.equal(low.groups[0].materialIndex,2);
 assert.equal(low.getAttribute('position'),source.getAttribute('position'));
 assert.equal(neighbour(record).children[0].geometry,low);
 assert.equal(model.children[0].geometry.index.count,3603);
 assert.equal(createNeighbourHardscape(runtime,null)(record).children.length,0);
});
