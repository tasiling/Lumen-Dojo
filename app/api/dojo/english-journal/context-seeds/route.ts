import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  englishJournalContextCandidates,
  englishJournalRecordTitle,
  normalizeEnglishJournalPractice,
  type EnglishContextExport,
} from "@/lib/dojo/englishJournal";
import {
  CONTEXT_SEED_TITLE_PREFIX,
  contextPracticePrompt,
  contextSeedFromCandidate,
  normalizeContextPracticeSeed,
} from "@/lib/dojo/contextPractice";
import { bingoRecordTitle, mondayOf, normalizeWeeklyBoard, taipeiTodayISO } from "@/lib/dojo/formal";
import { syncLearningActivity } from "@/lib/dojo/learningStore";
import { listJsonRecords, readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function seedTitle(date: string, key: string): string {
  const suffix = createHash("sha1").update(key).digest("hex").slice(0, 12);
  return `${CONTEXT_SEED_TITLE_PREFIX}${date.replace(/-/g, "")}-${suffix}`;
}

async function syncWeeklyContextCell(seed: NonNullable<ReturnType<typeof normalizeContextPracticeSeed>>): Promise<boolean> {
  const weekStart = mondayOf(taipeiTodayISO());
  const title = bingoRecordTitle(weekStart);
  const row = await readJsonRecord(title);
  if (!row) return false;
  const board = normalizeWeeklyBoard(row.value, weekStart);
  const preferred = ["english-context-chat", "speaking-scenario", "speaking-maintenance"];
  const index = board.cells.findIndex((cell) => !cell.completed && cell.learning?.trackKey === "english" && preferred.includes(cell.learning.templateKey));
  if (index < 0) return false;
  const cells = [...board.cells];
  const cell = cells[index];
  const completedCell = {
    ...cell,
    completion: { ...cell.completion, progress: cell.completion.target },
    evidenceNote: `句型語法修習匣・${seed.kind === "grammar" ? "語法" : "句型"}・${seed.focus}`,
    completed: true,
    completedAt: seed.practiceCompletedAt ?? new Date().toISOString(),
  };
  cells[index] = completedCell;
  await upsertJsonRecord(title, { ...board, cells, updatedAt: new Date().toISOString() });
  await syncLearningActivity({ weekStart, cell: completedCell });
  return true;
}

export async function GET() {
  try {
    const rows = await listJsonRecords(CONTEXT_SEED_TITLE_PREFIX);
    const seeds = rows
      .flatMap((row) => normalizeContextPracticeSeed(row.value) ?? [])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ seeds: seeds.map((seed) => ({ ...seed, practicePrompt: contextPracticePrompt(seed) })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!key) return NextResponse.json({ error: "找不到語境素材" }, { status: 400 });
    const rows = await listJsonRecords(CONTEXT_SEED_TITLE_PREFIX);
    const found = rows.find((row) => normalizeContextPracticeSeed(row.value)?.id === key);
    if (!found) return NextResponse.json({ error: "找不到語境素材" }, { status: 404 });
    const seed = normalizeContextPracticeSeed(found.value);
    if (!seed) return NextResponse.json({ error: "語境素材無法讀取" }, { status: 409 });
    const action = body.action === "complete" ? "complete" : "start";
    const now = new Date().toISOString();
    if (action === "complete") {
      const successSentence = typeof body.successSentence === "string" ? body.successSentence.trim().slice(0, 4000) : "";
      const stuckPoint = typeof body.stuckPoint === "string" ? body.stuckPoint.trim().slice(0, 4000) : "";
      const nextAdjustment = typeof body.nextAdjustment === "string" ? body.nextAdjustment.trim().slice(0, 4000) : "";
      if (!successSentence && !stuckPoint) {
        return NextResponse.json({ error: "請留下成功說出的句子，或這次卡住的地方" }, { status: 400 });
      }
      const wasCompleted = seed.status === "completed";
      const updated = {
        ...seed,
        status: "completed" as const,
        practiceStartedAt: seed.practiceStartedAt ?? now,
        practiceCompletedAt: seed.practiceCompletedAt ?? now,
        successSentence,
        stuckPoint,
        nextAdjustment,
      };
      await upsertJsonRecord(found.title, updated);
      const weeklySynced = wasCompleted ? false : await syncWeeklyContextCell(updated);
      return NextResponse.json({ ok: true, weeklySynced, seed: { ...updated, practicePrompt: contextPracticePrompt(updated) } });
    }
    const updated = {
      ...seed,
      status: seed.status === "completed" ? "completed" as const : "practicing" as const,
      practiceStartedAt: seed.practiceStartedAt ?? now,
      successSentence: typeof body.successSentence === "string" ? body.successSentence.trim().slice(0, 4000) : seed.successSentence,
      stuckPoint: typeof body.stuckPoint === "string" ? body.stuckPoint.trim().slice(0, 4000) : seed.stuckPoint,
      nextAdjustment: typeof body.nextAdjustment === "string" ? body.nextAdjustment.trim().slice(0, 4000) : seed.nextAdjustment,
    };
    await upsertJsonRecord(found.title, updated);
    return NextResponse.json({ ok: true, weeklySynced: false, seed: { ...updated, practicePrompt: contextPracticePrompt(updated) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const date = typeof body.date === "string" && DATE_RE.test(body.date) ? body.date : "";
    const keys = Array.isArray(body.keys)
      ? [...new Set(body.keys.filter((key: unknown): key is string => typeof key === "string" && Boolean(key.trim())).map((key: string) => key.trim()))]
      : [];
    if (!date) return NextResponse.json({ error: "日記日期不正確" }, { status: 400 });
    if (!keys.length || keys.length > 2) return NextResponse.json({ error: "每篇請選擇 1–2 個句型或語法" }, { status: 400 });

    const title = englishJournalRecordTitle(date);
    const row = await readJsonRecord(title);
    if (!row) return NextResponse.json({ error: "找不到這篇英文練習" }, { status: 404 });
    const practice = normalizeEnglishJournalPractice(row.value, date);
    if (!practice) return NextResponse.json({ error: "英文練習內容無法讀取" }, { status: 409 });
    const candidates = englishJournalContextCandidates(practice);
    const selected = keys.flatMap((key) => candidates.find((candidate) => candidate.key === key) ?? []);
    if (selected.length !== keys.length) return NextResponse.json({ error: "候選內容已變更，請重新整理" }, { status: 409 });

    let created = 0;
    let existing = 0;
    const now = new Date().toISOString();
    const exports: EnglishContextExport[] = [];
    for (const candidate of selected) {
      const recordTitle = seedTitle(date, candidate.key);
      const found = await readJsonRecord(recordTitle);
      if (found) existing += 1;
      else {
        await upsertJsonRecord(recordTitle, contextSeedFromCandidate(candidate, date));
        created += 1;
      }
      exports.push({ key: candidate.key, focus: candidate.focus, segmentId: candidate.segmentId, syncedAt: now });
    }

    const byKey = new Map(practice.contextExports.map((item) => [item.key, item]));
    exports.forEach((item) => byKey.set(item.key, item));
    const updated = { ...practice, contextExports: [...byKey.values()], updatedAt: now };
    const saved = await upsertJsonRecord(title, updated);
    return NextResponse.json({ ok: true, practice: normalizeEnglishJournalPractice(saved.value, date), created, existing });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
