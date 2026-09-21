import "server-only";

import { createKnowledgeEntry, updateKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry } from "@/lib/notion/queries";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { captureContent, captureRecordTitle, normalizeCaptureEntry } from "./formal";
import {
  ENGLISH_IMAGE_TITLE_PREFIX,
  englishImageContent,
  englishImageRouteLabel,
  englishImageRecordTitle,
  normalizeEnglishImageEntry,
  withEnglishImageStatus,
  type EnglishImageEntry,
  type EnglishImageRoute,
  type EnglishImageStatus,
} from "./englishImage";
import { listJsonRecords, updateJsonRecordById } from "./notionStore";

async function firstImageBlockId(pageId: string): Promise<string | null> {
  let cursor: string | undefined;
  do {
    const response = await withNotionRateLimit(() => notion().blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 }));
    const image = response.results.find((block) => "type" in block && block.type === "image");
    if (image) return image.id;
    cursor = response.has_more && response.next_cursor ? response.next_cursor : undefined;
  } while (cursor);
  return null;
}

async function repairPendingAttachments(entry: EnglishImageEntry, title: string): Promise<EnglishImageEntry> {
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
  const attachments = recovered.filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment));
  if (!attachments.length) throw new Error("原圖仍在，但暫時找不到 Notion 圖片區塊；請稍後再試");
  const repaired = normalizeEnglishImageEntry({ ...entry, attachment: attachments[0], attachments }, { id: entry.id, capturedAt: entry.capturedAt, touch: true });
  if (!repaired) throw new Error("英文影像紀錄自動修復失敗");
  await updateKnowledgeEntry(entry.id, { 標題: title, 內容: JSON.stringify(englishImageContent(repaired)) });
  return repaired;
}

