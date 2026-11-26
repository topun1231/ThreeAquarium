import test from 'node:test';
import assert from 'node:assert/strict';
import {booksForDescendant, childrenByParent, familyRoutes, validateLineBooks} from '../src/crystal-line-books.js';
import {createBreedingState, createGrowthDueCheck, validateBreedingState, applyBreedingAction, publicBreedingState, shopCatalogue, batchTankId, naturalPair,tankOccupancy,canSelectParent,activeParentBatch} from '../src/crystal-breeding.js';

const GROWTH = 2700000, FORM = 120000, HATCH = 600000;
const shrimp = (id, sex = 'female', tank = 'breeding', extra = {}) => ({id, sex, B:[6, 6, 6], P:[6, 6, 6], tank, adultAt:0, protected:false, source:'founder', parents:null, ...extra});
const initial = (extra = []) => createBreedingState([shrimp('mother'), shrimp('father', 'male'), ...extra], {now:0, seed:7});
const plan = (state, size = 4, now = state.now) => applyBreedingAction(state, {type:'plan', motherId:'mother', fatherId:'father', tankId:'breeding', size}, now);
const tick = (state, now) => applyBreedingAction(state, {type:'advance'}, now);

test('选育手记只记录玩家挑的个体，父母双方均可追到同一个外孙辈',()=>{
  const start=initial([shrimp('second-father','male')]);
  const first=tick(plan(start),GROWTH);
  const daughter=first.individuals.find(r=>r.parents && r.sex==='female');
  const aunt=first.individuals.find(r=>r.parents && r.id!==daughter.id);
  const next=applyBreedingAction(first,{type:'plan',motherId:daughter.id,fatherId:'second-father',size:2,tankId:'breeding'},first.now);
  const grown=tick(next,next.batches[1].adultAt), grand=grown.batches[1].children[0].id;
  const act=(s,a)=>applyBreedingAction(s,a,s.now);
  const title=id=>({type:'nameLineBook',founderId:id,title:'尾白',previousTitle:null});
  const mark=(founderId,id,marked=true)=>({type:'markLineMember',founderId,id,marked});
  const old=structuredClone(grown);
  assert.ok(!('lineBooks' in grown));
  let kept=act(act(grown,title('mother')),title('father'));
  assert.deepEqual(kept.lineBooks.map(b=>b.members),[[],[]]);
  kept=act(act(kept,mark('mother',grand)),mark('father',grand));
  assert.deepEqual(act(kept,mark('mother',grand)),kept);
  assert.deepEqual(kept.lineBooks.map(b=>b.members),[[grand],[grand]]);
  assert.deepEqual(publicBreedingState(kept).lineBooks,kept.lineBooks);
  const {lineBooks,...unchanged}=kept;
  assert.deepEqual(unchanged,old);assert.deepEqual(grown,old);
  const resting=act(kept,{type:'rest',id:grand});
  const recalled=act(resting,{type:'recall',id:grand,tankId:'breeding'});
  const sold=act(recalled,{type:'sell',id:grand});
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(sold))).lineBooks,lineBooks);
  const separated=act(sold,mark('father',grand,false));
  assert.deepEqual(separated.lineBooks.map(b=>b.members),[[grand],[]]);
  const byId=new Map(grown.individuals.map(r=>[r.id,r]));
  assert.deepEqual(booksForDescendant(byId.get(grand),byId,lineBooks),lineBooks);
  const niece=act(kept,title(aunt.id));
  assert.throws(()=>act(niece,mark(aunt.id,grand)),/后代/);
});

test('旧档可自由进出手记，未知、未孵化、重复或迟到的记录不会覆盖进度',()=>{
  const formed=tick(plan(initial([shrimp('unrelated','male','main')]),2),FORM);
  const found={type:'nameLineBook',founderId:'mother',title:'尾白',previousTitle:null};
  const act=(s,a)=>applyBreedingAction(s,a,s.now);
  const book=act(formed,found), kid=book.batches[0].children[0].id;
  assert.deepEqual(act(book,found),book);
  assert.throws(()=>act(formed,{...found,founderId:'missing'}),/起点/);
  assert.throws(()=>act(formed,{...found,title:'  '}),/名字/);
  const keep=(id,marked=true)=>({type:'markLineMember',founderId:'mother',id,marked});
  for(const id of [kid,'mother','unrelated','missing']){
    assert.throws(()=>act(book,keep(id)),/后代/);
    assert.throws(()=>act(book,keep(id,false)),/后代/);
  }
  const hatched=tick(book,HATCH);
  const childBook=act(hatched,{...found,founderId:kid});
  assert.equal(childBook.lineBooks.at(-1).founderId,kid);
  const marked=act(hatched,keep(kid));
  const renamed=act(marked,{...found,title:'头白',previousTitle:'尾白'});
  const discard={type:'discardLineBook',founderId:'mother',previousTitle:'尾白',previousMembers:[]};
  assert.throws(()=>act(marked,discard),/已有变化/);
  assert.throws(()=>act(renamed,{...found,title:'新手记',previousTitle:'尾白'}),/已有变化/);
  assert.throws(()=>act(renamed,{...discard,previousMembers:[kid]}),/已有变化/);
  for(const damaged of [null, [{...marked.lineBooks[0],members:[kid,kid]}],
    [...marked.lineBooks,...marked.lineBooks], [{...marked.lineBooks[0],members:['unrelated']}]]){
    assert.throws(()=>validateBreedingState({...marked,lineBooks:damaged}));
  }
  assert.deepEqual(act(renamed,{...discard,previousTitle:'头白',previousMembers:[kid]}),tick(formed,HATCH));
  assert.equal(hatched.lineBooks[0].members.length,0);
});

test('两支家系交汇时每只只出现一次，能找到两边的手记和最短亲缘记录',()=>{
  const records=[
    {id:'root'}, {id:'other'}, {id:'a',parents:['root','other']},
    {id:'b',parents:['a','other']}, {id:'c',parents:['b','root']}, {id:'d',parents:['b','c']},
    {id:'original',legacy:true}
  ];
  const byId=new Map(records.map(r=>[r.id,r]));
  const routes=familyRoutes(childrenByParent(records),'root');
  assert.equal(routes.size,5);assert.equal(routes.get('c'),'root');
  assert.equal(routes.get('d'),'c');assert.ok(!routes.has('other'));
  const books=['a','root','other','d'].map(founderId=>({founderId,title:'同名',members:[]}));
  assert.deepEqual(booksForDescendant(byId.get('d'),byId,books).map(b=>b.founderId),['a','root','other']);
  assert.throws(()=>validateLineBooks([{founderId:'original',title:'原来的虾',members:[]}],byId),/起点/);
});

const rehouse = (state, ids, tankId, extra={}) => applyBreedingAction(state,{
  type:'rehouse',tankId,residents:ids.map(id=>({id,from:'main'})),...extra,
},state.now);

