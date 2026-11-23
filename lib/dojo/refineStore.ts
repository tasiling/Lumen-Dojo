import "server-only";

import { createHash } from "node:crypto";
import { getCaptureEntry } from "./captureStore";
import { LearningError } from "./learningFoundation/model";
import { listJsonRecords, readJsonRecord, updateJsonRecordById, upsertJsonRecord } from "./notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import {
  REFINE_DEFAULT_RULES, buildRefinePackage, checkRefineReturn, parseRefineReturn, refineParagraphs, refineRescuePrompt,
  type RefineAngleKey, type RefineChecks, type RefineRound, type RefineSource,
} from "./captureRefine";
import {
  REFINE_SETTINGS_TITLE, REFINE_TITLE_PREFIX, captureOriginal, fitRefineRecord, newRefineId, newRefineRecord,
  normalizeRefineRecord, refineLabels, refinePick, refineSetupProblem, withRefineReturn,
  type RefineRecord, type RefineStoredSource, type RefineTitleFrom,
} from "./refineRecord";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const locks = new Map<string, Promise<unknown>>();

/** Serializes writes to one round within this process, like capture updates. */
async function withRoundLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  locks.set(id, current);
  try { return await current; }
  finally { if (locks.get(id) === current) locks.delete(id); }
}

/** A capture's current original, as a source of a round. Throws when the capture has none. */
async function liveSource(captureId: string, label: string): Promise<RefineSource & { stored: RefineStoredSource; unsegmented: boolean }> {
  let capture;
  try { capture = (await getCaptureEntry(captureId)).capture; }
  catch { throw new LearningError("找不到其中一則採集，可能已被移除。", 404); }
  const original = captureOriginal(capture);
  if (original.state === "none") throw new LearningError(`「${capture.title}」沒有原文，請先補上全文再帶入。`, 422);
  const kind = original.kind;
  const stored: RefineStoredSource = {
    label, captureId, title: capture.title, author: original.author, kind, url: capture.sourceUrl,
    paragraphCount: refineParagraphs(original.text).length, textHash: hash(original.text),
  };
  return { label, captureId, title: capture.title, author: original.author, kind, url: capture.sourceUrl, text: original.text, stored, unsegmented: original.unsegmented };
}

async function liveSources(captureIds: string[]) {
  const labels = refineLabels(captureIds.length);
  return Promise.all(captureIds.map((id, index) => liveSource(id, labels[index])));
}

export type RefineView = {
  record: RefineRecord;
  /** The discussion package for the current setup, built from the captures' current originals. */
  package: string;
  /** Labels whose original changed after the round was set up; checks then compare with the current text. */
  changed: string[];
  /** Labels whose original was stored as one line and is cut at sentence ends for now. */
  unsegmented: string[];
  /** Labels whose capture no longer exists or has lost its original. */
  missing: string[];
};

async function view(record: RefineRecord): Promise<RefineView> {
  const rules = await readRefineRules();
  const live = await Promise.all(record.sources.map(async (source) => {
    try { return await liveSource(source.captureId, source.label); } catch { return null; }
  }));
  const present = live.filter((item): item is NonNullable<typeof item> => item !== null);
  // Only the fields the package uses: the live source carries extra bookkeeping.
  const round: RefineRound = { id: record.id, topic: record.topic, angle: record.angle,
    sources: present.map(({ label, captureId, title, author, kind, url, text }) => ({ label, captureId, title, author, kind, url, text })) };
  return {
    record,
    package: present.length ? buildRefinePackage(round, rules) : "",
    changed: record.sources.filter((source, index) => live[index] && live[index]!.stored.textHash !== source.textHash).map((s) => s.label),
    unsegmented: present.filter((source) => source.unsegmented).map((source) => source.label),
    missing: record.sources.filter((_, index) => !live[index]).map((source) => source.label),
  };
}

async function readRecord(id: string) {
  if (!/^YC-\d{8}-[0-9A-Z]{4}$/.test(id)) throw new LearningError("淬鍊編號格式不符。", 400);
  const row = await readJsonRecord(REFINE_TITLE_PREFIX + id);
  const record = row && normalizeRefineRecord(row.value);
  if (!row || !record) throw new LearningError("找不到這一輪淬鍊。", 404);
  return { pageId: row.id, record };
}

async function write(pageId: string, record: RefineRecord) {
  const fitted = fitRefineRecord(record);
  if (!fitted) throw new LearningError("這份討論紀錄太長，超過 Notion 單一欄位能保存的長度。請請 GPT 分成兩輪收尾。", 413);
  await updateJsonRecordById(pageId, REFINE_TITLE_PREFIX, REFINE_TITLE_PREFIX + fitted.id, fitted);
  return fitted;
}

export async function getRefineRound(id: string): Promise<RefineView> {
  return view((await readRecord(id)).record);
}

