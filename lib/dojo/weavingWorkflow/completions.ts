import type { MediaManifest } from './media';
import 'server-only';
import { listJsonRecords } from '../notionStore';
import { getKnowledgeEntry } from '@/lib/notion/queries';
import { COMPLETION_TITLE_PREFIX, parseJson } from '../formal';
import type { WeavingWork } from '../weavingShuttle';
import type { OutputKind, WorkflowSelection } from './model';
import { WeavingError } from './model';
import { operationDigest } from './operations';
export type CompletionVersion = {
    schemaVersion: 1;
    id: string;
    owner: string;
    workId: string;
    operationId: string;
    coreVersionId: string;
    sourceSelections: WorkflowSelection[];
    outputKind: OutputKind | "comic" | "video" | "carousel" | "story";
    mediaManifest?: MediaManifest;
    text: string;
    outputUrl: string;
    title: string;
    createdAt: string;
    state: 'confirmed';
    supersededBy: string | null;
};
export function completionPayload(work: WeavingWork) { return { workId: work.id, revision: work.revision, title: work.title, coreVersionId: work.coreVersionId, sourceSelections: work.textWorkflow?.sourceSelections ?? [], outputKind: work.mediaManifest?.kind === 'comic' ? 'comic' : work.format === 'video' ? 'video' : work.mediaManifest?.kind ?? work.textWorkflow?.outputKind ?? 'article', ...(work.mediaManifest ? { mediaManifest: work.mediaManifest } : {}), text: work.draftText, outputUrl: work.outputUrl }; }
export function completionDigest(work: WeavingWork) { return operationDigest(completionPayload(work)); }
export function normalizeCompletion(v: unknown, id: string): CompletionVersion | null { if (!v || typeof v !== 'object')
    return null; const r = v as CompletionVersion; if (r.schemaVersion !== 1 || r.owner !== 'dojo-private-owner' || r.state !== 'confirmed' || !r.workId || typeof r.text !== 'string')
    return null; return { ...r, id }; }
export async function readCompletion(id: string): Promise<CompletionVersion> { const row = await getKnowledgeEntry(id); if (!row.標題.startsWith(COMPLETION_TITLE_PREFIX))
    throw new WeavingError('來源不是成品版本', 403); const c = normalizeCompletion(parseJson(row.內容), id); if (!c)
    throw new WeavingError('成品版本無法讀取', 409); return c; }
export async function listCompletions(workId: string) { return (await listJsonRecords(COMPLETION_TITLE_PREFIX)).flatMap(r => { const c = normalizeCompletion(r.value, r.id); return c?.workId === workId ? [c] : []; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
