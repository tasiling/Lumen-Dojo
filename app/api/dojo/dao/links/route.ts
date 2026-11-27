import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { muscleCards } from "@/lib/dojo/muscleCards/store";
export const dynamic = "force-dynamic";
// 道藏卡片連結：知識網絡的資料只放道藏；修習所的肌肉卡透過這裡新增與刪除。
function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status: error instanceof LearningError ? error.status : 500 },
  );
}
export async function GET(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const { links } = await muscleCards.snapshot();
    return NextResponse.json({ links });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const body = await request.json();
    return NextResponse.json({ link: await muscleCards.createLink(body?.createRequestId, body?.input) }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const body = await request.json();
    await muscleCards.archiveLink(body?.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
