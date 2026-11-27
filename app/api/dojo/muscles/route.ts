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
    return NextResponse.json(await muscleCards.snapshot());
  } catch (error) {
    return failure(error);
  }
}
/** 保存肌肉卡的一層（測試層是一個分頁）。 */
export async function PATCH(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const body = await request.json();
    if (typeof body?.key !== "string") throw new LearningError("找不到這張肌肉卡", 404);
    const card = await muscleCards.saveSection(body.key, body.section, body.revision, body.content);
    return NextResponse.json({ card });
  } catch (error) {
    return failure(error);
  }
}
/** 型態卡：新增或保存。 */
export async function POST(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const body = await request.json();
    if (body?.action === "create-pattern")
      return NextResponse.json({ pattern: await muscleCards.createPattern(body.createRequestId, body.input) }, { status: 201 });
    if (body?.action === "edit-pattern")
      return NextResponse.json({ pattern: await muscleCards.editPattern(body.id, body.revision, body.input) });
    throw new LearningError("操作不正確");
  } catch (error) {
    return failure(error);
  }
}
