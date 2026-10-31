import 'server-only';
import { listJsonRecords } from '../notionStore';
import { WEAVING_WORK_TITLE_PREFIX, WEAVING_SHUTTLE_TITLE_PREFIX, COMPLETION_TITLE_PREFIX } from '../formal';
import { createWorkDraft, createShuttleDraft, normalizeWeavingWork, normalizeWeavingShuttle, type WeavingWork } from '../weavingShuttle';
import { createStep, updateStep, readWork, readShuttle, expectRevision, operationId, WEAVING_OWNER, completeWork, handoffWork, type Body } from '../weavingWorkflow/store';
import { runWeavingOperation, operationDigest, inspectWeavingOperation } from '../weavingWorkflow/operations';
import { completionDigest, listCompletions, readCompletion } from '../weavingWorkflow/completions';
import { createTextWorkflow } from '../weavingWorkflow/templates';
import { WeavingError,normalizeWorkflow } from '../weavingWorkflow/model';
import { blankStudio, normalizeStudio, normalizeDirections, studioForWork, raw, type StudioData } from './model';
import { importDigest, importPreview, planImport } from './migration';
export async function studioWorks() { return (await listJsonRecords(WEAVING_WORK_TITLE_PREFIX)).flatMap(r => { const w = normalizeWeavingWork(r.value, { id: r.id }); return w && w.status !== 'archived' ? [w] : []; }); }
export async function studioTopics() { return (await listJsonRecords(WEAVING_SHUTTLE_TITLE_PREFIX)).flatMap(r => { const s = normalizeWeavingShuttle(r.value, { id: r.id }); return s && s.status !== 'archived' ? [s] : []; }); }
export async function getStudioWork(id: string) { const work = await readWork(id); if (!work.studio && work.shuttleId) {
    const topic = await readShuttle(work.shuttleId), data = studioForWork(work), direction = topic.studioDirections?.find(d => d.versions.some(v => v.id === work.coreVersionId)), version = direction?.versions.find(v => v.id === work.coreVersionId);
    if (direction && version)
        data.direction = { directionId: direction.id, versionId: version.id, title: direction.title, statement: version.statement };
    work.studio = data;
} return { work, completions: await listCompletions(id), previewDigest: completionDigest(work) }; }
function workflow(s:StudioData,old?:WeavingWork){
 const wf=old?.textWorkflow||createTextWorkflow('article'),selected=s.source.selected,controlled=['studio-source','studio-owner:pending',...(old?['studio-owner:'+old.id]:[])];
 const retained=wf.sourceSelections.filter(x=>x.sourceType!=='manual'||!controlled.includes(x.sourceId));
 const sameAsCanonical=selected===retained.map(x=>x.selectedText).join('\n\n');
 const previous=wf.sourceSelections.find(x=>controlled.includes(x.sourceId)&&x.selectedText===selected&&x.sourceVersion===s.source.selectedVersion);
 const addition=selected&&!sameAsCanonical?[previous||{sourceType:'manual' as const,sourceId:'studio-owner:'+(old?.id||'pending'),sourceVersion:s.source.selectedVersion,locator:s.source.title||'本次人工選摘',contentKind:'experience' as const,selectedText:selected,capturedAt:new Date().toISOString(),digest:operationDigest([s.source.id,s.source.selectedVersion,selected])}]:[];
 return {...wf,blocks:[{id:'studio-body',role:'正文',text:s.body,mediaNote:''}],sourceSelections:[...retained,...addition]};
}
export async function createStudioWork(body: Body) {
    const op = operationId(body), studio = body.studio ? normalizeStudio(body.studio) : blankStudio(), title = raw(body.title ?? '未命名探索草稿', 200) || '未命名探索草稿';
    const step = createStep(WEAVING_WORK_TITLE_PREFIX, 'work', () => ({ ...createWorkDraft({ shuttleId: typeof body.shuttleId === 'string' ? body.shuttleId : '', coreVersionId: studio.direction?.versionId || 'unassigned', title, format: 'text', studio }), revision: 1, studio, textWorkflow: body.canonicalSelections ? normalizeWorkflow({...workflow(studio),sourceSelections:body.canonicalSelections})! : workflow(studio), draftText: studio.body }));
    const find = step.findConfirmed;
    step.findConfirmed = async (r) => { const exact = await find(r); if (exact)
        return exact; if (studio.originKey && body.another !== true) {
        const same = (await studioWorks()).find(w => w.studio?.originKey === studio.originKey && (!['completed', 'sent_to_liaojie', 'archived'].includes(w.status) || studio.serviceId && w.status !== 'archived'));
        if (same)
            return { id: same.id, revision: same.revision };
    } return null; };
    const r = await runWeavingOperation(WEAVING_OWNER, op, 'create_work', body, [step]);
    return readWork(r.result.work.id);
}
export async function saveStudioWork(body: Body) {
    const id = raw(body.id, 300), incoming = normalizeStudio(body.studio), op = operationId(body);
    const r = await runWeavingOperation(WEAVING_OWNER, op, 'patch', body, [updateStep(id, WEAVING_WORK_TITLE_PREFIX, 'work', async (row, receipt) => {
            const old = normalizeWeavingWork(JSON.parse(row.內容), { id })!;
            expectRevision(old, body.expectedRevision);
            const prev = studioForWork(old);
            if (prev.source.raw && prev.source.raw !== incoming.source.raw)
                throw new WeavingError('原稿已保存；請追加校訂，保留原稿與歷史', 409);
            if (JSON.stringify(incoming.source.corrections.slice(0, prev.source.corrections.length)) !== JSON.stringify(prev.source.corrections))
                throw new WeavingError('校訂歷史不可移除或覆寫', 409);
            const shuttleId = body.shuttleId === undefined ? old.shuttleId : raw(body.shuttleId, 300);
            if (incoming.direction) {
                if (!shuttleId)
                    throw new WeavingError('請先選方向所屬織光杼');
                const sh = await readShuttle(shuttleId), d = sh.studioDirections?.find(d => d.id === incoming.direction!.directionId), v = d?.versions.find(v => v.id === incoming.direction!.versionId);
                if (!v || v.statement !== incoming.direction.statement)
                    throw new WeavingError('方向理解無法核對', 409);
            }
            if (old.studio?.importIdentity)
                incoming.importIdentity = old.studio.importIdentity;
            if (old.studio?.legacy)
                incoming.legacy = old.studio.legacy;
            incoming.history = prev.history;
            if (prev.body && prev.body !== incoming.body)
                incoming.history = [...prev.history, { id: receipt.operationId, text: prev.body, note: '改寫前正文', createdAt: receipt.createdAt }];
            for (const a of incoming.analyses) {
                const c = await readCompletion(a.completionId);
                if (c.workId !== id || c.text !== a.sourceText || c.coreVersionId !== a.coreVersionId)
                    throw new WeavingError('D 分析來源版本不符', 403);
            }
            return { ...old, title: raw(body.title ?? old.title, 200) || '未命名探索草稿', shuttleId, coreVersionId: incoming.direction?.versionId || 'unassigned', studio: incoming, textWorkflow: workflow(incoming, old), draftText: incoming.body, revision: old.revision + 1, status: 'drafting', updatedAt: receipt.createdAt };
        })]);
    return readWork(r.result.work.id);
}
export async function completeStudioWork(body: Body) { const id = raw(body.id, 300), prior = await inspectWeavingOperation(WEAVING_OWNER, operationId(body)); if (prior?.state === 'confirmed')
    return completeWork({ operationId: operationId(body), workId: id, expectedRevision: body.expectedRevision, previewDigest: body.previewDigest }); const w = await readWork(id); expectRevision(w, body.expectedRevision); const s = studioForWork(w); if (!Object.values(s.checks).every(Boolean))
    throw new WeavingError('請完成共通收尾的四項確認'); return completeWork({ operationId: operationId(body), workId: id, expectedRevision: body.expectedRevision, previewDigest: body.previewDigest }); }
