import { NextResponse } from "next/server";
import { findKnowledgeEntryByTitle } from "@/lib/notion/queries";
import { closingRecordTitle, decodeClosingContent } from "@/lib/closing/notionFormat";
import { taipeiTodayISO } from "@/lib/dojo/formal";

// Notion 是唯一真相來源,讀取一律即時查詢,不吃 Route Handler 快取。
export const dynamic = "force-dynamic";

// 補充裁決03§3.1:同日重複收光,送出前要能問「今天已經收過光了,要用新的
// 取代嗎?」,前端需要先知道今天是否已經有紀錄、以及那筆紀錄長什麼樣子,
// 才能在確認對話框裡說清楚「會失去什麼」。這裡只回傳精簡描述,不回傳整包
// ClosingContent(呼叫端不需要 sourceType/traceLevel 這些欄位)。
export async function GET() {
  const todayISO = taipeiTodayISO();
  const record = await findKnowledgeEntryByTitle(closingRecordTitle(todayISO));
  if (!record) return NextResponse.json({ existing: null });

  const content = decodeClosingContent(record.內容);
  if (!content) return NextResponse.json({ existing: null });

  return NextResponse.json({
    existing: { title: content.title, note: content.note, carryToDate: content.carryToDate },
  });
}
