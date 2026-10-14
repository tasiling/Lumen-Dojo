import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {Module,createRequire} from 'node:module';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),cache=new Map();
function load(file){file=resolve(file);if(!existsSync(file))file=existsSync(file+'.tsx')?file+'.tsx':file+'.ts';if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.require=s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(resolve(dirname(file),s)):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports}
assert.ok(existsSync('app/components/NativeAttachmentView.tsx'),'native evidence must have private media controls');
const {default:View}=load('app/components/NativeAttachmentView.tsx');
const source={referenceId:crypto.randomUUID(),fileBlockId:crypto.randomUUID(),kind:'audio',label:'本次錄音',status:'available',nativeMediaIdentity:'a'.repeat(64)};
const render=(value)=>renderToStaticMarkup(React.createElement(View,{evidence:value}));
const html=render(source);assert.match(html,/<audio/);assert.match(html,/controls=""/);assert.match(html,/preload="none"/);assert.ok(html.includes('/api/dojo/assessments/media?'));assert.ok(html.includes('identity='+'a'.repeat(64)));assert.ok(!html.includes('s3.'));assert.ok(!html.includes('autoplay'));
assert.ok(render({...source,kind:'file'}).includes('查看原生附件'));assert.ok(render({...source,kind:'file'}).includes('target="_blank"'));
for(const status of ['missing','archived','unverified'])assert.ok(!render({...source,status}).includes('/api/dojo/assessments/media?'));
assert.ok(!render({...source,kind:'text'}).includes('/api/dojo/assessments/media?'));
assert.ok(render({...source,status:undefined,nativeMediaIdentity:undefined}).includes('/api/dojo/assessments/media?'),'owned catalog previews use the same private route without claiming verification');
console.log('PASS real native media controls SSR: private URLs, saved identity, audio seek controls without autoplay/preload, unavailable sources gated, file opens without replacing unsaved workspace');
