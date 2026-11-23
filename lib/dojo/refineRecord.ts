/**
 * 野採淬鍊的資料形狀：素材的原文判定、DB-14 淬鍊紀錄、候選挑選。純函式，前後端共用，不讀寫任何資料。
 * 規格見 docs/schema/野採淬鍊升級.md。
 */
import type { CaptureEntry } from "./formal";
import {
  REFINE_ANGLES, REFINE_MAX_SOURCES, refineParagraphs,
  type RefineAngleKey, type RefineCandidate, type RefineChecks, type RefineQuote, type RefineReturn, type RefineTurn,
} from "./captureRefine";

/** DB-14 title prefix of a round. Queries filter on it, so the whole knowledge base is never read. */
export const REFINE_TITLE_PREFIX = "行光淬鍊-";
/** The owner's discussion rules. Its title does not start with REFINE_TITLE_PREFIX, so it never lists as a round. */
export const REFINE_SETTINGS_TITLE = "行光淬鍊設定-討論規則";
/** Notion keeps at most 200,000 characters in one property; leave room so later edits (picks, closing) still fit. */
export const REFINE_JSON_BUDGET = 190_000;

// ---- 素材的原文 ----

export type CaptureOriginalState = "none" | "partial" | "unsegmented" | "ok";
export type CaptureOriginal = {
  text: string;
  kind: string;
  author: string;
  /** Threads gave only a preview, or the transcript was cut to fit Notion. */
  partial: boolean;
  /** Stored as one long line; paragraphs are cut at sentence ends for now. */
  unsegmented: boolean;
  state: CaptureOriginalState;
};

const STATE_LABELS: Record<CaptureOriginalState, string> = {
  none: "沒有原文",
  partial: "只有部分原文",
  unsegmented: "原文沒有分段",
  ok: "原文完整",
};
export function originalStateLabel(state: CaptureOriginalState): string {
  return STATE_LABELS[state];
}

function threadsAuthor(url: string | undefined): string {
  const name = url?.match(/threads\.(?:com|net)\/@([\w.]+)\//)?.[1];
  return name ? "@" + name : "";
}

/**
 * The text a capture is discussed from. A Threads post and a video transcript are the source's own words; an
 * excerpt is what was saved with the capture. A page summary fetched from a link counts only as partial.
 */
export function captureOriginal(capture: Pick<CaptureEntry, "excerpt" | "clip">): CaptureOriginal {
  const post = capture.clip.threadsPost;
  const transcript = capture.clip.transcript;
  const parts: string[] = [];
  const kinds: string[] = [];
  let partial = false;
  if (post?.text.trim()) { parts.push(post.text.trim()); kinds.push("貼文"); partial ||= post.partial; }
  if (transcript?.text.trim()) {
    parts.push((parts.length ? "〔影片逐字稿〕\n" : "") + transcript.text.trim());
    kinds.push("逐字稿");
    partial ||= transcript.truncated;
  }
  const excerpt = capture.excerpt.trim();
  if (!parts.length && excerpt) {
    const summary = excerpt === capture.clip.webPreview.description.trim();
    parts.push(excerpt);
    kinds.push(summary ? "網頁摘要" : "摘錄");
    partial = summary;
  }
  const text = parts.join("\n\n");
  if (!text) return { text: "", kind: "", author: "", partial: false, unsegmented: false, state: "none" };
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const unsegmented = lines.length === 1 && lines[0].length > 90 && refineParagraphs(text).length > 1;
  return {
    text, kind: kinds.join("＋"), author: threadsAuthor(post?.canonicalUrl), partial, unsegmented,
    state: partial ? "partial" : unsegmented ? "unsegmented" : "ok",
  };
}

// ---- 淬鍊紀錄 ----

export type RefineStatus = "open" | "returned" | "closed";
export type RefineStoredSource = {
  label: string; captureId: string; title: string; author: string; kind: string; url: string;
  paragraphCount: number; textHash: string;
};
export type RefineTitleFrom = "原話" | "整理版" | "改寫";
/** A candidate the owner chose, with where its title came from. Becomes a card once the card store is decided. */
export type RefinePick = { candidateN: number; titleFrom: RefineTitleFrom; title: string; pickedAt: string };
export type RefineRecord = {
  version: 1;
  recordType: "refine-round";
  id: string;
  topic: string;
  angle: RefineAngleKey;
  sources: RefineStoredSource[];
  offeredCaptureIds: string[];
  status: RefineStatus;
  returnedAt: string | null;
  format: string;
  turns: RefineTurn[];
  quotes: RefineQuote[];
  candidates: RefineCandidate[];
  extensions: string[];
  toVerify: string[];
  unanswered: string[];
  checks: Pick<RefineChecks, "quotes" | "words" | "missing" | "turnGaps">;
  picks: RefinePick[];
  adopted: { candidateN: number; cardId: string }[];
  /** Set when the return was too long for one Notion property and turns were left out; see fitRefineRecord. */
  omitted: { gptTurns: boolean; ownerTurns: number[] } | null;
  createdAt: string;
  updatedAt: string;
};

const emptyChecks = (): RefineRecord["checks"] => ({ quotes: [], words: [], missing: [], turnGaps: [] });

export function newRefineId(now = new Date(), random = Math.random): string {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `YC-${day}-${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0").toUpperCase()}`;
}

export function refineLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `C${index + 1}`);
}

