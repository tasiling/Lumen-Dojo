import assert from 'node:assert/strict';
import { loader } from './weaving-test-harness.mjs';
const model=loader()('lib/dojo/creativeSources/model.ts');
const book='11111111-1111-4111-8111-111111111111',note='22222222-2222-4222-8222-222222222222';
const ref={sourceType:'reading_note',sourceId:`${book}:${note}`};
assert.deepEqual(model.defaultPolicy(),{discovery:'ask',publication:'ask'});
assert.notEqual(model.sourceKey(ref),model.sourceKey({...ref,sourceId:ref.sourceId+':reflection'}));
assert.notEqual(model.sourceKey(ref),model.sourceKey({...ref,sourceId:ref.sourceId.replace(book,note)}));
assert.equal(model.sourceKey({...ref,sourceId:ref.sourceId.toUpperCase()}),model.sourceKey(ref));
for(const bad of [{...ref,sourceId:'foreign'}, {...ref,sourceId:ref.sourceId+':other'}, {...ref,extra:true},{sourceType:'manual',sourceId:note}])assert.throws(()=>model.parseSourceRef(bad));
const {sourcePolicyService}=loader()('lib/dojo/creativeSources/service.ts');
let rows=[],resolved=[];
const d={owner:'owner',list:async()=>rows,resolve:async ref=>{resolved.push(model.sourceKey(ref));return{ref,label:'隔離來源',text:'僅授權內容',href:'/reading',version:'v1'};},run:async(id,input,prepare)=>(await prepare())(),create:async value=>{rows.push(value);},update:async value=>{rows=rows.map(r=>model.sourceKey(r.ref)===model.sourceKey(value.ref)?value:r);}};
const service=sourcePolicyService(d),input={ref,discovery:'allow',publication:'private',expectedRevision:0,operationId:crypto.randomUUID()};
assert.equal(await service.read(ref),null);
const policy=await service.save(input);assert.equal(policy.publication,'private');assert.equal(policy.discovery,'allow');
await assert.rejects(()=>service.save(input),e=>e.status===409);
for(const patch of [{publication:'yes'}, {expectedRevision:-1}, {operationId:'bad'}, {surprise:true}])await assert.rejects(()=>service.save({...input,...patch}));
resolved=[];const allowed=await service.allowed();assert.equal(allowed.length,1);assert.deepEqual(resolved,[model.sourceKey(ref)]);
await service.save({...input,discovery:'private',publication:'allow',expectedRevision:1,operationId:crypto.randomUUID()});
resolved=[];assert.deepEqual(await service.allowed(),[]);assert.deepEqual(resolved,[],'never resolve denied source text');
await assert.rejects(()=>service.assertPublication([{...ref,selectedText:'原快照'}],false),e=>e.status===400);
await service.assertPublication([{...ref,selectedText:'原快照'}],true);
await service.save({...input,expectedRevision:2,operationId:crypto.randomUUID()});
await assert.rejects(()=>service.assertPublication([ref],true),e=>e.status===403);
const old=JSON.stringify(rows);rows.push({...rows[0]});await assert.rejects(()=>service.read(ref),e=>e.status===409);await assert.rejects(()=>service.allowed(),e=>e.status===409);rows=JSON.parse(old);rows[0].publication='broken';await assert.rejects(()=>service.allowed(),e=>e.status===409);
console.log('PASS policies: independent defaults, exact identities, validation, stale revisions, whitelist-before-content, private/confirmation gate, duplicate/corrupt fail closed');
// Actual store/route with real durable operation receipts and isolated mutation stubs.
const {fixture}=await import('./weaving-fixture.mjs');const f=await fixture();
try{
 const load=loader({'@/lib/notion/queries':f.queries,'@/lib/notion/mutations':f.mutations,'./resolver':{resolvePolicySource:d.resolve},'@/lib/dojo/creativeSources/resolver':{resolvePolicySource:d.resolve}});
 const h=load('app/api/dojo/creative-source-settings/route.ts');
 let res=await h.GET(f.req('GET','/api/dojo/creative-source-settings?ref='+encodeURIComponent(JSON.stringify(ref)),null,false));assert.equal(res.status,401);assert.equal(f.writes(),0);
 res=await h.GET(f.req('GET','/api/dojo/creative-source-settings?ref='+encodeURIComponent(JSON.stringify(ref))));assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal((await res.json()).policy,null);
 const csrf=f.req('POST','/api/dojo/creative-source-settings',input);csrf.headers.set('origin','https://foreign.invalid');assert.equal((await h.POST(csrf)).status,403);assert.equal(f.writes(),0);
 const next={...input,operationId:crypto.randomUUID()};res=await h.POST(f.req('POST','/api/dojo/creative-source-settings',next));assert.equal(res.status,200);const saved=await res.json();assert.equal(saved.policy.revision,1);const count=f.writes();
 assert.equal((await h.POST(f.req('POST','/api/dojo/creative-source-settings',next))).status,200);assert.equal(f.writes(),count);
 assert.equal((await h.POST(f.req('POST','/api/dojo/creative-source-settings',{...next,publication:'allow'}))).status,409);
 assert.equal((await h.POST(f.req('POST','/api/dojo/creative-source-settings',{...next,operationId:crypto.randomUUID()}))).status,409);
 const receipts=load('lib/dojo/creativeSources/operations.ts');
 let calls=0;const op=crypto.randomUUID();const {learningWriteOutcome}=load('lib/dojo/learningFoundation/writeOutcome.ts');
 await assert.rejects(()=>receipts.runPolicyOperation('owner',op,{...input,operationId:op},async()=>async()=>{calls++;learningWriteOutcome.getStore().unresolved++;throw Error('lost response');}));
 await assert.rejects(()=>receipts.runPolicyOperation('owner',op,{...input,operationId:op},async()=>async()=>{calls++;}),e=>e.status===503);assert.equal(calls,1);
 console.log('PASS actual owner/origin API, no-store, durable replay/payload collision/stale revision, unknown response no resend');
}finally{await f.close();}
// Real weaving store gate uses fixed completion sources, not later work selections.
const w=await fixture();
try{
 const store=w.load('lib/dojo/weavingWorkflow/store.ts');const pair=await store.createPair({operationId:'policy-pair-001',coreStatement:'隔離觀點',sourceType:'manual',sourceSnapshot:'私人生活片段',format:'text'});
 let work=await store.patchWork({id:pair.works[0].id,operationId:'policy-draft-01',expectedRevision:1,work:{draftText:'公開版本'}});
 const {completionDigest}=w.load('lib/dojo/weavingWorkflow/completions.ts');const completed=await store.completeWork({workId:work.id,operationId:'policy-complete-01',expectedRevision:work.revision,previewDigest:completionDigest(work)});
 const body={weavingWorkId:work.id,completionVersionId:completed.completion.id,operationId:'policy-handoff-01'};
 await assert.rejects(()=>store.handoffWork(body),/確認/);
 const p=await store.handoffWork({...body,operationId:'policy-handoff-02',publicationConfirmed:true});const count=w.writes();assert.equal((await store.handoffWork({...body,operationId:'policy-handoff-02',publicationConfirmed:true})).id,p.id);assert.equal(w.writes(),count);

 w.queries.listReadingBooks=async()=>[{id:book,title:'隔離書'}];w.queries.listReadingNotes=async()=>[{id:note,kind:'excerpt',text:'人物與私密片段',metadata:{chapter:'第一章'}}];
 const candidate=(await w.load('lib/dojo/weavingWorkflow/sources.ts').productionSources().list('reading_note',null)).items[0];
 const selected=await store.createPair({operationId:'policy-selected-01',coreStatement:'自己的觀點',format:'text',selectionRequests:[{...ref,sourceVersion:candidate.version,start:0,end:5,contentKind:'quote'}]});
 let v=await store.patchWork({id:selected.works[0].id,expectedRevision:1,operationId:'policy-selected-draft',work:{draftText:'需要核對的成品'}});
 const cv=await store.completeWork({workId:v.id,operationId:'policy-selected-complete',expectedRevision:v.revision,previewDigest:completionDigest(v)});
 await store.patchWork({id:v.id,operationId:'policy-remove-after',expectedRevision:cv.work.revision,work:{textWorkflow:{...cv.work.textWorkflow,sourceSelections:[]}}});
 const owner=w.load('lib/dojo/learningFoundation/store.ts').learningOwner;
 w.records.set(crypto.randomUUID(),{title:model.SOURCE_POLICY_PREFIX+'fixture',value:{schema:1,owner,ref,discovery:'allow',publication:'private',revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}});
 await assert.rejects(()=>store.handoffWork({operationId:'policy-fixed-private',weavingWorkId:v.id,completionVersionId:cv.completion.id,publicationConfirmed:true}),e=>e.status===403);
 assert.equal((await store.readWork(v.id)).textWorkflow.sourceSelections.length,0,'historical completion retains source despite later removal');
 console.log('PASS actual completion remains private until explicit publication review; handoff retry remains idempotent');
}finally{await w.close();}

