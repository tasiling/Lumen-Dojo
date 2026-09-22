import assert from "node:assert/strict";
import { appendCaptureExploration, buildCaptureExplorationPackage, parseCaptureExplorationResult } from "../lib/dojo/captureExploration";
import { captureContent, normalizeCaptureEntry } from "../lib/dojo/formal";

function capture(overrides: Record<string, unknown> = {}) {
  return normalizeCaptureEntry({
    title: "Instagram Reel",
    excerpt: "A short video about trying again after failure.",
    note: "這支影片讓我想到自己以前很害怕失敗。",
    sourceUrl: "https://www.instagram.com/reel/example/",
    capturedAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
    ...overrides,
  }, { id: "capture-1", capturedAt: "2026-09-22T00:00:00.000Z" })!;
}

const legacy = capture({ forageReason: "" });
assert.equal(legacy.forageReason, legacy.note, "legacy capture notes remain available as the initial reflection");
assert.deepEqual(legacy.explorationRecords, [], "legacy captures normalize with an empty exploration history");

const explored = appendCaptureExploration(legacy, {
  thoughts: "我想到以前會因為怕做不好而延後開始。",
  keyFinding: "我想保留的不是成功方法，而是允許自己先嘗試。",
  openQuestions: "我現在還有哪些事情因為怕失敗而沒有開始？",
}, { clientRecordId: "client-1", source: "manual", now: "2026-09-25T00:00:00.000Z", id: "explore-1" });
assert.equal(explored.explorationRecords.length, 1, "an exploration is appended to the existing material");
assert.equal(explored.forageReason, legacy.forageReason, "exploration never overwrites the initial reflection");
assert.equal(explored.sourceUrl, legacy.sourceUrl, "exploration preserves the original source URL");
assert.deepEqual(explored.claimRefs, [], "exploration does not create a KnowledgeClaim relation");
assert.deepEqual(explored.destinations, [], "exploration does not create a downstream destination");
assert.equal(explored.processingDepth, "light", "exploration remains a lightweight Layer 1 action");

const duplicateRetry = appendCaptureExploration(explored, {
  thoughts: "重試請求不應重複建立。", keyFinding: "", openQuestions: "",
}, { clientRecordId: "client-1", source: "manual", now: "2026-09-25T00:01:00.000Z", id: "explore-retry" });
assert.equal(duplicateRetry.explorationRecords.length, 1, "the client record ID makes retries idempotent");

const roundTrip = normalizeCaptureEntry(captureContent(explored), { id: explored.id, capturedAt: explored.capturedAt })!;
assert.deepEqual(roundTrip.explorationRecords, explored.explorationRecords, "exploration history survives persistence normalization");

const explorationPackage = JSON.parse(buildCaptureExplorationPackage(explored));
assert.equal(explorationPackage.material.captureId, explored.id, "the GPT package identifies the source material");
assert.equal(explorationPackage.material.initialReason, explored.forageReason, "the GPT package keeps the initial reason separate");
assert.equal(explorationPackage.material.existingExplorations.length, 1, "the GPT package includes prior exploration history");

const parsed = parseCaptureExplorationResult(`\`\`\`json
{
  "format": "capture-exploration-result/v1",
  "captureId": "capture-1",
  "thoughts": "這是我在對話中實際說過的想法。",
  "keyFinding": "先嘗試比一次做對更重要。",
  "openQuestions": "下一個最小行動是什麼？"
}
\`\`\``, explored.id);
assert.equal(parsed.keyFinding, "先嘗試比一次做對更重要。", "a confirmed GPT result can be previewed as editable fields");
assert.throws(() => parseCaptureExplorationResult(JSON.stringify({
  format: "capture-exploration-result/v1", captureId: "another-capture", thoughts: "錯誤素材",
}), explored.id), /不屬於目前這筆素材/, "pasted results cannot be attached to the wrong material");

console.log("capture-exploration: model assertions passed");
