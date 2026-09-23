import "server-only";

import type { EnglishImageContextExport, EnglishImageContextLink, EnglishImageEntry, EnglishImageVocabExport, EnglishImageVocabSyncState } from "./englishImage";
import { getEnglishImageEntry, saveEnglishImageEntry } from "./englishImageStore";
import {
  calculateRequestFingerprint,
  calculateSourceContentFingerprint,
  nextSourceRevision,
  sourceContent,
  SOURCE_HANDOFF_V2,
} from "./sourceHandoffV2";

export type EnglishImageVocabCandidate = {
  key: string;
  expression: string;
  meaning: string;
  sourceText: string;
  finalSentence: string;
  sourceSentence: string;
  usage: { partOfSpeech: string; meaning: string; sentence: string; translation: string; provenance: "source" | "generated" | "unknown" };
  cefrLevel: string;
  suggestedFocusDecks: string[];
  origin: "source" | "extension";
  recommendationReason: string;
};

export type VocabForgeBook = {
  name: string;
  count: number;
  source: "postgres" | "notion";
  updatedAt: string;
  countDefinition: "focus_deck_membership";
};

export const PERMANENT_FOCUS_DECKS = [
  "日常啟動",
  "按摩工作",
  "JRPG／冒險遊戲",
  "生活模擬遊戲",
  "故事閱讀",
  "影音口語",
] as const;

export function normalizeSourceName(value: string): string {
  const name = value.normalize("NFKC").trim().slice(0, 300);
  const compact = name.toLocaleLowerCase("en").replace(/[\s_／/|｜–—-]+/g, "");
  if (/dragonquest(v|5)|勇者鬥惡龍(v|5)|^dqv$/.test(compact)) return "Dragon Quest V";
  if (/chineseparents|中國式家長/.test(compact)) return "Chinese Parents";
  if (/animalcrossing|動物森友會|動森/.test(compact)) return "Animal Crossing";
  if (/zelda|薩爾達/.test(compact)) return "Zelda";
  return name;
}

function routeFocusDeck(entry: EnglishImageEntry, sourceName: string): string {
  const value = `${sourceName} ${entry.sourceLabel}`.toLocaleLowerCase("en");
  if (/chinese parents|中國式家長|animal crossing|動森|星露谷|stardew|火山的女兒/.test(value)) return "生活模擬遊戲";
  if (entry.route === "game") return "JRPG／冒險遊戲";
  if (entry.route === "daily") return "日常啟動";
  if (entry.route === "reading") return "故事閱讀";
  return "日常啟動";
}

export function recommendedFocusDecks(entry: EnglishImageEntry, sourceName = ""): string[] {
  const recommendations: string[] = [routeFocusDeck(entry, sourceName)];
  for (const candidate of englishImageVocabCandidates(entry)) {
    for (const deck of candidate.suggestedFocusDecks) {
      if (PERMANENT_FOCUS_DECKS.includes(deck as typeof PERMANENT_FOCUS_DECKS[number]) && !recommendations.includes(deck)) recommendations.push(deck);
    }
  }
  return recommendations.slice(0, 2);
}

const VOCAB_BOOK_CACHE_TTL_MS = 10 * 60_000;
let vocabBookCache: { books: VocabForgeBook[]; expiresAt: number } | null = null;
let vocabBookRequest: Promise<VocabForgeBook[]> | null = null;

export type EnglishImageContextCandidate = {
  key: string;
  text: string;
  meaning: string;
  usage: string;
  kind: "chunk" | "pattern" | "repair" | "usage";
};

export type EnglishImageContextProject = {
  id: string;
  type: string;
  title: string;
  batchCount: number;
  latestBatchLabel: string;
  updatedAt: string;
  units: Array<{ id: string; label: string; learningGoal: string; status: string; position: number; updatedAt: string }>;
};

export type EnglishImageContextCapability = {
  mode: "v2" | "v1";
  supportsExistingUnit: boolean;
  supportsSourceItemReuse: boolean;
  supportsOrderedAttachments: boolean;
  supportsRevisionUpsert: boolean;
  requiresRequestFingerprint: boolean;
  imageProxyReady: boolean;
};

export type EnglishImageContextCatalog = {
  projects: EnglishImageContextProject[];
  capability: EnglishImageContextCapability;
};

