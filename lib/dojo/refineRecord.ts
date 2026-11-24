/**
 * 野採淬鍊的資料形狀：素材的原文判定、DB-14 淬鍊紀錄、候選挑選。純函式，前後端共用，不讀寫任何資料。
 * 規格見 docs/schema/野採淬鍊升級.md。
 */
import type { CaptureEntry } from "./formal";
import {
  REFINE_ANGLES, REFINE_MAX_SOURCES, refineParagraphs,
  type RefineAngleKey, type RefineCardType, type RefineCandidate, type RefineChecks, type RefineQuote, type RefineReturn, type RefineTurn,
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
    // A corrected transcript is the original for discussion; its paragraph numbers are the ones cited. Uncorrected
    // speech recognition is used only when no correction exists. The raw recognition stays on the capture either way.
    const tidy = transcript.tidy;
    parts.push((parts.length ? "〔影片逐字稿〕\n" : "") + (tidy?.text.trim() || transcript.text.trim()));
    kinds.push(!tidy ? "逐字稿" : tidy.state === "done" ? "逐字稿，經校正" : "逐字稿，已轉繁體");
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
/** A candidate the owner chose, with where its title came from and its card type. Becomes a DB-22 card when saved. */
export type RefinePick = { candidateN: number; titleFrom: RefineTitleFrom; title: string; cardType: RefineCardType; pickedAt: string };

export const REFINE_CARD_TYPES: RefineCardType[] = ["觀點", "洞察", "手法觀察"];
/** DB-22「標題來歷」options, in the owner's words. */
export const REFINE_TITLE_ORIGINS: Record<RefineTitleFrom, string> = { 原話: "本人原話", 整理版: "採用整理版", 改寫: "本人改寫" };

/** 「手法觀察」 is a card type only when the round looked at craft. */
export function refineCardTypes(angle: RefineAngleKey): RefineCardType[] {
  return angle === "craft" ? REFINE_CARD_TYPES : REFINE_CARD_TYPES.filter((type) => type !== "手法觀察");
}

/** The type GPT gave a candidate when it is allowed in this round, otherwise 觀點, for the owner to change. */
export function refineDefaultCardType(angle: RefineAngleKey, type: string): RefineCardType {
  return (refineCardTypes(angle) as string[]).includes(type) ? type as RefineCardType : "觀點";
}
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
    // Picks saved before card types existed take the candidate's own type, as a new pick would.
    picks: array<RefinePick>(raw.picks).map((pick) => ({
      ...pick,
      cardType: pick.cardType ?? refineDefaultCardType(angle, array<RefineCandidate>(raw.candidates).find((c) => c.n === pick.candidateN)?.type ?? ""),
    })),
    adopted: array(raw.adopted),
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
export function refinePick(
  record: RefineRecord, candidateN: number, titleFrom: RefineTitleFrom, rewritten: string, now: string, cardType?: string,
): RefinePick | string {
  const candidate = record.candidates.find((item) => item.n === candidateN);
  if (!candidate) return "找不到這個候選。";
  if (record.adopted.some((item) => item.candidateN === candidateN)) return "這個候選已經存成卡片，不能再更改。";
  const type = cardType ?? refineDefaultCardType(record.angle, candidate.type);
  if (!(refineCardTypes(record.angle) as string[]).includes(type))
    return type === "手法觀察" ? "「手法觀察」只用在「換個角度與看手法」的一輪。" : "卡片類型只能是觀點、洞察或手法觀察。";
  if (!candidate.words.trim()) return "這個候選沒有附上本人原話，不能挑選。";
  const verified = record.checks.words.some((check) => check.n === candidateN && check.ok);
  if (!verified && titleFrom !== "改寫") return "這個候選的原話沒有通過逐字檢查，標題只能由你自己改寫。";
  const title = titleFrom === "原話" ? candidate.words : titleFrom === "整理版" ? candidate.tidy : rewritten;
  if (!title.trim()) return titleFrom === "整理版" ? "這個候選沒有整理版，請改用原話或自己改寫。" : "請寫下標題。";
  return { candidateN, titleFrom, title: title.trim().slice(0, 500), cardType: type as RefineCardType, pickedAt: now };
}

/** Everything a DB-22 card stores, built from a pick. The round id and candidate number make the card findable again. */
export type RefineCardDraft = {
  title: string;
  words: string;
  titleOrigin: string;
  cardType: RefineCardType;
  quote: string;
  discussion: string;
  captureIds: string[];
};

/** The prefix of 「出自討論」 that identifies one candidate's card, so a retried save finds the card it already made. */
export function refineCardKey(roundId: string, candidateN: number): string {
  return `${roundId}｜候選#${candidateN}｜`;
}

/**
 * Builds a card from a pick. `sources` are the round's captures with their current originals; the cited sentences
 * come from the return's verbatim quotes, else from the cited paragraph itself. Returns a reason when it cannot.
 */
export function refineCardDraft(
  record: RefineRecord, candidateN: number, sources: { label: string; captureId: string; title: string; text: string }[],
): RefineCardDraft | string {
  const pick = record.picks.find((item) => item.candidateN === candidateN);
  const candidate = record.candidates.find((item) => item.n === candidateN);
  if (!pick || !candidate) return "請先挑選這個候選，決定標題。";
  if (!candidate.words.trim()) return "這個候選沒有本人原話，不能存成卡片。";
  const verified = record.checks.words.some((check) => check.n === candidateN && check.ok);
  if (!verified && pick.titleFrom !== "改寫") return "這個候選的原話沒有通過逐字檢查，標題只能由你自己改寫。";
  if (!pick.title.trim()) return "這個候選還沒有標題。";
  // 「我的原話」 must be what the owner said. When GPT's 原話 did not match verbatim, the owner's whole turn is kept instead.
  const words = verified ? candidate.words : refineOwnTurn(record, candidate.turn);
  if (!words) return `T${candidate.turn} 不是你的發言，或這場討論太長沒有逐字保存它，無法保存本人原話。`;
  const byLabel = new Map(sources.map((source) => [source.label, source]));
  const refs = [...new Set(candidate.reply.match(/C\d+\s*-\s*P\d+/g)?.map((ref) => ref.replace(/\s+/g, "")) ?? [])];
  const quote = refs.map((ref) => {
    const [label, paragraph] = ref.split("-P");
    const source = byLabel.get(label);
    const quoted = record.quotes.filter((item) => item.label === label && item.paragraph === Number(paragraph)).map((item) => item.text);
    const text = quoted.length ? quoted.join("……") : source ? refineParagraphs(source.text)[Number(paragraph) - 1] ?? "" : "";
    return `〔${source?.title ?? label}〕${ref}｜${text || "（這一段已不在原文中）"}`;
  }).join("\n");
  const turns = [candidate.turn, ...candidate.merged.filter((n) => n !== candidate.turn)].map((n) => `T${n}`).join(",");
  return {
    title: pick.title,
    words,
    titleOrigin: REFINE_TITLE_ORIGINS[pick.titleFrom],
    cardType: pick.cardType,
    quote,
    discussion: `${refineCardKey(record.id, candidateN)}${turns}｜題目：${record.topic}`,
    captureIds: sources.map((source) => source.captureId),
  };
}

/** The owner's own turn, verbatim, or "" when the turn is GPT's or was not kept. */
export function refineOwnTurn(record: Pick<RefineRecord, "turns">, n: number): string {
  const turn = record.turns.find((item) => item.n === n);
  return turn?.who === "我" ? turn.text.trim() : "";
}

/** Records a saved card on the round. Its pick can no longer change. */
export function withRefineAdopted(record: RefineRecord, candidateN: number, cardId: string, now: string): RefineRecord {
  if (record.adopted.some((item) => item.candidateN === candidateN)) return record;
  return { ...record, adopted: [...record.adopted, { candidateN, cardId }].sort((a, b) => a.candidateN - b.candidateN), updatedAt: now };
}
