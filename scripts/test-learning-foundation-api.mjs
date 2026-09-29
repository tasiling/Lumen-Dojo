// Execute the real route handlers and weekly/capture writers against isolated Notion IO.
// This is an adapter test, not a live Notion integration test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
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
const key = "r2-1-isolated-test";
const lockRoot = await mkdtemp(join(tmpdir(), "r2-api-"));
process.env.ACCESS_KEY = key;
process.env.LEARNING_WRITE_LOCK_DIR = lockRoot;
let retrievedPage = null;
const clone = (value) => JSON.parse(JSON.stringify(value));
const io = {
  listJsonRecords: async (prefix) =>
    [...rows.values()].filter((row) => row.title.startsWith(prefix)).map(clone),
  readJsonRecord: async (title) =>
    clone([...rows.values()].find((row) => row.title === title) ?? null),
  upsertJsonRecord: async (title, value) => {
    const old = [...rows.values()].find((row) => row.title === title);
    const id = old?.id ?? crypto.randomUUID();
    rows.set(id, { id, title, value: clone(value) });
    writes++;
    return { id, created: !old };
  },
  updateJsonRecordById: async (id, prefix, title, value) => {
    if (!rows.get(id)?.title.startsWith(prefix))
      throw new Error("invalid page");
    rows.set(id, { id, title, value: clone(value) });
    writes++;
  },
  archiveJsonRecordById: async (id) => {
    rows.delete(id);
    writes++;
  },
};
const notionMutation = {
  createKnowledgeEntry: async ({ 標題: title, 內容: content }) => {
    const id = crypto.randomUUID();
    rows.set(id, { id, title, value: JSON.parse(content) });
    writes++;
    return { id };
  },
};
function load(filename) {
  filename = resolve(filename);
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = new Module(filename);
  modules.set(filename, compiledModule);
  compiledModule.filename = filename;
  compiledModule.require = (specifier) => {
    if (specifier === "server-only") return {};
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
          const row = rows.get(id);
          if (!row) throw new Error("missing");
          return { id, 標題: row.title, 內容: JSON.stringify(row.value) };
        },
      };
    if (path === resolve(root, "lib/notion/client"))
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
