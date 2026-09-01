export const TOPIC_STUDY_TITLE_PREFIX = "行光英文主題修習-";

export type TopicStudyStage = "finding" | "absorbing" | "discussing" | "completed";

export type TopicStudyExport = {
  key: string;
  expression: string;
  result: "created" | "existing";
  syncedAt: string;
};

export type TopicStudyRound = {
  version: 1;
  recordType: "english-topic-study";
  id: string;
  topicTitle: string;
  courseTitle: string;
  classDate: string;
  videoUrl: string;
  videoTitle: string;
  summary: string;
  expressions: string;
  discussionNote: string;
  discussionDate: string | null;
  respeakDate: string | null;
  vocabForgeExports: TopicStudyExport[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TopicStudyCandidate = {
  key: string;
  expression: string;
  meaning: string;
  sourceText: string;
  finalSentence: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableDate(value: unknown): string | null {
  return typeof value === "string" && DATE_RE.test(value) ? value : null;
}

function safeUrl(value: unknown): string {
  const text = stringValue(value).trim().slice(0, 2000);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function topicStudyCandidateKey(expression: string): string {
  return expression
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .trim()
    .replace(/[.!?。！？]+$/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

export function topicStudyCandidates(round: TopicStudyRound): TopicStudyCandidate[] {
  const candidates = round.expressions.split(/\r?\n/).flatMap((line) => {
    const clean = line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").trim();
    if (!clean) return [];
    const [expression = "", ...meaningParts] = clean.split(/\s*(?:\||｜|—|–|：|\s-\s)\s*/);
    const normalizedExpression = expression.trim().replace(/^['“”「」]|['“”「」]$/g, "").slice(0, 240);
    if (!normalizedExpression) return [];
    return [{
      key: topicStudyCandidateKey(normalizedExpression),
      expression: normalizedExpression,
      meaning: meaningParts.join(" — ").trim().slice(0, 500),
      sourceText: round.summary.trim().slice(0, 1900),
      finalSentence: round.discussionNote.trim().slice(0, 1900),
    }];
  });
  return [...new Map(candidates.filter((item) => item.key).map((item) => [item.key, item])).values()].slice(0, 12);
}

function normalizeExports(value: unknown): TopicStudyExport[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<TopicStudyExport>;
    const expression = stringValue(source.expression).trim().slice(0, 240);
    const key = stringValue(source.key, topicStudyCandidateKey(expression)).slice(0, 180);
    const syncedAt = stringValue(source.syncedAt).slice(0, 80);
    if (!expression || !key || !syncedAt) return [];
    return [{
      key,
      expression,
      result: source.result === "existing" ? "existing" as const : "created" as const,
      syncedAt,
    }];
  }).slice(-30);
}

export function topicStudyRecordTitle(id: string): string {
  return `${TOPIC_STUDY_TITLE_PREFIX}${id}`;
}

export function emptyTopicStudyRound(params: {
  id: string;
  topicTitle: string;
  classDate: string;
  videoUrl?: string;
}): TopicStudyRound {
  const now = new Date().toISOString();
  return {
    version: 1,
    recordType: "english-topic-study",
    id: params.id.slice(0, 80),
    topicTitle: params.topicTitle.trim().slice(0, 300),
    courseTitle: "Speaking Class",
    classDate: DATE_RE.test(params.classDate) ? params.classDate : now.slice(0, 10),
    videoUrl: safeUrl(params.videoUrl),
    videoTitle: "",
    summary: "",
    expressions: "",
    discussionNote: "",
    discussionDate: null,
    respeakDate: null,
    vocabForgeExports: [],
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeTopicStudyRound(value: unknown): TopicStudyRound | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<TopicStudyRound>;
  const id = stringValue(source.id).trim().slice(0, 80);
  const topicTitle = stringValue(source.topicTitle).trim().slice(0, 300);
  const classDate = DATE_RE.test(stringValue(source.classDate)) ? stringValue(source.classDate) : "";
  if (!id || !topicTitle || !classDate) return null;
  const base = emptyTopicStudyRound({ id, topicTitle, classDate, videoUrl: source.videoUrl });
  return {
    ...base,
    courseTitle: stringValue(source.courseTitle, "Speaking Class").trim().slice(0, 200) || "Speaking Class",
    videoTitle: stringValue(source.videoTitle).trim().slice(0, 500),
    summary: stringValue(source.summary).trim().slice(0, 6000),
    expressions: stringValue(source.expressions).slice(0, 4000),
    discussionNote: stringValue(source.discussionNote).trim().slice(0, 6000),
    discussionDate: nullableDate(source.discussionDate),
    respeakDate: nullableDate(source.respeakDate),
    vocabForgeExports: normalizeExports(source.vocabForgeExports),
    completedAt: typeof source.completedAt === "string" ? source.completedAt : null,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : base.createdAt,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : base.updatedAt,
  };
}

export function topicStudyStage(round: TopicStudyRound): TopicStudyStage {
  if (round.completedAt) return "completed";
  if (round.summary.trim()) return "discussing";
  if (round.videoUrl) return "absorbing";
  return "finding";
}

export function canCompleteTopicStudy(round: TopicStudyRound): boolean {
  return Boolean(round.videoUrl && round.summary.trim() && round.discussionNote.trim());
}

export function sevenDaysAfter(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 7);
  return value.toISOString().slice(0, 10);
}