function candidateKey(expression: string): string {
  return expression.normalize("NFKC").toLocaleLowerCase("en").trim().replace(/\s+/g, "_").slice(0, 180);
}

function sourceSentenceFor(entry: EnglishImageEntry, expression: string): string {
  const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stem = expression.length >= 7 ? expression.slice(0, expression.length - 2).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : escaped;
  const target = new RegExp(`\\b(?:${escaped}|${stem}[A-Za-z]*)\\b`, "i");
  const sentences = entry.ocrText.match(/[^.!?\n]+[.!?]?/g) ?? [];
  return (sentences.find((sentence) => target.test(sentence)) ?? "").trim().slice(0, 1900);
}

function sourceContextFor(entry: EnglishImageEntry): string {
  return [entry.contextNote && `使用者補充：${entry.contextNote}`, entry.chineseExplanation && `素材理解：${entry.chineseExplanation}`, entry.ocrText && `OCR 原文：${entry.ocrText}`].filter(Boolean).join("\n\n").trim().slice(0, 12000);
}

function contextKind(text: string, usage: string): EnglishImageContextCandidate["kind"] {
  const joined = `${text} ${usage}`.toLocaleLowerCase("en");
  if (/repair|修復|想不起|換句話/.test(joined)) return "repair";
  if (/\.{3}|…|\[[^\]]+\]|\{[^}]+\}/.test(text)) return "pattern";
  if (/語氣|用法|搭配|委婉|正式|非正式|difference|usage|tone/.test(joined)) return "usage";
  return "chunk";
}

export function englishImageContextCandidates(entry: EnglishImageEntry): EnglishImageContextCandidate[] {
  const candidates = entry.learningPhrases.split(/\r?\n/).flatMap((line) => {
    const clean = line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").trim();
    if (!clean) return [];
    const [rawText = "", rawMeaning = "", ...usageParts] = clean.split(/\s*(?:\||｜)\s*/);
    const value = rawText.trim().replace(/^[\s'“”「」]+|[\s'“”「」]+$/g, "").slice(0, 500);
    if (!value || /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(value)) return [];
    const meaning = rawMeaning.trim().slice(0, 1000);
    const usage = usageParts.join("｜").trim().slice(0, 1000);
    return [{ key: candidateKey(value), text: value, meaning, usage, kind: contextKind(value, usage) }];
  });
  return [...new Map(candidates.map((candidate) => [candidate.key, candidate])).values()].slice(0, 8);
}

export function englishImageVocabCandidates(entry: EnglishImageEntry): EnglishImageVocabCandidate[] {
  const structured = entry.vocabularyCandidates.flatMap((candidate) => {
    const expression = candidate.expression.trim().replace(/^[\s'“”「」]+|[\s'“”「」]+$/g, "").slice(0, 240);
    if (!/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(expression)) return [];
    return [{
      key: candidateKey(expression),
      expression,
      meaning: candidate.meaning,
      sourceText: (entry.contextNote || entry.chineseExplanation || entry.ocrText).trim().slice(0, 1900),
      finalSentence: candidate.usage.trim().slice(0, 1900),
      sourceSentence: sourceSentenceFor(entry, expression),
      usage: { partOfSpeech: candidate.partOfSpeech, meaning: candidate.meaning, sentence: candidate.usage, translation: candidate.usageTranslation, provenance: candidate.usageProvenance },
      cefrLevel: candidate.cefrLevel,
      suggestedFocusDecks: candidate.suggestedFocusDecks.filter((deck) => PERMANENT_FOCUS_DECKS.includes(deck as typeof PERMANENT_FOCUS_DECKS[number])).slice(0, 2),
      origin: candidate.origin,
      recommendationReason: candidate.recommendationReason,
    }];
  });
  if (structured.length) return [...new Map(structured.map((candidate) => [candidate.key, candidate])).values()].slice(0, 5);

  // AI may place a useful single word in either section. Merge both sources so
  // a word such as "outfit" is not lost merely because a separate candidate
  // list also exists.
  const source = [entry.vocabularyWords, entry.learningPhrases].filter((value) => value.trim()).join("\n");
  const candidates = source.split(/\r?\n/).flatMap((line) => {
    const clean = line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").trim();
    if (!clean) return [];
    const [rawExpression = "", ...meaningParts] = clean.split(/\s*(?:\||｜|—|–|：|\s-\s)\s*/);
    const expression = rawExpression.trim().replace(/^[\s'“”「」]+|[\s'“”「」]+$/g, "").slice(0, 240);
    // VocabForge 專注單字；片語與句型留給語境修習室。
    if (!/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(expression)) return [];
    return [{
      key: candidateKey(expression),
      expression,
      meaning: meaningParts.join(" — ").trim().slice(0, 500),
      sourceText: (entry.contextNote || entry.chineseExplanation || entry.ocrText).trim().slice(0, 1900),
      finalSentence: "",
      sourceSentence: sourceSentenceFor(entry, expression),
      usage: { partOfSpeech: "", meaning: meaningParts.join(" — ").trim().slice(0, 500), sentence: "", translation: "", provenance: "unknown" as const },
      cefrLevel: "待確認",
      suggestedFocusDecks: [routeFocusDeck(entry, entry.vocabForgeDraft.sourceName)],
      origin: "source" as const,
      recommendationReason: "來自原素材的單字候選",
    }];
  });
  return [...new Map(candidates.map((candidate) => [candidate.key, candidate])).values()].slice(0, 5);
}

