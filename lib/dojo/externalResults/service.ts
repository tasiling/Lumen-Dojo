import {
  BridgeError,
  EPOCH,
  mergeReceipt,
  receiptIdentity,
  type Receipt,
  type Checkpoint,
  type LegacyReceipt,
  type Alias,
} from "./model";
import { sourceIdentity } from "../practiceEvents/service";
import type { Adapter } from "./adapter";
export type BridgeRepository = {
  owner: string;
  read(id: string): Promise<Receipt | null>;
  save(row: Receipt): Promise<void>;
  checkpoint(): Promise<Checkpoint | null>;
  saveCheckpoint(row: Checkpoint): Promise<void>;
  legacy(
    sourceId: string,
  ): Promise<
    LegacyReceipt[] | { receipts: LegacyReceipt[]; complete: boolean }
  >;
  alias(pageId: string): Promise<{ sourceId: string; alias: Alias } | null>;
};
export function bridgeService(
  repo: BridgeRepository,
  adapter: Adapter,
  clock = () => new Date().toISOString(),
) {
  function owned(row: Receipt) {
    if (
      row.owner !== repo.owner ||
      row.id !== receiptIdentity(repo.owner, row.source.sourceId)
    )
      throw new BridgeError("OWNER_MISMATCH", 403);
    return row;
  }
  return {
    async sync(full: boolean) {
      if (!adapter.configured)
        throw new BridgeError("SOURCE_NOT_CONNECTED", 503);
      const prior = await repo.checkpoint();
      if (prior && prior.owner !== repo.owner)
        throw new BridgeError("OWNER_MISMATCH", 403);
      const now = clock();
      const due =
        !prior?.lastReconciledAt ||
        Date.parse(now) - Date.parse(prior.lastReconciledAt) >= 7 * 86400000;
      let checkpoint: Checkpoint = prior ?? {
        schema: "external-source-checkpoint/v1",
        owner: repo.owner,
        after: EPOCH,
        cursor: null,
        windowUpper: null,
        reconciling: true,
        lastSuccessAt: null,
        lastReconciledAt: null,
        connection: "ready",
        errorCode: null,
      };
      // Never abandon an interrupted full reconciliation. Incremental refresh also
      // starts full reconciliation every seven days; absences never mean deletion.
      if (!checkpoint.cursor && (full || due)) {
        checkpoint = {
          ...checkpoint,
          after: EPOCH,
          windowUpper: null,
          reconciling: true,
        };
        await repo.saveCheckpoint(checkpoint);
      }
      const page = await adapter
        .page(checkpoint.after, checkpoint.cursor)
        .catch(async (e) => {
          await repo.saveCheckpoint({
            ...checkpoint,
            connection: "temporarily_unavailable",
            errorCode:
              e instanceof BridgeError
                ? e.code
                : "SOURCE_TEMPORARILY_UNAVAILABLE",
          });
          throw e;
        });
      if (checkpoint.windowUpper && checkpoint.windowUpper !== page.windowUpper)
        throw new BridgeError("SOURCE_WINDOW_CHANGED");
      const rowHash = (source: (typeof page.results)[number]) =>
        sourceIdentity(
          repo.owner,
          "context-room",
          "source-page-snapshot",
          JSON.stringify(source),
        );
      const currentHashes = new Set(page.results.map(rowHash));
      const completed = new Set(
        (checkpoint.pageReceipts ?? []).filter((h) => currentHashes.has(h)),
      );
      const started = Date.now();
      let saved = 0;
      // One source page (50) per explicit mutation. A partial page replays from the
      // previous durable checkpoint; upsert identity makes that replay harmless.
      for (const source of page.results) {
        const hash = rowHash(source);
        if (completed.has(hash)) {
          saved++;
          continue;
        }
        if (Date.now() - started > 40000)
          throw new BridgeError("SYNC_PAUSED_REPLAY_PAGE", 503);
        const id = receiptIdentity(repo.owner, source.sourceId),
          previous = await repo.read(id);
        const foundLegacy = previous ? [] : await repo.legacy(source.sourceId);
        const legacy = Array.isArray(foundLegacy)
          ? { receipts: foundLegacy, complete: true }
          : foundLegacy;
        const row = mergeReceipt(
          previous,
          source,
          repo.owner,
          now,
          legacy.receipts,
          legacy.complete,
        );
        if (!previous || JSON.stringify(row) !== JSON.stringify(previous))
          await repo.save(row);
        // Only after the source fact has an acknowledged durable save. Progress
        // is persistent but the source cursor stays at the previous full page.
        // A restart skips exact snapshots without paying a network-read prefix.
        completed.add(hash);
        checkpoint = {
          ...checkpoint,
          pageReceipts: [...completed],
          connection: "ready",
          errorCode: null,
        };
        await repo.saveCheckpoint(checkpoint);
        saved++;
      }
      checkpoint = {
        ...checkpoint,
        cursor: page.nextCursor,
        pageReceipts: [],
        windowUpper: page.nextCursor ? page.windowUpper : null,
        after: page.nextCursor ? checkpoint.after : page.windowUpper,
        lastSuccessAt: now,
        lastReconciledAt:
          !page.nextCursor && checkpoint.reconciling
            ? now
            : checkpoint.lastReconciledAt,
        reconciling: page.nextCursor ? checkpoint.reconciling : false,
        connection: "ready",
        errorCode: null,
      };
      await repo.saveCheckpoint(checkpoint);
      return {
        saved,
        remaining: !!checkpoint.cursor,
        checkpoint,
        counted: 0,
        contractStatus: "pending" as const,
      };
    },
    async verifyNotion(pageId: string) {
      const verified = await repo.alias(pageId);
      if (!verified) throw new BridgeError("NOTION_SOURCE_UNVERIFIED", 409);
      const row = await repo.read(
        receiptIdentity(repo.owner, verified.sourceId),
      );
      if (!row) throw new BridgeError("AUTHORITATIVE_SOURCE_NOT_CACHED", 409);
      owned(row);
      const aliases = row.aliases.filter((a) => a.pageId !== pageId);
      if (aliases.length >= 100)
        throw new BridgeError("SOURCE_ALIAS_LIMIT", 409);
      aliases.push(verified.alias);
      const next = {
        ...row,
        aliases,
        channels: Array.from(new Set([...row.channels, "notion" as const])),
        projections: { ...row.projections, ack: "blocked" as const },
      };
      await repo.save(next);
      return next;
    },
    async retry(id: string) {
      const row = await repo.read(id);
      if (!row) throw new BridgeError("SOURCE_RECEIPT_MISSING", 404);
      owned(row);
      // R2-3 accepts journal events only. Retrying quarantined metadata must never
      // secretly create an incompatible event/body/projection or acknowledge Notion.
      return {
        receipt: row,
        outcome: "CONTRACT_PENDING_NO_PROJECTION" as const,
      };
    },
  };
}
