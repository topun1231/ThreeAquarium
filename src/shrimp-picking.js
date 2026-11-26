import {Box3,Matrix4,Mesh,SkinnedMesh,Sphere,Triangle,Vector3,Vector4} from 'three';
import {shrimpViewGeometry} from './aquarium-geometry.js';
import {reducedGeometry} from './neighbour-hardscape.js';

const origin2D=new Vector3();
const visible=mesh=>{
  for(let node=mesh;node;node=node.parent)if(!node.visible)return false;
  return true;
};

// Follow the point that was touched even if the shrimp turns or flexes before release.
export function shrimpContactVisible(contact,camera,blocked){
  const {mesh,weights}=contact;
  if(!mesh || mesh.userData.creatureId!==contact.id || !visible(mesh))return false;
  const point=new Vector3(), vertex=new Vector3();
  mesh.getVertexPosition(contact.a,point).multiplyScalar(weights.x);
  point.addScaledVector(mesh.getVertexPosition(contact.b,vertex),weights.y);
  point.addScaledVector(mesh.getVertexPosition(contact.c,vertex),weights.z);
  mesh.localToWorld(point);
  const screen=vertex.copy(point).project(camera);
  if(Math.abs(screen.x)>1 || Math.abs(screen.y)>1 || Math.abs(screen.z)>1)return false;
  const eye=camera.getWorldPosition(vertex), direction=point.sub(eye), distance=direction.length();
  return distance>0 && !blocked?.(eye,direction.divideScalar(distance),distance);
}

// The low-detail index uses the same vertices and bone weights as the displayed shrimp.
function shellIndices(source,packed){
  let geometry;
  try {geometry=reducedGeometry(source,packed?.[source.userData.neighbourId]);} catch { /* Use the original index. */ }
  const index=(geometry??source).index.array, vertexIds=[], remap=new Map();
  const triangles=Uint32Array.from(index,id=>{
    if(!remap.has(id)){remap.set(id,vertexIds.length);vertexIds.push(id);}
    return remap.get(id);
  });
  return {vertexIds,triangles};
}

