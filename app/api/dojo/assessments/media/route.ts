import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { nativeAttachmentResponse } from "@/lib/dojo/assessments/nativeEvidence";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const q = req.nextUrl.searchParams;
    return await nativeAttachmentResponse(q.get("page") ?? "", q.get("block") ?? "", req.headers.get("range"), q.get("identity") ?? undefined);
  } catch (e) {
    return NextResponse.json({ error: e instanceof LearningError ? e.message : "附件暫時無法讀取" }, { status: e instanceof LearningError ? e.status : 503, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
}
