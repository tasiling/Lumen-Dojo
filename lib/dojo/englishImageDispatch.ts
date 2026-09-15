import "server-only";

import type { EnglishImageContextExport, EnglishImageEntry, EnglishImageVocabExport } from "./englishImage";
import { getEnglishImageEntry, saveEnglishImageEntry } from "./englishImageStore";

export type EnglishImageVocabCandidate = {
  key: string;
  expression: string;
  meaning: string;
  sourceText: string;
  finalSentence: string;
};

export type VocabForgeBook = {
  name: string;
  count: number;
};

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

export async function prepareEnglishImageForContextRoom(id: string): Promise<EnglishImageEntry> {
  const { entry } = await getEnglishImageEntry(id);
  if (!entry.englishRecord.trim() && !entry.ocrText.trim()) throw new Error("請先完成 AI 分析或補上英文原文");
  const params = new URLSearchParams({
    create: "forage",
    title: entry.title,
    materialType: entry.route === "game" ? "game" : entry.route === "classroom" ? "classroom" : "daily",
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
  materialTitle: string;
  eventTitle: string;
  candidateKeys: string[];
}): Promise<EnglishImageEntry> {
  const base = contextRoomBaseUrl();
  const secret = contextRoomSecret();
  if (!base || !secret) throw new Error("語境修習室串接尚未完成 Railway 設定");
  const { entry } = await getEnglishImageEntry(params.id);
  if (entry.route === "pending") throw new Error("請先把圖片分類為遊戲英文、英文日常或課堂英文");
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
      sourceType: entry.route === "game" ? "game_image" : entry.route === "classroom" ? "classroom_image" : "daily_image",
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
    expressionCount?: number;
    duplicate?: boolean;
  };
  if (!response.ok) throw new Error(result.error ?? `語境修習室接收失敗（${response.status}）`);
  if (!result.materialId || !result.batchId) throw new Error("語境修習室回傳的接收結果不完整");
  const contextRoomUrl = base.replace(/\/$/, "");
  const contextRoomExport: EnglishImageContextExport = {
    sourceRecordId: entry.id,
    materialId: result.materialId,
    batchId: result.batchId,
    materialTitle,
    eventTitle,
    expressionCount: Math.max(0, Math.floor(Number(result.expressionCount) || 0)),
    duplicate: result.duplicate === true,
    syncedAt: new Date().toISOString(),
  };
  return saveEnglishImageEntry({
    ...entry,
    contextRoomStatus: "synced",
    contextRoomPreparedAt: contextRoomExport.syncedAt,
    contextRoomUrl,
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
  const result = await response.json().catch(() => ({})) as { error?: string; books?: unknown[] };
  if (!response.ok) throw new Error(result.error ?? `無法讀取 VocabForge 豆倉（${response.status}）`);
  const books = (result.books ?? []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as { name?: unknown; count?: unknown };
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 200) : "";
    if (!name) return [];
    return [{ name, count: Number.isFinite(value.count) ? Math.max(0, Math.floor(Number(value.count))) : 0 }];
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

export async function exportEnglishImageVocabs(id: string, requestedKeys: string[], vocabBook: string): Promise<{ entry: EnglishImageEntry; exports: EnglishImageVocabExport[] }> {
  const endpoint = vocabForgeEndpoint("/api/integrations/lumen/import");
  const secret = vocabForgeSecret();
  if (!endpoint || !secret) throw new Error("VocabForge 串接尚未完成 Railway 設定");
  const selectedBook = vocabBook.trim().slice(0, 200);
  if (!selectedBook) throw new Error("請先選擇要放入的豆倉");
  const { entry } = await getEnglishImageEntry(id);
  const requested = [...new Set(requestedKeys)].slice(0, 3);
  if (!requested.length) throw new Error("請至少選擇一個要送入 VocabForge 的單字");
  const allCandidates = englishImageVocabCandidates(entry);
  const selected = requested.flatMap((key) => allCandidates.find((item) => item.key === key) ?? []);
  if (selected.length !== requested.length) throw new Error("候選單字已變更，請重新整理後再選擇");
  const existingByKey = new Map(entry.vocabForgeExports.map((item) => [item.key, item]));
  const pending = selected.filter((candidate) => !existingByKey.has(candidate.key));
  if (entry.vocabForgeExports.length + pending.length > 3) throw new Error("每筆素材最多送出三個單字，避免詞庫一次增加太多");

  if (!pending.length) {
    return { entry, exports: selected.flatMap((candidate) => existingByKey.get(candidate.key) ?? []) };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      sourceSystem: "Lumen Dojo",
      sourceType: entry.route === "game" ? "野採・遊戲英文" : entry.route === "classroom" ? "野採・課堂英文" : "野採・英文日常",
      sourceDate: entry.capturedAt.slice(0, 10),
      sourceRecordId: entry.id,
      topicTitle: entry.title,
      vocabBook: selectedBook,
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
      result: imported.result,
      syncedAt: now,
    };
  });
  const updated = await saveEnglishImageEntry({ ...entry, vocabForgeExports: [...entry.vocabForgeExports, ...newExports] });
  const updatedByKey = new Map(updated.vocabForgeExports.map((item) => [item.key, item]));
  return { entry: updated, exports: selected.flatMap((candidate) => updatedByKey.get(candidate.key) ?? []) };
}