export async function handoffStudio(body: Body) { const id = raw(body.id, 300), c = await readCompletion(raw(body.completionId, 300)); if (c.workId !== id)
    throw new WeavingError('完稿不屬於這件作品', 403); if (c.studioSnapshot && !c.studioSnapshot.source.allowPublic)
    throw new WeavingError('這份固定版本尚未確認可公開；請確認用途後重新定稿', 403); return handoffWork({ operationId: operationId(body), weavingWorkId: id, completionVersionId: c.id, publicationConfirmed: body.publicationConfirmed, createNewVersion: body.createNewVersion }); }
export async function createStudioTopic(body: Body) { const title = raw(body.title, 200); if (!title.trim())
    throw new WeavingError('請填主題名稱'); const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'create_pair', body, [createStep(WEAVING_SHUTTLE_TITLE_PREFIX, 'shuttle', r => ({ ...createShuttleDraft({ title, coreStatement: title, sourceType: 'manual', sourceSnapshot: '', sourceId: null, audience: '', direction: '' }), studioDirections: [], revision: 1, createdAt: r.createdAt }))]); return readShuttle(r.result.shuttle.id); }
export async function saveStudioDirections(body: Body) { const id = raw(body.id, 300), directions = normalizeDirections(body.directions); const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'patch', body, [updateStep(id, WEAVING_SHUTTLE_TITLE_PREFIX, 'shuttle', (row, r) => { const old = normalizeWeavingShuttle(JSON.parse(row.內容), { id })!; expectRevision(old, body.expectedRevision); for (const d of old.studioDirections || []) {
        const n = directions.find(x => x.id === d.id);
        if (!n || JSON.stringify(n.versions.slice(0, d.versions.length)) !== JSON.stringify(d.versions))
            throw new WeavingError('已保存的方向理解不可刪除或改寫，請新增版本', 409);
    } return { ...old, studioDirections: directions, revision: old.revision + 1, updatedAt: r.createdAt }; })]); return readShuttle(r.result.shuttle.id); }
