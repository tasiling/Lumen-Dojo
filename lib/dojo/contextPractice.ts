import type { EnglishContextCandidate } from "./englishJournal";

export const CONTEXT_SEED_TITLE_PREFIX = "語境修習種子-";

export type ContextPracticeSeed = {
  version: 1;
  recordType: "context-practice-seed";
  id: string;
  sourceType: "english-journal";
  sourceDate: string;
  segmentId: string;
  kind: "sentence-pattern" | "grammar";
  focus: string;
  note: string;
  sourceText: string;
  originalSentence: string;
  correctedSentence: string;
  status: "queued" | "used";
  createdAt: string;
  usedAt: string | null;
};

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function contextSeedFromCandidate(candidate: EnglishContextCandidate, date: string): ContextPracticeSeed {
  return {
    version: 1,
    recordType: "context-practice-seed",
    id: candidate.key,
    sourceType: "english-journal",
    sourceDate: date,
    segmentId: candidate.segmentId,
    kind: candidate.kind,
    focus: candidate.focus,
    note: candidate.note,
    sourceText: candidate.sourceText,
    originalSentence: candidate.originalSentence,
    correctedSentence: candidate.correctedSentence,
    status: "queued",
    createdAt: new Date().toISOString(),
    usedAt: null,
  };
}

export function normalizeContextPracticeSeed(value: unknown): ContextPracticeSeed | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ContextPracticeSeed>;
  const id = stringValue(source.id).slice(0, 220);
  const focus = stringValue(source.focus).slice(0, 500);
  const sourceDate = stringValue(source.sourceDate).slice(0, 10);
  if (!id || !focus || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) return null;
  return {
    version: 1,
    recordType: "context-practice-seed",
    id,
    sourceType: "english-journal",
    sourceDate,
    segmentId: stringValue(source.segmentId).slice(0, 80),
    kind: source.kind === "grammar" ? "grammar" : "sentence-pattern",
    focus,
    note: stringValue(source.note).slice(0, 800),
    sourceText: stringValue(source.sourceText).slice(0, 12000),
    originalSentence: stringValue(source.originalSentence).slice(0, 12000),
    correctedSentence: stringValue(source.correctedSentence).slice(0, 12000),
    status: source.status === "used" ? "used" : "queued",
    createdAt: stringValue(source.createdAt, new Date().toISOString()).slice(0, 80),
    usedAt: typeof source.usedAt === "string" ? source.usedAt.slice(0, 80) : null,
  };
}

export function contextPracticePrompt(seed: ContextPracticeSeed): string {
  return `你是我的英文語境教練。請用一個簡短的生活對話，帶我主動使用下面這個${seed.kind === "grammar" ? "語法修正" : "句型"}。

練習重點：${seed.focus}
適合情境：${seed.note || "日常生活、學校或工作"}
我的原句：${seed.originalSentence || "未提供"}
參考修正版：${seed.correctedSentence || "未提供"}

規則：
1. 先用中文說明今天要練什麼，只說一到兩句。
2. 一次只問我一題，等我用英文回答後再繼續。
3. 不要先替我寫完整答案。
4. 對話進行 3 回合。
5. 結束時告訴我：我是否有正確用到練習重點、最需要調整的一點，以及一個可再次使用的自然版本。`;
}
