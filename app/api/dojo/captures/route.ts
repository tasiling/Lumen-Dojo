import { NextRequest, NextResponse } from "next/server";
import {
  CAPTURE_TITLE_PREFIX,
  captureContent,
  captureRecordTitle,
  isValidCaptureSourceUrl,
  normalizeCaptureEntry,
} from "@/lib/dojo/formal";
import {
  archiveJsonRecordById,
  listJsonRecords,
} from "@/lib/dojo/notionStore";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { appendCaptureExplorationRecord, saveCaptureInitialReflection, updateCaptureEntry } from "@/lib/dojo/captureStore";

import { requireLearningOwner } from '@/lib/dojo/learningFoundation/access';
import { LearningError } from '@/lib/dojo/learningFoundation/model';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
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
      { status: error instanceof LearningError ? error.status : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const body = await req.json();
    if (!isValidCaptureSourceUrl(body.sourceUrl)) {
      return NextResponse.json({ error: "來源網址格式不正確" }, { status: 400 });
    }

    const initialReason = typeof body.forageReason === "string" && body.forageReason.trim()
      ? body.forageReason.trim()
      : typeof body.note === "string" ? body.note.trim() : "";
    const capture = normalizeCaptureEntry(
      {
        ...body,
        status: "pending",
        processingDepth: initialReason ? "light" : "raw",
        creativeMaturity: "C0",
        sourceKnowledgeMaturity: "K0",
        sourceLocator: "",
        claimRefs: [],
        llmMaterialUse: "disabled",
        knowledgeOrigin: "unknown",
        contentType: null,
        forageSummary: "",
        forageReason: initialReason,
        explorationRecords: [],
        knowledgeLinks: [],
        learningTracks: [],
      learningItemIds: [],
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
      { status: error instanceof LearningError ? error.status : 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const body = await req.json();
    if (typeof body.id !== "string") {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }
    if (body.action === "setInitialReflection") {
      const reflection = typeof body.reflection === "string" ? body.reflection : "";
      return NextResponse.json({ ok: true, capture: await saveCaptureInitialReflection(body.id, reflection) });
    }
    if (body.action === "appendExploration") {
      const clientRecordId = typeof body.clientRecordId === "string" ? body.clientRecordId.trim() : "";
      const source = body.source === "gpt_import" ? "gpt_import" as const : "manual" as const;
      if (!clientRecordId) return NextResponse.json({ error: "缺少探索紀錄識別碼" }, { status: 400 });
      const capture = await appendCaptureExplorationRecord(body.id, {
        thoughts: typeof body.thoughts === "string" ? body.thoughts : "",
        keyFinding: typeof body.keyFinding === "string" ? body.keyFinding : "",
        openQuestions: typeof body.openQuestions === "string" ? body.openQuestions : "",
      }, { clientRecordId, source });
      return NextResponse.json({ ok: true, capture });
    }
    if (!isValidCaptureSourceUrl(body.capture?.sourceUrl)) {
      return NextResponse.json({ error: "來源網址格式不正確" }, { status: 400 });
    }

    const requestedCapture = body.capture && typeof body.capture === "object" ? body.capture : {};
    const capture = await updateCaptureEntry(body.id, previous => {
      if (requestedCapture.updatedAt !== previous.updatedAt) throw new LearningError('素材版本已變更或缺少版本，請重新讀取再編輯', 409);
      return { ...requestedCapture, explorationRecords: previous.explorationRecords };
    });
    return NextResponse.json({ ok: true, capture });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof LearningError ? error.status : 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    await archiveJsonRecordById(id, CAPTURE_TITLE_PREFIX);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof LearningError ? error.status : 500 }
    );
  }
}
