import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loader} from './weaving-test-harness.mjs';
const dir=await mkdtemp(join(tmpdir(),'rk-operations-'));process.env.LEARNING_WRITE_LOCK_DIR=dir;
const load=loader(),{runAnnotationOperation,inspectAnnotationOperation}=load('lib/dojo/readingKnowledge/annotationOperations.ts'),{learningWriteOutcome}=load('lib/dojo/learningFoundation/writeOutcome.ts');
const ref={kind:'book',recordId:'11111111-1111-4111-8111-111111111111'},payload={ref,topics:['按摩'],learningItemIds:[],inheritBookSubjects:true,expectedRevision:0,operationId:crypto.randomUUID()};
const saved={schema:1,owner:'test',ref,topics:['按摩'],learningItemIds:[],inheritBookSubjects:true,revision:1,createdAt:'now',updatedAt:'now'};
let calls=0;
try{
 const id=payload.operationId;const outcomes=await Promise.allSettled([1,2].map(()=>runAnnotationOperation('test',id,payload,async()=>async()=>{calls++;return saved;})));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length>=1,true);assert.equal(calls,1);
 assert.deepEqual(await runAnnotationOperation('test',id,payload,async()=>async()=>{throw Error('must not resend');}),saved);
 await assert.rejects(()=>runAnnotationOperation('test',id,{...payload,topics:['other']},async()=>async()=>saved),e=>e.status===409);
 assert.equal((await inspectAnnotationOperation('test',id)).state,'confirmed');
 const unknown=crypto.randomUUID();await assert.rejects(()=>runAnnotationOperation('test',unknown,payload,async()=>async()=>{const o=learningWriteOutcome.getStore();o.sent++;o.unresolved++;throw Error('network timeout');}));
 assert.equal((await inspectAnnotationOperation('test',unknown)).state,'unresolved');await access(join(dir,'learning-writer.lock'));
 await assert.rejects(()=>runAnnotationOperation('test',unknown,payload,async()=>async()=>{calls++;return saved;}),e=>e.status===503);assert.equal(calls,1);
 console.log('PASS durable operations: concurrent single dispatch, exact replay, payload conflict, unknown outcome retains real FS lock, no redispatch');
}finally{await rm(dir,{recursive:true,force:true});}
