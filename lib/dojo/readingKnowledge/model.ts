import { LearningError, uuidPattern } from '../learningFoundation/model';
export const CONTENT_KINDS = ['book', 'reading_note', 'reading_insight', 'knowledge_claim', 'weaving_work', 'completion'] as const;
export type ContentKind = typeof CONTENT_KINDS[number];
export type ContentRef = {
    kind: ContentKind;
    recordId: string;
    parentBookId?: string;
    fragment?: 'reflection';
};
export type SourceLink = {
    kind: string;
    id: string;
    parentBookId?: string;
    snapshot: string;
    version: string | null;
    label?: string;
    context?: string;
    claimVersionId?: string;
};
export type ContentItem = {
    ref: ContentRef;
    title: string;
    text: string;
    locator: string;
    href: string;
    status: string;
    sourceVersion: string | null;
    originalTopics: string[];
    bookId?: string;
    bookIds?: string[];
    workId?: string;
    sources?: SourceLink[];
};
export function parseRef(value: unknown): ContentRef {
    if (!value || typeof value !== 'object')
        throw new LearningError('內容識別不正確');
    const v = value as Record<string, unknown>;
    if (!CONTENT_KINDS.includes(v.kind as ContentKind) || typeof v.recordId !== 'string' || !uuidPattern.test(v.recordId) || (v.parentBookId !== undefined && (typeof v.parentBookId !== 'string' || !uuidPattern.test(v.parentBookId))) || (v.fragment !== undefined && (v.fragment !== 'reflection' || v.kind !== 'reading_note')) || (v.kind === 'reading_note' && !v.parentBookId))
        throw new LearningError('內容識別不正確');
    return { kind: v.kind as ContentKind, recordId: v.recordId.toLowerCase(), ...(v.parentBookId ? { parentBookId: String(v.parentBookId).toLowerCase() } : {}), ...(v.fragment ? { fragment: 'reflection' as const } : {}) };
}
export function contentKey(ref: ContentRef): string { const r = parseRef(ref); return [r.kind, r.parentBookId ?? '', r.recordId, r.fragment ?? ''].join(':'); }
export function contentHref(ref: ContentRef): string {
    const r = parseRef(ref);
    const id = encodeURIComponent(r.recordId);
    if (r.kind === 'book')
        return `/reading/books/${id}`;
    if (r.kind === 'reading_note')
        return `/reading/books/${r.parentBookId}?note=${id}${r.fragment ? '&fragment=reflection' : ''}`;
    if (r.kind === 'reading_insight')
        return `/reading/cards?card=${id}`;
    if (r.kind === 'knowledge_claim')
        return `/dao/knowledge?claim=${id}`;
    return '/weaving';
}
export const KIND_LABELS: Record<ContentKind, string> = { book: '書籍讀次', reading_note: '閱讀筆記', reading_insight: '閱讀洞察', knowledge_claim: '知識主張', weaving_work: '作品', completion: '成品版本' };
export function normalizeId(id: string): string { return id.replaceAll('-', '').toLowerCase(); }
export function sameId(a: string, b: string): boolean { return normalizeId(a) === normalizeId(b); }

export function contentStatusLabel(status:string):string {return ({excerpt:"原文摘錄",thought:"我的想法",free:"自由筆記",preview:"讀前提問",review:"讀後回顧",understanding:"個人理解",candidate:"候選",active:"目前採用",partial:"部分支持",disputed:"仍有爭議",refuted:"已反證",superseded:"已被取代",archived:"已封存"} as Record<string,string>)[status]??status;}
