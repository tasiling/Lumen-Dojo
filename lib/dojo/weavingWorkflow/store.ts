import { sourcePolicies } from '../creativeSources/store';
import 'server-only';
import { createKnowledgeEntry, updateKnowledgeEntry } from '@/lib/notion/mutations';
import { getKnowledgeEntry, listInsightCards, listPlurkDrafts, listReadingBooks } from '@/lib/notion/queries';
import { listJsonRecords } from '../notionStore';
import { CAPTURE_TITLE_PREFIX, WEAVING_PROJECT_TITLE_PREFIX, WEAVING_SHUTTLE_TITLE_PREFIX, WEAVING_WORK_TITLE_PREFIX, LIAOJIE_PROJECT_TITLE_PREFIX, LIAOJIE_TEXT_VARIANT_PREFIX, LIAOJIE_TEXT_VERSION_PREFIX, COMPLETION_TITLE_PREFIX, parseJson, normalizeCaptureEntry } from '../formal';
import { createShuttleDraft, createWorkDraft, currentCore, normalizeWeavingShuttle, normalizeWeavingWork, type WeavingShuttle, type WeavingWork } from '../weavingShuttle';
import { normalizeWeavingProject } from '../weavingProjects';
import { LIAOJIE_PLATFORMS, normalizeLiaojieProject } from '../liaojiePublication';
import { operationKey, runWeavingOperation, inspectWeavingOperation,type EntityRef,type OperationReceipt, type OperationStep } from './operations';
import { stringValue, validateWorkPatch, WeavingError, workflowFromLegacy,type ContentKind, type WorkflowSelection, normalizeWorkflow } from './model';
import { convertWorkflow,TEXT_TEMPLATES,createTextWorkflow } from './templates';
import { productionSources, resolveSelections, checkSelectionAvailability, type SelectionRequest } from './sources';
import { operationDigest } from './operations';
import { completionDigest, completionPayload, readCompletion } from './completions';
import { decodePlurkContent } from '@/lib/plurk/notionFormat';
export const WEAVING_OWNER = 'dojo-private-owner';
export type Body = Record<string, unknown>;
export type JsonRow = {
    id: string;
    標題: string;
    內容: string;
};
export const revisionOf = (v: unknown) => { const r = (v as {
    revision?: unknown;
})?.revision; return typeof r === 'number' && Number.isInteger(r) && r >= 0 ? r : 0; };
export function expectRevision(value: unknown, expected: unknown) { if (expected !== revisionOf(value))
    throw new WeavingError('資料版本已變更，請保留輸入並重新讀取比較', 409); }
export function operationId(body: Body): string { if (typeof body.operationId !== 'string')
    throw new WeavingError('請重新開啟作品並確認操作；缺少安全操作識別', 409); return body.operationId; }
export async function readRecord(id: string, prefix: string): Promise<JsonRow> { const row = await getKnowledgeEntry(id); if (!row.標題.startsWith(prefix))
    throw new WeavingError('來源類型或存取範圍不符', 403); return row; }
export async function readWork(id: string): Promise<WeavingWork> { const row = await readRecord(id, WEAVING_WORK_TITLE_PREFIX); const work = normalizeWeavingWork(parseJson(row.內容), { id }); if (!work)
    throw new WeavingError('作品無法讀取', 409); return work; }
export async function readShuttle(id: string): Promise<WeavingShuttle> { const row = await readRecord(id, WEAVING_SHUTTLE_TITLE_PREFIX); const shuttle = normalizeWeavingShuttle(parseJson(row.內容), { id }); if (!shuttle)
    throw new WeavingError('織光杼無法讀取', 409); return shuttle; }
