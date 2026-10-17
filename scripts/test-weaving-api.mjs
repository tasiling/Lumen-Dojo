import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loader } from './weaving-test-harness.mjs';
assert.ok(existsSync('lib/dojo/weavingWorkflow/operations.ts'),'durable weaving operations must exist');
const load=loader();
const {runWeavingOperation,inspectWeavingOperation,operationDigest}=load('lib/dojo/weavingWorkflow/operations.ts');
const {trackLearningWrite}=load('lib/dojo/learningFoundation/writeOutcome.ts');
const dir=await mkdtemp(join(tmpdir(),'weaving-api-'));process.env.LEARNING_WRITE_LOCK_DIR=dir;
let checks=0,creates=0;const owner='fixture-owner';const rows=new Map();
const makeSteps=(lost=false,rejected=false)=>[{key:'one',findConfirmed:async()=>rows.get('one')??null,execute:async()=>trackLearningWrite(async()=>{if(rejected){const e=Error('rejected');e.rejected=true;throw e;}creates++;const r={id:'row-one',revision:1};rows.set('one',r);if(lost)throw Error('response lost');return r;},e=>e.rejected===true)}];
try {
 const r=await runWeavingOperation(owner,'operation-0001','create_work',{title:'first'},makeSteps());
 const replay=await runWeavingOperation(owner,'operation-0001','create_work',{title:'first'},makeSteps());
 assert.deepEqual(r.result,replay.result);assert.equal(creates,1);checks++;
 assert.equal(operationDigest({b:2,a:1}),operationDigest({a:1,b:2}));checks++;
 await assert.rejects(()=>runWeavingOperation(owner,'operation-0001','create_work',{title:'changed'},makeSteps()),e=>e.status===409);checks++;
 assert.equal(await inspectWeavingOperation('other-owner','operation-0001'),null);checks++;
 const fresh=loader();const restart=fresh('lib/dojo/weavingWorkflow/operations.ts');assert.equal((await restart.inspectWeavingOperation(owner,'operation-0001')).state,'confirmed');checks++;
 rows.clear();await assert.rejects(()=>runWeavingOperation(owner,'operation-reject','create_work',{},makeSteps(false,true)));assert.ok(!(await readdir(dir)).includes('learning-writer.lock'));
 const retry=await runWeavingOperation(owner,'operation-reject','create_work',{},makeSteps());assert.equal(retry.state,'confirmed');checks++;
 rows.clear();const before=creates;
 await assert.rejects(()=>runWeavingOperation(owner,'operation-unknown','create_work',{},makeSteps(true)),/未確認/);
 assert.equal(creates,before+1);assert.ok((await readdir(dir)).includes('learning-writer.lock'));assert.equal((await inspectWeavingOperation(owner,'operation-unknown')).state,'unresolved');
 await assert.rejects(()=>runWeavingOperation(owner,'operation-unknown','create_work',{},makeSteps()),e=>e.status===409);assert.equal(creates,before+1);checks++;
 console.log(`PASS weaving receipts ${checks}/${checks}: replay, digest, collision, owner, restart, rejection retry, unknown-result protection`);
} finally {await rm(dir,{recursive:true,force:true});delete process.env.LEARNING_WRITE_LOCK_DIR;}

