import { NextRequest, NextResponse } from "next/server";
import {
  CAPTURE_TITLE_PREFIX,
  captureContent,
  captureRecordTitle,
  isValidCaptureSourceUrl,
  normalizeCaptureEntry,
  parseJson,
} from "@/lib/dojo/formal";
import {
  archiveJsonRecordById,
  listJsonRecords,
  updateJsonRecordById,
} from "@/lib/dojo/notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { getKnowledgeEntry } from "@/lib/notion/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const requestedStatus = req.nextUrl.searchParams.get("status");
    const rows = await listJsonRecords(CAPTURE_TITLE_PREFIX);
    const captures = rows
      .map((row) => normalizeCaptureEntry(row.value, { id: row.id }))
      .filter((capture): capture is NonNullable<typeof capture> => capture !== null)
      .filter((capture) => requestedStatus !== "pending" && requestedStatus !== "adopted" && requestedStatus !== "faded"
        ? true
        : capture.status === requestedStatus)
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));

    return NextResponse.json({ captures });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isValidCaptureSourceUrl(body.sourceUrl)) {
      return NextResponse.json({ error: "來源網址格式不正確" }, { status: 400 });
    }

    const capture = normalizeCaptureEntry(
      {
        ...body,
        status: "pending",
        processingDepth: "raw",
        contentType: null,
        forageSummary: "",
        forageReason: "",
        knowledgeLinks: [],
        learningTracks: [],
        destinations: [],
        pinned: false,
        fadedAt: null,
        sentToPracticeAt: null,
        sentToWeavingAt: null,
        weaving: {
          outputType: null,
          projectTitle: "",
          status: "ready",
          productionNote: "",
          outputUrl: "",
        },
      },
      { id: "pending", touch: true }
    );
    if (!capture) return NextResponse.json({ error: "標題為必填" }, { status: 400 });

    const nonce = crypto.randomUUID();
    const created = await createKnowledgeEntry({
      標題: captureRecordTitle(nonce),
      內容: JSON.stringify(captureContent(capture)),
    });
    capture.id = created.id;

    return NextResponse.json({ ok: true, capture }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.id !== "string") {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }
    if (!isValidCaptureSourceUrl(body.capture?.sourceUrl)) {
      return NextResponse.json({ error: "來源網址格式不正確" }, { status: 400 });
    }

    const row = await getKnowledgeEntry(body.id);
    if (!row.標題.startsWith(CAPTURE_TITLE_PREFIX)) {
      return NextResponse.json({ error: "紀錄類型不符" }, { status: 400 });
    }
    const previous = normalizeCaptureEntry(parseJson(row.內容), { id: body.id });
    if (!previous) {
      return NextResponse.json({ error: "既有捕捉內容無法讀取" }, { status: 409 });
    }

    const capture = normalizeCaptureEntry(body.capture, {
      id: body.id,
      capturedAt: previous.capturedAt,
      touch: true,
    });
    if (!capture) return NextResponse.json({ error: "標題為必填" }, { status: 400 });

    await updateJsonRecordById(
      body.id,
      CAPTURE_TITLE_PREFIX,
      row.標題,
      captureContent(capture)
    );
    return NextResponse.json({ ok: true, capture });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    await archiveJsonRecordById(id, CAPTURE_TITLE_PREFIX);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
