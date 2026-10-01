import type { LearningRecord } from "../learningRecords/model";
export type TargetBinding = { weekStart: string; taskInstanceId: string };
export type ProjectionState = "pending" | "applied" | "needs_retry" | "unlinked" | "unmatched";
export type CompletionEvent = {
  id: string; owner: string; eventVersion: 1; eventType: "practice.completed";
  occurredAt: string; practicedOn: string; timeZone: string; sourceDate: string;
  learningItemIds: string[]; sourceSystem: "dojo"; sourceType: "english-journal-segment";
  sourceId: string; sourceRevision: string; learningRecordId: string;
  completionKind: "journal-self-translation"; quantity: 1; unit: "段"; createdAt: string;
  sourceStatus: "available" | "archived" | "withdrawn";
  binding: TargetBinding | null; evidence: Omit<LearningRecord, "owner" | "id" | "revision" | "createdAt" | "updatedAt" | "recordType">;
  projectionStatus: ProjectionState;
  projections: { record: ProjectionState; output: ProjectionState; weekly: ProjectionState };
  projectionRevision: number; syncedAt: string | null; error: string | null;
};
export type CompletionLedger = { manualProgress: number; events: { id: string; quantity: number; unit: string }[] };
