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
  canCompleteSegment,
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

async function completeWeeklyJournalCell(practice: EnglishJournalPractice, segmentId: string): Promise<boolean> {
  const weekStart = mondayOf(taipeiTodayISO());
  const row = await readJsonRecord(bingoRecordTitle(weekStart));
  if (!row) return false;
  const board = normalizeWeeklyBoard(row.value, weekStart);
  const journalKeys = new Set(["journal-translation", "journal-translation-1", "journal-translation-2"]);
  const available = board.cells.filter((cell) =>
    cell.learning?.trackKey === "english" && journalKeys.has(cell.learning.templateKey)
  );
  if (available.length === 0) return false;
  const segment = practice.segments.find((item) => item.id === segmentId);
  if (!segment?.completedAt) return false;
  const completedAt = segment.completedAt;
  let remaining = 1;
  const changed: typeof board.cells = [];
  const cells = board.cells.map((cell) => {
    if (remaining <= 0 || cell.completed || cell.learning?.trackKey !== "english" || !journalKeys.has(cell.learning.templateKey)) return cell;
    remaining -= 1;
    const completedCell = {
      ...cell,
      completion: { ...cell.completion, progress: cell.completion.target },
      evidenceNote: `英文自譯工作台・${practice.date}・${segment.label}`,
      completed: true,
      completedAt,
    };
    changed.push(completedCell);
    return completedCell;
  });
  if (changed.length === 0) {
    await Promise.all(available.filter((cell) => cell.completed).map((cell) => syncLearningActivity({ weekStart, cell })));
    return false;
  }
  const updatedBoard = {
    ...board,
    cells,
    updatedAt: new Date().toISOString(),
  };
  await upsertJsonRecord(bingoRecordTitle(weekStart), updatedBoard);
  await Promise.all(changed.map((cell) => syncLearningActivity({ weekStart, cell })));
  return true;
}

function joinField(left: string, right: string): string {
  return [left.trim(), right.trim()].filter(Boolean).join("\n\n");
}

function splitPoint(text: string): number | null {
  if (text.length < 50) return null;
  const middle = Math.floor(text.length / 2);
  const candidates = [...text.matchAll(/\n\s*\n|[。！？!?；;]/g)]
    .map((match) => (match.index ?? 0) + match[0].length)
    .filter((index) => index >= 20 && index <= text.length - 20);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0] ?? null;
}

