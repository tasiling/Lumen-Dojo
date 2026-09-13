import { NextRequest, NextResponse } from "next/server";
import { archiveJsonRecordById } from "@/lib/dojo/notionStore";
import { createKnowledgeClaim, getKnowledgeClaim, listKnowledgeClaims, saveKnowledgeClaim } from "@/lib/dojo/knowledgeClaimStore";
import {
  KNOWLEDGE_CLAIM_TITLE_PREFIX,
  adoptionError,
  currentClaimVersion,
  normalizeKnowledgeClaim,
  type KnowledgeClaim,
  type KnowledgeClaimStatus,
  type KnowledgeMaturity,
} from "@/lib/dojo/knowledgeClaims";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ids = req.nextUrl.searchParams.get("ids")?.split(",").map((id) => id.trim()).filter(Boolean);
    const claims = await listKnowledgeClaims();
    return NextResponse.json({ claims: ids?.length ? claims.filter((claim) => ids.includes(claim.id)) : claims });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const claim = await createKnowledgeClaim(await req.json());
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
      const statement = typeof body.statement === "string" ? body.statement.trim().slice(0, 6000) : "";
      if (!statement) return NextResponse.json({ error: "新版主張不可空白" }, { status: 400 });
      const oldCurrent = currentClaimVersion(previous);
      const nextId = crypto.randomUUID();
      const next: KnowledgeClaim = {
        ...previous,
        currentVersionId: nextId,
        versions: [
          ...previous.versions.map((version) => version.id === oldCurrent.id ? { ...version, status: "superseded" as const } : version),
          {
            ...oldCurrent,
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
      next = setCurrentState(draft, "K4", "active", true);
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
