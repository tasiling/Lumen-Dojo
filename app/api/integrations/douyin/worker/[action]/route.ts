import { type NextRequest } from "next/server";
import { captureIdPattern, douyinError, douyinJson, douyinJsonBody } from "@/lib/dojo/douyin/http";
import { douyinFinishedMessage } from "@/lib/dojo/douyin/lineStatus";
import { douyinQueue } from "@/lib/dojo/douyin/queue.mjs";
import { InputError } from "@/lib/dojo/douyin/share.mjs";
import { kickTranscriptSync } from "@/lib/dojo/douyin/transcriptSync";
import { clipQuickReply, pushLineMessage } from "@/lib/dojo/lineClipping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    if (req.headers.has("origin")) throw new InputError("請從已配對的 Mac 操作。", 403);
    const { action } = await context.params;
    if (action === "pair") {
      const { ticket } = await douyinJsonBody(req);
      return douyinJson({ token: douyinQueue().pair(ticket) });
    }
    if (action !== "claim" && action !== "update") throw new InputError("找不到這個轉錄入口。", 404);
    const token = req.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new InputError("這台 Mac 尚未配對。", 401);
    const queue = douyinQueue();
    queue.authenticate(token);
    const data = await douyinJsonBody(req, action === "update" ? 10 * 1024 * 1024 : 4096);
    if (action === "claim") {
      // The Mac checks in every 20 seconds, which also retries transcripts Notion has not received yet.
      kickTranscriptSync();
      return douyinJson({ job: queue.claim(token, data.ready === true) });
    }
    const id = data.id;
    if (typeof id !== "string" || !captureIdPattern.test(id))
      throw new InputError("素材編號格式不符。");
    const result = queue.update(token, data);
    if (data.action === "finish" || data.action === "fail") notifyOwner(id, douyinFinishedMessage(queue.view(id)));
    // The transcript is safe in the queue; writing it to Notion never delays or fails the Mac's report.
    if (data.action === "finish") kickTranscriptSync();
    return douyinJson(result);
  } catch (error) {
    return douyinError(error);
  }
}

/** The transcript is already stored, so a notice that cannot be delivered never fails the Mac's update. */
function notifyOwner(captureId: string, message: string | null) {
  if (!message) return;
  void pushLineMessage(message, clipQuickReply(captureId, false, false, "查看這筆素材")).catch((error) => {
    console.error("野採抖音轉錄通知未送達", error instanceof Error ? error.message : "UnknownError");
  });
}
