import "server-only";

import type { EnglishImageContextExport, EnglishImageEntry, EnglishImageVocabExport } from "./englishImage";
import { getEnglishImageEntry, saveEnglishImageEntry } from "./englishImageStore";

export type EnglishImageVocabCandidate = {
  key: string;
  expression: string;
  meaning: string;
  sourceText: string;
  finalSentence: string;
  cefrLevel: string;
  suggestedFocusDecks: string[];
};

export type VocabForgeBook = {
  name: string;
  count: number;
  source: "postgres" | "notion";
  updatedAt: string;
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
};

function candidateKey(expression: string): string {
  return expression.normalize("NFKC").toLocaleLowerCase("en").trim().replace(/\s+/g, "_").slice(0, 180);
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
      finalSentence: candidate.usage || (entry.englishRecord || entry.ocrText).trim().slice(0, 1900),
      cefrLevel: candidate.cefrLevel,
      suggestedFocusDecks: candidate.suggestedFocusDecks.filter((deck) => PERMANENT_FOCUS_DECKS.includes(deck as typeof PERMANENT_FOCUS_DECKS[number])).slice(0, 2),
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
      finalSentence: (entry.englishRecord || entry.ocrText).trim().slice(0, 1900),
      cefrLevel: "待確認",
      suggestedFocusDecks: [routeFocusDeck(entry, entry.vocabForgeDraft.sourceName)],
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

export async function listEnglishImageContextProjects(entry: EnglishImageEntry): Promise<EnglishImageContextProject[]> {
  const base = contextRoomBaseUrl();
  const secret = contextRoomSecret();
  if (!base || !secret) throw new Error("語境修習室串接尚未完成 Railway 設定");
  const endpoint = new URL("/api/integrations/lumen/import", base);
  endpoint.searchParams.set("sourceType", contextSourceType(entry));
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; materials?: unknown[] };
  if (!response.ok) throw new Error(result.error ?? `無法讀取語境修習室素材專案（${response.status}）`);
  return (result.materials ?? []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Partial<EnglishImageContextProject>;
    const id = typeof value.id === "string" ? value.id.trim().slice(0, 200) : "";
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 300) : "";
    if (!id || !title) return [];
    return [{
      id,
      type: typeof value.type === "string" ? value.type : "",
      title,
      batchCount: Math.max(0, Math.floor(Number(value.batchCount) || 0)),
      latestBatchLabel: typeof value.latestBatchLabel === "string" ? value.latestBatchLabel.trim().slice(0, 300) : "",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    }];
  });
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
  materialId?: string;
  materialTitle: string;
  eventTitle: string;
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

type ImportResult = { key: string; expression: string; result: "created" | "existing" };

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
    return [{ name, count: Number.isFinite(value.count) ? Math.max(0, Math.floor(Number(value.count))) : 0, source, updatedAt }];
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
): Promise<{ entry: EnglishImageEntry; exports: EnglishImageVocabExport[] }> {
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
    return { entry, exports: selected.flatMap((candidate) => existingByKey.get(candidate.key) ?? []) };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      sourceSystem: "Lumen Dojo",
      sourceType: entry.route === "game" ? "野採・遊戲英文" : entry.route === "classroom" ? "野採・課堂英文" : entry.route === "reading" ? "野採・閱讀英文" : "野採・英文日常",
      sourceDate: entry.capturedAt.slice(0, 10),
      sourceRecordId: entry.id,
      topicTitle: entry.title,
      vocabBook: selectedBook,
      focusDecks,
      sourceName,
      sourceContext: entry.contextNote || entry.chineseExplanation,
      items: pending,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; items?: Array<ImportResult & { vocabBook?: string }> };
  if (!response.ok) throw new Error(result.error ?? `VocabForge 接收失敗（${response.status}）`);
  const now = new Date().toISOString();
  const importedByKey = new Map((result.items ?? []).map((item) => [item.key, item]));
  const newExports = pending.map((candidate): EnglishImageVocabExport => {
    const imported = importedByKey.get(candidate.key);
    if (!imported || (imported.result !== "created" && imported.result !== "existing")) throw new Error("VocabForge 回傳的接收結果不完整");
    return {
      key: candidate.key,
      expression: candidate.expression,
      vocabBook: imported.vocabBook?.trim() || selectedBook,
      focusDecks,
      sourceName,
      cefrLevel: candidate.cefrLevel,
      result: imported.result,
      syncedAt: now,
    };
  });
  const updated = await saveEnglishImageEntry({ ...entry, vocabForgeExports: [...entry.vocabForgeExports, ...newExports] });
  const updatedByKey = new Map(updated.vocabForgeExports.map((item) => [item.key, item]));
  return { entry: updated, exports: selected.flatMap((candidate) => updatedByKey.get(candidate.key) ?? []) };
}
