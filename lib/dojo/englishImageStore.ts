import "server-only";
import { createHash } from "node:crypto";

import { createKnowledgeEntry, updateKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry } from "@/lib/notion/queries";
import { notion, notionWithoutRetries, withNotionRateLimit } from "@/lib/notion/client";
import { captureContent, captureRecordTitle, normalizeCaptureEntry } from "./formal";
import {
  ENGLISH_IMAGE_TITLE_PREFIX,
  englishImageContent,
  englishImageRouteLabel,
  englishImageRecordTitle,
  normalizeEnglishImageEntry,
  withEnglishImageStatus,
  type EnglishImageEntry,
  type GameLearningMode,
  type EnglishImageRoute,
  type EnglishImageStatus,
} from "./englishImage";
import { listJsonRecords, updateJsonRecordById } from "./notionStore";
import { withIntegrationMutationLease } from "./integrationMutationLease";

async function firstImageBlockId(pageId: string, caption?: string): Promise<string | null> {
  let cursor: string | undefined;
  do {
    const response = await withNotionRateLimit(() => notion().blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 }));
    const image = response.results.find((block) => "type" in block && block.type === "image" &&
      (!caption || block.image.caption?.some(part => part.plain_text === caption)));
    if (image) return image.id;
    cursor = response.has_more && response.next_cursor ? response.next_cursor : undefined;
  } while (cursor);
  return null;
}

async function uploadLineImage(params: { filename: string; mimeType: string; bytes: ArrayBuffer; sourceMessageId: string }) {
  const upload = await withNotionRateLimit(() => notion().fileUploads.create({ mode: "single_part", filename: params.filename, content_type: params.mimeType }));
  await withNotionRateLimit(() => notion().fileUploads.send({
    file_upload_id: upload.id,
    file: { filename: params.filename, data: new Blob([params.bytes], { type: params.mimeType }) },
  }));
  return {
    object: "block" as const,
    type: "image" as const,
    image: {
      type: "file_upload" as const,
      file_upload: { id: upload.id },
      caption: [{ type: "text" as const, text: { content: imageCaption(params.sourceMessageId) } }],
    },
  };
}

function imageCaption(messageId: string) {
  return "LINE 英文影像原圖 · " + createHash("sha256").update(messageId).digest("hex").slice(0, 24);
}

async function repairPendingAttachments(entry: EnglishImageEntry): Promise<EnglishImageEntry> {
  if (!entry.attachments.some((attachment) => attachment.blockId === "pending")) return entry;
  const rows = await listJsonRecords(ENGLISH_IMAGE_TITLE_PREFIX);
  const mergedChildren = rows.flatMap((row) => {
    const child = normalizeEnglishImageEntry(row.value, { id: row.id });
    return child?.mergedIntoId === entry.id ? [child] : [];
  }).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const owners = [entry, ...mergedChildren];
  const recovered = await Promise.all(owners.map(async (owner) => {
    const blockId = await firstImageBlockId(owner.id);
    return blockId ? { ...owner.attachment, blockId } : null;
  }));
  const attachments = entry.attachments.map(attachment => {
    if (attachment.blockId !== "pending") return attachment;
    const found = recovered.find(item => item && (attachment.sourceMessageId
      ? item.sourceMessageId === attachment.sourceMessageId
      : item.id === attachment.id));
    if (!found) throw new Error("尚未找到這組素材的所有原圖，請稍後再試");
    return { ...attachment, blockId: found.blockId };
  });
  for (const item of recovered) {
    if (item && !attachments.some(a => a.blockId === item.blockId)) attachments.push(item);
  }
  if (!attachments.length) throw new Error("原圖仍在，但暫時找不到 Notion 圖片區塊；請稍後再試");
  // Resolve historical blocks for readers. Only a writer holding the entry
  // lease may persist metadata or advance the revision used by other writers.
  const repaired = normalizeEnglishImageEntry({ ...entry, attachment: attachments[0], attachments }, { id: entry.id, capturedAt: entry.capturedAt });
  if (!repaired) throw new Error("英文影像紀錄自動修復失敗");
  return repaired;
}

