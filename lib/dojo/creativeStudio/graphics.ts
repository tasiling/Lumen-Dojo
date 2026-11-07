import 'server-only';
import { readWork, operationId, WEAVING_OWNER, type Body } from '../weavingWorkflow/store';
import { readCompletion } from '../weavingWorkflow/completions';
import { operationDigest, inspectWeavingOperation } from '../weavingWorkflow/operations';
import { createDeck, saveDeck, listDecks } from '../illustrated/store';
import { saveAsset } from '../illustrated/assets';
import { studioForWork, object, raw } from './model';
import { prototypeGraphics } from './graphicsMigration';
export async function previewStudioGraphics(id: string, choice = 'draft', completionId = '') {
    const work = await readWork(id), s = studioForWork(work), data = object(s.legacy?.data || {}), versions = Array.isArray(data.versions) ? data.versions.map(object) : [];
    const options = [...(Array.isArray(data.pages) && data.pages.length ? [{ id: 'draft', title: '舊版目前圖文草稿' }] : []), ...versions.filter(v => Array.isArray(v.pages) && v.pages.length).map(v => ({ id: String(v.id), title: String(v.title || v.id) }))];
    const original = choice === 'draft' ? data : versions.find(v => v.id === choice);
    if (!original)
        throw Error('找不到這份舊圖文配置');
    if (completionId) {
        const c = await readCompletion(completionId);
        if (c.workId !== id)
            throw Error('請選本件完稿作為圖文來源');
    }
    const prepared = prototypeGraphics(String(original.title || work.title), original.pages), existing = completionId ? (await listDecks()).find(d => d.deck.completionId === completionId) : undefined;
    return { ...prepared, options, existingDeck: existing ? { id: existing.deck.id, revision: existing.deck.revision } : null };
}
export async function restoreStudioGraphics(body: Body) {
    const id = raw(body.id, 300), choice = raw(body.choice ?? 'draft', 300), completionId = raw(body.completionId, 300), op = operationId(body), expected = body.expectedDeckRevision;
    if (!Number.isInteger(expected) || Number(expected) < 0 || body.confirm !== true)
        throw Error('請先預覽並確認這份圖文的來源與替換結果');
    const p = await previewStudioGraphics(id, choice, completionId), createOp = operationDigest(['restore-graphic-create', op]), saveOp = operationDigest(['restore-graphic-save', op]);
    const prior = await inspectWeavingOperation(WEAVING_OWNER, saveOp); // saveDeck below validates exact payload on replay.
    const seed = await inspectWeavingOperation(WEAVING_OWNER, createOp);
    if (!prior && p.existingDeck && (Number(expected) === 0 ? seed?.result.deck?.id !== p.existingDeck.id : p.existingDeck.revision !== expected))
        throw Error('圖文已變更，請重新預覽再確認');
    const draft = structuredClone(p.draft);
    for (const page of draft.pages) {
        const data = p.images[page.id];
        if (data) {
            const asset = await saveAsset(Buffer.from(data.split(',')[1].replace(/\s/g, ''), 'base64'));
            page.image = { assetId: asset.id, kind: 'unverified', tool: '舊版備份搬遷', prompt: '', sourceNote: '原備份配圖，來源與公開用途待本人核對', publicConfirmed: false };
        }
    }
    const created = await createDeck({ operationId: createOp, completionId });
    return saveDeck({ operationId: saveOp, deckId: created.deck.id, expectedRevision: Number(expected) || 1, draft });
}
