import "server-only";

import { ENTRY_TITLE_PREFIX, taipeiTodayISO } from "./formal";
import { LearningError } from "./learningFoundation/model";
import { archiveJsonRecordById, listJsonRecords, readJsonRecord, updateJsonRecordById } from "./notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry } from "@/lib/notion/queries";
import {
  AWARENESS_TITLE_PREFIX, AWARENESS_WRITING_MAX, awarenessCarry, awarenessMatches, awarenessRescuePrompt, awarenessSummary,
  buildAwarenessPackage, checkAwarenessReturn, confirmAwareness, fitAwarenessRecord, isAwarenessId, isAwarenessMethod, newAwarenessId,
  newAwarenessRecord, normalizeAwarenessRecord, parseAwarenessReturn, withAwarenessReturn,
  type AwarenessChecks, type AwarenessDecision, type AwarenessRecord, type AwarenessSummary,
} from "./emotionAwareness";

// These records are private. Nothing here writes a life trace (DB-19), and no
// error or log line may carry the writing or the talk: messages name ids only.

const locks = new Map<string, Promise<unknown>>();

/** Serializes writes to one round within this process. */
async function withRoundLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  locks.set(id, current);
  try { return await current; }
  finally { if (locks.get(id) === current) locks.delete(id); }
}

async function readRecord(id: string) {
  if (!isAwarenessId(id)) throw new LearningError("覺察編號格式不符。", 400);
  const row = await readJsonRecord(AWARENESS_TITLE_PREFIX + id);
  const record = row && normalizeAwarenessRecord(row.value);
  if (!row || !record) throw new LearningError("找不到這一筆覺察。", 404);
  return { pageId: row.id, record };
}

async function write(pageId: string, record: AwarenessRecord) {
  const fitted = fitAwarenessRecord(record);
  if (!fitted) throw new LearningError("這份討論紀錄太長，超過 Notion 單一欄位能保存的長度。請請 GPT 分成兩次收尾。", 413);
  await updateJsonRecordById(pageId, AWARENESS_TITLE_PREFIX, AWARENESS_TITLE_PREFIX + fitted.id, fitted);
  return fitted;
}

