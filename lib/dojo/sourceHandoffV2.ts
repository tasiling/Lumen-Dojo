import { createHash } from "node:crypto";
import type { EnglishImageEntry } from "./englishImage";

export const SOURCE_HANDOFF_V2 = "context-room-source-handoff/v2" as const;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function calculateRequestFingerprint(body: Record<string, unknown>): string {
  const payload = { ...body };
  delete payload.requestFingerprint;
  return sha256(stableJson(payload));
}

export function sourceContent(entry: EnglishImageEntry) {
  return {
    source: {
      system: "lumen-dojo",
      recordId: entry.id,
      type: entry.route === "game" ? "game_image" : entry.route === "classroom" ? "classroom_image" : entry.route === "reading" ? "reading_image" : "daily_image",
      title: entry.title,
      sourceLabel: entry.sourceLabel,
      groupId: entry.lineImageSetId,
      attachments: entry.attachments.map((attachment, index) => ({
        attachmentId: attachment.id || attachment.blockId,
        sourceRecordId: entry.id,
        notionBlockId: attachment.blockId,
        lineSourceMessageId: attachment.sourceMessageId,
        position: index + 1,
        batchIndex: attachment.batchIndex,
        mimeType: attachment.mimeType,
      })),
    },
    content: {
      englishOriginal: entry.ocrText,
      englishRecord: entry.englishRecord,
      chineseUnderstanding: entry.chineseExplanation,
      contextNote: entry.contextNote,
      uncertaintyNote: entry.analysisReviewReason,
    },
  };
}

export function calculateSourceContentFingerprint(entry: EnglishImageEntry): string {
  return sha256(stableJson(sourceContent(entry)));
}

export function nextSourceRevision(entry: EnglishImageEntry, fingerprint: string): number {
  if (entry.contextRoomContentFingerprint === fingerprint && entry.contextRoomSourceRevision > 0)
    return entry.contextRoomSourceRevision;
  return Math.max(1, entry.contextRoomSourceRevision + 1);
}
