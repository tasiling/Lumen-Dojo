import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const temp = await mkdtemp(join(tmpdir(), 'dojo-routing-'));
let entry = { id:'source-1', route:'game', title:'A reef encounter', sourceLabel:'Dave the Diver', englishRecord:'A reef appeared.', ocrText:'A reef appeared.', chineseExplanation:'出現珊瑚礁', contextNote:'', analysisReviewReason:'', capturedAt:'2026-10-08T00:00:00Z', lineImageSetId:'group-1', attachments:[{id:'img-1',blockId:'block-1',sourceMessageId:'line-1',mimeType:'image/jpeg',batchIndex:1}], contextRoomSourceRevision:0, contextRoomContentFingerprint:'', contextRoomLinks:[], vocabularyCandidates:[{expression:'reef',meaning:'珊瑚礁',usage:'A reef appeared.',usageTranslation:'出現了一座珊瑚礁。',partOfSpeech:'noun',usageProvenance:'source',cefrLevel:'B1',suggestedFocusDecks:['JRPG／冒險遊戲'],origin:'source',recommendationReason:'source'}], vocabForgeDraft:{sourceName:'Dave the Diver',focusDecks:['JRPG／冒險遊戲','故事閱讀'],selectedKeys:['reef']}, vocabForgeExports:[],vocabForgeSyncStates:[],learningPhrases:'',vocabularyWords:'' };
const actions=[];
let loseContextResponse=false;
globalThis.__routingStore={ get:async()=>({entry:structuredClone(entry)}), save:async value=>(entry=structuredClone(value)), update:async(id,fn)=>(entry={...entry,...fn(structuredClone(entry))}) };
const server=createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;
 const body=raw?JSON.parse(raw):{};actions.push({url:req.url,body});
 res.setHeader('Content-Type','application/json');
 if(body.contractVersion && loseContextResponse){loseContextResponse=false;req.socket.destroy();return;}
 if(body.contractVersion)res.end(JSON.stringify({projectId:'project-1',unitId:'unit-1',sourceItemId:'item-1',sourceItemUnitId:'link-1'}));
 else res.end(JSON.stringify({items:body.items.map(item=>({key:item.key,expression:item.expression,result:'created',vocabBook:'JRPG／冒險遊戲'}))}));
});
const previous={context:process.env.CONTEXT_ROOM_INTEGRATION_URL,vocab:process.env.VOCABFORGE_INTEGRATION_URL,cs:process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET,vs:process.env.LUMEN_VOCABFORGE_SYNC_SECRET};
try {
 for(const name of ['englishImageDispatch','englishImageRouting','sourceHandoffV2','englishImage']){
   let code=ts.transpileModule(await readFile(new URL(`../lib/dojo/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
   code=code.replace(/import ["']server-only["'];?/g,'').replace(/from (["'])(\.[^"']+)\1/g,(_,q,p)=>`from ${q}${p}.mjs${q}`);
   await writeFile(join(temp,name+'.mjs'),code);
 }
 await writeFile(join(temp,'englishImageStore.mjs'),'export const getEnglishImageEntry=(...a)=>globalThis.__routingStore.get(...a);export const saveEnglishImageEntry=(...a)=>globalThis.__routingStore.save(...a);export const updateEnglishImageEntry=(...a)=>globalThis.__routingStore.update(...a);');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 process.env.CONTEXT_ROOM_INTEGRATION_URL=process.env.VOCABFORGE_INTEGRATION_URL=base;
 process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET=process.env.LUMEN_VOCABFORGE_SYNC_SECRET='isolated-test';
 const {exportEnglishImageContext,exportEnglishImageVocabs}=await import(pathToFileURL(join(temp,'englishImageDispatch.mjs')));
 const params={id:'source-1',contractMode:'v2',projectMode:'create',materialTitle:'Dave the Diver',unitMode:'create',eventTitle:'Reef encounter',candidateKeys:[]};
 await exportEnglishImageContext(params);
 await exportEnglishImageContext(params);
 assert.equal(actions[0].body.dispatchId,actions[1].body.dispatchId,'confirmed identical requests must reuse the original receipt identity after response loss or reload');
 await exportEnglishImageVocabs('source-1',['reef'],'JRPG／冒險遊戲',{focusDecks:['JRPG／冒險遊戲','故事閱讀'],sourceName:'Dave the Diver'});
 const vocab=actions.at(-1).body;
 assert.deepEqual(vocab.focusDecks,['JRPG／冒險遊戲','故事閱讀']);
 assert.equal(vocab.sourceName,'Dave the Diver');
 assert.equal(vocab.sourceRecordId,'source-1');
 assert.equal(vocab.items[0].usage.translation,'出現了一座珊瑚礁。');
 const count=actions.length;
 await exportEnglishImageVocabs('source-1',['reef'],'JRPG／冒險遊戲',{focusDecks:['JRPG／冒險遊戲'],sourceName:'Dave the Diver'});
 assert.equal(actions.length,count,'received word must not be sent again');
 assert.equal(entry.contextRoomLinks.length,1);
 assert.equal(entry.vocabForgeExports.length,1);
 let routeCode=ts.transpileModule(await readFile(new URL('../app/api/dojo/english-images/dispatch/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 routeCode=routeCode.replace(/from ["']next\/server["']/g, 'from "./nextServer.mjs"').replace(/from ["']@\/lib\/dojo\/([^"']+)["']/g,(_,name)=>`from "./${name}.mjs"`);
 await writeFile(join(temp,'nextServer.mjs'),'export const NextResponse={json:(body,options)=>({status:options?.status||200,body})};');
 await writeFile(join(temp,'dispatchRoute.mjs'),routeCode);
 const {POST}=await import(pathToFileURL(join(temp,'dispatchRoute.mjs')));
 const dispatch=body=>POST({json:async()=>body});
 const invalid=await dispatch({id:'source-1',sourceName:'Dave the Diver',vocab:{selectedKeys:['reef'],focusDecks:['Dave the Diver']}});
 assert.equal(invalid.status,400);assert.equal(actions.length,count,'invalid deck preflight must not dispatch');
 const confirmed=await dispatch({id:'source-1',sourceName:'Dave the Diver',context:params,vocab:{selectedKeys:['reef'],focusDecks:['JRPG／冒險遊戲','故事閱讀']}});
 assert.equal(confirmed.status,200);assert.equal(confirmed.body.results.context.status,'received');assert.equal(confirmed.body.results.vocab.status,'received');
 assert.deepEqual(entry.vocabForgeDraft.focusDecks,['JRPG／冒險遊戲','故事閱讀']);assert.equal(entry.sourceLabel,'Dave the Diver');
 assert.deepEqual(entry.contextRoomDispatchDraft.candidateKeys,[]);assert.equal(entry.contextRoomDispatchDraft.projectMode,'create');
 const corrected=await dispatch({id:'source-1',sourceName:'Corrected life context',context:params});assert.equal(corrected.status,200);assert.equal(entry.vocabForgeDraft.sourceName,'Corrected life context','Context-only confirmation must update shared provenance');
 const custom={...params,eventTitle:'Custom reef unit',candidateKeys:[]};loseContextResponse=true;
 const unknown=await dispatch({id:'source-1',sourceName:'Corrected life context',context:custom});assert.equal(unknown.body.results.context.status,'failed');
 const firstAttempt=actions.at(-1).body;
 const {normalizeEnglishImageEntry}=await import(pathToFileURL(join(temp,'englishImage.mjs')));
 const restored=normalizeEnglishImageEntry(entry,{id:entry.id,capturedAt:entry.capturedAt}).contextRoomDispatchDraft;
 assert.equal(restored.eventTitle,'Custom reef unit');assert.equal(restored.projectMode,'create');
 const retry=await dispatch({id:'source-1',sourceName:'Corrected life context',context:restored});assert.equal(retry.body.results.context.status,'received');assert.equal(actions.at(-1).body.dispatchId,firstAttempt.dispatchId,'response-loss retry after durable reload must reuse request identity');
 const oldContract=await dispatch({id:'source-1',sourceName:'Corrected life context',context:{...restored,contractMode:'v1'}});assert.equal(oldContract.status,400);
 const missingSource=await dispatch({id:'source-1',sourceName:'',context:params});assert.equal(missingSource.status,400);
 console.log('Unified POST route: preflight validation, persisted settings, both receipts PASS');
 console.log('Real sender / local HTTP receiver: exact context replay, two decks, source and word dedupe PASS');
} finally {
 for(const [key,value] of [['CONTEXT_ROOM_INTEGRATION_URL',previous.context],['VOCABFORGE_INTEGRATION_URL',previous.vocab],['LUMEN_CONTEXT_ROOM_SYNC_SECRET',previous.cs],['LUMEN_VOCABFORGE_SYNC_SECRET',previous.vs]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 delete globalThis.__routingStore;
 await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});
}
