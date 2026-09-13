import "server-only";

import { createKnowledgeEntry, updateKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry } from "@/lib/notion/queries";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { captureContent, captureRecordTitle, normalizeCaptureEntry } from "./formal";
import {
  ENGLISH_IMAGE_TITLE_PREFIX,
  englishImageContent,
  englishImageRecordTitle,
  normalizeEnglishImageEntry,
  type EnglishImageEntry,
  type EnglishImageRoute,
} from "./englishImage";
import { listJsonRecords, updateJsonRecordById } from "./notionStore";

export async function listEnglishImageEntries(): Promise<EnglishImageEntry[]> {
  const rows = await listJsonRecords(ENGLISH_IMAGE_TITLE_PREFIX);
  return rows.flatMap((row) => {
    const entry = normalizeEnglishImageEntry(row.value, { id: row.id });
    return entry ? [entry] : [];
  }).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function getEnglishImageEntry(id: string): Promise<{ entry: EnglishImageEntry; title: string }> {
  const row = await getKnowledgeEntry(id);
  if (!row.標題.startsWith(ENGLISH_IMAGE_TITLE_PREFIX)) throw new Error("紀錄類型不符");
  let value: unknown;
  try { value = JSON.parse(row.內容); } catch { value = null; }
  const entry = normalizeEnglishImageEntry(value, { id });
  if (!entry) throw new Error("英文影像紀錄無法讀取");
  return { entry, title: row.標題 };
}

export async function saveEnglishImageEntry(entry: EnglishImageEntry): Promise<EnglishImageEntry> {
  const current = await getEnglishImageEntry(entry.id);
  const normalized = normalizeEnglishImageEntry(entry, { id: entry.id, capturedAt: current.entry.capturedAt, touch: true });
  if (!normalized) throw new Error("英文影像紀錄無法儲存");
  await updateJsonRecordById(normalized.id, ENGLISH_IMAGE_TITLE_PREFIX, current.title, englishImageContent(normalized));
  return normalized;
}

export async function createEnglishImageEntry(params: {
  bytes: ArrayBuffer;
  mimeType: string;
  filename: string;
  sourceMessageId: string;
  externalEventId: string;
}): Promise<EnglishImageEntry> {
  if (!params.mimeType.startsWith("image/")) throw new Error("LINE 傳入的檔案不是圖片");
  if (params.bytes.byteLength > 20 * 1024 * 1024) throw new Error("圖片超過 20 MB，暫時無法保存");
  const now = new Date().toISOString();
  const seed = normalizeEnglishImageEntry({
    title: "待分類英文影像",
    externalEventId: params.externalEventId,
    externalMessageId: params.sourceMessageId,
    capturedAt: now,
    updatedAt: now,
    attachment: { blockId: "pending", filename: params.filename, mimeType: params.mimeType, sourceMessageId: params.sourceMessageId, createdAt: now },
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
  const entry = { ...seed, id: created.id, attachment: { ...seed.attachment, blockId: block.id } };
  return saveEnglishImageEntry(entry);
}

export async function routeEnglishImage(entry: EnglishImageEntry, route: Exclude<EnglishImageRoute, "pending">): Promise<EnglishImageEntry> {
  return saveEnglishImageEntry({
    ...entry,
    route,
    title: route === "game" ? "遊戲英文" : "英文日常",
    awaitingContextUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
}

export async function englishImageUrl(entry: EnglishImageEntry): Promise<string> {
  const block = await withNotionRateLimit(() => notion().blocks.retrieve({ block_id: entry.attachment.blockId }));
  if (!("type" in block) || block.type !== "image" || !("image" in block)) throw new Error("找不到英文影像");
  if (block.image.type !== "file" || !block.image.file?.url) throw new Error("英文影像網址尚未可用");
  return block.image.file.url;
}

export async function englishImageBytes(entry: EnglishImageEntry): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const url = await englishImageUrl(entry);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`英文影像讀取失敗（${response.status}）`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("圖片超過 20 MB，暫時無法分析");
  return { bytes, mimeType: (response.headers.get("content-type") ?? entry.attachment.mimeType).split(";")[0] };
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
      attachments: [{ id: crypto.randomUUID(), kind: "image", storage: "notion", ...entry.attachment }],
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
