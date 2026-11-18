import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { discussionSummary, listBookDiscussions, updateDiscussion } from "@/lib/reading/discussionStore";

export const dynamic = "force-dynamic";

function failure(error: unknown) {
  const expected = error instanceof LearningError;
  return NextResponse.json(
    { error: expected ? error.message : "閱讀討論暫時無法讀取或保存，請保留原回傳卡再重試。" },
    { status: expected ? error.status : 500 },
  );
}

export async function GET(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const bookId = request.nextUrl.searchParams.get("bookId");
    return NextResponse.json(bookId ? await listBookDiscussions(bookId) : await discussionSummary());
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    requireLearningOwner(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new LearningError("閱讀討論格式不正確。");
    return NextResponse.json(await updateDiscussion(body));
  } catch (error) { return failure(error); }
}