/** Rounds a capture took part in, newest first. Reads only records titled with the round prefix. */
export async function listRefineRounds(captureId?: string): Promise<RefineRecord[]> {
  const rows = await listJsonRecords(REFINE_TITLE_PREFIX);
  return rows.map((row) => normalizeRefineRecord(row.value)).filter((record): record is RefineRecord => record !== null)
    .filter((record) => !captureId || record.sources.some((source) => source.captureId === captureId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createRefineRound(input: { topic: string; angle: string; captureIds: string[]; offeredCaptureIds?: string[] }): Promise<RefineView> {
  const problem = refineSetupProblem(input.topic, input.angle, input.captureIds);
  if (problem) throw new LearningError(problem, 400);
  if (input.captureIds.some((id) => !id.trim())) throw new LearningError("素材編號格式不符。", 400);
  const sources = await liveSources(input.captureIds);
  const now = new Date().toISOString();
  const record = newRefineRecord({
    id: newRefineId(), topic: input.topic, angle: input.angle as RefineAngleKey, sources: sources.map((s) => s.stored),
    offeredCaptureIds: input.offeredCaptureIds ?? [], now,
  });
  await createKnowledgeEntry({ 標題: REFINE_TITLE_PREFIX + record.id, 內容: JSON.stringify(record) });
  return view(record);
}

/** Changes the setup of a round that has not been returned yet. Removed captures stay recorded as left out. */
export async function configureRefineRound(id: string, input: { topic: string; angle: string; captureIds: string[] }): Promise<RefineView> {
  return withRoundLock(id, async () => {
    const { pageId, record } = await readRecord(id);
    if (record.status !== "open") throw new LearningError("這一輪已經貼回或結束，不能再改設定。可以另開一輪。", 409);
    const problem = refineSetupProblem(input.topic, input.angle, input.captureIds);
    if (problem) throw new LearningError(problem, 400);
    const sources = await liveSources(input.captureIds);
    const next: RefineRecord = {
      ...record, topic: input.topic.trim().slice(0, 500), angle: input.angle as RefineAngleKey, sources: sources.map((s) => s.stored),
      offeredCaptureIds: [...new Set([...record.offeredCaptureIds, ...input.captureIds])], updatedAt: new Date().toISOString(),
    };
    return view(await write(pageId, next));
  });
}

export type RefineReturnResult = {
  saved: boolean;
  checks: RefineChecks;
  rescue: string;
  view: RefineView;
};

/**
 * Checks what GPT returned against this round. A return for another round is refused; one missing sections is
 * not saved, and the owner gets a message to paste back. Otherwise it is saved with its checks.
 */
export async function returnRefineRound(id: string, raw: string): Promise<RefineReturnResult> {
  if (typeof raw !== "string" || !raw.trim()) throw new LearningError("請貼上 GPT 收尾時輸出的紀錄。", 400);
  if (raw.length > 400_000) throw new LearningError("貼上的內容太長。", 413);
  return withRoundLock(id, async () => {
    const { pageId, record } = await readRecord(id);
    if (record.status === "closed") throw new LearningError("這一輪已經結束。", 409);
    const live = await Promise.all(record.sources.map(async (source) => {
      try { return await liveSource(source.captureId, source.label); } catch { return null; }
    }));
    const round: RefineRound = {
      id: record.id, topic: record.topic, angle: record.angle,
      sources: record.sources.map((source, index) => live[index] ?? { ...source, text: "" }),
    };
    const parsed = parseRefineReturn(raw);
    const checks = checkRefineReturn(parsed, round);
    const rescue = refineRescuePrompt(checks);
    if (!checks.idOk || checks.missing.length) return { saved: false, checks, rescue, view: await view(record) };
    const saved = await write(pageId, withRefineReturn(record, parsed, checks, new Date().toISOString()));
    return { saved: true, checks, rescue, view: await view(saved) };
  });
}

export async function pickRefineCandidate(id: string, candidateN: number, titleFrom: RefineTitleFrom | null, rewritten = ""): Promise<RefineView> {
  return withRoundLock(id, async () => {
    const { pageId, record } = await readRecord(id);
    if (record.status !== "returned") throw new LearningError(record.status === "closed" ? "這一輪已經結束。" : "還沒有貼回討論紀錄。", 409);
    const others = record.picks.filter((pick) => pick.candidateN !== candidateN);
    if (titleFrom === null) return view(await write(pageId, { ...record, picks: others, updatedAt: new Date().toISOString() }));
    const now = new Date().toISOString();
    const pick = refinePick(record, candidateN, titleFrom, rewritten, now);
    if (typeof pick === "string") throw new LearningError(pick, 422);
    const picks = [...others, pick].sort((a, b) => a.candidateN - b.candidateN);
    return view(await write(pageId, { ...record, picks, updatedAt: now }));
  });
}

export async function closeRefineRound(id: string): Promise<RefineView> {
  return withRoundLock(id, async () => {
    const { pageId, record } = await readRecord(id);
    if (record.status === "closed") return view(record);
    return view(await write(pageId, { ...record, status: "closed", updatedAt: new Date().toISOString() }));
  });
}

// ---- 討論規則 ----

export async function readRefineRules(): Promise<string[]> {
  const row = await readJsonRecord(REFINE_SETTINGS_TITLE);
  const rules = (row?.value as { rules?: unknown } | null)?.rules;
  return Array.isArray(rules) && rules.some((rule) => typeof rule === "string" && rule.trim())
    ? rules.filter((rule): rule is string => typeof rule === "string" && Boolean(rule.trim()))
    : REFINE_DEFAULT_RULES;
}

/** Saves the owner's discussion rules. An empty list goes back to the default wording. */
export async function saveRefineRules(rules: unknown): Promise<string[]> {
  if (!Array.isArray(rules) || rules.some((rule) => typeof rule !== "string")) throw new LearningError("規則格式不符。", 400);
  const cleaned = rules.map((rule) => rule.trim().slice(0, 500)).filter(Boolean).slice(0, 40);
  await upsertJsonRecord(REFINE_SETTINGS_TITLE, { version: 1, recordType: "refine-settings", rules: cleaned, updatedAt: new Date().toISOString() });
  return cleaned.length ? cleaned : REFINE_DEFAULT_RULES;
}