// Production handlers with isolated Notion dispatch; no credentials or HTTP writes.
const {NextRequest}=await import('next/server.js');
const fixtureDir=await mkdtemp(join(tmpdir(),'weaving-handlers-'));process.env.LEARNING_WRITE_LOCK_DIR=fixtureDir;process.env.ACCESS_KEY='weaving-fixture';
const records=new Map();let writes=0;
let fixtureLoad;
const dispatch=async fn=>fixtureLoad('lib/dojo/learningFoundation/writeOutcome.ts').trackLearningWrite(async()=>{writes++;return fn();});
const queries={getKnowledgeEntry:async id=>{const row=records.get(id);if(!row)throw Error('missing or foreign row');return{id,標題:row.title,內容:JSON.stringify(row.value)};},listKnowledgeEntriesByPrefix:async prefix=>[...records].filter(([,r])=>r.title.startsWith(prefix)).map(([id,r])=>({id,標題:r.title,內容:JSON.stringify(r.value)})),listInsightCards:async()=>[],listReadingBooks:async()=>[]};
const mutations={createKnowledgeEntry:async row=>dispatch(()=>{const id=crypto.randomUUID();records.set(id,{title:row.標題,value:JSON.parse(row.內容)});return{id};}),updateKnowledgeEntry:async(id,row)=>dispatch(()=>{const old=records.get(id);records.set(id,{title:row.標題??old.title,value:row.內容?JSON.parse(row.內容):old.value});return{id};}),archiveKnowledgeEntry:async id=>dispatch(()=>{records.delete(id);return{id};})};
fixtureLoad=loader({'@/lib/notion/queries':queries,'@/lib/notion/mutations':mutations});
const req=(method,path,body,auth=true)=>new NextRequest('http://localhost'+path,{method,headers:{'content-type':'application/json',...(auth?{cookie:'dsc_access_key=weaving-fixture'}:{})},...(body?{body:JSON.stringify(body)}:{})});
try {
 const works=fixtureLoad('app/api/dojo/weaving-works/route.ts');
 assert.equal((await works.GET(req('GET','/api/dojo/weaving-works',null,false))).status,401,'actual handler must reject unauthenticated reads');
 const shuttles=fixtureLoad('app/api/dojo/weaving-shuttles/route.ts');
 const body={operationId:'handler-create-001',sourceType:'manual',sourceSnapshot:'已整理的真實題材',coreStatement:'本次自己的觀點',format:'text'};
 const createdResponse=await shuttles.POST(req('POST','/api/dojo/weaving-shuttles',body));assert.equal(createdResponse.status,201,JSON.stringify(await createdResponse.clone().json()));const created=await createdResponse.json();const work=created.bundle.works[0];
 const count=writes;const replay=await(await shuttles.POST(req('POST','/api/dojo/weaving-shuttles',body))).json();assert.equal(replay.bundle.shuttle.id,created.bundle.shuttle.id);assert.equal(writes,count);
 const patch={id:work.id,expectedRevision:work.revision,operationId:'handler-patch-001',work:{draftText:'保存的文字',status:'drafting'}};
 const savedResponse=await works.PATCH(req('PATCH','/api/dojo/weaving-works',patch));assert.equal(savedResponse.status,200);const saved=await savedResponse.json();assert.equal(saved.work.draftText,'保存的文字');
 const stale=await works.PATCH(req('PATCH','/api/dojo/weaving-works',{...patch,operationId:'handler-patch-stale',work:{draftText:'舊文字'}}));assert.equal(stale.status,409);
 assert.equal((await works.PATCH(req('PATCH','/api/dojo/weaving-works',{id:work.id,operationId:'handler-no-revision',work:{draftText:'no revision'}}))).status,409);
 assert.equal((await works.PATCH(req('PATCH','/api/dojo/weaving-works',{id:work.id,operationId:'handler-forged-001',expectedRevision:saved.work.revision,work:{coreVersionId:'forged'}}))).status,400);
 const beforeRead=writes;await works.GET(req('GET','/api/dojo/weaving-works'));assert.equal(writes,beforeRead);
 const concurrent=await Promise.all([works.PATCH(req('PATCH','/api/dojo/weaving-works',{id:work.id,operationId:'handler-concurrent-a',expectedRevision:saved.work.revision,work:{title:'A'}})),works.PATCH(req('PATCH','/api/dojo/weaving-works',{id:work.id,operationId:'handler-concurrent-b',expectedRevision:saved.work.revision,work:{title:'B'}}))]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 console.log('PASS actual weaving handlers: auth, create/replay, patch, stale/missing revision, protected identity, GET read-only, concurrent writers');
} finally {await rm(fixtureDir,{recursive:true,force:true});delete process.env.LEARNING_WRITE_LOCK_DIR;delete process.env.ACCESS_KEY;}