test('同批移缸保留个体和收藏，幼虾可移缸，成年后才可静养',()=>{
  const state=initial([shrimp('saved','female','main',{protected:true,observation:'背上留白'}),shrimp('young','male','main',{adultAt:HATCH})]);
  const before=structuredClone(state);
  assert.throws(()=>rehouse(state,['saved','young'],'rest'),/暂时不能/);
  const moved=rehouse(state,['young','saved'],'breeding');
  const expected=structuredClone(before);
  for(const r of expected.individuals)if(r.id==='young'||r.id==='saved')r.tank='breeding';
  assert.deepEqual(moved,expected);
  const resting=rehouse(state,['saved'],'rest');
  const returned=applyBreedingAction(resting,{type:'recall',id:'saved',tankId:'main'},0);
  assert.deepEqual(returned,before);assert.deepEqual(state,before);
});

test('重复、迟到、活动亲虾与主缸原配均不能夹进同一批安置',()=>{
  const state=plan(initial([shrimp('a','female','main'),shrimp('b','male','main'),shrimp('c','male','main')]));
  const before=structuredClone(state);
  assert.throws(()=>rehouse(state,['a','a'],'rest'),/不同/);
  assert.throws(()=>rehouse(state,['a','mother'],'rest',{residents:[{id:'a',from:'main'},{id:'mother',from:'breeding'}]}),/暂时不能/);
  assert.throws(()=>rehouse(state,['b','a'],'rest',{motherId:'a',fatherId:'b'}),/亲虾保留/);
  const pair=naturalPair(state);
  assert.deepEqual(pair,{motherId:'a',fatherId:'b'});
  assert.throws(()=>rehouse(state,['c'],'rest',{natural:true,motherId:'a',fatherId:'c'}),/亲虾已有变化/);
  assert.equal(rehouse(state,['c'],'rest',{natural:true,...pair}).individuals.at(-1).tank,'rest');
  const changed=rehouse(state,['b'],'rest');
  assert.throws(()=>rehouse(changed,['a','b'],'breeding'),/换缸/);
  assert.deepEqual(state,before);
});

test('多人同时移入时为未孵化后代留位，静养四位满后不作部分安置',()=>{
  const guests=Array.from({length:6},(_,i)=>shrimp('g'+i,'female','main'));
  const planned=plan(initial([...guests,shrimp('r1'),shrimp('r2'),shrimp('r3')]));
  const before=structuredClone(planned);
  assert.throws(()=>rehouse(planned,['g0','g1'],'breeding'),/预留/);
  assert.equal(tankOccupancy(rehouse(planned,['g2'],'breeding'),'breeding').animals,6);
  const three=rehouse(planned,['g0','g1','g2'],'rest');
  assert.throws(()=>rehouse(three,['g3','g4'],'rest'),/静养位置已满/);
  assert.equal(three.individuals.filter(r=>r.tank==='rest').length,3);
  assert.deepEqual(planned,before);
});

// A two-pixel JPEG. Browser coverage separately downloads and decodes a real tank frame.
const photoJPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==';
const tankPhoto = (id, individualId='mother', at=10) => ({
  id:'00000000-0000-4000-8000-'+String(id).padStart(12,'0'), individualId, tankId:'breeding', name:'浅砂', at, jpeg:photoJPEG,
});
const keepPhoto = (state, photo, replaceId) => applyBreedingAction(state, {type:'keepTankPhoto',photo,replaceId}, Math.max(state.now,photo.at));

function studyBrood() {
  const founders=initial();
  Object.assign(founders.individuals[0],{colour:'red',pattern:'band'});
  Object.assign(founders.individuals[1],{colour:'black',pattern:'hinomaru'});
  return tick(plan(founders),HATCH);
}

test('记下同窝两只时保留玩家选择的顺序、部位和当时的年龄，旧档可照常打开',()=>{
  const state=studyBrood(), batch=state.batches[0];
  const study={ids:[batch.children[3].id,batch.children[1].id],at:HATCH,crop:'head'};
  const keep={type:'keepSiblingStudy',batchId:batch.id,...study};
  const kept=applyBreedingAction(state,keep,HATCH);
  const expected=structuredClone(state);expected.batches[0].siblingStudy=study;
  assert.deepEqual(kept,expected);
  assert.equal(state.batches[0].siblingStudy,undefined);
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(state))),state);
  const aged=tick(kept,GROWTH+3*86400000);
  assert.deepEqual(applyBreedingAction(aged,keep,aged.now),aged);
  const sold=applyBreedingAction(aged,{type:'sell',id:study.ids[0]},aged.now);
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(sold))).batches[0].siblingStudy,study);
});

test('换记另一对要核对原记录，重复点击与迟到的确认不会覆盖后来记下的一对',()=>{
  const state=studyBrood(), batch=state.batches[0], ids=batch.children.map(r=>r.id);
  const first={ids:ids.slice(0,2),at:HATCH,crop:'whole'}, next={ids:ids.slice(2),at:HATCH+2,crop:'back'};
  const keep=(value,study,previous)=>applyBreedingAction(value,{type:'keepSiblingStudy',batchId:batch.id,...study,previous},HATCH+2);
  const marked=keep(state,first);
  assert.throws(()=>keep(marked,next),/已有变化/);
  const changed=keep(marked,next,first);
  assert.deepEqual(keep(changed,next,first),changed);
  assert.throws(()=>keep(changed,{...first,crop:'head'},first),/已有变化/);
  assert.deepEqual(marked.batches[0].siblingStudy,first);
  assert.deepEqual(changed.batches[0].siblingStudy,next);
});

test('同窝手记拒绝猜出的旧花色、别窝虾、重复身份，以及孵化之前和未来的对照',()=>{
  const state=studyBrood(), batch=state.batches[0], ids=batch.children.slice(0,2).map(r=>r.id);
  const study={ids,at:HATCH,crop:'back'};
  for (const change of [{ids:[ids[0],ids[0]]},{ids:[ids[0],'other']},{ids:[ids[0]]},{at:HATCH-1},{at:HATCH+1},{crop:'side'}]) {
    const invalid={...study,...change};
    assert.throws(()=>applyBreedingAction(state,{type:'keepSiblingStudy',batchId:batch.id,...invalid},HATCH));
    const imported=structuredClone(state);imported.batches[0].siblingStudy=invalid;
    assert.throws(()=>validateBreedingState(imported));
  }
  const old=tick(plan(initial()),HATCH), withoutLook=old.batches[0];
  assert.throws(()=>applyBreedingAction(old,{type:'keepSiblingStudy',batchId:withoutLook.id,...study,ids:withoutLook.children.slice(0,2).map(r=>r.id)},HATCH),/花色/);
  const formed=tick(plan(initial()),FORM);formed.batches[0].siblingStudy=study;
  assert.throws(()=>validateBreedingState(formed),/孵化/);
});

