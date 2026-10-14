import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {Module,createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const sourceRoot=process.env.VF_SOURCE_ROOT;
if(!sourceRoot)throw Error('Set VF_SOURCE_ROOT to the real reviewed R2-5B source checkout; source compatibility is not a mock PASS');
const sourceRequire=createRequire(join(sourceRoot,'package.json')),express=sourceRequire('express');
const {mountReviewEventRoutes}=await import(pathToFileURL(join(sourceRoot,'db/review-event-routes.js')));
const {fixtureSession}=await import(pathToFileURL(join(sourceRoot,'test-support/review-events-fixtures.js')));
const {buildReviewCompletion}=await import(pathToFileURL(join(sourceRoot,'src/domain/review-events.js')));
const rows=Array.from({length:51},(_,i)=>{const session=fixtureSession();session.id=`e5b00000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;for(const e of Object.values(session.entries))e.receipt.sessionId=session.id;return {draft:buildReviewCompletion(session),updated_at:`2026-10-14T00:00:00.${String(i+1).padStart(6,'0')}Z`,session_id:session.id};});
const upper='2026-10-14T01:00:00.000001Z',queries=[];
// Only PostgreSQL transport is isolated. Query validation, signed cursor creation,
// decoding, source projection and actual authenticated HTTP handler are real5B code.
const pool={connect:async()=>({release(){},async query(sql,args){if(sql.includes('clock_timestamp'))return{rows:[{upper}]};if(sql.includes('FROM vf_review_completion_events')){const [,after,window,last,lastId,limit]=args;return{rows:rows.filter(r=>(!after||r.updated_at>after)&&r.updated_at<=window&&(!last||r.updated_at>last||(r.updated_at===last&&r.session_id>lastId))).slice(0,limit)};}return{rows:[]};}})};
const app=express();mountReviewEventRoutes(app,{pool,owner:'fixture-owner',cursorSecret:'fixture-secret',requireAuth:(_q,res)=>res.status(401).json({error:'unauthorized'}),requireLumenAuth:(req,res,next)=>{queries.push({...req.query});return req.headers.authorization==='Bearer fixture-secret'?next():res.status(401).json({error:'unauthorized'});}});
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
const require=createRequire(import.meta.url),cache=new Map();
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.require=s=>s.startsWith('.')?load(resolve(dirname(file),s)+'.ts'):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const {vocabAdapter}=load('lib/dojo/externalResults/vocabAdapter.ts'),{vocabService}=load('lib/dojo/externalResults/vocabService.ts'),{eventService,eventBody}=load('lib/dojo/practiceEvents/service.ts'),{emptyDailyRecord}=load('lib/dojo/formal.ts');
const adapter=()=>vocabAdapter({origin,secret:'fixture-secret',sourceOwner:'fixture-owner'});
try{
 await test('real VF HTTP/store rejects bare milliseconds, receiver normalizes the initial source query',async()=>{const raw=await fetch(origin+'/api/integrations/vocabforge/results?after=1970-01-01T00:00:00.000Z',{headers:{authorization:'Bearer fixture-secret'}});assert.equal(raw.status,400);const page=await adapter().page('1970-01-01T00:00:00.000Z',null);assert.equal(page.results.length,50);assert.equal(queries.at(-1).after,'1970-01-01T00:00:00.000000Z');});
 await test('51-event real VF export preserves its opaque signed cursor exactly',async()=>{const first=await adapter().page('1970-01-01T00:00:00.000000Z',null);assert.match(first.nextCursor,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);const second=await adapter().page('1970-01-01T00:00:00.000000Z',first.nextCursor,first.windowUpper);assert.equal(second.results.length,1);assert.equal(second.nextCursor,null);assert.equal(queries.at(-1).cursor,first.nextCursor);assert.equal(queries.at(-1).windowUpper,first.windowUpper);assert.equal(queries.at(-1).after,'1970-01-01T00:00:00.000000Z');});
 await test('real source page checkpoint survives restart, accepts the second page once and preserves microseconds',async()=>{const dir=mkdtempSync(join(tmpdir(),'r25c-vf-source-'));try{let receipts=new Map(),events=new Map(),bodies=new Map(),checkpoint=null,daily=emptyDailyRecord('2026-10-13');const persist=()=>writeFileSync(join(dir,'state.json'),JSON.stringify({receipts:[...receipts],events:[...events],bodies:[...bodies],checkpoint,daily}));const build=()=>{const api=eventService({owner:'dojo-owner',get:async id=>events.get(id)??null,create:async e=>{events.set(e.id,e);persist();},update:async e=>{events.set(e.id,e);persist();},body:async e=>{if(!bodies.has(e.learningRecordId))bodies.set(e.learningRecordId,eventBody(e));persist();},daily:async()=>daily,saveDaily:async(_date,value)=>{daily=value;persist();},weekly:async()=>null,saveWeekly:async()=>{throw Error('unbound weekly');},assertKnownOutcome(){}});return vocabService({owner:'dojo-owner',read:async id=>receipts.get(id)??null,save:async r=>{receipts.set(r.id,r);persist();},checkpoint:async()=>checkpoint,saveCheckpoint:async c=>{checkpoint=c;persist();},acceptSource:async source=>{const before=events.size,event=await api.acceptVocab(source);return{event,created:events.size>before};},retrySource:id=>api.retry(id)},adapter(),()=> '2026-10-14T02:00:00.000Z');};
 const first=await build().sync(false);assert.equal(first.remaining,true);assert.equal(events.size,50);assert.equal(checkpoint.after,'1970-01-01T00:00:00.000000Z');const signed=checkpoint.cursor;const disk=JSON.parse(readFileSync(join(dir,'state.json'),'utf8'));receipts=new Map(disk.receipts);events=new Map(disk.events);bodies=new Map(disk.bodies);checkpoint=disk.checkpoint;daily=disk.daily;
 const second=await build().sync(false);assert.equal(second.remaining,false);assert.equal(events.size,51);assert.equal(bodies.size,51);assert.equal(queries.at(-1).cursor,signed);assert.equal(daily.practiceEventVocabulary.events.length,51);assert.equal(daily.englishRhythm.vocabForgeRounds,5);assert.equal(checkpoint.after,upper);
 assert.equal((await build().sync(true)).remaining,true);await build().sync(false);assert.equal(events.size,51);assert.equal(bodies.size,51);
 checkpoint={...checkpoint,after:'2026-10-14T00:00:00.000001Z',lastReconciledAt:'2026-10-14T02:00:00.000Z'};await build().sync(false);assert.equal(queries.at(-1).after,'2026-10-14T00:00:00.000001Z','never round away microseconds');
 checkpoint={...checkpoint,cursor:null,after:'2026-10-14T00:00:00.000Z',lastReconciledAt:'2026-10-14T02:00:00.000Z'};await build().sync(false);assert.equal(queries.at(-1).after,'2026-10-14T00:00:00.000000Z','upgrade existing millisecond-only checkpoint');
 }finally{rmSync(dir,{recursive:true,force:true});}});
}finally{await new Promise(r=>server.close(r));}
