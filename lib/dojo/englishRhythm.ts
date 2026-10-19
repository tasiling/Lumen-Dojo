import {withLearningWriteLock} from './learningFoundation/fileLock';
import {learningWriteOutcome} from './learningFoundation/writeOutcome';
import {carryRecordTitle} from './weeklyTasks';
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

async function syncVocabForgeWeeklyBingoUnlocked(dateOrWeekStart: string): Promise<{
  summary: VocabForgeWeekSummary;
  board: WeeklyBoard | null;
}> {
  const weekStart = mondayOf(dateOrWeekStart);
  const boardRow = await readJsonRecord(bingoRecordTitle(weekStart));
  if (!boardRow) return { summary: { days: 0, rounds: 0, completed: false }, board: null };

  const board = normalizeWeeklyBoard(boardRow.value, weekStart);
  board.updatedAt=(boardRow.value as WeeklyBoard).updatedAt;
  const cell = board.cells.find((item) => item.learning?.templateKey === "vocabforge-scientific-week");
  if (!cell || board.archivedAt || cell.disposition || (cell.taskInstanceId&&await readJsonRecord(carryRecordTitle(weekStart,cell.taskInstanceId)))) return { summary: { days: 0, rounds: 0, completed: false }, board };

  const dates = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  const rows = await Promise.all(dates.map((date) => readJsonRecord(dailyRecordTitle(date))));
  const records = rows.flatMap((row, index) => row ? [normalizeDailyRecord(row.value, dates[index])] : []);
  const active = records.filter((record) => record.englishRhythm.vocabForgeRounds > 0);
  const rounds = active.reduce((sum, record) => sum + record.englishRhythm.vocabForgeRounds, 0);
  const completed = active.length >= 3 && rounds >= 5;
  const wasCompleted = cell.completed;

  cell.completion = { ...cell.completion, mode: "single", target: 1, progress: completed ? 1 : 0, unit: "週" };
  cell.evidenceNote = `VocabForge 科學複習：${active.length}/3 天・${rounds}/5 輪（每輪 5 字）`;
  cell.completed = completed;
  cell.completedAt = completed ? (wasCompleted ? cell.completedAt : new Date().toISOString()) : null;

  const normalized = normalizeWeeklyBoard(board, weekStart);
  const saved=await upsertJsonRecord(bingoRecordTitle(weekStart), normalized);
  Object.assign(normalized,saved.value);
  await syncLearningActivity({ weekStart, cell: normalized.cells[cell.index] });
  return { summary: { days: active.length, rounds, completed }, board: normalized };
}

export async function syncVocabForgeWeeklyBingo(dateOrWeekStart:string){return learningWriteOutcome.getStore()?syncVocabForgeWeeklyBingoUnlocked(dateOrWeekStart):withLearningWriteLock(()=>syncVocabForgeWeeklyBingoUnlocked(dateOrWeekStart));}
