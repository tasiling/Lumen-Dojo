import { NextRequest, NextResponse } from "next/server";
import { listJsonRecords, upsertJsonRecord } from "@/lib/dojo/notionStore";
import {
  LEARNING_TITLE_PREFIX,
  LEARNING_TRACKS,
  learningRecordTitle,
  normalizeLearningTrack,
} from "@/lib/dojo/learning";
import type { LearningTrackKey } from "@/lib/dojo/formal";

export const dynamic = "force-dynamic";

function isTrackKey(value: unknown): value is LearningTrackKey {
  return typeof value === "string" && value in LEARNING_TRACKS;
}

export async function GET() {
  try {
    const rows = await listJsonRecords(LEARNING_TITLE_PREFIX);
    const byTitle = new Map(rows.map((row) => [row.title, row.value]));
    const tracks = (Object.keys(LEARNING_TRACKS) as LearningTrackKey[]).map((key) =>
      normalizeLearningTrack(byTitle.get(learningRecordTitle(key)), key)
    );
    return NextResponse.json({ tracks });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isTrackKey(body.key)) return NextResponse.json({ error: "學習項目不正確" }, { status: 400 });
    const track = normalizeLearningTrack(body.track, body.key);
    await upsertJsonRecord(learningRecordTitle(body.key), track);
    return NextResponse.json({ ok: true, track });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

