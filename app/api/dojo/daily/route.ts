import { NextRequest, NextResponse } from "next/server";
import {
  dailyRecordTitle,
  emptyDailyRecord,
  normalizeDailyRecord,
  parseJson,
  taipeiTodayISO,
} from "@/lib/dojo/formal";
import { listJsonRecords, readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { withLearningWriteLock } from "@/lib/dojo/learningFoundation/fileLock";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { syncVocabForgeWeeklyBingo } from "@/lib/dojo/englishRhythm";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? taipeiTodayISO();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "日期格式不正確" }, { status: 400 });
  try {
    requireLearningOwner(req);
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
    if (row && row.value && typeof row.value === "object") record.updatedAt = (row.value as { updatedAt: string }).updatedAt;
    return NextResponse.json({ record, persisted: Boolean(row) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof LearningError ? error.status : 503 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const body = await req.json();
    const date = typeof body.date === "string" ? body.date : "";
    if (!DATE_RE.test(date)) return NextResponse.json({ error: "日期格式不正確" }, { status: 400 });
    const raw = typeof body.record === "string" ? parseJson(body.record) : body.record;
    const saved = await withLearningWriteLock(async () => {
      const current = await readJsonRecord(dailyRecordTitle(date));
      if(current && (!raw || typeof raw !== "object" || (raw as { updatedAt?: string }).updatedAt !== (current.value as { updatedAt?: string }).updatedAt)) throw new LearningError("每日紀錄版本已變更，請重新讀取",409);
      return upsertJsonRecord(dailyRecordTitle(date), normalizeDailyRecord(raw, date));
    });
    const record = normalizeDailyRecord(saved.value, date);
    record.updatedAt = (saved.value as { updatedAt: string }).updatedAt;
    const vocabForgeWeek = await syncVocabForgeWeeklyBingo(date);
    return NextResponse.json({ ok: true, id: saved.id, record, vocabForgeWeek: vocabForgeWeek.summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof LearningError ? error.status : 503 });
  }
}
