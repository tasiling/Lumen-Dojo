import { NextRequest, NextResponse } from "next/server";
import {
  DAILY_TITLE_PREFIX,
  bingoRecordTitle,
  mondayOf,
  normalizeDailyRecord,
  normalizeWeeklyBoard,
  taipeiTodayISO,
} from "@/lib/dojo/formal";
import {
  ENGLISH_JOURNAL_TITLE_PREFIX,
  canCompleteEnglishJournal,
  emptyEnglishJournalPractice,
  englishJournalRecordTitle,
  normalizeEnglishJournalPractice,
  type EnglishJournalPractice,
} from "@/lib/dojo/englishJournal";
import { formatDailyJournalText } from "@/lib/dojo/journalExport";
import { syncLearningActivity } from "@/lib/dojo/learningStore";
import { listJsonRecords, readJsonRecord, upsertJsonRecord } from "@/lib/dojo/notionStore";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function titleDate(title: string): string | null {
  const match = title.match(/(\d{4})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function isUsefulSource(text: string): boolean {
  return !text.includes("這一天沒有留下文字內容。") && text.trim().length > 20;
}

async function sourceForDate(date: string): Promise<string> {
  const row = await readJsonRecord(`${DAILY_TITLE_PREFIX}${date.replace(/-/g, "")}`);
  if (!row) return "";
  const record = normalizeDailyRecord(row.value, date);
  const source = formatDailyJournalText({ date, record, mode: "review" });
  return isUsefulSource(source) ? source : "";
}

async function completeWeeklyJournalCell(practice: EnglishJournalPractice): Promise<boolean> {
  const weekStart = mondayOf(taipeiTodayISO());
  const row = await readJsonRecord(bingoRecordTitle(weekStart));
  if (!row) return false;
  const board = normalizeWeeklyBoard(row.value, weekStart);
  const cellIndex = board.cells.findIndex((cell) =>
    !cell.completed &&
    cell.learning?.trackKey === "english" &&
    cell.learning.templateKey === "journal-translation"
  );
  if (cellIndex < 0) {
    const completedCell = board.cells.find((cell) =>
      cell.completed &&
      cell.learning?.trackKey === "english" &&
      cell.learning.templateKey === "journal-translation"
    );
    if (!completedCell) return false;
    await syncLearningActivity({ weekStart, cell: completedCell });
    return true;
  }

  const completedAt = practice.completedAt ?? new Date().toISOString();
  const cell = board.cells[cellIndex];
  const completedCell = {
    ...cell,
    completion: { ...cell.completion, progress: cell.completion.target },
    evidenceNote: `英文自譯工作台・${practice.date} 日記`,
    completed: true,
    completedAt,
  };
  const updatedBoard = {
    ...board,
    cells: board.cells.map((item, index) => index === cellIndex ? completedCell : item),
    updatedAt: new Date().toISOString(),
  };
  await upsertJsonRecord(bingoRecordTitle(weekStart), updatedBoard);
  await syncLearningActivity({ weekStart, cell: completedCell });
  return true;
}

export async function GET() {
  try {
    const [practiceRows, dailyRows] = await Promise.all([
      listJsonRecords(ENGLISH_JOURNAL_TITLE_PREFIX),
      listJsonRecords(DAILY_TITLE_PREFIX),
    ]);
    const practices = practiceRows
      .flatMap((row) => {
        const practice = normalizeEnglishJournalPractice(row.value, titleDate(row.title) ?? undefined);
        return practice ? [practice] : [];
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    const queuedDates = new Set(practices.map((practice) => practice.date));
    const sources = dailyRows
      .flatMap((row) => {
        const date = titleDate(row.title);
        if (!date || queuedDates.has(date)) return [];
        const record = normalizeDailyRecord(row.value, date);
        const sourceText = formatDailyJournalText({ date, record, mode: "review" });
        if (!isUsefulSource(sourceText)) return [];
        return [{
          date,
          title: record.morning.intention || record.evening.highlight || "這一天的日記",
          sourceText,
        }];
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);
    return NextResponse.json({ practices, sources });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const date = typeof body.date === "string" && DATE_RE.test(body.date) ? body.date : "";
    if (!date) return NextResponse.json({ error: "日記日期不正確" }, { status: 400 });
    const title = englishJournalRecordTitle(date);
    const existing = await readJsonRecord(title);
    if (existing) {
      const practice = normalizeEnglishJournalPractice(existing.value, date);
      if (!practice) return NextResponse.json({ error: "既有英文練習無法讀取" }, { status: 409 });
      return NextResponse.json({ ok: true, practice, created: false });
    }
    const suppliedSource = typeof body.sourceText === "string" ? body.sourceText.trim().slice(0, 30000) : "";
    const sourceText = suppliedSource || await sourceForDate(date);
    if (!sourceText) return NextResponse.json({ error: "這一天還沒有可供自譯的日記內容" }, { status: 400 });
    const practice = emptyEnglishJournalPractice(date, sourceText);
    await upsertJsonRecord(title, practice);
    return NextResponse.json({ ok: true, practice, created: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const date = typeof body.date === "string" && DATE_RE.test(body.date) ? body.date : "";
    if (!date) return NextResponse.json({ error: "日記日期不正確" }, { status: 400 });
    const title = englishJournalRecordTitle(date);
    const row = await readJsonRecord(title);
    if (!row) return NextResponse.json({ error: "找不到這篇英文練習" }, { status: 404 });
    const previous = normalizeEnglishJournalPractice(row.value, date);
    if (!previous) return NextResponse.json({ error: "英文練習內容無法讀取" }, { status: 409 });
    const incoming = body.practice && typeof body.practice === "object" ? body.practice : {};
    const incomingSegments = Array.isArray((incoming as { segments?: unknown }).segments)
      ? (incoming as { segments: unknown[] }).segments
      : [];
    const safeSegments = previous.segments.map((segment) => {
      const update = incomingSegments.find((item) =>
        item && typeof item === "object" && (item as { id?: unknown }).id === segment.id
      );
      if (!update || typeof update !== "object") return segment;
      const fields = update as Record<string, unknown>;
      return {
        ...segment,
        draft: typeof fields.draft === "string" ? fields.draft : segment.draft,
        aiRevision: typeof fields.aiRevision === "string" ? fields.aiRevision : segment.aiRevision,
        finalVersion: typeof fields.finalVersion === "string" ? fields.finalVersion : segment.finalVersion,
        phrases: typeof fields.phrases === "string" ? fields.phrases : segment.phrases,
        status: fields.status === "skipped" ? "skipped" as const : segment.status === "skipped" ? "untouched" as const : segment.status,
      };
    });
    const requestedComplete = body.complete === true;
    const promptCopiedSegmentId = typeof body.promptCopied === "string" ? body.promptCopied : null;
    const merged = normalizeEnglishJournalPractice({
      ...previous,
      ...incoming,
      segments: safeSegments,
      vocabForgeExports: previous.vocabForgeExports,
      date,
      sourceText: previous.sourceText,
      createdAt: previous.createdAt,
      completedAt: requestedComplete ? new Date().toISOString() : previous.completedAt,
      updatedAt: new Date().toISOString(),
    }, date);
    const candidate = merged && promptCopiedSegmentId
      ? normalizeEnglishJournalPractice({
          ...merged,
          segments: merged.segments.map((segment) => segment.id === promptCopiedSegmentId
            ? { ...segment, promptCopiedAt: new Date().toISOString() }
            : segment),
        }, date)
      : merged;
    if (!candidate) return NextResponse.json({ error: "英文練習內容不正確" }, { status: 400 });
    if (requestedComplete && !canCompleteEnglishJournal(candidate)) {
      return NextResponse.json({ error: "每個未略過的段落都需要英文初稿，以及 AI 修正版或自己的定稿" }, { status: 400 });
    }
    await upsertJsonRecord(title, candidate);
    const weeklySynced = requestedComplete ? await completeWeeklyJournalCell(candidate) : false;
    return NextResponse.json({ ok: true, practice: candidate, weeklySynced });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
