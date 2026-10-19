import 'server-only';
import { createHash } from 'node:crypto';
import { notion, withNotionRateLimit } from '@/lib/notion/client';
import { DATA_SOURCES } from '@/lib/notion/schema';
import { mapReadingBook, mapInsightCard, mapKnowledge } from '@/lib/notion/queries';
import { parseStoredReadingNote } from '@/lib/reading/notes';
import { readingNoteContent } from '@/lib/reading/content';
import { normalizeKnowledgeClaim, currentClaimVersion, KNOWLEDGE_CLAIM_TITLE_PREFIX } from '../knowledgeClaims';
import { WEAVING_WORK_TITLE_PREFIX, COMPLETION_TITLE_PREFIX } from '../formal';
import { parseRef, contentHref, contentKey, sameId, type ContentItem, type ContentKind, type ContentRef, type SourceLink } from './model';
export type SourceBatch = {
    items: ContentItem[];
    next: string | null;
    complete: boolean;
    readAt: string;
};
export type SourceAdapter = {
    readBatch: (cursor: string | null) => Promise<SourceBatch>;
};
type Options = {
    includeHistory?: boolean;
    bookId?: string;
};
const prefixes: Partial<Record<ContentKind, string>> = { knowledge_claim: KNOWLEDGE_CLAIM_TITLE_PREFIX, weaving_work: WEAVING_WORK_TITLE_PREFIX, completion: COMPLETION_TITLE_PREFIX };
const version = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const listQuery = (data_source_id: string, start_cursor?: string, filter?: Parameters<ReturnType<typeof notion>['dataSources']['query']>[0]['filter']) => withNotionRateLimit(() => notion().dataSources.query({ data_source_id, start_cursor, page_size: 20, filter, sorts: [{ timestamp: 'created_time', direction: 'ascending' }] }));
function item(ref: ContentRef, title: string, text: string, status: string, locator = '', extra: Partial<ContentItem> = {}): ContentItem { return { ref, title, text, status, locator, href: contentHref(ref), sourceVersion: version([text, locator, status]), originalTopics: [], ...extra }; }
function sourceDatabase(kind: ContentKind) { return kind === 'book' || kind === 'reading_note' ? DATA_SOURCES.DB21_書籍庫 : kind === 'reading_insight' ? DATA_SOURCES.DB22_洞察卡片庫 : DATA_SOURCES.DB14_知識庫; }
function pageItems(raw: unknown, kind: ContentKind, options: Options = {}): ContentItem[] {
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
        const versions = options.includeHistory ? c.versions : [cv];
        const sources = versions.flatMap(v => v.sources.map(s => ({ kind: s.sourceType, id: s.sourceId, snapshot: s.snapshot, version: null, label: s.label, context: `知識第 ${v.number} 版`,claimVersionId:v.id } satisfies SourceLink)));
        return [item({ kind, recordId: c.id }, c.title, cv.statement, cv.status, '知識主張', { sourceVersion: cv.id, sources })];
    }
    if ((kind === 'weaving_work' && v.recordType !== 'weaving-work') || (kind === 'completion' && (v.schemaVersion !== 1 || v.owner !== 'dojo-private-owner' || v.state !== 'confirmed')))
        return [];
    const wf = v.textWorkflow as {
        sourceSelections?: Record<string, unknown>[];
    } | undefined;
    const sels = (kind === 'completion' ? v.sourceSelections : wf?.sourceSelections) as Record<string, unknown>[] | undefined;
    const sources: SourceLink[] = (sels ?? []).map(s => ({ kind: String(s.sourceType), id: String(s.sourceId), snapshot: String(s.selectedText ?? ''), version: typeof s.sourceVersion === 'string' ? s.sourceVersion : null }));
    const ref = { kind, recordId: row.id }, shuttleId = typeof v.shuttleId === 'string' ? v.shuttleId : '';
    const created = typeof v.createdAt === 'string' ? new Date(v.createdAt).toLocaleString('zh-TW') : '';
    return [item(ref, `${String(v.title ?? '作品')}${kind === 'completion' && created ? `・${created}` : ''}`, String(v.text ?? v.draftText ?? ''), String(v.state ?? v.status ?? ''), '織光堂', { sources, workId: typeof v.workId === 'string' ? v.workId : undefined, href: kind === 'weaving_work' && shuttleId ? `/weaving/${encodeURIComponent(shuttleId)}?work=${row.id}` : '/weaving' })];
}
type BookSummary = {
    id: string;
    title: string;
    subject: string | null;
};
function noteItems(book: BookSummary, raw: unknown): ContentItem[] {
    if (!raw || typeof raw !== 'object' || !('type' in raw))
        return [];
    const r = raw as Record<string, unknown>;
    if (!['paragraph', 'bulleted_list_item', 'numbered_list_item', 'quote', 'callout', 'heading_1', 'heading_2', 'heading_3'].includes(String(r.type)) || r.archived || r.in_trash)
        return [];
    const block = r[String(r.type)] as {
        rich_text?: {
            plain_text?: string;
        }[];
    } | undefined;
    const text = (block?.rich_text ?? []).map(t => t.plain_text ?? '').join('');
    if (!text.trim())
        return [];
    const n = parseStoredReadingNote(text), ref: ContentRef = { kind: 'reading_note', recordId: String(r.id), parentBookId: book.id };
    const loc = [book.title, n.metadata.chapter, n.metadata.location].filter(Boolean).join('・'), extra = { bookId: book.id, originalTopics: book.subject ? [book.subject] : [] };
    const rows = [item(ref, book.title, readingNoteContent(n), n.kind, loc, extra)];
    if (n.metadata.reflection)
        rows.push(item({ ...ref, fragment: 'reflection' }, `${book.title}・我的理解`, n.metadata.reflection, 'understanding', loc, extra));
    return rows;
}
async function available<T>(fn: () => Promise<T>): Promise<T | null> { try {
    return await fn();
}
catch (e) {
    if ((e as {
        status?: number;
    }).status === 404)
        return null;
    throw e;
} }
/** Per-request verified retrieval. No library scans and no global content cache. */
export function createResolver(options: Options = {}) {
    const pages = new Map<string, Promise<unknown>>(), blocks = new Map<string, Promise<unknown>>(), resolved = new Map<string, Promise<ContentItem | null>>();
    const page = (id: string) => { if (!pages.has(id))
        pages.set(id, available(() => withNotionRateLimit(() => notion().pages.retrieve({ page_id: id })))); return pages.get(id)!; };
    const block = (id: string) => { if (!blocks.has(id))
        blocks.set(id, available(() => withNotionRateLimit(() => notion().blocks.retrieve({ block_id: id })))); return blocks.get(id)!; };
    function owned(raw: unknown, kind: ContentKind) { if (!raw || typeof raw !== 'object' || !('properties' in raw))
        return false; const p = raw as {
        archived?: boolean;
        in_trash?: boolean;
        parent?: {
            data_source_id?: string;
            database_id?: string;
        };
    }; return !p.archived && !p.in_trash && sameId(p.parent?.data_source_id ?? p.parent?.database_id ?? '', sourceDatabase(kind)); }
    async function read(target: ContentRef): Promise<ContentItem | null> {
        if (target.kind === 'reading_note') {
            const [b, n] = await Promise.all([page(target.parentBookId!), block(target.recordId)]);
            if (!owned(b, 'book') || !n || typeof n !== 'object')
                return null;
            const raw = n as {
                parent?: {
                    page_id?: string;
                };
            };
            if (!sameId(raw.parent?.page_id ?? '', target.parentBookId!))
                return null;
            return noteItems(mapReadingBook(b as Parameters<typeof mapReadingBook>[0]), n).find(i => i.ref.fragment === target.fragment) ?? null;
        }
        const raw = await page(target.recordId);
        return owned(raw, target.kind) ? pageItems(raw, target.kind, options)[0] ?? null : null;
    }
    async function resolve(ref: ContentRef): Promise<ContentItem | null> { const r = parseRef(ref), key = contentKey(r); if (!resolved.has(key))
        resolved.set(key, read(r)); return resolved.get(key)!; }
    async function looseNote(id: string): Promise<ContentRef | null> { const r = parseRef({ kind: 'book', recordId: id }); const raw = await block(r.recordId); if (!raw || typeof raw !== 'object')
        return null; const parent = (raw as {
        parent?: {
            page_id?: string;
        };
    }).parent?.page_id; if (!parent)
        return null; const ref = parseRef({ kind: 'reading_note', recordId: r.recordId, parentBookId: parent }); return await resolve(ref) ? ref : null; }
    return { resolve, looseNote };
}
export async function resolve(ref: ContentRef): Promise<ContentItem | null> { return createResolver().resolve(ref); }
async function associatedBooks(item: ContentItem, reader: ReturnType<typeof createResolver>, wanted: string): Promise<string[]> {
    const books = new Set<string>();
    for (const s of item.sources ?? []) {
        let target: ContentRef | null = null;
        if (s.kind === 'reading_note') {
            const parts = s.id.split(':');
            if (parts.length > 1) {
                if (!sameId(parts[0], wanted))
                    continue;
                target = parseRef({ kind: 'reading_note', recordId: parts[1], parentBookId: parts[0], ...(parts[2] === 'reflection' ? { fragment: 'reflection' } : {}) });
            }
            else
                target = await reader.looseNote(s.id);
        }
        else if (s.kind === 'reading_insight' || s.kind === 'book')
            target = parseRef({ kind: s.kind, recordId: s.id });
        if (!target)
            continue;
        const record = await reader.resolve(target);
        const book = record?.bookId ?? record?.ref.parentBookId;
        if (book && await reader.resolve({ kind: 'book', recordId: book }))
            books.add(book);
    }
    return [...books];
}
type NotesCursor = {
    books: BookSummary[];
    booksCursor: string | null;
    booksDone: boolean;
    blockCursor: string | null;
};
export function productionAdapters(options: Options = {}): Record<ContentKind, SourceAdapter> {
    const reader = createResolver(options);
    function regular(kind: ContentKind): SourceAdapter {
        return { async readBatch(cursor) {
                const prefix = prefixes[kind], r = await listQuery(sourceDatabase(kind), cursor ?? undefined, prefix ? { property: '標題', title: { starts_with: prefix } } : undefined);
                const items = r.results.flatMap(p => pageItems(p, kind, options));
                if (kind === 'knowledge_claim' && options.bookId)
                    for (const i of items)
                        i.bookIds = await associatedBooks(i, reader, options.bookId);
                return { items, next: r.has_more ? r.next_cursor : null, complete: !r.has_more, readAt: new Date().toISOString() };
            } };
    }
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
                const b = s.books[0], p = await withNotionRateLimit(() => notion().blocks.children.list({ block_id: b.id, start_cursor: s.blockCursor ?? undefined, page_size: 20 }));
                items = p.results.flatMap(raw => noteItems(b, raw));
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
