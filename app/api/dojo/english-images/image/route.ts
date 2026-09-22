import { NextRequest, NextResponse } from "next/server";
import { englishImageAttachmentUrl, getEnglishImageEntry } from "@/lib/dojo/englishImageStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    const index = Math.max(0, Number.parseInt(req.nextUrl.searchParams.get("index") ?? "0", 10) || 0);
    const { entry } = await getEnglishImageEntry(id);
    const attachment = entry.attachments[index];
    if (!attachment) throw new Error("找不到指定圖片");
    return NextResponse.redirect(await englishImageAttachmentUrl(attachment), {
      status: 307,
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
