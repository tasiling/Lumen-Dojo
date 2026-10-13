import { BridgeError, originalTimestamp, timestamp, uuid } from "./model";
import { validDate } from "../learningRecords/model";
export const VOCAB_CONTRACT = "vocabforge-practice-results/v1";
export const VOCAB_ORIGIN = "https://vocabforge-production-2baf.up.railway.app";
export type VocabResult = {
  eventVersion:1;eventType:"practice.completed";sourceSystem:"vocabforge";sourceType:"review-round";
  sourceId:string;sourceEventId:string;sourceRevision:string;updatedAt:string;occurredAt:string;practicedOn:string;timeZone:string;
  dateSemantics:"source-local-completion";completionStatus:"completed";sourceAvailability:"available";
  completionKind:"vocabforge-standard-five-word-round"|"vocabforge-short-review-round"|"vocabforge-other-review";
  originalContext:null;currentContext:null;quantity:1;unit:"輪"|"次";metrics:{standardRounds:0|1;actualWordCount:number;understandingTasks:number;spellingTasks:number};summary:string;sourceLocation:string;
};
export function validateVocab(input:unknown,origin:string):VocabResult {
  if(!input || typeof input !== "object")throw new BridgeError("SOURCE_INVALID",422);
  const r=input as Record<string,unknown>, m=r.metrics as Record<string,unknown>;
  if(r.eventVersion!==1 || r.eventType!=="practice.completed" || r.sourceSystem!=="vocabforge" || r.sourceType!=="review-round" || !uuid(r.sourceId) || r.sourceEventId!==r.sourceId || r.sourceRevision!=="1")throw new BridgeError("SOURCE_IDENTITY_INVALID",422);
  if(r.completionStatus!=="completed" || r.sourceAvailability!=="available" || r.quantity!==1 || !["vocabforge-standard-five-word-round","vocabforge-short-review-round","vocabforge-other-review"].includes(String(r.completionKind)))throw new BridgeError("SOURCE_COMPLETION_UNVERIFIED",422);
  const standard=r.completionKind==="vocabforge-standard-five-word-round", short=r.completionKind==="vocabforge-short-review-round";
  if(!m || typeof m!=="object" || [m.actualWordCount,m.understandingTasks,m.spellingTasks].some(n=>typeof n!=="number" || !Number.isInteger(n) || n<0 || n>10000) || m.standardRounds!==(standard?1:0) || r.unit!==(standard?"輪":"次") || (standard && (m.actualWordCount!==5 || Number(m.spellingTasks)!==5 || Number(m.understandingTasks)<15)) || (short && (Number(m.actualWordCount)<1 || Number(m.actualWordCount)>4 || m.spellingTasks!==m.actualWordCount || Number(m.understandingTasks)<3*Number(m.actualWordCount))))throw new BridgeError("SOURCE_METRIC_INVALID",422);
  if(!validDate(r.practicedOn) || r.dateSemantics!=="source-local-completion" || typeof r.timeZone!=="string")throw new BridgeError("SOURCE_DATE_INVALID",422);
  try{new Intl.DateTimeFormat("en-US",{timeZone:r.timeZone});}catch{throw new BridgeError("SOURCE_DATE_INVALID",422);}
  const occurredAt=originalTimestamp(r.occurredAt);
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:r.timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(occurredAt));
  const date=(name:string)=>parts.find(p=>p.type===name)?.value;
  if(`${date("year")}-${date("month")}-${date("day")}`!==r.practicedOn)throw new BridgeError("SOURCE_DATE_INVALID",422);
  if(r.sourceLocation!=="/" || typeof r.summary!=="string" || !r.summary.trim() || r.summary.length>500)throw new BridgeError("SOURCE_LOCATION_OR_SUMMARY_INVALID",422);
  return {eventVersion:1,eventType:"practice.completed",sourceSystem:"vocabforge",sourceType:"review-round",sourceId:r.sourceId,sourceEventId:r.sourceId,sourceRevision:"1",updatedAt:timestamp(r.updatedAt),occurredAt,practicedOn:r.practicedOn,timeZone:r.timeZone,dateSemantics:"source-local-completion",completionStatus:"completed",sourceAvailability:"available",completionKind:r.completionKind as VocabResult["completionKind"],originalContext:null,currentContext:null,quantity:1,unit:standard?"輪":"次",metrics:{standardRounds:standard?1:0,actualWordCount:Number(m.actualWordCount),understandingTasks:Number(m.understandingTasks),spellingTasks:Number(m.spellingTasks)},summary:r.summary,sourceLocation:new URL("/",origin).toString()};
}
