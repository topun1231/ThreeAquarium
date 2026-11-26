import RAPIER from '@dimforge/rapier3d-compat';
import {MeshoptSimplifier} from 'meshoptimizer/simplifier';

let initialized;
export const dropSignature=({bodies,ground,wake=[]})=>JSON.stringify([bodies.map(b=>[b.key,b.wood||false,wake.includes(b.id)]),ground.rows,ground.columns,ground.width,ground.depth,Array.from(ground.heights)]);

function fixedTrimesh(vertices,indices){
  // The simplifier returns indices into the render mesh. Keep only the positions these faces use.
  const remap=new Int32Array(vertices.length/3).fill(-1);
  for(const index of indices)remap[index]=0;
  let count=0;
  for(let i=0;i<remap.length;i++)if(remap[i]===0)remap[i]=count++;
  if(count<remap.length){
    const used=new Float32Array(count*3);
    for(let i=0;i<remap.length;i++)if(remap[i]>=0){
      const j=remap[i]*3;
      used[j]=vertices[i*3];used[j+1]=vertices[i*3+1];used[j+2]=vertices[i*3+2];
    }
    vertices=used;indices=indices.map(i=>remap[i]);
  }
  return RAPIER.ColliderDesc.trimesh(vertices,indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
}

export async function createDropWorld({bodies,ground,wake=[]}, shapes=new Map(), prepared=null) {
  initialized ||= Promise.all([RAPIER.init(),MeshoptSimplifier.ready]);
  await initialized;
  const signature=dropSignature({bodies,ground,wake});
  if(prepared?.signature!==signature)prepared=null;
  const world=prepared?RAPIER.World.restoreSnapshot(prepared.snapshot):new RAPIER.World({x:0,y:-9.81,z:0}),live=new Map();
  try {
    if(prepared){
      bodies.forEach((item,i)=>{
        const body=world.getRigidBody(prepared.handles[i]);
        body.setTranslation({x:item.position[0],y:item.position[1],z:item.position[2]},true);
        body.setRotation(item.rotation,true);
        live.set(item.id,body);
      });
    }else{
    world.timestep=1/120;
    world.numSolverIterations=12;
    world.maxCcdSubsteps=4;
    world.integrationParameters.normalizedAllowedLinearError=.00015;
    world.integrationParameters.normalizedPredictionDistance=.001;
    world.createCollider(RAPIER.ColliderDesc.heightfield(ground.rows-1,ground.columns-1,ground.heights,{x:ground.width,y:1,z:ground.depth}).setFriction(.8));
    const floor=Math.max(0,Math.min(...ground.heights));
    for(const [x,y,z,hx,hy,hz] of [[0,floor/2-.015,0,.6,floor/2+.015,.3],[-.607,.45,0,.01,.45,.32],[.607,.45,0,.01,.45,.32],[0,.45,-.307,.62,.45,.01],[0,.45,.307,.62,.45,.01]])
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setTranslation(x,y,z).setFriction(.65));
    const sources=new Map(bodies.filter(b=>b.meshes).map(b=>[b.key,b.meshes]));
    for(const item of bodies) {
      const dynamic=wake.includes(item.id);
      // shortcut: unaffected placed pieces stay fixed; expand to impact-driven pile motion only if needed.
      const body=world.createRigidBody((dynamic?RAPIER.RigidBodyDesc.dynamic():RAPIER.RigidBodyDesc.fixed()).setTranslation(...item.position).setRotation(item.rotation).setCcdEnabled(true).setLinearDamping(.35).setAngularDamping(.6));
      const meshes=sources.get(item.key);
      if(!meshes?.length)throw Error('木石碰撞模型缺失');
      for(let i=0;i<meshes.length;i++) {
        const mesh=meshes[i],fixed=!dynamic,key=item.key+':'+i+':'+fixed;
        let shape=shapes.get(key);
        if(!shape) {
          let desc;
          if(fixed){
            // Keep boundaries and sub-millimetre detail; the full render mesh still validates the final pose.
            const [indices,error]=MeshoptSimplifier.simplify(mesh.indices,mesh.vertices,3,Math.min(6000,mesh.indices.length),.0004,['ErrorAbsolute','LockBorder']);
            if(!Number.isFinite(error)||error>.0004)throw Error('木石碰撞网格误差超限');
            desc=fixedTrimesh(mesh.vertices,indices);
          }else{
            // Concave wood needs multiple convex pieces, not one hull across its gaps.
            desc=RAPIER.ColliderDesc.convexDecomposition(mesh.vertices,mesh.indices,{resolution:64,maxConvexHulls:64,concavity:.002,convexHullApproximation:false});
          }
          if(!desc)throw Error('木石碰撞模型无法构建');
          shape=desc.shape;shapes.set(key,shape);
        }
        // Separate stone contacts avoid branch-tip snagging; splitting wood makes dense piles slow.
        const separate=!fixed&&!item.wood,parts=separate?shape.shapes:[shape];
        for(let part=0;part<parts.length;part++){
          const desc=new RAPIER.ColliderDesc(parts[part]).setDensity(item.wood?850:2600).setFriction(.7).setRestitution(.03);
          if(separate){const p=shape.positions[part];desc.setTranslation(p.x,p.y,p.z).setRotation(shape.rotations[part]);}
          world.createCollider(desc,body);
        }
      }
      if(dynamic&&!(body.mass()>0))throw Error('木石碰撞模型没有有效体积');
      live.set(item.id,body);
    }
    }
    let elapsed=0,still=0;
    return {
      world,
      snapshot(){return {signature,snapshot:world.takeSnapshot(),handles:[...live.values()].map(b=>b.handle)};},
      release(items){
        const handles=[...live.values()];live.clear();
        items.forEach((item,i)=>{const body=handles[i];body.setTranslation({x:item.position[0],y:item.position[1],z:item.position[2]},true);body.setRotation(item.rotation,true);live.set(item.id,body);});
      },
      step(){
        world.step();elapsed+=world.timestep;
        let quiet=true;
        const poses=[];
        for(const [id,body] of live) {
          const p=body.translation(),q=body.rotation(),v=body.linvel(),w=body.angvel();
          if(![p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite)||p.y<-.1||Math.abs(p.x)>.7||Math.abs(p.z)>.4)throw Error('下落超出鱼缸范围，已还原');
          if(Math.hypot(v.x,v.y,v.z)>.004||Math.hypot(w.x,w.y,w.z)>.04)quiet=false;
          poses.push({id,position:[p.x,p.y,p.z],rotation:{x:q.x,y:q.y,z:q.z,w:q.w}});
        }
        still=quiet?still+world.timestep:0;
        if(elapsed>12&&still<.45)throw Error('木石仍在运动，本次操作已还原');
        return {poses,done:elapsed>.5&&still>=.45,elapsed};
      },
      dispose(){world.free();},
    };
  } catch(e) {world.free();throw e;}
}