function contextRoomBaseUrl(): string {
  return process.env.CONTEXT_ROOM_INTEGRATION_URL?.trim() || process.env.CONTEXT_ROOM_URL?.trim() || "https://lumen-context-room-production-4a2c.up.railway.app";
}

function contextRoomSecret(): string {
  return process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET?.trim() ?? "";
}

function contextSourceType(entry: EnglishImageEntry): string {
  return entry.route === "game" ? "game_image" : entry.route === "classroom" ? "classroom_image" : entry.route === "reading" ? "reading_image" : "daily_image";
}

function comparableProjectTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[\s_:：／/|｜–—-]+/g, "");
}

function parseContextProjects(items: unknown[], includeUnits: boolean): EnglishImageContextProject[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Partial<EnglishImageContextProject>;
    const id = typeof value.id === "string" ? value.id.trim().slice(0, 200) : "";
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 300) : "";
    if (!id || !title) return [];
    const units = includeUnits && Array.isArray(value.units) ? value.units.flatMap((unit) => {
      if (!unit || typeof unit !== "object") return [];
      const row = unit as Partial<EnglishImageContextProject["units"][number]>;
      const unitId = typeof row.id === "string" ? row.id.trim().slice(0, 200) : "";
      const label = typeof row.label === "string" ? row.label.trim().slice(0, 300) : "";
      if (!unitId || !label) return [];
      return [{ id: unitId, label, learningGoal: typeof row.learningGoal === "string" ? row.learningGoal.trim().slice(0, 1000) : "", status: row.status === "active" ? "active" : "archived", position: Math.max(1, Math.floor(Number(row.position) || 1)), updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "" }];
    }) : [];
    return [{ id, type: typeof value.type === "string" ? value.type : "", title, batchCount: Math.max(0, Math.floor(Number(value.batchCount) || 0)), latestBatchLabel: typeof value.latestBatchLabel === "string" ? value.latestBatchLabel.trim().slice(0, 300) : "", updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "", units }];
  });
}

