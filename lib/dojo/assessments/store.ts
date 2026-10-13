import "server-only";
import { createHash } from "node:crypto";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { DATA_SOURCES } from "@/lib/notion/schema";
import { createKnowledgeEntry, updateKnowledgeEntry } from "@/lib/notion/mutations";
import { mapKnowledge } from "@/lib/notion/queries";
import { parseJson } from "../formal";
import { LearningError, uuidPattern } from "../learningFoundation/model";
import { withLearningWriteLock } from "../learningFoundation/fileLock";
import { createPracticeOnce } from "../learningFoundation/practiceWrite";
import { learningFoundation, learningOwner } from "../learningFoundation/store";
import { sourceIdentity } from "../practiceEvents/service";
import { assessmentService } from "./service";
import { verifyOwnedEvidence } from "./evidence";
import { ownedNativeAttachment } from "./nativeEvidence";
import type { AssessmentRepository, Attempt, Definition, ProofRecord } from "./model";
export const DEFINITION_PREFIX = "行光能力規準-";
export const ATTEMPT_PREFIX = "行光能力嘗試-";
export const PROOF_PREFIX = "行光能力證明-";
function guid(id: string) { if (typeof id !== "string" || !uuidPattern.test(id)) throw new LearningError("驗收 ID 不正確"); return id; }
type Stored = { id: string; value: Definition | Attempt };
async function rows(prefix: string): Promise<Stored[]> {
  const result: Stored[] = [], cursors = new Set<string>(), ids = new Set<string>(); let cursor: string | undefined;
  do {
    const page = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { property: "標題", title: { starts_with: prefix } }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }));
    if (page.has_more && (!page.next_cursor || cursors.has(page.next_cursor))) throw new LearningError("驗收分頁結果不完整，請稍後重試", 503);
    for (const p of page.results) {
      const row = mapKnowledge(p), value = parseJson(row.內容) as Definition | Attempt | null;
      if (!value || !uuidPattern.test(value.id) || value.owner !== learningOwner || !row.標題.startsWith(prefix) ||
          (prefix === DEFINITION_PREFIX ? value.recordType !== "assessment-definition/v1" : value.recordType !== "assessment-attempt/v1")) throw new LearningError("驗收資料 owner 或格式不符", 403);
      if (ids.has(value.id)) throw new LearningError("驗收 ID 重複，請核對", 409); ids.add(value.id); result.push({ id: row.id, value });
    }
    if (!page.has_more) break;
    cursors.add(page.next_cursor!); cursor = page.next_cursor!;
  } while (cursor);
  return result;
}
async function attemptRow(id: string) {
  guid(id);
  const page = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { property: "標題", title: { equals: ATTEMPT_PREFIX + id } }, page_size: 2 }));
  if (page.has_more || page.results.length > 1) throw new LearningError("嘗試 ID 重複，請核對", 409);
  if (!page.results.length) return null;
  const row = mapKnowledge(page.results[0]), a = parseJson(row.內容) as Attempt | null;
  if (!a || a.owner !== learningOwner || a.recordType !== "assessment-attempt/v1" || a.id !== id || !Number.isSafeInteger(a.revision) || a.revision < 1 || a.definitionSnapshot?.owner !== learningOwner || a.definitionSnapshot.capabilityId !== a.capabilityId || a.definitionSnapshot.definitionVersion !== a.definitionVersion) throw new LearningError("嘗試資料 owner 或版本不符", 403);
  return { id: row.id, value: a };
}
export const assessmentRepository: AssessmentRepository = {
  owner: learningOwner, exclusive: withLearningWriteLock,
  graph: async () => (await learningFoundation.snapshot()).entities,
  definitions: async () => {
    const values = (await rows(DEFINITION_PREFIX)).map(r => r.value as Definition), versions = new Set<string>();
    for (const d of values) { const key = `${d.capabilityId}:${d.definitionVersion}`; if (versions.has(key)) throw new LearningError("能力規準版本重複", 409); versions.add(key); }
    return values;
  },
  attempts: async () => (await rows(ATTEMPT_PREFIX)).map(r => r.value as Attempt),
  getAttempt: async id => (await attemptRow(id))?.value ?? null,
  verifyEvidence: verifyOwnedEvidence,
  async createDefinition(d) {
    const versionSlot = sourceIdentity(learningOwner, "assessment", "definition-version", `${d.capabilityId}:${d.definitionVersion}`);
    await createPracticeOnce(versionSlot, () => createPracticeOnce(sourceIdentity(learningOwner, "assessment", "definition-request", d.id), () => createKnowledgeEntry({ 標題: `${DEFINITION_PREFIX}${d.capabilityId}:v${d.definitionVersion}:${d.id}`, 內容: JSON.stringify(d) }, { retryCreate: false })));
  },
  async createAttempt(a) { await createPracticeOnce(sourceIdentity(learningOwner, "assessment", "attempt-request", a.id), () => createKnowledgeEntry({ 標題: ATTEMPT_PREFIX + a.id, 內容: JSON.stringify(a) }, { retryCreate: false })); },
  async updateAttempt(a) {
    const current = await attemptRow(a.id); if (!current || current.value.revision !== a.revision - 1) throw new LearningError("嘗試版本已變更，未覆寫", 409);
    await createPracticeOnce(sourceIdentity(learningOwner, "assessment", "attempt-revision", `${a.id}:${a.revision}`), () => updateKnowledgeEntry(current.id, { 內容: JSON.stringify(a) }));
  },
};
export const assessments = assessmentService(assessmentRepository);

