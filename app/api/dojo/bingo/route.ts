import { NextRequest, NextResponse } from "next/server";
import {
  BINGO_TITLE_PREFIX,
  bingoRecordTitle,
  dailyRecordTitle,
  emptyBingoCell,
  emptyWeeklyBoard,
  mondayOf,
  normalizeDailyRecord,
  normalizeWeeklyBoard,
  taipeiTodayISO,
  type BingoCell,
} from "@/lib/dojo/formal";
import {
  archiveJsonRecordById,
  listJsonRecords,
  readJsonRecord,
  upsertJsonRecord,
} from "@/lib/dojo/notionStore";
import { removeUnstartedLearningActivities, syncLearningActivity } from "@/lib/dojo/learningStore";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function detachDailyTask(cell: BingoCell, weekStart: string): Promise<boolean> {
  if (!cell.assignedDate || !cell.assignedCategory) return false;
  const row = await readJsonRecord(dailyRecordTitle(cell.assignedDate));
  if (!row) return false;
  const daily = normalizeDailyRecord(row.value, cell.assignedDate);
  const task = daily.tasks[cell.assignedCategory];
  if (
    task.origin?.type !== "bingo" ||
    task.origin.weekStart !== weekStart ||
    task.origin.cellIndex !== cell.index
  ) return false;
  task.origin = null;
  await upsertJsonRecord(dailyRecordTitle(cell.assignedDate), normalizeDailyRecord(daily, cell.assignedDate));
  return true;
}

async function syncDailyTaskFromCell(cell: BingoCell, weekStart: string): Promise<void> {
  if (!cell.assignedDate || !cell.assignedCategory) return;
  const row = await readJsonRecord(dailyRecordTitle(cell.assignedDate));
  if (!row) return;
  const daily = normalizeDailyRecord(row.value, cell.assignedDate);
  const task = daily.tasks[cell.assignedCategory];
  if (
    task.origin?.type !== "bingo" ||
    task.origin.weekStart !== weekStart ||
    task.origin.cellIndex !== cell.index
  ) return;
  task.text = cell.text;
  task.completed = cell.completed;
  task.completedAt = cell.completedAt;
  if (cell.evidenceNote.trim()) task.result = cell.evidenceNote.trim().slice(0, 1000);
  await upsertJsonRecord(dailyRecordTitle(cell.assignedDate), normalizeDailyRecord(daily, cell.assignedDate));
}

export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get("archive") === "true") {
      const rows = await listJsonRecords(BINGO_TITLE_PREFIX);
      const boards = rows
        .map((row) => {
          const value = row.value && typeof row.value === "object" ? row.value as { weekStart?: unknown } : {};
          const weekStart = typeof value.weekStart === "string" && DATE_RE.test(value.weekStart) ? value.weekStart : null;
          return weekStart ? { id: row.id, ...normalizeWeeklyBoard(row.value, weekStart) } : null;
        })
        .filter((board): board is NonNullable<typeof board> => board !== null)
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
      return NextResponse.json({ boards });
    }

    const requested = req.nextUrl.searchParams.get("week") ?? mondayOf(taipeiTodayISO());
    if (!DATE_RE.test(requested)) return NextResponse.json({ error: "週起始日格式不正確" }, { status: 400 });
    const weekStart = mondayOf(requested);
    const row = await readJsonRecord(bingoRecordTitle(weekStart));
    const board = row ? normalizeWeeklyBoard(row.value, weekStart) : emptyWeeklyBoard(weekStart);
    return NextResponse.json({ board, persisted: Boolean(row) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const week = typeof body.weekStart === "string" ? body.weekStart : "";
    if (!DATE_RE.test(week)) return NextResponse.json({ error: "週起始日格式不正確" }, { status: 400 });
    const weekStart = mondayOf(week);
    const board = normalizeWeeklyBoard(body.board, weekStart);
    const saved = await upsertJsonRecord(bingoRecordTitle(weekStart), board);
    for (const cell of board.cells) {
      if (cell.assignedDate) await syncDailyTaskFromCell(cell, weekStart);
      if (cell.learning) await syncLearningActivity({ weekStart, cell });
    }
    return NextResponse.json({ ok: true, id: saved.id, board });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const week = typeof body.weekStart === "string" ? body.weekStart : "";
    const indexes = Array.isArray(body.cellIndexes)
      ? [...new Set(body.cellIndexes.filter((value: unknown): value is number =>
          Number.isInteger(value) && Number(value) >= 0 && Number(value) < 25 && Number(value) !== 12
        ))]
      : [];
    if (!DATE_RE.test(week)) return NextResponse.json({ error: "週起始日格式不正確" }, { status: 400 });
    if (body.action !== "remove-cells" || !indexes.length) {
      return NextResponse.json({ error: "沒有可移除的週盤格子" }, { status: 400 });
    }
    const weekStart = mondayOf(week);
    const row = await readJsonRecord(bingoRecordTitle(weekStart));
    if (!row) return NextResponse.json({ board: emptyWeeklyBoard(weekStart), removed: 0, preservedDailyTasks: 0 });
    const board = normalizeWeeklyBoard(row.value, weekStart);
    if (board.archivedAt) return NextResponse.json({ error: "已封存的週盤不能刪除格子" }, { status: 409 });
    const selected = board.cells.filter((cell) => indexes.includes(cell.index) && cell.text.trim());
    let preservedDailyTasks = 0;
    for (const cell of selected) {
      if (await detachDailyTask(cell, weekStart)) preservedDailyTasks += 1;
    }
    await removeUnstartedLearningActivities({ weekStart, cells: selected });
    const next = normalizeWeeklyBoard({
      ...board,
      version: 2,
      colorsConfirmedAt: null,
      cells: board.cells.map((cell) => indexes.includes(cell.index) ? emptyBingoCell(cell.index, weekStart) : cell),
      updatedAt: new Date().toISOString(),
    }, weekStart);
    await upsertJsonRecord(bingoRecordTitle(weekStart), next);
    return NextResponse.json({ ok: true, board: next, removed: selected.length, preservedDailyTasks });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const requested = req.nextUrl.searchParams.get("week") ?? "";
    if (!DATE_RE.test(requested)) return NextResponse.json({ error: "週起始日格式不正確" }, { status: 400 });
    const weekStart = mondayOf(requested);
    const row = await readJsonRecord(bingoRecordTitle(weekStart));
    if (!row) return NextResponse.json({ ok: true, board: emptyWeeklyBoard(weekStart), deleted: false, preservedDailyTasks: 0 });
    const board = normalizeWeeklyBoard(row.value, weekStart);
    if (board.archivedAt) return NextResponse.json({ error: "已封存週盤請保留為歷史紀錄" }, { status: 409 });
    const cells = board.cells.filter((cell) => cell.index !== 12 && cell.text.trim());
    let preservedDailyTasks = 0;
    for (const cell of cells) {
      if (await detachDailyTask(cell, weekStart)) preservedDailyTasks += 1;
    }
    await removeUnstartedLearningActivities({ weekStart, cells });
    await archiveJsonRecordById(row.id, BINGO_TITLE_PREFIX);
    return NextResponse.json({ ok: true, board: emptyWeeklyBoard(weekStart), deleted: true, preservedDailyTasks });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
