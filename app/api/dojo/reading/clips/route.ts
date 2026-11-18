import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import {
  chooseOrCreateClipBook,
  clipBatch,
  listClipBatches,
  receiveWebPage,
  reviewClip,
} from "@/lib/reading/clipStore";
export const dynamic = "force-dynamic";
const failure = (e: unknown) =>
  NextResponse.json(
    { error: e instanceof LearningError ? e.message : "書頁暫時無法讀取或保存，請稍後重試。" },
    { status: e instanceof LearningError ? e.status : 503 },
  );
export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const id = req.nextUrl.searchParams.get("batch");
    return NextResponse.json(id ? { batch: await clipBatch(id) } : { batches: await listClipBatches() }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    requireLearningOwner(req);
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (Number(req.headers.get("content-length")) > 21 * 1024 * 1024)
        throw new LearningError("每張截圖最多 20 MB。", 413);
      const form = await req.formData(),
        file = form.get("file"),
        id = form.get("batchId");
      if (!(file instanceof File) || typeof id !== "string") throw new LearningError("請選擇書頁截圖。");
      await receiveWebPage(id, file);
      return NextResponse.json({ batchId: id });
    }
    const data = await req.json().catch(() => null);
    if (data?.action === "book")
      return NextResponse.json({ bookId: await chooseOrCreateClipBook(data.title, data.readCount) });
    if (
      !data ||
      !["draft", "confirm"].includes(data.action) ||
      typeof data.batchId !== "string" ||
      typeof data.pageId !== "string"
    )
      throw new LearningError("請核對書頁與操作。");
    return NextResponse.json({
      batch: await reviewClip(
        data.batchId,
        data.pageId,
        data.revision,
        data.draft,
        data.action === "confirm",
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