test('缸边照片冻结拍摄时的名字和缸，读档、移缸、转让都能认回原个体',()=>{
  const state=initial(), photo=tankPhoto(1), captured=keepPhoto(state,photo);
  assert.equal(state.tankPhotos,undefined);
  assert.deepEqual(captured.batches,state.batches);
  assert.equal(captured.cash,state.cash);
  const renamed=applyBreedingAction(captured,{type:'rename',id:'mother',name:'青石'},12);
  const moved=applyBreedingAction(renamed,{type:'move',id:'mother',tankId:'main'},14);
  const sold=applyBreedingAction(moved,{type:'sell',id:'mother'},15);
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(sold))).tankPhotos,[photo]);
  assert.throws(()=>keepPhoto(moved,tankPhoto(2,'mother',15)),/这口缸/);
  assert.throws(()=>keepPhoto(sold,tankPhoto(2,'mother',16)),/已转让/);
});

test('照片分别保存玩家的留言，成年虾转让后也能补记，改写个体观察不会改动旧照',()=>{
  const first=tankPhoto(1), second=tankPhoto(2);
  const noted=applyBreedingAction(initial(),{type:'observation',id:'mother',value:'白色很厚'},10);
  const original=keepPhoto(noted,first);
  const album=applyBreedingAction(original,{type:'keepTankPhoto',photo:second,caption:'背上像月牙 🦐'},13);
  assert.equal(album.tankPhotos[0].caption,undefined);
  assert.deepEqual(album.tankPhotos[1].caption,{text:'背上像月牙 🦐',at:13});
  const changed=applyBreedingAction(album,{type:'observation',id:'mother',value:'今天在木头旁边'},14);
  const retired=applyBreedingAction(changed,{type:'sell',id:'mother'},15);
  const write={type:'captionTankPhoto',id:first.id,individualId:first.individualId,previousText:'',previousAt:null,value:'这是它原来住的地方'};
  const added=applyBreedingAction(retired,write,16);
  assert.deepEqual(added.tankPhotos[0],{...first,caption:{text:write.value,at:16}});
  assert.deepEqual(added.tankPhotos[1],album.tankPhotos[1]);
  assert.deepEqual(added.individuals,retired.individuals);
  assert.equal(added.cash,retired.cash);
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(added))).tankPhotos,added.tankPhotos);
  assert.throws(()=>applyBreedingAction(added,{...write,value:'来自过时的编辑'},17),/留言已变动/);
  const clear=applyBreedingAction(added,{...write,previousText:write.value,previousAt:16,value:''},18);
  assert.deepEqual(clear.tankPhotos[0],first);
  assert.equal(retired.tankPhotos[0].caption,undefined);
});

test('留影留言只属于指定照片，校验失败保留原图和原文',()=>{
  const photo=tankPhoto(1), state=keepPhoto(initial(),photo);
  const edit={type:'captionTankPhoto',id:photo.id,individualId:'mother',previousText:'',previousAt:null,value:'小虾'};
  assert.throws(()=>applyBreedingAction(state,{...edit,individualId:'father'},14),/留影已变动/);
  assert.throws(()=>applyBreedingAction(state,{...edit,id:tankPhoto(2).id},14),/留影已变动/);
  for(const value of ['虾'.repeat(61),'第一行\n第二行',' 有空格',123]) {
    assert.throws(()=>applyBreedingAction(state,{...edit,value},14));
    assert.throws(()=>applyBreedingAction(state,{type:'keepTankPhoto',photo:tankPhoto(2),caption:value,replaceId:photo.id},14));
  }
  for(const caption of [null, {text:'',at:10}, {text:'一笔',at:9}, {text:'一笔',at:11}, {text:'一笔'}]) {
    assert.throws(()=>validateBreedingState({...state,tankPhotos:[{...photo,caption}]}),/照片留言/);
  }
  assert.deepEqual(state.tankPhotos,[photo]);
});

test('满册只能明确指定替换，损坏照片、错号和重复编号不覆盖旧照',()=>{
  const photos=[1,2,3,4].map(i=>tankPhoto(i));
  const full=photos.reduce((s,p)=>keepPhoto(s,p), initial());
  assert.throws(()=>keepPhoto(full,tankPhoto(5)),/已满/);
  assert.throws(()=>keepPhoto(full,tankPhoto(5),'unknown'),/替换/);
  assert.throws(()=>keepPhoto(full,tankPhoto(1),photos[1].id),/留影/);
  for(const change of [{jpeg:'data:image/svg+xml,<svg/>'},{jpeg:photoJPEG.slice(0,-4)}, {jpeg:'A'.repeat(49156)}, {individualId:'gone'}])
    assert.throws(()=>keepPhoto(full,{...tankPhoto(5),...change},photos[1].id));
  assert.deepEqual(full.tankPhotos,photos);
  const next=keepPhoto(full,tankPhoto(5),photos[1].id);
  assert.deepEqual(next.tankPhotos.map(p=>p.id),[photos[0].id,photos[2].id,photos[3].id,tankPhoto(5).id]);
  assert.throws(()=>applyBreedingAction(next,{type:'removeTankPhoto',id:photos[1].id},11),/不在相册/);
  const cleared=next.tankPhotos.reduce((s,p)=>applyBreedingAction(s,{type:'removeTankPhoto',id:p.id},11),next);
  assert.equal(cleared.tankPhotos,undefined);
});

test('不能生成孵化前、购买前或未来的缸边留影',()=>{
  const hatched=tick(plan(initial(),2),HATCH), kid=hatched.batches[0].children[0];
  assert.throws(()=>keepPhoto(hatched,tankPhoto(1,kid.id,HATCH-1)),/留影/);
  assert.equal(keepPhoto(hatched,tankPhoto(1,kid.id,HATCH)).tankPhotos.length,1);
  const purchased=applyBreedingAction(initial(),{type:'buy',tankId:'breeding',productId:'basic-male'},20);
  const shopId=purchased.purchases[0].individualId;
  assert.throws(()=>keepPhoto(purchased,tankPhoto(1,shopId,19)),/留影/);
  assert.throws(()=>validateBreedingState({...purchased,tankPhotos:[tankPhoto(1,shopId,21)]}),/留影/);
});

