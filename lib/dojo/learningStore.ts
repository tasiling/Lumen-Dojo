import type { BingoCell, LearningTrackKey } from "./formal";
import {
  learningRecordTitle,
  normalizeLearningTrack,
  type LearningActivity,
} from "./learning";
import { readJsonRecord, upsertJsonRecord } from "./notionStore";

import { learningWriteOutcome } from './learningFoundation/writeOutcome';
import { withLearningWriteLock } from './learningFoundation/fileLock';
async function legacyLearningWrite<T>(task: () => Promise<T>): Promise<T> {
  if (learningWriteOutcome.getStore()) return task();
  if (!process.env.LEARNING_WRITE_LOCK_DIR) return task();
  // Existing callers use Promise.all. Retry lock acquisition, never the Notion write itself.
  for (let attempt = 0; ; attempt++) {
    try { return await withLearningWriteLock(task); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('另一筆學習') || attempt >= 20) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}
export async function syncLearningActivity(params: { weekStart: string; cell: BingoCell }): Promise<void> {
  return legacyLearningWrite(() => syncLearningActivityUnlocked(params));
}
async function syncLearningActivityUnlocked(params: {
  weekStart: string;
  cell: BingoCell;
}): Promise<void> {
  const { cell, weekStart } = params;
  if (!cell.learning) return;

  const title = learningRecordTitle(cell.learning.trackKey);
  const row = await readJsonRecord(title);
  const track = normalizeLearningTrack(row?.value, cell.learning.trackKey);
  const id = `${weekStart}:${cell.index}:${cell.learning.templateKey}`;
  const activity: LearningActivity = {
    id,
    weekStart,
    cellIndex: cell.index,
    templateKey: cell.learning.templateKey,
    skill: cell.learning.skill,
    path: cell.learning.path ?? "practice",
    practiceType: cell.learning.practiceType,
    progress: cell.completion.progress,
    target: cell.completion.target,
    unit: cell.completion.unit,
    evidenceNote: cell.evidenceNote,
    completedAt: cell.completedAt,
    updatedAt: new Date().toISOString(),
  };
  const activityLog = [
    ...track.activityLog.filter((item) => item.id !== id),
    activity,
  ].slice(-160);
  await upsertJsonRecord(title, { ...(row?.value && typeof row.value === "object" ? row.value : {}), ...track, activityLog, updatedAt: new Date().toISOString() });
}

export async function removeUnstartedLearningActivities(params: { weekStart: string; cells: BingoCell[] }): Promise<void> {
  return legacyLearningWrite(() => removeUnstartedLearningActivitiesUnlocked(params));
}
async function removeUnstartedLearningActivitiesUnlocked(params: {
  weekStart: string;
  cells: BingoCell[];
}): Promise<void> {
  const removableByTrack = new Map<LearningTrackKey, Set<string>>();
  for (const cell of params.cells) {
    if (
      !cell.learning ||
      cell.completed ||
      cell.completion.progress > 0 ||
      cell.evidenceNote.trim()
    ) continue;
    const templates = removableByTrack.get(cell.learning.trackKey) ?? new Set<string>();
    templates.add(cell.learning.templateKey);
    removableByTrack.set(cell.learning.trackKey, templates);
  }

  for (const [trackKey, templateKeys] of removableByTrack) {
    const title = learningRecordTitle(trackKey);
    const row = await readJsonRecord(title);
    if (!row) continue;
    const track = normalizeLearningTrack(row.value, trackKey);
    const activityLog = track.activityLog.filter((activity) => !(
      activity.weekStart === params.weekStart &&
      templateKeys.has(activity.templateKey) &&
      !activity.completedAt &&
      activity.progress === 0 &&
      !activity.evidenceNote.trim()
    ));
    if (activityLog.length === track.activityLog.length) continue;
    await upsertJsonRecord(title, { ...(row?.value && typeof row.value === "object" ? row.value : {}), ...track, activityLog, updatedAt: new Date().toISOString() });
  }
}
