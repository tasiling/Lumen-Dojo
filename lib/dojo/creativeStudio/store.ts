import {assertResearchHistory,previewResearchIntegration} from './researchWorkflow';
import { assertPlatformProvenance } from './model';
import { normalizeLiaojieProject } from '../liaojiePublication';
import { createTextVariant, saveTextVariant } from '../liaojieText/store';
import { adaptSource } from '../liaojieText/model';
import { sourcePolicies } from '../creativeSources/store';
import { productionSources, type SelectionRequest } from '../weavingWorkflow/sources';
import { taskContext, taskStatus } from './tasks';
import { importLooseDirection, nativeDirection, looseDirections } from './looseDirections';
import { importReport } from './importPlan';
import { cBase, manuscriptForAdoption, recordRound } from './collaboration';
import 'server-only';
import { listJsonRecords } from '../notionStore';
import { WEAVING_WORK_TITLE_PREFIX, WEAVING_SHUTTLE_TITLE_PREFIX, COMPLETION_TITLE_PREFIX, LIAOJIE_PROJECT_TITLE_PREFIX } from '../formal';
import { createWorkDraft, createShuttleDraft, normalizeWeavingWork, normalizeWeavingShuttle, type WeavingWork } from '../weavingShuttle';
import { createStep, updateStep, readWork, readShuttle, expectRevision, operationId, readRecord, WEAVING_OWNER, completeWork, handoffWork, type Body } from '../weavingWorkflow/store';
import { runWeavingOperation, operationDigest, inspectWeavingOperation } from '../weavingWorkflow/operations';
import { completionDigest, listCompletions, readCompletion } from '../weavingWorkflow/completions';
import { createTextWorkflow } from '../weavingWorkflow/templates';
import { WeavingError, normalizeWorkflow } from '../weavingWorkflow/model';
import { blankStudio, normalizeStudio, normalizeDirections, studioForWork, raw, type StudioData } from './model';
import { importDigest, planImport, prototypePageText } from './migration';
export async function studioWorks(includeArchived = false) { return (await listJsonRecords(WEAVING_WORK_TITLE_PREFIX)).flatMap(r => { const w = normalizeWeavingWork(r.value, { id: r.id }); return w && (includeArchived || w.status !== 'archived') ? [w] : []; }); }
export async function studioTopics() { return (await listJsonRecords(WEAVING_SHUTTLE_TITLE_PREFIX)).flatMap(r => { const s = normalizeWeavingShuttle(r.value, { id: r.id }); return s && s.status !== 'archived' ? [s] : []; }); }
export async function getStudioWork(id: string) {
    const work = await readWork(id), digest = completionDigest(work);
    if (!work.studio && work.shuttleId) {
        const topic = await readShuttle(work.shuttleId), data = studioForWork(work), direction = topic.studioDirections?.find(d => d.versions.some(v => v.id === work.coreVersionId)), version = direction?.versions.find(v => v.id === work.coreVersionId);
        if (direction && version)
            data.direction = { directionId: direction.id, versionId: version.id, title: direction.title, statement: version.statement };
        work.studio = data;
    }
    const completions = await listCompletions(id);
    if (work.studio) {
        const s = studioForWork(work), f = s.collaboration;
        for (const [textKey, idKey] of [['cSource', 'cVersionId'], ['cExpandedSource', 'cExpandedVersionId']] as const) {
            const original = f[idKey];
            if (original && !['draft', 'manual'].includes(original) && !completions.some(c => c.id === original)) {
                const match = completions.find(c => (c as unknown as {
                    originalVersionId?: string;
                }).originalVersionId === original && c.text === f[textKey]);
                if (match)
                    f[idKey] = match.id;
                else
                    f[idKey] = 'manual';
            }
        }
        work.studio = s;
    }
    return { work, completions, previewDigest: digest };
}
function workflow(s: StudioData, old?: WeavingWork) {
    const wf = old?.textWorkflow || createTextWorkflow('article'), selected = s.source.selected, controlled = ['studio-source', 'studio-owner:pending', ...(old ? ['studio-owner:' + old.id] : [])];
    const retained = wf.sourceSelections.filter(x => x.sourceType !== 'manual' || !controlled.includes(x.sourceId));
    const sameAsCanonical = selected === retained.map(x => x.selectedText).join('\n\n');
    const previous = wf.sourceSelections.find(x => controlled.includes(x.sourceId) && x.selectedText === selected && x.sourceVersion === s.source.selectedVersion);
    const addition = selected && !sameAsCanonical ? [previous || { sourceType: 'manual' as const, sourceId: 'studio-owner:' + (old?.id || 'pending'), sourceVersion: s.source.selectedVersion, locator: s.source.title || '本次人工選摘', contentKind: 'experience' as const, selectedText: selected, capturedAt: new Date().toISOString(), digest: operationDigest([s.source.id, s.source.selectedVersion, selected]) }] : [];
    return { ...wf, blocks: [{ id: 'studio-body', role: '正文', text: s.body, mediaNote: '' }], sourceSelections: [...retained, ...addition] };
}
export async function createStudioWork(body: Body, restore?: WeavingWork) {
    const op = operationId(body), studio = body.studio ? normalizeStudio(body.studio) : blankStudio(), title = raw(body.title ?? '未命名探索草稿', 200) || '未命名探索草稿';
    const step = createStep(WEAVING_WORK_TITLE_PREFIX, 'work', () => ({ ...createWorkDraft({ shuttleId: typeof body.shuttleId === 'string' ? body.shuttleId : '', coreVersionId: studio.direction?.versionId || 'unassigned', title, format: 'text', studio }), ...(restore ? { status: restore.status, derivedFromWorkId: restore.derivedFromWorkId, finalSnapshot: restore.finalSnapshot, outputUrl: restore.outputUrl, completedAt: restore.completedAt, sentToLiaojieAt: restore.sentToLiaojieAt, reflection: restore.reflection, formatSubtype: restore.formatSubtype } : {}), revision: 1, studio, textWorkflow: body.canonicalSelections ? normalizeWorkflow({ ...workflow(studio), sourceSelections: body.canonicalSelections })! : workflow(studio), draftText: studio.body }));
    const find = step.findConfirmed;
    step.findConfirmed = async (r) => {
        const exact = await find(r);
        if (exact)
            return exact;
        if (studio.originKey && body.another !== true) {
            const same = (await studioWorks(studio.originKey.startsWith('derived:'))).find(w => w.studio?.originKey === studio.originKey && (studio.originKey.startsWith('derived:') || !['completed', 'sent_to_liaojie', 'archived'].includes(w.status) || studio.serviceId && w.status !== 'archived'));
            if (same)
                return { id: same.id, revision: same.revision };
        }
        return null;
    };
    const r = await runWeavingOperation(WEAVING_OWNER, op, 'create_work', body, [step]);
    return readWork(r.result.work.id);
}
export async function saveStudioWork(body: Body) {
    const id = raw(body.id, 300), incoming = normalizeStudio(body.studio), op = operationId(body);
    const r = await runWeavingOperation(WEAVING_OWNER, op, 'patch', body, [updateStep(id, WEAVING_WORK_TITLE_PREFIX, 'work', async (row, receipt) => {
            const old = normalizeWeavingWork(JSON.parse(row.內容), { id })!;
            for(const ticket of studioForWork(old).collaboration.tasks)if(!incoming.collaboration.tasks.some(t=>JSON.stringify(t)===JSON.stringify(ticket)))throw new WeavingError('已保存的協作任務不可刪除或改寫',409);
            expectRevision(old, body.expectedRevision);
            const prev = studioForWork(old);
            try { assertPlatformProvenance(prev,incoming);assertResearchHistory(prev.researchWork,incoming.researchWork); }
            catch (e) { throw new WeavingError((e as Error).message,409); }
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
            if (JSON.stringify(incoming.collaboration.rounds.slice(0, prev.collaboration.rounds.length)) !== JSON.stringify(prev.collaboration.rounds))
                throw new WeavingError('已保存協作輪次不可覆寫，請新增一輪', 409);
            if (['completed', 'sent_to_liaojie', 'archived'].includes(old.status) && (incoming.body !== prev.body || (body.title !== undefined && body.title !== old.title)))
                throw new WeavingError('請先開始修訂，再修改完稿內容', 409);
            incoming.history = prev.history;
            if (prev.body && prev.body !== incoming.body)
                incoming.history = [...prev.history, { id: receipt.operationId, text: prev.body, note: '改寫前正文', createdAt: receipt.createdAt }];
            for (const a of incoming.analyses) {
                const c = await readCompletion(a.completionId);
                if (c.workId !== id || c.text !== a.sourceText || c.coreVersionId !== a.coreVersionId)
                    throw new WeavingError('D 分析來源版本不符', 403);
            }
            return { ...old, title: raw(body.title ?? old.title, 200) || '未命名探索草稿', shuttleId, coreVersionId: incoming.direction?.versionId || 'unassigned', studio: incoming, textWorkflow: workflow(incoming, old), draftText: incoming.body, revision: old.revision + 1, status: ['completed', 'sent_to_liaojie', 'archived'].includes(old.status) ? old.status : 'drafting', updatedAt: receipt.createdAt };
        })]);
    return readWork(r.result.work.id);
}
export async function completeStudioWork(body: Body) {
    const id = raw(body.id, 300), prior = await inspectWeavingOperation(WEAVING_OWNER, operationId(body));
    if (prior?.state === 'confirmed')
        return completeWork({ operationId: operationId(body), workId: id, expectedRevision: body.expectedRevision, previewDigest: body.previewDigest });
    const w = await readWork(id);
    expectRevision(w, body.expectedRevision);
    const s = studioForWork(w);
    if (!Object.values(s.checks).every(Boolean))
        throw new WeavingError('請完成共通收尾的四項確認');
    return completeWork({ operationId: operationId(body), workId: id, expectedRevision: body.expectedRevision, previewDigest: body.previewDigest });
}
export async function handoffStudio(body: Body) {
    const id = raw(body.id, 300), c = await readCompletion(raw(body.completionId, 300));
    if (c.workId !== id)
        throw new WeavingError('完稿不屬於這件作品', 403);
    if (c.studioSnapshot && !c.studioSnapshot.source.allowPublic)
        throw new WeavingError('這份固定版本尚未確認可公開；請確認用途後重新定稿', 403);
    return handoffWork({ operationId: operationId(body), weavingWorkId: id, completionVersionId: c.id, publicationConfirmed: body.publicationConfirmed, createNewVersion: body.createNewVersion, returnRealm:body.returnRealm });
}
export async function createStudioTopic(body: Body) {
    const title = raw(body.title, 200);
    if (!title.trim())
        throw new WeavingError('請填主題名稱');
    const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'create_pair', body, [createStep(WEAVING_SHUTTLE_TITLE_PREFIX, 'shuttle', r => ({ ...createShuttleDraft({ title, coreStatement: title, sourceType: 'manual', sourceSnapshot: '', sourceId: null, audience: '', direction: '' }), studioDirections: [], revision: 1, createdAt: r.createdAt }))]);
    return readShuttle(r.result.shuttle.id);
}
export async function saveStudioDirections(body: Body) {
    const id = raw(body.id, 300), directions = normalizeDirections(body.directions);
    const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'patch', body, [updateStep(id, WEAVING_SHUTTLE_TITLE_PREFIX, 'shuttle', (row, r) => {
            const old = normalizeWeavingShuttle(JSON.parse(row.內容), { id })!;
            expectRevision(old, body.expectedRevision);
            for (const d of old.studioDirections || []) {
                const n = directions.find(x => x.id === d.id);
                if (!n || JSON.stringify(n.versions.slice(0, d.versions.length)) !== JSON.stringify(d.versions))
                    throw new WeavingError('已保存的方向理解不可刪除或改寫，請新增版本', 409);
            }
            return { ...old, studioDirections: directions, revision: old.revision + 1, updatedAt: r.createdAt };
        })]);
    return readShuttle(r.result.shuttle.id);
}
export async function selectStudioSources(body: Body) {
    const id=raw(body.id,300),requests=body.selectionRequests as SelectionRequest[],resolved=await productionSources(undefined,'perspective',true).resolveSelections(requests),selections=resolved.map((r,i)=>({...r,locator:(r.locator+' · 第 '+requests[i].start+'–'+requests[i].end+' 字元').slice(0,2000)})),policies=await sourcePolicies.list();
    const result=await runWeavingOperation(WEAVING_OWNER,operationId(body),'patch',body,[updateStep(id,WEAVING_WORK_TITLE_PREFIX,'work',row=>{
        const old=normalizeWeavingWork(JSON.parse(row.內容),{id})!;expectRevision(old,body.expectedRevision);
        if(['completed','sent_to_liaojie','archived'].includes(old.status))throw Error('請先開始修訂或恢復作品，再加入素材');
        const s=studioForWork(old),previous=old.textWorkflow || createTextWorkflow('article'),added=selections.filter(r=>!previous.sourceSelections.some(x=>x.digest===r.digest && x.sourceId===r.sourceId));
        if(!added.length)return old;
        const text=added.map(r=>r.selectedText).join('\n\n');
        s.source={...s.source,raw:s.source.raw || text,selected:[s.source.selected,text].filter(Boolean).join('\n\n'),selectedVersion:'original',title:[s.source.title,...added.map(r=>r.locator)].filter(Boolean).join('／').slice(0,300),allowAI:false,allowPublic:false,read:selections.some(r=>policies.some(p=>p.ref.sourceType===r.sourceType&&p.ref.sourceId===r.sourceId&&p.discovery==='private'))?'private':s.source.read};
        normalizeStudio(s);
        return {...old,studio:s,textWorkflow:{...previous,sourceSelections:[...previous.sourceSelections,...added]},revision:old.revision+1,updatedAt:new Date().toISOString()};
    })]);return readWork(result.result.work.id);
}
export async function previewStudioImport(packet: unknown) {const works=await studioWorks(true),loose=await looseDirections(true),pre=importReport(packet,works,loose),fixed=(await Promise.all(pre.plan.filter(p=>p.workId).map(p=>listCompletions(p.workId)))).flat();return importReport(packet,works,loose,fixed);}
export async function importStudio(body: Body) {
    const preview = await previewStudioImport(body.packet), op = operationId(body);
    if(body.planDigest && body.planDigest !== preview.planDigest)throw new WeavingError('預覽後資料已變更，請重新預覽新建／接續對照',409);
    if (preview.kind !== 'html')
        throw new WeavingError('這份備份請由原工具或原正式入口開啟；預覽與備份保持可用');
    const envelope = body.packet as Record<string, unknown>, packet = (envelope.kind === 'lumen-weaving-flow-prototype' && envelope.state ? envelope.state : envelope) as Record<string, unknown>, originalTopics = Array.isArray(packet.shuttles) ? packet.shuttles as Record<string, unknown>[] : [], originalDirections = Array.isArray(packet.directions) ? packet.directions as Record<string, unknown>[] : [];
    const mapping = new Map<string, string>();
    for (const old of originalTopics) {
        const directions = originalDirections.filter(d => d.shuttleId === old.id), identity = importDigest({ topic: old, directions });
        const existing = (await studioTopics()).find(t => t.studioImportIdentity === identity);
        if (existing) {
            const native=directions.map(nativeDirection);
            if(native.some(d=>{const prev=existing.studioDirections?.find(x=>x.id===d.id);return prev&&!prev.details;}))await runWeavingOperation(WEAVING_OWNER,operationDigest(['import-direction-metadata',identity]),'migrate',{identity},[updateStep(existing.id,WEAVING_SHUTTLE_TITLE_PREFIX,'topic',(row,r)=>{const t=normalizeWeavingShuttle(JSON.parse(row.內容),{id:existing.id})!;return {...t,studioDirections:(t.studioDirections||[]).map(d=>{const source=native.find(x=>x.id===d.id);return source&&!d.details?{...d,question:d.question||source.question,angle:d.angle||source.angle,details:source.details}:d;}),revision:t.revision+1,updatedAt:r.createdAt};})]);
            mapping.set(String(old.id), existing.id);
            continue;
        }
        const nativeDirections = directions.map(nativeDirection);
        const step = createStep(WEAVING_SHUTTLE_TITLE_PREFIX, 'shuttle', () => ({ ...createShuttleDraft({ title: String(old.title || '匯入主題'), sourceType: 'manual', sourceSnapshot: '', coreStatement: String(old.title || '匯入主題') }), studioImportIdentity: identity, studioLegacy: structuredClone(old), studioDirections: nativeDirections, revision: 1 }));
        const r = await runWeavingOperation(WEAVING_OWNER, operationDigest(['import-topic', identity]), 'migrate', { identity }, [step]);
        mapping.set(String(old.id), r.result.shuttle.id);
    }
    for(const d of originalDirections.filter(d=>!originalTopics.some(t=>t.id===d.shuttleId)))await importLooseDirection(d);
    const allWorks = await studioWorks(true), nativeWork = (body.packet as {
        work?: {
            id?: string;
        };
    }).work;
    if (nativeWork?.id && allWorks.some(w => w.id === nativeWork.id))
        return { workIds: [nativeWork.id], warnings: [...preview.warnings, '原正式作品仍在，已接續其目前版本；未用備份覆蓋較新的內容。'] };
    const planned = planImport(allWorks, preview), workIds: string[] = [];
    for (const x of preview.works) {
        const nativeData = x.studio.legacy?.nativeWork, native = nativeData ? normalizeWeavingWork(nativeData, { id: x.sourceId }) : null;
        const legacyData = x.studio.legacy?.data as Record<string, unknown> | undefined, versions = Array.isArray(legacyData?.versions) ? legacyData.versions as Record<string, unknown>[] : [];
        // Verify the backup itself, never an old live completion owned by another work.
        // Keep the original packet and immutable studio snapshots as historical evidence.
        if (native) {
            for (const a of x.studio.analyses) {
                const sources = versions.filter(v => v.id === a.completionId);
                const source = sources[0];
                if (sources.length !== 1 || source.workId !== native.id || source.state !== 'confirmed' || source.text !== a.sourceText || source.coreVersionId !== a.coreVersionId || !a.sourceText.trim())
                    throw new WeavingError('D 分析來源版本無法核對；請保留原始備份並核對固定版本', 409);
            }
        }
        const resumed = planned.resume.find(r => r.identity === x.identity);
        let w = resumed ? await readWork(resumed.workId) : null;
        if (!w) {
            const shuttleId = native?.shuttleId || mapping.get(x.shuttleId || '') || '', legacyData = x.studio.legacy?.data as Record<string, unknown> | undefined, old = legacyData?.adoptedDirection as Record<string, unknown> | undefined;
            let direction = native ? x.studio.direction : null;
            if (shuttleId && old) {
                const understanding = old.understanding as Record<string, unknown> | undefined;
                direction = { directionId: String(old.directionId), versionId: String(old.understandingVersionId), title: String(old.title || ''), statement: String(understanding?.statement || '') };
            }
            w = await createStudioWork({ operationId: operationDigest([op, x.identity]), title: x.title, shuttleId, canonicalSelections: native?.textWorkflow?.sourceSelections || x.selections, studio: { ...x.studio, direction, originKey: 'import:' + x.identity } }, native || undefined);
        }
        if(resumed && !native && studioForWork(w).legacy?.migrationVersion !== 2){
            const targetId=w.id;
            await runWeavingOperation(WEAVING_OWNER,operationDigest(['import-functional-backfill',x.identity]),'migrate',{identity:x.identity,id:targetId},[updateStep(targetId,WEAVING_WORK_TITLE_PREFIX,'work',(row,r)=>{
                const old=normalizeWeavingWork(JSON.parse(row.內容),{id:targetId})!, current=studioForWork(old), converted=x.studio;
                if(!current.collaboration.aAnswers.trim())current.collaboration.aAnswers=converted.collaboration.aAnswers;
                current.history=[...current.history,...converted.history.filter(h=>!current.history.some(x=>x.id===h.id))];
                current.platformDrafts=[...current.platformDrafts,...converted.platformDrafts.filter(h=>!current.platformDrafts.some(x=>x.id===h.id))];
                current.publicationHistory=[...current.publicationHistory,...converted.publicationHistory.filter(h=>!current.publicationHistory.some(x=>x.id===h.id))];
                current.legacy={...current.legacy,migrationVersion:2};
                return {...old,studio:current,revision:old.revision+1,updatedAt:r.createdAt};
            })]);
            w=await readWork(targetId);
        }
        for (const old of versions) {
            const illustrated = old.format === 'illustrated' && Array.isArray(old.pages) && old.pages.length > 0;
            const text = (typeof old.body === 'string' ? old.body : typeof old.draft === 'string' ? old.draft : '') || (illustrated ? prototypePageText(old.pages) : '');
            if (old.format && old.format !== 'text' && !illustrated || !text.trim())
                continue;
            const identity = importDigest([x.identity, old]), exists = (await listCompletions(w.id)).some(c => (c as unknown as Record<string, unknown>).importIdentity === identity);
            if (exists)
                continue;
            const studio = old.studioSnapshot ? normalizeStudio(old.studioSnapshot) : structuredClone(x.studio), adoption = old.adoptedDirection as Record<string, unknown> | undefined;
            studio.body = text;
            if (illustrated)
                studio.contentKind = 'illustrated';
            studio.legacy = { sourceWorkId: x.sourceId, fixedVersion: structuredClone(old) };
            if (adoption) {
                const understanding = adoption.understanding as Record<string, unknown> | undefined;
                studio.direction = { directionId: String(adoption.directionId), versionId: String(adoption.understandingVersionId), title: String(adoption.title || ''), statement: String(understanding?.statement || '') };
            }
            const oldSources = Array.isArray(old.sources) ? old.sources as Record<string, unknown>[] : [];
            if (!old.studioSnapshot) {
                studio.collaboration.aAnswers = String(old.aAnswers || old.core || (adoption?.understanding as Record<string, unknown> | undefined)?.statement || '');
                const notes = old.handoffNotes as Record<string, unknown> | undefined;
                for (const key of ['expression', 'boundary', 'keep', 'unresolved'] as const)
                    studio.collaboration[key] = String(notes?.[key] || '');
                studio.collaboration.practices = String(old.practices || '');
            }
            if (Array.isArray(old.sources) || !old.studioSnapshot)
                studio.source.selected = oldSources.map(r => String(r.text || '')).join('\n\n');
            studio.source.allowPublic = false;
            studio.source.allowAI = false;
            await runWeavingOperation(WEAVING_OWNER, operationDigest(['import-version', identity]), 'migrate', { workId: w.id, identity }, [createStep(COMPLETION_TITLE_PREFIX, 'completion', r => ({ schemaVersion: 1, owner: WEAVING_OWNER, workId: w!.id, operationId: r.operationId, coreVersionId: native && typeof old.coreVersionId === 'string' ? old.coreVersionId : studio.direction?.versionId || 'unassigned', sourceSelections: Array.isArray(old.sourceSelections) ? old.sourceSelections : workflow(studio).sourceSelections, sourceSnapshotState: 'captured', outputKind: illustrated ? 'carousel_copy' : 'article', text, title: String(old.title || x.title), outputUrl: '', createdAt: typeof old.createdAt === 'string' ? old.createdAt : r.createdAt, state: 'confirmed', supersededBy: null, studioSnapshot: studio, importIdentity: identity, originalVersionId: String(old.id || '') })), updateStep(w.id, WEAVING_WORK_TITLE_PREFIX, 'work', (row, r) => { const work = normalizeWeavingWork(JSON.parse(row.內容), { id: w!.id })!; return { ...work, revision: work.revision + 1, completionVersionRefs: [...new Set([...work.completionVersionRefs, r.result.completion.id])], currentCompletionVersionId: r.result.completion.id }; })]);
        }
        if (native && x.studio.analyses.length) {
            const completions = await listCompletions(w.id);
            const analyses = x.studio.analyses.map(a => {
                const source = versions.find(v => v.id === a.completionId)!;
                const matches = completions.filter(c => {
                    const provenance = c as unknown as Record<string, unknown>;
                    return provenance.originalVersionId === a.completionId && provenance.importIdentity === importDigest([x.identity, source]) && c.workId === w!.id && c.text === a.sourceText && c.coreVersionId === a.coreVersionId;
                });
                if (matches.length !== 1)
                    throw new WeavingError('D 分析來源版本無法核對；保留原始分析，請核對還原版本', 409);
                return { ...a, completionId: matches[0].id };
            });
            await runWeavingOperation(WEAVING_OWNER, operationDigest(['native-analysis-versions', x.identity, w.id]), 'migrate', { id: w.id, analyses }, [updateStep(w.id, WEAVING_WORK_TITLE_PREFIX, 'work', (row, r) => {
                const current = normalizeWeavingWork(JSON.parse(row.內容), { id: w!.id })!, studio = studioForWork(current);
                if (JSON.stringify(studio.analyses) !== JSON.stringify(x.studio.analyses))
                    throw new WeavingError('D 分析來源版本修復前已有變更；請保留資料並核對', 409);
                return { ...current, studio: { ...studio, analyses }, revision: current.revision + 1, updatedAt: r.createdAt };
            })]);
        }
        w=await readWork(w.id);
        const oldPlatform=studioForWork(w);
        const restoredVersions=await listCompletions(w.id);
        let platformsChanged=false;
        for(const draft of [...oldPlatform.platformDrafts,...oldPlatform.publicationHistory]){const restored=restoredVersions.find(c=>(c as unknown as {originalVersionId?:string}).originalVersionId===draft.sourceVersionId);if(restored){draft.sourceVersionId=restored.id;platformsChanged=true;}}
        if(platformsChanged){
            const targetId=w.id;
            await runWeavingOperation(WEAVING_OWNER,operationDigest(['import-platform-sources-v2',x.identity,w.revision]),'migrate',{identity:x.identity,id:targetId},[updateStep(targetId,WEAVING_WORK_TITLE_PREFIX,'work',(row,r)=>{const old=normalizeWeavingWork(JSON.parse(row.內容),{id:targetId})!,current=studioForWork(old);return {...old,studio:{...current,platformDrafts:oldPlatform.platformDrafts,publicationHistory:oldPlatform.publicationHistory},revision:old.revision+1,updatedAt:r.createdAt};})]);w=await readWork(targetId);
        }
        if (native?.currentCompletionVersionId) {
            const fixed = (await listCompletions(w.id)).find(c => (c as unknown as {
                originalVersionId?: string;
            }).originalVersionId === native.currentCompletionVersionId);
            if (fixed)
                await runWeavingOperation(WEAVING_OWNER, operationDigest(['native-current-version', x.identity]), 'migrate', { id: w.id, current: fixed.id }, [updateStep(w.id, WEAVING_WORK_TITLE_PREFIX, 'work', (row, r) => { const current = normalizeWeavingWork(JSON.parse(row.內容), { id: w!.id })!; return { ...current, currentCompletionVersionId: fixed.id, revision: current.revision + 1, updatedAt: r.createdAt }; })]);
        }
        workIds.push(w.id);
    }
    return { workIds, warnings: preview.warnings };
}
export async function archiveStudioImport(body: Body) {
    const id = raw(body.id, 300);
    const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'archive', body, [updateStep(id, WEAVING_WORK_TITLE_PREFIX, 'work', (row, r) => {
            const w = normalizeWeavingWork(JSON.parse(row.內容), { id })!;
            expectRevision(w, body.expectedRevision);
            if (!w.studio?.importIdentity)
                throw new WeavingError('這項不是匯入作品', 403);
            return { ...w, status: body.restore === true ? 'drafting' : 'archived', revision: w.revision + 1, updatedAt: r.createdAt };
        })]);
    return readWork(r.result.work.id);
}
export async function transitionStudioWork(body: Body) {
    const id = raw(body.id, 300);
    if (!['archive', 'restore', 'revise'].includes(String(body.transition)))
        throw new WeavingError('狀態操作不正確');
    const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'patch', body, [updateStep(id, WEAVING_WORK_TITLE_PREFIX, 'work', (row, r) => {
            const old = normalizeWeavingWork(JSON.parse(row.內容), { id })!;
            expectRevision(old, body.expectedRevision);
            if (body.transition === 'revise' && old.status === 'archived')
                throw new WeavingError('請先恢復封存作品，再開始修訂', 409);
            if (body.transition === 'restore' && old.status !== 'archived')
                throw new WeavingError('只有已封存作品可恢復；修改完稿請開始修訂', 409);
            const studio = studioForWork(old), from = studio.archivedFromStatus;
            if (body.transition === 'archive' && old.status !== 'archived')
                studio.archivedFromStatus = old.status;
            return { ...old, studio, status: body.transition === 'archive' ? 'archived' : body.transition === 'restore' ? (from && from !== 'archived' ? from : old.currentCompletionVersionId ? 'completed' : 'drafting') : 'drafting', revision: old.revision + 1, updatedAt: r.createdAt };
        })]);
    return readWork(r.result.work.id);
}
export async function deriveStudioWork(body: Body) {
    const parent = await readWork(raw(body.id, 300));
    expectRevision(parent, body.expectedRevision);
    const original = studioForWork((await getStudioWork(parent.id)).work), f = original.collaboration, s = blankStudio();
    if (f.cMode !== 'condense' || !f.cSource.trim())
        throw new WeavingError('請先帶入轉製模式的主文底稿');
    s.body = manuscriptForAdoption(original, 'C-condense');
    let base = original, canonicalSelections: unknown, shuttleId = parent.shuttleId;
    if (!['', 'draft', 'manual'].includes(f.cVersionId)) {
        const fixed = await readCompletion(f.cVersionId);
        if (fixed.workId !== parent.id || fixed.text !== f.cSource)
            throw new WeavingError('轉製底稿與所選完稿不符', 409);
        base = fixed.studioSnapshot ? studioForWork({ studio: fixed.studioSnapshot }) : blankStudio();
        canonicalSelections = fixed.sourceSelections;
        if (base.direction) {
            const topics = await studioTopics();
            const topic = topics.find(t => t.studioDirections?.some(d => d.id === base.direction?.directionId && d.versions.some(v => v.id === base.direction?.versionId)));
            if (!topic)
                throw new WeavingError('找不到所選完稿原方向的歸屬，請先核對來源主題', 409);
            shuttleId = topic.id;
        }
    }
    const derivedTask=taskContext({...original,module:'C'},base===original?undefined:base);
    if(taskStatus({...original,module:'C'},derivedTask,derivedTask.settings).stale && body.confirmStale !== true)throw new WeavingError('轉製來源或任務已改版，請先核對是否沿用舊候選',409);
    s.source = structuredClone(base.source);
    s.direction = base.direction;
    s.collaboration.aAnswers = base.collaboration.aAnswers;
    s.contentKind = 'story';
    s.targetPlatforms = ['IG'];
    s.platform = 'IG';
    s.collaboration.cSource = f.cSource;
    s.collaboration.cVersionId = f.cVersionId || 'manual';
    s.originKey = 'derived:' + parent.id + ':' + operationDigest([s.body, f.cSource]);
    s.legacy = { derivedSource: { workId: parent.id, text: f.cSource, versionId: s.collaboration.cVersionId, direction: base.direction, reply: original.c, settings: f } };
    const w = await createStudioWork({ ...body, studio: s, title: parent.title + '｜限動', shuttleId, canonicalSelections });
    const result = await runWeavingOperation(WEAVING_OWNER, operationDigest(['link-derived', operationId(body)]), 'patch', { parentId: parent.id, childId: w.id }, [updateStep(w.id, WEAVING_WORK_TITLE_PREFIX, 'work', (row, r) => { const current = normalizeWeavingWork(JSON.parse(row.內容), { id: w.id })!; return { ...current, derivedFromWorkId: parent.id, revision: current.revision + 1, updatedAt: r.createdAt }; })]);
    return readWork(result.result.work.id);
}
export async function adoptStudioCandidate(body: Body) {
    const id = raw(body.id, 300);
    if (!['B', 'C'].includes(String(body.moduleName)))
        throw new WeavingError('請選擇 B 主文或 C 擴寫');
    const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'patch', body, [updateStep(id, WEAVING_WORK_TITLE_PREFIX, 'work', async (row, receipt) => {
            const old = normalizeWeavingWork(JSON.parse(row.內容), { id })!;
            expectRevision(old, body.expectedRevision);
            if (['completed', 'sent_to_liaojie', 'archived'].includes(old.status))
                throw new WeavingError('請先開始修訂，再採用主文', 409);
            const s = studioForWork(old), f = s.collaboration, cb = cBase(f);
            if (body.moduleName === 'C' && (f.cMode !== 'expand' || !cb.text.trim()))
                throw new WeavingError('請先帶入擴寫的底稿');
            if (body.moduleName === 'C' && !['', 'draft', 'manual'].includes(cb.versionId)) {
                const c = await readCompletion(cb.versionId);
                if (c.workId !== id || c.text !== cb.text)
                    throw new WeavingError('C 底稿與所選固定版本不符', 409);
            }
            const contextTask=taskContext({...s,module:body.moduleName as 'B'|'C'}, body.moduleName==='C' && !['','draft','manual'].includes(cb.versionId)?(await readCompletion(cb.versionId)).studioSnapshot:undefined);
            if(taskStatus({...s,module:body.moduleName as 'B'|'C'},contextTask,contextTask.settings).stale && body.confirmStale !== true)throw new WeavingError('本輪來源或本人意思已改版；請核對舊回覆後明確確認沿用',409);
            const next = manuscriptForAdoption(s, body.moduleName === 'B' ? 'B' : 'C-expand'), previous = s.body;
            const round = recordRound({ ...s, module: body.moduleName as 'B' | 'C' }, contextTask, contextTask.settings);
            round.id = receipt.operationId;
            round.createdAt = receipt.createdAt;
            f.rounds.push(round);
            s.body = next;
            s.checks = { facts: false, privacy: false, citations: false, voice: false };
            if (previous && previous !== next)
                s.history.push({ id: receipt.operationId, text: previous, note: '採用前正文', createdAt: receipt.createdAt });
            try {
                normalizeStudio(s);
            }
            catch (e) {
                throw new WeavingError('協作紀錄超出可保存範圍，請先下載回覆並拆分：' + String(e));
            }
            return { ...old, studio: s, draftText: next, textWorkflow: workflow(s, old), status: 'drafting', revision: old.revision + 1, updatedAt: receipt.createdAt };
        })]);
    return readWork(r.result.work.id);
}

