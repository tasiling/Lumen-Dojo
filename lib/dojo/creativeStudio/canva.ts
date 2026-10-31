import 'server-only';
import { bundle as readBundle } from '../illustrated/store';
import { listJsonRecords } from '../notionStore';
import { createStep, updateStep, readRecord, expectRevision, operationId, WEAVING_OWNER, type Body } from '../weavingWorkflow/store';
import { runWeavingOperation } from '../weavingWorkflow/operations';
import { WeavingError } from '../weavingWorkflow/model';
import { raw } from './model';
const PREFIX = '行光圖文外部交接-v1-';
export type CanvaTransfer = {
    id: string;
    revision: number;
    deckId: string;
    versionId: string;
    completionId: string;
    title: string;
    designUrl: string;
    pages: {
        id: string;
        title: string;
        body: string;
        typography: unknown;
    }[];
    resultUrl: string;
    note: string;
    createdAt: string;
};
function url(value: unknown, canva = false) { const text = raw(value, 2000); if (!text)
    return ''; const u = new URL(text); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || canva && !['www.canva.com', 'canva.com'].includes(u.hostname.toLowerCase()))
    throw Error('請填完整且可信任的設計／成品網址'); return u.toString(); }
export async function canvaTransfers(deckId: string) { await readBundle(deckId); return (await listJsonRecords(PREFIX)).filter(r => (r.value as CanvaTransfer).deckId === deckId).map(r => ({ ...r.value as CanvaTransfer, id: r.id })); }
export async function createCanvaTransfer(body: Body) { if (body.externalConfirmed !== true)
    throw new WeavingError('請確認本次文字可以交給 Canva；這不等於公開許可'); const deckId = raw(body.deckId, 300), b = await readBundle(deckId); expectRevision(b.deck, body.expectedRevision); if (b.version.id !== body.versionId)
    throw new WeavingError('請先保存並核對目前圖文版本', 409); const designUrl = url(body.designUrl, true); const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'patch', body, [createStep(PREFIX, 'transfer', r => ({ revision: 1, deckId, versionId: b.version.id, completionId: b.deck.completionId, title: b.version.title, designUrl, pages: b.version.pages.map(p => ({ id: p.id, title: p.title, body: p.body, typography: p.typography || null })), resultUrl: '', note: '', createdAt: r.createdAt }))]); return { ...JSON.parse((await readRecord(r.result.transfer.id, PREFIX)).內容), id: r.result.transfer.id } as CanvaTransfer; }
export async function saveCanvaResult(body: Body) { const id = raw(body.id, 300), resultUrl = url(body.resultUrl); if (!resultUrl)
    throw Error('請填成品連結'); const r = await runWeavingOperation(WEAVING_OWNER, operationId(body), 'patch', body, [updateStep(id, PREFIX, 'transfer', (row) => { const old = JSON.parse(row.內容); expectRevision(old, body.expectedRevision); return { ...old, resultUrl, note: raw(body.note, 4000), revision: old.revision + 1 }; })]); return { ...JSON.parse((await readRecord(r.result.transfer.id, PREFIX)).內容), id: r.result.transfer.id } as CanvaTransfer; }
