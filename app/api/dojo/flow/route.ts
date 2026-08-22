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

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES: DailyTaskCategory[] = ["important", "hobby", "health"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "assign-bingo") return assignBingo(body);
    if (body.action === "complete-task") return completeTask(body);
    return NextResponse.json({ error: "不明的流程動作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

async function assignBingo(body: Record<string, unknown>) {
  const weekStart = typeof body.weekStart === "string" ? body.weekStart : "";
  const date = typeof body.date === "string" ? body.date : "";
  const cellIndex = typeof body.cellIndex === "number" ? body.cellIndex : -1;
  const category = body.category as DailyTaskCategory;
  if (!DATE_RE.test(weekStart) || !DATE_RE.test(date) || !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "週次、日期或三件事分類不正確" }, { status: 400 });
  }

  const boardRow = await readJsonRecord(bingoRecordTitle(weekStart));
  const board = boardRow ? normalizeWeeklyBoard(boardRow.value, weekStart) : emptyWeeklyBoard(weekStart);
  if (board.archivedAt) return NextResponse.json({ error: "已封存的週盤不能再排入今天" }, { status: 409 });
  const cell = board.cells[cellIndex];
  if (!cell || cellIndex === 12 || !cell.text.trim()) {
    return NextResponse.json({ error: "這一格沒有可排入的內容" }, { status: 400 });
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
      cell.completed = completed;
      cell.completedAt = task.completedAt;
      cell.assignedDate = date;
      cell.assignedCategory = category;
      await upsertJsonRecord(bingoRecordTitle(board.weekStart), normalizeWeeklyBoard(board, board.weekStart));
    }
  }

  const normalizedDaily = normalizeDailyRecord(daily, date);
  await upsertJsonRecord(dailyRecordTitle(date), normalizedDaily);
  return NextResponse.json({ ok: true, daily: normalizedDaily, board });
}
