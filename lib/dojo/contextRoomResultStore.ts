import {withLearningWriteLock} from './learningFoundation/fileLock';
import {learningWriteOutcome} from './learningFoundation/writeOutcome';
import {assertTaskActive,carryRecordTitle} from './weeklyTasks';
import "server-only";

import { createHash } from "node:crypto";
import {
  CONTEXT_ROOM_RESULT_TITLE_PREFIX,
  CONTEXT_PRACTICE_MODE_LABELS,
  contextResultCanCompleteActivity,
  contextResultDuplicateKey,
  missingContextResultFields,
  normalizeContextRoomDraft,
  normalizeContextRoomResult,
  type ContextActivityCandidate,
  type ContextRoomResult,
  type ContextRoomResultDraft,
} from "./contextRoomResult";
import {
  DAILY_TASK_CATEGORIES,
  bingoRecordTitle,
  dailyRecordTitle,
  mondayOf,
  normalizeDailyRecord,
  normalizeWeeklyBoard,
  taipeiTodayISO,
} from "./formal";
import { syncLearningActivity } from "./learningStore";
import {
  listJsonRecords,
  readJsonRecord,
  updateJsonRecordById,
  upsertJsonRecord,
} from "./notionStore";

type StoredContextResult = ContextRoomResult & { id: string };
const CONTEXT_ACTIVITY_PRACTICE_TYPES = new Set(["context-room", "class-topic", "reading", "context-chat"]);

function recordHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function recordTitle(key: string): string {
  return `${CONTEXT_ROOM_RESULT_TITLE_PREFIX}${recordHash(key)}`;
}

function resultRecordTitle(draft: ContextRoomResultDraft): string {
  return recordTitle(`duplicate:${contextResultDuplicateKey(draft)}`);
}

function activityId(weekStart: string, cellIndex: number, templateKey: string): string {
  return `${weekStart}:${cellIndex}:${templateKey}`;
}

function parseActivityId(value: string): { weekStart: string; cellIndex: number; templateKey: string } | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}):(\d{1,2}):(.+)$/);
  if (!match) return null;
  const cellIndex = Number(match[2]);
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 24 || cellIndex === 12) return null;
  return { weekStart: match[1], cellIndex, templateKey: match[3] };
}

function compactEvidence(result: ContextRoomResult): string {
  const batch = result.batchLabel ? `｜${result.batchLabel}` : "";
  const secondTake = result.secondTakeCompleted ? "・Second Take 完成" : "";
  const focus = result.focus ? `・卡點：${result.focus}` : "";
  return `語境修習室・${result.materialTitle}${batch}・${result.topicLabel}・${CONTEXT_PRACTICE_MODE_LABELS[result.practiceMode]}${secondTake}${focus}`.slice(0, 2000);
}

export async function listContextActivityCandidates(): Promise<ContextActivityCandidate[]> {
  const weekStart = mondayOf(taipeiTodayISO());
  const row = await readJsonRecord(bingoRecordTitle(weekStart));
  if (!row) return [];
  const board = normalizeWeeklyBoard(row.value, weekStart);
  if (board.archivedAt) return [];
  const links=await listJsonRecords(`行光續排-${weekStart}-`);
  const carriedIds=new Set(links.map(row=>(row.value as {taskInstanceId:string}).taskInstanceId));
  return board.cells.flatMap((cell) => {
    if (
      cell.index === 12 ||
      !cell.text.trim() ||
      cell.completed || cell.disposition || (cell.taskInstanceId&&carriedIds.has(cell.taskInstanceId)) ||
      cell.completion.target !== 1 ||
      cell.learning?.trackKey !== "english" ||
      (cell.learning.path ?? "practice") !== "practice" ||
      !CONTEXT_ACTIVITY_PRACTICE_TYPES.has(cell.learning.practiceType ?? "")
    ) return [];
    return [{
      id: activityId(weekStart, cell.index, cell.learning.templateKey),
      weekStart,
      cellIndex: cell.index,
      templateKey: cell.learning.templateKey,
      title: cell.text,
      shortLabel: cell.shortLabel || cell.text,
      categoryLabel: cell.category ? DAILY_TASK_CATEGORIES[cell.category].label : "尚未定色",
      assignedDate: cell.assignedDate,
      progress: cell.completion.progress,
      target: cell.completion.target,
      unit: cell.completion.unit,
    }];
  });
}

