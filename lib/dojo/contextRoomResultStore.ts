import "server-only";

import { BridgeError } from "./externalResults/model";
import { createPracticeOnce } from "./learningFoundation/practiceWrite";
import { learningOwner } from "./learningFoundation/store";
import { sourceIdentity } from "./practiceEvents/service";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { createHash } from "node:crypto";
import {
  CONTEXT_ROOM_RESULT_TITLE_PREFIX,
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
  mondayOf,
  normalizeWeeklyBoard,
  taipeiTodayISO,
} from "./formal";
import { listJsonRecords, readJsonRecord } from "./notionStore";

type StoredContextResult = ContextRoomResult & { id: string };
const CONTEXT_ACTIVITY_PRACTICE_TYPES = new Set([
  "context-room",
  "class-topic",
  "reading",
  "context-chat",
]);

function recordHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function recordTitle(key: string): string {
  return `${CONTEXT_ROOM_RESULT_TITLE_PREFIX}${recordHash(key)}`;
}

function resultRecordTitle(draft: ContextRoomResultDraft): string {
  return recordTitle(`duplicate:manual:${contextResultDuplicateKey(draft)}`);
}

function activityId(
  weekStart: string,
  cellIndex: number,
  templateKey: string,
): string {
  return `${weekStart}:${cellIndex}:${templateKey}`;
}

export async function listContextActivityCandidates(): Promise<
  ContextActivityCandidate[]
> {
  const weekStart = mondayOf(taipeiTodayISO());
  const row = await readJsonRecord(bingoRecordTitle(weekStart));
  if (!row) return [];
  const board = normalizeWeeklyBoard(row.value, weekStart);
  if (board.archivedAt) return [];
  return board.cells.flatMap((cell) => {
    if (
      cell.index === 12 ||
      !cell.text.trim() ||
      cell.completed ||
      cell.completion.target !== 1 ||
      cell.learning?.trackKey !== "english" ||
      (cell.learning.path ?? "practice") !== "practice" ||
      !CONTEXT_ACTIVITY_PRACTICE_TYPES.has(cell.learning.practiceType ?? "")
    )
      return [];
    return [
      {
        id: activityId(weekStart, cell.index, cell.learning.templateKey),
        weekStart,
        cellIndex: cell.index,
        templateKey: cell.learning.templateKey,
        title: cell.text,
        shortLabel: cell.shortLabel || cell.text,
        categoryLabel: cell.category
          ? DAILY_TASK_CATEGORIES[cell.category].label
          : "尚未定色",
        assignedDate: cell.assignedDate,
        progress: cell.completion.progress,
        target: cell.completion.target,
        unit: cell.completion.unit,
      },
    ];
  });
}

export async function listRecentContextResults(
  limit = 3,
): Promise<StoredContextResult[]> {
  const rows = await listJsonRecords(CONTEXT_ROOM_RESULT_TITLE_PREFIX);
  return rows
    .flatMap((row) => {
      const result = normalizeContextRoomResult(row.value);
      return result ? [{ ...result, id: row.id }] : [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, Math.min(20, limit)));
}

async function findExistingResult(
  draft: ContextRoomResultDraft,
): Promise<StoredContextResult | null> {
  const duplicateRow = await readJsonRecord(resultRecordTitle(draft));
  const duplicateResult = duplicateRow
    ? normalizeContextRoomResult(duplicateRow.value)
    : null;
  if (duplicateRow && duplicateResult && !duplicateResult.sourceEventId)
    return { ...duplicateResult, id: duplicateRow.id };
  const legacyManual = await readJsonRecord(
    recordTitle(`duplicate:${contextResultDuplicateKey(draft)}`),
  );
  const legacyValue = legacyManual
    ? normalizeContextRoomResult(legacyManual.value)
    : null;
  if (legacyManual && legacyValue && !legacyValue.sourceEventId)
    return { ...legacyValue, id: legacyManual.id };

  return null;
}

export async function saveContextRoomResult(params: {
  draft: unknown;
  linkedActivityId?: unknown;
}): Promise<{
  result: StoredContextResult;
  duplicate: boolean;
  activityLabel: string | null;
}> {
  const draft = normalizeContextRoomDraft(params.draft);
  if (draft.sourceEventId)
    throw new BridgeError("AUTHORITATIVE_SOURCE_REQUIRED", 409);
  if (params.linkedActivityId)
    throw new BridgeError("MANUAL_SOURCE_BINDING_REQUIRES_REVIEW", 409);
  const missing = missingContextResultFields(draft);
  if (missing.length) throw new Error(`還缺少：${missing.join("、")}`);
  const existing = await findExistingResult(draft);
  if (existing)
    return { result: existing, duplicate: true, activityLabel: null };

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
    linkedActivityId: null,
    linkedActivityCompletedAt: null,
    createdAt: new Date().toISOString(),
  };
  const title = resultRecordTitle(draft);
  const created = await createPracticeOnce(
    sourceIdentity(learningOwner, "dojo", "legacy-manual-summary", title),
    () =>
      createKnowledgeEntry(
        { 標題: title, 內容: JSON.stringify(result) },
        { retryCreate: false },
      ),
  );
  const stored: StoredContextResult = { ...result, id: created.id };
  return { result: stored, duplicate: false, activityLabel: null };
}
