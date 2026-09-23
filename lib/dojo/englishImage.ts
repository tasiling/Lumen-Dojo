export const ENGLISH_IMAGE_TITLE_PREFIX = "行光英文影像-";

export type EnglishImageRoute = "pending" | "game" | "daily" | "classroom" | "reading";
export type EnglishImageLearningRoute = Exclude<EnglishImageRoute, "pending">;
export type EnglishImageStatus = "inbox" | "organized";
export type EnglishImageAnalysisStatus = "idle" | "processing" | "completed" | "needs-review" | "failed";
export type EnglishImageConfidence = "high" | "medium" | "low" | null;
export type EnglishImageLineInputMode = "context" | "ocr" | "vocabSource" | null;

export type EnglishImageVocabDraft = {
  sourceName: string;
  focusDecks: string[];
  selectedKeys: string[];
};

export type EnglishImageVocabExport = {
  key: string;
  expression: string;
  vocabBook: string;
  focusDecks: string[];
  sourceName: string;
  cefrLevel: string;
  result: "created" | "existing";
  syncedAt: string;
};

export type EnglishImageVocabSyncState = {
  key: string;
  expression: string;
  status: "pending_sync" | "synced" | "already_exists" | "failed";
  attempts: number;
  lastError: string;
  updatedAt: string;
};

export type EnglishImageContextExport = {
  sourceRecordId: string;
  materialId: string;
  batchId: string;
  materialTitle: string;
  eventTitle: string;
  batchPosition: number;
  materialReused: boolean;
  expressionCount: number;
  duplicate: boolean;
  syncedAt: string;
};

export type EnglishImageContextLink = {
  projectId: string;
  unitId: string;
  sourceItemId: string;
  sourceItemUnitId: string;
  projectTitle: string;
  unitTitle: string;
  dispatchId: string;
  requestFingerprint: string;
  sourceRevision: number;
  contentFingerprint: string;
  status: "pending" | "unknown" | "synced" | "failed";
  outcome: string;
  lastError: string;
  dispatchedAt: string;
  syncedAt: string | null;
  targetProjectMode: "create" | "existing";
  targetUnitMode: "create" | "existing";
};

export type EnglishImageAttachment = {
  id: string;
  blockId: string;
  filename: string;
  mimeType: string;
  sourceMessageId: string;
  createdAt: string;
  batchIndex: number | null;
};