export async function assessmentProofRecords(attemptId: string): Promise<ProofRecord[]> {
  const a = await assessments.getAttempt(attemptId), proofs: ProofRecord[] = [];
  const digest = createHash("sha256").update(JSON.stringify(a.answer)).digest("hex");
  for (const evidence of a.evidence.filter(e => e.kind === "professional-proof")) {
    const key = createHash("sha256").update(JSON.stringify([a.id, evidence.id])).digest("hex");
    const found = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { property: "標題", title: { equals: PROOF_PREFIX + key } }, page_size: 2 }));
    if (found.has_more || found.results.length > 1) throw new LearningError("評核證明 ID 重複，請核對", 409);
    if (!found.results.length) continue;
    const proof = parseJson(mapKnowledge(found.results[0]).內容) as ProofRecord | null;
    if (!proof || proof.recordType !== "assessment-proof/v1" || proof.owner !== learningOwner || proof.reviewedBy !== learningOwner || proof.provenance !== "owner-recorded-source-correspondence" || proof.evidenceId !== evidence.id || proof.attestation?.attemptId !== a.id || proof.attestation.definitionVersion !== a.definitionVersion || proof.attestation.answerDigest !== digest || proof.attestation.nativeMediaIdentity !== evidence.nativeMediaIdentity || proof.attestation.reviewStatus !== "verified")
      throw new LearningError("保存的評核證明對應不符，請核對", 409);
    proofs.push(proof);
  }
  return proofs;
}

// The signed-in owner records a checked source correspondence, not an external
// examiner login or professional qualification. The native identity and context
// are always derived here, never supplied by the caller.
export async function recordAssessmentProof(raw: Record<string, unknown>): Promise<ProofRecord> {
  const attemptId = guid(raw.id as string), evaluator = raw.evaluator as { type?: unknown; name?: unknown } | undefined;
  if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || typeof raw.evidenceId !== "string" || !raw.evidenceId.trim() || raw.evidenceId.length > 120 ||
      !evaluator || !["teacher", "professional"].includes(String(evaluator.type)) || typeof evaluator.name !== "string" || !evaluator.name.trim() || evaluator.name.length > 180 ||
      raw.correspondenceChecked !== true || typeof raw.reviewNote !== "string" || !raw.reviewNote.trim() || raw.reviewNote.length > 4000)
    throw new LearningError("需選取教師／專業證明、填寫評核者與核對說明，並明確確認來源對應");
  const reviewer = { type: evaluator.type as "teacher" | "professional", name: evaluator.name };
  return withLearningWriteLock(async () => {
    const a = await assessments.getAttempt(attemptId);
    if (a.status !== "submitted" || a.confirmedAt || a.revision !== raw.revision) throw new LearningError("只能核對目前已提交、尚未評估的作品", 409);
    if (!a.definitionSnapshot.confirmationMethods.includes(reviewer.type)) throw new LearningError("此評核者類型不在規準確認方式中", 409);
    const evidence = a.evidence.find(e => e.id === raw.evidenceId && e.kind === "professional-proof");
    if (!evidence?.referenceId || !evidence.fileBlockId || !evidence.nativeMediaIdentity || evidence.status !== "available") throw new LearningError("需選取提交時可用的原生評核證明附件", 409);
    const native = await ownedNativeAttachment(evidence.referenceId, evidence.fileBlockId);
    if (native.status !== "available" || !native.identity || native.identity !== evidence.nativeMediaIdentity) throw new LearningError("原始證明已變更或無法核對，未登錄證明", 409);
    const key = createHash("sha256").update(JSON.stringify([a.id, evidence.id])).digest("hex");
    const attestation = { attemptId: a.id, definitionVersion: a.definitionVersion, answerDigest: createHash("sha256").update(JSON.stringify(a.answer)).digest("hex"), evaluator: reviewer, nativeMediaIdentity: native.identity, reviewStatus: "verified" as const };
    const fingerprint = createHash("sha256").update(JSON.stringify([attestation, evidence.id, evidence.referenceId, evidence.fileBlockId, raw.revision, raw.reviewNote])).digest("hex");
    const found = await withNotionRateLimit(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.DB14_知識庫, filter: { property: "標題", title: { equals: PROOF_PREFIX + key } }, page_size: 2 }));
    if (found.has_more || found.results.length > 1) throw new LearningError("評核證明 ID 重複，請核對", 409);
    if (found.results.length) {
      const stored = parseJson(mapKnowledge(found.results[0]).內容) as ProofRecord | null;
      if (!stored || stored.owner !== learningOwner || stored.reviewedBy !== learningOwner || stored.recordType !== "assessment-proof/v1" || stored.provenance !== "owner-recorded-source-correspondence" || stored.requestFingerprint !== fingerprint)
        throw new LearningError("證明已登錄其他對應，不能覆寫；請建立新的獨立嘗試", 409);
      return stored;
    }
    const proof: ProofRecord = { recordType: "assessment-proof/v1", owner: learningOwner, reviewedBy: learningOwner, provenance: "owner-recorded-source-correspondence", evidenceId: evidence.id, submittedRevision: a.revision, requestFingerprint: fingerprint, reviewNote: raw.reviewNote as string, createdAt: new Date().toISOString(), attestation };
    await createPracticeOnce(sourceIdentity(learningOwner, "assessment", "proof-correspondence", key), () => createKnowledgeEntry({ 標題: PROOF_PREFIX + key, 內容: JSON.stringify(proof) }, { retryCreate: false }));
    return proof;
  });
}
