import { NextRequest, NextResponse } from "next/server";
import {
  bingoRecordTitle,
  dailyRecordTitle,
  emptyDailyRecord,
  emptyWeeklyBoard,
  normalizeDailyRecord,
  normalizeWeeklyBoard,
  type DailyTaskCategory,
} from "@/lib/dojo/formal";
import { readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";
import { syncLearningActivity } from "@/lib/dojo/learningStore";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES: DailyTaskCategory[] = ["important", "hobby", "health"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "assign-bingo") return assignBingo(body);
    if (body.action === "complete-task") return completeTask(body);
    if (body.action === "progress-bingo") return progressBingo(body);
    return NextResponse.json({ error: "不明的流程動作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

async function assignBingo(body: Record<string, unknown>) {
  const weekStart = typeof body.weekStart === "string" ? body.weekStart : "";
  const date = typeof body.date === "string" ? body.date : "";
  const cellIndex = typeof body.cellIndex === "number" ? body.cellIndex : -1;
  const requestedCategory = body.category as DailyTaskCategory;
  if (!DATE_RE.test(weekStart) || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "週次、日期或三件事分類不正確" }, { status: 400 });
  }

  const boardRow = await readJsonRecord(bingoRecordTitle(weekStart));
  const board = boardRow ? normalizeWeeklyBoard(boardRow.value, weekStart) : emptyWeeklyBoard(weekStart);
  if (board.archivedAt) return NextResponse.json({ error: "已封存的週盤不能再排入今天" }, { status: 409 });
  const cell = board.cells[cellIndex];
  if (!cell || cellIndex === 12 || !cell.text.trim()) {
    return NextResponse.json({ error: "這一格沒有可排入的內容" }, { status: 400 });
  }
  const category = cell.category ?? requestedCategory;
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "請先在週盤完成這一格的週日定色" }, { status: 409 });
  }

  const dailyRow = await readJsonRecord(dailyRecordTitle(date));
  const daily = dailyRow ? normalizeDailyRecord(dailyRow.value, date) : emptyDailyRecord(date);
  daily.tasks[category] = {
    category,
    text: cell.text,
    completed: cell.completed,
    completedAt: cell.completedAt,
    result: "",
    origin: { type: "bingo", weekStart, cellIndex },
  };
  cell.assignedDate = date;
  cell.assignedCategory = category;

  await upsertJsonRecord(dailyRecordTitle(date), normalizeDailyRecord(daily, date));
  await upsertJsonRecord(bingoRecordTitle(weekStart), normalizeWeeklyBoard(board, weekStart));
  return NextResponse.json({ ok: true, daily, board });
}

async function completeTask(body: Record<string, unknown>) {
  const date = typeof body.date === "string" ? body.date : "";
  const category = body.category as DailyTaskCategory;
  if (!DATE_RE.test(date) || !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "日期或三件事分類不正確" }, { status: 400 });
  }

  const row = await readJsonRecord(dailyRecordTitle(date));
  const daily = row ? normalizeDailyRecord(row.value, date) : emptyDailyRecord(date);
  const task = daily.tasks[category];
  const wasCompleted = task.completed;
  const completed = Boolean(body.completed);
  task.completed = completed;
  task.completedAt = completed ? new Date().toISOString() : null;
  task.result = typeof body.result === "string" ? body.result.slice(0, 1000) : task.result;

  let board = null;
  if (task.origin?.type === "bingo") {
    const boardRow = await readJsonRecord(bingoRecordTitle(task.origin.weekStart));
    board = boardRow
      ? normalizeWeeklyBoard(boardRow.value, task.origin.weekStart)
      : emptyWeeklyBoard(task.origin.weekStart);
    const cell = board.cells[task.origin.cellIndex];
    if (cell && task.origin.cellIndex !== 12) {
      if (completed && cell.completion.requiresEvidence && !task.result.trim()) {
        return NextResponse.json({ error: "請先在完成後紀錄中留下實際使用情境與對方反應" }, { status: 409 });
      }
      const delta = completed === wasCompleted ? 0 : completed ? 1 : -1;
      cell.completion.progress = Math.max(0, Math.min(cell.completion.target, cell.completion.progress + delta));
      cell.completed = cell.completion.progress >= cell.completion.target;
      cell.completedAt = cell.completed ? (cell.completedAt ?? task.completedAt) : null;
      cell.assignedDate = date;
      cell.assignedCategory = category;
      if (typeof body.result === "string" && body.result.trim()) cell.evidenceNote = body.result.trim().slice(0, 2000);
      await upsertJsonRecord(bingoRecordTitle(board.weekStart), normalizeWeeklyBoard(board, board.weekStart));
      await syncLearningActivity({ weekStart: board.weekStart, cell });
    }
  }

  const normalizedDaily = normalizeDailyRecord(daily, date);
  await upsertJsonRecord(dailyRecordTitle(date), normalizedDaily);
  return NextResponse.json({ ok: true, daily: normalizedDaily, board });
}

