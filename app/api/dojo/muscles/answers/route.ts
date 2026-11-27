import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { muscleCards } from "@/lib/dojo/muscleCards/store";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status: error instanceof LearningError ? error.status : 500 },
  );
}
export async function GET(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const card = request.nextUrl.searchParams.get("card") ?? "";
    return NextResponse.json({ answers: await muscleCards.listAnswers(card) });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const body = await request.json();
    if (typeof body?.card !== "string") throw new LearningError("找不到這張肌肉卡", 404);
    const answers = await muscleCards.addAnswers(body.card, body.createRequestId, body.entries);
    return NextResponse.json({ answers }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const body = await request.json();
    if (typeof body?.card !== "string") throw new LearningError("找不到這張肌肉卡", 404);
    await muscleCards.archiveAnswer(body.card, body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
