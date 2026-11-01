import {randomID} from '../weavingWorkflow/clientIdentity';
/** Versioned native work fields. Fixed output IDs stay in the existing completion/media stores. */
export type StudioCorrection = {
    id: string;
    text: string;
    note: string;
    createdAt: string;
};
export type StudioSource = {
    id: string;
    title: string;
    raw: string;
    corrections: StudioCorrection[];
    selected: string;
    selectedVersion: string;
    read: 'selected' | 'allowed' | 'private';
    allowAI: boolean;
    allowPublic: boolean;
};
export type DirectionVersion = {
    id: string;
    statement: string;
    note: string;
    createdAt: string;
};
export type StudioDirection = {
    id: string;
    title: string;
    versions: DirectionVersion[];
};
export type DirectionAdoption = {
    directionId: string;
    versionId: string;
    title: string;
    statement: string;
};
export type StudioAnalysis = {
    id: string;
    completionId: string;
    sourceText: string;
    coreVersionId: string;
    text: string;
    createdAt: string;
};
export type StudioData = {
    schema: 1;
    module: 'A' | 'B' | 'C' | 'D';
    source: StudioSource;
    direction: DirectionAdoption | null;
    a: string;
    b: string;
    c: string;
    d: string;
    body: string;
    research: string;
    researchUse: 'background' | 'body' | 'none';
    examples: {
        kind: 'experience' | 'external' | 'hypothetical' | 'metaphor';
        text: string;
        adopted: boolean;
    }[];
    checks: {
        facts: boolean;
        privacy: boolean;
        citations: boolean;
        voice: boolean;
    };
    analyses: StudioAnalysis[];
    history: {
        id: string;
        text: string;
        note: string;
        createdAt: string;
    }[];
    originKey: string;
    serviceId: string;
    importIdentity: string;
    legacy: Record<string, unknown> | null;
};
export function blankStudio(): StudioData { return { schema: 1, module: 'A', source: { id: '', title: '', raw: '', corrections: [], selected: '', selectedVersion: 'original', read: 'selected', allowAI: false, allowPublic: false }, direction: null, a: '', b: '', c: '', d: '', body: '', research: '', researchUse: 'background', examples: [], checks: { facts: false, privacy: false, citations: false, voice: false }, analyses: [], history: [], originKey: '', serviceId: '', importIdentity: '', legacy: null }; }
export function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('資料格式不完整'); return v as Record<string, unknown>; }
export function raw(v: unknown, max = 80000): string { if (typeof v !== 'string' || v.length > max)
    throw Error(`文字不能超過 ${max} 字，請保留原檔後拆分`); return v; }
function bool(v: unknown): boolean { if (typeof v !== 'boolean')
    throw Error('許可或確認欄位不正確'); return v; }
function list(v: unknown): unknown[] { if (!Array.isArray(v))
    throw Error('清單格式不正確'); return v; }
export function normalizeDirections(value: unknown): StudioDirection[] { if (value === undefined)
    return []; const ids = new Set<string>(); return list(value).map(x => { const d = object(x), id = raw(d.id, 120); if (!id || ids.has(id))
    throw Error('方向識別重複'); ids.add(id); const seen = new Set<string>(); return { id, title: raw(d.title, 200), versions: list(d.versions).map(y => { const v = object(y), vid = raw(v.id, 120); if (!vid || seen.has(vid))
        throw Error('理解版本識別重複'); seen.add(vid); return { id: vid, statement: raw(v.statement), note: raw(v.note, 4000), createdAt: raw(v.createdAt, 60) }; }) }; }); }
export function newDirection(id: string, title: string, statement: string, versionId: string, createdAt: string): StudioDirection { return { id, title, versions: [{ id: versionId, statement, note: '初次理解', createdAt }] }; }
export function adoptDirection(d: StudioDirection, versionId: string): DirectionAdoption { const v = d.versions.find(v => v.id === versionId); if (!v)
    throw Error('找不到指定理解版本'); return { directionId: d.id, versionId: v.id, title: d.title, statement: v.statement }; }
