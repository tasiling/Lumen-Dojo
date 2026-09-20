import { NextRequest, NextResponse } from "next/server";
import {
  dailyRecordTitle,
  emptyDailyRecord,
  normalizeDailyRecord,
  parseJson,
  taipeiTodayISO,
} from "@/lib/dojo/formal";
import { listJsonRecords, readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";
import { syncVocabForgeWeeklyBingo } from "@/lib/dojo/englishRhythm";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? taipeiTodayISO();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "日期格式不正確" }, { status: 400 });
  try {
    if (req.nextUrl.searchParams.get("latestChoiceBefore") === "1") {
      const rows = await listJsonRecords("行光今日-");
      const latest = rows
        .map((row) => {
          const match = row.title.match(/行光今日-(\d{4})(\d{2})(\d{2})$/);
          if (!match) return null;
          const rowDate = `${match[1]}-${match[2]}-${match[3]}`;
          if (rowDate >= date) return null;
          const record = normalizeDailyRecord(row.value, rowDate);
          return record.morning.intention.trim() ? { date: rowDate, choice: record.morning.intention } : null;
        })
        .filter((item): item is { date: string; choice: string } => item !== null)
        .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
      return NextResponse.json({ latest });
    }
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
    const vocabForgeWeek = await syncVocabForgeWeeklyBingo(date);
    return NextResponse.json({ ok: true, id: saved.id, record, vocabForgeWeek: vocabForgeWeek.summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