function marker(r: OperationReceipt, key: string) { return { operationId: r.operationId, key, inputDigest: r.inputDigest, owner: r.owner }; }
function isMarked(v: unknown, r: OperationReceipt, key: string) { const m = (v as {
    _weavingMutation?: ReturnType<typeof marker>;
})?._weavingMutation; return m?.operationId === r.operationId && m.key === key && m.inputDigest === r.inputDigest && m.owner === r.owner; }
export function createStep(prefix: string, key: string, value: (r: OperationReceipt) => Promise<unknown> | unknown): OperationStep {
    const title = (r: OperationReceipt) => `${prefix}${operationKey(r.owner, r.operationId)}:${key}`;
    return { key, async findConfirmed(r) { const rows = (await listJsonRecords(title(r))).filter(row => row.title === title(r)); if (rows.length > 1)
            throw new WeavingError('相同操作有重複紀錄，請核對', 409); if (!rows.length)
            return null; if (!isMarked(rows[0].value, r, key))
            throw new WeavingError('操作紀錄內容不符', 409); return { id: rows[0].id, revision: revisionOf(rows[0].value) }; }, async execute(r) { const content = await value(r); const row = await createKnowledgeEntry({ 標題: title(r), 內容: JSON.stringify({ ...content as object, _weavingMutation: marker(r, key) }) }, { retryCreate: false }); return { id: row.id, revision: revisionOf(content) }; } };
}
export function updateStep(id: string, prefix: string, key: string, next: (row: JsonRow, r: OperationReceipt) => Promise<unknown> | unknown): OperationStep {
    return { key, async findConfirmed(r) { const row = await readRecord(id, prefix); const v = parseJson(row.內容); return isMarked(v, r, key) ? { id, revision: revisionOf(v) } : null; }, async execute(r) { const row = await readRecord(id, prefix); const value = await next(row, r); await updateKnowledgeEntry(id, { 內容: JSON.stringify({ ...value as object, _weavingMutation: marker(r, key) }) }); return { id, revision: revisionOf(value) }; } };
}
function manualSelections(value: unknown, r: OperationReceipt): WorkflowSelection[] {
    if (!Array.isArray(value) || value.length > 30)
        throw new WeavingError('人工選摘格式不正確');
    return value.map((item, i) => { const v = item as Body; if (!v || !['quote', 'understanding', 'experience', 'insight'].includes(String(v.contentKind)))
        throw new WeavingError('人工內容種類不正確'); const selectedText = stringValue(v.text, 30000, '人工選摘', false), locator = stringValue(v.locator ?? '人工輸入', 2000, '定位'); return { sourceType: 'manual', sourceId: operationKey(r.owner, `${r.operationId}:manual:${i}`), sourceVersion: null, locator, contentKind: v.contentKind as ContentKind, selectedText, capturedAt: r.createdAt, digest: operationDigest([selectedText, locator, v.contentKind]) }; });
}
export const stableCoreId = (r: OperationReceipt, key: string) => operationKey(r.owner, `${r.operationId}:${key}`).slice(0, 32);
async function initialSource(body: Body) {
    if (body.selectionRequests !== undefined) {
        const selections = await resolveSelections(body.selectionRequests as SelectionRequest[]);
        if (!selections.length)
            throw new WeavingError('請先選取素材');
        return { sourceType: 'selected_sources', sourceId: selections[0].sourceId, sourceRefs: selections.map(s => ({ sourceType: s.sourceType, sourceId: s.sourceId })), sourceSelections: selections, sourceSnapshot: selections.map(s => `${s.contentKind}・${s.locator}\n${s.selectedText}`).join('\n\n'), title: '新的創作題材' };
    }
    if (body.sourceType === 'forage_capture') {
        const id = stringValue(body.sourceId, 300, '來源 ID', false), row = await readRecord(id, CAPTURE_TITLE_PREFIX), c = normalizeCaptureEntry(parseJson(row.內容), { id });
        if (!c || c.status !== 'adopted' || !c.destinations.includes('weaving') || !['C2', 'C3'].includes(c.creativeMaturity))
            throw new WeavingError('素材尚未成熟或尚未採用', 409);
        const candidate = await productionSources().get('forage_capture', id);
        if (!candidate)
            throw new WeavingError('素材無法選摘', 409);
        const sourceSelections = await resolveSelections([{ sourceType: 'forage_capture', sourceId: id, sourceVersion: candidate.version, start: 0, end: candidate.text.length, contentKind: candidate.contentKind }]);
        return { sourceSelections, sourceType: 'forage_capture', sourceId: id, sourceRefs: [{ sourceType: 'forage_capture', sourceId: id }], sourceSnapshot: [c.forageSummary || c.excerpt, c.note, c.sourceUrl, c.sourceLocator].filter(Boolean).join('\n\n'), title: c.weaving.projectTitle || c.title };
    }
    if (body.sourceType === 'reading_insights') {
        const ids = body.insightCardIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > 30 || ids.some(id => typeof id !== 'string'))
            throw new WeavingError('閱讀洞察識別不正確');
        const [cards, books] = await Promise.all([listInsightCards(), listReadingBooks()]);
        const selected = ids.map(id => cards.find(c => c.id === id));
        if (selected.some(c => !c || !['已驗證', '不成立'].includes(c.status)))
            throw new WeavingError('只能使用已驗證或不成立的閱讀洞察', 409);
        const resolver = productionSources();
        const requests = await Promise.all(ids.map(async (id) => { const c = await resolver.get('reading_insight', id); if (!c)
            throw new WeavingError('閱讀洞察無法選摘', 409); return { sourceType: 'reading_insight' as const, sourceId: id, sourceVersion: c.version, start: 0, end: c.text.length, contentKind: c.contentKind }; }));
        const sourceSelections = await resolveSelections(requests);
        return { sourceSelections, sourceType: 'reading_insights', sourceId: ids[0], sourceRefs: ids.map(sourceId => ({ sourceType: 'reading_insight', sourceId })), sourceSnapshot: selected.map(c => `${c!.insight}\n行動：${c!.action}\n來源：${books.find(b => b.id === c!.sourceBookId)?.title ?? '閱讀洞察'}`).join('\n\n'), title: selected[0]!.insight.slice(0, 80) };
    }
    if (body.sourceType !== undefined && body.sourceType !== 'manual')
        throw new WeavingError('來源種類不正確');
    return { sourceType: 'manual', sourceId: null, sourceRefs: [], sourceSnapshot: stringValue(body.sourceSnapshot, 30000, '成熟題材', false), title: '手動題材' };
}
export async function createPair(body: Body) {
    const id = operationId(body), core = stringValue(body.coreStatement, 3000, '自己的核心觀點', false);
    const format = body.format === 'comic' || body.format === 'video' ? body.format : 'text';
    if(format==='text'&&(typeof body.templateKey==='string'&&!TEXT_TEMPLATES[body.templateKey]||body.templateKey!==undefined&&typeof body.templateKey!=='string'))throw new WeavingError('文字模板不存在');
    if(body.format!==undefined&&!['text','comic','video'].includes(String(body.format)))throw new WeavingError('作品形式不正確');
    if(body.manualContentKind!==undefined&&!['quote','understanding','experience','insight'].includes(String(body.manualContentKind)))throw new WeavingError('人工內容種類不正確');
    const steps: OperationStep[] = [createStep(WEAVING_SHUTTLE_TITLE_PREFIX, 'shuttle', async (r) => { const source = await initialSource(body); stringValue(source.sourceSnapshot, 30000, '來源快照'); const s = createShuttleDraft({ ...source, title: stringValue(body.title ?? source.title, 200, '名稱', false), coreStatement: core }); s.sourceSelections = 'sourceSelections' in source ? source.sourceSelections as WorkflowSelection[] : [{ sourceType: 'manual', sourceId: stableCoreId(r, 'source'), sourceVersion: null, locator: source.sourceType === 'manual' ? '人工輸入' : source.sourceType, contentKind: ['quote', 'understanding', 'experience', 'insight'].includes(String(body.manualContentKind)) ? body.manualContentKind as ContentKind : 'insight', selectedText: source.sourceSnapshot, capturedAt: r.createdAt, digest: operationDigest(source.sourceSnapshot) }]; s.coreVersions[0].id = stableCoreId(r, 'core'); s.currentCoreVersionId = s.coreVersions[0].id; s.coreVersions[0].createdAt = r.createdAt; s.createdAt = r.createdAt; return { ...s, revision: 1 }; }), createStep(WEAVING_WORK_TITLE_PREFIX, 'work', async (r) => { const s = await readShuttle(r.result.shuttle.id); return { ...createWorkDraft({ shuttleId: s.id, title: s.title, coreVersionId: currentCore(s).id, format }), revision: 1, createdAt: r.createdAt, ...(format === 'text' ? { textWorkflow: { ...createTextWorkflow(typeof body.templateKey === 'string' ? body.templateKey : 'article'), sourceSelections: s.sourceSelections } } : {}) }; })];
    const r = await runWeavingOperation(WEAVING_OWNER, id, 'create_pair', body, steps);
    return { shuttle: await readShuttle(r.result.shuttle.id), works: [await readWork(r.result.work.id)], legacyProjectId: null };
}
export async function createAdditionalWork(body: Body) {
 const op=operationId(body),shuttleId=stringValue(body.shuttleId,300,'織光杼 ID',false),title=stringValue(body.title,200,'作品名稱',false),format=body.format==='comic'||body.format==='video'?body.format:'text';
 const r=await runWeavingOperation(WEAVING_OWNER,op,'create_work',body,[
 createStep(WEAVING_WORK_TITLE_PREFIX,'work',async receipt=>{
  const s=await readShuttle(shuttleId);if(s.status==='archived')throw new WeavingError('織光杼已封存',409);
  const from=body.derivedFromWorkId===undefined?null:await readWork(stringValue(body.derivedFromWorkId,300,'原工作版本 ID',false));
  if(from){if(from.shuttleId!==s.id||from.format!=='text'||format!=='text')throw new WeavingError('模板轉換來源與織光杼不符',403);expectRevision(from,body.expectedSourceRevision);if(!s.coreVersions.some(c=>c.id===from.coreVersionId))throw new WeavingError('原稿核心版本無法確認',409);}
  const workflow=format==='text'?(from?convertWorkflow(from.textWorkflow??workflowFromLegacy(from),stringValue(body.templateKey,100,'模板',false)):{...createTextWorkflow('article'),sourceSelections:s.sourceSelections}):null;
  return {...createWorkDraft({shuttleId,title,coreVersionId:from?.coreVersionId??currentCore(s).id,format,derivedFromWorkId:from?.id??null}),revision:1,createdAt:receipt.createdAt,draftText:from?.draftText??'',...(workflow?{textWorkflow:workflow,formatSubtype:workflow.templateKey}:{}),...(from?{status:'drafting',nextAction:'依新模板調整表達；原工作版本保留',outputUrl:from.outputUrl}:{})};
 }),updateStep(shuttleId,WEAVING_SHUTTLE_TITLE_PREFIX,'shuttle',row=>{const s=normalizeWeavingShuttle(parseJson(row.內容),{id:shuttleId})!;if(s.status==='archived')throw new WeavingError('織光杼已封存',409);return {...s,status:'active',revision:s.revision+1};})]);
 return readWork(r.result.work.id);
}
export async function patchWork(body: Body) {
    const id = stringValue(body.id, 300, '作品 ID', false), patch = validateWorkPatch(body.work), op = operationId(body);
    const r = await runWeavingOperation(WEAVING_OWNER, op, 'patch', body, [updateStep(id, WEAVING_WORK_TITLE_PREFIX, 'work', async (row, receipt) => {
            const prev = normalizeWeavingWork(parseJson(row.內容), { id })!;
            expectRevision(prev, body.expectedRevision);
            if (patch.draftText !== undefined && !patch.textWorkflow && prev.textWorkflow) {
                patch.textWorkflow = { ...prev.textWorkflow, blocks: [{ id: `legacy-${id}`, role: '自由文字', text: patch.draftText, mediaNote: '' }] };
            }
            if (patch.textWorkflow) {
                const incoming = patch.textWorkflow as {
                    sourceSelections?: unknown;
                };
                const selected = incoming.sourceSelections as WorkflowSelection[];
                if (!selected.every(s => (prev.textWorkflow?.sourceSelections ?? []).some(old => JSON.stringify(old) === JSON.stringify(s))))
                    throw new WeavingError('請由來源選摘入口確認素材', 403);
                if (body.selectionRequests !== undefined) {
                    const additions = await resolveSelections(body.selectionRequests as SelectionRequest[]);
                    incoming.sourceSelections = [...selected, ...additions];
                    normalizeWorkflow(incoming);
                }
                if (body.manualSelections !== undefined) {
                    incoming.sourceSelections = [...incoming.sourceSelections as WorkflowSelection[], ...manualSelections(body.manualSelections, receipt)];
                    normalizeWorkflow(incoming);
                }
            }
            const updated = normalizeWeavingWork({ ...prev, ...patch, revision: prev.revision + 1 }, { id, touch: true });
            if (!updated)
                throw new WeavingError('作品內容不完整');
            return updated;
        })]);
    return await readWork(r.result.work.id);
}
export async function patchShuttle(body: Body) {
    const id = stringValue(body.id, 300, '織光杼 ID', false), op = operationId(body), p = body.shuttle as Body;
    if (!p || Object.keys(p).some(k => !['title', 'audience', 'direction', 'status'].includes(k)))
        throw new WeavingError('受保護的織光杼欄位');
    for (const [k, max] of Object.entries({ title: 200, audience: 1000, direction: 3000 }))
        if (p[k] !== undefined)
            stringValue(p[k], max, k);
    if (p.status !== undefined && !['active', 'resting', 'archived'].includes(String(p.status)))
        throw new WeavingError('織光杼狀態不正確');
    const r = await runWeavingOperation(WEAVING_OWNER, op, 'patch', body, [updateStep(id, WEAVING_SHUTTLE_TITLE_PREFIX, 'shuttle', row => { const v = parseJson(row.內容); expectRevision(v, body.expectedRevision); const s = normalizeWeavingShuttle({ ...v as object, ...p, revision: revisionOf(v) + 1 }, { id, touch: true }); if (!s)
            throw new WeavingError('織光杼內容不完整'); return s; })]);
    return await readShuttle(r.result.shuttle.id);
}
export async function migrateLegacy(body:Body){
 const op=operationId(body),legacyId=stringValue(body.legacyProjectId,300,'舊版 ID',false);
 const read=async()=>{const row=await readRecord(legacyId,WEAVING_PROJECT_TITLE_PREFIX);const p=normalizeWeavingProject(parseJson(row.內容),{id:legacyId});if(!p)throw new WeavingError('舊版織光案無法讀取',409);return p;};
 const mapping=async()=>{
  const row=await readRecord(legacyId,WEAVING_PROJECT_TITLE_PREFIX),raw=parseJson(row.內容) as Body;
  const mapped=raw.weavingMigration as {shuttleId:string;workId:string}|undefined;
  const works=(await listJsonRecords(WEAVING_WORK_TITLE_PREFIX)).flatMap(r=>{const w=normalizeWeavingWork(r.value,{id:r.id});return w?.legacyProjectId===legacyId?[w]:[];});
  if(works.length>1)throw new WeavingError('此舊案有多份升級對照，請先核對',409);
  if(mapped){const w=await readWork(mapped.workId);await readShuttle(mapped.shuttleId);if(w.legacyProjectId!==legacyId||w.shuttleId!==mapped.shuttleId||works.length!==1||works[0].id!==w.id)throw new WeavingError('舊案升級對照不一致',409);return mapped;}
  if(works.length)return {shuttleId:works[0].shuttleId,workId:works[0].id};
  if(raw.status==='archived')throw new WeavingError('舊案已封存，且無可確認的升級對照',409);
  return null;
 };
 const shuttleStep=createStep(WEAVING_SHUTTLE_TITLE_PREFIX,'shuttle',async receipt=>{const p=await read();const s=createShuttleDraft({...p,coreStatement:p.coreStatement});s.coreVersions[0].id=stableCoreId(receipt,'core');s.currentCoreVersionId=s.coreVersions[0].id;return {...s,revision:1};});
 const workStep=createStep(WEAVING_WORK_TITLE_PREFIX,'work',async receipt=>{const p=await read(),s=await readShuttle(receipt.result.shuttle.id);return {...createWorkDraft({shuttleId:s.id,title:p.title,coreVersionId:currentCore(s).id,format:p.format,formatSubtype:p.formatSubtype,draftText:p.draftText,outputUrl:p.outputUrl}),legacyProjectId:legacyId,status:p.status,finalSnapshot:['completed','sent_to_liaojie'].includes(p.status)?p.draftText:'',revision:1};});
 const archiveStep=updateStep(legacyId,WEAVING_PROJECT_TITLE_PREFIX,'archive',(row,r)=>({...parseJson(row.內容) as object,status:'archived',revision:revisionOf(parseJson(row.內容))+1,weavingMigration:{shuttleId:r.result.shuttle.id,workId:r.result.work.id}}));
 const r=await runWeavingOperation(WEAVING_OWNER,op,'migrate',body,[
 {...shuttleStep,async findConfirmed(r){const m=await mapping();return m?{id:m.shuttleId,revision:(await readShuttle(m.shuttleId)).revision}:shuttleStep.findConfirmed(r);}},
 {...workStep,async findConfirmed(r){const m=await mapping();return m?{id:m.workId,revision:(await readWork(m.workId)).revision}:workStep.findConfirmed(r);}},
 {...archiveStep,async findConfirmed(r){const row=await readRecord(legacyId,WEAVING_PROJECT_TITLE_PREFIX),raw=parseJson(row.內容) as Body,m=raw.weavingMigration as {shuttleId:string;workId:string}|undefined;if(raw.status==='archived'&&m?.shuttleId===r.result.shuttle.id&&m?.workId===r.result.work.id)return{id:legacyId,revision:revisionOf(raw)};return archiveStep.findConfirmed(r);}}
 ]);
 return {shuttle:await readShuttle(r.result.shuttle.id),works:[await readWork(r.result.work.id)],legacyProjectId:null};
}
export async function patchPublication(body: Body) {
    const id = stringValue(body.id, 300, '聊解企劃 ID', false), op = operationId(body), p = body.project as Body;
    const limits: Record<string, number> = { brandAngle: 3000, audience: 1000, platform: 100, title: 300, coverCopy: 500, summary: 5000, callToAction: 1000, themeGroup: 300, scheduledOn: 50, status: 100, publishedUrl: 2000, responseNote: 5000, nextStep: 1000 };
    if (!p || Object.keys(p).some(k => !(k in limits)))
        throw new WeavingError('受保護的聊解企劃欄位');
    for (const [k, max] of Object.entries(limits))
        if (p[k] != null)
            stringValue(p[k], max, k);
    if (p.status !== undefined && !['received', 'packaging', 'ready', 'scheduled', 'published', 'archived'].includes(String(p.status)))
        throw new WeavingError('發布狀態不正確');
    if (p.platform !== undefined && !Object.prototype.hasOwnProperty.call(LIAOJIE_PLATFORMS, String(p.platform)))
        throw new WeavingError('發布平台不正確');
    if (p.publishedUrl && !/^https?:\/\//i.test(String(p.publishedUrl)))
        throw new WeavingError('發布連結須使用 HTTP 或 HTTPS');
    if (p.scheduledOn && (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.scheduledOn)) || !Number.isFinite(Date.parse(String(p.scheduledOn))) || new Date(String(p.scheduledOn)).toISOString().slice(0, 10) !== p.scheduledOn))
        throw new WeavingError('發布日期不正確');
    const r = await runWeavingOperation(WEAVING_OWNER, op, 'patch', body, [updateStep(id, LIAOJIE_PROJECT_TITLE_PREFIX, 'publication', row => { const previous = parseJson(row.內容); expectRevision(previous, body.expectedRevision); const project = normalizeLiaojieProject({ ...previous as object, ...p, revision: revisionOf(previous) + 1 }, { id, touch: true }); if (!project)
            throw new WeavingError('聊解企劃內容不完整'); if (project.status === 'published' && !/^https?:\/\//.test(project.publishedUrl))
            throw new WeavingError('標記已發布前請填入發布連結'); if (project.status === 'scheduled' && !/^\d{4}-\d{2}-\d{2}$/.test(project.scheduledOn ?? ''))
            throw new WeavingError('請設定發布日期'); return project; })]);
    return normalizeLiaojieProject(parseJson((await readRecord(r.result.publication.id, LIAOJIE_PROJECT_TITLE_PREFIX)).內容), { id })!;
}
export async function completeWork(body: Body) {
    const id = stringValue(body.workId, 300, '作品 ID', false), op = operationId(body);
    const r = await runWeavingOperation(WEAVING_OWNER, op, 'complete', body, [createStep(COMPLETION_TITLE_PREFIX, 'completion', async (receipt) => {
            const work = await readWork(id);
            expectRevision(work, body.expectedRevision);
            if (work.status === 'archived')
                throw new WeavingError('作品已封存', 409);
            if (!work.draftText.trim() && !work.outputUrl.trim())
                throw new WeavingError('成品內容為空');
            stringValue(work.draftText, 80000, '成品文字');
            if (completionDigest(work) !== body.previewDigest)
                throw new WeavingError('預覽已失效，請重新預覽目前保存版本', 409);
            const selections=work.textWorkflow?.sourceSelections ?? (await readShuttle(work.shuttleId)).sourceSelections;
            await checkSelectionAvailability(selections);
            return { ...completionPayload(work), sourceSelections: selections, sourceSnapshotState: 'captured', schemaVersion: 1, owner: WEAVING_OWNER, operationId: op, createdAt: receipt.createdAt, state: 'confirmed', supersededBy: null };
        }), updateStep(id, WEAVING_WORK_TITLE_PREFIX, 'work', async (row, receipt) => { const work = normalizeWeavingWork(parseJson(row.內容), { id })!; expectRevision(work, body.expectedRevision); const c = await readCompletion(receipt.result.completion.id); return { ...work, revision: work.revision + 1, status: 'completed', finalSnapshot: c.text, completedAt: receipt.createdAt, completionVersionRefs: [...new Set([...work.completionVersionRefs, c.id])], currentCompletionVersionId: c.id, nextAction: '回看創作，或手動送往聊解室' }; })]);
    return { work: await readWork(id), completion: await readCompletion(r.result.completion.id) };
}
async function publication(id: string) { const row = await readRecord(id, LIAOJIE_PROJECT_TITLE_PREFIX); const p = normalizeLiaojieProject(parseJson(row.內容), { id }); if (!p)
    throw new WeavingError('聊解企劃無法讀取', 409); return p; }
