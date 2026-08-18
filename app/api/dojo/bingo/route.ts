import { NextRequest, NextResponse } from "next/server";
import {
  BINGO_TITLE_PREFIX,
  bingoRecordTitle,
  emptyWeeklyBoard,
  mondayOf,
  normalizeWeeklyBoard,
  taipeiTodayISO,
} from "@/lib/dojo/formal";
import { listJsonRecords, readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    return NextResponse.json({ ok: true, id: saved.id, board });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