export function createShrimpPicker(packed){
  const shapes=new WeakMap(), bounds=new Box3(), sphere=new Sphere(), bind=new Matrix4(), transform=new Matrix4();
  const centre=new Vector3(), extent=new Vector3(), projected=[], world=[], depth=[];
  const triangle=new Triangle(), closest=new Vector3(), bary=new Vector3(), point=new Vector3(), surface=new Vector3(), direction=new Vector3();
  const boneFromLocal=[], rest=new Vector3(), weightedPoint=new Vector3(), indices=new Vector4(), weights=new Vector4();

  function nearRay(mesh,source,ray,worldPixelScale,padding){
    if(!source.boundingSphere)source.computeBoundingSphere();
    bounds.makeEmpty();
    bind.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
    // Skinning blends the transformed bind positions, so their enclosing box also contains the posed shell.
    for(let i=0;i<mesh.skeleton.bones.length;i++){
      const bone=boneFromLocal[i]??=new Matrix4();
      bone.multiplyMatrices(mesh.skeleton.bones[i].matrixWorld,mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix);
      transform.multiplyMatrices(bind,bone);
      sphere.copy(source.boundingSphere).applyMatrix4(transform);
      bounds.expandByPoint(extent.copy(sphere.center).addScalar(sphere.radius));
      bounds.expandByPoint(extent.copy(sphere.center).addScalar(-sphere.radius));
    }
    if(bounds.isEmpty())return false;
    const far=ray.origin.distanceTo(bounds.getCenter(centre))+bounds.getSize(extent).length()*.5;
    return ray.intersectsBox(bounds.expandByScalar(far*worldPixelScale*padding));
  }

  // Reuse the bone transforms already calculated for this mesh's current pose.
  function skinPoint(mesh,id,target){
    Mesh.prototype.getVertexPosition.call(mesh,id,rest);
    const {skinIndex,skinWeight}=mesh.geometry.attributes;
    weights.fromBufferAttribute(skinWeight,id);
    indices.fromBufferAttribute(skinIndex,id);
    target.set(0,0,0);
    for(let j=0;j<4;j++){
      const weight=weights.getComponent(j);
      if(weight!==0)target.addScaledVector(weightedPoint.copy(rest).applyMatrix4(boneFromLocal[indices.getComponent(j)]),weight);
    }
    return target.applyMatrix4(bind);
  }

  // pointer is in NDC; all edge distances below are in CSS pixels at the actual canvas size.
  return function pick(meshes,camera,ray,pointer,viewport,padding,blocked,contact){
    if(contact)contact.mesh=null;
    const sx=viewport.width*.5, sy=viewport.height*.5;
    if(!(sx>0 && sy>0))return null;
    const worldPixelScale=1/(sy*camera.projectionMatrix.elements[5]);
    let bestGap=padding*padding, bestDistance=Infinity, best=null;
    for(const mesh of meshes){
      const id=mesh.userData.creatureId;
      if(!id || !mesh.isSkinnedMesh || !visible(mesh))continue;
      const source=shrimpViewGeometry(mesh.geometry,false);
      if(!nearRay(mesh,source,ray,worldPixelScale,padding))continue;
      let shape=shapes.get(source);
      if(!shape){shape=shellIndices(source,packed);shapes.set(source,shape);}
      const {vertexIds,triangles}=shape;
      const standardSkin=mesh.getVertexPosition===SkinnedMesh.prototype.getVertexPosition &&
        mesh.applyBoneTransform===SkinnedMesh.prototype.applyBoneTransform;
      for(let i=0;i<vertexIds.length;i++){
        const p=world[i]??=new Vector3(), screen=projected[i]??=new Vector3();
        if(standardSkin)skinPoint(mesh,vertexIds[i],p);
        else mesh.getVertexPosition(vertexIds[i],p).applyMatrix4(mesh.matrixWorld);
        screen.copy(p).applyMatrix4(camera.matrixWorldInverse);
        depth[i]=-screen.z;
        screen.applyMatrix4(camera.projectionMatrix);
        screen.set((screen.x-pointer.x)*sx,(screen.y-pointer.y)*sy,0);
      }
      let candidateGap=bestGap, candidateDistance=bestDistance, face=-1;
      for(let i=0;i<triangles.length;i+=3){
        const a=triangles[i], b=triangles[i+1], c=triangles[i+2];
        const pa=projected[a], pb=projected[b], pc=projected[c];
        if(Math.min(pa.x,pb.x,pc.x)>padding || Math.max(pa.x,pb.x,pc.x)<-padding ||
           Math.min(pa.y,pb.y,pc.y)>padding || Math.max(pa.y,pb.y,pc.y)<-padding)continue;
        let gap=0;
        if(Math.min(depth[a],depth[b],depth[c])<=camera.near){
          if(!ray.intersectTriangle(world[a],world[b],world[c],false,point))continue;
        }else{
          triangle.a=pa;triangle.b=pb;triangle.c=pc;
          triangle.closestPointToPoint(origin2D,closest);
          gap=closest.lengthSq();
          if(gap<1e-8)gap=0;
          if(gap>candidateGap || !triangle.getBarycoord(closest,bary))continue;
          // Perspective-correct interpolation keeps the obstruction test on the actual skin.
          const wa=bary.x/depth[a], wb=bary.y/depth[b], wc=bary.z/depth[c];
          point.copy(world[a]).multiplyScalar(wa).addScaledVector(world[b],wb).addScaledVector(world[c],wc)
            .multiplyScalar(1/(wa+wb+wc));
        }
        centre.copy(point).applyMatrix4(camera.matrixWorldInverse);
        if(-centre.z<camera.near || -centre.z>camera.far)continue;
        const distance=point.distanceTo(ray.origin);
        if(gap===candidateGap && distance>=candidateDistance)continue;
        surface.copy(point);candidateGap=gap;candidateDistance=distance;face=i;
      }
      if(face<0)continue;
      if(blocked){
        direction.subVectors(surface,ray.origin);
        // A forgiving hit needs a clear path both under the pointer and to the nearby shell.
        if(blocked(ray.origin,ray.direction,direction.dot(ray.direction)))continue;
        if(candidateGap>0 && blocked(ray.origin,direction.normalize(),candidateDistance))continue;
      }
      bestGap=candidateGap;bestDistance=candidateDistance;best=id;
      if(contact){
        const a=triangles[face], b=triangles[face+1], c=triangles[face+2];
        contact.weights??=new Vector3();
        contact.mesh=Triangle.getBarycoord(surface,world[a],world[b],world[c],contact.weights) ? mesh : null;
        contact.id=id;contact.a=vertexIds[a];contact.b=vertexIds[b];contact.c=vertexIds[c];
      }
    }
    return best;
  };
}
