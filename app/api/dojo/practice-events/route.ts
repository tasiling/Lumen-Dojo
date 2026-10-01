import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { withLearningWriteLock } from "@/lib/dojo/learningFoundation/fileLock";
import { learningOwner } from "@/lib/dojo/learningFoundation/store";
import { practiceEvents } from "@/lib/dojo/practiceEvents/store";
import { readJsonRecord } from "@/lib/dojo/notionStore";
import { EVENT_PREFIX } from "@/lib/dojo/learningRecords/model";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { DATA_SOURCES } from "@/lib/notion/schema";
import { mapKnowledge } from "@/lib/notion/queries";
import { bingoRecordTitle, normalizeWeeklyBoard, parseJson } from "@/lib/dojo/formal";
import type { CompletionEvent } from "@/lib/dojo/practiceEvents/model";
export const dynamic = "force-dynamic";
function failure(e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof LearningError ? e.status : 503 }); }
export async function GET(req: NextRequest) { try {
  requireLearningOwner(req); const q = req.nextUrl.searchParams; let events: CompletionEvent[]; let cursor: string | null = null;
  if(q.get("id")) { const row = await readJsonRecord(`${EVENT_PREFIX}${q.get("id")}`); if(!row) throw new LearningError("事件不存在",404); events = [row.value as CompletionEvent]; }
  else { const page = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { property: "標題", title: { starts_with: EVENT_PREFIX } }, sorts: [{ timestamp: "created_time", direction: "descending" }], page_size: 20, ...(q.get("cursor") ? { start_cursor: q.get("cursor")! } : {}) })); events = page.results.map(p => parseJson(mapKnowledge(p).內容) as CompletionEvent); cursor = page.has_more ? page.next_cursor : null; }
  if(events.some(e => !e || e.owner !== learningOwner)) throw new LearningError("事件無權存取",403);
  const weeks = new Map<string, Awaited<ReturnType<typeof readJsonRecord>>>();
  for (const event of events) if(event.binding && !weeks.has(event.binding.weekStart)) weeks.set(event.binding.weekStart, await readJsonRecord(bingoRecordTitle(event.binding.weekStart)));
  events = events.map(event => {
    if(!event.binding) return event;
    const row = weeks.get(event.binding.weekStart);
    const board = row ? normalizeWeeklyBoard(row.value, event.binding.weekStart) : null;
    const matches = board?.cells.filter(c => c.taskInstanceId === event.binding!.taskInstanceId && c.text.trim()) ?? [];
    return { ...event, bindingStatus: !board || board.archivedAt || matches.length !== 1 ? "unlinked" : event.projections.weekly };
  });
  return NextResponse.json({ events: events.filter(e => !q.get("learningItemId") || e.learningItemIds.includes(q.get("learningItemId")!)), cursor });
} catch(e) { return failure(e); } }
export async function POST(req: NextRequest) { try { requireLearningOwner(req); const b = await req.json(); if(b.action !== "retry" || typeof b.id !== "string" || !/^[a-f0-9]{64}$/.test(b.id)) throw new LearningError("只能明確重試已保存事件投影"); return NextResponse.json({ event: await withLearningWriteLock(() => practiceEvents.retry(b.id)) }); } catch(e) { return failure(e); } }
