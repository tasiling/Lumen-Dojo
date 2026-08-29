import type { BingoCell } from "./formal";
import {
  learningRecordTitle,
  normalizeLearningTrack,
  type LearningActivity,
} from "./learning";
import { readJsonRecord, upsertJsonRecord } from "./notionStore";

export async function syncLearningActivity(params: {
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
  await upsertJsonRecord(title, { ...track, activityLog, updatedAt: new Date().toISOString() });
}
