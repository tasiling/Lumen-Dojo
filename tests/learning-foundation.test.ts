import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  foundationService,
  type RecordRow,
} from "../lib/dojo/learningFoundation/service";
import {
  LearningError,
  assertGraph,
  type LearningEntity,
  FOUNDATION_PREFIX,
} from "../lib/dojo/learningFoundation/model";
import { createSeedOnce } from "../lib/dojo/learningFoundation/seedWrite";
import { withLearningWriteLock } from "../lib/dojo/learningFoundation/fileLock";
import { mergeLearningRelations } from "../lib/dojo/learningFoundation/relations";
import { captureContent, normalizeCaptureEntry } from "../lib/dojo/formal";
import { normalizeLearningTrack } from "../lib/dojo/learning";

async function main() {
  const root = await mkdtemp(join(tmpdir(), "r2-1-"));
  let writes = 0;
  let failAfter: number | null = null;
  const owner = "isolated-owner";
  const repository = {
    owner,
    list: async (): Promise<RecordRow[]> => {
      const names = (await readdir(root)).filter((n) => n.endsWith(".json"));
      return Promise.all(
        names.map(async (name) =>
          JSON.parse(await readFile(join(root, name), "utf8")),
        ),
      );
    },
    create: async (title: string, entity: LearningEntity) => {
      if (failAfter !== null && writes === failAfter)
        throw new LearningError(
          "simulated Notion outage (confirmed no write)",
          503,
        );
      await writeFile(
        join(root, `${entity.id}.json`),
        JSON.stringify({ id: entity.id, title, value: entity }),
        { flag: "wx" },
      );
      writes++;
    },
    update: async (id: string, title: string, entity: LearningEntity) => {
      await writeFile(
        join(root, `${id}.json`),
        JSON.stringify({ id, title, value: entity }),
      );
      writes++;
    },
    exclusive: <T>(fn: () => Promise<T>) => withLearningWriteLock(fn, root),
    legacyVision: async (key: string) =>
      key === "english" ? "既有英文目標，保留來源" : null,
  };
  const service = foundationService(repository);
  assert.equal((await service.snapshot()).missing.length, 9);
  assert.equal(writes, 0);
  console.log("PASS GET/snapshot performs no writes");
  failAfter = 3;
  await assert.rejects(service.initialize(), /outage/);
  assert.equal((await service.snapshot()).entities.length, 3);
  failAfter = null;
  await service.initialize();
  const initial = await service.snapshot();
  assert.equal(initial.entities.length, 9);
  assert.equal(
    initial.entities.find((e) => e.legacyKey === "english")?.vision,
    "既有英文目標，保留來源",
  );
  assert.equal(initial.entities.filter((e) => e.legacyKey).length, 5);
  assert.ok(
    initial.entities.every((e) => e.goal === "" && e.expectedOutcome === ""),
  );
  console.log(
    "PASS partial initialization retry preserves five legacy mappings, vision and blank outcomes",
  );
  const beforeRetry = writes;
  await service.initialize();
  assert.equal(writes, beforeRetry);
  let psychology = initial.entities.find((e) => e.seedKey === "psychology")!;
  psychology = await service.edit(psychology.id, psychology.revision, {
    name: "心理學與人際理解",
    status: "archived",
  });
  await service.initialize();
  assert.equal((await service.snapshot()).entities.length, 9);
  psychology = await service.edit(psychology.id, psychology.revision, {
    status: "active",
    focused: true,
  });
  const english = initial.entities.find((e) => e.legacyKey === "english")!;
  await service.edit(english.id, english.revision, { focused: true });
  assert.equal(
    (await service.snapshot()).entities.filter((e) => e.focused).length,
    2,
  );
  console.log(
    "PASS idempotency after rename/archive, restore and independent multiple focus",
  );
  const custom = await service.create("item", { name: "第十項自訂學科" }, null);
  const fresh = foundationService(repository);
  assert.equal((await fresh.snapshot()).entities.length, 10);
  assert.equal(
    (await fresh.snapshot()).entities.filter((e) => e.itemId === custom.id)
      .length,
    0,
  );
  const a = await service.create(
    "stage",
    { name: "自學探索", goal: "理解概念", expectedOutcome: "能闡述" },
    psychology.id,
  );
  const b = await service.create("stage", { name: "課程先修" }, psychology.id);
  let topic = await service.create(
    "topic",
    { name: "尚未指定階段", order: 7 },
    psychology.id,
  );
  topic = await service.edit(topic.id, topic.revision, {
    stageId: a.id,
    name: "改名",
    status: "paused",
  });
  topic = await service.edit(topic.id, topic.revision, {
    stageId: b.id,
    status: "active",
    order: 1,
  });
  assert.equal(topic.stageId, b.id);
  assert.equal(topic.order, 1);
  const foreignStage = await service.create(
    "stage",
    { name: "其他學科的階段" },
    custom.id,
  );
  await assert.rejects(
    service.edit(topic.id, topic.revision, { stageId: foreignStage.id }),
    /同一項目/,
  );
  await assert.rejects(
    service.edit(topic.id, topic.revision - 1, { name: "stale" }),
    (e) => e instanceof LearningError && e.status === 409,
  );
  await assert.rejects(
    service.edit(crypto.randomUUID(), 1, { name: "foreign" }),
    (e) => e instanceof LearningError && e.status === 403,
  );
  await assert.rejects(
    service.create("topic", { name: "foreign topic" }, crypto.randomUUID()),
    (e) => e instanceof LearningError && e.status === 403,
  );
  console.log(
    "PASS persistence, empty paths, stages/topics, stable IDs, within-item move and stale/foreign rejection",
  );
  const all = (await service.snapshot()).entities;
  assert.throws(
    () =>
      assertGraph(
        [
          ...all,
          { ...custom, owner: "another-owner", id: crypto.randomUUID() },
        ],
        owner,
      ),
    /擁有者/,
  );
  assert.throws(
    () =>
      assertGraph(
        [...all, { ...custom, id: crypto.randomUUID(), seedKey: "psychology" }],
        owner,
      ),
    /初始化識別/,
  );
  const unknown = "unresolvable-history-id";
  const relations = mergeLearningRelations(
    { learningTracks: ["english"], learningItemIds: [unknown] },
    { learningItemIds: [psychology.id, unknown, english.id] },
    all,
  );
  const capture = normalizeCaptureEntry(
    { title: "隔離測試心理學素材", ...relations },
    { id: "capture-test" },
  )!;
  const roundtrip = normalizeCaptureEntry(captureContent(capture), {
    id: capture.id,
  })!;
  assert.deepEqual(roundtrip.learningItemIds, relations.learningItemIds);
  const oldForm = mergeLearningRelations(
    roundtrip,
    { learningTracks: ["english"] },
    all,
  );
  assert.ok(oldForm.learningItemIds.includes(psychology.id));
  assert.ok(oldForm.learningItemIds.includes(unknown));
  const withoutHistory = mergeLearningRelations(
    roundtrip,
    { learningItemIds: [] },
    all,
  );
  assert.ok(withoutHistory.learningItemIds.includes(unknown));
  assert.throws(
    () =>
      mergeLearningRelations(
        roundtrip,
        { learningItemIds: [crypto.randomUUID()] },
        all,
      ),
    (e) => e instanceof LearningError && e.status === 403,
  );
  console.log(
    "PASS capture serialization/new disciplines, old form safe merge, unresolved history preservation and foreign relation rejection",
  );
  const rawLegacy = {
    goal: "original",
    updatedAt: "2026-09-01T00:00:00.000Z",
    stages: [{ id: "legacy-extension" }],
    focusIds: [psychology.id],
  };
  const legacyTrack = normalizeLearningTrack(rawLegacy, "english");
  const weeklyResult = {
    ...rawLegacy,
    ...legacyTrack,
    activityLog: [],
    updatedAt: new Date().toISOString(),
  };
  assert.deepEqual(weeklyResult.stages, rawLegacy.stages);
  assert.deepEqual(weeklyResult.focusIds, rawLegacy.focusIds);
  assert.equal(legacyTrack.updatedAt, rawLegacy.updatedAt);
  console.log(
    "PASS legacy normalization version preservation and weekly merge preserves extensions",
  );
  await assert.rejects(
    withLearningWriteLock(async () => true, ""),
    (e) => e instanceof LearningError && e.status === 503,
  );
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((r) => (entered = r));
  const held = withLearningWriteLock(async () => {
    entered();
    await new Promise<void>((r) => (release = r));
  }, root);
  await enteredPromise;
  await assert.rejects(
    service.create("item", { name: "concurrent" }, null),
    (e) => e instanceof LearningError && e.status === 409,
  );
  // Independent Node process proves this is a filesystem exclusion, not a memory mutex.
  const modulePath = require.resolve("../lib/dojo/learningFoundation/fileLock");
  const code = `require(${JSON.stringify(modulePath)}).withLearningWriteLock(async()=>true,${JSON.stringify(root)}).then(()=>process.exit(2),e=>process.exit(e.status===409?0:3));`;
  const exit = await new Promise<number | null>((resolve) =>
    spawn(process.execPath, ["-e", code], { stdio: "inherit" }).on(
      "exit",
      resolve,
    ),
  );
  assert.equal(exit, 0);
  release();
  await held;
  const concurrent = await service.create(
    "item",
    { name: "after release" },
    null,
  );
  assert.ok(concurrent.id);
  console.log(
    "PASS missing configuration fail-closed, concurrent process blocked, lock released after completion",
  );
  const collisionRows: RecordRow[] = [
    {
      id: custom.id,
      title: `${FOUNDATION_PREFIX}${custom.id}`,
      value: { ...custom, name: "心理學" },
    },
  ];
  const collisionService = foundationService({
    ...repository,
    list: async () => collisionRows,
    create: async (title, entity) => {
      collisionRows.push({ id: entity.id, title, value: entity });
    },
  });
  const collisionResult = await collisionService.initialize();
  assert.equal(collisionResult.conflicts.length, 1);
  assert.equal(collisionResult.entities.length, 9);
  assert.equal(collisionResult.missing[0].key, "psychology");
  console.log(
    "PASS ambiguous name collision explicitly reported; other confirmed items still delivered",
  );
  const uncertainRoot = await mkdtemp(join(tmpdir(), "r2-uncertain-"));
  await assert.rejects(
    withLearningWriteLock(async () => {
      throw new Error("lost network response");
    }, uncertainRoot),
    /結果未確認/,
  );
  await assert.rejects(
    withLearningWriteLock(async () => true, uncertainRoot),
    (e) => e instanceof LearningError && e.status === 409,
  );
  assert.ok((await readdir(uncertainRoot)).includes("learning-writer.lock"));
  await rm(uncertainRoot, { recursive: true, force: true });
  let seedAttempts = 0;
  await assert.rejects(
    createSeedOnce(
      "tarot",
      async () => {
        seedAttempts++;
        throw new Error("lost create response");
      },
      root,
    ),
    /lost create response/,
  );
  await assert.rejects(
    createSeedOnce(
      "tarot",
      async () => {
        seedAttempts++;
        return true;
      },
      root,
    ),
    /不自動再次建立/,
  );
  assert.equal(seedAttempts, 1);
  const unknownLegacy = normalizeCaptureEntry(
    { title: "舊素材", learningTracks: ["psychology", "english"] },
    { id: "unknown-legacy" },
  )!;
  assert.deepEqual(unknownLegacy.unresolvedLearningRefs, ["psychology"]);
  assert.deepEqual(
    normalizeCaptureEntry(captureContent(unknownLegacy), {
      id: "unknown-legacy",
    })?.unresolvedLearningRefs,
    ["psychology"],
  );
  console.log(
    "PASS uncertain writes retain cross-process lock; durable seed intent prevents retries; unknown legacy links retained",
  );
  const duplicate = {
    ...custom,
    id: crypto.randomUUID(),
    legacyKey: "english" as const,
  };
  await writeFile(
    join(root, `${duplicate.id}.json`),
    JSON.stringify({
      id: duplicate.id,
      title: `${FOUNDATION_PREFIX}${duplicate.id}`,
      value: duplicate,
    }),
  );
  await assert.rejects(service.snapshot(), /對照重複/);
  console.log("PASS inconsistent stored data reported, not masked by defaults");
  await rm(root, { recursive: true, force: true });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
