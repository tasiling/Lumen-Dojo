import { NextRequest, NextResponse } from "next/server";
import {
  englishImageContextCandidates,
  exportEnglishImageContext,
  listEnglishImageContextCatalog,
  suggestedEnglishImageContextProject,
} from "@/lib/dojo/englishImageDispatch";
import { getEnglishImageEntry } from "@/lib/dojo/englishImageStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    const { entry } = await getEnglishImageEntry(id);
    const { projects, capability } = await listEnglishImageContextCatalog(entry);
    return NextResponse.json({
      candidates: englishImageContextCandidates(entry),
      projects,
      capability,
      defaults: {
        materialId: suggestedEnglishImageContextProject(entry, projects),
        materialTitle: entry.contextRoomExport?.materialTitle || entry.sourceLabel || (entry.route === "game" ? "英文遊戲旅程" : entry.route === "classroom" ? "英文課堂" : entry.route === "reading" ? "閱讀內容" : "英文日常"),
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
    const materialId = typeof body.materialId === "string" ? body.materialId.trim() : "";
    const materialTitle = typeof body.materialTitle === "string" ? body.materialTitle : "";
    const eventTitle = typeof body.eventTitle === "string" ? body.eventTitle : "";
    const unitId = typeof body.unitId === "string" ? body.unitId.trim() : "";
    const candidateKeys = Array.isArray(body.candidateKeys)
      ? body.candidateKeys.filter((value: unknown): value is string => typeof value === "string")
      : [];
    if (!id) return NextResponse.json({ error: "缺少英文影像 ID" }, { status: 400 });
    const entry = await exportEnglishImageContext({
      id,
      contractMode: body.contractMode === "v2" ? "v2" : "v1",
      projectMode: body.projectMode === "existing" ? "existing" : "create",
      materialId,
      materialTitle,
      unitMode: body.unitMode === "existing" ? "existing" : "create",
      unitId,
      eventTitle,
      projectType: typeof body.projectType === "string" ? body.projectType : "",
      learningPathId: typeof body.learningPathId === "string" ? body.learningPathId : "",
      crossTypeConfirmed: body.crossTypeConfirmed === true,
      candidateKeys,
    });
    return NextResponse.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /請先|請填寫|候選/.test(message) ? 400 : /尚未完成/.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
