import assert from 'node:assert/strict';
import {fixture} from './weaving-fixture.mjs';
let f=await fixture();
try{
 const store=f.load('lib/dojo/weavingWorkflow/store.ts'),ops=f.load('lib/dojo/weavingWorkflow/operations.ts');
 const create=f.mutations.createKnowledgeEntry;let calls=0;
 f.mutations.createKnowledgeEntry=async row=>{if(++calls===2)return f.load('lib/dojo/learningFoundation/writeOutcome.ts').trackLearningWrite(async()=>{const e=Error('explicit isolated rejection');e.rejected=true;throw e;},e=>e.rejected);return create(row);};
 const input={operationId:'partial-pair-001',sourceType:'manual',sourceSnapshot:'成熟題材',coreStatement:'核心觀點',format:'text'};
 await assert.rejects(()=>store.createPair(input));const partial=await ops.inspectWeavingOperation(store.WEAVING_OWNER,input.operationId);assert.equal(partial.steps.shuttle,'confirmed');assert.equal(partial.steps.work,'rejected');assert.equal(f.records.size,1);
 const result=await store.createPair(input);assert.equal(result.shuttle.id,partial.result.shuttle.id);assert.equal(f.records.size,2);assert.equal(calls,3);
 const title=[...f.records.values()][0].title;f.records.set('duplicate',{title,value:[...f.records.values()][0].value});const duplicateStep=store.createStep('行光織光杼-','shuttle',()=>({}));await assert.rejects(()=>duplicateStep.findConfirmed(partial),e=>e.status===409);f.records.delete('duplicate');
 const before=f.writes();await assert.rejects(()=>store.createPair({...input,operationId:'bad-template-001',templateKey:'nonexistent'}));assert.equal(f.writes(),before,'invalid template must reject before mother create');
 console.log('PASS partial mother/child confirmed rejection resumes same parent, duplicate identity blocks, invalid template has no writes');
}finally{await f.close();}
f=await fixture();
try{
 const store=f.load('lib/dojo/weavingWorkflow/store.ts'),formal=f.load('lib/dojo/formal.ts');
 f.records.set('legacy',{title:formal.WEAVING_PROJECT_TITLE_PREFIX+'old',value:{version:2,recordType:'weaving-project',title:'舊作品',coreStatement:'舊核心',sourceType:'manual',sourceSnapshot:'舊來源',format:'text',formatSubtype:'article',status:'sent_to_liaojie',draftText:'完整舊文字',outputUrl:'',audience:''}});
 f.records.set('legacy-publication',{title:formal.LIAOJIE_PROJECT_TITLE_PREFIX+'old',value:{weavingProjectId:'legacy',title:'舊發布企劃',sourceDraftSnapshot:'舊版已交接正文',status:'ready'}});
 const m=await store.migrateLegacy({operationId:'migrate-old-001',legacyProjectId:'legacy'});const work=m.works[0];assert.equal(work.legacyProjectId,'legacy');assert.equal(work.finalSnapshot,'完整舊文字');assert.equal(f.records.get('legacy').value.status,'archived');
 const handoff=await store.handoffWork({operationId:'legacy-handoff-001',weavingWorkId:work.id});assert.equal(handoff.id,'legacy-publication');assert.equal(handoff.sourceDraftSnapshot,'舊版已交接正文');assert.equal(f.records.size,4);
 const version0={...f.records.get(work.id).value,revision:undefined,status:'drafting'};f.records.get(work.id).value=version0;const saved=await store.patchWork({id:work.id,expectedRevision:0,operationId:'legacy-revision-001',work:{draftText:'繼續舊稿'}});assert.equal(saved.revision,1);
 console.log('PASS legacy upgrade ID mapping + full snapshot + soft archive + existing publication reused unchanged + revision0 first save');
}finally{await f.close();}
