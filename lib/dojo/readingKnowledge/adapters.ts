import 'server-only';
import { createHash } from 'node:crypto';
import { notion, withNotionRateLimit } from '@/lib/notion/client';
import { DATA_SOURCES } from '@/lib/notion/schema';
import { mapReadingBook, mapInsightCard, mapKnowledge } from '@/lib/notion/queries';
import { parseStoredReadingNote } from '@/lib/reading/notes';
import { normalizeKnowledgeClaim, currentClaimVersion } from '../knowledgeClaims';
import { KNOWLEDGE_CLAIM_TITLE_PREFIX } from '../knowledgeClaims';
import { WEAVING_WORK_TITLE_PREFIX, COMPLETION_TITLE_PREFIX } from '../formal';
import { parseRef, contentHref, sameId, type ContentItem, type ContentKind, type ContentRef, type SourceLink } from './model';
export type SourceBatch = {
    items: ContentItem[];
    next: string | null;
    complete: boolean;
    readAt: string;
};
export type SourceAdapter = {
    readBatch: (cursor: string | null) => Promise<SourceBatch>;
};
const prefixes: Partial<Record<ContentKind, string>> = { knowledge_claim: KNOWLEDGE_CLAIM_TITLE_PREFIX, weaving_work: WEAVING_WORK_TITLE_PREFIX, completion: COMPLETION_TITLE_PREFIX };
const version = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const listQuery = (data_source_id: string, start_cursor?: string, filter?: Parameters<ReturnType<typeof notion>['dataSources']['query']>[0]['filter']) => withNotionRateLimit(() => notion().dataSources.query({ data_source_id, start_cursor, page_size: 20, filter, sorts: [{ timestamp: 'created_time', direction: 'ascending' }] }));
function item(ref: ContentRef, title: string, text: string, status: string, locator = '', extra: Partial<ContentItem> = {}): ContentItem { return { ref, title, text, status, locator, href: contentHref(ref), sourceVersion: version([text, locator, status]), originalTopics: [], ...extra }; }
function pageItems(raw: unknown, kind: ContentKind): ContentItem[] {
    // Provider objects are mapped by existing parsers; malformed/unrelated JSON is never indexed.
    if (!raw || typeof raw !== 'object' || !('properties' in raw))
        return [];
    const p = raw as Parameters<typeof mapReadingBook>[0];
    if (kind === 'book') {
        const b = mapReadingBook(p);
        return [item({ kind, recordId: b.id }, `${b.title}・第 ${b.readCount} 次`, b.question, b.status, b.title, { bookId: b.id, originalTopics: b.subject ? [b.subject] : [] })];
    }
    if (kind === 'reading_insight') {
        const c = mapInsightCard(p);
        return [item({ kind, recordId: c.id }, c.insight, `${c.insight}\n行動：${c.action}\n結果：${c.result}`, c.status, '閱讀洞察', { bookId: c.sourceBookId ?? undefined, originalTopics: c.topics })];
    }
    const row = mapKnowledge(p);
    if (!row.標題.startsWith(prefixes[kind] ?? '\u0000'))
        return [];
    let v: Record<string, unknown>;
    try {
        v = JSON.parse(row.內容);
    }
    catch {
        return [];
    }
    if (kind === 'knowledge_claim') {
        const c = normalizeKnowledgeClaim(v, { id: row.id });
        if (!c)
            return [];
        const cv = currentClaimVersion(c);
        return [item({ kind, recordId: c.id }, c.title, cv.statement, cv.status, '知識主張', { sourceVersion: cv.id, sources: cv.sources.map(s => ({ kind: s.sourceType, id: s.sourceId, snapshot: s.snapshot, version: null, label: s.label })) })];
    }
    if ((kind === 'weaving_work' && v.recordType !== 'weaving-work') || (kind === 'completion' && v.schemaVersion !== 1))
        return [];
    const wf = v.textWorkflow as {
        sourceSelections?: Record<string, unknown>[];
    } | undefined;
    const sels = (kind === 'completion' ? v.sourceSelections : wf?.sourceSelections) as Record<string, unknown>[] | undefined;
    const sources: SourceLink[] = (sels ?? []).map(s => ({ kind: String(s.sourceType), id: String(s.sourceId), snapshot: String(s.selectedText ?? ''), version: typeof s.sourceVersion === 'string' ? s.sourceVersion : null }));
    const ref = { kind, recordId: row.id };
    const shuttleId = typeof v.shuttleId === 'string' ? v.shuttleId : '';
    return [item(ref, String(v.title ?? '作品'), String(v.text ?? v.draftText ?? ''), String(v.state ?? v.status ?? ''), '織光堂', { sources, href: kind === 'weaving_work' && shuttleId ? `/weaving/${encodeURIComponent(shuttleId)}?work=${row.id}` : '/weaving' })];
}
type NotesCursor = {
    books: {
        id: string;
        title: string;
        subject: string | null;
    }[];
    booksCursor: string | null;
    booksDone: boolean;
    blockCursor: string | null;
};
export function productionAdapters(): Record<ContentKind, SourceAdapter> {
    function regular(kind: ContentKind): SourceAdapter { return { async readBatch(cursor) { const ds = kind === 'book' ? DATA_SOURCES.DB21_書籍庫 : kind === 'reading_insight' ? DATA_SOURCES.DB22_洞察卡片庫 : DATA_SOURCES.DB14_知識庫; const prefix = prefixes[kind]; const r = await listQuery(ds, cursor ?? undefined, prefix ? { property: '標題', title: { starts_with: prefix } } : undefined); return { items: r.results.flatMap(p => pageItems(p, kind)), next: r.has_more ? r.next_cursor : null, complete: !r.has_more, readAt: new Date().toISOString() }; } }; }
    const notes: SourceAdapter = { async readBatch(cursor) {
            const s: NotesCursor = cursor ? JSON.parse(cursor) : { books: [], booksCursor: null, booksDone: false, blockCursor: null };
            let items: ContentItem[] = [];
            if (!s.books.length && !s.booksDone) {
                const p = await listQuery(DATA_SOURCES.DB21_書籍庫, s.booksCursor ?? undefined);
                s.books = p.results.filter(p => 'properties' in p).map(p => mapReadingBook(p));
                s.booksCursor = p.next_cursor;
                s.booksDone = !p.has_more;
            }
            else if (s.books.length) {
                const b = s.books[0];
                const p = await withNotionRateLimit(() => notion().blocks.children.list({ block_id: b.id, start_cursor: s.blockCursor ?? undefined, page_size: 20 }));
                items = p.results.flatMap(raw => { if (!('type' in raw))
                    return []; const r = raw as unknown as Record<string, unknown>; const block = r[String(r.type)] as {
                    rich_text?: {
                        plain_text?: string;
                    }[];
                } | undefined; const text = (block?.rich_text ?? []).map(t => t.plain_text ?? '').join(''); if (!text.trim())
                    return []; const n = parseStoredReadingNote(text); const ref: ContentRef = { kind: 'reading_note', recordId: String(r.id), parentBookId: b.id }; const loc = [b.title, n.metadata.chapter, n.metadata.location].filter(Boolean).join('・'); const extras = { bookId: b.id, originalTopics: b.subject ? [b.subject] : [] }; const rows = [item(ref, b.title, n.text, n.kind, loc, extras)]; if (n.metadata.reflection)
                    rows.push(item({ ...ref, fragment: 'reflection' }, `${b.title}・我的理解`, n.metadata.reflection, 'understanding', loc, extras)); return rows; });
                s.blockCursor = p.next_cursor;
                if (!p.has_more) {
                    s.books.shift();
                    s.blockCursor = null;
                }
            }
            const complete = !s.books.length && s.booksDone;
            return { items, next: complete ? null : JSON.stringify(s), complete, readAt: new Date().toISOString() };
        } };
    return { book: regular('book'), reading_note: notes, reading_insight: regular('reading_insight'), knowledge_claim: regular('knowledge_claim'), weaving_work: regular('weaving_work'), completion: regular('completion') };
}
export async function resolve(ref: ContentRef): Promise<ContentItem | null> { const target = parseRef(ref); const a = productionAdapters()[target.kind]; let cursor: string | null = null; do {
    const b = await a.readBatch(cursor);
    const found = b.items.find(i => sameId(i.ref.recordId, target.recordId) && (!target.parentBookId || sameId(i.ref.parentBookId ?? '', target.parentBookId)) && i.ref.fragment === target.fragment);
    if (found)
        return found;
    cursor = b.next;
} while (cursor); return null; }
