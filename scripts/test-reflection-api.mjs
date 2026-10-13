import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {Module,createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map();
const daily={id:'daily-fixture',value:{updatedAt:'v1',evening:{highlight:'秘密來源片段'}}};
let reads=0,writes=0;
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>s==='server-only'?{}:s==='@/lib/dojo/notionStore'?{readJsonRecord:async()=>{reads++;return daily},upsertJsonRecord:async()=>{writes++;throw Error('unexpected write')}}:s.startsWith('@/')?load(resolve(s.slice(2))+'.ts'):s.startsWith('.')?load(resolve(dirname(file),s)+'.ts'):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const dir=await mkdtemp(join(tmpdir(),'r24-api-'));process.env.LEARNING_WRITE_LOCK_DIR=dir;process.env.ACCESS_KEY='isolated-r24';
try {
 const {NextRequest}=require('next/server'),{ACCESS_KEY_COOKIE}=load('lib/access-key.ts');
 const api=load('app/api/dojo/reflections/route.ts');
 function req(method='GET',body,authorized=true,query='',origin='http://localhost:3000'){return new NextRequest('http://localhost:3000/api/dojo/reflections'+query,{method,headers:{...(authorized?{cookie:`${ACCESS_KEY_COOKIE}=isolated-r24`}:{}),origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
 assert.equal((await api.GET(req('GET',undefined,false))).status,401);assert.equal(reads,0);
 assert.equal((await api.POST(req('POST',{},true,'','https://other.test'))).status,403);
 const input={createRequestId:crypto.randomUUID(),toolId:'awareness',date:'2026-10-13',source:{id:daily.id,date:'2026-10-13',field:'highlight',revision:'v1',excerpt:'秘密來源片段'},status:'pending'};
 assert.equal((await api.POST(req('POST',{...input,source:{...input.source,excerpt:'偽造片段'}}))).status,409);
 const first=await api.POST(req('POST',input));assert.equal(first.status,201);const {note}=await first.json();
 assert.equal(note.answers['awareness.q1'],'秘密來源片段');
 daily.value.updatedAt='v2';assert.equal((await api.POST(req('POST',input))).status,201);
 const list=await api.GET(req());assert.equal(list.headers.get('cache-control'),'private, no-store');assert.ok(!JSON.stringify(await list.json()).includes('秘密來源片段'));
 const save=await api.PATCH(req('PATCH',{id:note.id,revision:note.revision,patch:{answers:{'awareness.q2':'仍然難過'},status:'completed'}}));assert.equal(save.status,200);
 assert.equal((await api.PATCH(req('PATCH',{id:note.id,revision:note.revision,patch:{title:'stale'}}))).status,409);
 assert.equal((await api.GET(req('GET',undefined,true,'?id=../../escape'))).status,400);
 assert.equal((await api.POST(req('POST',{...input,createRequestId:crypto.randomUUID(),source:{...input.source,revision:'v1'}}))).status,409);
 assert.equal(writes,0);console.log('PASS reflection API: auth, cross-origin, forged/stale source, retries, drafts/complete, revision conflict, metadata privacy, private no-store, no Notion mutations');
} finally {await rm(dir,{recursive:true,force:true});delete process.env.ACCESS_KEY;delete process.env.LEARNING_WRITE_LOCK_DIR;}
