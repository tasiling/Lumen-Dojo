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
  contextNotes: string;
  status: EnglishJournalSegmentStatus;
  promptCopiedAt: string | null;
  completedAt: string | null;
};

export type EnglishJournalPractice = {
  version: 4;
  recordType: "english-journal-practice";
  date: string;
  sourceText: string;
  segments: EnglishJournalSegment[];
  vocabForgeExports: VocabForgeExport[];
  contextExports: EnglishContextExport[];
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

export type EnglishContextCandidate = {
  key: string;
  segmentId: string;
  kind: "sentence-pattern" | "grammar";
  focus: string;
  note: string;
  sourceText: string;
  originalSentence: string;
  correctedSentence: string;
};

export type EnglishContextExport = {
  key: string;
  focus: string;
  segmentId: string;
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
  contextExports?: unknown;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_HEADER_RE = /^行光(?:日記|每日紀錄)\s*\n日期：\d{4}-\d{2}-\d{2}\s*/;
const CLOSING_DISPOSITION_ONLY_RE = /^(?:【晚間復盤】\s*)?收光選擇\s*(?:帶回|寫下今天|暫且放下)\s*$/;
const LUMEN_HIGHLIGHT_LABEL = "一束光（今日亮點：今天值得記住的美好時刻）";
const JOURNAL_SECTION_CONTAINERS = new Set(["晚間復盤", "晨間", "本日三件事", "白天追蹤"]);
const JOURNAL_FIELD_LABEL_RE = /^(?:晨間層級|今日意圖|此刻狀態|我很感恩的三件事|我的正向肯定句|我的未來日記|一束光(?:（.+）)?|卡住的地方|看見了什麼|下一步|帶回(?:之後|\s+\d{4}-\d{2}-\d{2})?|收光選擇)$/;

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
    .replace(/^\s*(?:單字|word)\s*[：:]\s*/i, "")
    .trim();
  if (!clean) return null;
  const parenthetical = clean.match(/^([A-Za-z]+(?:['’-][A-Za-z]+)*)\s*[（(]([^）)]+)[）)]\s*$/);
  if (parenthetical) {
    return { expression: parenthetical[1].slice(0, 240), meaning: parenthetical[2].trim().slice(0, 500) };
  }
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
      .filter(({ expression }) => /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(expression))
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

function contextCandidateKey(kind: string, focus: string): string {
  return `${kind}:${focus}`
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 220);
}

function contextNoteBlocks(value: string): string[] {
  const clean = value.trim();
  if (!clean) return [];
  const blankLineBlocks = clean.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean);
  if (blankLineBlocks.length > 1) return blankLineBlocks.slice(0, 2);
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const explicitStarts = lines.reduce<number[]>((indexes, line, index) => {
    if (/^(?:[-*•]|\d+[.)、])?\s*(?:句型|語法)\s*(?:\||｜|：|:)/.test(line)) indexes.push(index);
    return indexes;
  }, []);
  if (explicitStarts.length <= 1) return [clean];
  return explicitStarts.slice(0, 2).map((start, index) => lines.slice(start, explicitStarts[index + 1] ?? lines.length).join("\n"));
}

function contextParts(block: string): { kind: "sentence-pattern" | "grammar"; focus: string; note: string } | null {
  const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const explicit = lines[0].replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").split(/\s*(?:\||｜)\s*/);
  if (explicit[0] === "句型" || explicit[0] === "語法") {
    const focus = (explicit[1] ?? "").trim().slice(0, 500);
    if (!focus) return null;
    return {
      kind: explicit[0] === "語法" ? "grammar" : "sentence-pattern",
      focus,
      note: [...explicit.slice(2), ...lines.slice(1)].join(" — ").trim().slice(0, 800),
    };
  }
  const first = lines[0]
    .replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "")
    .replace(/^(?:句型|語法)\s*[：:]\s*/, "")
    .replace(/\s*[（(][^）)]*[）)]\s*$/, "")
    .trim();
  if (!first || !/[A-Za-z]/.test(first)) return null;
  const kind = /(?:語法|grammar|修正|時態|語序|→)/i.test(block) ? "grammar" as const : "sentence-pattern" as const;
  return { kind, focus: first.slice(0, 500), note: lines.slice(1).join(" — ").slice(0, 800) };
}

export function englishJournalContextCandidates(practice: EnglishJournalPractice): EnglishContextCandidate[] {
  const candidates = practice.segments.flatMap((segment) => {
    if (segment.status === "skipped") return [];
    const correctedSentence = segment.finalVersion.trim() || segment.aiRevision.trim();
    return contextNoteBlocks(segment.contextNotes).flatMap((block) => {
      const parsed = contextParts(block);
      if (!parsed) return [];
      return [{
        key: contextCandidateKey(parsed.kind, parsed.focus),
        segmentId: segment.id,
        kind: parsed.kind,
        focus: parsed.focus,
        note: parsed.note,
        sourceText: segment.sourceText,
        originalSentence: segment.draft.trim(),
        correctedSentence,
      }];
    });
  });
  return [...new Map(candidates.map((candidate) => [candidate.key, candidate])).values()];
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

function normalizeContextExports(value: unknown): EnglishContextExport[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<EnglishContextExport>;
    const key = stringValue(source.key).slice(0, 220);
    const focus = stringValue(source.focus).slice(0, 500);
    const segmentId = stringValue(source.segmentId).slice(0, 80);
    const syncedAt = stringValue(source.syncedAt).slice(0, 80);
    if (!key || !focus || !segmentId || !syncedAt) return [];
    return [{ key, focus, segmentId, syncedAt }];
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

function fieldLabel(line: string): string | null {
  const clean = line.trim().replace(/[：:]$/, "");
  if (!JOURNAL_FIELD_LABEL_RE.test(clean)) return null;
  if (clean.startsWith("一束光")) return "一束光";
  return clean;
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
  const blocks = clean.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean);
  const grouped: Array<{ label: string; text: string }> = [];
  let sectionName = "";

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const section = lines[0]?.trim().match(/^【(.+)】$/)?.[1] ?? null;
    if (section) {
      sectionName = section;
      lines.shift();
      if (!lines.some((line) => line.trim())) continue;
    }
    const text = coachFriendlySourceText(lines.join("\n"));
    if (!text || isClosingDispositionOnly(text)) continue;
    const firstLine = text.split("\n").find((line) => line.trim()) ?? "";
    const label = fieldLabel(firstLine);
    if (label) {
      grouped.push({ label, text });
      continue;
    }
    if (sectionName && !JOURNAL_SECTION_CONTAINERS.has(sectionName) && (
      grouped.length === 0 || grouped[grouped.length - 1]?.label !== sectionName
    )) {
      grouped.push({ label: sectionName, text: `${sectionName}\n${text}` });
      continue;
    }
    if (grouped.length) {
      const last = grouped[grouped.length - 1];
      last.text = `${last.text}\n\n${text}`;
    } else {
      grouped.push({ label: sectionName || "日記內容", text });
    }
  }

  const usable = grouped.length ? grouped : clean ? [{ label: "日記內容", text: clean }] : [];
  return usable.map(({ text, label }, index) => {
    const base = {
      id: `segment-${index + 1}`,
      label: label || segmentLabel(text, index),
      sourceText: text.slice(0, 12000),
      draft: "",
      aiRevision: "",
      finalVersion: "",
      phrases: "",
      contextNotes: "",
      promptCopiedAt: null,
      completedAt: null,
    };
    return { ...base, status: segmentStatus(base) };
  });
}

function normalizeSegment(value: unknown, index: number, legacyPracticeCompletedAt?: string | null): EnglishJournalSegment | null {
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
    contextNotes: stringValue(source.contextNotes).slice(0, 5000),
    promptCopiedAt: nullableString(source.promptCopiedAt),
    completedAt: nullableString(source.completedAt),
  };
  if (!base.completedAt && legacyPracticeCompletedAt && base.draft.trim() && (base.aiRevision.trim() || base.finalVersion.trim())) {
    base.completedAt = legacyPracticeCompletedAt;
  }
  return { ...base, status: segmentStatus(base, source.status) };
}

