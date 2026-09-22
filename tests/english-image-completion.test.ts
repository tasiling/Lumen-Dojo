import assert from "node:assert/strict";
import { normalizeEnglishImageEntry, withEnglishImageStatus } from "../lib/dojo/englishImage";
import { englishImageStage, filterAndSortEnglishImages, searchEnglishImage } from "../lib/dojo/englishImageInboxView";
import { buildForageOverview } from "../lib/dojo/forageOverview";
import { normalizeCaptureEntry } from "../lib/dojo/formal";

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
  }, { id: String(overrides.id ?? "entry-1"), capturedAt: "2026-09-21T00:00:00.000Z" })!;
}

function capture(overrides: Record<string, unknown> = {}) {
  return normalizeCaptureEntry({
    title: "一般素材",
    capturedAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    ...overrides,
  }, { id: String(overrides.id ?? "capture-1") })!;
}

const analyzedLegacy = entry({ analysisStatus: "completed" });
assert.equal(analyzedLegacy.status, "inbox", "AI analysis completion must not infer organization completion");
assert.deepEqual(analyzedLegacy.vocabularyCandidates, [], "legacy image records remain readable without v2 usage fields");

const contextContractCandidate = entry({
  vocabularyCandidates: [{
    expression: "incorrigible",
    meaning: "屢勸不改的",
    usage: "His incorrigible behaviour kept causing trouble.",
    usageTranslation: "他屢勸不改的行為不斷惹出麻煩。",
    partOfSpeech: "adjective",
    usageProvenance: "generated",
    cefrLevel: "C1",
    suggestedFocusDecks: ["JRPG／冒險遊戲"],
    origin: "source",
    recommendationReason: "原始遊戲文字中的重要詞彙",
  }],
});
assert.equal(contextContractCandidate.vocabularyCandidates[0].usageTranslation, "他屢勸不改的行為不斷惹出麻煩。", "usage translation stays separate from source context");
assert.equal(contextContractCandidate.vocabularyCandidates[0].usageProvenance, "generated", "generated learning examples remain explicitly labelled");

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

const waitingForClassification = entry({ id: "classification", route: "pending", title: "待分類圖片" });
const waitingForAnalysis = entry({ id: "analysis", route: "reading", title: "Magic Tree House", sourceLabel: "Dinosaurs Before Dark", capturedAt: "2026-09-20T00:00:00.000Z" });
const waitingForDispatch = entry({ id: "dispatch", route: "reading", analysisStatus: "completed", englishRecord: "Jack and Annie found a tree house.", capturedAt: "2026-09-19T00:00:00.000Z" });
const failedSync = entry({ id: "error", route: "daily", analysisStatus: "completed", vocabForgeSyncStates: [{ key: "blister", expression: "blister", status: "failed", attempts: 1, lastError: "timeout", updatedAt: "2026-09-21T00:00:00.000Z" }] });
assert.equal(englishImageStage(waitingForClassification), "classification", "pending routes derive the classification stage");
assert.equal(englishImageStage(waitingForAnalysis), "analysis", "classified idle records derive the analysis stage");
assert.equal(englishImageStage(waitingForDispatch), "dispatch", "analyzed records derive the dispatch stage");
assert.equal(englishImageStage(failedSync), "error", "sync failures take error-stage priority");
assert.equal(searchEnglishImage(waitingForAnalysis, "dinosaurs"), true, "search includes source labels");
assert.equal(searchEnglishImage(waitingForDispatch, "tree house"), true, "search includes English records");
const crossed = filterAndSortEnglishImages([waitingForClassification, waitingForAnalysis, waitingForDispatch, failedSync], {
  status: "inbox", route: "reading", stage: "dispatch", query: "jack", sort: "captured-asc",
});
assert.deepEqual(crossed, [waitingForDispatch], "status, route, stage, and search filters intersect");
const oldestFirst = filterAndSortEnglishImages([waitingForAnalysis, waitingForDispatch], {
  status: "inbox", route: "reading", stage: "all", query: "", sort: "captured-asc",
});
assert.deepEqual(oldestFirst, [waitingForDispatch, waitingForAnalysis], "oldest-first sorting exposes accumulated pending material");

const manyAttachments = Array.from({ length: 23 }, (_, index) => ({
  blockId: `block-${23 - index}`,
  filename: `page-${23 - index}.jpg`,
  mimeType: "image/jpeg",
  sourceMessageId: `message-${23 - index}`,
  createdAt: "2026-09-21T00:00:00.000Z",
  batchIndex: 23 - index,
}));
const multiImage = entry({ attachments: manyAttachments });
assert.equal(multiImage.attachments.length, 23, "23-image groups remain complete");
assert.deepEqual(multiImage.attachments.map((item) => item.batchIndex), Array.from({ length: 23 }, (_, index) => index + 1), "attachment order follows batchIndex without regrouping");

const homeOverview = buildForageOverview([
  waitingForClassification,
  waitingForAnalysis,
  waitingForDispatch,
  failedSync,
  entry({ id: "completed", status: "organized", route: "reading", analysisStatus: "completed", capturedAt: "2026-09-22T00:00:00.000Z" }),
  entry({ id: "merged", mergedIntoId: "dispatch", capturedAt: "2026-09-23T00:00:00.000Z" }),
], [
  capture({ id: "pending-capture", status: "pending" }),
  capture({ id: "adopted-capture", status: "adopted", capturedAt: "2026-09-17T00:00:00.000Z" }),
  capture({ id: "faded-capture", status: "faded", capturedAt: "2026-09-16T00:00:00.000Z" }),
]);
assert.deepEqual(homeOverview.english, { pending: 4, classification: 1, dispatch: 1, errors: 1 }, "home counts only unfinished visible English records and keeps derived stages distinct");
assert.deepEqual(homeOverview.captures, { pending: 1, adopted: 1, faded: 1 }, "general capture statuses keep their existing meanings");
assert.equal(homeOverview.recent.length, 3, "home shows only three recent material summaries");
assert.equal(homeOverview.recent[0].id, "completed", "completed material can still appear in recent links");
assert.equal(homeOverview.recent.some((item) => item.id === "merged"), false, "merged English child records never reappear on the home page");
assert.match(homeOverview.recent[0].href, /^\/forage\/english\?englishImageId=/, "recent English material links to the independent inbox");

console.log("english-image-completion: model assertions passed");
