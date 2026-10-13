import type { LearningEntity } from "../learningFoundation/model";
// platinum remains readable in old immutable snapshots; new rubrics reject it.
export type Rank = "stone" | "bronze" | "silver" | "gold" | "diamond" | "platinum";
export type EvidenceKind = "text" | "learning-record" | "url" | "file" | "audio" | "professional-proof";
export type EvidenceInput = { id: string; kind: EvidenceKind; label: string; selectedText?: string; url?: string; referenceId?: string; fileBlockId?: string };
export type EvidenceContext = { attemptId: string; definitionVersion: number; answerDigest: string };
export type ProofAttestation = EvidenceContext & { evaluator: { type: "teacher" | "professional"; name: string }; nativeMediaIdentity: string; reviewStatus: "verified" };
export type ProofRecord = { recordType: "assessment-proof/v1"; owner: string; reviewedBy: string; provenance: "owner-recorded-source-correspondence"; evidenceId: string; submittedRevision: number; requestFingerprint: string; reviewNote: string; createdAt: string; attestation: ProofAttestation };
export type Evidence = EvidenceInput & { status: "available" | "archived" | "missing" | "unverified"; snapshot: string; nativeMediaIdentity?: string; attestation?: ProofAttestation };
export type Scope = { learningItemId: string; stageId?: string; topicId?: string; level: "topic" | "stage" | "path"; languageDimension: "none" | "reading" | "writing" | "listening" | "speaking" | "pronunciation" | "fluency" };
export type ConfirmationMethod = "self" | "teacher" | "professional";
export type Criterion = { id: string; description: string; meetsDescription: string; mandatory: boolean; requiredEvidenceKinds: EvidenceKind[] };
export type DefinitionInput = { name: string; objective: string; scope: Scope; achievedRank: Rank; tasks: string[]; aids: string[]; criteria: Criterion[]; confirmationMethods: ConfirmationMethod[]; professionalPractice: boolean; cefr?: string };
export type Definition = DefinitionInput & { recordType: "assessment-definition/v1"; id: string; capabilityId: string; definitionVersion: number; owner: string; requestFingerprint: string; createdAt: string };
export type CriterionVerdict = "meets" | "needs-work" | "insufficient";
export type Evaluation = { attemptId: string; definitionVersion: number; attemptRevision: number; evaluator: { type: ConfirmationMethod | "ai"; name: string; proofEvidenceId?: string }; criteria: { criterionId: string; verdict: CriterionVerdict; feedback: string }[] };
export type Verdict = "pending" | CriterionVerdict;
export type Attempt = {
  recordType: "assessment-attempt/v1"; id: string; owner: string; requestFingerprint: string;
  capabilityId: string; definitionVersion: number; definitionSnapshot: Definition; revision: number;
  status: "draft" | "submitted" | "assessed"; verdict: Verdict; answer: string; evidence: Evidence[];
  evaluation: Evaluation | null; confirmedAt: string | null; confirmationMethod: ConfirmationMethod | null;
  revisitOf: string | null; createdAt: string; updatedAt: string; submittedAt: string | null;
};
export interface AssessmentRepository {
  owner: string;
  graph(): Promise<LearningEntity[]>;
  definitions(): Promise<Definition[]>;
  attempts(): Promise<Attempt[]>;
  getAttempt(id: string): Promise<Attempt | null>;
  createDefinition(value: Definition): Promise<void>;
  createAttempt(value: Attempt): Promise<void>;
  updateAttempt(value: Attempt): Promise<void>;
  verifyEvidence(inputs: EvidenceInput[], previous: Evidence[] | undefined, context: EvidenceContext): Promise<Evidence[]>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}
