import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { clipOriginal } from "@/lib/reading/clipStore";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const data = await clipOriginal(req.nextUrl.searchParams.get("id") ?? "");
    const type = data.mimeType.toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"].includes(type))
      throw new LearningError("無法顯示此圖片格式。", 415);
    return new Response(new Uint8Array(data.bytes), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "目前無法打開這張原圖。" },
      { status: e instanceof LearningError ? e.status : 503 },
    );
  }
}
