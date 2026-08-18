import { NextRequest, NextResponse } from "next/server";
import {
  dailyRecordTitle,
  emptyDailyRecord,
  normalizeDailyRecord,
  parseJson,
  taipeiTodayISO,
} from "@/lib/dojo/formal";
import { readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? taipeiTodayISO();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "日期格式不正確" }, { status: 400 });
  try {
    const row = await readJsonRecord(dailyRecordTitle(date));
    const record = row ? normalizeDailyRecord(row.value, date) : emptyDailyRecord(date);
    return NextResponse.json({ record, persisted: Boolean(row) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const date = typeof body.date === "string" ? body.date : "";
    if (!DATE_RE.test(date)) return NextResponse.json({ error: "日期格式不正確" }, { status: 400 });
    const raw = typeof body.record === "string" ? parseJson(body.record) : body.record;
    const record = normalizeDailyRecord(raw, date);
    const saved = await upsertJsonRecord(dailyRecordTitle(date), record);
    return NextResponse.json({ ok: true, id: saved.id, record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
