/**
 * 逐字稿校正的純邏輯：分段、機器檢查與兩版比對。不讀寫資料、不呼叫模型，前後端共用。
 * 規格見 docs/schema/逐字稿校正.md。
 */

/** Marks a spot the model could not make out. It is not counted as a change of wording. */
export const TIDY_UNSURE = "〔？〕";
/** Whole-text character count may differ from the Traditional original by at most this share. */
export const TIDY_MAX_LENGTH_DRIFT = 0.03;
/** A paragraph whose wording changed more than this share counts as rewritten and is reverted. */
export const TIDY_MAX_PARAGRAPH_CHANGE = 0.15;
/** Below this many characters a transcript is not worth a model call; it is only converted to Traditional. */
export const TIDY_MIN_CHARS = 30;

export type TidyState = "done" | "failed" | "skipped";
/** Stored as `clip.transcript.tidy`. `reverted` lists 1-based paragraphs that kept the Traditional original. */
export type TranscriptTidy = {
  text: string;
  at: string;
  model: string;
  changes: number;
  state: TidyState;
  reverted: number[];
};

/**
 * Paragraphs of a transcript. Paragraph boundaries are blank lines; a single line break inside a paragraph is a
 * break the model added. The tidy text keeps the same boundaries, so paragraph n of both versions is the same span.
 */
export function tidyParagraphs(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

export function joinTidyParagraphs(paragraphs: string[]): string {
  return paragraphs.map((part) => part.replace(/\n{2,}/g, "\n").trim()).join("\n\n");
}

/** The words only: punctuation, spacing, line breaks and 〔？〕 removed, so allowed edits do not count. */
export function tidyWords(text: string): string {
  return text.replaceAll(TIDY_UNSURE, "").replace(/[\s\p{P}\p{S}]/gu, "");
}

/** Levenshtein distance between two strings, by code point. */
export function editDistance(a: string, b: string): number {
  const x = [...a], y = [...b];
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let previous = Array.from({ length: y.length + 1 }, (_, index) => index);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++)
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[y.length];
}

/** Share of the original paragraph's words that were changed; punctuation and breaks are free. */
export function paragraphChange(base: string, tidy: string): number {
  const before = tidyWords(base), after = tidyWords(tidy);
  if (!before.length) return after.length ? 1 : 0;
  return editDistance(before, after) / [...before].length;
}

function bigrams(text: string): Set<string> {
  const chars = [...tidyWords(text)];
  const out = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) out.add(chars[i] + chars[i + 1]);
  return out;
}

/**
 * A sentence of the tidy paragraph with no counterpart in the original: most of its character pairs do not occur
 * there. Short sentences are skipped, since a corrected homophone can change most pairs of a few characters.
 */
export function addedSentences(base: string, tidy: string): string[] {
  const original = bigrams(base);
  return tidy.split(/(?<=[。！？!?；;…\n])/u).map((part) => part.trim()).filter((sentence) => {
    const pairs = bigrams(sentence);
    if (pairs.size < 5) return false;
    let shared = 0;
    for (const pair of pairs) if (original.has(pair)) shared++;
    return shared / pairs.size < 0.5;
  });
}

/** Why a corrected paragraph cannot be used, or "" when it can. */
export function tidyParagraphProblem(base: string, tidy: string | undefined): string {
  if (tidy === undefined || !tidy.trim()) return "沒有收到這一段";
  const change = paragraphChange(base, tidy);
  if (change > TIDY_MAX_PARAGRAPH_CHANGE) return `改動 ${Math.round(change * 100)}%，視為改寫`;
  if (addedSentences(base, tidy).length) return "出現原稿沒有的句子";
  return "";
}

/** Whole-text check: the corrected words may differ in count from the Traditional original by at most 3%. */
export function lengthDrift(base: string, tidy: string): number {
  const before = [...tidyWords(base)].length, after = [...tidyWords(tidy)].length;
  return before ? Math.abs(after - before) / before : after ? 1 : 0;
}