export async function listEnglishImageEntries(options: { includeMerged?: boolean } = {}): Promise<EnglishImageEntry[]> {
  const rows = await listJsonRecords(ENGLISH_IMAGE_TITLE_PREFIX);
  return rows.flatMap((row) => {
    const entry = normalizeEnglishImageEntry(row.value, { id: row.id });
    return entry ? [entry] : [];
  }).filter((entry) => options.includeMerged || !entry.mergedIntoId).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function getEnglishImageEntry(id: string): Promise<{ entry: EnglishImageEntry; title: string }> {
  const row = await getKnowledgeEntry(id);
  if (!row.標題.startsWith(ENGLISH_IMAGE_TITLE_PREFIX)) throw new Error("紀錄類型不符");
  let value: unknown;
  try { value = JSON.parse(row.內容); } catch { value = null; }
  let entry = normalizeEnglishImageEntry(value, { id });
  if (!entry) throw new Error("英文影像紀錄無法讀取");
  entry = await repairPendingAttachments(entry, row.標題);
  return { entry, title: row.標題 };
}

export async function saveEnglishImageEntry(entry: EnglishImageEntry): Promise<EnglishImageEntry> {
  const current = await getEnglishImageEntry(entry.id);
  const normalized = normalizeEnglishImageEntry(entry, { id: entry.id, capturedAt: current.entry.capturedAt, touch: true });
  if (!normalized) throw new Error("英文影像紀錄無法儲存");
  await updateJsonRecordById(normalized.id, ENGLISH_IMAGE_TITLE_PREFIX, current.title, englishImageContent(normalized));
  return normalized;
}

export async function updateEnglishImageEntry(
  id: string,
  update: (current: EnglishImageEntry) => Partial<EnglishImageEntry>
): Promise<EnglishImageEntry> {
  const current = await getEnglishImageEntry(id);
  const normalized = normalizeEnglishImageEntry(
    { ...current.entry, ...update(current.entry) },
    { id, capturedAt: current.entry.capturedAt, touch: true }
  );
  if (!normalized) throw new Error("英文影像紀錄無法儲存");
  await updateJsonRecordById(normalized.id, ENGLISH_IMAGE_TITLE_PREFIX, current.title, englishImageContent(normalized));
  return normalized;
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
    attachment: { blockId: "pending", filename: params.filename, mimeType: params.mimeType, sourceMessageId: params.sourceMessageId, createdAt: now, batchIndex: params.batchIndex ?? null },
  }, { id: "pending" });
  if (!seed) throw new Error("無法建立英文影像紀錄");
  const created = await createKnowledgeEntry({ 標題: englishImageRecordTitle(crypto.randomUUID()), 內容: JSON.stringify(englishImageContent(seed)) });

  const upload = await withNotionRateLimit(() => notion().fileUploads.create({ mode: "single_part", filename: params.filename, content_type: params.mimeType }));
  await withNotionRateLimit(() => notion().fileUploads.send({
    file_upload_id: upload.id,
    file: { filename: params.filename, data: new Blob([params.bytes], { type: params.mimeType }) },
  }));
  const response = await withNotionRateLimit(() => notion().blocks.children.append({
    block_id: created.id,
    children: [{ object: "block", type: "image", image: { type: "file_upload", file_upload: { id: upload.id }, caption: [{ type: "text", text: { content: "LINE 英文影像原圖" } }] } }],
  }));
  const block = response.results[0];
  if (!block) throw new Error("圖片沒有成功附加到英文影像紀錄");
  const attachment = { ...seed.attachment, blockId: block.id };
  const entry = { ...seed, id: created.id, attachment, attachments: [attachment] };
  return saveEnglishImageEntry(entry);
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
  const now = new Date().toISOString();
  const upload = await withNotionRateLimit(() => notion().fileUploads.create({ mode: "single_part", filename: params.filename, content_type: params.mimeType }));
  await withNotionRateLimit(() => notion().fileUploads.send({
    file_upload_id: upload.id,
    file: { filename: params.filename, data: new Blob([params.bytes], { type: params.mimeType }) },
  }));
  const response = await withNotionRateLimit(() => notion().blocks.children.append({
    block_id: params.entry.id,
    children: [{ object: "block", type: "image", image: { type: "file_upload", file_upload: { id: upload.id }, caption: [{ type: "text", text: { content: "LINE 英文影像原圖" } }] } }],
  }));
  const block = response.results[0];
  if (!block) throw new Error("圖片沒有成功附加到英文影像紀錄");
  const attachment: EnglishImageEntry["attachment"] = {
    blockId: block.id,
    filename: params.filename,
    mimeType: params.mimeType,
    sourceMessageId: params.sourceMessageId,
    createdAt: now,
    batchIndex: params.batchIndex ?? null,
  };
  const attachments = [...params.entry.attachments, attachment]
    .sort((a, b) => (a.batchIndex ?? Number.MAX_SAFE_INTEGER) - (b.batchIndex ?? Number.MAX_SAFE_INTEGER));
  return saveEnglishImageEntry({
    ...params.entry,
    attachment: attachments[0],
    attachments,
    analysisStatus: params.entry.analysisAttempts ? "idle" : params.entry.analysisStatus,
    analysisReviewReason: params.entry.analysisAttempts ? "圖片組已更新，請重新分析完整情境。" : params.entry.analysisReviewReason,
  });
}

export async function routeEnglishImage(entry: EnglishImageEntry, route: Exclude<EnglishImageRoute, "pending">): Promise<EnglishImageEntry> {
  return saveEnglishImageEntry({
    ...entry,
    route,
    lineBatchState: "closed",
    lineBatchUntil: null,
    title: englishImageRouteLabel(route),
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
      awaitingScreenshotUntil: null, webPreview: { description: "", imageUrl: "", fetchedAt: null, status: "none" },
      attachments: entry.attachments.map((attachment) => ({ id: crypto.randomUUID(), kind: "image" as const, storage: "notion" as const, ...attachment })),
    },
  }, { id: entry.id, capturedAt: entry.capturedAt, touch: true });
  if (!capture) throw new Error("無法轉成一般剪藏");
  await updateKnowledgeEntry(entry.id, { 標題: captureRecordTitle(crypto.randomUUID()), 內容: JSON.stringify(captureContent(capture)) });
  return capture;
}

export function currentMonthEstimatedSpend(entries: EnglishImageEntry[], now = new Date()): number {
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  return entries.reduce((sum, entry) => {
    if (!entry.analyzedAt) return sum;
    const analyzedMonth = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
    }).format(new Date(entry.analyzedAt));
    return analyzedMonth === month ? sum + entry.estimatedCostUsd : sum;
  }, 0);
}
