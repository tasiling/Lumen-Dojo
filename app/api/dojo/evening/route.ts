import { NextRequest, NextResponse } from "next/server";
import {
  dailyRecordTitle,
  normalizeDailyRecord,
  type DailyRecord,
} from "@/lib/dojo/formal";
import { isValidCarryToDate } from "@/lib/closing/notionFormat";
import { readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { withLearningWriteLock } from "@/lib/dojo/learningFoundation/fileLock";
import { LearningError } from "@/lib/dojo/learningFoundation/model";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const body = await req.json();
    const date = typeof body.date === "string" ? body.date : "";
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: "日期格式不正確" }, { status: 400 });
    }

    const record = normalizeDailyRecord(body.record, date);
    const disposition = record.evening.disposition;
    if (!disposition) {
      return NextResponse.json({ error: "請選擇今晚的收光方式" }, { status: 400 });
    }
    if (disposition === "journal" && !record.evening.depth) {
      return NextResponse.json({ error: "請選擇復盤深度" }, { status: 400 });
    }
    if (disposition === "carry") {
      if (!record.evening.carryNote.trim()) {
        return NextResponse.json({ error: "請寫下想帶回的念頭、問題或下一步" }, { status: 400 });
      }
      if (!record.evening.carryToDate || !isValidCarryToDate(record.evening.carryToDate, date)) {
        return NextResponse.json({ error: "請選擇明天起七日內的承接日期" }, { status: 400 });
      }
    }

    const closedAt = new Date().toISOString();
    const next: DailyRecord = {
      ...record,
      evening: {
        ...record.evening,
        ...(disposition === "journal"
          ? { carryNote: "", carryToDate: null, carryResolvedAt: null }
          : disposition === "pause"
            ? {
                depth: null,
                highlight: "",
                practiceReflection: "",
                block: "",
                insight: "",
                nextAction: "",
                carryNote: "",
                carryToDate: null,
                carryResolvedAt: null,
              }
            : {
                depth: null,
                highlight: "",
                practiceReflection: "",
                block: "",
                insight: "",
                nextAction: "",
                carryResolvedAt: null,
              }),
        closedAt,
      },
      updatedAt: closedAt,
    };

    const normalized = normalizeDailyRecord(next, date);
    return await withLearningWriteLock(async () => {
      const existingRow = await readJsonRecord(dailyRecordTitle(date));
      const existing = existingRow ? normalizeDailyRecord(existingRow.value, date) : null;
      if (existing?.evening.closedAt && body.overwrite !== true) {
        return NextResponse.json(
          { error: "今天已經完成收光，請先確認是否取代。", requiresOverwrite: true },
          { status: 409 }
        );
      }
      // Compare raw revisions: normalization generates a fresh timestamp.
      // Overwrite confirms replacing a closing; it never bypasses newer daily edits.
      if (existingRow && (
        typeof body.record?.updatedAt !== "string" ||
        !body.record.updatedAt ||
        body.record.updatedAt !== (existingRow.value as { updatedAt?: string })?.updatedAt
      )) {
        throw new LearningError("每日紀錄版本已變更，請重新讀取", 409);
      }
      const saved = await upsertJsonRecord(dailyRecordTitle(date), normalized);
      const persisted = normalizeDailyRecord(saved.value, date);
      persisted.updatedAt = (saved.value as { updatedAt: string }).updatedAt;
      return NextResponse.json({ ok: true, id: saved.id, record: persisted });
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof LearningError ? error.status : 503 });
  }
}
