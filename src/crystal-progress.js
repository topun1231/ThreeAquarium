import {createBreedingState,validateBreedingState,applyBreedingAction} from './crystal-breeding.js';
import {createContest,validateContest,emptyContestRecordbook,validateContestRecordbook,settleContest} from './crystal-contests.js';

// Two finite, optional development candidates; not a mapping of the old mixed/fine model.
const COMMISSIONS=[
 {id:'C1',title:'红色覆盖观察',colour:'red',minCoverage:6,price:10},
 {id:'C2',title:'日之丸覆盖观察',pattern:'hinomaru',minCoverage:7,price:10},
];
export function commissionCatalogue(){return COMMISSIONS.map(card=>({...card,developerCandidate:true}));}
const meetsCommission=(record,card)=>!record.legacy&&record.P[1]>=card.minCoverage&&(!card.colour||record.colour===card.colour)&&(!card.pattern||record.pattern===card.pattern);

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
}

// A new-game fixture only. Never use this to add genes or ancestors to legacy saves.
// Qualities follow the I1-I7 paper cards; B=P and appearance branches are developer candidates.
export function createNewCrystalProgress({now,seed,growthMs=2700000,stageMs}={}){
 const cards=[
  ['I1','小枫','female',[6,5,8],'red','band'],
  ['I2','墨点','male',[5,7,5],'black','band'],
  ['I3','赤石','male',[8,6,6],'red','hinomaru'],
  ['I4','雪团','female',[5,8,5],'red','mosura'],
  ['I5','乌梅','female',[6,6,6],'black','hinomaru'],
  ['I6','芽芽','female',[6,6,6],'red','band'],
  ['I7','小墨','male',[6,6,6],'black','mosura'],
 ];
 const individuals=cards.map(([id,name,sex,P,colour,pattern],index)=>({id,name,sex,P:[...P],B:[...P],colour,pattern,traitGroup:'crystal-game-v1',tank:'main',adultAt:now+(index<5?0:growthMs),protected:id==='I1',source:'development-founder',parents:null,soldAt:null}));
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
 for(const record of Object.values(contests.records.bestByContest)){
  const card=contests.cards.find(c=>c.id===record.contestId);
  if(!card||card.seed!==record.seed||card.theme!==record.theme||card.tier!==record.tier)throw new Error('比赛历史与赛卡不一致');
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
 let state=applyBreedingAction(before,['contest','commission','stock'].includes(action.type)?{type:'advance'}:action,now);
 let result=null;
 if(action.type==='contest'){
  const card=state.contests.cards.find(c=>c.id===action.contestId),individual=state.individuals.find(c=>c.id===action.id);
  if(!card||!individual)throw new Error('请选择有效的比赛和参赛虾');
  if(individual.legacy)throw new Error('原有虾没有水晶虾评级资料，可以继续观赏；请选择水晶虾参赛');
  const settled=settleContest(state.contests.records,card,individual,now);
  state.contests.records=settled.recordbook;state.cash+=settled.reward;result={...settled.result,reward:settled.reward};
 }else if(action.type==='stock'){
  if(!state.starterPending)throw new Error('第一批水晶虾已经入缸');
  const founders=createNewCrystalProgress({now,seed:state.rngState,growthMs:state.growthMs,stageMs:state.stageMs}).individuals;
  const used=new Set(state.individuals.map(r=>r.id));
  for(const r of founders){while(used.has(r.id))r.id='starter-'+r.id;used.add(r.id);state.individuals.push(r);}
  state.starterPending=false;
 }else if(action.type==='commission'){
  const card=COMMISSIONS.find(item=>item.id===action.commissionId),record=state.individuals.find(item=>item.id===action.id);
  if(!card||!record)throw new Error('请选择有效委托和交付个体');
  if(state.commissions.deliveries.some(receipt=>receipt.commissionId===card.id))throw new Error('这张委托已经完成');
  if(!meetsCommission(record,card))throw new Error('该个体不符合委托颜色、纹样或覆盖要求');
  // Reuse all sale protection/parent/age checks, then replace (not stack) its payout.
  state=applyBreedingAction(state,{type:'sell',id:record.id},now);
  state.cash+=card.price-8;
  state.individuals.find(item=>item.id===record.id).commissionId=card.id;
  state.commissions.deliveries.push({commissionId:card.id,individualId:record.id,deliveredAt:now,price:card.price});
  result={kind:'commission',commissionId:card.id,individualId:record.id,price:card.price};
 }
 return {state:validateCrystalProgress(state),result};
}
