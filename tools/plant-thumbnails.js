// Run renderPlantThumbnails(aquarium.game) in the existing trial page; no tank/save changes.
import * as T from 'three';
import {PLANT_STOCK} from '../src/material-picker.js';
import {makeFloraRecord} from '../src/flora.js';
import {keepVisibleLeaves} from '../src/flora-view.js';

export async function renderPlantThumbnails({runtime,flora}) {
  await runtime.ensureCatalog();
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(360,240);renderer.setPixelRatio(1);
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  const scene=new T.Scene();scene.background=new T.Color('#303b33');
  scene.add(new T.HemisphereLight('#e5eee3','#b0b5a1',3));
  const light=new T.DirectionalLight('#fff4df',4);light.position.set(1,2,3);scene.add(light);
  const camera=new T.OrthographicCamera(-1.5,1.5,1,-1,.001,100);
  const host=new T.Group();host.name='thumbnail-host';host.updateMatrixWorld(true);
  const soil={sample:()=>0,crest:()=>0,MinHeight:0};
  const habitat={soil,unity:true,entities:new Map([['thumbnail-host',host]]),habitat:{surfaces:[]}};
  const images=[];
  try {
    for(const item of PLANT_STOCK){
      const root=new T.Group(),materials=[],geometries=[];
      if(item.species){
        const record=makeFloraRecord({id:'catalog-'+item.id,species:item.species,variant:item.variant,x:0,z:0,host:'thumbnail-host',local:[0,0,0],normal:[0,1,0]});
        for(const b of flora.instances([record],habitat).values()){
          const geometry=keepVisibleLeaves(flora.units[b.key][b.variant],b.leaves[0]);geometries.push(geometry);
          const material=flora.materials[b.key].clone();materials.push(material);
          const mesh=new T.InstancedMesh(geometry,material,b.matrices.length);
          b.matrices.forEach((matrix,i)=>{mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,b.colors[i]);});root.add(mesh);
        }
      }else{
        const i=Number(item.id),record={UniqueId:'catalog-'+item.id,TypeId:runtime.definitions[i].TypeId,Position:{x:0,y:0,z:0},Rotation:{x:0,y:0,z:0},Scale:structuredClone(runtime.catalogSettings.Plants[i].PlantingScale),Growth:0,Health:1,Stage:0,UseContinuousVisualGrowth:true,Cuts:[]};
        root.add(runtime.plant(record,soil));
      }
      scene.add(root);root.updateMatrixWorld(true);
      const box=new T.Box3().setFromObject(root),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
      if(box.isEmpty())throw Error('Empty plant thumbnail: '+item.id);
      camera.position.copy(center).add(new T.Vector3(.9,.75,1.7).normalize().multiplyScalar(3));camera.lookAt(center);camera.updateMatrixWorld(true);
      const view=box.clone().applyMatrix4(camera.matrixWorldInverse),extent=view.getSize(new T.Vector3());
      const half=Math.max(extent.y,extent.x/1.5)*.62;
      camera.left=-half*1.5;camera.right=half*1.5;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
      renderer.render(scene,camera);
      images.push({id:item.id,path:item.image,image:renderer.domElement.toDataURL('image/jpeg',.9),size:size.toArray()});
      root.removeFromParent();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    }
    return images;
  } finally {renderer.dispose();renderer.forceContextLoss();}
}
