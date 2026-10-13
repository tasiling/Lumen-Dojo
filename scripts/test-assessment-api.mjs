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
let writes=0,queries=0,failRead=false,lostWrite=false,repeatCursor=false,hideCreated=false,blockReads=0;
const hidden=new Set(),clone=structuredClone;
function plain(properties){return Object.fromEntries(Object.entries(properties).map(([name,p])=>[name,{...p,...(p.title?{title:p.title.map(x=>({...x,plain_text:x.text?.content??x.plain_text}))}:{}),...(p.rich_text?{rich_text:p.rich_text.map(x=>({...x,plain_text:x.text?.content??x.plain_text}))}:{})}]))}
function page(title,value,id=crypto.randomUUID()){return {id,object:'page',parent:{type:'data_source_id',data_source_id:load('lib/notion/schema.ts').DATA_SOURCES.DB14_知識庫},archived:false,in_trash:false,properties:plain({標題:{title:[{text:{content:title}}]},內容:{rich_text:[{text:{content:JSON.stringify(value)}}]}})}}
const title=p=>p.properties.標題.title.map(x=>x.plain_text).join('');
function matches(p,f){if(!f)return true;if(f.and)return f.and.every(x=>matches(p,x));if(f.select)return p.properties[f.property]?.select?.name===f.select.equals;const v=f.title,t=title(p);return v.equals!==undefined?t===v.equals:v.starts_with!==undefined?t.startsWith(v.starts_with):t.endsWith(v.ends_with)}
async function mutation(fn){return load('lib/dojo/learningFoundation/writeOutcome.ts').trackLearningWrite(async()=>{const result=fn();writes++;if(lostWrite){lostWrite=false;throw Error('isolated committed response lost')}return result})}
const client={dataSources:{query:async args=>{queries++;if(failRead){failRead=false;throw Error('isolated read failed')}const all=[...rows.values()].filter(p=>!hidden.has(p.id)&&matches(p,args.filter)).sort((a,b)=>title(b).localeCompare(title(a)));const offset=Number(args.start_cursor??0),count=args.page_size??100;return {results:clone(all.slice(offset,offset+count)),has_more:offset+count<all.length,next_cursor:offset+count<all.length?(repeatCursor?(args.start_cursor??'0'):String(offset+count)):null}}},pages:{create:async args=>mutation(()=>{for(const p of Object.values(args.properties)){if(p.rich_text){assert.ok(p.rich_text.length<=100);for(const x of p.rich_text)assert.ok(x.text.content.length<=2000)}}const p={id:crypto.randomUUID(),object:'page',parent:args.parent,archived:false,in_trash:false,properties:plain(args.properties)};rows.set(p.id,p);if(hideCreated)hidden.add(p.id);return clone(p)}),update:async args=>mutation(()=>{const p=rows.get(args.page_id);assert.ok(p);p.properties={...p.properties,...plain(args.properties)};return clone(p)}),retrieve:async({page_id})=>{if(!rows.has(page_id)){const e=Error('missing page');e.code='object_not_found';throw e}return clone(rows.get(page_id))}},blocks:{children:{list:async args=>{blockReads++;return {results:[{id:crypto.randomUUID(),type:'audio',parent:{type:'page_id',page_id:args.block_id},has_children:false,audio:{type:'file',file:{url:'https://signed.test/PRIVATE_SIGNATURE'},caption:[{plain_text:'owned audio'}]}}],has_more:false,next_cursor:null}}},retrieve:async()=>{const e=Error('missing block');e.code='object_not_found';throw e}}};
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>s==='server-only'?{}:(s==='@/lib/notion/client'||(s.startsWith('.')&&resolve(dirname(file),s)===resolve('lib/notion/client')))?{notion:()=>client,notionWithoutRetries:()=>client,withNotionRateLimit:fn=>fn()}:s.startsWith('@/')?load(resolve(s.slice(2))+'.ts'):s.startsWith('.')?load(resolve(dirname(file),s)+'.ts'):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
try{
 assert.ok(existsSync('app/api/dojo/assessments/route.ts'),'authenticated assessment handlers must connect the real persistence adapter');
 const {NextRequest}=require('next/server'),api=load('app/api/dojo/assessments/route.ts'),{learningOwner}=load('lib/dojo/learningFoundation/store.ts'),{FOUNDATION_PREFIX}=load('lib/dojo/learningFoundation/model.ts');
 const itemId=crypto.randomUUID(),foundation={schema:1,id:itemId,owner:learningOwner,kind:'item',itemId:null,stageId:null,legacyKey:null,seedKey:null,name:'英文',description:'',vision:'',goal:'',expectedOutcome:'',order:0,status:'active',focused:false,revision:1,createdAt:'2026-10-13',updatedAt:'2026-10-13'};const fp=page(FOUNDATION_PREFIX+itemId,foundation);rows.set(fp.id,fp);
 const req=(method,body,query='',auth=true,origin='http://localhost')=>new NextRequest('http://localhost/api/dojo/assessments'+query,{method,headers:{'content-type':'application/json',origin,...(auth?{cookie:'dsc_access_key=r26-api-isolated'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const call=async(method,body,query='',auth=true,origin)=>{const r=await api[method](req(method,body,query,auth,origin));return {status:r.status,headers:r.headers,body:await r.json()}};
 assert.equal((await call('GET',null,'',false)).status,401);assert.equal(queries,0);assert.equal((await call('GET',null,'?native-sources=1',false)).status,401);assert.equal((await call('GET',null,'?native-page='+fp.id,false)).status,401);assert.equal(blockReads,0);assert.equal(queries,0);assert.equal((await call('POST',{},'',true,'https://foreign.test')).status,403);
 const definition={name:'說明一次新經歷',objective:'獨立表達',scope:{learningItemId:itemId,level:'path',languageDimension:'writing'},achievedRank:'bronze',tasks:['描述一次新經歷'],aids:['可用字典'],criteria:[{id:'meaning',description:'事件順序',meetsDescription:'順序可理解',mandatory:true,requiredEvidenceKinds:['text']}],confirmationMethods:['self'],professionalPractice:false};
 const define={action:'define',requestId:crypto.randomUUID(),definition};const first=await call('POST',define);assert.equal(first.status,201);const d=first.body.definition;assert.equal((await call('POST',define)).body.definition.id,d.id);
 const create={action:'attempt',requestId:crypto.randomUUID(),capabilityId:d.capabilityId,definitionVersion:1};let a=(await call('POST',create)).body.attempt;const count=writes;assert.equal((await call('POST',create)).body.attempt.id,a.id);assert.equal(writes,count);
 const patch=async(action,input={},attempt=a)=>call('PATCH',{action,id:attempt.id,revision:attempt.revision,...input});
 a=(await patch('draft',{answer:'PRIVATE selected work',evidence:[{id:'essay',kind:'text',label:'回答',selectedText:'PRIVATE selected work'}]})).body.attempt;
 assert.equal((await patch('submit',{}, {...a,revision:1})).status,409);a=(await patch('submit')).body.attempt;
 a=(await patch('evaluate',{evaluation:{attemptId:a.id,definitionVersion:1,attemptRevision:a.revision,evaluator:{type:'self',name:'自己'},criteria:[{criterionId:'meaning',verdict:'meets',feedback:'順序清楚'}]}})).body.attempt;
 assert.equal(a.verdict,'meets');assert.equal(a.confirmedAt,null);a=(await patch('confirm',{confirmationMethod:'self'})).body.attempt;assert.ok(a.confirmedAt);
 const beforeRead=writes;const list=await call('GET');assert.equal(list.headers.get('cache-control'),'private, no-store');assert.ok(!JSON.stringify(list.body).includes('PRIVATE selected work'));const readAttempt=await call('GET',null,'?attempt='+a.id);assert.deepEqual(readAttempt.body.evidenceAvailability,[{id:'essay',status:'available'}]);const readMastery=await call('GET',null,'?mastery='+a.id);assert.deepEqual(readMastery.body.evidenceAvailability,[{id:'essay',status:'available'}]);assert.equal(writes,beforeRead);
 const sourcesResponse=await call('GET',null,'?native-sources=1');assert.equal(sourcesResponse.status,200);assert.ok(!JSON.stringify(sourcesResponse.body).includes('PRIVATE selected work'));assert.ok(!sourcesResponse.body.sources.some(s=>s.label.startsWith('行光能力')));const attachmentResponse=await call('GET',null,'?native-page='+fp.id);assert.equal(attachmentResponse.status,200);assert.equal(attachmentResponse.headers.get('cache-control'),'private, no-store');assert.equal(attachmentResponse.body.attachments[0].blockType,'audio');assert.ok(!JSON.stringify(attachmentResponse.body).includes('PRIVATE_SIGNATURE'));assert.equal(writes,beforeRead);
 const privatePage=[...rows.values()].find(p=>title(p)==='行光能力嘗試-'+a.id),beforePrivateBlocks=blockReads;assert.equal((await call('GET',null,'?native-page='+privatePage.id)).status,403);assert.equal(blockReads,beforePrivateBlocks,'private assessment source must be refused before reading blocks');
 const all=await load('lib/notion/queries.ts').listAllKnowledgeEntries();assert.ok(!JSON.stringify(all).includes('PRIVATE selected work'));assert.ok(!all.some(p=>p.標題.startsWith('行光能力')));
 for(const p of rows.values())if(title(p).startsWith('行光能力'))p.properties.核可狀態={select:{name:'已核可'}};
 const approved=await load('lib/notion/queries.ts').listApprovedKnowledgeEntries();assert.ok(!JSON.stringify(approved).includes('PRIVATE selected work'),'approved flag must not export private assessment state');
 const {verifyOwnedEvidence}=load('lib/dojo/assessments/evidence.ts'),missingRef=crypto.randomUUID();
 const sourceInput={id:'same-id',kind:'learning-record',label:'new missing source',referenceId:missingRef};
 const current=await verifyOwnedEvidence([sourceInput],[{...sourceInput,referenceId:crypto.randomUUID(),status:'available',snapshot:'OTHER SOURCE SNAPSHOT'}],{attemptId:a.id,definitionVersion:1,answerDigest:'test'});
 assert.equal(current[0].snapshot,'new missing source','changing source ID must not inherit the previous source snapshot');
 const editedRef=crypto.randomUUID(),editedInput={id:'historical',kind:'learning-record',label:'original work',referenceId:editedRef,selectedText:'original'};
 const editedSource=page('行光學習正文-2026-10-13:'+editedRef,{recordType:'learning-record/v1',id:editedRef,owner:learningOwner,whatIDid:'replacement',status:'completed'});rows.set(editedSource.id,editedSource);
 const historicalEvidence={...editedInput,status:'available',snapshot:'original historical snapshot'};
 const refreshed=await verifyOwnedEvidence([editedInput],[historicalEvidence],{attemptId:a.id,definitionVersion:1,answerDigest:'test'});assert.equal(refreshed[0].status,'unverified');assert.equal(refreshed[0].snapshot,historicalEvidence.snapshot);
 await assert.rejects(()=>verifyOwnedEvidence([editedInput],undefined,{attemptId:a.id,definitionVersion:1,answerDigest:'test'}),/選取文字/);
 const historicalId=crypto.randomUUID(),historicalAttempt={...a,id:historicalId,evidence:[historicalEvidence]},historicalRow=page('行光能力嘗試-'+historicalId,historicalAttempt);rows.set(historicalRow.id,historicalRow);
 const beforeHistoricalRead=writes;for(const query of ['attempt','mastery']){const read=await call('GET',null,'?'+query+'='+historicalId);assert.equal(read.status,200);assert.deepEqual(read.body.evidenceAvailability,[{id:'historical',status:'unverified'}]);assert.equal((read.body.attempt??read.body.mastery).evidence[0].snapshot,historicalEvidence.snapshot)}assert.equal(writes,beforeHistoricalRead);
 const privateRef=crypto.randomUUID(),privateSource=page('行光學習正文-2026-10-13:'+privateRef,{recordType:'learning-record/v1',id:privateRef,owner:learningOwner,whatIDid:'SECRET UNSELECTED SOURCE MATERIAL public selected excerpt',status:'completed'});rows.set(privateSource.id,privateSource);
 const privateInput=load('lib/dojo/assessments/selection.ts').recordEvidence({id:privateRef,title:'',status:'completed',whatIDid:'SECRET UNSELECTED SOURCE MATERIAL public selected excerpt',selectedExcerpt:''},'public selected excerpt');
 let privateAttempt=(await call('POST',{...create,requestId:crypto.randomUUID()})).body.attempt;privateAttempt=(await patch('draft',{answer:'',evidence:[privateInput]},privateAttempt)).body.attempt;
 assert.ok(privateAttempt.evidence[0].snapshot.includes('SECRET UNSELECTED SOURCE MATERIAL'),'saved history retains original source snapshot');
 const selectedPackage=await call('POST',{action:'export',id:privateAttempt.id,includeAnswer:false,evidenceIds:[privateInput.id]});assert.equal(selectedPackage.status,200);assert.ok(!JSON.stringify(selectedPackage.body).includes('SECRET UNSELECTED SOURCE MATERIAL'),'selected-excerpt export must not include unselected source text');assert.ok(JSON.stringify(selectedPackage.body).includes('public selected excerpt'));
 const nativeModule=load('lib/dojo/assessments/nativeEvidence.ts'),originalNative=nativeModule.ownedNativeAttachment;
 nativeModule.ownedNativeAttachment=async()=>({status:'available',identity:'test-native',snapshot:'test proof'});
 const proofInput={id:'proof',kind:'professional-proof',label:'teacher proof',referenceId:crypto.randomUUID(),fileBlockId:crypto.randomUUID()},proofKey=createHash('sha256').update(JSON.stringify([a.id,proofInput.id])).digest('hex');
 const proofRows=[page('行光能力證明-'+proofKey,{}),page('行光能力證明-'+proofKey,{})];for(const p of proofRows)rows.set(p.id,p);
 await assert.rejects(()=>verifyOwnedEvidence([proofInput],undefined,{attemptId:a.id,definitionVersion:1,answerDigest:'test'}),/證明 ID 重複/);
 for(const p of proofRows)rows.delete(p.id);
 // Removing proof recording or trusting caller identity/context must fail these actual-handler assertions.
 for(const evaluatorType of ['teacher','professional']){
  const humanDefinition={...definition,professionalPractice:true,confirmationMethods:[evaluatorType],criteria:[{...definition.criteria[0],requiredEvidenceKinds:['professional-proof']}]};
  const humanD=(await call('POST',{action:'define',requestId:crypto.randomUUID(),definition:humanDefinition})).body.definition;
  let human=(await call('POST',{action:'attempt',requestId:crypto.randomUUID(),capabilityId:humanD.capabilityId,definitionVersion:1})).body.attempt;
  const recordProof=(extra={},attempt=human)=>call('POST',{action:'record-proof',id:attempt.id,revision:attempt.revision,evidenceId:proofInput.id,evaluator:{type:evaluatorType,name:'Real evaluator'},correspondenceChecked:true,reviewNote:'Reviewed original assessment report against this work',...extra});
  assert.equal((await recordProof()).status,409,'draft proof recording refused');
  human=(await patch('draft',{answer:'Human reviewed answer',evidence:[proofInput]},human)).body.attempt;
  human=(await patch('submit',{},human)).body.attempt;
  const beforeProof=writes;
  assert.equal((await recordProof({correspondenceChecked:false})).status,400);
  assert.equal((await recordProof({reviewNote:''})).status,400);
  assert.equal((await recordProof({revision:1})).status,409);
  assert.equal((await recordProof({evidenceId:'not-selected'})).status,409);
  nativeModule.ownedNativeAttachment=async()=>({status:'available',identity:'changed-native',snapshot:'changed'});
  assert.equal((await recordProof()).status,409,'changed submitted object cannot be newly attested');
  nativeModule.ownedNativeAttachment=async()=>({status:'available',identity:'test-native',snapshot:'test proof'});
  assert.equal(writes,beforeProof);
  const recorded=await recordProof({answerDigest:'FORGED',nativeMediaIdentity:'FORGED',reviewedBy:'FORGED',attestation:{reviewStatus:'verified'}});
  assert.equal(recorded.status,201);assert.equal(recorded.body.proof.reviewedBy,learningOwner);
  assert.equal(recorded.body.proof.attestation.answerDigest,createHash('sha256').update(JSON.stringify(human.answer)).digest('hex'));
  assert.equal(recorded.body.proof.attestation.nativeMediaIdentity,'test-native');
  assert.equal(recorded.body.proof.provenance,'owner-recorded-source-correspondence');
  const afterProof=writes;assert.equal((await recordProof()).status,201);assert.equal(writes,afterProof,'same proof retry must not duplicate');
  assert.equal((await recordProof({evaluator:{type:evaluatorType,name:'Different evaluator'}})).status,409);assert.equal(writes,afterProof);
  const unchanged=(await call('GET',null,'?attempt='+human.id)).body.attempt;assert.deepEqual(unchanged,human,'proof record does not rewrite submitted work or increment revision');
  const proofRead=await call('GET',null,'?attempt='+human.id);assert.equal(proofRead.body.proofs.length,1);assert.equal(proofRead.body.proofs[0].attestation.evaluator.name,'Real evaluator');assert.equal(writes,afterProof,'reloading registered correspondence is read-only');
  const evaluated=await patch('evaluate',{evaluation:{attemptId:human.id,definitionVersion:1,attemptRevision:human.revision,evaluator:{type:evaluatorType,name:'Real evaluator',proofEvidenceId:proofInput.id},criteria:[{criterionId:'meaning',verdict:'meets',feedback:'Verified report'}]}},human);
  assert.equal(evaluated.status,200);human=evaluated.body.attempt;assert.equal(human.verdict,'meets');
  assert.equal((await recordProof()).status,409,'assessed history cannot rebind examiner');
  nativeModule.ownedNativeAttachment=async()=>({status:'available',identity:'changed-native',snapshot:'changed'});
  assert.equal((await patch('confirm',{confirmationMethod:evaluatorType},human)).status,409,'confirmation must recheck media');
  nativeModule.ownedNativeAttachment=async()=>({status:'available',identity:'test-native',snapshot:'test proof'});
  const confirmed=await patch('confirm',{confirmationMethod:evaluatorType},human);assert.equal(confirmed.status,200);assert.ok(confirmed.body.attempt.confirmedAt);
  for(const sourceStatus of ['missing','archived']){
   human=(await call('POST',{action:'attempt',requestId:crypto.randomUUID(),capabilityId:humanD.capabilityId,definitionVersion:1})).body.attempt;
   human=(await patch('draft',{answer:'Human reviewed answer',evidence:[proofInput]},human)).body.attempt;human=(await patch('submit',{},human)).body.attempt;assert.equal((await recordProof()).status,201);
   nativeModule.ownedNativeAttachment=async()=>({status:sourceStatus,snapshot:'unavailable original'});
   const unavailable=await patch('evaluate',{evaluation:{attemptId:human.id,definitionVersion:1,attemptRevision:human.revision,evaluator:{type:evaluatorType,name:'Real evaluator',proofEvidenceId:proofInput.id},criteria:[{criterionId:'meaning',verdict:'meets',feedback:'Previously reviewed'}]}},human);
   assert.equal(unavailable.status,200);human=unavailable.body.attempt;assert.equal(human.verdict,'insufficient');
   const beforeUnavailableRead=writes,history=await call('GET',null,'?attempt='+human.id);assert.equal(history.status,200,'unavailable evidence cannot block reloading assessed historical work');assert.equal(history.body.proofs.length,1);assert.equal(history.body.evidenceAvailability[0].status,sourceStatus);assert.equal(writes,beforeUnavailableRead);
   nativeModule.ownedNativeAttachment=async()=>({status:'available',identity:'test-native',snapshot:'test proof'});
  }

 }
 nativeModule.ownedNativeAttachment=originalNative;
 failRead=true;const failed=await call('POST',{...create,requestId:crypto.randomUUID()});assert.equal(failed.status,503);assert.ok(!(await readdir(directory)).includes('learning-writer.lock'));
 const foreignRecordId=crypto.randomUUID();const foreignRecord=page('行光學習正文-2026-10-13:'+foreignRecordId,{recordType:'learning-record/v1',id:foreignRecordId,owner:'other',whatIDid:'OTHER PRIVATE',status:'completed'});rows.set(foreignRecord.id,foreignRecord);let foreignAttempt=(await call('POST',{...create,requestId:crypto.randomUUID()})).body.attempt;assert.equal((await patch('draft',{answer:'X',evidence:[{id:'foreign',kind:'learning-record',label:'foreign',referenceId:foreignRecordId}]},foreignAttempt)).status,403);
 for(let i=0;i<181;i++){const id=crypto.randomUUID(),value={...a,id,requestFingerprint:'fixture-'+i,confirmedAt:null};const p=page('行光能力嘗試-'+id,value);rows.set(p.id,p)}
 assert.ok((await call('GET')).body.attempts.length>=183);const nativeFirst=await call('GET',null,'?native-sources=1');assert.equal(nativeFirst.status,200);assert.ok(nativeFirst.body.cursor);assert.equal((await call('GET',null,'?native-sources=1&cursor='+encodeURIComponent(nativeFirst.body.cursor))).status,200);repeatCursor=true;assert.equal((await call('GET')).status,503);repeatCursor=false;
 // The proof write must retain the same durable-intent and ambiguous-write guards as other assessment writes.
 nativeModule.ownedNativeAttachment=async()=>({status:'available',identity:'test-native',snapshot:'test proof'});
 const durabilityD=(await call('POST',{action:'define',requestId:crypto.randomUUID(),definition:{...definition,confirmationMethods:['teacher']}})).body.definition;
 const prepareProof=async()=>{let v=(await call('POST',{action:'attempt',requestId:crypto.randomUUID(),capabilityId:durabilityD.capabilityId,definitionVersion:1})).body.attempt;v=(await patch('draft',{answer:'original',evidence:[proofInput]},v)).body.attempt;v=(await patch('submit',{},v)).body.attempt;return {action:'record-proof',id:v.id,revision:v.revision,evidenceId:proofInput.id,evaluator:{type:'teacher',name:'Teacher'},correspondenceChecked:true,reviewNote:'Compared original report and work'};};
 const hiddenProof=await prepareProof(),uncertainProof=await prepareProof();
 hideCreated=true;assert.equal((await call('POST',hiddenProof)).status,201);const proofWrites=writes;assert.equal((await call('POST',hiddenProof)).status,409);assert.equal(writes,proofWrites,'temporarily invisible proof must not be recreated');hideCreated=false;hidden.clear();
 assert.equal((await call('GET',null,'?attempt='+hiddenProof.id)).body.proofs.length,1);
 nativeModule.ownedNativeAttachment=originalNative;
 hideCreated=true;const invisible={...create,requestId:crypto.randomUUID()};assert.equal((await call('POST',invisible)).status,201);const writesBeforeRetry=writes;assert.equal((await call('POST',invisible)).status,409);assert.equal(writes,writesBeforeRetry);hideCreated=false;hidden.clear();
 nativeModule.ownedNativeAttachment=async()=>({status:'available',identity:'test-native',snapshot:'test proof'});lostWrite=true;const uncertain=await call('POST',uncertainProof);assert.equal(uncertain.status,503);assert.ok((await readdir(directory)).includes('learning-writer.lock'));assert.equal((await call('POST',{...create,requestId:crypto.randomUUID()})).status,409);assert.equal((await call('GET',null,'?attempt='+a.id)).status,200);
 console.log('PASS actual assessment handlers/persistence/serializer: auth/origin, immutable records, retry intents, read-only metadata, private production exclusion, owner refusal, 181+ pagination/cursor failure, prewrite-read release, unknown-write lock and read-only inspection');
}finally{await rm(directory,{recursive:true,force:true});delete process.env.ACCESS_KEY;delete process.env.LEARNING_WRITE_LOCK_DIR;}
