import 'server-only';
import { getInsightCardSource } from '@/lib/notion/queries';
import { productionAdapters, resolve as productionResolve } from './adapters';
import { scanPage, type ScanResult } from './scan';
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
    resolve: (ref: ContentRef) => Promise<ContentItem | null>;
    scan: (cursor: string | null) => Promise<Pick<ScanResult, 'items' | 'cursor' | 'complete' | 'warnings'>>;
    enrich?: (item: ContentItem) => Promise<ContentItem>;
    looseNote?: (id: string) => Promise<ContentRef | null>;
};
function linkMatches(link: SourceLink, ref: ContentRef): boolean {
    if (link.kind !== ref.kind)
        return false;
    if (ref.kind !== 'reading_note')
        return sameId(link.id, ref.recordId);
    const parts = link.id.split(':');
    const fragment = parts.at(-1) === 'reflection';
    if (fragment !== Boolean(ref.fragment))
        return false;
    if (parts.length === 1)
        return sameId(link.id, ref.recordId);
    return sameId(parts[0], ref.parentBookId ?? '') && sameId(parts[1], ref.recordId);
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
export function relationService(deps: Dependencies) {
    return async (ref: ContentRef, cursor: string | null = null): Promise<RelationsPage> => {
        const target = await deps.resolve(parseRef(ref));
        if (!target)
            return { items: [], warnings: ['來源已不可用；歷史快照仍保留在引用它的內容中。'], complete: true, cursor: null };
        const items: Relation[] = [];
        const warnings: string[] = [];
        if (!cursor) {
            const enriched = deps.enrich ? await deps.enrich(target) : target;
            for (const link of enriched.sources ?? []) {
                try {
                    const source = await linkRef(link, deps);
                    const item = source ? await deps.resolve(source) : null;
                    if (item)
                        items.push({ direction: 'source', item, relation: 'extracted', snapshot: link.snapshot, sourceVersion: link.version });
                    else
                        warnings.push(`${link.label || '原始來源'}目前無法定位；建立時快照：${link.snapshot.slice(0, 500)}`);
                }
                catch {
                    warnings.push(`來源無法確認；建立時快照：${link.snapshot.slice(0, 500)}`);
                }
            }
        }
        const page = await deps.scan(cursor);
        warnings.push(...page.warnings);
        for (let item of page.items) {
            if (deps.enrich && (item.ref.kind === 'reading_insight' || item.ref.kind === 'reading_note') && (ref.kind === 'book' || ref.kind === 'reading_note') && sameId(item.bookId ?? '', ref.parentBookId ?? ref.recordId)) {
                try {
                    item = await deps.enrich(item);
                }
                catch {
                    warnings.push('部分洞察來源尚未確認，請重試');
                }
            }
            const links = (item.sources ?? []).filter(s => linkMatches(s, ref));
            if (!links.length)
                continue;
            // Bare legacy note IDs are usable only after membership was confirmed by resolve(target).
            const link = links[0];
            items.push({ direction: 'subsequent', item, relation: item.ref.kind === 'knowledge_claim' ? 'claim_source' : item.ref.kind === 'reading_insight' ? 'extracted' : 'work_selection', snapshot: links.map(l => l.snapshot).join('\n\n'), sourceVersion: link.version });
        }
        const unique = [...new Map(items.map(i => [`${i.direction}:${contentKey(i.item.ref)}`, i])).values()];
        return { items: unique, warnings, complete: page.complete, cursor: page.cursor };
    };
}
async function enrich(item: ContentItem): Promise<ContentItem> { if (item.ref.kind !== 'reading_insight')
    return item; const s = await getInsightCardSource(item.ref.recordId); const sources: SourceLink[] = s?.sourceNoteId && item.bookId ? [{ kind: 'reading_note', id: `${item.bookId}:${s.sourceNoteId}`, snapshot: s.sourceText, version: null }] : item.bookId ? [{ kind: 'book', id: item.bookId, snapshot: s?.sourceText ?? '', version: null }] : []; return { ...item, sources }; }
async function looseNote(id: string): Promise<ContentRef | null> { const a = productionAdapters().reading_note; let cursor: string | null = null; let found: ContentRef | null = null; do {
    const p = await a.readBatch(cursor);
    for (const item of p.items)
        if (!item.ref.fragment && sameId(item.ref.recordId, id)) {
            if (found && !sameId(found.parentBookId ?? '', item.ref.parentBookId ?? ''))
                return null;
            found = item.ref;
        }
    cursor = p.next;
} while (cursor); return found; }
export async function relations(ref: ContentRef, cursor: string | null, owner: string): Promise<RelationsPage> { return relationService({ resolve: productionResolve, enrich, looseNote, scan: cursor => scanPage(['reading_note', 'reading_insight', 'knowledge_claim', 'weaving_work', 'completion'], cursor, `relations:${contentKey(ref)}`, owner) })(ref, cursor); }