/** Validates the setup of a round. Returns the reason it cannot be saved, or "" when it can. */
export function refineSetupProblem(topic: string, angle: string, captureIds: string[]): string {
  if (!topic.trim()) return "請先寫下這一輪的題目。";
  if (!(angle in REFINE_ANGLES)) return "請選一個出題角度。";
  if (!captureIds.length) return "請至少帶入一則採集。";
  if (captureIds.length > REFINE_MAX_SOURCES) return `一輪最多帶入 ${REFINE_MAX_SOURCES} 則採集。`;
  if (new Set(captureIds).size !== captureIds.length) return "同一則採集重複帶入了。";
  return "";
}

export function newRefineRecord(params: {
  id: string; topic: string; angle: RefineAngleKey; sources: RefineStoredSource[]; offeredCaptureIds: string[]; now: string;
}): RefineRecord {
  return {
    version: 1, recordType: "refine-round", id: params.id, topic: params.topic.trim().slice(0, 500), angle: params.angle,
    sources: params.sources, offeredCaptureIds: [...new Set([...params.offeredCaptureIds, ...params.sources.map((s) => s.captureId)])],
    status: "open", returnedAt: null, format: "", turns: [], quotes: [], candidates: [], extensions: [], toVerify: [],
    unanswered: [], checks: emptyChecks(), picks: [], adopted: [], omitted: null, createdAt: params.now, updatedAt: params.now,
  };
}

function array<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
const text = (value: unknown) => typeof value === "string" ? value : "";

/** Reads a stored round defensively. Returns null for anything that is not a round. */
export function normalizeRefineRecord(value: unknown): RefineRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.recordType !== "refine-round" || !text(raw.id) || !text(raw.topic)) return null;
  const angle = text(raw.angle) in REFINE_ANGLES ? raw.angle as RefineAngleKey : "understand";
  const status = raw.status === "returned" || raw.status === "closed" ? raw.status : "open";
  const checks = raw.checks && typeof raw.checks === "object" ? raw.checks as Record<string, unknown> : {};
  const omitted = raw.omitted && typeof raw.omitted === "object" ? raw.omitted as Record<string, unknown> : null;
  return {
    version: 1, recordType: "refine-round", id: text(raw.id), topic: text(raw.topic), angle,
    sources: array<RefineStoredSource>(raw.sources), offeredCaptureIds: array<string>(raw.offeredCaptureIds),
    status, returnedAt: text(raw.returnedAt) || null, format: text(raw.format),
    turns: array(raw.turns), quotes: array(raw.quotes), candidates: array(raw.candidates),
    extensions: array(raw.extensions), toVerify: array(raw.toVerify), unanswered: array(raw.unanswered),
    checks: { quotes: array(checks.quotes), words: array(checks.words), missing: array(checks.missing), turnGaps: array(checks.turnGaps) },
    picks: array(raw.picks), adopted: array(raw.adopted),
    omitted: omitted ? { gptTurns: omitted.gptTurns === true, ownerTurns: array<number>(omitted.ownerTurns) } : null,
    createdAt: text(raw.createdAt), updatedAt: text(raw.updatedAt) || text(raw.createdAt),
  };
}

