import 'server-only';
import {createKnowledgeEntry,updateKnowledgeEntry} from '@/lib/notion/mutations';
import {listJsonRecords} from '../notionStore';
import {sourcePolicies} from '../creativeSources/store';
import {resolvePolicySource} from '../creativeSources/resolver';
import {parseSourceRef,sourceKey,type SourceRef} from '../creativeSources/model';
import {LearningError} from '../learningFoundation/model';
import {createShuttleDraft,createWorkDraft} from '../weavingShuttle';
import {WEAVING_SHUTTLE_TITLE_PREFIX,WEAVING_WORK_TITLE_PREFIX} from '../formal';
import {createTextWorkflow} from '../weavingWorkflow/templates';
import {createStep,updateStep,readShuttle,operationId,expectRevision,WEAVING_OWNER,type Body} from '../weavingWorkflow/store';
import {runWeavingOperation,operationDigest,type OperationStep,type OperationReceipt} from '../weavingWorkflow/operations';
import {PROPOSAL_PREFIX,SETTINGS_PREFIX,buildCandidate,parseProposalPatch,parseSettings,defaults,fingerprint,type Proposal,type Settings} from './model';
const owner=WEAVING_OWNER;
export const backgroundReady=()=>process.env.CREATIVE_PROPOSAL_WORKER==='1'&&Boolean(process.env.LEARNING_WRITE_LOCK_DIR);
async function settingsRow(){
 const rows=await listJsonRecords(SETTINGS_PREFIX);if(rows.length>1)throw new LearningError('找題設定重複，請先核對',409);
 if(!rows.length)return null;const v=rows[0].value as Settings&{schema:number;owner:string};
 if(v?.schema!==1||v.owner!==owner||!Number.isSafeInteger(v.revision)||v.revision<1)throw new LearningError('找題設定損毀',409);
 parseSettings({audience:v.audience,sourceTypes:v.sourceTypes,automaticEnabled:v.automaticEnabled,cadenceHours:v.cadenceHours});
 if(v.lastScanAt!==null&&!Number.isFinite(Date.parse(v.lastScanAt))||v.afterKey!==null&&typeof v.afterKey!=='string')throw new LearningError('找題進度無法核對',409);
 return {...rows[0],value:{...v,id:'proposal-settings'}};
}
async function settings(){return (await settingsRow())?.value??defaults();}
async function proposals():Promise<Proposal[]>{return (await listJsonRecords(PROPOSAL_PREFIX)).map(row=>{
 const p=row.value as Proposal;
 if(p?.schema!==1||p.owner!==owner||!Number.isSafeInteger(p.revision)||p.revision<1||!['pending','skipped','accepted'].includes(p.status)||typeof p.source?.text!=='string'||typeof p.source.digest!=='string')throw new LearningError('提案資料損毀，請先核對',409);
 parseSourceRef(p.source.ref);parseProposalPatch({title:p.title,angle:p.angle,format:p.format,trial:p.trial});return {...p,id:row.id};
});}
async function read(id:unknown){if(typeof id!=='string')throw new LearningError('提案識別不正確');const p=(await proposals()).find(p=>p.id===id);if(!p)throw new LearningError('找不到提案',404);return p;}
export async function snapshot(){return {proposals:(await proposals()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),settings:await settings(),backgroundReady:backgroundReady()};}
function settingsStep(make:(s:Settings)=>Promise<Settings>|Settings):OperationStep{
 return {key:'settings',async findConfirmed(r){const row=await settingsRow();const mark=(row?.value as unknown as {_proposalSettingsOperation?:string})?._proposalSettingsOperation;return mark===r.operationId?{id:row!.id}:null;},async execute(r){
   const old=await settingsRow(),next=await make(old?.value??defaults());const value={...next,schema:1,owner,revision:(old?.value.revision??0)+1,_proposalSettingsOperation:r.operationId};
   if(old){await updateKnowledgeEntry(old.id,{內容:JSON.stringify(value)});return{id:old.id};}
   const created=await createKnowledgeEntry({標題:SETTINGS_PREFIX+'owner',內容:JSON.stringify(value)},{retryCreate:false});return{id:created.id};
 }};
}
export async function saveSettings(body:Body){const op=operationId(body),patch=parseSettings(body.settings);await runWeavingOperation(owner,op,'patch',body,[settingsStep(s=>{expectRevision(s,body.expectedRevision);return {...s,...patch};})]);return settings();}
export async function patchProposal(body:Body){
 const op=operationId(body);if(body.skip!==undefined&&body.skip!==true)throw new LearningError('略過操作不正確');
 const patch=body.skip===true?null:parseProposalPatch(body.patch);const p=await read(body.id);
 await runWeavingOperation(owner,op,'patch',body,[updateStep(p.id,PROPOSAL_PREFIX,'proposal',row=>{
  const old=row.內容?JSON.parse(row.內容) as Proposal:null;if(!old||old.owner!==owner)throw new LearningError('提案歸屬不符',403);expectRevision(old,body.expectedRevision);
  if(old.status!=='pending')throw new LearningError('這份提案已處理，請重新讀取',409);
  return {...old,...patch,status:body.skip?'skipped':'pending',revision:old.revision+1,updatedAt:new Date().toISOString()};
 })]);return read(p.id);
}
async function allowedSource(ref:SourceRef){const policy=await sourcePolicies.read(ref);if(policy?.discovery!=='allow')return null;return resolvePolicySource(ref);}
type ScanPlan={schema:1;refs:SourceRef[];audience:string;at:string;afterKey:string|null};
function scanPlan(value:unknown):ScanPlan{
 const p=value as ScanPlan;
 if(!p||p.schema!==1||!Array.isArray(p.refs)||p.refs.length>10||typeof p.audience!=='string'||typeof p.at!=='string'||!Number.isFinite(Date.parse(p.at)))throw new LearningError('找題操作缺少可核對的原批次，請核對原操作',409);
 const refs=p.refs.map(parseSourceRef),keys=refs.map(sourceKey);
 if(new Set(keys).size!==keys.length||p.afterKey!==(keys.at(-1)??null))throw new LearningError('找題原批次游標不符',409);
 return{...p,refs};
}
export async function scan(body:Body,now=new Date()){
 const op=operationId(body),s=await settings();const policies=(await sourcePolicies.list()).filter(p=>p.discovery==='allow'&&s.sourceTypes.includes(p.ref.sourceType)).sort((a,b)=>sourceKey(a.ref).localeCompare(sourceKey(b.ref)));
 const start=s.afterKey?policies.findIndex(p=>sourceKey(p.ref)>s.afterKey!):0;const batch=policies.slice(start<0?0:start,(start<0?0:start)+10);
 const plan:ScanPlan={schema:1,refs:batch.map(p=>p.ref),audience:s.audience,at:now.toISOString(),afterKey:batch.length?sourceKey(batch.at(-1)!.ref):null};
 const receipt=await runWeavingOperation(owner,op,'proposal_scan',body,r=>{
 const saved=scanPlan(r.context);
 const steps:OperationStep[]=saved.refs.map(ref=>{
  const key='candidate-'+operationDigest(sourceKey(ref));let candidate:Omit<Proposal,'id'>|null=null;
  const writing=createStep(PROPOSAL_PREFIX,key,()=>{if(!candidate)throw new LearningError('來源尚未核對',409);return candidate;});
  return {key,async findConfirmed(r){
   const confirmed=await writing.findConfirmed(r);if(confirmed)return confirmed;
   const source=await allowedSource(ref);if(!source||!source.text.trim())return{id:'unavailable'};
   candidate=buildCandidate(source,saved.audience,saved.at,owner);
   const old=(await proposals()).filter(p=>sourceKey(p.source.ref)===sourceKey(ref)&&p.source.digest===candidate!.source.digest);
   if(old.length>1)throw new LearningError('來源有重複提案，請先核對',409);
   return old.length?{id:old[0].id}:null;
  },execute:writing.execute};
 });
 if(saved.refs.length)steps.push(settingsStep(current=>({...current,lastScanAt:current.lastScanAt&&current.lastScanAt>saved.at?current.lastScanAt:saved.at,afterKey:saved.afterKey})));
 return steps;
 },plan);
 const created=(await listJsonRecords(PROPOSAL_PREFIX)).filter(row=>(row.value as {_weavingMutation?:{operationId:string;owner:string}})?._weavingMutation?.operationId===op).length;
 return{created,skipped:scanPlan(receipt.context).refs.length===0};
}
export async function runDue(now=new Date()){
 const s=await settings();if(!s.automaticEnabled||!s.cadenceHours||s.lastScanAt&&now.getTime()-Date.parse(s.lastScanAt)<s.cadenceHours*3600000)return{skipped:true};
 const slot=Math.floor(now.getTime()/(s.cadenceHours*3600000));return scan({operationId:`proposal-due-${s.revision}-${slot}`},now);
}
async function acceptedRecord(prefix:string,p:Proposal){const rows=(await listJsonRecords(prefix)).filter(row=>(row.value as {_creativeProposalId?:string})?._creativeProposalId===p.id);if(rows.length>1)throw new LearningError('這份提案已有重複作品，請先核對',409);if(rows.length&&(rows[0].value as {_proposalRevision?:number})._proposalRevision!==p.revision)throw new LearningError('這份提案已有部分開工，請先核對原操作與作品；不另建副本',409);return rows[0]??null;}
export async function acceptProposal(body:Body){
 const op=operationId(body),p=await read(body.id);
 if(p.status==='accepted'&&p.acceptedWorkId&&p.acceptedShuttleId)return{workId:p.acceptedWorkId,shuttleId:p.acceptedShuttleId};
 expectRevision(p,body.expectedRevision);if(p.status!=='pending')throw new LearningError('提案已略過，無法採用',409);
 const verify=async()=>{const current=await read(p.id);expectRevision(current,body.expectedRevision);if(current.status!=='pending')throw new LearningError('提案已處理，請重新讀取',409);const source=await allowedSource(p.source.ref);if(!source)throw new LearningError('來源取材許可已撤回或來源不可用',403);if(fingerprint(source)!==p.source.digest)throw new LearningError('來源已更新，請重新整理候選，舊提案仍保留',409);};
 const marked=(value:object)=>({...value,_creativeProposalId:p.id,_proposalRevision:p.revision});
 const selection={sourceType:p.source.ref.sourceType,sourceId:p.source.ref.sourceId,sourceVersion:'proposal-source:'+p.source.digest,locator:p.source.label,contentKind:p.source.contentKind,selectedText:p.source.text,capturedAt:p.createdAt,digest:operationDigest(p.source)};
 function unique(key:string,prefix:string,value:(r:OperationReceipt)=>Promise<unknown>){const step=createStep(prefix,key,value);return {...step,async findConfirmed(r:OperationReceipt){await verify();const row=await acceptedRecord(prefix,p);return row?{id:row.id}:step.findConfirmed(r);}};}
 const r=await runWeavingOperation(owner,op,'proposal_accept',body,[
  unique('shuttle',WEAVING_SHUTTLE_TITLE_PREFIX,async()=>marked({...createShuttleDraft({title:p.title,coreStatement:p.angle,sourceType:'selected_sources',sourceId:p.source.ref.sourceId,sourceRefs:[p.source.ref],sourceSnapshot:p.source.text}),sourceSelections:[selection],revision:1})),
  unique('work',WEAVING_WORK_TITLE_PREFIX,async receipt=>{const shuttle=await readShuttle(receipt.result.shuttle.id);return marked({...createWorkDraft({shuttleId:shuttle.id,title:p.title,coreVersionId:shuttle.currentCoreVersionId,format:'text'}),status:'drafting',revision:1,draftText:p.trial,nextAction:'修改提案試寫，確認自己的觀點',textWorkflow:{...createTextWorkflow('article'),currentStep:'concept',sourceSelections:[selection],blocks:[{id:'proposal-trial',role:'提案試寫（待修改）',text:p.trial,mediaNote:''}]}});}),
  updateStep(p.id,PROPOSAL_PREFIX,'proposal',async(row,receipt)=>{await verify();const old=JSON.parse(row.內容) as Proposal;expectRevision(old,body.expectedRevision);return {...old,status:'accepted',revision:old.revision+1,acceptedWorkId:receipt.result.work.id,acceptedShuttleId:receipt.result.shuttle.id,updatedAt:new Date().toISOString()};})
 ]);return{workId:r.result.work.id,shuttleId:r.result.shuttle.id};
}
