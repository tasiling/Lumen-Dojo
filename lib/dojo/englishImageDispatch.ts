import "server-only";

import type { EnglishImageEntry, EnglishImageVocabExport } from "./englishImage";
import { getEnglishImageEntry, saveEnglishImageEntry } from "./englishImageStore";

export type EnglishImageVocabCandidate = {
  key: string;
  expression: string;
  meaning: string;
  sourceText: string;
  finalSentence: string;
};

function candidateKey(expression: string): string {
  return expression.normalize("NFKC").toLocaleLowerCase("en").trim().replace(/\s+/g, "_").slice(0, 180);
}

export function englishImageVocabCandidates(entry: EnglishImageEntry): EnglishImageVocabCandidate[] {
  const source = entry.vocabularyWords.trim() || entry.learningPhrases;
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
  return process.env.CONTEXT_ROOM_URL?.trim() || "https://lumen-context-room-production-4a2c.up.railway.app";
}

export async function prepareEnglishImageForContextRoom(id: string): Promise<EnglishImageEntry> {
  const { entry } = await getEnglishImageEntry(id);
  if (!entry.englishRecord.trim() && !entry.ocrText.trim()) throw new Error("請先完成 AI 分析或補上英文原文");
  const params = new URLSearchParams({
    create: "forage",
    title: entry.title,
    materialType: entry.route === "game" ? "game" : "daily",
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

type ImportResult = { key: string; expression: string; result: "created" | "existing" };

function vocabForgeEndpoint(): URL | null {
  const base = process.env.VOCABFORGE_INTEGRATION_URL?.trim();
  if (!base) return null;
  try { return new URL("/api/integrations/lumen/import", base); }
  catch { return null; }
}

export async function exportEnglishImageVocab(id: string, requestedKey: string): Promise<{ entry: EnglishImageEntry; exported: EnglishImageVocabExport }> {
  const endpoint = vocabForgeEndpoint();
  const secret = process.env.LUMEN_VOCABFORGE_SYNC_SECRET?.trim();
  if (!endpoint || !secret) throw new Error("VocabForge 串接尚未完成 Railway 設定");
  const { entry } = await getEnglishImageEntry(id);
  const candidate = englishImageVocabCandidates(entry).find((item) => item.key === requestedKey);
  if (!candidate) throw new Error("找不到這個候選單字，請重新整理後再選擇");
  const existing = entry.vocabForgeExports.find((item) => item.key === candidate.key);
  if (existing) return { entry, exported: existing };
  if (entry.vocabForgeExports.length >= 3) throw new Error("每筆素材最多送出三個單字，避免詞庫一次增加太多");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      sourceSystem: "Lumen Dojo",
      sourceType: entry.route === "game" ? "野採・遊戲英文" : "野採・英文日常",
      sourceDate: entry.capturedAt.slice(0, 10),
      sourceRecordId: entry.id,
      topicTitle: entry.title,
      vocabBook: entry.route === "game" ? "遊戲英文" : "英文日常",
      items: [candidate],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; items?: ImportResult[] };
  if (!response.ok) throw new Error(result.error ?? `VocabForge 接收失敗（${response.status}）`);
  const imported = result.items?.find((item) => item.key === candidate.key);
  if (!imported || (imported.result !== "created" && imported.result !== "existing")) throw new Error("VocabForge 回傳的接收結果不完整");
  const exported: EnglishImageVocabExport = { key: candidate.key, expression: candidate.expression, result: imported.result, syncedAt: new Date().toISOString() };
  const updated = await saveEnglishImageEntry({ ...entry, vocabForgeExports: [...entry.vocabForgeExports, exported] });
  return { entry: updated, exported };
}
