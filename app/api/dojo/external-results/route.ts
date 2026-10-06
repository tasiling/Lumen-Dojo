import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { withLearningWriteLock } from "@/lib/dojo/learningFoundation/fileLock";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import {
  cachedResults,
  externalResults,
} from "@/lib/dojo/externalResults/store";
import { BridgeError, uuid } from "@/lib/dojo/externalResults/model";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  const code =
    e instanceof BridgeError
      ? e.code
      : e instanceof LearningError
        ? e.status === 401
          ? "UNAUTHORIZED"
          : e.status === 403
            ? "ORIGIN_OR_OWNER_MISMATCH"
            : e.status === 409
              ? "WRITE_LOCK_OR_INTENT_REQUIRES_REVIEW"
              : "STORAGE_UNAVAILABLE_OR_UNKNOWN_OUTCOME"
        : "STORAGE_UNAVAILABLE_OR_UNKNOWN_OUTCOME";
  return NextResponse.json(
    { code, error: code },
    {
      status:
        e instanceof BridgeError || e instanceof LearningError ? e.status : 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    return NextResponse.json(
      await cachedResults(req.nextUrl.searchParams.get("cursor")),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    requireLearningOwner(req);
    if (Number(req.headers.get("content-length") ?? 0) > 4096)
      throw new BridgeError("REQUEST_TOO_LARGE", 413);
    const raw = await req.text();
    if (raw.length > 4096) throw new BridgeError("REQUEST_TOO_LARGE", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new BridgeError("REQUEST_INVALID", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new BridgeError("REQUEST_INVALID", 400);
    const allowed =
      body.action === "notion-alias"
        ? ["action", "pageId"]
        : body.action === "retry"
          ? ["action", "id"]
          : ["action"];
    if (Object.keys(body).some((k) => !allowed.includes(k)))
      throw new BridgeError("CLIENT_SOURCE_CLAIM_REJECTED", 400);
    return NextResponse.json(
      await withLearningWriteLock(async () => {
        if (body.action === "sync" || body.action === "reconcile")
          return externalResults.sync(body.action === "reconcile");
        if (body.action === "notion-alias" && uuid(body.pageId))
          return {
            receipt: await externalResults.verifyNotion(body.pageId),
            notionAcknowledged: false,
          };
        if (
          body.action === "retry" &&
          typeof body.id === "string" &&
          /^[a-f0-9]{64}$/.test(body.id)
        )
          return externalResults.retry(body.id);
        throw new BridgeError("ACTION_INVALID", 400);
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
