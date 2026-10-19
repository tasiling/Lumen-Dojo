import 'server-only';
import { LearningError, uuidPattern } from '../learningFoundation/model';
import { listAnnotations } from './annotationStore';
import { classificationFor } from './annotations';
import { productionAdapters, type SourceAdapter } from './adapters';
import { encodeCursor, decodeCursor } from './cursor';
import { contentKey, type ContentItem, type ContentKind, sameId } from './model';
export type SearchQuery = {
    q: string;
    bookId?: string;
    kinds?: ContentKind[];
    topic?: string;
    learningItemId?: string;
};
export type SearchPage = {
    items: ContentItem[];
    cursor: string | null;
    complete: boolean;
    sourceStates: Record<string, 'pending' | 'complete' | 'failed'>;
    readAt: string;
};
const kinds: ContentKind[] = ['reading_note', 'reading_insight', 'knowledge_claim'];
type State = {
    positions: Record<string, string | null>;
    done: ContentKind[];
    buffer: ContentItem[];
    seen: string[];
};
export function normalizeQuery(q: SearchQuery): SearchQuery {
    if (typeof q.q !== 'string' || q.q.length > 200 || (q.topic !== undefined && (typeof q.topic !== 'string' || q.topic.length > 40)) || (q.bookId && !uuidPattern.test(q.bookId)) || (q.learningItemId && !uuidPattern.test(q.learningItemId)) || (q.kinds && (!Array.isArray(q.kinds) || q.kinds.some(k => !kinds.includes(k)))))
        throw new LearningError('搜尋條件不正確');
    return { q: q.q.trim(), ...(q.bookId ? { bookId: q.bookId.toLowerCase() } : {}), ...(q.kinds?.length ? { kinds: [...new Set(q.kinds)].sort() } : {}), ...(q.topic?.trim() ? { topic: q.topic.trim() } : {}), ...(q.learningItemId ? { learningItemId: q.learningItemId.toLowerCase() } : {}) };
}
export type Classification = {
    topics: string[];
    learningItemIds: string[];
};
export function createSearchService(adapters: Partial<Record<ContentKind, SourceAdapter>>, classify?: (item: ContentItem) => Classification) {
    return async (raw: SearchQuery, cursor: string | null, owner: string): Promise<SearchPage> => {
        const q = normalizeQuery(raw), binding = JSON.stringify(q), selected = q.kinds ?? kinds;
        const state: State = cursor ? decodeCursor(cursor, owner, binding) : { positions: {}, done: [], buffer: [], seen: [] };
        const sourceStates: SearchPage['sourceStates'] = {};
        const matches = (i: ContentItem) => { const c = classify?.(i) ?? { topics: [], learningItemIds: [] }; return (!q.q || `${i.title}\n${i.text}\n${i.locator}`.toLocaleLowerCase().includes(q.q.toLocaleLowerCase())) && (!q.bookId || sameId(i.bookId ?? i.ref.parentBookId ?? '', q.bookId)) && (!q.topic || [...i.originalTopics, ...c.topics].includes(q.topic)) && (!q.learningItemId || c.learningItemIds.some(id => sameId(id, q.learningItemId!))); };
        if (state.buffer.length < 20)
            for (const kind of selected) {
                if (state.done.includes(kind))
                    continue;
                try {
                    const page = await adapters[kind]!.readBatch(state.positions[kind] ?? null);
                    state.positions[kind] = page.next;
                    if (page.complete)
                        state.done.push(kind);
                    for (const i of page.items) {
                        const key = contentKey(i.ref);
                        if (!state.seen.includes(key)) {
                            state.seen.push(key);
                            if (matches(i))
                                state.buffer.push(i);
                        }
                    }
                    sourceStates[kind] = page.complete ? 'complete' : 'pending';
                }
                catch {
                    sourceStates[kind] = 'failed';
                }
            }
        for (const kind of selected)
            sourceStates[kind] ??= state.done.includes(kind) ? 'complete' : 'pending';
        const items = state.buffer.splice(0, 20), complete = selected.every(k => state.done.includes(k)) && !state.buffer.length;
        return { items, complete, cursor: complete ? null : encodeCursor(state, owner, binding), sourceStates, readAt: new Date().toISOString() };
    };
}
export async function search(q: SearchQuery, cursor: string | null, owner: string): Promise<SearchPage> { const annotations = await listAnnotations(); return createSearchService(productionAdapters(), i => classificationFor(i, annotations, owner))(q, cursor, owner); }
