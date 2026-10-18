import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {Module,createRequire} from 'node:module';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),cache=new Map();
function load(file){file=resolve(file);if(!existsSync(file))file=existsSync(file+'.tsx')?file+'.tsx':file+'.ts';if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.require=s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(resolve(dirname(file),s)):require(s);m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports}
const {default:Review}=load('app/components/AssessmentReview.tsx');
const attempt={id:'attempt',definitionVersion:1,revision:3,status:'submitted',answer:'answer',evidence:[{id:'proof1',kind:'professional-proof',label:'Original report',status:'available',nativeMediaIdentity:'native'}],definitionSnapshot:{confirmationMethods:['teacher'],professionalPractice:true,criteria:[{id:'one',description:'Explain',meetsDescription:'Clear',mandatory:true}]}};
const evaluation={attemptId:'attempt',definitionVersion:1,attemptRevision:3,evaluator:{type:'teacher',name:'Teacher',proofEvidenceId:'proof1'},criteria:[{criterionId:'one',verdict:'meets',feedback:'Clear'}]};
const proof={evidenceId:'proof1',attestation:{attemptId:'attempt',definitionVersion:1,answerDigest:'digest',evaluator:{type:'teacher',name:'Teacher'},nativeMediaIdentity:'native',reviewStatus:'verified'},provenance:'owner-recorded-source-correspondence'};
const render=(overrides={})=>renderToStaticMarkup(React.createElement(Review,{attempt,review:evaluation,proofs:[],proofNote:'Checked source',proofChecked:true,onChange:()=>{},onProofChange:()=>{},onRecord:()=>{},onSave:()=>{},...overrides}));
const html=render();assert.ok(html.includes('教師'));assert.ok(!html.includes('<option value="professional"'));assert.ok(!html.includes('<option value="self"'));assert.ok(html.includes('外部評核者登入驗證'));assert.ok(html.includes('Original report'));assert.match(html,/<button disabled="">保存本次評核/,'unrecorded human evaluator cannot be saved from UI');
assert.ok(!render({proofs:[proof]}).includes('<button disabled="">保存本次評核'),'matching recorded source enables explicit save');
assert.match(render({proofs:[proof],review:{...evaluation,evaluator:{...evaluation.evaluator,name:'Another'}}}),/<button disabled="">保存本次評核/);
assert.match(render({proofChecked:false}),/<button disabled="">登錄來源對應/);
assert.match(render({attempt:{...attempt,evidence:[{...attempt.evidence[0],nativeMediaIdentity:undefined}]}}),/<button disabled="">登錄來源對應/);
assert.ok(render({proofs:[proof]}).includes('已登錄來源對應'));
console.log('PASS actual human review form SSR: configured roles, explicit correspondence, native proof requirement, no external login claim, matching evaluator save gate');

assert.ok(!render({attempt:{...attempt,definitionSnapshot:{...attempt.definitionSnapshot,professionalPractice:false}}}).includes('<option value="self"'),'nonprofessional teacher-only rubric must not offer unconfirmable self review');
