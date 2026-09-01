export const ENGLISH_JOURNAL_TITLE_PREFIX = "行光英文自譯-";

export type EnglishJournalStatus = "queued" | "drafting" | "comparing" | "completed";
export type EnglishJournalSegmentStatus = "untouched" | "drafted" | "comparing" | "finalized" | "skipped";

export type EnglishJournalSegment = {
  id: string;
  label: string;
  sourceText: string;
  draft: string;
  aiRevision: string;
  finalVersion: string;
  phrases: string;
  status: EnglishJournalSegmentStatus;
  promptCopiedAt: string | null;
};

export type EnglishJournalPractice = {
  version: 3;
  recordType: "english-journal-practice";
  date: string;
  sourceText: string;
  segments: EnglishJournalSegment[];
  vocabForgeExports: VocabForgeExport[];
  status: EnglishJournalStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VocabForgeCandidate = {
  key: string;
  segmentId: string;
  expression: string;
  meaning: string;
  sourceText: string;
  finalSentence: string;
};

export type VocabForgeExport = {
  key: string;
  expression: string;
  segmentId: string;
  result: "created" | "existing";
  syncedAt: string;
};

type LegacyEnglishJournalPractice = {
  date?: unknown;
  sourceText?: unknown;
  draft?: unknown;
  aiRevision?: unknown;
  finalVersion?: unknown;
  phrases?: unknown;
  promptCopiedAt?: unknown;
  completedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  segments?: unknown;
  vocabForgeExports?: unknown;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_HEADER_RE = /^行光(?:日記|每日紀錄)\s*\n日期：\d{4}-\d{2}-\d{2}\s*/;
const CLOSING_DISPOSITION_ONLY_RE = /^(?:【晚間復盤】\s*)?收光選擇\s*(?:帶回|寫下今天|暫且放下)\s*$/;
const LUMEN_HIGHLIGHT_LABEL = "一束光（今日亮點：今天值得記住的美好時刻）";

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function vocabForgeCandidateKey(expression: string): string {
  return expression
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .trim()
    .replace(/[.!?。！？]+$/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

function phraseParts(line: string): { expression: string; meaning: string } | null {
  const clean = line
    .replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "")
    .trim();
  if (!clean) return null;
  const [expression = "", ...meaningParts] = clean.split(/\s*(?:\||｜|—|–|：|\s-\s)\s*/);
  const normalizedExpression = expression.trim().replace(/^['“”「」]|['“”「」]$/g, "");
  if (!normalizedExpression) return null;
  return { expression: normalizedExpression.slice(0, 240), meaning: meaningParts.join(" — ").trim().slice(0, 500) };
}

export function englishJournalVocabCandidates(practice: EnglishJournalPractice): VocabForgeCandidate[] {
  const candidates = practice.segments.flatMap((segment) => {
    if (segment.status === "skipped") return [];
    const finalSentence = segment.finalVersion.trim() || segment.aiRevision.trim() || segment.draft.trim();
    return segment.phrases
      .split(/\r?\n/)
      .flatMap((line) => phraseParts(line) ?? [])
      .map(({ expression, meaning }) => ({
        key: vocabForgeCandidateKey(expression),
        segmentId: segment.id,
        expression,
        meaning,
        sourceText: segment.sourceText,
        finalSentence,
      }));
  });
  return [...new Map(candidates.filter((candidate) => candidate.key).map((candidate) => [candidate.key, candidate])).values()];
}

function normalizeVocabForgeExports(value: unknown): VocabForgeExport[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<VocabForgeExport>;
    const expression = stringValue(source.expression).trim().slice(0, 240);
    const key = stringValue(source.key, vocabForgeCandidateKey(expression)).slice(0, 180);
    const segmentId = stringValue(source.segmentId).slice(0, 80);
    const syncedAt = stringValue(source.syncedAt).slice(0, 80);
    if (!expression || !key || !segmentId || !syncedAt) return [];
    return [{ key, expression, segmentId, result: source.result === "existing" ? "existing" as const : "created" as const, syncedAt }];
  });
}

function segmentStatus(segment: Omit<EnglishJournalSegment, "status">, requested?: unknown): EnglishJournalSegmentStatus {
  if (requested === "skipped") return "skipped";
  if (segment.finalVersion.trim()) return "finalized";
  if (segment.aiRevision.trim() || segment.promptCopiedAt) return "comparing";
  if (segment.draft.trim()) return "drafted";
  return "untouched";
}

function segmentLabel(text: string, index: number): string {
  const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  const bracketed = firstLine.match(/^【(.+)】$/)?.[1];
  if (bracketed) return bracketed;
  if (firstLine.startsWith("一束光（")) return "一束光";
  if (firstLine.length <= 18 && text.includes("\n")) return firstLine.replace(/[：:]$/, "");
  return `第 ${index + 1} 段`;
}

function coachFriendlySourceText(value: string): string {
  return value
    .replace(/^一束光\s*$/m, LUMEN_HIGHLIGHT_LABEL)
    .trim();
}

function isClosingDispositionOnly(value: string): boolean {
  return CLOSING_DISPOSITION_ONLY_RE.test(value.replace(/\r/g, "").trim());
}

export function splitEnglishJournalSource(sourceText: string): EnglishJournalSegment[] {
  const clean = sourceText.trim().replace(SOURCE_HEADER_RE, "").trim();
  const chunks = clean
    .split(/\n\s*\n+/)
    .map((part) => coachFriendlySourceText(part))
    .filter((part) => part && !isClosingDispositionOnly(part));
  const usable = chunks.length ? chunks : clean ? [clean] : [];
  return usable.map((text, index) => {
    const base = {
      id: `segment-${index + 1}`,
      label: segmentLabel(text, index),
      sourceText: text.slice(0, 12000),
      draft: "",
      aiRevision: "",
      finalVersion: "",
      phrases: "",
      promptCopiedAt: null,
    };
    return { ...base, status: segmentStatus(base) };
  });
}

function normalizeSegment(value: unknown, index: number): EnglishJournalSegment | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<EnglishJournalSegment>;
  const sourceText = coachFriendlySourceText(stringValue(source.sourceText)).slice(0, 12000);
  if (!sourceText) return null;
  const hasLearningWork = [source.draft, source.aiRevision, source.finalVersion, source.phrases]
    .some((field) => stringValue(field).trim());
  // Older queued practices may contain a segment made only from the closing
  // choice. Remove it lazily, while preserving any segment the user already
  // worked on.
  if (isClosingDispositionOnly(sourceText) && !hasLearningWork) return null;
  const base = {
    id: stringValue(source.id, `segment-${index + 1}`).slice(0, 80),
    label: stringValue(source.label, segmentLabel(sourceText, index)).slice(0, 80),
    sourceText,
    draft: stringValue(source.draft).slice(0, 12000),
    aiRevision: stringValue(source.aiRevision).slice(0, 12000),
    finalVersion: stringValue(source.finalVersion).slice(0, 12000),
    phrases: stringValue(source.phrases).slice(0, 4000),
    promptCopiedAt: nullableString(source.promptCopiedAt),
  };
  return { ...base, status: segmentStatus(base, source.status) };
}

