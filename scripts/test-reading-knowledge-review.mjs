import assert from 'node:assert/strict';
import {loader} from './weaving-test-harness.mjs';
process.env.ACCESS_KEY='review-fixture';
const book='22222222-2222-4222-8222-222222222222',noteId='11111111-1111-4111-8111-111111111111',claimId='55555555-5555-4555-8555-555555555555',cardId='44444444-4444-4444-8444-444444444444';
const ref={kind:'reading_note',recordId:noteId,parentBookId:book};
const item={ref,title:'按摩',text:'內容',status:'thought',locator:'p1',href:'/reading',bookId:book,originalTopics:[],sourceVersion:null};
let failures=0;
async function check(name,fn){try{await fn();console.log('PASS',name);}catch(e){failures++;console.error('FAIL',name,e.message);}}
const bookPage={id:book,object:'page',parent:{type:'data_source_id',data_source_id:'db-books'},properties:{'書名':{title:[{plain_text:'按摩'}]},'讀次':{number:1}}};
const schema={DATA_SOURCES:{DB21_書籍庫:'db-books',DB22_洞察卡片庫:'db-cards',DB14_知識庫:'db-knowledge'}};
const propertyRow=(id,title,value)=>({id,parent:{type:'data_source_id',data_source_id:'db-knowledge'},properties:{'標題':{title:[{plain_text:title}]},'內容':{rich_text:[{plain_text:JSON.stringify(value)}]}}});
const wrapSdk=sdk=>({'@/lib/notion/client':{notion:()=>sdk,withNotionRateLimit:fn=>fn()},'@/lib/notion/schema':schema,'@/lib/dojo/learningFoundation/store':{learningOwner:'owner'}});
await check('transient relation enrichment stays retryable',async()=>{
 const l=loader(),{relationService}=l('lib/dojo/readingKnowledge/relations.ts');let fails=true;
 const card={...item,ref:{kind:'reading_insight',recordId:cardId},sources:[{kind:'reading_note',id:`${book}:${noteId}`,snapshot:'引用',version:null}]};
 const service=relationService({owner:'owner',resolve:async()=>item,enrich:async i=>{if(i.ref.kind==='reading_insight'&&fails)throw Error('timeout');return i;},scan:async()=>({items:[card],cursor:null,complete:true,warnings:[]})});
 const p=await service(ref);assert.equal(p.complete,false);assert.ok(p.cursor);fails=false;const q=await service(ref,p.cursor);assert.equal(q.complete,true);assert.equal(q.items.filter(r=>r.direction==='subsequent').length,1);
});
const claims=loader()('lib/dojo/knowledgeClaims.ts');
const claim=claims.newKnowledgeClaim({id:claimId,statement:'v1',sources:[{sourceType:'reading_note',sourceId:`${book}:${noteId}`,label:'來源',snapshot:'舊筆記',locator:'p1',url:''}]});
claim.versions.push({...claim.versions[0],id:'66666666-6666-4666-8666-666666666666',number:2,statement:'v2',sources:[]});claim.currentVersionId=claim.versions[1].id;
await check('relations retain prior claim-version references while search remains current only',async()=>{
 const sdk={dataSources:{query:async()=>({results:[propertyRow(claimId,'行光知識主張-test',claim)],has_more:false,next_cursor:null})}};
 const {productionAdapters}=loader(wrapSdk(sdk))('lib/dojo/readingKnowledge/adapters.ts');
 const old=await productionAdapters({includeHistory:true}).knowledge_claim.readBatch(null);assert.equal(old.items[0].sources.length,1);assert.match(old.items[0].sources[0].context,/1/);
 const current=await productionAdapters().knowledge_claim.readBatch(null);assert.equal(current.items[0].text,'v2');assert.equal(current.items[0].sources.length,0);
});
await check('book predicate accepts verified multiple-book associations on claims',async()=>{
 const {createSearchService}=loader()('lib/dojo/readingKnowledge/search.ts');
 const svc=createSearchService({knowledge_claim:{readBatch:async()=>({items:[{...item,ref:{kind:'knowledge_claim',recordId:claimId},bookId:undefined,bookIds:[book,'33333333-3333-4333-8333-333333333333']}],next:null,complete:true,readAt:'now'})}});
 const p=await svc({q:'',bookId:book,kinds:['knowledge_claim']},null,'owner');assert.equal(p.items.length,1);
});
await check('preview review secondary saved fields are searchable',async()=>{
 const serialized=loader()('lib/reading/notes.ts').serializeStructuredReadingNote({kind:'review',text:'',metadata:{openQuestion:'仍然想查證的肩頸問題',nextStep:'下次觀察'}});
 const raw={id:noteId,type:'paragraph',parent:{type:'page_id',page_id:book},paragraph:{rich_text:[{plain_text:serialized}]}};
 const sdk={dataSources:{query:async()=>({results:[bookPage],has_more:false,next_cursor:null})},blocks:{children:{list:async()=>({results:[raw],has_more:false,next_cursor:null})}}};
 const a=loader(wrapSdk(sdk))('lib/dojo/readingKnowledge/adapters.ts').productionAdapters().reading_note;
 const first=await a.readBatch(null),second=await a.readBatch(first.next);assert.match(second.items[0].text,/仍然想查證的肩頸問題/);assert.match(second.items[0].text,/下次觀察/);
});
await check('single-note resolution uses verified parent retrieval without library scan',async()=>{
 let reads=0;const raw={id:noteId,type:'paragraph',parent:{type:'page_id',page_id:book},paragraph:{rich_text:[{plain_text:'筆記'}]}};
 const sdk={pages:{retrieve:async()=>{reads++;return bookPage;}},blocks:{retrieve:async()=>{reads++;return raw;}},dataSources:{query:async()=>{throw Error('must not scan library');}}};
 const {resolve}=loader(wrapSdk(sdk))('lib/dojo/readingKnowledge/adapters.ts');assert.equal((await resolve(ref)).text,'筆記');assert(reads<=2);
 raw.parent.page_id='33333333-3333-4333-8333-333333333333';assert.equal(await resolve(ref),null);
});
await check('classification outage keeps readable unfiltered content and retries metadata',async()=>{
 const adapters={reading_note:{readBatch:async()=>({items:[item],next:null,complete:true,readAt:'now'})},reading_insight:{readBatch:async()=>({items:[],next:null,complete:true,readAt:'now'})},knowledge_claim:{readBatch:async()=>({items:[],next:null,complete:true,readAt:'now'})}};
 let fail=true;const l=loader({'./annotationStore':{listAnnotations:async()=>{if(fail)throw Error('DB14 down');return [];}},'./adapters':{productionAdapters:()=>adapters}});
 const {search}=l('lib/dojo/readingKnowledge/search.ts');const p=await search({q:''},null,'owner');assert.equal(p.items.length,1);assert.equal(p.complete,false);assert.equal(p.sourceStates.classification,'failed');assert.ok(p.cursor);fail=false;const next=await search({q:''},p.cursor,'owner');assert.equal(next.complete,true);
});
await check('classification-dependent results are retained without unbounded rescans during outage',async()=>{
 const {createSearchService}=loader()('lib/dojo/readingKnowledge/search.ts');let calls=0;
 const adapters={reading_note:{readBatch:async()=>{calls++;return {items:[item],next:'next',complete:false,readAt:'now'};}}};
 const classify=()=>({topics:['肩頸'],learningItemIds:[]});
 const unavailable=createSearchService(adapters,classify,{classificationAvailable:false});
 const p=await unavailable({q:'',kinds:['reading_note'],topic:'肩頸'},null,'owner');assert.equal(p.items.length,0);assert.equal(p.complete,false);
 await unavailable({q:'',kinds:['reading_note'],topic:'肩頸'},p.cursor,'owner');assert.equal(calls,1);
 const fixed=createSearchService(adapters,classify);const q=await fixed({q:'',kinds:['reading_note'],topic:'肩頸'},p.cursor,'owner');assert.equal(q.items[0].text,'內容');
});
await check('claim-book association verifies original note parent before including claim',async()=>{
 const current={...claim,currentVersionId:claim.versions[0].id};let parent=book;
 const sdk={dataSources:{query:async()=>({results:[propertyRow(claimId,'行光知識主張-test',current)],has_more:false,next_cursor:null})},pages:{retrieve:async()=>bookPage},blocks:{retrieve:async()=>({id:noteId,type:'paragraph',parent:{type:'page_id',page_id:parent},paragraph:{rich_text:[{plain_text:'原始筆記'}]}})}};
 const {productionAdapters}=loader(wrapSdk(sdk))('lib/dojo/readingKnowledge/adapters.ts');
 const valid=await productionAdapters({bookId:book}).knowledge_claim.readBatch(null);assert.deepEqual(valid.items[0].bookIds,[book]);
 parent='33333333-3333-4333-8333-333333333333';const foreign=await productionAdapters({bookId:book}).knowledge_claim.readBatch(null);assert.deepEqual(foreign.items[0].bookIds,[]);
});
if(failures)process.exitCode=1;
