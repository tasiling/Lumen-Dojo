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

// D analyses must resolve by original version ID, text AND core, not text alone.
for (const scenario of ['original-present', 'old-completion-present', 'all-missing', 'interrupted', 'wrong-text', 'wrong-core', 'wrong-id', 'wrong-work', 'duplicate-id', 'missing-version']) {
 const f=await fixture();
 try {
  const st=f.load('lib/dojo/creativeStudio/store.ts'),m=f.load('lib/dojo/creativeStudio/model.ts');
  const s=m.blankStudio();s.body='D 原文';s.checks={facts:true,privacy:true,citations:true,voice:true};
  let w=await st.createStudioWork({operationId:'d-create',studio:s});
  f.records.get(w.id).value.coreVersionId='historical-core-without-studio-direction';
  const done=await st.completeStudioWork({operationId:'d-complete',id:w.id,expectedRevision:w.revision,previewDigest:(await st.getStudioWork(w.id)).previewDigest});
  const original=(await st.getStudioWork(w.id)).completions[0];
  w=await st.saveStudioWork({operationId:'d-analysis',id:w.id,expectedRevision:done.work.revision,studio:{...done.work.studio,analyses:[m.startD(w.id,original,'保留分析文字')]}});
  // A later immutable snapshot contains the historical D analysis reference.
  w=await st.transitionStudioWork({operationId:'d-revise',id:w.id,expectedRevision:w.revision,transition:'revise'});
  await st.completeStudioWork({operationId:'d-complete-later',id:w.id,expectedRevision:w.revision,previewDigest:(await st.getStudioWork(w.id)).previewDigest});
  const saved=await st.getStudioWork(w.id),packet=structuredClone({work:saved.work,completionVersions:saved.completions});
  const analysis=structuredClone(packet.work.studio.analyses[0]);
  if(scenario==='original-present') {
   const newer=await st.saveStudioWork({operationId:'d-newer-discussion',id:w.id,expectedRevision:saved.work.revision,studio:{...saved.work.studio,d:'較新討論'}});
   const result=await st.importStudio({operationId:'d-import',packet});
   assert.deepEqual(result.workIds,[w.id]);assert.deepEqual((await st.getStudioWork(w.id)).work,newer);
   console.log('PASS D restore resumes existing original without overwriting');continue;
  }
  f.records.delete(w.id);
  if(scenario!=='old-completion-present')for(const c of saved.completions)f.records.delete(c.id);
  const source=packet.completionVersions.find(c=>c.id===original.id);
  if(scenario==='wrong-text')source.text='不同原文';
  if(scenario==='wrong-core')source.coreVersionId='different-core';
  if(scenario==='wrong-id')source.id='different-version';
  if(scenario==='wrong-work')source.workId='different-work';
  if(scenario==='duplicate-id')packet.completionVersions.push(structuredClone(source));
  if(scenario==='missing-version')packet.completionVersions=packet.completionVersions.filter(c=>c.id!==original.id);
  const untouched=structuredClone(packet);
  if(scenario.startsWith('wrong-')||['duplicate-id','missing-version'].includes(scenario)) {
   await assert.rejects(()=>st.importStudio({operationId:'d-import',packet}),/D 分析來源版本/);
   assert.deepEqual(packet,untouched);
   for(const candidate of await st.studioWorks(true))assert.deepEqual(candidate.studio.analyses,[analysis]);
   console.log('PASS D restore blocks unverifiable source and preserves original data:',scenario);continue;
  }
  if(scenario==='interrupted') {
   const update=f.mutations.updateKnowledgeEntry;let interrupted=false;
   f.mutations.updateKnowledgeEntry=async(id,row)=>{
    const value=row.內容?JSON.parse(row.內容):null;
    if(!interrupted&&value?.studio?.analyses?.[0]?.completionId!==undefined&&value.studio.analyses[0].completionId!==original.id){interrupted=true;throw Error('simulated D restore interruption');}
    return update(id,row);
   };
   await assert.rejects(()=>st.importStudio({operationId:'d-import',packet}),/可重新讀取後重試/);
   assert.ok(interrupted);f.mutations.updateKnowledgeEntry=update;
  }
  const result=await st.importStudio({operationId:'d-import',packet});
  const restored=await st.getStudioWork(result.workIds[0]);
  const mapped=restored.completions.find(c=>c.originalVersionId===original.id);
  assert.notEqual(mapped.id,original.id);assert.equal(mapped.workId,restored.work.id);
  assert.deepEqual(restored.work.studio.analyses,[{...analysis,completionId:mapped.id}]);
  const historical=restored.completions.find(c=>c.originalVersionId===saved.work.currentCompletionVersionId);
  assert.deepEqual(historical.studioSnapshot.analyses,[analysis],'immutable snapshot retains its historical reference');
  assert.equal(restored.work.currentCompletionVersionId,historical.id);
  const next=await st.saveStudioWork({operationId:'d-save-after-restore',id:restored.work.id,expectedRevision:restored.work.revision,studio:{...restored.work.studio,d:'恢復後繼續分析'}});
  for(const operationId of ['d-import','d-import-again'])assert.deepEqual((await st.importStudio({operationId,packet})).workIds,result.workIds);
  const again=await st.getStudioWork(next.id);assert.deepEqual(again.work,next);assert.equal(again.completions.length,2);
  assert.deepEqual(packet,untouched);
  console.log('PASS D restore maps exact fixed version, saves, preserves snapshot and retries:',scenario,{before:original.id,after:mapped.id});
 }finally{await f.close();}
}
