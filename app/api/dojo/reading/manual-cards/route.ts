import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { listManualCards, saveManualCard } from "@/lib/reading/discussionStore";
export const dynamic = "force-dynamic";
const fail = (e: unknown) =>
  NextResponse.json(
    { error: e instanceof LearningError ? e.message : "暫時無法存取卡片。請重試。" },
    { status: e instanceof LearningError ? e.status : 503 },
  );
export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    return NextResponse.json(
      { cards: await listManualCards(req.nextUrl.searchParams.get("bookId") || undefined) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const data = await req.json().catch(() => null);
    if (!data || !["create", "sharing"].includes(data.action)) throw new LearningError("操作格式不正確。");
    return NextResponse.json({ card: await saveManualCard(data) });
  } catch (e) {
    return fail(e);
  }
}
