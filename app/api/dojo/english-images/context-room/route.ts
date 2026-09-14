import { NextRequest, NextResponse } from "next/server";
import {
  englishImageContextCandidates,
  exportEnglishImageContext,
} from "@/lib/dojo/englishImageDispatch";
import { getEnglishImageEntry } from "@/lib/dojo/englishImageStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    const { entry } = await getEnglishImageEntry(id);
    return NextResponse.json({
      candidates: englishImageContextCandidates(entry),
      defaults: {
        materialTitle: entry.contextRoomExport?.materialTitle || entry.sourceLabel || (entry.route === "game" ? "英文遊戲旅程" : "英文日常"),
        eventTitle: entry.contextRoomExport?.eventTitle || entry.title,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const materialTitle = typeof body.materialTitle === "string" ? body.materialTitle : "";
    const eventTitle = typeof body.eventTitle === "string" ? body.eventTitle : "";
    const candidateKeys = Array.isArray(body.candidateKeys)
      ? body.candidateKeys.filter((value: unknown): value is string => typeof value === "string")
      : [];
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    const entry = await exportEnglishImageContext({ id, materialTitle, eventTitle, candidateKeys });
    return NextResponse.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /請先|請填寫|候選/.test(message) ? 400 : /尚未完成/.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
