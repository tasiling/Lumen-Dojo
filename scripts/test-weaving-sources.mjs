import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loader } from './weaving-test-harness.mjs';
assert.ok(existsSync('lib/dojo/weavingWorkflow/sources.ts'),'source resolver must exist');
const {sourceResolver}=loader()('lib/dojo/weavingWorkflow/sources.ts');
const text='第一段😀。第二段。第一段😀。';
const candidate={sourceType:'reading_note',sourceId:'note',label:'書名',version:'v1',locator:'第3章',contentKind:'quote',text,availability:'available'};
const adapter={get:async(kind,id)=>kind==='reading_note'&&id==='note'?candidate:null,page:async()=>({items:[candidate],cursor:'next'})};
const resolver=sourceResolver(adapter);const first={sourceType:'reading_note',sourceId:'note',sourceVersion:'v1',start:7,end:11,contentKind:'quote'};
const selected=await resolver.resolveSelections([first]);assert.equal(selected[0].selectedText,text.slice(7,11));assert.ok(!selected[0].selectedText.includes('第一段'));assert.equal(selected[0].locator,'第3章');
await assert.rejects(()=>resolver.resolveSelections([{...first,sourceVersion:'v0'}]),e=>e.status===409);
await assert.rejects(()=>resolver.resolveSelections([{...first,sourceId:'foreign'}]),e=>e.status===403);
await assert.rejects(()=>resolver.resolveSelections([{...first,start:4,end:5}]),/字元/);
await assert.rejects(()=>resolver.resolveSelections(Array.from({length:31},()=>first)),/30/);
await assert.rejects(()=>resolver.resolveSelections([{...first,contentKind:'experience'}]),/種類/);
assert.equal((await resolver.list('reading_note',null)).cursor,'next');
console.log('PASS precise sources 7/7: ranges, provenance, stale version, owner, surrogate boundary, limits, pagination');
const {fixture}=await import('./weaving-fixture.mjs');const f=await fixture();
try{
 let noteText='第一段😀。第二段自己的理解。第一段😀。';
 f.queries.listReadingBooks=async()=>[{id:'owned-book',title:'自己的書'}];f.queries.listReadingNotes=async id=>{assert.equal(id,'owned-book');return[{id:'owned-note',kind:'excerpt',text:noteText,metadata:{chapter:'第3章',location:'第5頁',reflection:'我自己的理解'},createdAt:'2026-10-17'}];};
 const sources=f.load('lib/dojo/weavingWorkflow/sources.ts'),resolver=sources.productionSources();const page=await resolver.list('reading_note',null);assert.equal(page.items.length,2);const c=page.items[0];const request={sourceType:c.sourceType,sourceId:c.sourceId,sourceVersion:c.version,start:7,end:17,contentKind:c.contentKind};
 await assert.rejects(()=>resolver.resolveSelections([{...request,sourceId:'foreign-book:owned-note'}]),e=>e.status===403);
 const store=f.load('lib/dojo/weavingWorkflow/store.ts');const bundle=await store.createPair({operationId:'selected-pair-001',coreStatement:'我自己的觀點',selectionRequests:[request],format:'text'});let work=bundle.works[0];assert.equal(work.textWorkflow.sourceSelections[0].selectedText,noteText.slice(7,17));assert.ok(!bundle.shuttle.sourceSnapshot.includes('第一段'));
 await assert.rejects(()=>store.patchWork({id:work.id,operationId:'fake-snapshot-001',expectedRevision:work.revision,work:{textWorkflow:{...work.textWorkflow,sourceSelections:[{...work.textWorkflow.sourceSelections[0],selectedText:'偽造全文'}]}}}),e=>e.status===403);
 work=await store.patchWork({id:work.id,operationId:'source-draft-001',expectedRevision:work.revision,work:{draftText:'自己的創作'}});noteText+='來源已變更';
 await assert.rejects(()=>resolver.resolveSelections([request]),e=>e.status===409);
 const {completionDigest}=f.load('lib/dojo/weavingWorkflow/completions.ts');await assert.rejects(()=>store.completeWork({workId:work.id,operationId:'source-changed-001',expectedRevision:work.revision,previewDigest:completionDigest(work)}),e=>e.status===409);
 assert.equal((await store.readWork(work.id)).textWorkflow.sourceSelections[0].selectedText,work.textWorkflow.sourceSelections[0].selectedText);
 console.log('PASS production reading resolver + handlers: owner book/block membership, separate understanding, exact snapshot, forged snapshot rejected, changed-source completion blocked, historical snapshot preserved');
}finally{await f.close();}
const k=await fixture();
try{
 const {normalizeKnowledgeClaim}=k.load('lib/dojo/knowledgeClaims.ts');const make=(id,patch={})=>normalizeKnowledgeClaim({recordType:'knowledge-claim',title:id,type:'experience',allowedUses:['perspective'],activeVersionId:'v1',currentVersionId:'v1',versions:[{id:'v1',number:1,statement:'我自己的經驗觀察',maturity:'K4',status:'active',adoptedBy:'Crystal',generatedBy:'llm_assisted',sources:[]}],...patch},{id});
 k.claims.push(make('adopted'),make('unadopted',{activeVersionId:null,versions:[{id:'v1',statement:'AI 候選',maturity:'K4',status:'candidate',adoptedBy:null}]}),make('wrong-use',{allowedUses:['evidence']}));
 const resolver=k.load('lib/dojo/weavingWorkflow/sources.ts').productionSources();const p=await resolver.list('knowledge_claim',null);assert.deepEqual(p.items.map(c=>c.sourceId),['adopted']);assert.equal(p.items[0].contentKind,'experience','adopted experiential claim keeps its content kind');
 const c=p.items[0];k.claims[0].versions.push({...k.claims[0].versions[0],id:'v2',number:2,statement:'更新後經驗'});k.claims[0].activeVersionId='v2';
 await assert.rejects(()=>resolver.resolveSelections([{sourceType:'knowledge_claim',sourceId:c.sourceId,sourceVersion:c.version,start:0,end:2,contentKind:c.contentKind}]),e=>e.status===409);
 console.log('PASS adopted Claim version + K4 allowed-use filter + unadopted exclusion + experiential provenance');
}finally{await k.close();}
