// Execute the real route handlers and weekly/capture writers against isolated Notion IO.
// This is an adapter test, not a live Notion integration test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { createRequire, Module } from "node:module";
import ts from "typescript";
import { NextRequest } from "next/server.js";
const require = createRequire(import.meta.url);
const root = resolve(".");
const modules = new Map();
const rows = new Map();
let writes = 0;
let readFailure = false;
let writeFailure = null;
let failWriteNumber = null;
let writeAttempts = 0;
let realClientMode = false;
let transportFailure = false;
let transportCalls = 0;
let transportRejection = false;
function checkRead() {
  if (readFailure) {
    readFailure = false;
    throw new Error("isolated Notion read unavailable");
  }
}
async function send(write) {
  return load("lib/dojo/learningFoundation/writeOutcome.ts").trackLearningWrite(
    async () => {
      writeAttempts++;
      const result = await write();
      if (
        writeFailure &&
        (failWriteNumber === null || writeAttempts === failWriteNumber)
      ) {
        const message = writeFailure;
        writeFailure = null;
        throw new (load("lib/dojo/learningFoundation/model.ts").LearningError)(
          message,
          503,
        );
      }
      return result;
    },
  );
}
const key = "r2-1-isolated-test";
const lockRoot = await mkdtemp(join(tmpdir(), "r2-api-"));
process.env.ACCESS_KEY = key;
process.env.LEARNING_WRITE_LOCK_DIR = lockRoot;
let retrievedPage = null;
const clone = (value) => JSON.parse(JSON.stringify(value));
const io = {
  listJsonRecords: async (prefix) => {
    checkRead();
    return [...rows.values()]
      .filter((row) => row.title.startsWith(prefix))
      .map(clone);
  },
  readJsonRecord: async (title) => {
    checkRead();
    return clone([...rows.values()].find((row) => row.title === title) ?? null);
  },
  upsertJsonRecord: async (title, value) =>
    send(async () => {
      const old = [...rows.values()].find((row) => row.title === title);
      const id = old?.id ?? crypto.randomUUID();
      rows.set(id, { id, title, value: clone(value) });
      writes++;
      return { id, created: !old };
    }),
  updateJsonRecordById: async (id, prefix, title, value) =>
    send(async () => {
      if (!rows.get(id)?.title.startsWith(prefix))
        throw new Error("invalid page");
      rows.set(id, { id, title, value: clone(value) });
      writes++;
    }),
  archiveJsonRecordById: async (id) =>
    send(async () => {
      rows.delete(id);
      writes++;
    }),
};
const notionMutation = {
  createKnowledgeEntry: async ({ 標題: title, 內容: content }) =>
    send(async () => {
      const id = crypto.randomUUID();
      rows.set(id, { id, title, value: JSON.parse(content) });
      writes++;
      return { id };
    }),
  createTraceEntry: async () => send(async () => ({ id: crypto.randomUUID() })),
};
function load(filename) {
  filename = resolve(filename);
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = new Module(filename);
  modules.set(filename, compiledModule);
  compiledModule.filename = filename;
  compiledModule.require = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier === "@notionhq/client" && realClientMode) {
      const sdk = require(specifier);
      return {
        ...sdk,
        Client: class extends sdk.Client {
          constructor(options) {
            super({
              ...options,
              fetch: async () => {
                transportCalls++;
                if (transportFailure) throw new Error("response lost");
                return new Response(
                  JSON.stringify(
                    transportRejection
                      ? {
                          object: "error",
                          status: 400,
                          code: "validation_error",
                          message: "isolated invalid input",
                          request_id: "isolated-request",
                        }
                      : { object: "page", id: crypto.randomUUID() },
                  ),
                  {
                    status: transportRejection ? 400 : 200,
                    headers: { "content-type": "application/json" },
                  },
                );
              },
            });
          }
        },
      };
    }
    const path = specifier.startsWith("@/")
      ? resolve(root, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(filename), specifier)
        : null;
    if (path === resolve(root, "lib/dojo/notionStore")) return io;
    if (path === resolve(root, "lib/notion/mutations")) return notionMutation;
    if (path === resolve(root, "lib/notion/queries"))
      return {
        getKnowledgeEntry: async (id) => {
          checkRead();
          const row = rows.get(id);
          if (!row) throw new Error("missing");
          return { id, 標題: row.title, 內容: JSON.stringify(row.value) };
        },
      };
    if (path === resolve(root, "lib/notion/client") && !realClientMode)
      return {
        notion: () => ({ pages: { retrieve: async () => retrievedPage } }),
        withNotionRateLimit: async (fn) => fn(),
      };
    if (path) return load(`${path}.ts`);
    return require(specifier);
  };
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  compiledModule._compile(source, filename);
  return compiledModule.exports;
}
const request = (
  path,
  method = "GET",
  body,
  authorized = true,
  origin = "http://localhost",
) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      ...(authorized ? { cookie: `dsc_access_key=${key}` } : {}),
      ...(method !== "GET"
        ? { "content-type": "application/json", origin }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const foundation = load("app/api/dojo/learning/foundation/route.ts");
const learning = load("app/api/dojo/learning/route.ts");
const captures = load("app/api/dojo/captures/route.ts");
const formal = load("lib/dojo/formal.ts");
const learningDomain = load("lib/dojo/learning.ts");
const weekly = load("lib/dojo/learningStore.ts");
try {
  readFailure = true;
  const firstReadFailure = await foundation.POST(
    request("/api/dojo/learning/foundation", "POST", { action: "initialize" }),
  );
  assert.equal(writes, 0);
  const lockAfterReadFailure = (await readdir(lockRoot)).includes(
    "learning-writer.lock",
  );
  const retryAfterReadFailure = await foundation.POST(
    request("/api/dojo/learning/foundation", "POST", {
      action: "create",
      kind: "item",
      input: { name: "read retry" },
    }),
  );
  console.log(
    JSON.stringify({
      reproduction: "pre-write read failure",
      first: firstReadFailure.status,
      writesBeforeRetry: 0,
      lockAfterReadFailure,
      retry: retryAfterReadFailure.status,
      writes,
      lockPresent: (await readdir(lockRoot)).includes("learning-writer.lock"),
    }),
  );
  assert.equal(firstReadFailure.status, 503);
  assert.equal(retryAfterReadFailure.status, 201);
  rows.clear();
  writes = 0;
  for (const [method, body] of [
    ["GET"],
    ["POST", { action: "initialize" }],
    [
      "PATCH",
      { id: crypto.randomUUID(), revision: 1, input: { name: "denied" } },
    ],
  ]) {
    const response = await foundation[method](
      request("/api/dojo/learning/foundation", method, body, false),
    );
    assert.equal(response.status, 401);
  }
  assert.equal(writes, 0);
  assert.equal(
    (
      await foundation.POST(
        request(
          "/api/dojo/learning/foundation",
          "POST",
          { action: "initialize" },
          true,
          "https://foreign.example",
        ),
      )
    ).status,
    403,
  );
  const get = await foundation.GET(request("/api/dojo/learning/foundation"));
  assert.equal(get.status, 200);
  assert.equal(writes, 0);
  console.log(
    "PASS real foundation handlers reject missing auth/cross-origin writes; GET writes nothing",
  );
  const init = await foundation.POST(
    request("/api/dojo/learning/foundation", "POST", { action: "initialize" }),
  );
  assert.equal(init.status, 200);
  const snapshot = await init.json();
  assert.equal(snapshot.entities.length, 9);
  const writeCount = writes;
  assert.equal(
    (
      await foundation.POST(
        request("/api/dojo/learning/foundation", "POST", {
          action: "initialize",
        }),
      )
    ).status,
    200,
  );
  assert.equal(writes, writeCount);
  const psychology = snapshot.entities.find((e) => e.seedKey === "psychology");
  const english = snapshot.entities.find((e) => e.legacyKey === "english");
  const custom = await foundation.POST(
    request("/api/dojo/learning/foundation", "POST", {
      action: "create",
      kind: "item",
      owner: "forged-owner",
      input: { name: "自訂項目", owner: "forged-owner", revision: 99 },
    }),
  );
  const customData = await custom.json();
  assert.equal(custom.status, 201);
  assert.equal(customData.entity.owner, psychology.owner);
  assert.equal(customData.entity.revision, 1);
  const edit = await foundation.PATCH(
    request("/api/dojo/learning/foundation", "PATCH", {
      id: psychology.id,
      revision: 1,
      input: { name: "心理學新名稱" },
    }),
  );
  assert.equal(edit.status, 200);
  assert.equal(
    (
      await foundation.PATCH(
        request("/api/dojo/learning/foundation", "PATCH", {
          id: psychology.id,
          revision: 1,
          input: { name: "stale" },
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await foundation.PATCH(
        request("/api/dojo/learning/foundation", "PATCH", {
          id: crypto.randomUUID(),
          revision: 1,
          input: { name: "foreign" },
        }),
      )
    ).status,
    403,
  );
  console.log(
    "PASS real initialize/create/edit API persists nine/custom items and ignores caller ownership/revision",
  );
  const legacy = learningDomain.defaultLearningTrack("english");
  legacy.updatedAt = "2026-09-01T00:00:00.000Z";
  await io.upsertJsonRecord(learningDomain.learningRecordTitle("english"), {
    ...legacy,
    stages: [{ id: "legacy-extension" }],
    focusIds: [psychology.id],
  });
  const board = formal.emptyWeeklyBoard("2026-09-28");
  const cell = board.cells[0];
  cell.learning = {
    trackKey: "english",
    templateKey: "isolated-test",
    skill: "口說",
  };
  cell.completion = { ...cell.completion, progress: 1, target: 1, unit: "次" };
  await weekly.syncLearningActivity({ weekStart: board.weekStart, cell });
  const weeklyRow = await io.readJsonRecord(
    learningDomain.learningRecordTitle("english"),
  );
  assert.equal(weeklyRow.value.activityLog.length, 1);
  assert.deepEqual(weeklyRow.value.stages, [{ id: "legacy-extension" }]);
  assert.deepEqual(weeklyRow.value.focusIds, [psychology.id]);
  assert.equal(
    (await foundation.GET(request("/api/dojo/learning/foundation"))).status,
    200,
  );
  assert.equal(
    (
      await learning.PATCH(
        request("/api/dojo/learning", "PATCH", {
          key: "english",
          track: legacy,
        }),
      )
    ).status,
    409,
  );
  const nextTrack = { ...weeklyRow.value, goal: "edited" };
  assert.equal(
    (
      await learning.PATCH(
        request("/api/dojo/learning", "PATCH", {
          key: "english",
          track: nextTrack,
        }),
      )
    ).status,
    200,
  );
  const merged = await io.readJsonRecord(
    learningDomain.learningRecordTitle("english"),
  );
  assert.equal(merged.value.activityLog.length, 1);
  assert.deepEqual(merged.value.stages, weeklyRow.value.stages);
  console.log(
    "PASS actual weekly writer keeps extensions/foundation records; stale legacy API rejected, current edit preserves log",
  );
  const created = await captures.POST(
    request("/api/dojo/captures", "POST", {
      title: "隔離心理學素材",
      learningItemIds: [crypto.randomUUID()],
    }),
  );
  assert.equal(created.status, 201);
  let capture = (await created.json()).capture;
  assert.deepEqual(capture.learningItemIds, []);
  const linked = await captures.PATCH(
    request("/api/dojo/captures", "PATCH", {
      id: capture.id,
      capture: {
        ...capture,
        learningItemIds: [psychology.id, english.id],
        learningTracks: ["english"],
      },
    }),
  );
  assert.equal(linked.status, 200);
  capture = (await linked.json()).capture;
  const oldForm = clone(capture);
  delete oldForm.learningItemIds;
  oldForm.note = "舊表單其他編輯";
  const saved = await captures.PATCH(
    request("/api/dojo/captures", "PATCH", {
      id: capture.id,
      capture: oldForm,
    }),
  );
  assert.equal(saved.status, 200);
  const safe = (await saved.json()).capture;
  assert.ok(safe.learningItemIds.includes(psychology.id));
  const stale = await captures.PATCH(
    request("/api/dojo/captures", "PATCH", {
      id: capture.id,
      capture: oldForm,
    }),
  );
  assert.equal(stale.status, 409);
  const foreign = await captures.PATCH(
    request("/api/dojo/captures", "PATCH", {
      id: safe.id,
      capture: { ...safe, learningItemIds: [crypto.randomUUID()] },
    }),
  );
  assert.equal(foreign.status, 403);
  assert.equal(
    (await captures.GET(request("/api/dojo/captures", "GET", undefined, false)))
      .status,
    401,
  );
  const refreshed = (
    await (await captures.GET(request("/api/dojo/captures"))).json()
  ).captures.find((e) => e.id === safe.id);
  assert.ok(refreshed.learningItemIds.includes(psychology.id));
  console.log(
    "PASS actual capture route/store roundtrip, old UI safe merge, stale version and unauthorized relations rejected",
  );
  const entries = load("app/api/dojo/entries/route.ts");
  assert.equal(
    (
      await entries.POST(
        request("/api/dojo/entries", "POST", {
          title: "foreign",
          learningItemId: crypto.randomUUID(),
        }),
      )
    ).status,
    403,
  );
  const entryResponse = await entries.POST(
    request("/api/dojo/entries", "POST", {
      title: "學習紀錄",
      kind: "學習／心理學",
      learningItemId: psychology.id,
      privacy: "私人",
    }),
  );
  assert.equal(entryResponse.status, 201);
  const entry = (await entryResponse.json()).entry;
  assert.equal(entry.learningItemId, psychology.id);
  const oldEntry = clone(entry);
  delete oldEntry.learningItemId;
  const editedEntry = await entries.PATCH(
    request("/api/dojo/entries", "PATCH", { id: entry.id, entry: oldEntry }),
  );
  assert.equal(editedEntry.status, 200);
  assert.equal((await editedEntry.json()).entry.learningItemId, psychology.id);
  console.log(
    "PASS new practice records use stable ID metadata; old entry form preserves it",
  );
  const queries = load("lib/notion/queries.ts");
  retrievedPage = {
    id: crypto.randomUUID(),
    parent: { type: "data_source_id", data_source_id: psychology.owner },
    properties: {},
    archived: false,
    in_trash: false,
  };
  assert.equal(
    (await queries.getKnowledgeEntry(retrievedPage.id)).id,
    retrievedPage.id,
  );
  retrievedPage = {
    ...retrievedPage,
    parent: { type: "data_source_id", data_source_id: crypto.randomUUID() },
  };
  await assert.rejects(
    queries.getKnowledgeEntry(retrievedPage.id),
    /非本擁有者/,
  );
  retrievedPage = {
    ...retrievedPage,
    parent: { type: "data_source_id", data_source_id: psychology.owner },
    archived: true,
  };
  await assert.rejects(
    queries.getKnowledgeEntry(retrievedPage.id),
    /非本擁有者/,
  );
  console.log(
    "PASS actual Notion parent-data-source guard rejects foreign/archived pages",
  );
  // Test the actual service/store adapters sharing the mutex. Temp-only recovery
  // below simulates an operator reconciliation and must never run on production.
  const lockPresent = async () =>
    (await readdir(process.env.LEARNING_WRITE_LOCK_DIR)).includes(
      "learning-writer.lock",
    );
  const createRequest = () =>
    foundation.POST(
      request("/api/dojo/learning/foundation", "POST", {
        action: "create",
        kind: "item",
        input: { name: "isolated retry" },
      }),
    );
  for (const [label, operation] of [
    ["foundation create", () => createRequest()],
    [
      "foundation edit",
      () =>
        foundation.PATCH(
          request("/api/dojo/learning/foundation", "PATCH", {
            id: psychology.id,
            revision: 2,
            input: { name: "read failure" },
          }),
        ),
    ],
    [
      "legacy editor",
      () =>
        learning.PATCH(
          request("/api/dojo/learning", "PATCH", {
            key: "english",
            track: merged.value,
          }),
        ),
    ],
    [
      "capture updater",
      () =>
        captures.PATCH(
          request("/api/dojo/captures", "PATCH", {
            id: safe.id,
            capture: refreshed,
          }),
        ),
    ],
    [
      "activity writer",
      () => weekly.syncLearningActivity({ weekStart: board.weekStart, cell }),
    ],
    [
      "entry POST",
      () =>
        entries.POST(
          request("/api/dojo/entries", "POST", {
            title: "read failure",
            learningItemId: psychology.id,
            privacy: "私人",
          }),
        ),
    ],
    [
      "entry PATCH",
      () =>
        entries.PATCH(
          request("/api/dojo/entries", "PATCH", {
            id: entry.id,
            entry: oldEntry,
          }),
        ),
    ],
  ]) {
    readFailure = true;
    const count = writes;
    try {
      const response = await operation();
      assert.equal(response.status, 503);
    } catch (error) {
      assert.match(error.message, /讀取／驗證失敗/);
    }
    assert.equal(writes, count, label);
    assert.equal(await lockPresent(), false, label);
    assert.equal((await createRequest()).status, 201, label);
    console.log(
      `PASS ${label}: safe read failure releases shared lock and next writer succeeds`,
    );
  }
  const currentPsychology = (
    await (
      await foundation.GET(request("/api/dojo/learning/foundation"))
    ).json()
  ).entities.find((e) => e.id === psychology.id);
  for (const body of [
    { id: psychology.id, revision: 1, input: { name: "stale forbidden" } },
    {
      id: psychology.id,
      revision: currentPsychology.revision,
      input: { name: "" },
    },
  ]) {
    const before = clone([...rows.entries()]);
    const count = writes;
    const response = await foundation.PATCH(
      request("/api/dojo/learning/foundation", "PATCH", body),
    );
    assert.ok([400, 409].includes(response.status));
    assert.equal(writes, count);
    assert.deepEqual([...rows.entries()], before);
    assert.equal(await lockPresent(), false);
  }
  const actualJsonAdapter = load("lib/dojo/notionStore.ts");
  readFailure = true;
  const lockModule = load("lib/dojo/learningFoundation/fileLock.ts");
  const countBeforeAdapter = writes;
  await assert.rejects(
    lockModule.withLearningWriteLock(() =>
      actualJsonAdapter.updateJsonRecordById(
        entry.id,
        formal.ENTRY_TITLE_PREFIX,
        "unchanged",
        {},
      ),
    ),
    /讀取／驗證失敗/,
  );
  assert.equal(writes, countBeforeAdapter);
  assert.equal(await lockPresent(), false);
  console.log(
    "PASS invalid input/stale revision preserves data; actual JSON adapter preflight read is not a write",
  );
  const isolatedRows = clone([...rows.entries()]);
  let testRoot = await mkdtemp(join(tmpdir(), "r2-partial-"));
  process.env.LEARNING_WRITE_LOCK_DIR = testRoot;
  rows.clear();
  writeAttempts = 0;
  // Two acknowledged creates; next legacy read fails before dispatching a create.
  const originalLegacyRead = io.listJsonRecords;
  let readCount = 0;
  io.listJsonRecords = async (prefix) => {
    if (++readCount === 4)
      throw new Error("partial init subsequent read failed");
    return originalLegacyRead(prefix);
  };
  let result = await foundation.POST(
    request("/api/dojo/learning/foundation", "POST", { action: "initialize" }),
  );
  assert.equal(result.status, 503);
  assert.equal(rows.size, 2);
  assert.equal(await lockPresent(), false);
  io.listJsonRecords = originalLegacyRead;
  result = await foundation.POST(
    request("/api/dojo/learning/foundation", "POST", { action: "initialize" }),
  );
  assert.equal(result.status, 200);
  assert.equal(rows.size, 9);
  assert.equal(writeAttempts, 9);
  console.log(
    "PASS partial acknowledged initialization + subsequent read failure retries without duplicate creates",
  );
  await rm(testRoot, { recursive: true, force: true });
  testRoot = await mkdtemp(join(tmpdir(), "r2-partial-unknown-"));
  process.env.LEARNING_WRITE_LOCK_DIR = testRoot;
  rows.clear();
  writeAttempts = 0;
  writeFailure = "lost create response";
  failWriteNumber = 3;
  result = await foundation.POST(
    request("/api/dojo/learning/foundation", "POST", { action: "initialize" }),
  );
  assert.equal(result.status, 503);
  assert.equal(rows.size, 3);
  assert.equal(await lockPresent(), true);
  assert.equal((await createRequest()).status, 409);
  assert.equal(writeAttempts, 3);
  const ambiguousRow = [...rows.values()][2];
  rows.delete(ambiguousRow.id); // simulate temporarily invisible row
  await rm(join(testRoot, "learning-writer.lock"), { recursive: true }); // isolated, explicit reconciliation only
  result = await foundation.POST(
    request("/api/dojo/learning/foundation", "POST", { action: "initialize" }),
  );
  assert.equal(result.status, 409);
  assert.equal(writeAttempts, 3);
  rows.set(ambiguousRow.id, ambiguousRow); // operator confirmed original create
  result = await foundation.POST(
    request("/api/dojo/learning/foundation", "POST", { action: "initialize" }),
  );
  assert.equal(result.status, 200);
  assert.equal(rows.size, 9);
  assert.equal(writeAttempts, 9);
  console.log(
    "PASS partial unknown initialization keeps mutex/intent, invisible row cannot trigger recreate; reconciled row reused",
  );
  await rm(testRoot, { recursive: true, force: true });
  process.env.LEARNING_WRITE_LOCK_DIR = lockRoot;
  rows.clear();
  for (const [id, row] of isolatedRows) rows.set(id, row);
  for (const [label, operation] of [
    [
      "capture",
      () =>
        captures.PATCH(
          request("/api/dojo/captures", "PATCH", {
            id: safe.id,
            capture: refreshed,
          }),
        ),
    ],
    [
      "activity",
      () => weekly.syncLearningActivity({ weekStart: board.weekStart, cell }),
    ],
    [
      "entry PATCH",
      () =>
        entries.PATCH(
          request("/api/dojo/entries", "PATCH", {
            id: entry.id,
            entry: oldEntry,
          }),
        ),
    ],
    [
      "entry POST swallowed trace",
      () =>
        entries.POST(
          request("/api/dojo/entries", "POST", {
            title: "trace unknown",
            privacy: "公開",
          }),
        ),
    ],
  ]) {
    writeFailure = "lost response";
    writeAttempts = 0;
    failWriteNumber = label.includes("trace") ? 2 : 1;
    try {
      const response = await operation();
      assert.equal(response.status, 503, label);
    } catch (error) {
      assert.match(error.message, /結果未確認/);
    }
    assert.equal(await lockPresent(), true, label);
    assert.equal((await createRequest()).status, 409, label);
    assert.equal(writeAttempts, failWriteNumber, label);
    await rm(join(lockRoot, "learning-writer.lock"), { recursive: true });
    console.log(
      `PASS ${label}: ambiguous write stays blocked, including caught trace errors`,
    );
  }
  // Real Notion client + real SDK, injected fetch only; no remote calls or credentials.
  realClientMode = true;
  process.env.NOTION_TOKEN = "isolated-fake-token";
  const realClient = load("lib/notion/client.ts");
  const { withLearningWriteLock } = load(
    "lib/dojo/learningFoundation/fileLock.ts",
  );
  transportCalls = 0;
  await withLearningWriteLock(() =>
    realClient.withNotionRateLimit(() =>
      realClient.notion().pages.create({
        parent: { page_id: crypto.randomUUID() },
        properties: {},
      }),
    ),
  );
  assert.equal(transportCalls, 1);
  assert.equal(await lockPresent(), false);
  transportRejection = true;
  transportCalls = 0;
  await assert.rejects(
    withLearningWriteLock(() =>
      realClient.withNotionRateLimit(() =>
        realClient
          .notion()
          .pages.update({ page_id: crypto.randomUUID(), properties: {} }),
      ),
    ),
    /讀取／驗證失敗/,
  );
  assert.equal(transportCalls, 1);
  assert.equal(await lockPresent(), false);
  transportRejection = false;
  console.log(
    "PASS explicit Notion HTTP rejection with matching response evidence releases mutex without retry",
  );
  transportFailure = true;
  transportCalls = 0;
  await assert.rejects(
    withLearningWriteLock(async () => {
      try {
        await realClient.withNotionRateLimit(() =>
          realClient.notion().pages.create({
            parent: { page_id: crypto.randomUUID() },
            properties: {},
          }),
        );
      } catch {
        /* deliberate swallowed error */
      }
    }),
    /結果未確認/,
  );
  assert.equal(transportCalls, 1);
  assert.equal(await lockPresent(), true);
  await rm(join(lockRoot, "learning-writer.lock"), { recursive: true });
  transportFailure = false;
  console.log(
    "PASS actual Notion client SDK transport: confirmed request releases; lost response is sent once, swallowed error retains mutex",
  );
  delete process.env.LEARNING_WRITE_LOCK_DIR;
  assert.equal(
    (
      await foundation.POST(
        request("/api/dojo/learning/foundation", "POST", {
          action: "create",
          kind: "item",
          input: { name: "blocked" },
        }),
      )
    ).status,
    503,
  );
  console.log("PASS missing write-lock configuration fails closed");
} finally {
  await rm(lockRoot, { recursive: true, force: true });
}
