import 'server-only';
import { createKnowledgeEntry, updateKnowledgeEntry } from '@/lib/notion/mutations';
import { listPlurkDrafts } from '@/lib/notion/queries';
import { listJsonRecords } from '../notionStore';
import { LIAOJIE_PROJECT_TITLE_PREFIX, LIAOJIE_TEXT_VARIANT_PREFIX, LIAOJIE_TEXT_VERSION_PREFIX, parseJson } from '../formal';
import { normalizeLiaojieProject } from '../liaojiePublication';
import { sourcePolicies } from '../creativeSources/store';
import { readCompletion } from '../weavingWorkflow/completions';
import { createStep, expectRevision, operationId, readRecord, revisionOf, updateStep, WEAVING_OWNER, type Body } from '../weavingWorkflow/store';
import { inspectWeavingOperation, operationDigest, runWeavingOperation } from '../weavingWorkflow/operations';
import { stringValue, WeavingError } from '../weavingWorkflow/model';
import { adaptSource, normalizeVariant, normalizeVersion, parseVariantPatch, stableTextDigest, TEXT_PLATFORMS, validateStatusChange, type LiaojieTextVariant, type LiaojieTextVersion, type TextPlatform } from './model';
import { decodePlurkContent, encodePlurkContent, plurkDraftTitle } from '@/lib/plurk/notionFormat';
import { deriveTitle } from '@/lib/plurk/logic';

