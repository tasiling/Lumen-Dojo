import { FORMAL_STATE_TITLE_PREFIXES } from "../lib/dojo/formal";
import { readFileSync } from "node:fs";
import { receiptIdentity } from "../lib/dojo/externalResults/model";
import { eventService, eventBody } from "../lib/dojo/practiceEvents/service";
import type { CompletionEvent } from "../lib/dojo/practiceEvents/model";
import assert from "node:assert/strict";
import {
  validateResult,
  compareTime,
  mergeReceipt,
  CONTRACT,
  BridgeError,
  type Checkpoint,
} from "../lib/dojo/externalResults/model";
import { bridgeService } from "../lib/dojo/externalResults/service";
import { contextAdapter } from "../lib/dojo/externalResults/adapter";
const id = "00000000-0000-4000-8000-000000000001";
const result = (overrides: Record<string, unknown> = {}) => ({
  contractVersion: CONTRACT,
  eventVersion: 1,
  eventType: "practice.completed",
  sourceSystem: "context-room",
  sourceType: "practice-session",
  sourceId: id,
  sourceEventId: id,
  sourceRevision: "legacy:opaque",
  completionStatus: "completed",
  sourceStatus: "available",
  sourceAvailability: "available",
  practicedOn: "2026-09-20",
  occurredAt: "2026-09-20T23:59:59.123456Z",
  timeZone: null,
  dateSemantics:
    "stored-practicedOn; completion/import time, not independently verified practice time",
  originalContext: null,
  currentContext: {
    projectId: "project-a",
    projectName: "中文".repeat(80),
    unitId: "unit-a",
    unitName: "Long English ".repeat(20),
  },
  activityMode: "quick_retell",
  completionKind: "context-room-session",
  quantity: 1,
  unit: "次",
  summary: {
    mode: "quick_retell",
    firstDone: true,
    feedbackReceived: true,
    secondDone: false,
  },
  sourceLocation: `/practice-results/${id}`,
  contextEvidence: "legacy-current-context-only",
  updatedAt: "2026-10-06T01:00:00.000001Z",
  privateNotes: "must not copy",
  firstAnswer: "must not copy",
  ...overrides,
});
async function main() {
  for (const activityMode of [
    "topic_speaking",
    "dialogue",
    "writing_review",
    "micro_practice",
    "quick_retell",
  ]) {
    const r = validateResult(
      result({
        activityMode,
        summary: {
          mode: activityMode,
          firstDone: true,
          feedbackReceived: true,
          secondDone: activityMode !== "quick_retell",
        },
      }),
      "https://fixture.invalid",
    );
    assert.equal(r.completionStatus, "completed");
    for (const required of [
      "firstDone",
      "feedbackReceived",
      ...(activityMode === "quick_retell" ? [] : ["secondDone"]),
    ]) {
      assert.throws(
        () =>
          validateResult(
            result({
              activityMode,
              summary: {
                mode: activityMode,
                firstDone: true,
                feedbackReceived: true,
                secondDone: activityMode !== "quick_retell",
                [required]: false,
              },
            }),
            "https://fixture.invalid",
          ),
        BridgeError,
      );
    }
    const unverified = validateResult(
      result({
        activityMode,
        completionStatus: "unverified",
        summary: {
          mode: activityMode,
          firstDone: false,
          feedbackReceived: false,
          secondDone: false,
        },
      }),
      "https://fixture.invalid",
    );
    assert.equal(unverified.completionStatus, "unverified");
  }
  for (const completionStatus of ["withdrawn", "unverified"])
    assert.equal(
      validateResult(result({ completionStatus }), "https://fixture.invalid")
        .completionStatus,
      completionStatus,
    );
  assert.throws(
    () =>
      validateResult(
        result({ activityMode: "draft" }),
        "https://fixture.invalid",
      ),
    BridgeError,
  );
  assert.throws(
    () =>
      validateResult(
        result({ completionStatus: "draft" }),
        "https://fixture.invalid",
      ),
    BridgeError,
  );
  assert.throws(
    () =>
      validateResult(
        result({
          summary: {
            mode: "quick_retell",
            firstDone: false,
            feedbackReceived: true,
            secondDone: false,
          },
        }),
        "https://fixture.invalid",
      ),
    BridgeError,
  );
  assert.throws(
    () =>
      validateResult(
        result({ sourceId: "other-owner-id" }),
        "https://fixture.invalid",
      ),
    BridgeError,
  );
  assert.throws(
    () =>
      validateResult(
        result({ sourceLocation: "https://evil.invalid/?token=private" }),
        "https://fixture.invalid",
      ),
    BridgeError,
  );
  assert.throws(
    () =>
      validateResult(
        result({ practicedOn: "2026-02-30" }),
        "https://fixture.invalid",
      ),
    BridgeError,
  );
  assert.equal(
    compareTime("2026-10-06T01:00:00.000001Z", "2026-10-06T01:00:00.000002Z"),
    -1,
  );
  assert.equal(
    compareTime("2026-10-06T01:00:00.1Z", "2026-10-06T01:00:00.100000Z"),
    0,
  );
  const r = validateResult(result(), "https://fixture.invalid");
  assert.ok(!JSON.stringify(r).includes("must not copy"));
  const first = mergeReceipt(
    null,
    r,
    "server-owner",
    "2026-10-06T00:00:00Z",
    [],
  );
  assert.equal(first.eventId, null);
  assert.equal(first.acceptance, "needs_review");
  assert.ok(first.reasons.includes("R2_3_EXTERNAL_CONTRACT_PENDING"));
  assert.equal(first.source.practicedOn, "2026-09-20");
  const changed = validateResult(
    result({
      updatedAt: "2026-10-06T01:00:00.000002Z",
      sourceRevision: "opaque:new",
      currentContext: {
        projectId: "moved",
        projectName: "Renamed",
        unitId: "unit-a",
        unitName: "Moved",
      },
    }),
    "https://fixture.invalid",
  );
  const next = mergeReceipt(
    first,
    changed,
    "server-owner",
    "2026-10-07T00:00:00Z",
    [],
  );
  assert.equal(next.id, first.id);
  assert.equal(next.source.originalContext, null);
  assert.equal(
    mergeReceipt(next, r, "server-owner", "2026-10-08T00:00:00Z", []).source
      .sourceRevision,
    "opaque:new",
  );
  assert.throws(
    () =>
      mergeReceipt(next, changed, "other-owner", "2026-10-07T00:00:00Z", []),
    BridgeError,
  );
  assert.throws(
    () =>
      mergeReceipt(
        next,
        validateResult(
          result({
            updatedAt: changed.updatedAt,
            sourceRevision: "conflicting",
          }),
          "https://fixture.invalid",
        ),
        "server-owner",
        "2026-10-07T00:00:00Z",
        [],
      ),
    BridgeError,
  );
  const rowMap = new Map<string, ReturnType<typeof mergeReceipt>>();
  let checkpoint: Checkpoint | null = null,
    writes = 0,
    failSave = false,
    failSource = false;
  const currentCheckpoint = (): Checkpoint => {
    assert.ok(checkpoint);
    return checkpoint as Checkpoint;
  };
  const repo = {
    owner: "server-owner",
    async read(id: string) {
      return rowMap.get(id) ?? null;
    },
    async save(r: ReturnType<typeof mergeReceipt>) {
      if (failSave) throw Error("confirmed rejection");
      rowMap.set(r.id, structuredClone(r));
      writes++;
    },
    async checkpoint() {
      return checkpoint && structuredClone(checkpoint);
    },
    async saveCheckpoint(c: Checkpoint) {
      checkpoint = structuredClone(c);
      writes++;
    },
    async legacy() {
      return [];
    },
    async alias() {
      return null;
    },
  };
  const page = {
    contractVersion: CONTRACT,
    results: [r],
    nextCursor: null,
    windowUpper: "2026-10-06T02:00:00.000001Z",
    incrementalSemantics:
      "bounded-live-window; inclusive overlapping refresh required",
  };
  const adapter = {
    configured: true,
    async page() {
      if (failSource)
        throw new BridgeError("SOURCE_TEMPORARILY_UNAVAILABLE", 503);
      return page;
    },
  };
  const eventRows=new Map<string,CompletionEvent>(); const bodyRows=new Map(); let failBody=true;
  const eventRepo={ owner:repo.owner,get:async(id:string)=>eventRows.get(id)??null,create:async(e:CompletionEvent)=>{eventRows.set(e.id,structuredClone(e));},update:async(e:CompletionEvent)=>{eventRows.set(e.id,structuredClone(e));},body:async(e:CompletionEvent)=>{if(failBody)throw Error("explicit body rejection");if(!bodyRows.has(e.learningRecordId))bodyRows.set(e.learningRecordId,eventBody(e));},daily:async()=>{throw Error("external daily prohibited");},saveDaily:async()=>{throw Error("external daily prohibited");},weekly:async()=>null,saveWeekly:async()=>{throw Error("external weekly prohibited");},assertKnownOutcome:()=>{} };
  const eventApi=eventService(eventRepo);
  const connectedRepo={...repo,acceptSource:async(source:typeof r)=>{const exists=eventRows.has(receiptIdentity(repo.owner,source.sourceId));const event=source.completionStatus === "completed" ? await eventApi.acceptContext({...source,sourceLocation:`https://lumen-context-room-production-4a2c.up.railway.app/practice-results/${source.sourceId}`}):await eventApi.updateContext({...source,sourceLocation:`https://lumen-context-room-production-4a2c.up.railway.app/practice-results/${source.sourceId}`});return {event,created:!exists&&!!event};},retrySource:async(id:string)=>eventApi.retry(id)};
  const connected=bridgeService(connectedRepo,adapter,()=>"2026-10-06T03:00:00Z");
  await assert.rejects(connected.sync(true), /PROJECTION/);
  assert.equal(eventRows.size,1,"event survives body rejection");
  failBody=false;
  await connected.sync(true);
  assert.equal(eventRows.size,1);assert.equal(bodyRows.size,1);
  assert.equal([...rowMap.values()][0].acceptance,"accepted");
  assert.equal((await connected.sync(true)).counted,0,"same snapshot must not count twice");
  checkpoint=null;rowMap.clear();eventRows.clear();bodyRows.clear();
  let legacyCalls=0;
  const pagedRepo={...connectedRepo,legacy:async(_id:string,cursor?:string|null)=>{
    legacyCalls++;
    if(!cursor) return {receipts:[],complete:false,cursor:"100"};
    assert.equal(cursor,"100"); return {receipts:[{pageId:"legacy-101",linkedActivityId:"already-counted",completedAt:"2026-09-20"}],complete:true,cursor:null};
  }};
  await assert.rejects(bridgeService(pagedRepo,adapter).sync(true),/LEGACY_SCAN_PENDING/);
  assert.equal(eventRows.size,0);assert.equal([...rowMap.values()][0].legacyCursor,"100");
  await bridgeService(pagedRepo,adapter).sync(true);
  assert.equal(legacyCalls,2);assert.equal(eventRows.size,0);assert.equal([...rowMap.values()][0].acceptance,"needs_review");
  checkpoint=null;rowMap.clear();
  const unknownLegacy={...connectedRepo,legacy:async()=>({receipts:[],complete:true,unidentified:true})};
  await bridgeService(unknownLegacy,adapter).sync(true);
  assert.equal(eventRows.size,0,"unidentified legacy must not be guessed or counted");
  checkpoint=null;rowMap.clear();
  const service = bridgeService(repo, adapter, () => "2026-10-06T03:00:00Z");
  await service.sync(false);
  assert.equal(rowMap.size, 1);
  assert.equal(currentCheckpoint().after, page.windowUpper);
  const restart = bridgeService(repo, adapter, () => "2026-10-06T03:00:00Z");
  await restart.sync(true);
  assert.equal(rowMap.size, 1);
  assert.equal([...rowMap.values()][0].eventId, null);
  const before = [...rowMap.values()][0];
  failSource = true;
  await assert.rejects(restart.sync(false));
  assert.equal(rowMap.size, 1);
  assert.equal(
    [...rowMap.values()][0].source.sourceStatus,
    before.source.sourceStatus,
  );
  failSource = false;
  checkpoint = null;
  rowMap.clear(); // Force a real new receipt write, not an identical no-op.
  failSave = true;
  await assert.rejects(restart.sync(true));
  assert.equal(currentCheckpoint().cursor, null);
  assert.equal(currentCheckpoint().after, "1970-01-01T00:00:00.000Z");
  failSave = false;
  await restart.sync(true);
  assert.equal(rowMap.size, 1);
  const second = validateResult(
    result({
      sourceId: "00000000-0000-4000-8000-000000000002",
      sourceEventId: "00000000-0000-4000-8000-000000000002",
      sourceLocation: "/practice-results/00000000-0000-4000-8000-000000000002",
    }),
    "https://fixture.invalid",
  );
  page.results = [r, second];
  await restart.sync(true);
  assert.equal(rowMap.size, 2);
  assert.ok(writes > 0);
  let calls = 0;
  const controlled = contextAdapter({
    origin: "https://fixture.invalid",
    secret: "isolated-secret",
    fetch: async (url, init) => {
      calls++;
      assert.equal(
        new URL(String(url)).pathname,
        "/api/integrations/lumen/practice-results",
      );
      assert.equal(init?.redirect, "error");
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer isolated-secret",
      );
      return new Response(
        JSON.stringify({
          ...page,
          results: page.results.map((r) =>
            result({
              sourceId: r.sourceId,
              sourceEventId: r.sourceId,
              sourceLocation: `/practice-results/${r.sourceId}`,
            }),
          ),
        }),
      );
    },
  });
  await controlled.page("1970-01-01T00:00:00.000Z", null);
  assert.equal(calls, 1);
  assert.equal(contextAdapter(null).configured, false);

  // Real adapter parses a stable bounded keyset cursor, retaining microseconds.
  const cursor = (
    time: string,
    uuid: string,
    after = "1970-01-01T00:00:00.000Z",
    upper = page.windowUpper,
  ) =>
    Buffer.from(
      JSON.stringify({ v: 1, after, upper, time, id: uuid }),
    ).toString("base64url");
  const keysetCursor = cursor(r.updatedAt, r.sourceId);
  let transportPage: Record<string, unknown> = {
    ...page,
    results: [result()],
    nextCursor: keysetCursor,
  };
  const keyset = contextAdapter({
    origin: "https://fixture.invalid",
    secret: "fixture",
    fetch: async () => new Response(JSON.stringify(transportPage)),
  });
  const firstPage = await keyset.page("1970-01-01T00:00:00.000Z", null);
  assert.equal(firstPage.nextCursor, keysetCursor);
  transportPage = {
    ...page,
    results: [
      result({
        sourceId: second.sourceId,
        sourceEventId: second.sourceId,
        sourceLocation: `/practice-results/${second.sourceId}`,
      }),
    ],
    nextCursor: null,
  };
  const finalPage = await keyset.page("1970-01-01T00:00:00.000Z", keysetCursor);
  assert.equal(finalPage.results[0].sourceId, second.sourceId);
  await assert.rejects(keyset.page("2026-01-01T00:00:00Z", keysetCursor));
  transportPage = {
    ...transportPage,
    windowUpper: "2026-10-06T02:00:00.000002Z",
  };
  await assert.rejects(keyset.page("1970-01-01T00:00:00.000Z", keysetCursor));
  transportPage = { ...page, results: [result(), result()], nextCursor: null };
  await assert.rejects(keyset.page("1970-01-01T00:00:00.000Z", null));
  // Interrupt a later page after one durable receipt: cursor must not advance.
  checkpoint = null;
  rowMap.clear();
  let pageIndex = 0,
    failAtSecond = true;
  const pages = [
    { ...page, results: [r], nextCursor: keysetCursor },
    {
      ...page,
      results: [
        second,
        validateResult(
          result({
            sourceId: "00000000-0000-4000-8000-000000000003",
            sourceEventId: "00000000-0000-4000-8000-000000000003",
            sourceLocation:
              "/practice-results/00000000-0000-4000-8000-000000000003",
            updatedAt: "2026-10-06T01:00:00.000002Z",
          }),
          "https://fixture.invalid",
        ),
      ],
      nextCursor: null,
    },
  ];
  const interrupted = bridgeService(
    {
      ...repo,
      async save(row) {
        if (failAtSecond && row.source.sourceId.endsWith("3"))
          throw Error("explicit provider rejection");
        await repo.save(row);
      },
    },
    {
      configured: true,
      async page(after, c) {
        assert.equal(after, "1970-01-01T00:00:00.000Z");
        pageIndex = c ? 1 : 0;
        return pages[pageIndex];
      },
    },
    () => "2026-10-06T03:00:00Z",
  );
  await interrupted.sync(true);
  assert.equal(currentCheckpoint().cursor, keysetCursor);
  await assert.rejects(interrupted.sync(false));
  assert.equal(currentCheckpoint().cursor, keysetCursor);
  assert.equal(rowMap.size, 2);
  failAtSecond = false;
  await interrupted.sync(false);
  assert.equal(rowMap.size, 3);
  assert.equal(currentCheckpoint().cursor, null);
  // A long-running transaction can move a row before the finished watermark.
  // Scheduled full reconciliation, rather than fixed seconds overlap, recovers it.
  let readAfter = "";
  const clocked = bridgeService(
    repo,
    {
      configured: true,
      async page(after) {
        readAfter = after;
        return { ...page, results: [r] };
      },
    },
    () => "2026-10-15T00:00:00Z",
  );
  await clocked.sync(false);
  assert.equal(readAfter, "1970-01-01T00:00:00.000Z");
  assert.equal(rowMap.size, 3);
  // Existing Notion schema version never replaces an authoritative API revision.
  const latest = mergeReceipt(
    null,
    changed,
    "server-owner",
    "2026-10-06T00:00:00Z",
    [],
  );
  rowMap.set(latest.id, latest);
  const aliasService = bridgeService(
    {
      ...repo,
      async alias() {
        return {
          sourceId: r.sourceId,
          alias: {
            channel: "notion" as const,
            pageId: "10000000-0000-4000-8000-000000000001",
            syncVersion: 1 as const,
            ack: "pending" as const,
            acknowledgedAt: null,
          },
        };
      },
    },
    adapter,
  );
  const aliased = await aliasService.verifyNotion(
    "10000000-0000-4000-8000-000000000001",
  );
  assert.equal(aliased.source.sourceRevision, "opaque:new");
  assert.equal(aliased.aliases.length, 1);
  assert.equal(aliased.id, latest.id);
  const unknownDate = mergeReceipt(
    null,
    validateResult(
      result({ practicedOn: null, occurredAt: null }),
      "https://fixture.invalid",
    ),
    "server-owner",
    "2026-10-06T00:00:00Z",
    [],
  );
  assert.ok(unknownDate.reasons.includes("SOURCE_DATE_UNKNOWN"));
  assert.equal(unknownDate.eventId, null);

  // Source doc/SQL JSON timestamps carry offsets, while cursors stay UTC Z.
  for (const offset of ["+00:00", "+08:00"]) {
    const original = `2026-10-01T10:00:00.123456${offset}`;
    const fact = validateResult(
      result({
        occurredAt: original,
        originalContext: {
          projectId: "a",
          projectName: "at write",
          unitId: "b",
          unitName: "unit",
          capturedAt: original,
        },
        contextEvidence:
          "captured-at-completion-write; practice-time-context-unproven",
      }),
      "https://fixture.invalid",
    );
    assert.equal(fact.occurredAt, original);
    assert.equal(fact.originalContext?.capturedAt, original);
  }
  const changedMode = validateResult(
    result({
      activityMode: "quick_retell",
      summary: {
        mode: "topic_speaking",
        firstDone: true,
        feedbackReceived: true,
        secondDone: true,
      },
    }),
    "https://fixture.invalid",
  );
  assert.equal(changedMode.activityMode, "quick_retell");
  assert.equal(changedMode.summary.mode, "topic_speaking");
  const unsupported = mergeReceipt(
    null,
    validateResult(
      result({
        activityMode: "unknown",
        completionStatus: "unverified",
        summary: {
          mode: "unknown",
          firstDone: false,
          feedbackReceived: false,
          secondDone: false,
        },
      }),
      "https://fixture.invalid",
    ),
    "server-owner",
    "2026-10-06T00:00:00Z",
    [],
    false,
  );
  assert.ok(unsupported.reasons.includes("SOURCE_MODE_UNSUPPORTED"));
  assert.ok(unsupported.reasons.includes("LEGACY_SCAN_INCOMPLETE"));
  assert.equal(unsupported.eventId, null);
  // Deterministic Notion pacing: repeated 40s budget interruptions must eventually
  // finish a 50-row page. Replays read unchanged rows, never rewrite them.
  const realNow = Date.now;
  let pacedTime = 0,
    pacedCheckpoint: Checkpoint | null = null,
    attempts = 0;
  const pacedRows = new Map<string, ReturnType<typeof mergeReceipt>>();
  const fifty = Array.from({ length: 50 }, (_, i) => {
    const uuid = `00000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`;
    return validateResult(
      result({
        sourceId: uuid,
        sourceEventId: uuid,
        sourceLocation: `/practice-results/${uuid}`,
      }),
      "https://fixture.invalid",
    );
  });
  try {
    Date.now = () => pacedTime;
    const paced = bridgeService(
      {
        ...repo,
        async read(id) {
          pacedTime += 900;
          return pacedRows.get(id) ?? null;
        },
        async save(row) {
          pacedTime += 2700;
          pacedRows.set(row.id, row);
        },
        async legacy() {
          pacedTime += 900;
          return [];
        },
        async checkpoint() {
          return pacedCheckpoint;
        },
        async saveCheckpoint(c) {
          pacedTime += 2700;
          pacedCheckpoint = c;
        },
      },
      {
        configured: true,
        async page() {
          return { ...page, results: fifty, nextCursor: null };
        },
      },
    );
    for (; attempts < 30; attempts++) {
      try {
        await paced.sync(true);
        break;
      } catch (e) {
        assert.ok(
          e instanceof BridgeError && e.code === "SYNC_PAUSED_REPLAY_PAGE",
        );
      }
    }
    assert.ok(attempts > 0 && attempts < 25);
    assert.equal(pacedRows.size, 50);
    assert.equal((pacedCheckpoint as Checkpoint | null)?.cursor, null);
  } finally {
    Date.now = realNow;
  }
  assert.ok(
    FORMAL_STATE_TITLE_PREFIXES.some((prefix) =>
      "行光外部來源收據-abc".startsWith(prefix),
    ),
  );
  assert.ok(
    FORMAL_STATE_TITLE_PREFIXES.some((prefix) =>
      "行光外部來源游標-abc".startsWith(prefix),
    ),
  );
  const actualExample = JSON.parse(
    readFileSync("docs/fixtures/r2-5c/context-room-response.json", "utf8"),
  );
  const sourceDocument = contextAdapter({
    origin: "https://fixture.invalid",
    secret: "fixture",
    fetch: async () => new Response(JSON.stringify(actualExample)),
  });
  const documented = await sourceDocument.page(
    "1970-01-01T00:00:00.000Z",
    null,
  );
  assert.equal(documented.results[0].occurredAt, "2026-10-01T10:00:00+00:00");
  assert.equal(
    documented.results[0].originalContext?.capturedAt,
    "2026-10-01T10:00:00+00:00",
  );
  console.log(
    "PASS R2-5C executable adapter/service: five modes, quick-retell, deny invalid, UUID, date/context restrictions, microseconds, opaque revisions, restart, overlap/reconciliation, rejection/no checkpoint advance, transient unavailable, allowlist/no full text. Fixture transport; not live cross-site integration.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
