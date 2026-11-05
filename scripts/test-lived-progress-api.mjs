// Real owner auth, routes and persistence logic; isolated Notion transport only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {createRequire,Module} from 'node:module';
import ts from 'typescript';
import {NextRequest} from 'next/server.js';
const require=createRequire(import.meta.url),cache=new Map(),rows=new Map();
const clone=v=>structuredClone(v),lock=await mkdtemp(join(tmpdir(),'lived-api-'));
process.env.ACCESS_KEY='isolated-lived-progress';process.env.LEARNING_WRITE_LOCK_DIR=lock;
let writes=0,failRead=false;
const io={readJsonRecord:async title=>{if(failRead)throw Error('read unavailable');return clone(rows.get(title)||null);},upsertJsonRecord:async(title,value)=>{writes++;const row={id:title,value:clone(value)};rows.set(title,row);return clone(row);},listJsonRecords:async()=>[]};
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>{if(s==='server-only')return {};const p=s.startsWith('@/')?resolve(s.slice(2)):s.startsWith('.')?resolve(dirname(file),s):null;if(p===resolve('lib/dojo/notionStore'))return io;if(p===resolve('lib/dojo/englishRhythm'))return {syncVocabForgeWeeklyBingo:async()=>({summary:{}})};if(p===resolve('lib/dojo/learningFoundation/store'))return {learningFoundation:{snapshot:async()=>({entities:[]})}};return p?load(p+'.ts'):require(s);};m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const req=(path,method='GET',body,auth=true,origin='http://localhost')=>new NextRequest('http://localhost'+path,{method,headers:{...(auth?{cookie:'dsc_access_key=isolated-lived-progress'}:{}),...(method!=='GET'?{'content-type':'application/json',origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
try{
 const route=load('app/api/dojo/lived-progress/route.ts'),daily=load('app/api/dojo/daily/route.ts'),f=load('lib/dojo/formal.ts'),domain=load('lib/dojo/livedProgress.ts');
 for(const path of ['/api/dojo/lived-progress','/api/dojo/lived-progress?mode=week&week=2026-11-04','/api/dojo/lived-progress?mode=catalog'])assert.equal((await route.GET(req(path,'GET',null,false))).status,401);
 assert.equal((await route.PUT(req('/api/dojo/lived-progress','PUT',{choices:domain.emptyChoices()},true,'https://foreign.example'))).status,403);assert.equal(writes,0);
 assert.equal((await route.PUT(req('/api/dojo/lived-progress','PUT',{choices:{}}))).status,400);assert.equal(writes,0);
 let choices=domain.emptyChoices();choices.ideas.push({id:'idea-1',text:'留一點空白',status:'recent',pickedOn:null,context:domain.BASE_CAPTURE_OPTIONS[0]});
 let response=await route.PUT(req('/api/dojo/lived-progress','PUT',{choices}));assert.equal(response.status,200);choices=(await response.json()).choices;assert.equal(choices.revision,1);
 assert.equal((await route.PUT(req('/api/dojo/lived-progress','PUT',{choices:{...choices,revision:0}}))).status,409);
 assert.equal((await (await route.GET(req('/api/dojo/lived-progress'))).json()).choices.ideas[0].context.scope,'life');
 failRead=true;assert.equal((await route.GET(req('/api/dojo/lived-progress'))).status,503);failRead=false;
 const date='2026-11-04',record=f.emptyDailyRecord(date);record.daytime.logs=[{id:'life-1',text:'備餐',time:'10:47',createdAt:'2026-11-03T23:47:00Z',context:domain.BASE_CAPTURE_OPTIONS[0]}];
 response=await daily.PUT(req('/api/dojo/daily','PUT',{date,record}));assert.equal(response.status,200);let saved=(await response.json()).record;
 assert.equal(saved.date,date);assert.equal(saved.daytime.logs[0].context.scope,'life');assert.equal(saved.daytime.logs[0].createdAt,record.daytime.logs[0].createdAt);
 const legacy=clone(saved);delete legacy.daytime.logs[0].context;legacy.morning.intention='舊分頁改別的欄位';
 response=await daily.PUT(req('/api/dojo/daily','PUT',{date,record:legacy}));assert.equal(response.status,200);saved=(await response.json()).record;assert.equal(saved.daytime.logs[0].context.scope,'life');
 assert.equal((await daily.PUT(req('/api/dojo/daily','PUT',{date,record}))).status,409);
 const result=await(await route.GET(req('/api/dojo/lived-progress?mode=week&week='+date))).json();assert.equal(result.days.length,7);assert.equal(result.days.find(d=>d.date===date).daytime.logs[0].id,'life-1');
 console.log('PASS lived progress API: owner/origin, persistence, revisions, read failures, old-client context preservation and unchanged date/instant');
}finally{await rm(lock,{recursive:true,force:true});}
