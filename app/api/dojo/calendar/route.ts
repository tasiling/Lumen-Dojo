import { NextRequest, NextResponse } from "next/server";
import {
  CALENDAR_TITLE_PREFIX,
  DAILY_TITLE_PREFIX,
  calendarRecordTitle,
  monthTitleKey,
  normalizeDailyRecord,
  normalizeCalendarItem,
  parseJson,
} from "@/lib/dojo/formal";
import {
  archiveJsonRecordById,
  listJsonRecords,
  updateJsonRecordById,
} from "@/lib/dojo/notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry } from "@/lib/notion/queries";

export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "月份格式不正確" }, { status: 400 });
  try {
    const [rows, dailyRows] = await Promise.all([
      listJsonRecords(monthTitleKey(CALENDAR_TITLE_PREFIX, month)),
      listJsonRecords(monthTitleKey(DAILY_TITLE_PREFIX, month)),
    ]);
    const items = rows
      .map((row) => normalizeCalendarItem(row.value, { id: row.id }))
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
    const daily = dailyRows
      .map((row) => {
        const date = row.value && typeof row.value === "object" && typeof (row.value as { date?: unknown }).date === "string"
          ? (row.value as { date: string }).date
          : null;
        return date ? normalizeDailyRecord(row.value, date) : null;
      })
      .filter((record): record is NonNullable<typeof record> => record !== null);
    return NextResponse.json({ items, daily });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const item = normalizeCalendarItem(body, { id: "pending" });
    if (!item) return NextResponse.json({ error: "標題與日期為必填" }, { status: 400 });
    const nonce = crypto.randomUUID();
    const created = await createKnowledgeEntry({
      標題: calendarRecordTitle(item.date, nonce),
      內容: JSON.stringify(item),
    });
    return NextResponse.json({ ok: true, item: { ...item, id: created.id } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.id !== "string") return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    const existing = await getKnowledgeEntry(body.id);
    if (!existing.標題.startsWith(CALENDAR_TITLE_PREFIX)) {
      return NextResponse.json({ error: "紀錄類型不符" }, { status: 400 });
    }
    const previous = normalizeCalendarItem(parseJson(existing.內容), { id: body.id });
    const item = normalizeCalendarItem(body.item, { id: body.id, createdAt: previous?.createdAt });
    if (!item) return NextResponse.json({ error: "標題與日期為必填" }, { status: 400 });
    const suffix = existing.標題.slice(CALENDAR_TITLE_PREFIX.length + 9) || crypto.randomUUID();
    await updateJsonRecordById(
      body.id,
      CALENDAR_TITLE_PREFIX,
      calendarRecordTitle(item.date, suffix),
      item
    );
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    await archiveJsonRecordById(id, CALENDAR_TITLE_PREFIX);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
