import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Exercise the real sender service. Only the external Notion store is isolated.
const directory = await mkdtemp(join(tmpdir(), "d37-completed-retry-"));
const actions = [];
const jobs = ["source-a", "source-b"].map((sourceRecordId, index) => ({
  sourceRecordId, groupRef: "group-a", unitId: "unit-a",
  dispatchId: `dispatch-${index}`, requestFingerprint: `fingerprint-${index}`,
  status: "succeeded", error: "", result: { receiptId: `receipt-${index}` },
}));
let record = { id: "arrangement-a", approvedSnapshotHash: "approved-a", status: "completed", executions: jobs, coordinationVersion: 1 };
globalThis.__d37CompletedRetryStore = {
  get: async () => structuredClone(record),
  save: async (value) => (record = structuredClone(value)),
};
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const payload = JSON.parse(body);
  actions.push({ path: request.url, ...payload });
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ status: "completed", coordinationVersion: 7, leaseFence: 3, jobs }));
});
const previous = { url: process.env.CONTEXT_ROOM_INTEGRATION_URL, secret: process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET };
try {
  const source = await readFile(new URL("../lib/dojo/unitArrangementService.ts", import.meta.url), "utf8");
  let code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace(/import ["']server-only["'];?/g, "");
  code = code.replace(/from (["'])(\.[^"']+)\1/g, (_, quote, path) => `from ${quote}${path}.mjs${quote}`);
  const dependencies = {
    englishImageDispatch: ["englishImageContextCandidates", "listEnglishImageContextCatalog"],
    englishImageStore: ["getEnglishImageEntry", "updateEnglishImageEntry"],
    sourceHandoffV2: ["calculateRequestFingerprint", "calculateSourceContentFingerprint", "nextSourceRevision", "sourceContent", "SOURCE_HANDOFF_V2"],
    unitArrangement: ["arrangementSnapshotHash", "parseUnitArrangementResult", "UNIT_ARRANGEMENT_V1", "unitArrangementPrompt"],
  };
  for (const [name, exports] of Object.entries(dependencies)) {
    await writeFile(join(directory, name + ".mjs"), exports.map((key) => `export const ${key}=()=>{throw new Error('completed replay must not dispatch or rebuild approval')};`).join("\n"));
  }
  await writeFile(join(directory, "unitArrangementStore.mjs"), "export const getUnitArrangement=(...a)=>globalThis.__d37CompletedRetryStore.get(...a);export const saveUnitArrangement=(...a)=>globalThis.__d37CompletedRetryStore.save(...a);");
  await writeFile(join(directory, "service.mjs"), code);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.CONTEXT_ROOM_INTEGRATION_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET = "isolated-test-authorization";
  const { executeUnitArrangement } = await import(pathToFileURL(join(directory, "service.mjs")));
  for (const retryFailedOnly of [false, true]) {
    const result = await executeUnitArrangement(record.id, retryFailedOnly);
    assert.equal(result.status, "completed");
    assert.equal(result.coordinationVersion, 7, "replay must refresh authoritative receiver state");
    assert.deepEqual(result.executions, jobs, "original Unit, dispatch identities and receipts survive replay");
  }
  assert.deepEqual(actions.map(({ action }) => action), ["get", "get"], "completed retry must not acquire, ensure, or dispatch");
  assert.ok(actions.every(({ path }) => path === "/api/integrations/lumen/unit-arrangements"));
  record = { ...record, status: "packed", approvedSnapshotHash: "" };
  await assert.rejects(executeUnitArrangement(record.id), /請先確認編排預覽/);
  assert.equal(actions.length, 2, "unapproved arrangements remain rejected locally");
  console.log("completed unit arrangement retry checks passed");
} finally {
  for (const [key, value] of [["CONTEXT_ROOM_INTEGRATION_URL", previous.url], ["LUMEN_CONTEXT_ROOM_SYNC_SECRET", previous.secret]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  delete globalThis.__d37CompletedRetryStore;
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