function canCompleteSegments(segments: EnglishJournalSegment[]): boolean {
  const active = segments.filter((segment) => segment.status !== "skipped");
  return active.length > 0 && segments.every((segment) => segment.status === "skipped" || Boolean(segment.completedAt));
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
    contextNotes: "",
    promptCopiedAt: nullableString(source.promptCopiedAt),
    completedAt: nullableString(source.completedAt),
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
    version: 4,
    recordType: "english-journal-practice",
    date,
    sourceText: cleanSource,
    segments: splitEnglishJournalSource(cleanSource),
    vocabForgeExports: [],
    contextExports: [],
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
  const legacyCompletedAt = nullableString(source.completedAt);
  const suppliedSegments = Array.isArray(source.segments)
    ? source.segments.flatMap((segment, index) => normalizeSegment(segment, index, legacyCompletedAt) ?? [])
    : [];
  const segments = suppliedSegments.length ? suppliedSegments : legacySegment(source, sourceText);
  const completedAt = nullableString(source.completedAt);
  const status = practiceStatus(segments, completedAt);
  const vocabForgeExports = normalizeVocabForgeExports(source.vocabForgeExports);
  const contextExports = normalizeContextExports(source.contextExports);

  return {
    ...base,
    segments,
    vocabForgeExports,
    contextExports,
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
4. 最多 3 個值得記住的單字，格式為「單字｜中文意思」；不要列片語或完整句子
5. 最多 2 個值得換情境再練的句型或語法，格式為「句型｜句型骨架｜適合練習的情境」或「語法｜修正重點｜適合練習的情境」

【目前段落的中文原文】
${segment.sourceText.trim()}

【我的英文初稿】
${segment.draft.trim()}`;
}
