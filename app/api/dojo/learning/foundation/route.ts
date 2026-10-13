import { NextRequest, NextResponse } from "next/server";
import { learningFoundation } from "@/lib/dojo/learningFoundation/store";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
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
    return NextResponse.json(await learningFoundation.snapshot());
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const body = await request.json();
    if (body.action === "initialize")
      return NextResponse.json(await learningFoundation.initialize());
    if (body.action !== "create") throw new LearningError("操作不正確");
    const entity = await learningFoundation.create(
      body.kind,
      body.input ?? {},
      body.itemId ?? null,
    );
    return NextResponse.json({ entity }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const body = await request.json();
    return NextResponse.json({
      entity: await learningFoundation.edit(
        body.id,
        body.revision,
        body.input ?? {},
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
