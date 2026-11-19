import { type NextRequest } from "next/server";
import { captureIdPattern, douyinError, douyinJson, douyinJsonBody } from "@/lib/dojo/douyin/http";
import { douyinQueue } from "@/lib/dojo/douyin/queue.mjs";
import { InputError } from "@/lib/dojo/douyin/share.mjs";

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
    if (action === "claim") return douyinJson({ job: queue.claim(token, data.ready === true) });
    if (typeof data.id !== "string" || !captureIdPattern.test(data.id))
      throw new InputError("素材編號格式不符。");
    return douyinJson(queue.update(token, data));
  } catch (error) {
    return douyinError(error);
  }
}
