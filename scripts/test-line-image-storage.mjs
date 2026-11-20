import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function fixture() {
  const rows = new Map();
  const blocks = new Map();
  const writes = [];
  let count = 0;
  let failNextWrite = false;
  let clock = Date.now();
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [++clock]));
    }
  }
  function image(input) {
    const caption = (input.image?.caption ?? []).map(part => ({ plain_text: part.text.content }));
    return { id: "b" + (++count), type: "image", image: { caption } };
  }
  async function list(prefix) {
    return [...rows].filter(([, row]) => row.標題.startsWith(prefix))
      .map(([id, row]) => ({ id, value: JSON.parse(row.內容), title: row.標題 }));
  }
  const mutations = {
    async createKnowledgeEntry(row, options = {}) {
      const id = "p" + (++count);
      rows.set(id, { ...row });
      blocks.set(id, (options.children ?? []).map(image));
      return { id };
    },
    async updateKnowledgeEntry(id, delta) {
      Object.assign(rows.get(id), delta);
      writes.push(id);
    },
  };
  const notion = {
    fileUploads: { create: async () => ({ id: "upload" }), send: async () => {} },
    blocks: { children: {
      list: async ({ block_id }) => ({ results: blocks.get(block_id), has_more: false }),
      append: async ({ block_id, children }) => {
        const results = children.map(image);
        blocks.get(block_id).push(...results);
        return { results };
      },
    } },
  };
  const mocks = {
    "server-only": {},
    "./formal": {},
    "@/lib/notion/client": {
      notion: () => notion, notionWithoutRetries: () => notion, withNotionRateLimit: fn => fn(),
    },
    "@/lib/notion/mutations": mutations,
    "@/lib/notion/queries": { getKnowledgeEntry: async id => rows.get(id) },
    "./integrationMutationLease": {
      withIntegrationMutationLease: async (_key, fn) => fn({ assertCurrent: async () => {} }),
    },
    "./notionStore": {
      listJsonRecords: list,
      readJsonRecord: async title => (await list(title)).find(row => row.title === title) ?? null,
      updateJsonRecordById: async (id, _prefix, title, value) => {
        if (failNextWrite) {
          failNextWrite = false;
          throw Error("interrupted metadata write");
        }
        return mutations.updateKnowledgeEntry(id, { 標題: title, 內容: JSON.stringify(value) });
      },
    },
  };
  function load(name) {
    const file = new URL("../lib/dojo/" + name + ".ts", import.meta.url);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInNewContext(code, {
      exports, require: key => Object.hasOwn(mocks, key) ? mocks[key] : require(key),
      Date: Clock, crypto, Blob, console, setTimeout, clearTimeout,
    }, { filename: file.pathname });
    return exports;
  }
  mocks["./englishImage"] = load("englishImage");
  return { api: load("englishImageStore"), load, rows, blocks, writes, interrupt: () => { failNextWrite = true; } };
}

const upload = i => ({
  bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: "image/png", filename: "shot-" + i + ".png",
  sourceMessageId: "line" + i, externalEventId: "event" + i,
});

test("ten screenshots persist on one page, respect native indices, and reject a genuine version conflict", async () => {
  const f = fixture();
  let entry = await f.api.createEnglishImageEntry({ ...upload(5), batchIndex: 5 });
  for (const i of [6, 1, 4, 9, 10, 3, 7, 8, 2]) {
    entry = await f.api.appendEnglishImageAttachment({ ...upload(i), batchIndex: i, entry });
  }
  assert.equal(f.rows.size, 1);
  assert.equal(f.blocks.get(entry.id).length, 10);
  const { entry: stored } = await f.api.getEnglishImageEntry(entry.id);
  assert.deepEqual(Array.from(stored.attachments, x => x.batchIndex), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(stored.attachments.map(x => x.blockId)).size, 10);
  assert.ok(stored.attachments.every(x => x.blockId !== "pending"));
  await f.api.updateEnglishImageEntry(entry.id, () => ({ contextNote: "concurrent note" }));
  await assert.rejects(f.api.saveEnglishImageEntry(stored), /另一個流程/);
});