function applyStructureChange(practice: EnglishJournalPractice, structure: unknown): EnglishJournalPractice {
  if (!structure || typeof structure !== "object") return practice;
  const request = structure as { type?: unknown; segmentId?: unknown };
  const segmentId = typeof request.segmentId === "string" ? request.segmentId : "";
  const index = practice.segments.findIndex((segment) => segment.id === segmentId);
  if (index < 0) throw new Error("找不到要調整的段落");

  if (request.type === "merge-next") {
    const left = practice.segments[index];
    const right = practice.segments[index + 1];
    if (!right) throw new Error("這已經是最後一段");
    const merged = {
      ...left,
      sourceText: joinField(left.sourceText, right.sourceText),
      draft: joinField(left.draft, right.draft),
      aiRevision: joinField(left.aiRevision, right.aiRevision),
      finalVersion: joinField(left.finalVersion, right.finalVersion),
      phrases: joinField(left.phrases, right.phrases),
      contextNotes: joinField(left.contextNotes, right.contextNotes),
      completedAt: left.completedAt && right.completedAt
        ? (left.completedAt > right.completedAt ? left.completedAt : right.completedAt)
        : null,
    };
    const segments = [...practice.segments];
    segments.splice(index, 2, merged);
    return {
      ...practice,
      segments,
      vocabForgeExports: practice.vocabForgeExports.map((item) => item.segmentId === right.id ? { ...item, segmentId: left.id } : item),
      contextExports: practice.contextExports.map((item) => item.segmentId === right.id ? { ...item, segmentId: left.id } : item),
    };
  }

  if (request.type === "split-auto") {
    const segment = practice.segments[index];
    const hasWork = Boolean(segment.draft.trim() || segment.aiRevision.trim() || segment.finalVersion.trim()
      || segment.phrases.trim() || segment.contextNotes.trim() || segment.completedAt);
    if (hasWork) throw new Error("這段已經有學習內容；請先保留目前段落，避免翻譯與原文錯位");
    const at = splitPoint(segment.sourceText);
    if (!at) throw new Error("這段找不到適合的自然切點");
    const first = { ...segment, id: `${segment.id}-a`, sourceText: segment.sourceText.slice(0, at).trim() };
    const secondText = segment.sourceText.slice(at).trim();
    const second = { ...segment, id: `${segment.id}-b`, label: "接續內容", sourceText: secondText };
    const segments = [...practice.segments];
    segments.splice(index, 1, first, second);
    return { ...practice, segments };
  }

  return practice;
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
    const structuredPrevious = applyStructureChange(previous, body.structure);
    const incoming = body.practice && typeof body.practice === "object" ? body.practice : {};
    const incomingSegments = Array.isArray((incoming as { segments?: unknown }).segments)
      ? (incoming as { segments: unknown[] }).segments
      : [];
    const safeSegments = structuredPrevious.segments.map((segment) => {
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
        contextNotes: typeof fields.contextNotes === "string" ? fields.contextNotes : segment.contextNotes,
        status: fields.status === "skipped" ? "skipped" as const : segment.status === "skipped" ? "untouched" as const : segment.status,
      };
    });
    const requestedComplete = body.complete === true;
    const promptCopiedSegmentId = typeof body.promptCopied === "string" ? body.promptCopied : null;
    const merged = normalizeEnglishJournalPractice({
      ...structuredPrevious,
      ...incoming,
      segments: safeSegments,
      vocabForgeExports: structuredPrevious.vocabForgeExports,
      contextExports: structuredPrevious.contextExports,
      date,
      sourceText: previous.sourceText,
      createdAt: previous.createdAt,
      completedAt: requestedComplete ? new Date().toISOString() : structuredPrevious.completedAt,
      updatedAt: new Date().toISOString(),
    }, date);
    let candidate = merged && promptCopiedSegmentId
      ? normalizeEnglishJournalPractice({
          ...merged,
          segments: merged.segments.map((segment) => segment.id === promptCopiedSegmentId
            ? { ...segment, promptCopiedAt: new Date().toISOString() }
            : segment),
        }, date)
      : merged;
    const completeSegmentId = typeof body.completeSegmentId === "string" ? body.completeSegmentId : null;
    const wasAlreadyCompleted = completeSegmentId
      ? Boolean(previous.segments.find((segment) => segment.id === completeSegmentId)?.completedAt)
      : false;
    if (candidate && completeSegmentId) {
      const target = candidate.segments.find((segment) => segment.id === completeSegmentId);
      if (!target) return NextResponse.json({ error: "找不到要完成的段落" }, { status: 404 });
      if (!canCompleteSegment(target)) {
        return NextResponse.json({ error: "請先留下英文初稿，以及 AI 修正版或自己的定稿" }, { status: 400 });
      }
      const now = target.completedAt ?? new Date().toISOString();
      candidate = normalizeEnglishJournalPractice({
        ...candidate,
        segments: candidate.segments.map((segment) => segment.id === completeSegmentId ? { ...segment, completedAt: now } : segment),
        completedAt: candidate.segments.every((segment) => segment.status === "skipped" || segment.id === completeSegmentId || segment.completedAt)
          ? now
          : candidate.completedAt,
      }, date);
    }
    if (!candidate) return NextResponse.json({ error: "英文練習內容不正確" }, { status: 400 });
    if (requestedComplete && !canCompleteEnglishJournal(candidate)) {
      return NextResponse.json({ error: "每個未略過的段落都需要英文初稿，以及 AI 修正版或自己的定稿" }, { status: 400 });
    }
    await upsertJsonRecord(title, candidate);
    const weeklySynced = candidate && completeSegmentId && !wasAlreadyCompleted
      ? await completeWeeklyJournalCell(candidate, completeSegmentId)
      : false;
    return NextResponse.json({ ok: true, practice: candidate, weeklySynced });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