test('玩家写下的观察只跟随这只虾，成年、移缸及转让后仍可阅读',()=>{
  const hatched=tick(plan(initial(),2),HATCH), original=structuredClone(hatched);
  const [child,sibling]=hatched.batches[0].children, note='尾扇前的白带很窄 🦐';
  const write=(state,value)=>applyBreedingAction(state,{type:'observation',id:child.id,value},state.now);
  const marked=write(hatched,note), read=(state,id=child.id)=>state.individuals.find(r=>r.id===id).observation;
  assert.deepEqual(hatched,original);
  assert.equal(read(marked),note);
  assert.equal(read(marked,sibling.id),undefined);
  assert.deepEqual(marked.batches,original.batches);
  assert.deepEqual(write(marked,''),original);
  const moved=applyBreedingAction(marked,{type:'move',id:child.id,tankId:'main'},GROWTH);
  const sold=applyBreedingAction(moved,{type:'sell',id:child.id},GROWTH);
  assert.equal(read(publicBreedingState(validateBreedingState(JSON.parse(JSON.stringify(sold))))),note);
  assert.throws(()=>write(sold,'改写'),/已转让/);
  assert.equal(read(write(hatched,'🦐'.repeat(60))),'🦐'.repeat(60));
  for(const bad of [13,'一\n二','一\u2028二','虾'.repeat(61)])assert.throws(()=>write(hatched,bad),/观察/);
  original.batches[0].children[0].observation=note;
  assert.throws(()=>validateBreedingState(original),/出生/);
});

test('成长检查复用当前进度的时间点，取消、换档、结算失败后仍按正确阶段触发',()=>{
  const due=createGrowthDueCheck(), planned=plan(initial());
  const cancelled=applyBreedingAction(planned,{type:'cancel',batchId:planned.batches[0].id},0);
  let reads=0;
  const observed=new Proxy(planned,{get(state,key){if(key==='batches'||key==='individuals')reads++;return state[key];}});
  assert.equal(due(observed,FORM-1),false);
  const initialReads=reads;
  for(const now of [FORM,FORM+100,FORM+200])assert.equal(due(observed,now),true);
  assert.equal(reads,initialReads);
  assert.equal(due(cancelled,GROWTH),false);
  for(const [state,at] of [[planned,FORM],[tick(planned,FORM),HATCH],[tick(planned,HATCH),GROWTH]]){
    assert.equal(due(state,at-1),false);
    assert.equal(due(state,at),true);
  }
  assert.equal(due(tick(planned,GROWTH),GROWTH+1),false);
  assert.equal(due(initial([shrimp('juvenile','male','main',{adultAt:42})]),42),true);
});

test('自然繁殖确认时若另一只亲虾刚成年，会请玩家重看而不会静默换亲',()=>{
  const state=createBreedingState([shrimp('young','female','main',{adultAt:10}),shrimp('dam','female','main'),shrimp('sire','male','main')],{now:0,seed:7});
  const action={type:'natural',size:2,expectedPair:naturalPair(state)};
  assert.equal(action.expectedPair.motherId,'dam');
  assert.equal(applyBreedingAction(state,action,9).batches[0].motherId,'dam');
  assert.throws(()=>applyBreedingAction(state,action,10),/亲虾已变动/);
  assert.equal(state.batches.length,0);
  const current=tick(state,10);
  assert.equal(applyBreedingAction(current,{...action,expectedPair:naturalPair(current)},10).batches[0].motherId,'young');
});

test('满缸时一笔转让腾出整窝位置，重试、重复或受限名单不能部分成交',()=>{
  const residents=Array.from({length:8},(_,i)=>shrimp('extra'+i,'female','breeding',{name:'青团',protected:i===7}));
  const full=initial([...residents,shrimp('away','female','main')]);
  const transfer=(s,ids)=>applyBreedingAction(s,{type:'sellGroup',tankId:'breeding',ids},s.now);
  assert.throws(()=>plan(full,2));
  for(const ids of [[],['extra0','extra0'],['extra0','extra7'],['extra0','away'],['extra0','missing']])
    assert.throws(()=>transfer(full,ids));
  const freed=transfer(full,['extra0','extra1']);
  assert.equal(freed.cash,full.cash+16);
  assert.equal(tankOccupancy(full,'breeding').animals,10);
  assert.equal(tankOccupancy(freed,'breeding').animals,8);
  assert.deepEqual(freed.individuals.filter(r=>r.soldAt!==null).map(r=>r.id),['extra0','extra1']);
  assert.throws(()=>transfer(freed,['extra0','extra1']),/已转让/);
  const planned=plan(freed,2);
  assert.deepEqual(tankOccupancy(planned,'breeding'),{animals:8,reserved:2});
  assert.throws(()=>transfer(planned,['extra2','father']),/活动亲虾/);
  const hatched=tick(planned,HATCH);
  assert.throws(()=>transfer(hatched,['extra2',hatched.batches[0].children[0].id]),/未成年/);
  assert.equal(hatched.cash,freed.cash);
});

test('看图挑亲虾随成长和占用更新，收藏虾可选，静养和已售虾不可选',()=>{
  const candidates=s=>s.individuals.filter(r=>canSelectParent(s,r)).map(r=>r.id);
  const start=initial(), planned=plan(start,2);
  assert.deepEqual(candidates(planned),[]);
  assert.deepEqual(candidates(tick(planned,FORM)),['father']);
  assert.deepEqual(candidates(tick(planned,HATCH)),['father']);
  const grown=tick(planned,GROWTH);
  assert.equal(candidates(grown).length,4);
  const again=plan(grown,2), formed=tick(again,again.batches[1].formedAt);
  assert.equal(activeParentBatch(again,'father'),again.batches[1]);
  assert.equal(activeParentBatch(formed,'mother'),formed.batches[1]);
  assert.equal(activeParentBatch(formed,'father'),undefined);
  const mother=grown.individuals.find(r=>r.id==='mother');
  assert.ok(canSelectParent(grown,{...mother,protected:true}));
  for(const changes of [{tank:'rest'},{soldAt:GROWTH,tank:null},{legacy:true}])
    assert.equal(canSelectParent(grown,{...mother,...changes}),false);
});

test('腾位明细随抱卵母虾迁移预留，孵化时从预留转入活体',()=>{
  const formed=tick(plan(initial(),2),FORM);
  assert.deepEqual(tankOccupancy(formed,'breeding'),{animals:2,reserved:2});
  const moved=applyBreedingAction(formed,{type:'move',id:'mother',tankId:'main'},FORM);
  assert.deepEqual(tankOccupancy(moved,'breeding'),{animals:1,reserved:0});
  assert.deepEqual(tankOccupancy(moved,'main'),{animals:1,reserved:2});
  assert.deepEqual(tankOccupancy(moved),{animals:2,reserved:2});
  const grown=tick(moved,GROWTH);
  assert.deepEqual(tankOccupancy(grown),{animals:4,reserved:0});
  const sold=applyBreedingAction(grown,{type:'sell',id:'father'},GROWTH);
  assert.deepEqual(tankOccupancy(sold),{animals:3,reserved:0});
});