export async function importStudio(body: Body) {
    const preview = importPreview(body.packet), op = operationId(body);
    if (preview.kind !== 'html')
        throw new WeavingError('這份備份請由原工具或原正式入口開啟；預覽與備份保持可用');
    const packet = body.packet as Record<string, unknown>, originalTopics = Array.isArray(packet.shuttles) ? packet.shuttles as Record<string, unknown>[] : [], originalDirections = Array.isArray(packet.directions) ? packet.directions as Record<string, unknown>[] : [];
    const mapping = new Map<string, string>();
    for (const old of originalTopics) {
        const directions = originalDirections.filter(d => d.shuttleId === old.id), identity = importDigest({ topic: old, directions });
        const existing = (await studioTopics()).find(t => t.studioImportIdentity === identity);
        if (existing) {
            mapping.set(String(old.id), existing.id);
            continue;
        }
        const nativeDirections = normalizeDirections(directions.map(d => ({ id: String(d.id), title: String(d.title || '待整理方向'), versions: (Array.isArray(d.versions) ? d.versions : []).map(x => { const v = x as Record<string, unknown>; return { id: String(v.id), statement: String(v.statement || ''), note: String(v.unresolved || v.note || ''), createdAt: String(v.createdAt || '') }; }) })));
        const step = createStep(WEAVING_SHUTTLE_TITLE_PREFIX, 'shuttle', () => ({ ...createShuttleDraft({ title: String(old.title || '匯入主題'), sourceType: 'manual', sourceSnapshot: '', coreStatement: String(old.title || '匯入主題') }), studioImportIdentity: identity, studioLegacy: structuredClone(old), studioDirections: nativeDirections, revision: 1 }));
        const r = await runWeavingOperation(WEAVING_OWNER, operationDigest(['import-topic', identity]), 'migrate', { identity }, [step]);
        mapping.set(String(old.id), r.result.shuttle.id);
    }
    const allWorks=await studioWorks(),nativeWork=(body.packet as {work?:{id?:string}}).work;
    if(nativeWork?.id&&allWorks.some(w=>w.id===nativeWork.id))return {workIds:[nativeWork.id],warnings:[...preview.warnings,'原正式作品仍在，已接續其目前版本；未用備份覆蓋較新的內容。']};
    const planned = planImport(allWorks, preview), workIds: string[] = [];
    for (const x of preview.works) {
        const resumed = planned.resume.find(r => r.identity === x.identity);
        let w = resumed ? await readWork(resumed.workId) : null;
        if (!w) {
            const shuttleId = mapping.get(x.shuttleId || '') || '', legacyData = x.studio.legacy?.data as Record<string, unknown> | undefined, old = legacyData?.adoptedDirection as Record<string, unknown> | undefined;
            let direction = null;
            if (shuttleId && old) {
                const understanding = old.understanding as Record<string, unknown> | undefined;
                direction = { directionId: String(old.directionId), versionId: String(old.understandingVersionId), title: String(old.title || ''), statement: String(understanding?.statement || '') };
            }
            w = await createStudioWork({ operationId: operationDigest([op, x.identity]), title: x.title, shuttleId, canonicalSelections:(x.studio.legacy?.nativeWork as WeavingWork|undefined)?.textWorkflow?.sourceSelections, studio: { ...x.studio, direction, originKey: 'import:' + x.identity } });
        }
        const legacyData = x.studio.legacy?.data as Record<string, unknown> | undefined, versions = Array.isArray(legacyData?.versions) ? legacyData.versions as Record<string, unknown>[] : [];
        for (const old of versions) {
            const text = typeof old.body === 'string' ? old.body : typeof old.draft === 'string' ? old.draft : '';
            if (old.format && old.format !== 'text' || !text.trim())
                continue;
            const identity = importDigest([x.identity, old]), exists = (await listCompletions(w.id)).some(c => (c as unknown as Record<string, unknown>).importIdentity === identity);
            if (exists)
                continue;
            const studio = structuredClone(x.studio), adoption = old.adoptedDirection as Record<string, unknown> | undefined;
            studio.body = text;
            studio.legacy = { sourceWorkId: x.sourceId, fixedVersion: structuredClone(old) };
            if (adoption) {
                const understanding = adoption.understanding as Record<string, unknown> | undefined;
                studio.direction = { directionId: String(adoption.directionId), versionId: String(adoption.understandingVersionId), title: String(adoption.title || ''), statement: String(understanding?.statement || '') };
            }
            const oldSources = Array.isArray(old.sources) ? old.sources as Record<string, unknown>[] : [];
            studio.source.selected = oldSources.map(r => String(r.text || '')).join('\n\n');
            studio.source.allowPublic = false;
            studio.source.allowAI = false;
            await runWeavingOperation(WEAVING_OWNER, operationDigest(['import-version', identity]), 'migrate', { workId: w.id, identity }, [createStep(COMPLETION_TITLE_PREFIX, 'completion', r => ({ schemaVersion: 1, owner: WEAVING_OWNER, workId: w!.id, operationId: r.operationId, coreVersionId: studio.direction?.versionId || 'unassigned', sourceSelections: Array.isArray(old.sourceSelections)?old.sourceSelections:workflow(studio).sourceSelections, sourceSnapshotState: 'captured', outputKind: 'article', text, title: String(old.title || x.title), outputUrl: '', createdAt: typeof old.createdAt === 'string' ? old.createdAt : r.createdAt, state: 'confirmed', supersededBy: null, studioSnapshot: studio, importIdentity: identity, originalVersionId: String(old.id || '') })), updateStep(w.id, WEAVING_WORK_TITLE_PREFIX, 'work', (row, r) => { const work = normalizeWeavingWork(JSON.parse(row.內容), { id: w!.id })!; return { ...work, revision: work.revision + 1, completionVersionRefs: [...new Set([...work.completionVersionRefs, r.result.completion.id])], currentCompletionVersionId: r.result.completion.id }; })]);
        }
        workIds.push(w.id);
    }
    return { workIds, warnings: preview.warnings };
}
export async function archiveStudioImport(body: Body) { const id = raw(body.id, 300); const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'archive', body, [updateStep(id, WEAVING_WORK_TITLE_PREFIX, 'work', (row, r) => { const w = normalizeWeavingWork(JSON.parse(row.內容), { id })!; expectRevision(w, body.expectedRevision); if (!w.studio?.importIdentity)
        throw new WeavingError('這項不是匯入作品', 403); return { ...w, status: body.restore === true ? 'drafting' : 'archived', revision: w.revision + 1, updatedAt: r.createdAt }; })]); return readWork(r.result.work.id); }