export async function handoffWork(body: Body) {
    if(body.createNewVersion!==undefined&&typeof body.createNewVersion!=='boolean')throw new WeavingError('新發布版本必須明確確認');
    const workId = stringValue(body.weavingWorkId, 300, '作品 ID', false), op = operationId(body);
    const r = await runWeavingOperation(WEAVING_OWNER, op, 'handoff', body, [{ key: 'publication', async findConfirmed() {
                const w = await readWork(workId);
                if (body.weavingShuttleId !== undefined && body.weavingShuttleId !== w.shuttleId)
                    throw new WeavingError('織光杼關係不符', 403);
                if (body.completionVersionId !== undefined) {
                    const c = await readCompletion(stringValue(body.completionVersionId, 300, '成品版本 ID', false));
                    if (c.workId !== workId || !w.completionVersionRefs.includes(c.id))
                        throw new WeavingError('成品版本關係不符', 403);
                }
                const rows = (await listJsonRecords(LIAOJIE_PROJECT_TITLE_PREFIX)).flatMap(row => { const p = normalizeLiaojieProject(row.value, { id: row.id }); return p && (p.weavingWorkId === workId || w.legacyProjectId && p.weavingProjectId === w.legacyProjectId) ? [p] : []; });
                const exact = rows.filter(p => p.sourceCompletionVersionId === (body.completionVersionId ?? null));
                if (exact.length > 1)
                    throw new WeavingError('同一成品有重複企劃，請核對', 409);
                if (exact.length)
                    return { id: exact[0].id, revision: exact[0].revision };
                if (rows.length && body.createNewVersion!==true)
                    throw new WeavingError('這件作品已有發布企劃；請明確確認建立新的發布版本', 409);
                return null;
            }, async execute(receipt) {
                const work = await readWork(workId), shuttle = await readShuttle(work.shuttleId);
                if (body.weavingShuttleId !== undefined && body.weavingShuttleId !== shuttle.id)
                    throw new WeavingError('作品與織光杼關係不符', 403);
                const completionId = body.completionVersionId;
                const c = typeof completionId === 'string' ? await readCompletion(completionId) : null;
                if (c && (c.workId !== work.id || !work.completionVersionRefs.includes(c.id)))
                    throw new WeavingError('成品版本不屬於這件作品', 403);
                if (!c && !['completed', 'sent_to_liaojie'].includes(work.status))
                    throw new WeavingError('請先完成並確認成品', 409);
                if (!c && work.currentCompletionVersionId)
                    throw new WeavingError('請指定固定成品版本', 409);
                if(c && work.format!=='text' && c.sourceSnapshotState!=='captured' && !c.sourceSelections?.length)
                    throw new WeavingError('舊版成品未保留完整來源，請重新保存並確認成品；歷史版本仍保留',409);
                await sourcePolicies.assertPublication(c?.sourceSelections ?? work.textWorkflow?.sourceSelections ?? shuttle.sourceSelections ?? [], body.publicationConfirmed);
                const core = shuttle.coreVersions.find(v => v.id === (c?.coreVersionId ?? work.coreVersionId));
                if (!core)
                    throw new WeavingError('核心版本無法核對', 409);
                const p = normalizeLiaojieProject({ weavingProjectId: '', weavingShuttleId: shuttle.id, weavingWorkId: work.id, sourceCoreVersionId: core.id, sourceCompletionVersionId: c?.id ?? null, handoffOperationId: op, sourceFormat: work.format, sourceTitle: c?.title ?? work.title, sourceCoreStatement: core.statement, sourceOutputUrl: c?.outputUrl ?? work.outputUrl, sourceDraftSnapshot: c?.text ?? (work.finalSnapshot || work.draftText), brandAngle: core.statement, audience: shuttle.audience, title: c?.title ?? work.title, status: 'received', revision: 1, createdAt: receipt.createdAt }, { id: 'pending' })!;
                return createStep(LIAOJIE_PROJECT_TITLE_PREFIX, 'publication', () => p).execute(receipt);
            } }, updateStep(workId, WEAVING_WORK_TITLE_PREFIX, 'work', async (row) => { const w = normalizeWeavingWork(parseJson(row.內容), { id: workId })!; const c=typeof body.completionVersionId==='string'?await readCompletion(body.completionVersionId):null;const current=!c||c.id===w.currentCompletionVersionId&&c.text===w.draftText&&c.outputUrl===w.outputUrl&&c.title===w.title;return { ...w, revision: w.revision + 1, status: current?'sent_to_liaojie':w.status, sentToLiaojieAt: new Date().toISOString(), nextAction: '在聊解室完成首發版本' }; })]);
    return publication(r.result.publication.id);
}
export async function reflectWork(body: Body) {
    const op = operationId(body), id = stringValue(body.workId, 300, '作品 ID', false), insight = stringValue(body.insight, 5000, '回杼心得', false), move = body.nextMove, impact = body.coreImpact;
    if (!['adapt', 'update_core', 'branch', 'rest'].includes(String(move)) || !['unchanged', 'expanded', 'changed', 'branched'].includes(String(impact)))
        throw new WeavingError('回杼方向不正確');
    const previous = await readWork(id), shuttleId = previous.shuttleId;
    const core = move === 'update_core' || move === 'branch' ? stringValue(body.nextCoreStatement, 3000, '新核心觀點', false) : '';
    const title = move !== 'rest' ? stringValue(body.nextTitle, 200, '下一件作品名稱', false) : '';
    if (move === 'branch')
        stringValue(body.branchTitle, 200, '分支名稱', false);
    const steps: OperationStep[] = [updateStep(id, WEAVING_WORK_TITLE_PREFIX, 'work', async (row, r) => { const w = normalizeWeavingWork(parseJson(row.內容), { id })!; expectRevision(w, body.expectedRevision); if (!['completed', 'sent_to_liaojie'].includes(w.status))
            throw new WeavingError('請先確認作品已織成', 409); expectRevision(await readShuttle(shuttleId), body.expectedShuttleRevision); if (body.shuttleId !== undefined && body.shuttleId !== shuttleId)
            throw new WeavingError('織光杼關係不符', 403); return { ...w, revision: w.revision + 1, reflection: { insight, coreImpact: impact, nextMove: move, createdAt: r.createdAt } }; })];
    if (move === 'branch')
        steps.push(createStep(WEAVING_SHUTTLE_TITLE_PREFIX, 'shuttle', async (r) => { const old = await readShuttle(shuttleId); expectRevision(old, body.expectedShuttleRevision); const s = createShuttleDraft({ ...old, title: stringValue(body.branchTitle, 200, '分支名稱', false), coreStatement: core, branchedFromShuttleId: old.id, branchedFromWorkId: id }); s.sourceSelections = old.sourceSelections; s.coreVersions[0].id = stableCoreId(r, 'branch-core'); s.currentCoreVersionId = s.coreVersions[0].id; return { ...s, revision: 1 }; }));
    if(move==='branch')steps.push(updateStep(shuttleId,WEAVING_SHUTTLE_TITLE_PREFIX,'parentShuttle',row=>{const s=normalizeWeavingShuttle(parseJson(row.內容),{id:shuttleId})!;expectRevision(s,body.expectedShuttleRevision);return {...s,status:'branched',revision:s.revision+1};}));
    else
        steps.push(updateStep(shuttleId, WEAVING_SHUTTLE_TITLE_PREFIX, 'shuttle', (row, r) => { const s = normalizeWeavingShuttle(parseJson(row.內容), { id: shuttleId })!; expectRevision(s, body.expectedShuttleRevision); if (move === 'update_core') {
            const v = { id: stableCoreId(r, 'updated-core'), number: s.coreVersions.length + 1, statement: core, changeNote: insight, derivedFromWorkId: id, createdAt: r.createdAt };
            s.coreVersions = [...s.coreVersions, v];
            s.currentCoreVersionId = v.id;
        } return { ...s, revision: s.revision + 1, status: move === 'rest' ? 'resting' : 'active' }; }));
    if (move !== 'rest')
        steps.push(createStep(WEAVING_WORK_TITLE_PREFIX, 'nextWork', async (r) => { const s = await readShuttle(r.result.shuttle.id); return { ...createWorkDraft({ shuttleId: s.id, title, coreVersionId: currentCore(s).id, format: body.nextFormat === 'comic' || body.nextFormat === 'video' ? body.nextFormat : 'text', derivedFromWorkId: id }), revision: 1,...(body.nextFormat==='comic'||body.nextFormat==='video'?{}:{textWorkflow:{...createTextWorkflow('article'),sourceSelections:s.sourceSelections}}) }; }));
    const r = await runWeavingOperation(WEAVING_OWNER, op, 'reflect', body, steps);
    return { work: await readWork(id), shuttle: await readShuttle(r.result.shuttle.id), nextWork: r.result.nextWork ? await readWork(r.result.nextWork.id) : null, branched: move === 'branch' };
}

