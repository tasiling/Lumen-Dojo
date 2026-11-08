import 'server-only';
import { WEAVING_OWNER, readWork, readShuttle, createStep, updateStep, expectRevision, operationId, type Body } from '../weavingWorkflow/store';
import { operationDigest, runWeavingOperation, type OperationStep, type OperationReceipt } from '../weavingWorkflow/operations';
import { listJsonRecords } from '../notionStore';
import { createShuttleDraft, normalizeWeavingShuttle, normalizeWeavingWork } from '../weavingShuttle';
import { WEAVING_SHUTTLE_TITLE_PREFIX, WEAVING_WORK_TITLE_PREFIX } from '../formal';
import { readCompletion } from '../weavingWorkflow/completions';
import { studioForWork, mergeCandidateDirection, newDirection, raw } from './model';
import { WeavingError } from '../weavingWorkflow/model';
export async function routeStudioCandidate(body: Body) {
    const id = raw(body.id, 300), candidateId = raw(body.candidateId, 120), mode = raw(body.mode, 40), directionId = raw(body.directionId ?? '', 120), topicId = raw(body.topicId ?? '', 300);
    if (!['new', 'existing', 'merge'].includes(mode))
        throw new WeavingError('候選去向不正確');
    const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'patch', body, (receipt) => {
        // The source snapshot is persisted before any target writes, so retries use it unchanged.
        const snapshot = () => receipt.context as {
            candidate: ReturnType<typeof studioForWork>['collaboration']['candidates'][number];
            sourceVersion: string;
        };
        const validate: OperationStep = { key: 'source', execute: async () => { throw new WeavingError('來源快照尚未確認', 409); }, findConfirmed: async () => {
                if (receipt.context)
                    return { id, revision: Number(body.expectedRevision) };
                const work = await readWork(id);
                expectRevision(work, body.expectedRevision);
                const candidate = studioForWork(work).collaboration.candidates.find(c => c.id === candidateId);
                if (!candidate || !candidate.title.trim() || !candidate.statement.trim())
                    throw new WeavingError('請先填寫並保存候選');
                if (candidate.directionId)
                    throw new WeavingError('這個候選已連結方向', 409);
                let sourceVersion = candidate.sourceVersion;
                if (candidate.module === 'D') {
                    const c = await readCompletion(raw(body.completionId, 300));
                    if (c.workId !== id)
                        throw new WeavingError('請選本件完稿版本');
                    const original = (c as unknown as {
                        originalVersionId?: string;
                    }).originalVersionId;
                    if (!['', '待選完稿', 'unknown', c.id, original].includes(sourceVersion))
                        throw new WeavingError('這個候選來自不同完稿，請核對來源再選擇', 409);
                    sourceVersion = c.id;
                }
                receipt.context = { candidate: structuredClone(candidate), sourceVersion };
                return { id, revision: work.revision };
            } };
        const fingerprint = (c: ReturnType<typeof studioForWork>['collaboration']['candidates'][number]) => operationDigest([c.id, c.module, c.title, c.statement, c.quote, c.locator, c.sourceVersion]);
        const seed = createStep(WEAVING_SHUTTLE_TITLE_PREFIX, 'newTopic', r => { const c = snapshot().candidate; return { ...createShuttleDraft({ title: raw(c.title, 200), coreStatement: c.title, sourceType: 'manual', sourceSnapshot: '', sourceId: null, audience: '', direction: '' }), studioLegacy: { candidateOrigin: { workId: id, candidateId, fingerprint: fingerprint(c) } }, studioDirections: [], revision: 1, createdAt: r.createdAt }; });
        const findSeed = seed.findConfirmed;
        seed.findConfirmed = async (r) => {
            const exact = await findSeed(r);
            if (exact)
                return exact;
            const found = (await listJsonRecords(WEAVING_SHUTTLE_TITLE_PREFIX)).flatMap(row => {
                const topic = normalizeWeavingShuttle(row.value, { id: row.id }), origin = topic?.studioLegacy?.candidateOrigin as {
                    workId?: string;
                    candidateId?: string;
                    fingerprint?: string;
                } | undefined;
                return origin?.workId === id && origin.candidateId === candidateId && topic ? [{ topic, origin }] : [];
            });
            if (found.length > 1)
                throw new WeavingError('此候選有重複題目，請先核對', 409);
            if (!found.length)
                return null;
            if (found[0].origin.fingerprint !== fingerprint(snapshot().candidate))
                throw new WeavingError('候選已變更；先核對已建立的題目，或另存新候選', 409);
            return { id: found[0].topic.id, revision: found[0].topic.revision };
        };
        const target = (r: OperationReceipt) => mode === 'new' ? r.result.newTopic.id : topicId;
        const patchTopic = (r: OperationReceipt) => updateStep(target(r), WEAVING_SHUTTLE_TITLE_PREFIX, 'topic', (row, stamp) => {
            const topic = normalizeWeavingShuttle(JSON.parse(row.內容), { id: target(r) })!;
            expectRevision(topic, mode === 'new' ? 1 : body.expectedTopicRevision);
            const { candidate, sourceVersion } = snapshot(), c = { ...candidate, sourceVersion };
            const existing = topic.studioDirections || [], old = existing.find(d => d.id === directionId);
            if (mode === 'merge' && !old)
                throw new WeavingError('找不到要接入的方向', 409);
            const direction = mode === 'merge' ? mergeCandidateDirection(old!, c, id, stamp.createdAt) : newDirection(c.id, c.title, c.statement, 'candidate-' + c.id, stamp.createdAt);
            if (mode !== 'merge')
                direction.versions[0].note = `候選來源 ${id} / ${sourceVersion} / ${c.locator}：${c.quote}`;
            return { ...topic, studioDirections: [...existing.filter(d => d.id !== direction.id), direction], revision: topic.revision + 1, updatedAt: stamp.createdAt };
        });
        const topic: OperationStep = { key: 'topic', findConfirmed: async (r) => {
                const exact = await patchTopic(r).findConfirmed(r);
                if (exact)
                    return exact;
                const topic = await readShuttle(target(r)), c = snapshot().candidate, d = topic.studioDirections?.find(d => d.id === (mode === 'merge' ? directionId : c.id)), version = d?.versions.find(v => v.id === 'candidate-' + c.id);
                if (version && version.statement === c.statement && version.note.includes(`候選來源 ${id} /`))
                    return { id: topic.id, revision: topic.revision };
                return null;
            }, execute: r => patchTopic(r).execute(r) };
        const link = updateStep(id, WEAVING_WORK_TITLE_PREFIX, 'work', (row, r) => { const work = normalizeWeavingWork(JSON.parse(row.內容), { id })!; const s = studioForWork(work), { candidate, sourceVersion } = snapshot(), current = s.collaboration.candidates.find(c => c.id === candidateId); if (!current || fingerprint(current) !== fingerprint(candidate))
            throw new WeavingError('候選已變更，請先核對本次連結', 409); s.collaboration.candidates = s.collaboration.candidates.map(c => c.id === candidateId ? { ...c, topicId: target(r), directionId: mode === 'merge' ? directionId : candidate.id, sourceVersion } : c); return { ...work, studio: s, revision: work.revision + 1, updatedAt: r.createdAt }; });
        return [validate, ...(mode === 'new' ? [seed] : []), topic, link];
    });
    return { work: await readWork(r.result.work.id), topic: await readShuttle(r.result.topic.id) };
}