function canCompleteSegments(segments: EnglishJournalSegment[]): boolean {
  const active = segments.filter((segment) => segment.status !== "skipped");
  return active.length > 0 && segments.every(canCompleteSegment);
}

function practiceStatus(segments: EnglishJournalSegment[], completedAt: string | null): EnglishJournalStatus {
  if (completedAt && segments.length && canCompleteSegments(segments)) return "completed";
  if (segments.some((segment) => segment.status === "comparing" || segment.status === "finalized")) return "comparing";
  if (segments.some((segment) => segment.status === "drafted" || segment.status === "skipped")) return "drafting";
  return "queued";
}

function legacySegment(source: LegacyEnglishJournalPractice, sourceText: string): EnglishJournalSegment[] {
  const draft = stringValue(source.draft).slice(0, 30000);
  const aiRevision = stringValue(source.aiRevision).slice(0, 30000);
  const finalVersion = stringValue(source.finalVersion).slice(0, 30000);
  const phrases = stringValue(source.phrases).slice(0, 12000);
  if (!draft && !aiRevision && !finalVersion && !phrases) return splitEnglishJournalSource(sourceText);
  const base = {
    id: "legacy-full-entry",
    label: "舊版全文",
    sourceText: sourceText.trim().slice(0, 30000),
    draft,
    aiRevision,
    finalVersion,
    phrases,
    promptCopiedAt: nullableString(source.promptCopiedAt),
  };
  return [{ ...base, status: segmentStatus(base) }];
}

