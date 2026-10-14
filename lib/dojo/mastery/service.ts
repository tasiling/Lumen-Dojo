import {createHash} from 'node:crypto';
import {LearningError,uuidPattern} from '../learningFoundation/model';
import {ranks,type MasteryRank,type MasteryEvent,type MasteryCard,type MasteryHistory,type MasteryRepository} from './model';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function stable(owner:string,type:string,key:string){const h=hash([owner,type,key]);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
export const cardIdentity=(owner:string,capabilityId:string)=>stable(owner,'mastery-card',capabilityId);
function id(value:unknown){if(typeof value!=='string'||!uuidPattern.test(value))throw new LearningError('學成卡 ID 不正確');return value.toLowerCase();}
function rank(value:unknown):MasteryRank{if(!ranks.includes(value as MasteryRank))throw new LearningError('舊階級未對應五階，請以新的正確規準驗收',409);return value as MasteryRank;}
function project(events:MasteryEvent[]):MasteryCard{
 const sorted=[...events].sort((a,b)=>a.revision-b.revision),first=sorted[0];
 if(!first||first.kind!=='grant')throw new LearningError('學成卡缺少原始取得紀錄',409);
 const original=first.attempt,scope=original.definitionSnapshot.scope;let highest=original,latest=original,status:MasteryCard['status']='active',itemIds=[scope.learningItemId];const attempts=new Set<string>();
 for(const [index,e]of sorted.entries()){
  if(e.revision!==index+1||e.owner!==first.owner||e.cardId!==first.cardId||e.capabilityId!==first.capabilityId)throw new LearningError('學成卡歷史版本或身分不完整',409);
  if(e.kind==='grant'){
   const a=e.attempt;if(attempts.has(a.id)||a.owner!==first.owner||a.capabilityId!==first.capabilityId||hash(a.definitionSnapshot.scope)!==hash(scope))throw new LearningError('學成卡來源或能力範圍不符',409);attempts.add(a.id);
   if(ranks.indexOf(rank(a.definitionSnapshot.achievedRank))>ranks.indexOf(rank(highest.definitionSnapshot.achievedRank))||(a.definitionSnapshot.achievedRank===highest.definitionSnapshot.achievedRank&&a.definitionVersion>=highest.definitionVersion))highest=a;
   if(a.definitionVersion>=latest.definitionVersion)latest=a;
  }else if(e.kind==='associate')itemIds=e.itemIds;else status=e.kind==='withdraw'?'withdrawn':'active';
 }
 const grants=sorted.filter(e=>e.kind==='grant');
 const rankAchievedAt=grants.filter(e=>e.attempt.definitionSnapshot.achievedRank===highest.definitionSnapshot.achievedRank).map(e=>e.attempt.confirmedAt!).sort()[0];
 return {recordType:'mastery-card/v1',id:first.cardId,owner:first.owner,capabilityId:first.capabilityId,name:latest.definitionSnapshot.name,scope,rank:rank(highest.definitionSnapshot.achievedRank),rankDefinitionVersion:highest.definitionVersion,cefrReference:scope.languageDimension==='none'?null:highest.definitionSnapshot.cefr??null,personalGoal:highest.definitionSnapshot.objective,itemIds,acquiredAt:first.attempt.confirmedAt!,rankAchievedAt,lastConfirmedAt:grants.map(e=>e.attempt.confirmedAt!).sort().at(-1)!,revision:sorted.length,status,evaluatorType:highest.evaluation!.evaluator.type,professionalQualification:false};
}
export function masteryService(repo:MasteryRepository){
 async function all(){const events=await repo.events();if(events.some(e=>e.owner!==repo.owner||e.recordType!=='mastery-event/v1'||e.cardId!==cardIdentity(repo.owner,e.capabilityId))||new Set(events.map(e=>e.id)).size!==events.length)throw new LearningError('學成卡 owner 或事件身分不符',403);return events;}
 async function cardEvents(cardId:string){const events=(await all()).filter(e=>e.cardId===id(cardId));if(!events.length)throw new LearningError('學成卡不存在',404);return events;}
 async function get(cardId:string){return project(await cardEvents(cardId));}
 return {
  get,
  async list(){const events=await all();return [...new Set(events.map(e=>e.cardId))].sort().map(cardId=>project(events.filter(e=>e.cardId===cardId)));},
  async history(cardId:string):Promise<MasteryHistory[]>{const events=await cardEvents(cardId);project(events);return events.sort((a,b)=>b.revision-a.revision).map(e=>({id:e.id,kind:e.kind,revision:e.revision,createdAt:e.createdAt,...(e.kind==='grant'?{rank:rank(e.attempt.definitionSnapshot.achievedRank),attemptId:e.attempt.id,definitionVersion:e.attempt.definitionVersion,name:e.attempt.definitionSnapshot.name,confirmedAt:e.attempt.confirmedAt!}:e.kind==='associate'?{itemIds:e.itemIds}:{reason:e.reason})}));},
  async detail(eventId:string){const e=await repo.event(id(eventId));if(!e||e.owner!==repo.owner||e.recordType!=='mastery-event/v1'||e.cardId!==cardIdentity(repo.owner,e.capabilityId))throw new LearningError('學成歷程不存在或 owner 無權存取',403);return e;},
  collect(attemptId:string){return repo.exclusive(async()=>{
   const aid=id(attemptId),eventId=stable(repo.owner,'mastery-grant',aid),old=await repo.event(eventId);
   if(old){if(old.owner!==repo.owner||old.kind!=='grant'||old.attempt.id!==aid)throw new LearningError('學成來源身分衝突',409);return get(old.cardId);}
   const a=await repo.confirmedAttempt(aid);
   if(!a||a.owner!==repo.owner||a.definitionSnapshot?.owner!==repo.owner)throw new LearningError('驗收來源不存在或 owner 不符',403);
   if(a.id!==aid||a.status!=='assessed'||a.verdict!=='meets'||!a.confirmedAt||!a.confirmationMethod||!a.evaluation)throw new LearningError('需有效已確認達標結果才能取得學成卡',409);
   rank(a.definitionSnapshot.achievedRank);
   const cardId=cardIdentity(repo.owner,a.capabilityId),events=(await all()).filter(e=>e.cardId===cardId),current=events.length?project(events):null;
   if(current?.status==='withdrawn')throw new LearningError('學成卡已撤回，請先明確恢復並留下原因',409);
   if(current&&hash(current.scope)!==hash(a.definitionSnapshot.scope))throw new LearningError('同能力範圍不符，不能合併',409);
   const event:MasteryEvent={recordType:'mastery-event/v1',id:eventId,cardId,capabilityId:a.capabilityId,owner:repo.owner,revision:(current?.revision??0)+1,requestFingerprint:hash([aid,a.revision]),createdAt:new Date().toISOString(),kind:'grant',attempt:a};
   const serialized=JSON.stringify(event);if(serialized.length>190000||Buffer.byteLength(serialized,'utf8')>350000)throw new LearningError('學成證據快照超過保存上限',413);
   await repo.append(event);return project([...events,event]);
  });},
  change(raw:Record<string,unknown>){const requestId=id(raw.requestId),cardId=id(raw.id);return repo.exclusive(async()=>{
   const eventId=stable(repo.owner,'mastery-action',requestId),fingerprint=hash([cardId,raw.revision,raw.kind,raw.reason??null,raw.itemIds??null]),old=await repo.event(eventId);
   if(old){if(old.owner!==repo.owner||old.requestFingerprint!==fingerprint)throw new LearningError('操作請求 ID 不可重用',409);return get(old.cardId);}
   const events=await cardEvents(cardId),card=project(events);if(card.revision!==raw.revision)throw new LearningError('學成卡版本已變更，未覆寫',409);
   const base={recordType:'mastery-event/v1' as const,id:eventId,cardId,capabilityId:card.capabilityId,owner:repo.owner,revision:card.revision+1,requestFingerprint:fingerprint,createdAt:new Date().toISOString()};let event:MasteryEvent;
   if(raw.kind==='associate'){
    if(!Array.isArray(raw.itemIds)||raw.itemIds.length>20)throw new LearningError('關聯學科數量不正確');const itemIds=raw.itemIds.map(id);
    if(new Set(itemIds).size!==itemIds.length||!itemIds.includes(card.scope.learningItemId))throw new LearningError('需保留原始學科且不能重複關聯');
    const graph=await repo.graph();if(itemIds.some(value=>!graph.some(e=>e.id===value&&e.owner===repo.owner&&e.kind==='item'&&(e.status!=='archived'||card.itemIds.includes(value)))))throw new LearningError('關聯學科不存在、封存或無權存取',403);
    event={...base,kind:'associate',itemIds};
   }else if(raw.kind==='withdraw'||raw.kind==='reinstate'){
    if(typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>2000)throw new LearningError('需填寫撤回或恢復原因');
    if((raw.kind==='withdraw')===(card.status==='withdrawn'))throw new LearningError('學成卡狀態已變更',409);event={...base,kind:raw.kind,reason:raw.reason};
   }else throw new LearningError('未知學成卡操作');
   await repo.append(event);return project([...events,event]);
  });},
 };
}