test('confirming a plan moves both parents atomically and includes them in destination capacity',()=>{
  const founders=[shrimp('mother','female','main'),shrimp('father','male','main')];
  const start=createBreedingState(founders,{now:0,seed:7});
  const planned=plan(start,4);
  assert.ok(planned.individuals.every(r=>r.tank==='breeding'));
  assert.ok(start.individuals.every(r=>r.tank==='main'));
  assert.equal(planned.batches.length,1);
  const occupied=createBreedingState([...founders,...Array.from({length:5},(_,i)=>shrimp('occupant-'+i))],{now:0,seed:7});
  const before=structuredClone(occupied);
  assert.throws(()=>plan(occupied,4),/空间不足/);
  assert.deepEqual(occupied,before,'failed reservation leaves both parents in their original tank');
  assert.equal(plan(occupied,2).batches[0].size,2);
});

test('2/4 offspring reserve actual room, form deterministically, hatch once, mature offline', () => {
  for (const size of [2, 4]) {
    const start = initial(), pending = plan(start, size);
    assert.equal(pending.rngState, start.rngState);
    assert.equal(pending.individuals.length, 2);
    assert.equal(pending.batches[0].children.length, 0);
    const formed = tick(pending, FORM);
    assert.equal(formed.batches[0].children.length, size);
    assert.equal(formed.individuals.length, 2);
    assert.notEqual(formed.rngState, pending.rngState);
    const hatched = tick(formed, HATCH);
    assert.equal(hatched.individuals.length, 2 + size);
    assert.equal(hatched.batches[0].status, 'hatched');
    const mature = tick(hatched, GROWTH);
    assert.equal(mature.batches[0].status, 'complete');
    assert.deepEqual(tick(mature, GROWTH), mature);
    const offline = tick(pending, GROWTH);
    assert.deepEqual(offline, mature);
    assert.deepEqual(tick(offline, 7 * 86400000).individuals, mature.individuals);
    assert.equal(start.batches.length, 0);
  }
});

test('JSON restoration preserves formed genetics, RNG, sold lineage, and duplicate hatch protection', () => {
  const formed = tick(plan(initial(), 2), FORM);
  const restored = validateBreedingState(JSON.parse(JSON.stringify(formed)));
  assert.deepEqual(restored, formed);
  const mature = tick(restored, GROWTH);
  const sold = applyBreedingAction(mature, {type:'sell', id:'mother'}, GROWTH);
  assert.equal(sold.cash, 108);
  assert.equal(sold.individuals[0].tank, null);
  assert.deepEqual(sold.individuals[2].parents, ['mother', 'father']);
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(sold))), sold);
  assert.throws(() => applyBreedingAction(sold, {type:'sell', id:'mother'}, GROWTH), /已转让/);
  assert.equal(tick(sold, GROWTH + 1).individuals.length, 4);
});

test('failed plan or move preserves original state, time, money, and random state', () => {
  const full = initial(Array.from({length:8}, (_, i) => shrimp(`other-${i}`)));
  const before = JSON.stringify(full);
  assert.throws(() => plan(full, 2, 100), /空间不足/);
  assert.equal(JSON.stringify(full), before);
  const crowdedMain = initial(Array.from({length:20}, (_, i) => shrimp(`main-${i}`, 'male', 'main')));
  const previous = JSON.stringify(crowdedMain);
  assert.throws(() => applyBreedingAction(crowdedMain, {type:'move', id:'mother', tankId:'main'}, 100), /空间不足/);
  assert.equal(JSON.stringify(crowdedMain), previous);
});

test('reservations block extra arrivals, and a smaller brood fits where a standard brood does not', () => {
  const state = initial([...Array.from({length:6}, (_, i) => shrimp(`extra-${i}`)), shrimp('visitor', 'male', 'main')]);
  assert.throws(() => plan(state, 4), /空间不足/);
  const pending = plan(state, 2);
  assert.throws(() => applyBreedingAction(pending, {type:'move', id:'visitor', tankId:'breeding'}, 1), /空间不足/);
  assert.equal(tick(pending, HATCH).individuals.filter(record => record.tank === 'breeding').length, 10);
});

test('cancellation before formation releases reservations without drawing offspring; formation cannot be cancelled', () => {
  const start = initial(), pending = plan(start);
  const cancelled = applyBreedingAction(pending, {type:'cancel', batchId:pending.batches[0].id}, FORM - 1);
  assert.equal(cancelled.rngState, start.rngState);
  assert.equal(tick(cancelled, GROWTH).individuals.length, 2);
  assert.equal(plan(cancelled, 2).batches.length, 2);
  const before = JSON.stringify(pending);
  assert.throws(() => applyBreedingAction(pending, {type:'cancel', batchId:pending.batches[0].id}, FORM), /不能取消/);
  assert.equal(JSON.stringify(pending), before);
});

test('father releases on formation, mother stays protected through recovery; normal moves require explicit action', () => {
  const pending = plan(initial());
  for (const id of ['mother', 'father']) {
    assert.throws(() => applyBreedingAction(pending, {type:'move', id, tankId:'main'}, 1), /活动亲虾/);
    assert.throws(() => applyBreedingAction(pending, {type:'sell', id}, 1), /活动亲虾/);
  }
  const formed = tick(pending, FORM);
  const fatherMoved = applyBreedingAction(formed, {type:'move', id:'father', tankId:'main'}, FORM);
  assert.equal(fatherMoved.individuals[1].tank, 'main');
  const fatherSold = applyBreedingAction(fatherMoved, {type:'sell', id:'father'}, FORM);
  const hatched = tick(fatherSold, HATCH);
  assert.equal(applyBreedingAction(hatched, {type:'move', id:'mother', tankId:'main'}, HATCH).individuals[0].tank, 'main');
  assert.equal(applyBreedingAction(hatched, {type:'move', id:'mother', tankId:'main'}, GROWTH).individuals[0].tank, 'main');
  const moved = applyBreedingAction(initial(), {type:'move', id:'mother', tankId:'main'}, 0);
  assert.equal(plan(moved).individuals[0].tank, 'breeding');
  assert.equal(moved.individuals[0].tank, 'main');
});

test('protected or juvenile offspring cannot be sold, and public data hides B and premature P', () => {
  const protectedState = applyBreedingAction(initial(), {type:'protect', id:'mother', value:true}, 0);
  assert.throws(() => applyBreedingAction(protectedState, {type:'sell', id:'mother'}, 0), /收藏/);
  const formed = tick(plan(protectedState), FORM);
  const projection = publicBreedingState(formed);
  assert.ok(!Object.hasOwn(projection, 'rngState'));
  assert.ok(projection.individuals.every(record => !Object.hasOwn(record, 'B')));
  assert.ok(!Object.hasOwn(projection.batches[0], 'children'));
  const hatched = tick(formed, HATCH), childId = hatched.individuals[2].id;
  assert.throws(() => applyBreedingAction(hatched, {type:'sell', id:childId}, HATCH), /未成年/);
  assert.ok(!Object.hasOwn(publicBreedingState(hatched).individuals[2], 'P'));
  assert.ok(Object.hasOwn(publicBreedingState(tick(hatched, GROWTH)).individuals[2], 'P'));
});

