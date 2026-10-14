import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {Module,createRequire} from 'node:module';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),cache=new Map();
function load(file){file=resolve(file);if(!existsSync(file))file=existsSync(file+'.tsx')?file+'.tsx':file+'.ts';if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.require=s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(resolve(dirname(file),s)):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports}
assert.ok(existsSync('app/components/AssessmentAttachmentUpload.tsx'),'new attachments need a staged upload form');
const {AttachmentUploadForm:Form}=load('app/components/AssessmentAttachmentUpload.tsx');
const defaults={file:null,busy:false,attachment:null,error:'',onFile:()=>{},onUpload:()=>{},onCancel:()=>{},onSelect:()=>{}};
const render=value=>renderToStaticMarkup(React.createElement(Form,{...defaults,...value}));
const empty=render({});assert.match(empty,/type="file"/);assert.ok(empty.includes('.m4a'));assert.match(empty,/<button type="button" disabled="">上傳/);
const selected=render({file:new File(['ID3'],'voice.mp3',{type:'audio/mpeg'})});assert.ok(selected.includes('尚未上傳'));assert.ok(selected.includes('voice.mp3'));assert.ok(!selected.includes('選入本次草稿'));
const failed=render({file:new File(['ID3'],'voice.mp3',{type:'audio/mpeg'}),error:'連線中斷'});assert.ok(failed.includes('重試同一份上傳'));assert.ok(failed.includes('role="alert"'));assert.ok(failed.includes('voice.mp3'));
const working=render({file:new File(['ID3'],'voice.mp3',{type:'audio/mpeg'}),busy:true});assert.ok(working.includes('上傳中'));assert.match(working,/<fieldset disabled=""/);
const ready=render({file:new File(['ID3'],'voice.mp3',{type:'audio/mpeg'}),attachment:{referenceId:'page',fileBlockId:'block',label:'voice.mp3',blockType:'audio'}});assert.ok(ready.includes('已上傳，尚未選入'));assert.ok(ready.includes('選入本次草稿'));assert.ok(ready.includes('再保存作答草稿'));assert.ok(!ready.includes('重試同一份上傳'));
console.log('PASS actual staged upload form SSR: file/audio types, pending name, no implicit selection, failed retry retains file, busy cancellation blocked, explicit successful selection/save distinction');
