import 'server-only';
import { getInsightCardSource } from '@/lib/notion/queries';
import { productionAdapters, createResolver } from './adapters';
import { scanner, type ScanResult } from './scan';
import { encodeCursor, decodeCursor } from './cursor';
import { contentKey, parseRef, sameId, type ContentRef, type ContentItem, type SourceLink } from './model';
export type Relation = {
    direction: 'source' | 'subsequent';
    item: ContentItem;
    relation: 'extracted' | 'claim_source' | 'work_selection';
    snapshot: string;
    sourceVersion: string | null;
};
export type RelationsPage = {
    items: Relation[];
    warnings: string[];
    complete: boolean;
    cursor: string | null;
};
type Dependencies = {
    owner?: string;
    resolve: (ref: ContentRef) => Promise<ContentItem | null>;
    scan: (cursor: string | null) => Promise<Pick<ScanResult, 'items' | 'cursor' | 'complete' | 'warnings'>>;
    enrich?: (item: ContentItem) => Promise<ContentItem>;
    looseNote?: (id: string) => Promise<ContentRef | null>;
};
type RetryState = {
    scanCursor: string | null;
    scanComplete: boolean;
    failed: ContentItem[];
    sourcesPending: boolean;
};
function linkMatches(link: SourceLink, ref: ContentRef): boolean {
    if (link.kind !== ref.kind)
        return false;
    if (ref.kind !== 'reading_note')
        return sameId(link.id, ref.recordId);
    const parts = link.id.split(':');
    if ((parts.at(-1) === 'reflection') !== Boolean(ref.fragment))
        return false;
    return parts.length === 1 ? sameId(link.id, ref.recordId) : sameId(parts[0], ref.parentBookId ?? '') && sameId(parts[1], ref.recordId);
}
async function linkRef(link: SourceLink, deps: Dependencies): Promise<ContentRef | null> {
    if (!['book', 'reading_note', 'reading_insight', 'knowledge_claim'].includes(link.kind))
        return null;
    if (link.kind === 'reading_note') {
        const parts = link.id.split(':');
        if (parts.length === 1)
            return deps.looseNote ? deps.looseNote(link.id) : null;
        return parseRef({ kind: link.kind, parentBookId: parts[0], recordId: parts[1], ...(parts[2] === 'reflection' ? { fragment: 'reflection' } : {}) });
    }
    return parseRef({ kind: link.kind, recordId: link.id });
}
const snapshot = (s: SourceLink) => [s.context, s.version ? `來源版本：${s.version}` : '未記錄來源版本', s.snapshot].filter(Boolean).join('\n');
export function relationService(deps: Dependencies) {
    return async (ref: ContentRef, cursor: string | null = null): Promise<RelationsPage> => {
        const binding = `relation-result:${contentKey(ref)}`, owner = deps.owner ?? 'isolated-relations';
        const state: RetryState = cursor ? decodeCursor(cursor, owner, binding) : { scanCursor: null, scanComplete: false, failed: [], sourcesPending: true };
        const target = await deps.resolve(parseRef(ref));
        if (!target)
            return { items: [], warnings: ['來源已不可用；歷史快照仍保留在引用它的內容中。'], complete: true, cursor: null };
        const items: Relation[] = [], warnings: string[] = [];
        if (state.sourcesPending) {
            state.sourcesPending = false;
            try {
                const enriched = deps.enrich ? await deps.enrich(target) : target;
                for (const link of enriched.sources ?? []) {
                    try {
                        const source = await linkRef(link, deps), item = source ? await deps.resolve(source) : null;
                        if (item)
                            items.push({ direction: 'source', item, relation: 'extracted', snapshot: snapshot(link), sourceVersion: link.version });
                        else
                            warnings.push(`${link.label || '原始來源'}目前無法定位；建立時快照：${link.snapshot.slice(0, 500)}`);
                    }
                    catch (e) {
                        warnings.push(`來源尚未確認；建立時快照：${link.snapshot.slice(0, 500)}`);
                        if ((e as {
                            status?: number;
                        }).status !== 400)
                            state.sourcesPending = true;
                    }
                }
            }
            catch {
                warnings.push('來源暫時讀取失敗，可繼續查找重試。');
                state.sourcesPending = true;
            }
        }
        const page = state.scanComplete || state.failed.length ? { items: [], cursor: state.scanCursor, complete: state.scanComplete, warnings: [] } : await deps.scan(state.scanCursor);
        state.scanComplete = page.complete;
        state.scanCursor = page.cursor;
        warnings.push(...page.warnings);
        const candidates = [...state.failed, ...page.items];
        state.failed = [];
        for (let item of candidates) {
            const needsEnrich = deps.enrich && ((item.ref.kind === 'reading_insight' || item.ref.kind === 'reading_note') && (ref.kind === 'book' || ref.kind === 'reading_note') && sameId(item.bookId ?? '', ref.parentBookId ?? ref.recordId) || item.ref.kind === 'completion');
            if (needsEnrich) {
                try {
                    item = await deps.enrich!(item);
                }
                catch {
                    warnings.push('部分來源尚未確認，可繼續查找重試。');
                    state.failed.push(item);
                    continue;
                }
            }
            const links = (item.sources ?? []).filter(s => linkMatches(s, ref));
            if (!links.length)
                continue;
            const contexts = [...new Set(links.map(l => l.context).filter(Boolean))];
            const display = contexts.length ? { ...item, title: `${item.title}（${contexts.join('、')}引用）` } : item;
            items.push({ direction: 'subsequent', item: display, relation: item.ref.kind === 'knowledge_claim' ? 'claim_source' : item.ref.kind === 'reading_insight' ? 'extracted' : 'work_selection', snapshot: links.map(snapshot).join('\n\n'), sourceVersion: links[0].version });
        }
        const unique = [...new Map(items.map(i => [`${i.direction}:${contentKey(i.item.ref)}`, i])).values()];
        const complete = state.scanComplete && !state.failed.length && !state.sourcesPending;
        return { items: unique, warnings, complete, cursor: complete ? null : encodeCursor(state, owner, binding) };
    };
}
export async function relations(ref: ContentRef, cursor: string | null, owner: string): Promise<RelationsPage> {
    const reader = createResolver({ includeHistory: true });
    async function enrich(item: ContentItem): Promise<ContentItem> {
        if (item.ref.kind === 'reading_note' && item.bookId)
            return { ...item, sources: [{ kind: 'book', id: item.bookId, snapshot: '', version: null }] };
        if (item.ref.kind === 'completion' && item.workId) {
            const work = await reader.resolve({ kind: 'weaving_work', recordId: item.workId });
            return work ? { ...item, href: `${work.href}&completion=${item.ref.recordId}#completion-${item.ref.recordId}` } : item;
        }
        if (item.ref.kind !== 'reading_insight')
            return item;
        const s = await getInsightCardSource(item.ref.recordId);
        const sources: SourceLink[] = s?.sourceNoteId && item.bookId ? [{ kind: 'reading_note', id: `${item.bookId}:${s.sourceNoteId}`, snapshot: s.sourceText, version: null }] : item.bookId ? [{ kind: 'book', id: item.bookId, snapshot: s?.sourceText ?? '', version: null }] : [];
        return { ...item, sources };
    }
    return relationService({ owner, resolve: reader.resolve, enrich, looseNote: reader.looseNote, scan: cursor => scanner(productionAdapters({ includeHistory: true }))(['reading_note', 'reading_insight', 'knowledge_claim', 'weaving_work', 'completion'], cursor, `relation-scan:${contentKey(ref)}`, owner) })(ref, cursor);
}
