import "server-only";

import {
  addCalendarDays,
  bingoRecordTitle,
  dailyRecordTitle,
  mondayOf,
  normalizeDailyRecord,
  normalizeWeeklyBoard,
  type WeeklyBoard,
} from "./formal";
import { syncLearningActivity } from "./learningStore";
import { readJsonRecord, upsertJsonRecord } from "./notionStore";

export type VocabForgeWeekSummary = {
  days: number;
  rounds: number;
  completed: boolean;
};

export async function syncVocabForgeWeeklyBingo(dateOrWeekStart: string): Promise<{
  summary: VocabForgeWeekSummary;
  board: WeeklyBoard | null;
}> {
  const weekStart = mondayOf(dateOrWeekStart);
  const boardRow = await readJsonRecord(bingoRecordTitle(weekStart));
  if (!boardRow) return { summary: { days: 0, rounds: 0, completed: false }, board: null };

  const board = normalizeWeeklyBoard(boardRow.value, weekStart);
  const cell = board.cells.find((item) => item.learning?.templateKey === "vocabforge-scientific-week");
  if (!cell || board.archivedAt) return { summary: { days: 0, rounds: 0, completed: false }, board };

  const dates = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  const rows = await Promise.all(dates.map((date) => readJsonRecord(dailyRecordTitle(date))));
  const records = rows.flatMap((row, index) => row ? [normalizeDailyRecord(row.value, dates[index])] : []);
  // External facts have no original weekly binding. This legacy aggregate must
  // continue to consume manual counters, not silently adopt source projections.
  const manualRounds = (record: typeof records[number]) => record.practiceEventVocabulary?.manualRounds ?? record.englishRhythm.vocabForgeRounds;
  const active = records.filter((record) => manualRounds(record) > 0);
  const rounds = active.reduce((sum, record) => sum + manualRounds(record), 0);
  const completed = active.length >= 3 && rounds >= 5;
  const wasCompleted = cell.completed;

  cell.completion = { ...cell.completion, mode: "single", target: 1, progress: completed ? 1 : 0, unit: "週" };
  cell.evidenceNote = `VocabForge 科學複習：${active.length}/3 天・${rounds}/5 輪（每輪 5 字）`;
  cell.completed = completed;
  cell.completedAt = completed ? (wasCompleted ? cell.completedAt : new Date().toISOString()) : null;

  const normalized = normalizeWeeklyBoard(board, weekStart);
  await upsertJsonRecord(bingoRecordTitle(weekStart), normalized);
  await syncLearningActivity({ weekStart, cell: normalized.cells[cell.index] });
  return { summary: { days: active.length, rounds, completed }, board: normalized };
}