// Production single-record adapter rejects a false parent and never queries a library.
let reads=0;const raw={id:note,type:'paragraph',parent:{page_id:book},paragraph:{rich_text:[{plain_text:'只讀明確授權筆記'}]}};
const sdk={pages:{retrieve:async()=>{reads++;return{id:book,parent:{data_source_id:'db-books'},properties:{'書名':{title:[{plain_text:'隔離書'}]}}};}},blocks:{retrieve:async()=>{reads++;return raw;}},dataSources:{query:async()=>{throw Error('must not scan');}}};
const direct=loader({'@/lib/notion/client':{notion:()=>sdk,withNotionRateLimit:fn=>fn()},'@/lib/notion/schema':{DATA_SOURCES:{DB21_書籍庫:'db-books'}}})('lib/dojo/creativeSources/resolver.ts');
assert.equal((await direct.resolvePolicySource(ref)).text,'只讀明確授權筆記');assert.equal(reads,2);raw.parent.page_id=note;assert.equal(await direct.resolvePolicySource(ref),null);
console.log('PASS production permitted-identity adapter: only verified parent/block reads, no library scan');

const {normalizeKnowledgeClaim}=loader()('lib/dojo/knowledgeClaims.ts');
const claim=normalizeKnowledgeClaim({recordType:'knowledge-claim',title:'隔離主張',type:'experience',allowedUses:['perspective'],activeVersionId:'active-v1',currentVersionId:'candidate-v2',versions:[{id:'active-v1',number:1,statement:'已採用觀點',maturity:'K4',status:'active',adoptedBy:'Crystal',sources:[]},{id:'candidate-v2',number:2,statement:'尚未採用的新候選',maturity:'K2',status:'candidate',sources:[]}]},{id:note});
const claimResolver=loader({'../readingKnowledge/adapters':{createResolver:()=>({resolve:async()=>({title:'隔離主張',text:'尚未採用的新候選',sourceVersion:'candidate-v2'})})},'../knowledgeClaimStore':{getKnowledgeClaim:async()=>({claim})}})('lib/dojo/creativeSources/resolver.ts');
const approved=await claimResolver.resolvePolicySource({sourceType:'knowledge_claim',sourceId:note});assert.equal(approved.text,'已採用觀點');assert.equal(approved.version,'active-v1');
console.log('PASS permitted claim resolves adopted active version, never its newer unadopted candidate');
