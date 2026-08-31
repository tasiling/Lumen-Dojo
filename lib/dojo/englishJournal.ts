export const ENGLISH_JOURNAL_TITLE_PREFIX = "行光英文自譯-";

export type EnglishJournalStatus = "queued" | "drafting" | "comparing" | "completed";

export type EnglishJournalPractice = {
  version: 1;
  recordType: "english-journal-practice";
  date: string;
  sourceText: string;
  draft: string;
  aiRevision: string;
  finalVersion: string;
  phrases: string;
  status: EnglishJournalStatus;
  promptCopiedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function englishJournalRecordTitle(date: string): string {
  return `${ENGLISH_JOURNAL_TITLE_PREFIX}${date.replace(/-/g, "")}`;
}

export function emptyEnglishJournalPractice(date: string, sourceText: string): EnglishJournalPractice {
  const now = new Date().toISOString();
  return {
    version: 1,
    recordType: "english-journal-practice",
    date,
    sourceText: sourceText.trim().slice(0, 30000),
    draft: "",
    aiRevision: "",
    finalVersion: "",
    phrases: "",
    status: "queued",
    promptCopiedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeEnglishJournalPractice(
  value: unknown,
  expectedDate?: string,
): EnglishJournalPractice | null {
  const source = value && typeof value === "object" ? value as Partial<EnglishJournalPractice> : {};
  const date = expectedDate && DATE_RE.test(expectedDate)
    ? expectedDate
    : DATE_RE.test(stringValue(source.date)) ? stringValue(source.date) : null;
  if (!date) return null;
  const base = emptyEnglishJournalPractice(date, stringValue(source.sourceText));
  const draft = stringValue(source.draft).slice(0, 30000);
  const aiRevision = stringValue(source.aiRevision).slice(0, 30000);
  const finalVersion = stringValue(source.finalVersion).slice(0, 30000);
  const completedAt = nullableString(source.completedAt);
  let status: EnglishJournalStatus = "queued";
  if (completedAt && draft.trim() && (aiRevision.trim() || finalVersion.trim())) status = "completed";
  else if (nullableString(source.promptCopiedAt) || aiRevision.trim()) status = "comparing";
  else if (draft.trim()) status = "drafting";

  return {
    ...base,
    sourceText: stringValue(source.sourceText).trim().slice(0, 30000),
    draft,
    aiRevision,
    finalVersion,
    phrases: stringValue(source.phrases).slice(0, 12000),
    status,
    promptCopiedAt: nullableString(source.promptCopiedAt),
    completedAt: status === "completed" ? completedAt : null,
    createdAt: nullableString(source.createdAt) ?? base.createdAt,
    updatedAt: nullableString(source.updatedAt) ?? base.updatedAt,
  };
}

export function canCompleteEnglishJournal(practice: EnglishJournalPractice): boolean {
  return Boolean(practice.draft.trim() && (practice.aiRevision.trim() || practice.finalVersion.trim()));
}

export function englishJournalCoachPrompt(practice: EnglishJournalPractice): string {
  return `你是我的英文日記教練。

請比較中文原文與我的英文初稿。不要改變原意，也不要使用超出 B1–B2 太多的艱深表達。

請依序提供：
1. 保留我原本語氣的修正版
2. 更自然的英文版本
3. 最值得理解的 3–5 個修正
4. 可重複用於生活或工作的慣用語與搭配詞
5. 每個慣用語的中文意思及一個貼近我生活的例句

不要只列單一生詞，優先提取片語、搭配詞和完整表達。

【中文原文】
${practice.sourceText.trim()}

【我的英文初稿】
${practice.draft.trim()}`;
}

