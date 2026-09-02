import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  bingoRecordTitle,
  mondayOf,
  normalizeWeeklyBoard,
  taipeiTodayISO,
} from "@/lib/dojo/formal";
import { syncLearningActivity } from "@/lib/dojo/learningStore";
import { listJsonRecords, readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";
import {
  TOPIC_STUDY_TITLE_PREFIX,
  canCompleteTopicStudy,
  emptyTopicStudyRound,
  normalizeTopicStudyRound,
  topicStudyRecordTitle,
  type TopicStudyRound,
} from "@/lib/dojo/topicStudy";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function syncWeeklyTopicCells(round: TopicStudyRound): Promise<boolean> {
  const weekStart = mondayOf(taipeiTodayISO());
  const row = await readJsonRecord(bingoRecordTitle(weekStart));
  if (!row) return false;
  const board = normalizeWeeklyBoard(row.value, weekStart);
  const steps = [
    { key: "topic-select-video", ready: Boolean(round.videoUrl), evidence: "已選片" },
    { key: "topic-watch-absorb", ready: Boolean(round.summary.trim()), evidence: "已完成觀看吸收" },
    { key: "topic-context-talk", ready: Boolean(round.completedAt), evidence: "已完成主題對談" },
  ];
  const legacySpeakingKeys = new Set(["speaking-scenario", "speaking-maintenance"]);
  const completedAt = round.completedAt ?? new Date().toISOString();
  const changed = [];
  const cells = [...board.cells];
  let finalSynced = false;

  for (const step of steps) {
    if (!step.ready) continue;
    const matches = (cell: typeof cells[number]) => cell.learning?.trackKey === "english" && (
      cell.learning.templateKey === step.key ||
      (step.key === "topic-context-talk" && legacySpeakingKeys.has(cell.learning.templateKey))
    );
    const index = cells.findIndex((cell) => !cell.completed && matches(cell));
    if (index < 0) {
      if (step.key === "topic-context-talk" && cells.some((cell) => cell.completed && matches(cell))) finalSynced = true;
      continue;
    }
    const cell = cells[index];
    const completedCell = {
      ...cell,
      completion: { ...cell.completion, progress: cell.completion.target },
      evidenceNote: `VoiceTube 主題修習・${round.topicTitle}・${step.evidence}`,
      completed: true,
      completedAt,
    };
    cells[index] = completedCell;
    changed.push(completedCell);
    if (step.key === "topic-context-talk") finalSynced = true;
  }

  if (changed.length > 0) {
    await upsertJsonRecord(bingoRecordTitle(weekStart), {
      ...board,
      cells,
      updatedAt: new Date().toISOString(),
    });
    await Promise.all(changed.map((cell) => syncLearningActivity({ weekStart, cell })));
  }
  return finalSynced;
}

export async function GET() {
  try {
    const rows = await listJsonRecords(TOPIC_STUDY_TITLE_PREFIX);
    const rounds = rows
      .flatMap((row) => normalizeTopicStudyRound(row.value) ?? [])
      .sort((a, b) => b.classDate.localeCompare(a.classDate) || b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ rounds });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const topicTitle = typeof body.topicTitle === "string" ? body.topicTitle.trim().slice(0, 300) : "";
    const classDate = typeof body.classDate === "string" && DATE_RE.test(body.classDate)
      ? body.classDate
      : taipeiTodayISO();
    if (!topicTitle) return NextResponse.json({ error: "請先填寫這次的課堂主題" }, { status: 400 });
    const id = `${classDate.replace(/-/g, "")}-${randomUUID().slice(0, 8)}`;
    const round = emptyTopicStudyRound({
      id,
      topicTitle,
      classDate,
      videoUrl: typeof body.videoUrl === "string" ? body.videoUrl : "",
    });
    await upsertJsonRecord(topicStudyRecordTitle(round.id), round);
    return NextResponse.json({ ok: true, round }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id.trim().slice(0, 80) : "";
    if (!id) return NextResponse.json({ error: "找不到這次主題修習" }, { status: 400 });
    const title = topicStudyRecordTitle(id);
    const row = await readJsonRecord(title);
    if (!row) return NextResponse.json({ error: "找不到這次主題修習" }, { status: 404 });
    const previous = normalizeTopicStudyRound(row.value);
    if (!previous) return NextResponse.json({ error: "主題修習內容無法讀取" }, { status: 409 });
    const incoming = body.round && typeof body.round === "object" ? body.round as Record<string, unknown> : {};
    const candidate = normalizeTopicStudyRound({
      ...previous,
      videoUrl: typeof incoming.videoUrl === "string" ? incoming.videoUrl : previous.videoUrl,
      videoTitle: typeof incoming.videoTitle === "string" ? incoming.videoTitle : previous.videoTitle,
      summary: typeof incoming.summary === "string" ? incoming.summary : previous.summary,
      expressions: typeof incoming.expressions === "string" ? incoming.expressions : previous.expressions,
      discussionNote: typeof incoming.discussionNote === "string" ? incoming.discussionNote : previous.discussionNote,
      discussionDate: typeof incoming.discussionDate === "string" ? incoming.discussionDate : previous.discussionDate,
      respeakDate: typeof incoming.respeakDate === "string" || incoming.respeakDate === null ? incoming.respeakDate : previous.respeakDate,
      vocabForgeExports: previous.vocabForgeExports,
      completedAt: body.complete === true ? new Date().toISOString() : previous.completedAt,
      updatedAt: new Date().toISOString(),
    });
    if (!candidate) return NextResponse.json({ error: "主題修習內容不正確" }, { status: 400 });
    if (body.complete === true && !canCompleteTopicStudy(candidate)) {
      return NextResponse.json({ error: "請先貼上影片、留下一個重點，並完成一次對談紀錄" }, { status: 400 });
    }
    await upsertJsonRecord(title, candidate);
    const weeklySynced = await syncWeeklyTopicCells(candidate);
    return NextResponse.json({ ok: true, round: candidate, weeklySynced });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
