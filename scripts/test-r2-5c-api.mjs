import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { createRequire, Module } from "node:module";
import ts from "typescript";
import { NextRequest } from "next/server.js";
const require = createRequire(import.meta.url),
  cache = new Map(),
  rows = new Map();
const key = "r2-5c-isolated",
  directory = await mkdtemp(join(tmpdir(), "r2-5c-api-"));
process.env.ACCESS_KEY = key;
process.env.LEARNING_WRITE_LOCK_DIR = directory;
let lostReceipt = false;
let writes = 0,
  failRead = false,
  failDaily = false,
  lostEventResponse = false;
const order = [];
const clone = (v) => structuredClone(v);
async function dispatch(title, fn) {
  return load("lib/dojo/learningFoundation/writeOutcome.ts").trackLearningWrite(
    async () => {
      if (failDaily && title.startsWith("行光今日-")) {
        const e = Error("isolated confirmed rejection");
        e.rejected = true;
        throw e;
      }
      const value = fn();
      writes++;
      order.push(title);
      writeFileSync(
        join(directory, "provider-fixture.json"),
        JSON.stringify([...rows]),
      );
      if (
        (lostReceipt && title.startsWith("行光外部來源收據-")) ||
        (lostEventResponse && title.startsWith("行光完成事件-"))
      ) {
        lostEventResponse = false;
        throw Error("isolated committed response lost");
      }
      return value;
    },
    (e) => e.rejected === true,
  );
}
const mutations = {
  createKnowledgeEntry: async (data) =>
    dispatch(data.標題, () => {
      const id = crypto.randomUUID();
      rows.set(id, { id, title: data.標題, value: JSON.parse(data.內容) });
      return { id };
    }),
  updateKnowledgeEntry: async (id, data) =>
    dispatch(data.標題 ?? rows.get(id).title, () => {
      const row = rows.get(id);
      if (!row) throw Error("missing page");
      rows.set(id, {
        id,
        title: data.標題 ?? row.title,
        value: data.內容 ? JSON.parse(data.內容) : row.value,
      });
      return { id };
    }),
  archiveKnowledgeEntry: async (id) =>
    dispatch(rows.get(id).title, () => {
      rows.delete(id);
      return { id };
    }),
};
function matches(row, filter) {
  if (!filter) return true;
  if (filter.and) return filter.and.every((f) => matches(row, f));
  const v = filter.title;
  return v.equals !== undefined
    ? row.title === v.equals
    : v.starts_with !== undefined
      ? row.title.startsWith(v.starts_with)
      : row.title.endsWith(v.ends_with);
}
const query = async (args) => {
  if (failRead) {
    failRead = false;
    throw Error("isolated pre-write read failure");
  }
  const all = [...rows.values()]
    .filter((r) => matches(r, args.filter))
    .sort((a, b) => b.title.localeCompare(a.title));
  const offset = Number(args.start_cursor ?? 0),
    page = all.slice(offset, offset + (args.page_size ?? 100));
  return {
    results: page.map(clone),
    has_more: offset + page.length < all.length,
    next_cursor:
      offset + page.length < all.length ? String(offset + page.length) : null,
  };
};
const queries = {
  mapKnowledge: (p) => ({
    id: p.id,
    標題: p.title,
    內容: JSON.stringify(p.value),
  }),
  findKnowledgeEntryByTitle: async (title) => {
    const result = await query({ filter: { title: { equals: title } } });
    if (result.results.length > 1) throw Error("duplicate title");
    return result.results[0] ? queries.mapKnowledge(result.results[0]) : null;
  },
  listKnowledgeEntriesByPrefix: async (prefix) =>
    (
      await query({
        filter: { title: { starts_with: prefix } },
        page_size: 1000,
      })
    ).results.map(queries.mapKnowledge),
  getKnowledgeEntry: async (id) => {
    if (!rows.has(id)) throw Error("owner/page missing");
    return queries.mapKnowledge(rows.get(id));
  },
};
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file);
  cache.set(file, m);
  m.filename = file;
  m.require = (s) => {
    if (s === "server-only") return {};
    if (s === "@notionhq/client") return { Client: FakeClient };
    if (s === "@/lib/notion/mutations") return mutations;
    if (s === "@/lib/notion/queries") return queries;
    if (s === "@/lib/notion/client")
      return {
        notion: () => ({ dataSources: { query } }),
        withNotionRateLimit: (fn) => fn(),
      };
    if (s === "@/lib/dojo/englishRhythm")
      return { syncVocabForgeWeeklyBingo: async () => ({ summary: {} }) };
    return s.startsWith("@/")
      ? load(resolve(s.slice(2)) + ".ts")
      : s.startsWith(".")
        ? load(resolve(dirname(file), s) + ".ts")
        : require(s);
  };
  m._compile(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
  return m.exports;
}
const request = (method, path, body, auth = true) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth ? { cookie: `dsc_access_key=${key}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const payload = async (response) => ({
  status: response.status,
  body: await response.json(),
});

const sourceId = "00000000-0000-4000-8000-000000000001",
  pageId = "10000000-0000-4000-8000-000000000001";
let parent = "2408cbf8-c394-4d33-927b-df0f2bea0594",
  ackWrites = 0,
  remoteCalls = 0,
  remoteFailure = false,
  notionAck = false;
class FakeClient {
  constructor() {
    this.pages = {
      retrieve: async ({ page_id }) => ({
        id: page_id,
        parent: { type: "data_source_id", data_source_id: parent },
        archived: false,
        in_trash: false,
        properties: {
          sourceEventId: { rich_text: [{ plain_text: sourceId }] },
          syncVersion: { number: 1 },
          行光道場已接收: { checkbox: notionAck },
          行光道場接收日期: {
            date: { start: "2026-09-22T23:59:58.123+08:00" },
          },
        },
      }),
      update: async () => {
        ackWrites++;
        return {};
      },
    };
  }
}
const raw = (id = sourceId, overrides = {}) => ({
  contractVersion: "context-room-practice-results/v1",
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
    projectName: "中文來源",
    unitId: "unit-a",
    unitName: "同一 Unit",
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
  firstAnswer: "PRIVATE FULL ANSWER",
  privateNotes: "PRIVATE NOTES",
  ...overrides,
});
let remoteResults = [raw()];
let nextCursor = null;
const upper = "2026-10-06T02:00:00.000001Z";
const savedFetch = globalThis.fetch;

try {
  const { learningOwner } = load("lib/dojo/learningFoundation/store.ts");
  process.env.CONTEXT_ROOM_RESULTS_ENABLED = "1";
  process.env.CONTEXT_ROOM_RESULTS_OWNER = learningOwner;
  process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET = "isolated-source-secret";
  process.env.CONTEXT_ROOM_NOTION_TOKEN = "isolated-notion-secret";
  globalThis.fetch = async (url, init) => {
    remoteCalls++;
    assert.equal(
      new URL(url).origin,
      "https://lumen-context-room-production-4a2c.up.railway.app",
    );
    assert.equal(init.headers.Authorization, "Bearer isolated-source-secret");
    if (remoteFailure) return new Response("unavailable", { status: 503 });
    return new Response(
      JSON.stringify({
        contractVersion: "context-room-practice-results/v1",
        results: remoteResults,
        nextCursor,
        windowUpper: upper,
        incrementalSemantics:
          "bounded-live-window; inclusive overlapping refresh required",
      }),
    );
  };
  let api = load("app/api/dojo/external-results/route.ts"),
    legacy = load("app/api/dojo/context-room-results/route.ts");
  const post = (b) =>
    api.POST(request("POST", "/api/dojo/external-results", b));
  assert.equal(
    (await api.GET(request("GET", "/api/dojo/external-results", null, false)))
      .status,
    401,
  );
  const cross = new NextRequest("http://localhost/api/dojo/external-results", {
    method: "POST",
    headers: {
      cookie: `dsc_access_key=${key}`,
      origin: "https://attacker.invalid",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "sync" }),
  });
  assert.equal((await api.POST(cross)).status, 403);
  assert.equal((await post({ action: "sync", owner: "other" })).status, 400);
  assert.equal(
    (await post({ action: "sync", url: "https://evil.invalid" })).status,
    400,
  );
  assert.equal(writes, 0);
  assert.equal(remoteCalls, 0);
  const empty = await payload(
    await api.GET(request("GET", "/api/dojo/external-results")),
  );
  assert.equal(empty.body.receipts.length, 0);
  assert.equal(empty.body.checkpoint, null);
  assert.equal(empty.body.sources.vocabForge, "not_connected");
  assert.equal(writes, 0);
  assert.equal(remoteCalls, 0);
  const one = await payload(await post({ action: "sync" }));
  assert.equal(one.status, 200);
  assert.equal(one.body.counted, 0);
  let cached = await payload(
    await api.GET(request("GET", "/api/dojo/external-results")),
  );
  let receipt = cached.body.receipts[0];
  assert.equal(receipt.eventId, null);
  assert.equal(receipt.source.practicedOn, "2026-09-20");
  assert.equal(receipt.source.timeZone, null);
  const json = JSON.stringify(cached);
  for (const privateText of [
    "PRIVATE FULL ANSWER",
    "PRIVATE NOTES",
    "isolated-source-secret",
    "isolated-notion-secret",
  ])
    assert.ok(!json.includes(privateText));
  const afterRead = writes,
    afterRemote = remoteCalls;
  await api.GET(request("GET", "/api/dojo/external-results"));
  assert.equal(writes, afterRead);
  assert.equal(remoteCalls, afterRemote);
  const alias = await payload(await post({ action: "notion-alias", pageId }));
  assert.equal(alias.status, 200);
  assert.equal(alias.body.receipt.id, receipt.id);
  assert.equal(alias.body.receipt.aliases[0].syncVersion, 1);
  assert.equal(
    alias.body.receipt.aliases[0].acknowledgedAt,
    "2026-09-22T23:59:58.123+08:00",
  );
  assert.equal(alias.body.notionAcknowledged, false);
  assert.equal(ackWrites, 0);
  const retryWrites = writes;
  assert.equal((await post({ action: "retry", id: receipt.id })).status, 200);
  assert.equal(writes, retryWrites);
  const legacyId = await payload(
    await legacy.POST(
      request("POST", "/api/dojo/context-room-results", {
        draft: { sourceEventId: sourceId },
      }),
    ),
  );
  assert.equal(legacyId.status, 409);
  assert.equal(
    (
      await legacy.POST(
        request("POST", "/api/dojo/context-room-results", {
          draft: {},
          linkedActivityId: "2026-09-20:0:guess",
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await legacy.POST(
        request("POST", "/api/dojo/context-room-results", {
          notionPageId: pageId,
          draft: { sourceEventId: "forged" },
        }),
      )
    ).status,
    409,
  );
  assert.equal(ackWrites, 0);
  parent = "different-owner-source";
  assert.equal((await post({ action: "notion-alias", pageId })).status, 403);
  await assert.rejects(
    load(
      "lib/dojo/contextRoomNotionInbox.ts",
    ).acknowledgeContextRoomNotionResult({
      notionPageId: pageId,
      sourceEventId: sourceId,
    }),
  );
  assert.equal(ackWrites, 0);
  parent = "2408cbf8-c394-4d33-927b-df0f2bea0594";
  // Restart JS modules + reload persisted provider fixture. Same identity survives.
  const disk = JSON.parse(
    readFileSync(join(directory, "provider-fixture.json"), "utf8"),
  );
  rows.clear();
  for (const [id, row] of disk) rows.set(id, row);
  cache.clear();
  api = load("app/api/dojo/external-results/route.ts");
  await post({ action: "reconcile" });
  cached = await payload(
    await api.GET(request("GET", "/api/dojo/external-results")),
  );
  assert.equal(cached.body.receipts.length, 1);
  assert.equal(cached.body.receipts[0].aliases.length, 1);
  const secondId = "00000000-0000-4000-8000-000000000002";
  remoteResults = [raw(), raw(secondId)];
  await post({ action: "reconcile" });
  cached = await payload(
    await api.GET(request("GET", "/api/dojo/external-results")),
  );
  assert.equal(cached.body.receipts.length, 2);
  // New source revision carries status/current context only; body is untouched.
  rows.set("local-body", {
    id: "local-body",
    title: "行光學習正文-local",
    value: { whatIDid: "LOCAL EVIDENCE", revision: 42 },
  });
  remoteResults = [
    raw(sourceId, {
      sourceRevision: "opaque:new",
      updatedAt: "2026-10-06T01:00:00.000002Z",
      sourceStatus: "archived",
      sourceAvailability: "archived",
      currentContext: {
        projectId: "moved",
        projectName: "改名",
        unitId: "unit-a",
        unitName: "新位置",
      },
    }),
  ];
  assert.equal((await post({ action: "reconcile" })).status, 200);
  remoteResults = [raw()];
  await post({ action: "reconcile" });
  cached = await payload(
    await api.GET(request("GET", "/api/dojo/external-results")),
  );
  receipt = cached.body.receipts.find((r) => r.source.sourceId === sourceId);
  assert.equal(receipt.source.sourceRevision, "opaque:new");
  assert.equal(receipt.source.originalContext, null);
  assert.equal(rows.get("local-body").value.revision, 42);
  remoteFailure = true;
  assert.equal((await post({ action: "sync" })).status, 503);
  cached = await payload(
    await api.GET(request("GET", "/api/dojo/external-results")),
  );
  assert.equal(cached.body.receipts.length, 2);
  assert.equal(cached.body.checkpoint.connection, "temporarily_unavailable");
  assert.ok(cached.body.checkpoint.lastSuccessAt);
  remoteFailure = false;
  remoteResults = [];
  await post({ action: "reconcile" });
  cached = await payload(
    await api.GET(request("GET", "/api/dojo/external-results")),
  );
  assert.equal(cached.body.receipts.length, 2);
  remoteResults = [
    raw(sourceId, {
      sourceRevision: "opaque:deleted",
      updatedAt: "2026-10-06T01:00:00.000003Z",
      sourceStatus: "missing",
      sourceAvailability: "deleted",
      sourceLocation: null,
      completionStatus: "withdrawn",
    }),
  ];
  await post({ action: "reconcile" });
  cached = await payload(
    await api.GET(request("GET", "/api/dojo/external-results")),
  );
  receipt = cached.body.receipts.find((r) => r.source.sourceId === sourceId);
  assert.equal(receipt.source.sourceAvailability, "deleted");
  assert.ok(receipt.reasons.includes("SOURCE_WITHDRAWN"));
  assert.equal(receipt.source.sourceLocation, null);
  const receiptRow = [...rows.values()].find((r) =>
    r.title.startsWith("行光外部來源收據-"),
  );
  const owner = receiptRow.value.owner;
  receiptRow.value.owner = "forged-owner";
  assert.equal(
    (await api.GET(request("GET", "/api/dojo/external-results"))).status,
    403,
  );
  receiptRow.value.owner = owner;
  assert.equal(
    [...rows.values()].filter((r) => r.title.startsWith("行光完成事件-"))
      .length,
    0,
  );
  assert.equal(
    [...rows.values()].filter(
      (r) => r.title.startsWith("行光今日-") || r.title.startsWith("行光週盤-"),
    ).length,
    0,
  );

  legacy = load("app/api/dojo/context-room-results/route.ts");
  const manualDraft = {
    sourceEventId: null,
    materialTitle: "隔離手動摘要",
    batchLabel: "",
    topicLabel: "重述",
    topicPosition: 1,
    practiceMode: "quick_retell",
    contextRoomStatus: "Responded",
    firstCompleted: true,
    secondTakeCompleted: false,
    expressionCount: 1,
    focus: "",
    practicedOn: "2026-09-20",
    rawSummary: "手動卡",
  };
  const manual = await payload(
    await legacy.POST(
      request("POST", "/api/dojo/context-room-results", { draft: manualDraft }),
    ),
  );
  assert.equal(manual.status, 201);
  assert.equal(manual.body.result.sourceEventId, null);
  assert.equal(manual.body.result.linkedActivityId, null);
  const manualAgain = await payload(
    await legacy.POST(
      request("POST", "/api/dojo/context-room-results", { draft: manualDraft }),
    ),
  );
  assert.equal(manualAgain.status, 200);
  assert.equal(manualAgain.body.result.id, manual.body.result.id);
  assert.equal(manualAgain.body.duplicate, true);
  assert.equal(
    [...rows.values()].filter((r) => r.title.startsWith("行光完成事件-"))
      .length,
    0,
  );
  // Unknown committed receipt create retains fsynced intent and shared mutex.
  remoteResults = [raw("00000000-0000-4000-8000-000000000003")];
  lostEventResponse = true;
  // Dispatch stub distinguishes an external receipt from the older R2-3 event.
  lostReceipt = true;
  const unknown = await payload(await post({ action: "reconcile" }));
  assert.equal(unknown.status, 503);
  assert.equal(unknown.body.code, "STORAGE_UNAVAILABLE_OR_UNKNOWN_OUTCOME");
  assert.ok((await readdir(directory)).includes("learning-writer.lock"));
  assert.ok((await readdir(directory)).some((f) => f.endsWith(".intent")));
  const blocked = writes;
  assert.equal((await post({ action: "sync" })).status, 409);
  assert.equal(writes, blocked);
  console.log(
    "PASS R2-5C actual handler + store + writer/intent using disk-backed isolated Notion transport fixture: owner/origin, no source claims, API/Notion UUID dedup across restart, no counts/ack while pending, cache GET no writes/no fetch/private text, new session, opaque newer/older revisions, local body preserved, archived/deleted/withdrawn vs 503/empty, ambiguous create retains mutex/intent. Real cross-site integration SKIPPED.",
  );
} finally {
  globalThis.fetch = savedFetch;
  await rm(directory, { recursive: true, force: true });
  for (const k of [
    "ACCESS_KEY",
    "LEARNING_WRITE_LOCK_DIR",
    "CONTEXT_ROOM_RESULTS_ENABLED",
    "CONTEXT_ROOM_RESULTS_OWNER",
    "LUMEN_CONTEXT_ROOM_SYNC_SECRET",
    "CONTEXT_ROOM_NOTION_TOKEN",
  ])
    delete process.env[k];
}
