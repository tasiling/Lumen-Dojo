import assert from 'node:assert/strict';
import {fixture} from './weaving-fixture.mjs';
const f=await fixture();
try {
 const store=f.load('lib/dojo/creativeStudio/store.ts'),m=f.load('lib/dojo/creativeStudio/model.ts');
 const parent=await store.createStudioWork({operationId:'recovery-parent'}),s=m.blankStudio();s.body='獨立衍生稿';s.collaboration.aAnswers='完稿當時的意思';s.checks={facts:true,privacy:true,citations:true,voice:true};let work=await store.createStudioWork({operationId:'recovery-child',studio:s});f.records.get(work.id).value.derivedFromWorkId=parent.id;
 const completed=await store.completeStudioWork({operationId:'recovery-complete',id:work.id,expectedRevision:work.revision,previewDigest:(await store.getStudioWork(work.id)).previewDigest});
 work=await store.saveStudioWork({operationId:'recovery-new-discussion',id:work.id,expectedRevision:completed.work.revision,studio:{...completed.work.studio,collaboration:{...completed.work.studio.collaboration,aAnswers:'後來的討論'}}});
 work=await store.transitionStudioWork({operationId:'recovery-archive',id:work.id,expectedRevision:work.revision,transition:'archive'});
 const saved=await store.getStudioWork(work.id),packet={work:saved.work,completionVersions:saved.completions};f.records.delete(work.id);
 const imported=await store.importStudio({operationId:'recovery-import',packet});let restored=await store.getStudioWork(imported.workIds[0]);
 assert.equal(restored.work.status,'archived');assert.equal(restored.work.derivedFromWorkId,parent.id);assert.equal(restored.work.currentCompletionVersionId,restored.completions[0].id);assert.equal(restored.completions[0].text,'獨立衍生稿');
 assert.equal(restored.work.studio.collaboration.aAnswers,'後來的討論');assert.equal(restored.completions[0].studioSnapshot.collaboration.aAnswers,'完稿當時的意思');
 await assert.rejects(()=>store.saveStudioWork({operationId:'recovery-protected-edit',id:restored.work.id,expectedRevision:restored.work.revision,studio:{...restored.work.studio,body:'不應覆寫'}}),/開始修訂/);
 const reopened=await store.transitionStudioWork({operationId:'recovery-restore',id:restored.work.id,expectedRevision:restored.work.revision,transition:'restore'});assert.equal(reopened.status,'completed');
 await assert.rejects(()=>store.saveStudioWork({operationId:'recovery-complete-protected',id:reopened.id,expectedRevision:reopened.revision,studio:{...reopened.studio,body:'不應覆寫'}}),/開始修訂/);
 const again=await store.importStudio({operationId:'recovery-import-again',packet});assert.deepEqual(again.workIds,imported.workIds);assert.equal((await store.getStudioWork(reopened.id)).completions.length,1);
 console.log('PASS missing native backup retains archived/completed protection, independent source link and current fixed version across repeated restore');
 const pages=[{layout:'dialogue',title:'原圖文標題',body:'原本的圖文內容',brand:'本人署名'}],graphicPacket={kind:'lumen-weaving-flow-prototype',state:{sources:[],workSessions:[{id:'only-graphic',data:{format:'illustrated',draft:'',title:'只有圖文的作品',pages,versions:[{id:'graphic-fixed',format:'illustrated',body:'',title:'原圖文完稿',pages}]}}]}};
 const graphicImport=await store.importStudio({operationId:'recovery-graphic-import',packet:graphicPacket}),graphic=await store.getStudioWork(graphicImport.workIds[0]);assert.equal(graphic.work.studio.contentKind,'illustrated');assert.equal(graphic.completions.length,1);assert.ok(graphic.completions[0].text.includes('原本的圖文內容'));assert.equal(graphic.completions[0].outputKind,'carousel_copy');
 const gs=f.load('lib/dojo/creativeStudio/graphics.ts'),result=await gs.restoreStudioGraphics({operationId:'recovery-graphic-restore',id:graphic.work.id,choice:'graphic-fixed',completionId:graphic.completions[0].id,expectedDeckRevision:0,confirm:true});assert.equal(result.version.pages[0].title,'原圖文標題');assert.equal(result.version.pages[0].style.template,'dialogue');
 console.log('PASS graphics-only prototype restores its real fixed version and editable pages without requiring a separate text manuscript');
}finally{await f.close();}
