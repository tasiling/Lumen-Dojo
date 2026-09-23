import { NextRequest, NextResponse } from "next/server";
import { englishImageAttachmentBytes, getEnglishImageEntry } from "@/lib/dojo/englishImageStore";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.LUMEN_SOURCE_IMAGE_PROXY_SECRET?.trim() || "";
  const actual = request.headers.get("authorization") || "";
  return Boolean(secret) && actual === `Bearer ${secret}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ entryId: string; attachmentId: string }> },
) {
  if (!authorized(request)) return NextResponse.json({ error: "圖片代理授權失敗" }, { status: 401 });
  try {
    const { entryId, attachmentId } = await context.params;
    const { entry } = await getEnglishImageEntry(entryId);
    const attachment = entry.attachments.find((item) => item.id === attachmentId || item.blockId === attachmentId);
    if (!attachment) return NextResponse.json({ error: "附件不存在或不屬於指定來源" }, { status: 404 });
    const { bytes, mimeType } = await englishImageAttachmentBytes(attachment);
    if (!mimeType.toLowerCase().startsWith("image/"))
      return NextResponse.json({ error: "來源回應不是允許的圖片格式" }, { status: 415 });
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
