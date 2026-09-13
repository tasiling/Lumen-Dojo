import "server-only";

import {
  CAPTURE_TITLE_PREFIX,
  captureContent,
  captureRecordTitle,
  normalizeCaptureEntry,
  parseJson,
  type CaptureAttachment,
  type CaptureEntry,
} from "./formal";
import { listJsonRecords, updateJsonRecordById } from "./notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { getKnowledgeEntry } from "@/lib/notion/queries";

export async function listCaptureEntries(): Promise<CaptureEntry[]> {
  const rows = await listJsonRecords(CAPTURE_TITLE_PREFIX);
  return rows
    .map((row) => normalizeCaptureEntry(row.value, { id: row.id }))
    .filter((capture): capture is CaptureEntry => capture !== null)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function getCaptureEntry(id: string): Promise<{ capture: CaptureEntry; title: string }> {
  const row = await getKnowledgeEntry(id);
  if (!row.標題.startsWith(CAPTURE_TITLE_PREFIX)) throw new Error("紀錄類型不符");
  const capture = normalizeCaptureEntry(parseJson(row.內容), { id });
  if (!capture) throw new Error("既有擷取內容無法讀取");
  return { capture, title: row.標題 };
}

export async function createCaptureEntry(input: unknown): Promise<CaptureEntry> {
  const capture = normalizeCaptureEntry(
    {
      ...(input && typeof input === "object" ? input : {}),
      status: "pending",
      processingDepth: "raw",
      creativeMaturity: "C0",
      sourceLocator: "",
      claimRefs: [],
      llmMaterialUse: "disabled",
      contentType: null,
      forageSummary: "",
      forageReason: "",
      knowledgeLinks: [],
      learningTracks: [],
      destinations: [],
      pinned: false,
      fadedAt: null,
      sentToPracticeAt: null,
      sentToWeavingAt: null,
      weaving: {
        outputType: null,
        projectTitle: "",
        status: "ready",
        productionNote: "",
        outputUrl: "",
      },
    },
    { id: "pending", touch: true }
  );
  if (!capture) throw new Error("標題為必填");

  const created = await createKnowledgeEntry({
    標題: captureRecordTitle(crypto.randomUUID()),
    內容: JSON.stringify(captureContent(capture)),
  });
  capture.id = created.id;
  return capture;
}

export async function saveCaptureEntry(capture: CaptureEntry): Promise<CaptureEntry> {
  const current = await getCaptureEntry(capture.id);
  const normalized = normalizeCaptureEntry(capture, {
    id: capture.id,
    capturedAt: current.capture.capturedAt,
    touch: true,
  });
  if (!normalized) throw new Error("擷取內容無法儲存");
  await updateJsonRecordById(normalized.id, CAPTURE_TITLE_PREFIX, current.title, captureContent(normalized));
  return normalized;
}

export async function appendCaptureImage(params: {
  capture: CaptureEntry;
  bytes: ArrayBuffer;
  mimeType: string;
  filename: string;
  sourceMessageId: string;
}): Promise<CaptureEntry> {
  if (!params.mimeType.startsWith("image/")) throw new Error("LINE 傳入的檔案不是圖片");
  if (params.bytes.byteLength > 20 * 1024 * 1024) throw new Error("截圖超過 20 MB，暫時無法保存");

  const upload = await withNotionRateLimit(() => notion().fileUploads.create({
    mode: "single_part",
    filename: params.filename,
    content_type: params.mimeType,
  }));
  await withNotionRateLimit(() => notion().fileUploads.send({
    file_upload_id: upload.id,
    file: {
      filename: params.filename,
      data: new Blob([params.bytes], { type: params.mimeType }),
    },
  }));

  const response = await withNotionRateLimit(() => notion().blocks.children.append({
    block_id: params.capture.id,
    children: [{
      object: "block",
      type: "image",
      image: {
        type: "file_upload",
        file_upload: { id: upload.id },
        caption: [{ type: "text", text: { content: "LINE 剪藏原始截圖" } }],
      },
    }],
  }));
  const block = response.results[0];
  if (!block) throw new Error("截圖沒有成功附加到擷取紀錄");

  const attachment: CaptureAttachment = {
    id: crypto.randomUUID(),
    kind: "image",
    storage: "notion",
    blockId: block.id,
    filename: params.filename,
    mimeType: params.mimeType,
    sourceMessageId: params.sourceMessageId,
    createdAt: new Date().toISOString(),
  };
  return saveCaptureEntry({
    ...params.capture,
    clip: {
      ...params.capture.clip,
      sourceKind: params.capture.sourceUrl ? "webpage" : "screenshot",
      externalMessageId: params.sourceMessageId,
      awaitingScreenshotUntil: null,
      attachments: [...params.capture.clip.attachments, attachment],
    },
  });
}

export async function captureImageUrl(captureId: string, blockId: string): Promise<string> {
  const { capture } = await getCaptureEntry(captureId);
  if (!capture.clip.attachments.some((attachment) => attachment.blockId === blockId)) {
    throw new Error("圖片不屬於這筆擷取");
  }
  const block = await withNotionRateLimit(() => notion().blocks.retrieve({ block_id: blockId }));
  if (!("type" in block) || block.type !== "image" || !("image" in block)) throw new Error("找不到截圖");
  const image = block.image;
  if (image.type !== "file" || !image.file?.url) throw new Error("截圖網址尚未可用");
  return image.file.url;
}
