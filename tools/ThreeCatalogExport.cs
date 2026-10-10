using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEditor;
using UnityEditor.SceneManagement;
using Aquarium.Game001;
using Aquarium.ShrimpRig001C;

public static class ThreeCatalogExport {
 const string Out="D:/Fish tank/ThreeAquarium/public/assets/";
 const string Work="D:/Fish tank/ThreeAquarium/tools/";
 [Serializable] public class Slice {public int offset,count,size; public string type;}
 [Serializable] public class Group {public int start,count,material;}
 [Serializable] public class Geo {public string name; public Slice position,normal,uv,uv1,color,tangent,index,skinIndex,skinWeight;public Group[] groups;public float[] bindposes;}
 [Serializable] public class Mat {public string name,shader;public float[] color,tiling;public string map,normal,roughnessMap,metalMap,aoMap;public float roughness,metalness,opacity,cutoff,leaf,plantSurface,plantVariation,phase,motion,lowGrass;public bool doubleSided,transparent;}
 [Serializable] public class Node {public string name;public int parent;public float[] p,q,s;public bool bone;}
 [Serializable] public class Draw {public int node,geo;public int[] materials,bones;public bool castShadow,receiveShadow;}
 [Serializable] public class Track {public string path;public float[] times,positions,rotations,scales;}
 [Serializable] public class Clip {public string name;public float duration;public Track[] tracks;}
 [Serializable] public class Animal {public string id,state;public int root,animationRoot;public int[] bones;}
 [Serializable] public class Lamp {public string type;public float[] position,forward,color;public float intensity,range,angle;public bool shadows;}
 [Serializable] public class CameraData {public float[] position,target;public float fov,near,far;}
 [Serializable] public class Pack {public string version="unity-source-1";public List<Node> nodes=new List<Node>();public List<Geo> geometries=new List<Geo>();public List<Mat> materials=new List<Mat>();public List<Draw> draws=new List<Draw>();public List<Animal> animals=new List<Animal>();public List<Clip> clips=new List<Clip>();public List<Lamp> lights=new List<Lamp>();public CameraData camera;public float[] ambientSky,ambientGround;public int plants,hardscape;public string tankId;}
 static Pack pack;static BinaryWriter writer;static Dictionary<Mesh,int> geos;static Dictionary<Transform,int> nodes;static Dictionary<string,int> mats;static Dictionary<Texture,string> textures;
 [Serializable] public class Entry {public string key,name;public int species,variant,stage,root;public float height,fixedScale;public bool wood,legacy,retired;public string baseKey;}
 [Serializable] public class CatalogData {public Pack assets;public Entry[] entries;public string[] definitions;public string simulationConfig,catalog,ground;public string[] paths;}
 static List<Entry> entries=new List<Entry>();static List<string> sourcePaths=new List<string>();
 static Material Tune(Material source,Aquarium.ShrimpReal002.Real002GamePresentation presentation){int i=Array.IndexOf(presentation.Original,source);return i>=0?presentation.Tuned[i]:source;}
 static void AddPrefab(GameObject prefab,Entry entry,Aquarium.ShrimpReal002.Real002GamePresentation presentation){
  var clone=UnityEngine.Object.Instantiate(prefab);clone.name=entry.key;clone.SetActive(false);clone.transform.SetParent(null);entry.root=NodeId(clone.transform);sourcePaths.Add(AssetDatabase.GetAssetPath(prefab));
  foreach(var r in clone.GetComponentsInChildren<MeshRenderer>(true)){var mf=r.GetComponent<MeshFilter>();if(!mf||!mf.sharedMesh)continue;
   var block=new MaterialPropertyBlock();r.GetPropertyBlock(block);pack.draws.Add(new Draw{node=NodeId(r.transform),geo=Geometry(mf.sharedMesh),materials=r.sharedMaterials.Select(m=>MaterialId(Tune(m,presentation),block)).ToArray(),castShadow=r.shadowCastingMode!=ShadowCastingMode.Off,receiveShadow=r.receiveShadows});}
  entries.Add(entry);UnityEngine.Object.DestroyImmediate(clone);
 }
 public static void Run(){
  try{
   EditorSceneManager.OpenScene("Assets/ShrimpReal002/Generated/AQ_REAL002.unity");var game=UnityEngine.Object.FindObjectOfType<AquariumGame>();var presentation=UnityEngine.Object.FindObjectOfType<Aquarium.ShrimpReal002.Real002GamePresentation>();
   pack=new Pack();geos=new Dictionary<Mesh,int>();nodes=new Dictionary<Transform,int>();mats=new Dictionary<string,int>();textures=new Dictionary<Texture,string>();
   using(writer=new BinaryWriter(File.Create(Out+"catalog-geometry.bin"))){
    for(int species=0;species<game.Catalog.Plants.Length;species++){
     var lib=game.GetComponents<StemPlantVariantLibrary>().FirstOrDefault(l=>l.SpeciesIndex==species&&l.Adjusted);
     int count=lib?lib.Individuals.Length:1;
     for(int v=0;v<count;v++)for(int stage=0;stage<4;stage++){var prefab=lib?lib.Individuals[v].Stages[stage]:game.Catalog.Plants[species].Stages[stage];float h=lib?lib.Individuals[v].Heights[stage]:game.Catalog.Plants[species].StageHeightsLocal[stage];AddPrefab(prefab,new Entry{key=$"plant-{species}-{v}-{stage}",name=game.Catalog.Plants[species].Definition.DisplayName,species=species,variant=v,stage=stage,height=h},presentation);}
    }
    foreach(var asset in game.Catalog.HardscapeAssets.Where(a=>!a.Retired)){
     // Size variants share their base prefab geometry, materials and textures.
     AddPrefab(asset.Prefab,new Entry{key=asset.Key,name=asset.DisplayName,species=-1,wood=asset.Wood,legacy=asset.Legacy,retired=asset.Retired,baseKey=asset.BaseKey,fixedScale=asset.FixedScale},presentation);
    }
   }
   var data=new CatalogData{assets=pack,entries=entries.ToArray(),definitions=game.Catalog.Plants.Select(s=>JsonUtility.ToJson(s.Definition)).ToArray(),simulationConfig=JsonUtility.ToJson(game.Session.Config),catalog=JsonUtility.ToJson(game.Catalog),ground=JsonUtility.ToJson(game.Ground),paths=sourcePaths.ToArray()};
   File.WriteAllText(Out+"catalog.json",JsonUtility.ToJson(data));File.WriteAllText(Work+"CATALOG_OK.txt",$"entries={entries.Count} geometry={pack.geometries.Count} textures={textures.Count}");EditorApplication.Exit(0);
  }catch(Exception e){File.WriteAllText(Work+"CATALOG_ERROR.txt",e.ToString());Debug.LogException(e);EditorApplication.Exit(1);}
 }
 [Serializable] public class LeafData {public string name,texture;public float softNormal,transmission;}
 [Serializable] public class Leaves {public List<LeafData> materials=new List<LeafData>();}
 public static void ExportLeaves(){try{var result=new Leaves();foreach(var path in new[]{"Assets/RealFrame001/Materials/R2_BroadLeaf.mat","Assets/RealFrame001/Materials/R2_FineGrass.mat","Assets/RealFrame001/Materials/R2_UnifiedLeaf.mat","Assets/_Aquarium/PlantPipe001R1/Materials/UnifiedStem.mat","Assets/_Aquarium/Art002R2/Materials/R2_FineGrass.mat"}){var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(!m)throw new Exception(path);var t=m.GetTexture("_ThicknessMap");string file=null;if(t){var source=AssetDatabase.GetAssetPath(t);file="leaf-thickness-"+result.materials.Count+Path.GetExtension(source);File.Copy(source,Out+file,true);}result.materials.Add(new LeafData{name=m.name,texture=file,softNormal=F(m,"_BladeSoftNormal",0),transmission=F(m,"_Transmission",.1f)});}File.WriteAllText(Work+"leaf-metadata.json",JsonUtility.ToJson(result));EditorApplication.Exit(0);}catch(Exception e){Debug.LogException(e);EditorApplication.Exit(1);}}
 static float[] V(Vector3 v)=>new[]{v.x,v.y,v.z};static float[] Q(Quaternion v)=>new[]{v.x,v.y,v.z,v.w};static float[] C(Color v)=>new[]{v.r,v.g,v.b,v.a};
 static Slice Floats(IEnumerable<float> values,int size){var a=values.ToArray();var s=new Slice{offset=(int)writer.BaseStream.Position,count=a.Length/size,size=size,type="float"};foreach(float x in a)writer.Write(x);return s;}
 static Slice Ints(IEnumerable<int> values,int size=1){var a=values.ToArray();var s=new Slice{offset=(int)writer.BaseStream.Position,count=a.Length/size,size=size,type="uint"};foreach(int x in a)writer.Write((uint)x);return s;}
 static int NodeId(Transform t){if(!t)return -1;if(nodes.TryGetValue(t,out int n))return n;int parent=NodeId(t.parent);n=pack.nodes.Count;nodes.Add(t,n);pack.nodes.Add(new Node{name=t.name,parent=parent,p=V(t.localPosition),q=Q(t.localRotation),s=V(t.localScale)});return n;}
 static int Geometry(Mesh m){if(geos.TryGetValue(m,out int id))return id;
  var g=new Geo{name=m.name,position=Floats(m.vertices.SelectMany(V),3),normal=Floats(m.normals.SelectMany(V),3),uv=Floats(m.uv.SelectMany(v=>new[]{v.x,v.y}),2),tangent=Floats(m.tangents.SelectMany(v=>new[]{v.x,v.y,v.z,v.w}),4)};
  var uv1=new List<Vector4>();m.GetUVs(1,uv1);g.uv1=Floats(uv1.SelectMany(v=>new[]{v.x,v.y,v.z,v.w}),4);g.color=Floats(m.colors.SelectMany(C),4);
  var indices=new List<int>();var groups=new List<Group>();for(int j=0;j<m.subMeshCount;j++){var tris=m.GetTriangles(j);groups.Add(new Group{start=indices.Count,count=tris.Length,material=j});indices.AddRange(tris);}g.index=Ints(indices);g.groups=groups.ToArray();
  if(m.boneWeights.Length>0){g.skinIndex=Ints(m.boneWeights.SelectMany(b=>new[]{b.boneIndex0,b.boneIndex1,b.boneIndex2,b.boneIndex3}),4);g.skinWeight=Floats(m.boneWeights.SelectMany(b=>new[]{b.weight0,b.weight1,b.weight2,b.weight3}),4);g.bindposes=m.bindposes.SelectMany(b=>Enumerable.Range(0,16).Select(i=>b[i])).ToArray();}
  id=pack.geometries.Count;geos[m]=id;pack.geometries.Add(g);return id;
 }
 static string TextureFile(Texture t){if(!t)return null;if(textures.TryGetValue(t,out string f))return f;
  string source=AssetDatabase.GetAssetPath(t);string ext=Path.GetExtension(source).ToLowerInvariant();
  f="catalog-texture-"+textures.Count+(ext==".png"||ext==".jpg"||ext==".jpeg"?ext:".png");textures[t]=f;
  if(File.Exists(source)&&(ext==".png"||ext==".jpg"||ext==".jpeg"))File.Copy(source,Out+f,true);
  else {var rt=RenderTexture.GetTemporary(t.width,t.height,0,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);var old=RenderTexture.active;Graphics.Blit(t,rt);RenderTexture.active=rt;var tex=new Texture2D(t.width,t.height,TextureFormat.RGBA32,false);tex.ReadPixels(new Rect(0,0,t.width,t.height),0,0);tex.Apply();File.WriteAllBytes(Out+f,tex.EncodeToPNG());RenderTexture.active=old;RenderTexture.ReleaseTemporary(rt);UnityEngine.Object.DestroyImmediate(tex);}
  return f;
 }
 static float F(Material m,string k,float d){return m.HasProperty(k)?m.GetFloat(k):d;}
 static int MaterialId(Material m,MaterialPropertyBlock block){
  if(!m)m=new Material(Shader.Find("Universal Render Pipeline/Lit"));
  bool eye=m.name.ToLowerInvariant().Contains("eye");
  Texture map=m.HasProperty("_BaseMap")?m.GetTexture("_BaseMap"):m.mainTexture;
  if(!eye&&block.HasTexture("_BaseMap"))map=block.GetTexture("_BaseMap");
  Color col=m.HasProperty("_BaseColor")?m.GetColor("_BaseColor"):Color.white;
  if(!eye&&block.HasColor("_BaseColor"))col=block.GetColor("_BaseColor");
  bool leaf=m.shader.name.Contains("LeafSurface")||m.shader.name.Contains("ExistingPlantResponse");float leafValue=F(m,"_Leaf",1);if(leaf){col=m.HasProperty(leafValue>.5f?"_Tint":"_StemColor")?m.GetColor(leafValue>.5f?"_Tint":"_StemColor"):Color.white;if(leafValue<.5f)map=null;}
  var mat=new Mat{name=m.name,shader=m.shader.name,color=C(col),map=TextureFile(map),normal=m.HasProperty("_BumpMap")?TextureFile(m.GetTexture("_BumpMap")):null,roughnessMap=m.HasProperty("_RoughMap")?TextureFile(m.GetTexture("_RoughMap")):null,metalMap=m.HasProperty("_MetallicGlossMap")?TextureFile(m.GetTexture("_MetallicGlossMap")):null,aoMap=m.HasProperty("_OcclusionMap")?TextureFile(m.GetTexture("_OcclusionMap")):null,roughness=1-F(m,"_Smoothness",.3f),metalness=F(m,"_Metallic",0),opacity=col.a,cutoff=(leaf||F(m,"_AlphaClip",0)>.5f)?F(m,"_Cutoff",.45f):0,doubleSided=leaf||F(m,"_Cull",2)==0,transparent=F(m,"_Surface",0)>.5f,leaf=leaf?leafValue:-1,plantSurface=F(m,"_PlantSurface",0),plantVariation=block.HasFloat("_PlantVariation")?block.GetFloat("_PlantVariation"):F(m,"_PlantVariation",.5f),phase=block.HasFloat("_Phase")?block.GetFloat("_Phase"):F(m,"_Phase",0),motion=F(m,"_Motion",0),lowGrass=F(m,"_LowGrass",0)};
  var st=m.mainTextureScale;var off=m.mainTextureOffset;mat.tiling=new[]{st.x,st.y,off.x,off.y};
  string key=JsonUtility.ToJson(mat);if(mats.TryGetValue(key,out int id))return id;id=pack.materials.Count;mats[key]=id;pack.materials.Add(mat);return id;
 }
}