export type VariantBundle = { variant: LiaojieTextVariant; currentVersion: LiaojieTextVersion; versions: LiaojieTextVersion[] };
function variantContent(value: LiaojieTextVariant) { const { id: _id, ...rest } = value; void _id; return rest; }
function textPlatform(value: unknown): TextPlatform {
  if (typeof value !== 'string' || !(value in TEXT_PLATFORMS)) throw new WeavingError('文字平台不正確');
  return value as TextPlatform;
}
async function priorReceipt(body: Body, kind: 'text_variant_save' | 'text_variant_status' | 'text_variant_plurk') {
  const op = operationId(body), receipt = await inspectWeavingOperation(WEAVING_OWNER, op);
  if (receipt && (receipt.kind !== kind || receipt.inputDigest !== operationDigest(body))) throw new WeavingError('同一操作識別的內容不同，請保留原操作', 409);
  return receipt;
}
function mutationMatches(value: unknown, body: Body, key: string) {
  const marker = (value as { _weavingMutation?: { operationId?: unknown; key?: unknown; inputDigest?: unknown; owner?: unknown } })?._weavingMutation;
  return marker?.operationId === operationId(body) && marker.key === key && marker.inputDigest === operationDigest(body) && marker.owner === WEAVING_OWNER;
}
export async function readTextVariant(id: string) {
  const row = await readRecord(id, LIAOJIE_TEXT_VARIANT_PREFIX);
  return normalizeVariant(parseJson(row.內容), { id });
}
export async function readTextVersion(id: string) {
  const row = await readRecord(id, LIAOJIE_TEXT_VERSION_PREFIX);
  return normalizeVersion(parseJson(row.內容), { id });
}
export async function listTextVariants(publicationId?: string): Promise<LiaojieTextVariant[]> {
  const rows = await listJsonRecords(LIAOJIE_TEXT_VARIANT_PREFIX);
  return rows.flatMap(row => {
    try { const value = normalizeVariant(row.value, { id: row.id }); return !publicationId || value.publicationId === publicationId ? [value] : []; }
    catch { return []; }
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function textVariantBundle(variant: LiaojieTextVariant): Promise<VariantBundle> {
  const versions = await Promise.all(variant.versionRefs.map(readTextVersion));
  const currentVersion = versions.find(value => value.id === variant.currentVersionId);
  if (!currentVersion || versions.some(value => value.variantId !== variant.id || value.platform !== variant.platform)) throw new WeavingError('平台稿件版本關係不符', 409);
  return { variant, currentVersion, versions: versions.sort((a, b) => b.number - a.number) };
}
async function publication(id: string) {
  const row = await readRecord(id, LIAOJIE_PROJECT_TITLE_PREFIX);
  const value = normalizeLiaojieProject(parseJson(row.內容), { id });
  if (!value) throw new WeavingError('聊解企劃無法讀取', 409);
  if (!value.sourceCompletionVersionId) throw new WeavingError('請先由織光堂交接固定成品版本', 409);
  if (value.sourceFormat !== 'text') throw new WeavingError('這張企劃不是文字固定成品，請使用原發布整理欄位', 409);
  return value;
}
async function assertPublishable(variant: LiaojieTextVariant, confirmed: unknown) {
  const completion = await readCompletion(variant.sourceCompletionVersionId);
  if (stableTextDigest(completion.text) !== variant.sourceDigest) throw new WeavingError('固定來源摘要不符，請重新建立平台稿', 409);
  await sourcePolicies.assertPublication(completion.sourceSelections ?? [], confirmed);
}
export async function createTextVariant(body: Body) {
  const publicationId = stringValue(body.publicationId, 300, '聊解企劃 ID', false);
  const target = textPlatform(body.platform);
  const existing = (await listTextVariants(publicationId)).filter(value => value.platform === target);
  if (existing.length > 1) throw new WeavingError('同一企劃有重複平台稿，請核對', 409);
  if (existing.length === 1) return textVariantBundle(existing[0]);
  const op = operationId(body);
  const p = await publication(publicationId);
  const completion = await readCompletion(p.sourceCompletionVersionId!);
  if (completion.id !== p.sourceCompletionVersionId || completion.workId !== p.weavingWorkId || completion.text !== p.sourceDraftSnapshot) throw new WeavingError('聊解企劃與固定成品不一致', 409);
  // Validate the complete adaptation before creating even a seed record. This also keeps
  // over-large Plurk sources from leaving an unreadable partial variant behind.
  const sourceBlocks = adaptSource(target, completion.text);
  const seedStep = createStep(LIAOJIE_TEXT_VARIANT_PREFIX, 'textVariantSeed', receipt => ({ schema: 1, owner: WEAVING_OWNER, revision: 0, publicationId, sourceCompletionVersionId: completion.id, sourceDigest: stableTextDigest(completion.text), platform: target, currentVersionId: '', versionRefs: [], status: 'draft', scheduledOn: null, publishedUrl: '', plurkDraftId: null, plurkSourceVersionId: null, createdAt: receipt.createdAt, updatedAt: receipt.createdAt }));
  const versionStep = createStep(LIAOJIE_TEXT_VERSION_PREFIX, 'textVersion', receipt => ({ schema: 1, owner: WEAVING_OWNER, variantId: receipt.result.textVariantSeed.id, platform: target, number: 1, title: completion.title || p.sourceTitle, voiceNote: '', changeNote: '由固定原稿建立的來源整理草稿，尚待本人調整語氣', blocks: sourceBlocks, createdAt: receipt.createdAt }));
  const r = await runWeavingOperation(WEAVING_OWNER, op, 'text_variant_create', body, [
    { ...seedStep, async findConfirmed(receipt) {
      const rows = (await listJsonRecords(LIAOJIE_TEXT_VARIANT_PREFIX)).filter(row => {
        const raw = row.value as Record<string, unknown>;
        return raw.owner === WEAVING_OWNER && raw.publicationId === publicationId && raw.platform === target;
      });
      if (rows.length > 1) throw new WeavingError('同一企劃有重複平台稿，請核對', 409);
      if (rows.length === 1) {
        const raw = rows[0].value as Record<string, unknown>;
        if (raw.sourceCompletionVersionId !== completion.id || raw.sourceDigest !== stableTextDigest(completion.text)) throw new WeavingError('既有平台稿來源與固定成品不一致', 409);
        return { id: rows[0].id, revision: revisionOf(raw) };
      }
      return seedStep.findConfirmed(receipt);
    } },
    { ...versionStep, async findConfirmed(receipt) {
      const seedId = receipt.result.textVariantSeed?.id;
      if (seedId) {
        const raw = parseJson((await readRecord(seedId, LIAOJIE_TEXT_VARIANT_PREFIX)).內容) as Record<string, unknown>;
        const currentVersionId = typeof raw.currentVersionId === 'string' ? raw.currentVersionId : '';
        if (currentVersionId && Array.isArray(raw.versionRefs) && raw.versionRefs.includes(currentVersionId)) {
          const current = await readTextVersion(currentVersionId);
          if (current.variantId !== seedId || current.platform !== target) throw new WeavingError('既有平台稿版本關係不符', 409);
          return { id: current.id };
        }
      }
      return versionStep.findConfirmed(receipt);
    } },
    { key: 'textVariant', async findConfirmed(receipt) {
      const id = receipt.result.textVariantSeed?.id;
      if (!id || !receipt.result.textVersion?.id) return null;
      try {
        const value = await readTextVariant(id);
        return value.currentVersionId === receipt.result.textVersion.id ? { id, revision: value.revision } : null;
      } catch { return null; }
    }, async execute(receipt) {
      const id = receipt.result.textVariantSeed?.id, versionId = receipt.result.textVersion?.id;
      if (!id || !versionId) throw new WeavingError('平台稿建立步驟不完整', 409);
      const row = await readRecord(id, LIAOJIE_TEXT_VARIANT_PREFIX), raw = parseJson(row.內容) as Record<string, unknown>;
      if (revisionOf(raw) !== 0 || raw.publicationId !== publicationId || raw.platform !== target || (Array.isArray(raw.versionRefs) && raw.versionRefs.length)) throw new WeavingError('平台稿初始紀錄已變更', 409);
      const next = normalizeVariant({ ...raw, revision: 1, currentVersionId: versionId, versionRefs: [versionId], updatedAt: receipt.updatedAt }, { id });
      await updateKnowledgeEntry(id, { 內容: JSON.stringify(variantContent(next)) });
      return { id, revision: 1 };
    } },
  ]);
  const variant = await readTextVariant(r.result.textVariant.id);
  return textVariantBundle(variant);
}
async function saveVersion(body: Body, restored?: LiaojieTextVersion) {
  const id = stringValue(body.variantId, 300, '平台稿 ID', false), op = operationId(body), prior = await priorReceipt(body, 'text_variant_save');
  const rawBefore = parseJson((await readRecord(id, LIAOJIE_TEXT_VARIANT_PREFIX)).內容);
  const before = normalizeVariant(rawBefore, { id });
  if (mutationMatches(rawBefore, body, 'textVariant') || prior?.result.textVersion?.id && before.currentVersionId === prior.result.textVersion.id) return textVariantBundle(before);
  if (prior?.state === 'confirmed' && prior.result.textVariant?.id) return textVariantBundle(await readTextVariant(prior.result.textVariant.id));
  expectRevision(before, body.expectedRevision);
  const incoming = body.draft && typeof body.draft === 'object' && !Array.isArray(body.draft) ? body.draft as Body : {};
  const metadata = restored ? { status: 'draft' as const, scheduledOn: before.scheduledOn, publishedUrl: before.publishedUrl } : validateStatusChange(before, { status: 'draft', scheduledOn: incoming.scheduledOn, publishedUrl: incoming.publishedUrl });
  const { scheduledOn: _scheduledOn, publishedUrl: _publishedUrl, ...copyDraft } = incoming; void _scheduledOn; void _publishedUrl;
  const draft = restored ? parseVariantPatch({ title: restored.title, voiceNote: restored.voiceNote, changeNote: `回復第 ${restored.number} 版並建立新版本`, blocks: restored.blocks }, before.platform) : parseVariantPatch(copyDraft, before.platform);
  const number = before.versionRefs.length + 1;
  const r = await runWeavingOperation(WEAVING_OWNER, op, 'text_variant_save', body, [
    createStep(LIAOJIE_TEXT_VERSION_PREFIX, 'textVersion', receipt => ({ schema: 1, owner: WEAVING_OWNER, variantId: id, platform: before.platform, number, ...draft, createdAt: receipt.createdAt })),
    updateStep(id, LIAOJIE_TEXT_VARIANT_PREFIX, 'textVariant', (row, receipt) => {
      const current = normalizeVariant(parseJson(row.內容), { id }); expectRevision(current, body.expectedRevision);
      return variantContent({ ...current, revision: current.revision + 1, currentVersionId: receipt.result.textVersion.id, versionRefs: [...current.versionRefs, receipt.result.textVersion.id], ...metadata, updatedAt: receipt.updatedAt });
    }),
  ]);
  return textVariantBundle(await readTextVariant(r.result.textVariant.id));
}
export async function saveTextVariant(body: Body) { return saveVersion(body); }
export async function restoreTextVariant(body: Body) {
  const id = stringValue(body.variantId, 300, '平台稿 ID', false), variant = await readTextVariant(id), version = await readTextVersion(stringValue(body.versionId, 300, '歷史版本 ID', false));
  if (!variant.versionRefs.includes(version.id) || version.variantId !== id) throw new WeavingError('歷史版本不屬於此平台稿', 403);
  return saveVersion(body, version);
}
export async function setTextVariantStatus(body: Body) {
  const id = stringValue(body.variantId, 300, '平台稿 ID', false), op = operationId(body), prior = await priorReceipt(body, 'text_variant_status');
  const rawBefore = parseJson((await readRecord(id, LIAOJIE_TEXT_VARIANT_PREFIX)).內容);
  if (mutationMatches(rawBefore, body, 'textVariant')) return textVariantBundle(normalizeVariant(rawBefore, { id }));
  if (prior?.state === 'confirmed' && prior.result.textVariant?.id) return textVariantBundle(await readTextVariant(prior.result.textVariant.id));
  const r = await runWeavingOperation(WEAVING_OWNER, op, 'text_variant_status', body, [updateStep(id, LIAOJIE_TEXT_VARIANT_PREFIX, 'textVariant', async row => {
    const current = normalizeVariant(parseJson(row.內容), { id }); expectRevision(current, body.expectedRevision);
    const status = validateStatusChange(current, { status: body.status, scheduledOn: body.scheduledOn, publishedUrl: body.publishedUrl });
    if (status.status !== 'draft') await assertPublishable(current, body.publicationConfirmed);
    const currentVersion = await readTextVersion(current.currentVersionId);
    parseVariantPatch({ title: currentVersion.title, voiceNote: currentVersion.voiceNote, changeNote: currentVersion.changeNote, blocks: currentVersion.blocks }, current.platform);
    return variantContent({ ...current, ...status, revision: current.revision + 1, updatedAt: new Date().toISOString() });
  })]);
  return textVariantBundle(await readTextVariant(r.result.textVariant.id));
}

export async function handoffTextVariantToPlurk(body: Body) {
  const id = stringValue(body.variantId, 300, '平台稿 ID', false), op = operationId(body);
  const oldReceipt = await priorReceipt(body, 'text_variant_plurk');
  if (oldReceipt?.state === 'confirmed') {
    const variant = await readTextVariant(oldReceipt.result.textVariant.id);
    return { ...(await textVariantBundle(variant)), plurkDraftId: oldReceipt.result.plurkDraft.id };
  }
  const rawBefore = parseJson((await readRecord(id, LIAOJIE_TEXT_VARIANT_PREFIX)).內容);
  if (mutationMatches(rawBefore, body, 'textVariant')) {
    const variant = normalizeVariant(rawBefore, { id });
    if (!variant.plurkDraftId) throw new WeavingError('噗浪草稿交接結果不完整', 409);
    return { ...(await textVariantBundle(variant)), plurkDraftId: variant.plurkDraftId };
  }
  async function currentPlan() {
    const variant = await readTextVariant(id); expectRevision(variant, body.expectedRevision);
    if (variant.platform !== 'plurk') throw new WeavingError('只有噗浪樓層稿能送到噗浪蓋樓');
    if (!['ready', 'scheduled'].includes(variant.status)) throw new WeavingError('請先預覽並將噗浪稿固定為可發布', 409);
    await assertPublishable(variant, body.publicationConfirmed);
    const version = await readTextVersion(variant.currentVersionId);
    const draft = parseVariantPatch({ title: version.title, voiceNote: version.voiceNote, changeNote: version.changeNote, blocks: version.blocks }, 'plurk');
    return { variant, version, main: draft.blocks[0].text, floors: draft.blocks.slice(1).map(block => block.text) };
  }
  async function matchingDrafts() {
    return (await listPlurkDrafts()).flatMap(row => {
      const decoded = decodePlurkContent(row.內容);
      return decoded.meta.sourceVariantId === id || decoded.meta.sourceOperationId === op ? [{ ...row, decoded }] : [];
    });
  }
  const r = await runWeavingOperation(WEAVING_OWNER, op, 'text_variant_plurk', body, [
    { key: 'plurkDraft', async findConfirmed() {
      const plan = await currentPlan();
      const rows = await matchingDrafts();
      if (rows.length > 1) throw new WeavingError('同一平台稿有重複噗浪草稿，請先核對', 409);
      return rows[0]?.decoded.meta.sourceVersionId === plan.version.id ? { id: rows[0].id } : null;
    }, async execute(receipt) {
      const plan = await currentPlan();
      const rows = await matchingDrafts();
      if (rows.length > 1) throw new WeavingError('同一平台稿有重複噗浪草稿，請先核對', 409);
      const old = rows[0];
      const createdAt = new Date().toISOString().slice(0, 10);
      const meta = { method: 'free', tplName: '聊解室平台稿', at: plan.variant.scheduledOn ?? '', status: 'draft' as const, createdAt: old?.decoded.meta.createdAt || createdAt, sourceVariantId: id, sourceVersionId: plan.version.id, sourceOperationId: receipt.operationId };
      const content = encodePlurkContent(meta, plan.main, plan.floors);
      if (old) { await updateKnowledgeEntry(old.id, { 內容: content }); return { id: old.id }; }
      const result = await createKnowledgeEntry({ 標題: plurkDraftTitle(deriveTitle({ main: plan.main }), createdAt), 內容: content }, { retryCreate: false });
      return { id: result.id };
    } },
    updateStep(id, LIAOJIE_TEXT_VARIANT_PREFIX, 'textVariant', (row, receipt) => {
      const current = normalizeVariant(parseJson(row.內容), { id }); expectRevision(current, body.expectedRevision);
      return variantContent({ ...current, revision: current.revision + 1, plurkDraftId: receipt.result.plurkDraft.id, plurkSourceVersionId: current.currentVersionId, updatedAt: receipt.updatedAt });
    }),
  ]);
  const variant = await readTextVariant(r.result.textVariant.id);
  return { ...(await textVariantBundle(variant)), plurkDraftId: r.result.plurkDraft.id };
}
