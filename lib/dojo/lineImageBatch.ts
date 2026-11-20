import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { createKnowledgeEntry, updateKnowledgeEntry } from "@/lib/notion/mutations";
import { readJsonRecord } from "./notionStore";
import { withIntegrationMutationLease } from "./integrationMutationLease";

type ImageBatch = {
  entryId: string;
  expiresAt: number;
  sessionId?: string;
  startedAt?: number;
  nativeSetProgress?: Record<string, number[]>;
};
type BatchRow = Awaited<ReturnType<typeof readJsonRecord>>;
type BatchScope = { title: string; assertCurrent: () => Promise<void>; row?: BatchRow };
const scopes = new AsyncLocalStorage<BatchScope>();
const queue = new Map<string, Promise<void>>();
const batchTitle = (userId: string) => "行光剪藏收圖組-" + createHash("sha256").update(userId).digest("hex");

export async function withLineImageBatchLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const title = batchTitle(userId);
  if (scopes.getStore()?.title === title) return work();
  const preceding = queue.get(title);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  queue.set(title, pending);
  try {
    await preceding;
    const deadline = Date.now() + 60_000;
    while (true) {
      let entered = false;
      try {
        return await withIntegrationMutationLease("line-image-batch:" + title, guard => {
          entered = true;
          return scopes.run({ title, assertCurrent: guard.assertCurrent }, work);
        });
      } catch (error) {
        if (entered || (error as { code?: string })?.code !== "MUTATION_LEASE_HELD" || Date.now() >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 450 + Math.random() * 300));
      }
    }
  } finally {
    release();
    if (queue.get(title) === pending) queue.delete(title);
  }
}

async function readBatchRow(title: string): Promise<BatchRow> {
  const scope = scopes.getStore();
  if (scope?.title === title && scope.row !== undefined) return scope.row;
  const row = await readJsonRecord(title);
  if (scope?.title === title) scope.row = row;
  return row;
}

export async function readLineImageBatch(userId: string): Promise<ImageBatch | null> {
  const row = await readBatchRow(batchTitle(userId));
  const batch = row?.value as Partial<ImageBatch> | null;
  if (typeof batch?.entryId !== "string" || typeof batch.expiresAt !== "number" || batch.expiresAt <= Date.now()) return null;
  return {
    entryId: batch.entryId,
    expiresAt: batch.expiresAt,
    ...(typeof batch.sessionId === "string" ? { sessionId: batch.sessionId } : {}),
    ...(typeof batch.startedAt === "number" ? { startedAt: batch.startedAt } : {}),
    ...(batch.nativeSetProgress && typeof batch.nativeSetProgress === "object" ? {
      nativeSetProgress: Object.fromEntries(Object.entries(batch.nativeSetProgress)
        .filter(([, values]) => Array.isArray(values) && values.every(Number.isSafeInteger))),
    } : {}),
  };
}

export async function setLineImageBatch(userId: string, batch: ImageBatch | null): Promise<void> {
  const title = batchTitle(userId);
  const scope = scopes.getStore();
  if (scope?.title !== title) return withLineImageBatchLock(userId, () => setLineImageBatch(userId, batch));
  const row = await readBatchRow(title);
  if (!row && !batch) return;
  const content = JSON.stringify(batch ?? {});
  await scope.assertCurrent();
  if (row) {
    await updateKnowledgeEntry(row.id, { 內容: content });
    scope.row = { ...row, value: batch ?? {} };
  } else {
    const created = await createKnowledgeEntry({ 標題: title, 內容: content }, { retryCreate: false });
    scope.row = { id: created.id, title, value: batch ?? {} };
  }
}
