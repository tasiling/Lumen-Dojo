import "server-only";
import { createHash } from "node:crypto";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { DATA_SOURCES } from "@/lib/notion/schema";
import { mapKnowledge } from "@/lib/notion/queries";
import { parseJson } from "../formal";
import { LearningError } from "../learningFoundation/model";
import { learningOwner } from "../learningFoundation/store";
import { RECORD_PREFIX } from "../learningRecords/model";
import { ownedNativeAttachment } from "./nativeEvidence";
import type { Evidence, EvidenceContext, EvidenceInput, ProofAttestation } from "./model";
export async function verifyOwnedEvidence(inputs: EvidenceInput[], previous: Evidence[] | undefined, context: EvidenceContext): Promise<Evidence[]> {
  const values: Evidence[] = [];
  for (const e of inputs) {
    if (e.kind === "text") { values.push({ ...e, status: "available", snapshot: e.selectedText! }); continue; }
    if (e.kind === "url") { values.push({ ...e, status: "unverified", snapshot: e.label }); continue; }
    if (e.kind === "learning-record") {
      const old = previous?.find(p => p.id === e.id && p.kind === e.kind && p.referenceId === e.referenceId && p.selectedText === e.selectedText);
      const page = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { and: [{ property: "標題", title: { starts_with: RECORD_PREFIX } }, { property: "標題", title: { ends_with: ":" + e.referenceId } }] }, page_size: 2 }));
      if (page.has_more || page.results.length > 1) throw new LearningError("來源學習紀錄 ID 重複", 409);
      if (!page.results.length) { values.push({ ...e, status: "missing", snapshot: old?.snapshot ?? e.label }); continue; }
      const row = mapKnowledge(page.results[0]), value = parseJson(row.內容) as { owner: string; recordType: string; id: string; title?: string; whatIDid?: string; selectedExcerpt?: string; status?: string } | null;
      if (!value || value.owner !== learningOwner || value.id !== e.referenceId || value.recordType !== "learning-record/v1") throw new LearningError("來源紀錄 owner 或類型不符", 403);
      const selectionPresent = !e.selectedText || [value.whatIDid, value.selectedExcerpt].some(t => typeof t === "string" && t.includes(e.selectedText!));
      if (!selectionPresent && !old) throw new LearningError("來源選取文字不存在於已保存紀錄", 409);
      const snapshot = JSON.stringify({ id: value.id, title: value.title ?? e.label, whatIDid: value.whatIDid ?? "", selectedText: e.selectedText ?? value.selectedExcerpt ?? "" });
      const changed = Boolean(old && (!selectionPresent || old.snapshot !== snapshot));
      values.push({ ...e, status: value.status === "archived" ? "archived" : changed ? "unverified" : "available", snapshot: old?.snapshot ?? snapshot }); continue;
    }
    const native = await ownedNativeAttachment(e.referenceId!, e.fileBlockId!);
    const status = e.kind === "audio" && native.mediaKind !== "audio" && native.status === "available" ? "unverified" : native.status;
    let attestation: ProofAttestation | undefined;
    if (e.kind === "professional-proof" && status === "available" && native.identity) {
      const key = createHash("sha256").update(JSON.stringify([context.attemptId, e.id])).digest("hex");
      const proofPage = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { property: "標題", title: { equals: "行光能力證明-" + key } }, page_size: 2 }));
      if (proofPage.has_more || proofPage.results.length > 1) throw new LearningError("評核證明 ID 重複，請核對", 409);
      const proof = proofPage.results.length ? mapKnowledge(proofPage.results[0]) : null;
      const stored = proof ? parseJson(proof.內容) as { recordType?: string; owner?: string; reviewedBy?: string; attestation?: ProofAttestation } | null : null;
      if (stored?.owner === learningOwner && stored.recordType === "assessment-proof/v1" && stored.reviewedBy === learningOwner && stored.attestation?.reviewStatus === "verified" && stored.attestation.nativeMediaIdentity === native.identity) attestation = stored.attestation;
    }
    values.push({ ...e, status, snapshot: native.snapshot, ...(native.identity ? { nativeMediaIdentity: native.identity } : {}), ...(attestation ? { attestation } : {}) });
  }
  return values;
}
