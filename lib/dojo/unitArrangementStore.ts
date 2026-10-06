import "server-only";

import { listJsonRecords, readJsonRecord, upsertJsonRecord } from "./notionStore";
import type { ArrangementGroup, ArrangementPending, UnitArrangementPack } from "./unitArrangement";
import type { EnglishImageContextLink } from "./englishImage";

export const UNIT_ARRANGEMENT_TITLE_PREFIX = "行光素材編排-";

export type ArrangementExecution = {
  sourceRecordId: string;
  groupRef: string;
  unitId: string;
  dispatchId: string;
  requestFingerprint: string;
  status: "pending" | "running" | "succeeded" | "failed" | "unknown" | "skipped";
  error: string;
  result: Record<string, unknown> | null;
  updatedAt: string;
};

export type UnitArrangementRecord = {
  version: 1;
  recordType: "unit-arrangement";
  id: string;
  status: "packed" | "previewed" | "approved" | "executing" | "partial" | "completed" | "cancelled";
  pack: UnitArrangementPack;
  sourceSnapshots: Array<{
    recordId: string;
    revision: number;
    contentFingerprint: string;
    source: Record<string, unknown>;
    content: Record<string, unknown>;
    expressions: Array<Record<string, unknown>>;
    existingLinks: EnglishImageContextLink[];
  }>;
  prompt: string;
  rawResult: string;
  groups: ArrangementGroup[];
  pending: ArrangementPending[];
  approvedSnapshotHash: string;
  approvalFingerprint: string;
  coordinationVersion: number;
  groupUnitIds: Record<string, string>;
  executions: ArrangementExecution[];
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};

function title(id: string) { return `${UNIT_ARRANGEMENT_TITLE_PREFIX}${id}`; }

function normalize(value: unknown): UnitArrangementRecord | null {
  if (!value || typeof value !== "object") return null;
  const item = value as UnitArrangementRecord;
  if (item.version !== 1 || item.recordType !== "unit-arrangement" || !item.id || !item.pack) return null;
  return { ...item, approvalFingerprint: item.approvalFingerprint || "", coordinationVersion: Number(item.coordinationVersion) || 0 };
}

export async function getUnitArrangement(id: string) {
  const row = await readJsonRecord(title(id));
  const record = normalize(row?.value);
  if (!record) throw new Error("找不到素材編排紀錄");
  return record;
}

export async function listUnitArrangements() {
  const rows = await listJsonRecords(UNIT_ARRANGEMENT_TITLE_PREFIX);
  return rows.flatMap((row) => {
    const record = normalize(row.value);
    return record ? [record] : [];
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveUnitArrangement(record: UnitArrangementRecord) {
  const updated = { ...record, updatedAt: new Date().toISOString() };
  await upsertJsonRecord(title(record.id), updated);
  return updated;
}
