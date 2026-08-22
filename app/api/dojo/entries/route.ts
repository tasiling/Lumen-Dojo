import { NextRequest, NextResponse } from "next/server";
import {
  ENTRY_TITLE_PREFIX,
  entryContent,
  entryRecordTitle,
  normalizeFormalEntry,
  parseJson,
  taipeiTodayISO,
} from "@/lib/dojo/formal";
import {
  archiveJsonRecordById,
  listJsonRecords,
  updateJsonRecordById,
} from "@/lib/dojo/notionStore";
import {
  archiveTraceEntry,
  createKnowledgeEntry,
  createTraceEntry,
  markTraceMeasure,
  updateTraceEntry,
} from "@/lib/notion/mutations";
import { getKnowledgeEntry } from "@/lib/notion/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listJsonRecords(ENTRY_TITLE_PREFIX);
    const entries = rows
      .map((row) => normalizeFormalEntry(row.value, { id: row.id }))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date));
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entry = normalizeFormalEntry({ ...body, date: body.date ?? taipeiTodayISO() }, { id: "pending" });
    if (!entry) return NextResponse.json({ error: "標題為必填" }, { status: 400 });
    const nonce = crypto.randomUUID();
    const created = await createKnowledgeEntry({
      標題: entryRecordTitle(nonce),
      內容: JSON.stringify(entryContent(entry)),
    });
    entry.id = created.id;

    let traceWarning: string | null = null;
    if (entry.privacy !== "私人") {
      try {
        const trace = await createTraceEntry({
          標題: entry.title,
          內容: entry.note,
          space: entry.space,
          sourceType: entry.sourceType,
        });
        entry.traceId = trace.id;
        await updateJsonRecordById(created.id, ENTRY_TITLE_PREFIX, entryRecordTitle(nonce), entryContent(entry));
      } catch (error) {
        traceWarning = error instanceof Error ? error.message : String(error);
      }
    }

    return NextResponse.json({ ok: true, entry, traceWarning }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.id !== "string") return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    const row = await getKnowledgeEntry(body.id);
    if (!row.標題.startsWith(ENTRY_TITLE_PREFIX)) {
      return NextResponse.json({ error: "紀錄類型不符" }, { status: 400 });
    }
    const previous = normalizeFormalEntry(parseJson(row.內容), { id: body.id });
    if (!previous) return NextResponse.json({ error: "既有紀錄內容無法讀取" }, { status: 409 });
    const entry = normalizeFormalEntry(body.entry, { id: body.id, createdAt: previous.createdAt });
    if (!entry) return NextResponse.json({ error: "標題為必填" }, { status: 400 });
    entry.traceId = previous.traceId;

    if (entry.privacy === "私人" && previous.traceId) {
      await archiveTraceEntry(previous.traceId);
      entry.traceId = undefined;
    } else if (entry.privacy !== "私人") {
      if (previous.traceId) {
        await updateTraceEntry(previous.traceId, {
          標題: entry.title,
          內容: entry.note,
          space: entry.space,
          sourceType: entry.sourceType,
        });
      } else {
        const trace = await createTraceEntry({
          標題: entry.title,
          內容: entry.note,
          space: entry.space,
          sourceType: entry.sourceType,
        });
        entry.traceId = trace.id;
      }

      if (
        entry.traceId &&
        (!previous.traceId || entry.freq !== previous.freq || entry.intensity !== previous.intensity)
      ) {
        await markTraceMeasure(entry.traceId, {
          頻率: entry.freq ?? null,
          強度: entry.intensity ?? null,
        });
      }
    }

    await updateJsonRecordById(body.id, ENTRY_TITLE_PREFIX, row.標題, entryContent(entry));
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    const row = await getKnowledgeEntry(id);
    if (!row.標題.startsWith(ENTRY_TITLE_PREFIX)) {
      return NextResponse.json({ error: "紀錄類型不符" }, { status: 400 });
    }
    const entry = normalizeFormalEntry(parseJson(row.內容), { id });
    if (entry?.traceId) await archiveTraceEntry(entry.traceId);
    await archiveJsonRecordById(id, ENTRY_TITLE_PREFIX);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
