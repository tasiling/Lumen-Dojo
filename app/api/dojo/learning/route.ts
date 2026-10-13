import { NextRequest, NextResponse } from "next/server";
import {
  listJsonRecords,
  readJsonRecord,
  upsertJsonRecord,
} from "@/lib/dojo/notionStore";
import {
  LEARNING_TITLE_PREFIX,
  LEARNING_TRACKS,
  learningRecordTitle,
  normalizeLearningTrack,
} from "@/lib/dojo/learning";
import type { LearningTrackKey } from "@/lib/dojo/formal";

import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { withLearningWriteLock } from "@/lib/dojo/learningFoundation/fileLock";
import { LearningError } from "@/lib/dojo/learningFoundation/model";

export const dynamic = "force-dynamic";

function isTrackKey(value: unknown): value is LearningTrackKey {
  return typeof value === "string" && Object.hasOwn(LEARNING_TRACKS, value);
}

export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const rows = await listJsonRecords(LEARNING_TITLE_PREFIX);
    const byTitle = new Map(rows.map((row) => [row.title, row.value]));
    if (
      byTitle.size !== rows.length ||
      rows.some((row) => !row.value || typeof row.value !== "object")
    )
      throw new LearningError("舊學習紀錄重複或無法讀取，請人工確認", 409);
    const tracks = (Object.keys(LEARNING_TRACKS) as LearningTrackKey[]).map(
      (key) =>
        normalizeLearningTrack(byTitle.get(learningRecordTitle(key)), key),
    );
    return NextResponse.json({ tracks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof LearningError ? error.status : 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const body = await req.json();
    if (!isTrackKey(body.key))
      return NextResponse.json({ error: "學習項目不正確" }, { status: 400 });
    const key = body.key;
    const track = await withLearningWriteLock(async () => {
      const title = learningRecordTitle(key);
      const row = await readJsonRecord(title);
      const previous =
        row?.value && typeof row.value === "object"
          ? (row.value as Record<string, unknown>)
          : {};
      if (
        row &&
        (!body.track?.updatedAt || body.track.updatedAt !== previous.updatedAt)
      )
        throw new LearningError("學習資料版本已變更，請重新讀取", 409);
      const normalized = normalizeLearningTrack(
        { ...previous, ...body.track, activityLog: previous.activityLog },
        key,
      );
      normalized.updatedAt = new Date().toISOString();
      await upsertJsonRecord(title, { ...previous, ...normalized });
      return normalized;
    });
    return NextResponse.json({ ok: true, track });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof LearningError ? error.status : 500 },
    );
  }
}
