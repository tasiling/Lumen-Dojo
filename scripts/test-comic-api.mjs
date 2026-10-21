import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {fixture} from './weaving-fixture.mjs';
const f=await fixture();
try{
 const w=f.load('lib/dojo/weavingWorkflow/store.ts'),cm=f.load('lib/dojo/weavingWorkflow/completions.ts'),api=f.load('app/api/dojo/comic/route.ts'),s=f.load('lib/dojo/comic/store.ts'),assets=f.load('lib/dojo/illustrated/assets.ts');
 const p=await w.createPair({operationId:'comic-pair',sourceType:'manual',sourceSnapshot:'虛構慢慢生長',coreStatement:'先照顧生活',format:'text'}),work=await w.patchWork({operationId:'comic-write',id:p.works[0].id,expectedRevision:1,work:{title:'雲豆等小芽',draftText:'我先生活，讓小芽慢慢生長。'}}),c=await w.completeWork({operationId:'comic-fixed',workId:work.id,expectedRevision:work.revision,previewDigest:cm.completionDigest(work)});
 assert.equal((await api.GET(f.req('GET','/api/dojo/comic',null,false))).status,401);
 const create={operationId:'comic-create',completionId:c.completion.id};let b=await(await api.POST(f.req('POST','/api/dojo/comic',create))).json();assert(b.project?.id,JSON.stringify(b));assert.equal((await s.createComic({...create,operationId:'comic-dedupe'})).project.id,b.project.id);
 const a=await assets.saveAsset(await readFile('docs/creative-illustrated-evidence/assets/rain-sprout.png')),im={assetId:a.id,kind:'generated',tool:'imagegen',prompt:'fictional',sourceNote:'隔離原創',publicConfirmed:true};
 const draft={title:'雲豆等小芽',caption:'隔離虛構短漫',characters:[{id:'bird',name:'雲豆',description:'白鳥藍圍巾',reference:im}],panels:[{...b.version.panels[0],scene:'等小芽',dialogue:'今天也還沒發芽。',speaker:'雲豆',characterIds:['bird'],image:im,confirmed:true}]};
 const save={action:'save',operationId:'comic-save',projectId:b.project.id,expectedRevision:b.project.revision,draft};b=await s.saveComic(save);assert.equal(b.versions.length,2);const count=f.writes();assert.equal((await s.saveComic(save)).version.id,b.version.id);assert.equal(f.writes(),count);
 await assert.rejects(()=>s.saveComic({...save,operationId:'comic-stale'}));
 await assert.rejects(()=>s.saveComic({...save,operationId:'comic-locked',expectedRevision:b.project.revision,draft:{...draft,panels:[{...draft.panels[0],dialogue:'不能偷改'}]}}),/確認/);
 const render=await assets.saveAsset(await sharp({create:{width:1080,height:1350,channels:3,background:'#ffffff'}}).png().toBuffer());
 const output={action:'output',operationId:'comic-output',projectId:b.project.id,expectedRevision:b.project.revision,versionId:b.version.id,publicationConfirmed:true,renders:[{pageId:'sheet-1',assetId:render.id}]};
 assert.equal((await api.PATCH(f.req('PATCH','/api/dojo/comic',{...output,operationId:'comic-unconfirmed',publicationConfirmed:false}))).status,400);
 const orig=f.mutations.updateKnowledgeEntry;let interrupt=true;f.mutations.updateKnowledgeEntry=async(...args)=>{if(interrupt&&args[0]===b.project.id){interrupt=false;throw Error('before dispatch');}return orig(...args);};
 assert.equal((await api.PATCH(f.req('PATCH','/api/dojo/comic',output))).status,503);f.mutations.updateKnowledgeEntry=orig;
 const policies=f.load('lib/dojo/creativeSources/store.ts').sourcePolicies,allow=policies.assertPublication;policies.assertPublication=async()=>{throw new(f.load('lib/dojo/learningFoundation/model.ts').LearningError)('撤回公開許可',403);};const before=f.writes();assert.equal((await api.PATCH(f.req('PATCH','/api/dojo/comic',output))).status,403);assert.equal(f.writes(),before);assert.equal((await s.bundleComic(b.project.id)).outputs.length,0);policies.assertPublication=allow;
 b=await s.outputComic(output);assert.equal(b.outputs.length,1);assert.equal(b.output.draft.panels[0].dialogue,draft.panels[0].dialogue);
 const hand={action:'handoff',operationId:'comic-handoff',projectId:b.project.id,expectedRevision:b.project.revision,outputId:b.output.id,publicationConfirmed:true};const pub=await s.handoffComic(hand);assert.deepEqual(pub.publication.comicOutputRefs,[b.output.id]);assert.equal((await s.handoffComic(hand)).publication.id,pub.publication.id);
 const unlocked={...draft,panels:[{...draft.panels[0],confirmed:false}]};const unknown={...save,operationId:'comic-save-unknown',expectedRevision:b.project.revision,draft:unlocked};let once=true;f.mutations.updateKnowledgeEntry=async(...args)=>{const r=await orig(...args);if(once&&args[0]===b.project.id){once=false;throw Error('lost response');}return r;};await assert.rejects(()=>s.saveComic(unknown));f.mutations.updateKnowledgeEntry=orig;const recovered=await s.saveComic(unknown);assert.equal(recovered.version.panels[0].confirmed,false);assert.equal(recovered.versions.length,3);
 assert.equal((await api.PATCH(f.req('PATCH','/api/dojo/comic',{...hand,operationId:'comic-old-handoff',expectedRevision:recovered.project.revision}))).status,409);assert.equal((await cm.readCompletion(c.completion.id)).text,'我先生活，讓小芽慢慢生長。');
 console.log('PASS comic real API owner/dedupe/immutable/locked/stale/replay/partial withdrawal/no writes/unknown/handoff/fixed original');
}finally{await f.close();}
