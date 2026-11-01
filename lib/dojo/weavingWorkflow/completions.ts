import 'server-only';
import type {StudioData} from '../creativeStudio/model';
import { listJsonRecords } from '../notionStore';
import { getKnowledgeEntry } from '@/lib/notion/queries';
import { COMPLETION_TITLE_PREFIX, parseJson } from '../formal';
import type { WeavingWork } from '../weavingShuttle';
import type { OutputKind, WorkflowSelection } from './model';
import { WeavingError } from './model';
import { operationDigest } from './operations';
export type CompletionVersion = {
    schemaVersion: 1;
    studioSnapshot?: StudioData;
    id: string;
    owner: string;
    workId: string;
    operationId: string;
    coreVersionId: string;
    sourceSelections: WorkflowSelection[];
    sourceSnapshotState?: 'captured';
    outputKind: OutputKind;
    text: string;
    outputUrl: string;
    title: string;
    createdAt: string;
    state: 'confirmed';
    supersededBy: string | null;
};
export function completionPayload(work: WeavingWork) { return { ...(work.studio ? {studioSnapshot:structuredClone(work.studio)} : {}), workId: work.id, revision: work.revision, title: work.title, coreVersionId: work.coreVersionId, sourceSelections: work.textWorkflow?.sourceSelections ?? [], outputKind: work.textWorkflow?.outputKind ?? 'article', text: work.draftText, outputUrl: work.outputUrl }; }
export function completionDigest(work: WeavingWork) { return operationDigest(completionPayload(work)); }
export function normalizeCompletion(v: unknown, id: string): CompletionVersion | null { if (!v || typeof v !== 'object')
    return null; const r = v as CompletionVersion; if (r.schemaVersion !== 1 || r.owner !== 'dojo-private-owner' || r.state !== 'confirmed' || !r.workId || typeof r.text !== 'string')
    return null; return { ...r, id }; }
export async function readCompletion(id: string): Promise<CompletionVersion> { const row = await getKnowledgeEntry(id); if (!row.標題.startsWith(COMPLETION_TITLE_PREFIX))
    throw new WeavingError('來源不是成品版本', 403); const c = normalizeCompletion(parseJson(row.內容), id); if (!c)
    throw new WeavingError('成品版本無法讀取', 409); return c; }
export async function listCompletions(workId: string) { return (await listJsonRecords(COMPLETION_TITLE_PREFIX)).flatMap(r => { const c = normalizeCompletion(r.value, r.id); return c?.workId === workId ? [c] : []; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }

export function assertStudioPublication(c:CompletionVersion|undefined){if(c?.studioSnapshot&&(!c.studioSnapshot.source.allowPublic||c.studioSnapshot.source.read==='private'))throw new WeavingError('這份固定版本尚未確認可公開；請核對用途後另存新完稿',403);}
