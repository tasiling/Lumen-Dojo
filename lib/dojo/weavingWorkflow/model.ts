import { normalizeMediaManifest } from './media';
import { LearningError } from "../learningFoundation/model";
export const WORKFLOW_STEPS = ['sources', 'concept', 'production', 'review', 'handoff'] as const;
export type WorkflowStep = typeof WORKFLOW_STEPS[number];
export const OUTPUT_KINDS = ['article', 'post', 'thread', 'carousel_copy', 'story_copy', 'spoken_script'] as const;
export type OutputKind = typeof OUTPUT_KINDS[number];
export type SourceKind = 'reading_note' | 'reading_insight' | 'forage_capture' | 'knowledge_claim' | 'manual';
export type ContentKind = 'quote' | 'understanding' | 'experience' | 'insight';
export type WorkflowSelection = {
    sourceType: SourceKind;
    sourceId: string;
    sourceVersion: string | null;
    locator: string;
    contentKind: ContentKind;
    selectedText: string;
    capturedAt: string;
    digest: string;
};
export type TextBlock = {
    id: string;
    role: string;
    text: string;
    mediaNote: string;
};
export type TextWorkflow = {
    schemaVersion: 1;
    templateKey: string;
    currentStep: WorkflowStep;
    blocks: TextBlock[];
    sourceSelections: WorkflowSelection[];
    outputKind: OutputKind;
    audience: string;
    outline: string;
};
export class WeavingError extends LearningError {
    constructor(message: string, status = 400) { super(message, status); this.name = 'WeavingError'; }
}
export const MAX_TEXT = 80000, MAX_SOURCES = 30, MAX_SOURCE_TEXT = 30000;
export function stringValue(value: unknown, max: number, label: string, empty = true): string {
    if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()))
        throw new WeavingError(`${label}格式不正確或超過 ${max.toLocaleString('en-US')} 字元`);
    return value;
}
export function normalizeWorkflow(input: unknown): TextWorkflow | null {
    if (input == null)
        return null;
    if (typeof input !== 'object')
        throw new WeavingError('文字工作流程格式不正確');
    const s = input as Record<string, unknown>;
    if (s.schemaVersion !== 1)
        throw new WeavingError('不支援的文字流程版本', 409);
    const templateKey = stringValue(s.templateKey, 100, '模板', false);
    if (!['article', 'plurk', 'instagram_carousel', 'instagram_story', 'spoken_script', 'legacy'].includes(templateKey))
        throw new WeavingError('文字模板不存在');
    if (!WORKFLOW_STEPS.includes(s.currentStep as WorkflowStep) || !OUTPUT_KINDS.includes(s.outputKind as OutputKind))
        throw new WeavingError('步驟或交付種類不正確');
    if (!Array.isArray(s.blocks) || s.blocks.length > 100)
        throw new WeavingError('文字段落格式不正確');
    const blocks = s.blocks.map(b => {
        if (!b || typeof b !== 'object')
            throw new WeavingError('文字段落格式不正確');
        return { id: stringValue(b.id, 100, '段落 ID', false), role: stringValue(b.role, 200, '段落名稱', false), text: stringValue(b.text, MAX_TEXT, '作品文字'), mediaNote: stringValue(b.mediaNote ?? '', 3000, '畫面備註') };
    });
    if (new Set(blocks.map(b => b.id)).size !== blocks.length)
        throw new WeavingError('段落 ID 重複');
    const composed = blocks.filter(b => b.text.trim()).map(b => b.text).join('\n\n');
    if (composed.length > MAX_TEXT)
        throw new WeavingError('作品文字超過 80,000 字元');
    if (!Array.isArray(s.sourceSelections) || s.sourceSelections.length > MAX_SOURCES)
        throw new WeavingError('來源選摘最多 30 項');
    const sourceSelections: WorkflowSelection[] = s.sourceSelections.map(r => {
        if (!r || !['reading_note', 'reading_insight', 'forage_capture', 'knowledge_claim', 'manual'].includes(r.sourceType) || !['quote', 'understanding', 'experience', 'insight'].includes(r.contentKind))
            throw new WeavingError('來源選摘種類不正確');
        return { sourceType: r.sourceType, sourceId: stringValue(r.sourceId, 300, '來源 ID', false), sourceVersion: r.sourceVersion == null ? null : stringValue(r.sourceVersion, 300, '來源版本'), locator: stringValue(r.locator ?? '', 2000, '定位'), contentKind: r.contentKind, selectedText: stringValue(r.selectedText, MAX_SOURCE_TEXT, '選摘文字', false), capturedAt: stringValue(r.capturedAt, 50, '擷取時間', false), digest: stringValue(r.digest, 100, '來源摘要', false) };
    });
    if (sourceSelections.reduce((n, r) => n + r.selectedText.length, 0) > MAX_SOURCE_TEXT)
        throw new WeavingError('來源選摘合計超過 30,000 字元');
    return { schemaVersion: 1, templateKey, currentStep: s.currentStep as WorkflowStep, blocks, sourceSelections, outputKind: s.outputKind as OutputKind, audience: stringValue(s.audience ?? '', 1000, '受眾'), outline: stringValue(s.outline ?? '', 20000, '構思') };
}
export function workflowFromLegacy(work: {
    id: string;
    formatSubtype: string;
    draftText: string;
}): TextWorkflow {
    const kinds: Record<string, OutputKind> = { article: 'article', plurk: 'thread', instagram_carousel: 'carousel_copy', instagram_story: 'story_copy', spoken_script: 'spoken_script' };
    return normalizeWorkflow({ schemaVersion: 1, templateKey: 'legacy', currentStep: 'production', outputKind: kinds[work.formatSubtype] ?? 'article', blocks: [{ id: `legacy-${work.id}`, role: '自由文字', text: work.draftText, mediaNote: '' }], sourceSelections: [], audience: '', outline: '' })!;
}
export function validateWorkPatch(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new WeavingError('作品更新格式不正確');
    const p = value as Record<string, unknown>, allowed = ['title', 'formatSubtype', 'nextAction', 'draftText', 'outputUrl', 'toolKey', 'textWorkflow', 'mediaManifest', 'status'];
    for (const key of Object.keys(p))
        if (!allowed.includes(key))
            throw new WeavingError(`受保護或未知欄位：${key}`);
    if (p.status !== undefined && !['selecting', 'drafting', 'producing', 'reviewing', 'archived'].includes(String(p.status)))
        throw new WeavingError('請先保存並預覽，再確認成品');
    const limits: Record<string, number> = { title: 200, formatSubtype: 100, nextAction: 1000, draftText: MAX_TEXT, outputUrl: 2000, toolKey: 100 };
    for (const [key, max] of Object.entries(limits))
        if (p[key] !== undefined && p[key] !== null)
            stringValue(p[key], max, key);
    if (p.outputUrl && !/^https?:\/\//i.test(String(p.outputUrl)))
        throw new WeavingError('成品連結必須使用 HTTP 或 HTTPS');
    if (p.textWorkflow !== undefined)
        normalizeWorkflow(p.textWorkflow);
    if (p.mediaManifest !== undefined) normalizeMediaManifest(p.mediaManifest);
    return p;
}
