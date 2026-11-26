import { after, type NextRequest } from "next/server";
import { captureIdPattern, douyinError, douyinJson, douyinJsonBody } from "@/lib/dojo/douyin/http";
import { askOwnerAboutFile } from "@/lib/dojo/douyin/fileOffer";
import { douyinFinishedMessage } from "@/lib/dojo/douyin/lineStatus";
import { douyinQueue } from "@/lib/dojo/douyin/queue.mjs";
import { InputError } from "@/lib/dojo/douyin/share.mjs";
import { kickTranscriptSync } from "@/lib/dojo/douyin/transcriptSync";
import { clipQuickReply, pushLineMessage } from "@/lib/dojo/lineClipping";
import { failVideoAnalysis, readAnalysisFrames, validFrames } from "@/lib/dojo/videoAnalysisReader";

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
    if (action !== "claim" && action !== "update" && action !== "offer" && action !== "analysis") throw new InputError("找不到這個轉錄入口。", 404);
    const token = req.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new InputError("這台 Mac 尚未配對。", 401);
    const queue = douyinQueue();
    queue.authenticate(token);
    const data = await douyinJsonBody(req, action === "update" || action === "analysis" ? 10 * 1024 * 1024 : 4096);
    if (action === "claim") {
      // The Mac checks in every 20 seconds, which also retries transcripts Notion has not received yet.
      kickTranscriptSync();
      return douyinJson({ job: queue.claim(token, data.ready === true, { files: data.files === true, inbox: typeof data.inbox === "string" ? data.inbox : "", analysis: data.analysis === true }) });
    }
    if (action === "offer") {
      // The Mac found a media file in its inbox folder. Only its name, size and hash are sent here.
      const { ask, ...result } = queue.offer(token, data);
      if (ask) askOwner(data.file as string, (data.name as string).trim());
      return douyinJson(result);
    }
    const id = data.id;
    if (typeof id !== "string" || !captureIdPattern.test(id))
      throw new InputError("素材編號格式不符。");
    if (action === "analysis") {
      // Frames are checked before the job is marked done on the Mac's side; the AI reading runs after the response.
      let frames: ReturnType<typeof validFrames> | null = null;
      if (data.action === "frames") {
        try { frames = validFrames(data); }
        catch (error) { throw new InputError(error instanceof Error ? error.message : "關鍵畫面格式不符。", 422); }
      }
      const result = queue.updateAnalysis(token, data);
      if (frames) { const input = frames; after(() => readAnalysisFrames(id, input)); }
      if (data.action === "fail") after(() => failVideoAnalysis(id, String(data.message || "")));
      return douyinJson(result);
    }
    const result = queue.update(token, data);
    // A failure is announced now. A finished transcript is announced once its correction (簡轉繁、辨識修正) settles;
    // correction and the Notion write-back run after this response, so they never delay or fail the Mac's report.
    if (data.action === "fail") notifyOwner(id, douyinFinishedMessage(queue.view(id)));
    if (data.action === "finish") kickTranscriptSync();
    return douyinJson(result);
  } catch (error) {
    return douyinError(error);
  }
}

/** The Mac offers the file again every loop, so a question LINE could not deliver is retried later. */
function askOwner(file: string, name: string) {
  void askOwnerAboutFile(file, name).catch((error) => {
    console.error("野採新檔案的詢問未送達", error instanceof Error ? error.message : "UnknownError");
  });
}

/** The transcript is already stored, so a notice that cannot be delivered never fails the Mac's update. */
function notifyOwner(captureId: string, message: string | null) {
  if (!message) return;
  void pushLineMessage(message, clipQuickReply(captureId, false, false, "查看這筆素材")).catch((error) => {
    console.error("野採抖音轉錄通知未送達", error instanceof Error ? error.message : "UnknownError");
  });
}