async function allRecords(): Promise<AwarenessRecord[]> {
  const rows = await listJsonRecords(AWARENESS_TITLE_PREFIX);
  return rows.map((row) => normalizeAwarenessRecord(row.value)).filter((record): record is AwarenessRecord => record !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type AwarenessView = {
  record: AwarenessRecord;
  /** The discussion package for the current writing and method. Empty once the talk has been pasted back. */
  package: string;
  /** The round this one continues, when it still exists. */
  previous: AwarenessSummary | null;
};

async function view(record: AwarenessRecord): Promise<AwarenessView> {
  let previous: AwarenessRecord | null = null;
  if (record.previousId) {
    try { previous = (await readRecord(record.previousId)).record; } catch { previous = null; }
  }
  return {
    record,
    package: record.status === "open" && record.writing.trim() ? buildAwarenessPackage(record, previous ? awarenessCarry(previous) : null) : "",
    previous: previous ? awarenessSummary(previous) : null,
  };
}

export async function getAwareness(id: string): Promise<AwarenessView> {
  return view((await readRecord(id)).record);
}

/** `rounds` are the ones matching the filter; `all` lets the page show versions and links without another request. */
export async function listAwareness(filter: { q?: string; from?: string; to?: string; archived?: boolean }): Promise<{ rounds: AwarenessSummary[]; all: AwarenessSummary[] }> {
  const records = await allRecords();
  return { rounds: records.filter((record) => awarenessMatches(record, filter)).map(awarenessSummary), all: records.map(awarenessSummary) };
}

async function checkedSetup(input: { writing: string; method: string; sourceEntryId?: string; previousId?: string }) {
  const writing = input.writing.trim();
  if (!writing) throw new LearningError("請先寫下一些內容。", 400);
  if (writing.length > AWARENESS_WRITING_MAX) throw new LearningError(`書寫太長，請控制在 ${AWARENESS_WRITING_MAX} 字以內。`, 413);
  if (!isAwarenessMethod(input.method)) throw new LearningError("請選一種覺察方式，或交給 GPT 推薦。", 400);
  return { writing, method: input.method };
}

export async function createAwareness(input: { writing: string; method: string; sourceEntryId?: string; previousId?: string }): Promise<AwarenessView> {
  const { writing, method } = await checkedSetup(input);
  const sourceEntryId = (input.sourceEntryId ?? "").trim();
  if (sourceEntryId) {
    const row = await getKnowledgeEntry(sourceEntryId).catch(() => null);
    if (!row || !row.標題.startsWith(ENTRY_TITLE_PREFIX)) throw new LearningError("找不到作為起點的那筆紀錄。", 404);
  }
  const previousId = (input.previousId ?? "").trim();
  if (previousId) await readRecord(previousId);
  const record = newAwarenessRecord({ id: newAwarenessId(), writing, method, sourceEntryId, previousId, date: taipeiTodayISO(), now: new Date().toISOString() });
  await createKnowledgeEntry({ 標題: AWARENESS_TITLE_PREFIX + record.id, 內容: JSON.stringify(record) });
  return view(record);
}

/** Changes the writing or method of a round that has not been pasted back yet. */
export async function configureAwareness(id: string, input: { writing: string; method: string }): Promise<AwarenessView> {
  return withRoundLock(id, async () => {
    const { pageId, record } = await readRecord(id);
    if (record.status !== "open") throw new LearningError("這一筆已經貼回討論紀錄，原始書寫不能再改。可以用它再開一輪。", 409);
    const { writing, method } = await checkedSetup(input);
    return view(await write(pageId, { ...record, writing, method, updatedAt: new Date().toISOString() }));
  });
}

export type AwarenessReturnResult = { saved: boolean; checks: AwarenessChecks; rescue: string; view: AwarenessView };

/**
 * Checks what GPT returned against this round. A return for another round, or one
 * missing sections, is not saved; the owner gets a message to paste back to GPT.
 */
export async function returnAwareness(id: string, raw: string): Promise<AwarenessReturnResult> {
  if (typeof raw !== "string" || !raw.trim()) throw new LearningError("請貼上 GPT 收尾時輸出的紀錄。", 400);
  if (raw.length > 400_000) throw new LearningError("貼上的內容太長。", 413);
  return withRoundLock(id, async () => {
    const { pageId, record } = await readRecord(id);
    if (record.status === "confirmed") throw new LearningError("這一筆已經存成正式紀錄。要重新貼回，請先按「重新確認」。", 409);
    const parsed = parseAwarenessReturn(raw);
    const checks = checkAwarenessReturn(parsed, record.id);
    const rescue = awarenessRescuePrompt(checks);
    if (!checks.idOk || checks.missing.length) return { saved: false, checks, rescue, view: await view(record) };
    const saved = await write(pageId, withAwarenessReturn(record, parsed, checks, new Date().toISOString()));
    return { saved: true, checks, rescue, view: await view(saved) };
  });
}

/** Saves the owner's choices as the formal part of the record. Nothing GPT wrote is taken without one. */
export async function confirmAwarenessRound(id: string, decision: AwarenessDecision): Promise<AwarenessView> {
  return withRoundLock(id, async () => {
    const { pageId, record } = await readRecord(id);
    const next = confirmAwareness(record, decision, new Date().toISOString());
    if (typeof next === "string") throw new LearningError(next, 422);
    return view(await write(pageId, next));
  });
}

/** Goes back to choosing: the formal part is cleared and the pasted talk stays. */
export async function reopenAwareness(id: string): Promise<AwarenessView> {
  return withRoundLock(id, async () => {
    const { pageId, record } = await readRecord(id);
    if (record.status !== "confirmed") return view(record);
    return view(await write(pageId, { ...record, status: "returned", confirmed: null, updatedAt: new Date().toISOString() }));
  });
}

export async function archiveAwareness(id: string, archived: boolean): Promise<AwarenessView> {
  return withRoundLock(id, async () => {
    const { pageId, record } = await readRecord(id);
    return view(await write(pageId, { ...record, archived, updatedAt: new Date().toISOString() }));
  });
}

/** Links two rounds by hand, in both directions, or removes the link. */
export async function linkAwareness(id: string, otherId: string, linked: boolean): Promise<AwarenessView> {
  if (id === otherId) throw new LearningError("不能連結到自己。", 400);
  const set = (record: AwarenessRecord, target: string) => ({
    ...record, updatedAt: new Date().toISOString(),
    linkedIds: linked ? [...new Set([...record.linkedIds, target])].slice(0, 30) : record.linkedIds.filter((item) => item !== target),
  });
  await withRoundLock(otherId, async () => {
    const other = await readRecord(otherId);
    await write(other.pageId, set(other.record, id));
  });
  return withRoundLock(id, async () => {
    const { pageId, record } = await readRecord(id);
    return view(await write(pageId, set(record, otherId)));
  });
}

/** Removes the round from the app. The Notion page goes to Notion's trash. */
export async function deleteAwareness(id: string): Promise<void> {
  await withRoundLock(id, async () => {
    const { pageId } = await readRecord(id);
    await archiveJsonRecordById(pageId, AWARENESS_TITLE_PREFIX);
  });
}
