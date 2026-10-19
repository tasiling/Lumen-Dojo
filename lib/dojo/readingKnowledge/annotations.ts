import 'server-only';
import { LearningError, uuidPattern } from '../learningFoundation/model';
import { contentKey, parseRef, type ContentRef, type ContentItem } from './model';
export const ANNOTATION_PREFIX = '行光閱讀知識分類-v1-';
export type Annotation = {
    schema: 1;
    owner: string;
    ref: ContentRef;
    topics: string[];
    learningItemIds: string[];
    inheritBookSubjects: boolean;
    revision: number;
    createdAt: string;
    updatedAt: string;
};
export type AnnotationInput = {
    ref: ContentRef;
    topics: string[];
    learningItemIds: string[];
    inheritBookSubjects: boolean;
    expectedRevision: number;
    operationId: string;
};
export type EffectiveClassification = {
    topics: string[];
    learningItemIds: string[];
    inheritedLearningItemIds: string[];
};
export function validateAnnotationInput(value: unknown): AnnotationInput {
    if (!value || typeof value !== 'object')
        throw new LearningError('分類內容不正確');
    const v = value as Record<string, unknown>;
    if (Object.keys(v).some(k => !['ref', 'topics', 'learningItemIds', 'inheritBookSubjects', 'expectedRevision', 'operationId'].includes(k)))
        throw new LearningError('分類含有未知欄位');
    const ref = parseRef(v.ref);
    if (!['book', 'reading_note', 'reading_insight', 'knowledge_claim'].includes(ref.kind))
        throw new LearningError('這類內容不能新增分類');
    if (!Array.isArray(v.topics) || v.topics.length > 20 || v.topics.some(t => typeof t !== 'string' || !t.trim() || t.trim().length > 40))
        throw new LearningError('主題最多 20 項，每項 1–40 字');
    const topics = (v.topics as string[]).map(t => t.trim());
    if (new Set(topics).size !== topics.length)
        throw new LearningError('主題不能重複');
    if (!Array.isArray(v.learningItemIds) || v.learningItemIds.length > 20 || v.learningItemIds.some(id => typeof id !== 'string' || !uuidPattern.test(id)))
        throw new LearningError('學科最多 20 項，需使用既有學科');
    const learningItemIds = (v.learningItemIds as string[]).map(id => id.toLowerCase());
    if (new Set(learningItemIds).size !== learningItemIds.length)
        throw new LearningError('學科不能重複');
    if (typeof v.inheritBookSubjects !== 'boolean' || !Number.isInteger(v.expectedRevision) || Number(v.expectedRevision) < 0 || typeof v.operationId !== 'string' || !uuidPattern.test(v.operationId))
        throw new LearningError('分類修訂或操作識別不正確');
    return { ref, topics, learningItemIds, inheritBookSubjects: v.inheritBookSubjects, expectedRevision: Number(v.expectedRevision), operationId: v.operationId };
}
export function effectiveClassification(own: Pick<Annotation, 'topics' | 'learningItemIds' | 'inheritBookSubjects'> | null, parent: Pick<Annotation, 'topics' | 'learningItemIds'> | null): EffectiveClassification {
    const inherited = own?.inheritBookSubjects === false ? [] : parent?.learningItemIds ?? [];
    return { topics: [...new Set([...(own?.topics ?? [])])], learningItemIds: [...new Set([...(own?.learningItemIds ?? []), ...inherited])], inheritedLearningItemIds: inherited.filter(id => !own?.learningItemIds.includes(id)) };
}
export type AnnotationDependencies = {
    owner: string;
    list: () => Promise<Annotation[]>;
    resolve: (ref: ContentRef) => Promise<ContentItem | null>;
    subjects: () => Promise<{
        id: string;
        status: string;
    }[]>;
    run: (id: string, input: AnnotationInput, prepare: () => Promise<() => Promise<Annotation>>) => Promise<Annotation>;
    create: (value: Annotation) => Promise<void>;
    update: (value: Annotation) => Promise<void>;
};
export function annotationService(d: AnnotationDependencies) {
    async function read(ref: ContentRef) { const key = contentKey(ref); const rows = (await d.list()).filter(a => a.owner === d.owner && contentKey(a.ref) === key); if (rows.length > 1)
        throw new LearningError('分類資料重複，請先核對', 409); return rows[0] ?? null; }
    return { read, async save(value: unknown): Promise<Annotation> {
            const v = validateAnnotationInput(value);
            return d.run(v.operationId, v, async () => {
                if (!await d.resolve(v.ref))
                    throw new LearningError('來源已不可用，無法新增分類', 404);
                const old = await read(v.ref);
                if ((old?.revision ?? 0) !== v.expectedRevision)
                    throw new LearningError('分類已被更新，請重新讀取並保留你的修改', 409);
                const subjects = await d.subjects();
                if (v.learningItemIds.some(id => !subjects.some(s => s.id === id) && !old?.learningItemIds.includes(id)))
                    throw new LearningError('學科不存在或無法存取');
                if (!old && !v.topics.length && !v.learningItemIds.length && v.inheritBookSubjects)
                    throw new LearningError('尚未新增分類，不需要建立空白紀錄');
                const now = new Date().toISOString();
                const next: Annotation = { schema: 1, owner: d.owner, ref: v.ref, topics: v.topics, learningItemIds: v.learningItemIds, inheritBookSubjects: v.inheritBookSubjects, revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? now, updatedAt: now };
                return async () => { if (old)
                    await d.update(next);
                else
                    await d.create(next); return next; };
            });
        } };
}
export function classificationFor(item: ContentItem, annotations: Annotation[], owner: string): EffectiveClassification {
    const own = annotations.find(a => a.owner === owner && contentKey(a.ref) === contentKey(item.ref)) ?? null;
    const bookId = item.bookId ?? item.ref.parentBookId;
    const parent = item.ref.kind !== 'book' && bookId ? annotations.find(a => a.owner === owner && a.ref.kind === 'book' && a.ref.recordId === bookId) ?? null : null;
    return effectiveClassification(own, parent);
}