export async function listEnglishImageContextCatalog(entry: EnglishImageEntry): Promise<EnglishImageContextCatalog> {
  const base = contextRoomBaseUrl();
  const secret = contextRoomSecret();
  if (!base || !secret) throw new Error("語境修習室串接尚未完成 Railway 設定");
  const endpoint = new URL("/api/integrations/lumen/import", base);
  endpoint.searchParams.set("contractVersion", SOURCE_HANDOFF_V2);
  const v2Response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const v2Result = await v2Response.json().catch(() => ({})) as { error?: string; materials?: unknown[]; capabilities?: Record<string, unknown> };
  if (v2Response.ok && Array.isArray(v2Result.capabilities?.acceptedContractVersions) && v2Result.capabilities.acceptedContractVersions.includes(SOURCE_HANDOFF_V2)) {
    return {
      projects: parseContextProjects(v2Result.materials ?? [], true),
      capability: {
        mode: "v2", supportsExistingUnit: v2Result.capabilities.supportsExistingUnit === true,
        supportsSourceItemReuse: v2Result.capabilities.supportsSourceItemReuse === true,
        supportsOrderedAttachments: v2Result.capabilities.supportsOrderedAttachments === true,
        supportsRevisionUpsert: v2Result.capabilities.supportsRevisionUpsert === true,
        requiresRequestFingerprint: v2Result.capabilities.requiresRequestFingerprint === true,
        imageProxyReady: v2Result.capabilities.imageProxyReady === true,
      },
    };
  }
  if (v2Response.status === 401 || v2Response.status === 403)
    throw new Error(v2Result.error ?? "語境修習室 v2 capability 授權失敗，已停用新版派送");
  const legacyEndpoint = new URL("/api/integrations/lumen/import", base);
  legacyEndpoint.searchParams.set("sourceType", contextSourceType(entry));
  const legacyResponse = await fetch(legacyEndpoint, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const legacyResult = await legacyResponse.json().catch(() => ({})) as { error?: string; materials?: unknown[] };
  if (!legacyResponse.ok) throw new Error(legacyResult.error ?? `無法讀取語境修習室學習專案（${legacyResponse.status}）`);
  return { projects: parseContextProjects(legacyResult.materials ?? [], false), capability: { mode: "v1", supportsExistingUnit: false, supportsSourceItemReuse: false, supportsOrderedAttachments: false, supportsRevisionUpsert: false, requiresRequestFingerprint: false, imageProxyReady: false } };
}

export async function listEnglishImageContextProjects(entry: EnglishImageEntry): Promise<EnglishImageContextProject[]> {
  return (await listEnglishImageContextCatalog(entry)).projects;
}

export function suggestedEnglishImageContextProject(entry: EnglishImageEntry, projects: EnglishImageContextProject[]): string {
  if (entry.contextRoomExport?.materialId && projects.some((item) => item.id === entry.contextRoomExport?.materialId)) return entry.contextRoomExport.materialId;
  const expected = comparableProjectTitle(entry.sourceLabel || entry.vocabForgeDraft.sourceName || entry.title);
  return projects.find((item) => comparableProjectTitle(item.title) === expected)?.id || "";
}

export async function prepareEnglishImageForContextRoom(id: string): Promise<EnglishImageEntry> {
  const { entry } = await getEnglishImageEntry(id);
  if (!entry.englishRecord.trim() && !entry.ocrText.trim()) throw new Error("請先完成 AI 分析或補上英文原文");
  const params = new URLSearchParams({
    create: "forage",
    title: entry.title,
    materialType: entry.route === "game" ? "game" : entry.route === "classroom" ? "classroom" : entry.route === "reading" ? "reading" : "daily",
    sourceRecordId: entry.id,
  });
  const url = `${contextRoomBaseUrl().replace(/\/$/, "")}/?${params.toString()}`;
  return saveEnglishImageEntry({
    ...entry,
    contextRoomStatus: "ready",
    contextRoomPreparedAt: new Date().toISOString(),
    contextRoomUrl: url,
  });
}

export async function exportEnglishImageContext(params: {
  id: string;
  contractMode?: "v2" | "v1";
  projectMode?: "create" | "existing";
  materialId?: string;
  materialTitle: string;
  unitMode?: "create" | "existing";
  unitId?: string;
  eventTitle: string;
  projectType?: string;
  learningPathId?: string;
  crossTypeConfirmed?: boolean;
  candidateKeys: string[];
}): Promise<EnglishImageEntry> {
  const base = contextRoomBaseUrl();
  const secret = contextRoomSecret();
  if (!base || !secret) throw new Error("語境修習室串接尚未完成 Railway 設定");
  const { entry } = await getEnglishImageEntry(params.id);
  if (entry.route === "pending") throw new Error("請先把圖片分類為遊戲英文、英文日常、課堂英文或閱讀英文");
  if (!entry.englishRecord.trim() && !entry.ocrText.trim()) throw new Error("請先完成 AI 分析或補上英文原文");
  const materialTitle = params.materialTitle.trim().slice(0, 300);
  const eventTitle = params.eventTitle.trim().slice(0, 300);
  if (!materialTitle || !eventTitle) throw new Error("請填寫素材專案與事件名稱");
  const allCandidates = englishImageContextCandidates(entry);
  const requested = [...new Set(params.candidateKeys)].slice(0, 5);
  const selected = requested.flatMap((key) => allCandidates.find((item) => item.key === key) ?? []);
  if (selected.length !== requested.length) throw new Error("表達候選已變更，請重新整理後再選擇");

  if (params.contractMode !== "v2") return exportEnglishImageContextV1({ ...params, entry, selected, base, secret, materialTitle, eventTitle });
  const projectMode = params.projectMode === "existing" ? "existing" : "create";
  const unitMode = params.unitMode === "existing" ? "existing" : "create";
  const materialId = params.materialId?.trim().slice(0, 200) || "";
  const unitId = params.unitId?.trim().slice(0, 200) || "";
  if (projectMode === "existing" && !materialId) throw new Error("請選擇既有學習專案");
  if (unitMode === "existing" && !unitId) throw new Error("請選擇既有學習單元");
  if (projectMode === "create" && unitMode === "existing") throw new Error("新學習專案不能直接選擇既有單元");
  const contentFingerprint = calculateSourceContentFingerprint(entry);
  const sourceRevision = nextSourceRevision(entry, contentFingerprint);
  const targetSignature = `${projectMode}:${materialId || materialTitle}|${unitMode}:${unitId || eventTitle}`;
  const retryLink = [...entry.contextRoomLinks].reverse().find((link) => link.status !== "synced" && `${link.targetProjectMode}:${link.projectId || link.projectTitle}|${link.targetUnitMode}:${link.unitId || link.unitTitle}` === targetSignature && link.contentFingerprint === contentFingerprint);
  const dispatchId = retryLink?.dispatchId || crypto.randomUUID();
  const { source, content } = sourceContent(entry);
  const requestWithoutFingerprint = {
    contractVersion: SOURCE_HANDOFF_V2,
    dispatchId,
    source: { ...source, revision: sourceRevision, contentFingerprint },
    target: {
      projectMode, projectId: materialId, projectTitle: materialTitle,
      projectType: params.projectType?.trim().slice(0, 100) || (entry.route === "game" ? "game_journey" : entry.route === "classroom" ? "class_topic" : entry.route === "reading" ? "reading" : "custom"),
      unitMode, unitId, unitTitle: eventTitle,
      learningPathId: params.learningPathId?.trim().slice(0, 200) || "",
      crossTypeConfirmed: params.crossTypeConfirmed === true,
    },
    content,
    expressions: selected,
  };
  const requestFingerprint = calculateRequestFingerprint(requestWithoutFingerprint);
  const requestBody = { ...requestWithoutFingerprint, requestFingerprint };
  const dispatchedAt = retryLink?.dispatchedAt || new Date().toISOString();
  const pendingLink: EnglishImageContextLink = {
    projectId: materialId, unitId, sourceItemId: retryLink?.sourceItemId || "", sourceItemUnitId: retryLink?.sourceItemUnitId || "",
    projectTitle: materialTitle, unitTitle: eventTitle, dispatchId, requestFingerprint, sourceRevision, contentFingerprint,
    status: "pending", outcome: "", lastError: "", dispatchedAt, syncedAt: null,
    targetProjectMode: projectMode, targetUnitMode: unitMode,
  };
  const contextRoomLinks = retryLink
    ? entry.contextRoomLinks.map((link) => link.dispatchId === retryLink.dispatchId ? pendingLink : link)
    : [...entry.contextRoomLinks, pendingLink];
  let workingEntry = await saveEnglishImageEntry({ ...entry, contextRoomLinks, contextRoomSourceRevision: sourceRevision, contextRoomContentFingerprint: contentFingerprint });
  const endpoint = new URL("/api/integrations/lumen/import", base);
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` }, body: JSON.stringify(requestBody), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workingEntry = await saveEnglishImageEntry({ ...workingEntry, contextRoomLinks: workingEntry.contextRoomLinks.map((link) => link.dispatchId === dispatchId ? { ...link, status: "unknown" as const, lastError: `接收結果未知：${message}` } : link) });
    throw new Error("派送逾時或連線中斷；接收結果未知，已保留原 dispatchId，可安全重試。");
  }
  const result = await response.json().catch(() => ({})) as { error?: string; code?: string; projectId?: string; unitId?: string; sourceItemId?: string; sourceItemUnitId?: string; materialId?: string; batchId?: string; outcome?: string; duplicateDispatch?: boolean };
  if (!response.ok) {
    await saveEnglishImageEntry({ ...workingEntry, contextRoomLinks: workingEntry.contextRoomLinks.map((link) => link.dispatchId === dispatchId ? { ...link, status: "failed" as const, lastError: [result.code, result.error].filter(Boolean).join("：") || `HTTP ${response.status}` } : link) });
    throw new Error(result.error ?? `語境修習室接收失敗（${response.status}）`);
  }
  const projectId = result.projectId || result.materialId || "";
  const receivedUnitId = result.unitId || result.batchId || "";
  if (!projectId || !receivedUnitId || !result.sourceItemId || !result.sourceItemUnitId) throw new Error("語境修習室回傳的 v2 接收結果不完整");
  const syncedAt = new Date().toISOString();
  const syncedLink: EnglishImageContextLink = { ...pendingLink, projectId, unitId: receivedUnitId, sourceItemId: result.sourceItemId, sourceItemUnitId: result.sourceItemUnitId, status: "synced", outcome: result.outcome || (result.duplicateDispatch ? "idempotent_replay" : "source_reused"), syncedAt };
  const finalLinks = workingEntry.contextRoomLinks.map((link) => link.dispatchId === dispatchId ? syncedLink : link).filter((link, index, all) => link.status !== "synced" || all.findIndex((other) => other.status === "synced" && other.projectId === link.projectId && other.unitId === link.unitId) === index);
  const contextRoomUrl = new URL(base.replace(/\/$/, ""));
  contextRoomUrl.searchParams.set("materialId", projectId);
  contextRoomUrl.searchParams.set("batchId", receivedUnitId);
  const contextRoomExport: EnglishImageContextExport = { sourceRecordId: entry.id, materialId: projectId, batchId: receivedUnitId, materialTitle, eventTitle, batchPosition: 1, materialReused: projectMode === "existing", expressionCount: selected.length, duplicate: result.duplicateDispatch === true, syncedAt };
  return saveEnglishImageEntry({ ...workingEntry, contextRoomStatus: "synced", contextRoomPreparedAt: syncedAt, contextRoomUrl: contextRoomUrl.toString(), contextRoomExport, contextRoomLinks: finalLinks });
}

async function exportEnglishImageContextV1(params: {
  entry: EnglishImageEntry; selected: EnglishImageContextCandidate[]; base: string; secret: string;
  materialId?: string; materialTitle: string; eventTitle: string;
}): Promise<EnglishImageEntry> {
  const { entry, selected, base, secret, materialTitle, eventTitle } = params;
  const endpoint = new URL("/api/integrations/lumen/import", base);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      sourceRecordId: entry.id,
      sourceType: entry.route === "game" ? "game_image" : entry.route === "classroom" ? "classroom_image" : entry.route === "reading" ? "reading_image" : "daily_image",
      materialId: params.materialId?.trim().slice(0, 200) || undefined,
      materialTitle,
      eventTitle,
      capturedOn: entry.capturedAt.slice(0, 10),
      englishOriginal: entry.ocrText,
      englishRecord: entry.englishRecord,
      chineseUnderstanding: entry.chineseExplanation,
      contextNote: entry.contextNote,
      uncertaintyNote: entry.analysisReviewReason,
      expressions: selected,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({})) as {
    error?: string;
    materialId?: string;
    batchId?: string;
    materialTitle?: string;
    batchPosition?: number;
    materialReused?: boolean;
    expressionCount?: number;
    duplicate?: boolean;
  };
  if (!response.ok) throw new Error(result.error ?? `語境修習室接收失敗（${response.status}）`);
  if (!result.materialId || !result.batchId) throw new Error("語境修習室回傳的接收結果不完整");
  const contextRoomUrl = new URL(base.replace(/\/$/, ""));
  contextRoomUrl.searchParams.set("materialId", result.materialId);
  contextRoomUrl.searchParams.set("batchId", result.batchId);
  const contextRoomExport: EnglishImageContextExport = {
    sourceRecordId: entry.id,
    materialId: result.materialId,
    batchId: result.batchId,
    materialTitle: result.materialTitle?.trim().slice(0, 300) || materialTitle,
    eventTitle,
    batchPosition: Math.max(1, Math.floor(Number(result.batchPosition) || 1)),
    materialReused: result.materialReused === true,
    expressionCount: Math.max(0, Math.floor(Number(result.expressionCount) || 0)),
    duplicate: result.duplicate === true,
    syncedAt: new Date().toISOString(),
  };
  return saveEnglishImageEntry({
    ...entry,
    contextRoomStatus: "synced",
    contextRoomPreparedAt: contextRoomExport.syncedAt,
    contextRoomUrl: contextRoomUrl.toString(),
    contextRoomExport,
  });
}

type ImportResult = { key: string; expression: string; result: "created" | "existing" | "failed"; error?: string };

function vocabForgeEndpoint(pathname: string): URL | null {
  const base = process.env.VOCABFORGE_INTEGRATION_URL?.trim();
  if (!base) return null;
  try { return new URL(pathname, base); }
  catch { return null; }
}

function vocabForgeSecret(): string {
  return process.env.LUMEN_VOCABFORGE_SYNC_SECRET?.trim() ?? "";
}

async function fetchVocabForgeBooks(): Promise<VocabForgeBook[]> {
  const endpoint = vocabForgeEndpoint("/api/integrations/lumen/vocab-books");
  const secret = vocabForgeSecret();
  if (!endpoint || !secret) throw new Error("VocabForge 串接尚未完成 Railway 設定");
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({})) as {
    error?: string;
    books?: unknown[];
    source?: unknown;
    updatedAt?: unknown;
    countDefinition?: unknown;
  };
  if (!response.ok) throw new Error(result.error ?? `無法讀取 VocabForge 豆倉（${response.status}）`);
  const books = (result.books ?? []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as { name?: unknown; count?: unknown; source?: unknown; updatedAt?: unknown };
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 200) : "";
    if (!name) return [];
    const source: VocabForgeBook["source"] = value.source === "postgres" || result.source === "postgres" ? "postgres" : "notion";
    const updatedAt = typeof value.updatedAt === "string"
      ? value.updatedAt
      : typeof result.updatedAt === "string" ? result.updatedAt : "";
    return [{ name, count: Number.isFinite(value.count) ? Math.max(0, Math.floor(Number(value.count))) : 0, source, updatedAt, countDefinition: "focus_deck_membership" as const }];
  });
  if (!books.length) throw new Error("VocabForge 目前沒有可選擇的豆倉");
  vocabBookCache = { books, expiresAt: Date.now() + VOCAB_BOOK_CACHE_TTL_MS };
  return books;
}

export async function listVocabForgeBooks(options: { forceRefresh?: boolean } = {}): Promise<VocabForgeBook[]> {
  if (options.forceRefresh) return fetchVocabForgeBooks();
  if (vocabBookCache && vocabBookCache.expiresAt > Date.now()) return vocabBookCache.books;
  if (!vocabBookRequest) {
    vocabBookRequest = fetchVocabForgeBooks().finally(() => {
      vocabBookRequest = null;
    });
  }
  return vocabBookRequest;
}

export async function exportEnglishImageVocab(id: string, requestedKey: string, vocabBook: string): Promise<{ entry: EnglishImageEntry; exported: EnglishImageVocabExport }> {
  const result = await exportEnglishImageVocabs(id, [requestedKey], vocabBook);
  const exported = result.exports.find((item) => item.key === requestedKey);
  if (!exported) throw new Error("VocabForge 回傳的接收結果不完整");
  return { entry: result.entry, exported };
}

export async function exportEnglishImageVocabs(
  id: string,
  requestedKeys: string[],
  vocabBook: string,
  options: { focusDecks?: string[]; sourceName?: string } = {},
): Promise<{ entry: EnglishImageEntry; exports: EnglishImageVocabExport[]; failures: EnglishImageVocabSyncState[] }> {
  const endpoint = vocabForgeEndpoint("/api/integrations/lumen/import");
  const secret = vocabForgeSecret();
  if (!endpoint || !secret) throw new Error("VocabForge 串接尚未完成 Railway 設定");
  const selectedBook = vocabBook.trim().slice(0, 200);
  if (!selectedBook) throw new Error("請先選擇要放入的豆倉");
  const focusDecks = [...new Set((options.focusDecks ?? [selectedBook])
    .filter((deck): deck is string => typeof deck === "string")
    .map((deck) => deck.trim())
    .filter((deck) => PERMANENT_FOCUS_DECKS.includes(deck as typeof PERMANENT_FOCUS_DECKS[number])))].slice(0, 2);
  if (!focusDecks.length) focusDecks.push(selectedBook);
  const sourceName = normalizeSourceName(options.sourceName ?? "");
  const { entry } = await getEnglishImageEntry(id);
  const requested = [...new Set(requestedKeys)].slice(0, 5);
  if (!requested.length) throw new Error("請至少選擇一個要送入 VocabForge 的單字");
  const allCandidates = englishImageVocabCandidates(entry);
  const selected = requested.flatMap((key) => allCandidates.find((item) => item.key === key) ?? []);
  if (selected.length !== requested.length) throw new Error("候選單字已變更，請重新整理後再選擇");
  const existingByKey = new Map(entry.vocabForgeExports.map((item) => [item.key, item]));
  const pending = selected.filter((candidate) => !existingByKey.has(candidate.key));
  if (entry.vocabForgeExports.length + pending.length > 5) throw new Error("每筆素材最多送出五個單字，避免詞庫一次增加太多");

  if (!pending.length) {
    return { entry, exports: selected.flatMap((candidate) => existingByKey.get(candidate.key) ?? []), failures: [] };
  }

  const attemptAt = new Date().toISOString();
  const previousStates = new Map(entry.vocabForgeSyncStates.map((item) => [item.key, item]));
  for (const candidate of pending) {
    const previous = previousStates.get(candidate.key);
    previousStates.set(candidate.key, {
      key: candidate.key,
      expression: candidate.expression,
      status: "pending_sync",
      attempts: (previous?.attempts ?? 0) + 1,
      lastError: "",
      updatedAt: attemptAt,
    });
  }
  const workingEntry = await saveEnglishImageEntry({ ...entry, vocabForgeSyncStates: [...previousStates.values()] });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        contextContractVersion: 2,
        sourceSystem: "Lumen Dojo",
        sourceType: entry.route === "game" ? "野採・遊戲英文" : entry.route === "classroom" ? "野採・課堂英文" : entry.route === "reading" ? "野採・閱讀英文" : "野採・英文日常",
        sourceDate: entry.capturedAt.slice(0, 10),
        sourceRecordId: entry.id,
        topicTitle: entry.title,
        vocabBook: selectedBook,
        focusDecks,
        sourceName,
        sourceContext: sourceContextFor(entry),
        items: pending,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const candidate of pending) previousStates.set(candidate.key, { ...previousStates.get(candidate.key)!, status: "failed", lastError: message, updatedAt: new Date().toISOString() });
    await saveEnglishImageEntry({ ...workingEntry, vocabForgeSyncStates: [...previousStates.values()] });
    throw error;
  }
  const result = await response.json().catch(() => ({})) as { error?: string; items?: Array<ImportResult & { vocabBook?: string }> };
  if (!response.ok) {
    const message = result.error ?? `VocabForge 接收失敗（${response.status}）`;
    for (const candidate of pending) previousStates.set(candidate.key, { ...previousStates.get(candidate.key)!, status: "failed", lastError: message, updatedAt: new Date().toISOString() });
    await saveEnglishImageEntry({ ...workingEntry, vocabForgeSyncStates: [...previousStates.values()] });
    throw new Error(message);
  }
  const now = new Date().toISOString();
  const importedByKey = new Map((result.items ?? []).map((item) => [item.key, item]));
  const newExports = pending.flatMap((candidate): EnglishImageVocabExport[] => {
    const imported = importedByKey.get(candidate.key);
    if (!imported || imported.result === "failed") {
      previousStates.set(candidate.key, { ...previousStates.get(candidate.key)!, status: "failed", lastError: imported?.error || "VocabForge 未回傳此單字的結果", updatedAt: now });
      return [];
    }
    previousStates.set(candidate.key, { ...previousStates.get(candidate.key)!, status: imported.result === "existing" ? "already_exists" : "synced", lastError: "", updatedAt: now });
    return [{
      key: candidate.key,
      expression: candidate.expression,
      vocabBook: imported.vocabBook?.trim() || selectedBook,
      focusDecks,
      sourceName,
      cefrLevel: candidate.cefrLevel,
      result: imported.result,
      syncedAt: now,
    }];
  });
  const updated = await saveEnglishImageEntry({ ...workingEntry, vocabForgeExports: [...workingEntry.vocabForgeExports, ...newExports], vocabForgeSyncStates: [...previousStates.values()] });
  const updatedByKey = new Map(updated.vocabForgeExports.map((item) => [item.key, item]));
  return {
    entry: updated,
    exports: selected.flatMap((candidate) => updatedByKey.get(candidate.key) ?? []),
    failures: updated.vocabForgeSyncStates.filter((item) => requested.includes(item.key) && item.status === "failed"),
  };
}