/** Explicitly make a fresh publication, preserving existing platform variants. */
export async function handoffRecoveredPlatform(body: Body) {
 const op=operationId(body),previous=await inspectWeavingOperation(WEAVING_OWNER,op);
 if(previous?.state==='confirmed'){
  if(previous.inputDigest!==operationDigest(body))throw new WeavingError('原交接操作內容不同',409);
  const projectId=(previous.context as {projectId:string}).projectId;
  return {project:normalizeLiaojieProject(JSON.parse((await readRecord(projectId,LIAOJIE_PROJECT_TITLE_PREFIX)).內容),{id:projectId})!};
 }
 const w=await readWork(raw(body.id,300)),grantOp=operationDigest([op,'public-purpose-version']);
 if(!await inspectWeavingOperation(WEAVING_OWNER,grantOp))expectRevision(w,body.expectedRevision);
 const draft=studioForWork(w).platformDrafts.find(d=>d.id===body.platformDraftId);
 if(!draft || !draft.text.trim() || body.publicationConfirmed!==true)throw new WeavingError('請核對配文與公開用途');
 if(w.status==='archived')throw new WeavingError('請先恢復封存作品，再交接',409);
 const fixed=await readCompletion(draft.sourceVersionId);if(fixed.workId!==w.id)throw new WeavingError('配文來源不是本件完成版');
 if(draft.sourceText!==undefined&&(!draft.sourceText.trim()||fixed.text!==draft.sourceText))throw new WeavingError('平台稿與所選完稿的來源正文不同，請重新核對或由該完稿另做平台稿',409);
 const platform=({ig:'instagram_post',IG:'instagram_post',instagram:'instagram_post',instagram_post:'instagram_post',threads:'threads',Threads:'threads',plurk:'plurk','噗浪':'plurk'} as Record<string,string>)[draft.platform];
 if(!platform)throw new WeavingError('請將平台設為 plurk、ig 或 threads，再交接');
 if(fixed.studioSnapshot?.source.read==='private')throw new WeavingError('這份來源只限本人查看，請先修訂並重新確認用途',403);
 await sourcePolicies.assertPublication(fixed.sourceSelections,body.publicationConfirmed);
 // Reaffirm the exact historical text as a new purpose-confirmed fixed version.
 // Historical permissions, current manuscript and the original fixed version stay intact.
 const approved=await runWeavingOperation(WEAVING_OWNER,grantOp,'complete',body,[
  createStep(COMPLETION_TITLE_PREFIX,'completion',r=>({...fixed,id:undefined,operationId:r.operationId,createdAt:r.createdAt,publicSourceVersionId:fixed.id,publicationPurpose:'本人確認本次平台配文交接',studioSnapshot:fixed.studioSnapshot?{...fixed.studioSnapshot,source:{...fixed.studioSnapshot.source,allowPublic:true}}:undefined})),
  updateStep(w.id,WEAVING_WORK_TITLE_PREFIX,'work',(row,r)=>{const old=normalizeWeavingWork(JSON.parse(row.內容),{id:w.id})!;return {...old,completionVersionRefs:[...new Set([...old.completionVersionRefs,r.result.completion.id])],currentCompletionVersionId:old.currentCompletionVersionId===fixed.id?r.result.completion.id:old.currentCompletionVersionId,revision:old.revision+1,updatedAt:r.createdAt};})
 ]);
 const project=await handoffWork({operationId:operationDigest([op,'platform-project']),weavingWorkId:w.id,completionVersionId:approved.result.completion.id,publicationConfirmed:true,createNewVersion:true,returnRealm:body.returnRealm});
 const b=await createTextVariant({operationId:operationDigest([op,'platform-variant']),publicationId:project.id,platform});
 if(b.currentVersion.changeNote!=='由舊平台配文明確交接')await saveTextVariant({operationId:operationDigest([op,'platform-copy']),variantId:b.variant.id,expectedRevision:b.variant.revision,draft:{title:fixed.title,voiceNote:'',changeNote:'由舊平台配文明確交接',blocks:adaptSource(platform as never,draft.text),scheduledOn:null,publishedUrl:''}});
 await runWeavingOperation(WEAVING_OWNER,op,'migrate',body,[],{projectId:project.id});
 return {project};
}