/** Captures offered for the round but not taken into it: the record of what the owner chose to leave out. */
export function refineLeftOut(record: Pick<RefineRecord, "offeredCaptureIds" | "sources">): string[] {
  const taken = new Set(record.sources.map((source) => source.captureId));
  return record.offeredCaptureIds.filter((id) => !taken.has(id));
}

/** Stores a checked return on the round. Picks of the previous return are cleared, since candidate numbers change. */
export function withRefineReturn(record: RefineRecord, parsed: RefineReturn, checks: RefineChecks, now: string): RefineRecord {
  return {
    ...record, status: "returned", returnedAt: now, format: parsed.format, turns: parsed.turns, quotes: parsed.quotes,
    candidates: parsed.candidates, extensions: parsed.extensions, toVerify: parsed.toVerify, unanswered: parsed.unanswered,
    checks: { quotes: checks.quotes, words: checks.words, missing: checks.missing, turnGaps: checks.turnGaps },
    picks: [], omitted: null, updatedAt: now,
  };
}

/**
 * A round must fit one Notion property. When a long discussion does not, GPT's turns are left out first (the
 * candidates and checks already hold what was verified against them), then the owner's turns no candidate cites,
 * latest first. Returns null when even that does not fit.
 */
export function fitRefineRecord(record: RefineRecord, budget = REFINE_JSON_BUDGET): RefineRecord | null {
  const size = (value: RefineRecord) => JSON.stringify(value).length;
  if (size(record) <= budget) return record;
  let next: RefineRecord = {
    ...record,
    turns: record.turns.map((turn) => turn.who === "GPT" ? { ...turn, text: "" } : turn),
    omitted: { gptTurns: true, ownerTurns: [] },
  };
  const cited = new Set(record.candidates.flatMap((candidate) => [candidate.turn, ...candidate.merged]));
  const removable = next.turns.filter((turn) => turn.who === "我" && !cited.has(turn.n)).map((turn) => turn.n).reverse();
  for (const n of removable) {
    if (size(next) <= budget) break;
    next = {
      ...next,
      turns: next.turns.map((turn) => turn.n === n ? { ...turn, text: "" } : turn),
      omitted: { gptTurns: true, ownerTurns: [...next.omitted!.ownerTurns, n] },
    };
  }
  return size(next) <= budget ? next : null;
}

/**
 * Validates a pick. A candidate needs the owner's own words; one whose words were not verified verbatim can only
 * take a title the owner rewrites. Returns the pick to store, or a reason it is refused.
 */
export function refinePick(record: RefineRecord, candidateN: number, titleFrom: RefineTitleFrom, rewritten: string, now: string): RefinePick | string {
  const candidate = record.candidates.find((item) => item.n === candidateN);
  if (!candidate) return "找不到這個候選。";
  if (!candidate.words.trim()) return "這個候選沒有附上本人原話，不能挑選。";
  const verified = record.checks.words.some((check) => check.n === candidateN && check.ok);
  if (!verified && titleFrom !== "改寫") return "這個候選的原話沒有通過逐字檢查，標題只能由你自己改寫。";
  const title = titleFrom === "原話" ? candidate.words : titleFrom === "整理版" ? candidate.tidy : rewritten;
  if (!title.trim()) return titleFrom === "整理版" ? "這個候選沒有整理版，請改用原話或自己改寫。" : "請寫下標題。";
  return { candidateN, titleFrom, title: title.trim().slice(0, 500), pickedAt: now };
}
