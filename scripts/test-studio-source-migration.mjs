import assert from 'node:assert/strict';
import {fixture} from './weaving-fixture.mjs';
const f=await fixture();
try {
 const mig=f.load('lib/dojo/creativeStudio/migration.ts'),store=f.load('lib/dojo/creativeStudio/store.ts');
 const packet={kind:'lumen-weaving-flow-prototype',state:{sources:[{id:'s1',title:'第一來源',rawText:'第一原文',segments:[{text:'第一原文'}]},{id:'s2',title:'第二來源',rawText:'第二原文\n\n另一段',segments:[{text:'第二原文',time:'01:02',corrections:[{id:'r2',text:'第二校訂',createdAt:'2026-11-01',note:'校正'}]},{text:'另一段'}]}],workSessions:[{id:'one',data:{viewedSourceId:'s1',selected:[1],draft:'甲'}},{id:'two',data:{viewedSourceId:'s2',selected:[0],draft:'乙'}},{id:'three',data:{selected:[0,2],imported:'另外貼入',draft:'丙'}}]}};
 const p=mig.importPreview(packet);
 assert.equal(p.works[0].studio.source.selected,'第二校訂');assert.equal(p.works[0].studio.source.raw,'第二原文\n\n另一段');assert.equal(p.works[0].studio.source.selectedVersion,'r2');
 assert.equal(p.works[1].studio.source.selected,'第一原文','reading another source must not change selected material');
 assert.equal(p.works[2].studio.source.selected,'第一原文\n\n另一段\n\n另外貼入');
 console.log('PASS prototype selections use global segment indices, latest correction and independently pasted text');
 const result=await store.importStudio({operationId:'source-migration-001',packet});
 const works=await Promise.all(result.workIds.map(id=>store.getStudioWork(id)));
 const refs=works[0].work.textWorkflow.sourceSelections;
 assert.equal(refs.length,1);assert.equal(refs[0].sourceId,'s2');assert.equal(refs[0].sourceVersion,'r2');assert.ok(refs[0].locator.includes('s2-0'));assert.ok(refs[0].locator.includes('01:02'));
 assert.equal(works[2].work.textWorkflow.sourceSelections.length,3);assert.equal(works[0].work.studio.source.allowAI,false);assert.equal(works[0].work.studio.source.allowPublic,false);
 console.log('PASS imported editable works retain each selected source ID, segment locator and revision without granting external permission');
 const real=structuredClone(packet);real.state.workSessions[0].data.bc={examples:[{kind:'original',text:'昨天我走去公園',source:'本人原稿',selected:true,module:'B'}]};
 const e=mig.importPreview(real).works[0].studio.examples[0];assert.equal(e.kind,'experience');assert.equal(e.adopted,true);
 console.log('PASS prototype real experiences retain experience type and author adoption');
 real.state.workSessions[0].data.sourcePermit='private';const privateSource=mig.importPreview(real).works[0].studio.source;assert.equal(privateSource.read,'private');assert.equal(privateSource.allowAI,false);assert.equal(privateSource.allowPublic,false);
 console.log('PASS private material retains its private reading policy after migration');
}finally{await f.close();}