async function progressBingo(body: Record<string, unknown>) {
  const weekStart = typeof body.weekStart === "string" ? body.weekStart : "";
  const cellIndex = typeof body.cellIndex === "number" ? body.cellIndex : -1;
  const direction = body.direction === -1 ? -1 : 1;
  if (!DATE_RE.test(weekStart) || cellIndex < 0 || cellIndex > 24 || cellIndex === 12) {
    return NextResponse.json({ error: "週次或格子不正確" }, { status: 400 });
  }
  const row = await readJsonRecord(bingoRecordTitle(weekStart));
  const board = row ? normalizeWeeklyBoard(row.value, weekStart) : emptyWeeklyBoard(weekStart);
  if (board.archivedAt) return NextResponse.json({ error: "已封存的週盤不能修改" }, { status: 409 });
  const cell = board.cells[cellIndex];
  if (!cell?.text.trim()) return NextResponse.json({ error: "這一格沒有內容" }, { status: 400 });

  const evidence = typeof body.evidenceNote === "string" ? body.evidenceNote.trim().slice(0, 2000) : cell.evidenceNote;
  const nextProgress = Math.max(0, Math.min(cell.completion.target, cell.completion.progress + direction));
  if (direction > 0 && nextProgress >= cell.completion.target && cell.completion.requiresEvidence && !evidence) {
    return NextResponse.json({ error: "完成這一格前，請先留下工作實際使用紀錄" }, { status: 409 });
  }
  cell.completion.progress = nextProgress;
  cell.evidenceNote = evidence;
  cell.completed = nextProgress >= cell.completion.target;
  cell.completedAt = cell.completed ? (cell.completedAt ?? new Date().toISOString()) : null;
  const normalized = normalizeWeeklyBoard(board, weekStart);
  await upsertJsonRecord(bingoRecordTitle(weekStart), normalized);
  if (cell.completion.target === 1 && cell.assignedDate && cell.assignedCategory) {
    const dailyRow = await readJsonRecord(dailyRecordTitle(cell.assignedDate));
    const daily = dailyRow ? normalizeDailyRecord(dailyRow.value, cell.assignedDate) : emptyDailyRecord(cell.assignedDate);
    const task = daily.tasks[cell.assignedCategory];
    if (task.origin?.type === "bingo" && task.origin.weekStart === weekStart && task.origin.cellIndex === cellIndex) {
      task.completed = cell.completed;
      task.completedAt = cell.completedAt;
      if (evidence) task.result = evidence.slice(0, 1000);
      await upsertJsonRecord(dailyRecordTitle(cell.assignedDate), normalizeDailyRecord(daily, cell.assignedDate));
    }
  }
  await syncLearningActivity({ weekStart, cell: normalized.cells[cellIndex] });
  return NextResponse.json({ ok: true, board: normalized });
}
