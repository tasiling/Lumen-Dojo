import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { confirmVideoAnalysis, requestVideoAnalysis, saveTechniqueCard, videoAnalysisStatus } from "@/lib/dojo/videoAnalysisReader";

export const dynamic = "force-dynamic";

const fail = (error: unknown) => NextResponse.json({ error: error instanceof LearningError ? error.message : "操作沒有完成，請稍後再試。" }, { status: error instanceof LearningError ? error.status : 500 });

/** 畫面與節奏分析的狀態。 */
export async function GET(req: NextRequest, context: RouteContext<"/api/dojo/captures/[id]/video-analysis">) {
  try {
    requireLearningOwner(req);
    const { id } = await context.params;
    return NextResponse.json(await videoAnalysisStatus(id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}

/** POST action：request（請 Mac 與 AI 分析）、confirm／unconfirm（是否帶進淬鍊）、card（把一個手法存成手法觀察卡）。 */
export async function POST(req: NextRequest, context: RouteContext<"/api/dojo/captures/[id]/video-analysis">) {
  try {
    requireLearningOwner(req);
    const { id } = await context.params;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "request") return NextResponse.json(await requestVideoAnalysis(id));
    if (body.action === "confirm" || body.action === "unconfirm") return NextResponse.json({ capture: await confirmVideoAnalysis(id, body.action === "confirm") });
    if (body.action === "card") {
      if (!Number.isSafeInteger(body.index)) throw new LearningError("手法編號格式不符。", 400);
      return NextResponse.json({ capture: await saveTechniqueCard(id, body.index as number, { title: typeof body.title === "string" ? body.title : "", words: typeof body.words === "string" ? body.words : "" }) });
    }
    throw new LearningError("無法識別的動作。", 400);
  } catch (error) { return fail(error); }
}