export function englishJournalRecordTitle(date: string): string {
  return `${ENGLISH_JOURNAL_TITLE_PREFIX}${date.replace(/-/g, "")}`;
}

export function emptyEnglishJournalPractice(date: string, sourceText: string): EnglishJournalPractice {
  const now = new Date().toISOString();
  const cleanSource = sourceText.trim().slice(0, 30000);
  return {
    version: 3,
    recordType: "english-journal-practice",
    date,
    sourceText: cleanSource,
    segments: splitEnglishJournalSource(cleanSource),
    vocabForgeExports: [],
    status: "queued",
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeEnglishJournalPractice(
  value: unknown,
  expectedDate?: string,
): EnglishJournalPractice | null {
  const source = value && typeof value === "object" ? value as LegacyEnglishJournalPractice : {};
  const date = expectedDate && DATE_RE.test(expectedDate)
    ? expectedDate
    : DATE_RE.test(stringValue(source.date)) ? stringValue(source.date) : null;
  if (!date) return null;
  const sourceText = stringValue(source.sourceText).trim().slice(0, 30000);
  const base = emptyEnglishJournalPractice(date, sourceText);
  const suppliedSegments = Array.isArray(source.segments)
    ? source.segments.flatMap((segment, index) => normalizeSegment(segment, index) ?? [])
    : [];
  const segments = suppliedSegments.length ? suppliedSegments : legacySegment(source, sourceText);
  const completedAt = nullableString(source.completedAt);
  const status = practiceStatus(segments, completedAt);
  const vocabForgeExports = normalizeVocabForgeExports(source.vocabForgeExports);

  return {
    ...base,
    segments,
    vocabForgeExports,
    status,
    completedAt: status === "completed" ? completedAt : null,
    createdAt: nullableString(source.createdAt) ?? base.createdAt,
    updatedAt: nullableString(source.updatedAt) ?? base.updatedAt,
  };
}

export function canCompleteSegment(segment: EnglishJournalSegment): boolean {
  if (segment.status === "skipped") return true;
  return Boolean(segment.draft.trim() && (segment.aiRevision.trim() || segment.finalVersion.trim()));
}

export function canCompleteEnglishJournal(practice: EnglishJournalPractice): boolean {
  return canCompleteSegments(practice.segments);
}

export function englishJournalFinalText(practice: EnglishJournalPractice): string {
  return practice.segments
    .filter((segment) => segment.status !== "skipped")
    .map((segment) => segment.finalVersion.trim() || segment.aiRevision.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function englishJournalCoachPrompt(segment: EnglishJournalSegment): string {
  return `你是我的英文日記教練。這次只處理一個段落，不要延伸或代寫其他內容。

請比較中文原文與我的英文初稿。保留我的原意與語氣，主要使用 B1–B2 程度的自然英文。
若中文含有行光道場的欄位名稱，請依照括號內的一般語意理解；例如「一束光」指今天值得記住的美好時刻或今日亮點，不要把品牌式名稱逐字直譯。

請依序提供：
1. 保留我原本語氣的修正版
2. 更自然的英文版本
3. 最值得理解的 1–3 個修正
4. 最多 2 個可重複用於生活或工作的片語或搭配詞，並附中文意思

【目前段落的中文原文】
${segment.sourceText.trim()}

【我的英文初稿】
${segment.draft.trim()}`;
}
