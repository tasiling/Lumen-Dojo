// Real NextRequest and owner guard; no network, credentials or production writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
import {NextRequest} from 'next/server.js';
import {request as httpRequest} from 'node:http';
import {isolatedServer} from './isolated-practice-server.mjs';
const require=createRequire(import.meta.url),cache=new Map();
function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;m.require=s=>s.startsWith('@/')?load(resolve(s.slice(2))+'.ts'):s.startsWith('.')?load(resolve(dirname(file),s)+'.ts'):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const {requireLearningOwner}=load('lib/dojo/learningFoundation/access.ts');
process.env.ACCESS_KEY='origin-isolated-test';
const publicHost='lumen-dojo.up.railway.app',publicOrigin=`https://${publicHost}`;
function request(origin,headers={},url='https://127.0.0.1:8080/api/dojo/bingo'){
 return new NextRequest(url,{method:'PUT',headers:{host:publicHost,cookie:'dsc_access_key=origin-isolated-test',...(origin===undefined?{}:{origin}),...headers}});
}
assert.doesNotThrow(()=>requireLearningOwner(request(publicOrigin)),'same public origin must survive a different internal Next.js hostname');
assert.doesNotThrow(()=>requireLearningOwner(request(publicOrigin,{'x-forwarded-proto':'https'},'http://127.0.0.1:8080/api/dojo/bingo')),'TLS termination must preserve the public HTTPS origin');
assert.doesNotThrow(()=>requireLearningOwner(request('http://localhost:3029',{host:'localhost:3029'},'http://localhost:3029/api/dojo/bingo')));
assert.doesNotThrow(()=>requireLearningOwner(request('https://lumen-dojo.up.railway.app',{host:'lumen-dojo.up.railway.app:443'})));
assert.doesNotThrow(()=>requireLearningOwner(request(undefined)),'authenticated server calls without Origin remain supported');
for(const origin of ['https://evil.example','https://lumen-dojo.up.railway.app.evil.example','http://lumen-dojo.up.railway.app','https://127.0.0.1:8080','null','not-a-url',`${publicOrigin}/path`]){
 assert.throws(()=>requireLearningOwner(request(origin)),e=>e.status===403,`reject ${origin}`);
}
assert.throws(()=>requireLearningOwner(request('https://evil.example',{'x-forwarded-host':'evil.example'})),e=>e.status===403,'untrusted forwarded host cannot widen the allowed origin');
assert.throws(()=>requireLearningOwner(request(publicOrigin,{'x-forwarded-proto':'https,http'})),e=>e.status===403,'ambiguous forwarded protocol must fail closed');
assert.throws(()=>requireLearningOwner(request(publicOrigin,{cookie:''})),e=>e.status===401,'same origin must still require the owner cookie');
delete process.env.ACCESS_KEY;
assert.throws(()=>requireLearningOwner(request(publicOrigin)),e=>e.status===503);
console.log('learning-owner-origin: proxy HTTPS, local origin, port normalization and foreign-origin/auth rejection passed');
if(process.argv.includes('--http')){
 const server=await isolatedServer(3036,'origin-isolated-test');
 try{
  for(const [origin,cookie,expected] of [[publicOrigin,'dsc_access_key=origin-isolated-test',400],['https://evil.example','dsc_access_key=origin-isolated-test',403],[publicOrigin,'',401]]){
   // Native HTTP preserves Host; Fetch may replace it with its URL's hostname.
   const status=await new Promise((resolve,reject)=>{
    const req=httpRequest(new URL(server.base+'/api/dojo/bingo'),{method:'PUT',headers:{host:publicHost,origin,'x-forwarded-proto':'https',cookie,'content-type':'application/json'}},response=>{response.resume();response.once('end',()=>resolve(response.statusCode));});
    req.once('error',reject);req.setTimeout(120000,()=>req.destroy(Error('isolated HTTP request timed out')));req.end('{}');
   });
   assert.equal(status,expected,'actual Next.js HTTP proxy request must reach the appropriate validation boundary');
  }
  console.log('learning-owner-origin: real Next.js HTTP proxy accepts same-site validation, rejects foreign sites and missing owner; no data written');
 }finally{server.stop();}
}