test('corrupt saves are rejected rather than repaired', () => {
  const state = tick(plan(initial()), GROWTH);
  const corruptions = [
    s => { s.version = 2; }, s => { s.cash = -1; }, s => { s.rngState = NaN; },
    s => { s.individuals.push(structuredClone(s.individuals[0])); },
    s => { s.individuals[0].B[0] = 0; },
    s => { s.individuals[0].parents = ['missing', 'father']; },
    s => { s.individuals[0].parents = ['mother', 'father']; },
    s => { s.batches[0].children.pop(); }, s => { s.individuals.pop(); },
    s => { s.batches[0].status = 'planned'; }, s => { s.batches[0].hatchAt++; },
    s => { s.individuals[2].P[0] += 0.1; }, s => { s.tanks[0].capacity = 100; },
  ];
  for (const corrupt of corruptions) {
    const bad = structuredClone(state); corrupt(bad);
    assert.throws(() => validateBreedingState(bad));
  }
  assert.throws(() => tick(state, GROWTH - 1), /倒退/);
  assert.throws(() => applyBreedingAction(state, {type:'unknown'}, GROWTH));
});

test('non-default growth requires an explicit valid stage clock', () => {
  const records = initial().individuals;
  assert.throws(() => createBreedingState(records, {now:0, seed:1, growthMs:5400000}), /明确提供/);
  const slow = createBreedingState(records, {now:0, seed:1, growthMs:5400000, stageMs:{form:120000, hatch:900000}});
  assert.equal(plan(slow).batches[0].hatchAt, 900000);
  assert.throws(() => createBreedingState(records, {now:0, seed:1, growthMs:5400000, stageMs:{form:900000, hatch:120000}}), /阶段时间/);
});

test('a completed batch may be followed by another batch without losing the first lineage', () => {
  const first = tick(plan(initial(), 2), GROWTH);
  const second = plan(first, 2);
  const final = tick(second, 2 * GROWTH);
  assert.equal(final.individuals.length, 6);
  assert.equal(final.batches.length, 2);
  assert.deepEqual(final.batches[0].children, first.batches[0].children);
  assert.equal(new Set(final.individuals.map(record => record.id)).size, 6);
});

test('historical overlapping plans and identity counter exhaustion reject safely', () => {
  const cancelled = applyBreedingAction(plan(initial()), {type:'cancel', batchId:'crystal-1'}, 100);
  const malformed = structuredClone(cancelled);
  malformed.batches.push({...structuredClone(malformed.batches[0]), id:'other-batch'});
  assert.throws(() => validateBreedingState(malformed), /占用重叠/);
  const counter = initial([shrimp(`crystal-${Number.MAX_SAFE_INTEGER - 1}`, 'male', 'main')]);
  counter.nextId = Number.MAX_SAFE_INTEGER - 1;
  const original = JSON.stringify(counter);
  assert.throws(() => plan(counter), /序号已用尽/);
  assert.equal(JSON.stringify(counter), original);
});

test('fixed shop candidates cannot be overridden and purchased identity survives sale and reload', () => {
  const catalogue = shopCatalogue();
  assert.deepEqual(catalogue.map(item => [item.id, item.price, item.P]), [
    ['basic-female', 16, [5, 5, 5]], ['basic-male', 16, [5, 5, 5]], ['b1-colour-male', 40, [9, 5, 6]],
    ['black-mosura-female', 16, [5, 5, 5]], ['red-mosura-male', 16, [5, 5, 5]],
  ]);
  assert.ok(catalogue.every(item => item.developerCandidate && !Object.hasOwn(item, 'B')));
  catalogue[0].P[0] = 9;
  assert.equal(shopCatalogue()[0].P[0], 5);
  const bought = applyBreedingAction(initial(), {type:'buy', productId:'b1-colour-male', tankId:'main', price:0, B:[9, 9, 9], P:[9, 9, 9], sex:'female'}, 100);
  const record = bought.individuals.at(-1);
  assert.equal(bought.cash, 60);
  assert.equal(record.sex, 'male');
  assert.deepEqual(record.B, [9, 5, 6]);
  assert.equal(record.adultAt, 100);
  assert.equal(record.source, 'shop:b1-colour-male');
  assert.equal(record.parents, null);
  const sold = applyBreedingAction(bought, {type:'sell', id:record.id}, 100);
  const restored = validateBreedingState(JSON.parse(JSON.stringify(sold)));
  const before = JSON.stringify(restored);
  assert.throws(() => applyBreedingAction(restored, {type:'buy', productId:'b1-colour-male', tankId:'main'}, 200), /已经购买/);
  assert.equal(JSON.stringify(restored), before);
  assert.equal(restored.cash, 68);
});

test('shop rejects unaffordable, unknown, full and reserved destinations without charging or drawing RNG', () => {
  const poor = initial(); poor.cash = 15;
  const full = initial(Array.from({length:20}, (_, i) => shrimp(`main-${i}`, 'male', 'main')));
  const reserved = plan(initial(Array.from({length:6}, (_, i) => shrimp(`other-${i}`))), 2);
  for (const [state, productId, tankId, message] of [
    [poor, 'basic-female', 'main', /资金不足/],
    [full, 'basic-female', 'main', /空间不足/],
    [reserved, 'basic-female', 'breeding', /空间不足/],
    [initial(), 'invented', 'main', /商品不存在/],
    [initial(), 'basic-female', 'breeding-2', /目标缸不存在/],
  ]) {
    const before = JSON.stringify(state);
    assert.throws(() => applyBreedingAction(state, {type:'buy', productId, tankId}, FORM), message);
    assert.equal(JSON.stringify(state), before);
  }
});

test('purchased basic parents can breed without inventing lineage or resetting their identities', () => {
  let state = createBreedingState([], {now:0, seed:1});
  state = applyBreedingAction(state, {type:'buy', productId:'basic-female', tankId:'breeding'}, 0);
  state = applyBreedingAction(state, {type:'buy', productId:'basic-male', tankId:'breeding'}, 0);
  const [mother, father] = state.individuals;
  state = applyBreedingAction(state, {type:'plan', motherId:mother.id, fatherId:father.id, tankId:'breeding', size:2}, 0);
  const mature = tick(state, GROWTH);
  assert.equal(mature.cash, 68);
  assert.deepEqual(mature.individuals.at(-1).parents, [mother.id, father.id]);
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(mature))), mature);
});

