import { NextRequest, NextResponse } from "next/server";
import { WEEKLY_TEMPLATE_LIBRARY_TITLE } from "@/lib/dojo/formal";
import { readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";
import { normalizeWeeklyTemplateLibrary } from "@/lib/dojo/weeklyTemplates";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const row = await readJsonRecord(WEEKLY_TEMPLATE_LIBRARY_TITLE);
    return NextResponse.json({ library: normalizeWeeklyTemplateLibrary(row?.value), persisted: Boolean(row) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const library = normalizeWeeklyTemplateLibrary(body.library);
    const saved = await upsertJsonRecord(WEEKLY_TEMPLATE_LIBRARY_TITLE, library);
    return NextResponse.json({ ok: true, id: saved.id, library });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
