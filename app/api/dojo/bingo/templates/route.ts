import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { NextRequest, NextResponse } from "next/server";
import { BINGO_TITLE_PREFIX, normalizeWeeklyBoard, WEEKLY_TEMPLATE_LIBRARY_TITLE } from "@/lib/dojo/formal";
import { listJsonRecords, readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";
import { normalizeWeeklyTemplateLibrary } from "@/lib/dojo/weeklyTemplates";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const row = await readJsonRecord(WEEKLY_TEMPLATE_LIBRARY_TITLE);
    const rows=await listJsonRecords(BINGO_TITLE_PREFIX);
    const latest=new Map<string,{week:string;templateId:string}>();
    for(const record of rows){const value=record.value as {weekStart?:string};if(!value?.weekStart)continue;const board=normalizeWeeklyBoard(value,value.weekStart);for(const cell of board.cells){if(cell.sourceType!=='project'||!cell.templateId||!cell.taskInstanceId)continue;const prior=latest.get(cell.taskInstanceId);if(!prior||prior.week<board.weekStart)latest.set(cell.taskInstanceId,{week:board.weekStart,templateId:cell.templateId})}}
    return NextResponse.json({ library: normalizeWeeklyTemplateLibrary(row?.value), persisted: Boolean(row), unavailableTemplateIds:[...new Set([...latest.values()].map(c=>c.templateId))] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const body = await req.json();
    const library = normalizeWeeklyTemplateLibrary(body.library);
    const saved = await upsertJsonRecord(WEEKLY_TEMPLATE_LIBRARY_TITLE, library);
    return NextResponse.json({ ok: true, id: saved.id, library });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
