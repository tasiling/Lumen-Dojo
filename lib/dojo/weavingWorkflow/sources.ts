import 'server-only';
import {resolvePolicySource} from '../creativeSources/resolver';
import {parseSourceRef} from '../creativeSources/model';
import {fingerprint} from '../creativeProposals/model';
import { createHash } from 'node:crypto';
import { listReadingBooks, listReadingNotes, listInsightCards, getKnowledgeEntry } from '@/lib/notion/queries';
import { listJsonRecords } from '../notionStore';
import { CAPTURE_TITLE_PREFIX, normalizeCaptureEntry } from '../formal';
import { listKnowledgeClaims } from '../knowledgeClaimStore';
import { activeClaimVersion, knowledgeClaimCanUse, type KnowledgeUse } from '../knowledgeClaims';
import { WeavingError, MAX_SOURCES, MAX_SOURCE_TEXT, type ContentKind, type SourceKind, type WorkflowSelection } from './model';
export type SourceCandidate = {
    sourceType: SourceKind;
    sourceId: string;
    label: string;
    version: string;
    locator: string;
    contentKind: ContentKind;
    text: string;
    availability: 'available';
};
export type SelectionRequest = {
    sourceType: SourceKind;
    sourceId: string;
    sourceVersion: string;
    start: number;
    end: number;
    contentKind: ContentKind;
};
type SourcePage = {
    items: SourceCandidate[];
    cursor: string | null;
};
export type SourceAdapter = {
    get: (kind: SourceKind, id: string) => Promise<SourceCandidate | null>;
    page: (kind: SourceKind, cursor: string | null) => Promise<SourcePage>;
};
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function boundary(s: string, i: number) { return i === 0 || i === s.length || !(s.charCodeAt(i) >= 0xdc00 && s.charCodeAt(i) <= 0xdfff && s.charCodeAt(i - 1) >= 0xd800 && s.charCodeAt(i - 1) <= 0xdbff); }
export function sourceResolver(adapter: SourceAdapter) {
    return {
        get: adapter.get,
        list: (kind: SourceKind, cursor: string | null) => adapter.page(kind, cursor),
        async resolveSelections(requests: SelectionRequest[]): Promise<WorkflowSelection[]> {
            if (!Array.isArray(requests) || requests.length > MAX_SOURCES)
                throw new WeavingError('來源最多選取 30 項');
            const result: WorkflowSelection[] = [];
            for (const req of requests) {
                if (!req || typeof req.sourceId !== 'string' || typeof req.sourceVersion !== 'string')
                    throw new WeavingError('來源選摘格式不正確');
                const source = await adapter.get(req.sourceType, req.sourceId);
                if (!source)
                    throw new WeavingError('來源不存在、未成熟或無法存取', 403);
                if (source.version !== req.sourceVersion)
                    throw new WeavingError('來源內容已更新，請重新選摘', 409);
                if (!Number.isInteger(req.start) || !Number.isInteger(req.end) || req.start < 0 || req.end > source.text.length || req.start >= req.end || !boundary(source.text, req.start) || !boundary(source.text, req.end))
                    throw new WeavingError('來源字元選取範圍不正確');
                if (req.contentKind !== source.contentKind)
                    throw new WeavingError('選摘內容種類與來源不符');
                const selectedText = source.text.slice(req.start, req.end);
                if (!selectedText.trim())
                    throw new WeavingError('選摘內容為空');
                result.push({ sourceType: source.sourceType, sourceId: source.sourceId, sourceVersion: source.version, locator: source.locator, contentKind: source.contentKind, selectedText, capturedAt: new Date().toISOString(), digest: digest([source.version, req.start, req.end, selectedText]) });
            }
            if (result.reduce((n, r) => n + r.selectedText.length, 0) > MAX_SOURCE_TEXT)
                throw new WeavingError('來源選摘合計超過 30,000 字元');
            return result;
        }
    };
}
function candidate(kind: SourceKind, id: string, label: string, locator: string, contentKind: ContentKind, text: string, version?: string): SourceCandidate {
    return { sourceType: kind, sourceId: id, label, locator, contentKind, text, version: version ?? `snapshot:${digest([label, locator, contentKind, text])}`, availability: 'available' };
}
export function productionSources(bookId?: string, use: KnowledgeUse = 'perspective') {
    async function all(kind: SourceKind): Promise<SourceCandidate[]> {
        if (kind === 'reading_note') {
            const books = (await listReadingBooks()).filter(b => !bookId || b.id === bookId);
            const notes = await Promise.all(books.map(async (b) => (await listReadingNotes(b.id)).filter(n => n.text.trim()).flatMap(n => {
                const rows = [candidate(kind, `${b.id}:${n.id}`, b.title, [b.title, n.metadata.chapter, n.metadata.location].filter(Boolean).join('・'), n.kind === 'excerpt' ? 'quote' : 'understanding', n.text)];
                if (n.metadata.reflection)
                    rows.push(candidate(kind, `${b.id}:${n.id}:reflection`, `${b.title}・我的理解`, [b.title, n.metadata.chapter, n.metadata.location].filter(Boolean).join('・'), 'understanding', n.metadata.reflection));
                return rows;
            })));
            return notes.flat();
        }
        if (kind === 'reading_insight') {
            const [cards, books] = await Promise.all([listInsightCards(), listReadingBooks()]);
            return cards.filter(c => ['已驗證', '不成立'].includes(c.status)).map(c => candidate(kind, c.id, books.find(b => b.id === c.sourceBookId)?.title ?? '閱讀洞察', '閱讀洞察', 'insight', `${c.insight}\n行動：${c.action}${c.result ? `\n結果：${c.result}` : ''}`));
        }
        if (kind === 'forage_capture') {
            const rows = await listJsonRecords(CAPTURE_TITLE_PREFIX);
            return rows.flatMap(row => { const c = normalizeCaptureEntry(row.value, { id: row.id }); return c && c.status === 'adopted' && ['C2', 'C3'].includes(c.creativeMaturity) && c.destinations.includes('weaving') ? [candidate(kind, c.id, c.title, [c.sourceLocator, c.sourceUrl].filter(Boolean).join('・'), 'insight', c.forageSummary || c.excerpt || c.note)] : []; });
        }
        if (kind === 'knowledge_claim') {
            return (await listKnowledgeClaims()).flatMap(c => { const v = activeClaimVersion(c); return v && knowledgeClaimCanUse(c, use) ? [candidate(kind, c.id, c.title, v.sources.map(s => s.locator || s.label).join('・'), c.type==='experience'?'experience':v.claimant==='external_author'?'quote':'understanding', v.statement, `${v.id}:${digest([v.statement, v.sources, c.allowedUses])}`)] : []; });
        }
        return [];
    }
    return sourceResolver({ async page(kind, cursor) { const offset = cursor === null ? 0 : Number(cursor); if (!Number.isSafeInteger(offset) || offset < 0)
            throw new WeavingError('來源分頁位置不正確'); const items = await all(kind); return { items: items.slice(offset, offset + 20), cursor: offset + 20 < items.length ? String(offset + 20) : null }; }, async get(kind, id) {
            // Membership comes from the configured source database/page, never the caller.
            if (kind === 'forage_capture') {
                const row = await getKnowledgeEntry(id);
                if (!row.標題.startsWith(CAPTURE_TITLE_PREFIX))
                    return null;
            }
            return (await all(kind)).find(c => c.sourceId === id) ?? null;
        } });
}
export async function resolveSelections(requests: SelectionRequest[]): Promise<WorkflowSelection[]> { return productionSources().resolveSelections(requests); }
export async function checkSelectionAvailability(selections: WorkflowSelection[]) { const resolver = productionSources(); for (const s of selections) {
    if (s.sourceType === 'manual')
        continue;
    if(s.sourceVersion?.startsWith('proposal-source:')){
        const source=await resolvePolicySource(parseSourceRef({sourceType:s.sourceType,sourceId:s.sourceId}));
        if(!source||'proposal-source:'+fingerprint(source)!==s.sourceVersion)throw new WeavingError('提案來源已更新或無法使用，請重新選摘再完成',409);
        continue;
    }
    const current = await resolver.get(s.sourceType, s.sourceId);
    if (!current || current.version !== s.sourceVersion)
        throw new WeavingError('來源已更新或無法使用；保留歷史，請重新選摘再完成', 409);
} }
