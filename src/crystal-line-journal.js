import {childrenByParent, familyRoutes} from './crystal-line-books.js';
import {appearance} from './crystal-traits.js';
import {hasSiblingPhoto} from './crystal-sibling-view.js';
import {lineContestHistory} from './crystal-contests.js';

export function createLineJournal({getState, indexOf, tankName, portrait, pairPhotos, broodPhotoButton, save, visit, chooseFounder,
  canCompete, contestTitle, formatResult, visitContest}) {
  const shelf = document.createElement('details');
  shelf.id = 'crystal-line-journal'; shelf.className = 'crystal-records crystal-line-journal';
  shelf.innerHTML = `<summary>我的选育手记</summary>
    <div data-empty><p>从一只喜欢的虾开始，记下自己想继续看的后代。</p><button type="button" data-start>去虾册挑一只</button></div>
    <label data-books class="crystal-field"><span>翻开手记</span><select aria-label="翻开手记"></select></label>
    <div data-editor hidden>
      <label class="crystal-field"><span data-founder></span><input aria-label="手记名字" maxlength="32" autocomplete="off" placeholder="给这一支起个名字"></label>
      <div class="crystal-row"><button type="button" data-save>保存名字</button><button type="button" data-cancel>取消</button><button type="button" data-new>另挑一只开新手记</button><button type="button" data-discard>删除手记</button></div>
      <div data-confirm hidden><p></p><div class="crystal-row"><button type="button" data-delete>确认删除手记</button><button type="button" data-keep>留下手记</button></div></div>
    </div>
    <section data-book hidden>
      <header><h3></h3><button type="button" data-rename>编辑手记</button></header>
      <div class="crystal-row" role="group" aria-label="翻看哪些虾"><button type="button" data-kept>我记下的</button><button type="button" data-all>挑后代</button></div>
      <p data-empty-page class="crystal-muted"></p><div class="crystal-entrant-grid" aria-label="家系个体"></div>
      <div class="crystal-entrant-pages" hidden><button type="button" data-prev>上一页</button><span></span><button type="button" data-next>下一页</button></div>
      <div data-entry hidden><p data-route></p><p class="crystal-keeper-note" data-note></p>
        <div class="crystal-row" data-actions><button type="button" data-mark></button><button type="button" data-visit></button></div>
        <div class="crystal-row" data-photo-actions></div>
      </div>
      <button type="button" data-shows-toggle aria-expanded="false" aria-controls="crystal-line-shows">这一支的参赛记录</button>
      <section id="crystal-line-shows" hidden>
        <label class="crystal-field" data-show-field><span>回看哪场</span><select data-show-card></select></label>
        <p class="crystal-muted" data-no-shows>手记里的虾还没有参赛记录。</p>
        <ul data-show-entries aria-label="这本手记里的本场成绩"></ul>
        <button type="button" data-show-visit hidden></button>
      </section>
    </section>`;
  const el = selector => shelf.querySelector(selector);
  const picker=el('[data-books] select'), editor=el('[data-editor]'), input=editor.querySelector('input');
  const grid=el('.crystal-entrant-grid'), pages=el('.crystal-entrant-pages'), entry=el('[data-entry]');
  const mark=el('[data-mark]'), locate=el('[data-visit]'), confirm=el('[data-confirm]');
  const showToggle=el('[data-shows-toggle]'), shows=el('#crystal-line-shows'), showCard=el('[data-show-card]');
  const showRows=el('[data-show-entries]'), showVisit=el('[data-show-visit]');
  let founderId=null, selectedId=null, mode='kept', page=0, draft=null, lastState=null;
  let indexedState=null, children, indexedFounder=null, routes, removing=null;
  let showBook=null, showId='', historyState=null, history=null;
  const getBook=state=>state?.lineBooks?.find(b=>b.founderId===founderId);
  const perPage=4;
  function enabled(control,value) {
    control.dataset.unavailable=String(!value); control.disabled=!value;
  }
  function redraw() { lastState=null; refresh(getState()); }
  function bookRoutes(state) {
    if(indexedState!==state){
      indexedState=state; children=childrenByParent(state.individuals); indexedFounder=null;
    }
    if(indexedFounder!==founderId){ indexedFounder=founderId; routes=familyRoutes(children,founderId); }
    return routes;
  }
  function formButtons(){
    const title=input.value.trim();
    enabled(el('[data-save]'),!!title && title!==draft?.previous && !removing);
    el('[data-discard]').hidden=!draft?.previous || !!removing;
    el('[data-new]').hidden=!draft?.previous || !!removing;
    confirm.hidden=!removing;
  }
  function edit(state){
    const book=getBook(state);
    draft={id:founderId,previous:book?.title ?? null};removing=null;
    input.value=book?.title || '';redraw();input.focus();
  }
  function showRecords(bookId,cardId){
    showBook=bookId; showId=cardId ?? '';
    shows.hidden=bookId===null;
    showToggle.setAttribute('aria-expanded',String(!shows.hidden));
    historyState=null;
  }
  function openAt(id,member=id,view='kept',returnShow){
    founderId=id;selectedId=member;mode=view;draft=null;removing=null;page=0;
    showRecords(returnShow===undefined?null:id,returnShow);
    shelf.open=true;
    const state=getState();
    if(!getBook(state)){edit(state);return;}
    const ids=view==='all'?[...bookRoutes(state).keys()].slice(1):[id,...getBook(state).members];
    page=Math.max(0,Math.floor(ids.indexOf(member)/perPage));
    redraw();
    if(returnShow!==undefined)(showVisit.hidden?showToggle:showVisit).focus();
    else (grid.querySelector('[aria-pressed="true"]') || el('[data-kept]')).focus();
  }
  function reset(){
    shelf.open=false;
    founderId=selectedId=null;
    draft=removing=null;
    indexedState=indexedFounder=lastState=null;
    routes=children=null;
    showRecords(null);history=null;
    showRows.replaceChildren();showCard.replaceChildren();showVisit.onclick=null;
    delete showRows.dataset.items;delete showCard.dataset.items;
    page=0;mode='kept';input.value='';
    grid.replaceChildren();picker.replaceChildren();
    delete grid.dataset.members;
    delete picker.dataset.items;
    for(const part of [el('[data-books]'),editor,el('[data-book]'),entry,compare,compareBroods])part.hidden=true;
    for(const label of [el('h3'),el('[data-route]'),el('[data-note]')])label.textContent='';
    el('[data-empty]').hidden=false;
  }
  const compare=pairPhotos.trigger('crystal-line-compare','和起点并排看','这支虾的近照',state=>{
    if(!state || !shelf.open || shelf.closest('[hidden]') || !getBook(state) || selectedId===founderId || !bookRoutes(state).has(selectedId))return null;
    const {byId,names}=indexOf(state), first=byId.get(founderId), chosen=byId.get(selectedId);
    if(!hasSiblingPhoto(first)||!hasSiblingPhoto(chosen))return null;
    return {owner:JSON.stringify([founderId,selectedId]),photos:[
      {record:first,at:state.now,label:'起点 · '+names.get(first.id)},
      {record:chosen,at:state.now,label:'后代 · '+names.get(chosen.id)}
    ]};
  });
  const compareBroods=broodPhotoButton('crystal-line-brood-photos',()=>selectedId);
  el('[data-photo-actions]').append(compare,compareBroods);

  function refreshShows(state,book,chosen,names){
    if(shows.hidden)return;
    if(historyState!==state){
      history=lineContestHistory(state,book);
      historyState=state;
    }
    const choices=history.map(show=>[show.id,contestTitle(show)]);
    const optionsKey=JSON.stringify(choices);
    if(showCard.dataset.items!==optionsKey){
      showCard.replaceChildren(...choices.map(([id,label])=>new Option(label,id)));
      showCard.dataset.items=optionsKey;
    }
    const current=history.find(show=>show.id===showId) ?? history[0];
    showId=current?.id ?? '';
    showCard.value=showId;
    el('[data-show-field]').hidden=!current;el('[data-no-shows]').hidden=!!current;
    const rows=(current?.entries ?? []).map(result=>[result.entrantId,names.get(result.entrantId),formatResult(result)]);
    const rowsKey=JSON.stringify(rows);
    if(showRows.dataset.items!==rowsKey){
      showRows.replaceChildren(...rows.map(([id,name,score])=>{
        const row=document.createElement('li'), pick=document.createElement('button'), mark=document.createElement('span');
        pick.type='button';pick.dataset.showMember=id;pick.append(name+' ');mark.textContent=score;pick.append(mark);
        pick.onclick=()=>{
          const ids=[founderId,...(getBook(getState())?.members ?? [])];
          if(!ids.includes(id))return;
          selectedId=id;mode='kept';page=Math.floor(ids.indexOf(id)/perPage);redraw();
        };
        row.append(pick);return row;
      }));
      showRows.dataset.items=rowsKey;
    }
    for(const pick of showRows.querySelectorAll('button'))pick.setAttribute('aria-pressed',String(pick.dataset.showMember===selectedId));
    const kept=chosen && (chosen.id===founderId || book.members.includes(chosen.id));
    const judged=kept && current?.entries.some(result=>result.entrantId===chosen.id);
    // Closed rookie and exhibition cards can also display their archived entrant.
    showVisit.hidden=!kept || !(canCompete(chosen,state.now) || (judged && !current.card));
    showVisit.onclick=null;
    if(showVisit.hidden)return;
    const name=names.get(chosen.id);
    showVisit.textContent=judged?'回看「'+name+'」这场比赛':current?.card?'带「'+name+'」去这场报名':'带「'+name+'」去挑赛场';
    const destination=judged || current?.card ? current.id : state.contests.cards[0].id;
    showVisit.onclick=()=>visitContest(chosen.id,destination,{founderId,member:chosen.id,mode,showId});
  }
  function refresh(state){
    if(!state || !shelf.open || shelf.closest('[hidden]') || lastState===state)return;
    lastState=state;
    const books=state.lineBooks || [], {byId,names}=indexOf(state);
    if(draft && !byId.has(draft.id)){draft=null;removing=null;}
    if(!getBook(state) && !draft){founderId=books[0]?.founderId ?? null;selectedId=founderId;page=0;mode='kept';}
    const book=getBook(state);
    if(showBook!==null && showBook!==book?.founderId)showRecords(null);
    el('[data-empty]').hidden=!!(book || draft);
    el('[data-books]').hidden=books.length<2 || !!draft;
    const choices=JSON.stringify(books.map(b=>[b.founderId,b.title,names.get(b.founderId)]));
    if(picker.dataset.items!==choices){
      picker.replaceChildren(...books.map(b=>new Option(b.title+' · '+names.get(b.founderId),b.founderId)));picker.dataset.items=choices;
    }
    picker.value=founderId || '';
    editor.hidden=!draft;el('[data-book]').hidden=!book || !!draft;
    if(draft){
      el('[data-founder]').textContent='从「'+names.get(draft.id)+'」开始 · 手记名字';formButtons();return;
    }
    if(!book)return;
    el('h3').textContent=book.title;
    el('[data-kept]').setAttribute('aria-pressed',String(mode==='kept'));
    el('[data-all]').setAttribute('aria-pressed',String(mode==='all'));
    const previous=bookRoutes(state), ids=mode==='kept'?[founderId,...book.members]:[...previous.keys()].slice(1);
    if(selectedId!==null && !ids.includes(selectedId)){selectedId=mode==='kept'?founderId:null;page=0;}
    page=Math.max(0,Math.min(page,Math.ceil(ids.length/perPage)-1));
    const visible=ids.slice(page*perPage,(page+1)*perPage);
    const gridSignature=JSON.stringify([founderId,mode,visible]);
    if(grid.dataset.members!==gridSignature){
      grid.dataset.members=gridSignature;
      grid.replaceChildren(...visible.map(id=>{
        const card=document.createElement('button');
        card.type='button';card.dataset.lineMember=id;
        card.innerHTML='<span class="crystal-entrant-photo"><img alt="" class="crystal-portrait"><small></small></span><span class="crystal-entrant-caption"><strong></strong><small></small></span>';
        card.onclick=()=>{selectedId=id;redraw();};return card;
      }));
    }
    for(const card of grid.children){
      const id=card.dataset.lineMember,record=byId.get(id);
      card.setAttribute('aria-pressed',String(id===selectedId));
      card.querySelector('strong').textContent=names.get(id);card.title=appearance(record) || names.get(id);
      card.querySelector('.crystal-entrant-caption small').textContent=[id===founderId?'起点':book.members.includes(id)?'已记下':'',tankName(record.tank)].filter(Boolean).join(' · ');
      portrait(card.querySelector('img'),record,state.now,card.querySelector('.crystal-entrant-photo small'));
    }
    pages.hidden=ids.length<=perPage;
    pages.querySelector('span').textContent=(page+1)+' / '+Math.max(1,Math.ceil(ids.length/perPage));
    enabled(el('[data-prev]'),page>0);enabled(el('[data-next]'),(page+1)*perPage<ids.length);
    const empty=el('[data-empty-page]');empty.hidden=!!ids.length;
    if(!ids.length)empty.textContent='这只虾还没有已孵化的后代。';
    const chosen=byId.get(selectedId);
    refreshShows(state,book,chosen,names);
    entry.hidden=!chosen;
    if(!chosen)return;
    const path=[];
    for(let id=chosen.id;id!=null;id=previous.get(id))path.push(names.get(id));
    el('[data-route]').textContent=path.length===1?'起点 · '+path[0]:'家系 · '+path.reverse().join(' → ');
    const note=el('[data-note]');note.hidden=!chosen.observation;note.textContent=chosen.observation || '';
    const root=chosen.id===founderId, kept=book.members.includes(chosen.id);
    mark.hidden=root;mark.textContent=kept?'从手记移出':'记进这本手记';
    locate.textContent=chosen.soldAt!==null?'查看已售档案':chosen.tank==='rest'?'查看静养档案':'去'+tankName(chosen.tank)+'看它';
    compare.hidden=root || !hasSiblingPhoto(chosen) || !hasSiblingPhoto(byId.get(founderId));
    compareBroods.hidden=!hasSiblingPhoto(chosen);
  }
  picker.onchange=()=>openAt(picker.value);
  showToggle.onclick=()=>{showRecords(shows.hidden?founderId:null,showId);redraw();};
  showCard.onchange=()=>{showId=showCard.value;redraw();};
  shelf.ontoggle=()=>{if(shelf.open)redraw();};
  el('[data-start]').onclick=chooseFounder;
  el('[data-new]').onclick=()=>{draft=removing=null;redraw();chooseFounder();};
  el('[data-rename]').onclick=()=>edit(getState());
  input.oninput=formButtons;
  input.onkeydown=event=>{
    if(event.key==='Enter' && !event.isComposing && event.keyCode!==229){event.preventDefault();el('[data-save]').click();}
  };
  editor.onkeydown=event=>{
    if(event.key==='Escape' && !event.isComposing && event.keyCode!==229){
      event.preventDefault();event.stopPropagation();el(removing?'[data-keep]':'[data-cancel]').click();
    }
  };
  el('[data-save]').onclick=async()=>{
    const current=draft;
    if(!current)return;
    if(await save({type:'nameLineBook',founderId:current.id,title:input.value.trim(),previousTitle:current.previous},'选育手记已保存。') && draft===current)
      openAt(current.id,selectedId || current.id,mode);
  };
  el('[data-cancel]').onclick=()=>{
    const book=getBook(getState());draft=removing=null;redraw();
    if(book)el('[data-rename]').focus();
    else if(!el('[data-empty]').hidden)el('[data-start]').focus();
    else shelf.querySelector('summary').focus();
  };
  el('[data-discard]').onclick=()=>{
    const book=getBook(getState());if(!book)return;
    removing={type:'discardLineBook',founderId,previousTitle:book.title,previousMembers:[...book.members]};
    confirm.querySelector('p').textContent='删除《'+book.title+'》的手记？这本里记了 '+book.members.length+' 只后代，所有虾仍可在档案中找到。';
    formButtons();el('[data-keep]').focus();
  };
  el('[data-keep]').onclick=()=>{removing=null;formButtons();el('[data-discard]').focus();};
  el('[data-delete]').onclick=async()=>{
    const request=removing;
    if(request && await save(request,'已删除这本手记。') && removing===request){
      draft=removing=null;founderId=selectedId=null;redraw();shelf.querySelector('summary').focus();
    }
  };
  for(const [key,tab] of [['kept',el('[data-kept]')],['all',el('[data-all]')]])tab.onclick=()=>{
    if(mode===key)return;mode=key;selectedId=mode==='kept'?founderId:null;page=0;redraw();
  };
  for(const [step,button] of [[-1,el('[data-prev]')],[1,el('[data-next]')]])button.onclick=()=>{
    page+=step;selectedId=null;redraw();grid.firstElementChild?.focus();
  };
  mark.onclick=async()=>{
    const id=selectedId,book=getBook(getState());
    if(!book || !id || id===founderId)return;
    const marked=!book.members.includes(id);
    if(await save({type:'markLineMember',founderId,id,marked},marked?'已记下这只虾。':'已从这本手记移出。') && !marked && mode==='kept')
      (grid.querySelector('[aria-pressed="true"]') || el('[data-kept]')).focus();
  };
  locate.onclick=()=>{if(selectedId)visit(selectedId,locate);};
  return {shelf,refresh,openAt,reset,origin:source=>source===locate?{founderId,member:selectedId,mode,showId:shows.hidden?undefined:showId}:null};
}
