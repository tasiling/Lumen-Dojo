import { NextRequest, NextResponse } from "next/server";
import { listDetailsInRange, listSlotsInRange, getSession } from "@/lib/notion/queries";
import {
  SESSION_STATUS_ORDER,
  DETAIL_STATUS_ORDER,
  normalizeDetailStatus,
  normalizeSessionStatus,
} from "@/lib/notion/schema";
import { taipeiTodayISO } from "@/lib/dojo/formal";

// Notion 是唯一真相來源,寫入/刪除可能發生在 App 之外(擁有者直接在 Notion
// 操作),讀取一律即時查詢,不吃 Next.js 的 Route Handler 快取,避免顯示已經
// 在 Notion 端變動過的舊資料。
export const dynamic = "force-dynamic";
function monthRange(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = `${yearMonth}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

// P1 主控台首頁資料:行事曆(明細+場次)、完成度儀表(依 DB-03 狀態機)、今日待辦。
export async function GET(req: NextRequest) {
  const yearMonth = req.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const { start, end } = monthRange(yearMonth);
  const today = taipeiTodayISO();

  const [details, slots] = await Promise.all([
    listDetailsInRange(start, end),
    listSlotsInRange(start, end),
  ]);

  // 明細需回頭查所屬 Session 的狀態/項目用途,才能在行事曆標示「實驗」等視覺標記。
  const uniqueSessionIds = Array.from(
    new Set(details.map((d) => d.所屬Session).filter((id): id is string => !!id))
  );
  const sessionMap = new Map<string, Awaited<ReturnType<typeof getSession>>>();
  for (const id of uniqueSessionIds) {
    sessionMap.set(id, await getSession(id));
  }

  // 修正委派書 v1.0 二:行事曆標籤不得顯示明細編號(如 S-20260713-001-13)。
  // 日上三更批次建立的明細有「更次」值(晨光/日光/夜光),直接顯示更次即可——
  // 日期已經是格子本身,標籤只需要更次。非批次系統的舊式單筆明細沒有更次值,
  // 退而用 Session 的項目用途頂替,一樣避開裸編號。
  const calendarFromDetails = details.map((d) => {
    const session = d.所屬Session ? sessionMap.get(d.所屬Session) : undefined;
    return {
      type: "明細" as const,
      id: d.id,
      日期: d.對應日期,
      標題: d.更次 ?? session?.項目用途 ?? "明細",
      更次: d.更次,
      項目用途: session?.項目用途 ?? null,
      狀態: session?.狀態 ?? null,
      是實驗: session?.項目用途 === "實驗",
      所屬Session: d.所屬Session,
    };
  });

  const calendarFromSlots = slots.map((s) => ({
    type: "場次" as const,
    id: s.id,
    日期: s.日期,
    標題: s.場次編號,
    當場主題: s.當場主題,
    狀態: s.狀態,
  }));

  // 完成度按明細的「對應日期」歸月:一個 Session 只要在本月有對應日期的明細,就計入本月
  // (跨月批次會分別計入它涉及的每個月,不再用 Session「建立日期」歸月)。
  //
  // 委派書 v1.6:批次 Session 的實際生產進度以 DB-04「明細狀態」為準匯總;
  // 單筆 Session 沿用 DB-03「狀態」狀態機。兩者刻度不同(3 階 vs 5 階),分開呈現。
  const singleSessionStatus: Record<string, number> = Object.fromEntries(
    SESSION_STATUS_ORDER.map((s) => [s, 0])
  );
  const batchDetailStatus: Record<string, number> = Object.fromEntries(
    DETAIL_STATUS_ORDER.map((s) => [s, 0])
  );
  let singleTotal = 0;
  let batchTotal = 0;

  const countedSingleSessionIds = new Set<string>();
  for (const d of details) {
    const session = d.所屬Session ? sessionMap.get(d.所屬Session) : undefined;
    if (!session) continue;
    if (session.模式 === "批次") {
      batchTotal++;
      // 空值一律視同「待產出」(防禦性 fallback),不讓儀表出現黑數;寫入端的推進動作會補上真值。
      batchDetailStatus[normalizeDetailStatus(d.明細狀態)]++;
    } else if (session.模式 === "單筆" && !countedSingleSessionIds.has(session.id)) {
      countedSingleSessionIds.add(session.id);
      singleTotal++;
      singleSessionStatus[normalizeSessionStatus(session.狀態)]++;
    }
  }
  const total = singleTotal + batchTotal;
  const done = (singleSessionStatus["已交付"] ?? 0) + (batchDetailStatus["已交付"] ?? 0);

  const todayTasks = [
    ...calendarFromDetails.filter((t) => t.日期 === today),
    ...calendarFromSlots.filter((t) => t.日期 === today),
  ];

  return NextResponse.json({
    yearMonth,
    calendar: [...calendarFromDetails, ...calendarFromSlots],
    completion: {
      total,
      done,
      single: { total: singleTotal, byStatus: singleSessionStatus },
      batch: { total: batchTotal, byStatus: batchDetailStatus },
    },
    today,
    todayTasks,
  });
}
