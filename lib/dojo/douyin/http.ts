import { NextResponse } from "next/server";
import { LearningError } from "../learningFoundation/model";
import { InputError } from "./share.mjs";

export const captureIdPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export function douyinJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function douyinError(error: unknown) {
  if (error instanceof InputError || error instanceof LearningError)
    return douyinJson({ error: error.message }, error.status);
  console.error("野採抖音轉錄作業失敗", error instanceof Error ? error.name : "UnknownError");
  return douyinJson({ error: "暫時無法處理這筆轉錄，請稍後重試。" }, 503);
}

export async function douyinJsonBody(req: Request, limit = 4096): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(req.headers.get("content-type") || ""))
    throw new InputError("請使用 JSON 格式。", 415);
  if (Number(req.headers.get("content-length")) > limit) throw new InputError("請求內容過大。", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new InputError("請求內容為空。");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        // Close the request stream without buffering the rest of the upload.
        void reader.cancel().catch(() => undefined);
        throw new InputError("請求內容過大。", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new InputError("JSON 格式不正確。"); }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded))
    throw new InputError("請提供 JSON 物件。");
  return decoded as Record<string, unknown>;
}
