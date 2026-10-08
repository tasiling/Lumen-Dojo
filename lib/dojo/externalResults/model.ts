import type { ProjectionState } from "../practiceEvents/model";
import { LearningError } from "../learningFoundation/model";
import { sourceIdentity } from "../practiceEvents/service";
import { validDate } from "../learningRecords/model";
export const CONTRACT = "context-room-practice-results/v1";
export const RECEIPT_PREFIX = "行光外部來源收據-";
export const CHECKPOINT_PREFIX = "行光外部來源游標-";
export const EPOCH = "1970-01-01T00:00:00.000Z";
export class BridgeError extends LearningError {
  constructor(
    public code: string,
    status = 409,
  ) {
    super(code, status);
  }
}
export const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new BridgeError("SOURCE_INVALID", 422);
  return v as Record<string, unknown>;
}
function text(v: unknown, max = 200): string {
  if (typeof v !== "string" || !v.length || v.length > max)
    throw new BridgeError("SOURCE_INVALID", 422);
  return v;
}
function nullable(v: unknown, max = 200): string | null {
  return v === null ? null : text(v, max);
}
export function timestamp(v: unknown): string {
  const s = text(v, 40);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 19) !== s.slice(0, 19) ||
    s.startsWith("0000")
  )
    throw new BridgeError("SOURCE_DATE_INVALID", 422);
  return s;
}
// Source facts use PostgreSQL jsonb RFC3339 offsets. Keep their original
// precision and offset; only the keyset timestamps require strict UTC Z.
export function originalTimestamp(v: unknown): string {
  const s = text(v, 40),
    m = s.match(
      /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(Z|[+-]\d\d:\d\d)$/,
    );
  if (
    !m ||
    !validDate(m[1]) ||
    Number(m[2]) > 23 ||
    Number(m[3]) > 59 ||
    Number(m[4]) > 59 ||
    !Number.isFinite(Date.parse(s)) ||
    (m[5] !== "Z" &&
      (Number(m[5].slice(1, 3)) > 23 || Number(m[5].slice(4)) > 59))
  )
    throw new BridgeError("SOURCE_DATE_INVALID", 422);
  return s;
}
const MODES = [
  "topic_speaking",
  "dialogue",
  "writing_review",
  "micro_practice",
  "quick_retell",
];
export function compareTime(a: string, b: string): number {
  function normalize(s: string) {
    timestamp(s);
    const [main, fraction = ""] = s.slice(0, -1).split(".");
    return main + "." + fraction.padEnd(6, "0");
  }
  const x = normalize(a),
    y = normalize(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
type Context = {
  projectId: string;
  projectName: string | null;
  unitId: string | null;
  unitName: string | null;
  capturedAt?: string | null;
};
function context(v: unknown, original = false): Context | null {
  if (v === null && original) return null;
  const o = object(v);
  return {
    projectId: text(o.projectId),
    projectName: nullable(o.projectName, 2000),
    unitId: nullable(o.unitId),
    unitName: nullable(o.unitName, 2000),
    ...(original
      ? {
          capturedAt:
            o.capturedAt === null ? null : originalTimestamp(o.capturedAt),
        }
      : {}),
  };
}
export type SourceResult = {
  contractVersion: typeof CONTRACT;
  sourceSystem: "context-room";
  sourceType: "practice-session";
  sourceId: string;
  sourceEventId: string;
  sourceRevision: string;
  completionStatus: "completed" | "withdrawn" | "unverified";
  sourceStatus: "available" | "archived" | "missing";
  sourceAvailability: "available" | "archived" | "deleted";
  practicedOn: string | null;
  occurredAt: string | null;
  timeZone: string | null;
  dateSemantics: string;
  originalContext: Context | null;
  currentContext: Context;
  activityMode: string;
  completionKind: "context-room-session";
  quantity: 1;
  unit: "次";
  summary: {
    mode: string;
    firstDone: boolean;
    feedbackReceived: boolean;
    secondDone: boolean;
  };
  sourceLocation: string | null;
  contextEvidence: string;
  updatedAt: string;
};
export function validateResult(input: unknown, origin: string): SourceResult {
  const o = object(input),
    s = object(o.summary);
  if (
    o.contractVersion !== CONTRACT ||
    o.eventVersion !== 1 ||
    o.eventType !== "practice.completed" ||
    o.sourceSystem !== "context-room" ||
    o.sourceType !== "practice-session" ||
    !uuid(o.sourceId) ||
    o.sourceEventId !== o.sourceId
  )
    throw new BridgeError("SOURCE_IDENTITY_INVALID", 422);
  const originalMode = text(o.activityMode, 80),
    currentMode = text(s.mode, 80);
  if (
    o.completionStatus === "completed" &&
    (!MODES.includes(originalMode) || !MODES.includes(currentMode))
  )
    throw new BridgeError("SOURCE_MODE_UNSUPPORTED", 422);
  if (
    !["completed", "withdrawn", "unverified"].includes(
      String(o.completionStatus),
    ) ||
    !["available", "archived", "missing"].includes(String(o.sourceStatus)) ||
    !["available", "archived", "deleted"].includes(String(o.sourceAvailability))
  )
    throw new BridgeError("SOURCE_STATUS_INVALID", 422);
  if (
    (
      {
        available: "available",
        archived: "archived",
        missing: "deleted",
      } as Record<string, string>
    )[String(o.sourceStatus)] !== o.sourceAvailability
  )
    throw new BridgeError("SOURCE_STATUS_INVALID", 422);
  if (
    o.completionKind !== "context-room-session" ||
    o.quantity !== 1 ||
    o.unit !== "次" ||
    [s.firstDone, s.feedbackReceived, s.secondDone].some(
      (v) => typeof v !== "boolean",
    )
  )
    throw new BridgeError("SOURCE_INVALID", 422);
  if (
    o.completionStatus === "completed" &&
    (!s.firstDone ||
      !s.feedbackReceived ||
      (s.mode !== "quick_retell" && !s.secondDone))
  )
    throw new BridgeError("SOURCE_COMPLETION_UNVERIFIED", 422);
  if (o.practicedOn !== null && !validDate(o.practicedOn))
    throw new BridgeError("SOURCE_DATE_INVALID", 422);
  let sourceLocation: string | null = null;
  if (o.sourceLocation !== null) {
    if (o.sourceLocation !== `/practice-results/${o.sourceId}`)
      throw new BridgeError("SOURCE_LOCATION_INVALID", 422);
    sourceLocation = new URL(o.sourceLocation, origin).toString();
  }
  if (o.sourceAvailability === "deleted" && sourceLocation !== null)
    throw new BridgeError("SOURCE_LOCATION_INVALID", 422);
  if (
    ![
      "captured-at-completion-write; practice-time-context-unproven",
      "legacy-current-context-only",
    ].includes(String(o.contextEvidence))
  )
    throw new BridgeError("SOURCE_CONTEXT_INVALID", 422);
  return {
    contractVersion: CONTRACT,
    sourceSystem: "context-room",
    sourceType: "practice-session",
    sourceId: o.sourceId,
    sourceEventId: o.sourceId,
    sourceRevision: text(o.sourceRevision, 200),
    completionStatus: o.completionStatus as SourceResult["completionStatus"],
    sourceStatus: o.sourceStatus as SourceResult["sourceStatus"],
    sourceAvailability:
      o.sourceAvailability as SourceResult["sourceAvailability"],
    practicedOn: o.practicedOn as string | null,
    occurredAt: o.occurredAt === null ? null : originalTimestamp(o.occurredAt),
    timeZone: nullable(o.timeZone, 100),
    dateSemantics: text(o.dateSemantics, 500),
    originalContext: context(o.originalContext, true),
    currentContext: context(o.currentContext)!,
    activityMode: String(o.activityMode),
    completionKind: "context-room-session",
    quantity: 1,
    unit: "次",
    summary: {
      mode: String(s.mode),
      firstDone: s.firstDone as boolean,
      feedbackReceived: s.feedbackReceived as boolean,
      secondDone: s.secondDone as boolean,
    },
    sourceLocation,
    contextEvidence: String(o.contextEvidence),
    updatedAt: timestamp(o.updatedAt),
  };
}
export type Alias = {
  channel: "notion";
  pageId: string;
  syncVersion: 1;
  ack: "pending" | "applied" | "needs_retry";
  acknowledgedAt: string | null;
};
export type LegacyReceipt = {
  pageId: string;
  linkedActivityId: string | null;
  completedAt: string | null;
};
export type Receipt = {
  schema: "external-source-receipt/v1";
  id: string;
  owner: string;
  source: SourceResult;
  eventId: string | null;
  learningRecordId?: string | null;
  legacyCursor?: string | null;
  legacyUnidentified?: boolean;
  acceptance: "needs_review" | "accepted" | "withdrawn" | "unverified";
  reasons: string[];
  receivedAt: string;
  lastVerifiedAt: string;
  channels: ("api" | "notion")[];
  aliases: Alias[];
  legacyReceipts: LegacyReceipt[];
  legacyLookupComplete: boolean;
  projections: {
    record: ProjectionState | "blocked";
    lightStep: "blocked";
    weekly: "unlinked";
    ack: "not_applicable" | "blocked";
  };
};
export function receiptIdentity(owner: string, id: string) {
  return sourceIdentity(owner, "context-room", "practice-session", id);
}
export function mergeReceipt(
  previous: Receipt | null,
  incoming: SourceResult,
  owner: string,
  now: string,
  legacy: LegacyReceipt[],
  legacyComplete = true,
): Receipt {
  const id = receiptIdentity(owner, incoming.sourceId);
  if (
    previous &&
    (previous.owner !== owner ||
      previous.id !== id ||
      previous.schema !== "external-source-receipt/v1")
  )
    throw new BridgeError("OWNER_MISMATCH", 403);
  if (previous) {
    const order = compareTime(incoming.updatedAt, previous.source.updatedAt);
    if (order < 0) return previous;
    // A partial-page replay must make forward progress under Notion pacing.
    // Unchanged facts are a no-op; checkpoint.lastSuccessAt records refresh.
    if (
      order === 0 &&
      JSON.stringify(incoming) === JSON.stringify(previous.source)
    )
      return previous;
    if (
      order === 0 &&
      JSON.stringify(incoming) !== JSON.stringify(previous.source)
    )
      throw new BridgeError("STALE_REVISION_CONFLICT");
    if (
      order > 0 &&
      incoming.sourceRevision === previous.source.sourceRevision &&
      JSON.stringify({ ...incoming, updatedAt: "" }) !==
        JSON.stringify({ ...previous.source, updatedAt: "" })
    )
      throw new BridgeError("SOURCE_REVISION_CONFLICT");
  }
  const source = incoming;
  const reasons = ["R2_3_EXTERNAL_CONTRACT_PENDING"];
  if (
    !MODES.includes(source.activityMode) ||
    !MODES.includes(source.summary.mode)
  )
    reasons.push("SOURCE_MODE_UNSUPPORTED");
  const legacyLookupComplete = previous?.legacyLookupComplete ?? legacyComplete;
  if (!legacyLookupComplete) reasons.push("LEGACY_SCAN_INCOMPLETE");
  if (!source.timeZone) reasons.push("SOURCE_TIMEZONE_UNKNOWN");
  if (!source.practicedOn || !source.occurredAt)
    reasons.push("SOURCE_DATE_UNKNOWN");
  reasons.push("PRACTICE_TIME_NOT_INDEPENDENTLY_VERIFIED");
  if (!source.originalContext) reasons.push("ORIGINAL_CONTEXT_UNKNOWN");
  if (source.completionStatus !== "completed")
    reasons.push(
      source.completionStatus === "withdrawn"
        ? "SOURCE_WITHDRAWN"
        : "SOURCE_UNVERIFIED",
    );
  if (
    previous &&
    (source.practicedOn !== previous.source.practicedOn ||
      source.occurredAt !== previous.source.occurredAt ||
      JSON.stringify(source.originalContext) !==
        JSON.stringify(previous.source.originalContext))
  )
    throw new BridgeError("SOURCE_ORIGINAL_FACT_CONFLICT");
  const legacyReceipts = previous?.legacyReceipts.length
    ? previous.legacyReceipts
    : legacy;
  if (legacyReceipts.length) reasons.push("LEGACY_RECEIPT_REVIEW_REQUIRED");
  return {
    schema: "external-source-receipt/v1",
    id,
    owner,
    source,
    eventId: null,
    acceptance: "needs_review",
    reasons,
    receivedAt: previous?.receivedAt ?? now,
    lastVerifiedAt: now,
    channels: previous?.channels ?? ["api"],
    aliases: previous?.aliases ?? [],
    legacyReceipts,
    legacyLookupComplete,
    projections: {
      record: "blocked",
      lightStep: "blocked",
      weekly: "unlinked",
      ack: previous?.aliases.length ? "blocked" : "not_applicable",
    },
  };
}
export type Checkpoint = {
  schema: "external-source-checkpoint/v1";
  owner: string;
  after: string;
  cursor: string | null;
  windowUpper: string | null;
  reconciling: boolean;
  lastSuccessAt: string | null;
  lastReconciledAt: string | null;
  connection: "ready" | "temporarily_unavailable";
  errorCode: string | null;
  // Confirmed source snapshots within the current page; not a source cursor.
  pageReceipts?: string[];
};
