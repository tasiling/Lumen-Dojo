import { NextResponse } from "next/server";
import {
  DAILY_TITLE_PREFIX,
  ENTRY_TITLE_PREFIX,
  normalizeDailyRecord,
  normalizeFormalEntry,
} from "@/lib/dojo/formal";
import { decodeClosingContent } from "@/lib/closing/notionFormat";
import { listJsonRecords } from "@/lib/dojo/notionStore";
import {
  listAllJournalEntries,
  listAllTraceEntries,
  listKnowledgeEntriesByPrefix,
} from "@/lib/notion/queries";
import { CLOSING_TITLE_PREFIX } from "@/lib/notion/schema";
import { SPACE_TO_SOURCE_TYPE, SPACES, type DojoEntry, type SpaceKey } from "@/lib/dojo/constants";

export const dynamic = "force-dynamic";

function titleDate(title: string): string | null {
  const match = title.match(/(\d{4})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export async function GET() {
  try {
    const [entryRows, dailyRows, traces, journals, legacyClosingRows] = await Promise.all([
      listJsonRecords(ENTRY_TITLE_PREFIX),
      listJsonRecords(DAILY_TITLE_PREFIX),
      listAllTraceEntries(),
      listAllJournalEntries(),
      listKnowledgeEntriesByPrefix(CLOSING_TITLE_PREFIX),
    ]);

    const entries = entryRows
      .map((row) => normalizeFormalEntry(row.value, { id: row.id }))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const knownTraceIds = new Set(entries.map((entry) => entry.traceId).filter(Boolean));

    const legacy: DojoEntry[] = traces
      .filter((trace) => trace.traceStatus !== "隱藏" && !knownTraceIds.has(trace.id))
      .map((trace) => {
        const space: SpaceKey = trace.space && trace.space in SPACES ? trace.space : "practice";
        return {
          id: `trace:${trace.id}`,
          traceId: trace.id,
          title: trace.標題,
          note: trace.內容 || undefined,
          space,
          kind: "生活痕跡",
          privacy: "限閱",
          date: trace.最後動靜時間?.slice(0, 10) ?? "",
          guangxing: null,
          guangfa: null,
          freq: trace.頻率 ?? undefined,
          intensity: trace.強度 ?? undefined,
          sourceType: trace.sourceType ?? SPACE_TO_SOURCE_TYPE[space],
          traceLevel: trace.traceLevel ?? "daily",
          traceStatus: trace.traceStatus ?? "一般",
          viewCount: trace.viewCount,
          createdAt: trace.最後動靜時間 ?? undefined,
        };
      });

    const daily = dailyRows
      .map((row) => {
        const valueDate = row.value && typeof row.value === "object" && typeof (row.value as { date?: unknown }).date === "string"
          ? (row.value as { date: string }).date
          : titleDate(row.title);
        return valueDate ? normalizeDailyRecord(row.value, valueDate) : null;
      })
      .filter((record): record is NonNullable<typeof record> => record !== null)
      .sort((a, b) => b.date.localeCompare(a.date));

    const historicalJournals = journals.flatMap((journal) => {
      const date = journal.日期?.slice(0, 10) ?? titleDate(journal.標題);
      return date ? [{ ...journal, date }] : [];
    });

    const legacyClosings = legacyClosingRows.flatMap((row) => {
      const content = decodeClosingContent(row.內容);
      if (!content) return [];
      return [{
        id: row.id,
        date: content.date || titleDate(row.標題) || "",
        title: content.title,
        note: content.note ?? "",
        carryToDate: content.carryToDate ?? null,
        carryResolvedAt: content.carryResolvedAt ?? null,
      }];
    }).filter((item) => item.date).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      entries: [...entries, ...legacy].sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date)),
      daily,
      journals: historicalJournals,
      legacyClosings,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
