import {createBreedingState,validateBreedingState,applyBreedingAction,TRANSFER_PRICE} from './crystal-breeding.js';
import {createContest,validateContest,emptyContestRecordbook,validateContestRecordbook,settleContest,evaluateContest,rookieCard,contestStanding,exhibitionCard,nextExhibition,validateExhibitions} from './crystal-contests.js';
import {scoreShrimp} from './crystal-genetics.js';

// Two finite, optional development candidates; not a mapping of the old mixed/fine model.
const COMMISSIONS=[
 {id:'C1',title:'红色覆盖观察',colour:'red',minCoverage:6,price:10},
 {id:'C2',title:'日之丸覆盖观察',pattern:'hinomaru',minCoverage:7,price:10},
];
export function commissionCatalogue(){return COMMISSIONS.map(card=>({...card,developerCandidate:true}));}
export const commissionAppearance=(record,card)=>(!card.colour||record.colour===card.colour)&&(!card.pattern||record.pattern===card.pattern);
export const meetsCommission=(record,card)=>!record.legacy&&record.P[1]>=card.minCoverage&&commissionAppearance(record,card);
export function commissionFitsGoal(card,goal){
 if(!card || !goal)return false;
 const [colour,pattern]=goal.split(':');
 return commissionAppearance({colour,pattern},card);
}

function validateCommissions(state){
 // Additive compatibility for domain saves from before this optional feature existed.
 if(state.commissions===undefined)state.commissions={version:1,deliveries:[]};
 const book=state.commissions;
 if(!book||book.version!==1||!Array.isArray(book.deliveries)||book.deliveries.length>COMMISSIONS.length)throw new Error('委托收据版本或数量无效');
 const done=new Set(),individuals=new Set();
 for(const receipt of book.deliveries){
  const card=COMMISSIONS.find(item=>item.id===receipt?.commissionId),record=state.individuals.find(item=>item.id===receipt?.individualId);
  if(!card||!record||done.has(card.id)||individuals.has(record.id))throw new Error('委托收据身份缺失或重复');
  if(!Number.isSafeInteger(receipt.deliveredAt)||receipt.deliveredAt<0||receipt.deliveredAt>state.now||receipt.price!==card.price)throw new Error('委托收据时间或金额无效');
  if(record.commissionId!==card.id||record.soldAt!==receipt.deliveredAt||record.tank!==null||record.adultAt>receipt.deliveredAt||record.protected||!meetsCommission(record,card))throw new Error('委托收据与个体档案不一致');
  done.add(card.id);individuals.add(record.id);
 }
 for(const record of state.individuals)if(record.commissionId!==undefined&&!individuals.has(record.id))throw new Error('委托个体缺少交付收据');
 for(const batch of state.batches){
  if(batch.commissionGoal===undefined)continue;
  const card=COMMISSIONS.find(item=>item.id===batch.commissionGoal);
  if(batch.source!=='directed'||!commissionFitsGoal(card,batch.goal))throw Error('本窝求购目标与选育花色不符');
  if(book.deliveries.some(r=>r.commissionId===card.id && r.deliveredAt<batch.plannedAt))throw Error('本窝安排前这张求购已经完成');
 }
}

// The arrival preview and the one-time adoption share these seven founder cards.
export function starterIndividuals(now,growthMs=2700000,residents=[]){
 const cards=[
  ['I1','小枫','female',[6,5,8],'red','band'],
  ['I2','墨点','male',[5,7,5],'black','band'],
  ['I3','赤石','male',[8,6,6],'red','hinomaru'],
  ['I4','雪团','female',[5,8,5],'red','mosura'],
  ['I5','乌梅','female',[6,6,6],'black','hinomaru'],
  ['I6','芽芽','female',[6,6,6],'red','band'],
  ['I7','小墨','male',[6,6,6],'black','mosura'],
 ];
 const used=new Set(residents.map(r=>r.id));
 return cards.map(([id,name,sex,P,colour,pattern],index)=>{
  const favorite=id==='I1';
  while(used.has(id))id='starter-'+id;
  used.add(id);
  return {id,name,sex,P:[...P],B:[...P],colour,pattern,traitGroup:'crystal-game-v1',tank:'main',adultAt:now+(index<5?0:growthMs),protected:favorite,source:'development-founder',parents:null,soldAt:null};
 });
}
export function createNewCrystalProgress({now,seed,growthMs=2700000,stageMs}={}){
 const individuals=starterIndividuals(now,growthMs);
 const clock=stageMs??(growthMs===2700000?{form:120000,hatch:600000}:growthMs===5400000?{form:120000,hatch:900000}:undefined);
 return createCrystalProgress(individuals,{now,seed,growthMs,stageMs:clock});
}

