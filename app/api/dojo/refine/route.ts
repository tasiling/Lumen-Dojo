import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import {
  adoptRefineCandidate, closeRefineRound, configureRefineRound, createRefineRound, getRefineRound, importRefineRound, listRefineRounds, pickRefineCandidate,
  readRefineRules, returnRefineRound, saveRefineRules,
} from "@/lib/dojo/refineStore";
import type { RefineTitleFrom } from "@/lib/dojo/refineRecord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (error: unknown) => json(
  { error: error instanceof Error ? error.message : String(error) },
  error instanceof LearningError ? error.status : 500,
);
const ids = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const str = (value: unknown) => typeof value === "string" ? value : "";

/**
 * 野採淬鍊。GET ?id= reads a round with its discussion package; GET ?captureId= lists the rounds a capture took
 * part in; GET with neither returns the discussion rules. Rounds are DB-14 records titled 行光淬鍊-<id>.
 */
export async function GET(req: NextRequest) {
  try {
    requireLearningOwner(req);
    const id = req.nextUrl.searchParams.get("id");
    if (id) return json(await getRefineRound(id));
    const captureId = req.nextUrl.searchParams.get("captureId");
    if (captureId) return json({ rounds: await listRefineRounds(captureId) });
    return json({ rules: await readRefineRules() });
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
        return json(await createRefineRound({ topic: str(body.topic), angle: str(body.angle), captureIds: ids(body.captureIds), offeredCaptureIds: ids(body.offeredCaptureIds) }), 201);
      case "configure":
        return json(await configureRefineRound(id, { topic: str(body.topic), angle: str(body.angle), captureIds: ids(body.captureIds) }));
      case "import":
        return json(await importRefineRound({ topic: str(body.topic), angle: str(body.angle), captureIds: ids(body.captureIds), offeredCaptureIds: ids(body.offeredCaptureIds), raw: str(body.raw) }));
      case "return":
        return json(await returnRefineRound(id, str(body.raw)));
      case "pick": {
        const from = body.titleFrom === null ? null : ["原話", "整理版", "改寫"].includes(str(body.titleFrom)) ? body.titleFrom as RefineTitleFrom : undefined;
        if (from === undefined || !Number.isSafeInteger(body.candidateN)) throw new LearningError("挑選的內容格式不符。", 400);
        return json(await pickRefineCandidate(id, body.candidateN as number, from, str(body.title), str(body.cardType) || undefined));
      }
      case "adopt":
        if (!Number.isSafeInteger(body.candidateN)) throw new LearningError("候選編號格式不符。", 400);
        return json(await adoptRefineCandidate(id, body.candidateN as number));
      case "close":
        return json(await closeRefineRound(id));
      case "rules":
        return json({ rules: await saveRefineRules(body.rules) });
      default:
        throw new LearningError("無法識別的淬鍊動作。", 400);
    }
  } catch (error) {
    return failure(error);
  }
}
