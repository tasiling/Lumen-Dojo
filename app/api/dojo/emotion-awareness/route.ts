import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import {
  archiveAwareness, configureAwareness, confirmAwarenessRound, createAwareness, deleteAwareness, getAwareness, linkAwareness,
  listAwareness, reopenAwareness, returnAwareness,
} from "@/lib/dojo/emotionAwarenessStore";
import type { AwarenessDecision } from "@/lib/dojo/emotionAwareness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
// Only the message goes back, and store messages never contain the writing.
const failure = (error: unknown) => json(
  { error: error instanceof LearningError ? error.message : "操作沒有完成，請稍後再試。" },
  error instanceof LearningError ? error.status : 500,
);
const str = (value: unknown) => typeof value === "string" ? value : "";
const date = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;

function decision(value: unknown): AwarenessDecision {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const list = (items: unknown) => Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  return {
    understandings: list(raw.understandings).flatMap((item) => Number.isSafeInteger(item.n) && ["原話", "整理版", "改寫"].includes(str(item.from))
      ? [{ n: item.n as number, from: item.from as "原話" | "整理版" | "改寫", text: str(item.text) }] : []),
    facts: Array.isArray(raw.facts) ? raw.facts.filter((item): item is number => Number.isSafeInteger(item)) : [],
    rewrites: list(raw.rewrites).flatMap((item) => Number.isSafeInteger(item.index) ? [{ index: item.index as number, text: str(item.text) }] : []),
  };
}

/**
 * 心・情覺察。GET ?id= reads one round with its discussion package; GET without id lists rounds, filtered by
 * q / from / to / archived. Rounds are private DB-14 records titled 行光覺察-<id>; the app never calls an AI.
 */
export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const params = req.nextUrl.searchParams;
    const id = params.get("id");
    if (id) return json(await getAwareness(id));
    return json(await listAwareness({
      q: params.get("q") ?? "", from: date(params.get("from")), to: date(params.get("to")), archived: params.get("archived") === "1",
    }));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new LearningError("請提供 JSON 物件。", 400);
    const id = str(body.id);
    switch (body.action) {
      case "create":
        return json(await createAwareness({ writing: str(body.writing), method: str(body.method), sourceEntryId: str(body.sourceEntryId), previousId: str(body.previousId) }), 201);
      case "configure":
        return json(await configureAwareness(id, { writing: str(body.writing), method: str(body.method) }));
      case "return":
        return json(await returnAwareness(id, str(body.raw)));
      case "confirm":
        return json(await confirmAwarenessRound(id, decision(body.decision)));
      case "reopen":
        return json(await reopenAwareness(id));
      case "archive":
        return json(await archiveAwareness(id, body.archived === true));
      case "link":
        return json(await linkAwareness(id, str(body.otherId), body.linked === true));
      case "delete":
        await deleteAwareness(id);
        return json({ ok: true });
      default:
        throw new LearningError("無法識別的覺察動作。", 400);
    }
  } catch (error) {
    return failure(error);
  }
}