export async function adoptResearchIntegration(body:Body){
 const id=raw(body.id,300);const result=await runWeavingOperation(WEAVING_OWNER,operationId(body),'patch',body,[updateStep(id,WEAVING_WORK_TITLE_PREFIX,'work',(row,receipt)=>{
  const old=normalizeWeavingWork(JSON.parse(row.內容),{id})!;expectRevision(old,body.expectedRevision);
  if(['completed','sent_to_liaojie','archived'].includes(old.status))throw new WeavingError('請先開始修訂或恢復作品，再採用研究整合稿',409);
  const s=studioForWork(old),w=s.researchWork;
  try{
   if(body.confirm!==true||body.replyDigest!==operationDigest(w.integrationReply)||body.taskId!==w.integrationTaskId)throw Error('請重新預覽並確認這份整合稿');
   const p=previewResearchIntegration(s,w.integrationTaskId,w.integrationReply,old.title);
   if(p.structureProposal&&body.keepStructure!==true)throw Error('請先核對結構建議；本輪僅採用引用與銜接變更');
   if(s.body&&s.body!==p.candidate)s.history.push({id:receipt.operationId,text:s.body,note:'研究整合前正文',createdAt:receipt.createdAt});
   w.rounds.push({id:receipt.operationId,taskId:p.taskId,stage:'integration-adopt',question:w.question,raw:p.raw,adoptedText:p.candidate,createdAt:receipt.createdAt});
   s.body=p.candidate;w.articleSource='current';s.checks={facts:false,privacy:false,citations:false,voice:false};normalizeStudio(s);
   return{...old,studio:s,draftText:s.body,textWorkflow:workflow(s,old),status:'drafting',revision:old.revision+1,updatedAt:receipt.createdAt};
  }catch(e){throw new WeavingError((e as Error).message,409);}
 })]);return readWork(result.result.work.id);
}