export async function listEnglishImageEntries(options: { includeMerged?: boolean; includeReadingClips?: boolean } = {}): Promise<EnglishImageEntry[]> {
  const rows = await listJsonRecords(ENGLISH_IMAGE_TITLE_PREFIX);
  return rows.flatMap((row) => {
    const entry = normalizeEnglishImageEntry(row.value, { id: row.id });
    return entry ? [entry] : [];
  }).filter((entry) => (options.includeMerged || !entry.mergedIntoId) && (options.includeReadingClips || !entry.readingClip)).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

async function readEnglishImageRow(id: string): Promise<{ entry: EnglishImageEntry; title: string }> {
  const row = await getKnowledgeEntry(id);
  if (!row.標題.startsWith(ENGLISH_IMAGE_TITLE_PREFIX)) throw new Error("紀錄類型不符");
  let value: unknown;
  try { value = JSON.parse(row.內容); } catch { value = null; }
  const entry = normalizeEnglishImageEntry(value, { id });
  if (!entry) throw new Error("英文影像紀錄無法讀取");
  return { entry, title: row.標題 };
}

export async function getEnglishImageEntry(id: string): Promise<{ entry: EnglishImageEntry; title: string }> {
  const row = await readEnglishImageRow(id);
  return { title: row.title, entry: await repairPendingAttachments(row.entry) };
}

export async function saveEnglishImageEntry(entry: EnglishImageEntry): Promise<EnglishImageEntry> {
  return withIntegrationMutationLease(`english-image:${entry.id}`, async (guard) => {
    const current = await readEnglishImageRow(entry.id);
    if (entry.updatedAt && current.entry.updatedAt && entry.updatedAt !== current.entry.updatedAt)
      throw new Error("英文影像已由另一個流程更新，請重新讀取後再儲存");
    const resolved = await repairPendingAttachments(entry);
    const normalized = normalizeEnglishImageEntry(resolved, { id: entry.id, capturedAt: current.entry.capturedAt, touch: true });
    if (!normalized) throw new Error("英文影像紀錄無法儲存");
    await guard.assertCurrent();
    await updateJsonRecordById(normalized.id, ENGLISH_IMAGE_TITLE_PREFIX, current.title, englishImageContent(normalized));
    return normalized;
  });
}

export async function updateEnglishImageEntry(
  id: string,
  update: (current: EnglishImageEntry) => Partial<EnglishImageEntry> | Promise<Partial<EnglishImageEntry>>
): Promise<EnglishImageEntry> {
  return withIntegrationMutationLease(`english-image:${id}`, async (guard) => {
    const current = await getEnglishImageEntry(id);
    const changes = await update(current.entry);
    if (!Object.keys(changes).length) return current.entry;
    const normalized = normalizeEnglishImageEntry({ ...current.entry, ...changes }, { id, capturedAt: current.entry.capturedAt, touch: true });
    if (!normalized) throw new Error("英文影像紀錄無法儲存");
    await guard.assertCurrent();
    await updateJsonRecordById(normalized.id, ENGLISH_IMAGE_TITLE_PREFIX, current.title, englishImageContent(normalized));
    return normalized;
  });
}

export async function updateEnglishImageStatus(id: string, status: EnglishImageStatus): Promise<EnglishImageEntry> {
  return updateEnglishImageEntry(id, (current) => withEnglishImageStatus(current, status));
}

export async function createEnglishImageEntry(params: {
  bytes: ArrayBuffer;
  mimeType: string;
  filename: string;
  sourceMessageId: string;
  externalEventId: string;
  batchIndex?: number | null;
  lineImageSetId?: string;
  lineImageSetTotal?: number;
  lineBatchState?: "open" | "closed";
  lineBatchUntil?: string | null;
}): Promise<EnglishImageEntry> {
  if (!params.mimeType.startsWith("image/")) throw new Error("LINE 傳入的檔案不是圖片");
  if (params.bytes.byteLength > 20 * 1024 * 1024) throw new Error("圖片超過 20 MB，暫時無法保存");
  const now = new Date().toISOString();
  const seed = normalizeEnglishImageEntry({
    title: "待分類英文影像",
    externalEventId: params.externalEventId,
    externalMessageId: params.sourceMessageId,
    lineImageSetId: params.lineImageSetId ?? "",
    lineImageSetTotal: params.lineImageSetTotal ?? 0,
    lineBatchState: params.lineBatchState ?? "closed",
    lineBatchUntil: params.lineBatchUntil ?? null,
    capturedAt: now,
    updatedAt: now,
    attachment: { id: params.sourceMessageId || "pending", blockId: "pending", filename: params.filename, mimeType: params.mimeType, sourceMessageId: params.sourceMessageId, createdAt: now, batchIndex: params.batchIndex ?? null },
  }, { id: "pending" });
  if (!seed) throw new Error("無法建立英文影像紀錄");
  const image = await uploadLineImage(params);
  // Create the page together with its image. Even a lost response leaves
  // one recoverable source message and original on the same page.
  const title = englishImageRecordTitle(crypto.randomUUID());
  const created = await createKnowledgeEntry({ 標題: title, 內容: JSON.stringify(englishImageContent(seed)) }, {
    retryCreate: false,
    children: [image],
  });
  const blockId = await firstImageBlockId(created.id, imageCaption(params.sourceMessageId));
  if (!blockId) throw new Error("尚未取得已上傳的圖片區塊；請從最近一筆核對");
  const attachment = { ...seed.attachment, id: blockId, blockId };
  return saveEnglishImageEntry({ ...seed, id: created.id, attachment, attachments: [attachment] });
}

export async function appendEnglishImageAttachment(params: {
  entry: EnglishImageEntry;
  bytes: ArrayBuffer;
  mimeType: string;
  filename: string;
  sourceMessageId: string;
  batchIndex?: number | null;
}): Promise<EnglishImageEntry> {
  if (!params.mimeType.startsWith("image/")) throw new Error("LINE 傳入的檔案不是圖片");
  if (params.bytes.byteLength > 20 * 1024 * 1024) throw new Error("圖片超過 20 MB，暫時無法保存");
  if (params.entry.attachments.some((item) => item.sourceMessageId === params.sourceMessageId)) return params.entry;
  return updateEnglishImageEntry(params.entry.id, async (current) => {
    if (current.attachments.some((item) => item.sourceMessageId === params.sourceMessageId)) return {};
    // The block might already exist after a timeout between binary attachment
    // and metadata persistence. Bind it to its message before creating another.
    let blockId = await firstImageBlockId(current.id, imageCaption(params.sourceMessageId));
    if (!blockId) {
      const image = await uploadLineImage(params);
      const response = await withNotionRateLimit(() => notionWithoutRetries().blocks.children.append({
        block_id: current.id, children: [image],
      }), { retry: false });
      blockId = response.results[0]?.id || null;
    }
    if (!blockId) throw new Error("圖片沒有成功附加到英文影像紀錄");
    const attachment: EnglishImageEntry["attachment"] = {
      id: blockId, blockId, filename: params.filename, mimeType: params.mimeType,
      sourceMessageId: params.sourceMessageId, createdAt: new Date().toISOString(), batchIndex: params.batchIndex ?? null,
    };
    const attachments = [...current.attachments, attachment]
      .map((item, originalIndex) => ({ item, originalIndex }))
      .sort((a, b) => {
        if (a.item.batchIndex === null && b.item.batchIndex === null) return a.originalIndex - b.originalIndex;
        if (a.item.batchIndex === null) return 1;
        if (b.item.batchIndex === null) return -1;
        return a.item.batchIndex - b.item.batchIndex || a.originalIndex - b.originalIndex;
      })
      .map(({ item }) => item);
    return {
      attachment: attachments[0], attachments,
      analysisStatus: current.analysisAttempts ? "idle" : current.analysisStatus,
      analysisReviewReason: current.analysisAttempts ? "圖片組已更新，請重新分析完整情境。" : current.analysisReviewReason,
    };
  });
}

export async function routeEnglishImage(
  entry: EnglishImageEntry, route: Exclude<EnglishImageRoute, "pending">, gameLearningMode: GameLearningMode = "auto",
): Promise<EnglishImageEntry> {
  const newGameLesson = route === "game" &&
    ((entry.gameLearningMode ?? "auto") !== gameLearningMode || (!entry.gameLearning && !entry.gameLearningMode));
  const needsAnalysis = entry.route !== route || newGameLesson;
  if (route === "game" && !needsAnalysis && entry.lineBatchState === "closed") return entry;
  return saveEnglishImageEntry({
    ...entry,
    route,
    ...(route === "game" ? { gameLearningMode } : {}),
    ...(needsAnalysis ? {
      analysisStatus: "idle", gameLearning: null, gameLearningSourceIds: [],
      analysisReviewReason: "", analysisError: "",
    } : {}),
    lineBatchState: "closed",
    lineBatchUntil: null,
    title: needsAnalysis ? englishImageRouteLabel(route) : entry.title,
    awaitingContextUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
}

export async function undoLatestEnglishImageMerge(parent: EnglishImageEntry): Promise<{ parent: EnglishImageEntry; restored: EnglishImageEntry }> {
  const entries = await listEnglishImageEntries({ includeMerged: true });
  const child = entries
    .filter((entry) => entry.mergedIntoId === parent.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!child) throw new Error("這筆素材沒有可撤銷的舊式合併紀錄");
  const childMessageIds = new Set(child.attachments.map((item) => item.sourceMessageId));
  const attachments = parent.attachments.filter((item) => !childMessageIds.has(item.sourceMessageId));
  if (!attachments.length) throw new Error("無法撤銷：主素材缺少原始圖片");
  const restoredParent = await saveEnglishImageEntry({
    ...parent,
    attachment: attachments[0],
    attachments,
    analysisStatus: parent.analysisAttempts ? "idle" : parent.analysisStatus,
    analysisReviewReason: parent.analysisAttempts ? "已撤銷誤合併，請重新分析正確圖片。" : parent.analysisReviewReason,
  });
  const restored = await saveEnglishImageEntry({
    ...child,
    mergedIntoId: "",
    status: "inbox",
    lineBatchState: "closed",
    lineBatchUntil: null,
  });
  return { parent: restoredParent, restored };
}

export async function englishImageUrl(entry: EnglishImageEntry): Promise<string> {
  return englishImageAttachmentUrl(entry.attachment);
}

export async function englishImageAttachmentUrl(attachment: EnglishImageEntry["attachment"]): Promise<string> {
  const block = await withNotionRateLimit(() => notion().blocks.retrieve({ block_id: attachment.blockId }));
  if (!("type" in block) || block.type !== "image" || !("image" in block)) throw new Error("找不到英文影像");
  if (block.image.type !== "file" || !block.image.file?.url) throw new Error("英文影像網址尚未可用");
  return block.image.file.url;
}

export async function englishImageBytes(entry: EnglishImageEntry): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  return englishImageAttachmentBytes(entry.attachment);
}

export async function englishImageAttachmentBytes(attachment: EnglishImageEntry["attachment"]): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const url = await englishImageAttachmentUrl(attachment);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`英文影像讀取失敗（${response.status}）`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("圖片超過 20 MB，暫時無法分析");
  return { bytes, mimeType: (response.headers.get("content-type") ?? attachment.mimeType).split(";")[0] };
}

export async function moveEnglishImageToCapture(entry: EnglishImageEntry) {
  const capture = normalizeCaptureEntry({
    title: entry.title || "LINE 截圖",
    category: null,
    excerpt: entry.ocrText,
    sourceUrl: "",
    note: entry.contextNote,
    clip: {
      origin: "line", purpose: "saveFirst", sourceKind: "screenshot", platform: "LINE 截圖",
      externalEventId: entry.externalEventId, externalMessageId: entry.externalMessageId,
      awaitingScreenshotUntil: null, awaitingReflectionUntil: null, webPreview: { description: "", imageUrl: "", fetchedAt: null, status: "none" },
      attachments: entry.attachments.map((attachment) => ({ ...attachment, id: crypto.randomUUID(), kind: "image" as const, storage: "notion" as const })),
    },
  }, { id: entry.id, capturedAt: entry.capturedAt, touch: true });
  if (!capture) throw new Error("無法轉成一般剪藏");
  await updateKnowledgeEntry(entry.id, { 標題: captureRecordTitle(crypto.randomUUID()), 內容: JSON.stringify(captureContent(capture)) });
  return capture;
}

export { currentMonthEstimatedSpend } from "./englishImage";
