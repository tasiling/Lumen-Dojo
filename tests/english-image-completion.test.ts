import assert from "node:assert/strict";
import { normalizeEnglishImageEntry, withEnglishImageStatus } from "../lib/dojo/englishImage";

function entry(overrides: Record<string, unknown> = {}) {
  return normalizeEnglishImageEntry({
    attachment: {
      blockId: "image-block-1",
      filename: "source.jpg",
      mimeType: "image/jpeg",
      sourceMessageId: "line-message-1",
      createdAt: "2026-09-21T00:00:00.000Z",
      batchIndex: 1,
    },
    capturedAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    ...overrides,
  }, { id: "entry-1", capturedAt: "2026-09-21T00:00:00.000Z" })!;
}

const analyzedLegacy = entry({ analysisStatus: "completed" });
assert.equal(analyzedLegacy.status, "inbox", "AI analysis completion must not infer organization completion");

const organized = entry({ status: "organized", analysisStatus: "idle" });
assert.equal(organized.status, "organized", "existing organized records remain completed");

const withDispatchData = entry({
  vocabForgeExports: [{
    key: "blister",
    expression: "blister",
    vocabBook: "按摩工作",
    focusDecks: ["按摩工作"],
    sourceName: "工作截圖",
    cefrLevel: "B1",
    result: "created",
    syncedAt: "2026-09-21T00:10:00.000Z",
  }],
  contextRoomStatus: "synced",
  contextRoomExport: {
    sourceRecordId: "source-1",
    materialId: "material-1",
    batchId: "batch-1",
    materialTitle: "按摩英文",
    eventTitle: "水泡提醒",
    batchPosition: 1,
    materialReused: false,
    expressionCount: 2,
    duplicate: false,
    syncedAt: "2026-09-21T00:20:00.000Z",
  },
});
const completed = withEnglishImageStatus(withDispatchData, "organized");
assert.equal(completed.id, withDispatchData.id, "status change preserves the original ID");
assert.deepEqual(completed.attachments, withDispatchData.attachments, "status change preserves original images");
assert.deepEqual(completed.vocabForgeExports, withDispatchData.vocabForgeExports, "status change preserves VocabForge exports");
assert.deepEqual(completed.contextRoomExport, withDispatchData.contextRoomExport, "status change preserves context-room links");

const reopened = withEnglishImageStatus(completed, "inbox");
assert.equal(reopened.status, "inbox", "completed records can be reopened");
assert.deepEqual(reopened.contextRoomExport, completed.contextRoomExport, "reopening preserves dispatch data");

assert.throws(
  () => withEnglishImageStatus(entry({ mergedIntoId: "parent-1" }), "organized"),
  /已合併的子紀錄/,
  "merged child records cannot re-enter visible completion lists"
);

console.log("english-image-completion: model assertions passed");
