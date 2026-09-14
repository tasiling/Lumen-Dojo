import { NextRequest, NextResponse } from "next/server";
import { analyzeEnglishImage } from "@/lib/dojo/englishImageAnalysis";
import { normalizeEnglishImageEntry } from "@/lib/dojo/englishImage";
import {
  getEnglishImageEntry,
  listEnglishImageEntries,
  moveEnglishImageToCapture,
  routeEnglishImage,
  saveEnglishImageEntry,
} from "@/lib/dojo/englishImageStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ entries: await listEnglishImageEntries() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    const current = await getEnglishImageEntry(id);
    const entry = normalizeEnglishImageEntry({ ...current.entry, ...(body.entry && typeof body.entry === "object" ? body.entry : {}) }, { id, capturedAt: current.entry.capturedAt, touch: true });
    if (!entry) return NextResponse.json({ error: "英文影像內容不正確" }, { status: 400 });
    return NextResponse.json({ entry: await saveEnglishImageEntry(entry) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    if (body.action === "analyze") return NextResponse.json({ entry: await analyzeEnglishImage(id, { force: true }) });
    if (body.action === "routeAndAnalyze") {
      const route = body.route === "game" || body.route === "daily" || body.route === "classroom" ? body.route : null;
      if (!route) return NextResponse.json({ error: "請選擇遊戲英文、英文日常或課堂英文" }, { status: 400 });
      const { entry } = await getEnglishImageEntry(id);
      const routed = await routeEnglishImage(entry, route);
      return NextResponse.json({ entry: await analyzeEnglishImage(routed.id) });
    }
    if (body.action === "moveToCapture") {
      const { entry } = await getEnglishImageEntry(id);
      return NextResponse.json({ capture: await moveEnglishImageToCapture(entry) });
    }
    return NextResponse.json({ error: "不支援的動作" }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