test('two explicit expansion purchases reach 50 slots, support breeding and refuse replay or third purchase', () => {
  const start = initial(); start.cash = 300; // Isolated balance fixture, not a player money action.
  let state = applyBreedingAction(start, {type:'expand', tankId:'breeding-2'}, 0);
  const before = JSON.stringify(state);
  assert.throws(() => applyBreedingAction(state, {type:'expand', tankId:'breeding-2'}, 1), /已经购买/);
  assert.equal(JSON.stringify(state), before);
  state = applyBreedingAction(state, {type:'expand', tankId:'breeding-3'}, 0);
  assert.equal(state.cash, 120);
  assert.equal(state.tanks.reduce((sum, tank) => sum + tank.capacity, 0), 50);
  assert.throws(() => applyBreedingAction(state, {type:'expand', tankId:'breeding-4'}, 0), /50位上限/);
  for (const id of ['mother', 'father']) state = applyBreedingAction(state, {type:'move', id, tankId:'breeding-3'}, 0);
  state = applyBreedingAction(state, {type:'plan', motherId:'mother', fatherId:'father', tankId:'breeding-3', size:4}, 0);
  const restored = validateBreedingState(JSON.parse(JSON.stringify(state)));
  assert.equal(tick(restored, GROWTH).individuals.filter(record => record.tank === 'breeding-3').length, 6);
  const poor = initial(); poor.cash = 89;
  assert.throws(() => applyBreedingAction(poor, {type:'expand', tankId:'breeding-2'}, 0), /资金不足/);
  assert.equal(poor.cash, 89);
  assert.throws(() => applyBreedingAction(initial(), {type:'expand', tankId:'breeding-3'}, 0), /目标无效/);
});

