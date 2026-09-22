import { NextRequest, NextResponse } from "next/server";
import { analyzeEnglishImage } from "@/lib/dojo/englishImageAnalysis";
import { isEnglishImageLearningRoute, type EnglishImageEntry, type EnglishImageStatus } from "@/lib/dojo/englishImage";
import {
  getEnglishImageEntry,
  listEnglishImageEntries,
  moveEnglishImageToCapture,
  routeEnglishImage,
  updateEnglishImageEntry,
  updateEnglishImageStatus,
} from "@/lib/dojo/englishImageStore";

export const dynamic = "force-dynamic";

const EDITABLE_FIELDS = [
  "route",
  "title",
  "sourceLabel",
  "contextNote",
  "ocrText",
  "englishRecord",
  "chineseExplanation",
  "learningPhrases",
  "vocabularyWords",
] as const satisfies readonly (keyof EnglishImageEntry)[];

function statusFrom(value: unknown): EnglishImageStatus | null {
  return value === "inbox" || value === "organized" ? value : null;
}

export async function GET() {
  try { return NextResponse.json({ entries: await listEnglishImageEntries() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "batchSetStatus") {
      const status = statusFrom(body.status);
      const ids: string[] = [];
      if (Array.isArray(body.ids)) {
        for (const value of body.ids) {
          if (typeof value !== "string") continue;
          const id = value.trim();
          if (id && !ids.includes(id)) ids.push(id);
        }
      }
      if (!status) return NextResponse.json({ error: "整理狀態不正確" }, { status: 400 });
      if (!ids.length) return NextResponse.json({ error: "尚未選取英文影像" }, { status: 400 });
      if (ids.length > 100) return NextResponse.json({ error: "單次最多批次處理 100 筆英文影像" }, { status: 400 });
      const entries: EnglishImageEntry[] = [];
      const failures: { id: string; error: string }[] = [];
      // Intentionally sequential: Notion writes are rate-limited and each item must fail independently.
      for (const id of ids) {
        try { entries.push(await updateEnglishImageStatus(id, status)); }
        catch (error) { failures.push({ id, error: error instanceof Error ? error.message : String(error) }); }
      }
      return NextResponse.json({ entries, failures, succeeded: entries.length, failed: failures.length });
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    if (body.action === "setStatus") {
      const status = statusFrom(body.status);
      if (!status) return NextResponse.json({ error: "整理狀態不正確" }, { status: 400 });
      return NextResponse.json({ entry: await updateEnglishImageStatus(id, status) });
    }
    const requested = body.entry && typeof body.entry === "object" ? body.entry as Partial<EnglishImageEntry> : {};
    return NextResponse.json({ entry: await updateEnglishImageEntry(id, () => Object.fromEntries(
      EDITABLE_FIELDS.filter((field) => requested[field] !== undefined).map((field) => [field, requested[field]])
    ) as Partial<EnglishImageEntry>) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    if (body.action === "analyze") return NextResponse.json({ entry: await analyzeEnglishImage(id, { force: true }) });
    if (body.action === "routeAndAnalyze") {
      const route = isEnglishImageLearningRoute(body.route) ? body.route : null;
      if (!route) return NextResponse.json({ error: "請選擇遊戲英文、英文日常、課堂英文或閱讀英文" }, { status: 400 });
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
