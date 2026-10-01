import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { learningRecords } from "@/lib/dojo/learningRecords/store";
export const dynamic = "force-dynamic";
function failure(e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof LearningError ? e.status : 503 }); }
export async function GET(req: NextRequest) {
  try { requireLearningOwner(req); const q = req.nextUrl.searchParams;
    if (q.get("id")) return NextResponse.json({ record: await learningRecords.read(q.get("id")!) });
    return NextResponse.json(await learningRecords.list({ learningItemId: q.get("learningItemId") ?? undefined, stageId: q.get("stageId") ?? undefined, topicId: q.get("topicId") ?? undefined, status: q.get("status") ?? undefined, cursor: q.get("cursor") ?? undefined, limit: Number(q.get("limit")) || 20 }));
  } catch(e) { return failure(e); }
}
export async function POST(req: NextRequest) { try { requireLearningOwner(req); const b = await req.json(); return NextResponse.json({ record: await learningRecords.create(b.input ?? {}) }, { status: 201 }); } catch(e) { return failure(e); } }
export async function PATCH(req: NextRequest) { try { requireLearningOwner(req); const b = await req.json(); return NextResponse.json({ record: await learningRecords.edit(b.id, b.revision, b.input ?? {}) }); } catch(e) { return failure(e); } }