export function createCrystalProgress(individuals,options){
 const state=createBreedingState(individuals,options);
 state.contests={cards:['colour','pattern'].flatMap(theme=>['entry','advanced'].map((tier,i)=>createContest({id:`${theme}-${tier}`,theme,tier,seed:(options.seed+(theme==='pattern'?2:0)+i)>>>0}))),records:emptyContestRecordbook()};
 state.commissions={version:1,deliveries:[]};
 return validateCrystalProgress(state);
}

export function validateCrystalProgress(value){
 const state=validateBreedingState(value),contests=state.contests;
 if(!contests||!Array.isArray(contests.cards)||contests.cards.length!==4)throw new Error('比赛卡存档无效');
 const ids=new Set();
 contests.cards=contests.cards.map(card=>{
  const checked=validateContest(card);
  if(checked.id!==`${checked.theme}-${checked.tier}`||ids.has(checked.id))throw new Error('比赛卡身份重复或不一致');
  ids.add(checked.id);return checked;
 });
 contests.records=validateContestRecordbook(contests.records,state.individuals,state.now);
 validateExhibitions(state);
 for(const batch of state.batches){
  const entry=batch.rookieEntry;if(!entry)continue;
  const card=rookieCard(state,batch), placing=contestStanding(card,batch.children.find(k=>k.id===entry.entrantId));
  if(entry.contestId!==batch.id || entry.seed!==card.seed || entry.theme!==card.theme || placing.score!==entry.score ||
     placing.rank!==entry.rank || placing.rating!==entry.rating)throw Error('新秀赛成绩与本窝对手或参赛虾不一致');
 }
 const bestRecords=Object.values(contests.records.bestByContest);
 for(const record of bestRecords){
  const card=contests.cards.find(c=>c.id===record.contestId);
  if(!card||card.seed!==record.seed||card.theme!==record.theme||card.tier!==record.tier)throw new Error('比赛历史与赛卡不一致');
 }
 for(const individual of state.individuals){
  let starts=individual.contestDebuts;
  if(starts!==undefined && (!starts || typeof starts!=='object' || Array.isArray(starts)))throw new Error('个体参赛记录格式无效');
  // Older saves only have evidence for the holder of each card record.
  for(const best of bestRecords){
   if(best.entrantId!==individual.id)continue;
   if(starts===undefined)starts=individual.contestDebuts={};
   if(!Object.hasOwn(starts,best.contestId))starts[best.contestId]=best.enteredAt;
   if(starts[best.contestId]!==best.enteredAt)throw new Error('首次参赛时间与本卡最佳不一致');
  }
  for(const [id,at] of Object.entries(starts??{})){
   const best=Object.hasOwn(contests.records.bestByContest,id) && contests.records.bestByContest[id];
   if(!best || individual.legacy || !Number.isSafeInteger(at) || at<individual.adultAt || at>state.now || (individual.soldAt!==null && at>individual.soldAt))throw new Error('个体参赛记录与赛卡或生涯时间不一致');
   if(scoreShrimp(individual.P,best.theme)>best.score)throw new Error('个体赛绩超过本卡最佳');
  }
 }
 validateCommissions(state);
 return state;
}