test('all 50 slots count living individuals and brood reservations across expanded tanks', () => {
  let state = initial(); state.cash = 200;
  for (const tankId of ['breeding-2', 'breeding-3']) state = applyBreedingAction(state, {type:'expand', tankId}, 0);
  for (const tank of state.tanks) {
    const existing = state.individuals.filter(record => record.tank === tank.id).length;
    const target = tank.id === 'breeding' ? 8 : tank.capacity;
    for (let i = existing; i < target; i++) state.individuals.push(shrimp(`${tank.id}-${i}`, 'female', tank.id, {soldAt:null}));
  }
  state = plan(validateBreedingState(state), 2);
  const before = JSON.stringify(state);
  assert.throws(() => applyBreedingAction(state, {type:'buy', productId:'basic-female', tankId:'breeding'}, 0), /空间不足/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(tick(state, GROWTH).individuals.length, 50);
});

test('illegal expansions and damaged purchase receipts reject instead of repairing', () => {
  const state = applyBreedingAction(initial(), {type:'buy', productId:'basic-male', tankId:'main'}, 0);
  for (const damage of [
    s => { delete s.purchases; }, s => { s.purchases = []; },
    s => { s.purchases.push({...s.purchases[0]}); },
    s => { s.purchases[0].individualId = 'missing'; },
    s => { s.purchases[0].price = 0; }, s => { s.purchases[0].boughtAt = 1; },
    s => { s.individuals.at(-1).B[0] = 6; },
    s => { s.tanks.push({id:'made-up', capacity:10}); },
    s => { s.tanks.push({id:'breeding-3', capacity:10}); },
    s => { s.tanks.push({id:'breeding-2', capacity:20}); },
    s => { s.individuals[0].tank = 'breeding-2'; },
  ]) {
    const bad = structuredClone(state); damage(bad);
    assert.throws(() => validateBreedingState(bad));
  }
});

test('all breeding timestamps require nonnegative safe integer milliseconds', () => {
  const state = initial();
  const before = JSON.stringify(state);
  for (const now of [0.5, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createBreedingState([], {now, seed:1}), /时钟无效/);
    assert.throws(() => tick(state, now), /时间不能倒退/);
  }
  assert.equal(JSON.stringify(state), before);
  const cancelled = applyBreedingAction(plan(state), {type:'cancel', batchId:'crystal-1'}, 100);
  const bought = applyBreedingAction(state, {type:'buy', productId:'basic-male', tankId:'main'}, 100);
  for (const [source, damage] of [
    [state, s => { s.stageMs.form = 120000.5; }],
    [state, s => { s.stageMs.hatch = 600000.5; }],
    [state, s => { s.growthMs += 0.5; }],
    [state, s => { s.individuals[0].adultAt = 0.5; }],
    [cancelled, s => { s.batches[0].cancelledAt = 99.5; }],
    [bought, s => { s.purchases[0].boughtAt = 99.5; s.individuals.at(-1).adultAt = 99.5; }],
    [applyBreedingAction(state, {type:'sell', id:'mother'}, 100), s => { s.individuals[0].soldAt = 99.5; }],
  ]) {
    const bad = structuredClone(source); damage(bad);
    assert.throws(() => validateBreedingState(bad));
  }
  const nearLimit = createBreedingState([], {now:Number.MAX_SAFE_INTEGER, seed:1});
  assert.equal(tick(nearLimit, Number.MAX_SAFE_INTEGER).now, Number.MAX_SAFE_INTEGER);
});

test('appearance locks at formation without changing any quality, sex or RNG draw; names remain editable', () => {
  const old = initial(), named = initial();
  Object.assign(named.individuals[0], {name:'小枫', colour:'red', pattern:'band', traitGroup:'crystal-game-v1'});
  Object.assign(named.individuals[1], {name:'墨点', colour:'black', pattern:'hinomaru', traitGroup:'crystal-game-v1'});
  const plainFormed = tick(plan(old), FORM), namedFormed = tick(plan(named), FORM);
  assert.equal(namedFormed.rngState, plainFormed.rngState);
  for (let i = 0; i < 4; i++) for (const key of ['B', 'P', 'sex']) assert.deepEqual(namedFormed.batches[0].children[i][key], plainFormed.batches[0].children[i][key]);
  const restored = validateBreedingState(JSON.parse(JSON.stringify(namedFormed)));
  const hatched = tick(restored, HATCH), child = hatched.individuals[2];
  const renamed = applyBreedingAction(hatched, {type:'rename', id:child.id, name:'第一窝小宝'}, HATCH);
  assert.equal(renamed.individuals[2].name, '第一窝小宝');
  assert.equal(renamed.batches[0].children[0].name, child.name, 'birth snapshot keeps the original name');
  const visible = publicBreedingState(renamed).individuals[2];
  assert.equal(visible.colour, child.colour); assert.equal(visible.pattern, child.pattern);
  assert.ok(!Object.hasOwn(visible, 'B') && !Object.hasOwn(visible, 'P'));
  const bad = structuredClone(namedFormed); bad.batches[0].children[0].pattern = 'mosura';
  assert.throws(() => validateBreedingState(bad), /外观与固定亲代/);
  assert.throws(() => applyBreedingAction(renamed, {type:'rename', id:child.id, name:'虾'.repeat(17)}, HATCH), /名字/);
  const firstParent = applyBreedingAction(namedFormed, {type:'rename', id:'mother', name:'新的名字'}, FORM);
  assert.deepEqual(firstParent.batches[0].children, namedFormed.batches[0].children);
});

test('formed mother moves with reservations and unborn children, preserving the original historical tank', () => {
  const formed = tick(plan(initial(), 4), FORM);
  const moved = applyBreedingAction(formed, {type:'move', id:'mother', tankId:'main'}, FORM);
  assert.equal(moved.batches[0].tankId, 'breeding');
  assert.equal(batchTankId(moved.batches[0]), 'main');
  assert.equal(publicBreedingState(moved).batches[0].currentTankId, 'main');
  assert.deepEqual(moved.batches[0].relocations, [{at:FORM, from:'breeding', to:'main'}]);
  assert.ok(moved.batches[0].children.every(child => child.tank === 'main'));
  const hatch = tick(validateBreedingState(JSON.parse(JSON.stringify(moved))), HATCH);
  assert.equal(hatch.individuals.filter(record => record.tank === 'main').length, 5);
  const recovering = applyBreedingAction(hatch, {type:'move', id:'mother', tankId:'breeding'}, HATCH);
  assert.equal(recovering.individuals.filter(record => record.tank === 'main').length, 4, 'born children stay in their own tank');
  assert.ok(recovering.batches[0].children.every(child => child.tank === 'main'));
  assert.deepEqual(validateBreedingState(JSON.parse(JSON.stringify(tick(recovering, GROWTH)))), tick(recovering, GROWTH));
});

test('mother transfer checks all reserved places and rejects an occupied brood slot without mutation', () => {
  const crowded = initial(Array.from({length:18}, (_, i) => shrimp(`main-${i}`, 'male', 'main')));
  const formed = tick(plan(crowded), FORM), before = JSON.stringify(formed);
  assert.throws(() => applyBreedingAction(formed, {type:'move', id:'mother', tankId:'main'}, FORM), /空间不足/);
  assert.equal(JSON.stringify(formed), before);
  let state = initial([shrimp('mother-2', 'female', 'main')]);
  state = tick(plan(state, 2), FORM);
  state = applyBreedingAction(state, {type:'move', id:'mother', tankId:'main'}, FORM);
  state = applyBreedingAction(state, {type:'plan', motherId:'mother-2', fatherId:'father', tankId:'breeding', size:2}, FORM);
  const snapshot = JSON.stringify(state);
  assert.throws(() => applyBreedingAction(state, {type:'move', id:'mother', tankId:'breeding'}, FORM), /已有未孵化批次/);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(tick(state, GROWTH + FORM).individuals.length, 7, 'a new batch may use a genuinely vacated historical slot');
});

test('corrupt relocation histories reject and same-time round trips retain distinct tank intervals', () => {
  let moved = applyBreedingAction(tick(plan(initial(), 2), FORM), {type:'move', id:'mother', tankId:'main'}, FORM);
  moved = applyBreedingAction(moved, {type:'move', id:'mother', tankId:'breeding'}, FORM);
  assert.equal(batchTankId(moved.batches[0]), 'breeding');
  assert.equal(tick(moved, GROWTH).individuals.length, 4);
  for (const damage of [
    s => { s.batches[0].relocations[0].at = FORM - 1; },
    s => { s.batches[0].relocations[0].from = 'main'; },
    s => { s.batches[0].relocations[0].to = 'missing'; },
    s => { s.batches[0].relocations[0].at = FORM + 0.5; },
    s => { s.batches[0].relocations = null; },
  ]) {
    const bad = structuredClone(moved); damage(bad);
    assert.throws(() => validateBreedingState(bad));
  }
});

test('natural action arranges exactly one main-tank brood using stable existing order', () => {
  const state = createBreedingState([shrimp('first-mother','female','main',{protected:true}),shrimp('first-father','male','main'),shrimp('later-mother','female','main'),shrimp('later-father','male','main')],{now:0,seed:7});
  const snapshot=JSON.stringify(state);
  assert.deepEqual(naturalPair(state),{motherId:'first-mother',fatherId:'first-father'});
  assert.equal(JSON.stringify(state),snapshot);
  for (const size of [2,4]) {
    const pending=applyBreedingAction(state,{type:'natural',size,motherId:'later-mother',fatherId:'later-father',tankId:'breeding'},0);
    const batch=pending.batches[0];
    assert.equal(batch.source,'natural'); assert.equal(batch.tankId,'main');
    assert.deepEqual([batch.motherId,batch.fatherId],['first-mother','first-father']);
    assert.equal(pending.rngState,state.rngState);
    assert.throws(()=>applyBreedingAction(pending,{type:'natural',size},FORM),/已有未孵化批次/);
    assert.throws(()=>applyBreedingAction(pending,{type:'move',id:'first-mother',tankId:'breeding'},0),/活动亲虾/);
    const matured=tick(validateBreedingState(JSON.parse(JSON.stringify(pending))),7*86400000);
    const previewSource=JSON.stringify(pending);
    assert.deepEqual(naturalPair(pending,7*86400000),naturalPair(matured));
    assert.equal(JSON.stringify(pending),previewSource,'preview does not generate children or consume RNG');
    assert.equal(matured.individuals.length,4+size);assert.equal(matured.batches.length,1);
    assert.equal(tick(matured,14*86400000).batches.length,1,'no automatic renewal');
  }
  assert.throws(()=>applyBreedingAction(state,{type:'plan',motherId:'first-mother',fatherId:'first-father',tankId:'main',size:2},0),/繁育缸/);
});

test('natural capacity failures are atomic, cancellation releases room, and formed mothers retain relocation safety', () => {
  const rows=[shrimp('mother','female','main'),shrimp('father','male','main'),...Array.from({length:17},(_,i)=>shrimp(`other-${i}`,'female','main'))];
  const crowded=createBreedingState(rows,{now:0,seed:7}),before=JSON.stringify(crowded);
  assert.throws(()=>applyBreedingAction(crowded,{type:'natural',size:2},0),/空间不足/);
  assert.equal(JSON.stringify(crowded),before);
  const state=createBreedingState(rows.slice(0,2),{now:0,seed:7});
  const pending=applyBreedingAction(state,{type:'natural',size:2},0);
  const cancelled=applyBreedingAction(pending,{type:'cancel',batchId:pending.batches[0].id},1);
  assert.equal(tick(cancelled,GROWTH).individuals.length,2);
  const moved=applyBreedingAction(pending,{type:'move',id:'mother',tankId:'breeding'},FORM);
  assert.equal(moved.batches[0].tankId,'main');assert.equal(batchTankId(moved.batches[0]),'breeding');
  assert.equal(tick(moved,GROWTH).individuals.filter(r=>r.tank==='breeding').length,3);
  const missing=createBreedingState([shrimp('only','female','main')],{now:0,seed:7});
  assert.throws(()=>applyBreedingAction(missing,{type:'natural',size:2},0),/主缸需要一对/);
});
