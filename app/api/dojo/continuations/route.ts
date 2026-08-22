import { NextRequest, NextResponse } from "next/server";
import {
  DAILY_TITLE_PREFIX,
  dailyRecordTitle,
  normalizeDailyRecord,
  taipeiTodayISO,
} from "@/lib/dojo/formal";
import { selectDueContinuations, type PersonalContinuation } from "@/lib/dojo/continuations";
import { listJsonRecords, readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";
import {
  decodeClosingContent,
  encodeClosingContent,
} from "@/lib/closing/notionFormat";
import { CLOSING_TITLE_PREFIX } from "@/lib/notion/schema";
import {
  getKnowledgeEntry,
  listKnowledgeEntriesByPrefix,
} from "@/lib/notion/queries";
import { updateKnowledgeEntry } from "@/lib/notion/mutations";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function titleDate(title: string): string | null {
  const match = title.match(/(\d{4})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export async function GET() {
  try {
    const today = taipeiTodayISO();
    const [dailyRows, legacyRows] = await Promise.all([
      listJsonRecords(DAILY_TITLE_PREFIX),
      listKnowledgeEntriesByPrefix(CLOSING_TITLE_PREFIX),
    ]);

    const dailyItems: PersonalContinuation[] = dailyRows.flatMap((row) => {
      const date = titleDate(row.title);
      if (!date) return [];
      const record = normalizeDailyRecord(row.value, date);
      if (
        record.evening.disposition !== "carry" ||
        !record.evening.carryToDate ||
        record.evening.carryResolvedAt
      ) {
        return [];
      }
      return [{
        source: "daily" as const,
        id: row.id,
        createdDate: date,
        carryToDate: record.evening.carryToDate,
        text: record.evening.carryNote,
      }];
    });

    const legacyItems: PersonalContinuation[] = legacyRows.flatMap((row) => {
      const content = decodeClosingContent(row.內容);
      const createdDate = content && DATE_RE.test(content.date) ? content.date : titleDate(row.標題);
      if (
        !content ||
        !createdDate ||
        content.title !== "帶回明天" ||
        !content.carryToDate ||
        !DATE_RE.test(content.carryToDate) ||
        content.carryResolvedAt
      ) {
        return [];
      }
      return [{
        source: "legacy" as const,
        id: row.id,
        createdDate,
        carryToDate: content.carryToDate,
        text: content.note?.trim() || "你曾想把一件事帶到今天",
      }];
    });

    return NextResponse.json({ cards: selectDueContinuations([...dailyItems, ...legacyItems], today) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const source = body.source === "daily" || body.source === "legacy" ? body.source : null;
    const id = typeof body.id === "string" ? body.id : "";
    if (!source || !id) return NextResponse.json({ error: "缺少接續來源或紀錄 id" }, { status: 400 });

    if (source === "daily") {
      const date = typeof body.createdDate === "string" ? body.createdDate : "";
      if (!DATE_RE.test(date)) return NextResponse.json({ error: "接續日期格式不正確" }, { status: 400 });
      const row = await readJsonRecord(dailyRecordTitle(date));
      if (!row || row.id !== id) return NextResponse.json({ error: "找不到這筆每日接續" }, { status: 404 });
      const record = normalizeDailyRecord(row.value, date);
      if (record.evening.disposition !== "carry" || !record.evening.carryToDate) {
        return NextResponse.json({ error: "這筆紀錄沒有可處理的接續" }, { status: 400 });
      }
      if (record.evening.carryResolvedAt) {
        return NextResponse.json({ error: "這筆接續已處理" }, { status: 409 });
      }
      record.evening.carryResolvedAt = new Date().toISOString();
      await upsertJsonRecord(dailyRecordTitle(date), normalizeDailyRecord(record, date));
      return NextResponse.json({ ok: true });
    }

    const row = await getKnowledgeEntry(id);
    if (!row.標題.startsWith(CLOSING_TITLE_PREFIX)) {
      return NextResponse.json({ error: "紀錄類型不符" }, { status: 400 });
    }
    const content = decodeClosingContent(row.內容);
    if (!content || content.title !== "帶回明天" || !content.carryToDate) {
      return NextResponse.json({ error: "這筆紀錄沒有可處理的接續" }, { status: 400 });
    }
    if (content.carryResolvedAt) {
      return NextResponse.json({ error: "這筆接續已處理" }, { status: 409 });
    }
    await updateKnowledgeEntry(id, {
      內容: encodeClosingContent({ ...content, carryResolvedAt: new Date().toISOString() }),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