export type Reconciliation={receipt:OperationReceipt|null;observations:Record<string,{state:'confirmed'|'unknown'|'collision';refs:EntityRef[]}>};
/** Read-only remote evidence; never acquires/releases the writer lock or updates receipts. */
export async function reconcileOperation(op:string):Promise<Reconciliation>{
 const receipt=await inspectWeavingOperation(WEAVING_OWNER,op);if(!receipt)return {receipt:null,observations:{}};
 const prefixes=[WEAVING_SHUTTLE_TITLE_PREFIX,WEAVING_WORK_TITLE_PREFIX,COMPLETION_TITLE_PREFIX,LIAOJIE_PROJECT_TITLE_PREFIX,LIAOJIE_TEXT_VARIANT_PREFIX,LIAOJIE_TEXT_VERSION_PREFIX,WEAVING_PROJECT_TITLE_PREFIX];
 const observations:Reconciliation['observations']={};const key=operationKey(receipt.owner,receipt.operationId);
 const rows=(await Promise.all(prefixes.map(prefix=>listJsonRecords(prefix)))).flat();
 for(const step of Object.keys(receipt.steps)){
  const matches=rows.filter(row=>{const m=(row.value as {_weavingMutation?:ReturnType<typeof marker>})?._weavingMutation;return row.title.endsWith(`${key}:${step}`)||m?.owner===receipt.owner&&m.operationId===op&&m.key===step;});
  const unique=[...new Map(matches.map(row=>[row.id,row])).values()];
  const mismatch=unique.some(row=>!isMarked(row.value,receipt,step)&&!(receipt.steps[step]==='confirmed'&&receipt.result[step]?.id===row.id));
  if(step==='plurkDraft'){
   const drafts=(await listPlurkDrafts()).filter(row=>decodePlurkContent(row.內容).meta.sourceOperationId===op||receipt.steps[step]==='confirmed'&&receipt.result[step]?.id===row.id);
   observations[step]={state:drafts.length>1?'collision':drafts.length===1?'confirmed':'unknown',refs:drafts.map(row=>({id:row.id}))};
  }else observations[step]={state:unique.length>1||mismatch?'collision':unique.length===1?'confirmed':'unknown',refs:unique.map(row=>({id:row.id,revision:revisionOf(row.value)}))};
 }
 return {receipt,observations};
}
