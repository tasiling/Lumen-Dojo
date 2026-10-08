import {
  BridgeError,
  LEGACY_SCAN_VERSION,
  EPOCH,
  mergeReceipt,
  receiptIdentity,
  type Receipt,
  type Checkpoint,
  type LegacyReceipt,
  type Alias,
} from "./model";
import type { CompletionEvent } from "../practiceEvents/model";
import type { SourceResult } from "./model";
import { sourceIdentity } from "../practiceEvents/service";
import type { Adapter } from "./adapter";
export type BridgeRepository = {
  acceptSource?(source:SourceResult):Promise<{event:CompletionEvent|null;created:boolean}>;
  retrySource?(id:string):Promise<CompletionEvent>;
  owner: string;
  read(id: string): Promise<Receipt | null>;
  save(row: Receipt): Promise<void>;
  checkpoint(): Promise<Checkpoint | null>;
  saveCheckpoint(row: Checkpoint): Promise<void>;
  legacy(
    sourceId: string, cursor?: string | null,
  ): Promise<
    LegacyReceipt[] | { receipts: LegacyReceipt[]; complete: boolean; cursor?:string|null; unidentified?:boolean }
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
      // Pre-admission checkpoints only acknowledged cached facts. A one-time
      // bounded full replay must prove event/body admission under this contract.
      if(repo.acceptSource && repo.retrySource && prior?.acceptanceVersion !== 1) {
        checkpoint={...checkpoint,acceptanceVersion:1,after:EPOCH,cursor:null,windowUpper:null,pageReceipts:[],reconciling:true};
        await repo.saveCheckpoint(checkpoint);
      }
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
      let saved = 0, counted = 0;
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
        const verifiedLegacy = previous?.legacyLookupComplete && previous.legacyScanVersion === LEGACY_SCAN_VERSION && typeof previous.legacyUnidentified === "boolean";
        const foundLegacy = verifiedLegacy ? [] : await repo.legacy(source.sourceId,previous?.legacyScanVersion === LEGACY_SCAN_VERSION ? previous.legacyCursor : null);
        const legacy = Array.isArray(foundLegacy)
          ? { receipts: foundLegacy, complete: true }
          : foundLegacy;
        let row = mergeReceipt(
          previous,
          source,
          repo.owner,
          now,
          legacy.receipts,
          legacy.complete,
        );
        if(!verifiedLegacy) {
          const entries=[...(previous?.legacyReceipts??[]),...legacy.receipts];
          row={...row,legacyScanVersion:LEGACY_SCAN_VERSION,legacyLookupComplete:legacy.complete,legacyCursor:"cursor" in legacy ? legacy.cursor??null:null,legacyUnidentified:previous?.legacyUnidentified || ("unidentified" in legacy && legacy.unidentified) || false,legacyReceipts:[...new Map(entries.map(x=>[x.pageId,x])).values()]};
          if(row.legacyUnidentified && !row.reasons.includes("LEGACY_SOURCE_ID_UNKNOWN")) row.reasons.push("LEGACY_SOURCE_ID_UNKNOWN");
          if(legacy.complete) row.reasons=row.reasons.filter(x=>x!=="LEGACY_SCAN_INCOMPLETE");
        }
        if(row.legacyUnidentified && !row.reasons.includes("LEGACY_SOURCE_ID_UNKNOWN")) row.reasons.push("LEGACY_SOURCE_ID_UNKNOWN");
        if (!previous || JSON.stringify(row) !== JSON.stringify(previous)) await repo.save(row);
        if(repo.acceptSource && repo.retrySource) {
          if(!row.legacyLookupComplete) throw new BridgeError("LEGACY_SCAN_PENDING",503);
          // Exact legacy provenance requires owner reconciliation; never guess a
          // new event for an old activity that already counted elsewhere.
          if(!row.legacyReceipts.length && !row.legacyUnidentified) {
            const accepted=await repo.acceptSource(row.source);
            const event=accepted.event ? await repo.retrySource(accepted.event.id) : null;
            row={...row,eventId:event?.id??null,learningRecordId:event?.learningRecordId??null,acceptance:row.source.completionStatus !== "completed" ? row.source.completionStatus : event?.projections.record === "applied" ? "accepted" : "needs_review",reasons:row.reasons.filter(x=>x!=="R2_3_EXTERNAL_CONTRACT_PENDING"),projections:{...row.projections,record:event?.projections.record??"blocked"}};
            await repo.save(row);
            if(event?.projections.record === "needs_retry" || event?.projections.record === "pending") throw new BridgeError("SOURCE_PROJECTION_PENDING",503);
            if(accepted.created && row.acceptance === "accepted") counted++;
          }
        }
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
        counted,
        contractStatus: repo.acceptSource ? "active" : "pending",
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
      if(repo.acceptSource && repo.retrySource && row.legacyLookupComplete && row.legacyScanVersion === LEGACY_SCAN_VERSION && row.legacyUnidentified === false && !row.legacyReceipts.length) {
        const accepted=await repo.acceptSource(row.source);
        const event=accepted.event ? await repo.retrySource(accepted.event.id):null;
        const next:Receipt={...row,eventId:event?.id??null,learningRecordId:event?.learningRecordId??null,acceptance:row.source.completionStatus !== "completed" ? row.source.completionStatus : event?.projections.record === "applied" ? "accepted":"needs_review",projections:{...row.projections,record:event?.projections.record??"blocked"}};
        await repo.save(next); return {receipt:next,outcome:event?.projectionStatus??"SOURCE_UNVERIFIED"};
      }
      // R2-3 accepts journal events only. Retrying quarantined metadata must never
      // secretly create an incompatible event/body/projection or acknowledge Notion.
      return {
        receipt: row,
        outcome: "CONTRACT_PENDING_NO_PROJECTION" as const,
      };
    },
  };
}
