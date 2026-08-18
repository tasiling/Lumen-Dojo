import { NextResponse } from "next/server";
import { findKnowledgeEntryByTitle, listPendingDetails } from "@/lib/notion/queries";
import { normalizeDetailStatus } from "@/lib/notion/schema";
import { addDays, toISODate } from "@/lib/date";
import {
  closingRecordTitle,
  decodeClosingContent,
  CARRY_WINDOW_DAYS,
  type ClosingContent,
} from "@/lib/closing/notionFormat";
import { taipeiTodayISO } from "@/lib/dojo/formal";

// Notion 是唯一真相來源,讀取一律即時查詢,不吃 Route Handler 快取。
export const dynamic = "force-dynamic";

type ContinuationCard =
  | { source: "carry"; id: string; text: string }
  | { source: "b1"; text: string; detailId: string; sessionId: string | null };

const MAX_CARDS = 3;

function fmtMD(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// 居所「回到哪裡」區塊。
//
// v1.0(《收光三選項與居所接續》)原本 Source A 只查「昨天」一筆、最多佔 1
// 張。行光牌與收光系統・地基實作 v2.0(補充裁決01)改成:
// - Source A(優先,可佔滿三張):carryToDate <= 今天 AND carryResolvedAt IS
//   NULL,依 carryToDate 由早到晚排序,取前三張。資料來源是 Notion 的收光
//   紀錄(DB-14),不是記憶體裡的 DojoEntry——因為 DojoEntry 不持久化,重整
//   就歸零,這條線建了也不會成立(補充裁決01§〇)。
// - Source B1(A 不足三張時補滿):日上三更待產出,邏輯不變。
// B2(織光堂)/B3(野採)兩個場域目前沒有任何持久化資料模型可以掛,本輪跳過。
//
// 硬性限制:最多 3 張,不足時不補空位;卡片已過指定日期仍未消化時繼續顯示,
// 不標示過期、不顯示逾期天數、不改變外觀;超過三張時其餘不顯示、不提示還
// 有幾張;卡片文字中性——呼叫端(app/page.tsx)在零張時要把整區隱藏。
export async function GET() {
  const todayISO = taipeiTodayISO();

  // 一筆「帶回」紀錄的 Notion 標題是「建立日」,不是 carryToDate——
  // carryToDate 最遠可以是建立日 + 7 天,所以要往前掃 CARRY_WINDOW_DAYS 天
  // 內建立的紀錄,才能撈到所有還沒到期/還沒消化的帶回卡。
  const scanDates = Array.from({ length: CARRY_WINDOW_DAYS + 1 }, (_, i) =>
    toISODate(addDays(new Date(todayISO), -i))
  );
  const carryCandidates: { id: string; content: ClosingContent }[] = [];
  for (const dateISO of scanDates) {
    const record = await findKnowledgeEntryByTitle(closingRecordTitle(dateISO));
    if (!record) continue;
    const content = decodeClosingContent(record.內容);
    if (content?.title === "帶回明天" && content.carryToDate) {
      carryCandidates.push({ id: record.id, content });
    }
  }

  const sourceA = carryCandidates
    .filter(({ content }) => content.carryToDate! <= todayISO && !content.carryResolvedAt)
    .sort((a, b) => a.content.carryToDate!.localeCompare(b.content.carryToDate!))
    .slice(0, MAX_CARDS);

  const cards: ContinuationCard[] = sourceA.map(({ id, content }) => ({
    source: "carry",
    id,
    text: content.note?.trim() || "你想把這件事帶到今天",
  }));

  // Source B1:日上三更待產出,對應日期 <= 今天,依日期升冪補滿剩餘名額
  // (規格 §2.1:「B1 是最重要的一項……若 B1 有多筆,取日期最早的」)。
  if (cards.length < MAX_CARDS) {
    const pending = (await listPendingDetails())
      .filter((d) => normalizeDetailStatus(d.明細狀態) === "待產出" && d.對應日期 && d.對應日期 <= todayISO)
      .sort((a, b) => (a.對應日期 as string).localeCompare(b.對應日期 as string));
    for (const d of pending) {
      if (cards.length >= MAX_CARDS) break;
      const date = d.對應日期 as string;
      const text = d.更次 ? `${fmtMD(date)} 的 ${d.更次} 還沒發` : `${fmtMD(date)} 有一篇還沒發`;
      cards.push({ source: "b1", text, detailId: d.id, sessionId: d.所屬Session });
    }
  }

  return NextResponse.json({ cards });
}
