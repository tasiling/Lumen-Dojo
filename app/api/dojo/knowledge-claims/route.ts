import { NextRequest, NextResponse } from "next/server";
import { getCaptureEntry, saveCaptureEntry } from "@/lib/dojo/captureStore";
import { normalizeCaptureEntry, type CaptureEntry } from "@/lib/dojo/formal";
import { archiveJsonRecordById } from "@/lib/dojo/notionStore";
import { createKnowledgeClaim, getKnowledgeClaim, listKnowledgeClaims, saveKnowledgeClaim } from "@/lib/dojo/knowledgeClaimStore";
import {
  KNOWLEDGE_CLAIM_TITLE_PREFIX,
  adoptionError,
  activeClaimVersion,
  currentClaimVersion,
  knowledgeClaimCanUse,
  normalizeKnowledgeClaim,
  type KnowledgeClaim,
  type KnowledgeClaimStatus,
  type KnowledgeUse,
  type KnowledgeMaturity,
} from "@/lib/dojo/knowledgeClaims";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ids = req.nextUrl.searchParams.get("ids")?.split(",").map((id) => id.trim()).filter(Boolean);
    const requestedUse = req.nextUrl.searchParams.get("use");
    const use: KnowledgeUse | null = requestedUse === "inspiration" || requestedUse === "perspective" || requestedUse === "evidence" || requestedUse === "style"
      ? requestedUse
      : null;
    let claims = await listKnowledgeClaims();
    if (ids?.length) claims = claims.filter((claim) => ids.includes(claim.id));
    if (use) claims = claims.filter((claim) => knowledgeClaimCanUse(claim, use)).map((claim) => {
      const active = activeClaimVersion(claim)!;
      return { ...claim, currentVersionId: active.id, activeVersionId: active.id, versions: [active] };
    });
    return NextResponse.json({ claims });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body?.action === "create_from_capture") {
      if (typeof body.captureId !== "string" || !body.captureId) {
        return NextResponse.json({ error: "缺少野採素材 ID" }, { status: 400 });
      }
      const { capture: storedCapture } = await getCaptureEntry(body.captureId);
      const incoming = body.capture && typeof body.capture === "object" ? body.capture as Partial<CaptureEntry> : {};
      const capture = normalizeCaptureEntry({
        ...storedCapture,
        category: incoming.category,
        clip: incoming.clip ? { ...storedCapture.clip, purpose: incoming.clip.purpose } : storedCapture.clip,
        destinations: incoming.destinations,
        learningTracks: incoming.learningTracks,
        pinned: incoming.pinned,
        contentType: incoming.contentType,
        forageSummary: incoming.forageSummary,
        forageReason: incoming.forageReason,
        knowledgeLinks: incoming.knowledgeLinks,
        creativeMaturity: incoming.creativeMaturity,
        sourceKnowledgeMaturity: incoming.sourceKnowledgeMaturity,
        sourceLocator: incoming.sourceLocator,
        claimRefs: incoming.claimRefs,
        llmMaterialUse: incoming.llmMaterialUse,
      }, { id: storedCapture.id, capturedAt: storedCapture.capturedAt });
      if (!capture) return NextResponse.json({ error: "野採素材無法讀取" }, { status: 409 });
      if (capture.sourceKnowledgeMaturity !== "K1") {
        return NextResponse.json({ error: "建立 K2 前，請先確認來源已達 K1 並可回找" }, { status: 400 });
      }
      const claim = await createKnowledgeClaim({
        statement: body.statement,
        title: body.title,
        type: body.type,
        claimant: body.claimant,
        generatedBy: "human",
        sources: [{
          sourceType: "forage_capture",
          sourceId: capture.id,
          label: capture.title,
          locator: capture.sourceLocator,
          url: capture.sourceUrl,
          snapshot: capture.forageSummary || capture.excerpt || capture.note,
        }],
      });
      try {
        const linkedCapture = await saveCaptureEntry({
          ...capture,
          claimRefs: [...capture.claimRefs, { claimId: claim.id, relation: "source" as const }]
            .filter((ref, index, refs) => refs.findIndex((item) => item.claimId === ref.claimId && item.relation === ref.relation) === index),
        });
        return NextResponse.json({ ok: true, claim, capture: linkedCapture }, { status: 201 });
      } catch (error) {
        await archiveJsonRecordById(claim.id, KNOWLEDGE_CLAIM_TITLE_PREFIX).catch(() => undefined);
        throw error;
      }
    }
    if (body?.preventDuplicateSource === true && Array.isArray(body.sources) && body.sources[0]?.sourceType && body.sources[0]?.sourceId) {
      const source = body.sources[0];
      const existing = (await listKnowledgeClaims()).find((item) => item.versions.some((version) => version.sources.some((candidate) => candidate.sourceType === source.sourceType && candidate.sourceId === source.sourceId)));
      if (existing) return NextResponse.json({ ok: true, claim: existing, duplicate: true });
    }
    const claim = await createKnowledgeClaim(body);
    return NextResponse.json({ ok: true, claim }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

function updatedDraft(previous: KnowledgeClaim, incoming: unknown): KnowledgeClaim | null {
  if (!incoming || typeof incoming !== "object") return null;
  const source = incoming as Partial<KnowledgeClaim>;
  const proposed = normalizeKnowledgeClaim({
    ...previous,
    title: source.title,
    type: source.type,
    allowedUses: source.allowedUses,
    versions: previous.versions.map((version) => {
      if (version.id !== previous.currentVersionId) return version;
      const nextVersion = Array.isArray(source.versions)
        ? source.versions.find((item) => item?.id === previous.currentVersionId)
        : null;
      return nextVersion ? {
        ...version,
        statement: nextVersion.statement,
        claimant: nextVersion.claimant,
        sources: nextVersion.sources,
        supportingEvidence: nextVersion.supportingEvidence,
        contradictingEvidence: nextVersion.contradictingEvidence,
        scope: nextVersion.scope,
        qualifier: nextVersion.qualifier,
        rebuttal: nextVersion.rebuttal,
        versionNote: nextVersion.versionNote,
      } : version;
    }),
  }, { id: previous.id, createdAt: previous.createdAt });
  return proposed;
}

function setCurrentState(claim: KnowledgeClaim, maturity: KnowledgeMaturity, status: KnowledgeClaimStatus, adopted: boolean): KnowledgeClaim {
  const now = new Date().toISOString();
  return {
    ...claim,
    versions: claim.versions.map((version) => version.id === claim.currentVersionId ? {
      ...version,
      maturity,
      status,
      adoptedBy: adopted ? "Crystal" : null,
      adoptedAt: adopted ? now : null,
    } : version),
  };
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.id !== "string") return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    const { claim: previous } = await getKnowledgeClaim(body.id);
    const action = typeof body.action === "string" ? body.action : "save_draft";
    if (!["save_draft", "evaluate", "adopt", "refute", "new_version"].includes(action)) {
      return NextResponse.json({ error: "不支援的主張動作" }, { status: 400 });
    }

    if (action === "new_version") {
      if (previous.activeVersionId && previous.currentVersionId !== previous.activeVersionId && !["refuted", "superseded", "archived"].includes(currentClaimVersion(previous).status)) {
        return NextResponse.json({ error: "已有一份新版正在審閱，請先完成或結案" }, { status: 409 });
      }
      const statement = typeof body.statement === "string" ? body.statement.trim().slice(0, 6000) : "";
      if (!statement) return NextResponse.json({ error: "新版主張不可空白" }, { status: 400 });
      const oldCurrent = currentClaimVersion(previous);
      const baseVersion = activeClaimVersion(previous) ?? oldCurrent;
      const nextId = crypto.randomUUID();
      const next: KnowledgeClaim = {
        ...previous,
        currentVersionId: nextId,
        versions: [
          ...previous.versions,
          {
            ...baseVersion,
            id: nextId,
            number: Math.max(...previous.versions.map((version) => version.number)) + 1,
            statement,
            maturity: "K2",
            status: "candidate",
            adoptedBy: null,
            adoptedAt: null,
            versionNote: typeof body.versionNote === "string" ? body.versionNote.trim().slice(0, 3000) : "建立新版",
            createdAt: new Date().toISOString(),
          },
        ],
      };
      return NextResponse.json({ ok: true, claim: await saveKnowledgeClaim(next) });
    }

    const previousCurrent = currentClaimVersion(previous);
    if (action === "refute" && previousCurrent.status === "active") {
      const rebuttal = typeof body.rebuttal === "string" ? body.rebuttal.trim().slice(0, 6000) : "";
      if (!rebuttal) return NextResponse.json({ error: "反證前請留下失效原因或反證" }, { status: 400 });
      const next = {
        ...previous,
        activeVersionId: previous.activeVersionId === previous.currentVersionId ? null : previous.activeVersionId,
        versions: previous.versions.map((version) => version.id === previous.currentVersionId ? { ...version, status: "refuted" as const, rebuttal } : version),
      };
      return NextResponse.json({ ok: true, claim: await saveKnowledgeClaim(next) });
    }
    if (previousCurrent.status === "active" || previousCurrent.status === "refuted" || previousCurrent.status === "superseded") {
      return NextResponse.json({ error: "已採用或已結案的版本不可覆寫，請建立新版" }, { status: 409 });
    }

    const draft = updatedDraft(previous, body.claim);
    if (!draft) return NextResponse.json({ error: "缺少可儲存的主張內容" }, { status: 400 });
    let next = draft;
    if (action === "evaluate") next = setCurrentState(draft, "K3", body.status === "disputed" ? "disputed" : body.status === "partial" ? "partial" : "candidate", false);
    if (action === "adopt") {
      const validation = adoptionError(draft);
      if (validation) return NextResponse.json({ error: validation }, { status: 400 });
      const adopted = setCurrentState(draft, "K4", "active", true);
      next = {
        ...adopted,
        activeVersionId: adopted.currentVersionId,
        versions: adopted.versions.map((version) => previous.activeVersionId && version.id === previous.activeVersionId && version.id !== adopted.currentVersionId
          ? { ...version, status: "superseded" as const }
          : version),
      };
    }
    if (action === "refute") {
      if (!currentClaimVersion(draft).rebuttal) return NextResponse.json({ error: "反證前請留下失效原因或反證" }, { status: 400 });
      next = setCurrentState(draft, currentClaimVersion(draft).maturity === "K4" ? "K4" : "K3", "refuted", false);
    }
    return NextResponse.json({ ok: true, claim: await saveKnowledgeClaim(next) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    await archiveJsonRecordById(id, KNOWLEDGE_CLAIM_TITLE_PREFIX);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