export type EnglishImageEntry = {
  version: 2;
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
  vocabularyWords: string;
  vocabularyCandidates: Array<{
    expression: string;
    meaning: string;
    usage: string;
    usageTranslation: string;
    partOfSpeech: string;
    usageProvenance: "source" | "generated" | "unknown";
    cefrLevel: string;
    suggestedFocusDecks: string[];
    origin: "source" | "extension";
    recommendationReason: string;
  }>;
  externalEventId: string;
  externalMessageId: string;
  awaitingContextUntil: string | null;
  attachment: EnglishImageAttachment;
  attachments: EnglishImageAttachment[];
  mergedIntoId: string;
  lineImageSetId: string;
  lineImageSetTotal: number;
  lineBatchState: "open" | "closed";
  lineBatchUntil: string | null;
  lineInputMode: EnglishImageLineInputMode;
  lineInputUntil: string | null;
  contextRoomStatus: "idle" | "ready" | "synced";
  contextRoomPreparedAt: string | null;
  contextRoomUrl: string;
  contextRoomExport: EnglishImageContextExport | null;
  contextRoomLinks: EnglishImageContextLink[];
  contextRoomSourceRevision: number;
  contextRoomContentFingerprint: string;
  vocabForgeExports: EnglishImageVocabExport[];
  vocabForgeSyncStates: EnglishImageVocabSyncState[];
  vocabForgeDraft: EnglishImageVocabDraft;
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

export function isEnglishImageLearningRoute(value: unknown): value is EnglishImageLearningRoute {
  return value === "game" || value === "daily" || value === "classroom" || value === "reading";
}

export function withEnglishImageStatus(entry: EnglishImageEntry, status: EnglishImageStatus): EnglishImageEntry {
  if (entry.mergedIntoId) throw new Error("已合併的子紀錄不能變更整理狀態");
  return { ...entry, status };
}

export function englishImageRouteLabel(route: EnglishImageRoute): string {
  if (route === "game") return "遊戲英文";
  if (route === "daily") return "英文日常";
  if (route === "classroom") return "課堂英文";
  if (route === "reading") return "閱讀英文";
  return "待分類";
}

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
  const now = new Date().toISOString();
  const attachmentSource = source.attachment && typeof source.attachment === "object"
    ? source.attachment as Partial<EnglishImageAttachment>
    : {};
  const attachmentValues = Array.isArray(source.attachments) ? source.attachments : [attachmentSource];
  const attachments = attachmentValues.flatMap((item, originalIndex) => {
    if (!item || typeof item !== "object") return [];
    const attachment = item as Partial<EnglishImageAttachment>;
    const itemBlockId = text(attachment.blockId, 100);
    if (!itemBlockId) return [];
    return [{
      id: text(attachment.id, 300) || itemBlockId,
      blockId: itemBlockId,
      filename: text(attachment.filename, 300) || "line-image.jpg",
      mimeType: text(attachment.mimeType, 100) || "image/jpeg",
      sourceMessageId: text(attachment.sourceMessageId, 200),
      createdAt: iso(attachment.createdAt, params.capturedAt ?? now),
      batchIndex: Number.isFinite(attachment.batchIndex) ? Math.max(1, Math.floor(Number(attachment.batchIndex))) : null,
      originalIndex,
    }];
  }).sort((a, b) => {
    if (a.batchIndex === null && b.batchIndex === null) return a.originalIndex - b.originalIndex;
    if (a.batchIndex === null) return 1;
    if (b.batchIndex === null) return -1;
    return a.batchIndex - b.batchIndex || a.originalIndex - b.originalIndex;
  }).map(({ originalIndex, ...attachment }) => {
    void originalIndex;
    return attachment;
  });
  const blockId = attachments[0]?.blockId ?? "";
  if (!blockId) return null;
  const capturedAt = iso(source.capturedAt, params.capturedAt ?? now);
  const route: EnglishImageRoute = isEnglishImageLearningRoute(source.route) ? source.route : "pending";
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
    version: 2,
    recordType: "english-image-entry",
    id: params.id,
    route,
    status: source.status === "organized" ? "organized" : "inbox",
    title: text(source.title, 300) || (route === "pending" ? "待分類英文影像" : englishImageRouteLabel(route)),
    sourceLabel: text(source.sourceLabel, 300),
    contextNote: text(source.contextNote, 8000),
    ocrText: text(source.ocrText, 30000),
    englishRecord: text(source.englishRecord, 12000),
    chineseExplanation: text(source.chineseExplanation, 12000),
    learningPhrases: text(source.learningPhrases, 12000),
    vocabularyWords: text(source.vocabularyWords, 12000),
    vocabularyCandidates: Array.isArray(source.vocabularyCandidates) ? source.vocabularyCandidates.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as EnglishImageEntry["vocabularyCandidates"][number];
      const expression = text(value.expression, 240);
      if (!expression) return [];
      return [{
        expression,
        meaning: text(value.meaning, 500),
        usage: text(value.usage, 1000),
        usageTranslation: text(value.usageTranslation, 1000),
        partOfSpeech: text(value.partOfSpeech, 80),
        usageProvenance: value.usageProvenance === "source" || value.usageProvenance === "generated"
          ? value.usageProvenance
          : "unknown" as const,
        cefrLevel: /^(A1|A2|B1|B2|C1|C2)$/.test(text(value.cefrLevel, 10)) ? text(value.cefrLevel, 10) : "待確認",
        suggestedFocusDecks: Array.isArray(value.suggestedFocusDecks)
          ? value.suggestedFocusDecks.map((name) => text(name, 200)).filter(Boolean).slice(0, 2)
          : [],
        origin: value.origin === "extension" ? "extension" as const : "source" as const,
        recommendationReason: text(value.recommendationReason, 500),
      }];
    }).slice(0, 5) : [],
    externalEventId: text(source.externalEventId, 200),
    externalMessageId: text(source.externalMessageId, 200),
    awaitingContextUntil: source.awaitingContextUntil ? iso(source.awaitingContextUntil, now) : null,
    attachment: attachments[0],
    attachments,
    mergedIntoId: text(source.mergedIntoId, 100),
    lineImageSetId: text(source.lineImageSetId, 200),
    lineImageSetTotal: Number.isFinite(source.lineImageSetTotal) ? Math.max(0, Math.floor(Number(source.lineImageSetTotal))) : 0,
    lineBatchState: source.lineBatchState === "open" ? "open" : "closed",
    lineBatchUntil: source.lineBatchUntil ? iso(source.lineBatchUntil, now) : null,
    lineInputMode: source.lineInputMode === "context" || source.lineInputMode === "ocr" || source.lineInputMode === "vocabSource" ? source.lineInputMode : null,
    lineInputUntil: source.lineInputUntil ? iso(source.lineInputUntil, now) : null,
    contextRoomStatus: source.contextRoomStatus === "synced" ? "synced" : source.contextRoomStatus === "ready" ? "ready" : "idle",
    contextRoomPreparedAt: source.contextRoomPreparedAt ? iso(source.contextRoomPreparedAt, now) : null,
    contextRoomUrl: text(source.contextRoomUrl, 3000),
    contextRoomExport: source.contextRoomExport && typeof source.contextRoomExport === "object" ? (() => {
      const value = source.contextRoomExport as Partial<EnglishImageContextExport>;
      const sourceRecordId = text(value.sourceRecordId, 200);
      const materialId = text(value.materialId, 200);
      const batchId = text(value.batchId, 200);
      const syncedAt = text(value.syncedAt, 80);
      if (!sourceRecordId || !materialId || !batchId || !syncedAt) return null;
      return {
        sourceRecordId,
        materialId,
        batchId,
        materialTitle: text(value.materialTitle, 300),
        eventTitle: text(value.eventTitle, 300),
        batchPosition: Number.isFinite(value.batchPosition) ? Math.max(1, Math.floor(Number(value.batchPosition))) : 1,
        materialReused: value.materialReused === true,
        expressionCount: Number.isFinite(value.expressionCount) ? Math.max(0, Math.floor(Number(value.expressionCount))) : 0,
        duplicate: value.duplicate === true,
        syncedAt,
      };
    })() : null,
    contextRoomLinks: Array.isArray(source.contextRoomLinks) ? source.contextRoomLinks.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Partial<EnglishImageContextLink>;
      const dispatchId = text(value.dispatchId, 200);
      const dispatchedAt = text(value.dispatchedAt, 80);
      if (!dispatchId || !dispatchedAt) return [];
      const status: EnglishImageContextLink["status"] = value.status === "pending" || value.status === "unknown" || value.status === "failed" ? value.status : "synced";
      return [{
        projectId: text(value.projectId, 200), unitId: text(value.unitId, 200),
        sourceItemId: text(value.sourceItemId, 200), sourceItemUnitId: text(value.sourceItemUnitId, 200),
        projectTitle: text(value.projectTitle, 300), unitTitle: text(value.unitTitle, 300),
        dispatchId, requestFingerprint: text(value.requestFingerprint, 64),
        sourceRevision: Number.isSafeInteger(value.sourceRevision) && Number(value.sourceRevision) > 0 ? Number(value.sourceRevision) : 1,
        contentFingerprint: text(value.contentFingerprint, 64), status,
        outcome: text(value.outcome, 100), lastError: text(value.lastError, 1000), dispatchedAt,
        syncedAt: value.syncedAt ? iso(value.syncedAt, dispatchedAt) : null,
        targetProjectMode: value.targetProjectMode === "create" ? "create" as const : "existing" as const,
        targetUnitMode: value.targetUnitMode === "existing" ? "existing" as const : "create" as const,
      }];
    }).filter((item, index, all) => {
      if (item.status !== "synced" || !item.projectId || !item.unitId) return all.findIndex((other) => other.dispatchId === item.dispatchId) === index;
      return all.findIndex((other) => other.status === "synced" && other.projectId === item.projectId && other.unitId === item.unitId) === index;
    }) : [],
    contextRoomSourceRevision: Number.isSafeInteger(source.contextRoomSourceRevision) && Number(source.contextRoomSourceRevision) > 0 ? Number(source.contextRoomSourceRevision) : 0,
    contextRoomContentFingerprint: text(source.contextRoomContentFingerprint, 64),
    vocabForgeExports: Array.isArray(source.vocabForgeExports) ? source.vocabForgeExports.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Partial<EnglishImageVocabExport>;
      const expression = text(value.expression, 240);
      const key = text(value.key, 180);
      const syncedAt = text(value.syncedAt, 80);
      if (!expression || !key || !syncedAt) return [];
      return [{
        key,
        expression,
        vocabBook: text(value.vocabBook, 200),
        focusDecks: Array.isArray(value.focusDecks) ? value.focusDecks.map((name) => text(name, 200)).filter(Boolean).slice(0, 2) : [],
        sourceName: text(value.sourceName, 300),
        cefrLevel: /^(A1|A2|B1|B2|C1|C2)$/.test(text(value.cefrLevel, 10)) ? text(value.cefrLevel, 10) : "待確認",
        result: value.result === "existing" ? "existing" as const : "created" as const,
        syncedAt,
      }];
    }) : [],
    vocabForgeSyncStates: Array.isArray(source.vocabForgeSyncStates) ? source.vocabForgeSyncStates.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Partial<EnglishImageVocabSyncState>;
      const key = text(value.key, 180);
      const expression = text(value.expression, 240);
      const updatedAt = text(value.updatedAt, 80);
      const status = value.status === "pending_sync" || value.status === "synced" || value.status === "already_exists" || value.status === "failed"
        ? value.status
        : null;
      if (!key || !expression || !status || !updatedAt) return [];
      return [{
        key,
        expression,
        status,
        attempts: Number.isFinite(value.attempts) ? Math.max(0, Math.floor(Number(value.attempts))) : 0,
        lastError: text(value.lastError, 1000),
        updatedAt,
      }];
    }) : [],
    vocabForgeDraft: (() => {
      const value = source.vocabForgeDraft && typeof source.vocabForgeDraft === "object"
        ? source.vocabForgeDraft as Partial<EnglishImageVocabDraft>
        : {};
      return {
        sourceName: text(value.sourceName, 300),
        focusDecks: Array.isArray(value.focusDecks) ? value.focusDecks.map((name) => text(name, 200)).filter(Boolean).slice(0, 2) : [],
        selectedKeys: Array.isArray(value.selectedKeys) ? value.selectedKeys.map((key) => text(key, 180)).filter(Boolean).slice(0, 5) : [],
      };
    })(),
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
