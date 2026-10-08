import type { LearningRecord } from "../learningRecords/model";
export type TargetBinding = { weekStart: string; taskInstanceId: string };
export type ProjectionState = "pending" | "applied" | "needs_retry" | "unlinked" | "unmatched";
type BaseEvent = {
  id: string; owner: string; eventVersion: 1; eventType: "practice.completed";

  learningItemIds: string[];
  sourceId: string; sourceRevision: string; learningRecordId: string;
  quantity: 1; createdAt: string;
  sourceStatus: "available" | "archived" | "withdrawn" | "unverified" | "missing";
  binding: TargetBinding | null; evidence: Omit<LearningRecord, "owner" | "id" | "revision" | "createdAt" | "updatedAt" | "recordType"> | null;
  bindingStatus?: ProjectionState; // Derived GET view; never persisted by callers.
  projectionStatus: ProjectionState;
  projections: { record: ProjectionState; output: ProjectionState; weekly: ProjectionState };
  projectionRevision: number; syncedAt: string | null; error: string | null;
};
export type CompletionLedger = { manualProgress: number; events: { id: string; quantity: number; unit: string }[] };

export type JournalEvent = BaseEvent & { sourceSystem:"dojo"; sourceType:"english-journal-segment"; occurredAt:string; practicedOn:string; timeZone:string; sourceDate:string; completionKind:"journal-self-translation"; unit:"段" };
export type ContextEvent = BaseEvent & { sourceSystem:"context-room"; sourceType:"practice-session"; occurredAt:string|null; practicedOn:string|null; timeZone:string|null; sourceDate:string|null; completionKind:"context-room-session"; unit:"次"; sourceUpdatedAt:string; dateSemantics:string; sourceMetadata:{sourceLocation:string|null;activityMode:string;title:string}; completionStatus:"completed"|"withdrawn"|"unverified"; sourceAvailability:"available"|"archived"|"deleted" };
export type CompletionEvent = JournalEvent | ContextEvent;
