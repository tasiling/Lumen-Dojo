import { NextRequest, NextResponse } from "next/server";
import { updateInsightCard } from "@/lib/notion/mutations";
import { getInsightCard } from "@/lib/notion/queries";
import { taipeiTodayISO } from "@/lib/dojo/formal";
import {
  addDaysISO,
  appendResult,
  isInsightStatus,
  isInsightTopic,
  isProgramApplication,
} from "@/lib/reading/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: RouteContext<"/api/dojo/reading/cards/[id]">) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const actionName = typeof body.actionName === "string" ? body.actionName : "";
    const card = await getInsightCard(id);
    const todayISO = taipeiTodayISO();

    if (actionName === "postpone") {
      const count = card.postponementCount + 1;
      await updateInsightCard(id, {
        nextVisitAt: addDaysISO(todayISO, card.actionType === "觀察型" ? 14 : 7),
        postponementCount: count,
      });
      return NextResponse.json({ ok: true, card: await getInsightCard(id), stuck: count >= 3 });
    }

    if (actionName === "result") {
      const result = typeof body.result === "string" ? body.result.trim() : "";
      const status = isInsightStatus(body.status) && (body.status === "已驗證" || body.status === "不成立")
        ? body.status
        : null;
      if (!result) return NextResponse.json({ error: "請先寫下實際結果" }, { status: 400 });
      if (!status) return NextResponse.json({ error: "請判斷這次是已驗證或不成立" }, { status: 400 });
      await updateInsightCard(id, { status, result: appendResult(card.result, result, todayISO) });
      return NextResponse.json({ ok: true, card: await getInsightCard(id) });
    }

    if (actionName === "abandon") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const result = reason ? appendResult(card.result, `放棄追蹤：${reason}`, todayISO) : card.result;
      await updateInsightCard(id, { status: "放棄", result });
      return NextResponse.json({ ok: true, card: await getInsightCard(id) });
    }

    if (actionName === "downgrade") {
      await updateInsightCard(id, {
        actionType: "觀察型",
        status: "觀察中",
        nextVisitAt: addDaysISO(todayISO, 14),
        postponementCount: 0,
      });
      return NextResponse.json({ ok: true, card: await getInsightCard(id) });
    }

    if (actionName === "reframe") {
      const action = typeof body.nextAction === "string" ? body.nextAction.trim() : "";
      if (!action) return NextResponse.json({ error: "請重新說明接下來要觀察什麼" }, { status: 400 });
      await updateInsightCard(id, {
        action,
        actionType: "觀察型",
        status: "觀察中",
        nextVisitAt: addDaysISO(todayISO, 14),
        postponementCount: 0,
      });
      return NextResponse.json({ ok: true, card: await getInsightCard(id) });
    }

    if (actionName === "start") {
      if (card.actionType !== "執行型") {
        return NextResponse.json({ error: "只有執行型卡片需要開始行動" }, { status: 400 });
      }
      await updateInsightCard(id, { status: "行動中", nextVisitAt: addDaysISO(todayISO, 7), postponementCount: 0 });
      return NextResponse.json({ ok: true, card: await getInsightCard(id) });
    }

    if (actionName === "organize") {
      const topics = Array.isArray(body.topics) ? body.topics.filter(isInsightTopic) : card.topics;
      const programApplication = isProgramApplication(body.programApplication)
        ? body.programApplication
        : card.programApplication;
      await updateInsightCard(id, { topics, programApplication });
      return NextResponse.json({ ok: true, card: await getInsightCard(id) });
    }

    return NextResponse.json({ error: "未知的卡片動作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
