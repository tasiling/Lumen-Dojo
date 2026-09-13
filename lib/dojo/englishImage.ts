export const ENGLISH_IMAGE_TITLE_PREFIX = "行光英文影像-";

export type EnglishImageRoute = "pending" | "game" | "daily";
export type EnglishImageStatus = "inbox" | "organized";
export type EnglishImageAnalysisStatus = "idle" | "processing" | "completed" | "needs-review" | "failed";
export type EnglishImageConfidence = "high" | "medium" | "low" | null;

export type EnglishImageAttachment = {
  blockId: string;
  filename: string;
  mimeType: string;
  sourceMessageId: string;
  createdAt: string;
};

export type EnglishImageEntry = {
  version: 1;
  recordType: "english-image-entry";
  id: string;
  route: EnglishImageRoute;
  status: EnglishImageStatus;
  title: string;
  sourceLabel: string;
  contextNote: string;
  ocrText: string;
  englishRecord: string;
  chineseExplanation: string;
  learningPhrases: string;
  externalEventId: string;
  externalMessageId: string;
  awaitingContextUntil: string | null;
  attachment: EnglishImageAttachment;
  analysisStatus: EnglishImageAnalysisStatus;
  analysisConfidence: EnglishImageConfidence;
  analysisError: string;
  analysisReviewReason: string;
  analysisAttempts: number;
  analyzedAt: string | null;
  analysisModel: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  capturedAt: string;
  updatedAt: string;
};

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function iso(value: unknown, fallback: string): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

export function englishImageRecordTitle(nonce: string): string {
  return `${ENGLISH_IMAGE_TITLE_PREFIX}${nonce}`;
}

export function normalizeEnglishImageEntry(
  value: unknown,
  params: { id: string; capturedAt?: string; touch?: boolean }
): EnglishImageEntry | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<EnglishImageEntry>;
  const attachmentSource = source.attachment && typeof source.attachment === "object"
    ? source.attachment as Partial<EnglishImageAttachment>
    : {};
  const blockId = text(attachmentSource.blockId, 100);
  if (!blockId) return null;
  const now = new Date().toISOString();
  const capturedAt = iso(source.capturedAt, params.capturedAt ?? now);
  const route: EnglishImageRoute = source.route === "game" || source.route === "daily" ? source.route : "pending";
  const analysisStatus: EnglishImageAnalysisStatus =
    source.analysisStatus === "processing" || source.analysisStatus === "completed" ||
    source.analysisStatus === "needs-review" || source.analysisStatus === "failed"
      ? source.analysisStatus
      : "idle";
  const confidence: EnglishImageConfidence =
    source.analysisConfidence === "high" || source.analysisConfidence === "medium" || source.analysisConfidence === "low"
      ? source.analysisConfidence
      : null;
  return {
    version: 1,
    recordType: "english-image-entry",
    id: params.id,
    route,
    status: source.status === "organized" ? "organized" : "inbox",
    title: text(source.title, 300) || (route === "game" ? "遊戲英文" : route === "daily" ? "英文日常" : "待分類英文影像"),
    sourceLabel: text(source.sourceLabel, 300),
    contextNote: text(source.contextNote, 8000),
    ocrText: text(source.ocrText, 30000),
    englishRecord: text(source.englishRecord, 12000),
    chineseExplanation: text(source.chineseExplanation, 12000),
    learningPhrases: text(source.learningPhrases, 12000),
    externalEventId: text(source.externalEventId, 200),
    externalMessageId: text(source.externalMessageId, 200),
    awaitingContextUntil: source.awaitingContextUntil ? iso(source.awaitingContextUntil, now) : null,
    attachment: {
      blockId,
      filename: text(attachmentSource.filename, 300) || "line-image.jpg",
      mimeType: text(attachmentSource.mimeType, 100) || "image/jpeg",
      sourceMessageId: text(attachmentSource.sourceMessageId, 200),
      createdAt: iso(attachmentSource.createdAt, capturedAt),
    },
    analysisStatus,
    analysisConfidence: confidence,
    analysisError: text(source.analysisError, 3000),
    analysisReviewReason: text(source.analysisReviewReason, 3000),
    analysisAttempts: Number.isFinite(source.analysisAttempts) ? Math.max(0, Math.floor(Number(source.analysisAttempts))) : 0,
    analyzedAt: source.analyzedAt ? iso(source.analyzedAt, now) : null,
    analysisModel: text(source.analysisModel, 100),
    inputTokens: Number.isFinite(source.inputTokens) ? Math.max(0, Math.floor(Number(source.inputTokens))) : 0,
    outputTokens: Number.isFinite(source.outputTokens) ? Math.max(0, Math.floor(Number(source.outputTokens))) : 0,
    estimatedCostUsd: Number.isFinite(source.estimatedCostUsd) ? Math.max(0, Number(source.estimatedCostUsd)) : 0,
    capturedAt,
    updatedAt: params.touch ? now : iso(source.updatedAt, capturedAt),
  };
}

export function englishImageContent(entry: EnglishImageEntry): Omit<EnglishImageEntry, "id"> {
  const { id: _id, ...content } = entry;
  void _id;
  return content;
}
