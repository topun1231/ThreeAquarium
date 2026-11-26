import {canRehouse, REST_LIMIT, tankOccupancy} from './crystal-breeding.js';
import {createResidentGallery} from './crystal-resident-gallery.js';

export function createBroodSpacePicker({getState, contextFor, isFilled, namesFor, tankName, portrait, options, onAction, announce}) {
  const dialog=document.createElement('dialog');
  dialog.id='crystal-space-picker';
  dialog.className='crystal-space-dialog';
  dialog.setAttribute('aria-labelledby','crystal-space-title');
  dialog.innerHTML='<header><h2 id="crystal-space-title">为这一窝腾位置</h2><button type="button" data-close>返回这一窝</button></header>'+
    '<p data-need></p><label>安置到哪里<select id="crystal-space-destination"></select></label>'+
    '<p data-hint></p><div class="crystal-space-cards" role="group" aria-label="自己挑要安置的虾"></div>'+
    '<footer><div data-summary><p data-picked></p><p data-preview aria-live="polite"></p></div><p data-status role="status"></p><button type="button" id="crystal-space-move">安置所选虾</button></footer>';
  document.body.append(dialog);
  const find=selector=>dialog.querySelector(selector);
  const close=find('[data-close]'), need=find('[data-need]'), destination=find('select'), hint=find('[data-hint]');
  const gallery=find('.crystal-space-cards'), picked=find('[data-picked]'), preview=find('[data-preview]'), status=find('[data-status]'), submit=find('#crystal-space-move');
  const selected=new Map();
  const {rows, render:renderCards, clear:clearCards}=createResidentGallery(gallery,{namesFor,tankName,portrait});
  let mode, binding, source, resume, focusAfter, working=false, previousState, previousList, available=0;

  function write(element,value){if(element.textContent!==value)element.textContent=value;}

  function roomChoices(state,context) {
    const places=[];
    if(!context.globalShort)for(const tank of state.tanks){
      if(tank.id===context.tank || !isFilled(tank.id))continue;
      const {animals,reserved}=tankOccupancy(state,tank.id);
      const free=tank.capacity-animals-reserved;
      if(free>0)places.push({value:tank.id,free,label:tankName(tank.id)+' · 余 '+free+' 位'});
    }
    const rest=REST_LIMIT-state.individuals.filter(r=>r.tank==='rest').length;
    if(rest>0)places.push({value:'rest',free:rest,label:'静养处 · 余 '+rest+' 位 · 可免费接回'});
    return places;
  }
  function remaining(local,global,tank) {
    const needs=[];
    if(local>0)needs.push(tankName(tank)+'还缺 '+local+' 位');
    if(global>0)needs.push('全缸合计还缺 '+global+' 位');
    return needs.length?needs.join('，'):'这窝的空位就够了';
  }
  function syncSelection(context) {
    const count=selected.size;
    for(const [id,row] of rows){
      row.box.checked=selected.has(id);
      row.box.disabled=working || (!row.box.checked && count>=available);
    }
    const local=[...selected.values()].filter(from=>from===context.tank).length;
    const global=destination.value==='rest'?count:0;
    write(picked,[...selected.keys()].map(id=>rows.get(id)?.label).filter(Boolean).join('、'));
    write(preview,count?'已选 '+count+' 只。安置后，'+remaining(context.roomShort-local,context.globalShort-global,context.tank)+'。':'');
    write(submit,count?'送这 '+count+' 只去'+tankName(destination.value):'安置所选虾');
    submit.disabled=working || !count || count>available;
    destination.disabled=close.disabled=working;
  }
  function sync() {
    if(!dialog.open || working)return;
    const context=contextFor(mode);
    if(!context || context.key!==binding){dismiss(!context);return;}
    const state=getState(), places=roomChoices(state,context);
    const oldDestination=destination.value;
    options(destination,places.map(({value,label})=>({value,label})),'选择去向');
    const to=destination.value;
    available=places.find(p=>p.value===to)?.free || 0;
    write(need,'这一窝需要 '+context.size+' 个幼虾位。'+remaining(context.roomShort,context.globalShort,context.tank)+'。');
    const listKey=JSON.stringify([to,context.roomShort,context.globalShort,available]);
    if(state!==previousState || listKey!==previousList){
      const candidates=to?state.individuals.filter(r=>r.id!==context.mother && r.id!==context.father &&
        (context.globalShort>0 || r.tank===context.tank) && canRehouse(state,r,to)):[];
      if(selected.size && (oldDestination!==to || selected.size>available || [...selected].some(([id,from])=>!candidates.some(r=>r.id===id && r.tank===from)))){
        selected.clear(); write(status,'缸位或个体已有变化，请重新挑选。');
      }
      if(context.globalShort && context.roomShort)candidates.sort((a,b)=>Number(b.tank===context.tank)-Number(a.tank===context.tank));
      renderCards(candidates,state);
      previousState=state; previousList=listKey;
      write(hint,!places.length?(context.globalShort?'静养处已满，移缸也无法增加总名额。可以留着这窝计划，以后再回来。':'其他已注水的缸和静养处都已满。可以先留着这窝计划。'):
        !to?'':!candidates.length?(to==='rest'?'这里暂时没有能静养的空闲成虾。':'这里暂时没有可以移过去的虾。'):
        to==='rest'?'点选想暂时安置的成虾，有空位时可以按名字接回。':'点选要一起移缸的虾。');
      gallery.hidden=!candidates.length;
    }
    syncSelection(context);
  }
  function dismiss(done=false) {
    if(!dialog.open || working)return;
    focusAfter=done?resume:source; dialog.close();
  }
  dialog.addEventListener('close',()=>{
    clearCards();selected.clear(); previousState=previousList=null;
    if(focusAfter?.isConnected && !focusAfter.disabled && focusAfter.getClientRects().length)focusAfter.focus({preventScroll:true});
    mode=binding=source=resume=focusAfter=null;
  });
  dialog.addEventListener('cancel',e=>{if(working)e.preventDefault();});
  dialog.addEventListener('keydown',e=>e.stopPropagation());
  close.onclick=()=>dismiss();
  destination.onchange=()=>{selected.clear();write(status,'');gallery.scrollTop=0;sync();};
  gallery.onchange=e=>{
    const row=rows.get(e.target.value);
    if(working || !row || row.box!==e.target)return;
    if(row.box.checked)selected.set(row.record.id,row.record.tank);else selected.delete(row.record.id);
    write(status,''); sync();
  };
  submit.onclick=async()=>{
    sync();
    if(!dialog.open || working || submit.disabled)return;
    const context=contextFor(mode),tankId=destination.value;
    const residents=[...selected].map(([id,from])=>({id,from}));
    const message='已将 '+residents.length+' 只虾送到'+tankName(tankId)+'。';
    let moved=false;
    working=true; syncSelection(context); write(status,'正在安置…');
    try{
      await onAction({type:'rehouse',tankId,residents,motherId:context.mother,fatherId:context.father,natural:mode==='natural'});
      selected.clear(); moved=true; write(status,message); announce(message);
    }catch(error){write(status,error.message || '安置未完成，请重试。');}
    finally{
      working=false;destination.disabled=close.disabled=false;sync();
      if(dialog.open){
        const next=moved?(gallery.querySelector('input:enabled') || destination):submit;
        next.focus({preventScroll:true});
      }
    }
  };
  return {
    sync,
    open(which,trigger,confirm){
      const context=contextFor(which);
      if(!context || dialog.open)return;
      mode=which; binding=context.key; source=focusAfter=trigger; resume=confirm;
      destination.selectedIndex=0;write(status,'');dialog.showModal();sync();destination.focus();
    },
    reset(){if(dialog.open){focusAfter=null;dialog.close();}},
    dispose(){clearCards();dialog.remove();}
  };
}