export type TidyCheckResult = { paragraphs: string[]; reverted: number[]; reasons: Record<number, string> };

/**
 * Applies the machine checks. Each paragraph that fails keeps the Traditional original; if the whole result then
 * still drifts more than 3% in length, every paragraph does.
 */
export function checkTidy(base: string[], tidy: (string | undefined)[]): TidyCheckResult {
  const reasons: Record<number, string> = {};
  const paragraphs = base.map((paragraph, index) => {
    const problem = tidyParagraphProblem(paragraph, tidy[index]);
    if (problem) { reasons[index + 1] = problem; return paragraph; }
    return tidy[index]!.replace(/\r\n?/g, "\n").replace(/\n{2,}/g, "\n").trim();
  });
  if (lengthDrift(base.join(""), paragraphs.join("")) > TIDY_MAX_LENGTH_DRIFT) {
    return { paragraphs: base, reverted: base.map((_, index) => index + 1), reasons: Object.fromEntries(base.map((_, index) => [index + 1, "全文字數相差超過 3%"])) };
  }
  return { paragraphs, reverted: Object.keys(reasons).map(Number).sort((a, b) => a - b), reasons };
}

export type TidyHunk = { before: string; after: string };

/**
 * The changed spans between two versions of a paragraph, by character, merging neighbours. Used both to count
 * changes and to show 「改了哪裡」; the stored record keeps only the count.
 */
export function tidyHunks(before: string, after: string): TidyHunk[] {
  const x = [...before], y = [...after];
  // LCS table from the end, so the walk below goes forward.
  const table = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const hunks: TidyHunk[] = [];
  let current: TidyHunk | null = null;
  let i = 0, j = 0;
  const flush = () => { if (current) hunks.push(current); current = null; };
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { flush(); i++; j++; continue; }
    current ??= { before: "", after: "" };
    if (j >= y.length || (i < x.length && table[i + 1][j] >= table[i][j + 1])) current.before += x[i++];
    else current.after += y[j++];
  }
  flush();
  return hunks;
}

export function countTidyChanges(base: string[], tidy: string[]): number {
  return base.reduce((sum, paragraph, index) => sum + tidyHunks(paragraph, tidy[index] ?? paragraph).length, 0);
}

/** Paragraph pairs that differ, for 「改了哪裡」. */
export function tidyComparison(baseText: string, tidyText: string): { n: number; before: string; after: string; hunks: TidyHunk[] }[] {
  const base = tidyParagraphs(baseText), tidy = tidyParagraphs(tidyText);
  return base.flatMap((before, index) => {
    const after = tidy[index] ?? before;
    const hunks = tidyHunks(before, after);
    return hunks.length ? [{ n: index + 1, before, after, hunks }] : [];
  });
}

/** Groups paragraphs into batches of about `size` characters, each with the last two sentences before it. */
export function tidyBatches(paragraphs: string[], size = 2400): { start: number; paragraphs: string[]; context: string }[] {
  const batches: { start: number; paragraphs: string[]; context: string }[] = [];
  let current: string[] = [], start = 0, length = 0;
  paragraphs.forEach((paragraph, index) => {
    if (current.length && length + paragraph.length > size) {
      batches.push({ start, paragraphs: current, context: "" });
      current = []; start = index; length = 0;
    }
    current.push(paragraph); length += paragraph.length;
  });
  if (current.length) batches.push({ start, paragraphs: current, context: "" });
  for (let b = 1; b < batches.length; b++) {
    const previous = batches[b - 1].paragraphs.join("");
    const sentences = previous.split(/(?<=[。！？!?；;…])/u).map((part) => part.trim()).filter(Boolean);
    // Speech often comes without punctuation; then the context is simply the last stretch of the previous batch.
    batches[b].context = [...sentences.slice(-2).join("")].slice(-80).join("");
  }
  return batches;
}