export function normalizeStudio(value: unknown): StudioData {
    const v = object(value);
    if (v.schema !== 1)
        throw Error('不支援的工作資料版本');
    const s = object(v.source), checks = object(v.checks);
    if (!['A', 'B', 'C', 'D'].includes(String(v.module)) || !['selected', 'allowed', 'private'].includes(String(s.read)) || !['background', 'body', 'none'].includes(String(v.researchUse)))
        throw Error('工作設定不正確');
    const base = blankStudio();
    for (const k of ['a', 'b', 'c', 'd', 'body', 'research', 'originKey', 'serviceId', 'importIdentity'] as const)
        base[k] = raw(v[k], k === 'originKey' ? 2000 : k === 'serviceId' ? 300 : 80000);
    const correctionIds = new Set<string>();
    const corrections = list(s.corrections).map(x => { const c = object(x), id = raw(c.id, 120); if (!id || correctionIds.has(id))
        throw Error('校訂識別重複'); correctionIds.add(id); return { id, text: raw(c.text), note: raw(c.note, 4000), createdAt: raw(c.createdAt, 60) }; });
    base.source = { id: raw(s.id, 300), title: raw(s.title, 300), raw: raw(s.raw), selected: raw(s.selected, 30000), selectedVersion: raw(s.selectedVersion, 120), corrections, read: s.read as StudioSource['read'], allowAI: bool(s.allowAI), allowPublic: bool(s.allowPublic) };
    if (base.source.read === 'private' && (base.source.allowAI || base.source.allowPublic))
        throw Error('只限本人查看的素材不可同時允許外部使用或公開');
    if (base.source.selectedVersion !== 'original' && !correctionIds.has(base.source.selectedVersion))
        throw Error('選摘校訂版本無法核對');
    if (v.direction !== null) {
        const d = object(v.direction);
        base.direction = { directionId: raw(d.directionId, 120), versionId: raw(d.versionId, 120), title: raw(d.title, 200), statement: raw(d.statement) };
    }
    base.module = v.module as StudioData['module'];
    base.researchUse = v.researchUse as StudioData['researchUse'];
    base.checks = { facts: bool(checks.facts), privacy: bool(checks.privacy), citations: bool(checks.citations), voice: bool(checks.voice) };
    base.examples = list(v.examples).map(x => { const e = object(x); if (!['experience', 'external', 'hypothetical', 'metaphor'].includes(String(e.kind)))
        throw Error('例子類型不正確'); return { kind: e.kind as StudioData['examples'][number]['kind'], text: raw(e.text, 8000), adopted: bool(e.adopted) }; });
    base.analyses = list(v.analyses).map(x => { const a = object(x); return { id: raw(a.id, 120), completionId: raw(a.completionId, 300), sourceText: raw(a.sourceText), coreVersionId: raw(a.coreVersionId, 120), text: raw(a.text), createdAt: raw(a.createdAt, 60) }; });
    base.history = list(v.history).map(x => { const h = object(x); return { id: raw(h.id, 120), text: raw(h.text), note: raw(h.note, 4000), createdAt: raw(h.createdAt, 60) }; });
    base.legacy = v.legacy === null ? null : structuredClone(object(v.legacy));
    return base;
}
export function studioForWork(w: {
    studio?: StudioData;
    draftText?: string;
    textWorkflow?: {
        sourceSelections?: {
            sourceId: string;
            selectedText: string;
            sourceVersion?: string | null;
        }[];
    };
}): StudioData { if (w.studio)
    return normalizeStudio(w.studio); const s = blankStudio(); s.body = w.draftText || ''; const selected = w.textWorkflow?.sourceSelections || []; s.source.id = selected[0]?.sourceId || ''; s.source.raw = selected.map(x => x.selectedText).join('\n\n'); s.source.selected = s.source.raw; return s; }
export function startD(workId: string, c: {
    id: string;
    workId: string;
    state: string;
    text: string;
    coreVersionId: string;
    createdAt: string;
}, text: string): StudioAnalysis { if (c.workId !== workId || c.state !== 'confirmed')
    throw Error('請選擇本件已確認的完稿版本'); return { id: randomID(), completionId: c.id, sourceText: c.text, coreVersionId: c.coreVersionId, text, createdAt: new Date().toISOString() }; }
export function catalogPage<T extends {
    id: string;
    title: string;
    status: string;
    updatedAt: string;
}>(works: T[], query: string, page: number) { const q = query.trim().toLocaleLowerCase(); const rows = works.filter(w => w.status !== 'archived' && (!q || `${w.id} ${w.title}`.toLocaleLowerCase().includes(q))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); const pages = Math.max(1, Math.ceil(rows.length / 5)), index = Math.max(1, Math.min(pages, page)); return { rows: rows.slice((index - 1) * 5, index * 5), count: rows.length, page: index, pages }; }

export function studioPromptSource(s:StudioData,module:StudioData['module'],completion?:{id:string;text:string;studioSnapshot?:StudioData},confirmedVersionId=''){
 if(module==='D'){if(!completion)throw Error('請先選本件完稿版本');const permission=completion.studioSnapshot?.source;if(confirmedVersionId!==completion.id&&(!permission?.allowAI||permission.read==='private'))throw Error('請先核對所選完稿的外部使用許可，或逐次確認本次使用');return {text:completion.text,versionId:completion.id,understanding:completion.studioSnapshot?.direction?.statement||completion.studioSnapshot?.a||''};}
 if(!s.source.allowAI||s.source.read==='private')throw Error('請先確認本次素材與稿件可交給外部 AI');return {text:module==='C'?s.body:s.source.selected,versionId:s.source.selectedVersion,understanding:s.direction?.statement||s.a};
}
