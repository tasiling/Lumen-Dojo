// Real Next handlers, persistence, Notion SDK, and filesystem lock; only fetch is isolated.
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@notionhq/client";
import * as sdk from "@notionhq/client";
import { NextRequest } from "next/server.js";
import { loader } from "./weaving-test-harness.mjs";

const directory = await mkdtemp(join(tmpdir(), "dojo-evening-"));
const originalEnv = Object.fromEntries(["ACCESS_KEY", "NOTION_TOKEN", "LEARNING_WRITE_LOCK_DIR"].map(key => [key, process.env[key]]));
process.env.ACCESS_KEY = "isolated-evening-owner";
process.env.NOTION_TOKEN = "isolated-notion-token";
process.env.LEARNING_WRITE_LOCK_DIR = directory;
const pages = new Map();
let writes = 0;
let loseResponse = false;
let pauseQuery = null;
const json = value => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const plainText = properties => Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, {
  ...value,
  ...(value.title ? { title: value.title.map(item => ({ ...item, plain_text: item.text.content })) } : {}),
  ...(value.rich_text ? { rich_text: value.rich_text.map(item => ({ ...item, plain_text: item.text.content })) } : {}),
}]));
const text = (page, property, type) => (page.properties[property]?.[type] ?? []).map(item => item.plain_text).join("");
async function transport(url, options) {
  const path = new URL(url).pathname;
  const body = JSON.parse(options.body ?? "{}");
  if (path.endsWith("/query")) {
    if (pauseQuery) {
      const pause = pauseQuery;
      pauseQuery = null;
      pause.entered();
      await pause.wait;
    }
    const filter = body.filter?.title;
    assert.ok(filter, "test transport only accepts explicit title queries");
    const results = [...pages.values()].filter(page => {
      const title = text(page, "標題", "title");
      return filter.equals !== undefined ? title === filter.equals : title.startsWith(filter.starts_with);
    });
    return json({ object: "list", results, has_more: false, next_cursor: null });
  }
  assert.ok(path.startsWith("/v1/pages"), `unexpected SDK request: ${path}`);
  assert.ok(["POST", "PATCH"].includes(options.method));
  const id = options.method === "POST" ? crypto.randomUUID() : path.split("/").at(-1);
  const old = pages.get(id);
  const page = { object: "page", id, parent: old?.parent ?? body.parent, properties: { ...old?.properties, ...plainText(body.properties) } };
  pages.set(id, page);
  writes++;
  if (loseResponse) {
    loseResponse = false;
    throw Error("isolated committed mutation response lost");
  }
  return json(page);
}
const load = loader({
  "@notionhq/client": { ...sdk, Client: class extends Client {
    constructor(options) { super({ ...options, fetch: transport, logger: () => {} }); }
  } },
});
const daily = load("app/api/dojo/daily/route.ts");
const evening = load("app/api/dojo/evening/route.ts");
const formal = load("lib/dojo/formal.ts");
const store = load("lib/dojo/notionStore.ts");
const date = "2026-10-19";
const title = formal.dailyRecordTitle(date);
const request = (method, path, body, auth = true, origin = "http://localhost") => new NextRequest(`http://localhost${path}`, {
  method,
  headers: { "content-type": "application/json", origin, ...(auth ? { cookie: `dsc_access_key=${process.env.ACCESS_KEY}` } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const read = async () => {
  const response = await daily.GET(request("GET", `/api/dojo/daily?date=${date}`));
  assert.equal(response.status, 200);
  return (await response.json()).record;
};
const close = (record, extra = {}) => evening.POST(request("POST", "/api/dojo/evening", { date, record, ...extra }));
const savedValue = () => JSON.parse(text([...pages.values()].find(page => text(page, "標題", "title") === title), "內容", "rich_text"));
const seed = async () => {
  const record = formal.emptyDailyRecord(date);
  record.updatedAt = "2026-10-19T00:00:00.000Z";
  await store.upsertJsonRecord(title, record);
  return record;
};
beforeEach(async () => {
  pages.clear(); writes = 0; loseResponse = false; pauseQuery = null;
  for (const name of await readdir(directory)) await rm(join(directory, name), { recursive: true, force: true });
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("stale closing tab cannot overwrite a newer morning, task, or day log", async () => {
  await seed();
  const staleTab = await read();
  const activeTab = await read();
  activeTab.morning.intention = "new morning intention";
  activeTab.tasks.important.text = "new task";
  activeTab.daytime.logs.push({ id: "new-log", text: "new day log", time: "12:00", createdAt: "2026-10-19T04:00:00.000Z" });
  const update = await daily.PUT(request("PUT", "/api/dojo/daily", { date, record: activeTab }));
  assert.equal(update.status, 200);
  const latest = savedValue();
  const before = writes;
  staleTab.evening.disposition = "pause";
  const response = await close(staleTab, { overwrite: true });
  assert.equal(response.status, 409);
  assert.equal(writes, before);
  assert.deepEqual(savedValue(), latest);
});

test("an existing record requires a nonempty matching raw revision", async () => {
  await seed();
  for (const revision of [undefined, null, "", "stale"]) {
    const record = await read();
    record.updatedAt = revision;
    record.evening.disposition = "pause";
    const before = writes;
    assert.equal((await close(record)).status, 409);
    assert.equal(writes, before);
  }
});

test("close checks the revision while holding the same lock as daily PUT", async () => {
  await seed();
  const record = await read();
  record.evening.disposition = "pause";
  let entered;
  let release;
  const queryEntered = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  pauseQuery = { entered, wait };
  const closing = close(record);
  await queryEntered;
  let competing;
  try {
    competing = await daily.PUT(request("PUT", "/api/dojo/daily", { date, record: { ...record, morning: { ...record.morning, intention: "competing writer" } } }));
  } finally { release(); }
  const closed = await closing;
  assert.equal(competing.status, 409);
  assert.equal(closed.status, 200);
});

test("all dispositions preserve cleanup, overwrite confirmation, saved revision, and existing projections", async () => {
  for (const disposition of ["journal", "pause", "carry"]) {
    const record = formal.emptyDailyRecord(date);
    record.practiceEventOutput = true;
    record.practiceEventVocabulary = { manualRounds: 1, events: [{ id: "vocab-event", standardRound: true }] };
    record.englishRhythm = { ...record.englishRhythm, touches: ["output", "vocabulary"], vocabForgeRounds: 1 };
    await store.upsertJsonRecord(title, record, { projection: true });
    const current = await read();
    current.evening = { ...current.evening, disposition, depth: "deep", highlight: "reflection", carryNote: "carry forward", carryToDate: "2026-10-20" };
    const response = await close(current, { overwrite: true });
    assert.equal(response.status, 200);
    const result = (await response.json()).record;
    assert.equal(result.updatedAt, savedValue().updatedAt);
    assert.equal(result.evening.disposition, disposition);
    assert.ok(result.evening.closedAt);
    assert.ok(result.englishRhythm.touches.includes("output"));
    assert.deepEqual(result.practiceEventVocabulary, record.practiceEventVocabulary);
    assert.equal(result.evening.depth, disposition === "journal" ? "deep" : null);
    assert.equal(result.evening.highlight, disposition === "journal" ? "reflection" : "");
    assert.equal(result.evening.carryNote, disposition === "carry" ? "carry forward" : "");
    assert.equal((await close(result)).status, 409);
    const repeated = await close(result, { overwrite: true });
    assert.equal(repeated.status, 200, "the saved response revision can close again");
    const updated = (await repeated.json()).record;
    const dailySave = await daily.PUT(request("PUT", "/api/dojo/daily", { date, record: updated }));
    assert.equal(dailySave.status, 200, "the saved closing revision is accepted by daily PUT");
  }
});

test("new-day close works and invalid dispositions cannot write", async () => {
  const record = formal.emptyDailyRecord(date);
  for (const patch of [{}, { disposition: "journal" }, { disposition: "carry", carryNote: "" }, { disposition: "carry", carryNote: "next", carryToDate: "2026-11-01" }]) {
    record.evening = { ...formal.emptyDailyRecord(date).evening, ...patch };
    assert.equal((await close(record)).status, 400);
    assert.equal(writes, 0);
  }
  record.evening.disposition = "pause";
  assert.equal((await close(record)).status, 200);
});

test("closing uses daily owner and origin protections", async () => {
  const record = formal.emptyDailyRecord(date);
  record.evening.disposition = "pause";
  assert.equal((await evening.POST(request("POST", "/api/dojo/evening", { date, record }, false))).status, 401);
  assert.equal((await evening.POST(request("POST", "/api/dojo/evening", { date, record }, true, "https://foreign.example"))).status, 403);
  assert.equal(writes, 0);
});

test("an unknown closing mutation outcome keeps the persistent lock and blocks retry", async () => {
  await seed();
  const record = await read();
  record.evening.disposition = "pause";
  loseResponse = true;
  const response = await close(record);
  assert.equal(response.status, 503);
  assert.ok((await readdir(directory)).includes("learning-writer.lock"));
  const before = writes;
  assert.equal((await close(record, { overwrite: true })).status, 409);
  assert.equal(writes, before);
  assert.ok((await readdir(directory)).includes("learning-writer.lock"));
});
