import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module,createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map();let owner=true,archived=false,wrongParent=false,external=false,kind='file',mode='pdf',etag='v1',signature='one',redirect=false,missing=false,calls=0,privateSource=false;
const pageId=crypto.randomUUID(),blockId=crypto.randomUUID(),root=process.cwd();
const client={pages:{retrieve:async()=>({id:pageId,object:'page',parent:{type:'data_source_id',data_source_id:owner?load('lib/notion/schema.ts').DATA_SOURCES.DB14_知識庫:'another-owner'},archived,in_trash:false,properties:{標題:{title:[{plain_text:privateSource?'行光能力證明-private':'Owned source'}]}}})},blocks:{retrieve:async()=>({id:blockId,object:'block',type:kind,parent:{type:'page_id',page_id:wrongParent?crypto.randomUUID():pageId},archived:false,[kind]:{type:external?'external':'file',...(external?{external:{url:'https://example.com/fake'}}:{file:{url:'https://prod-files-secure.s3.us-west-2.amazonaws.com/owned/object?signature='+signature}})}})}};
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>s==='server-only'?{}:(s==='@/lib/notion/client'||(s.startsWith('.')&&resolve(dirname(file),s)===resolve('lib/notion/client')))?{notion:()=>client,withNotionRateLimit:fn=>fn()}:s.startsWith('@/')?load(resolve(root,s.slice(2))+'.ts'):s.startsWith('.')?load(resolve(dirname(file),s)+'.ts'):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls++;assert.equal(new URL(url).hostname,'prod-files-secure.s3.us-west-2.amazonaws.com');assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.headers.Range,'bytes=0-63');if(redirect)return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});if(missing)return new Response(null,{status:404});const bytes=Buffer.alloc(64);bytes.write(mode==='pdf'?'%PDF-1.7':mode==='audio'?'ID3':'not-native');return new Response(bytes,{status:206,headers:{'content-type':mode==='pdf'?'application/pdf':'audio/mpeg','content-range':'bytes 0-63/1234','etag':'"'+etag+'"'}})};
try{
 const {ownedNativeAttachment}=load('lib/dojo/assessments/nativeEvidence.ts');const get=()=>ownedNativeAttachment(pageId,blockId);
 const first=await get();assert.equal(first.status,'available','an owned native PDF must be verified through its actual range response');assert.ok(first.identity);assert.ok(!JSON.stringify(first).includes('signature'));
 signature='two';assert.equal((await get()).identity,first.identity);etag='v2';assert.notEqual((await get()).identity,first.identity);
 mode='audio';kind='audio';assert.equal((await get()).mediaKind,'audio');mode='invalid';assert.equal((await get()).status,'unverified');mode='pdf';kind='file';
 privateSource=true;const beforePrivate=calls;assert.equal((await get()).status,'unverified','private assessment pages must not become verified native evidence');assert.equal(calls,beforePrivate);privateSource=false;
 const before=calls;owner=false;await assert.rejects(get,/owner/);owner=true;wrongParent=true;await assert.rejects(get,/附件|來源|頁面/);wrongParent=false;assert.equal(calls,before);
 external=true;assert.equal((await get()).status,'unverified');external=false;redirect=true;assert.equal((await get()).status,'unverified');redirect=false;missing=true;assert.equal((await get()).status,'missing');missing=false;
 archived=true;const beforeArchived=calls;assert.equal((await get()).status,'archived');assert.equal(calls,beforeArchived);
 console.log('PASS native attachment verifier: owned page/block, signed range and media signature, stable identity across URL renewal, changed object identity, foreign/redirect/external refusal, missing/archived status, no signed URL persistence');
}finally{globalThis.fetch=original;}
