import { NextRequest, NextResponse } from "next/server";
import { requireLearningOwner } from "@/lib/dojo/learningFoundation/access";
import { LearningError } from "@/lib/dojo/learningFoundation/model";
import { assessments, assessmentRepository } from "@/lib/dojo/assessments/store";
import { nativeSources, nativeAttachments } from "@/lib/dojo/assessments/nativeCatalog";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
function respond(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
function fail(e: unknown) { return respond({ error: e instanceof LearningError ? e.message : "驗收資料暫時不可用，未確認的結果不視為成功" }, e instanceof LearningError ? e.status : 503); }
async function body(req: NextRequest) { const s = await req.text(); if (Buffer.byteLength(s, "utf8") > 350000) throw new LearningError("驗收請求超過保存上限", 413); try { const b = JSON.parse(s); if (!b || typeof b !== "object" || Array.isArray(b)) throw Error(); return b; } catch { throw new LearningError("驗收請求格式不正確"); } }
export async function GET(req: NextRequest) {
  try { requireLearningOwner(req); const q = req.nextUrl.searchParams;
    if (q.get("native-sources")) return respond(await nativeSources(q.get("cursor") ?? undefined));
    if (q.get("native-page")) return respond(await nativeAttachments(q.get("native-page")!));
    if (q.get("attempt")) { const id = q.get("attempt")!; return respond({ attempt: await assessments.getAttempt(id), evidenceAvailability: await assessments.evidenceAvailability(id) }); }
    if (q.get("mastery")) { const id = q.get("mastery")!; return respond({ mastery: await assessments.confirmedMastery(id), evidenceAvailability: await assessments.evidenceAvailability(id) }); }
    const definitions = await assessmentRepository.definitions(), attempts = await assessmentRepository.attempts();
    return respond({ definitions, attempts: attempts.map(a => ({ id: a.id, capabilityId: a.capabilityId, definitionVersion: a.definitionVersion, capabilityName: a.definitionSnapshot.name, revision: a.revision, status: a.status, verdict: a.verdict, confirmedAt: a.confirmedAt, revisitOf: a.revisitOf, updatedAt: a.updatedAt })) });
  } catch (e) { return fail(e); }
}
export async function POST(req: NextRequest) {
  try { requireLearningOwner(req); const b = await body(req);
    if (b.action === "define") return respond({ definition: await assessments.define(b) }, 201);
    if (b.action === "attempt") return respond({ attempt: await assessments.createAttempt(b) }, 201);
    if (b.action === "preview-feedback") return respond(await assessments.previewFeedback(b.id, b.evaluation));
    if (b.action === "export") return respond({ package: await assessments.exportSelected(b.id, b) });
    throw new LearningError("未知驗收操作");
  } catch (e) { return fail(e); }
}
export async function PATCH(req: NextRequest) {
  try { requireLearningOwner(req); const b = await body(req);
    if (b.action === "draft") return respond({ attempt: await assessments.saveDraft(b.id, b.revision, b) });
    if (b.action === "submit") return respond({ attempt: await assessments.submit(b.id, b.revision) });
    if (b.action === "evaluate") return respond({ attempt: await assessments.evaluate(b.id, b.revision, b.evaluation) });
    if (b.action === "confirm") return respond({ attempt: await assessments.confirm(b.id, b.revision, b.confirmationMethod) });
    throw new LearningError("未知驗收操作");
  } catch (e) { return fail(e); }
}
