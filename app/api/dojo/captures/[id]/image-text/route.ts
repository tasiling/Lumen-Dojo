import { NextRequest, NextResponse } from "next/server";
import { readCaptureImageText, saveCaptureImageText, unconfirmCaptureImageText } from "@/lib/dojo/captureImageReader";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";

export const dynamic = "force-dynamic";

/** 採集圖片文字。POST action：read（請 AI 讀圖）、save（儲存修改，可同時確認）、unconfirm（取消確認）。 */
export async function POST(req: NextRequest, context: RouteContext<"/api/dojo/captures/[id]/image-text">) {
  try {
    requireLearningOwner(req);
    const { id } = await context.params;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "read") return NextResponse.json({ capture: await readCaptureImageText(id) });
    if (body.action === "unconfirm") return NextResponse.json({ capture: await unconfirmCaptureImageText(id) });
    if (body.action === "save") {
      const pages = Array.isArray(body.pages) ? body.pages.flatMap((page) => page && typeof page === "object" && typeof (page as { attachmentId?: unknown }).attachmentId === "string" && typeof (page as { text?: unknown }).text === "string"
        ? [{ attachmentId: (page as { attachmentId: string }).attachmentId, text: (page as { text: string }).text }] : []) : [];
      return NextResponse.json({ capture: await saveCaptureImageText(id, { pages, confirm: body.confirm === true }) });
    }
    throw new LearningError("無法識別的動作。", 400);
  } catch (error) {
    return NextResponse.json({ error: error instanceof LearningError ? error.message : "操作沒有完成，請稍後再試。" }, { status: error instanceof LearningError ? error.status : 500 });
  }
}
