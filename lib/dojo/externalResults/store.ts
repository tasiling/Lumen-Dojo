import "server-only";
import { createKnowledgeEntry } from "@/lib/notion/mutations";
import { notion, withNotionRateLimit } from "@/lib/notion/client";
import { DATA_SOURCES } from "@/lib/notion/schema";
import { mapKnowledge } from "@/lib/notion/queries";
import { readJsonRecord, updateJsonRecordById } from "../notionStore";
import { learningOwner } from "../learningFoundation/store";
import { createPracticeOnce } from "../learningFoundation/practiceWrite";
import { sourceIdentity } from "../practiceEvents/service";
import { parseJson } from "../formal";
import { readContextRoomNotionIdentity } from "../contextRoomNotionInbox";
import { contextAdapter } from "./adapter";
import { bridgeService } from "./service";
import {
  BridgeError,
  validateResult,
  CHECKPOINT_PREFIX,
  RECEIPT_PREFIX,
  receiptIdentity,
  type Checkpoint,
  type Receipt,
  type LegacyReceipt,
} from "./model";
export const SOURCE_ORIGIN =
  "https://lumen-context-room-production-4a2c.up.railway.app";
export function sourceConfig() {
  if (
    process.env.CONTEXT_ROOM_RESULTS_ENABLED !== "1" ||
    process.env.CONTEXT_ROOM_RESULTS_OWNER !== learningOwner ||
    !process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET?.trim()
  )
    return null;
  // This reader does not share the dispatch URL override: no arbitrary-origin
  // proxy and no browser URL input. Isolated transports inject the adapter.
  return {
    origin: SOURCE_ORIGIN,
    secret: process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET.trim(),
  };
}
const checkpointTitle = () =>
  CHECKPOINT_PREFIX +
  sourceIdentity(
    learningOwner,
    "context-room",
    "checkpoint",
    "practice-results/v1",
  );
