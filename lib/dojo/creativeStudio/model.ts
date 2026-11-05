import { cBase, blankCollaboration, normalizeCollaboration, type Collaboration } from './collaboration';
import { randomID } from '../weavingWorkflow/clientIdentity';
import { normalizeTargets, type WritingPlatform } from './targets';
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
    question?: string; angle?: string; details?: Record<string, unknown>;
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
    platformDrafts: { id: string; platform: string; text: string; sourceVersionId: string; sourceText?: string; taskId?: string; rawReply?: string }[];
    publicationHistory: { id: string; platform: string; url: string; publishedOn: string; timeZone: string; sourceVersionId: string; note: string }[];
    collaboration: Collaboration;
    archivedFromStatus: string;
    contentKind: string;
    platform: string;
    targetPlatforms: WritingPlatform[];
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
        source?: string;
        module?: string;
        mode?: string;
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
export function blankStudio(): StudioData { return { schema: 1, platformDrafts: [], publicationHistory: [], collaboration: blankCollaboration(), archivedFromStatus: '', contentKind: 'article', platform: '', targetPlatforms: [], module: 'A', source: { id: '', title: '', raw: '', corrections: [], selected: '', selectedVersion: 'original', read: 'selected', allowAI: false, allowPublic: false }, direction: null, a: '', b: '', c: '', d: '', body: '', research: '', researchUse: 'background', examples: [], checks: { facts: false, privacy: false, citations: false, voice: false }, analyses: [], history: [], originKey: '', serviceId: '', importIdentity: '', legacy: null }; }
export function object(v: unknown): Record<string, unknown> {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        throw Error('資料格式不完整');
    return v as Record<string, unknown>;
}
export function assertPlatformProvenance(previous: StudioData, next: StudioData) {
    for (const old of previous.platformDrafts.filter(d => d.sourceText !== undefined)) {
        const row = next.platformDrafts.find(d => d.id === old.id);
        if (!row || row.sourceText !== old.sourceText || row.taskId !== old.taskId || row.rawReply !== old.rawReply) throw Error('已保存平台稿的來源與原回覆不可改寫，請由新回覆另存平台稿');
    }
}
export function raw(v: unknown, max = 80000): string {
    if (typeof v !== 'string' || v.length > max)
        throw Error(`文字不能超過 ${max} 字，請保留原檔後拆分`);
    return v;
}
function bool(v: unknown): boolean {
    if (typeof v !== 'boolean')
        throw Error('許可或確認欄位不正確');
    return v;
}
function list(v: unknown): unknown[] {
    if (!Array.isArray(v))
        throw Error('清單格式不正確');
    return v;
}
export function normalizeDirections(value: unknown): StudioDirection[] {
    if (value === undefined)
        return [];
    const ids = new Set<string>();
    return list(value).map(x => {
        const d = object(x), id = raw(d.id, 120);
        if (!id || ids.has(id))
            throw Error('方向識別重複');
        ids.add(id);
        const seen = new Set<string>();
        return { id, title: raw(d.title, 200), question: raw(d.question ?? '', 8000), angle: raw(d.angle ?? '', 8000), ...(d.details && typeof d.details === 'object' ? { details: structuredClone(object(d.details)) } : {}), versions: list(d.versions).map(y => {
                const v = object(y), vid = raw(v.id, 120);
                if (!vid || seen.has(vid))
                    throw Error('理解版本識別重複');
                seen.add(vid);
                return { id: vid, statement: raw(v.statement), note: raw(v.note, 4000), createdAt: raw(v.createdAt, 60) };
            }) };
    });
}
export function newDirection(id: string, title: string, statement: string, versionId: string, createdAt: string): StudioDirection { return { id, title, versions: [{ id: versionId, statement, note: '初次理解', createdAt }] }; }
export function adoptDirection(d: StudioDirection, versionId: string): DirectionAdoption {
    const v = d.versions.find(v => v.id === versionId);
    if (!v)
        throw Error('找不到指定理解版本');
    return { directionId: d.id, versionId: v.id, title: d.title, statement: v.statement };
}
export function normalizeStudio(value: unknown): StudioData {
    const v = object(value);
    if (v.schema !== 1)
        throw Error('不支援的工作資料版本');
    const s = object(v.source), checks = object(v.checks);
    if (!['A', 'B', 'C', 'D'].includes(String(v.module)) || !['selected', 'allowed', 'private'].includes(String(s.read)) || !['background', 'body', 'none'].includes(String(v.researchUse)))
        throw Error('工作設定不正確');
    const base = blankStudio();
    base.platformDrafts = list(v.platformDrafts ?? []).map(x => { const p=object(x); return { id: raw(p.id,120), platform: raw(p.platform,80), text: raw(p.text), sourceVersionId: raw(p.sourceVersionId ?? '',300), ...(p.sourceText === undefined ? {} : {sourceText:raw(p.sourceText)}), ...(p.taskId === undefined ? {} : {taskId:raw(p.taskId,120)}), ...(p.rawReply === undefined ? {} : {rawReply:raw(p.rawReply)}) }; });
    base.publicationHistory = list(v.publicationHistory ?? []).map(x => { const p=object(x); return { id:raw(p.id,120),platform:raw(p.platform ?? '',80),url:raw(p.url ?? '',2000),publishedOn:raw(p.publishedOn ?? '',80),timeZone:raw(p.timeZone ?? '',80),sourceVersionId:raw(p.sourceVersionId ?? '',300),note:raw(p.note ?? '',8000) }; });
    base.collaboration = normalizeCollaboration(v.collaboration);
    const oldCollaboration = v.collaboration as Record<string, unknown> | undefined;
    if (oldCollaboration?.cManuscript === undefined)
        base.collaboration.cManuscript = typeof v.c === 'string' ? v.c : '';
    if (oldCollaboration?.cExpandedManuscript === undefined)
        base.collaboration.cExpandedManuscript = base.collaboration.cExpandedResponse;
    if (oldCollaboration?.cExpandedSource === undefined) {
        base.collaboration.cExpandedSource = base.collaboration.cSource;
        base.collaboration.cExpandedVersionId = base.collaboration.cVersionId;
    }
    base.archivedFromStatus = raw(v.archivedFromStatus ?? '', 80);
    base.contentKind = raw(v.contentKind ?? 'article', 80);
    base.platform = raw(v.platform ?? '', 80);
    base.targetPlatforms = normalizeTargets(v.targetPlatforms, base.platform);
    for (const k of ['a', 'b', 'c', 'd', 'body', 'research', 'originKey', 'serviceId', 'importIdentity'] as const)
        base[k] = raw(v[k], k === 'originKey' ? 2000 : k === 'serviceId' ? 300 : 80000);
    const correctionIds = new Set<string>();
    const corrections = list(s.corrections).map(x => {
        const c = object(x), id = raw(c.id, 120);
        if (!id || correctionIds.has(id))
            throw Error('校訂識別重複');
        correctionIds.add(id);
        return { id, text: raw(c.text), note: raw(c.note, 4000), createdAt: raw(c.createdAt, 60) };
    });
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
    base.examples = list(v.examples).map(x => {
        const e = object(x);
        if (!['experience', 'external', 'hypothetical', 'metaphor'].includes(String(e.kind)))
            throw Error('例子類型不正確');
        return { kind: e.kind as StudioData['examples'][number]['kind'], text: raw(e.text, 8000), adopted: bool(e.adopted), ...(e.source === undefined ? {} : { source: raw(e.source, 8000) }), ...(e.module === undefined ? {} : { module: raw(e.module, 10) }), ...(e.mode === undefined ? {} : { mode: raw(e.mode, 20) }) };
    });
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
}): StudioData {
    if (w.studio)
        return normalizeStudio(w.studio);
    const s = blankStudio();
    s.body = w.draftText || '';
    const selected = w.textWorkflow?.sourceSelections || [];
    s.source.id = selected[0]?.sourceId || '';
    s.source.raw = selected.map(x => x.selectedText).join('\n\n');
    s.source.selected = s.source.raw;
    return s;
}
export function startD(workId: string, c: {
    id: string;
    workId: string;
    state: string;
    text: string;
    coreVersionId: string;
    createdAt: string;
}, text: string): StudioAnalysis {
    if (c.workId !== workId || c.state !== 'confirmed')
        throw Error('請選擇本件已確認的完稿版本');
    return { id: randomID(), completionId: c.id, sourceText: c.text, coreVersionId: c.coreVersionId, text, createdAt: new Date().toISOString() };
}
export function catalogPage<T extends {
    id: string;
    title: string;
    status: string;
    updatedAt: string;
}>(works: T[], query: string, page: number) { const q = query.trim().toLocaleLowerCase(); const rows = works.filter(w => w.status !== 'archived' && (!q || `${w.id} ${w.title}`.toLocaleLowerCase().includes(q))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); const pages = Math.max(1, Math.ceil(rows.length / 5)), index = Math.max(1, Math.min(pages, page)); return { rows: rows.slice((index - 1) * 5, index * 5), count: rows.length, page: index, pages }; }
export function studioPromptSource(s: StudioData, module: StudioData['module'], completion?: {
    id: string;
    text: string;
    studioSnapshot?: StudioData;
}, confirmedVersionId = '') {
    if (module === 'D') {
        if (!completion)
            throw Error('請先選本件完稿版本');
        const permission = completion.studioSnapshot?.source;
        if (confirmedVersionId !== completion.id && (!permission?.allowAI || permission.read === 'private'))
            throw Error('請先核對所選完稿的外部使用許可，或逐次確認本次使用');
        return { text: completion.text, versionId: completion.id, understanding: completion.studioSnapshot?.direction?.statement || completion.studioSnapshot?.collaboration.expression || completion.studioSnapshot?.collaboration.aAnswers || '' };
    }
    if (!s.source.allowAI || s.source.read === 'private')
        throw Error('請先確認本次素材與稿件可交給外部 AI');
    return { text: module === 'C' ? (cBase(s.collaboration).text || s.body) : module === 'A' && s.collaboration.aMode === 'draft' ? (s.body || s.source.selected) : module === 'B' ? [s.source.selected, s.body ? '目前主稿：\n' + s.body : ''].filter(Boolean).join('\n\n') : s.source.selected, versionId: module === 'C' ? (cBase(s.collaboration).versionId || 'draft') : s.source.selectedVersion, understanding: s.direction?.statement || s.collaboration.expression || s.collaboration.aAnswers };
}
/** Append a candidate understanding without rewriting adopted or earlier versions. */
export function mergeCandidateDirection(direction: StudioDirection, candidate: {
    id: string;
    title: string;
    statement: string;
    quote: string;
    locator: string;
    sourceVersion: string;
}, workId: string, createdAt: string): StudioDirection {
    const versionId = 'candidate-' + candidate.id;
    const prior = direction.versions.find(v => v.id === versionId);
    if (prior) {
        if (prior.statement !== candidate.statement)
            throw Error('此候選已接入方向；若理解改變請新增候選');
        return direction;
    }
    if (!candidate.statement.trim())
        throw Error('請填候選理解');
    return { ...direction, versions: [...direction.versions, { id: versionId, statement: candidate.statement, note: `候選來源 ${workId} / ${candidate.sourceVersion} / ${candidate.locator}：${candidate.quote}`, createdAt }] };
}
