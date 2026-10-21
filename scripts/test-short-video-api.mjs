import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './weaving-fixture.mjs';
const f=await fixture();try{
 const api=f.load('app/api/dojo/short-video/route.ts'),store=f.load('lib/dojo/shortVideo/store.ts'),w=f.load('lib/dojo/weavingWorkflow/store.ts'),cm=f.load('lib/dojo/weavingWorkflow/completions.ts');
 const pair=await w.createPair({operationId:'video-pair-test',sourceType:'manual',sourceSnapshot:'虛構題材：雨後小芽',coreStatement:'允許慢慢生長',format:'text'}),work=await w.patchWork({operationId:'video-write-test',id:pair.works[0].id,expectedRevision:1,work:{title:'雨停以後',draftText:'休息，也在生長。'}}),fixed=await w.completeWork({operationId:'video-fixed-test',workId:work.id,expectedRevision:work.revision,previewDigest:cm.completionDigest(work)});
 assert.equal((await api.GET(f.req('GET','/api/dojo/short-video',null,false))).status,401);
 const create={operationId:'video-create-test',completionId:fixed.completion.id},b=await store.createVideo(create);assert.equal((await store.createVideo({...create,operationId:'video-dedupe-test'})).project.id,b.project.id);
 const source=JSON.parse(await readFile('docs/creative-short-video-evidence/project-source.json','utf8'));
 const img=await f.load('lib/dojo/illustrated/assets.ts').saveAsset(await readFile('docs/creative-illustrated-evidence/assets/rain-sprout.png'));assert.equal(img.id,source.draft.scenes[0].image.assetId);
 const media=f.load('lib/dojo/shortVideo/media.ts');await media.saveMedia(await readFile('docs/creative-short-video-evidence/test-tone.wav'));
 const saved=await store.saveVideo({operationId:'video-save-test',projectId:b.project.id,expectedRevision:b.project.revision,draft:source.draft});assert.equal(saved.versions.length,2);
 await assert.rejects(()=>store.saveVideo({operationId:'video-stale-test',projectId:b.project.id,expectedRevision:1,draft:source.draft}),e=>e.status===409);
 const video=await media.saveMedia(await readFile('docs/creative-short-video-evidence/final.mp4'));assert.equal(video.kind,'video');
 const output={operationId:'video-output-test',projectId:b.project.id,expectedRevision:saved.project.revision,versionId:saved.version.id,assetId:video.id,tool:'Hyperframes 0.8.181',returnNote:'隔離影片，字幕及試製聲音已核對',reviewed:true,publicationConfirmed:true};
 await assert.rejects(()=>store.outputVideo({...output,operationId:'video-no-review',reviewed:false}));
 const original=f.mutations.updateKnowledgeEntry;let fail=true;f.mutations.updateKnowledgeEntry=async(...args)=>{if(fail&&args[0]===b.project.id){fail=false;throw Error('before dispatch');}return original(...args);};await assert.rejects(()=>store.outputVideo(output));f.mutations.updateKnowledgeEntry=original;
 const policies=f.load('lib/dojo/creativeSources/store.ts').sourcePolicies,permit=policies.assertPublication;policies.assertPublication=async()=>{throw new(f.load('lib/dojo/learningFoundation/model.ts').LearningError)('private',403);};await assert.rejects(()=>store.outputVideo(output),e=>e.status===403);policies.assertPublication=permit;
 const done=await store.outputVideo(output),count=f.writes();assert.equal((await store.outputVideo(output)).output.id,done.output.id);assert.equal(f.writes(),count);
 const hand={operationId:'video-handoff-test',projectId:b.project.id,expectedRevision:done.project.revision,outputId:done.output.id,publicationConfirmed:true},result=await store.handoffVideo(hand);assert.deepEqual(result.publication.videoOutputRefs,[done.output.id]);assert.equal((await store.handoffVideo(hand)).publication.id,result.publication.id);
 const range=f.load('app/api/dojo/short-video/media/route.ts');assert.equal((await range.GET(f.req('GET','/api/dojo/short-video/media?id='+video.id,null,false))).status,401);const req=f.req('GET','/api/dojo/short-video/media?id='+video.id);req.headers.set('range','bytes=0-31');const partial=await range.GET(req);assert.equal(partial.status,206);assert.equal((await partial.arrayBuffer()).byteLength,32);
 const track=f.load('lib/dojo/learningFoundation/writeOutcome.ts').trackLearningWrite;let loseHand=true;
 f.mutations.updateKnowledgeEntry=async(...args)=>{if(loseHand&&args[0]===result.publication.id){loseHand=false;return track(async()=>{const row=f.records.get(args[0]);f.records.set(args[0],{...row,value:JSON.parse(args[1].內容)});throw Error('handoff remote committed, response lost');});}return original(...args);};
 const unknownHand={...hand,operationId:'video-handoff-unknown'};await assert.rejects(()=>store.handoffVideo(unknownHand));f.mutations.updateKnowledgeEntry=original;
 const writes=f.writes(),restored=await store.handoffVideo(unknownHand);assert.equal(restored.publication.id,result.publication.id);assert.equal(f.writes(),writes);
 assert.equal((await cm.readCompletion(fixed.completion.id)).text,'休息，也在生長。');console.log('PASS short video real API owner/version/replay/stale/partial revocation/output/handoff/Range/original');
}finally{await f.close();}
