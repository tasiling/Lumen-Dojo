import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {Module} from 'node:module';import ts from 'typescript';
const m=new Module('editor');m._compile(ts.transpileModule(readFileSync('lib/dojo/assessments/editor.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'editor');
const {answerEvidence,aiFeedback,preparedExportText,editorDirty,initialEvaluation}=m.exports;
const refs=[{id:'other',kind:'learning-record',label:'saved source',referenceId:'source'}];
assert.deepEqual(answerEvidence(refs,'work',false),refs);
const updated=answerEvidence(refs,'work',true);assert.equal(updated.length,2);assert.equal(updated[1].selectedText,'work');assert.equal(refs.length,1);
assert.deepEqual(answerEvidence(updated,'changed',false),refs);assert.equal(answerEvidence(updated,'changed',true).length,2);assert.equal(answerEvidence(updated,'changed',true)[1].selectedText,'changed');
assert.throws(()=>answerEvidence(refs,' ',true),/空白/);
assert.throws(()=>aiFeedback('{"evaluator":{"type":"teacher"}}'),/AI/);
assert.equal(aiFeedback('{"evaluator":{"type":"ai"}}').evaluator.type,'ai');
const pack={text:'PRIVATE',includeAnswer:true,evidenceIds:['source']};assert.equal(preparedExportText(pack,true,['source']),'PRIVATE');assert.equal(preparedExportText(pack,false,['source']),'');assert.equal(preparedExportText(pack,true,[]),'');
assert.equal(editorDirty('submitted',false,'changed','saved',''),true);assert.equal(editorDirty('submitted',false,'saved','saved','pasted AI'),true);assert.equal(editorDirty('submitted',false,'saved','saved',''),false);assert.equal(editorDirty('draft',true,'saved','saved',''),true);
console.log('PASS editor contracts: explicit answer evidence, preserved source refs, no duplicate evidence, blank refusal, imported AI type kept distinct');

assert.equal(editorDirty('submitted',false,'saved','saved','',true),true,'unsaved proof inputs must trigger leave/reload guard');
const professionalAttempt={id:'a',definitionVersion:1,revision:3,evaluation:null,definitionSnapshot:{professionalPractice:true,confirmationMethods:['professional'],criteria:[{id:'c'}]}};
assert.equal(initialEvaluation(professionalAttempt,[]).evaluator.type,'professional','professional rubric cannot open self review');
const recorded={evidenceId:'proof',attestation:{evaluator:{type:'professional',name:'Examiner'}}};
assert.equal(initialEvaluation(professionalAttempt,[recorded]).evaluator.proofEvidenceId,'proof','reload restores recorded examiner source');
assert.equal(initialEvaluation({...professionalAttempt,evaluation:{evaluator:{type:'ai',name:'GPT'}}},[]).evaluator.type,'ai','saved AI review stays AI');

assert.equal(initialEvaluation({...professionalAttempt,definitionSnapshot:{...professionalAttempt.definitionSnapshot,professionalPractice:false,confirmationMethods:['teacher']}},[]).evaluator.type,'teacher','teacher-only rubric must not default to self');
