import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {Module,createRequire} from 'node:module';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),cache=new Map(),rows=new Map();
const directory=await mkdtemp(join(tmpdir(),'r26-api-'));process.env.ACCESS_KEY='r26-api-isolated';process.env.LEARNING_WRITE_LOCK_DIR=directory;
let writes=0,queries=0,failRead=false,lostWrite=false,repeatCursor=false,hideCreated=false,blockReads=0,failBodyQuery=false;
const hidden=new Set(),clone=structuredClone;
function plain(properties){return Object.fromEntries(Object.entries(properties).map(([name,p])=>[name,{...p,...(p.title?{title:p.title.map(x=>({...x,plain_text:x.text?.content??x.plain_text}))}:{}),...(p.rich_text?{rich_text:p.rich_text.map(x=>({...x,plain_text:x.text?.content??x.plain_text}))}:{})}]))}
function page(title,value,id=crypto.randomUUID()){return {id,object:'page',parent:{type:'data_source_id',data_source_id:load('lib/notion/schema.ts').DATA_SOURCES.DB14_知識庫},archived:false,in_trash:false,properties:plain({標題:{title:[{text:{content:title}}]},內容:{rich_text:[{text:{content:JSON.stringify(value)}}]}})}}
const title=p=>p.properties.標題.title.map(x=>x.plain_text).join('');
function matches(p,f){if(!f)return true;if(f.and)return f.and.every(x=>matches(p,x));if(f.select)return p.properties[f.property]?.select?.name===f.select.equals;const v=f.title,t=title(p);return v.equals!==undefined?t===v.equals:v.starts_with!==undefined?t.startsWith(v.starts_with):t.endsWith(v.ends_with)}
async function mutation(fn){return load('lib/dojo/learningFoundation/writeOutcome.ts').trackLearningWrite(async()=>{const result=fn();writes++;if(lostWrite){lostWrite=false;throw Error('isolated committed response lost')}return result})}
const client={dataSources:{query:async args=>{queries++;if(failBodyQuery&&JSON.stringify(args.filter).includes('行光學習正文-')){failBodyQuery=false;throw Error('isolated projection body read failed')}if(failRead){failRead=false;throw Error('isolated read failed')}const all=[...rows.values()].filter(p=>!hidden.has(p.id)&&matches(p,args.filter)).sort((a,b)=>title(b).localeCompare(title(a)));const offset=Number(args.start_cursor??0),count=args.page_size??100;return {results:clone(all.slice(offset,offset+count)),has_more:offset+count<all.length,next_cursor:offset+count<all.length?(repeatCursor?(args.start_cursor??'0'):String(offset+count)):null}}},pages:{create:async args=>mutation(()=>{for(const p of Object.values(args.properties)){if(p.rich_text){assert.ok(p.rich_text.length<=100);for(const x of p.rich_text)assert.ok(x.text.content.length<=2000)}}const p={id:crypto.randomUUID(),object:'page',parent:args.parent,archived:false,in_trash:false,properties:plain(args.properties)};rows.set(p.id,p);if(hideCreated)hidden.add(p.id);return clone(p)}),update:async args=>mutation(()=>{const p=rows.get(args.page_id);assert.ok(p);p.properties={...p.properties,...plain(args.properties)};return clone(p)}),retrieve:async({page_id})=>{if(!rows.has(page_id)){const e=Error('missing page');e.code='object_not_found';throw e}return clone(rows.get(page_id))}},blocks:{children:{list:async args=>{blockReads++;return {results:[{id:crypto.randomUUID(),type:'audio',parent:{type:'page_id',page_id:args.block_id},has_children:false,audio:{type:'file',file:{url:'https://signed.test/PRIVATE_SIGNATURE'},caption:[{plain_text:'owned audio'}]}}],has_more:false,next_cursor:null}}},retrieve:async()=>{const e=Error('missing block');e.code='object_not_found';throw e}}};
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>s==='server-only'?{}:(s==='@/lib/notion/client'||(s.startsWith('.')&&resolve(dirname(file),s)===resolve('lib/notion/client')))?{notion:()=>client,notionWithoutRetries:()=>client,withNotionRateLimit:fn=>fn()}:s.startsWith('@/')?load(resolve(s.slice(2))+'.ts'):s.startsWith('.')?load(resolve(dirname(file),s)+'.ts'):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const raw = (id = '30000000-0000-4000-8000-000000000001', overrides = {}) => ({
  contractVersion: "context-room-practice-results/v1",
  eventVersion: 1,
  eventType: "practice.completed",
  sourceSystem: "context-room",
  sourceType: "practice-session",
  sourceId: id,
  sourceEventId: id,
  sourceRevision: "legacy:opaque",
  completionStatus: "completed",
  sourceStatus: "available",
  sourceAvailability: "available",
  practicedOn: "2026-09-20",
  occurredAt: "2026-09-20T23:59:59.123456Z",
  timeZone: null,
  dateSemantics:
    "stored-practicedOn; completion/import time, not independently verified practice time",
  originalContext: null,
  currentContext: {
    projectId: "project-a",
    projectName: "中文來源",
    unitId: "unit-a",
    unitName: "同一 Unit",
  },
  activityMode: "quick_retell",
  completionKind: "context-room-session",
  quantity: 1,
  unit: "次",
  summary: {
    mode: "quick_retell",
    firstDone: true,
    feedbackReceived: true,
    secondDone: false,
  },
  sourceLocation: `/practice-results/${id}`,
  contextEvidence: "legacy-current-context-only",
  updatedAt: "2026-10-06T01:00:00.000001Z",
  firstAnswer: "PRIVATE FULL ANSWER",
  privateNotes: "PRIVATE NOTES",
  ...overrides,
});
const originalFetch=globalThis.fetch;let sourceReads=0,remoteResult;
try{
 process.env.CONTEXT_ROOM_RESULTS_ENABLED='1';process.env.CONTEXT_ROOM_RESULTS_OWNER=load('lib/notion/schema.ts').DATA_SOURCES.DB14_知識庫;process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET='isolated-source';
 const {NextRequest}=require('next/server'),apis={external:load('app/api/dojo/external-results/route.ts'),records:load('app/api/dojo/learning/records/route.ts'),assessments:load('app/api/dojo/assessments/route.ts'),mastery:load('app/api/dojo/mastery/route.ts'),reflections:load('app/api/dojo/reflections/route.ts')};
 const {learningOwner}=load('lib/dojo/learningFoundation/store.ts'),{FOUNDATION_PREFIX}=load('lib/dojo/learningFoundation/model.ts');
 process.env.CONTEXT_ROOM_RESULTS_ENABLED='1';process.env.CONTEXT_ROOM_RESULTS_OWNER=learningOwner;process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET='isolated-source';
 globalThis.fetch=async(url,init)=>{sourceReads++;assert.equal(new URL(url).origin,'https://lumen-context-room-production-4a2c.up.railway.app');assert.equal(init.headers.Authorization,'Bearer isolated-source');return new Response(JSON.stringify({contractVersion:'context-room-practice-results/v1',results:[remoteResult],nextCursor:null,windowUpper:remoteResult.updatedAt,incrementalSemantics:'bounded-live-window; inclusive overlapping refresh required'}));};
 const itemId=crypto.randomUUID(),foundation={schema:1,id:itemId,owner:learningOwner,kind:'item',itemId:null,stageId:null,legacyKey:null,seedKey:null,name:'英文',description:'',vision:'',goal:'',expectedOutcome:'',order:0,status:'active',focused:false,revision:1,createdAt:'2026-10-13',updatedAt:'2026-10-13'};const fp=page(FOUNDATION_PREFIX+itemId,foundation);rows.set(fp.id,fp);
 const path={external:'external-results',records:'learning/records',assessments:'assessments',mastery:'mastery',reflections:'reflections'};
 async function call(kind,method,body,query='',auth=true){const req=new NextRequest('http://localhost/api/dojo/'+path[kind]+query,{method,headers:{origin:'http://localhost','content-type':'application/json',...(auth?{cookie:'dsc_access_key=r26-api-isolated'}:{})},...(body?{body:JSON.stringify(body)}:{})}),r=await apis[kind][method](req);return {status:r.status,body:await r.json()};}
 for(const kind of Object.keys(apis))assert.equal((await call(kind,'GET',null,'',false)).status,401);assert.equal(sourceReads,0);assert.equal(writes,0);
 const reflection=await call('reflections','POST',{createRequestId:crypto.randomUUID(),toolId:'awareness',date:'2026-10-13',status:'draft'});assert.equal(reflection.status,201);const note=reflection.body.note;assert.equal((await call('reflections','PATCH',{id:note.id,revision:note.revision,patch:{answers:{'awareness.q1':'PRIVATE EMOTIONAL ANSWER'},status:'completed'}})).status,200);assert.equal(writes,0,'private reflection cannot create formal learning/mastery records');
 assert.equal((await call('assessments','GET')).body.attempts.length,0);assert.equal((await call('mastery','GET')).body.cards.length,0);
 remoteResult=raw();assert.equal((await call('external','GET')).status,200);assert.equal(sourceReads,0);assert.equal((await call('external','POST',{action:'sync'})).status,200);let receipt=(await call('external','GET')).body.receipts[0];assert.ok(receipt.learningRecordId);assert.equal((await call('mastery','GET')).body.cards.length,0,'source completion must not auto-grant card');
 let record=(await call('records','GET',null,'?id='+receipt.learningRecordId)).body.record;assert.ok(record.whatIDid);assert.equal(record.practicedOn,'2026-09-20');assert.ok(!JSON.stringify(record).includes('PRIVATE FULL ANSWER'));const bodyId=record.id,eventId=receipt.eventId;
 record=(await call('records','PATCH',{id:record.id,revision:record.revision,input:{learningItemIds:[itemId],primaryLearningItemId:itemId}})).body.record;assert.ok(record);
 const definition={name:'跨站成果獨立說明',objective:'以選取成果作新情境說明',scope:{learningItemId:itemId,level:'path',languageDimension:'writing'},achievedRank:'stone',tasks:['說明來源成果'],aids:[],criteria:[{id:'work',description:'有效紀錄與說明',meetsDescription:'來源可核對並能獨立說明',mandatory:true,requiredEvidenceKinds:['learning-record']}],confirmationMethods:['self'],professionalPractice:false};
 const d=(await call('assessments','POST',{action:'define',requestId:crypto.randomUUID(),definition})).body.definition;
 const evidence={id:'external-record',kind:'learning-record',label:'明確選取的來源正文',referenceId:record.id,selectedText:record.whatIDid};
 async function assess(){let a=(await call('assessments','POST',{action:'attempt',requestId:crypto.randomUUID(),capabilityId:d.capabilityId,definitionVersion:1})).body.attempt;let saved=await call('assessments','PATCH',{action:'draft',id:a.id,revision:a.revision,answer:'My new independent explanation',evidence:[evidence]});assert.equal(saved.status,200);a=saved.body.attempt;a=(await call('assessments','PATCH',{action:'submit',id:a.id,revision:a.revision})).body.attempt;const response=await call('assessments','PATCH',{action:'evaluate',id:a.id,revision:a.revision,evaluation:{attemptId:a.id,definitionVersion:1,attemptRevision:a.revision,evaluator:{type:'self',name:'自己'},criteria:[{criterionId:'work',verdict:'meets',feedback:'Explicit review'}]}});assert.equal(response.status,200);return response.body.attempt;}
 let a=await assess();assert.equal(a.verdict,'meets');a=(await call('assessments','PATCH',{action:'confirm',id:a.id,revision:a.revision,confirmationMethod:'self'})).body.attempt;let card=(await call('mastery','POST',{attemptId:a.id})).body.card;assert.ok(card);const beforeRetry=writes;assert.equal((await call('mastery','POST',{attemptId:a.id})).body.card.id,card.id);assert.equal(writes,beforeRetry);
 const counts=()=>[...rows.values()].filter(p=>title(p).startsWith('行光完成事件-')||title(p).startsWith('行光學習正文-')).length;const baselineCounts=counts();assert.equal((await call('external','POST',{action:'sync'})).status,200);assert.equal(counts(),baselineCounts);receipt=(await call('external','GET')).body.receipts[0];assert.equal(receipt.learningRecordId,bodyId);assert.equal(receipt.eventId,eventId);
 const beforeReads=writes,previousSourceReads=sourceReads;const cached=await call('external','GET');assert.ok(!JSON.stringify(cached.body).includes('PRIVATE'));assert.ok(!JSON.stringify((await call('mastery','GET')).body).includes('PRIVATE'));await call('reflections','GET');await call('assessments','GET');assert.equal(writes,beforeReads);assert.equal(sourceReads,previousSourceReads,'readonly navigation cannot pull source API');
 record=(await call('records','PATCH',{id:bodyId,revision:record.revision,input:{title:'Renamed source, same selected work'}})).body.record;const renamed=await call('assessments','GET',null,'?mastery='+a.id);assert.equal(renamed.status,200);assert.equal(renamed.body.evidenceAvailability[0].status,'available','display-only source rename must not invalidate unchanged selected work');
 remoteResult=raw(undefined,{sourceRevision:'refresh-v2',updatedAt:'2026-10-06T01:30:00.000001Z'});failBodyQuery=true;assert.equal((await call('external','POST',{action:'sync'})).status,503);assert.equal((await assess()).verdict,'insufficient','completed source with pending body projection is not current verified evidence');assert.equal((await call('external','POST',{action:'sync'})).status,200);
 let waiting=await assess();waiting=(await call('assessments','PATCH',{action:'confirm',id:waiting.id,revision:waiting.revision,confirmationMethod:'self'})).body.attempt;
 remoteResult=raw(undefined,{sourceRevision:'withdrawal-v2',completionStatus:'withdrawn',updatedAt:'2026-10-06T02:00:00.000001Z'});failBodyQuery=true;assert.equal((await call('external','POST',{action:'sync'})).status,503);const eventPage=[...rows.values()].find(p=>title(p)==='行光完成事件-'+eventId),authoritative=JSON.parse(eventPage.properties.內容.rich_text.map(x=>x.plain_text).join(''));assert.equal(authoritative.completionStatus,'withdrawn');assert.equal(authoritative.projections.record,'needs_retry');const stale=(await call('records','GET',null,'?id='+bodyId)).body.record;assert.equal(stale.sourceCompletionStatus,'completed');assert.ok(!(await readdir(directory)).includes('learning-writer.lock'));assert.equal((await assess()).verdict,'insufficient','event-first withdrawal cannot be bypassed by a stale body after failed projection');assert.equal((await call('mastery','POST',{attemptId:waiting.id})).status,409);assert.equal((await call('external','POST',{action:'sync'})).status,200);record=(await call('records','GET',null,'?id='+bodyId)).body.record;assert.equal(record.sourceCompletionStatus,'withdrawn');assert.equal(counts(),baselineCounts);
 assert.equal((await call('mastery','POST',{attemptId:waiting.id})).status,409,'confirmed but not yet collected result must recheck withdrawn source before first grant');const invalid=await assess();assert.equal(invalid.verdict,'insufficient','withdrawn external source cannot be available learning-record evidence');assert.equal((await call('assessments','PATCH',{action:'confirm',id:invalid.id,revision:invalid.revision,confirmationMethod:'self'})).status,409);assert.equal((await call('mastery','POST',{attemptId:invalid.id})).status,409);assert.equal((await call('mastery','POST',{attemptId:a.id})).body.card.id,card.id,'existing historical collection remains stable');const historical=await call('assessments','GET',null,'?mastery='+a.id);assert.equal(historical.status,200);assert.equal(historical.body.evidenceAvailability[0].status,'unverified');
 remoteResult=raw(undefined,{sourceRevision:'unverified-v3',completionStatus:'unverified',updatedAt:'2026-10-06T02:30:00.000001Z'});assert.equal((await call('external','POST',{action:'sync'})).status,200);assert.equal((await assess()).verdict,'insufficient');
 for(const availability of ['archived','deleted']){remoteResult=raw(undefined,{sourceRevision:'availability-'+availability,completionStatus:'completed',sourceStatus:availability==='deleted'?'missing':availability,sourceAvailability:availability,...(availability==='deleted'?{sourceLocation:null}:{}),updatedAt:availability==='archived'?'2026-10-06T03:00:00.000001Z':'2026-10-06T04:00:00.000001Z'});assert.equal((await call('external','POST',{action:'sync'})).status,200);const read=await call('assessments','GET',null,'?mastery='+a.id);assert.equal(read.status,200);assert.equal(read.body.evidenceAvailability[0].status,availability==='archived'?'archived':'missing');assert.equal((await assess()).verdict,'insufficient');}
 const transportPage=[...rows.values()].find(p=>title(p).startsWith('行光外部來源收據-'));assert.ok(transportPage);const beforePrivateBlocks=blockReads;const nativeRead=await apis.assessments.GET(new NextRequest('http://localhost/api/dojo/assessments?native-page='+transportPage.id,{headers:{cookie:'dsc_access_key=r26-api-isolated'}}));assert.equal(nativeRead.status,403,'private source transport cannot become native proof');assert.equal(blockReads,beforePrivateBlocks);
 console.log('PASS actual R2 integration: private FS reflection stays separate; real receiver -> unique event/body -> explicit selected evidence -> confirmed assessment -> one card; read-only navigation, original dates and privacy; source withdrawal/archive/delete blocks new mastery but retains historical snapshots');
}finally{globalThis.fetch=originalFetch;await rm(directory,{recursive:true,force:true});for(const name of ['ACCESS_KEY','LEARNING_WRITE_LOCK_DIR','CONTEXT_ROOM_RESULTS_ENABLED','CONTEXT_ROOM_RESULTS_OWNER','LUMEN_CONTEXT_ROOM_SYNC_SECRET'])delete process.env[name];}
