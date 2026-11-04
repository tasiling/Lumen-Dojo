import { cBase, manuscriptForAdoption, recordRound } from './collaboration';
import 'server-only';
import { listJsonRecords } from '../notionStore';
import { WEAVING_WORK_TITLE_PREFIX, WEAVING_SHUTTLE_TITLE_PREFIX, COMPLETION_TITLE_PREFIX } from '../formal';
import { createWorkDraft, createShuttleDraft, normalizeWeavingWork, normalizeWeavingShuttle, type WeavingWork } from '../weavingShuttle';
import { createStep, updateStep, readWork, readShuttle, expectRevision, operationId, WEAVING_OWNER, completeWork, handoffWork, type Body } from '../weavingWorkflow/store';
import { runWeavingOperation, operationDigest, inspectWeavingOperation } from '../weavingWorkflow/operations';
import { completionDigest, listCompletions, readCompletion } from '../weavingWorkflow/completions';
import { createTextWorkflow } from '../weavingWorkflow/templates';
import { WeavingError, normalizeWorkflow } from '../weavingWorkflow/model';
import { blankStudio, normalizeStudio, normalizeDirections, studioForWork, raw, type StudioData } from './model';
import { importDigest, importPreview, planImport, prototypePageText } from './migration';
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
    return handoffWork({ operationId: operationId(body), weavingWorkId: id, completionVersionId: c.id, publicationConfirmed: body.publicationConfirmed, createNewVersion: body.createNewVersion });
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
export async function importStudio(body: Body) {
    const preview = importPreview(body.packet), op = operationId(body);
    if (preview.kind !== 'html')
        throw new WeavingError('這份備份請由原工具或原正式入口開啟；預覽與備份保持可用');
    const envelope = body.packet as Record<string, unknown>, packet = (envelope.kind === 'lumen-weaving-flow-prototype' && envelope.state ? envelope.state : envelope) as Record<string, unknown>, originalTopics = Array.isArray(packet.shuttles) ? packet.shuttles as Record<string, unknown>[] : [], originalDirections = Array.isArray(packet.directions) ? packet.directions as Record<string, unknown>[] : [];
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
        const legacyData = x.studio.legacy?.data as Record<string, unknown> | undefined, versions = Array.isArray(legacyData?.versions) ? legacyData.versions as Record<string, unknown>[] : [];
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
            await runWeavingOperation(WEAVING_OWNER, operationDigest(['import-version', identity]), 'migrate', { workId: w.id, identity }, [createStep(COMPLETION_TITLE_PREFIX, 'completion', r => ({ schemaVersion: 1, owner: WEAVING_OWNER, workId: w!.id, operationId: r.operationId, coreVersionId: studio.direction?.versionId || 'unassigned', sourceSelections: Array.isArray(old.sourceSelections) ? old.sourceSelections : workflow(studio).sourceSelections, sourceSnapshotState: 'captured', outputKind: illustrated ? 'carousel_copy' : 'article', text, title: String(old.title || x.title), outputUrl: '', createdAt: typeof old.createdAt === 'string' ? old.createdAt : r.createdAt, state: 'confirmed', supersededBy: null, studioSnapshot: studio, importIdentity: identity, originalVersionId: String(old.id || '') })), updateStep(w.id, WEAVING_WORK_TITLE_PREFIX, 'work', (row, r) => { const work = normalizeWeavingWork(JSON.parse(row.內容), { id: w!.id })!; return { ...work, revision: work.revision + 1, completionVersionRefs: [...new Set([...work.completionVersionRefs, r.result.completion.id])], currentCompletionVersionId: r.result.completion.id }; })]);
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
    s.source = structuredClone(base.source);
    s.direction = base.direction;
    s.collaboration.aAnswers = base.collaboration.aAnswers;
    s.contentKind = 'story';
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
            const next = manuscriptForAdoption(s, body.moduleName === 'B' ? 'B' : 'C-expand'), previous = s.body;
            const { rounds: priorRounds, candidates: priorCandidates, reviewReply: priorReview, ...controls } = f;
            void priorRounds;
            void priorCandidates;
            void priorReview;
            const round = recordRound({ ...s, module: body.moduleName as 'B' | 'C' }, { text: body.moduleName === 'C' ? cb.text : s.source.selected, versionId: body.moduleName === 'C' ? cb.versionId : s.source.selectedVersion }, JSON.stringify({ settings: controls, research: s.research, researchUse: s.researchUse, examples: s.examples }));
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
