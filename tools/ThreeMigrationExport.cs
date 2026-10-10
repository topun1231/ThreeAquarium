using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using Aquarium.Game001;
using Aquarium.ShrimpRig001C;

[InitializeOnLoad]
public static class ThreeMigrationExport {
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
 static bool continued, exported;static double start;
 static ThreeMigrationExport(){if(SessionState.GetBool("ThreeMigrationRunning",false)){EditorApplication.update+=Tick;start=EditorApplication.timeSinceStartup;}}
 public static void Begin(){
  Directory.CreateDirectory(Out);Directory.CreateDirectory(Work);
  EditorSceneManager.OpenScene("Assets/ShrimpReal002/Generated/AQ_REAL002.unity");
  var game=UnityEngine.Object.FindObjectOfType<AquariumGame>();
  if(!game)throw new Exception("No game in formal scene");
  // Absolute private copy: neither editor runtime nor exit handlers can write normal saves.
  game.Session.SaveFileName=Work+"seed.json";
  SessionState.SetBool("ThreeMigrationRunning",true);EditorApplication.update-=Tick;EditorApplication.update+=Tick;
  start=EditorApplication.timeSinceStartup;EditorApplication.isPlaying=true;
 }
 static void Tick(){try{
  if(exported){if(!EditorApplication.isPlaying){SessionState.SetBool("ThreeMigrationRunning",false);EditorApplication.Exit(0);}return;}
  if(EditorApplication.timeSinceStartup-start>300)throw new Exception("Migration export timeout");
  if(!EditorApplication.isPlaying||Time.time<1.5f)return;
  var game=UnityEngine.Object.FindObjectOfType<AquariumGame>();if(!game)return;
  if(!continued){if(!game.SavePath.Replace('\\','/').StartsWith(Work))throw new Exception("Unsafe save path "+game.SavePath);game.ContinueTank();continued=true;return;}
  if(!game.World.Ready||Time.time<7)return;
  Export(game);exported=true;EditorApplication.isPlaying=false;
 }catch(Exception e){File.WriteAllText(Work+"EXPORT_ERROR.txt",e.ToString());Debug.LogException(e);SessionState.SetBool("ThreeMigrationRunning",false);EditorApplication.Exit(1);}}
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
  f="texture-"+textures.Count+(ext==".png"||ext==".jpg"||ext==".jpeg"?ext:".png");textures[t]=f;
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
 static void Export(AquariumGame game){
  pack=new Pack();geos=new Dictionary<Mesh,int>();nodes=new Dictionary<Transform,int>();mats=new Dictionary<string,int>();textures=new Dictionary<Texture,string>();
  using(writer=new BinaryWriter(File.Create(Out+"geometry.bin"))){
   foreach(var r in UnityEngine.Object.FindObjectsOfType<Renderer>()){
    if(!r.enabled||!r.gameObject.activeInHierarchy||r is ParticleSystemRenderer||r is LineRenderer)continue;
    var skin=r as SkinnedMeshRenderer;var mf=r.GetComponent<MeshFilter>();Mesh mesh=skin?skin.sharedMesh:mf?mf.sharedMesh:null;if(!mesh||mesh.vertexCount==0)continue;
    var block=new MaterialPropertyBlock();r.GetPropertyBlock(block);
    var d=new Draw{node=NodeId(r.transform),geo=Geometry(mesh),materials=r.sharedMaterials.Select(m=>MaterialId(m,block)).ToArray(),castShadow=r.shadowCastingMode!=UnityEngine.Rendering.ShadowCastingMode.Off,receiveShadow=r.receiveShadows};
    if(skin){d.bones=skin.bones.Select(NodeId).ToArray();foreach(int b in d.bones)if(b>=0)pack.nodes[b].bone=true;}
    pack.draws.Add(d);
   }
  }
  foreach(var c in game.World.Agents){var rig=c.Visual as RigVisualController;if(!rig)continue;pack.animals.Add(new Animal{id=c.Data.CreatureId,state=c.Data.ExecutionState,root=NodeId(rig.transform),animationRoot=NodeId(rig.Playback.transform),bones=rig.ImportedModel.GetComponentsInChildren<Transform>().Where(t=>nodes.ContainsKey(t)).Select(NodeId).ToArray()});}
  var first=game.World.Agents.First().Visual as RigVisualController;
  // Sample the actual approved Animation clips on a temporary clone. Do not bake locomotion or normal save positions.
  var clone=UnityEngine.Object.Instantiate(first.Playback.gameObject);clone.SetActive(false);
  foreach(AnimationState state in first.Playback){var clip=state.clip;if(!clip||state.name.Contains("RIG001B_"))continue;var bones=clone.GetComponentsInChildren<Transform>(true);var tracks=bones.Select(t=>new Track{path=AnimationUtility.CalculateTransformPath(t,clone.transform)}).ToArray();var ps=bones.Select(t=>new List<float>()).ToArray();var qs=bones.Select(t=>new List<float>()).ToArray();var ss=bones.Select(t=>new List<float>()).ToArray();int samples=Math.Max(2,(int)Math.Ceiling(clip.length*30)+1);float[] times=new float[samples];for(int j=0;j<samples;j++){float time=clip.length*j/(samples-1);times[j]=time;clip.SampleAnimation(clone,time);for(int k=0;k<bones.Length;k++){ps[k].AddRange(V(bones[k].localPosition));qs[k].AddRange(Q(bones[k].localRotation));ss[k].AddRange(V(bones[k].localScale));}}for(int k=0;k<tracks.Length;k++){tracks[k].times=times;tracks[k].positions=ps[k].ToArray();tracks[k].rotations=qs[k].ToArray();tracks[k].scales=ss[k].ToArray();}pack.clips.Add(new Clip{name=state.name,duration=clip.length,tracks=tracks});}
  UnityEngine.Object.DestroyImmediate(clone);
  foreach(var l in UnityEngine.Object.FindObjectsOfType<Light>())if(l.enabled)pack.lights.Add(new Lamp{type=l.type.ToString(),position=V(l.transform.position),forward=V(l.transform.forward),color=C(l.color),intensity=l.intensity,range=l.range,angle=l.spotAngle,shadows=l.shadows!=LightShadows.None});
  var cam=game.LegacyFlow.Hero;pack.camera=new CameraData{position=V(cam.transform.position),target=V(cam.transform.position+cam.transform.forward),fov=cam.fieldOfView,near=cam.nearClipPlane,far=cam.farClipPlane};pack.ambientSky=C(RenderSettings.ambientSkyColor);pack.ambientGround=C(RenderSettings.ambientGroundColor);pack.plants=game.Session.Data.Tank.Plants.Count;pack.hardscape=game.Hardscape.Length;pack.tankId=game.Session.Data.Tank.UniqueId;
  File.WriteAllText(Out+"scene.json",JsonUtility.ToJson(pack));File.WriteAllText(Work+"EXPORT_OK.txt",$"nodes={pack.nodes.Count} geometries={pack.geometries.Count} draws={pack.draws.Count} materials={pack.materials.Count} textures={textures.Count} animals={pack.animals.Count} clips={pack.clips.Count}");
  Debug.Log("THREE_MIGRATION_EXPORT_OK");
 }
}