test("an interrupted create keeps its original and can finalize the pending seed without changing its revision on read", async () => {
  const f = fixture();
  f.interrupt();
  await assert.rejects(f.api.createEnglishImageEntry(upload(0)), /interrupted/);
  const [id] = f.rows.keys();
  const before = JSON.parse(f.rows.get(id).內容);
  assert.equal(before.attachments[0].blockId, "pending");
  assert.equal(f.blocks.get(id).length, 1);
  const { entry } = await f.api.getEnglishImageEntry(id);
  assert.equal(entry.updatedAt, before.updatedAt);
  assert.equal(entry.attachments[0].blockId, f.blocks.get(id)[0].id);
  assert.equal(f.writes.length, 0);
  const saved = await f.api.saveEnglishImageEntry({ ...entry, contextNote: "recovered" });
  assert.equal(saved.contextNote, "recovered");
  assert.equal(JSON.parse(f.rows.get(id).內容).attachments[0].blockId, f.blocks.get(id)[0].id);
  assert.equal(f.blocks.get(id).length, 1);
});

test("a historical merge resolves pending child blocks, keeps previously resolved attachments and stays read-only", async () => {
  const f = fixture();
  const parent = await f.api.createEnglishImageEntry(upload(1));
  const withSecond = await f.api.appendEnglishImageAttachment({ ...upload(2), entry: parent });
  const child = await f.api.createEnglishImageEntry(upload(3));
  const parentRow = f.rows.get(parent.id);
  const childRow = f.rows.get(child.id);
  const historical = JSON.parse(parentRow.內容);
  const pendingChild = { ...child.attachment, blockId: "pending" };
  historical.attachments = [...historical.attachments, pendingChild];
  parentRow.內容 = JSON.stringify(historical);
  childRow.內容 = JSON.stringify({ ...JSON.parse(childRow.內容), mergedIntoId: parent.id });
  const writeCount = f.writes.length;
  const { entry: recovered } = await f.api.getEnglishImageEntry(parent.id);
  assert.equal(recovered.attachments.length, 3);
  assert.equal(recovered.attachments[1].blockId, withSecond.attachments[1].blockId);
  assert.equal(recovered.attachments[2].blockId, child.attachment.blockId);
  assert.equal(recovered.updatedAt, historical.updatedAt);
  assert.equal(f.writes.length, writeCount);
});

test("retrying an append after losing its metadata write binds the existing block", async () => {
  const f = fixture();
  const entry = await f.api.createEnglishImageEntry(upload(0));
  const second = { ...upload(1), entry };
  f.interrupt();
  await assert.rejects(f.api.appendEnglishImageAttachment(second), /interrupted/);
  assert.equal(f.blocks.get(entry.id).length, 2);
  assert.equal(JSON.parse(f.rows.get(entry.id).內容).attachments.length, 1);
  const saved = await f.api.appendEnglishImageAttachment(second);
  assert.equal(f.blocks.get(entry.id).length, 2);
  assert.equal(saved.attachments[1].blockId, f.blocks.get(entry.id)[1].id);
});

test("the manual group survives a restart, serializes its first image, and honors close and expiry", async () => {
  const f = fixture();
  const a = f.load("lineImageBatch");
  const user = "fixture-user";
  const expiresAt = Date.now() + 1_800_000;
  const sessionId = "start-event";
  const startedAt = Date.now();
  await a.setLineImageBatch(user, { entryId: "", expiresAt, sessionId, startedAt, nativeSetProgress: { album: [2] } });
  const b = f.load("lineImageBatch");
  const started = await b.readLineImageBatch(user);
  assert.equal(started.entryId, "");
  assert.equal(started.sessionId, sessionId);
  assert.equal(started.startedAt, startedAt);
  assert.deepEqual(Array.from(started.nativeSetProgress.album), [2]);
  let created = 0;
  await Promise.all(Array.from({ length: 10 }, () => b.withLineImageBatchLock(user, async () => {
    const current = await b.readLineImageBatch(user);
    if (!current.entryId) {
      created++;
      await b.setLineImageBatch(user, { ...current, entryId: "real-group", expiresAt });
    }
  })));
  assert.equal(created, 1);
  assert.equal((await a.readLineImageBatch(user)).entryId, "real-group");
  await a.setLineImageBatch(user, null);
  assert.equal(await b.readLineImageBatch(user), null);
  await a.setLineImageBatch(user, { entryId: "old-group", expiresAt: Date.now() - 10_000 });
  assert.equal(await b.readLineImageBatch(user), null);
});