// The caller must persist this complete result before publishing any live changes.
export function applyCrystalAction(value,action,now){
 const before=validateCrystalProgress(value);
 if(!Number.isSafeInteger(now)||now<0)throw new Error('现实时间无效');
 if(!action||typeof action.type!=='string')throw new Error('养成操作无效');
 // A system-clock correction cannot un-hatch offspring or make a second reward.
 now=Math.max(now,before.now);
 const hatches=[];
 let state=applyBreedingAction(before,['contest','rookieContest','exhibition','commission','stock'].includes(action.type)?{type:'advance'}:action,now,hatches);
 let result=null;
 if(action.type==='plan'||action.type==='natural'){
  const batch=state.batches.at(-1);
  if(action.commissionGoal!==undefined){
   if(state.commissions.deliveries.some(r=>r.commissionId===action.commissionGoal))throw Error('这张求购已经完成');
   batch.commissionGoal=action.commissionGoal;
  }
  result={batchId:batch.id};
 }else if(action.type==='contest'){
  const card=state.contests.cards.find(c=>c.id===action.contestId),individual=state.individuals.find(c=>c.id===action.id);
  if(!card||!individual)throw new Error('请选择有效的比赛和参赛虾');
  if(individual.legacy)throw new Error('原有虾没有水晶虾评级资料，可以继续观赏；请选择水晶虾参赛');
  const settled=settleContest(state.contests.records,card,individual,now);
  (individual.contestDebuts??={})[card.id]??=now;
  state.contests.records=settled.recordbook;state.cash+=settled.reward;result={...settled.result,reward:settled.reward};
 }else if(action.type==='rookieContest'){
  const batch=state.batches.find(b=>b.id===action.batchId);
  if(batch?.status!=='complete'||!batch.children.some(kid=>kid.id===action.id))throw Error('请选择本窝已经成年的后代参加新秀赛');
  if(batch.rookieEntry)throw Error('这窝已经参加过新秀赛');
  const individual=state.individuals.find(r=>r.id===action.id);
  const card=rookieCard(state,batch);
  result=evaluateContest(card,individual,now);
  batch.rookieEntry={...result,seed:card.seed,theme:card.theme};
 }else if(action.type==='exhibition'){
  const invitation=nextExhibition(state), individual=state.individuals.find(r=>r.id===action.id);
  if(action.round!==invitation.round)throw new Error('这届专题赛的邀请已经变动，请重新查看');
  if(state.starterPending || now<invitation.opensAt)throw new Error('本届专题赛尚未开放');
  if(!individual || individual.legacy)throw new Error('请选择一只在缸的成年水晶虾');
  result=evaluateContest(exhibitionCard(state,invitation.round,action.contestId),individual,now);
  (state.contests.exhibitions??=[]).push(result);
 }else if(action.type==='stock'){
  if(!state.starterPending)throw new Error('第一批水晶虾已经入缸');
  const founders=starterIndividuals(now,state.growthMs,state.individuals);
  state.individuals.push(...founders);
  state.starterPending=false;
  result={kind:'stock',individualIds:founders.map(r=>r.id)};
 }else if(action.type==='commission'){
  const card=COMMISSIONS.find(item=>item.id===action.commissionId),record=state.individuals.find(item=>item.id===action.id);
  if(!card||!record)throw new Error('请选择有效委托和交付个体');
  if(state.commissions.deliveries.some(receipt=>receipt.commissionId===card.id))throw new Error('这张委托已经完成');
  if(!meetsCommission(record,card))throw new Error('该个体不符合委托颜色、纹样或覆盖要求');
  // Reuse all sale protection/parent/age checks, then replace (not stack) its payout.
  state=applyBreedingAction(state,{type:'sell',id:record.id},now,hatches);
  state.cash+=card.price-TRANSFER_PRICE;
  state.individuals.find(item=>item.id===record.id).commissionId=card.id;
  state.commissions.deliveries.push({commissionId:card.id,individualId:record.id,deliveredAt:now,price:card.price});
  result={kind:'commission',commissionId:card.id,individualId:record.id,price:card.price};
 }
 return {state:validateCrystalProgress(state),result,hatches};
}
