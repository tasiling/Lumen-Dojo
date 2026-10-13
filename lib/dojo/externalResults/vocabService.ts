import {BridgeError,EPOCH,compareTime,type Checkpoint} from "./model";
import {sourceIdentity} from "../practiceEvents/service";
import type {CompletionEvent,ProjectionState} from "../practiceEvents/model";
import type {VocabAdapter} from "./vocabAdapter";
import type {VocabResult} from "./vocabModel";
export type VocabReceipt={schema:"external-vocab-source-receipt/v1";id:string;owner:string;source:VocabResult;eventId:string|null;learningRecordId:string|null;acceptance:"accepted"|"needs_review";receivedAt:string;lastVerifiedAt:string;projections:{record:ProjectionState;lightStep:ProjectionState;weekly:"unlinked";ack:"not_applicable"}};
export type VocabRepository={owner:string;read(id:string):Promise<VocabReceipt|null>;save(row:VocabReceipt):Promise<void>;checkpoint():Promise<Checkpoint|null>;saveCheckpoint(row:Checkpoint):Promise<void>;acceptSource(source:VocabResult):Promise<{event:CompletionEvent;created:boolean}>;retrySource(id:string):Promise<CompletionEvent>};
export const vocabIdentity=(owner:string,id:string)=>sourceIdentity(owner,"vocabforge","review-round",id);
export function vocabService(repo:VocabRepository,adapter:VocabAdapter,clock=()=>new Date().toISOString()) {
 function owned(row:VocabReceipt){if(row.owner!==repo.owner || row.id!==vocabIdentity(repo.owner,row.source.sourceId) || row.schema!=="external-vocab-source-receipt/v1")throw new BridgeError("OWNER_MISMATCH",403);return row;}
 async function accept(source:VocabResult,previous:VocabReceipt|null){
  if(previous){owned(previous);if(JSON.stringify(previous.source)!==JSON.stringify(source))throw new BridgeError("SOURCE_IMMUTABLE_FACT_CONFLICT",409);}
  const accepted=await repo.acceptSource(source), now=clock();
  let row:VocabReceipt=previous??{schema:"external-vocab-source-receipt/v1",id:vocabIdentity(repo.owner,source.sourceId),owner:repo.owner,source,eventId:accepted.event.id,learningRecordId:accepted.event.learningRecordId,acceptance:"needs_review",receivedAt:now,lastVerifiedAt:now,projections:{record:accepted.event.projections.record,lightStep:accepted.event.projections.output,weekly:"unlinked",ack:"not_applicable"}};
  if(!previous)await repo.save(row);
  const event=await repo.retrySource(accepted.event.id);
  row={...row,eventId:event.id,learningRecordId:event.learningRecordId,acceptance:event.projections.record==="applied"?"accepted":"needs_review",projections:{record:event.projections.record,lightStep:event.projections.output,weekly:"unlinked",ack:"not_applicable"}};
  if(JSON.stringify(row)!==JSON.stringify(previous))await repo.save(row);
  if(event.projectionStatus==="pending" || event.projectionStatus==="needs_retry")throw new BridgeError("SOURCE_PROJECTION_PENDING",503);
  return {receipt:row,created:accepted.created};
 }
 return {async sync(full:boolean){
  if(!adapter.configured)throw new BridgeError("SOURCE_NOT_CONNECTED",503);
  const prior=await repo.checkpoint(),now=clock();if(prior && prior.owner!==repo.owner)throw new BridgeError("OWNER_MISMATCH",403);
  let checkpoint:Checkpoint=prior??{schema:"external-source-checkpoint/v1",owner:repo.owner,after:EPOCH,cursor:null,windowUpper:null,reconciling:true,lastSuccessAt:null,lastReconciledAt:null,connection:"ready",errorCode:null};
  if(!checkpoint.cursor && (full || !checkpoint.lastReconciledAt || Date.parse(now)-Date.parse(checkpoint.lastReconciledAt)>=7*86400000)){checkpoint={...checkpoint,after:EPOCH,windowUpper:null,reconciling:true};await repo.saveCheckpoint(checkpoint);}
  const page=await adapter.page(checkpoint.after,checkpoint.cursor,checkpoint.windowUpper).catch(async(e)=>{await repo.saveCheckpoint({...checkpoint,connection:"temporarily_unavailable",errorCode:e instanceof BridgeError?e.code:"SOURCE_TEMPORARILY_UNAVAILABLE"});throw e;});
  if(checkpoint.windowUpper && compareTime(checkpoint.windowUpper,page.windowUpper)!==0)throw new BridgeError("SOURCE_WINDOW_CHANGED",409);
  const hash=(r:VocabResult)=>sourceIdentity(repo.owner,"vocabforge","source-page-snapshot",JSON.stringify(r));
  const current=new Set(page.results.map(hash)),done=new Set((checkpoint.pageReceipts??[]).filter(h=>current.has(h)));let counted=0,saved=0;const started=Date.now();
  for(const source of page.results){const snapshot=hash(source);if(done.has(snapshot)){saved++;continue;}if(Date.now()-started>40000)throw new BridgeError("SYNC_PAUSED_REPLAY_PAGE",503);
   const accepted=await accept(source,await repo.read(vocabIdentity(repo.owner,source.sourceId)));if(accepted.created)counted++;
   done.add(snapshot);checkpoint={...checkpoint,pageReceipts:[...done],connection:"ready",errorCode:null};await repo.saveCheckpoint(checkpoint);saved++;
  }
  checkpoint={...checkpoint,cursor:page.nextCursor,pageReceipts:[],windowUpper:page.nextCursor?page.windowUpper:null,after:page.nextCursor?checkpoint.after:page.windowUpper,lastSuccessAt:now,lastReconciledAt:!page.nextCursor && checkpoint.reconciling?now:checkpoint.lastReconciledAt,reconciling:page.nextCursor?checkpoint.reconciling:false,connection:"ready",errorCode:null};await repo.saveCheckpoint(checkpoint);
  return {saved,counted,remaining:!!checkpoint.cursor,checkpoint,contractStatus:"active"};
 },async retry(id:string){const row=await repo.read(id);if(!row)throw new BridgeError("SOURCE_RECEIPT_MISSING",404);owned(row);const result=await accept(row.source,row);return {receipt:result.receipt,outcome:"applied"};}};
}