export async function listRecentContextResults(limit = 3): Promise<StoredContextResult[]> {
  const rows = await listJsonRecords(CONTEXT_ROOM_RESULT_TITLE_PREFIX);
  return rows
    .flatMap((row) => {
      const result = normalizeContextRoomResult(row.value);
      return result ? [{ ...result, id: row.id }] : [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, Math.min(20, limit)));
}

async function findExistingResult(draft: ContextRoomResultDraft): Promise<StoredContextResult | null> {
  const duplicateRow = await readJsonRecord(resultRecordTitle(draft));
  const duplicateResult = duplicateRow ? normalizeContextRoomResult(duplicateRow.value) : null;
  if (duplicateRow && duplicateResult) return { ...duplicateResult, id: duplicateRow.id };
  if (draft.sourceEventId) {
    const rows = await listJsonRecords(CONTEXT_ROOM_RESULT_TITLE_PREFIX);
    for (const row of rows) {
      const result = normalizeContextRoomResult(row.value);
      if (result?.sourceEventId === draft.sourceEventId) return { ...result, id: row.id };
    }
  }
  return null;
}

async function completeExactActivityUnlocked(result: StoredContextResult): Promise<{ activityLabel: string | null; completedAt: string | null }> {
  if (!result.linkedActivityId) return { activityLabel: null, completedAt: null };
  const target = parseActivityId(result.linkedActivityId);
  if (!target) throw new Error("關聯的英文活動識別碼不正確");
  const row = await readJsonRecord(bingoRecordTitle(target.weekStart));
  if (!row) throw new Error("找不到要關聯的週盤");
  const board = normalizeWeeklyBoard(row.value, target.weekStart);
  if (board.archivedAt) throw new Error("已封存的週盤不能再由成果完成");
  const cell = board.cells[target.cellIndex];
  const expectedId = cell?.learning
    ? activityId(target.weekStart, target.cellIndex, cell.learning.templateKey)
    : "";
  if (
    !cell ||
    expectedId !== result.linkedActivityId ||
    cell.learning?.trackKey !== "english" ||
    (cell.learning.path ?? "practice") !== "practice" ||
    cell.completion.target !== 1
  ) throw new Error("這項英文活動已變更，請重新選擇尚未完成的活動");
  assertTaskActive(cell,cell.taskInstanceId&&await readJsonRecord(carryRecordTitle(target.weekStart,cell.taskInstanceId))?"後續週盤":undefined);
  if (target.templateKey === "context-room-deep-practice" && !result.secondTakeCompleted) {
    throw new Error("新版語境修習格需要完成 Second Take／Revised Draft 後才能完成");
  }

  const completedAt = cell.completedAt ?? new Date().toISOString();
  if (!cell.completed) {
    cell.completion.progress = 1;
    cell.completed = true;
    cell.completedAt = completedAt;
    cell.evidenceNote = compactEvidence(result);
    await upsertJsonRecord(bingoRecordTitle(board.weekStart), normalizeWeeklyBoard(board, board.weekStart));
  }

  if (cell.assignedDate && cell.assignedCategory) {
    const dailyRow = await readJsonRecord(dailyRecordTitle(cell.assignedDate));
    if (dailyRow) {
      const daily = normalizeDailyRecord(dailyRow.value, cell.assignedDate);
      const task = daily.tasks[cell.assignedCategory];
      if (
        task.origin?.type === "bingo" &&
        task.origin.weekStart === target.weekStart &&
        task.origin.cellIndex === target.cellIndex
      ) {
        task.completed = true;
        task.completedAt = completedAt;
        task.result = compactEvidence(result).slice(0, 1000);
        await upsertJsonRecord(dailyRecordTitle(cell.assignedDate), normalizeDailyRecord(daily, cell.assignedDate));
      }
    }
  }
  await syncLearningActivity({ weekStart: target.weekStart, cell });
  return { activityLabel: cell.shortLabel || cell.text, completedAt };
}

async function completeExactActivity(result:StoredContextResult){return learningWriteOutcome.getStore()?completeExactActivityUnlocked(result):withLearningWriteLock(()=>completeExactActivityUnlocked(result));}

export async function saveContextRoomResult(params: {
  draft: unknown;
  linkedActivityId?: unknown;
}): Promise<{ result: StoredContextResult; duplicate: boolean; activityLabel: string | null }> {
  const draft = normalizeContextRoomDraft(params.draft);
  const missing = missingContextResultFields(draft);
  if (missing.length) throw new Error(`還缺少：${missing.join("、")}`);
  const linkedActivityId = typeof params.linkedActivityId === "string" && params.linkedActivityId.trim()
    ? params.linkedActivityId.trim().slice(0, 300)
    : null;
  if (linkedActivityId && !contextResultCanCompleteActivity(draft)) {
    throw new Error("這份摘要尚未達到完成門檻，可以先保存為不關聯活動的自由修習");
  }

  const existing = await findExistingResult(draft);
  if (existing) {
    let activityLabel: string | null = null;
    if (
      existing.linkedActivityId &&
      existing.linkedActivityId === linkedActivityId &&
      !existing.linkedActivityCompletedAt
    ) {
      const synced = await completeExactActivity(existing);
      activityLabel = synced.activityLabel;
      if (synced.completedAt) {
        const updated = { ...existing, linkedActivityCompletedAt: synced.completedAt };
        await updateJsonRecordById(existing.id, CONTEXT_ROOM_RESULT_TITLE_PREFIX, resultRecordTitle(existing), updated);
        return { result: updated, duplicate: true, activityLabel };
      }
    }
    return { result: existing, duplicate: true, activityLabel };
  }

  const duplicateKey = contextResultDuplicateKey(draft);
  const result: ContextRoomResult = {
    ...draft,
    version: 1,
    recordType: "context-room-result",
    sourceSystem: "context_room",
    activityType: "english_context_practice",
    duplicateKey,
    topicLabel: draft.topicLabel!,
    practiceMode: draft.practiceMode!,
    contextRoomStatus: draft.contextRoomStatus!,
    linkedActivityId,
    linkedActivityCompletedAt: null,
    createdAt: new Date().toISOString(),
  };
  const title = resultRecordTitle(draft);
  const created = await upsertJsonRecord(title, result);
  let stored: StoredContextResult = { ...result, id: created.id };
  let activityLabel: string | null = null;
  if (linkedActivityId) {
    const synced = await completeExactActivity(stored);
    activityLabel = synced.activityLabel;
    if (synced.completedAt) {
      stored = { ...stored, linkedActivityCompletedAt: synced.completedAt };
      await updateJsonRecordById(stored.id, CONTEXT_ROOM_RESULT_TITLE_PREFIX, title, stored);
    }
  }
  return { result: stored, duplicate: false, activityLabel };
}