function owned(row: Receipt) {
  if (
    !row ||
    row.schema !== "external-source-receipt/v1" ||
    row.owner !== learningOwner ||
    row.id !== receiptIdentity(learningOwner, row.source.sourceId)
  )
    throw new BridgeError("OWNER_MISMATCH", 403);
  return row;
}
async function save(title: string, prefix: string, value: unknown) {
  const row = await readJsonRecord(title);
  if (row) {
    const previous = row.value as { owner?: string };
    if (previous.owner !== learningOwner)
      throw new BridgeError("OWNER_MISMATCH", 403);
    await updateJsonRecordById(row.id, prefix, title, value);
  } else
    await createPracticeOnce(
      sourceIdentity(learningOwner, "dojo", "external-transport-row", title),
      () =>
        createKnowledgeEntry(
          { 標題: title, 內容: JSON.stringify(value) },
          { retryCreate: false },
        ),
    );
}
export async function checkpoint() {
  const row = await readJsonRecord(checkpointTitle());
  if (!row) return null;
  const value = row.value as Checkpoint;
  if (
    value?.owner !== learningOwner ||
    value.schema !== "external-source-checkpoint/v1"
  )
    throw new BridgeError("OWNER_MISMATCH", 403);
  return value;
}
export const externalResults = bridgeService(
  {
    owner: learningOwner,
    async read(id) {
      const row = await readJsonRecord(RECEIPT_PREFIX + id);
      return row ? owned(row.value as Receipt) : null;
    },
    async save(row) {
      owned(row);
      await save(RECEIPT_PREFIX + row.id, RECEIPT_PREFIX, row);
    },
    checkpoint,
    async saveCheckpoint(row) {
      await save(checkpointTitle(), CHECKPOINT_PREFIX, row);
    },
    async legacy(sourceId) {
      // Bounded old-card lookup: do not call queryAll inside a bounded sync.
      // If older pages remain, the receipt stays explicitly legacy-unchecked.
      const page = await withNotionRateLimit(() =>
        notion().dataSources.query({
          data_source_id: DATA_SOURCES.DB14_知識庫,
          filter: { property: "標題", title: { starts_with: "行光語境成果-" } },
          sorts: [{ timestamp: "created_time", direction: "descending" }],
          page_size: 100,
        }),
      );
      const rows = page.results.map((p) => ({
        id: p.id,
        value: parseJson(mapKnowledge(p).內容),
      }));
      const receipts = rows.flatMap((row) => {
        const r = row.value as {
          sourceEventId?: string;
          linkedActivityId?: string;
          linkedActivityCompletedAt?: string;
        };
        return r?.sourceEventId === sourceId
          ? [
              {
                pageId: row.id,
                linkedActivityId: r.linkedActivityId ?? null,
                completedAt: r.linkedActivityCompletedAt ?? null,
              } satisfies LegacyReceipt,
            ]
          : [];
      });
      return { receipts, complete: !page.has_more };
    },
    async alias(pageId) {
      const verified = await readContextRoomNotionIdentity(pageId);
      return {
        sourceId: verified.sourceEventId,
        alias: {
          channel: "notion",
          pageId: verified.notionPageId,
          syncVersion: 1,
          ack: verified.acknowledged ? "applied" : "pending",
          acknowledgedAt: verified.acknowledgedAt,
        },
      };
    },
  },
  contextAdapter(sourceConfig()),
);
function publicReceipt(row: Receipt): Receipt {
  const location = row.source.sourceLocation;
  if (
    location !== null &&
    location !== `${SOURCE_ORIGIN}/practice-results/${row.source.sourceId}`
  )
    throw new BridgeError("SOURCE_LOCATION_INVALID", 422);
  const source = validateResult(
    {
      ...row.source,
      eventVersion: 1,
      eventType: "practice.completed",
      sourceLocation: location
        ? `/practice-results/${row.source.sourceId}`
        : null,
    },
    SOURCE_ORIGIN,
  );
  // Reconstruct an allowlisted view, never return arbitrary DB14 JSON fields.
  return {
    schema: row.schema,
    id: row.id,
    owner: row.owner,
    source,
    eventId: null,
    acceptance: "needs_review",
    reasons: row.reasons.filter(
      (x) => typeof x === "string" && /^[A-Z0-9_]+$/.test(x),
    ),
    receivedAt: row.receivedAt,
    lastVerifiedAt: row.lastVerifiedAt,
    channels: row.channels.filter((x) => x === "api" || x === "notion"),
    aliases: row.aliases.map((a) => ({
      channel: "notion",
      pageId: a.pageId,
      syncVersion: 1,
      ack: a.ack,
      acknowledgedAt: a.acknowledgedAt,
    })),
    legacyLookupComplete: row.legacyLookupComplete ?? false,
    legacyReceipts: row.legacyReceipts.map((r) => ({
      pageId: r.pageId,
      linkedActivityId: r.linkedActivityId,
      completedAt: r.completedAt,
    })),
    projections: {
      record: "blocked",
      lightStep: "blocked",
      weekly: "unlinked",
      ack: row.aliases.length ? "blocked" : "not_applicable",
    },
  };
}
export async function cachedResults(cursor: string | null) {
  if (cursor && (cursor.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(cursor)))
    throw new BridgeError("CACHE_CURSOR_INVALID", 400);
  const page = await withNotionRateLimit(() =>
    notion().dataSources.query({
      data_source_id: DATA_SOURCES.DB14_知識庫,
      filter: { property: "標題", title: { starts_with: RECEIPT_PREFIX } },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 20,
      ...(cursor ? { start_cursor: cursor } : {}),
    }),
  );
  const receipts = page.results.map((p) =>
    publicReceipt(owned(parseJson(mapKnowledge(p).內容) as Receipt)),
  );
  return {
    receipts,
    cursor: page.has_more ? page.next_cursor : null,
    checkpoint: await checkpoint(),
    sources: {
      contextRoom: sourceConfig() ? "configured" : "not_connected",
      vocabForge: "not_connected",
    },
    contractStatus: "pending",
  };
}
