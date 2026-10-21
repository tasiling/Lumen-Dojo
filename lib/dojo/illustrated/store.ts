import 'server-only';
import { LIAOJIE_PROJECT_TITLE_PREFIX, parseJson } from '../formal';
import { normalizeLiaojieProject } from '../liaojiePublication';
import { listJsonRecords } from '../notionStore';
import { sourcePolicies } from '../creativeSources/store';
import { readCompletion } from '../weavingWorkflow/completions';
import { createStep, updateStep, readRecord, readWork, readShuttle, operationId, expectRevision, WEAVING_OWNER, type Body } from '../weavingWorkflow/store';
import { inspectWeavingOperation, operationDigest, runWeavingOperation, type OperationKind, type OperationReceipt } from '../weavingWorkflow/operations';
import { WeavingError, stringValue } from '../weavingWorkflow/model';
import { readAsset } from './assets';
import { DECK_PREFIX, DECK_VERSION_PREFIX, DECK_OUTPUT_PREFIX, newPage, parseDeckDraft, assertReady, assetId, type Deck, type DeckVersion, type DeckOutput, type DeckBundle, type RenderRef } from './model';
async function raw(id: string, prefix: string): Promise<Body> { const value = parseJson((await readRecord(id,prefix)).內容) as Body; if (!value || value.owner !== WEAVING_OWNER) throw new WeavingError('圖文來源歸屬不符',403); return value; }
export async function readDeck(id: string): Promise<Deck> { const value=await raw(id,DECK_PREFIX); if(!Array.isArray(value.versionRefs)||!value.versionRefs.includes(value.currentVersionId))throw new WeavingError('圖文稿建立尚未完成，請以原操作接續',409);return {...value,id} as Deck; }
async function version(id: string): Promise<DeckVersion> { const value=await raw(id,DECK_VERSION_PREFIX);return {...value,...parseDeckDraft({title:value.title,caption:value.caption,pages:value.pages}),id} as DeckVersion; }
export async function readOutput(id: string): Promise<DeckOutput> { return {...await raw(id,DECK_OUTPUT_PREFIX),id} as DeckOutput; }
export async function bundle(id: string): Promise<DeckBundle> {
 const deck=await readDeck(id),versions=await Promise.all(deck.versionRefs.map(version)),outputs=await Promise.all(deck.outputRefs.map(readOutput));
 if(versions.some(v=>v.deckId!==id)||outputs.some(v=>v.deckId!==id))throw new WeavingError('圖文版本關係不符',409);
 const current=versions.find(v=>v.id===deck.currentVersionId);if(!current)throw new WeavingError('找不到目前圖文版本',409);
 return {deck,version:current,versions:versions.sort((a,b)=>b.number-a.number),outputs};
}
export async function listDecks() { const rows=await listJsonRecords(DECK_PREFIX);return Promise.all(rows.filter(r=>(r.value as Deck)?.owner===WEAVING_OWNER&&Boolean((r.value as Deck).currentVersionId)).map(r=>bundle(r.id))); }
async function fixed(completionId: string) { const c=await readCompletion(completionId),w=await readWork(c.workId);if(!w.completionVersionRefs.includes(c.id)||w.format!=='text'||!c.text.trim())throw new WeavingError('請先選擇已固定的文字成品',409);return {c,w}; }
async function publishable(d: Deck, confirmed: unknown) {const {c}=await fixed(d.completionId);if(operationDigest(c.text)!==d.sourceDigest)throw new WeavingError('圖文固定來源不符',409);await sourcePolicies.assertPublication(c.sourceSelections??[],confirmed);return c;}
function replayStep(receipt: OperationReceipt, value: Body, key: string) {const m=value._weavingMutation as Body|undefined;return m?.owner===receipt.owner&&m.operationId===receipt.operationId&&m.inputDigest===receipt.inputDigest&&m.key===key;}
async function completedMutation(body:Body,kind:OperationKind,id:string,prefix:string,key:string){const receipt=await inspectWeavingOperation(WEAVING_OWNER,operationId(body));if(!receipt)return null;if(receipt.kind!==kind||receipt.inputDigest!==operationDigest(body))throw new WeavingError('同一操作識別的內容不同，請保留原操作',409);const value=await raw(id,prefix);return replayStep(receipt,value,key)?receipt:null;}
async function checkImages(pages: DeckVersion['pages']) {for(const p of pages)if(p.image)await readAsset(p.image.assetId);}
export async function createDeck(body: Body) {
 const op=operationId(body),completionId=stringValue(body.completionId,300,'固定成品',false),{c,w}=await fixed(completionId);
 const seed=createStep(DECK_PREFIX,'deckSeed',r=>({owner:WEAVING_OWNER,revision:0,completionId,workId:w.id,sourceDigest:operationDigest(c.text),currentVersionId:'',versionRefs:[],outputRefs:[],createdAt:r.createdAt,updatedAt:r.createdAt}));
 const v=createStep(DECK_VERSION_PREFIX,'deckVersion',r=>({owner:WEAVING_OWNER,deckId:r.result.deckSeed.id,number:1,title:c.title,caption:'',pages:[{...newPage('page-1'),title:c.title.length<=120?c.title:''}],createdAt:r.createdAt}));
 const r=await runWeavingOperation(WEAVING_OWNER,op,'illustrated_create',body,[
  {...seed,async findConfirmed(r){const rows=(await listJsonRecords(DECK_PREFIX)).filter(row=>{const d=row.value as Deck;return d.owner===WEAVING_OWNER&&d.completionId===completionId;});if(rows.length>1)throw new WeavingError('同一原稿有重複圖文稿，請核對',409);return rows[0]?{id:rows[0].id}:seed.findConfirmed(r);}},
  {...v,async findConfirmed(r){const d=await raw(r.result.deckSeed.id,DECK_PREFIX);if(d.currentVersionId)return {id:String(d.currentVersionId)};return v.findConfirmed(r);}},
  {key:'deck',async findConfirmed(r){const d=await raw(r.result.deckSeed.id,DECK_PREFIX);return d.currentVersionId===r.result.deckVersion.id?{id:r.result.deckSeed.id,revision:Number(d.revision)}:null;},async execute(r){const id=r.result.deckSeed.id;return updateStep(id,DECK_PREFIX,'deck',(row)=>{const d=parseJson(row.內容) as Body;expectRevision(d,0);return {...d,currentVersionId:r.result.deckVersion.id,versionRefs:[r.result.deckVersion.id],revision:1};}).execute(r);}}
 ]);return bundle(r.result.deck.id);
}
export async function saveDeck(body: Body) {
 const id=stringValue(body.deckId,300,'圖文稿',false),draft=parseDeckDraft(body.draft),op=operationId(body);
 if(await completedMutation(body,'illustrated_save',id,DECK_PREFIX,'deck'))return bundle(id);
 const r=await runWeavingOperation(WEAVING_OWNER,op,'illustrated_save',body,[
 createStep(DECK_VERSION_PREFIX,'deckVersion',async receipt=>{const d=await readDeck(id);expectRevision(d,body.expectedRevision);await checkImages(draft.pages);return {owner:WEAVING_OWNER,deckId:id,number:d.versionRefs.length+1,...draft,createdAt:receipt.createdAt};}),
 updateStep(id,DECK_PREFIX,'deck',async(row,receipt)=>{const d=await readDeck(row.id);expectRevision(d,body.expectedRevision);return {...d,currentVersionId:receipt.result.deckVersion.id,versionRefs:[...d.versionRefs,receipt.result.deckVersion.id],revision:d.revision+1,updatedAt:receipt.updatedAt};})
 ]);return bundle(r.result.deck.id);
}
function rendersInput(value: unknown): RenderRef[] {if(!Array.isArray(value)||!value.length||value.length>12)throw new WeavingError('請先匯出每一頁圖片');return value.map(v=>{if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['pageId','assetId'].includes(k)))throw new WeavingError('輸出圖片格式不正確');return {pageId:stringValue(v.pageId,120,'頁面',false),assetId:assetId(v.assetId)};});}
export async function prepareDeck(body: Body) {const b=await bundle(stringValue(body.deckId,300,'圖文稿',false));expectRevision(b.deck,body.expectedRevision);if(b.version.id!==body.versionId)throw new WeavingError('圖文已修改，請重新預覽',409);assertReady(b.version);await checkImages(b.version.pages);await publishable(b.deck,body.publicationConfirmed);return {versionId:b.version.id};}
export async function outputDeck(body: Body) {
 const id=stringValue(body.deckId,300,'圖文稿',false),renders=rendersInput(body.renders),op=operationId(body);
 const previous=await completedMutation(body,'illustrated_output',id,DECK_PREFIX,'deck');if(previous?.result.output)return {...await bundle(id),output:await readOutput(previous.result.output.id)};
 async function validate() {const b=await bundle(id);expectRevision(b.deck,body.expectedRevision);if(b.version.id!==body.versionId)throw new WeavingError('圖文已修改，請重新預覽並匯出',409);assertReady(b.version);await checkImages(b.version.pages);await publishable(b.deck,body.publicationConfirmed);
 if(renders.length!==b.version.pages.length||renders.some((r,i)=>r.pageId!==b.version.pages[i].id))throw new WeavingError('輸出圖片頁序與目前稿件不一致',409);
 for(const r of renders){const a=await readAsset(r.assetId);if(a.mime!=='image/png'||a.width!==1080||a.height!==1350)throw new WeavingError('成品圖片必須是 1080×1350 PNG');}return b;}
 const output=createStep(DECK_OUTPUT_PREFIX,'output',async receipt=>{const b=await validate();return {owner:WEAVING_OWNER,deckId:id,versionId:b.version.id,title:b.version.title,caption:b.version.caption,pages:b.version.pages,renders,createdAt:receipt.createdAt};});
 const r=await runWeavingOperation(WEAVING_OWNER,op,'illustrated_output',body,[{...output,async findConfirmed(receipt){const found=await output.findConfirmed(receipt);if(found)return found;const b=await validate();const previous=b.outputs.find(o=>o.versionId===b.version.id);if(previous){if(operationDigest(previous.renders)!==operationDigest(renders))throw new WeavingError('這版已有不同輸出，請另存新版本後重做',409);return {id:previous.id};}return null;}},updateStep(id,DECK_PREFIX,'deck',async(_row,receipt)=>{const {deck:d}=await validate();return {...d,revision:d.revision+1,outputRefs:[...new Set([...d.outputRefs,receipt.result.output.id])],updatedAt:receipt.updatedAt};})]);
 return {...await bundle(id),output:await readOutput(r.result.output.id)};
}
export async function handoffDeck(body: Body) {
 const id=stringValue(body.deckId,300,'圖文稿',false),outputId=stringValue(body.outputId,300,'圖文成品',false),op=operationId(body);
 async function validate(){const b=await bundle(id);expectRevision(b.deck,body.expectedRevision);const output=b.outputs.find(o=>o.id===outputId&&o.versionId===b.deck.currentVersionId);if(!output)throw new WeavingError('請先匯出目前保存版本',409);await publishable(b.deck,body.publicationConfirmed);assertReady({title:output.title,caption:output.caption,pages:output.pages});for(const ref of output.renders)await readAsset(ref.assetId);return b;}
 const publicationStep=createStep(LIAOJIE_PROJECT_TITLE_PREFIX,'publication',async receipt=>{const b=await validate(),{c,w}=await fixed(b.deck.completionId),s=await readShuttle(w.shuttleId),core=s.coreVersions.find(v=>v.id===c.coreVersionId);if(!core)throw new WeavingError('核心來源不符',409);return normalizeLiaojieProject({weavingShuttleId:s.id,weavingWorkId:w.id,sourceCompletionVersionId:c.id,sourceCoreVersionId:c.coreVersionId,sourceFormat:'text',sourceTitle:c.title,sourceCoreStatement:core.statement,sourceDraftSnapshot:c.text,sourceOutputUrl:c.outputUrl,title:c.title,audience:s.audience,status:'received',revision:1,illustratedOutputRefs:[],createdAt:receipt.createdAt},{id:'pending'});});
 const r=await runWeavingOperation(WEAVING_OWNER,op,'illustrated_handoff',body,[{...publicationStep,async findConfirmed(receipt){const b=await validate();
 // Match the immutable completion directly; never the title or a different revision.
 const all=(await listJsonRecords(LIAOJIE_PROJECT_TITLE_PREFIX)).filter(row=>(row.value as Body).sourceCompletionVersionId===b.deck.completionId&&(row.value as Body).weavingWorkId===b.deck.workId);
 if(all.length>1)throw new WeavingError('固定成品有重複聊解企劃',409);return all[0]?{id:all[0].id}:publicationStep.findConfirmed(receipt);}},
 {key:'publicationLink',async findConfirmed(receipt){const row=await readRecord(receipt.result.publication.id,LIAOJIE_PROJECT_TITLE_PREFIX),p=parseJson(row.內容) as Body;return replayStep(receipt,p,'publicationLink')?{id:row.id}:null;},async execute(receipt){await validate();return updateStep(receipt.result.publication.id,LIAOJIE_PROJECT_TITLE_PREFIX,'publicationLink',row=>{const p=parseJson(row.內容) as Body;return {...p,illustratedOutputRefs:[...new Set([...(Array.isArray(p.illustratedOutputRefs)?p.illustratedOutputRefs:[]),outputId])],revision:Number(p.revision??0)+1};}).execute(receipt);}}
 ]);
 const p=r.result.publication.id,row=await readRecord(p,LIAOJIE_PROJECT_TITLE_PREFIX);return {publication:normalizeLiaojieProject(parseJson(row.內容),{id:p})};
}
