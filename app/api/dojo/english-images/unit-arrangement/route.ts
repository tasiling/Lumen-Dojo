import { NextRequest, NextResponse } from "next/server";
import {
  approveUnitArrangement,
  cancelUnitArrangement,
  createUnitArrangement,
  executeUnitArrangement,
  previewUnitArrangement,
} from "@/lib/dojo/unitArrangementService";
import { getUnitArrangement, listUnitArrangements } from "@/lib/dojo/unitArrangementStore";

export const dynamic = "force-dynamic";

function ids(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : [];
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (id) return NextResponse.json({ arrangement: await getUnitArrangement(id) });
    const arrangements = (await listUnitArrangements()).map((record) => ({
      id: record.id,
      status: record.status,
      updatedAt: record.updatedAt,
      pack: {
        project: record.pack.project,
        sources: record.pack.sources.map((source) => ({ recordId: source.recordId, title: source.title })),
      },
    }));
    return NextResponse.json({ arrangements });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "create-pack") return NextResponse.json({ arrangement: await createUnitArrangement({
      sourceRecordIds: ids(body.sourceRecordIds), projectId: typeof body.projectId === "string" ? body.projectId : "",
      intent: typeof body.intent === "string" ? body.intent : "", fullTextSourceIds: ids(body.fullTextSourceIds),
      crossTypeConfirmed: body.crossTypeConfirmed === true,
    }) }, { status: 201 });
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "缺少素材編排 ID" }, { status: 400 });
    if (action === "preview") return NextResponse.json({ arrangement: await previewUnitArrangement(id, typeof body.result === "string" ? body.result : "") });
    if (action === "approve") return NextResponse.json({ arrangement: await approveUnitArrangement(id, body.groups, body.pending) });
    if (action === "execute") return NextResponse.json({ arrangement: await executeUnitArrangement(id, false) });
    if (action === "retry") return NextResponse.json({ arrangement: await executeUnitArrangement(id, true) });
    if (action === "cancel") return NextResponse.json({ arrangement: await cancelUnitArrangement(id) });
    return NextResponse.json({ error: "不支援的素材編排操作" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /找不到|不存在/.test(message) ? 404 : /尚未啟用|串接/.test(message) ? 503 : /請|缺少|不正確|不支援|變更|失效|範圍|重複|遺漏/.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
