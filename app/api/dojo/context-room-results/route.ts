import { NextRequest, NextResponse } from "next/server";
import {
  listContextActivityCandidates,
  listRecentContextResults,
  saveContextRoomResult,
} from "@/lib/dojo/contextRoomResultStore";
import { listContextRoomNotionInbox } from "@/lib/dojo/contextRoomNotionInbox";

import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { withLearningWriteLock } from "@/lib/dojo/learningFoundation/fileLock";
import { externalResults } from "@/lib/dojo/externalResults/store";
import { BridgeError, uuid } from "@/lib/dojo/externalResults/model";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const [activities, recent, inbox] = await Promise.all([
      listContextActivityCandidates(),
      listRecentContextResults(3),
      listContextRoomNotionInbox(),
    ]);
    return NextResponse.json({ activities, recent, inbox });
  } catch (error) {
    return legacyFailure(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const body = await req.json();
    const notionPageId =
      typeof body.notionPageId === "string" ? body.notionPageId : "";
    if (notionPageId) {
      if (!uuid(notionPageId))
        throw new BridgeError("NOTION_PAGE_INVALID", 400);
      const receipt = await withLearningWriteLock(() =>
        externalResults.verifyNotion(notionPageId),
      );
      return NextResponse.json(
        {
          code: "R2_3_EXTERNAL_CONTRACT_PENDING",
          error: "來源已核對，事件契約待確認；未新增計數或確認 Notion",
          receipt,
          notionAcknowledged: false,
        },
        { status: 409 },
      );
    }
    if (body.draft?.sourceEventId)
      throw new BridgeError("AUTHORITATIVE_SOURCE_REQUIRED", 409);
    if (body.linkedActivityId)
      throw new BridgeError("MANUAL_SOURCE_BINDING_REQUIRES_REVIEW", 409);
    const saved = await withLearningWriteLock(() =>
      saveContextRoomResult({ draft: body.draft }),
    );
    return NextResponse.json(
      {
        ok: true,
        ...saved,
        notionAcknowledged: false,
        acknowledgementWarning: null,
      },
      { status: saved.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return legacyFailure(error);
  }
}
function legacyFailure(error: unknown) {
  const status =
    error instanceof LearningError || error instanceof BridgeError
      ? error.status
      : 503;
  const code =
    error instanceof BridgeError
      ? error.code
      : status === 401
        ? "UNAUTHORIZED"
        : status === 403
          ? "ORIGIN_OR_OWNER_MISMATCH"
          : "LEGACY_SAVE_REQUIRES_REVIEW";
  return NextResponse.json({ code, error: code }, { status });
}
