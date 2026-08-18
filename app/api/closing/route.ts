import { NextRequest, NextResponse } from "next/server";
import { findKnowledgeEntryByTitle } from "@/lib/notion/queries";
import { createKnowledgeEntry, updateKnowledgeEntry, upsertJournalEntry } from "@/lib/notion/mutations";
import {
  CLOSING_CHOICE_TITLE,
  closingRecordTitle,
  encodeClosingContent,
  isValidCarryToDate,
  type ClosingChoice,
  type ClosingContent,
} from "@/lib/closing/notionFormat";
import { hasAnyJournalAnswer, type JournalAnswers } from "@/lib/journal/notionFormat";
import { taipeiTodayISO } from "@/lib/dojo/formal";

// Notion 是唯一真相來源,讀取一律即時查詢,不吃 Route Handler 快取。
export const dynamic = "force-dynamic";

// 收光三選項(《收光三選項與居所接續》v1.0,行光牌與收光系統・地基實作
// v2.0/補充裁決01 追加 carryToDate,補充裁決03 改版):三個選項都只是「今天
// 整體怎麼結束」的一次性動作,不改動任何一筆痕跡的狀態(§0.1)。序列化存進
// DB-14 既有的「內容」欄——標題「收光紀錄-YYYYMMDD」一天一筆,若當日已有
// 紀錄則覆蓋,不累積多筆。是否要覆蓋、要不要提示使用者,是前端的職責
// (GET /api/closing/today 給前端判斷用)——這裡維持單純的「呼叫就寫入」,
// 不在伺服器端額外擋「已存在」的情況。
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { choice, note, carryToDate, journal } = body as {
    choice?: ClosingChoice;
    note?: string;
    carryToDate?: string;
    journal?: JournalAnswers;
  };

  const choiceTitle = choice ? CLOSING_CHOICE_TITLE[choice] : undefined;
  if (!choiceTitle) {
    return NextResponse.json({ error: "缺少或不明的必要參數:choice" }, { status: 400 });
  }

  const todayISO = taipeiTodayISO();

  // carryToDate 僅 carry 時必填,且一律限定「明天起七日內」——不是排程工具,
  // 不接受任意未來日期(地基實作 v2.0 步驟三)。
  if (choice === "carry") {
    if (!carryToDate || !isValidCarryToDate(carryToDate, todayISO)) {
      return NextResponse.json({ error: "carryToDate 必須是明天起七日內的日期" }, { status: 400 });
    }
  }

  const content: ClosingContent = {
    space: "closing",
    kind: "收光",
    title: choiceTitle,
    // note 只有「帶回」才可能有值,規格明訂可留空——空字串一律存成 undefined,
    // 不要讓「使用者沒寫」跟「使用者寫了空白」在資料上難以分辨。
    note: choice === "carry" ? note?.trim() || undefined : undefined,
    date: todayISO,
    privacy: "私人",
    sourceType: "rest",
    traceLevel: "daily",
    traceStatus: "一般",
    viewCount: 0,
    carryToDate: choice === "carry" ? carryToDate : undefined,
    // 尚未標記已處理——只有「標記已處理」按鈕按下才會寫入實際時間戳
    // (地基實作 v2.0 §一之3 裁決:不採用「打開就算」)。
    carryResolvedAt: choice === "carry" ? null : undefined,
  };

  const notionTitle = closingRecordTitle(todayISO);
  const existing = await findKnowledgeEntryByTitle(notionTitle);
  if (existing) {
    await updateKnowledgeEntry(existing.id, { 內容: encodeClosingContent(content) });
  } else {
    await createKnowledgeEntry({ 標題: notionTitle, 內容: encodeClosingContent(content) });
  }

  // 3.4/3.5:日記是選填的附加動作,只有「寫下今天」「帶回明天」這兩個選項的
  // 流程會提供入口,且使用者真的有寫東西(hasAnyJournalAnswer)才動 DB-18——
  // 沒開日記面板、或開了但七題全部留白,都不建立/更新日記紀錄。
  if (journal && hasAnyJournalAnswer(journal)) {
    await upsertJournalEntry(todayISO, journal);
  }

  return NextResponse.json({ ok: true });
}
